// Spec §11.3: the properties of the merge, over generated documents
// (cifra_js.conformance refinement §Acceptance "unit"). A port of the
// reference's reference/tests/test_merge_properties.py — never shared code:
// cifra.md's implementations agree because they are checked, not because they
// are shared (DIRECTION §3.6 lines 280–281). This suite is specifically not the
// cross-implementation byte comparison (format.cross_check); it checks that the
// JavaScript merge satisfies the §11.3 invariants on its own generated
// documents, inside one process.
//
// Each case is a base and two sides made from it by the edits people make
// (merge_gen.js). The checks: unchanged sides change nothing; the result is
// canonical and a fixed point; merging depends on canonical forms only;
// exchanging the sides mirrors the outcome, but for the numbering of §11.9.5;
// resolving a marked text by either side gives a document; changes to different
// sections, and to the voicings of different tunings, never conflict; setlists
// hold the same way; keys both sides joined stay joined, and a side's change to
// how the bars are grouped survives a side that did not change it (§11.9.4);
// and a song played twice keeps each copy's entries on that copy (§11.13).
//
// SEEDS and N mirror the reference (a seeded enumeration, not fuzzing). A failure
// is reproducible from its seed. The while-loop properties cap their search so a
// generator that can never build the required shape fails loudly rather than
// hanging the gate — it never masks a property failure (§Constraints).

import { describe, test, expect } from "vitest";

import { conflictsJson, isCanonical, markerLines, merge, parse, parseSetlist, writeSetlist } from "../src/index.js";
import {
  addNote,
  canonicalSong,
  canonicaliseSetlist,
  cmGrouping,
  document,
  edit,
  editSetlist,
  insertCopy,
  join,
  onlySectionChanged,
  regroup,
  sameGrouping,
  sectionTexts,
  setlist,
  unrelated,
} from "./support/merge_gen.js";
import { Random } from "./support/prng.js";
import { resolve, symmetric } from "./support/merge_props.js";

const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const N = 25;
const GUARD = 100000; // a search this long means the generator cannot build the shape

function cases(seed, make = document, change = edit) {
  const rnd = new Random(seed);
  const out = [];
  for (let i = 0; i < N; i += 1) {
    const b = make(rnd);
    out.push([b, change(rnd, b), change(rnd, b)]);
  }
  return out;
}

// Merging depends on canonical forms only (§11.3): the public outcome — the
// result, the marked text and the §11.12.5 conflict members — is the same.
function sameOutcome(r, r2) {
  return r.result === r2.result && (r.marked ?? null) === (r2.marked ?? null) && conflictsJson(r) === conflictsJson(r2);
}

// §11.3 "Unchanged sides change nothing": merging a side against itself or
// against base yields that side's canonical form.
describe("unchanged sides change nothing (§11.3)", () => {
  for (const seed of SEEDS) {
    test(`seed ${seed}`, () => {
      for (const [b, x, y] of cases(seed)) {
        for (const side of [x, y]) {
          const c = canonicalSong(side);
          expect(merge(b, side, side).result).toBe(c);
          expect(merge(b, b, side).result).toBe(c);
          expect(merge(b, side, b).result).toBe(c);
        }
      }
    });
  }
});

// §11.3 "Its result is canonical", §11.11: a clean result is canonical and a
// fixed point of the merge.
describe("the result is canonical and a fixed point (§11.3, §11.11)", () => {
  for (const seed of SEEDS) {
    test(`seed ${seed}`, () => {
      for (const [b, o, t] of cases(seed)) {
        const r = merge(b, o, t);
        if (r.result !== null) {
          expect(isCanonical(r.result), JSON.stringify([b, o, t])).toBe(true);
          expect(merge(r.result, r.result, r.result).result).toBe(r.result);
        }
      }
    });
  }
});

// §11.3 "It depends on canonical forms only", §11.2 step 2: messy inputs (a byte
// order mark, CR LF, trailing spaces — what the text layer removes, §1.3) merge
// as their canonical forms do.
describe("merging depends on canonical forms only (§11.3, §11.2)", () => {
  const messy = (s) => "﻿" + s.replaceAll("\n", "  \r\n");
  for (const seed of SEEDS) {
    test(`seed ${seed}`, () => {
      for (const [b, o, t] of cases(seed)) {
        expect(canonicalSong(messy(o))).toBe(canonicalSong(o));
        const r = merge(b, o, t);
        const r2 = merge(messy(b), messy(o), messy(t));
        expect(sameOutcome(r, r2), JSON.stringify([b, o, t])).toBe(true);
      }
    });
  }
});

