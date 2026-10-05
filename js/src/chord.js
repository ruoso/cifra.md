// Chord symbols (spec §5): one permissive grammar, a canonical dialect-free
// model, three notation dialects and their four ambiguities, and the §5.5
// spelled tones. A port of the reference's reference/cifra_md/chord.py — never
// imported from it: agreement is by the corpus, not shared code (DIRECTION
// §3.6).
//
// Framework-free and zero runtime dependencies (DIRECTION §3.7): only regular
// expressions and plain objects. The model carries no dialect — `C7M`,
// `Cmaj7`, `CM7` and `C∆7` all mean the same chord (§5.2 lines 77–79); the
// dialect is consulted only at the four ambiguous spellings of §5.6 and
// nowhere else. The parser never throws: a symbol that does not fit the
// grammar returns `chord: null` with a non-empty `errors` (§5.4); the reader
// turns that into an unknown token (§2.9).

import { NOTE_RE, parseNote } from "./pitch.js";
import { LETTERS, MAJOR_SCALE, NATURAL_PC, formatNote } from "./pitch.js";

// The three dialects and the reading each gives the four ambiguous spellings
// (§5.6 lines 237–265). `brazilian` is the default (§1.4.3 line 141). The
// reader maps a document's `notation` property to one of these ids; the chord
// module takes an id, matching the reference's split (parse.py resolves the
// property, chord.py takes the id).
export const DIALECTS = {
  brazilian: { sevenPlus: "majorSeventh", bareNine: "add", degreeSign: "diminishedSeventh", bareFour: "suspended" },
  american: { sevenPlus: "dominantSharpFive", bareNine: "dominant", degreeSign: "diminishedSeventh", bareFour: "added" },
  realbook: { sevenPlus: "dominantSharpFive", bareNine: "dominant", degreeSign: "diminishedSeventh", bareFour: "added" },
};
export const DEFAULT_DIALECT = "brazilian";

// The two readings of each ambiguity; the one not chosen is reported as the
// `alternative` so an application can offer it (§5.6 lines 269–274).
const ALTERNATIVES = {
  sevenPlus: ["majorSeventh", "dominantSharpFive"],
  bareNine: ["add", "dominant"],
  degreeSign: ["diminishedSeventh", "diminishedTriad"],
  bareFour: ["suspended", "added"],
};

