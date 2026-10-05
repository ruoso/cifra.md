// The three-way merge of songs and setlists (spec §11). A port of the
// reference's reference/cifra_md/merge.py — never imported from it: agreement
// with the reference is by the corpus, byte for byte, not by shared code
// (DIRECTION §3.6).
//
// `merge(base, ours, theirs, { setlist }) -> Outcome`: each input is bytes, a
// string, or null when absent. The outcome holds a `result`, or `deleted`, or
// `conflicts` with, unless the only conflict is about the whole file or a marked
// input, a `marked` text. `conflictsJson(outcome)` gives the JSON of §11.12.5,
// `mergeOutputs(outcome, { setlist })` the corpus file map, and
// `resolveMarked(text, side)` resolves a marked text by one side (§11.12.4).
//
// Framework-free and zero runtime dependencies (DIRECTION §3.7): only other
// js/src/ modules and language built-ins. The merge is a pure function of three
// byte strings — it knows nothing of React, git, storage, the network or
// logging; the save path and the Worker that call it are elsewhere.

import { DEFAULT_DIALECT, DIALECTS, parseChord } from "./chord.js";
import { formatFingers, formatFrets } from "./frets.js";
import { chartLineText, converge, lyricText } from "./layout.js";
import { CHORD_TOKEN, COUNT, asciiLower, isChordRun, keyFor, parse } from "./parse.js";
import { NotUtf8Error, decode, markerLines } from "./text.js";
import {
  canonical,
  chartBlocks,
  fence,
  headingLine,
  headingName,
  musicLines,
  serialize,
} from "./write.js";

export const OURS = "ours";
export const THEIRS = "theirs";
export const SIDES = [OURS, THEIRS];

export function other(side) {
  return side === OURS ? THEIRS : OURS;
}

// The conflict sentinel, mirroring the reference's CONFLICT singleton (a value a
// merged value takes when the two sides disagree and neither matches base).
export const CONFLICT = { toString: () => "CONFLICT" };

// --- Python-shaped helpers ----------------------------------------------------
//
// The reference leans on Python tuples as hashable keys, structural `==`, and
// `id()`-keyed dicts. These helpers reproduce that behaviour exactly so the port
// is a translation, not a redesign: `hkey` is a deterministic structural hash
// (JSON over arrays of strings, numbers, booleans and null — never objects), and
// `cmp` is Python's lexicographic comparison (booleans as 0/1, strings by code
// point, arrays element by element).

function isBytes(v) {
  return v !== null && v !== undefined && typeof v !== "string";
}

export function hkey(v) {
  return JSON.stringify(v === undefined ? null : v);
}

export function eqv(a, b) {
  return hkey(a) === hkey(b);
}

// Compare whole code points, not UTF-16 code units (§8.4.6), as the writer does.
export function cmpCodePoints(a, b) {
  const ca = [...a];
  const cb = [...b];
  const n = Math.min(ca.length, cb.length);
  for (let k = 0; k < n; k += 1) {
    const d = ca[k].codePointAt(0) - cb[k].codePointAt(0);
    if (d !== 0) return d;
  }
  return ca.length - cb.length;
}

export function cmp(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i += 1) {
      const c = cmp(a[i], b[i]);
      if (c !== 0) return c;
    }
    return a.length - b.length;
  }
  const na = typeof a === "boolean" ? (a ? 1 : 0) : a;
  const nb = typeof b === "boolean" ? (b ? 1 : 0) : b;
  if (typeof na === "number" && typeof nb === "number") return na < nb ? -1 : na > nb ? 1 : 0;
  if (typeof na === "string" && typeof nb === "string") return cmpCodePoints(na, nb);
  if (na === nb) return 0;
  return na < nb ? -1 : 1;
}

// A map keyed by a structural key (an array/tuple or a scalar), preserving
// insertion order like a Python dict.
export class TMap {
  constructor() {
    this.m = new Map();
  }
  set(k, v) {
    this.m.set(hkey(k), [k, v]);
    return this;
  }
  get(k) {
    const e = this.m.get(hkey(k));
    return e ? e[1] : undefined;
  }
  has(k) {
    return this.m.has(hkey(k));
  }
  delete(k) {
    return this.m.delete(hkey(k));
  }
  setdefault(k, d) {
    const h = hkey(k);
    if (!this.m.has(h)) this.m.set(h, [k, d]);
    return this.m.get(h)[1];
  }
  keys() {
    return [...this.m.values()].map((e) => e[0]);
  }
  entries() {
    return [...this.m.values()];
  }
  get size() {
    return this.m.size;
  }
}

export class TSet {
  constructor(iter) {
    this.m = new Map();
    if (iter) for (const k of iter) this.add(k);
  }
  add(k) {
    this.m.set(hkey(k), k);
    return this;
  }
  has(k) {
    return this.m.has(hkey(k));
  }
  values() {
    return [...this.m.values()];
  }
  get size() {
    return this.m.size;
  }
  [Symbol.iterator]() {
    return this.values()[Symbol.iterator]();
  }
}

export class Counter {
  constructor(iter) {
    this.m = new Map();
    if (iter) for (const k of iter) this.inc(k);
  }
  inc(k, n = 1) {
    const h = hkey(k);
    const e = this.m.get(h);
    if (e) e[1] += n;
    else this.m.set(h, [k, n]);
    return this;
  }
  get(k) {
    const e = this.m.get(hkey(k));
    return e ? e[1] : 0;
  }
  entries() {
    return [...this.m.values()];
  }
  keys() {
    return [...this.m.values()].map((e) => e[0]);
  }
}

// A stable, key-order-preserving deep copy (the model is plain JSON).
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// --- the outcome --------------------------------------------------------------

export function mkOutcome({ result = null, deleted = false, conflicts = [], marked = null, kept = null } = {}) {
  const kind = result !== null ? "result" : deleted ? "deleted" : "conflicts";
  return { result, deleted, conflicts, marked, kept, kind };
}

// --- values (§11.6) -----------------------------------------------------------

export function mergeValue(a, x, y) {
  if (eqv(x, y)) return x;
  if (eqv(y, a)) return x;
  if (eqv(x, a)) return y;
  return CONFLICT;
}

// --- sequences (§11.5) --------------------------------------------------------

export class Change {
  constructor(side, a, b, run) {
    this.side = side;
    this.a = a;
    this.b = b;
    this.run = run;
  }
  get insertion() {
    return this.a === this.b;
  }
}

// The alignment of §11.5.1, as a list of steps ["pair", i, j], ["drop", i, null]
// and ["take", i, j], where i is the base position.
export function align(A, C, match) {
  const n = A.length;
  const m = C.length;
  const M = [];
  for (let i = 0; i < n; i += 1) {
    const row = [];
    for (let j = 0; j < m; j += 1) row.push(!!match(A[i], C[j]));
    M.push(row);
  }
  const L = [];
  for (let i = 0; i <= n; i += 1) L.push(new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    const row = L[i];
    const below = L[i + 1];
    for (let j = m - 1; j >= 0; j -= 1) {
      row[j] = M[i][j] ? 1 + below[j + 1] : Math.max(below[j], row[j + 1]);
    }
  }
  const steps = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && M[i][j]) {
      steps.push(["pair", i, j]);
      i += 1;
      j += 1;
    } else if (j === m || (i < n && L[i + 1][j] >= L[i][j + 1])) {
      steps.push(["drop", i, null]);
      i += 1;
    } else {
      steps.push(["take", i, j]);
      j += 1;
    }
  }
  return steps;
}

export function pairsOf(steps) {
  const m = new Map();
  for (const [k, i, j] of steps) if (k === "pair") m.set(i, j);
  return m;
}

// The changes of one side (§11.5.2).
export function sideChanges(side, A, C, steps, otherPairs, same) {
  const changes = [];
  let start = null;
  let drops = [];
  let takes = [];
  const flush = () => {
    if (start === null) return;
    const run = takes.map((j) => C[j]);
    if (drops.length === run.length && run.length) {
      for (let k = 0; k < run.length; k += 1) {
        changes.push(new Change(side, start + k, start + k + 1, [run[k]]));
      }
    } else {
      changes.push(new Change(side, start, start + drops.length, run));
    }
  };
  for (const [kind, i, j] of steps) {
    if (kind === "pair") {
      flush();
      start = null;
      drops = [];
      takes = [];
      continue;
    }
    if (start === null) start = i;
    if (kind === "drop") drops.push(i);
    else takes.push(j);
  }
  flush();
  for (const [i, j] of pairsOf(steps)) {
    if (!otherPairs.has(i) && !same(A[i], C[j])) changes.push(new Change(side, i, i + 1, [C[j]]));
  }
  changes.sort((c, d) => c.a - d.a || c.b - d.b);
  return changes;
}

export function touch(c, d) {
  if (c.insertion && d.insertion) return c.a === d.a;
  if (c.insertion) return d.a < c.a && c.a < d.b;
  if (d.insertion) return c.a < d.a && d.a < c.b;
  return c.a < d.b && d.a < c.b;
}

