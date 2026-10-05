// Unit tests for the text layer (spec §1.3) and the marker-line primitive
// (§11.12.3) — cifra_js.text_layer refinement §Acceptance "unit". Ported from
// the reference's reference/tests/test_canonical.py::TestText and
// reference/tests/test_marker_lines.py, one case per §1.3 rule and one per
// marker-line rule, on tiny purpose-written inputs. The corpus-input cases read
// the real, purpose-written corpus bytes (03/26/47) — never anyone's
// copyrighted words.

import { readFileSync } from "node:fs";
import { describe, test, expect } from "vitest";

import {
  decode,
  prepare,
  markerLines,
  isMarkerLine,
  NotUtf8Error,
} from "../src/index.js";

// --- UTF-8 (§1.1 lines 6–9, §1.3 step 1; test_not_utf8_is_refused) ---------

describe("UTF-8 validation", () => {
  test("valid bytes decode", () => {
    expect(decode(Buffer.from("# T\né\n", "utf-8"))).toBe("# T\né\n");
    expect(prepare(Buffer.from("# T\n", "utf-8"))).toEqual(["# T"]);
  });

  test("invalid bytes throw NotUtf8Error", () => {
    const bad = Uint8Array.from([0x23, 0x0a, 0xff, 0x0a]); // '#', LF, 0xFF, LF
    expect(() => decode(bad)).toThrow(NotUtf8Error);
    expect(() => prepare(bad)).toThrow(NotUtf8Error);
    expect(() => markerLines(bad)).toThrow(NotUtf8Error);
  });

  test("a string input skips the UTF-8 check (already decoded)", () => {
    // A lone surrogate is not valid UTF-8, but a string is trusted: step 1 is
    // skipped, exactly as the reference's `str | bytes` entry does.
    expect(() => prepare("# T\n\ud800\n")).not.toThrow();
  });
});

// --- U+FEFF removal (step 2; test_every_byte_order_mark_is_removed) --------

describe("U+FEFF is removed everywhere", () => {
  test("a BOM at the start", () => {
    expect(prepare("﻿# T\n")).toEqual(["# T"]);
  });
  test("a doubled BOM", () => {
    expect(prepare("﻿﻿# T\n")).toEqual(["# T"]);
  });
  test("a U+FEFF mid-line and after a newline", () => {
    expect(prepare("- a: x﻿y\n")).toEqual(["- a: xy"]);
    expect(prepare("\n﻿hello\n")).toEqual(["", "hello"]);
  });
});

// --- NFC (step 3; test_nfc, test_nfc_keeps_chords_over_their_syllables) ----

describe("NFC normalisation", () => {
  test("Cafe + combining acute composes to Café", () => {
    expect(prepare("# Café\n")).toEqual(["# Café"]);
  });
  test("a combining mark is recomposed before the split", () => {
    // The NFC text is one line; recomposition cannot move a line boundary.
    expect(prepare("Café com leite\n")).toEqual(["Café com leite"]);
  });
});

// --- Line splitting (step 4; test_bom_crlf_and_lone_cr,
//     test_empty_document_is_the_empty_file, test_one_final_newline) --------

describe("line splitting", () => {
  test("LF, CR LF and a lone CR each end a line", () => {
    expect(prepare("a\nb\r\nc\rd")).toEqual(["a", "b", "c", "d"]);
  });
  test("CR LF is one terminator, not two", () => {
    expect(prepare("a\r\nb")).toEqual(["a", "b"]);
  });
  test("a final line without a terminator is a line", () => {
    expect(prepare("a\nb")).toEqual(["a", "b"]);
  });
  test("a terminator at the very end does not begin another line", () => {
    expect(prepare("a\n")).toEqual(["a"]);
    expect(prepare("a\r\n")).toEqual(["a"]);
    expect(prepare("a\r")).toEqual(["a"]);
  });
  test("the empty text is zero lines", () => {
    expect(prepare("")).toEqual([]);
    // Only FEFF/whitespace/terminators: blank lines stripped to empty strings,
    // but still lines (the empty *document* is "" — pinned above).
    expect(prepare("﻿\n  \n\t\n")).toEqual(["", "", ""]);
  });
});

