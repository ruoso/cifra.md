// The canonical writer (spec §8): a document model back to its one canonical
// text. A port of the reference's reference/cifra_md/write.py (and the writer
// half of layout.py, which lives in layout.js) — never imported from it:
// agreement with the reference is by the corpus, byte for byte, not by shared
// code (DIRECTION §3.6).
//
// `write(model)` is `serialize(canonical(model))` with the marked-text refusal
// (§8.1). `canonical` applies everything canonicalisation changes in the model
// (§8.2): it drops what the canonical form does not keep, applies the footnote
// invariants (§8.3, in the order I1 → I3 → I2) and lays out every sung line
// again (§4.5), so that `serialize` only has to print (§8.4). The canonical
// form is unique, a fixed point, and holds no marker line; nothing in it is
// left to a writer's choice (§8.1).
//
// Framework-free and zero runtime dependencies (DIRECTION §3.7): only regular
// expressions, plain objects/arrays and language built-ins, standing on the
// sibling js/src/ modules. It knows nothing of React, storage, the network or
// logging; the app's save path — which decides when to save and surfaces
// MarkedTextError — is the Worker's.

import { DEFAULT_DIALECT, DIALECTS } from "./chord.js";
import { formatFingers, formatFrets } from "./frets.js";
import { chartLineText, converge, lyricText, sungText } from "./layout.js";
import { COUNT, asciiLower, isChordRun, keyFor, parse, rederive } from "./parse.js";
import { NotUtf8Error, decode, markerLines, prepare } from "./text.js";

// A closing `#` sequence of a heading (§1.7.1): at the end, alone or after a
// space. A heading whose text would end in one gets a closing ` #` of its own,
// so that it reads back (mirrors parse.js's reader-side CLOSING_SEQUENCE).
const CLOSING_SEQUENCE = /(?:^| )#+$/;

// Strip only U+0020 from both ends — never other Unicode whitespace.
function stripSpaces(text) {
  return text.replace(/^ +/, "").replace(/ +$/, "");
}

// A stable deep copy that preserves object key order (the model is plain JSON:
// objects, arrays, strings, numbers, booleans and null). `canonical` works on a
// copy so it never mutates its caller's model.
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// --- the canonical model ----------------------------------------------------

// The dialect a document resolves to (§1.4.3), for the §4.5 re-layout's misread
// check only — the writer copies each chord's symbol as written and never
// re-spells (§8.4.4; cifra_js.chords refinement §Decisions).
function dialectOf(doc) {
  for (const p of doc.properties || []) {
    if (p.key === "notation") {
      const d = asciiLower(stripSpaces(p.value));
      return d in DIALECTS ? d : DEFAULT_DIALECT;
    }
  }
  return DEFAULT_DIALECT;
}

// Every chart item of a document, in document order.
function allItems(doc) {
  const out = [];
  for (const s of doc.sections) {
    for (const part of s.body) {
      if (part.type !== "music") continue;
      for (const line of part.lines) {
        for (const m of line.measures || []) out.push(...m.items);
      }
    }
  }
  return out;
}

function chordItems(doc) {
  return allItems(doc).filter((it) => it.type === "chord");
}