// Combining two runs (§11.5.4).
export function combine(X, Y, equal, sortKey, identity) {
  if (X.length === Y.length && X.every((x, i) => equal(x, Y[i]))) return [...X];
  const kx = X.map(sortKey);
  const ky = Y.map(sortKey);
  const [first, second] = cmp(kx, ky) <= 0 ? [X, Y] : [Y, X];
  const seen = new Set(first.map((e) => hkey(identity(e))));
  return [...first, ...second.filter((e) => !seen.has(hkey(identity(e))))];
}

function pk(side, a) {
  return `${side}\u0000${a}`;
}

export function mergeSequence(A, O, T, match, same, equal, policy = "conflict", opts = {}) {
  const { pairing = false, sortKey = null, identity = null } = opts;
  const so = align(A, O, match);
  const st = align(A, T, match);
  const po = pairsOf(so);
  const pt = pairsOf(st);
  const co = sideChanges(OURS, A, O, so, pt, same);
  const ct = sideChanges(THEIRS, A, T, st, po, same);
  const ident = new Map();
  for (const c of co) {
    for (const d of ct) {
      if (c.a === d.a && c.b === d.b && c.run.length === d.run.length && c.run.every((x, i) => equal(x, d.run[i]))) {
        ident.set(c, d);
        ident.set(d, c);
      }
    }
  }
  const rest = [...co, ...ct].filter((c) => !ident.has(c));
  const parent = new Map();
  for (const c of rest) parent.set(c, c);
  const find = (c) => {
    while (parent.get(c) !== c) c = parent.get(c);
    return c;
  };
  for (const c of rest) {
    for (const d of rest) {
      if (c.side === OURS && d.side === THEIRS && touch(c, d)) {
        const rc = find(c);
        const rd = find(d);
        if (rc !== rd) parent.set(rd, rc);
      }
    }
  }
  const groupsM = new Map();
  for (const c of rest) {
    const r = find(c);
    if (!groupsM.has(r)) groupsM.set(r, []);
    groupsM.get(r).push(c);
  }
  let clusters = [...groupsM.values()].filter((g) => g.length >= 2);
  const member = new Map();
  clusters.forEach((g, k) => {
    for (const c of g) member.set(c, k);
  });
  let moved = true;
  while (moved) {
    moved = false;
    clusters.forEach((g, k) => {
      if (!g.length) return;
      const lo = Math.min(...g.map((c) => c.a));
      const hi = Math.max(...g.map((c) => c.b));
      for (const c of rest) {
        if (c.insertion && lo < c.a && c.a < hi && member.get(c) !== k) {
          if (member.has(c)) {
            const ok = member.get(c);
            for (const e of clusters[ok]) member.set(e, k);
            g.push(...clusters[ok]);
            clusters[ok] = [];
          } else {
            g.push(c);
            member.set(c, k);
          }
          moved = true;
        }
      }
    });
  }
  clusters = clusters.filter((g) => g.length);
  member.clear();
  for (const g of clusters) for (const c of g) member.set(c, g);
  const spans = new Map();
  for (const g of clusters) spans.set(g, [Math.min(...g.map((c) => c.a)), Math.max(...g.map((c) => c.b))]);
  const emptyAt = new Map();
  const startsAt = new Map();
  for (const g of clusters) {
    const [lo, hi] = spans.get(g);
    if (lo === hi) emptyAt.set(lo, g);
    else startsAt.set(lo, g);
  }
  const inserts = new Map();
  const nonempty = new Map();
  for (const c of [...co, ...ct]) {
    if (c.insertion) inserts.set(pk(c.side, c.a), c);
    else nonempty.set(pk(c.side, c.a), c);
  }
  const sideOf = { [OURS]: [O, po], [THEIRS]: [T, pt] };

  const sideRun = (side, g, lo, hi) => {
    const [C, pairs] = sideOf[side];
    const mine = new Map();
    for (const c of g) if (c.side === side && c.insertion) mine.set(c.a, c);
    const run = [];
    let p = lo;
    while (p <= hi) {
      if (mine.has(p)) run.push(...mine.get(p).run);
      if (p === hi) break;
      const c = nonempty.get(pk(side, p));
      if (c !== undefined) {
        run.push(...c.run);
        p = c.b;
        continue;
      }
      run.push(C[pairs.get(p)]);
      p += 1;
    }
    return run;
  };

  const settle = (g) => {
    const [lo, hi] = spans.get(g);
    const X = sideRun(OURS, g, lo, hi);
    const Y = sideRun(THEIRS, g, lo, hi);
    const B = A.slice(lo, hi);
    if (policy === "combine") return combine(X, Y, equal, sortKey, identity).map((e) => ["combined", e]);
    let k = 0;
    while (k < Math.min(X.length, Y.length) && equal(X[k], Y[k])) k += 1;
    let s = 0;
    while (s < Math.min(X.length, Y.length) - k && equal(X[X.length - 1 - s], Y[Y.length - 1 - s])) s += 1;
    const pre = [];
    for (let q = 0; q < k; q += 1) pre.push(["common", X[q], Y[q]]);
    const post = [];
    for (let q = 0; q < s; q += 1) post.push(["common", X[X.length - s + q], Y[Y.length - s + q]]);
    const Xr = X.slice(k, X.length - s);
    const Yr = Y.slice(k, Y.length - s);
    const mid = [];
    if (Xr.length || Yr.length) {
      if (pairing && Xr.length === Yr.length && Xr.every((x, i) => match(x, Yr[i]))) {
        for (let q = 0; q < Xr.length; q += 1) {
          let b = null;
          if (B.length === Xr.length && B.every((br, r) => match(br, Xr[r]) && match(br, Yr[r]))) b = B[q];
          mid.push(["paired", b, Xr[q], Yr[q]]);
        }
      } else {
        mid.push(["conflict", B, Xr, Yr]);
      }
    }
    return [...pre, ...mid, ...post];
  };

  const applyC = (c) => {
    if (ident.has(c)) {
      const [o, t] = c.side === OURS ? [c, ident.get(c)] : [ident.get(c), c];
      const out = [];
      for (let i = 0; i < o.run.length; i += 1) out.push(["common", o.run[i], t.run[i]]);
      return out;
    }
    return c.run.map((x) => ["one", c.side, x]);
  };

  const pieces = [];
  const n = A.length;
  let p = 0;
  while (true) {
    if (emptyAt.has(p)) pieces.push(...settle(emptyAt.get(p)));
    const done = new Set();
    for (const side of SIDES) {
      const c = inserts.get(pk(side, p));
      if (c !== undefined && !member.has(c) && !done.has(c)) {
        pieces.push(...applyC(c));
        done.add(c);
        if (ident.has(c)) done.add(ident.get(c));
      }
    }
    if (p >= n) break;
    if (startsAt.has(p)) {
      const g = startsAt.get(p);
      pieces.push(...settle(g));
      p = spans.get(g)[1];
      continue;
    }
    const c = nonempty.get(pk(OURS, p)) ?? nonempty.get(pk(THEIRS, p));
    if (c !== undefined) {
      pieces.push(...applyC(c));
      p = c.b;
      continue;
    }
    pieces.push(["both", A[p], O[po.get(p)], T[pt.get(p)]]);
    p += 1;
  }
  return pieces;
}

function containsVal(arr, el) {
  const h = hkey(el);
  return arr.some((x) => hkey(x) === h);
}

function indexOfVal(arr, el) {
  const h = hkey(el);
  return arr.findIndex((x) => hkey(x) === h);
}

// The order of a keyed list (§11.5.5): identities, in merged order.
export function keyedOrder(B, O, T, inResult, sortKey) {
  const eq = (x, y) => eqv(x, y);
  const pieces = mergeSequence(B, O, T, eq, eq, eq, "combine", { sortKey, identity: (x) => x });
  const seq = [];
  const seqSet = new Set();
  const inArr = [...inResult];
  const inSet = new Set(inArr.map(hkey));
  for (const pc of pieces) {
    const el = pc[0] === "both" || pc[0] === "common" || pc[0] === "combined" ? pc[1] : pc[2];
    const h = hkey(el);
    if (inSet.has(h) && !seqSet.has(h)) {
      seq.push(el);
      seqSet.add(h);
    }
  }
  const remaining = inArr.filter((e) => !seqSet.has(hkey(e)));
  remaining.sort((a, b) => cmp(sortKey(a), sortKey(b)));
  for (const el of remaining) {
    const holder = containsVal(O, el) ? O : T;
    let pos = 0;
    const idx = indexOfVal(holder, el);
    for (let r = idx - 1; r >= 0; r -= 1) {
      if (seqSet.has(hkey(holder[r]))) {
        pos = indexOfVal(seq, holder[r]) + 1;
        break;
      }
    }
    seq.splice(pos, 0, el);
    seqSet.add(hkey(el));
  }
  return seq;
}

// --- conflicts (§11.12.5) -----------------------------------------------------

export const MEMBERS = [
  "kind", "line", "deleted", "unreadable", "item", "occurrence", "after",
  "tuning", "variation", "key", "changed", "symbols", "base", "ours", "theirs",
];

export function conflictJson(c) {
  const out = {};
  for (const k of MEMBERS) {
    if (k in c && c[k] !== null && c[k] !== undefined) out[k] = c[k];
  }
  return out;
}

