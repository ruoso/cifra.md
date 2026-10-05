// Spec §11.13, the setlist merge, ported from the reference's setlist-merge
// cases in reference/tests/test_merge.py on purpose-written setlists (invented
// song names and paths, never a real song). A setlist merges as a song does with
// less in it; every corpus/merge/ setlist entry (24, 25, 60–68) is held byte for
// byte by the corpus harness (test/corpus.test.js), so this file pins the
// three-step item pairing and the setlist conflict kinds rule by rule.

import { describe, test, expect } from "vitest";

import { merge, conflictsJson } from "../src/merge.js";
import { sideBodyIds } from "../src/setlist_merge.js";
import { parseSetlist } from "../src/setlist.js";

// A setlist from a list of item specs "Name;entry;entry". A `~` prefix makes an
// unlinked item; otherwise the item links to `name.cifra.md`.
function setlistText(...items) {
  const lines = ["# Friday", ""];
  items.forEach((it, idx) => {
    const n = idx + 1;
    const [name, ...entries] = it.split(";");
    lines.push(name.startsWith("~") ? `${n}. ${name.slice(1)}` : `${n}. [${name}](${name.toLowerCase()}.cifra.md)`);
    const pad = " ".repeat(String(n).length + 2);
    for (const e of entries) lines.push(`${pad}- ${e}`);
  });
  return lines.join("\n") + "\n";
}

// The identities a side's body pairs to, as [name-without-extension, occurrence].
function ids(base, side) {
  return sideBodyIds(parseSetlist(base).body, parseSetlist(side).body).map((i) => [i[1].split(".")[0], i[2]]);
}

describe("§11.13 a song played more than once: the three-step pairing", () => {
  test("a copy inserted before another is the new one", () => {
    const b = setlistText("A", "B", "A");
    expect(ids(b, setlistText("A;key: D", "A", "B", "A"))).toEqual([
      ["a", 3],
      ["a", 1],
      ["b", 1],
      ["a", 2],
    ]);
  });

  test("a copy changed pairs with the base copy in its place", () => {
    const b = setlistText("A", "B", "A");
    // step 2: the changed last copy is base's second, the new first copy is new
    expect(ids(b, setlistText("A;key: D", "A", "B", "A;note: encore"))).toEqual([
      ["a", 3],
      ["a", 1],
      ["b", 1],
      ["a", 2],
    ]);
  });

  test("a copy moved pairs in order of appearance", () => {
    const b = setlistText("A", "B", "A;note: encore");
    // step 3: B, unpaired by both alignments, is base's B; the plain A is deleted
    expect(ids(b, setlistText("A;note: encore", "B"))).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
    expect(ids(setlistText("A", "B"), setlistText("B", "A"))).toEqual([
      ["b", 1],
      ["a", 1],
    ]);
  });

  test("new copies are numbered after base's", () => {
    expect(ids(setlistText("A"), setlistText("A", "B", "A", "A"))).toEqual([
      ["a", 1],
      ["b", 1],
      ["a", 2],
      ["a", 3],
    ]);
    expect(ids(setlistText("~a song", "~a song"), setlistText("~a song", "~a song", "~a song"))).toEqual([
      ["a song", 1],
      ["a song", 2],
      ["a song", 3],
    ]);
  });
});

