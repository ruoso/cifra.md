// Unit tests for the §8.5 editing operations (cifra_js.editing refinement
// §Acceptance "unit (editing.test.js)"). The reference carries no editor and the
// corpus has no editing fixture, so every case here is written against the spec
// prose, §8.5.1–§8.5.5 and the §8.3 invariants it canonicalises under. Each
// result is handed to `write` — which applies §8.3 and §4.5 — and the test
// asserts the output is a fixed point of `write` (`isCanonical`) and that `parse`
// re-reads it to the expected model (the round-trip pattern setlist.test.js
// established). Fixtures are the voicing-bearing corpus songs and small songs
// written for this suite; no one's copyrighted words appear.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, test, expect } from "vitest";

import {
  parse,
  write,
  isCanonical,
  chooseShapeForOccurrence,
  chooseShapeForKey,
  clearKey,
  chooseShapes,
  addVariation,
} from "../src/index.js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const corpusSong = (name) => parse(readFileSync(join(ROOT, "corpus", name, "input.cifra.md")));

const GUITAR = "E2 A2 D3 G3 B3 E4";
const UKE = "G4 C4 E4 A4";

// Every chord occurrence of a model, each as its index path and the item it
// points at, in document order (mirrors edit.js's internal walker; the arrange
// UI holds the same paths).
function occurrences(model) {
  const out = [];
  model.sections.forEach((s, section) =>
    s.body.forEach((part, p) => {
      if (part.type !== "music") return;
      part.lines.forEach((line, l) =>
        (line.measures || []).forEach((m, measure) =>
          m.items.forEach((it, item) => {
            if (it.type === "chord") out.push({ occ: { section, part: p, line: l, measure, item }, item: it });
          })));
    }));
  return out;
}

// The chart's chord items (symbol/index/key), in order — what a case asserts on.
const chords = (model) => occurrences(model).map(({ item }) => ({ symbol: item.symbol, index: item.index, key: item.key }));

// The occurrence path of the nth (0-based) chord with the given symbol and index.
function occFor(model, symbol, index, nth = 0) {
  const matches = occurrences(model).filter(({ item }) => item.symbol === symbol && item.index === index);
  return matches[nth].occ;
}

const blockFor = (model, label, tuningText) => {
  const t = parse(`---\n## ${label || "Voicings"}: ${tuningText}\n`).blocks[0].tuning.id;
  return model.blocks.find((b) => b.tuning.id === t && b.label === label) || null;
};
const voicingKeys = (block) => block.voicings.map((v) => v.key);
const voicing = (block, key) => block.voicings.find((v) => v.key === key) || null;

// Apply an op, assert its output written by `write` is canonical (a fixed point),
// and return the re-read model (dump(parse(write(op(doc)))) equals the model).
function result(model) {
  const text = write(model);
  expect(isCanonical(text)).toBe(true);
  return parse(text);
}

// --- §8.5.1 Choose a shape for one occurrence (spec lines 427–444) -----------

