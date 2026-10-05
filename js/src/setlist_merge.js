// The merge of setlists (spec §11.13). A port of the reference's
// reference/cifra_md/setlist_merge.py — never imported from it: agreement is by
// the corpus, not shared code (DIRECTION §3.6). `merge` in merge.js calls
// `mergeSetlists` with the three canonical texts once whole files, unreadable
// inputs, marked inputs and unchanged sides are dealt with (§11.2 to §11.4): a
// setlist that holds a marker line is never merged, as a song is not.
//
// Framework-free and zero runtime dependencies (DIRECTION §3.7): only the
// sibling js/src/ modules and language built-ins. A setlist merges as a song
// does, with less in it.

import {
  CONFLICT,
  Counter,
  OURS,
  SIDES,
  THEIRS,
  TMap,
  TSet,
  align,
  cmp,
  cmpCodePoints,
  eqv,
  finishMarked,
  keyedOrder,
  mergeValue,
  mkOutcome,
  pairsOf,
  region,
} from "./merge.js";
import {
  entryLine,
  itemContent,
  orderedEntries,
  parseSetlist,
  writePath,
  writeSetlist,
} from "./setlist.js";

// Literals (not the OURS/THEIRS bindings) so this top-level constant does not
// read merge.js's exports during the circular import between the two modules.
const VERSIONS = ["base", "ours", "theirs"];

// The text-level canonicaliser the merge compares and finishes with (the
// reference's `canonicalise_setlist(text) -> str`); the public, model-level
// `canonicalSetlist` in setlist.js is a different shape.
export function canonicalSetlistText(text) {
  return writeSetlist(parseSetlist(text));
}

// Identities of a list of entries: a property by its key, an unrecognised entry
// by its text and occurrence (§11.13).
export function entryIds(entries) {
  const out = [];
  const seen = new Counter();
  for (const e of entries) {
    if (e.type === "property") {
      out.push(["p", e.key]);
    } else {
      seen.inc(e.text);
      out.push(["u", e.text, seen.get(e.text)]);
    }
  }
  return out;
}

function entrySort(i) {
  return [i[1], i[0] === "u" ? i[2] : 0];
}

// An item's reference (§11.13): its path, or an unlinked item's content.
function reference(el) {
  return el.type === "song" ? ["song", el.path] : ["unlinked", el.content];
}

// The identities of a body, given those of its items in order: a notes block is
// identified by the item it follows (§11.13).
function withNotes(body, itemIds) {
  const out = [];
  let idx = 0;
  let last = null;
  for (const el of body) {
    if (el.type === "notes") {
      out.push(["notes", last]);
    } else {
      last = itemIds[idx];
      idx += 1;
      out.push(last);
    }
  }
  return out;
}

// Base's identities: each item's reference and its occurrence among base's items
// with that reference.
export function bodyIds(body) {
  const seen = new Counter();
  const ids = [];
  for (const el of body) {
    if (el.type !== "notes") {
      seen.inc(reference(el));
      ids.push([...reference(el), seen.get(reference(el))]);
    }
  }
  return withNotes(body, ids);
}

// A side's identities, from pairing its items with base's (§11.13): an alignment
// by reference and value, then one by reference within each stretch between its
// pairs, then what is left of each reference in order.
export function sideBodyIds(base, side) {
  const B = base.filter((el) => el.type !== "notes");
  const S = side.filter((el) => el.type !== "notes");
  const bids = bodyIds(base).filter((i) => i[0] !== "notes");
  const pair = new Map(); // side position -> base position
  const exact = (a, c) => eqv(reference(a), reference(c)) && eqv(itemValue(a), itemValue(c));
  for (const [i, j] of pairsOf(align(B, S, exact))) pair.set(j, i);
  const fixed = [...pair.entries()].map(([j, i]) => [i, j]).sort((a, b) => cmp(a, b));
  const bounds = [[-1, -1], ...fixed, [B.length, S.length]];
  for (let bi = 0; bi < bounds.length - 1; bi += 1) {
    const [i0, j0] = bounds[bi];
    const [i1, j1] = bounds[bi + 1];
    const sub = pairsOf(align(B.slice(i0 + 1, i1), S.slice(j0 + 1, j1), (a, c) => eqv(reference(a), reference(c))));
    for (const [i, j] of sub) pair.set(j0 + 1 + j, i0 + 1 + i);
  }
  const pairedBase = new Set(pair.values());
  const refsSeen = new TSet();
  const refs = [];
  for (const el of S) {
    const r = reference(el);
    if (!refsSeen.has(r)) {
      refsSeen.add(r);
      refs.push(r);
    }
  }
  for (const ref of refs) {
    const left = [];
    B.forEach((el, i) => {
      if (eqv(reference(el), ref) && !pairedBase.has(i)) left.push(i);
    });
    const right = [];
    S.forEach((el, j) => {
      if (eqv(reference(el), ref) && !pair.has(j)) right.push(j);
    });
    for (let k = 0; k < Math.min(left.length, right.length); k += 1) pair.set(right[k], left[k]);
  }
  const count = new Counter(B.map(reference));
  const neu = new Counter();
  const ids = [];
  S.forEach((el, j) => {
    if (pair.has(j)) {
      ids.push(bids[pair.get(j)]);
    } else {
      neu.inc(reference(el));
      ids.push([...reference(el), count.get(reference(el)) + neu.get(reference(el))]);
    }
  });
  return withNotes(side, ids);
}

