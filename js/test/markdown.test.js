// Unit tests for the shared block primitives (spec §1.4.1 title, §1.9 fences) as
// chapter 10 uses them — cifra_js.setlists refinement §Acceptance "unit
// (markdown.test.js)". Ported from the reference's reference/cifra_md/parse.py
// behaviour (`md_heading`, `fence_open`, `closes_fence`), one case per rule on
// tiny purpose-written lines.

import { describe, test, expect } from "vitest";

import { mdHeading, fenceOpen, closesFence } from "../src/index.js";

// --- the level-1 title (§1.4.1, via §1.7.1) --------------------------------

describe("mdHeading", () => {
  test("a level-1 `# ` reads its text, trimmed and collapsed", () => {
    expect(mdHeading("# Thursday")).toEqual({ level: 1, text: "Thursday" });
    expect(mdHeading("#   Thursday")).toEqual({ level: 1, text: "Thursday" });
    expect(mdHeading("# a   b")).toEqual({ level: 1, text: "a b" });
  });

  test("up to three leading spaces is still a heading, four is not", () => {
    expect(mdHeading("   # T")).toEqual({ level: 1, text: "T" });
    expect(mdHeading("    # T")).toBeNull();
  });

  test("`#` alone has no text", () => {
    expect(mdHeading("#")).toEqual({ level: 1, text: "" });
    expect(mdHeading("# ")).toEqual({ level: 1, text: "" });
  });

  test("a closing `#` sequence is removed", () => {
    expect(mdHeading("# T #")).toEqual({ level: 1, text: "T" });
    expect(mdHeading("# T ###")).toEqual({ level: 1, text: "T" });
  });

  test("levels 2–6 carry their level", () => {
    expect(mdHeading("## T")).toEqual({ level: 2, text: "T" });
    expect(mdHeading("###### T")).toEqual({ level: 6, text: "T" });
  });

  test("a non-heading, a seven-hash run, and `#x` without a space are null", () => {
    expect(mdHeading("not a heading")).toBeNull();
    expect(mdHeading("####### T")).toBeNull();
    expect(mdHeading("#x")).toBeNull();
    expect(mdHeading("")).toBeNull();
  });
});

// --- fences (§1.9) ---------------------------------------------------------

describe("fenceOpen", () => {
  test("a run of three or more backticks or tildes opens a fence", () => {
    expect(fenceOpen("```")).toEqual({ char: "`", length: 3, info: "" });
    expect(fenceOpen("~~~~")).toEqual({ char: "~", length: 4, info: "" });
    expect(fenceOpen("   ```")).toEqual({ char: "`", length: 3, info: "" });
  });

  test("the info string is kept, trimmed and ASCII-lowercased", () => {
    expect(fenceOpen("```  Chart  ")).toEqual({ char: "`", length: 3, info: "chart" });
    expect(fenceOpen("~~~ Info Here")).toEqual({ char: "~", length: 3, info: "info here" });
  });

  test("a backtick in a backtick fence's info string opens no fence", () => {
    expect(fenceOpen("``` a`b")).toBeNull();
    // A tilde fence may hold backticks in its info.
    expect(fenceOpen("~~~ a`b")).toEqual({ char: "~", length: 3, info: "a`b" });
  });

  test("fewer than three, four leading spaces, or a plain line opens no fence", () => {
    expect(fenceOpen("``")).toBeNull();
    expect(fenceOpen("    ```")).toBeNull();
    expect(fenceOpen("text")).toBeNull();
  });
});

describe("closesFence", () => {
  const fence = { char: "`", length: 3 };

  test("the same character, at least as long, nothing after, closes it", () => {
    expect(closesFence("```", fence)).toBe(true);
    expect(closesFence("````", fence)).toBe(true);
    expect(closesFence("   ```", fence)).toBe(true);
  });

  test("a shorter run, a different char, or trailing text does not close it", () => {
    expect(closesFence("``", fence)).toBe(false);
    expect(closesFence("~~~", fence)).toBe(false);
    expect(closesFence("``` ", fence)).toBe(false);
    expect(closesFence("```x", fence)).toBe(false);
  });

  test("a tilde fence is closed only by tildes", () => {
    const tilde = { char: "~", length: 4 };
    expect(closesFence("~~~~", tilde)).toBe(true);
    expect(closesFence("~~~", tilde)).toBe(false);
    expect(closesFence("`````", tilde)).toBe(false);
  });
});
