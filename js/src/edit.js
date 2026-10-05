// The editing operations of spec §8.5: the five changes a writer makes to a
// song's voicings, so that "two writers make the same change to the same
// document" (§8.5 lines 414–417). This is the app's write path for arranging —
// what the arrange mode and the chord wizard call.
//
// There is nothing to port: the Python reference implements the reader, the
// writer, setlists and merge only — not §8.5 — and the corpus has no editing
// fixture (cifra_js.editing refinement §Decisions). So this module is the first
// implementation of §8.5, written against the specification prose, reusing the
// one shared, corpus-proven seam: the canonical writer's §8.3 pass. Each
// operation performs only its targeted §8.5 edit and returns a new, mutated
// model; the caller hands the result to `write`/`canonical` (write.js), under
// which the renumbering (I2), merging (I3) and pruning (I1) of §8.3 fall out of
// the already-proven writer rather than being re-derived here (§8.5 lines
// 418–419; refinement §Decisions "Operations do not self-canonicalise").
//
// Framework-free and zero runtime dependencies (DIRECTION §3.6–§3.7): plain ES
// module code below the view, a sibling of setlist.js. It knows nothing of
// React, storage or the network, and never imports, transpiles or shells out to
// the Python reference or the Go module — implementations agree by the corpus
// and the spec, never by shared code. Like setlist.js's §10.10 operations it
// deep-clones the document and returns a new model, mutating nothing in place.

import { keyFor } from "./parse.js";
import { parseTuning } from "./tuning.js";

// A stable deep copy that preserves key order; the model is plain JSON, as in
// setlist.js and write.js.
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// A tuning input is a tuning text or a parsed `{ text, pitches, id }`; either
// way it is resolved to a block by its `id` (§6.3). Callers that hold text can
// also build the parsed form with the exported parseTuning themselves.
function resolveTuning(tuning) {
  return typeof tuning === "string" ? parseTuning(tuning) : tuning;
}

// A voicing key is `{ symbol, index }` or the keyFor string (`symbol`, or
// `symbol[index]` for index > 1). The symbol is text, compared and carried
// character for character (§2.4, §7.4); this never respells it.
function resolveKey(key) {
  if (typeof key !== "string") return { symbol: key.symbol, index: key.index ?? 1 };
  const m = /^(.+)\[(\d+)\]$/.exec(key);
  if (m) return { symbol: m[1], index: Math.max(parseInt(m[2], 10), 1) };
  return { symbol: key, index: 1 };
}

function occKey(o) {
  return `${o.section}.${o.part}.${o.line}.${o.measure}.${o.item}`;
}

// The chord item at an occurrence's index path into the model (refinement
// §Decisions: an occurrence is `{ section, part, line, measure, item }`).
function itemAt(doc, o) {
  return doc.sections[o.section].body[o.part].lines[o.line].measures[o.measure].items[o.item];
}

// Every chord occurrence of the document, each as its index path and the item
// it points at, in document order.
function chordOccurrences(doc) {
  const out = [];
  doc.sections.forEach((s, section) => {
    s.body.forEach((part, p) => {
      if (part.type !== "music") return;
      part.lines.forEach((line, l) => {
        (line.measures || []).forEach((m, measure) => {
          m.items.forEach((it, item) => {
            if (it.type === "chord") {
              out.push({ occ: { section, part: p, line: l, measure, item }, item: it });
            }
          });
        });
      });
    });
  });
  return out;
}

// The indices a symbol is used with in the chart.
function usedIndices(doc, symbol) {
  const set = new Set();
  for (const { item } of chordOccurrences(doc)) if (item.symbol === symbol) set.add(item.index);
  return set;
}

// The smallest positive index of a symbol not used anywhere in the chart.
function smallestUnusedIndex(doc, symbol) {
  const used = usedIndices(doc, symbol);
  let n = 1;
  while (used.has(n)) n += 1;
  return n;
}

