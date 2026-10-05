// Chord-line tokens and the layout of sung lines (spec §8.5.4, §4.5). A port of
// the reading half of the reference's reference/cifra_md/layout.py — never
// imported from it: agreement is by the corpus, not shared code (DIRECTION
// §3.6). The layout is one function, `converge`, used by the reader now and by
// the canonical writer later: given a sung line's tokens with their columns as
// written and its line of words as written, it works out what each token is
// attached to and lays the line out canonically, pushing the words, never a
// chord. The reader records its result in the model.
//
// The writer's per-line rendering functions (chartLineText, sungText,
// chordText, lyricText) are model→text and live here too (added by
// cifra_js.writer), beside the reader's `converge`, so that one token model
// (`lineTokens`, `itemText`, placement, padding, division) both lays a sung
// line out and prints it — which is what makes reading a document and reading
// its canonical form give the same sung lines (§8.4.5). The document-level
// serialiser (§8.4.1–§8.4.3, §8.4.6), the §8.3 invariants and the
// marked-text refusal are cifra_js.writer's `write.js`.
//
// Framework-free and zero runtime dependencies (DIRECTION §3.7): only regular
// expressions and plain objects, standing on parse.js (the chart grammar and
// line shapes) and chord.js (the default dialect). It knows nothing of React,
// storage, the network or logging.

import { DEFAULT_DIALECT } from "./chord.js";
import {
  ANNOTATION,
  BRACKET_HEADING,
  LABEL_HEADING,
  LYRIC_MARKER,
  isChordRun,
  lineShape,
  substantive,
} from "./parse.js";

function isDigits(text) {
  return text.length > 0 && /^[0-9]+$/.test(text);
}

// --- item text ---------------------------------------------------------------

export function itemText(it) {
  const t = it.type;
  if (t === "chord") return it.key;
  if (t === "repeat") return "%";
  if (t === "nochord") return "N.C.";
  if (t === "beat") return it.mark;
  if (t === "mark") return it.notation === "bracket" ? (it.open ? "(" : ")") : ":";
  if (t === "count") return `x${it.times}`;
  if (t === "ending") return `${it.number}.`;
  if (t === "unknown") return it.text;
  return "";
}

function isOpenBar(it) {
  return it.type === "mark" && it.notation === "barline" && it.open;
}

function isCloseBar(it) {
  return it.type === "mark" && it.notation === "barline" && !it.open;
}

// --- chord line tokens -------------------------------------------------------

// A chord line as a sequence of bar, anchor and item tokens, in writing order
// (§8.5.4).
export function lineTokens(line, sung = false) {
  const toks = [];
  const ms = line.measures;
  const n = ms.length;
  let pendingClose = null;

  const bar = (open_ = null, close = null) => ({ kind: "bar", bar: "|", close, open: open_, measure: null });

  for (let i = 0; i < n; i += 1) {
    const m = ms[i];
    const items = m.items.filter((it) => it.type !== "lead");
    const start = toks.length;
    const anchor = "anchor" in m ? { kind: "anchor", text: `@${m.anchor}`, measure: m } : null;
    if (i > 0) {
      toks.push(bar(null, pendingClose));
      pendingClose = null;
    }
    const subst = [];
    for (let j = 0; j < items.length; j += 1) if (substantive(items[j])) subst.push(j);
    const first = subst.length ? subst[0] : null;
    for (let j = 0; j < items.length; j += 1) {
      const it = items[j];
      const mine = toks.slice(start);
      if (j === first) {
        let bars = mine.filter((t) => t.kind === "bar");
        if (m.bar !== null) {
          if (!bars.length) {
            toks.push(bar());
            bars = [toks[toks.length - 1]];
          }
          bars[bars.length - 1].bar = m.bar;
          bars[bars.length - 1].measure = m;
        }
        if (anchor !== null && !sung) toks.push(anchor);
      }
      const last = toks.length > start ? toks[toks.length - 1] : null;
      if (isOpenBar(it)) {
        if (last !== null && last.kind === "bar" && last.open === null) last.open = it;
        else toks.push(bar(it));
      } else if (isCloseBar(it)) {
        if (j === items.length - 1 && i + 1 < n) pendingClose = it;
        else toks.push(bar(null, it));
      } else {
        toks.push({ kind: "item", item: it, text: itemText(it) });
      }
    }
    if (anchor !== null && sung && subst.length) {
      toks.splice(anchorSlot(toks, start, "anchorColumn" in m ? m.anchorColumn : null), 0, anchor);
    }
  }
  const closeBar = line.closeBar;
  if (closeBar !== null) {
    let lastBar = null;
    for (let x = 0; x < toks.length; x += 1) if (toks[x].kind === "bar") lastBar = x;
    if (
      lastBar !== null &&
      toks[lastBar].measure === null &&
      !toks.slice(lastBar + 1).some((t) => t.kind === "item" && substantive(t.item))
    ) {
      toks[lastBar].bar = closeBar;
    } else {
      toks.push(bar());
      toks[toks.length - 1].bar = closeBar;
    }
  }
  return toks;
}

