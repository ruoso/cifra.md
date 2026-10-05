// Unit tests for the setlist layer (spec §10): the reader, the canonical
// writer, the §10.5/§10.9.2 path machinery and the §10.10 editing operations —
// cifra_js.setlists refinement §Acceptance "unit (setlist.test.js)". The reader
// and writer cases are ported from the reference's
// reference/tests/test_setlists.py on tiny purpose-written setlists and the two
// purpose-written examples/*.setlist.md; the editing-operation cases are new
// (the reference carries no editor), one per §10.10 operation, each result
// re-read and written to its expected canonical bytes. No one's copyrighted
// words appear.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, test, expect } from "vitest";

import {
  parseSetlist,
  writeSetlist,
  canonicalSetlist,
  songPath,
  writePath,
  pathFromSetlistToSong,
  textForSong,
  addSong,
  removeItem,
  moveItem,
  setProperty,
  removeProperty,
  pointItemAtSong,
  retargetItem,
  refreshText,
} from "../src/index.js";

// The reference's text→text `canonicalise_setlist`: write what the reader read.
// (The exported `canonicalSetlist` is the model→model seam the harness calls;
// these ports exercise the same path from text.)
const canonicalText = (text) => writeSetlist(parseSetlist(text));

const codes = (model) => model.diagnostics.map((d) => d.code);

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

// --- the §10.9.4 worked example --------------------------------------------

describe("the §10.9.4 worked example", () => {
  const text = `#   Thursday

3) [Minimal](./minimal.cifra.md)
     - Note: count in slowly
     - KEY: E
1)   [Tarde Clara](<with-words.cifra.md>)

Second set.
7. [Repeats](songs/../repeats.cifra.md "Repeats")
`;

  test("canonicalises to the stated bytes (§10.9.4)", () => {
    expect(canonicalText(text)).toBe(`# Thursday

1. [Minimal](minimal.cifra.md)
   - key: E
   - note: count in slowly
2. [Tarde Clara](with-words.cifra.md)

Second set.

3. [Repeats](songs/../repeats.cifra.md "Repeats")
`);
  });

  test("reports only the unlinked item (the link with a title)", () => {
    expect(codes(parseSetlist(text))).toEqual(["unlinked-item"]);
  });
});

// --- canonical form is unique and a fixed point (§10.9) --------------------

describe("canonical form (§10.9)", () => {
  test("the purpose-written examples are canonical", () => {
    const names = readdirSync(join(ROOT, "examples")).filter((n) => n.endsWith(".setlist.md"));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const bytes = readFileSync(join(ROOT, "examples", name));
      expect(canonicalText(bytes)).toBe(bytes.toString("utf-8"));
    }
  });

  test("canonical form is a fixed point", () => {
    const text = "# T\n- a: 1\n\n1. [A](a.cifra.md)\n   - key: D\n\nnotes\n\n2. b\n";
    expect(canonicalText(text)).toBe(text);
    expect(canonicalText(canonicalText(text))).toBe(text);
  });

  test("the empty setlist is the empty file (§10.9.1)", () => {
    expect(canonicalText("")).toBe("");
    expect(canonicalText("\n\n")).toBe("");
    expect(writeSetlist(parseSetlist("#\n"))).toBe("");
  });
});

// --- title and properties (§10.3.1) ----------------------------------------

describe("title and properties (§10.3.1)", () => {
  test("an empty title is no title", () => {
    expect(parseSetlist("#\n1. [A](a.cifra.md)\n").title).toBeNull();
  });

  test("a level-1 heading is the title", () => {
    expect(parseSetlist("# Thursday\n").title).toBe("Thursday");
  });

  test("properties follow the title, with blank lines between", () => {
    const m = parseSetlist("# T\n\n- date: today\n\n- Place: here\n- loose\n\n1. [A](a.cifra.md)\n");
    expect(m.properties).toEqual([
      { type: "property", key: "date", value: "today" },
      { type: "property", key: "place", value: "here" },
      { type: "unrecognised", text: "loose" },
    ]);
  });

  test("properties with no title", () => {
    const m = parseSetlist("- a: 1\n\n1. [A](a.cifra.md)\n");
    expect(m.title).toBeNull();
    expect(m.properties).toEqual([{ type: "property", key: "a", value: "1" }]);
  });
});