export function conflictsJson(outcome) {
  const data = { conflicts: outcome.conflicts.map(conflictJson) };
  return JSON.stringify(data, null, 2) + "\n";
}

// The `<<<<<<< ours` line of a region, carrying its conflict (so finishMarked
// can number it once the blocks are assembled).
class Marker {
  constructor(conflict) {
    this.conflict = conflict;
    this.text = "<<<<<<< ours";
  }
  toString() {
    return this.text;
  }
}

const MID = "=======";
const END = ">>>>>>> theirs";

export function region(conflict, oursLines, theirsLines) {
  return [new Marker(conflict), ...oursLines, MID, ...theirsLines, END];
}

// Join the blocks, number each region's first line, order the conflicts.
export function finishMarked(blocks, conflicts) {
  const lines = [];
  blocks.forEach((b, k) => {
    if (k) lines.push("");
    lines.push(...b);
  });
  lines.forEach((ln, i) => {
    if (ln instanceof Marker) ln.conflict.line = i + 1;
  });
  conflicts.sort((a, b) => (a.line || 0) - (b.line || 0));
  return lines.length ? lines.map((x) => String(x)).join("\n") + "\n" : "";
}

// --- resolving a marked text (§11.12.4) ---------------------------------------

function regionsOf(marked) {
  const out = [];
  const lines = marked.split("\n");
  let k = 0;
  while (k < lines.length) {
    if (lines[k] === "<<<<<<< ours") {
      const m = lines.indexOf(MID, k);
      const e = lines.indexOf(END, m);
      out.push([lines.slice(k + 1, m), lines.slice(m + 1, e)]);
      k = e + 1;
    } else {
      out.push(lines[k]);
      k += 1;
    }
  }
  return out;
}

export function resolveMarked(marked, side) {
  const out = [];
  for (const el of regionsOf(marked)) {
    if (Array.isArray(el)) out.push(...(side === OURS ? el[0] : el[1]));
    else out.push(el);
  }
  return out.join("\n");
}

// --- whole files (§11.4) and the method (§11.2) -------------------------------

function canonicalSongText(text) {
  return serialize(canonical(parse(text)));
}

export function canonicalSong(text) {
  return canonicalSongText(text);
}

export function merge(base, ours, theirs, options = {}) {
  const setlist = !!options.setlist;
  // Imported lazily so the setlist layer and merge do not form an import cycle,
  // mirroring the reference's in-function imports.
  const texts = {};
  const unreadable = [];
  for (const [name, t] of [["base", base], ["ours", ours], ["theirs", theirs]]) {
    if (isBytes(t)) {
      try {
        texts[name] = decode(t);
      } catch (e) {
        if (e instanceof NotUtf8Error) {
          unreadable.push(name);
          continue;
        }
        throw e;
      }
    } else {
      texts[name] = t ?? null;
    }
  }
  if (unreadable.length) return mkOutcome({ conflicts: [{ kind: "file", unreadable }] });
  if (texts.base !== null && texts.ours === null && texts.theirs === null) return mkOutcome({ deleted: true });
  // A marked input is never merged (§11.4): ours stays exactly as it is.
  const first = {};
  for (const name of ["base", "ours", "theirs"]) {
    const x = texts[name];
    const found = x !== null ? markerLines(x) : [];
    if (found.length) first[name] = found[0];
  }
  if (Object.keys(first).length) {
    return mkOutcome({ conflicts: [{ kind: "unresolved", ...first }], kept: ours ?? null });
  }
  const canon = setlist ? canonicalSetlistText : canonicalSongText;
  let b = texts.base === null ? null : canon(texts.base);
  const o = texts.ours === null ? null : canon(texts.ours);
  const t = texts.theirs === null ? null : canon(texts.theirs);
  if (b === null) {
    if (o === null && t === null) return mkOutcome({ deleted: true });
    if (o === null) return mkOutcome({ result: t });
    if (t === null) return mkOutcome({ result: o });
    b = "";
  } else {
    if (o === null && t === null) return mkOutcome({ deleted: true });
    if (o === null) {
      return t === b ? mkOutcome({ deleted: true }) : mkOutcome({ conflicts: [{ kind: "file", deleted: OURS }], kept: t });
    }
    if (t === null) {
      return o === b ? mkOutcome({ deleted: true }) : mkOutcome({ conflicts: [{ kind: "file", deleted: THEIRS }], kept: o });
    }
  }
  if (o === t) return mkOutcome({ result: o });
  if (b === o) return mkOutcome({ result: t });
  if (b === t) return mkOutcome({ result: o });
  if (setlist) return mergeSetlists(b, o, t);
  return new SongMerge(b, o, t).run();
}

// The corpus file map, from an outcome (mirrors reference/tools/corpus.py's
// merge_outputs).
export function mergeOutputs(outcome, options = {}) {
  const ext = options.setlist ? ".setlist.md" : ".cifra.md";
  if (outcome.result !== null) return { ["result" + ext]: outcome.result };
  if (outcome.deleted) return { "result.deleted": "" };
  const files = { "conflicts.json": conflictsJson(outcome) };
  if (outcome.marked !== null) files["marked" + ext] = outcome.marked;
  return files;
}

// --- songs: the pieces of a version -------------------------------------------

function stripSpaces(text) {
  return text.replace(/^ +/, "").replace(/ +$/, "");
}

function getp(map, k) {
  return map.has(k) ? map.get(k) : null;
}

function dialectOf(props) {
  for (const p of props) {
    if (p.key === "notation") {
      const d = asciiLower(stripSpaces(p.value));
      return d in DIALECTS ? d : DEFAULT_DIALECT;
    }
  }
  return DEFAULT_DIALECT;
}

// A voicing as §8.4.6 writes it after the key, or null.
function voicingText(e) {
  if (e === null || e === undefined) return null;
  let t = formatFrets(e.frets);
  if (e.fingers && e.fingers.some((f) => f !== null)) t += ` (${formatFingers(e.fingers)})`;
  return t;
}

// The key most of a list has, between equal numbers the one with the least
// index; null if none is a key.
function mostCommon(keys) {
  const c = new Counter(keys.filter((k) => k !== null && k !== undefined));
  const ks = c.keys();
  if (!ks.length) return null;
  let best = ks[0];
  for (const k of ks) {
    if (cmp([-c.get(k), k[1]], [-c.get(best), best[1]]) < 0) best = k;
  }
  return best;
}

function chordsOf(line) {
  const out = [];
  for (const m of line.measures || []) for (const it of m.items) if (it.type === "chord") out.push(it);
  return out;
}

function kt(item) {
  return [item.symbol, item.index];
}

function keyText(k) {
  return k === null || k === undefined ? null : keyFor(k[0], k[1]);
}

function maskedLine(line) {
  line = clone(line);
  for (const it of chordsOf(line)) {
    it.index = 1;
    it.key = it.symbol;
  }
  return line;
}

class Unit {
  constructor(version, kind, text, masked, line = null, chords = []) {
    this.version = version;
    this.kind = kind;
    this.text = text;
    this.masked = masked;
    this.line = line;
    this.chords = chords;
  }
}

// The units of a section's body (§11.8.1).
function unitsOf(section, dialect, version) {
  const out = [];
  for (const part of section.body) {
    if (part.type === "notes") {
      for (const ln of part.text.split("\n")) out.push(new Unit(version, ["notes"], ln, ln));
    } else if (part.type === "verbatim") {
      const info = part.info;
      out.push(new Unit(version, ["fence", info], "```" + info, "```" + info));
      for (const ln of part.text.split("\n")) out.push(new Unit(version, ["verbatim", info], ln, ln));
    } else {
      out.push(new Unit(version, ["fence", ""], "```", "```"));
      for (const line of part.lines) {
        const text = musicLines([line], dialect).join("\n");
        const masked = musicLines([maskedLine(line)], dialect).join("\n");
        out.push(new Unit(version, ["music", line.kind], text, masked, line, chordsOf(line)));
      }
    }
  }
  return out;
}

function headingOf(section) {
  return [section.heading || "none", section.name, section.anchor, section.times === undefined ? null : section.times];
}

const NO_HEADING = [null, null, null, null];

// A heading's line (§8.4.3), or null for a section with no heading.
function headingTextLine(h) {
  const [form, name, anchor, times] = h;
  const s = { name: name || "", anchor, times };
  if (form === "markdown") return headingLine(2, headingName(s));
  if (form === "bracket") return `[${headingName(s)}]`;
  if (form === "label") return `${name}:`;
  return null;
}

class Sec {
  constructor(version, model, heading, units) {
    this.version = version;
    this.model = model;
    this.heading = heading;
    this.units = units;
  }
}

function unitMatch(u, v) {
  return eqv(u.kind, v.kind) && u.masked === v.masked;
}

function secMatch(b, s) {
  if (eqv(b.heading, s.heading)) return true;
  return b.units.length >= 1 && b.units.length === s.units.length && b.units.every((x, i) => unitMatch(x, s.units[i]));
}

function secEqual(o, t) {
  return eqv(o.heading, t.heading) && o.units.length === t.units.length && o.units.every((x, i) => unitMatch(x, t.units[i]));
}