describe("§8.5.1 choose a shape for one occurrence", () => {
  // Branch 3, second case: a bare chord with no shape yet. The first choice
  // applies to every bare occurrence rather than splitting the first one off
  // (spec lines 438–442).
  test("branch 3: no shape yet — the one entry serves every bare occurrence", () => {
    const doc = parse("## Verse\n```\nC | G | Am | C\n```\n");
    const out = result(chooseShapeForOccurrence(doc, occFor(doc, "C", 1, 0), GUITAR, "", { frets: ["x", 3, 2, 0, 1, 0] }));
    expect(chords(out)).toEqual([
      { symbol: "C", index: 1, key: "C" },
      { symbol: "G", index: 1, key: "G" },
      { symbol: "Am", index: 1, key: "Am" },
      { symbol: "C", index: 1, key: "C" },
    ]);
    expect(voicingKeys(blockFor(out, "", GUITAR))).toEqual(["C"]);
    expect(voicing(blockFor(out, "", GUITAR), "C").frets).toEqual(["x", 3, 2, 0, 1, 0]);
  });

  // Branch 1: the block already has the given shape for (S, i) — nothing changes.
  test("branch 1: the shape is already set — unchanged", () => {
    const doc = parse("## V\n```\nC | G\n```\n\n---\n## Voicings: E2 A2 D3 G3 B3 E4\n- C: x32010\n");
    const before = write(doc);
    const out = chooseShapeForOccurrence(doc, occFor(doc, "C", 1, 0), GUITAR, "", { frets: ["x", 3, 2, 0, 1, 0] });
    expect(write(out)).toBe(before);
    expect(isCanonical(write(out))).toBe(true);
  });

  // Branch 2: another used index j already carries the shape and no other block
  // tells i from j — the token is rewritten to j and the shape reused (I1 then
  // drops the now-unused entry).
  test("branch 2: reuse an existing index that carries the shape", () => {
    const doc = parse("## V\n```\nC | C[2]\n```\n\n---\n## Voicings: E2 A2 D3 G3 B3 E4\n- C: x32010\n- C[2]: x35553\n");
    const out = result(chooseShapeForOccurrence(doc, occFor(doc, "C", 2, 0), GUITAR, "", { frets: ["x", 3, 2, 0, 1, 0] }));
    expect(chords(out)).toEqual([
      { symbol: "C", index: 1, key: "C" },
      { symbol: "C", index: 1, key: "C" },
    ]);
    expect(voicingKeys(blockFor(out, "", GUITAR))).toEqual(["C"]);
  });

  // Branch 4: the occurrence shares its index with others and (S, i) already has
  // a different shape — the token splits off onto the smallest unused index of S.
  test("branch 4: split a shared occurrence off onto a new index", () => {
    const doc = parse("## V\n```\nC | C | C\n```\n\n---\n## Voicings: E2 A2 D3 G3 B3 E4\n- C: x32010\n");
    const out = result(chooseShapeForOccurrence(doc, occFor(doc, "C", 1, 1), GUITAR, "", { frets: ["x", 3, 5, 5, 5, 3] }));
    expect(chords(out)).toEqual([
      { symbol: "C", index: 1, key: "C" },
      { symbol: "C", index: 2, key: "C[2]" },
      { symbol: "C", index: 1, key: "C" },
    ]);
    const block = blockFor(out, "", GUITAR);
    expect(voicingKeys(block)).toEqual(["C", "C[2]"]);
    expect(voicing(block, "C[2]").frets).toEqual(["x", 3, 5, 5, 5, 3]);
  });

  // On a corpus song that carries voicings (corpus/05-voicings-two-tunings):
  // choosing the guitar shape already on A for its one occurrence is branch 1.
  test("branch 1 on corpus/05-voicings-two-tunings — unchanged", () => {
    const doc = corpusSong("05-voicings-two-tunings");
    const before = write(doc);
    const out = chooseShapeForOccurrence(doc, occFor(doc, "A", 1, 0), GUITAR, "", {
      frets: ["x", 0, 2, 2, 2, 0],
      fingers: [null, null, 1, 2, 3, null],
    });
    expect(write(out)).toBe(before);
  });
});

// --- §8.5.2 Choose a shape for a key (spec lines 446–451) --------------------

