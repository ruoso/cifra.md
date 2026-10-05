// §6 Tunings and §7 Voicings — ported from the reference's
// reference/tests/test_voicings.py, test_fingering.py and
// test_pitch_tuning_frets.py (cifra_js.reader refinement §Acceptance "unit
// (voicings.test.js)"). The §6/§7.5 grammars are imported from their modules, as
// the reference imports them directly; the block and item behaviour is read
// through `parse`. Agreement with the reference is by the corpus; these cases
// pin the constructs and diagnostics on tiny, purpose-written documents. No
// one's copyrighted words appear.

import { describe, test, expect } from "vitest";

import { parse } from "../src/index.js";
import { parseTuning, tuningId, isTuning } from "../src/tuning.js";
import { parseFrets, formatFrets, parseFingers, checkFingers, formatFingers } from "../src/frets.js";
import { parsePitch, midi } from "../src/pitch.js";

const GUITAR = "E2 A2 D3 G3 B3 E4";
const codes = (m) => m.diagnostics.map((d) => d.code);
const block = (m, i = 0) => Object.fromEntries(m.blocks[i].voicings.map((v) => [v.key, v.frets]));
const withVoicings = (body) => "## A\n```\nC\n```\n---\n" + body;

// --- pitches and tunings (§6) ------------------------------------------------
describe("pitches and tunings (§6)", () => {
  test("a pitch is read in either case to a note and octave", () => {
    expect(parsePitch("E2")).toEqual({ note: { letter: "E", accidental: 0 }, octave: 2 });
    expect(parsePitch("e2")).toEqual(parsePitch("E2"));
    expect(midi(parsePitch("C4"))).toBe(60);
    expect(midi(parsePitch("Cb4"))).toBe(59);
  });

  test("a bad pitch throws", () => {
    for (const bad of ["H2", "E", "Ebb", "2", "", "E 2"]) {
      expect(() => parsePitch(bad)).toThrow();
    }
  });

  test("commas and/or spaces separate pitches; the text is uppercased", () => {
    const a = parseTuning("E2, A2, D3, G3, B3, E4");
    const b = parseTuning("e2 a2 d3 g3 b3 e4");
    const c = parseTuning("E2,A2,D3,G3,B3,E4");
    expect(a.id).toBe(b.id);
    expect(b.id).toBe(c.id);
    expect(a.text).toBe(GUITAR);
    expect(b.text).toBe(GUITAR);
    expect(a.pitches).toHaveLength(6);
  });

  test("identity is by sound (§6.3): Eb and D# are one string", () => {
    expect(tuningId(parseTuning("Eb2 A2").pitches)).toBe(tuningId(parseTuning("D#2 A2").pitches));
    expect(parseTuning("E2 A2").id).not.toBe(parseTuning("A2 E2").id);
  });

  test("a reentrant and a single-pitch tuning are tunings; junk is not", () => {
    expect(isTuning("G4 C4 E4 A4")).toBe(true);
    expect(isTuning("E2")).toBe(true); // §6.4 single-pitch is a heading rule, not the grammar's
    for (const bad of ["", "   ", "E2 foo", "guitar", "E2, , A2x"]) {
      expect(isTuning(bad)).toBe(false);
    }
  });
});

// --- fret strings (§7.5) -----------------------------------------------------
describe("fret strings (§7.5)", () => {
  test.each([
    ["x32010", ["x", 3, 2, 0, 1, 0]],
    ["X32010", ["x", 3, 2, 0, 1, 0]],
    ["8-10-10-8-8-8", [8, 10, 10, 8, 8, 8]],
    ["x-3-2-0-1-0", ["x", 3, 2, 0, 1, 0]],
    ["0333", [0, 3, 3, 3]],
  ])("compact or hyphenated, with x/X for a muted string: %s", (text, frets) => {
    expect(parseFrets(text)).toEqual(frets);
  });

  test("a bad fret string is null", () => {
    for (const bad of ["", "x3a010", "x--3", "3-", "x 3 2", "100-1", "x320-10"]) {
      expect(parseFrets(bad)).toBeNull();
    }
  });

  test("formatting is compact unless a fret reaches 10", () => {
    expect(formatFrets(["x", 3, 2, 0, 1, 0])).toBe("x32010");
    expect(formatFrets([8, 10, 10, 8, 8, 8])).toBe("8-10-10-8-8-8");
  });
});

// --- fingerings (§7.5.1) -----------------------------------------------------
describe("fingerings (§7.5.1)", () => {
  test("fingers 1–4, T and - (0 read as -), spaced or run together", () => {
    expect(parseFingers("3 2 - - - 4")).toEqual([3, 2, null, null, null, 4]);
    expect(parseFingers("32---4")).toEqual([3, 2, null, null, null, 4]);
    expect(parseFingers("T 0 2 3 4 1")).toEqual(["T", null, 2, 3, 4, 1]);
    for (const bad of ["", "5 2 - - - 4", "3 2 x - - 4", "a b"]) {
      expect(parseFingers(bad)).toBeNull();
    }
  });

  test("a fingering is checked against the shape (barres are fine)", () => {
    expect(checkFingers([3, 2, null, null, null, 4], [3, 2, 0, 0, 0, 3])).toBeNull();
    expect(checkFingers([1, 1, 2, 3, 4, 1], [1, 1, 3, 3, 3, 1])).toBeNull(); // a barre
    expect(checkFingers([1, 1, 2, 3, 4, 1], [0, 3, 3, 3])).toBe("6 finger positions for 4 strings");
    expect(checkFingers([1, null, null, null, null, null], ["x", 3, 2, 0, 1, 0])).toContain("not fretted");
    expect(checkFingers([1, 1, 1, null, null, null], [1, 1, 3, 3, 3, 1])).toBe("finger 1 on frets 1 and 3");
  });

  test("a fingering is printed spaced, - for no finger", () => {
    expect(formatFingers(["T", null, 2])).toBe("T - 2");
  });
});

