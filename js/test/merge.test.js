// Spec §11, the parts of the song merge one rule at a time, ported from the
// reference's reference/tests/test_merge.py on purpose-written songs (never a
// real song, never anyone's copyrighted words). The §11.15 worked examples and
// every corpus/merge/ entry are held byte for byte by the corpus harness
// (test/corpus.test.js); this file pins the behaviour rule by rule. The §11.14
// git merge driver is a Go concern (cifra_js.merge refinement §Deferred work),
// so its reference tests are not ported here. The setlist merge (§11.13) is in
// test/setlist_merge.test.js.

import { describe, test, expect } from "vitest";

import {
  CONFLICT,
  KeyMatch,
  SongMerge,
  TSet,
  align,
  conflictsJson,
  keyedOrder,
  merge,
  mergeSequence,
  mergeValue,
  pairsOf,
  sideChanges,
} from "../src/merge.js";

const F = "```";
const eq = (x, y) => x === y;
const chars = (s) => [...s];
const changeTuples = (cs) => cs.map((c) => [c.a, c.b, c.run]);
const pairsObj = (m) => Object.fromEntries(m);

// --- §11.6 values ---

describe("§11.6 values", () => {
  test.each([
    ["a", "a", "a", "a"],
    ["a", "b", "a", "b"],
    ["a", "a", "b", "b"],
    ["a", "b", "b", "b"],
    ["a", "b", "c", CONFLICT],
    [null, "b", null, "b"],
    ["a", null, "a", null],
    ["a", null, "b", CONFLICT],
    [null, "b", "c", CONFLICT],
  ])("merge_value(%s, %s, %s)", (a, x, y, want) => {
    expect(mergeValue(a, x, y)).toEqual(want);
  });
});

// --- §11.5 sequences ---

describe("§11.5 sequences", () => {
  test("alignment pairs whenever it can and drops before it takes", () => {
    expect(align(chars("ab"), chars("ba"), eq)).toEqual([
      ["drop", 0, null],
      ["pair", 1, 0],
      ["take", 2, 1],
    ]);
    expect(pairsObj(pairsOf(align(chars("abc"), chars("xbc"), eq)))).toEqual({ 1: 1, 2: 2 });
  });

  test("a run dropping as many as it takes is one change per element", () => {
    const A = chars("abcd");
    const C = chars("aXYd");
    const changes = sideChanges("ours", A, C, align(A, C, eq), new Map(), eq);
    expect(changeTuples(changes)).toEqual([
      [1, 2, ["X"]],
      [2, 3, ["Y"]],
    ]);
  });

  test("a run of different lengths is one change", () => {
    const A = chars("abcd");
    const C = chars("aXYZd");
    const changes = sideChanges("ours", A, C, align(A, C, eq), new Map(), eq);
    expect(changeTuples(changes)).toEqual([[1, 3, ["X", "Y", "Z"]]]);
  });

  test("adjacent lines and insertions next to a change do not touch", () => {
    const A = chars("abcd");
    let pieces = mergeSequence(A, chars("aXcd"), chars("abYd"), eq, eq, eq);
    expect(pieces.map((p) => p[0])).toEqual(["both", "one", "one", "both"]);
    pieces = mergeSequence(A, chars("aXbcd"), chars("abcYd"), eq, eq, eq);
    expect(pieces.map((p) => p[0])).not.toContain("conflict");
    // a change to a line and an insertion just before it
    pieces = mergeSequence(A, chars("aXbcd"), chars("aYcd"), eq, eq, eq);
    expect(pieces.map((p) => (p[0] === "one" ? p[2] : p[1]))).toEqual(["a", "X", "Y", "c", "d"]);
  });

  test("two insertions at one place conflict after their common ends", () => {
    const pieces = mergeSequence(chars("ab"), chars("aPXQb"), chars("aPYQb"), eq, eq, eq);
    expect(pieces).toEqual([
      ["both", "a", "a", "a"],
      ["common", "P", "P"],
      ["conflict", [], ["X"], ["Y"]],
      ["common", "Q", "Q"],
      ["both", "b", "b", "b"],
    ]);
  });

  test("identical changes are taken once", () => {
    const pieces = mergeSequence(chars("abc"), chars("aXc"), chars("aXc"), eq, eq, eq);
    expect(pieces).toEqual([
      ["both", "a", "a", "a"],
      ["common", "X", "X"],
      ["both", "c", "c", "c"],
    ]);
  });

  test("an insertion inside a cluster joins it", () => {
    const pieces = mergeSequence(chars("abcd"), chars("aXd"), chars("abYcd"), eq, eq, eq);
    expect(pieces).toEqual([
      ["both", "a", "a", "a"],
      ["conflict", ["b", "c"], ["X"], ["b", "Y", "c"]],
      ["both", "d", "d", "d"],
    ]);
  });

  test("deletions that overlap conflict over what each kept", () => {
    const pieces = mergeSequence(chars("abcde"), chars("ade"), chars("abe"), eq, eq, eq);
    expect(pieces[1]).toEqual(["conflict", ["b", "c", "d"], ["d"], ["b"]]);
  });

  test("combining is symmetric", () => {
    const key = (x) => x;
    const p1 = mergeSequence(["a"], ["a", "c"], ["a", "b"], eq, eq, eq, "combine", { sortKey: key, identity: key });
    const p2 = mergeSequence(["a"], ["a", "b"], ["a", "c"], eq, eq, eq, "combine", { sortKey: key, identity: key });
    const want = [
      ["both", "a", "a", "a"],
      ["combined", "b"],
      ["combined", "c"],
    ];
    expect(p1).toEqual(want);
    expect(p2).toEqual(want);
  });

  test("keyed_order puts back an identity one side kept", () => {
    // ours deleted b, which theirs changed: b is in the result, after a
    expect(keyedOrder(chars("abc"), chars("ac"), chars("abc"), new Set("abc"), (x) => x)).toEqual(chars("abc"));
    // two reorders of one stretch are both kept, combined
    expect(keyedOrder(chars("abc"), chars("cab"), chars("bca"), new Set("abc"), (x) => x)).toEqual(chars("cba"));
  });
});