describe("§11.13 the setlist merge", () => {
  test("a song played twice keeps each copy's entries", () => {
    const b = setlistText("A", "B", "A");
    const o = setlistText("A;key: D", "A", "B", "A");
    let t = setlistText("A", "B", "A;note: encore");
    const want = setlistText("A;key: D", "A", "B", "A;note: encore");
    expect(merge(b, o, t, { setlist: true }).result).toBe(want);
    expect(merge(b, t, o, { setlist: true }).result).toBe(want);
    // the note on the first copy stays on the first copy
    t = setlistText("A;note: slow", "B", "A");
    const want2 = setlistText("A;key: D", "A;note: slow", "B", "A");
    expect(merge(b, o, t, { setlist: true }).result).toBe(want2);
  });

  test("a copy added by both sides is one item", () => {
    const b = setlistText("A", "B");
    expect(merge(b, setlistText("A", "B", "A"), setlistText("A", "B", "A", "C"), { setlist: true }).result).toBe(
      setlistText("A", "B", "A", "C"),
    );
  });

  test("a copy removed and changed names its occurrence", () => {
    const b = setlistText("A", "B", "A;key: D");
    const r = merge(b, setlistText("A", "B"), setlistText("A;note: slow", "B", "A;key: E"), { setlist: true });
    const data = JSON.parse(conflictsJson(r)).conflicts;
    expect(data.map((c) => [c.kind, c.item, c.occurrence])).toEqual([["item", "a.cifra.md", 2]]);
  });
});

describe("§11.13 setlist conflict kinds and marked text", () => {
  test("the title and properties merge as keyed lists, a title conflict is a region", () => {
    const b = "# Friday\n- place: Bar\n\n1. [A](a.cifra.md)\n";
    const o = "# Saturday\n- place: Bar\n- time: 9pm\n\n1. [A](a.cifra.md)\n";
    const t = "# Sunday\n- place: Bar\n\n1. [A](a.cifra.md)\n";
    const r = merge(b, o, t, { setlist: true });
    expect(r.conflicts[0].kind).toBe("title");
    // the non-conflicting added property is kept in the marked text
    expect(r.marked).toContain("- time: 9pm");
    expect(r.marked.split("\n")).toContain("<<<<<<< ours");
  });

  test("a link text changed two ways is a text conflict", () => {
    const b = "# Friday\n\n1. [A](a.cifra.md)\n";
    const o = "# Friday\n\n1. [Alpha](a.cifra.md)\n";
    const t = "# Friday\n\n1. [Ayy](a.cifra.md)\n";
    const r = merge(b, o, t, { setlist: true });
    expect(r.conflicts.map((c) => c.kind)).toEqual(["text"]);
    expect(r.conflicts[0].item).toBe("a.cifra.md");
  });

  test("an item property given two values is an entry conflict", () => {
    const b = "# Friday\n\n1. [A](a.cifra.md)\n   - key: C\n";
    const o = "# Friday\n\n1. [A](a.cifra.md)\n   - key: D\n";
    const t = "# Friday\n\n1. [A](a.cifra.md)\n   - key: E\n";
    const r = merge(b, o, t, { setlist: true });
    expect(r.conflicts.map((c) => [c.kind, c.key])).toEqual([["entry", "key"]]);
  });

  test("a notes block changed on both sides is a notes conflict, named by the item it follows", () => {
    const b = "# Friday\n\n1. [A](a.cifra.md)\n\nInterlude.\n\n2. [B](b.cifra.md)\n";
    const o = "# Friday\n\n1. [A](a.cifra.md)\n\nInterlude, slow.\n\n2. [B](b.cifra.md)\n";
    const t = "# Friday\n\n1. [A](a.cifra.md)\n\nInterlude.\nStand.\n\n2. [B](b.cifra.md)\n";
    const r = merge(b, o, t, { setlist: true });
    expect(r.conflicts.map((c) => [c.kind, c.after])).toEqual([["notes", "a.cifra.md"]]);
    expect(r.marked.split("\n")).toContain("<<<<<<< ours");
  });

  test("a setlist whose side is a marked text is never merged", () => {
    const b = "1. [A](a.cifra.md)\n";
    const t = b + "<<<<<<< ours\n2. [B](b.cifra.md)\n=======\n>>>>>>> theirs\n";
    const r = merge(b, b + "2. [C](c.cifra.md)\n", t, { setlist: true });
    expect(r.conflicts).toEqual([{ kind: "unresolved", theirs: 2 }]);
    expect(r.marked).toBeNull();
  });
});
