// Unit tests for the corpus harness itself (cifra_js.package refinement,
// §Acceptance "unit"): that discovery enumerates the real corpus, that the
// byte and model-as-bytes comparisons are not vacuously green, and that the
// ledger guard catches a stale id. The planted-mismatch cases use tiny
// synthetic entries with invented text — never a real song, never anyone's
// copyrighted words.

import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test, expect } from "vitest";

import {
  discover,
  dump,
  readingChecks,
  mergeChecks,
  staleLedgerIds,
} from "./corpus/harness.js";
import { prepare, parseChord, DIALECTS, markerLines, decode } from "../src/index.js";

const corpusDir = fileURLToPath(new URL("../../corpus/", import.meta.url));

describe("discover", () => {
  const { reading, merge } = discover(corpusDir);

  // Pins corpus/README.md lines 19–21 and reference/tools/corpus.py lines
  // 50–61: every directory with an input file is found, classified by input
  // extension, sorted by name; `merge/` is not a reading entry.
  test("classifies every reading entry by its input extension", () => {
    expect(reading.length).toBeGreaterThan(0);
    for (const entry of reading) {
      const hasSong = existsSync(join(entry.dir, "input.cifra.md"));
      const hasSetlist = existsSync(join(entry.dir, "input.setlist.md"));
      expect(entry.kind).toBe(hasSong ? "song" : "setlist");
      expect(hasSong || hasSetlist).toBe(true);
    }
  });

  test("finds every reading entry present, so none can be silently skipped", () => {
    // Independently of discover's own walk: a directory is a reading entry iff
    // it holds one of the two input files. discover must find exactly those.
    const onDisk = readdirSync(corpusDir)
      .filter((n) => n !== "merge")
      .filter(
        (n) =>
          existsSync(join(corpusDir, n, "input.cifra.md")) ||
          existsSync(join(corpusDir, n, "input.setlist.md")),
      )
      .sort();
    expect(reading.map((e) => e.name)).toEqual(onDisk);
  });

  test("returns reading entries sorted by name", () => {
    const names = reading.map((e) => e.name);
    expect(names).toEqual([...names].sort());
  });

  test("classifies known song and setlist entries", () => {
    const byName = Object.fromEntries(reading.map((e) => [e.name, e.kind]));
    expect(byName["01-minimal-chart"]).toBe("song");
    expect(byName["35-setlist-minimal"]).toBe("setlist");
    expect(byName["47-setlist-text-layer"]).toBe("setlist");
    expect(byName["merge"]).toBeUndefined();
  });

  test("enumerates merge entries, sorted, separate from reading", () => {
    expect(merge.length).toBeGreaterThan(0);
    const names = merge.map((e) => e.name);
    expect(names).toEqual([...names].sort());
    expect(names).toContain("01-different-sections");
    expect(names).toContain("37-file-not-utf8");
  });
});

// A reading entry's five files written to a temp dir, with invented text.
function plantReadingEntry(files) {
  const dir = mkdtempSync(join(tmpdir(), "cifra-harness-"));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return { name: "synthetic", dir, kind: "song" };
}

describe("planted mismatch (reading)", () => {
  // A synthetic song: title-only, invented. The canned impl returns exactly
  // what the files hold, so a matching entry passes and a one-byte difference
  // fails — proving the harness compares bytes and model serialisation, not
  // nothing.
  const model = { title: "Synthetic", properties: [], sections: [] };
  const canonicalText = "# Synthetic\n";
  const matchingImpl = {
    parse: () => model,
    write: () => canonicalText,
    canonical: () => model,
    prepare, // the real text layer; the tl check holds canonicalText a fixed point
  };
  const files = () => ({
    "input.cifra.md": "#   Synthetic\n",
    "input.parsed.json": dump(model),
    "canonical.cifra.md": canonicalText,
    "parsed.json": dump(model),
  });

  test("a matching entry makes every check pass", () => {
    const entry = plantReadingEntry(files());
    for (const check of readingChecks(entry, matchingImpl)) {
      expect(() => check.run()).not.toThrow();
    }
  });

  test("a one-byte difference in a model file fails its check", () => {
    const planted = files();
    planted["input.parsed.json"] = dump(model) + " "; // one extra byte
    const entry = plantReadingEntry(planted);
    const check1 = readingChecks(entry, matchingImpl).find((c) => c.id.endsWith("/1"));
    expect(() => check1.run()).toThrow();
  });

  test("a one-byte difference in a text file fails its check", () => {
    const planted = files();
    planted["canonical.cifra.md"] = canonicalText + "\n"; // one extra byte
    const entry = plantReadingEntry(planted);
    const check2 = readingChecks(entry, matchingImpl).find((c) => c.id.endsWith("/2"));
    expect(() => check2.run()).toThrow();
  });

  test("the tl check fails when the canonical text is not a text-layer fixed point", () => {
    // Pins the text-layer check (cifra_js.text_layer refinement §Decisions):
    // a trailing space in the stored canonical text means prepare strips it, so
    // the rejoin differs and the check is not vacuous.
    const planted = files();
    planted["canonical.cifra.md"] = "# Synthetic \n"; // trailing space
    const entry = plantReadingEntry(planted);
    const tl = readingChecks(entry, matchingImpl).find((c) => c.id.endsWith("/tl"));
    expect(() => tl.run()).toThrow();
  });

  test("a model with a different key order fails, not deep-equals", () => {
    // dump pins insertion order: an impl that emits the same keys in another
    // order serialises to different bytes and must fail.
    const reordered = { sections: [], properties: [], title: "Synthetic" };
    const entry = plantReadingEntry(files());
    const check1 = readingChecks(entry, { ...matchingImpl, parse: () => reordered }).find(
      (c) => c.id.endsWith("/1"),
    );
    expect(() => check1.run()).toThrow();
  });
});

