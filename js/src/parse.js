// The song reader (spec §1 to §7): `parse(bytes) → model`, the function that
// turns the text of a .cifra.md document into its canonical in-memory model. A
// port of the reference's reference/cifra_md/parse.py — never imported from it:
// agreement is by the corpus, not shared code (DIRECTION §3.6). It reads the
// document structure (§1), tokenises the chart (§2), pairs repeats (§3),
// detects whether the document is sung and attaches each chart item to the
// syllable under it, running the §4.5 layout convergence pass (layout.js) on
// every sung line (§4), classifies every chord through chord.js (§5), and reads
// the voicings part after the rule into per-tuning, per-variation blocks of
// fret strings and fingerings (§6, §7). It reports everything it cannot keep as
// a diagnostic and never throws on malformed input — the single exception is
// invalid UTF-8, which the text layer rejects (§9.2).
//
// Framework-free and zero runtime dependencies (DIRECTION §3.7): this module
// uses only regular expressions and plain objects, standing on the settled
// seams text.js (§1.3), markdown.js (§1.4.1/§1.9), chord.js (§5), tuning.js (§6)
// and frets.js (§7.5). It knows nothing of React, storage, the network or
// logging; the model is plain objects and arrays in the reference's exact key
// order, compared to the corpus byte for byte.

import { prepare, isMarkerLine } from "./text.js";
import { mdHeading, fenceOpen, closesFence } from "./markdown.js";
import { DEFAULT_DIALECT, DIALECTS, parseChord } from "./chord.js";
import { parseTuning } from "./tuning.js";
import { parseFrets, parseFingers, checkFingers } from "./frets.js";
import { converge } from "./layout.js";

// Whitespace is U+0020 only (§1.3); tabs are already spaces and trailing spaces
// are already gone when these patterns see a line.
const RULE = /^ {0,3}-{3,}$/;
const LIST_ITEM = /^ {0,3}[-*+](?: +(.*))?$/;
const PROPERTY = /^([A-Za-z0-9_-]+) *:(?: +(.*))?$/;
export const BRACKET_HEADING = /^( *\[ *([^\]]*?) *\] *)(.*)$/;
export const LABEL_HEADING = /^( *([^ :|]+):(?: +|$))(.*)$/;
const HEADING_ANCHOR = / *@(0*[1-9][0-9]*) *$/;
const BAR_ANCHOR = /^@(0*[1-9][0-9]*)$/;
const COUNT = /^\(?(?:[x×](0*[1-9][0-9]*)|(0*[1-9][0-9]*)[x×]|(bis))\)?$/;
const BEAT = new Set(["/", ".", "-"]);
export const ANNOTATION = /^ *\/\/ ?(.*)$/;
const HEADING_COUNT = / *(\(?(?:[x×]0*[1-9][0-9]*|0*[1-9][0-9]*[x×]|bis)\)?) *$/;
const ENDING = /^(0*[1-9][0-9]*)\.$/;
const CHORD_TOKEN = /^(.*?)(?:\[([0-9]+)\])?$/;
export const LYRIC_MARKER = /^( *)>( ?)/;
const BARS = /(:)?(\|+)(:)?/g;
const WORD = /[^ ]+/g;

const REPEAT = "%";
const FINGERING = /^(.*?) *\(([^()]*)\) *$/;

// Lowercase only ASCII A–Z, as the reference's `ascii_lower` does.
function asciiLower(text) {
  let out = "";
  for (const c of text) {
    out += c >= "A" && c <= "Z" ? String.fromCharCode(c.charCodeAt(0) + 32) : c;
  }
  return out;
}

// Strip only U+0020 from both ends — never other Unicode whitespace.
function stripSpaces(text) {
  return text.replace(/^ +/, "").replace(/ +$/, "");
}

function stripTrailingPunct(text) {
  return text.replace(/[,;]+$/, "");
}

// Whether every character is an ASCII digit, as the reference's `str.isdigit()`
// use here means (a bracket content that is all digits is not a heading).
function isDigits(text) {
  return text.length > 0 && /^[0-9]+$/.test(text);
}

// Python's repr of a string, so diagnostic messages that quote a value with
// `{x!r}` match the committed corpus byte for byte.
function pyRepr(s) {
  const hasSingle = s.includes("'");
  const hasDouble = s.includes('"');
  const quote = hasSingle && !hasDouble ? '"' : "'";
  let out = quote;
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (ch === "\\") out += "\\\\";
    else if (ch === quote) out += "\\" + ch;
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (code < 0x20 || code === 0x7f) out += "\\x" + code.toString(16).padStart(2, "0");
    else out += ch;
  }
  return out + quote;
}

