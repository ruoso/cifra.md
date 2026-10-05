// Unit tests for the chord layer (spec §5), ported from the reference's
// reference/tests/test_chords.py with explore-chords' notation.test.js as a
// guide, on purpose-written symbols — never anyone's copyrighted words. They
// pin the §5 grammar in each dialect, its four ambiguities, the canonical
// dialect-free model, the §5.2.1 normalisations and the §5.5 spelled tones.
// The reference and the corpus are authoritative for the data shapes
// (cifra_js.chords refinement §Decisions).

import { describe, test, expect } from "vitest";

import {
  parseChord,
  isChord,
  chordTones,
  DIALECTS,
  DEFAULT_DIALECT,
} from "../src/index.js";
import { parseNote, formatNote, isNote } from "../src/index.js";

// The spelled tones of a symbol, space-joined, for the §5.5 table.
function tones(text, dialect = "brazilian") {
  const r = parseChord(text, dialect);
  expect(r.chord, JSON.stringify(r.errors)).not.toBeNull();
  return chordTones(r.chord).join(" ");
}

describe("pitch: root and accidentals (§5.1.1, pitch.py)", () => {
  test("A–G uppercase parse with every accidental spelling", () => {
    expect(parseNote("C")).toEqual({ letter: "C", accidental: 0 });
    expect(parseNote("F#")).toEqual({ letter: "F", accidental: 1 });
    expect(parseNote("F♯")).toEqual({ letter: "F", accidental: 1 });
    expect(parseNote("Bb")).toEqual({ letter: "B", accidental: -1 });
    expect(parseNote("B♭")).toEqual({ letter: "B", accidental: -1 });
    expect(parseNote("C##")).toEqual({ letter: "C", accidental: 2 });
    expect(parseNote("Ebb")).toEqual({ letter: "E", accidental: -2 });
  });

  test("formatNote writes the ASCII spelling and round-trips", () => {
    for (const t of ["C", "F#", "Bb", "C##", "Ebb"]) {
      expect(formatNote(parseNote(t))).toBe(t.replace("♯", "#").replace("♭", "b"));
    }
  });

  test("isNote is true for note names, false for the rest", () => {
    expect(isNote("C")).toBe(true);
    expect(isNote("G#")).toBe(true);
    expect(isNote("H")).toBe(false);
    expect(isNote("c")).toBe(false);
    expect(isNote("C#b")).toBe(false);
  });
});

describe("root and accidentals in a chord (§5.1.1, §5.2 equality)", () => {
  test("a flat root is a root, not a flat five", () => {
    expect(parseChord("Bb").chord.root).toEqual({ letter: "B", accidental: -1 });
    expect(parseChord("B").chord.root).toEqual({ letter: "B", accidental: 0 });
  });

  test("Db and C# are different roots that sound alike (§5.2 lines 81–84)", () => {
    expect(parseChord("Db").chord.root).toEqual({ letter: "D", accidental: -1 });
    expect(parseChord("C#").chord.root).toEqual({ letter: "C", accidental: 1 });
    expect(parseChord("Db").chord.root).not.toEqual(parseChord("C#").chord.root);
  });

  test("a lowercase letter is not a chord (§5.1.1 line 30)", () => {
    for (const text of ["a", "am", "bb", "e7"]) {
      expect(parseChord(text).chord).toBeNull();
    }
  });

  test("the Unicode accidental roots parse (corpus 17: C♯m7, D♭7)", () => {
    expect(parseChord("C♯m7").chord.root).toEqual({ letter: "C", accidental: 1 });
    expect(parseChord("D♭7").chord.root).toEqual({ letter: "D", accidental: -1 });
  });
});

describe("body grammar: separators are meaningless (§5.3 lines 105–110)", () => {
  test("round brackets, spaces and commas group alike", () => {
    expect(tones("C7(9)")).toBe("C E G Bb D");
    expect(tones("C7 9")).toBe("C E G Bb D");
    expect(tones("C7,9")).toBe("C E G Bb D");
  });

  test("Cm7(b5) equals Cm7b5", () => {
    expect(parseChord("Cm7(b5)").chord).toEqual(parseChord("Cm7b5").chord);
  });
});