describe("planted mismatch (chords)", () => {
  // Pins the chord-symbol check (cifra_js.chords refinement §Acceptance): a
  // synthetic song carrying one chord item, whose stored `chord` is what the
  // real parser produces, so the real implementation passes and a wrong parse
  // fails — proving the `<entry>/chords` check is not vacuous, as the package's
  // planted-mismatch and text_layer's planted non-fixed-point cases do.
  function plantSongWithChord(symbol, chord, ambiguities) {
    const item = { type: "chord", symbol, index: 1, key: symbol, chord };
    if (ambiguities) item.ambiguities = ambiguities;
    const model = {
      title: null,
      properties: [],
      sections: [
        {
          name: "",
          heading: null,
          anchor: null,
          body: [
            {
              type: "music",
              lines: [{ kind: "chart", measures: [{ bar: null, items: [item], number: 1, stated: false }], closeBar: null }],
            },
          ],
          groups: [],
        },
      ],
      blocks: [],
      sung: false,
      sungAt: null,
      diagnostics: [],
    };
    const dir = mkdtempSync(join(tmpdir(), "cifra-chords-"));
    writeFileSync(join(dir, "parsed.json"), dump(model));
    return { name: "synthetic", dir, kind: "song" };
  }

  const realImpl = { parseChord, DIALECTS };
  const chordsCheck = (entry, impl) =>
    readingChecks(entry, impl).find((c) => c.id.endsWith("/chords"));

  test("an entry whose stored chord matches the parser passes", () => {
    const { chord } = parseChord("C7");
    const entry = plantSongWithChord("C7", chord);
    expect(() => chordsCheck(entry, realImpl).run()).not.toThrow();
  });

  test("a wrong parse of the symbol fails the check", () => {
    const { chord } = parseChord("C7");
    const entry = plantSongWithChord("C7", chord);
    const wrong = {
      DIALECTS,
      // A parser that reads C7 as a bare minor triad — the right root, the
      // wrong quality and no seventh.
      parseChord: () => ({
        chord: { root: { letter: "C", accidental: 0 }, quality: "minor", extensions: [], bass: null },
        ambiguities: [],
        errors: [],
      }),
    };
    expect(() => chordsCheck(entry, wrong).run()).toThrow();
  });

  test("an entry with no chords registers no chords check", () => {
    const dir = mkdtempSync(join(tmpdir(), "cifra-nochords-"));
    const model = { title: "Synthetic", properties: [], sections: [] };
    writeFileSync(join(dir, "parsed.json"), dump(model));
    expect(chordsCheck({ name: "synthetic", dir, kind: "song" }, realImpl)).toBeUndefined();
  });
});

describe("planted mismatch (merge, forward)", () => {
  // A synthetic merge entry with one stored output; a canned merge returns the
  // files it would write, keyed by their corpus names.
  function plantMergeEntry(stored) {
    const dir = mkdtempSync(join(tmpdir(), "cifra-merge-"));
    writeFileSync(join(dir, "base.cifra.md"), "# Base\n");
    writeFileSync(join(dir, "ours.cifra.md"), "# Ours\n");
    writeFileSync(join(dir, "theirs.cifra.md"), "# Theirs\n");
    for (const [name, content] of Object.entries(stored)) {
      writeFileSync(join(dir, name), content);
    }
    return { name: "synthetic", dir };
  }

  // merge now returns an Outcome; the forward check maps it with mergeOutputs
  // (cifra_js.merge refinement §Decisions). The canned merge returns the file map
  // directly, with mergeOutputs the identity, so the comparison is still against
  // the bytes it produces.
  const forward = (files) => ({ merge: () => files, mergeOutputs: (x) => x });
  const forwardCheck = (entry, impl) => mergeChecks(entry, impl).find((c) => c.id.endsWith("/1"));

  test("a merge producing exactly the stored files passes", () => {
    const entry = plantMergeEntry({ "result.cifra.md": "# Merged\n" });
    expect(() => forwardCheck(entry, forward({ "result.cifra.md": "# Merged\n" })).run()).not.toThrow();
  });

  test("a wrong byte in a produced file fails", () => {
    const entry = plantMergeEntry({ "result.cifra.md": "# Merged\n" });
    expect(() => forwardCheck(entry, forward({ "result.cifra.md": "# merged\n" })).run()).toThrow();
  });

  test("a stored output the merge did not produce fails", () => {
    const entry = plantMergeEntry({ "result.cifra.md": "# Merged\n" });
    expect(() => forwardCheck(entry, forward({})).run()).toThrow();
  });

  test("producing a file the entry does not have fails", () => {
    const entry = plantMergeEntry({ "result.cifra.md": "# Merged\n" });
    expect(() => forwardCheck(entry, forward({ "result.deleted": "" })).run()).toThrow();
  });
});

