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

  test("a merge producing exactly the stored files passes", () => {
    const entry = plantMergeEntry({ "result.cifra.md": "# Merged\n" });
    const impl = { merge: () => ({ "result.cifra.md": "# Merged\n" }) };
    expect(() => mergeChecks(entry, impl)[0].run()).not.toThrow();
  });

  test("a wrong byte in a produced file fails", () => {
    const entry = plantMergeEntry({ "result.cifra.md": "# Merged\n" });
    const impl = { merge: () => ({ "result.cifra.md": "# merged\n" }) };
    expect(() => mergeChecks(entry, impl)[0].run()).toThrow();
  });

  test("a stored output the merge did not produce fails", () => {
    const entry = plantMergeEntry({ "result.cifra.md": "# Merged\n" });
    const impl = { merge: () => ({}) };
    expect(() => mergeChecks(entry, impl)[0].run()).toThrow();
  });

  test("producing a file the entry does not have fails", () => {
    const entry = plantMergeEntry({ "result.cifra.md": "# Merged\n" });
    const impl = { merge: () => ({ "result.deleted": "" }) };
    expect(() => mergeChecks(entry, impl)[0].run()).toThrow();
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