// --- items, numbering and classification (§10.3.2–§10.3.4) ------------------

describe("items and classification (§10.3)", () => {
  test("numbers are positions, `)` accepted, out-of-order renumbered", () => {
    const m = parseSetlist("7. [A](a.cifra.md)\n7) [B](b.cifra.md)\n1. [C](c.cifra.md)\n");
    expect(m.body.map((i) => i.number)).toEqual([1, 2, 3]);
  });

  test("four spaces before a number is notes", () => {
    const m = parseSetlist("1. [A](a.cifra.md)\n    2. [B](b.cifra.md)\n");
    expect(m.body[1]).toEqual({ type: "notes", lines: ["    2. [B](b.cifra.md)"] });
  });

  test("a bullet after a notes line is notes", () => {
    const m = parseSetlist("1. [A](a.cifra.md)\nsome notes\n- a list in the notes\n");
    expect(m.body[1].lines).toEqual(["some notes", "- a list in the notes"]);
    expect(m.body[0].entries).toEqual([]);
  });

  test("a fence in the notes hides items", () => {
    const m = parseSetlist("```\n1. [A](a.cifra.md)\n\n- key: D\n```\n2. [B](b.cifra.md)\n");
    expect(m.body[0]).toEqual({
      type: "notes",
      lines: ["```", "1. [A](a.cifra.md)", "", "- key: D", "```"],
    });
    expect(m.body[1].number).toBe(1);
  });

  test("an unclosed fence runs to the end and is reported", () => {
    const m = parseSetlist("1. [A](a.cifra.md)\n~~~\n2. [B](b.cifra.md)\n\n");
    expect(m.body[1]).toEqual({ type: "notes", lines: ["~~~", "2. [B](b.cifra.md)"] });
    expect(codes(m)).toEqual(["unclosed-fence"]);
  });

  test("notes keep leading spaces and inner blank lines", () => {
    const text = "1. [A](a.cifra.md)\n\n  indented\n\n\nmore\n\n2. [B](b.cifra.md)\n";
    expect(parseSetlist(text).body[1].lines).toEqual(["  indented", "", "", "more"]);
    expect(canonicalText(text)).toBe(text);
  });

  test("a notes block splits a run of items, numbering continuing", () => {
    const text = "1. [A](a.cifra.md)\n\nbreak\n\n2. [B](b.cifra.md)\n";
    const m = parseSetlist(text);
    expect(m.body.map((e) => e.type)).toEqual(["song", "notes", "song"]);
    expect(m.body[2].number).toBe(2);
    expect(canonicalText(text)).toBe(text);
  });
});

// --- links and the unlinked-item table (§10.4) -----------------------------

describe("links and unlinked items (§10.4)", () => {
  test.each([
    ['[A](a.cifra.md "A")'],
    ["[A][a]"],
    ["![A](a.cifra.md)"],
    ["<a.cifra.md>"],
    ["[A](a.cifra.md) live"],
    [""],
    ["just text"],
    ["[A](a b.cifra.md)"],
  ])("`%s` is an unlinked item, kept and counted", (content) => {
    const m = parseSetlist(`1. ${content}\n`);
    expect(m.body[0].type).toBe("unlinked");
    expect(m.body[0].content).toBe(content);
  });

  test("a song link reads its text and path", () => {
    const m = parseSetlist("1. [A](a.cifra.md)\n");
    expect(m.body[0]).toEqual({ type: "song", number: 1, text: "A", path: "a.cifra.md", entries: [] });
  });

  test("the link text is kept as written, not refreshed", () => {
    const text = "1. [A \\] [b] *c*](a.cifra.md)\n";
    expect(parseSetlist(text).body[0].text).toBe("A \\] [b] *c*");
    expect(canonicalText(text)).toBe(text);
  });
});