// An item's identity as the JSON writes it: its path as written, or its content.
function itemName(i) {
  return i[0] === "song" ? writePath(i[1]) : i[1];
}

function itemString(item) {
  return [itemContent(item), ...orderedEntries(item.entries).map((e) => entryLine(e))].join("\n");
}

function itemValue(item) {
  const entries = orderedEntries(item.entries).map((e) => entryLine(e));
  return [item.text ?? null, entries];
}

// A keyed list of entries (§11.13): the setlist's own, or an item's.
class EntryMerge {
  constructor(versions, kind, conflicts, extra) {
    const ids = {};
    const by = {};
    const values = {};
    for (const k of VERSIONS) {
      const v = versions[k];
      ids[k] = v !== null && v !== undefined ? entryIds(v) : [];
      by[k] = new TMap();
      values[k] = new TMap();
      if (v !== null && v !== undefined) {
        ids[k].forEach((i, n) => {
          const e = v[n];
          by[k].set(i, e);
          values[k].set(i, e.type === "property" ? e.value : true);
        });
      }
    }
    this.inResult = new TSet();
    this.value = new TMap();
    this.conflict = new TMap();
    const allIds = new TSet([...ids.base, ...ids[OURS], ...ids[THEIRS]]);
    for (const i of allIds.values()) {
      const a = values.base.has(i) ? values.base.get(i) : null;
      const x = values[OURS].has(i) ? values[OURS].get(i) : null;
      const y = values[THEIRS].has(i) ? values[THEIRS].get(i) : null;
      let val;
      if (a === null || (x !== null && y !== null)) {
        this.inResult.add(i);
        val = mergeValue(a, x, y);
      } else if (x === null && y === null) {
        continue;
      } else {
        const kept = x !== null ? x : y;
        if (eqv(kept, a)) continue;
        this.inResult.add(i);
        val = CONFLICT;
      }
      this.value.set(i, val);
      if (val === CONFLICT) {
        const c = { kind, ...extra, key: i[1], base: a, [OURS]: x, [THEIRS]: y };
        if (kind === "property") delete c.item;
        this.conflict.set(i, c);
        conflicts.push(c);
      }
    }
    this.order = keyedOrder(ids.base, ids[OURS], ids[THEIRS], this.inResult, entrySort);
  }

  entries() {
    const out = [];
    for (const i of this.order) {
      if (i[0] === "p") out.push({ type: "property", key: i[1], value: this.value.get(i) });
      else out.push({ type: "unrecognised", text: i[1] });
    }
    return out;
  }

  lines(indent, item) {
    let order = this.order;
    if (item) {
      const first = [];
      for (const k of ["key", "note"]) for (const i of order) if (eqv(i, ["p", k])) first.push(i);
      const firstSet = new TSet(first);
      order = [...first, ...order.filter((i) => !firstSet.has(i))];
    }
    const out = [];
    for (const i of order) {
      if (this.conflict.has(i)) {
        const c = this.conflict.get(i);
        const side = (v) => (v !== null && v !== undefined ? [entryLine({ type: "property", key: i[1], value: v }, indent)] : []);
        out.push(...region(c, side(c[OURS]), side(c[THEIRS])));
      } else if (i[0] === "p") {
        out.push(entryLine({ type: "property", key: i[1], value: this.value.get(i) }, indent));
      } else {
        out.push(entryLine({ type: "unrecognised", text: i[1] }, indent));
      }
    }
    return out;
  }
}