// Where a sung measure's anchor goes among the measure's tokens (§8.5.4 step 5).
function anchorSlot(toks, start, column) {
  const made = [];
  for (let x = start; x < toks.length; x += 1) {
    if (toks[x].kind === "item" && substantive(toks[x].item)) made.push(x);
  }
  if (column === null || column === undefined) return made[made.length - 1] + 1;
  let lo = made[0];
  while (lo > start && toks[lo - 1].kind !== "bar") lo -= 1;
  let hi = made[made.length - 1] + 1;
  while (hi < toks.length && toks[hi].kind !== "bar") hi += 1;
  for (let x = lo; x < hi; x += 1) {
    const want = desired(toks[x]);
    if (want !== null && want !== undefined && want > column) return x;
  }
  return hi;
}

function tokenText(t) {
  if (t.kind === "bar") return (t.close ? ":" : "") + t.bar + (t.open ? ":" : "");
  return t.text;
}

const GUARD = ",";

function misread(text, dialect) {
  const bm = BRACKET_HEADING.exec(text);
  if (bm && bm[2] && !isDigits(bm[2])) return true;
  const lm = LABEL_HEADING.exec(text);
  if (lm && lm[2] && isChordRun(lm[3], dialect)) return true;
  return ANNOTATION.test(text) || LYRIC_MARKER.test(text);
}

// --- sung lines --------------------------------------------------------------

function desired(t) {
  if (t.kind === "item") return t.item.column ?? null;
  if (t.kind === "anchor") return t.measure.anchorColumn ?? null;
  if (t.kind === "bar") {
    if (t.close !== null && "column" in t.close) return t.close.column;
    if (t.measure !== null && "column" in t.measure) return t.measure.column;
    if (t.open !== null && "column" in t.open) return Math.max(t.open.column - t.bar.length, 0);
  }
  return null;
}

function isBracket(t, open_) {
  if (t.kind !== "item") return false;
  const it = t.item;
  return it.type === "mark" && it.notation === "bracket" && it.open === open_;
}

// Two tokens may be written with no space between them only where one is a bar
// line, or an anchor against a bar line or a bracket (§8.5.5).
function mayTouch(prev, t) {
  if (t.kind === "anchor") return prev.kind === "bar" || isBracket(prev, true);
  if (prev.kind === "anchor") return t.kind === "bar" || (isBracket(t, false) && !prev.after_open);
  if (prev.kind === "bar" && t.kind === "item") return !t.text.startsWith(":");
  if (prev.kind === "item" && t.kind === "bar") return !prev.text.endsWith(":");
  return false;
}

// --- the words: padding and attachment (§4.5) --------------------------------

const PAD = "_";

// The words of a sung line without their padding, and where each column of the
// line as written lands in them (§4.5.2).
export function unpad(text) {
  const pad = new Array(text.length).fill(false);
  for (const m of text.matchAll(/_+/g)) {
    const s = m.index;
    const e = m.index + m[0].length;
    if (s > 0 && e < text.length && text[s - 1] !== " " && text[e] !== " ") {
      for (let k = s; k < e; k += 1) pad[k] = true;
    }
  }
  const index = [];
  const kept = [];
  for (let k = 0; k < text.length; k += 1) {
    index.push(kept.length);
    if (!pad[k]) kept.push(text[k]);
  }
  const words = kept.join("");

  const ref = (column) => (column < text.length ? index[column] : words.length + column - text.length);

  return [words, ref];
}

