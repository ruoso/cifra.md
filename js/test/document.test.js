// §1 Document structure — the reader side, ported from the reference's
// reference/tests/test_document.py and the reader half of test_marker_lines.py
// (cifra_js.reader refinement §Acceptance "unit (document.test.js)"). Agreement
// with the reference is by the corpus; these cases pin the §1 constructs and the
// §1 diagnostics on tiny, purpose-written documents. No one's copyrighted words
// appear.

import { describe, test, expect } from "vitest";

import { parse } from "../src/index.js";

const codes = (m) => m.diagnostics.map((d) => d.code);
// The shortest well-formed chart document wrapping bare chart lines.
const chart = (t) => "## A\n```\n" + t + "\n```\n";
const sections = (m) => m.sections.map((s) => s.name);

// --- the title (§1.4.1) ------------------------------------------------------
describe("the title (§1.4.1)", () => {
  test("a level-1 heading that is the first non-blank line is the title", () => {
    expect(parse("# Song\n").title).toBe("Song");
    expect(parse("\n\n# Song\n").title).toBe("Song");
  });

  test("`#` alone is a title line but names no title", () => {
    expect(parse("#\n").title).toBeNull();
  });

  test("`#` with no space is not a heading, so not a title", () => {
    expect(parse("#Song\n").title).toBeNull();
  });

  test("a level-1 heading that is not first is a section, not the title", () => {
    const m = parse("# Title\n\n# Later\ntext\n");
    expect(m.title).toBe("Title");
    expect(sections(m)).toContain("Later");
  });
});

// --- properties (§1.4.2) -----------------------------------------------------
describe("properties (§1.4.2)", () => {
  test("a Markdown list after the title holds properties, keys lowercased", () => {
    const m = parse("# T\n- Capo: 2\n- key: C\n");
    expect(m.properties).toEqual([
      { key: "capo", value: "2" },
      { key: "key", value: "C" },
    ]);
  });

  test("a list with no title is still read as properties", () => {
    const m = parse("- key: C\n");
    expect(m.properties).toEqual([{ key: "key", value: "C" }]);
  });

  test("a property needs a space after the colon", () => {
    const m = parse("# T\n- key:C\n");
    expect(codes(m)).toContain("bad-property");
    expect(m.properties).toEqual([]);
  });

  test("an empty value is kept", () => {
    const m = parse("# T\n- key:\n");
    expect(m.properties).toEqual([{ key: "key", value: "" }]);
  });

  test("first-appearance order is kept and the last value wins on repeat", () => {
    const m = parse("# T\n- key: C\n- capo: 2\n- key: D\n");
    expect(m.properties).toEqual([
      { key: "key", value: "D" },
      { key: "capo", value: "2" },
    ]);
    expect(codes(m)).toContain("duplicate-property");
  });
});

// --- reserved keys (§1.4.3) --------------------------------------------------
describe("reserved keys (§1.4.3)", () => {
  test("an unknown notation falls back with a bad-notation diagnostic", () => {
    const m = parse("# T\n- notation: klingon\n");
    expect(codes(m)).toContain("bad-notation");
  });

  test("notation resolves the dialect used to read chords", () => {
    // C7+ reads as a major seventh in brazilian, dominant #5 in american.
    const br = parse(chart("C7+"));
    const am = parse("# T\n- notation: american\n## A\n```\nC7+\n```\n");
    const qual = (m) =>
      m.sections.find((s) => s.body.some((p) => p.type === "music")).body.find((p) => p.type === "music")
        .lines[0].measures[0].items[0].chord.quality;
    expect(qual(br)).not.toBe(qual(am));
  });

  test("words: yes forces a non-sung document sung", () => {
    const m = parse("# T\n- words: yes\n## A\n```\nC G\n```\n");
    expect(m.sung).toBe(true);
  });

  test("words: no forces a sung-looking document not sung", () => {
    const m = parse("# T\n- words: no\n## A\n```\nC\nla la la\n```\n");
    expect(m.sung).toBe(false);
  });

  test("words that is neither yes nor no is a bad-property", () => {
    const m = parse("# T\n- words: maybe\n## A\n```\nC\n```\n");
    expect(codes(m)).toContain("bad-property");
  });
});

