// Semantic diff — "what changed, in musical terms" (cifra_js.diff refinement
// §Acceptance). This module is the app's own layer over the spec-defined
// model: it has no spec chapter, no corpus footprint and nothing in the Python
// reference to port, so its conformance is these unit tests on tiny,
// purpose-written songs. No one's copyrighted words appear.
//
// Each case names the design source it pins: DIRECTION §4 (docs/DIRECTION.md
// line 434), workflow 4 (docs/workflows/04-edit-and-save.md) and workflow 6
// (docs/workflows/06-history.md), and the model facts in parse.js it relies on.

import { describe, test, expect } from "vitest";

import { parse, diff } from "../src/index.js";

// --- fixtures ----------------------------------------------------------------
// An unsung chart: chords in a fence, no words beneath, so bars are numbered
// (parse.js:874–892). Verse is the first section, so its bar ordinals are the
// absolute bar numbers.
const chart = (measures) => "## Verse\n```\n" + measures + "\n```\n";
// A sung section: a fenced chord line paired with a lyric line of >=2 words, so
// the document is sung (parse.js:654–668) and bars are NOT numbered.
const sung = (chords, words) => "## Chorus\n```\n" + chords + "\n" + words + "\n```\n";
// A song with a voicings region (§7): a chart plus a `---` and one block.
const withVoicings = (block) => "## Verse\n```\nC\n```\n---\n" + block;

// --- chords ------------------------------------------------------------------
describe("chords", () => {
  // Pins docs/DIRECTION.md:434, workflows/04-edit-and-save.md:27,
  // workflows/06-history.md:43 — "Verse bar 5: G7 → D♭7" on an unsung song.
  test("a chord changed is located by section and bar number", () => {
    const before = parse(chart("C | G | Am | F | G7"));
    const after = parse(chart("C | G | Am | F | D♭7"));
    const { changes, summary } = diff(before, after);
    expect(changes).toEqual([
      {
        kind: "chord",
        op: "changed",
        where: { section: "Verse", bar: 5 },
        before: "G7",
        after: "D♭7",
        text: "Verse bar 5: G7 → D♭7",
      },
    ]);
    expect(summary).toBe("Verse bar 5: G7 → D♭7");
  });

  test("a chord added appears at a located bar", () => {
    const before = parse(chart("C | G | Am | F | G7"));
    const after = parse(chart("C | G | Am | F | G7 | Bm"));
    const { changes } = diff(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "chord", op: "added", where: { section: "Verse", bar: 6 }, before: null, after: "Bm" });
    expect(changes[0].text).toBe("Verse bar 6: Bm added");
  });

  test("a chord removed disappears from a located bar", () => {
    const before = parse(chart("C | G | Am | F | G7 | Bm"));
    const after = parse(chart("C | G | Am | F | G7"));
    const { changes } = diff(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "chord", op: "removed", where: { section: "Verse", bar: 6 }, before: "Bm", after: null });
    expect(changes[0].text).toBe("Verse bar 6: Bm removed");
  });

  // Pins the unsung-only bar-numbering rule (parse.js:874–892): a sung song has
  // no bar numbers, so the change is located by section alone — "Chorus: G →
  // Em" (workflows/06-history.md:43).
  test("a chord changed in a sung song is located by section, no bar", () => {
    const before = parse(sung("G       C", "Hello there my darling"));
    const after = parse(sung("Em      C", "Hello there my darling"));
    expect(before.sung).toBe(true);
    const { changes } = diff(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "chord", op: "changed", where: { section: "Chorus" }, before: "G", after: "Em" });
    expect(changes[0].where.bar).toBeUndefined();
    expect(changes[0].text).toBe("Chorus: G → Em");
  });
});