// --- §11.9.2 corresponding keys ---

function K(s) {
  return s.includes("[") ? [s.split("[")[0], parseInt(s.split("[")[1].slice(0, -1), 10)] : [s, 1];
}

function matchEntries(tmap) {
  return tmap
    .entries()
    .map(([k, v]) => [k, v])
    .sort((a, b) => JSON.stringify(a[0]).localeCompare(JSON.stringify(b[0])));
}

describe("§11.9.2 corresponding keys", () => {
  test("the key that keeps most occurrences continues a base key", () => {
    const corr = [
      [K("Cm"), K("Cm")],
      [K("Cm"), K("Cm")],
      [K("Cm"), K("Cm")],
      [K("Cm"), K("Cm[2]")],
    ];
    const km = new KeyMatch(new TSet([K("Cm")]), new TSet([K("Cm"), K("Cm[2]")]), corr);
    expect(matchEntries(km.match)).toEqual([[K("Cm"), K("Cm")]]);
    expect(km.mu.has(K("Cm[2]"))).toBe(false);
  });

  test("renumbering is not re-keying", () => {
    const km = new KeyMatch(
      new TSet([K("Cm"), K("Cm[2]"), K("Cm[3]")]),
      new TSet([K("Cm"), K("Cm[2]")]),
      [
        [K("Cm"), K("Cm")],
        [K("Cm[3]"), K("Cm[2]")],
      ],
    );
    expect(matchEntries(km.match)).toEqual([
      [K("Cm"), K("Cm")],
      [K("Cm[3]"), K("Cm[2]")],
    ]);
  });

  test("between equal counts a key that kept its index wins", () => {
    const corr = [
      [K("Cm"), K("Cm[2]")],
      [K("Cm[2]"), K("Cm[2]")],
    ];
    const km = new KeyMatch(new TSet([K("Cm"), K("Cm[2]")]), new TSet([K("Cm"), K("Cm[2]")]), corr);
    expect(matchEntries(km.match)).toEqual([[K("Cm[2]"), K("Cm[2]")]]);
  });

  test("a key whose only occurrences changed keeps its name", () => {
    const km = new KeyMatch(new TSet([K("Cm"), K("Cm[2]")]), new TSet([K("Cm"), K("Cm[2]")]), [[K("Cm"), K("Cm")]]);
    expect(matchEntries(km.match)).toEqual([
      [K("Cm"), K("Cm")],
      [K("Cm[2]"), K("Cm[2]")],
    ]);
  });
});