function arrEq(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

// Two voicing entries are the same shape when their frets and their fingerings
// agree (§8.3 I3); a missing fingering counts as null.
function sameShape(a, b) {
  return arrEq(a.frets, b.frets) && arrEq(a.fingers ?? null, b.fingers ?? null);
}

// I1, I3 and I2 of §8.3, in that order, on the model in place. The chart tokens
// and the block keys are rewritten in one pass, so no chart token is left
// naming an index no block was rewritten for (I5).
export function footnotes(doc) {
  const used = {}; // symbol -> the indices the chart uses, in first-use order
  const unknown = new Set(allItems(doc).filter((it) => it.type === "unknown").map((it) => it.text));
  for (const it of chordItems(doc)) {
    if (!(it.symbol in used)) used[it.symbol] = [];
    if (!used[it.symbol].includes(it.index)) used[it.symbol].push(it.index);
  }
  // I1: keys the chart does not use are dropped from every block (a key an
  // unknown token uses is kept).
  for (const b of doc.blocks) {
    b.voicings = b.voicings.filter((e) => (used[e.symbol] || []).includes(e.index) || unknown.has(e.key));
  }
  for (const symbol of Object.keys(used)) {
    const indices = [...used[symbol]].sort((a, b) => a - b);
    const shapes = doc.blocks.map((b) => {
      const map = {};
      for (const e of b.voicings) if (e.symbol === symbol) map[e.index] = e;
      return map;
    });

    const same = (i, j) => {
      let both = false;
      for (const sh of shapes) {
        const a = sh[i];
        const c = sh[j];
        if (a === undefined && c === undefined) continue;
        if (a === undefined || c === undefined || !sameShape(a, c)) return false;
        both = true;
      }
      return both;
    };

    // I3: an index that no block tells apart from a lower one joins the lowest
    // such.
    const rep = {};
    for (const i of indices) {
      let r = i;
      for (const cand of indices) {
        if (cand < i && rep[cand] === cand && same(cand, i)) {
          r = cand;
          break;
        }
      }
      rep[i] = r;
    }
    // I2: the indices that remain become 1 to n, in order.
    const survivors = [...new Set(indices.map((i) => rep[i]))].sort((a, b) => a - b);
    const neu = {};
    for (const i of indices) neu[i] = survivors.indexOf(rep[i]) + 1;
    for (const it of chordItems(doc)) {
      if (it.symbol === symbol) {
        it.index = neu[it.index];
        it.key = keyFor(symbol, it.index);
      }
    }
    for (const b of doc.blocks) {
      const kept = [];
      for (const e of b.voicings) {
        if (e.symbol === symbol) {
          if (rep[e.index] !== e.index) continue;
          e.index = neu[e.index];
          e.key = keyFor(symbol, e.index);
        }
        kept.push(e);
      }
      b.voicings = kept;
    }
  }
}

function collapseBlankRuns(text) {
  const out = [];
  for (const ln of text.split("\n")) {
    if (ln === "" && out.length && out[out.length - 1] === "") continue;
    out.push(ln);
  }
  return out.join("\n");
}

// The model of the document's canonical form: what a reader gets back from
// `serialize(canonical(doc))`, derived fields included. `sungAt` and
// `diagnostics` are left as they were — they describe a text, not a model (§8.1
// lines 27–29; cifra_js.writer refinement §Decisions).
export function canonical(doc) {
  doc = clone(doc);
  const dialect = dialectOf(doc);
  if (doc.title === "") doc.title = null;
  for (const b of doc.blocks) {
    for (const e of b.voicings) {
      if ("fingers" in e && e.fingers.every((f) => f === null)) delete e.fingers;
    }
  }
  footnotes(doc);
  for (const b of doc.blocks) {
    // The same order the reader records, so the canonical model is byte-for-byte
    // the model a reader builds from the canonical text (the serialiser sorts
    // the written items by code point, §8.4.6).
    b.voicings.sort((x, y) => {
      if (x.symbol < y.symbol) return -1;
      if (x.symbol > y.symbol) return 1;
      return x.index - y.index;
    });
  }
  for (const s of doc.sections) {
    for (const part of s.body) {
      if (part.type === "notes") part.text = collapseBlankRuns(part.text);
      if (part.type !== "music") continue;
      for (const line of part.lines) {
        // The layout again, for tokens whose width §8.3 changed (§4.5).
        if (line.kind === "sung") converge(line, lyricText(line), dialect);
      }
    }
  }
  rederive(doc, dialect);
  return doc;
}

// --- printing ---------------------------------------------------------------

// A fence around lines, long enough that none of them closes it (§8.4.3). The
// character is a backtick unless the info string holds one, then a tilde.
// Exported for the merge (merge.js), which writes a marked text through the same
// §8.4 serialiser helpers (the reference's write.py exports these likewise).
export function fence(lines, info = "") {
  const char = info.includes("`") ? "~" : "`";
  const re = new RegExp("^ {0,3}(" + char + "+)");
  let longest = 0;
  for (const ln of lines) {
    const m = re.exec(ln);
    if (m) longest = Math.max(longest, m[1].length);
  }
  const marker = char.repeat(Math.max(3, longest + 1));
  return [marker + info, ...lines, marker];
}

// The text of a music part's lines (§8.4.4/§8.4.5), line by line.
export function musicLines(lines, dialect = DEFAULT_DIALECT) {
  const out = [];
  for (const line of lines) {
    const k = line.kind;
    if (k === "chart") out.push(chartLineText(line, dialect));
    else if (k === "sung") out.push(...sungText(line, dialect));
    else if (k === "lyric") out.push(line.forced ? ">" + line.text.slice(1) : line.text);
    else if (k === "break") out.push("");
    else if (k === "annotation") out.push(line.text ? "// " + line.text : "//");
  }
  return out;
}

// A Markdown heading (§8.4.3). A text that ends in what a reader would take for
// a closing sequence gets a closing ` #` of its own, so that it reads back.
export function headingLine(level, text) {
  if (CLOSING_SEQUENCE.test(text)) text += " #";
  return "#".repeat(level) + (text ? " " + text : "");
}

// A section's heading text with its ` @` anchor and ` x` count, in that order
// (§8.4.3).
export function headingName(section) {
  let name = section.name;
  if (section.anchor !== null && section.anchor !== undefined) name = stripSpaces(`${name} @${section.anchor}`);
  if (section.times !== null && section.times !== undefined) name = stripSpaces(`${name} x${section.times}`);
  return name;
}

// The chart's blocks, section by section (§8.4.3): a markdown heading and its
// first part, or a bracket/label heading written into a music fence that stays
// open across the sections that continue it (the cifra conventions, §8.4.3).
export function chartBlocks(sections, dialect) {
  const blocks = [];
  let openFence = null; // the music fence a cifra heading continues

  const flush = () => {
    if (openFence !== null) {
      blocks.push(fence(openFence));
      openFence = null;
    }
  };

  const partLines = (part) => {
    if (part.type === "notes") return part.text.split("\n");
    if (part.type === "verbatim") return fence(part.text.split("\n"), part.info);
    return fence(musicLines(part.lines, dialect));
  };

  for (const s of sections) {
    if (s.heading === "bracket" || s.heading === "label") {
      let head = s.heading === "bracket" ? `[${headingName(s)}]` : `${s.name}:`;
      const firstMusic = s.body.length && s.body[0].type === "music" ? s.body[0].lines : [];
      let joined = false;
      if (firstMusic.length && firstMusic[0].kind === "chart") {
        const text = chartLineText(firstMusic[0], dialect);
        if (s.heading === "bracket" && !COUNT.test(text)) {
          head = `${head} ${text}`;
          joined = true;
        } else if (s.heading === "label" && isChordRun(text, dialect)) {
          head = `${head} ${text}`;
          joined = true;
        }
      }
      openFence = openFence === null ? [head] : [...openFence, "", head];
      for (let idx = 0; idx < s.body.length; idx += 1) {
        const part = s.body[idx];
        if (part.type === "music" && idx === 0) {
          openFence.push(...musicLines(joined ? part.lines.slice(1) : part.lines, dialect));
        } else if (part.type === "music" && part.lines.length) {
          flush();
          openFence = musicLines(part.lines, dialect);
        } else {
          flush();
          blocks.push(partLines(part));
        }
      }
      continue;
    }
    flush();
    let parts = s.body.map((p) => partLines(p));
    if (s.heading === "markdown") {
      const head = headingLine(2, headingName(s));
      if (parts.length) parts[0] = [head, ...parts[0]];
      else parts = [[head]];
    }
    blocks.push(...parts);
  }
  flush();
  return blocks;
}

// Compare two symbols by Unicode code point, not UTF-16 code unit (§8.4.6 lines
// 409–412): `[...s]` iterates whole code points, so a supplementary-plane
// symbol sorts by its scalar value.
function cmpCodePoints(a, b) {
  const ca = [...a];
  const cb = [...b];
  const n = Math.min(ca.length, cb.length);
  for (let k = 0; k < n; k += 1) {
    const d = ca[k].codePointAt(0) - cb[k].codePointAt(0);
    if (d !== 0) return d;
  }
  return ca.length - cb.length;
}

// The voicings part (§8.4.6): one block per heading, blocks ordered by first
// tuning then by whether they are labelled (the default `Voicings` first) then
// by their order in the model; each block's items ordered by symbol (by code
// point) then index.
function voicingBlocks(blocks) {
  const order = [];
  for (const b of blocks) if (!order.includes(b.tuning.id)) order.push(b.tuning.id);
  const indexed = blocks.map((b, i) => [b, i]);
  indexed.sort((A, B) => {
    const oa = order.indexOf(A[0].tuning.id);
    const ob = order.indexOf(B[0].tuning.id);
    if (oa !== ob) return oa - ob;
    const la = A[0].label !== "" ? 1 : 0;
    const lb = B[0].label !== "" ? 1 : 0;
    if (la !== lb) return la - lb;
    return A[1] - B[1];
  });
  const out = [];
  for (const [b] of indexed) {
    const lines = [`## ${b.label || "Voicings"}: ${b.tuning.text}`];
    const voicings = [...b.voicings].sort((x, y) => {
      const c = cmpCodePoints(x.symbol, y.symbol);
      return c !== 0 ? c : x.index - y.index;
    });
    for (const e of voicings) {
      let item = `- ${e.key}: ${formatFrets(e.frets)}`;
      if (e.fingers && e.fingers.length) item += ` (${formatFingers(e.fingers)})`;
      lines.push(item);
    }
    lines.push(...b.notes);
    out.push(lines);
  }
  return out;
}

// Print a model that is already canonical (§8.4.1–§8.4.6). `write` is what
// callers want; this assumes §8.3 has been applied. Blocks are separated by
// exactly one blank line, and the empty document is the zero-byte file.
export function serialize(doc) {
  const blocks = [];
  const meta = [];
  if (doc.title) meta.push(headingLine(1, doc.title));
  for (const p of doc.properties || []) {
    meta.push(p.value ? `- ${p.key}: ${p.value}` : `- ${p.key}:`);
  }
  if (meta.length) blocks.push(meta);
  blocks.push(...chartBlocks(doc.sections, dialectOf(doc)));
  const voicings = voicingBlocks(doc.blocks || []);
  if (voicings.length) {
    blocks.push(["---"]);
    blocks.push(...voicings);
  }
  if (!blocks.length) return "";
  return blocks.map((b) => b.join("\n")).join("\n\n") + "\n";
}

// The text holds a marker line (§11.12.3): a merge waiting for someone, which a
// writer refuses to save. `line` is the first marker line's number in the text
// that would have been written, `text` that line (§8.1 lines 30–33).
export class MarkedTextError extends Error {
  constructor(line, text) {
    super(`line ${line} is a conflict marker (${JSON.stringify(text)}): resolve the merge before saving`);
    this.name = "MarkedTextError";
    this.line = line;
    this.text = text;
  }
}

// Throw MarkedTextError at the first marker line of a text (§11.12.3).
export function checkUnmarked(text) {
  const found = markerLines(text);
  if (found.length) {
    throw new MarkedTextError(found[0], prepare(text)[found[0] - 1]);
  }
}

// The canonical text of a document model (§8). A model whose text would hold a
// marker line is refused with MarkedTextError (§8.1, §11.12.3). This is what the
// app's save path calls.
export function write(doc) {
  const text = serialize(canonical(doc));
  checkUnmarked(text);
  return text;
}

// Is the text a document in canonical form (§8.1)? A writer checks by
// canonicalising and comparing (§9.1). A text that is not UTF-8 is not a
// document, and a marked text is never canonical. Accepts a string or bytes.
export function isCanonical(text) {
  let str = text;
  if (typeof str !== "string") {
    try {
      str = decode(str);
    } catch {
      return false;
    }
  }
  if (markerLines(str).length) return false;
  try {
    return write(parse(str)) === str;
  } catch (e) {
    if (e instanceof MarkedTextError || e instanceof NotUtf8Error) return false;
    throw e;
  }
}