// §11.3 "It is symmetric", with the §11.9.5 exception respected by `symmetric`.
describe("exchanging the sides mirrors the outcome (§11.3, §11.9.5)", () => {
  for (const seed of SEEDS) {
    test(`seed ${seed}`, () => {
      for (const [b, o, t] of cases(seed)) {
        expect(symmetric(merge(b, o, t), merge(b, t, o)), JSON.stringify([b, o, t])).toBe(true);
      }
    });
  }
});

// §11.12.4: each region of a marked text resolved by ours and by theirs yields a
// marker-free canonical fixed point; every conflict points at its `<<<<<<< ours`.
describe("resolving by one side gives a document (§11.12.4)", () => {
  for (const seed of SEEDS) {
    test(`seed ${seed}`, () => {
      for (const [b, o, t] of cases(seed)) {
        const r = merge(b, o, t);
        if (r.marked === null) continue;
        const lines = r.marked.split("\n");
        for (const c of r.conflicts) expect(lines[c.line - 1]).toBe("<<<<<<< ours");
        for (const side of ["ours", "theirs"]) {
          const resolved = resolve(r.marked, side);
          expect(markerLines(resolved)).toHaveLength(0);
          const text = canonicalSong(resolved);
          expect(canonicalSong(text)).toBe(text);
        }
      }
    });
  }
});

// §11.3 "Independent changes do not conflict", §2.8/§4.2 carve-outs: edits
// confined to one section each do not conflict. A side whose edit reached
// another section (an anchor carried on, §2.8) or changed whether the document
// is sung (§4.2) is left out.
//
// Also left out: a side that changed the document's `Cm` footnote grouping.
// That is the only cross-section footnote structure the generator builds, and
// §11.9.4 numbers the variants of `Cm` across the whole song, so a side that
// regroups them (or drops an occurrence) reaches every section that plays `Cm`,
// not the one it edited. The reference's only_section_changed cannot see this:
// it renders each section with the side's own standalone canonical numbering,
// which keeps `Cm[2]` when the side-alone still carries one, while the 3-way
// merge renumbers across both sides and so couples the sections (verified: the
// Python reference merge conflicts byte-for-byte on such a triple too, and its
// MT19937 stream simply never generates one). Requiring the grouping unchanged
// restores the property's premise — genuinely independent section edits —
// without touching its assertion (cifra_js.conformance refinement; §11.9.4).
describe("changes to different sections do not conflict (§11.3, §11.9.4)", () => {
  for (const seed of SEEDS) {
    test(`seed ${seed}`, () => {
      const rnd = new Random(seed);
      let tried = 0;
      let guard = 0;
      while (tried < N) {
        expect((guard += 1), "generator never produced an independent two-section case").toBeLessThan(GUARD);
        const b = document(rnd);
        const n = parse(b).sections.length;
        if (n < 2) continue;
        const [i, j] = rnd.sample([...Array(n).keys()], 2);
        const o = edit(rnd, b, ["section", i]);
        const t = edit(rnd, b, ["section", j]);
        if (!(onlySectionChanged(b, o, i) && onlySectionChanged(b, t, j))) continue;
        if (!(parse(b).sung === parse(o).sung && parse(o).sung === parse(t).sung)) continue;
        if (!(sameGrouping(b, o) && sameGrouping(b, t))) continue;
        tried += 1;
        const r = merge(b, o, t);
        expect(r.result, JSON.stringify([b, o, t, r.marked])).not.toBeNull();
      }
    });
  }
});

// §11.3 independence, §11.10: editing the voicings of different tunings does not
// conflict.
describe("voicings of different tunings do not conflict (§11.3, §11.10)", () => {
  for (const seed of SEEDS) {
    test(`seed ${seed}`, () => {
      const rnd = new Random(seed);
      let tried = 0;
      let guard = 0;
      while (tried < N) {
        expect((guard += 1), "generator never produced a two-tuning case").toBeLessThan(GUARD);
        const b = document(rnd);
        if (!b.includes("## Voicings: G4 C4 E4 A4") || !b.includes("## Voicings: E2 A2 D3 G3 B3 E4")) continue;
        tried += 1;
        const o = edit(rnd, b, ["tuning", "E2 A2 D3 G3 B3 E4"]);
        const t = edit(rnd, b, ["tuning", "G4 C4 E4 A4"]);
        const r = merge(b, o, t);
        expect(r.result, JSON.stringify([b, o, t, r.marked])).not.toBeNull();
      }
    });
  }
});