// Does the item make a measure (§2.2)? Marks, counts and ending markers do not,
// including an ending marker demoted to an unknown token (§3.4).
export function substantive(it) {
  if (it.type === "unknown") return !ENDING.test(it.text);
  return it.type === "chord" || it.type === "nochord" || it.type === "beat" || it.type === "repeat";
}

function isBar(measure) {
  return measure.items.some((it) => substantive(it));
}

function keyFor(symbol, index) {
  return index > 1 ? `${symbol}[${index}]` : symbol;
}

// --- tokens ------------------------------------------------------------------

function countTimes(m) {
  if (m[3]) return 2;
  return parseInt(m[1] || m[2], 10);
}

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

// Leading `(` and trailing `)` that nothing balances become marks (§2.3, §3.2).
function splitMarks(word) {
  let before = "";
  let core = word;
  let after = "";
  while (core && !balanced(core)) {
    if (core.startsWith("(")) {
      before += "(";
      core = core.slice(1);
    } else if (core.endsWith(")")) {
      after = ")" + after;
      core = core.slice(0, -1);
    } else {
      break;
    }
  }
  return [before, core, after];
}

// Steps 2, 3, 4 and 6 of §2.3 for a word with its marks removed.
function classifyCore(core, dialect) {
  if (core === REPEAT) return { type: "repeat" };
  if (core.toUpperCase() === "N.C." || core.toUpperCase() === "NC") return { type: "nochord" };
  if (BEAT.has(core)) return { type: "beat", mark: core };
  let m = COUNT.exec(core);
  if (m) return { type: "count", times: countTimes(m) };
  m = ENDING.exec(core);
  if (m) return { type: "ending", number: parseInt(m[1], 10) };
  m = CHORD_TOKEN.exec(core);
  const symbol = m[1] || core;
  const index = m[2] ? Math.max(parseInt(m[2], 10), 1) : 1;
  const result = parseChord(symbol, dialect);
  if (result.chord === null) return { type: "unknown", text: core };
  const item = { type: "chord", symbol, index, key: keyFor(symbol, index), chord: result.chord };
  if (result.ambiguities && result.ambiguities.length) item.ambiguities = result.ambiguities;
  return item;
}

// Measures and items of one chord line, with every item's column.
function scanLine(body, dialect) {
  const bars = [...body.matchAll(BARS)];
  const pieces = [];
  let prevEnd = 0;
  for (const m of bars) {
    pieces.push([prevEnd, body.slice(prevEnd, m.index), m]);
    prevEnd = m.index + m[0].length;
  }
  pieces.push([prevEnd, body.slice(prevEnd), null]);

  const measures = [];
  let closeBar = null;
  let carryAnchor = null;
  let pending = [];
  let barBefore = null;
  let barCol = null;

  for (const [start, text, bar] of pieces) {
    const items = [];
    let anchor = null;
    let anchorCol = null;
    for (const w of text.matchAll(WORD)) {
      const col = start + w.index;
      const word = stripTrailingPunct(w[0]);
      if (!word) continue;
      const a = BAR_ANCHOR.exec(word);
      if (a) {
        anchor = parseInt(a[1], 10);
        anchorCol = col;
        continue;
      }
      const cm = COUNT.exec(word);
      if (cm) {
        items.push({ type: "count", times: countTimes(cm), column: col });
        continue;
      }
      let [before, core, after] = splitMarks(word);
      core = stripTrailingPunct(core);
      const afterCol = col + before.length + core.length;
      for (let k = 0; k < before.length; k += 1) {
        items.push({ type: "mark", open: true, notation: "bracket", column: col + k });
      }
      if (core && BAR_ANCHOR.test(core)) {
        anchor = parseInt(core.slice(1), 10);
        anchorCol = col + before.length;
        core = "";
      }
      if (core) {
        const item = classifyCore(core, dialect);
        item.column = col + before.length;
        items.push(item);
      }
      for (let k = 0; k < after.length; k += 1) {
        items.push({ type: "mark", open: false, notation: "bracket", column: afterCol + k });
      }
    }
    // Bar-group start positions, computed from the match (JS gives no group
    // offsets): group 1 is the leading colon, group 2 the pipes, group 3 the
    // trailing colon.
    let start2 = null;
    let start3 = null;
    let leadingColonCol = null;
    if (bar !== null) {
      leadingColonCol = bar.index;
      start2 = bar.index + (bar[1] ? bar[1].length : 0);
      start3 = start2 + bar[2].length;
    }
    let closeMark = null;
    if (bar !== null && bar[1]) {
      closeMark = { type: "mark", open: false, notation: "barline", column: leadingColonCol };
    }

    const hasSubstantive = items.some(
      (it) =>
        it.type === "chord" ||
        it.type === "nochord" ||
        it.type === "beat" ||
        it.type === "repeat" ||
        it.type === "unknown",
    );
    if (hasSubstantive) {
      const measure = { bar: barBefore, items: [...pending, ...items] };
      pending = [];
      if (barCol !== null) measure._col = barCol;
      if (anchor !== null) {
        measure.anchor = anchor;
        measure._anchorCol = anchorCol;
      } else if (carryAnchor !== null) {
        measure.anchor = carryAnchor;
      }
      carryAnchor = null;
      if (closeMark !== null) measure.items.push(closeMark);
      measures.push(measure);
    } else {
      if (anchor !== null) carryAnchor = anchor;
      if (closeMark !== null) items.push(closeMark);
      for (const it of items) {
        const backwards = it.type === "count" || (it.type === "mark" && !it.open);
        if (backwards && measures.length) measures[measures.length - 1].items.push(it);
        else pending.push(it);
      }
      if (bar === null && barBefore !== null) closeBar = barBefore;
    }

    if (bar === null) break;
    barBefore = bar[2].length >= 2 ? "||" : "|";
    barCol = start2;
    if (bar[3]) pending.push({ type: "mark", open: true, notation: "barline", column: start3 });
  }

  if (pending.length) {
    if (measures.length) measures[measures.length - 1].items.push(...pending);
    else measures.push({ bar: null, items: pending });
  }
  return { measures, closeBar, trailing: carryAnchor, hasBar: bars.length > 0 };
}