describe("body grammar: quality words (§5.3.1)", () => {
  const cases = [
    ["Cm", "minor"],
    ["Cmin", "minor"],
    ["C-7", "minor"],
    ["C−7", "minor"], // U+2212 minus
    ["C–7", "minor"], // U+2013 en dash
    ["Cdim", "dim"],
    ["C°", "dim"],
    ["Cº", "dim"], // U+00BA masculine ordinal
    ["Caug", "aug"],
    ["C+", "aug"],
    ["Csus2", "sus2"],
    ["Csus4", "sus4"],
    ["Csus", "sus4"],
    ["C4", "sus4"], // leading 4 = sus4
    ["C5", "power"],
    ["Cø7", "dim"], // half-diminished seventh
    ["CØ7", "dim"],
  ];
  for (const [text, quality] of cases) {
    test(`${text} → ${quality}`, () => {
      expect(parseChord(text).chord.quality).toBe(quality);
    });
  }
});

describe("body grammar: major-seventh words (§5.3.2)", () => {
  test("maj/M/∆/Δ before a degree all give the major seventh", () => {
    for (const f of ["C7M", "Cmaj7", "CM7", "C∆7", "CΔ7", "CMaj7"]) {
      expect(tones(f)).toBe("C E G B");
    }
  });

  test("maj/M alone is the triad; ∆ alone is the major seventh", () => {
    expect(tones("CM")).toBe("C E G");
    expect(tones("Cmaj")).toBe("C E G");
    expect(tones("C∆")).toBe("C E G B");
    expect(tones("CΔ")).toBe("C E G B");
  });
});

describe("body grammar: top degree and its implied stack (§5.3.3)", () => {
  test("6/7/9/11/13 stack as the reference does", () => {
    expect(tones("C6")).toBe("C E G A");
    expect(tones("C7")).toBe("C E G Bb");
    expect(tones("C11")).toBe("C E G Bb D F");
    expect(tones("C13")).toBe("C E G Bb D A");
  });

  test("the seventh is minor by default, diminished under dim, major with a maj-word", () => {
    expect(parseChord("C7").chord.extensions).toEqual([{ degree: 7, alter: -1 }]);
    expect(parseChord("C°7").chord.extensions).toEqual([{ degree: 7, alter: -2 }]);
    expect(parseChord("C7M").chord.extensions).toEqual([{ degree: 7, alter: 0 }]);
  });
});

describe("body grammar: degree modifiers and positional +/-/° (§5.3.4)", () => {
  test("accidental placement: C7+9 is a raised ninth, C7(5+) a raised fifth", () => {
    expect(tones("C7+9")).toBe("C E G Bb D#");
    expect(tones("C7#9")).toBe("C E G Bb D#");
    expect(tones("C7(5+)")).toBe("C E G# Bb");
    expect(tones("C7#5")).toBe("C E G# Bb");
  });

  test("#d/bd before the degree, d-/d° after it", () => {
    expect(tones("C7b9")).toBe("C E G Bb Db");
    expect(tones("C7(9-)")).toBe("C E G Bb Db");
    expect(tones("Cmaj7#11")).toBe("C E G B F#");
  });

  test("add d, 6/9 and alt", () => {
    expect(tones("Cadd9")).toBe("C E G D");
    expect(tones("Cadd2")).toBe("C D E G");
    expect(tones("C6/9")).toBe("C E G A D");
    expect(tones("Calt")).toBe("C E G# Bb Db");
  });
});

describe("canonical model and §5.2.1 normalisation", () => {
  test("C7M/Cmaj7/CM7/C∆7/CΔ7/C∆ denote the same model (§5.2 lines 77–79)", () => {
    const forms = ["C7M", "Cmaj7", "CM7", "C∆7", "CΔ7", "CMaj7", "C∆"];
    const parsed = forms.map((f) => parseChord(f).chord);
    for (const p of parsed) expect(p).toEqual(parsed[0]);
  });

  test("minor + ♭5 → dim, the altered fifth folded into the quality (§5.2.1)", () => {
    for (const f of ["Cm7b5", "Cm7(5-)", "Cø7", "Cø"]) {
      const c = parseChord(f).chord;
      expect(c.quality).toBe("dim");
      expect(c.extensions).toEqual([{ degree: 7, alter: -1 }]);
    }
  });

  test("major + ♯5 → aug (§5.2.1)", () => {
    const c = parseChord("C7#5").chord;
    expect(c.quality).toBe("aug");
    expect(c.extensions).toEqual([{ degree: 7, alter: -1 }]);
  });

  test("a redundant ♭5 on dim / ♯5 on aug is dropped (§5.2.1)", () => {
    expect(parseChord("Cdimb5").chord.extensions).toEqual([]);
    expect(parseChord("Caug#5").chord.extensions).toEqual([]);
  });

  test("the model has four fields in order, extensions sorted by degree ascending", () => {
    const c = parseChord("C13").chord;
    expect(Object.keys(c)).toEqual(["root", "quality", "extensions", "bass"]);
    expect(c.extensions.map((e) => e.degree)).toEqual([7, 9, 13]);
    for (const e of c.extensions) expect(Object.keys(e)).toEqual(["degree", "alter"]);
  });

  test("minor-major seventh keeps minor with a natural seventh", () => {
    for (const f of ["Cm(maj7)", "Cm7M", "CmM7", "C−∆7"]) {
      expect(tones(f)).toBe("C Eb G B");
    }
  });
});