// --- the rule and the two parts (§1.5, §1.6) ---------------------------------
describe("the rule (§1.6)", () => {
  const withVoicings = (extra) =>
    "## A\n```\nC\n```\n---\n## Voicings: E2 A2 D3 G3 B3 E4\n- C: x32010\n" + extra;

  test("the first rule ends the chart and begins the voicings part", () => {
    const m = parse(withVoicings(""));
    expect(m.blocks.length).toBe(1);
    expect(m.blocks[0].voicings[0].key).toBe("C");
  });

  test("a later rule is reported and ignored", () => {
    const m = parse(withVoicings("---\n"));
    expect(codes(m)).toContain("extra-rule");
  });
});

// --- headings (§1.7) ---------------------------------------------------------
describe("headings (§1.7)", () => {
  test("a Markdown heading outside a fence opens a section", () => {
    const m = parse("## Intro\n```\nC\n```\n");
    expect(m.sections[0].name).toBe("Intro");
    expect(m.sections[0].heading).toBe("markdown");
  });

  test("a bracket heading inside a fence opens a section", () => {
    const m = parse("```\n[Intro]\nC\n```\n");
    const s = m.sections.find((x) => x.name === "Intro");
    expect(s.heading).toBe("bracket");
  });

  test("a label heading inside a fence opens a section", () => {
    const m = parse("```\nIntro: C G\nC\n```\n");
    const s = m.sections.find((x) => x.name === "Intro");
    expect(s.heading).toBe("label");
  });

  test("an anchor and a count on a heading are read (§1.7.4)", () => {
    const m = parse("## Chorus @5 x2\n```\nC\n```\n");
    expect(m.sections[0].name).toBe("Chorus");
    expect(m.sections[0].anchor).toBe(5);
    expect(m.sections[0].times).toBe(2);
  });
});

// --- sections (§1.8) ---------------------------------------------------------
describe("sections (§1.8)", () => {
  test("music before the first heading is the empty-named section", () => {
    const m = parse("```\nC\n```\n");
    expect(m.sections[0].name).toBe("");
  });

  test("an empty section with a heading is kept", () => {
    const m = parse("## Empty\n## Next\n```\nC\n```\n");
    expect(sections(m)).toEqual(["Empty", "Next"]);
  });
});

// --- fences and notes (§1.9) -------------------------------------------------
describe("fences and notes (§1.9)", () => {
  test("a fence with an empty or cifra info string holds music", () => {
    expect(parse("```\nC\n```\n").sections[0].body[0].type).toBe("music");
    expect(parse("```cifra\nC\n```\n").sections[0].body[0].type).toBe("music");
  });

  test("a fence with another info string is kept verbatim", () => {
    const m = parse("```python\nprint(1)\n```\n");
    expect(m.sections[0].body[0]).toEqual({ type: "verbatim", info: "python", text: "print(1)" });
  });

  test("a non-heading line outside a fence is notes kept verbatim", () => {
    const m = parse("## A\nsome note\n```\nC\n```\n");
    const notes = m.sections[0].body.find((p) => p.type === "notes");
    expect(notes.text).toBe("some note");
  });

  test("an unclosed fence runs to the end and is reported", () => {
    const m = parse("```\nC\nG\n");
    expect(codes(m)).toContain("unclosed-fence");
    expect(m.sections[0].body[0].type).toBe("music");
  });

  test("notes that read as chords outside any fence are reported", () => {
    const m = parse("C G Am F\n");
    expect(codes(m)).toContain("unfenced-music");
  });

  test("a label heading holding one chord is reported as a key", () => {
    const m = parse("## A\n```\nAm: C\n```\n");
    expect(codes(m)).toContain("heading-looks-like-key");
  });
});

// --- conflict markers (§11.12.3) ---------------------------------------------
describe("conflict markers (§11.12.3)", () => {
  test("every conflict marker line is reported as a marker-line", () => {
    const m = parse("## A\n```\n<<<<<<< ours\nC\n=======\nG\n>>>>>>> theirs\n```\n");
    expect(codes(m).filter((c) => c === "marker-line").length).toBe(3);
  });
});