// --- item entries and properties (§10.3.3, §10.7) --------------------------

describe("item entries (§10.3.3, §10.7)", () => {
  test("a repeated key keeps its first place and last value", () => {
    const m = parseSetlist("1. [A](a.cifra.md)\n   - note: x\n   - key: D\n   - note: y\n");
    expect(m.body[0].entries).toEqual([
      { type: "property", key: "note", value: "y" },
      { type: "property", key: "key", value: "D" },
    ]);
    expect(codes(m)).toEqual(["duplicate-key"]);
  });

  test("item entries are written key then note then the rest", () => {
    const text = "1. [A](a.cifra.md)\n- singer: Ana\n      - note: n\n - other\n  - key: E\n";
    expect(canonicalText(text)).toBe(
      "1. [A](a.cifra.md)\n   - key: E\n   - note: n\n   - singer: Ana\n   - other\n",
    );
  });

  test("entry indentation follows the number", () => {
    const items = Array.from({ length: 10 }, (_, n) => `${n + 1}. [S${n + 1}](s${n + 1}.cifra.md)\n`).join("") + "- key: D\n";
    expect(canonicalText(items).endsWith("10. [S10](s10.cifra.md)\n    - key: D\n")).toBe(true);
  });

  test("an unrecognised entry is kept and reported", () => {
    const m = parseSetlist("1. [A](a.cifra.md)\n   - just a note\n");
    expect(m.body[0].entries).toEqual([{ type: "unrecognised", text: "just a note" }]);
    expect(codes(m)).toEqual(["unrecognised-entry"]);
  });

  test("the space after `:` is required (else the entry is unrecognised)", () => {
    const m = parseSetlist("1. [A](a.cifra.md)\n   - https://example.com/\n");
    expect(m.body[0].entries).toEqual([{ type: "unrecognised", text: "https://example.com/" }]);
  });

  test("a value may be empty", () => {
    const m = parseSetlist("1. [A](a.cifra.md)\n   - capo:\n");
    expect(m.body[0].entries).toEqual([{ type: "property", key: "capo", value: "" }]);
  });
});

// --- the `key` property (§10.7.1) ------------------------------------------

describe("the key property (§10.7.1)", () => {
  test("a bad key is reported and kept and written back", () => {
    const m = parseSetlist("1. [A](a.cifra.md)\n   - key: H\n");
    expect(codes(m)).toEqual(["bad-key"]);
    expect(canonicalText("1. [A](a.cifra.md)\n   - key: H\n").endsWith("- key: H\n")).toBe(true);
  });

  test.each([["D"], ["Em"], ["F#"], ["Bb"], ["C#m"]])("`%s` is a valid key (no diagnostic)", (value) => {
    const m = parseSetlist(`1. [A](a.cifra.md)\n   - key: ${value}\n`);
    expect(codes(m)).toEqual([]);
  });
});

// --- paths (§10.5, §10.9.2) ------------------------------------------------