describe("§8.5.2 choose a shape for a key", () => {
  test("otherwise: the block's entry for the key becomes the shape", () => {
    const doc = parse("## V\n```\nC | C\n```\n");
    const out = result(chooseShapeForKey(doc, { symbol: "C", index: 1 }, GUITAR, "", { frets: ["x", 3, 2, 0, 1, 0] }));
    expect(chords(out)).toEqual([
      { symbol: "C", index: 1, key: "C" },
      { symbol: "C", index: 1, key: "C" },
    ]);
    expect(voicingKeys(blockFor(out, "", GUITAR))).toEqual(["C"]);
  });

  test("step 2: every occurrence with the key moves together to the reused index", () => {
    const doc = parse(
      "## V\n```\nC | C[2] | C[2]\n```\n\n---\n## Voicings: E2 A2 D3 G3 B3 E4\n- C: x32010\n- C[2]: x35553\n",
    );
    const out = result(chooseShapeForKey(doc, { symbol: "C", index: 2 }, GUITAR, "", { frets: ["x", 3, 2, 0, 1, 0] }));
    // All three occurrences read as C index 1; C[2] is gone.
    expect(chords(out)).toEqual([
      { symbol: "C", index: 1, key: "C" },
      { symbol: "C", index: 1, key: "C" },
      { symbol: "C", index: 1, key: "C" },
    ]);
    expect(voicingKeys(blockFor(out, "", GUITAR))).toEqual(["C"]);
  });
});

// --- §8.5.3 Clear a key (spec lines 453–460) --------------------------------

describe("§8.5.3 clear a key", () => {
  // A second tuning's block still tells the index apart, so the marker stays.
  test("marker stays when another instrument tells the index apart", () => {
    const doc = parse(
      "## V\n```\nC | C[2]\n```\n\n---\n" +
        "## Voicings: E2 A2 D3 G3 B3 E4\n- C: x32010\n- C[2]: 8-10-10-8-8-8\n\n" +
        "## Voicings: G4 C4 E4 A4\n- C: 0333\n- C[2]: 5333\n",
    );
    const out = result(clearKey(doc, { symbol: "C", index: 2 }, GUITAR, ""));
    expect(chords(out)).toEqual([
      { symbol: "C", index: 1, key: "C" },
      { symbol: "C", index: 2, key: "C[2]" },
    ]);
    expect(voicingKeys(blockFor(out, "", GUITAR))).toEqual(["C"]);
    expect(voicingKeys(blockFor(out, "", UKE))).toEqual(["C", "C[2]"]);
  });

  // No block tells the index apart once the entry is gone, and another block
  // holds both indices the same, so I3 merges the marker away.
  test("marker goes away when I3 then finds the index the same as a lower one", () => {
    const doc = parse(
      "## V\n```\nC | C[2]\n```\n\n---\n" +
        "## Voicings: E2 A2 D3 G3 B3 E4\n- C[2]: 8-10-10-8-8-8\n\n" +
        "## Voicings: G4 C4 E4 A4\n- C: 0333\n- C[2]: 0333\n",
    );
    const out = result(clearKey(doc, { symbol: "C", index: 2 }, GUITAR, ""));
    expect(chords(out)).toEqual([
      { symbol: "C", index: 1, key: "C" },
      { symbol: "C", index: 1, key: "C" },
    ]);
    expect(voicingKeys(blockFor(out, "", GUITAR))).toEqual([]); // emptied, heading alone
    expect(voicingKeys(blockFor(out, "", UKE))).toEqual(["C"]);
  });
});

// --- §8.5.4 Choose shapes for many occurrences at once (spec lines 462–484) --

