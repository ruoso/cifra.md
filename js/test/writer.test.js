// §8.4 The canonical serialiser — model→text — ported case by case from the
// reference's reference/tests/test_writer.py (cifra_js.writer refinement
// §Acceptance "unit (writer.test.js)"). Agreement with the reference is by the
// corpus; these cases pin §8.4 construct by construct on tiny, purpose-written
// documents. No one's copyrighted words appear.

import { describe, test, expect } from "vitest";

import { parse, write, canonical } from "../src/index.js";
import { serialize } from "../src/write.js";

// Strip the fields that describe a text, not a model (§8.1 lines 27–29), as the
// reference's roundtrip helper does.
function strip(d) {
  const o = {};
  for (const [k, v] of Object.entries(d)) if (k !== "diagnostics" && k !== "sungAt") o[k] = v;
  return o;
}

// Canonicalise, check the canonical text reads back as the canonical model, and
// that canonicalising again changes nothing (§8.1 the fixed point).
function roundtrip(text) {
  const doc = parse(text);
  const out = write(doc);
  const again = parse(out);
  expect(strip(again)).toEqual(strip(canonical(doc)));
  expect(write(again)).toBe(out);
  return out;
}

// The shortest well-formed document wrapping bare chart lines.
const chart = (t) => "## A\n```\n" + t + "\n```\n";

describe("the chord line (§8.4.4)", () => {
  test("items and bar lines joined by single spaces", () => {
    expect(roundtrip(chart("  C   Am |F   G  "))).toBe("## A\n```\nC Am | F G\n```\n");
  });

  test("leading and closing bars", () => {
    expect(roundtrip(chart("| C | G ||"))).toBe("## A\n```\n| C | G ||\n```\n");
  });

  test("the double bar", () => {
    expect(roundtrip(chart("C || G"))).toBe("## A\n```\nC || G\n```\n");
  });

  test("repeat marks on bar lines", () => {
    expect(roundtrip(chart("|: C | G :|"))).toBe("## A\n```\n|: C | G :|\n```\n");
    expect(roundtrip(chart("( C | G ) 3x"))).toBe("## A\n```\n( C | G ) x3\n```\n");
    expect(roundtrip(chart("(C G)"))).toBe("## A\n```\n( C G )\n```\n");
  });

  test("endings (1., 2.)", () => {
    expect(roundtrip(chart("|: Dm | G7 |1. C | A7 :|2. C | C |"))).toBe(
      "## A\n```\n|: Dm | G7 | 1. C | A7 :| 2. C | C |\n```\n",
    );
  });

  test("a close mark against a chord", () => {
    expect(roundtrip(chart("|: C | G7:| F"))).toBe("## A\n```\n|: C | G7 :| F\n```\n");
  });

  test("bar anchors (@9) and an anchor-only line moving to the next bar", () => {
    expect(roundtrip(chart("@9 Dm | G7 | @17 Em"))).toBe("## A\n```\n@9 Dm | G7 | @17 Em\n```\n");
    expect(roundtrip(chart("@9\nDm | G7"))).toBe("## A\n```\n@9 Dm | G7\n```\n");
  });

  test("unknown tokens and repeat signs (%)", () => {
    expect(roundtrip(chart("C | % | fine | (solo)"))).toBe("## A\n```\nC | % | fine | (solo)\n```\n");
  });

  test("cifra counts ((2x), bis) written as x form", () => {
    expect(roundtrip(chart("( C | G ) (2x)"))).toBe("## A\n```\n( C | G ) x2\n```\n");
    expect(roundtrip(chart("C | G bis"))).toBe("## A\n```\nC | G x2\n```\n");
    expect(roundtrip(chart("C | G 2x"))).toBe("## A\n```\nC | G x2\n```\n");
  });

  test("beat runs and annotations (// )", () => {
    const text = "C / / / | G . . .\nG D Em C\n// repete\n";
    expect(roundtrip(chart(text))).toBe("## A\n```\n" + text + "```\n");
  });

  test("N.C. is written canonically; punctuation dropped", () => {
    expect(roundtrip(chart("nc | NC | n.c. | C"))).toBe("## A\n```\nN.C. | N.C. | N.C. | C\n```\n");
  });
});

describe("sections, fences and metadata (§8.4.1–§8.4.3)", () => {
  test("the title line and properties then one blank line", () => {
    expect(roundtrip("#  Title  \n-  artist :  Me \n\n```\nC\n```\n")).toBe(
      "# Title\n- artist: Me\n\n```\nC\n```\n",
    );
  });

  test("heading levels become 2", () => {
    expect(roundtrip("### A\n```\nC\n```\n")).toBe("## A\n```\nC\n```\n");
  });

  test("a heading's count and anchor and the closing-# guard", () => {
    expect(roundtrip("## Refrão (2x)\n```\nC\n```\n")).toBe("## Refrão x2\n```\nC\n```\n");
    expect(roundtrip("## A x2 @9\n```\nC | G\n```\n")).toBe("## A @9 x2\n```\nC | G\n```\n");
  });

  test("a heading anchor", () => {
    expect(roundtrip("## A @9\n```\nDm\n```\n")).toBe("## A @9\n```\nDm\n```\n");
  });

  test("cifra (bracket/label) headings share one fence and carry a leading chord line", () => {
    const text = "```\n[Intro]  G   D\n\n[Verse]\nG     D\nla la la\nRefrão:  C G\n```\n";
    expect(roundtrip(text)).toBe("```\n[Intro] G D\n\n[Verse]\nG     D\nla la la\n\nRefrão: C G\n```\n");
  });

  test("a verbatim fence with its info string", () => {
    const text = "## A\n```tab\ne|--0--|\n```\n\n```\nC\n```\n";
    expect(roundtrip(text)).toBe(text);
  });

  test("notes are kept in place with blank runs collapsed", () => {
    const text = "## A\n\nslowly\n\n```\nC\n```\n\nthen faster\n";
    expect(roundtrip(text)).toBe("## A\nslowly\n\n```\nC\n```\n\nthen faster\n");
  });

  test("an empty section is kept as a heading", () => {
    expect(roundtrip("## A\n## B\n```\nC\n```\n")).toBe("## A\n\n## B\n```\nC\n```\n");
  });
});