// --- line shapes (§4.1) ------------------------------------------------------

function stripMarker(raw) {
  return raw.replace(LYRIC_MARKER, (match, g1, g2) => g1 + " " + g2);
}

export function lineShape(raw, dialect) {
  const am = ANNOTATION.exec(raw);
  if (am) return { kind: "annotation", body: am[1], words: 0, scan: null, forced: false };
  let forced = LYRIC_MARKER.test(raw);
  let body = forced ? stripMarker(raw) : raw;
  if (forced && !stripSpaces(body)) {
    forced = false;
    body = raw;
  }
  const scan = scanLine(body, dialect);
  const items = scan.measures.flatMap((m) => m.items);
  const words = items.filter((it) => it.type === "chord" || it.type === "nochord" || it.type === "unknown");
  const chords = words.filter((it) => it.type === "chord" || it.type === "nochord");
  let kind;
  if (forced) kind = "forced";
  else if (items.length === 0) kind = "blank";
  else if (scan.hasBar || words.length === 0 || chords.length === words.length) kind = "chords";
  else if ((words.length - chords.length) / words.length >= 0.5) kind = "prose";
  else kind = "chart";
  return { kind, body, words: words.length, scan, forced };
}

// --- the parser --------------------------------------------------------------

class Parser {
  constructor(text, dialect) {
    this.lines = prepare(text);
    this.diagnostics = [];
    this.title = null;
    this.properties = [];
    this.sections = [];
    this.blocks = [];
    this.dialectOverride = dialect ?? null;
  }

  diag(code, line, message, text) {
    const d = { code, message, line };
    if (text !== undefined && text !== null) d.text = text;
    this.diagnostics.push(d);
  }

  prop(key) {
    for (const p of this.properties) if (p.key === key) return p.value;
    return null;
  }

  // metadata ------------------------------------------------------------
  readMetadata() {
    let i = 0;
    const n = this.lines.length;
    while (i < n && !this.lines[i]) i += 1;
    if (i < n) {
      const h = mdHeading(this.lines[i]);
      if (h && h.level === 1) {
        this.title = h.text || null;
        i += 1;
      }
    }
    let j = i;
    while (j < n) {
      const ln = this.lines[j];
      if (!ln) {
        j += 1;
        continue;
      }
      const m = LIST_ITEM.exec(ln);
      if (!m) break;
      const pm = PROPERTY.exec(m[1] || "");
      if (pm) {
        const key = asciiLower(pm[1]);
        const value = pm[2] || "";
        let found = false;
        for (const p of this.properties) {
          if (p.key === key) {
            this.diag("duplicate-property", j + 1, `\`${key}\` is set again; the earlier value is not kept`, ln);
            p.value = value;
            found = true;
            break;
          }
        }
        if (!found) this.properties.push({ key, value });
      } else {
        this.diag("bad-property", j + 1, "a property is `key: value`, with a space after the colon; this line is not kept", ln);
      }
      i = j + 1;
      j += 1;
    }
    return i;
  }

  // sections ------------------------------------------------------------
  newSection(name, heading) {
    name = stripSpaces(name).replace(/ +/g, " ");
    let anchor = null;
    let times = null;
    if (heading !== "label") {
      [name, anchor, times] = takeAnchor(name);
    }
    const section = { name, heading, anchor, body: [], groups: [] };
    if (times !== null) section.times = times;
    this.sections.push(section);
    return section;
  }