class SetlistMerge {
  constructor(b, o, t) {
    this.m = { base: parseSetlist(b), [OURS]: parseSetlist(o), [THEIRS]: parseSetlist(t) };
    this.conflicts = [];
  }

  run() {
    const m = this.m;
    this.title = mergeValue(m.base.title, m[OURS].title, m[THEIRS].title);
    this.titleConflict = null;
    if (this.title === CONFLICT) {
      this.titleConflict = { kind: "title" };
      for (const k of VERSIONS) this.titleConflict[k] = m[k].title;
      this.conflicts.push(this.titleConflict);
    }
    const props = {};
    for (const k of VERSIONS) props[k] = m[k].properties;
    this.props = new EntryMerge(props, "property", this.conflicts, {});
    const ids = { base: bodyIds(m.base.body) };
    for (const k of SIDES) ids[k] = sideBodyIds(m.base.body, m[k].body);
    const by = {};
    for (const k of VERSIONS) {
      by[k] = new TMap();
      ids[k].forEach((i, n) => by[k].set(i, m[k].body[n]));
    }
    this.by = by;

    const value = (el) => {
      if (el === null || el === undefined) return null;
      return el.type === "notes" ? [...el.lines] : itemValue(el);
    };

    this.inResult = new TSet();
    this.presence = new TMap();
    const allIds = new TSet([...ids.base, ...ids[OURS], ...ids[THEIRS]]);
    for (const i of allIds.values()) {
      const a = value(by.base.get(i) ?? null);
      const x = value(by[OURS].get(i) ?? null);
      const y = value(by[THEIRS].get(i) ?? null);
      if (a === null || (x !== null && y !== null)) {
        this.inResult.add(i);
      } else if (x === null && y === null) {
        continue;
      } else {
        const kept = x !== null ? x : y;
        if (!eqv(kept, a)) {
          this.inResult.add(i);
          this.presence.set(i, x === null ? OURS : THEIRS);
        }
      }
    }
    this.order = keyedOrder(ids.base, ids[OURS], ids[THEIRS], this.inResult, (i) => this.sortKey(i));
    this.items = new TMap();
    for (const i of this.order) {
      const vers = { base: by.base.get(i) ?? null, [OURS]: by[OURS].get(i) ?? null, [THEIRS]: by[THEIRS].get(i) ?? null };
      if (this.presence.has(i)) {
        const c = { kind: i[0] === "notes" ? "notes" : "item", ...this.identityMembers(i) };
        for (const k of VERSIONS) {
          const el = vers[k];
          if (el !== null) c[k] = i[0] === "notes" ? el.lines.join("\n") : itemString(el);
        }
        this.conflicts.push(c);
        this.items.set(i, ["conflict", c]);
        continue;
      }
      if (i[0] === "notes") {
        const lines = mergeValue(
          vers.base !== null ? [...vers.base.lines] : null,
          vers[OURS] !== null ? [...vers[OURS].lines] : null,
          vers[THEIRS] !== null ? [...vers[THEIRS].lines] : null,
        );
        if (lines === CONFLICT) {
          const c = { kind: "notes", ...this.identityMembers(i) };
          for (const k of VERSIONS) if (vers[k] !== null) c[k] = vers[k].lines.join("\n");
          this.conflicts.push(c);
          this.items.set(i, ["conflict", c]);
        } else {
          this.items.set(i, ["notes", [...lines]]);
        }
        continue;
      }
      const extra = this.identityMembers(i);
      let text = null;
      let textConflict = null;
      if (i[0] === "song") {
        text = mergeValue(
          vers.base !== null ? vers.base.text : null,
          vers[OURS] !== null ? vers[OURS].text : null,
          vers[THEIRS] !== null ? vers[THEIRS].text : null,
        );
        if (text === CONFLICT) {
          textConflict = { kind: "text", ...extra };
          for (const k of VERSIONS) if (vers[k] !== null) textConflict[k] = vers[k].text;
          this.conflicts.push(textConflict);
        }
      }
      const entriesVersions = {};
      for (const k of VERSIONS) entriesVersions[k] = vers[k] !== null ? vers[k].entries : null;
      const entries = new EntryMerge(entriesVersions, "entry", this.conflicts, extra);
      this.items.set(i, ["item", text, textConflict, entries]);
    }
    if (!this.conflicts.length) return mkOutcome({ result: this.result() });
    return mkOutcome({ conflicts: this.conflicts, marked: this.marked() });
  }

