// §2 The chart — measures, bar lines and items — ported from the reference's
// reference/tests/test_chart.py (cifra_js.reader refinement §Acceptance "unit
// (chart.test.js)"). Agreement with the reference is by the corpus; these cases
// pin the §2 constructs on tiny, purpose-written charts. No one's copyrighted
// words appear.

import { describe, test, expect } from "vitest";

import { parse } from "../src/index.js";

// The shortest well-formed chart document wrapping bare chart lines.
const chart = (t) => "## A\n```\n" + t + "\n```\n";
const line = (m) =>
  m.sections.find((s) => s.body.some((p) => p.type === "music")).body.find((p) => p.type === "music").lines[0];
const measures = (t) => line(parse(chart(t))).measures;
const types = (measure) => measure.items.map((it) => it.type);

// --- measures and bar lines (§2.2) -------------------------------------------
describe("measures and bar lines (§2.2)", () => {
  test("bar lines split a line into measures, keeping | and ||", () => {
    const ms = measures("C | D || E");
    expect(ms.map((x) => x.bar)).toEqual([null, "|", "||"]);
    expect(ms.length).toBe(3);
  });

  test("a line with no bar line is one run, numbered as a single bar", () => {
    const l = line(parse(chart("C D")));
    expect(l.run).toBe(true);
    expect(l.measures.length).toBe(1);
    expect(types(l.measures[0])).toEqual(["chord", "chord"]);
  });

  test("leading bar lines with nothing to play make no measures", () => {
    const ms = measures("| | C");
    expect(ms.length).toBe(1);
    expect(ms[0].items.map((it) => it.type)).toEqual(["chord"]);
  });
});

// --- items and classification (§2.3) -----------------------------------------
describe("items and classification (§2.3)", () => {
  test("several chords sit in one measure (§2.5)", () => {
    const ms = measures("C D");
    expect(ms.length).toBe(1);
    expect(types(ms[0])).toEqual(["chord", "chord"]);
  });

  test("the no-chord mark is a nochord item (§2.6)", () => {
    expect(types(measures("N.C.")[0])).toEqual(["nochord"]);
    expect(types(measures("nc")[0])).toEqual(["nochord"]);
  });

  test("a beat mark is a beat item", () => {
    expect(types(measures("C / / /")[0])).toEqual(["chord", "beat", "beat", "beat"]);
  });
});

// --- chord tokens and footnote markers (§2.4) --------------------------------
describe("chord tokens and footnote markers (§2.4)", () => {
  test("a footnote marker becomes the voicing index and key", () => {
    const it = measures("Cm[2]")[0].items[0];
    expect(it.index).toBe(2);
    expect(it.key).toBe("Cm[2]");
    expect(it.symbol).toBe("Cm");
  });

  test("[0] and [1] read as index 1", () => {
    const ms = measures("C[1] | C[0]");
    expect(ms[0].items[0].index).toBe(1);
    expect(ms[0].items[0].key).toBe("C");
    expect(ms[1].items[0].index).toBe(1);
  });

  test("gaps in footnote indices are kept, never renumbered", () => {
    const ms = measures("Cm[2] | Cm[5]");
    expect(ms[0].items[0].index).toBe(2);
    expect(ms[1].items[0].index).toBe(5);
    expect(ms[1].items[0].key).toBe("Cm[5]");
  });
});

// --- bar anchors and bar numbers (§2.8) --------------------------------------
describe("bar anchors and bar numbers (§2.8)", () => {
  test("an anchor sets a measure's number, which then carries forward", () => {
    const ms = measures("@5 C | D");
    expect(ms[0].number).toBe(5);
    expect(ms[0].stated).toBe(true);
    expect(ms[0].anchor).toBe(5);
    expect(ms[1].number).toBe(6);
    expect(ms[1].stated).toBe(false);
  });

  test("numbering continues across measures from 1 by default", () => {
    const ms = measures("C | D | E");
    expect(ms.map((x) => x.number)).toEqual([1, 2, 3]);
  });
});

// --- unknown tokens (§2.9) ---------------------------------------------------
describe("unknown tokens (§2.9)", () => {
  test("an unknown token is kept as an item and is not a diagnostic", () => {
    const m = parse(chart("C Xyz"));
    const ms = line(m).measures;
    expect(types(ms[0])).toEqual(["chord", "unknown"]);
    expect(ms[0].items[1].text).toBe("Xyz");
    expect(m.diagnostics).toEqual([]);
  });
});