  run() {
    for (let idx = 0; idx < this.lines.length; idx += 1) {
      if (isMarkerLine(this.lines[idx])) {
        this.diag("marker-line", idx + 1, "a conflict marker: this text is an unresolved merge, and cannot be saved until it is resolved", this.lines[idx]);
      }
    }
    const start = this.readMetadata();
    let dialect = asciiLower(stripSpaces(this.dialectOverride || this.prop("notation") || DEFAULT_DIALECT));
    if (!(dialect in DIALECTS)) {
      this.diag("bad-notation", 1, `unknown notation ${pyRepr(dialect)}; using ${DEFAULT_DIALECT}`);
      dialect = DEFAULT_DIALECT;
    }
    this.dialect = dialect;

    let section = this.newSection("", null);
    let part = null;
    let fence = null;
    let inVoicings = false;
    let block = null;
    let skipping = false;

    for (let idx = start; idx < this.lines.length; idx += 1) {
      const raw = this.lines[idx];
      const lineno = idx + 1;

      if (inVoicings) {
        [block, skipping] = this.voicingsLine(raw, lineno, block, skipping);
        continue;
      }

      if (fence !== null) {
        if (closesFence(raw, fence)) {
          fence = null;
          part = null;
          continue;
        }
        if (part.type === "verbatim") {
          part.raw.push(raw);
          continue;
        }
        // inside a fence: cifra-style headings open sections. What follows a
        // bracket heading on its line is read as a line of its own (§1.7.2).
        let text = raw;
        let headed = false;

        const leaveOpeningPart = () => {
          if (part._opening && part.raw.every(([, t]) => !t)) {
            const body = part._section.body;
            const idx2 = body.findIndex((p) => p === part);
            body.splice(idx2, 1);
          }
        };

        while (true) {
          const bm = BRACKET_HEADING.exec(text);
          if (!(bm && bm[2] && !isDigits(bm[2]))) break;
          const rest = bm[3];
          const cm = rest ? COUNT.exec(rest) : null;
          leaveOpeningPart();
          section = this.newSection(bm[2] + (cm ? ` ${rest}` : ""), "bracket");
          part = { type: "music", raw: [] };
          section.body.push(part);
          headed = true;
          text = cm ? "" : rest;
          if (!text) break;
        }
        if (headed && !text) continue;
        const lm = LABEL_HEADING.exec(text);
        if (lm && lm[2] && isChordRun(lm[3], dialect)) {
          leaveOpeningPart();
          section = this.newSection(lm[2], "label");
          part = { type: "music", raw: [] };
          section.body.push(part);
          const rest = lm[3];
          if (rest) {
            part.raw.push([lineno, rest]);
            if (!rest.includes("|") && rest.split(" ").length === 1 && classifyCore(stripTrailingPunct(rest), dialect).type === "chord") {
              this.diag(
                "heading-looks-like-key",
                lineno,
                `\`${stripSpaces(text)}\` reads as a section called ${pyRepr(lm[2])} holding one chord; ` +
                  `if it is the song's key, write \`- key: ${rest}\` in the properties`,
                raw,
              );
            }
          }
          continue;
        }
        part.raw.push([lineno, text]);
        continue;
      }

      const fo = fenceOpen(raw);
      if (fo) {
        fence = { char: fo.char, length: fo.length, line: lineno };
        const info = fo.info;
        if (info && info !== "cifra") {
          part = { type: "verbatim", info, raw: [] };
        } else {
          part = { type: "music", raw: [], _opening: true, _section: section };
        }
        section.body.push(part);
        continue;
      }
      if (RULE.test(raw)) {
        inVoicings = true;
        part = null;
        continue;
      }
      const h = mdHeading(raw);
      if (h) {
        section = this.newSection(h.text, "markdown");
        part = null;
        continue;
      }
      // notes
      if (part === null || part.type !== "notes") {
        part = { type: "notes", raw: [] };
        section.body.push(part);
      }
      part.raw.push([lineno, raw]);
    }

    if (fence !== null) {
      this.diag("unclosed-fence", fence.line, "a fence was opened and never closed; it runs to the end of the document");
      if (part !== null && part.type === "verbatim") {
        while (part.raw.length && !part.raw[part.raw.length - 1]) part.raw.pop();
      }
    }

    this.finishSections();
    return this.result();
  }

