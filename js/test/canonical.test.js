// §8.1/§8.2/§8.3 The canonical form — one case per rule the canonical writer
// follows — ported from the reference's reference/tests/test_canonical.py
// (cifra_js.writer refinement §Acceptance "unit (canonical.test.js)"). Every
// case gives an input whose canonical text is fully determined, and `canon`
// checks that canonicalising is a fixed point and that the canonical text reads
// back as the canonical model. Agreement with the reference is by the corpus.
// No one's copyrighted words appear.

import { describe, test, expect } from "vitest";

import { parse, write, canonical } from "../src/index.js";
import { MarkedTextError } from "../src/write.js";

const GUITAR = "E2 A2 D3 G3 B3 E4";
const VOICED = "\n---\n\n## Voicings: " + GUITAR + "\n";

function strip(d) {
  const o = {};
  for (const [k, v] of Object.entries(d)) if (k !== "diagnostics" && k !== "sungAt") o[k] = v;
  return o;
}

// Canonicalise, check the result reads back as the canonical model, and that
// canonicalising again changes nothing (§8.1 the fixed point).
function canon(text) {
  const doc = parse(text);
  const out = write(doc);
  const again = parse(out);
  expect(strip(again)).toEqual(strip(canonical(doc)));
  expect(write(again)).toBe(out); // canonicalising twice differs from once
  return out;
}

const fenced = (body, heading = "## A") => `${heading}\n\`\`\`\n${body}\n\`\`\`\n`;

// --- §8.4 step 1: the text ---------------------------------------------------

describe("the text (§8.1, §8.4.1)", () => {
  test("BOM, CR LF and lone CR removed", () => {
    expect(canon("\ufeff# T\r\n\r## A\r```\rC\r\n```")).toBe("# T\n\n" + fenced("C"));
  });

  test("every byte order mark is removed", () => {
    // Kept, a U+FEFF that came to begin the canonical text would read as a BOM
    // the next time, and canonicalising would not settle.
    expect(canon("\ufeff\ufeff# T\n")).toBe("# T\n");
    expect(canon("\n\ufeffhello\n")).toBe("hello\n");
    expect(canon("- a: x\ufeffy\n")).toBe("- a: xy\n");
  });

  test("trailing spaces are removed everywhere", () => {
    const text = "# T  \n\n## A  \nnotes   \n\n```tab  \ne|--0--|   \n```   \n";
    expect(canon(text)).toBe("# T\n\n## A\nnotes\n\n```tab\ne|--0--|\n```\n");
  });

  test("tabs become one space", () => {
    expect(canon("## A\n```\nG\tD\nWhen\tI saw\n```\n\tindented note\n")).toBe(
      "## A\n```\nG D\nWhen I saw\n```\n\n indented note\n",
    );
  });

  test("NFC, keeping chords over their syllables", () => {
    expect(canon("# Cafe\u0301\n")).toBe("# Caf\u00e9\n");
    // Columns count code points of the NFC text, so a chord placed over a
    // composed letter stays over it.
    const text = fenced("     G\nCafe\u0301 com leite");
    const doc = parse(text);
    const items = doc.sections[0].body[0].lines[0].measures[0].items;
    expect(items[0].words).toBe("Caf\u00e9 ");
    expect(items[1].words).toBe("com leite");
    expect(canon(text)).toBe(fenced("     G\nCaf\u00e9 com leite"));
  });

  test("a no-break space is not whitespace", () => {
    const doc = parse(fenced("C\u00a0| G"));
    const items = doc.sections[0].body[0].lines[0].measures.flatMap((m) => m.items);
    expect(items[0]).toEqual({ type: "unknown", text: "C\u00a0" });
    expect(canon("- a: \u00a0x\n")).toBe("- a: \u00a0x\n");
    expect(canon("- a:\u00a0x\n")).toBe(""); // no space after the colon: not a property
  });

  test("the empty document is the empty file", () => {
    expect(canon("")).toBe("");
    expect(canon("\ufeff\n  \n\t\n")).toBe("");
  });

  test("one final newline", () => {
    expect(canon(fenced("C") + "\n\n\n")).toBe(fenced("C"));
    expect(canon("```\nC\n```")).toBe("```\nC\n```\n");
  });
});