class Version {
  constructor(name, text) {
    this.name = name;
    this.text = text;
    this.doc = parse(text);
    this.dialect = dialectOf(this.doc.properties);
    this.props = new Map();
    this.propOrder = [];
    for (const p of this.doc.properties) {
      this.props.set(p.key, p.value);
      this.propOrder.push(p.key);
    }
    this.secs = this.doc.sections.map((s) => new Sec(name, s, headingOf(s), unitsOf(s, this.dialect, name)));
    this.keys = new TSet();
    for (const sec of this.secs) for (const u of sec.units) for (const it of u.chords) this.keys.add(kt(it));
    this.blocks = this.doc.blocks;
  }
}

// --- footnote keys (§11.9.2) --------------------------------------------------

export class KeyMatch {
  constructor(baseKeys, sideKeys, corr) {
    this.match = new TMap();
    this.mu = new TMap();
    const counts = new Counter(corr.map(([b, v]) => [b, v]));
    const withOccB = new TSet(corr.map(([b]) => b));
    const withOccV = new TSet(corr.map(([, v]) => v));
    const all = [...baseKeys.values(), ...sideKeys.values()];
    const symbols = [...new Set(all.map((k) => k[0]))].sort(cmpCodePoints);
    for (const sym of symbols) {
      while (true) {
        let best = null;
        for (const [pair, nn] of counts.entries()) {
          const [b, v] = pair;
          if (b[0] !== sym || this.match.has(b) || this.mu.has(v)) continue;
          const cand = [-nn, b[1] !== v[1], b[1], v[1]];
          if (best === null || cmp(cand, best[0]) < 0) best = [cand, b, v];
        }
        if (best === null) break;
        this.match.set(best[1], best[2]);
        this.mu.set(best[2], best[1]);
      }
      const indices = [...new Set(all.filter((k) => k[0] === sym).map((k) => k[1]))].sort((a, b) => a - b);
      for (const i of indices) {
        const k = [sym, i];
        if (
          baseKeys.has(k) &&
          sideKeys.has(k) &&
          !this.match.has(k) &&
          !this.mu.has(k) &&
          !withOccB.has(k) &&
          !withOccV.has(k)
        ) {
          this.match.set(k, k);
          this.mu.set(k, k);
        }
      }
    }
  }
}

// --- the song merge -----------------------------------------------------------

let _oidN = 0;
const _oids = new WeakMap();
function oid(o) {
  let i = _oids.get(o);
  if (i === undefined) {
    i = (_oidN += 1);
    _oids.set(o, i);
  }
  return i;
}

export class SongMerge {
  constructor(b, o, t) {
    this.v = { base: new Version("base", b), [OURS]: new Version(OURS, o), [THEIRS]: new Version(THEIRS, t) };
    this.conflicts = [];
  }

  unitSame(b, s) {
    if (!unitMatch(b, s)) return false;
    const km = this.km[s.version];
    return b.chords.every((x, i) => eqv(km.match.get(kt(x)) ?? null, kt(s.chords[i])));
  }

  secSame(b, s) {
    return (
      eqv(b.heading, s.heading) &&
      b.units.length === s.units.length &&
      b.units.every((x, i) => this.unitSame(x, s.units[i]))
    );
  }

  run() {
    const B = this.v.base;
    this.km = {};
    this.joined = {};
    for (const side of SIDES) {
      const V = this.v[side];
      const corr = [];
      for (const [i, j] of pairsOf(align(B.secs, V.secs, secMatch))) {
        const bu = B.secs[i].units;
        const vu = V.secs[j].units;
        for (const [p, q] of pairsOf(align(bu, vu, unitMatch))) {
          const bch = bu[p].chords;
          const vch = vu[q].chords;
          for (let x = 0; x < Math.min(bch.length, vch.length); x += 1) corr.push([kt(bch[x]), kt(vch[x])]);
        }
      }
      const km = (this.km[side] = new KeyMatch(B.keys, V.keys, corr));
      const dests = new TMap();
      for (const [b, v] of corr) {
        dests.setdefault(b, new TSet()).add(km.mu.has(v) ? km.mu.get(v) : null);
      }
      const joined = (this.joined[side] = new TMap());
      for (const [b, d] of dests.entries()) {
        if (!km.match.has(b) && d.size === 1 && !d.has(null) && !d.has(b)) joined.set(b, d.values()[0]);
      }
    }

    this.mergeMetadata();
    this.mergeChart();
    this.assignVariants();
    this.readingConflicts();
    this.mergeBlocks();
    this.sectionsOut = this.mergedSections();
    if (!this.conflicts.length) return mkOutcome({ result: this.result() });
    const marked = this.marked();
    return mkOutcome({ conflicts: this.conflicts, marked });
  }

  // --- metadata (§11.7) ---
  mergeMetadata() {
    const B = this.v.base;
    const O = this.v[OURS];
    const T = this.v[THEIRS];
    this.title = mergeValue(B.doc.title, O.doc.title, T.doc.title);
    this.titleConflict = null;
    if (this.title === CONFLICT) {
      this.titleConflict = { kind: "title", base: B.doc.title, ours: O.doc.title, theirs: T.doc.title };
      this.conflicts.push(this.titleConflict);
    }
    const keys = new Set([...B.props.keys(), ...O.props.keys(), ...T.props.keys()]);
    this.propIn = new Set();
    this.propValue = new Map();
    this.propConflict = new Map();
    for (const k of keys) {
      const a = getp(B.props, k);
      const x = getp(O.props, k);
      const y = getp(T.props, k);
      if (a === null || (x !== null && y !== null)) {
        this.propIn.add(k);
        const val = mergeValue(a, x, y);
        if (val === CONFLICT) this.propConflict.set(k, { kind: "property", key: k, base: a, ours: x, theirs: y });
        this.propValue.set(k, val);
      } else if (x === null && y === null) {
        continue;
      } else {
        const kept = x !== null ? x : y;
        if (!eqv(kept, a)) {
          this.propIn.add(k);
          this.propValue.set(k, CONFLICT);
          this.propConflict.set(k, { kind: "property", key: k, base: a, ours: x, theirs: y });
        }
      }
    }
  }

  propertyOrder() {
    const B = this.v.base;
    const O = this.v[OURS];
    const T = this.v[THEIRS];
    return keyedOrder(B.propOrder, O.propOrder, T.propOrder, this.propIn, (k) => k);
  }

  // --- the chart (§11.8) ---
  mergeChart() {
    const B = this.v.base;
    const O = this.v[OURS];
    const T = this.v[THEIRS];
    const pieces = mergeSequence(B.secs, O.secs, T.secs, secMatch, (b, s) => this.secSame(b, s), secEqual, "conflict", {
      pairing: true,
    });
    this.chart = [];
    for (const pc of pieces) {
      const kind = pc[0];
      if (kind === "both" || kind === "paired") {
        this.chart.push(this.mergeSection(pc[1], pc[2], pc[3]));
      } else if (kind === "one") {
        const sec = pc[2];
        this.chart.push({
          type: "section",
          base: null,
          heading: sec.heading,
          hconflict: null,
          sides: { [pc[1]]: sec.heading },
          body: sec.units.map((u) => ["one", pc[1], u]),
        });
      } else if (kind === "common") {
        const o = pc[1];
        const t = pc[2];
        this.chart.push({
          type: "section",
          base: null,
          heading: o.heading,
          hconflict: null,
          sides: {},
          body: o.units.map((x, i) => ["common", x, t.units[i]]),
        });
      } else {
        this.chart.push({ type: "conflict", base: pc[1], [OURS]: pc[2], [THEIRS]: pc[3] });
      }
    }
  }

  mergeSection(b, o, t) {
    const bh = b !== null ? b.heading : NO_HEADING;
    const fields = [0, 1, 2, 3].map((k) => mergeValue(bh[k], o.heading[k], t.heading[k]));
    let hconflict = null;
    if (fields.some((f) => f === CONFLICT)) {
      const sideHeading = (s) => [0, 1, 2, 3].map((k) => (fields[k] === CONFLICT ? s.heading[k] : fields[k]));
      hconflict = {
        kind: "heading",
        base: b !== null ? headingTextLine(bh) : null,
        _ours: sideHeading(o),
        _theirs: sideHeading(t),
      };
      hconflict.ours = headingTextLine(hconflict._ours);
      hconflict.theirs = headingTextLine(hconflict._theirs);
    }
    const body = mergeSequence(
      b !== null ? b.units : [],
      o.units,
      t.units,
      unitMatch,
      (x, y) => this.unitSame(x, y),
      unitMatch,
      "conflict",
    );
    return {
      type: "section",
      base: b,
      heading: fields,
      hconflict,
      sides: { [OURS]: o.heading, [THEIRS]: t.heading },
      body,
    };
  }

  // --- footnote markers (§11.9) ---
  occurrences() {
    const out = [];
    for (const ms of this.chart) {
      if (ms.type === "conflict") {
        for (const side of SIDES) for (const sec of ms[side]) for (const u of sec.units) out.push(["one", side, u]);
        continue;
      }
      for (const pc of ms.body) {
        if (pc[0] === "conflict") {
          for (const u of pc[2]) out.push(["one", OURS, u]);
          for (const u of pc[3]) out.push(["one", THEIRS, u]);
        } else {
          out.push(pc);
        }
      }
    }
    return out;
  }

