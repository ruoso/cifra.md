// §4 Words (except the §4.5 layout engine, which layout.test.js pins) — ported
// from the reference's reference/tests/test_lyrics.py (cifra_js.reader refinement
// §Acceptance "unit (lyrics.test.js)"): the line shapes, sung detection, forcing,
// attachment, breaks and the no-bar-numbers rule. Agreement with the reference is
// by the corpus; these cases pin the §4 constructs on tiny, purpose-written
// documents. No one's copyrighted words appear.

import { describe, test, expect } from "vitest";

import { parse } from "../src/index.js";

const musicLines = (t) =>
  parse(t).sections.find((s) => s.body.some((p) => p.type === "music")).body.find((p) => p.type === "music").lines;
const items = (line) => line.measures.flatMap((m) => m.items);

// --- whether a document is sung (§4.2) ---------------------------------------
describe("sung detection (§4.2)", () => {
  test("a chords line followed by a prose line with ≥2 words is sung", () => {
    const m = parse("## S\n```\nC\nla la\n```\n");
    expect(m.sung).toBe(true);
    expect(m.sungAt).toBe(4);
  });

  test("a single word under a chord line does not make a document sung", () => {
    expect(parse("## S\n```\nC\nla\n```\n").sung).toBe(false);
  });

  test("a forced line makes a document sung", () => {
    const m = parse("## S\n```\n>these are words\n```\n");
    expect(m.sung).toBe(true);
    expect(m.sungAt).toBe(3);
  });
});

// --- forcing a line (§4.3) ---------------------------------------------------
describe("forcing a line with > (§4.3)", () => {
  test("a > forces a line to words, read with the marker as a space", () => {
    const line = musicLines("## S\n```\n>just words here\n```\n")[0];
    expect(line.kind).toBe("lyric");
    expect(line.forced).toBe(true);
    expect(line.text).toBe(" just words here");
  });
});

// --- columns and attachment (§4.4) -------------------------------------------
describe("columns and attachment (§4.4)", () => {
  test("each chord takes the words from its column to the next chord's", () => {
    const line = musicLines("## S\n```\nC       G\nWhen I  go\n```\n")[0];
    const chords = items(line).filter((it) => it.type === "chord");
    expect(chords[0].column).toBe(0);
    expect(chords[0].words).toBe("When I  ");
    expect(chords[1].column).toBe(8);
    expect(chords[1].words).toBe("go");
  });

  test("words before the first chord become a lead item", () => {
    const line = musicLines("## S\n```\n    C\nla la la\n```\n")[0];
    const lead = items(line).find((it) => it.type === "lead");
    expect(lead).toBeDefined();
    expect(lead.column).toBe(0);
    expect(lead.words).toBe("la l");
  });

  test("a bar line has a column but no words", () => {
    const line = musicLines("## S\n```\nC | D\nla la la la\n```\n")[0];
    const second = line.measures[1];
    expect(typeof second.column).toBe("number");
    expect(second.items.every((it) => !("words" in it) || it.type === "chord" || it.type === "lead")).toBe(true);
  });
});

// --- breaks (§4.6) -----------------------------------------------------------
describe("breaks (§4.6)", () => {
  test("a run of blank lines between two music lines is kept as one break", () => {
    const lines = musicLines("## S\n```\nC\nla la\n\n\nD\nho ho\n```\n");
    expect(lines.map((l) => l.kind)).toEqual(["sung", "break", "sung"]);
  });
});

// --- a sung document has no bar numbers (§4.7) -------------------------------
describe("a sung document has no bar numbers (§4.7)", () => {
  test("measures of a sung line carry no number or stated flag", () => {
    const line = musicLines("## S\n```\n@7 C | D\nla la la la\n```\n")[0];
    for (const m of line.measures) {
      expect("number" in m).toBe(false);
      expect("stated" in m).toBe(false);
    }
  });
});