// --- §8.4 step 2: metadata ---------------------------------------------------

describe("metadata (§8.2)", () => {
  test("title and properties then one blank line", () => {
    const text = "\n\n#   My   Song  \n\n* Artist :  Someone  \n\n+ notation: american\n\n\n## A\n```\nC\n```\n";
    expect(canon(text)).toBe("# My Song\n- artist: Someone\n- notation: american\n\n" + fenced("C"));
  });

  test("title only", () => {
    expect(canon("#  Only  \n\n\n")).toBe("# Only\n");
  });

  test("an empty title is dropped", () => {
    expect(canon("#\n- a: 1\n")).toBe("- a: 1\n");
  });

  test("keys lower-cased, first position, last value", () => {
    expect(canon("- B: 1\n- a: 2\n- b: 3\n")).toBe("- b: 3\n- a: 2\n");
  });

  test("an empty value", () => {
    expect(canon("- a:\n- b:    \n")).toBe("- a:\n- b:\n");
  });

  test("non-property list items are dropped", () => {
    const doc = parse("- https://example.com\n- not a property\n-\n- a: 1\n");
    expect(doc.diagnostics.map((d) => d.code)).toEqual(["bad-property", "bad-property", "bad-property"]);
    expect(write(doc)).toBe("- a: 1\n");
  });

  test("a property is never added", () => {
    // C7+ is ambiguous (§5.6), but copying the author's symbol is not emitting
    // one: canonicalising does not declare `notation`.
    expect(canon(fenced("C7+"))).toBe(fenced("C7+"));
  });
});

// --- §8.4 step 3: the chart --------------------------------------------------

describe("the chart (§8.2)", () => {
  test("items and bars one space apart", () => {
    expect(canon(fenced("  C   Am |F   G  ||"))).toBe(fenced("C Am | F G ||"));
  });

  test("a close mark then a count", () => {
    expect(canon(fenced("|:G|D:| x3"))).toBe(fenced("|: G | D :| x3"));
    expect(canon(fenced("|: Am | Dm :|| 2x"))).toBe(fenced("|: Am | Dm :|| x2"));
  });

  test("marks against bars", () => {
    expect(canon(fenced("C |:"))).toBe(fenced("C |:"));
    expect(canon(fenced("||: F :||: G :||"))).toBe(fenced("||: F :||: G :||"));
    expect(canon(fenced("x2 :| ) ||: C"))).toBe(fenced("x2 :| ) ||: C"));
  });

  test("bar-line spellings", () => {
    expect(canon(fenced("C ||| G"))).toBe(fenced("C || G"));
  });

  test("counts, endings, marks placed", () => {
    expect(canon(fenced("(C G) (2x) | Am bis"))).toBe(fenced("( C G ) x2 | Am x2"));
    expect(canon(fenced("|: Dm |1. C :|2. G |"))).toBe(fenced("|: Dm | 1. C :| 2. G |"));
  });

  test("no-chord and punctuation", () => {
    expect(canon(fenced("nc, | n.c.; | C,"))).toBe(fenced("N.C. | N.C. | C"));
  });

  test("the anchor comes first in its measure", () => {
    expect(canon(fenced("Dm @9 | G7"))).toBe(fenced("@9 Dm | G7"));
    expect(canon(fenced("@9\nDm"))).toBe(fenced("@9 Dm"));
  });

  test("unknown tokens kept", () => {
    expect(canon(fenced("C | wobble | (solo) | Cm [2]"))).toBe(fenced("C | wobble | (solo) | Cm [2]"));
  });

  test("a line that would read as something else is guarded", () => {
    // The leading `,` was punctuation, dropped on reading; written back without
    // it the line would be a forced line, an annotation or a heading.
    for (const line of [", >x C", ", //x", ", [x] C", ", Tom: C"]) {
      expect(canon(fenced(line))).toBe(fenced(", " + line.slice(2)));
    }
  });

  test("annotations", () => {
    expect(canon(fenced("  //repete\n//"))).toBe(fenced("// repete\n//"));
  });
});