  // voicings part -------------------------------------------------------
  voicingsLine(raw, lineno, block, skipping) {
    if (!raw) return [block, skipping];
    if (RULE.test(raw)) {
      this.diag("extra-rule", lineno, "a second rule; only the first divides the document, and this one is not kept", raw);
      return [block, skipping];
    }
    const h = mdHeading(raw);
    if (h) {
      const text = h.text;
      const ci = text.indexOf(":");
      const sep = ci !== -1;
      let label = sep ? text.slice(0, ci) : text;
      let tuningText = sep ? text.slice(ci + 1) : "";
      label = stripSpaces(label);
      tuningText = stripSpaces(tuningText);
      if (!sep || !label || !tuningText) {
        this.diag(
          "bad-block-heading",
          lineno,
          `\`${stripSpaces(raw)}\` comes after the rule, where a heading is a voicings block and needs a tuning ` +
            "(`## Voicings: E2 A2 D3 G3 B3 E4`). If it is a section of the song, move the rule below it; " +
            "the lines under it are not read",
          raw,
        );
        return [null, true];
      }
      let tuning;
      try {
        tuning = parseTuning(tuningText);
      } catch {
        this.diag(
          "bad-block-heading",
          lineno,
          `not a tuning: ${pyRepr(tuningText)}. A tuning is the open strings as pitches with octave numbers, ` +
            "lowest string first, like E2 A2 D3 G3 B3 E4 for a guitar or G4 C4 E4 A4 for a ukulele",
          raw,
        );
        return [null, true];
      }
      const name = asciiLower(label) === "voicings" ? "" : label;
      for (const existing of this.blocks) {
        if (existing.tuning.id === tuning.id && existing.label === name) {
          this.diag("duplicate-block", lineno, "a second block for the same tuning and variation; merged", raw);
          return [existing, false];
        }
      }
      block = { label: name, tuning, voicings: [], notes: [] };
      this.blocks.push(block);
      return [block, false];
    }
    if (skipping) return [block, skipping];
    const lm = LIST_ITEM.exec(raw);
    if (lm) {
      if (block === null) {
        this.diag("item-outside-block", lineno, "a voicing before any block heading; not kept", raw);
        return [block, skipping];
      }
      const content = lm[1] || "";
      const ci = content.indexOf(":");
      const sep = ci !== -1;
      let key = sep ? content.slice(0, ci) : content;
      let fretsText = sep ? content.slice(ci + 1) : "";
      key = stripSpaces(key);
      if (!sep || !key || key.includes(" ")) {
        this.diag("bad-voicing", lineno, "a voicing is `- key: frets`; this line is not kept", raw);
        return [block, skipping];
      }
      let fingersText = null;
      const fm = FINGERING.exec(fretsText);
      if (fm) {
        fretsText = fm[1];
        fingersText = fm[2];
      }
      const frets = parseFrets(fretsText);
      if (frets === null) {
        this.diag("bad-voicing", lineno, `not a fret string: ${pyRepr(stripSpaces(fretsText))}`, raw);
        return [block, skipping];
      }
      if (frets.length !== block.tuning.pitches.length) {
        this.diag("bad-voicing", lineno, `${frets.length} frets for ${block.tuning.pitches.length} strings`, raw);
        return [block, skipping];
      }
      const m = CHORD_TOKEN.exec(key);
      const symbol = m[1] || key;
      const index = m[2] ? Math.max(parseInt(m[2], 10), 1) : 1;
      const entry = { key: keyFor(symbol, index), symbol, index, frets };
      if (fingersText !== null) {
        const fingers = parseFingers(fingersText);
        const problem = fingers === null ? "not a fingering" : checkFingers(fingers, frets);
        if (problem) this.diag("bad-fingering", lineno, problem, raw);
        else entry.fingers = fingers;
      }
      let merged = false;
      for (const existing of block.voicings) {
        if (existing.key === entry.key) {
          existing.frets = frets;
          delete existing.fingers;
          if ("fingers" in entry) existing.fingers = entry.fingers;
          merged = true;
          break;
        }
      }
      if (!merged) block.voicings.push(entry);
      return [block, skipping];
    }
    if (block === null) {
      this.diag("notes-outside-block", lineno, "text in the voicings part before any block; not kept", raw);
      return [block, skipping];
    }
    block.notes.push(raw);
    return [block, skipping];
  }