  sigsFor(pc) {
    const kind = pc[0];
    if (kind === "both" || kind === "paired") {
      const b = pc[1];
      const o = pc[2];
      const t = pc[3];
      const n = o.chords.length;
      const bk = b !== null ? b.chords.map((x) => kt(x)) : new Array(n).fill(null);
      const out = [];
      for (let k = 0; k < n; k += 1) out.push([bk[k], kt(o.chords[k]), kt(t.chords[k])]);
      return [out, 1];
    }
    if (kind === "common") {
      const o = pc[1];
      const t = pc[2];
      const out = [];
      for (let i = 0; i < o.chords.length; i += 1) {
        const x = o.chords[i];
        const y = t.chords[i];
        const mo = this.km[OURS].mu.has(kt(x)) ? this.km[OURS].mu.get(kt(x)) : null;
        const mt = this.km[THEIRS].mu.has(kt(y)) ? this.km[THEIRS].mu.get(kt(y)) : null;
        out.push([eqv(mo, mt) ? mo : null, kt(x), kt(y)]);
      }
      return [out, 2];
    }
    return [null, 3];
  }

  assignVariants() {
    const rule1BySideKey = { [OURS]: new TMap(), [THEIRS]: new TMap() };
    const units = this.occurrences();
    const sigs = new Array(units.length).fill(null);
    units.forEach((pc, n) => {
      const [s, rule] = this.sigsFor(pc);
      sigs[n] = s;
      if (rule === 1 || rule === 2) {
        s.forEach((sg, k) => {
          for (const [side, pos] of [[OURS, 1], [THEIRS, 2]]) {
            rule1BySideKey[side].setdefault(sg[pos], []).push([n, k, sg]);
          }
        });
      }
    });
    units.forEach((pc, n) => {
      if (sigs[n] !== null) return;
      const side = pc[1];
      const u = pc[2];
      const V = this.km[side];
      const W = this.km[other(side)];
      const out = [];
      for (const it of u.chords) {
        const v = kt(it);
        const b = V.mu.has(v) ? V.mu.get(v) : null;
        if (b !== null) {
          const w = W.match.has(b) ? W.match.get(b) : null;
          out.push(side === OURS ? [b, v, w] : [b, w, v]);
          continue;
        }
        const found = rule1BySideKey[side].get(v);
        if (found) {
          const counts = new Counter(found.map(([, , sg]) => sg));
          const firsts = new TMap();
          for (const [nn, kk, sg] of found) firsts.setdefault(sg, [nn, kk]);
          const score = (sg) => [counts.get(sg), firsts.get(sg).map((x) => -x)];
          let best = counts.keys()[0];
          for (const sg of counts.keys()) if (cmp(score(sg), score(best)) > 0) best = sg;
          out.push(best);
          continue;
        }
        const w = v[1] === 1 && this.v[other(side)].keys.has(v) && !W.mu.has(v) ? v : null;
        out.push(side === OURS ? [null, v, w] : [null, w, v]);
      }
      sigs[n] = out;
    });
    const groups = units.map((pc, n) => pc[2].chords.map((it, k) => [it.symbol, this.grouping(sigs[n][k])]));
    const first = new TMap();
    const members = new TMap();
    let pos = 0;
    units.forEach((pc, n) => {
      groups[n].forEach((varr, k) => {
        if (!first.has(varr)) first.set(varr, pos);
        members.setdefault(varr, []).push(sigs[n][k]);
        pos += 1;
      });
    });
    this.unitVars = new Map();
    units.forEach((pc, n) => {
      this.unitVars.set(this.pieceId(pc), groups[n]);
    });
    this.vsig = new TMap();
    for (const [varr, sgs] of members.entries()) {
      const grp = varr[1];
      const beta = grp[0] === "base" ? grp[1] : mostCommon(sgs.map((sg) => sg[0]));
      const sig = [beta, null, null];
      for (const [p, side] of [[1, OURS], [2, THEIRS]]) {
        const keys = sgs.map((sg) => sg[p]);
        const m = beta !== null ? (this.km[side].match.has(beta) ? this.km[side].match.get(beta) : null) : null;
        sig[p] = m !== null && containsVal(keys, m) ? m : mostCommon(keys);
      }
      this.vsig.set(varr, sig);
    }
    this.vindex = new TMap();
    const bySymbol = new Map();
    for (const varr of first.keys()) {
      if (!bySymbol.has(varr[0])) bySymbol.set(varr[0], []);
      bySymbol.get(varr[0]).push(varr);
    }
    for (const [, vars_] of bySymbol) {
      vars_.sort((a, b) => {
        const ka = [
          [...this.vsig.get(a).filter((k) => k !== null).map((k) => k[1])].sort((x, y) => y - x),
          first.get(a),
        ];
        const kb = [
          [...this.vsig.get(b).filter((k) => k !== null).map((k) => k[1])].sort((x, y) => y - x),
          first.get(b),
        ];
        return cmp(ka, kb);
      });
      vars_.forEach((varr, i) => this.vindex.set(varr, i + 1));
    }
    this.fixed = new TMap();
    for (const pc of units) {
      const line = pc[2].line;
      if (line === null) continue;
      for (const m of line.measures || []) {
        for (const it of m.items) {
          if (it.type !== "unknown") continue;
          const txt = it.text;
          const cm = CHORD_TOKEN.exec(txt);
          const sym = cm[1] || txt;
          const k = [sym, cm[2] ? Math.max(parseInt(cm[2], 10), 1) : 1];
          if (keyFor(k[0], k[1]) === txt) {
            this.fixed.set([sym, ["fixed", k]], k);
            this.vsig.set([sym, ["fixed", k]], [k, k, k]);
          }
        }
      }
    }
    this.variants = this.vindex.keys().sort((a, b) => cmp([a[0], this.vindex.get(a)], [b[0], this.vindex.get(b)]));
    const fixedVars = this.fixed.keys().sort((a, b) => cmp(this.fixed.get(a), this.fixed.get(b)));
    this.variants = [...this.variants, ...fixedVars];
  }

  destination(side, k, beta) {
    if (k === null) {
      const d = beta !== null ? this.joined[side].get(beta) : undefined;
      return d !== undefined && d !== null ? ["base", d] : null;
    }
    const b = this.km[side].mu.has(k) ? this.km[side].mu.get(k) : null;
    return b !== null ? ["base", b] : ["new", side, k];
  }

  grouping(sig) {
    const [beta, o, t] = sig;
    const base = beta !== null ? ["base", beta] : null;
    const doo = this.destination(OURS, o, beta);
    const dt = this.destination(THEIRS, t, beta);
    let mo = doo !== null && !eqv(doo, base);
    let mt = dt !== null && !eqv(dt, base);
    if (!mo && !mt) return base;
    if (mo && !mt && dt !== null && this.reshaped(THEIRS, beta)) mt = true;
    if (mt && !mo && doo !== null && this.reshaped(OURS, beta)) mo = true;
    if (!mt) return doo;
    if (!mo || eqv(doo, dt)) return dt;
    return ["pair", doo, dt];
  }

  reshaped(side, b) {
    const m = this.km[side].match.has(b) ? this.km[side].match.get(b) : null;
    if (m === null) return false;
    const ident = (blk) => [blk.tuning.id, blk.label];
    const mine = new TMap();
    for (const blk of this.v[side].blocks) mine.set(ident(blk), blk);
    for (const X of this.v.base.blocks) {
      const Y = mine.get(ident(X));
      if (Y === undefined) continue;
      const x = X.voicings.find((e) => eqv([e.symbol, e.index], b)) ?? null;
      const y = Y.voicings.find((e) => eqv([e.symbol, e.index], m)) ?? null;
      if (voicingText(x) !== voicingText(y)) return true;
    }
    return false;
  }

  pieceId(pc) {
    if (pc[0] === "one") return `one:${oid(pc[2])}`;
    return `${pc[0]}:${oid(pc[2])}`;
  }

  variantKey(symbol, grp) {
    if (this.fixed.has([symbol, grp])) return this.fixed.get([symbol, grp]);
    return [symbol, this.vindex.get([symbol, grp])];
  }

  // --- reading (§11.7.2) ---
  appliedUnits(side) {
    const out = [];
    for (const ms of this.chart) {
      if (ms.type !== "section") continue;
      for (const pc of ms.body) {
        if (pc[0] === "one" && pc[1] === side && pc[2].kind[0] === "music") out.push(pc[2]);
      }
    }
    return out;
  }

