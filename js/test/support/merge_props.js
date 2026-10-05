// Helpers for checking the properties of the merge (§11.3, §11.12.4). A port of
// the reference's reference/tests/merge_props.py — never shared code: agreement
// is by the corpus, not shared code (DIRECTION §3.6). The corpus harness
// (js/test/corpus/harness.js) carries byte-level copies of `regions`,
// `mirror_text`, `mirror_conflict` and `normal` for its reverse check against
// stored bytes; this module is the property suite's own structured version —
// `resolve`, `symmetric` and the §11.9.5 `unmarked` fallback the suite needs on
// top of them. Both read only the public merge outcome.

// The §11.12.5 member order and the pruning conflictJson does, so the mirror and
// normal transforms compare the public conflict members the corpus records
// (merge.py's conflict_json; a test-only copy, like the harness's).
const MEMBERS = [
  "kind", "line", "deleted", "unreadable", "item", "occurrence", "after",
  "tuning", "variation", "key", "changed", "symbols", "base", "ours", "theirs",
];

function conflictJson(c) {
  const out = {};
  for (const k of MEMBERS) {
    if (k in c && c[k] !== null && c[k] !== undefined) out[k] = c[k];
  }
  return out;
}

const OPEN = "<<<<<<< ours";
const MID = "=======";
const END = ">>>>>>> theirs";

// Split a marked text into plain lines and [ours, theirs] regions.
export function regions(marked) {
  const out = [];
  const lines = marked.split("\n");
  let k = 0;
  while (k < lines.length) {
    if (lines[k] === OPEN) {
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

// Resolve every region by one side (§11.12.4).
export function resolve(marked, side) {
  const out = [];
  for (const el of regions(marked)) {
    if (Array.isArray(el)) out.push(...(side === "ours" ? el[0] : el[1]));
    else out.push(el);
  }
  return out.join("\n");
}

export function mirrorText(marked) {
  const out = [];
  for (const el of regions(marked)) {
    if (Array.isArray(el)) out.push(OPEN, ...el[1], MID, ...el[0], END);
    else out.push(el);
  }
  return out.join("\n");
}

export function mirrorConflict(c) {
  const cj = conflictJson(c);
  const swap = { ours: "theirs", theirs: "ours" };
  const out = {};
  for (const [k, v0] of Object.entries(cj)) {
    const k2 = swap[k] || k;
    let v = v0;
    if (k === "changed" || k === "deleted") v = swap[v];
    if (k === "unreadable") v = ["base", "ours", "theirs"].filter((x) => v0.includes(swap[x] || x));
    out[k2] = v;
  }
  const res = {};
  for (const k of Object.keys(cj)) if (k in out) res[k] = out[k];
  for (const [k, v] of Object.entries(out)) if (!(k in cj)) res[k] = v;
  return res;
}

// A conflict's public members with keys in sorted order (merge_props.py
// `normal`), as a plain object so `unmarked` can recurse it.
export function normal(c) {
  const cj = conflictJson(c);
  const out = {};
  for (const k of Object.keys(cj).sort()) out[k] = cj[k];
  return out;
}

const MARKER = /\[[0-9]+\]/g;

// Footnote markers left out: for the one exception to symmetry (§11.9.5). A
// marker that grew may have pushed the words, so padding and spacing go too.
export function unmarked(x) {
  if (typeof x === "string") return x.replace(/[ _]/g, "").replace(MARKER, "");
  if (Array.isArray(x)) return x.map(unmarked);
  if (x && typeof x === "object") {
    const out = {};
    for (const [k, v] of Object.entries(x)) out[k] = unmarked(v);
    return out;
  }
  return x;
}

function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Is merging base, theirs, ours (r2) the mirror of base, ours, theirs (r)?
// Footnote markers are compared only where the §11.9.5 exception allows it.
export function symmetric(r, r2) {
  if (r.kind !== r2.kind) return false;
  if (r.kind === "result") return r.result === r2.result;
  if (r.kind === "deleted") return true;
  const a = r.conflicts.map((c) => normal(mirrorConflict(c)));
  const b = r2.conflicts.map((c) => normal(c));
  const ma = r.marked === null ? null : mirrorText(r.marked);
  const r2marked = r2.marked ?? null;
  if (eq(a, b) && ma === r2marked) return true;
  return eq(unmarked(a), unmarked(b)) && eq(unmarked(ma), unmarked(r2marked));
}