  // finishing -----------------------------------------------------------
  finishSections() {
    const dialect = this.dialect;
    const shaped = [];
    for (const section of this.sections) {
      for (const part of section.body) {
        if (part.type === "music") {
          part.shapes = part.raw.map(([, raw]) => lineShape(raw, dialect));
          shaped.push(part);
        }
      }
    }
    let sung = false;
    let sungAt = null;
    for (const part of shaped) {
      const shapes = part.shapes;
      for (let i = 0; i < shapes.length; i += 1) {
        if (sung) break;
        const sh = shapes[i];
        if (sh.kind === "forced") {
          sung = true;
          sungAt = part.raw[i][0];
        } else if (sh.kind === "chords" && i + 1 < shapes.length && shapes[i + 1].kind === "prose" && shapes[i + 1].words >= 2) {
          sung = true;
          sungAt = part.raw[i + 1][0];
        }
      }
    }
    const words = asciiLower(stripSpaces(this.prop("words") || ""));
    if (words === "yes" || words === "no") {
      sung = words === "yes";
      sungAt = null;
    } else if (words) {
      this.diag("bad-property", 1, `\`words\` is yes or no, not ${pyRepr(words)}`);
    }
    this.sung = sung;
    this.sungAt = sungAt;

    const keptSections = [];
    for (const section of this.sections) {
      const body = [];
      for (const part of section.body) {
        if (part.type === "notes") {
          const lines = part.raw;
          while (lines.length && !lines[0][1]) lines.shift();
          while (lines.length && !lines[lines.length - 1][1]) lines.pop();
          if (lines.length) {
            body.push({ type: "notes", text: lines.map(([, t]) => t).join("\n") });
            if (shaped.length === 0) this.unfencedCheck(lines);
          }
        } else if (part.type === "verbatim") {
          body.push({ type: "verbatim", info: part.info, text: part.raw.join("\n") });
        } else {
          body.push({ type: "music", lines: this.assemble(part, sung) });
        }
      }
      section.body = body;
      if (body.length || section.heading !== null) keptSections.push(section);
    }
    this.sections = keptSections;

    this.carryAnchors();
    this.convergeSung();
    if (!sung) this.numberBars();
    for (const section of this.sections) this.pairRepeats(section);
    this.checkRepeatSigns();
    for (const section of this.sections) {
      for (const part of section.body) {
        if (part.type !== "music") continue;
        for (const line of part.lines) {
          for (const m of line.measures || []) {
            delete m._col;
            delete m._anchorCol;
            delete m._trailing;
          }
          delete line._anchor_only;
          delete line._words;
          delete line._line;
        }
      }
    }
  }

  unfencedCheck(lines) {
    if (this.diagnostics.some((d) => d.code === "unfenced-music")) return;
    for (const [lineno, text] of lines) {
      if (mdHeading(text) || LIST_ITEM.test(text)) continue;
      const shape = lineShape(text, this.dialect);
      if (shape.scan === null) continue;
      const chords = shape.scan.measures.flatMap((m) => m.items).filter((it) => it.type === "chord" || it.type === "nochord");
      if (shape.kind === "chords" && chords.length) {
        this.diag(
          "unfenced-music",
          lineno,
          "this reads as a line of chords, but it is outside a fence, so it is notes; put the music between ``` lines (or ~~~)",
          text,
        );
        return;
      }
    }
  }

  assemble(part, sung) {
    const shapes = part.shapes;
    const raws = part.raw;
    const out = [];
    let content = false;
    let gap = false;
    let i = 0;
    while (i < shapes.length) {
      const sh = shapes[i];
      const lineno = raws[i][0];
      if (sh.kind === "blank") {
        if (sh.scan !== null && sh.scan.trailing !== null) {
          out.push({ kind: "chart", measures: [], closeBar: null, _anchor_only: sh.scan.trailing });
        }
        gap = true;
        i += 1;
        continue;
      }
      if (gap && content) out.push({ kind: "break" });
      gap = false;
      content = true;
      if (sh.kind === "annotation") {
        out.push({ kind: "annotation", text: sh.body });
        i += 1;
        continue;
      }
      if (!sung) {
        const line = this.chartLine(sh);
        line._line = lineno;
        out.push(line);
        i += 1;
        continue;
      }
      const nxt = i + 1 < shapes.length ? shapes[i + 1] : null;
      const paired = sh.kind === "chords" && nxt !== null && (nxt.kind === "prose" || nxt.kind === "forced");
      if (paired) {
        const line = this.sungLine(sh, nxt);
        line._line = lineno;
        out.push(line);
        i += 2;
      } else if (sh.kind === "prose" || sh.kind === "forced") {
        out.push({ kind: "lyric", text: sh.body, forced: sh.forced });
        i += 1;
      } else {
        const line = this.chartLine(sh);
        line._line = lineno;
        out.push(line);
        i += 1;
      }
    }
    return out;
  }

  chartLine(sh) {
    const scan = sh.scan;
    for (const m of scan.measures) for (const it of m.items) delete it.column;
    const line = { kind: "chart", measures: scan.measures, closeBar: scan.closeBar };
    if (!scan.hasBar) line.run = true;
    if (scan.trailing !== null) line.measures[line.measures.length - 1]._trailing = scan.trailing;
    return line;
  }

  sungLine(sh, nxt) {
    const scan = sh.scan;
    const words = nxt.body;
    const measures = scan.measures;
    for (const m of measures) {
      if ("_col" in m) {
        m.column = m._col;
        delete m._col;
      }
      if ("_anchorCol" in m) {
        m.anchorColumn = m._anchorCol;
        delete m._anchorCol;
      }
    }
    if (scan.trailing !== null) measures[measures.length - 1]._trailing = scan.trailing;
    // The columns as written; `converge` lays the line out once anchors carried
    // in from elsewhere have reached it.
    return { kind: "sung", measures, closeBar: scan.closeBar, forced: nxt.forced, _words: words };
  }