// The character that pads before `words[at]`: `_` inside a word, a space
// otherwise.
function padding(words, at) {
  if (at > 0 && words[at - 1] !== " " && words[at - 1] !== "_" && words[at] !== " " && words[at] !== "_") {
    return PAD;
  }
  return " ";
}

// The words with the padding inserted, and which columns are `_` padding.
function pushed(words, inserts) {
  const out = [];
  const mask = [];
  let k = 0;
  for (const [at, nn] of inserts) {
    out.push(words.slice(k, at));
    for (let x = 0; x < at - k; x += 1) mask.push(false);
    const ch = padding(words, at);
    out.push(ch.repeat(nn));
    for (let x = 0; x < nn; x += 1) mask.push(ch === PAD);
    k = at;
  }
  out.push(words.slice(k));
  for (let x = 0; x < words.length - k; x += 1) mask.push(false);
  return [out.join(""), mask];
}

function attachedTok(t) {
  return t.kind === "item" && substantive(t.item);
}

// --- the layout (§4.5.3) -----------------------------------------------------

// Place the tokens left to right, each in "at"; return the padding to insert
// into the words, as (index, width) pairs in increasing index.
function place(toks, words, ref) {
  const inserts = [];
  let total = 0;
  let end = 0;
  let prev = null;
  let shift = 0;
  let floor = -1;

  const current = (p) => p + inserts.filter(([q]) => q <= p).reduce((s, [, nn]) => s + nn, 0);

  for (const t of toks) {
    const written = t.kind === "guard" ? 0 : desired(t);
    const isAttached = attachedTok(t) && written !== null && written !== undefined;
    let want;
    let p;
    if (isAttached) {
      p = ref(written);
      want = current(p);
    } else {
      want = written === null || written === undefined ? null : written + (t.kind === "guard" ? 0 : shift);
    }
    let at;
    if (prev === null) {
      at = want !== null && want !== undefined && want >= 0 ? want : 0;
    } else if (want !== null && want !== undefined && (want > end || (want === end && mayTouch(prev, t)))) {
      at = want;
    } else {
      at = end + 1;
    }
    if (isAttached) {
      let q;
      if (at > want && floor < p && p < words.length) {
        inserts.push([p, at - want]);
        total += at - want;
        q = p;
      } else if (at === want) {
        q = p;
      } else {
        q = at - total;
      }
      floor = Math.max(floor, q);
      shift = at - written;
    }
    t.at = at;
    if (t.kind === "anchor") {
      t.after_open = prev !== null && at === end && isBracket(prev, true);
    }
    end = at + tokenText(t).length;
    prev = t;
  }
  return inserts;
}

function render(toks) {
  let out = "";
  for (const t of toks) {
    out += " ".repeat(Math.max(t.at - out.length, 0)) + tokenText(t);
  }
  return out;
}

// Would a reader take this line, not forced, for a line of words again?
function readsAsWords(text, dialect) {
  if (misread(text, dialect)) return false;
  return lineShape(text, dialect).kind === "prose";
}

// Lay a sung line out (§4.5.3) and record the result in the model.
export function converge(line, text, dialect = DEFAULT_DIALECT) {
  text = text.replace(/ +$/, "");
  for (const m of line.measures) m.items = m.items.filter((it) => it.type !== "lead");
  const [words, ref] = unpad(text);
  let toks = lineTokens(line, true);
  let inserts = place(toks, words, ref);
  if (misread(render(toks), dialect)) {
    // As on a chart line, a `,` at column 0 keeps the line a chord line.
    toks = [{ kind: "guard", text: GUARD }, ...lineTokens(line, true)];
    inserts = place(toks, words, ref);
  }
  let [laid, mask] = pushed(words, inserts);
  let shift = 0;
  if (!line.forced && !readsAsWords(laid, dialect)) {
    // Padded, the words would no longer read as words: they are forced, with the
    // line moved right by one when its first column is not free.
    line.forced = true;
    if (!laid.startsWith(" ")) {
      laid = " " + laid;
      mask = [false, ...mask];
      shift = 1;
    }
  }
  for (const t of toks) {
    const x = t.at + shift;
    if (t.kind === "item") {
      t.item.column = x;
    } else if (t.kind === "bar") {
      let xx = x;
      if (t.close !== null) {
        t.close.column = xx;
        xx += 1;
      }
      if (t.measure !== null) t.measure.column = xx;
      if (t.open !== null) t.open.column = xx + t.bar.length;
    } else if (t.kind === "anchor") {
      t.measure.anchorColumn = x;
    }
  }
  divide(line, laid, mask);
  for (const m of line.measures) {
    // Keys in one order, however the measure came by its columns.
    const order = ["bar", "items", "column", "anchor", "anchorColumn"];
    const kept = {};
    for (const k of order) {
      if (k in m) {
        kept[k] = m[k];
        delete m[k];
      }
    }
    const rest = { ...m };
    for (const k of Object.keys(m)) delete m[k];
    Object.assign(m, kept, rest);
  }
}