  readingConflicts() {
    const B = this.v.base;
    this.reading = {};
    for (const prop of ["notation", "words"]) {
      const a = getp(B.props, prop);
      for (const side of SIDES) {
        const V = this.v[side];
        const W = this.v[other(side)];
        const x = getp(V.props, prop);
        const y = getp(W.props, prop);
        if (eqv(x, a) || !eqv(y, a)) continue;
        const applied = this.appliedUnits(other(side));
        let c;
        if (prop === "notation") {
          const dv = dialectOf(V.doc.properties);
          const db = dialectOf(B.doc.properties);
          if (dv === db || dialectOf(W.doc.properties) !== db) continue;
          const symbols = [];
          for (const u of applied) {
            for (const it of u.chords) {
              const s = it.symbol;
              if (!symbols.includes(s) && !eqv(parseChord(s, dv).chord, parseChord(s, db).chord)) symbols.push(s);
            }
          }
          if (!symbols.length) continue;
          const seen = [];
          for (const pc of this.occurrences()) {
            const u = pc[2];
            for (const it of u.chords) {
              if (symbols.includes(it.symbol) && !seen.includes(it.symbol)) seen.push(it.symbol);
            }
          }
          c = {
            kind: "reading",
            key: prop,
            changed: side,
            symbols: seen,
            base: a,
            [OURS]: getp(this.v[OURS].props, prop),
            [THEIRS]: getp(this.v[THEIRS].props, prop),
          };
        } else {
          if (!applied.length) continue;
          c = {
            kind: "reading",
            key: prop,
            changed: side,
            base: a,
            [OURS]: getp(this.v[OURS].props, prop),
            [THEIRS]: getp(this.v[THEIRS].props, prop),
          };
        }
        this.reading[prop] = c;
        this.propIn.add(prop);
        this.propValue.set(prop, CONFLICT);
        this.propConflict.set(prop, c);
      }
    }
    for (const k of [...this.propConflict.keys()].sort(cmpCodePoints)) this.conflicts.push(this.propConflict.get(k));
  }

  get dialect() {
    const v = this.propValue.has("notation") ? this.propValue.get("notation") : null;
    if (v === CONFLICT) return this.v.base.dialect;
    return dialectOf(v !== null && v !== undefined ? [{ key: "notation", value: v }] : []);
  }

  // --- voicings (§11.10) ---
  mergeBlocks() {
    const B = this.v.base;
    const items = (block) => {
      const m = new TMap();
      if (block !== null && block !== undefined) for (const e of block.voicings) m.set([e.symbol, e.index], e);
      return m;
    };
    const vtext = voicingText;
    this.vtext = vtext;
    const pos = { base: 0, [OURS]: 1, [THEIRS]: 2 };

    const voicing = (version, block, variant, baseBlock = null) => {
      const sig = this.vsig.get(variant);
      const k = sig[pos[version]];
      if (block === null || block === undefined) return null;
      if (k === null) {
        if (version !== "base" && sig[0] !== null && baseBlock !== null && baseBlock !== undefined) {
          return items(baseBlock).get(sig[0]) ?? null;
        }
        return null;
      }
      return items(block).get(k) ?? null;
    };
    this.voicing = voicing;
    const ident = (blk) => [blk.tuning.id, blk.label];
    const baseBy = new TSet(B.blocks.map(ident));
    this.rename = { [OURS]: new TMap(), [THEIRS]: new TMap() };
    for (const side of SIDES) {
      const V = this.v[side];
      const sideBy = new TSet(V.blocks.map(ident));
      const cands = [];
      for (const X of B.blocks) {
        if (sideBy.has(ident(X))) continue;
        for (const Y of V.blocks) {
          if (baseBy.has(ident(Y)) || Y.tuning.id !== X.tuning.id) continue;
          if (!eqv(X.notes, Y.notes)) continue;
          if (this.variants.every((varr) => vtext(voicing("base", X, varr)) === vtext(voicing(side, Y, varr, X)))) {
            cands.push([ident(X), ident(Y)]);
          }
        }
      }
      for (const [x, y] of cands) {
        const nx = cands.filter(([a]) => eqv(a, x)).length;
        const ny = cands.filter(([, c]) => eqv(c, y)).length;
        if (nx === 1 && ny === 1) this.rename[side].set(y, x);
      }
    }
    const blocks = { base: new TMap() };
    for (const b of B.blocks) blocks.base.set(ident(b), b);
    for (const side of SIDES) {
      blocks[side] = new TMap();
      for (const Y of this.v[side].blocks) {
        const i = this.rename[side].has(ident(Y)) ? this.rename[side].get(ident(Y)) : ident(Y);
        blocks[side].set(i, Y);
      }
    }
    this.blk = blocks;
    const ids = new TSet([...blocks.base.keys(), ...blocks[OURS].keys(), ...blocks[THEIRS].keys()]);

    const weak = (side, i, varr) => {
      const sig = this.vsig.get(varr);
      const beta = sig[0];
      if (beta === null) return false;
      const blk = blocks[side].get(i);
      if (blk === undefined) return false;
      const k = sig[pos[side]];
      const m = this.km[side].match.has(beta) ? this.km[side].match.get(beta) : null;
      if (eqv(k, m) || items(blk).get(k) !== undefined) return false;
      return (
        vtext(m !== null ? items(blk).get(m) ?? null : null) ===
        vtext(voicing("base", blocks.base.get(i) ?? null, varr))
      );
    };
    this.weak = weak;

    const changed = (side, i) => {
      const b = blocks.base.get(i);
      const s = blocks[side].get(i);
      if (s.label !== b.label || !eqv(s.notes, b.notes)) return true;
      for (const varr of this.variants) {
        if (vtext(voicing(side, s, varr, b)) !== vtext(voicing("base", b, varr)) && !weak(side, i, varr)) return true;
      }
      return false;
    };

    this.blockIn = new TSet();
    this.blockConflict = new TMap();
    for (const i of ids) {
      const inb = blocks.base.has(i);
      const ino = blocks[OURS].has(i);
      const intt = blocks[THEIRS].has(i);
      if (!inb || (ino && intt)) {
        this.blockIn.add(i);
      } else if (ino || intt) {
        const side = ino ? OURS : THEIRS;
        if (changed(side, i)) {
          this.blockIn.add(i);
          this.blockConflict.set(i, { kind: "block", _deleted: other(side) });
        }
      }
    }
    this.bname = new TMap();
    this.bspell = new TMap();
    this.bvoicings = new TMap();
    this.bnotes = new TMap();
    for (const i of this.blockIn.values()) {
      const vers = { base: blocks.base.get(i) ?? null, [OURS]: blocks[OURS].get(i) ?? null, [THEIRS]: blocks[THEIRS].get(i) ?? null };
      const names = {
        base: vers.base !== null ? vers.base.label : null,
        [OURS]: vers[OURS] !== null ? vers[OURS].label : null,
        [THEIRS]: vers[THEIRS] !== null ? vers[THEIRS].label : null,
      };
      const name = mergeValue(names.base, names[OURS], names[THEIRS]);
      this.bname.set(i, [name, names]);
      const sp = {
        base: vers.base !== null ? vers.base.tuning.text : null,
        [OURS]: vers[OURS] !== null ? vers[OURS].tuning.text : null,
        [THEIRS]: vers[THEIRS] !== null ? vers[THEIRS].tuning.text : null,
      };
      let spell = mergeValue(sp.base, sp[OURS], sp[THEIRS]);
      if (spell === CONFLICT) {
        spell = [sp[OURS], sp[THEIRS]].filter((s) => s !== null).sort(cmpCodePoints)[0];
      }
      if (spell === null) spell = sp.base;
      this.bspell.set(i, spell);
    }
    for (const i of [...this.blockIn.values()].sort((a, b) => cmp(this.blockSort(a), this.blockSort(b)))) {
      if (this.blockConflict.has(i)) continue;
      const vers = { base: blocks.base.get(i) ?? null, [OURS]: blocks[OURS].get(i) ?? null, [THEIRS]: blocks[THEIRS].get(i) ?? null };
      const [name, names] = this.bname.get(i);
      const tuning = this.bspell.get(i);
      if (name === CONFLICT) {
        this.conflicts.push({
          kind: "variation",
          tuning,
          base: names.base,
          [OURS]: names[OURS],
          [THEIRS]: names[THEIRS],
          _block: i,
        });
      }
      const merged = new TMap();
      for (const varr of this.variants) {
        const a = vtext(voicing("base", vers.base, varr));
        const x = vtext(voicing(OURS, vers[OURS], varr, vers.base));
        const y = vtext(voicing(THEIRS, vers[THEIRS], varr, vers.base));
        let val = mergeValue(a, x, y);
        if (val === CONFLICT) {
          if (weak(OURS, i, varr)) val = y;
          else if (weak(THEIRS, i, varr)) val = x;
        }
        if (val === CONFLICT) {
          const c = {
            kind: "voicing",
            tuning,
            variation: this.blockName(i),
            key: keyText(this.variantKey(varr[0], varr[1])),
            base: a,
            [OURS]: x,
            [THEIRS]: y,
            _block: i,
          };
          this.conflicts.push(c);
          merged.set(varr, c);
        } else if (val !== null) {
          let src = null;
          for (const k of [OURS, THEIRS, "base"]) {
            const e = voicing(k, vers[k], varr, vers.base);
            if (vtext(e) === val) {
              src = e;
              break;
            }
          }
          merged.set(varr, src);
        }
      }
      this.bvoicings.set(i, merged);
      const nb = vers.base !== null ? vers.base.notes : [];
      const no = vers[OURS] !== null ? vers[OURS].notes : [];
      const nt = vers[THEIRS] !== null ? vers[THEIRS].notes : [];
      const eq = (x, y) => x === y;
      const notes = mergeSequence(nb, no, nt, eq, eq, eq, "conflict");
      for (const pc of notes) {
        if (pc[0] === "conflict") {
          this.conflicts.push({
            kind: "block-notes",
            tuning,
            variation: this.blockName(i),
            base: [...pc[1]],
            [OURS]: [...pc[2]],
            [THEIRS]: [...pc[3]],
            _pc: pc,
          });
        }
      }
      this.bnotes.set(i, notes);
    }
    for (const [i, c] of this.blockConflict.entries()) {
      c.tuning = this.bspell.get(i);
      c.variation = this.blockName(i);
      c._block = i;
      for (const k of ["base", OURS, THEIRS]) {
        const blk = blocks[k].get(i);
        c[k] = blk !== undefined ? this.sideBlockLines(k, blk).join("\n") : null;
      }
      this.conflicts.push(c);
    }
  }