// --- voicings ----------------------------------------------------------------
describe("voicings", () => {
  // Pins workflows/04-edit-and-save.md:28 — a whole new block reads "added
  // voicings for G4 C4 E4 A4".
  test("voicings added for a new block", () => {
    const before = parse("## Verse\n```\nC\n```\n");
    const after = parse(withVoicings("## Voicings: G4 C4 E4 A4\n- Cm: 0333\n"));
    const { changes, summary } = diff(before, after);
    expect(changes).toEqual([
      { kind: "voicing", op: "added", where: { tuning: "G4 C4 E4 A4" }, before: null, after: null, text: "added voicings for G4 C4 E4 A4" },
    ]);
    expect(summary).toBe("added voicings for G4 C4 E4 A4");
  });

  // Pins workflows/06-history.md:44 — a changed voicing names the chord.
  test("a voicing changed names the chord", () => {
    const before = parse(withVoicings("## Voicings: G4 C4 E4 A4\n- Cm: 0333\n"));
    const after = parse(withVoicings("## Voicings: G4 C4 E4 A4\n- Cm: 0334\n"));
    const { changes } = diff(before, after);
    expect(changes).toEqual([
      {
        kind: "voicing",
        op: "changed",
        where: { tuning: "G4 C4 E4 A4", key: "Cm" },
        before: [0, 3, 3, 3],
        after: [0, 3, 3, 4],
        text: "voicings for G4 C4 E4 A4: Cm changed",
      },
    ]);
  });

  test("a voicing removed when its key disappears from a block", () => {
    const before = parse(withVoicings("## Voicings: G4 C4 E4 A4\n- C: 0003\n- Cm: 0333\n"));
    const after = parse(withVoicings("## Voicings: G4 C4 E4 A4\n- Cm: 0333\n"));
    const { changes } = diff(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "voicing", op: "removed", where: { tuning: "G4 C4 E4 A4", key: "C" } });
    expect(changes[0].text).toBe("voicings for G4 C4 E4 A4: C removed");
  });
});

// --- sections ----------------------------------------------------------------
describe("sections", () => {
  test("a section added", () => {
    const before = parse("## Verse\n```\nC\n```\n");
    const after = parse("## Verse\n```\nC\n```\n## Chorus\n```\nG\n```\n");
    const { changes } = diff(before, after);
    expect(changes).toEqual([
      { kind: "section", op: "added", where: { section: "Chorus" }, before: null, after: "Chorus", text: "Section added: Chorus" },
    ]);
  });

  test("a section removed", () => {
    const before = parse("## Verse\n```\nC\n```\n## Chorus\n```\nG\n```\n");
    const after = parse("## Verse\n```\nC\n```\n");
    const { changes } = diff(before, after);
    expect(changes).toEqual([
      { kind: "section", op: "removed", where: { section: "Chorus" }, before: "Chorus", after: null, text: "Section removed: Chorus" },
    ]);
  });

  // A section whose content is unchanged but whose name changed is a rename,
  // not a remove+add (the section-alignment rule, Decision 5).
  test("a section renamed keeps its content", () => {
    const before = parse("## Intro\n```\nC | G\n```\n");
    const after = parse("## Opening\n```\nC | G\n```\n");
    const { changes } = diff(before, after);
    expect(changes).toEqual([
      { kind: "section", op: "renamed", where: { section: "Opening" }, before: "Intro", after: "Opening", text: "Section renamed: Intro → Opening" },
    ]);
  });

  // The same set of sections in a different order is one reorder — not a cascade
  // of chord changes, even though bar numbers are document-wide (parse.js:875).
  test("sections reordered", () => {
    const before = parse("## Intro\n```\nC\n```\n## Verse\n```\nG\n```\n");
    const after = parse("## Verse\n```\nG\n```\n## Intro\n```\nC\n```\n");
    const { changes } = diff(before, after);
    expect(changes).toEqual([
      {
        kind: "section",
        op: "reordered",
        where: {},
        before: ["Intro", "Verse"],
        after: ["Verse", "Intro"],
        text: "Sections reordered",
      },
    ]);
  });
});

// --- words -------------------------------------------------------------------
describe("words", () => {
  // Coarse: a section whose lyric text differs reports "Verse words changed";
  // the exact wording is the line diff behind *Show the text*
  // (workflows/06-history.md:44).
  test("a section's changed lyrics report coarsely", () => {
    const before = parse("## Verse\n```\nG       C\nHello my darling dear\n```\n");
    const after = parse("## Verse\n```\nG       C\nGoodbye my darling dear\n```\n");
    expect(before.sung).toBe(true);
    const { changes } = diff(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "words", op: "changed", where: { section: "Verse" } });
    expect(changes[0].text).toBe("Verse words changed");
  });
});

// --- properties --------------------------------------------------------------
describe("properties", () => {
  test("a property changed, added and removed", () => {
    const changed = diff(
      parse("# My Song\n- key: G\n\n## Verse\n```\nC\n```\n"),
      parse("# My Song\n- key: A\n\n## Verse\n```\nC\n```\n"),
    );
    expect(changed.changes).toEqual([
      { kind: "property", op: "changed", where: { key: "key" }, before: "G", after: "A", text: "key: G → A" },
    ]);

    const added = diff(
      parse("# My Song\n- key: G\n\n## Verse\n```\nC\n```\n"),
      parse("# My Song\n- key: G\n- capo: 2\n\n## Verse\n```\nC\n```\n"),
    );
    expect(added.changes).toEqual([
      { kind: "property", op: "added", where: { key: "capo" }, before: null, after: "2", text: "capo added: 2" },
    ]);

    const removed = diff(
      parse("# My Song\n- key: G\n- capo: 2\n\n## Verse\n```\nC\n```\n"),
      parse("# My Song\n- key: G\n\n## Verse\n```\nC\n```\n"),
    );
    expect(removed.changes).toEqual([
      { kind: "property", op: "removed", where: { key: "capo" }, before: "2", after: null, text: "capo removed" },
    ]);
  });
});

