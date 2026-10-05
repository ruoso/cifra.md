// Generators of related documents for the merge's property suite (§11.3): a
// base, and sides made from it by the edits people make. A port of the
// reference's reference/tests/merge_gen.py — never shared code: cifra.md's
// implementations agree because they are checked, not because they are shared
// (DIRECTION §3.6). The generated documents cover the same shapes the reference
// builds (multi-section charts, sung lines, two tunings with voicings, `Cm`
// groupings to join/split/regroup, setlists with repeated songs); they need not
// equal the reference's byte for byte (cifra_js.conformance refinement
// §Decisions).
//
// Test-only support under js/test/: it drives the public surface of the package
// (parse/write and the setlist reader/writer) and, for section_texts, the
// writer's chartBlocks — js/src/ is unchanged by this task.

import { DEFAULT_DIALECT, DIALECTS, parse, parseSetlist, write, writeSetlist } from "../../src/index.js";
import { chartBlocks } from "../../src/write.js";

export const CHORDS = ["C", "G", "Am", "F", "Dm", "G7", "Cm", "Cm[2]", "Cm[3]", "Em", "C7+", "%", "N.C.", "x2", "|:", ":|", "(", ")", "wobble", "@5"];
export const WORDS = ["la", "when", "I", "saw", "you", "oh", "tarde", "é", "Café", "the", "road"];
export const SHAPES = ["x35543", "x3554x", "8-10-10-8-8-8", "320003", "x32010", "133211", "022100"];
export const UKE = ["0333", "5333", "0003", "2010"];
export const SYMBOLS = ["C", "G", "Am", "F", "Dm", "G7", "Cm", "Cm[2]", "Cm[3]", "Em"];
const SONGS = ["corcovado", "wave", "carinhoso", "garota", "samba", "aguas"];

// The canonical form of a song's / a setlist's text, as the merge produces it
// (merge_props.py / the reference's canonical_song / canonicalise_setlist).
// `write`/`writeSetlist` are `serialize ∘ canonical`; the generator never builds
// a marked text, so `write` never refuses.
export function canonicalSong(text) {
  return write(parse(text));
}

export function canonicaliseSetlist(text) {
  return writeSetlist(parseSetlist(text));
}

// Partition a string at the first occurrence of `sep`, Python str.partition:
// [before, sep, after], or [text, "", ""] when sep is absent.
function partition(text, sep) {
  const i = text.indexOf(sep);
  if (i === -1) return [text, "", ""];
  return [text.slice(0, i), sep, text.slice(i + sep.length)];
}