describe("planted mismatch (merge, battery)", () => {
  // The reverse (/2), result-canonical (/3), resolution (/4) and unchanged-side
  // (/perm) checks this task adds, each proved non-vacuous: a correct canned impl
  // passes, a broken one fails (cifra_js.merge refinement §Acceptance). An
  // identity parse/write is a canonical fixed point, so `canon` is observable.
  const identity = { parse: (x) => x, write: (m) => m, decode, markerLines };
  const checkOf = (entry, impl, suffix) => mergeChecks(entry, impl).find((c) => c.id.endsWith(suffix));

  function plantMerge(files) {
    const dir = mkdtempSync(join(tmpdir(), "cifra-merge2-"));
    writeFileSync(join(dir, "base.cifra.md"), "# Base\n");
    writeFileSync(join(dir, "ours.cifra.md"), "# Ours\n");
    writeFileSync(join(dir, "theirs.cifra.md"), "# Theirs\n");
    for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
    return { name: "synthetic", dir };
  }

  const MARKED = "<<<<<<< ours\nX\n=======\nY\n>>>>>>> theirs\n";

  test("/2 passes when exchanging the sides mirrors the outcome", () => {
    const entry = plantMerge({ "result.cifra.md": "# R\n" });
    const impl = { ...identity, merge: () => ({ kind: "result", result: "# R\n", deleted: false, conflicts: [], marked: null }), mergeOutputs: () => ({}) };
    expect(() => checkOf(entry, impl, "/2").run()).not.toThrow();
  });

  test("/2 fails a merge whose sides are not mirrored", () => {
    const entry = plantMerge({ "conflicts.json": "{}\n", "marked.cifra.md": MARKED });
    // The same conflict and marked text for both orders: a non-symmetric merge.
    const impl = {
      ...identity,
      merge: () => ({ kind: "conflicts", result: null, deleted: false, conflicts: [{ kind: "title", base: null, ours: "X", theirs: "Y" }], marked: MARKED }),
      mergeOutputs: () => ({}),
    };
    expect(() => checkOf(entry, impl, "/2").run()).toThrow();
  });

  test("/3 passes a canonical result and fails a non-canonical one", () => {
    const entry = plantMerge({ "result.cifra.md": "# R\n" });
    expect(() => checkOf(entry, identity, "/3").run()).not.toThrow();
    const nonCanon = { ...identity, write: (m) => m + "!" };
    expect(() => checkOf(entry, nonCanon, "/3").run()).toThrow();
  });

  test("/4 passes a clean resolution and fails one that leaves a marker", () => {
    const entry = plantMerge({ "conflicts.json": "{}\n", "marked.cifra.md": MARKED });
    const clean = { ...identity, resolveMarked: (_m, side) => (side === "ours" ? "X\n" : "Y\n") };
    expect(() => checkOf(entry, clean, "/4").run()).not.toThrow();
    const leaves = { ...identity, resolveMarked: (m) => m };
    expect(() => checkOf(entry, leaves, "/4").run()).toThrow();
  });

  test("/perm passes an unchanged-side identity merge and fails one that changes it", () => {
    // Only ours present, so b and x are both ours's text and the three merges are
    // merge(x, x, x): a merge returning its ours arg is the identity canon wants.
    const entry = (() => {
      const dir = mkdtempSync(join(tmpdir(), "cifra-perm-"));
      writeFileSync(join(dir, "ours.cifra.md"), "# Only\n");
      return { name: "synthetic", dir };
    })();
    const good = { ...identity, merge: (_b, o) => ({ kind: "result", result: o, deleted: false, conflicts: [], marked: null }), mergeOutputs: () => ({}) };
    expect(() => checkOf(entry, good, "/perm").run()).not.toThrow();
    const bad = { ...identity, merge: (_b, o) => ({ kind: "result", result: o + "!", deleted: false, conflicts: [], marked: null }), mergeOutputs: () => ({}) };
    expect(() => checkOf(entry, bad, "/perm").run()).toThrow();
  });
});

describe("ledger guard", () => {
  // Pins the stale-id guard (§Constraints): a ledger id with no matching
  // discovered check is reported, so cifra_js.conformance can prove the ledger
  // empty and honest.
  const checkIds = new Set(["01-minimal-chart/1", "merge/01-different-sections/1"]);

  test("a stale id is reported", () => {
    expect(staleLedgerIds(["01-minimal-chart/1", "gone/9"], checkIds)).toEqual(["gone/9"]);
  });

  test("a ledger of only real ids is clean", () => {
    expect(staleLedgerIds(["01-minimal-chart/1"], checkIds)).toEqual([]);
  });
});