describe("§8.5.4 choose shapes for many occurrences at once", () => {
  // A plan that agrees with the document rewrites nothing: each group reuses the
  // smallest of its members' current indices (spec line 478).
  test("a plan that agrees rewrites nothing", () => {
    const doc = parse("## V\n```\nC | C[2]\n```\n\n---\n## Voicings: E2 A2 D3 G3 B3 E4\n- C: x32010\n- C[2]: x35553\n");
    const before = write(doc);
    const plan = [
      { occurrence: occFor(doc, "C", 1, 0), shape: { frets: ["x", 3, 2, 0, 1, 0] } },
      { occurrence: occFor(doc, "C", 2, 0), shape: { frets: ["x", 3, 5, 5, 5, 3] } },
    ];
    const out = chooseShapes(doc, plan, GUITAR, "");
    expect(write(out)).toBe(before);
  });

  // The divergence case: the plan regroups occurrences across indices; computed
  // in one pass from the original indices (not a loop of §8.5.1, spec lines
  // 465–468), it numbers them per spec. A naïve loop would renumber between
  // steps and mis-aim later ones.
  test("regroups in one pass with the spec's final indices", () => {
    const doc = parse(
      "## V\n```\nC | C[2] | C[3]\n```\n\n---\n## Voicings: E2 A2 D3 G3 B3 E4\n- C: x32010\n- C[2]: x35553\n- C[3]: 8-10-10-8-8-8\n",
    );
    const B = { frets: ["x", 3, 5, 5, 5, 3] }; // shared by the first two
    const A = { frets: ["x", 3, 2, 0, 1, 0] }; // the third
    const plan = [
      { occurrence: occFor(doc, "C", 1, 0), shape: B },
      { occurrence: occFor(doc, "C", 2, 0), shape: B },
      { occurrence: occFor(doc, "C", 3, 0), shape: A },
    ];
    const out = result(chooseShapes(doc, plan, GUITAR, ""));
    expect(chords(out)).toEqual([
      { symbol: "C", index: 1, key: "C" },
      { symbol: "C", index: 1, key: "C" },
      { symbol: "C", index: 2, key: "C[2]" },
    ]);
    const block = blockFor(out, "", GUITAR);
    expect(voicing(block, "C").frets).toEqual(["x", 3, 5, 5, 5, 3]);
    expect(voicing(block, "C[2]").frets).toEqual(["x", 3, 2, 0, 1, 0]);
  });

  // Two occurrences another block tells apart are never put in one group, even
  // when the plan gives them the same shape (spec lines 476–477).
  test("never groups two occurrences another block tells apart", () => {
    const doc = parse("## V\n```\nC | C[2]\n```\n\n---\n## Voicings: G4 C4 E4 A4\n- C: 0333\n- C[2]: 5333\n");
    const Z = { frets: ["x", 3, 2, 0, 1, 0] };
    const plan = [
      { occurrence: occFor(doc, "C", 1, 0), shape: Z },
      { occurrence: occFor(doc, "C", 2, 0), shape: Z },
    ];
    const out = result(chooseShapes(doc, plan, GUITAR, ""));
    // The uke block keeps 1 and 2 apart, so the guitar plan stays two markers.
    expect(chords(out)).toEqual([
      { symbol: "C", index: 1, key: "C" },
      { symbol: "C", index: 2, key: "C[2]" },
    ]);
    const guitar = blockFor(out, "", GUITAR);
    expect(voicingKeys(guitar)).toEqual(["C", "C[2]"]);
    expect(voicing(guitar, "C").frets).toEqual(["x", 3, 2, 0, 1, 0]);
    expect(voicing(guitar, "C[2]").frets).toEqual(["x", 3, 2, 0, 1, 0]);
  });
});

// --- §8.5.5 Add a variation (spec lines 486–491) ----------------------------

describe("§8.5.5 add a variation", () => {
  const base = () => parse("## A\n```\nC | G\n```\n\n---\n## Voicings: E2 A2 D3 G3 B3 E4\n- C: x32010\n- G: 320003\n");

  test("an empty new block for the tuning and name", () => {
    const out = result(addVariation(base(), GUITAR, "Up the neck"));
    const block = blockFor(out, "Up the neck", GUITAR);
    expect(block).not.toBeNull();
    expect(voicingKeys(block)).toEqual([]);
  });

  test("a copy carries the source variation's entries", () => {
    const out = result(addVariation(base(), GUITAR, "Up the neck", ""));
    const block = blockFor(out, "Up the neck", GUITAR);
    expect(voicingKeys(block)).toEqual(["C", "G"]);
    expect(voicing(block, "C").frets).toEqual(["x", 3, 2, 0, 1, 0]);
    expect(voicing(block, "G").frets).toEqual([3, 2, 0, 0, 0, 3]);
  });

  test("refuses when a block for the tuning and name already exists", () => {
    expect(() => addVariation(base(), GUITAR, "")).toThrow();
  });

  // On corpus/06-variations, which already carries named variations, adding one
  // more variation copied from the default lands a new block.
  test("add a copied variation to corpus/06-variations", () => {
    const doc = corpusSong("06-variations");
    const out = result(addVariation(doc, "E2 A2 D3 G3 B3 E4", "Low", ""));
    const block = blockFor(out, "Low", GUITAR);
    expect(block).not.toBeNull();
    expect(voicingKeys(block).length).toBeGreaterThan(0);
  });
});