// --- Tabs (step 5; test_tabs_become_one_space) ----------------------------

describe("tabs become one space", () => {
  test("each tab is exactly one space, not a run to a tab stop", () => {
    expect(prepare("G\tD\nWhen\tI saw\n")).toEqual(["G D", "When I saw"]);
    expect(prepare("\tindented\n")).toEqual([" indented"]);
  });
});

// --- Whitespace is U+0020 only (step 6, §1.3 lines 49–54;
//     test_trailing_spaces_are_removed_everywhere,
//     test_no_break_space_is_not_whitespace) --------------------------------

describe("trailing spaces and whitespace", () => {
  test("trailing U+0020 is stripped on every line", () => {
    expect(prepare("# T  \n\n## A  \nnotes   \n")).toEqual([
      "# T",
      "",
      "## A",
      "notes",
    ]);
  });
  test("a no-break space is neither stripped nor a separator", () => {
    // U+00A0 leading and trailing stays; it is an ordinary character.
    expect(prepare("- a:  x\n")).toEqual(["- a:  x"]);
    expect(prepare("x \n")).toEqual(["x "]);
    expect(prepare(" C | G\n")).toEqual([" C | G"]);
  });
});

// --- Marker lines (§11.12.3 lines 1037–1041; test_marker_lines,
//     test_lines_that_are_not_markers,
//     test_markers_are_found_after_the_text_layer) --------------------------

describe("marker lines", () => {
  test.each([
    "<<<<<<<",
    "=======",
    ">>>>>>>",
    "|||||||",
    "<<<<<<< ours",
    ">>>>>>> theirs",
    "||||||| base",
    "======= x",
  ])("a marker line: %s", (line) => {
    expect(isMarkerLine(line)).toBe(true);
  });

  test.each([
    "========", // eight, not seven
    "<<<<<<", // six, not seven
    "=======x", // trailing text with no space
    " =======", // leading space
    "<<<<<<<ours", // no space before text
    "a =======", // not at the start
  ])("not a marker line: %s", (line) => {
    expect(isMarkerLine(line)).toBe(false);
  });

  test("markers are found after the text layer, 1-based", () => {
    // A trailing space and a tab are gone before the line is looked at (§1.3).
    expect(markerLines("a\r\n=======  \r\n<<<<<<<\t\n")).toEqual([2, 3]);
  });

  test("numbering is 1-based across several lines", () => {
    expect(markerLines("<<<<<<<\nC\n=======\nG\n>>>>>>>\n")).toEqual([1, 3, 5]);
  });
});

// --- Corpus inputs pinned (the entries that exercise §1.3, input side) -----
// prepare on the real input bytes of 03/26/47 yields the expected clean line
// lists; the whole-entry corpus checks cannot reach this until the reader lands
// (refinement §Acceptance, §Decisions).

describe("corpus inputs pinned", () => {
  const corpusBytes = (name, file) =>
    readFileSync(new URL(`../../corpus/${name}/${file}`, import.meta.url));

  test("03-crlf-bom: BOM and CR LF throughout", () => {
    expect(prepare(corpusBytes("03-crlf-bom", "input.cifra.md"))).toEqual([
      "# CRLF and a BOM",
      "- notation: American",
      "",
      "## A",
      "```",
      "C9 | G",
      "```",
      "",
      "---",
      "",
      "## Voicings: E2 A2 D3 G3 B3 E4",
      "- C9: x32330",
    ]);
  });

  test("26-text-layer: BOM, mid-line FEFF, lone CR, tabs, NFC, NBSP, trailing spaces", () => {
    expect(prepare(corpusBytes("26-text-layer", "input.cifra.md"))).toEqual([
      "# Text Layer",
      "## A",
      "```",
      "G D",
      "When I saw",
      "```",
      "",
      "Café au lait, a note",
      "```",
      " C | G",
      "```",
    ]);
  });

  test("47-setlist-text-layer: the setlist counterpart (§10.2)", () => {
    expect(
      prepare(corpusBytes("47-setlist-text-layer", "input.setlist.md")),
    ).toEqual([
      "# Café Session",
      "",
      "1. [Warm Up](warm-up.cifra.md)",
      "   - note: be gentle",
    ]);
  });
});