// --- §11.4 whole files ---

const SONG = `## A\n${F}\nC | G\n${F}\n`;
const SONG2 = `## A\n${F}\nC | G7\n${F}\n`;
const MESSY = `##   A\r\n~~~\r\nC  |   G\r\n~~~\r\n`;
const bytes = (arr) => new Uint8Array(arr);

describe("§11.4 whole files", () => {
  test.each([
    [null, null, MESSY, "result", SONG],
    [null, MESSY, null, "result", SONG],
    [null, SONG, MESSY, "result", SONG],
    [SONG, null, null, "deleted", null],
    [SONG, null, MESSY, "deleted", null],
    [SONG, null, SONG2, "conflicts", [{ kind: "file", deleted: "ours" }]],
    [SONG, MESSY, null, "deleted", null],
    [SONG, SONG2, null, "conflicts", [{ kind: "file", deleted: "theirs" }]],
    [SONG, bytes([0xff]), SONG2, "conflicts", [{ kind: "file", unreadable: ["ours"] }]],
    [bytes([0xfe]), SONG, bytes([0xff]), "conflicts", [{ kind: "file", unreadable: ["base", "theirs"] }]],
  ])("whole files (%#)", (b, o, t, kind, want) => {
    const r = merge(b, o, t);
    expect(r.kind).toBe(kind);
    if (kind === "result") expect(r.result).toBe(want);
    else if (kind === "conflicts") {
      expect(r.conflicts).toEqual(want);
      expect(r.marked).toBeNull();
    }
  });

  test("an empty base is the empty document", () => {
    expect(merge("", SONG, SONG2).conflicts).toEqual(merge(null, SONG, SONG2).conflicts);
  });

  test("json members are in order", () => {
    const r = merge(SONG, SONG2, SONG.replace("C | G", "C | Em"));
    const data = JSON.parse(conflictsJson(r));
    expect(Object.keys(data.conflicts[0])).toEqual(["kind", "line", "base", "ours", "theirs"]);
  });
});

// --- §11.4 marked inputs ---

const MARKED = `## A\n${F}\n<<<<<<< ours\nC | G7\n=======\nC | Em\n>>>>>>> theirs\n${F}\n`;

