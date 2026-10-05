// §4.5 The layout convergence pass — the heart of the reader — ported from the
// reference's layout cases (reference/tests/test_lyrics.py, test_fixed_point.py)
// and read through `converge` on the layout corpus entries 28/33/34
// (cifra_js.reader refinement §Acceptance "unit (layout.test.js)"). The reader
// lays out every sung line as the canonical writer does, so reading a document
// and reading its canonical form give the same sung lines; this file pins the
// placement rules and idempotence on tiny, purpose-written documents. No one's
// copyrighted words appear.

import { describe, test, expect } from "vitest";

import { parse } from "../src/index.js";
import { converge } from "../src/layout.js";
import { substantive } from "../src/parse.js";

const sungLines = (t) =>
  parse(t).sections.find((s) => s.body.some((p) => p.type === "music")).body.find((p) => p.type === "music").lines;
const sung = (t, idx = 0) => sungLines(t)[idx];
const items = (line) => line.measures.flatMap((m) => m.items);

const clone = (x) => JSON.parse(JSON.stringify(x));

// The canonical line of words for an already-laid-out sung line, reconstructed
// from the model exactly as the §4.5 writer would print it: each item's words at
// its column, a gap inside the words filled with `_`, spaces otherwise. Used to
// re-feed `converge` and prove it is a fixed point.
function lyricOf(line) {
  const its = items(line);
  const lead = (its.find((it) => it.type === "lead") || {}).words || "";
  const attached = its
    .filter((it) => it.type !== "lead" && substantive(it) && "column" in it)
    .sort((a, b) => a.column - b.column);
  let text = lead;
  for (const it of attached) {
    const w = it.words || "";
    if (w && text.length < it.column) {
      const ch = /[^ ]/.test(text) ? "_" : " ";
      text += ch.repeat(it.column - text.length);
    }
    text += w;
  }
  return text;
}

// --- a token that grows (§4.5.3) ---------------------------------------------
describe("a token that grows pushes the words right", () => {
  test("`nc` laid out as `N.C.` pushes the next chord, leaving one space", () => {
    // `nc` renders as the 4-wide `N.C.`; the written gap to `C` cannot absorb it.
    const line = sung("## S\n```\nnc C\nla la la\n```\n");
    const [nochord, chord] = items(line);
    expect(nochord.type).toBe("nochord");
    expect(nochord.column).toBe(0);
    expect(chord.key).toBe("C");
    expect(chord.column).toBe(5); // N.C. ends at 4, one space, chord at 5
    expect(nochord.words).toBe("la   ");
    expect(chord.words).toBe("la la");
  });

  test("a footnote marker widens a chord and pushes what follows", () => {
    const line = sung("## S\n```\nCm[2] G\nla la la\n```\n");
    const [cm, g] = items(line);
    expect(cm.key).toBe("Cm[2]");
    expect(cm.column).toBe(0);
    expect(g.column).toBe(6); // `Cm[2]` is 5 wide, one space, `G` at 6
  });
});

// --- a token that shrinks (§4.5.3) -------------------------------------------
describe("a token that shrinks leaves the following tokens where they were", () => {
  test("`(2x)` laid out as `x2` does not drag the chords after it leftward", () => {
    // Entry 28's first sung line: `nc    (2x)    Cm[1]  G`.
    const m = parse("## V\n```\nnc    (2x)    Cm[1]  G\nWhen I first saw you walking down\n```\n");
    const line = m.sections[0].body.find((p) => p.type === "music").lines[0];
    const its = items(line);
    const count = its.find((it) => it.type === "count");
    const cm = its.find((it) => it.key === "Cm");
    expect(count).toBeDefined();
    expect(count.times).toBe(2);
    // The shrunk `(2x)`→`x2` keeps `Cm[1]` near its written column, not dragged back.
    expect(cm.column).toBe(14);
  });
});

// --- padding inside a word vs between words (§4.5.2) --------------------------
describe("padding", () => {
  test("`_` padding inside a word is stripped on reading", () => {
    const line = sung("## S\n```\n( G     D\nW____hen I was\n```\n");
    const its = items(line);
    const lead = its.find((it) => it.type === "lead");
    const g = its.find((it) => it.key === "G");
    expect(lead.words).toBe("W");
    expect(g.words).toBe("hen"); // the `____` run was padding, not words
    expect(its.every((it) => !(it.words || "").includes("__"))).toBe(true);
  });
});

// --- the guard and forcing (§4.5.3) ------------------------------------------
describe("the guard and forcing", () => {
  test("a leading `,` guard on a chord line is dropped on reading", () => {
    const line = sung("## S\n```\n, >x C\nhere we go\n```\n");
    const its = items(line).filter((it) => it.type !== "lead");
    expect(its[0].type).toBe("unknown");
    expect(its[0].text).toBe(">x");
    expect(its.some((it) => it.key === "C")).toBe(true);
  });

  test("a line whose padded words would read as chords becomes forced", () => {
    const line = sung("## S\n```\nG\nA_m Em la\n```\n");
    expect(line.forced).toBe(true);
    // Forced, the line is moved right by one so column 0 stays free.
    expect(items(line)[0].column).toBe(1);
  });
});

// --- carried anchors (§2.8 reaching the sung line, §4.5) ----------------------
describe("carried anchors", () => {
  test("an anchor written on a bar is kept with its column", () => {
    const line = sung("## S\n```\n@12 G|D\nWhen I go now\n```\n");
    expect(line.measures[0].anchor).toBe(12);
    expect(line.measures[0].anchorColumn).toBe(0);
  });
});

// --- a chord line longer than its words (§4.4) -------------------------------
describe("a chord line longer than its words", () => {
  test("chords past the end of the words take empty words, columns still rise", () => {
    const line = sung("## S\n```\nC D E F\nla la\n```\n");
    const chords = items(line).filter((it) => it.type === "chord");
    expect(chords.map((c) => c.column)).toEqual([0, 2, 4, 6]);
    expect(chords.at(-1).words).toBe("");
  });
});

// --- idempotence (§4.5, lines 311–315) ---------------------------------------
describe("idempotence", () => {
  test.each([
    "## S\n```\nC       G\nWhen I  go\n```\n",
    "## S\n```\nnc    Cm[1]  G\nWhen I saw you now\n```\n",
    "## S\n```\n    C\nla la la\n```\n",
  ])("laying out an already-laid-out line changes nothing", (doc) => {
    const line = sung(doc);
    const before = clone(line);
    converge(line, lyricOf(line), "brazilian");
    expect(line).toEqual(before);
  });
});