// --- §8.3 the footnote invariants --------------------------------------------

describe("the footnote invariants (§8.3)", () => {
  test("index zero and leading zeros", () => {
    const doc = parse(fenced("Cm[0] | Cm[02] | Cm[1]"));
    const keys = doc.sections[0].body[0].lines[0].measures.flatMap((m) => m.items).map((it) => it.key);
    expect(keys).toEqual(["Cm", "Cm[2]", "Cm"]);
    expect(canon(fenced("Cm[0] | Cm[02] | Cm[1]"))).toBe(fenced("Cm | Cm[2] | Cm"));
  });

  test("I1: unused keys dropped from every block", () => {
    const out = canon(fenced("C") + VOICED + "- C: x32010\n- G: 320003\n- C[2]: x35553\n");
    expect(out).toBe(fenced("C") + VOICED + "- C: x32010\n");
  });

  test("I2: renumbered from use, in the chart and every block", () => {
    const text = fenced("Cm | Cm[3]") + VOICED + "- Cm: x35543\n- Cm[2]: 5333xx\n- Cm[3]: 8-10-10-8-8-8\n";
    expect(canon(text)).toBe(fenced("Cm | Cm[2]") + VOICED + "- Cm: x35543\n- Cm[2]: 8-10-10-8-8-8\n");
  });

  test("I2 on a sung line keeps the columns", () => {
    const a = fenced("Cm[3]  G     Cm\nquando eu te vi passar");
    expect(canon(a)).toBe(fenced("Cm[2]  G     Cm\nquando eu te vi passar"));
    const b = fenced("Cm[2] G     Cm[3]\nquando eu te vi passar") + VOICED + "- Cm[2]: x35543\n";
    expect(canon(b)).toBe(fenced("Cm    G     Cm[2]\nquando eu te vi passar") + VOICED + "- Cm: x35543\n");
  });

  test("I3: merges what no block tells apart", () => {
    const text =
      fenced("D | D[2]") + VOICED + "- D: xx0232\n- D[2]: xx0232\n\n## Easy: " + GUITAR + "\n- D: xx0232\n- D[2]: xx0232\n";
    expect(canon(text)).toBe(
      fenced("D | D") + VOICED + "- D: xx0232\n\n## Easy: " + GUITAR + "\n- D: xx0232\n",
    );
  });

  test("I3: keeps what another block tells apart", () => {
    const text =
      fenced("D | D[2]") + VOICED + "- D: xx0232\n- D[2]: xx0232\n\n## Voicings: G4 C4 E4 A4\n- D: 2220\n- D[2]: 7655\n";
    expect(canon(text)).toBe(text);
  });

  test("I3: a block with one of the two tells them apart", () => {
    const text =
      fenced("D | D[2]") + VOICED + "- D: xx0232\n- D[2]: xx0232\n\n## Voicings: G4 C4 E4 A4\n- D: 2220\n";
    expect(canon(text)).toBe(text);
  });

  test("I3: fingering is part of the shape", () => {
    const text = fenced("D | D[2]") + VOICED + "- D: xx0232 (- - - 1 3 2)\n- D[2]: xx0232 (- - - 1 2 3)\n";
    expect(canon(text)).toBe(text);
  });

  test("no blocks, no merge", () => {
    expect(canon(fenced("D | D[2]"))).toBe(fenced("D | D[2]"));
  });

  test("a block emptied stays as its heading", () => {
    expect(canon(fenced("C") + VOICED + "- G: 320003\n")).toBe(
      fenced("C") + VOICED.replace(/\n+$/, "") + "\n",
    );
  });

  test("a growing token after I2 re-lays-out the sung line (pins §8.3 lines 148–150)", () => {
    // An edit leaves Cm[3] where Cm was; I2 makes it Cm[2], wider than the gap
    // after it, and canonical() lays the line out again — every chord still over
    // its syllable.
    const doc = parse(fenced("Cm G    Cm\nQuando eu te vi") + VOICED + "- Cm: x35543\n");
    const line = doc.sections[0].body[0].lines[0];
    Object.assign(line.measures[0].items[0], { index: 3, key: "Cm[3]" });
    const out = write(doc);
    expect(out.startsWith(fenced("Cm[2] G    Cm\nQua___ndo eu te vi"))).toBe(true);
    expect(strip(parse(out))).toEqual(strip(canonical(doc)));
    expect(canonical(canonical(doc))).toEqual(canonical(doc));
  });

  test("a token that shrinks leaves the rest in place", () => {
    expect(canon(fenced("Cm[1] (2x)  G\nla la la la la la"))).toBe(fenced("Cm    x2    G\nla la la la la la"));
  });
});