describe("song paths (§10.5)", () => {
  test.each([
    ["a.cifra.md", "a.cifra.md"],
    ["./bossa/../a.cifra.md", "a.cifra.md"],
    ["../../a.cifra.md", "../../a.cifra.md"],
    ["<a b.cifra.md>", "a b.cifra.md"],
    ["a%20b.cifra.md", "a b.cifra.md"],
    ["%2E%2E/a.cifra.md", "../a.cifra.md"],
    ["can%C3%A7%C3%A3o.cifra.md", "canção.cifra.md"],
    ["a\\(1\\).cifra.md", "a(1).cifra.md"],
    ["a(1).cifra.md", "a(1).cifra.md"],
  ])("`%s` → `%s`", (dest, path) => {
    expect(songPath(dest)).toEqual({ path });
  });

  test.each([
    ["https://example.com/a.cifra.md", "step 2"],
    ["C:/a.cifra.md", "step 2"],
    ["a.cifra.md#verse", "step 2"],
    ["a.cifra.md?x", "step 2"],
    ["/a.cifra.md", "step 2"],
    ["a//b.cifra.md", "step 3"],
    ["bossa/", "step 3"],
    ["%FF.cifra.md", "step 4"],
    ["a%2Fb.cifra.md", "step 4"],
    ["a/..", "step 5"],
    ["a.md", "step 6"],
    [".cifra.md", "step 6"],
    ["A.Cifra.md", "step 6"],
  ])("`%s` fails at %s", (dest, step) => {
    const r = songPath(dest);
    expect(r.path).toBeUndefined();
    expect(r.error.startsWith(step)).toBe(true);
  });

  test("a failed path makes an unlinked item reported with its step", () => {
    const m = parseSetlist("1. [A](https://example.com/a.cifra.md)\n");
    expect(m.body[0].type).toBe("unlinked");
    expect(m.diagnostics[0].code).toBe("bad-path");
    expect(m.diagnostics[0].message).toContain("step 2");
  });

  test("a non-escape backslash in a path is reported", () => {
    const m = parseSetlist("1. [A](a\\\\b.cifra.md)\n");
    expect(m.body[0].type).toBe("song");
    expect(m.body[0].path).toBe("a\\b.cifra.md");
    expect(codes(m)).toEqual(["backslash-in-path"]);
  });
});

describe("writing paths (§10.9.2)", () => {
  test.each([
    ["a b.cifra.md", "a%20b.cifra.md"],
    ["a&b (1):x.cifra.md", "a%26b%20%281%29%3Ax.cifra.md"],
    ["canção.cifra.md", "canção.cifra.md"],
    ["<\u0301.cifra.md", "%3C%CC%81.cifra.md"],
    ["-._~!$'*+,;=@.cifra.md", "-._~!$'*+,;=@.cifra.md"],
    ["../x/y.cifra.md", "../x/y.cifra.md"],
  ])("`%s` → `%s` and round-trips", (path, written) => {
    expect(writePath(path)).toBe(written);
    expect(songPath(written)).toEqual({ path });
  });
});

// --- model-level canonicalisation (§10.9, corpus check 6) ------------------

describe("canonicalSetlist (model→model)", () => {
  test("reorders item entries and collapses a repeated key, equal to read-after-write", () => {
    const model = {
      title: "T",
      properties: [],
      body: [
        {
          type: "song",
          number: 1,
          text: "A",
          path: "a.cifra.md",
          entries: [
            { type: "property", key: "singer", value: "Ana" },
            { type: "property", key: "note", value: "x" },
            { type: "property", key: "key", value: "D" },
            { type: "property", key: "note", value: "y" },
          ],
        },
      ],
      diagnostics: [],
    };
    const got = canonicalSetlist(model);
    expect(got.body[0].entries).toEqual([
      { type: "property", key: "key", value: "D" },
      { type: "property", key: "note", value: "y" },
      { type: "property", key: "singer", value: "Ana" },
    ]);
    // Defined as parseSetlist(writeSetlist(model)).
    expect(got).toEqual(parseSetlist(writeSetlist(model)));
  });
});

// --- editing operations (§10.10) -------------------------------------------

describe("pathFromSetlistToSong (§10.10)", () => {
  test("a song beside the setlist is its file name alone", () => {
    expect(pathFromSetlistToSong(["sets"], ["sets", "song.cifra.md"])).toBe("song.cifra.md");
    expect(pathFromSetlistToSong([], ["song.cifra.md"])).toBe("song.cifra.md");
  });

  test("a shared prefix is trimmed", () => {
    expect(pathFromSetlistToSong(["a", "b"], ["a", "c", "song.cifra.md"])).toBe("../c/song.cifra.md");
  });

  test("one `..` per leftover directory segment, never the file name", () => {
    expect(pathFromSetlistToSong(["a", "b", "c"], ["a", "song.cifra.md"])).toBe("../../song.cifra.md");
    expect(pathFromSetlistToSong(["x"], ["song.cifra.md"])).toBe("../song.cifra.md");
  });
});