// Longest and most specific first. `#`/`b` are separate from `+`/`-`/`°`
// because the latter are positional: leading they name a quality, trailing a
// degree they alter it (§5.3.1, §5.3.4). Each regex is sticky (`y`) so it
// matches only at the current offset, as the reference's rx.match(body, i)
// does; `add`/`dim`/`aug` are case-insensitive (§5.3).
const TOKENS = [
  ["SUS2", /sus2/y],
  ["SUS4", /sus4/y],
  ["SUS", /sus/y],
  ["ADD", /add/iy],
  ["ALT", /alt/y],
  ["HALFDIM", /[øØ]/y],
  ["DIMWORD", /dim/iy],
  ["AUGWORD", /aug/iy],
  ["MAJ", /(?:maj|Maj|MAJ|M|[∆Δ])/y],
  ["MIN", /(?:min|Min|MIN|m)/y],
  ["NUM", /(?:13|11|9|7|6|5|4|3|2)/y],
  ["SHARP", /[#♯]/y],
  ["FLAT", /[b♭]/y],
  ["PLUS", /\+/y],
  ["MINUS", /[-−–]/y],
  ["DEG", /[°º]/y],
  ["LP", /\(/y],
  ["RP", /\)/y],
  ["SLASH", /\//y],
  ["SEP", /[, ]+/y],
];

const ROOT = new RegExp(`^(${NOTE_RE})`);
const BASS = new RegExp(`^${NOTE_RE}$`);

// Strip only U+0020 from the ends, as the reference's str.strip(" ") does —
// never any other whitespace.
function stripSpaces(text) {
  return text.replace(/^ +/, "").replace(/ +$/, "");
}

// Tokenise the body left to right. Returns [tokens, bad]: `bad` is null on a
// clean scan, or the unreadable remainder (which makes the whole symbol a
// non-chord, §5.4). Separators (whitespace, commas) are dropped — they are
// meaningless (§5.3 lines 105–110).
function tokenize(body) {
  const tokens = [];
  let i = 0;
  while (i < body.length) {
    let matched = false;
    for (const [kind, rx] of TOKENS) {
      rx.lastIndex = i;
      const m = rx.exec(body);
      if (m) {
        if (kind !== "SEP") tokens.push([kind, m[0]]);
        i = rx.lastIndex;
        matched = true;
        break;
      }
    }
    if (!matched) return [tokens, body.slice(i)];
  }
  return [tokens, null];
}

// Round brackets are decorative and must be balanced (§5.3 lines 105–110,
// §5.4); `C(7` and `C7)` are errors.
function balanced(text) {
  let depth = 0;
  for (const ch of text) {
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

// Split a trailing slash bass off the body (§5.1.2). A `/` is a slash bass only
// when a note name follows it to the end (`Am7/G`); a `/` before a digit stays
// in the body (`C6/9`), and both can appear (`C6/9/E`). Returns [body, bass|null].
function splitBass(text) {
  const idx = text.lastIndexOf("/");
  if (idx === -1) return [text, null];
  const candidate = stripSpaces(text.slice(idx + 1));
  if (BASS.test(candidate)) return [text.slice(0, idx), candidate];
  return [text, null];
}

// The alteration of the stacked seventh: major with a maj-word, diminished
// (bb7) when the quality is dim, minor (b7) otherwise (§5.3.3 lines 144–162).
function seventhAlter(quality, majorSeventh) {
  if (majorSeventh) return 0;
  if (quality === "dim") return -2;
  return -1;
}

// The degrees a top degree implies beneath it (§5.3.3): a ninth stacks nothing
// extra, an eleventh adds the ninth, a thirteenth adds the ninth.
function stack(top) {
  return { 9: [9], 11: [9, 11], 13: [9, 13] }[top] || [];
}

// Parse a chord symbol. Returns { chord: Chord|null, ambiguities: [...],
// errors: [...] }; never raises on bad input (§5.4, §9.2).
export function parseChord(text, dialect = DEFAULT_DIALECT) {
  const errors = [];
  const ambiguities = [];
  const readings = DIALECTS[dialect];
  if (!readings) {
    return { chord: null, ambiguities: [], errors: [`unknown dialect ${JSON.stringify(dialect)}`] };
  }

  const fail = (msg) => ({ chord: null, ambiguities, errors: errors.concat([msg]) });

  if (typeof text !== "string" || !stripSpaces(text)) {
    return fail("empty");
  }
  const t = stripSpaces(text);
  const rm = ROOT.exec(t);
  if (!rm) {
    return fail(`${JSON.stringify(t)} does not start with a note name`);
  }
  const root = parseNote(rm[1]);
  if (!balanced(t)) {
    return fail(`unbalanced brackets in ${JSON.stringify(t)}`);
  }
  const [body, bassText] = splitBass(t.slice(rm[0].length));
  const bass = bassText !== null ? parseNote(bassText) : null;

  const [tokens, bad] = tokenize(body);
  if (bad !== null) {
    return fail(`cannot read ${JSON.stringify(bad)} in ${JSON.stringify(t)}`);
  }

  let quality = "major";
  let majorSeventh = false;
  // `maj`/`M` alone is the triad; `∆` alone, or any of them before a degree,
  // is the major seventh (§5.3.2).
  let majWordAlone = false;
  let sawSeventh = false;
  let bareDegreeSign = false;
  let primaryTop = null;
  let sawQualityWord = false;
  const exts = new Map(); // degree -> alter, insertion order unused (sorted at the end)

  const at = (j) => (j >= 0 && j < tokens.length ? tokens[j][0] : null);

  const ambiguity = (kind, chosen) => {
    const alt = ALTERNATIVES[kind].find((a) => a !== chosen);
    ambiguities.push({ kind, chosen, alternative: alt });
  };

  let i = 0;
  while (i < tokens.length) {
    const [kind, tx] = tokens[i];
    if (kind === "LP" || kind === "RP") {
      i += 1;
    } else if (kind === "MIN") {
      if (!sawQualityWord && primaryTop === null && exts.size === 0) {
        quality = quality === "dim" ? "dim" : "minor";
        sawQualityWord = true;
      } else {
        errors.push(`unexpected ${JSON.stringify(tx)}`);
      }
      i += 1;
    } else if (kind === "MAJ") {
      majorSeventh = true;
      sawQualityWord = true;
      majWordAlone = tx !== "∆" && tx !== "Δ" && at(i + 1) !== "NUM";
      i += 1;
    } else if (kind === "DIMWORD" || kind === "DEG") {
      if (primaryTop === null && exts.size === 0) {
        quality = "dim";
        sawQualityWord = true;
        if (kind === "DEG") bareDegreeSign = true;
      } else {
        errors.push(`unexpected ${JSON.stringify(tx)}`);
      }
      i += 1;
    } else if (kind === "HALFDIM") {
      quality = "dim";
      sawQualityWord = true;
      exts.set(7, -1);
      sawSeventh = true;
      i += 1;
    } else if (kind === "AUGWORD") {
      quality = "aug";
      sawQualityWord = true;
      i += 1;
    } else if (kind === "PLUS") {
      if (at(i + 1) === "NUM") {
        exts.set(Number(tokens[i + 1][1]), 1);
        i += 2;
        continue;
      }
      if (primaryTop === null && exts.size === 0) {
        quality = "aug";
        sawQualityWord = true;
      } else {
        errors.push("unexpected '+'");
      }
      i += 1;
    } else if (kind === "MINUS") {
      if (at(i + 1) === "NUM" && (sawQualityWord || primaryTop !== null || exts.size > 0)) {
        exts.set(Number(tokens[i + 1][1]), -1);
        i += 2;
        continue;
      }
      if (!sawQualityWord && primaryTop === null && exts.size === 0) {
        quality = "minor";
        sawQualityWord = true;
      } else {
        errors.push(`unexpected ${JSON.stringify(tx)}`);
      }
      i += 1;
    } else if (kind === "SUS2") {
      quality = "sus2";
      sawQualityWord = true;
      i += 1;
    } else if (kind === "SUS4" || kind === "SUS") {
      quality = "sus4";
      sawQualityWord = true;
      i += 1;
    } else if (kind === "ALT") {
      exts.set(7, -1);
      exts.set(9, -1);
      exts.set(5, 1);
      sawSeventh = true;
      i += 1;
    } else if (kind === "ADD") {
      if (at(i + 1) !== "NUM") {
        errors.push("'add' must be followed by a number");
        i += 1;
        continue;
      }
      exts.set(Number(tokens[i + 1][1]), 0);
      i += 2;
    } else if (kind === "SHARP" || kind === "FLAT") {
      if (at(i + 1) !== "NUM") {
        errors.push(`${JSON.stringify(tx)} must be followed by a number`);
        i += 1;
        continue;
      }
      const degree = Number(tokens[i + 1][1]);
      exts.set(degree, kind === "SHARP" ? 1 : -1);
      if (degree === 7) sawSeventh = true;
      i += 2;
    } else if (kind === "NUM") {
      const degree = Number(tx);
      let j = i + 1;
      let alter = 0;
      let handled = false;
      const mod = at(j);
      const bindsForward = at(j + 1) === "NUM";
      if (mod === "MAJ") {
        alter = 0;
        handled = true;
        j += 1;
      } else if (mod === "MIN") {
        alter = -1;
        handled = true;
        j += 1;
      } else if ((mod === "MINUS" || mod === "DEG") && !bindsForward) {
        alter = -1;
        handled = true;
        j += 1;
      } else if (mod === "PLUS" && !bindsForward) {
        if (degree === 7) {
          const reading = readings.sevenPlus;
          ambiguity("sevenPlus", reading);
          if (reading === "majorSeventh") {
            majorSeventh = true;
            alter = 0;
          } else {
            alter = -1;
            exts.set(5, 1);
          }
        } else {
          alter = 1;
        }
        handled = true;
        j += 1;
      }

      if (!handled && degree === 4 && !sawQualityWord && exts.size === 0) {
        quality = "sus4";
        sawQualityWord = true;
        i = j;
        continue;
      }
      if (!handled && degree === 4 && quality === "major") {
        // The fourth ambiguity (§5.6): a cifra writes C7(4) for C7sus4.
        const reading = readings.bareFour;
        ambiguity("bareFour", reading);
        if (reading === "suspended") {
          quality = "sus4";
          sawQualityWord = true;
          i = j;
          continue;
        }
      }

      const isPrimary = primaryTop === null && !handled && degree >= 5;
      if (isPrimary) {
        primaryTop = degree;
        if (degree === 5) {
          if (!sawQualityWord) quality = "power";
        } else if (degree === 6) {
          exts.set(6, 0);
        } else {
          let addSeventh = true;
          if (degree === 9 && !majorSeventh && !sawSeventh) {
            const reading = readings.bareNine;
            ambiguity("bareNine", reading);
            if (reading === "add") addSeventh = false;
          }
          if (addSeventh && !sawSeventh) {
            exts.set(7, seventhAlter(quality, majorSeventh));
            sawSeventh = true;
          }
          if (degree !== 7) exts.set(degree, 0);
          for (const implied of stack(degree)) {
            if (!exts.has(implied)) exts.set(implied, 0);
          }
        }
      } else {
        exts.set(degree, alter);
        if (degree === 7) sawSeventh = true;
        if (primaryTop === null && handled && degree >= 7) primaryTop = degree;
      }
      i = j;
    } else if (kind === "SLASH") {
      if (at(i + 1) !== "NUM") {
        errors.push("a '/' must be followed by a bass note or a number");
      }
      i += 1;
    } else {
      errors.push(`unexpected ${JSON.stringify(tx)}`);
      i += 1;
    }
  }

  if (majorSeventh && !exts.has(7) && !majWordAlone) {
    exts.set(7, 0);
  }

  if (bareDegreeSign && quality === "dim" && !exts.has(7)) {
    const reading = readings.degreeSign;
    ambiguity("degreeSign", reading);
    if (reading === "diminishedSeventh") exts.set(7, -2);
  }

  // Fold triad-defining alterations into the quality (§5.2.1).
  if (quality === "minor" && exts.get(5) === -1) {
    quality = "dim";
    exts.delete(5);
  }
  if (quality === "major" && exts.get(5) === 1) {
    quality = "aug";
    exts.delete(5);
  }
  if (quality === "aug" && exts.get(5) === 1) exts.delete(5);
  if (quality === "dim" && exts.get(5) === -1) exts.delete(5);

  if (errors.length) {
    return { chord: null, ambiguities, errors };
  }

  for (const degree of exts.keys()) {
    if (![2, 4, 5, 6, 7, 9, 11, 13].includes(degree)) {
      return fail(`degree ${degree} cannot be an extension`);
    }
  }

  const chord = {
    root,
    quality,
    extensions: [...exts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([degree, alter]) => ({ degree, alter })),
    bass,
  };
  return { chord, ambiguities, errors: [] };
}

// A convenience over parseChord: is this text a chord in the given dialect?
export function isChord(text, dialect = DEFAULT_DIALECT) {
  return parseChord(text, dialect).chord !== null;
}

// The spelled tones of a chord, root first, for tests and display (§5.5). Each
// tone is spelled from the root's letter, not from pitch class, so `Db7` comes
// out `Db F Ab Cb` and the seventh of `C°7` is `Bbb` (§5.5 lines 229–235).
export function chordTones(chord) {
  const base = {
    major: [[1, 0], [3, 0], [5, 0]],
    minor: [[1, 0], [3, -1], [5, 0]],
    dim: [[1, 0], [3, -1], [5, -1]],
    aug: [[1, 0], [3, 0], [5, 1]],
    sus2: [[1, 0], [2, 0], [5, 0]],
    sus4: [[1, 0], [4, 0], [5, 0]],
    power: [[1, 0], [5, 0]],
  }[chord.quality];
  const degrees = new Map(base);
  for (const e of chord.extensions) {
    degrees.set(e.degree, e.alter);
  }
  const root = chord.root;
  const mod = (n, m) => ((n % m) + m) % m;
  const out = [];
  for (const [degree, alter] of [...degrees.entries()].sort((a, b) => a[0] - b[0])) {
    const steps = degree - 1;
    const letter = LETTERS[mod(LETTERS.indexOf(root.letter) + steps, 7)];
    const wanted = mod(NATURAL_PC[root.letter] + root.accidental + MAJOR_SCALE[mod(steps, 7)] + alter, 12);
    const natural = NATURAL_PC[letter];
    const acc = mod(wanted - natural + 6, 12) - 6;
    out.push(formatNote({ letter, accidental: acc }));
  }
  return out;
}