// Python str.title() for the single-word song slugs: capitalise the first
// letter.
function title(s) {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

// The dialect a document resolves to (§1.4.3), for section_texts only — mirrors
// the writer's own dialectOf minimally (the writer copies each symbol as
// written and never re-spells, §8.4.4).
function dialectOf(doc) {
  for (const p of doc.properties || []) {
    if (p.key === "notation") {
      const d = (p.value || "").trim().toLowerCase();
      return d in DIALECTS ? d : DEFAULT_DIALECT;
    }
  }
  return DEFAULT_DIALECT;
}

const FENCE = "```";

function chordLine(rnd) {
  const n = rnd.randint(1, 4);
  const toks = [];
  for (let k = 0; k < n; k += 1) {
    if (k) toks.push("|");
    const m = rnd.randint(1, 2);
    for (let j = 0; j < m; j += 1) toks.push(rnd.choice(CHORDS));
  }
  return toks.join(" ");
}

function words(rnd) {
  const n = rnd.randint(2, 5);
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(rnd.choice(WORDS));
  return out.join(" ");
}

function sectionLines(rnd, name) {
  const third = rnd.random() < 0.3 ? `[${name}]` : `## ${name}`;
  let out = [rnd.choice([`## ${name}`, `## ${name}`, third])];
  if (out[0].startsWith("[")) {
    out = [FENCE, out[0]];
  } else {
    if (rnd.random() < 0.2) out.push("A note about " + name);
    out.push(FENCE);
  }
  const rows = rnd.randint(1, 4);
  for (let i = 0; i < rows; i += 1) {
    const r = rnd.random();
    if (r < 0.6) {
      out.push(chordLine(rnd));
    } else if (r < 0.85) {
      out.push(rnd.choice(["G       D", "C   Am  F", "Cm      Cm[2]", "Em  C"]));
      out.push(words(rnd));
    } else {
      out.push("// " + rnd.choice(WORDS));
    }
  }
  out.push(FENCE);
  return out;
}

function blocks(rnd) {
  const out = [];
  if (rnd.random() < 0.8) {
    out.push("## Voicings: E2 A2 D3 G3 B3 E4");
    for (const s of rnd.sample(SYMBOLS, rnd.randint(1, 5))) out.push(`- ${s}: ${rnd.choice(SHAPES)}`);
  }
  if (rnd.random() < 0.5) {
    out.push("## Voicings: G4 C4 E4 A4");
    for (const s of rnd.sample(SYMBOLS, rnd.randint(0, 3))) out.push(`- ${s}: ${rnd.choice(UKE)}`);
  }
  if (rnd.random() < 0.3) {
    out.push("## Easy: E2 A2 D3 G3 B3 E4");
    for (const s of rnd.sample(SYMBOLS, rnd.randint(0, 2))) out.push(`- ${s}: ${rnd.choice(SHAPES)}`);
  }
  return out;
}

export function document(rnd) {
  const lines = [];
  if (rnd.random() < 0.7) {
    lines.push(rnd.choice(["# Song", "# Tarde", "# Asa Branca"]));
    for (const k of rnd.sample(["artist: Ana", "key: G", "tempo: 96", "notation: american", "capo: 2"], rnd.randint(0, 2))) {
      lines.push("- " + k);
    }
    lines.push("");
  }
  for (const name of rnd.sample(["Intro", "A", "B", "Chorus", "Verse", "Coda"], rnd.randint(1, 4))) {
    lines.push(...sectionLines(rnd, name));
    lines.push("");
  }
  const b = blocks(rnd);
  if (b.length) {
    lines.push("---");
    lines.push("");
    lines.push(...b);
  }
  return write(parse(lines.join("\n") + "\n"));
}

// A side: the text with one to three edits. `scope` restricts the edits:
// ["section", k] to the body of the k-th section, ["tuning", t] to the blocks
// of one tuning.
export function edit(rnd, text, scope = null) {
  let lines = text ? text.split("\n").slice(0, -1) : [];
  const rounds = rnd.randint(1, 3);
  for (let round = 0; round < rounds; round += 1) {
    const inside = [];
    let fence = false;
    let sec = -1;
    let voicings = false;
    let tuning = null;
    for (let k = 0; k < lines.length; k += 1) {
      const ln = lines[k];
      if (ln === "---" && !fence) {
        voicings = true;
        continue;
      }
      if (voicings) {
        if (ln.startsWith("## ")) {
          tuning = ln.slice(ln.indexOf(": ") + 2);
        } else if (ln.startsWith("- ")) {
          if (scope === null || (scope[0] === "tuning" && scope[1] === tuning)) inside.push(["voicing", k]);
        }
        continue;
      }
      if (ln.startsWith("## ") && !fence) {
        sec += 1;
        if (scope === null) inside.push(["heading", k]);
        continue;
      }
      if (ln.startsWith("```") || ln.startsWith("~~~")) {
        fence = !fence;
        continue;
      }
      if (fence && (scope === null || (scope[0] === "section" && scope[1] === sec))) {
        if (!ln.startsWith("[")) inside.push(["music", k]);
      } else if (scope === null && ln.startsWith("- ") && !voicings) {
        inside.push(["property", k]);
      }
    }
    if (!inside.length) break;
    const [what, k] = rnd.choice(inside);
    const r = rnd.random();
    if (what === "music") {
      if (r < 0.25) {
        lines.splice(k, 1);
      } else if (r < 0.5) {
        lines.splice(k + rnd.choice([0, 1]), 0, chordLine(rnd));
      } else if (r < 0.75) {
        lines[k] = chordLine(rnd);
      } else if (lines[k].includes("Cm[") && r < 0.85) {
        // two keys joined on this line (§8.3 I3)
        lines[k] = lines[k].replace(/Cm\[\d+\]/g, "Cm");
      } else {
        // a marker split off, or a key moved
        lines[k] =
          lines[k].includes("Cm") && !lines[k].includes("Cm[")
            ? lines[k].replace("Cm", "Cm[2]")
            : lines[k] + " Cm[3]";
      }
    } else if (what === "voicing") {
      const sym = lines[k].slice(2).split(":")[0];
      if (r < 0.3) {
        lines.splice(k, 1);
      } else if (r < 0.8) {
        const pool = (tuning || "").includes("G4 C4") ? UKE : SHAPES;
        lines[k] = `- ${sym}: ${rnd.choice(pool)}`;
      } else {
        const pool = (tuning || "").includes("G4 C4") ? UKE : SHAPES;
        lines.splice(k + 1, 0, `- ${rnd.choice(SYMBOLS)}: ${rnd.choice(pool)}`);
      }
    } else if (what === "heading") {
      lines[k] = rnd.choice(["## Bridge", "## A", lines[k] + " x2", "## Intro @5"]);
    } else if (what === "property") {
      lines[k] = rnd.choice(["- artist: Bia", "- key: D", "- words: no", "- notation: realbook", "- tempo: 120"]);
    }
  }
  if (scope === null && rnd.random() < 0.15) {
    return join(write(parse(lines.join("\n") + "\n")));
  }
  return write(parse(lines.join("\n") + "\n"));
}

// Every `Cm[n]` of the chart written `Cm`: the keys of `Cm` joined into one, as
// someone who drops the markers does. The blocks are left as they are, and
// canonical form drops the keys nothing uses any more (§8.3 I1).
export function join(text) {
  const [chart, rule, rest] = partition(text, "\n---\n");
  return write(parse(chart.replace(/Cm\[\d+\]/g, "Cm") + rule + rest));
}

// A side that changes only how the bars of `Cm` are grouped: it joins every key
// of `Cm` into one (§8.3 I3), or splits one bare `Cm` off to a new key, or
// moves it to an existing one (§8.5.1). null if the chart has no `Cm` to
// regroup.
export function regroup(rnd, text) {
  const [chart, rule, rest] = partition(text, "\n---\n");
  if (chart.includes("Cm[") && rnd.random() < 0.4) return join(text);
  const lines = chart.split("\n");
  const bare = [];
  for (let k = 0; k < lines.length; k += 1) {
    if (/(?<![\w[])Cm(?![\w[])/.test(lines[k]) && !lines[k].startsWith("## ")) bare.push(k);
  }
  if (!bare.length) return null;
  const k = rnd.choice(bare);
  const to = rnd.choice(chart.includes("Cm[2]") ? ["Cm[9]", "Cm[2]"] : ["Cm[9]"]);
  lines[k] = lines[k].replace(/(?<![\w[])Cm(?![\w[])/, to);
  return write(parse(lines.join("\n") + rule + rest));
}

// A side whose changes leave every `Cm` alone: a new title, a chord changed in
// a line with no `Cm` in it or next to it, and a new shape for a chord other
// than `Cm`.
export function unrelated(rnd, text) {
  const [chart, rule, restIn] = partition(text, "\n---\n");
  let lines = chart.split("\n");
  const titleLine = "# Retitled";
  if (lines.length && lines[0].startsWith("# ")) {
    lines[0] = titleLine;
  } else {
    lines = [titleLine, "", ...lines];
  }
  // a line of words is one unit with the chord line above it (§11.8.1)
  const plain = [];
  for (let k = 0; k < lines.length; k += 1) {
    const around = lines.slice(Math.max(k - 1, 0), k + 2).join("");
    if (!around.includes("Cm") && /(?<![\w(])G7(?![\w(])/.test(lines[k])) plain.push(k);
  }
  if (plain.length) {
    const k = rnd.choice(plain);
    lines[k] = lines[k].replace(/(?<![\w(])G7(?![\w(])/, "G7(b9)");
  }
  const rest = restIn.replace(/^- (?!Cm)(\S+): .*$/m, (_m, g1) => `- ${g1}: x00000`);
  return write(parse(lines.join("\n") + rule + rest));
}

// How a document's chart groups its bars of `Cm`: for each, in order, the
// number of the first bar with its key. Names are left out, since the merge
// numbers its variants afresh (§11.9.5).
export function cmGrouping(text) {
  const keys = [];
  for (const s of parse(text).sections) {
    for (const part of s.body) {
      if (part.type !== "music") continue;
      for (const ln of part.lines) {
        for (const m of ln.measures || []) {
          for (const it of m.items) {
            if (it.type === "chord" && it.symbol === "Cm") keys.push(it.key);
          }
        }
      }
    }
  }
  return keys.map((k) => keys.indexOf(k));
}

// Each section of a document as canonical form writes it.
export function sectionTexts(text) {
  const doc = parse(text);
  const dialect = dialectOf(doc);
  return doc.sections.map((s) => chartBlocks([s], dialect).map((b) => b.join("\n")).join("\n\n"));
}

export function onlySectionChanged(base, side, k) {
  const a = sectionTexts(base);
  const b = sectionTexts(side);
  return a.length === b.length && a.every((x, n) => n === k || x === b[n]);
}

// Whether two documents group the bars of `Cm` the same way across the whole
// song (§11.9.4). `Cm` is the only multi-variant footnote symbol the generator
// builds, so this is the only cross-section footnote coupling the merge has;
// the section-independence property uses it to leave out a side that regrouped
// `Cm`, which reaches every section that plays it (see the test's comment).
export function sameGrouping(a, b) {
  const ga = cmGrouping(a);
  const gb = cmGrouping(b);
  return ga.length === gb.length && ga.every((x, n) => x === gb[n]);
}

export function setlist(rnd) {
  const lines = [];
  if (rnd.random() < 0.8) {
    lines.push(rnd.choice(["# Friday", "# Sexta"]));
    for (const e of rnd.sample(["place: Bar do Zé", "date: 2026-10-09", "bring the flute"], rnd.randint(0, 2))) {
      lines.push("- " + e);
    }
    lines.push("");
  }
  let n = 0;
  const items = rnd.randint(1, 6);
  for (let i = 0; i < items; i += 1) {
    if (rnd.random() < 0.15) {
      lines.push("", rnd.choice(["Second set.", "Tune to the piano.", FENCE, "Break"]), "");
      continue;
    }
    n += 1;
    // a set that plays a song more than once, often
    const pool = rnd.random() < 0.4 ? SONGS.slice(0, 3) : SONGS;
    const song = rnd.choice(pool);
    const linked = rnd.random() < 0.9;
    lines.push(linked ? `${n}. [${title(song)}](${song}.cifra.md)` : `${n}. ${song} (unlinked)`);
    for (const e of rnd.sample(["key: D", "key: E", "note: slow", "singer: Ana", "a remark"], rnd.randint(0, 2))) {
      lines.push("   - " + e);
    }
  }
  return canonicaliseSetlist(lines.join("\n") + "\n");
}

export function editSetlist(rnd, text) {
  const lines = text ? text.split("\n").slice(0, -1) : [];
  const rounds = rnd.randint(1, 3);
  for (let round = 0; round < rounds; round += 1) {
    if (!lines.length) break;
    const k = rnd.randrange(lines.length);
    const r = rnd.random();
    if (r < 0.25) {
      lines.splice(k, 1);
    } else if (r < 0.5) {
      const song = rnd.choice(SONGS);
      lines.splice(k, 0, `1. [${title(song)}](${song}.cifra.md)`);
    } else if (r < 0.7) {
      const ln = lines.splice(k, 1)[0];
      lines.splice(rnd.randrange(lines.length + 1), 0, ln);
    } else if (r < 0.78) {
      lines.splice(k + 1, 0, "   - " + rnd.choice(["key: F", "note: fast", "singer: Bia"]));
    } else if (r < 0.85) {
      // a song played again: a copy of an item line, elsewhere
      const copies = lines.filter((ln) => /^\d+\. /.test(ln));
      if (copies.length) lines.splice(k, 0, rnd.choice(copies));
    } else {
      lines[k] = rnd.choice(["# Saturday", "- place: upstairs", "Second set, later.", "2. [Wave](wave.cifra.md)"]);
    }
  }
  return canonicaliseSetlist(lines.join("\n") + "\n");
}

// A setlist with a bare copy of one of its songs inserted at an item boundary
// whose neighbours are other songs, so that where it went is not ambiguous;
// null if there is no such place. Returns [canonical text, position, copy].
export function insertCopy(rnd, text) {
  const doc = parseSetlist(text);
  const body = doc.body;
  const songs = body.filter((el) => el.type === "song");
  if (!songs.length) return null;
  const song = rnd.choice(songs);
  const copy = { type: "song", number: 0, text: song.text, path: song.path, entries: [] };
  const places = [];
  for (let p = 0; p <= body.length; p += 1) {
    const before = [...body.slice(0, p)].reverse().find((el) => el.type !== "notes") ?? null;
    const after = body.slice(p).find((el) => el.type !== "notes") ?? null;
    if ([before, after].every((el) => el === null || el.type !== "song" || el.path !== song.path)) places.push(p);
  }
  if (!places.length) return null;
  const p = rnd.choice(places);
  doc.body = [...body.slice(0, p), copy, ...body.slice(p)];
  return [canonicaliseSetlist(writeSetlist(doc)), p, copy];
}

// A setlist with a note no item has yet given to its k-th item. Returns
// [canonical text, item index, the noted item element].
export function addNote(rnd, text, k = null) {
  const doc = parseSetlist(text);
  const body = doc.body;
  const items = [];
  body.forEach((el, n) => {
    if (el.type !== "notes") items.push(n);
  });
  if (!items.length) return null;
  const n = k === null ? items[rnd.randrange(items.length)] : items[k];
  body[n].entries = body[n].entries.filter((e) => !(e.type === "property" && e.key === "note"));
  body[n].entries.push({ type: "property", key: "note", value: `take ${rnd.randrange(10 ** 6)}` });
  return [canonicaliseSetlist(writeSetlist(doc)), n, body[n]];
}