  blockName(i) {
    const [name, names] = this.bname.get(i);
    if (name === CONFLICT || name === null) {
      const sides = [OURS, THEIRS].map((k) => names[k]).filter((v) => v !== null && v !== undefined);
      return sides.length ? [...sides].sort(cmpCodePoints)[0] : names.base;
    }
    return name;
  }

  blockSort(i) {
    const name = this.bname.has(i) ? this.blockName(i) : i[1];
    let spell = this.bspell.get(i);
    if (spell === undefined || spell === null) {
      for (const k of ["base", OURS, THEIRS]) {
        if (this.blk[k].has(i)) {
          spell = this.blk[k].get(i).tuning.text;
          break;
        }
      }
    }
    return `## ${name || "Voicings"}: ${spell}`;
  }

  blockOrder() {
    const B = this.v.base.blocks.map((b) => this.renameId("base", b));
    const O = this.v[OURS].blocks.map((b) => this.renameId(OURS, b));
    const T = this.v[THEIRS].blocks.map((b) => this.renameId(THEIRS, b));
    for (const i of new TSet([...B, ...O, ...T]).values()) {
      if (!this.bspell.has(i)) {
        if (!this.bname.has(i)) this.bname.set(i, [i[1], { base: i[1] }]);
      }
    }
    const seq = keyedOrder(B, O, T, this.blockIn, (i) => this.blockSort(i));
    const tunings = [];
    for (const i of seq) if (!tunings.includes(i[0])) tunings.push(i[0]);
    return [...seq].sort((a, b) =>
      cmp(
        [tunings.indexOf(a[0]), this.blockName(a) !== "", indexOfVal(seq, a)],
        [tunings.indexOf(b[0]), this.blockName(b) !== "", indexOfVal(seq, b)],
      ),
    );
  }

  renameId(version, blk) {
    const i = [blk.tuning.id, blk.label];
    if (version === "base") return i;
    return this.rename[version].has(i) ? this.rename[version].get(i) : i;
  }

  sideBlockLines(version, blk) {
    const lines = [`## ${blk.label || "Voicings"}: ${blk.tuning.text}`];
    const rows = [];
    for (const varr of this.variants) {
      const baseBlock = version !== "base" ? this.blk.base.get(this.renameId(version, blk)) ?? null : null;
      const e = this.voicing(version, blk, varr, baseBlock);
      if (e !== null && e !== undefined) {
        const k = this.variantKey(varr[0], varr[1]);
        rows.push([k, `- ${keyText(k)}: ${this.vtext(e)}`]);
      }
    }
    rows.sort((a, b) => cmp(a[0], b[0]));
    for (const r of rows) lines.push(r[1]);
    lines.push(...blk.notes);
    return lines;
  }

  // --- building the result (§11.11) and the marked text (§11.12.2) ---
  realise(pc) {
    const u = pc[2];
    if (u.kind[0] === "fence") return ["fence", u.kind[1]];
    if (u.kind[0] !== "music") return ["line", u.kind, u.text];
    const line = clone(u.line);
    const groups = this.unitVars.get(this.pieceId(pc));
    chordsOf(line).forEach((it, idx) => {
      const grp = groups[idx][1];
      const [sym, i] = this.variantKey(it.symbol, grp);
      it.index = i;
      it.key = keyFor(sym, i);
    });
    if (line.kind === "sung") converge(line, lyricText(line), this.dialect);
    return ["line", u.kind, line];
  }

  unitLines(r) {
    if (r[0] === "fence") return ["```" + r[1]];
    if (r[1][0] === "music") return musicLines([r[2]], this.dialect);
    return [r[2]];
  }

  unitString(r) {
    return this.unitLines(r).join("\n");
  }

  static toParts(seq) {
    const parts = [];
    for (const el of seq) {
      let kind;
      let item;
      if (!Array.isArray(el)) {
        kind = el.kind;
        item = el;
      } else if (el[0] === "fence") {
        const info = el[1];
        parts.push(info ? { type: "verbatim", info, lines: [] } : { type: "music", lines: [] });
        continue;
      } else {
        kind = el[1];
        item = el[2];
      }
      const want = { notes: "notes", music: "music", verbatim: "verbatim" }[kind[0]];
      let cur = parts.length ? parts[parts.length - 1] : null;
      if (cur === null || cur.type !== want || (want === "verbatim" && cur.info !== kind[1])) {
        cur = { type: want, lines: [] };
        if (want === "verbatim") cur.info = kind[1];
        parts.push(cur);
      }
      cur.lines.push(item);
    }
    return parts;
  }

  sectionModel(heading, seq) {
    const [form, name, anchor, times] = heading;
    const s = {
      name: name || "",
      heading: form === "none" || form === null ? null : form,
      anchor,
      body: [],
      groups: [],
    };
    if (times !== null && times !== undefined) s.times = times;
    for (const part of SongMerge.toParts(seq)) {
      if (part.type === "notes") {
        s.body.push({ type: "notes", text: part.lines.join("\n"), _lines: part.lines });
      } else if (part.type === "verbatim") {
        s.body.push({
          type: "verbatim",
          info: part.info,
          text: part.lines.every((x) => typeof x === "string") ? part.lines.join("\n") : "",
          _lines: part.lines,
        });
      } else {
        s.body.push({ type: "music", lines: part.lines });
      }
    }
    return s;
  }

  sideSections(side, secs) {
    return secs.map((sec) => this.sectionModel(sec.heading, sec.units.map((u) => this.realise(["one", side, u]))));
  }

  sectionText(s, dialect = null) {
    const blocks = chartBlocks([s], dialect || this.dialect);
    return blocks.map((b) => b.join("\n")).join("\n\n");
  }

  mergedSections() {
    const out = [];
    for (const ms of this.chart) {
      if (ms.type === "conflict") {
        const c = {
          kind: "sections",
          base: ms.base.map((s) => this.sectionText(s.model, this.v.base.dialect)),
        };
        const o = this.sideSections(OURS, ms[OURS]);
        const t = this.sideSections(THEIRS, ms[THEIRS]);
        c[OURS] = o.map((s) => this.sectionText(s));
        c[THEIRS] = t.map((s) => this.sectionText(s));
        this.conflicts.push(c);
        out.push(["region", c, o, t]);
        continue;
      }
      const seq = [];
      const regions = [];
      let whole = false;
      for (const pc of ms.body) {
        if (pc[0] === "conflict") {
          const ro = pc[2].map((u) => this.realise(["one", OURS, u]));
          const rt = pc[3].map((u) => this.realise(["one", THEIRS, u]));
          const kindSet = new TSet();
          for (const r of [...ro, ...rt]) {
            kindSet.add(r[0] === "line" ? (r[1][0] === "music" ? ["music"] : r[1]) : ["fence"]);
          }
          const kinds = kindSet.values();
          const c = {
            kind: "chart",
            base: pc[1].map((u) => u.text),
            [OURS]: ro.map((r) => this.unitString(r)),
            [THEIRS]: rt.map((r) => this.unitString(r)),
          };
          if (kinds.length !== 1 || kinds[0][0] === "fence") whole = true;
          regions.push(c);
          seq.push({ region: c, kind: kinds[0], [OURS]: ro, [THEIRS]: rt });
        } else {
          seq.push(this.realise(pc));
        }
      }
      const hc = ms.hconflict;
      if (hc !== null && [ms.sides[OURS], ms.sides[THEIRS]].some((h) => h[0] === "bracket" || h[0] === "label")) {
        whole = true;
      }
      if (whole) {
        const way = (side) => {
          const h = hc !== null ? hc["_" + side] : ms.heading;
          const sq = [];
          for (const el of seq) {
            if (!Array.isArray(el)) sq.push(...el[side]);
            else sq.push(el);
          }
          return this.sectionModel(h, sq);
        };
        const o = way(OURS);
        const t = way(THEIRS);
        const base = ms.base;
        const c = {
          kind: "sections",
          base: base !== null ? [this.sectionText(base.model, this.v.base.dialect)] : [],
          [OURS]: [this.sectionText(o)],
          [THEIRS]: [this.sectionText(t)],
        };
        this.conflicts.push(c);
        out.push(["region", c, [o], [t]]);
        continue;
      }
      for (const c of regions) this.conflicts.push(c);
      if (hc !== null) this.conflicts.push(hc);
      let heading = ms.heading;
      if (hc !== null) {
        heading = heading.map((f) => (f === CONFLICT ? null : f));
        const form = hc._ours[0] === hc._theirs[0] ? hc._ours[0] : "markdown";
        heading = [form, heading[1], heading[2], heading[3]];
      }
      const model = this.sectionModel(heading, seq);
      model._hconflict = hc;
      out.push(["section", model]);
    }
    return out;
  }