// §11.13: setlists hold the unchanged-side, symmetry and resolution properties.
describe("setlists (§11.13)", () => {
  for (const seed of SEEDS) {
    test(`seed ${seed}`, () => {
      for (const [b, o, t] of cases(seed, setlist, editSetlist)) {
        for (const side of [o, t]) {
          const c = canonicaliseSetlist(side);
          expect(merge(b, side, side, { setlist: true }).result).toBe(c);
          expect(merge(b, b, side, { setlist: true }).result).toBe(c);
          expect(merge(b, side, b, { setlist: true }).result).toBe(c);
        }
        const r = merge(b, o, t, { setlist: true });
        const r2 = merge(b, t, o, { setlist: true });
        expect(symmetric(r, r2), JSON.stringify([b, o, t])).toBe(true);
        if (r.result !== null) {
          expect(canonicaliseSetlist(r.result)).toBe(r.result);
        } else {
          for (const side of ["ours", "theirs"]) {
            const resolved = resolve(r.marked, side);
            expect(markerLines(resolved)).toHaveLength(0);
            const text = canonicaliseSetlist(resolved);
            expect(canonicaliseSetlist(text)).toBe(text);
          }
        }
      }
    });
  }
});

// §11.9.4: both sides drop every `Cm` marker, then one retitles and the other
// revoices a tuning. Every bar of `Cm` is then one variant, so the result's
// chart is the joined chart — base alone told the bars apart.
describe("keys both sides joined stay joined (§11.9.4)", () => {
  const chartOf = (text) => text.split("\n---\n")[0];
  for (const seed of SEEDS) {
    test(`seed ${seed}`, () => {
      const rnd = new Random(seed);
      let tried = 0;
      let guard = 0;
      while (tried < N) {
        expect((guard += 1), "generator never produced a `Cm` case").toBeLessThan(GUARD);
        const b = document(rnd);
        if (!chartOf(b).includes("Cm[")) continue;
        tried += 1;
        const j = join(b);
        const o = canonicalSong(j.startsWith("# ") ? j.replace("# ", "# Joined ") : "# Joined\n\n" + j);
        const t = edit(rnd, j, ["tuning", rnd.choice(["E2 A2 D3 G3 B3 E4", "G4 C4 E4 A4"])]);
        for (const r of [merge(b, o, t), merge(b, t, o)]) {
          if (r.result !== null) {
            expect(sectionTexts(r.result), JSON.stringify([b, o, t, r.result])).toEqual(sectionTexts(j));
          }
        }
        // a side that joined, against one that did not change the chart
        expect(merge(b, b, j).result).toBe(canonicalSong(j));
        expect(merge(b, j, b).result).toBe(canonicalSong(j));
      }
    });
  }
});

// §11.9.4: one side regroups the bars of `Cm`; the other changes only things
// that decide nothing about the grouping. The result groups `Cm` as the first
// side does.
describe("a change to the grouping survives a side that did not change it (§11.9.4)", () => {
  for (const seed of SEEDS) {
    test(`seed ${seed}`, () => {
      const rnd = new Random(seed);
      let tried = 0;
      let guard = 0;
      while (tried < N) {
        expect((guard += 1), "generator never produced a regroupable case").toBeLessThan(GUARD);
        const b = document(rnd);
        const x = regroup(rnd, b);
        if (x === null || canonicalSong(x) === canonicalSong(b)) continue;
        tried += 1;
        const y = unrelated(rnd, b);
        for (const r of [merge(b, x, y), merge(b, y, x)]) {
          expect(r.result, JSON.stringify([b, x, y, r.marked])).not.toBeNull();
          expect(cmGrouping(r.result), JSON.stringify([b, x, y, r.result])).toEqual(cmGrouping(x));
        }
      }
    });
  }
});

// §11.13: ours inserts a bare copy of a song the set already plays; theirs gives
// one item a note. The result is base with both: the note stays on the item
// theirs gave it to, however many copies of its song the set has.
describe("a copy inserted does not take another copy's entries (§11.13)", () => {
  for (const seed of SEEDS) {
    test(`seed ${seed}`, () => {
      const rnd = new Random(seed);
      let tried = 0;
      let guard = 0;
      while (tried < N) {
        expect((guard += 1), "generator never produced an insertable copy").toBeLessThan(GUARD);
        const b = setlist(rnd);
        const ins = insertCopy(rnd, b);
        const note = addNote(rnd, b);
        if (ins === null || note === null) continue;
        tried += 1;
        const [o, p, copy] = ins;
        const [t, n, noted] = note;
        // base with theirs's note set on item n and ours's copy inserted at p,
        // written canonical — the expected result, built as the reference does.
        const want = parseSetlist(b);
        want.body[n] = noted;
        want.body.splice(p, 0, copy);
        const wantText = canonicaliseSetlist(writeSetlist(want));
        expect(merge(b, o, t, { setlist: true }).result, JSON.stringify([b, o, t])).toBe(wantText);
        expect(merge(b, t, o, { setlist: true }).result, JSON.stringify([b, o, t])).toBe(wantText);
      }
    });
  }
});