// --- title -------------------------------------------------------------------
describe("title", () => {
  test("a title changed, added and removed", () => {
    const body = "\n## Verse\n```\nC\n```\n";
    const changed = diff(parse("# Old Name" + body), parse("# New Name" + body));
    expect(changed.changes).toEqual([
      { kind: "title", op: "changed", where: {}, before: "Old Name", after: "New Name", text: "Title: Old Name → New Name" },
    ]);

    const added = diff(parse("## Verse\n```\nC\n```\n"), parse("# New Name" + body));
    expect(added.changes).toEqual([
      { kind: "title", op: "added", where: {}, before: null, after: "New Name", text: "Title added: New Name" },
    ]);

    const removed = diff(parse("# Old Name" + body), parse("## Verse\n```\nC\n```\n"));
    expect(removed.changes).toEqual([
      { kind: "title", op: "removed", where: {}, before: "Old Name", after: null, text: "Title removed" },
    ]);
  });
});

// --- summary assembly and ordering -------------------------------------------
describe("summary", () => {
  // The two canonical full strings the design shows, pinning ordering (sections
  // before voicings) and "; " joining (DIRECTION §4, workflows 4 and 6).
  test("composite summary: chord change then added voicings (workflow 4)", () => {
    const before = parse("## Verse\n```\nC | G | Am | F | G7\n```\n");
    const after = parse("## Verse\n```\nC | G | Am | F | D♭7\n```\n---\n## Voicings: G4 C4 E4 A4\n- Cm: 0333\n");
    const { summary } = diff(before, after);
    expect(summary).toBe("Verse bar 5: G7 → D♭7; added voicings for G4 C4 E4 A4");
  });

  test("composite summary: chord change then voicing changed (workflow 6)", () => {
    const before = parse("## Verse\n```\nC | G | Am | F | G7\n```\n---\n## Voicings: G4 C4 E4 A4\n- Cm: 0333\n");
    const after = parse("## Verse\n```\nC | G | Am | F | D♭7\n```\n---\n## Voicings: G4 C4 E4 A4\n- Cm: 0334\n");
    const { summary } = diff(before, after);
    expect(summary).toBe("Verse bar 5: G7 → D♭7; voicings for G4 C4 E4 A4: Cm changed");
  });

  test("the summary is one line, fit for a commit subject", () => {
    const before = parse("# Old\n- key: G\n\n## Verse\n```\nC | G | Am | F | G7\n```\n");
    const after = parse("# New\n- key: A\n\n## Verse\n```\nC | G | Am | F | D♭7\n```\n---\n## Voicings: G4 C4 E4 A4\n- Cm: 0333\n");
    const { summary } = diff(before, after);
    expect(summary).not.toContain("\n");
    expect(summary.split("; ").length).toBeGreaterThan(2);
  });
});

// --- no change and purity ----------------------------------------------------
describe("no change and purity", () => {
  test("an unchanged pair yields no changes and an empty summary", () => {
    const m = parse("# Song\n- key: G\n\n## Verse\n```\nC | G | Am | F | G7\n```\n---\n## Voicings: G4 C4 E4 A4\n- Cm: 0333\n");
    const m2 = parse("# Song\n- key: G\n\n## Verse\n```\nC | G | Am | F | G7\n```\n---\n## Voicings: G4 C4 E4 A4\n- Cm: 0333\n");
    const { changes, summary } = diff(m, m2);
    expect(changes).toEqual([]);
    expect(summary).toBe("");
  });

  test("diff(m, m) is empty and diff does not mutate its inputs", () => {
    const m = parse("# Song\n- key: G\n\n## Verse\n```\nC | G | G7\n```\n");
    expect(diff(m, m).changes).toEqual([]);

    const a = parse("## Verse\n```\nC | G | G7\n```\n");
    const b = parse("## Verse\n```\nC | G | D♭7\n```\n");
    const aSnapshot = JSON.stringify(a);
    const bSnapshot = JSON.stringify(b);
    diff(a, b);
    expect(JSON.stringify(a)).toBe(aSnapshot);
    expect(JSON.stringify(b)).toBe(bSnapshot);
  });
});