// --- blocks and variations (§7.2, §7.3) --------------------------------------
describe("blocks and variations (§7.2, §7.3)", () => {
  test("one block per tuning, read after the rule", () => {
    const m = parse(withVoicings(`## Voicings: ${GUITAR}\n- A: x02220\n- Cm: x35543\n\n## Voicings: G4 C4 E4 A4\n- Cm: 0333\n`));
    expect(m.blocks.map((b) => b.tuning.text)).toEqual([GUITAR, "G4 C4 E4 A4"]);
    expect(block(m, 1)).toEqual({ Cm: [0, 3, 3, 3] });
    expect(m.diagnostics).toEqual([]);
  });

  test("the `Voicings` label is the default variation, named `\"\"`", () => {
    const m = parse(withVoicings(`## Voicings: ${GUITAR}\n- C: x32010\n`));
    expect(m.blocks[0].label).toBe("");
  });

  test("another label is a named variation", () => {
    const m = parse(withVoicings(`## Capo 3: ${GUITAR}\n- C: x32010\n`));
    expect(m.blocks[0].label).toBe("Capo 3");
  });

  test("duplicate tuning+name blocks are merged, last wins", () => {
    const m = parse(withVoicings(`## Voicings: ${GUITAR}\n- C: x32010\n## Voicings: ${GUITAR}\n- D: xx0232\n`));
    expect(codes(m)).toContain("duplicate-block");
    expect(m.blocks).toHaveLength(1);
    expect(Object.keys(block(m, 0)).sort()).toEqual(["C", "D"]);
  });
});

// --- voicing items (§7.4), keys and resolution (§7.6) ------------------------
describe("voicing items (§7.4)", () => {
  test("a voicing is `- key: frets (fingers)`, the key kept char-for-char", () => {
    const m = parse(withVoicings(`## Voicings: ${GUITAR}\n- Cm[2]: 8-10-10-8-8-8 (1 3 4 1 1 1)\n`));
    const v = m.blocks[0].voicings[0];
    expect(v.key).toBe("Cm[2]");
    expect(v.symbol).toBe("Cm");
    expect(v.index).toBe(2);
    expect(v.fingers).toEqual([1, 3, 4, 1, 1, 1]);
  });

  test("a chart chord resolves to a voicing by its key; a missing one is no error", () => {
    const m = parse("## A\n```\nA | Cm[2]\n```\n---\n## Voicings: " + GUITAR + "\n- A: x02220\n");
    const keys = m.blocks[0].voicings.map((v) => v.key);
    expect(keys).toContain("A"); // A resolves to its shape
    expect(keys).not.toContain("Cm[2]"); // no chosen shape — and no diagnostic
    expect(m.diagnostics).toEqual([]);
  });

  test("a repeated key keeps its first place and last value", () => {
    const m = parse(withVoicings(`## Voicings: ${GUITAR}\n- C: x32010\n- C: xx0232\n`));
    expect(m.blocks[0].voicings).toHaveLength(1);
    expect(m.blocks[0].voicings[0].frets).toEqual(["x", "x", 0, 2, 3, 2]);
  });
});

// --- the §7 diagnostics -------------------------------------------------------
describe("voicings diagnostics", () => {
  test("a heading after the rule with no tuning is a bad-block-heading", () => {
    expect(codes(parse(withVoicings("## Just a heading\n")))).toContain("bad-block-heading");
    expect(codes(parse(withVoicings("## Voicings: not a tuning\n")))).toContain("bad-block-heading");
  });

  test("a voicing before any block is item-outside-block", () => {
    expect(codes(parse(withVoicings("- C: x32010\n")))).toContain("item-outside-block");
  });

  test("text before any block is notes-outside-block", () => {
    expect(codes(parse(withVoicings("some stray text\n")))).toContain("notes-outside-block");
  });

  test("a malformed voicing is a bad-voicing", () => {
    expect(codes(parse(withVoicings(`## Voicings: ${GUITAR}\n- C: nonsense\n`)))).toContain("bad-voicing");
    expect(codes(parse(withVoicings(`## Voicings: ${GUITAR}\n- C: x3201\n`)))).toContain("bad-voicing");
  });

  test("a bad fingering is a bad-fingering and the shape is still kept", () => {
    const m = parse(withVoicings(`## Voicings: ${GUITAR}\n- C: x32010 (5 2 - - - 4)\n`));
    expect(codes(m)).toContain("bad-fingering");
    expect(m.blocks[0].voicings[0].frets).toEqual(["x", 3, 2, 0, 1, 0]);
    expect("fingers" in m.blocks[0].voicings[0]).toBe(false);
  });
});