  carryAnchors() {
    let pending = null;
    for (const section of this.sections) {
      for (const part of section.body) {
        if (part.type !== "music") continue;
        const kept = [];
        for (const line of part.lines) {
          if (line.kind === "chart" && "_anchor_only" in line) {
            pending = line._anchor_only;
            continue;
          }
          kept.push(line);
          if (line.kind !== "chart" && line.kind !== "sung") continue;
          for (const m of line.measures) {
            if ("_trailing" in m && !isBar(m)) {
              pending = m._trailing;
              delete m._trailing;
              continue;
            }
            if (!isBar(m)) continue;
            if (pending !== null && !("anchor" in m)) m.anchor = pending;
            pending = null;
            if ("_trailing" in m) {
              pending = m._trailing;
              delete m._trailing;
            }
          }
        }
        part.lines = kept;
      }
    }
  }

  convergeSung() {
    for (const section of this.sections) {
      for (const part of section.body) {
        if (part.type !== "music") continue;
        for (const line of part.lines) {
          if (line.kind === "sung") {
            const w = line._words;
            delete line._words;
            converge(line, w, this.dialect);
          }
        }
      }
    }
  }

  numberBars() {
    let bar = 1;
    for (const section of this.sections) {
      if (section.anchor !== null) bar = section.anchor;
      for (const part of section.body) {
        if (part.type !== "music") continue;
        for (const line of part.lines) {
          if (line.kind !== "chart" || line.run) continue;
          for (const m of line.measures) {
            if (!isBar(m)) continue;
            if ("anchor" in m) bar = m.anchor;
            m.number = bar;
            m.stated = "anchor" in m;
            bar += 1;
          }
        }
      }
    }
  }

  *positions(section) {
    for (let pi = 0; pi < section.body.length; pi += 1) {
      const part = section.body[pi];
      if (part.type !== "music") continue;
      for (let li = 0; li < part.lines.length; li += 1) {
        const line = part.lines[li];
        if (line.kind === "chart" || line.kind === "sung") {
          for (let mi = 0; mi < line.measures.length; mi += 1) {
            const m = line.measures[mi];
            for (let ii = 0; ii < m.items.length; ii += 1) {
              yield [{ part: pi, line: li, measure: mi, item: ii }, m.items[ii], line];
            }
          }
        }
      }
    }
  }

  pairRepeats(section) {
    const seq = [...this.positions(section)];
    let openPos = null;
    let group = null;
    const groups = [];
    const consumed = new Set();
    const key = (pos) => `${pos.part},${pos.line},${pos.measure},${pos.item}`;
    const sameLine = (a, b) => a.part === b.part && a.line === b.line;

    for (let n = 0; n < seq.length; n += 1) {
      const [pos, it, line] = seq[n];
      const t = it.type;
      const lineno = line._line ?? 1;
      if (t === "mark") {
        if (it.open) {
          if (openPos !== null) this.diag("stray-mark", lineno, "an opening mark inside an open repeat group");
          else {
            openPos = pos;
            group = { open: pos, close: null, count: null, endings: [] };
          }
        } else if (openPos === null) {
          this.diag("stray-mark", lineno, "a closing mark with no open repeat group");
        } else {
          group.close = pos;
          if (n + 1 < seq.length) {
            const [npos, nit] = seq[n + 1];
            if (sameLine(npos, pos) && nit.type === "count") {
              group.count = nit.times;
              group.countItem = npos;
              consumed.add(key(npos));
            } else if (sameLine(npos, pos) && nit.type === "ending") {
              group.endings.push({ number: nit.number, at: npos });
              consumed.add(key(npos));
            }
          }
          groups.push(this.finishGroup(group, lineno));
          openPos = null;
          group = null;
        }
      } else if (t === "ending") {
        if (consumed.has(key(pos))) continue;
        if (group !== null && group.close === null) {
          group.endings.push({ number: it.number, at: pos });
          consumed.add(key(pos));
        } else {
          this.diag("ending-outside-group", lineno, `${it.number}. outside a repeat group is not an ending`);
        }
      } else if (t === "count") {
        if (consumed.has(key(pos))) continue;
        const last = n + 1 === seq.length || !sameLine(seq[n + 1][0], pos);
        const hasMarks = seq.some(([p2, i2]) => sameLine(p2, pos) && i2.type === "mark");
        if (last && !hasMarks) line.times = it.times;
        else this.diag("count-out-of-place", lineno, "a count that follows neither a repeat group nor ends a line");
      }
    }
    if (openPos !== null) {
      const lineno = seq.length ? seq[seq.length - 1][2]._line ?? 1 : 1;
      this.diag("unclosed-group", lineno, "a repeat group was opened and never closed");
    }
    section.groups = groups;
    this.demote(section, consumed);
  }

