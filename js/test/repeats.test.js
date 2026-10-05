// §3 Repeats — the % sign, groups, counts and endings — ported from the
// reference's reference/tests/test_repeats.py (cifra_js.reader refinement
// §Acceptance "unit (repeats.test.js)"). Repeats are kept as written, not
// expanded (§3.5 is optional — §Decisions). Agreement with the reference is by
// the corpus; these cases pin the §3 constructs and diagnostics on tiny,
// purpose-written charts. No one's copyrighted words appear.

import { describe, test, expect } from "vitest";

import { parse } from "../src/index.js";

const chart = (t) => "## A\n```\n" + t + "\n```\n";
const codes = (m) => m.diagnostics.map((d) => d.code);
const music = (m) => m.sections.find((s) => s.body.some((p) => p.type === "music")).body.find((p) => p.type === "music");
const firstSection = (m) => m.sections.find((s) => s.body.some((p) => p.type === "music"));
const itemTypes = (t) => music(parse(chart(t))).lines[0].measures.flatMap((mm) => mm.items.map((it) => it.type));

// --- the measure-repeat sign (§3.1) ------------------------------------------
describe("the % sign (§3.1)", () => {
  test("a % is a repeat item, kept as its own bar", () => {
    expect(itemTypes("C | %")).toEqual(["chord", "repeat"]);
    expect(codes(parse(chart("C | %")))).toEqual([]);
  });

  test("a % with no measure before it is reported", () => {
    expect(codes(parse(chart("%")))).toContain("repeat-without-previous");
  });

  test("a % beside other items is reported", () => {
    expect(codes(parse(chart("C | % D")))).toContain("repeat-beside-items");
  });
});

// --- groups (§3.2) -----------------------------------------------------------
describe("groups (§3.2)", () => {
  test("a barline group and a bracket group are interchangeable", () => {
    const g = (t) => firstSection(parse(chart(t))).groups;
    expect(g("|: C :|")).toHaveLength(1);
    expect(g("( C )")).toHaveLength(1);
    expect(g("|: C :|")[0].count).toBe(2);
    expect(g("( C )")[0].count).toBe(2);
  });

  test("a group opened and never closed is reported", () => {
    expect(codes(parse(chart("|: C")))).toContain("unclosed-group");
  });

  test("a closing mark with no open group is a stray mark", () => {
    expect(codes(parse(chart("C :|")))).toContain("stray-mark");
  });
});

// --- counts (§3.3) -----------------------------------------------------------
describe("counts (§3.3)", () => {
  test("a count on a group sets its count", () => {
    const g = firstSection(parse(chart("|: C :| x3"))).groups[0];
    expect(g.count).toBe(3);
  });

  test.each(["x2", "2x", "×2", "(2x)", "bis"])("a line ending in %s sets the line's count", (token) => {
    const expected = token === "bis" ? 2 : 2;
    const l = music(parse(chart("C " + token))).lines[0];
    expect(l.times).toBe(expected);
  });

  test("a section heading count sets the section's count", () => {
    const m = parse("## Chorus x4\n```\nC\n```\n");
    expect(m.sections[0].times).toBe(4);
  });

  test("a count that ends neither a group nor a line is reported", () => {
    expect(codes(parse(chart("C x2 D")))).toContain("count-out-of-place");
  });
});

// --- endings (§3.4) ----------------------------------------------------------
describe("endings (§3.4)", () => {
  test("endings in a group are read in order, the count taken from them", () => {
    const g = firstSection(parse(chart("|: C 1. D 2. :|"))).groups[0];
    expect(g.endings.map((e) => e.number)).toEqual([1, 2]);
    expect(g.count).toBe(2);
  });

  test("endings out of 1..n order are reported", () => {
    expect(codes(parse(chart("|: C 1. D 3. :|")))).toContain("bad-ending-sequence");
  });

  test("a group with both endings and a count is reported", () => {
    expect(codes(parse(chart("|: C 1. D 2. :| x4")))).toContain("count-with-endings");
  });

  test("an ending outside a group is reported and demoted to an unknown token", () => {
    const m = parse(chart("C 1."));
    expect(codes(m)).toContain("ending-outside-group");
    const last = music(m).lines[0].measures.flatMap((mm) => mm.items).at(-1);
    expect(last.type).toBe("unknown");
    expect(last.text).toBe("1.");
  });
});