describe("the four ambiguities, in each dialect (§5.6)", () => {
  test("sevenPlus: C7+ (brazilian majorSeventh vs american/realbook dominantSharpFive)", () => {
    expect(tones("C7+", "brazilian")).toBe("C E G B");
    expect(tones("C7+", "american")).toBe("C E G# Bb");
    expect(tones("C7+", "realbook")).toBe("C E G# Bb");
    expect(parseChord("C7+", "brazilian").ambiguities).toEqual([
      { kind: "sevenPlus", chosen: "majorSeventh", alternative: "dominantSharpFive" },
    ]);
    expect(parseChord("C7+", "american").ambiguities[0].chosen).toBe("dominantSharpFive");
  });

  test("bareNine: C9 (brazilian add vs american/realbook dominant)", () => {
    expect(tones("C9", "brazilian")).toBe("C E G D");
    expect(tones("C9", "american")).toBe("C E G Bb D");
    expect(tones("C9", "realbook")).toBe("C E G Bb D");
    expect(parseChord("C9", "brazilian").ambiguities).toEqual([
      { kind: "bareNine", chosen: "add", alternative: "dominant" },
    ]);
  });

  test("degreeSign: B° (diminishedSeventh in all three, alternative diminishedTriad)", () => {
    for (const d of Object.keys(DIALECTS)) {
      expect(tones("B°", d)).toBe("B D F Ab");
      expect(parseChord("B°", d).ambiguities).toEqual([
        { kind: "degreeSign", chosen: "diminishedSeventh", alternative: "diminishedTriad" },
      ]);
    }
  });

  test("bareFour: C7(4) on a major triad (brazilian suspended vs american/realbook added)", () => {
    expect(tones("C7(4)", "brazilian")).toBe("C F G Bb");
    expect(tones("C7(4)", "american")).toBe("C E F G Bb");
    expect(tones("C7(4)", "realbook")).toBe("C E F G Bb");
    expect(parseChord("C7(4)", "brazilian").ambiguities).toEqual([
      { kind: "bareFour", chosen: "suspended", alternative: "added" },
    ]);
    // bare 9 is add9 in Brazilian too; the fourth is still suspended there.
    expect(tones("C9(4)", "brazilian")).toBe("C F G D");
  });

  test("bareFour on a minor triad is an added fourth in every dialect, reports nothing", () => {
    for (const d of Object.keys(DIALECTS)) {
      expect(tones("Cm7(4)", d)).toBe("C Eb F G Bb");
      expect(parseChord("Cm7(4)", d).ambiguities).toEqual([]);
    }
  });

  test("the dim word is the triad, °7/dim7 are already explicit (no ambiguity)", () => {
    expect(tones("Bdim")).toBe("B D F");
    expect(parseChord("Bdim").ambiguities).toEqual([]);
    expect(parseChord("B°7").ambiguities).toEqual([]);
    expect(parseChord("Bdim7").ambiguities).toEqual([]);
  });

  test("the spellings that only look ambiguous report nothing (§5.6 lines 286–288)", () => {
    for (const f of ["C7(9)", "Cmaj9", "Cadd9", "C7M9", "C7(5+)", "C7(9+)", "C7sus4", "C7add4", "Csus4", "C4"]) {
      expect(parseChord(f).ambiguities, f).toEqual([]);
    }
    expect(tones("C7sus4")).toBe("C F G Bb");
    expect(tones("C7add4")).toBe("C E F G Bb");
  });
});