describe("§11.4 marked inputs", () => {
  test.each([
    [SONG, MARKED, SONG2, { ours: 3 }],
    [MARKED, SONG, SONG2, { base: 3 }],
    [SONG, SONG2, MARKED, { theirs: 3 }],
    [MARKED, MARKED, SONG2, { base: 3, ours: 3 }],
    // after the text layer: a BOM, CR LF, a tab and trailing spaces
    [SONG, SONG, "﻿## A\r\n\r\n=======\t  \r\n", { theirs: 3 }],
    [SONG, SONG, "## A\n|||||||  base\n", { theirs: 2 }],
  ])("a marked input is never merged (%#)", (b, o, t, want) => {
    const r = merge(b, o, t);
    expect(r.kind).toBe("conflicts");
    expect(r.marked).toBeNull();
    expect(r.result).toBeNull();
    expect(r.conflicts).toEqual([{ kind: "unresolved", ...want }]);
    expect(r.kept).toBe(o);
  });

  test("a marked input stops before the unchanged sides", () => {
    expect(merge(SONG, SONG, MARKED).conflicts).toEqual([{ kind: "unresolved", theirs: 3 }]);
    expect(merge(MARKED, SONG, SONG).conflicts).toEqual([{ kind: "unresolved", base: 3 }]);
    expect(merge(null, null, MARKED).conflicts).toEqual([{ kind: "unresolved", theirs: 3 }]);
  });

  test("a marked input leaves ours exactly as it is", () => {
    const ours = new TextEncoder().encode(MARKED.replace(/\n/g, "\r\n"));
    const r = merge(SONG, ours, SONG2);
    expect(r.kept).toBe(ours);
    expect(merge(SONG, null, MARKED).kept).toBeNull();
  });

  test("deleted on both sides and unreadable come before a marked input", () => {
    expect(merge(MARKED, null, null).deleted).toBe(true);
    expect(merge(MARKED, bytes([0xff]), SONG).conflicts).toEqual([{ kind: "file", unreadable: ["ours"] }]);
  });

  test("exchanging the sides names the other input", () => {
    expect(merge(SONG, SONG2, MARKED).conflicts).toEqual([{ kind: "unresolved", theirs: 3 }]);
    expect(merge(SONG, MARKED, SONG2).conflicts).toEqual([{ kind: "unresolved", ours: 3 }]);
  });

  test("unresolved json members are in order", () => {
    const data = JSON.parse(conflictsJson(merge(MARKED, MARKED, MARKED)));
    expect(data).toEqual({ conflicts: [{ kind: "unresolved", base: 3, ours: 3, theirs: 3 }] });
    expect(Object.keys(data.conflicts[0])).toEqual(["kind", "base", "ours", "theirs"]);
  });
});

// --- §11.10.3 a side that kept no occurrence of a key ---

describe("§11.10 voicings", () => {
  test("a side that deleted every use of a key did not decide its shape", () => {
    const base = `## A\n${F}\nCm | F\nG | G\n${F}\n\n---\n\n## Voicings: E2 A2 D3 G3 B3 E4\n- Cm: x35543\n`;
    const ours = base.replace("G | G\n", "G | G\nCm | G\n");
    const theirs = base.replace("Cm | F\n", "");
    expect(merge(base, ours, theirs).result).toContain("- Cm: x35543");
    expect(merge(base, theirs, ours).result).toContain("- Cm: x35543");
  });

  test("a chord new to both sides is one chord", () => {
    const base = `## A\n${F}\nC | G\n${F}\n\n## B\n${F}\nF | C\n${F}\n`;
    const r = merge(base, base.replace("C | G\n", "C | G\nE7 | Am\n"), base.replace("F | C\n", "F | C\nE7 | Dm\n"));
    expect(r.result).not.toContain("E7[2]");
  });

  test("a key used only by unknown tokens merges by its text", () => {
    const base = `## A\n${F}\nCm | X[2]\n${F}\n\n---\n\n## Voicings: E2 A2 D3 G3 B3 E4\n- X[2]: x00000\n`;
    const r = merge(base, base.replace("x00000", "000000"), base.replace("Cm | X[2]", "Cm | X[2] | G"));
    expect(r.result.endsWith("- X[2]: 000000\n")).toBe(true);
  });
});

// --- §11.9.4 rule 4: the grouping, merged as a value ---

const GUITAR = "## Voicings: E2 A2 D3 G3 B3 E4";
const UKE = "## Voicings: G4 C4 E4 A4";

function song(chart, { voicings = [], uke = [] } = {}) {
  let text = `## A\n${F}\n${chart}\n${F}\n`;
  if (voicings.length || uke.length) text += "\n---\n";
  if (voicings.length) text += `\n${GUITAR}\n` + voicings.map((v) => `- ${v}\n`).join("");
  if (uke.length) text += `\n${UKE}\n` + uke.map((v) => `- ${v}\n`).join("");
  return text;
}

function bothWays(base, ours, theirs) {
  const r = merge(base, ours, theirs);
  const r2 = merge(base, theirs, ours);
  expect(r.result).toBe(r2.result);
  return r.result;
}