describe("sung lines (§8.4.5)", () => {
  test("the two-line count and columns kept", () => {
    const text = "G           D\nWhen I first saw you";
    expect(roundtrip(chart(text))).toBe("## A\n```\n" + text + "\n```\n");
  });

  test("the lead words", () => {
    const text = "        G\nOh when I first";
    expect(roundtrip(chart(text))).toBe("## A\n```\n" + text + "\n```\n");
  });

  test("a forced line written with >", () => {
    const text = "G             D\n> A tarde era clara";
    expect(roundtrip(chart(text))).toBe("## A\n```\n" + text + "\n```\n");
  });

  test("lyric lines and breaks", () => {
    const text = "G\nla la\n\nsecond verse\n> A\nC | G";
    expect(roundtrip(chart(text))).toBe("## A\n```\n" + text + "\n```\n");
  });

  test("bars on a sung line at their columns", () => {
    const text = "G      | D\nWhen I   saw you";
    expect(roundtrip(chart(text))).toBe("## A\n```\n" + text + "\n```\n");
  });
});

describe("the voicings part (§8.4.6)", () => {
  test("items sorted and single-spaced", () => {
    const text =
      "```\nG | C | Cm | Cm[2]\n```\n---\n## voicings : E2,A2,D3,G3,B3,E4\n-   G:320003\n- Cm[2] : 8-10-10-8-8-8\n- C: x32010\n";
    expect(roundtrip(text)).toBe(
      "```\nG | C | Cm | Cm[2]\n```\n\n---\n\n## Voicings: E2 A2 D3 G3 B3 E4\n- C: x32010\n- Cm[2]: 8-10-10-8-8-8\n- G: 320003\n",
    );
  });

  test("blocks ordered by first tuning with the default variation first", () => {
    const text =
      "```\nC\n```\n---\n## Hard: G4 C4 E4 A4\n- C: 5433\n## Voicings: E2 A2 D3 G3 B3 E4\n- C: x32010\n## Voicings: G4 C4 E4 A4\n- C: 0003\n";
    const out = roundtrip(text);
    expect(out.indexOf("## Voicings: G4")).toBeLessThan(out.indexOf("## Hard"));
    expect(out.indexOf("## Hard")).toBeLessThan(out.indexOf("## Voicings: E2"));
  });

  test("problem items are dropped", () => {
    const text = "```\nC\n```\n---\n## Voicings: E2 A2 D3 G3 B3 E4\n- C: x32010\n- G: nope\n";
    expect(write(parse(text))).not.toContain("nope");
  });

  test("empty blocks are written as a heading alone", () => {
    const text = "```\nC\n```\n---\n## Voicings: E2 A2\n## Simple: E2 A2\n";
    expect(roundtrip(text)).toBe("```\nC\n```\n\n---\n\n## Voicings: E2 A2\n\n## Simple: E2 A2\n");
  });

  test("no blocks → no rule", () => {
    expect(roundtrip("```\nC\n```\n---\n")).toBe("```\nC\n```\n");
  });

  test("notes in a block follow the items", () => {
    const text = "```\nC\n```\n---\n## Voicings: E2 A2\nuse a pick\n- C: 32\n";
    expect(roundtrip(text)).toBe("```\nC\n```\n\n---\n\n## Voicings: E2 A2\n- C: 32\nuse a pick\n");
  });

  test("the code-point sort: a supplementary-plane symbol sorts by code point, not UTF-16 code unit", () => {
    // U+FF0B sorts before U+1D12B by code point, after it by UTF-16 code unit.
    const VOICED = "\n---\n\n## Voicings: E2 A2 D3 G3 B3 E4\n";
    let text = chart("X\u{1d12b} | X＋ | A♭ | Am | A") + VOICED;
    text +=
      "- X\u{1d12b}: x32010\n- X＋: x32010\n- A♭: x32010\n- Am: x02210\n- A: x02220\n";
    const out = roundtrip(text);
    expect(
      out.endsWith(
        "- A: x02220\n- Am: x02210\n- A♭: x32010\n- X＋: x32010\n- X\u{1d12b}: x32010\n",
      ),
    ).toBe(true);
  });
});

describe("serialising a model that was not read (§8.4)", () => {
  test("a section created from the model", () => {
    const doc = parse("# T\n");
    const line = parse(chart("C  Am |F")).sections[0].body[0];
    doc.sections.push({ name: "New", heading: "markdown", anchor: null, body: [line], groups: [] });
    expect(write(doc)).toBe("# T\n\n## New\n```\nC Am | F\n```\n");
    expect(serialize(canonical(doc))).toBe(write(doc));
  });
});