// --- §8.4.6 voicings ---------------------------------------------------------

describe("voicings (§8.2, §8.4.6)", () => {
  test("tuning spelling kept, letters uppercase, single spaces", () => {
    const out = canon(fenced("C") + "\n---\n\n## Voicings:  e♭2,a2 , D3,g3 B3  e4\n- C: x32010\n");
    expect(out).toContain("## Voicings: E♭2 A2 D3 G3 B3 E4\n");
  });

  test("merged blocks take the first spelling", () => {
    const text = fenced("C | G") + "\n---\n\n## Voicings: Eb2 A2\n- C: 32\n## Voicings: D#2 A2\n- G: 10\n";
    expect(canon(text)).toBe(fenced("C | G") + "\n---\n\n## Voicings: Eb2 A2\n- C: 32\n- G: 10\n");
  });

  test("what canonicalising drops in the voicings part", () => {
    const text =
      fenced("C") + "\n---\nbefore any block\n- C: 32\n## Voicings: E2 A2\n- C: 32\nnote   \n\n- G 32\n---\n- D: nope\n";
    const doc = parse(text);
    expect(doc.diagnostics.map((d) => d.code)).toEqual([
      "notes-outside-block",
      "item-outside-block",
      "bad-voicing",
      "extra-rule",
      "bad-voicing",
    ]);
    expect(write(doc)).toBe(fenced("C") + "\n---\n\n## Voicings: E2 A2\n- C: 32\nnote\n");
  });

  test("no blocks, no rule; the rule first when alone", () => {
    expect(canon(fenced("C") + "\n---\n")).toBe(fenced("C"));
    expect(canon("---\n## Voicings: E2 A2\n")).toBe("---\n\n## Voicings: E2 A2\n");
  });

  test("a key an unknown token uses is kept", () => {
    const text = fenced("C | Cx7(#11b13)") + VOICED + "- C: x32010\n- Cx7(#11b13): x3x330\n- N.C.: xxxxxx\n";
    expect(canon(text)).toBe(fenced("C | Cx7(#11b13)") + VOICED + "- C: x32010\n- Cx7(#11b13): x3x330\n");
  });

  test("legacy forms are not converted", () => {
    // Appendix A: a `key = frets` line is notes to this reader, and stays notes.
    const text = fenced("C") + VOICED + "C = x32010\n";
    expect(canon(text)).toBe(text);
  });
});

// --- §8.1 the marked-text refusal --------------------------------------------

describe("the marked-text refusal (§8.1, §11.12.3)", () => {
  // A reader keeps a line of git's conflict markers as notes and reports
  // marker-line; the writer refuses to save such a model. No song corpus entry
  // triggers it, so it is pinned here on a purpose-written model.
  const marked = "## A\nslowly\n<<<<<<< ours\n\n```\nC\n```\n";

  test("write throws MarkedTextError naming the first marker line", () => {
    const doc = parse(marked);
    expect(doc.diagnostics.some((d) => d.code === "marker-line")).toBe(true);
    let err = null;
    try {
      write(doc);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(MarkedTextError);
    expect(err.line).toBe(3);
    expect(err.text).toBe("<<<<<<< ours");
  });
});