// --- I4: defaults are not written (spec §8.3 lines 138–141) -----------------

describe("I4 — an operation writes only the shape it is given", () => {
  test("writes the given shape verbatim and adds no entry for an unasked key", () => {
    const doc = parse("## V\n```\nC | G | Am\n```\n");
    // A shape that matches no application default — whatever it is, it is written
    // exactly as given, and only for C.
    const shape = { frets: ["x", 3, 2, 0, 1, 3], fingers: [null, 3, 2, null, 1, 4] };
    const out = result(chooseShapeForOccurrence(doc, occFor(doc, "C", 1, 0), GUITAR, "", shape));
    const block = blockFor(out, "", GUITAR);
    expect(voicingKeys(block)).toEqual(["C"]); // no entry for G or Am
    expect(voicing(block, "C").frets).toEqual(["x", 3, 2, 0, 1, 3]);
    expect(voicing(block, "C").fingers).toEqual([null, 3, 2, null, 1, 4]);
  });
});

// --- canonical and marker upkeep across a sung line (§4.5) -------------------

describe("canonical and marker upkeep", () => {
  // Splitting a sung occurrence onto a wider marker (C → C[2]) makes the chord
  // line grow; canonicalising lays the sung line out again (§4.5), so the result
  // is still a fixed point of `write` and every word survives.
  test("a widened marker on a sung line re-lays out and stays canonical", () => {
    const doc = parse("## V\n```\nC\nC       Em\nquando  passei\n```\n\n---\n## Voicings: E2 A2 D3 G3 B3 E4\n- C: x32010\n");
    const sungC = occFor(doc, "C", 1, 1); // the sung occurrence, not the chord-only one
    const out = result(chooseShapeForOccurrence(doc, sungC, GUITAR, "", { frets: ["x", 3, 5, 5, 5, 3] }));
    // The sung C became C[2]; the words are untouched.
    const keys = chords(out).map((c) => c.key);
    expect(keys).toContain("C[2]");
    const text = write(out);
    expect(text).toContain("quando");
    expect(text).toContain("passei");
    expect(isCanonical(text)).toBe(true);
  });
});

// --- operations do not mutate their input ----------------------------------

describe("operations are pure", () => {
  test("no operation mutates the document it is given", () => {
    const doc = parse("## V\n```\nC | C[2]\n```\n\n---\n## Voicings: E2 A2 D3 G3 B3 E4\n- C: x32010\n- C[2]: x35553\n");
    const before = write(doc);
    chooseShapeForOccurrence(doc, occFor(doc, "C", 1, 0), GUITAR, "", { frets: [3, 3, 5, 5, 5, 3] });
    chooseShapeForKey(doc, { symbol: "C", index: 2 }, GUITAR, "", { frets: ["x", 3, 2, 0, 1, 0] });
    clearKey(doc, { symbol: "C", index: 2 }, GUITAR, "");
    chooseShapes(doc, [{ occurrence: occFor(doc, "C", 1, 0), shape: { frets: [0, 2, 2, 1, 0, 0] } }], GUITAR, "");
    addVariation(doc, UKE, "");
    expect(write(doc)).toBe(before);
  });
});