  resultModel() {
    const props = this.propertyOrder().map((k) => ({ key: k, value: this.propValue.get(k) }));
    const sections = this.sectionsOut.map((m) => m[1]);
    for (const s of sections) {
      for (const part of s.body) delete part._lines;
      delete s._hconflict;
    }
    const blocks = [];
    for (const i of this.blockOrder()) {
      const vers = this.bvoicings.get(i);
      const blk = { label: this.bname.get(i)[0], tuning: { ...this.anyBlock(i).tuning }, voicings: [], notes: [] };
      blk.tuning.text = this.bspell.get(i);
      for (const [varr, e] of vers.entries()) {
        const [sym, idx] = this.variantKey(varr[0], varr[1]);
        const item = { key: keyFor(sym, idx), symbol: sym, index: idx, frets: e.frets };
        if ("fingers" in e) item.fingers = e.fingers;
        blk.voicings.push(item);
      }
      blk.notes = this.bnotes.get(i).map((pc) => (pc[0] === "both" || pc[0] === "common" ? pc[1] : pc[2]));
      blocks.push(blk);
    }
    return {
      title: this.title,
      properties: props,
      sections,
      blocks,
      sung: false,
      sungAt: null,
      diagnostics: [],
    };
  }

  anyBlock(i) {
    for (const k of [OURS, THEIRS, "base"]) {
      if (this.blk[k].has(i)) return this.blk[k].get(i);
    }
    return undefined;
  }

  result() {
    const text = serialize(canonical(this.resultModel()));
    return canonicalSongText(text);
  }

  // --- the marked text (§11.12.2) ---
  marked() {
    const blocks = [];
    const meta = [];
    if (this.titleConflict !== null) {
      const c = this.titleConflict;
      meta.push(...region(c, c[OURS] ? [headingLine(1, c[OURS])] : [], c[THEIRS] ? [headingLine(1, c[THEIRS])] : []));
    } else if (this.title) {
      meta.push(headingLine(1, this.title));
    }
    for (const k of this.propertyOrder()) {
      if (this.propConflict.has(k)) {
        const c = this.propConflict.get(k);
        const line = (v) => (v !== null && v !== undefined ? [v ? `- ${k}: ${v}` : `- ${k}:`] : []);
        meta.push(...region(c, line(c[OURS]), line(c[THEIRS])));
      } else {
        const v = this.propValue.get(k);
        meta.push(v ? `- ${k}: ${v}` : `- ${k}:`);
      }
    }
    if (meta.length) blocks.push(meta);
    blocks.push(...this.markedChart());
    const vb = this.markedVoicings();
    if (vb.length) {
      blocks.push(["---"]);
      blocks.push(...vb);
    }
    return finishMarked(blocks, this.conflicts);
  }

  markedPartLines(part) {
    const out = [];
    if (part.type === "music") {
      for (const el of part.lines) {
        if (el && typeof el === "object" && !Array.isArray(el) && "region" in el) {
          out.push(
            ...region(
              el.region,
              el[OURS].flatMap((r) => this.unitLines(r)),
              el[THEIRS].flatMap((r) => this.unitLines(r)),
            ),
          );
        } else {
          out.push(...musicLines([el], this.dialect));
        }
      }
      return out;
    }
    let plain = [];
    for (const el of part._lines) {
      if (el && typeof el === "object") {
        out.push(...(part.type === "verbatim" ? plain : collapse(plain)));
        plain = [];
        let ol = el[OURS].map((r) => r[2]);
        let tl = el[THEIRS].map((r) => r[2]);
        if (part.type === "notes") {
          ol = collapse(ol);
          tl = collapse(tl);
        }
        out.push(...region(el.region, ol, tl));
      } else {
        plain.push(el);
      }
    }
    out.push(...(part.type === "verbatim" ? plain : collapse(plain)));
    return out;
  }

  markedChart() {
    const blocks = [];
    let openFence = null;
    const flush = () => {
      if (openFence !== null) {
        blocks.push(fence(openFence));
        openFence = null;
      }
    };
    const partBlock = (part) => {
      const lines = this.markedPartLines(part);
      if (part.type === "notes") return lines;
      if (part.type === "verbatim") return fence(lines, part.info);
      return fence(lines);
    };
    for (const item of this.sectionsOut) {
      if (item[0] === "region") {
        flush();
        const c = item[1];
        const o = item[2];
        const t = item[3];
        const sideLines = (models) => {
          const lines = [];
          models.forEach((s, k) => {
            if (k) lines.push("");
            lines.push(...this.sectionText(s).split("\n"));
          });
          return lines;
        };
        blocks.push(region(c, sideLines(o), sideLines(t)));
        continue;
      }
      const s = item[1];
      const hc = s._hconflict;
      if (s.heading === "bracket" || s.heading === "label") {
        let head = s.heading === "bracket" ? `[${headingName(s)}]` : `${s.name}:`;
        const body = s.body;
        let joined = false;
        const first = body.length && body[0].type === "music" ? body[0].lines : [];
        if (first.length && !("region" in first[0]) && first[0].kind === "chart") {
          const text = chartLineText(first[0], this.dialect);
          if (s.heading === "bracket" && !COUNT.test(text)) {
            head = `${head} ${text}`;
            joined = true;
          } else if (s.heading === "label" && isChordRun(text, this.dialect)) {
            head = `${head} ${text}`;
            joined = true;
          }
        }
        openFence = openFence === null ? [head] : [...openFence, "", head];
        body.forEach((part, idx) => {
          if (part.type === "music" && idx === 0) {
            const p2 = { ...part };
            p2.lines = joined ? part.lines.slice(1) : part.lines;
            openFence.push(...this.markedPartLines(p2));
          } else if (part.type === "music" && part.lines.length) {
            flush();
            openFence = this.markedPartLines(part);
          } else {
            flush();
            blocks.push(partBlock(part));
          }
        });
        continue;
      }
      flush();
      let parts = s.body.map((p) => partBlock(p));
      let head;
      if (hc !== null && hc !== undefined) {
        head = region(hc, hc[OURS] !== null && hc[OURS] !== undefined ? [hc[OURS]] : [], hc[THEIRS] !== null && hc[THEIRS] !== undefined ? [hc[THEIRS]] : []);
      } else if (s.heading === "markdown") {
        head = [headingLine(2, headingName(s))];
      } else {
        head = [];
      }
      if (head.length) {
        if (parts.length) parts[0] = [...head, ...parts[0]];
        else parts = [head];
      }
      blocks.push(...parts);
    }
    flush();
    return blocks;
  }

  markedVoicings() {
    const out = [];
    for (const i of this.blockOrder()) {
      if (this.blockConflict.has(i)) {
        const c = this.blockConflict.get(i);
        const o = c[OURS] !== null && c[OURS] !== undefined ? c[OURS].split("\n") : [];
        const t = c[THEIRS] !== null && c[THEIRS] !== undefined ? c[THEIRS].split("\n") : [];
        out.push(region(c, o, t));
        continue;
      }
      const [name, names] = this.bname.get(i);
      const tuning = this.bspell.get(i);
      let lines;
      if (name === CONFLICT) {
        const c = this.conflicts.find((x) => x.kind === "variation" && eqv(x._block, i));
        lines = region(
          c,
          [`## ${names[OURS] || "Voicings"}: ${tuning}`],
          [`## ${names[THEIRS] || "Voicings"}: ${tuning}`],
        );
      } else {
        lines = [`## ${name || "Voicings"}: ${tuning}`];
      }
      const rows = [];
      for (const [varr, e] of this.bvoicings.get(i).entries()) {
        const k = this.variantKey(varr[0], varr[1]);
        if (e && typeof e === "object" && e.kind === "voicing") {
          const c = e;
          const itemLine = (v) => (v !== null && v !== undefined ? [`- ${keyText(k)}: ${v}`] : []);
          rows.push([k, region(c, itemLine(c[OURS]), itemLine(c[THEIRS]))]);
        } else {
          rows.push([k, [`- ${keyText(k)}: ${this.vtext(e)}`]]);
        }
      }
      rows.sort((a, b) => cmp(a[0], b[0]));
      for (const r of rows) lines.push(...r[1]);
      for (const pc of this.bnotes.get(i)) {
        if (pc[0] === "conflict") {
          const c = this.conflicts.find((x) => x._pc === pc);
          lines.push(...region(c, [...pc[2]], [...pc[3]]));
        } else {
          lines.push(pc[0] === "both" || pc[0] === "common" ? pc[1] : pc[2]);
        }
      }
      out.push(lines);
    }
    return out;
  }
}

function collapse(lines) {
  const out = [];
  for (const ln of lines) {
    if (ln === "" && out.length && out[out.length - 1] === "") continue;
    out.push(ln);
  }
  return out;
}

// Imported here (rather than at the top) to avoid a static import cycle between
// merge.js and setlist_merge.js, which imports this module's helpers.
import { canonicalSetlistText, mergeSetlists } from "./setlist_merge.js";