describe("textForSong (§10.10)", () => {
  test("a title is escaped for a link's text", () => {
    expect(textForSong({ title: "A [b] c\\" })).toBe("A \\[b\\] c\\\\");
    expect(textForSong({ title: "plain" })).toBe("plain");
    // A backslash-punctuation pair is copied as-is.
    expect(textForSong({ title: "a\\*b" })).toBe("a\\*b");
  });

  test("no title → the file name without .cifra.md, escaped as a file name", () => {
    expect(textForSong({ fileName: "a_b [1] & <x>.cifra.md" })).toBe("a\\_b \\[1\\] \\& \\<x>");
    expect(textForSong({ title: "", fileName: "plain.cifra.md" })).toBe("plain");
  });
});

describe("item operations (§10.10)", () => {
  const base = parseSetlist("# T\n\n1. [A](a.cifra.md)\n   - key: D\n2. [B](b.cifra.md)\n");

  const reread = (model) => parseSetlist(writeSetlist(model));

  test("add a song at a position, and last, with no entries", () => {
    const mid = addSong(base, { text: "C", path: "c.cifra.md" }, 1);
    expect(writeSetlist(mid)).toBe("# T\n\n1. [A](a.cifra.md)\n   - key: D\n2. [C](c.cifra.md)\n3. [B](b.cifra.md)\n");
    expect(reread(mid).body[1]).toEqual({ type: "song", number: 2, text: "C", path: "c.cifra.md", entries: [] });

    const last = addSong(base, { text: "C", path: "c.cifra.md" });
    expect(writeSetlist(last).endsWith("3. [C](c.cifra.md)\n")).toBe(true);
  });

  test("remove an item; its entries go with it and the rest renumber", () => {
    const m = removeItem(base, 0);
    expect(writeSetlist(m)).toBe("# T\n\n1. [B](b.cifra.md)\n");
  });

  test("move an item", () => {
    const m = moveItem(base, 0, 1);
    expect(writeSetlist(m)).toBe("# T\n\n1. [B](b.cifra.md)\n2. [A](a.cifra.md)\n   - key: D\n");
  });

  test("set a property (added and replaced) and remove a property", () => {
    const added = setProperty(base, 1, "Key", "E");
    expect(writeSetlist(added)).toBe("# T\n\n1. [A](a.cifra.md)\n   - key: D\n2. [B](b.cifra.md)\n   - key: E\n");
    const replaced = setProperty(base, 0, "key", "G");
    expect(writeSetlist(replaced)).toContain("1. [A](a.cifra.md)\n   - key: G\n");
    const removed = removeProperty(base, 0, "key");
    expect(writeSetlist(removed)).toBe("# T\n\n1. [A](a.cifra.md)\n2. [B](b.cifra.md)\n");
  });

  test("point an item at a song: path and text change, entries kept", () => {
    const m = pointItemAtSong(base, 0, { text: "Z", path: "z.cifra.md" });
    expect(writeSetlist(m)).toBe("# T\n\n1. [Z](z.cifra.md)\n   - key: D\n2. [B](b.cifra.md)\n");
    expect(reread(m).body[0].entries).toEqual([{ type: "property", key: "key", value: "D" }]);
  });

  test("retarget an item (path only): text and entries kept", () => {
    const m = retargetItem(base, 0, "sub/a.cifra.md");
    expect(writeSetlist(m)).toBe("# T\n\n1. [A](sub/a.cifra.md)\n   - key: D\n2. [B](b.cifra.md)\n");
  });

  test("refresh a link's text: only the text changes", () => {
    const m = refreshText(base, 1, "New");
    expect(writeSetlist(m)).toBe("# T\n\n1. [A](a.cifra.md)\n   - key: D\n2. [New](b.cifra.md)\n");
  });

  test("operations do not mutate their input", () => {
    const before = writeSetlist(base);
    addSong(base, { text: "C", path: "c.cifra.md" }, 0);
    removeItem(base, 0);
    moveItem(base, 0, 1);
    setProperty(base, 0, "key", "Z");
    expect(writeSetlist(base)).toBe(before);
  });
});