  finishGroup(group, lineno) {
    const endings = group.endings;
    if (endings.length) {
      const numbers = endings.map((e) => e.number);
      const expected = numbers.map((_, i) => i + 1);
      if (numbers.length !== expected.length || numbers.some((v, i) => v !== expected[i])) {
        this.diag("bad-ending-sequence", lineno, `endings must be 1. to n. in order, got [${numbers.join(", ")}]`);
      }
      if (group.count !== null) this.diag("count-with-endings", lineno, "a group with endings takes its count from them");
      group.count = Math.max(...numbers);
    } else if (group.count === null) {
      group.count = 2;
    }
    if (group.countItem === undefined || group.countItem === null) delete group.countItem;
    return group;
  }

  demote(section, consumed) {
    const key = (pos) => `${pos.part},${pos.line},${pos.measure},${pos.item}`;
    for (const [pos, it] of [...this.positions(section)]) {
      if (it.type === "ending" && !consumed.has(key(pos))) {
        const text = `${it.number}.`;
        const kept = {};
        for (const k of ["column", "words"]) if (k in it) kept[k] = it[k];
        for (const k of Object.keys(it)) delete it[k];
        it.type = "unknown";
        it.text = text;
        Object.assign(it, kept);
      }
    }
  }

  checkRepeatSigns() {
    let previous = null;
    for (const section of this.sections) {
      for (const part of section.body) {
        if (part.type !== "music") continue;
        for (const line of part.lines) {
          if (line.kind !== "chart" && line.kind !== "sung") continue;
          for (const m of line.measures) {
            const kinds = m.items
              .filter((it) => it.type === "chord" || it.type === "nochord" || it.type === "repeat" || it.type === "unknown")
              .map((it) => it.type);
            if (kinds.includes("repeat")) {
              if (previous === null) this.diag("repeat-without-previous", line._line ?? 1, "a % with no measure before it");
              if (kinds.length > 1) this.diag("repeat-beside-items", line._line ?? 1, "a % beside other items has no defined meaning");
            }
            previous = m;
          }
        }
      }
    }
  }

  result() {
    this.diagnostics.sort((a, b) => a.line - b.line);
    for (const b of this.blocks) {
      b.voicings.sort((x, y) => {
        if (x.symbol < y.symbol) return -1;
        if (x.symbol > y.symbol) return 1;
        return x.index - y.index;
      });
    }
    const order = [];
    for (const b of this.blocks) if (!order.includes(b.tuning.id)) order.push(b.tuning.id);
    const indexed = this.blocks.map((b, idx) => [idx, b]);
    indexed.sort((A, B) => {
      const a = A[1];
      const b = B[1];
      const oa = order.indexOf(a.tuning.id);
      const ob = order.indexOf(b.tuning.id);
      if (oa !== ob) return oa - ob;
      const la = a.label !== "" ? 1 : 0;
      const lb = b.label !== "" ? 1 : 0;
      if (la !== lb) return la - lb;
      return A[0] - B[0];
    });
    this.blocks = indexed.map(([, b]) => b);
    return {
      title: this.title,
      properties: this.properties,
      sections: this.sections,
      blocks: this.blocks,
      sung: this.sung,
      sungAt: this.sungAt,
      diagnostics: this.diagnostics,
    };
  }
}

// Strip a trailing bar anchor and/or count from a heading, in either order
// (§1.7.4).
function takeAnchor(name) {
  let anchor = null;
  let times = null;
  while (true) {
    let m = HEADING_ANCHOR.exec(name);
    if (m && anchor === null) {
      anchor = parseInt(m[1], 10);
      name = stripSpaces(name.slice(0, m.index));
      continue;
    }
    m = HEADING_COUNT.exec(name);
    if (m && times === null && m.index > 0) {
      times = countTimes(COUNT.exec(m[1]));
      name = stripSpaces(name.slice(0, m.index));
      continue;
    }
    break;
  }
  return [name, anchor, times];
}

// Every word is a chart item that is not an unknown token (§1.7.3).
export function isChordRun(text, dialect) {
  const words = text
    .replace(/\|/g, " ")
    .split(" ")
    .filter((w) => w)
    .map((w) => stripTrailingPunct(w));
  for (const w of words) {
    if (!w || BAR_ANCHOR.test(w) || COUNT.test(w)) continue;
    const [, core] = splitMarks(w);
    if (!core) continue;
    if (classifyCore(core, dialect).type === "unknown") return false;
  }
  return true;
}

// Read a cifra.md document into its model (schema/cifra.schema.json).
export function parse(bytes, dialect = null) {
  return new Parser(bytes, dialect).run();
}