describe("§11.9.4 the grouping, merged as a value", () => {
  test("keys both sides joined are one key with no shapes", () => {
    const base = song("Cm | F7 | Cm[2] | G7\nF | G7");
    const ours = "- key: Cm\n\n" + song("Cm | F7 | Cm | G7\nF | G7");
    const theirs = song("Cm | F7 | Cm | G7\nF | G7(b9)");
    expect(bothWays(base, ours, theirs)).toBe("- key: Cm\n\n" + song("Cm | F7 | Cm | G7\nF | G7(b9)"));
  });

  test("a join survives a side that left the grouping alone", () => {
    const base = song("Cm | F7 | Cm[2] | G7\nF | G7");
    const ours = song("Cm | F7 | Cm | G7\nF | G7");
    const theirs = song("Cm | F7 | Cm[2] | G7\nF | G7(b9)");
    expect(bothWays(base, ours, theirs)).toBe(song("Cm | F7 | Cm | G7\nF | G7(b9)"));
  });

  test("a split survives a side that left the grouping alone", () => {
    const base = song("Cm | F7 | Cm | G7\nF | G7", { voicings: ["Cm: x35543"] });
    const ours = song("Cm | F7 | Cm[2] | G7\nF | G7", { voicings: ["Cm: x35543", "Cm[2]: 8-10-10-8-8-8"] });
    const theirs = song("Cm | F7 | Cm | G7\nF | G7(b9)", { voicings: ["Cm: x35543"] });
    const want = song("Cm | F7 | Cm[2] | G7\nF | G7(b9)", { voicings: ["Cm: x35543", "Cm[2]: 8-10-10-8-8-8"] });
    expect(bothWays(base, ours, theirs)).toBe(want);
  });

  test("a join by one side against an unchanged side is that side", () => {
    const base = song("Cm | Cm[2]");
    expect(merge(base, base, song("Cm | Cm")).result).toBe(song("Cm | Cm"));
    expect(merge(base, song("Cm | Cm"), base).result).toBe(song("Cm | Cm"));
  });

  test("moves of different bars both survive", () => {
    const base = song("Cm | F7 | Cm[2] | G7\nCm | F7 | Cm | G7\nCm[2]");
    const ours = song("Cm | F7 | Cm | G7\nCm | F7 | Cm | G7\nCm[2]");
    const theirs = song("Cm | F7 | Cm[2] | G7\nCm[2] | F7 | Cm | G7\nCm[2]");
    expect(bothWays(base, ours, theirs)).toBe(song("Cm | F7 | Cm | G7\nCm[2] | F7 | Cm | G7\nCm[2]"));
  });

  test("a joined bar plays the new shape of the key it joined", () => {
    const base = song("Cm | F7 | Cm[2] | G7\nCm | F7 | Cm | G7", { voicings: ["Cm: x35543", "Cm[2]: 8-10-10-8-8-8"] });
    const ours = song("Cm | F7 | Cm | G7\nCm | F7 | Cm | G7", { voicings: ["Cm: x35543"] });
    const theirs = song("Cm | F7 | Cm[2] | G7\nCm | F7 | Cm | G7", { voicings: ["Cm: x3554x", "Cm[2]: 8-10-10-8-8-8"] });
    expect(bothWays(base, ours, theirs)).toBe(song("Cm | F7 | Cm | G7\nCm | F7 | Cm | G7", { voicings: ["Cm: x3554x"] }));
  });

  test("a bar moved to an existing key plays its new shape", () => {
    const base = song("C | Cm\nF | Cm[2]\nCm | G", { voicings: ["Cm: x35543", "Cm[2]: x3554x"] });
    const ours = song("C | Cm[2]\nF | Cm[2]\nCm | G", { voicings: ["Cm: x35543", "Cm[2]: x3554x"] });
    let theirs = song("C | Cm\nF | Cm[2]\nCm | G", { voicings: ["Cm: x35543", "Cm[2]: 8-10-10-8-8-8"] });
    const want = song("C | Cm[2]\nF | Cm[2]\nCm | G", { voicings: ["Cm: x35543", "Cm[2]: 8-10-10-8-8-8"] });
    expect(bothWays(base, ours, theirs)).toBe(want);
    // had theirs given Cm the new shape instead, the moved bar is decided by both
    theirs = song("C | Cm\nF | Cm[2]\nCm | G", { voicings: ["Cm: 8-10-10-8-8-8", "Cm[2]: x3554x"] });
    const r = merge(base, ours, theirs);
    expect(r.conflicts.map((c) => [c.kind, c.base, c.ours, c.theirs])).toEqual([
      ["voicing", "x35543", "x3554x", "8-10-10-8-8-8"],
    ]);
  });

  test("a join against a new shape for the key it joined keeps the bars apart", () => {
    const base = song("Cm | Cm[2] | G7", { voicings: ["Cm: x35543", "Cm[2]: x35543"], uke: ["Cm: 0333", "Cm[2]: 5333"] });
    const ours = song("Cm | Cm | G7", { voicings: ["Cm: x35543"], uke: ["Cm: 0333"] });
    const theirs = song("Cm | Cm[2] | G7", { voicings: ["Cm: x35543", "Cm[2]: 8-10-10-8-8-8"], uke: ["Cm: 0333", "Cm[2]: 5333"] });
    const want = song("Cm | Cm[2] | G7", { voicings: ["Cm: x35543", "Cm[2]: 8-10-10-8-8-8"], uke: ["Cm: 0333", "Cm[2]: 0333"] });
    expect(bothWays(base, ours, theirs)).toBe(want);
  });

  test("a bar both sides moved apart is kept apart from both", () => {
    const base = song("Cm | Cm[2]\nCm | Cm[2]", { voicings: ["Cm: x35543", "Cm[2]: 8-10-10-8-8-8"], uke: ["Cm: 0333", "Cm[2]: 0333"] });
    const ours = song("Cm | Cm\nCm | Cm[2]", { voicings: ["Cm: x35543", "Cm[2]: 8-10-10-8-8-8"], uke: ["Cm: 0333", "Cm[2]: 0333"] });
    let theirs = song("Cm | Cm[3]\nCm | Cm[2]", { voicings: ["Cm: x35543", "Cm[2]: 8-10-10-8-8-8"], uke: ["Cm: 0333", "Cm[2]: 0333", "Cm[3]: 5333"] });
    const want = song("Cm | Cm[3]\nCm | Cm[2]", { voicings: ["Cm: x35543", "Cm[2]: 8-10-10-8-8-8", "Cm[3]: x35543"], uke: ["Cm: 0333", "Cm[2]: 0333", "Cm[3]: 5333"] });
    expect(bothWays(base, ours, theirs)).toBe(want);
    // had theirs also given bar 2 a guitar shape, the two shapes would conflict
    theirs = theirs.replace("- Cm[2]: 8-10-10-8-8-8\n", "- Cm[2]: 8-10-10-8-8-8\n- Cm[3]: x3554x\n");
    const r = merge(base, ours, theirs);
    expect(r.conflicts.map((c) => [c.kind, c.key, c.base, c.ours, c.theirs])).toEqual([
      ["voicing", "Cm[3]", "8-10-10-8-8-8", "x35543", "x3554x"],
    ]);
  });

  test("a line added with a key the other side joined joins too", () => {
    const base = song("Cm | F7 | Cm[2] | G7\nCm | F7 | Cm | G7");
    const ours = song("Cm | F7 | Cm | G7\nCm | F7 | Cm | G7");
    const theirs = song("Cm | F7 | Cm[2] | G7\nCm | F7 | Cm | G7\nAb | Cm[2]");
    expect(bothWays(base, ours, theirs)).toBe(song("Cm | F7 | Cm | G7\nCm | F7 | Cm | G7\nAb | Cm"));
  });

  test("a joined variant has the shape of the base key most of it continues", () => {
    const base = song("Cm | Cm | Cm[2] | Cm", { voicings: ["Cm: x35543", "Cm[2]: 8-10-10-8-8-8"] });
    const ours = song("Cm | Cm | Cm | Cm", { voicings: ["Cm: x3554x"] });
    const theirs = "# Tarde\n\n" + song("Cm | Cm | Cm | Cm", { voicings: ["Cm: x35543"] });
    const want = "# Tarde\n\n" + song("Cm | Cm | Cm | Cm", { voicings: ["Cm: x3554x"] });
    expect(bothWays(base, ours, theirs)).toBe(want);
  });

  test("a joined variant conflicts when both sides moved off its base shape", () => {
    const base = song("Cm | Cm[2] | Cm[2] | Cm[2]", { voicings: ["Cm: x35543", "Cm[2]: 8-10-10-8-8-8"] });
    const ours = song("Cm | Cm | Cm | Cm", { voicings: ["Cm: x3554x"] });
    const theirs = song("Cm | Cm | Cm | Cm", { voicings: ["Cm: x35543"] });
    const r = merge(base, ours, theirs);
    expect(r.conflicts.map((c) => [c.kind, c.key, c.base, c.ours, c.theirs])).toEqual([
      ["voicing", "Cm", "8-10-10-8-8-8", "x3554x", "x35543"],
    ]);
  });

  test("between equal numbers the joined variant continues the least index", () => {
    const base = song("Cm | Cm[2]", { voicings: ["Cm: x35543", "Cm[2]: 8-10-10-8-8-8"] });
    const ours = song("Cm | Cm", { voicings: ["Cm: x3554x"] });
    let theirs = "# Tarde\n\n" + song("Cm | Cm", { voicings: ["Cm: x35543"] });
    expect(merge(base, ours, theirs).result).toBe("# Tarde\n\n" + song("Cm | Cm", { voicings: ["Cm: x3554x"] }));
    theirs = "# Tarde\n\n" + song("Cm | Cm", { voicings: ["Cm: 8-10-10-8-8-8"] });
    expect(merge(base, ours, theirs).conflicts[0].base).toBe("x35543");
  });

  test("a joined variant is numbered by the base key it continues", () => {
    const base = song("Cm | Cm[2] | Cm[3] | Cm[3]\nF | G");
    const ours = song("Cm | Cm[2] | Cm[2] | Cm[2]\nF | G");
    const theirs = song("Cm | Cm[2] | Cm[2] | Cm[2]\nF | G7");
    expect(merge(base, ours, theirs).result).toBe(song("Cm | Cm[2] | Cm[2] | Cm[2]\nF | G7"));
  });

  test("an occurrence's grouping merges as a value", () => {
    const a = K("Cm");
    const b = K("Cm[2]");
    const n = K("Cm[3]");
    const m = new SongMerge(song("Cm | Cm[2] | Cm"), song("Cm | Cm | Cm[2]"), song("Cm | Cm[2] | Cm[2]"));
    m.run();
    // bar 1: no side moved it; bar 2: ours joined it into Cm; bar 3: both split
    // it off, ours to a new key and theirs to the existing Cm[2]
    expect(m.grouping([a, a, a])).toEqual(["base", a]);
    expect(m.grouping([b, a, b])).toEqual(["base", a]);
    expect(m.grouping([a, b, b])).toEqual(["pair", ["new", "ours", b], ["base", b]]);
    expect(m.grouping([null, n, null])).toEqual(["new", "ours", n]);
  });

  test("a key of unknown tokens is not joined", () => {
    const base = song("Cm | Cm[2] | X[2]\nF | G", { voicings: ["Cm: x35543", "X[2]: x00000"] });
    const ours = song("Cm | Cm | X[2]\nF | G", { voicings: ["Cm: x35543", "X[2]: x00000"] });
    const theirs = song("Cm | Cm | X[2]\nF | G7", { voicings: ["Cm: x35543", "X[2]: x00000"] });
    expect(merge(base, ours, theirs).result).toBe(song("Cm | Cm | X[2]\nF | G7", { voicings: ["Cm: x35543", "X[2]: x00000"] }));
  });
});