// Each item that makes a measure takes the words from its column to the next
// such item's (§4.4), padding left out; words before the first are the lead
// item's, unless they are all spaces.
function divide(line, laid, mask) {
  const segment = (a, b) => {
    let s = "";
    const hi = Math.min(b, laid.length);
    for (let k = a; k < hi; k += 1) if (!mask[k]) s += laid[k];
    return s;
  };

  const items = line.measures.flatMap((m) => m.items);
  const attached = items.filter((it) => substantive(it)).sort((a, b) => a.column - b.column);
  for (const it of items) delete it.words;
  for (let k = 0; k < attached.length; k += 1) {
    const it = attached[k];
    const end = k + 1 < attached.length ? attached[k + 1].column : laid.length;
    it.words = it.column < laid.length ? segment(it.column, end) : "";
  }
  const lead = segment(0, attached.length ? attached[0].column : laid.length);
  if (lead.replace(/^ +/, "").replace(/ +$/, "")) {
    line.measures[0].items.unshift({ type: "lead", column: 0, words: lead });
  }
}

// --- printing a chord line and a sung line (§8.4.4, §8.4.5) ------------------
// A port of the reference's layout.py writer half (chart_line_text, lyric_text,
// chord_text, sung_text) — matched to the corpus, never shared code.

// A chord line that is not sung (§8.4.4): its tokens joined by single spaces. A
// line whose first word would make a reader take it for a heading, an
// annotation or words is written after a `,`, which a reader drops.
export function chartLineText(line, dialect = DEFAULT_DIALECT) {
  let text = lineTokens(line).map(tokenText).join(" ");
  if (misread(text, dialect)) text = GUARD + " " + text;
  return text;
}

// The line of words of a sung line (§8.4.5), printed from the model: each item's
// words at its column, a gap inside the words filled with `_`, the gap before
// words that begin the line with spaces. A forced line is printed here with a
// space for its marker; sungText restores the `>`.
export function lyricText(line) {
  const items = line.measures.flatMap((m) => m.items);
  const lead = (items.find((it) => it.type === "lead") || {}).words ?? "";
  const attached = items
    .filter((it) => it.type !== "lead" && substantive(it) && "column" in it)
    .sort((a, b) => a.column - b.column);
  let text = lead;
  for (const it of attached) {
    const w = it.words ?? "";
    if (w && text.length < it.column) {
      const ch = /[^ ]/.test(text) ? PAD : " ";
      text += ch.repeat(it.column - text.length);
    }
    text += w;
  }
  return text;
}

// The chord line of a sung line (§8.4.5), printed from the model: every token at
// its column; one with none (the closing bar line) one space after the token
// before it. A line that would be misread gets the `,` guard at column 0, which
// the layout has left free.
export function chordText(line, dialect = DEFAULT_DIALECT) {
  const toks = lineTokens(line, true);
  let end = 0;
  for (let k = 0; k < toks.length; k += 1) {
    const t = toks[k];
    const want = desired(t);
    t.at =
      want !== null && want !== undefined && (k === 0 || want >= end)
        ? want
        : k === 0
          ? 0
          : end + 1;
    end = t.at + tokenText(t).length;
  }
  let text = render(toks);
  if (misread(text, dialect)) {
    text = text.slice(0, 2) === "  " ? GUARD + text.slice(1) : GUARD + " " + text;
  }
  return text;
}

// The two lines of a sung line (§8.4.5): the chord line, then the words line
// with its `>` restored when the line is forced.
export function sungText(line, dialect = DEFAULT_DIALECT) {
  let lyric = lyricText(line);
  if (line.forced) lyric = ">" + lyric.slice(1);
  return [chordText(line, dialect), lyric];
}