  identityMembers(i) {
    if (i[0] === "notes") {
      const after = i[1];
      if (after === null) return {};
      const out = { after: itemName(after) };
      if (after[2] > 1) out.occurrence = after[2];
      return out;
    }
    const out = { item: itemName(i) };
    if (i[2] > 1) out.occurrence = i[2];
    return out;
  }

  // The sort string of an item or a notes block (§11.13), then what decides
  // between equal ones: an item first, the lower occurrence, a notes block that
  // is first, then the item a notes block follows.
  sortKey(i) {
    if (i[0] === "notes") {
      const first = VERSIONS.filter((k) => this.by[k].has(i))
        .map((k) => this.by[k].get(i).lines[0])
        .sort(cmpCodePoints)[0];
      const after = i[1];
      if (after === null) return [first, 1, 0, "", 0];
      return [first, 1, 1, this.sortKey(after)[0], after[2]];
    }
    const line = VERSIONS.filter((k) => this.by[k].has(i))
      .map((k) => itemContent(this.by[k].get(i)))
      .sort(cmpCodePoints)[0];
    return [line, 0, i[2], "", 0];
  }

  resultModel() {
    const body = [];
    let n = 0;
    for (const i of this.order) {
      const kind = this.items.get(i);
      if (kind[0] === "notes") {
        body.push({ type: "notes", lines: kind[1] });
        continue;
      }
      n += 1;
      const [, text, , entries] = kind;
      if (i[0] === "song") {
        body.push({ type: "song", number: n, text, path: i[1], entries: entries.entries() });
      } else {
        body.push({ type: "unlinked", number: n, content: i[1], entries: entries.entries() });
      }
    }
    return { title: this.title, properties: this.props.entries(), body, diagnostics: [] };
  }

  result() {
    return canonicalSetlistText(writeSetlist(this.resultModel()));
  }

  marked() {
    const parts = [];
    const meta = [];
    if (this.titleConflict !== null) {
      const c = this.titleConflict;
      meta.push(...region(c, c[OURS] ? [`# ${c[OURS]}`] : [], c[THEIRS] ? [`# ${c[THEIRS]}`] : []));
    } else if (this.title) {
      meta.push(`# ${this.title}`);
    }
    meta.push(...this.props.lines(0, false));
    if (meta.length) parts.push(meta);
    let run = null;
    let n = 0;

    const sideItem = (k, i, number) => {
      const el = this.by[k].get(i);
      if (el === undefined) return [];
      const content = itemContent(el);
      const indent = String(number).length + 2;
      return [`${number}.` + (content ? ` ${content}` : ""), ...orderedEntries(el.entries).map((e) => entryLine(e, indent))];
    };

    for (const i of this.order) {
      const kind = this.items.get(i);
      if (i[0] === "notes") {
        if (run !== null) {
          parts.push(run);
          run = null;
        }
        if (kind[0] === "conflict") {
          const c = kind[1];
          const side = (k) => (this.by[k].has(i) ? [...this.by[k].get(i).lines] : []);
          parts.push(region(c, side(OURS), side(THEIRS)));
        } else {
          parts.push([...kind[1]]);
        }
        continue;
      }
      if (run === null) run = [];
      if (kind[0] === "conflict") {
        const c = kind[1];
        const ol = sideItem(OURS, i, n + 1);
        const tl = sideItem(THEIRS, i, n + 1);
        run.push(...region(c, ol, tl));
        n += Math.max(ol.length ? 1 : 0, tl.length ? 1 : 0);
        continue;
      }
      n += 1;
      const [, text, textConflict, entries] = kind;
      const indent = String(n).length + 2;
      const head = (tx) => {
        const content = i[0] === "song" ? itemContent({ type: "song", text: tx, path: i[1] }) : i[1];
        return `${n}.` + (content ? ` ${content}` : "");
      };
      if (textConflict !== null) {
        run.push(...region(textConflict, [head(textConflict[OURS])], [head(textConflict[THEIRS])]));
      } else {
        run.push(head(text));
      }
      run.push(...entries.lines(indent, true));
    }
    if (run !== null) parts.push(run);
    return finishMarked(parts, this.conflicts);
  }
}

export function mergeSetlists(b, o, t) {
  return new SetlistMerge(b, o, t).run();
}