describe("slash and compound bass (§5.1.2)", () => {
  test("a trailing /note is a slash bass", () => {
    const c = parseChord("C/E").chord;
    expect(c.bass).toEqual({ letter: "E", accidental: 0 });
    expect(c.extensions).toEqual([]);
    const am = parseChord("Am7/G").chord;
    expect(am.bass).toEqual({ letter: "G", accidental: 0 });
    expect(am.quality).toBe("minor");
  });

  test("a /digit stays in the body (C6/9), not a bass", () => {
    const c = parseChord("C6/9").chord;
    expect(c.bass).toBeNull();
    expect(c.extensions.map((e) => e.degree)).toEqual([6, 9]);
  });

  test("both a compound body and a bass (C6/9/E)", () => {
    const c = parseChord("C6/9/E").chord;
    expect(c.bass).toEqual({ letter: "E", accidental: 0 });
    expect(c.extensions.map((e) => e.degree)).toEqual([6, 9]);
  });

  test("a '/' with nothing after it is an error", () => {
    expect(parseChord("Cmaj/").chord).toBeNull();
  });
});

describe("spelled tones from the root (§5.5)", () => {
  // The §5.3.5 symbol→tones table, ported from test_chords.py test_tones.
  const table = [
    ["C", "C E G"],
    ["Cm", "C Eb G"],
    ["C7", "C E G Bb"],
    ["C6", "C E G A"],
    ["Cm6", "C Eb G A"],
    ["C5", "C G"],
    ["C4", "C F G"],
    ["Csus2", "C D G"],
    ["C+", "C E G#"],
    ["Cdim", "C Eb Gb"],
    ["C°7", "C Eb Gb Bbb"],
    ["Cdim7", "C Eb Gb Bbb"],
    ["Cm7b5", "C Eb Gb Bb"],
    ["Cø7", "C Eb Gb Bb"],
    ["Cmaj7#11", "C E G B F#"],
    ["C7b9", "C E G Bb Db"],
    ["C13", "C E G Bb D A"],
    ["C11", "C E G Bb D F"],
    ["C7M9", "C E G B D"],
    ["Cmaj9", "C E G B D"],
    ["Cadd9", "C E G D"],
    ["Db", "Db F Ab"],
    ["F#m", "F# A C#"],
    ["Bb7", "Bb D F Ab"],
    ["Ebb", "Ebb Gb Bbb"],
    ["Em7(b5)", "E G Bb D"],
    ["G7/13", "G B D F E"],
    ["A7(b13)", "A C# E G F"],
    ["C♯m7", "C# E G# B"],
    ["D♭7", "Db F Ab Cb"],
  ];
  for (const [text, expected] of table) {
    test(`${text} → ${expected}`, () => {
      expect(tones(text)).toBe(expected);
    });
  }

  test("spelled from the root, never from pitch class", () => {
    expect(tones("Db7")).toBe("Db F Ab Cb"); // not C# F G#
    expect(tones("C7b5")).toBe("C E Gb Bb");
    expect(chordTones(parseChord("C°7").chord).at(-1)).toBe("Bbb");
    expect(chordTones(parseChord("C7#11").chord).at(-1)).toBe("F#"); // #11 on C is F♯
  });
});

describe("errors are returned, never thrown (§5.4)", () => {
  const bad = ["", "   ", "H7", "xyz", "C##bb7", "7", "Cmaj/", "C(7", "C7)", "(2x)", "N.C.", "1.", "x2", "%", "@9"];
  for (const text of bad) {
    test(`${JSON.stringify(text)} is a non-chord with errors and no exception`, () => {
      let r;
      expect(() => {
        r = parseChord(text);
      }).not.toThrow();
      expect(r.chord).toBeNull();
      expect(r.errors.length).toBeGreaterThan(0);
    });
  }

  test("isChord mirrors parseChord", () => {
    expect(isChord("C7")).toBe(true);
    expect(isChord("H7")).toBe(false);
  });
});

describe("dialect surface (§5.6, §1.4.3)", () => {
  test("DEFAULT_DIALECT is brazilian", () => {
    expect(DEFAULT_DIALECT).toBe("brazilian");
  });

  test("DIALECTS carries the three dialects' four reading keys", () => {
    expect(Object.keys(DIALECTS).sort()).toEqual(["american", "brazilian", "realbook"]);
    for (const readings of Object.values(DIALECTS)) {
      expect(Object.keys(readings).sort()).toEqual(["bareFour", "bareNine", "degreeSign", "sevenPlus"]);
    }
  });

  test("an unknown dialect id returns a non-chord rather than throwing", () => {
    const r = parseChord("C", "klingon");
    expect(r.chord).toBeNull();
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