function arrEq(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

// Two shapes are the same when their frets and their fingerings agree; a missing
// fingering counts as null (§8.3 I3; mirrors write.js's `sameShape`).
function shapeEq(a, b) {
  return arrEq(a.frets, b.frets) && arrEq(a.fingers ?? null, b.fingers ?? null);
}

// The block for a tuning and variation, or null. `variation` is the block label,
// `""` the default (§7.3).
function findBlock(doc, tuningId, variation) {
  return doc.blocks.find((b) => b.tuning.id === tuningId && b.label === variation) || null;
}

// The target block, created empty when absent — a shape-setting op on a song
// with no block for that tuning and variation makes one (refinement §Decisions:
// "A shape-setting op creates its target block when absent"). A new block reuses
// an existing block's tuning object for the same `id`, so its written tuning
// text stays the one first used for that tuning (§8.4.6).
function ensureBlock(doc, tuning, variation) {
  const found = findBlock(doc, tuning.id, variation);
  if (found) return found;
  const sibling = doc.blocks.find((b) => b.tuning.id === tuning.id);
  const block = { label: variation, tuning: clone(sibling ? sibling.tuning : tuning), voicings: [], notes: [] };
  doc.blocks.push(block);
  return block;
}

function entryFor(block, symbol, index) {
  return block ? block.voicings.find((e) => e.symbol === symbol && e.index === index) || null : null;
}

// A voicing entry in the reader's shape: `{ key, symbol, index, frets }`, with
// `fingers` only when the shape has one. Only the shape it is given is written —
// never an application's default (§8.3 I4): the shape is an input, so the caller
// owns that.
function entryOf(symbol, index, shape) {
  const e = { key: keyFor(symbol, index), symbol, index, frets: [...shape.frets] };
  if (shape.fingers) e.fingers = [...shape.fingers];
  return e;
}

// Set the block's entry for (symbol, index) to the shape, in place, keeping the
// entry's position when it already exists.
function setEntry(block, symbol, index, shape) {
  const existing = entryFor(block, symbol, index);
  const e = entryOf(symbol, index, shape);
  if (existing) block.voicings[block.voicings.indexOf(existing)] = e;
  else block.voicings.push(e);
}

// Rewrite an occurrence's token to an index, keeping its key string in step
// (§2.4); the symbol and the chord are unchanged.
function setIndex(item, index) {
  item.index = index;
  item.key = keyFor(item.symbol, index);
}

// Does a block tell indices i and j of a symbol apart (§8.3 I3)? A block that
// has a shape for one and not the other tells them apart, and so does one that
// gives them different shapes; a block with neither does not.
function tellsApart(block, symbol, i, j) {
  if (i === j) return false;
  const a = entryFor(block, symbol, i);
  const c = entryFor(block, symbol, j);
  if (!a && !c) return false;
  if (!a || !c) return true;
  return !shapeEq(a, c);
}

// Any block other than the target that tells i from j (§8.3 I3): the "no other
// block tells i from j" predicate of §8.5.1 step 2 and §8.5.4 step 2.
function otherBlockTellsApart(doc, block, symbol, i, j) {
  return doc.blocks.some((b) => b !== block && tellsApart(b, symbol, i, j));
}

// §8.5.1 step 2 / §8.5.2 step 2: the smallest other index j of the symbol used
// in the chart that already carries the given shape in this block and that no
// other block tells i from, or null when there is none.
function reusableIndex(doc, block, symbol, i, shape) {
  for (const j of [...usedIndices(doc, symbol)].sort((a, b) => a - b)) {
    if (j === i) continue;
    const ej = entryFor(block, symbol, j);
    if (!ej || !shapeEq(ej, shape)) continue;
    if (!otherBlockTellsApart(doc, block, symbol, i, j)) return j;
  }
  return null;
}

// --- §8.5.1 Choose a shape for one occurrence -------------------------------

// Give one chart position a shape in one tuning's variation (§8.5.1 lines
// 427–444). Its four branches, in order: (1) the block already has the shape for
// (S, i) — nothing changes; (2) another used index j has the shape and no other
// block tells i from j — the token is rewritten to j, the shape reused; (3) the
// occurrence is the only one with index i, or (S, i) has no shape yet — the
// block's entry for (S, i) becomes the shape; (4) otherwise — the token moves to
// the smallest index of S not used in the chart and the block gets that entry.
export function chooseShapeForOccurrence(doc, occurrence, tuning, variation, shape) {
  const d = clone(doc);
  const v = variation ?? "";
  const block = ensureBlock(d, resolveTuning(tuning), v);
  const item = itemAt(d, occurrence);
  const S = item.symbol;
  const i = item.index;

  const cur = entryFor(block, S, i);
  if (cur && shapeEq(cur, shape)) return d; // 1

  const j = reusableIndex(d, block, S, i, shape);
  if (j !== null) { // 2
    setIndex(item, j);
    return d;
  }

  const only = chordOccurrences(d).filter((o) => o.item.symbol === S && o.item.index === i).length === 1;
  if (only || !cur) { // 3
    setEntry(block, S, i, shape);
  } else { // 4
    const n = smallestUnusedIndex(d, S);
    setIndex(item, n);
    setEntry(block, S, n, shape);
  }
  return d;
}

// --- §8.5.2 Choose a shape for a key ----------------------------------------

// Give every occurrence of a voicing key a shape, moving them together (§8.5.2
// lines 446–451). Steps 1 and 2 of §8.5.1 apply, read over all occurrences with
// the key; otherwise the block's entry for the key becomes the shape.
export function chooseShapeForKey(doc, key, tuning, variation, shape) {
  const d = clone(doc);
  const v = variation ?? "";
  const block = ensureBlock(d, resolveTuning(tuning), v);
  const { symbol: S, index: i } = resolveKey(key);

  const cur = entryFor(block, S, i);
  if (cur && shapeEq(cur, shape)) return d; // 1

  const j = reusableIndex(d, block, S, i, shape);
  if (j !== null) { // 2
    for (const { item } of chordOccurrences(d)) {
      if (item.symbol === S && item.index === i) setIndex(item, j);
    }
    return d;
  }

  setEntry(block, S, i, shape); // otherwise
  return d;
}

// --- §8.5.3 Clear a key -----------------------------------------------------

// Remove the block's entry for a key (§8.5.3 lines 453–460). The marker stays in
// the chart — the variant may still mean something on another instrument — and
// goes away only if the canonical form's I3 then finds its index the same as a
// lower one. A clear never creates a block.
export function clearKey(doc, key, tuning, variation) {
  const d = clone(doc);
  const v = variation ?? "";
  const block = findBlock(d, resolveTuning(tuning).id, v);
  if (!block) return d;
  const { symbol: S, index: i } = resolveKey(key);
  block.voicings = block.voicings.filter((e) => !(e.symbol === S && e.index === i));
  return d;
}

// --- §8.5.4 Choose shapes for many occurrences at once ----------------------

// The batch an arrangement tool produces (§8.5.4 lines 462–484), computed in one
// pass — NOT a loop of §8.5.1 (lines 465–468: rewriting one token shifts later
// positions, and renumbering between steps moves the indices later steps aim
// at). For each symbol: occurrences the plan does not mention keep their index
// and those indices are reserved; planned occurrences are grouped by shape,
// except that two whose current indices another block tells apart are never put
// in one group; each group takes the smallest of its members' current indices
// that is not reserved (so a plan that agrees with the document rewrites
// nothing), failing that the smallest unused index. All assignments are computed
// from the original indices and applied together, so a model path never shifts
// under another step's rewrite.
//
// `plan` is an array of `{ occurrence, shape }`.
export function chooseShapes(doc, plan, tuning, variation) {
  const d = clone(doc);
  if (!plan || plan.length === 0) return d;
  const v = variation ?? "";
  const block = ensureBlock(d, resolveTuning(tuning), v);

  const planned = plan.map((p) => {
    const item = itemAt(d, p.occurrence);
    return { occ: p.occurrence, shape: p.shape, item, symbol: item.symbol, index: item.index };
  });
  const plannedKeys = new Set(planned.map((p) => occKey(p.occ)));

  const bySymbol = new Map();
  for (const p of planned) {
    if (!bySymbol.has(p.symbol)) bySymbol.set(p.symbol, []);
    bySymbol.get(p.symbol).push(p);
  }

  const cmpOcc = (a, b) =>
    a.section - b.section || a.part - b.part || a.line - b.line || a.measure - b.measure || a.item - b.item;

  for (const [S, occs] of bySymbol) {
    const used = usedIndices(d, S);
    const reserved = new Set();
    for (const { occ, item } of chordOccurrences(d)) {
      if (item.symbol === S && !plannedKeys.has(occKey(occ))) reserved.add(item.index);
    }

    // Group by shape under the I3 constraint, taking occurrences in a stable
    // order (current index, then document position) so the grouping is
    // deterministic.
    occs.sort((a, b) => a.index - b.index || cmpOcc(a.occ, b.occ));
    const groups = [];
    for (const o of occs) {
      let g = groups.find(
        (grp) =>
          shapeEq(grp.shape, o.shape) &&
          grp.members.every((m) => !otherBlockTellsApart(d, block, S, o.index, m.index)),
      );
      if (!g) {
        g = { shape: o.shape, members: [] };
        groups.push(g);
      }
      g.members.push(o);
    }

    // Assign indices, the group with the smallest member index first so a
    // document-agreeing plan keeps its indices.
    groups.sort((a, b) => Math.min(...a.members.map((m) => m.index)) - Math.min(...b.members.map((m) => m.index)));
    const taken = new Set();
    for (const g of groups) {
      const memberIdx = [...new Set(g.members.map((m) => m.index))].sort((a, b) => a - b);
      let chosen = memberIdx.find((idx) => !reserved.has(idx) && !taken.has(idx));
      if (chosen === undefined) {
        let n = 1;
        while (taken.has(n) || reserved.has(n) || used.has(n)) n += 1;
        chosen = n;
      }
      taken.add(chosen);
      g.finalIndex = chosen;
    }

    // Apply: the block gets each group's shape under its index, and every
    // member's token is rewritten to it.
    for (const g of groups) {
      setEntry(block, S, g.finalIndex, g.shape);
      for (const m of g.members) setIndex(m.item, g.finalIndex);
    }
  }
  return d;
}

// --- §8.5.5 Add a variation -------------------------------------------------

// Create a new voicing block for a tuning and name (§8.5.5 lines 486–491), empty
// or copied from another variation of the same tuning. `name` is the block label
// (`""` the default). `copyFrom`, when given, is the label of the variation to
// copy. Refuses (throws) rather than silently landing the user in an existing
// block for that tuning and name.
export function addVariation(doc, tuning, name, copyFrom) {
  const d = clone(doc);
  const t = resolveTuning(tuning);
  const label = name ?? "";
  if (findBlock(d, t.id, label)) {
    throw new Error(`a block for this tuning and ${label === "" ? "the default variation" : `variation "${label}"`} already exists`);
  }
  let voicings = [];
  if (copyFrom != null) {
    const source = findBlock(d, t.id, copyFrom);
    if (!source) {
      throw new Error(`no ${copyFrom === "" ? "default variation" : `variation "${copyFrom}"`} for this tuning to copy`);
    }
    voicings = clone(source.voicings);
  }
  const sibling = d.blocks.find((b) => b.tuning.id === t.id);
  d.blocks.push({ label, tuning: clone(sibling ? sibling.tuning : t), voicings, notes: [] });
  return d;
}
