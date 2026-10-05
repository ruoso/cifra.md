// Semantic diff — "what changed, in musical terms" (DIRECTION §3.6 line 269,
// §4 lines 433–437, §5 lines 445–449). This is the app's own layer over the
// spec-defined model: it is NOT part of the cifra.md specification, has no
// corpus footprint, and nothing in the Python reference to port. Three app
// screens read it — the save sheet (`songs.save_sheet`, workflow 4), a song's
// history and version previews (`songs.history`, workflow 6) — and it runs in
// the Worker alongside save/merge/index.
//
// Framework-free and zero runtime dependencies (DIRECTION §3.7): a pure
// function of two parsed models. `diff(before, after)` does no I/O, holds no
// state, mutates neither input, and returns an equal result for equal inputs.
// It compares the model `parse` produces (parse.js) and never needs the raw
// bytes. A marked text (one holding conflict markers) is never canonical and
// never the thing compared: the app surfaces the conflict instead (spec §8,
// §11) — this module takes two successfully parsed models.
//
// The `summary` string doubles as the default commit message / prefilled save
// note (workflow 4 line 29), so it is stable, neutral English, one line: the
// library carries no i18n (DIRECTION §3.6), and localizing how the structured
// records render is the app's job. Exact glyphs come from the design: chord
// changes read `before → after` with "→" (U+2192); chord text is the model's
// `symbol` as written (so a flat shows "♭" only when the source spelt it so);
// a voicing block is named by its `tuning.text`; clauses join with "; ".

// The ordered list of chord-bearing bars in a section — each `{ number,
// symbols }`, reading order across every music part and line. `number` is the
// measure's bar number (present only in an unsung document, parse.js:874–892)
// or `null` when the song is sung. Bar numbering is document-wide (the counter
// runs across sections, parse.js:875), so two versions of one section align by
// their position *within* the section (the bar ordinal), not by absolute bar
// number — otherwise reordering or resizing an earlier section would shift the
// numbers and spuriously report chord changes here. The stored `number` is
// used only to locate a change ("Verse bar 5"), never to align.
function sectionBars(section) {
  const bars = [];
  for (const part of section.body) {
    if (part.type !== "music") continue;
    for (const line of part.lines) {
      if (line.kind !== "chart" && line.kind !== "sung") continue;
      for (const measure of line.measures) {
        const symbols = [];
        for (const item of measure.items) {
          if (item.type === "chord") symbols.push(item.symbol);
        }
        if (symbols.length === 0) continue;
        const number = "number" in measure ? measure.number : null;
        bars.push({ number, symbols });
      }
    }
  }
  return bars;
}

// A section's sung/lyric text, coarsely: the words a reader sings. Chord
// symbols are never words; notes, annotations and verbatim blocks are the line
// diff's concern (workflow 6 line 44), not the musical summary. Lyric lines
// carry `.text`; a sung line distributes its words across items as `.words`.
function sectionWords(section) {
  const parts = [];
  for (const part of section.body) {
    if (part.type !== "music") continue;
    for (const line of part.lines) {
      if (line.kind === "lyric") {
        parts.push(line.text);
      } else if (line.kind === "sung") {
        for (const measure of line.measures) {
          for (const item of measure.items) {
            if (typeof item.words === "string") parts.push(item.words);
          }
        }
      }
    }
  }
  return parts.join("\n");
}

// A section label for prose: the heading text, or "(untitled)" for the
// pre-heading section whose name is the empty string.
function sectionLabel(name) {
  return name === "" ? "(untitled)" : name;
}

// A change record with the acceptance criteria's fixed field order. `where`
// drops undefined/null parts, keeping the { section, bar, tuning, variation,
// key } order.
function change(kind, op, where, before, after, text) {
  const w = {};
  if (where.section !== undefined) w.section = where.section;
  if (where.bar !== undefined && where.bar !== null) w.bar = where.bar;
  if (where.tuning !== undefined) w.tuning = where.tuning;
  if (where.variation !== undefined && where.variation !== "") {
    w.variation = where.variation;
  }
  if (where.key !== undefined) w.key = where.key;
  return { kind, op, where: w, before, after, text };
}

// Title: string | null. Added / removed / changed.
function diffTitle(before, after, out) {
  if (before.title === after.title) return;
  if (before.title === null) {
    out.push(change("title", "added", {}, null, after.title, `Title added: ${after.title}`));
  } else if (after.title === null) {
    out.push(change("title", "removed", {}, before.title, null, "Title removed"));
  } else {
    out.push(
      change("title", "changed", {}, before.title, after.title, `Title: ${before.title} → ${after.title}`),
    );
  }
}

// Properties align by `key` (last value wins on a duplicate key, as the reader
// resolves them). Iterated in model order: before's keys first, then after's
// new keys. "key: G → A", "capo added: 2", "capo removed".
function diffProperties(before, after, out) {
  const bmap = new Map();
  for (const { key, value } of before.properties) bmap.set(key, value);
  const amap = new Map();
  for (const { key, value } of after.properties) amap.set(key, value);

  const order = [];
  const seen = new Set();
  for (const { key } of before.properties) {
    if (!seen.has(key)) { seen.add(key); order.push(key); }
  }
  for (const { key } of after.properties) {
    if (!seen.has(key)) { seen.add(key); order.push(key); }
  }

  for (const key of order) {
    const had = bmap.has(key);
    const has = amap.has(key);
    const bv = bmap.get(key);
    const av = amap.get(key);
    if (had && !has) {
      out.push(change("property", "removed", { key }, bv, null, `${key} removed`));
    } else if (!had && has) {
      out.push(change("property", "added", { key }, null, av, `${key} added: ${av}`));
    } else if (had && has && bv !== av) {
      out.push(change("property", "changed", { key }, bv, av, `${key}: ${bv} → ${av}`));
    }
  }
}

// Chord changes within one matched section. Bars align by position within the
// section; the chords within a bar align positionally too. Located by the
// measure's bar number in an unsung document ("Verse bar 5: G7 → D♭7"), or by
// section alone in a sung document, which has no bar numbers ("Chorus: G →
// Em").
function diffSectionChords(secBefore, secAfter, name, numbered, out) {
  const before = sectionBars(secBefore);
  const after = sectionBars(secAfter);

  const emit = (bsym, asym, bar) => {
    if (bsym === undefined && asym === undefined) return;
    const loc = numbered && bar !== null ? `${sectionLabel(name)} bar ${bar}` : sectionLabel(name);
    if (bsym === undefined) {
      out.push(change("chord", "added", { section: name, bar }, null, asym, `${loc}: ${asym} added`));
    } else if (asym === undefined) {
      out.push(change("chord", "removed", { section: name, bar }, bsym, null, `${loc}: ${bsym} removed`));
    } else if (bsym !== asym) {
      out.push(change("chord", "changed", { section: name, bar }, bsym, asym, `${loc}: ${bsym} → ${asym}`));
    }
  };

  const nBars = Math.max(before.length, after.length);
  for (let i = 0; i < nBars; i++) {
    const b = before[i];
    const a = after[i];
    const bsyms = b ? b.symbols : [];
    const asyms = a ? a.symbols : [];
    const bar = numbered ? (a ? a.number : b.number) : null;
    const n = Math.max(bsyms.length, asyms.length);
    for (let j = 0; j < n; j++) emit(bsyms[j], asyms[j], bar);
  }
}

// Words are coarse: a section whose sung/lyric text differs reports "Verse
// words changed" (workflow 6 line 44). The exact wording is the line diff
// behind *Show the text*, not this summary.
function diffSectionWords(secBefore, secAfter, name, out) {
  const before = sectionWords(secBefore);
  const after = sectionWords(secAfter);
  if (before === after) return;
  out.push(change("words", "changed", { section: name }, before || null, after || null, `${sectionLabel(name)} words changed`));
}

// A content signature for rename detection: two sections are "the same section
// renamed" when their chords and words are identical.
function sectionSig(section) {
  return JSON.stringify({ bars: sectionBars(section), words: sectionWords(section) });
}

// Sections align by name occurrence in order (Decision 5): the i-th "Verse"
// before pairs with the i-th "Verse" after. Unmatched after = added; unmatched
// before = removed; an unmatched pair with identical content = renamed; the
// same name multiset in a different order = reordered. Section ops and each
// matched section's chord/words changes are emitted in document order.
function diffSections(before, after, numbered, out) {
  const bs = before.sections;
  const as = after.sections;

  const usedAfter = new Set();
  const matchOf = new Map(); // after index -> before index (same name)
  const unmatchedBefore = [];
  for (let bi = 0; bi < bs.length; bi++) {
    let found = -1;
    for (let ai = 0; ai < as.length; ai++) {
      if (usedAfter.has(ai)) continue;
      if (as[ai].name === bs[bi].name) { found = ai; break; }
    }
    if (found >= 0) { usedAfter.add(found); matchOf.set(found, bi); }
    else unmatchedBefore.push(bi);
  }
  const unmatchedAfter = [];
  for (let ai = 0; ai < as.length; ai++) if (!usedAfter.has(ai)) unmatchedAfter.push(ai);

  // Rename pairing: an unmatched before section whose content equals an
  // unmatched after section's. Earliest wins, deterministically.
  const renameOf = new Map(); // after index -> before index (renamed)
  const removedBefore = [];
  const remainingAfter = new Set(unmatchedAfter);
  for (const bi of unmatchedBefore) {
    const sig = sectionSig(bs[bi]);
    let hit = -1;
    for (const ai of unmatchedAfter) {
      if (!remainingAfter.has(ai)) continue;
      if (sectionSig(as[ai]) === sig) { hit = ai; break; }
    }
    if (hit >= 0) { renameOf.set(hit, bi); remainingAfter.delete(hit); }
    else removedBefore.push(bi);
  }
  const addedAfter = new Set(remainingAfter);

  // Reorder: when nothing was added, removed or renamed (the name multiset is
  // unchanged) but the matched order is not monotonic.
  if (addedAfter.size === 0 && removedBefore.length === 0 && renameOf.size === 0) {
    let last = -1;
    let reordered = false;
    for (let ai = 0; ai < as.length; ai++) {
      const bi = matchOf.get(ai);
      if (bi === undefined) continue;
      if (bi < last) { reordered = true; break; }
      last = bi;
    }
    if (reordered) {
      out.push(
        change("section", "reordered", {}, bs.map((s) => s.name), as.map((s) => s.name), "Sections reordered"),
      );
    }
  }

  // Walk after-sections in document order.
  for (let ai = 0; ai < as.length; ai++) {
    const sec = as[ai];
    if (addedAfter.has(ai)) {
      out.push(change("section", "added", { section: sec.name }, null, sec.name, `Section added: ${sectionLabel(sec.name)}`));
    } else if (renameOf.has(ai)) {
      const old = bs[renameOf.get(ai)].name;
      out.push(
        change("section", "renamed", { section: sec.name }, old, sec.name, `Section renamed: ${sectionLabel(old)} → ${sectionLabel(sec.name)}`),
      );
    } else if (matchOf.has(ai)) {
      const secBefore = bs[matchOf.get(ai)];
      diffSectionChords(secBefore, sec, sec.name, numbered, out);
      diffSectionWords(secBefore, sec, sec.name, out);
    }
  }

  // Removed sections, in before document order, after the surviving ones.
  for (const bi of removedBefore) {
    const name = bs[bi].name;
    out.push(change("section", "removed", { section: name }, name, null, `Section removed: ${sectionLabel(name)}`));
  }
}

function arrEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function voicingEqual(a, b) {
  return arrEqual(a.frets, b.frets) && arrEqual(a.fingers || null, b.fingers || null);
}

// A voicing block's identity-by-sound-and-variation (DIRECTION / Decision 5):
// `(tuning.id, label)`. The displayed name is the as-written `tuning.text`.
function blockKey(block) {
  return `${block.tuning.id}\u0000${block.label}`;
}

// Voicings align by block `(tuning.id, label)`, then within a block by voicing
// `key`. A whole new block reads "added voicings for G4 C4 E4 A4"; a changed
// voicing names the chord — "voicings for G4 C4 E4 A4: Cm changed".
function diffVoicings(before, after, out) {
  const beforeBlocks = new Map();
  for (const block of before.blocks) beforeBlocks.set(blockKey(block), block);
  const afterKeys = new Set(after.blocks.map(blockKey));

  for (const block of after.blocks) {
    const prev = beforeBlocks.get(blockKey(block));
    const text = block.tuning.text;
    if (!prev) {
      out.push(change("voicing", "added", { tuning: text, variation: block.label }, null, null, `added voicings for ${text}`));
      continue;
    }
    const prevByKey = new Map();
    for (const v of prev.voicings) prevByKey.set(v.key, v);
    const nowByKey = new Map();
    for (const v of block.voicings) nowByKey.set(v.key, v);

    for (const v of prev.voicings) {
      const now = nowByKey.get(v.key);
      if (!now) {
        out.push(change("voicing", "removed", { tuning: text, variation: block.label, key: v.key }, v.frets, null, `voicings for ${text}: ${v.symbol} removed`));
      } else if (!voicingEqual(v, now)) {
        out.push(change("voicing", "changed", { tuning: text, variation: block.label, key: v.key }, v.frets, now.frets, `voicings for ${text}: ${now.symbol} changed`));
      }
    }
    for (const v of block.voicings) {
      if (prevByKey.has(v.key)) continue;
      out.push(change("voicing", "added", { tuning: text, variation: block.label, key: v.key }, null, v.frets, `voicings for ${text}: ${v.symbol} added`));
    }
  }

  for (const block of before.blocks) {
    if (afterKeys.has(blockKey(block))) continue;
    const text = block.tuning.text;
    out.push(change("voicing", "removed", { tuning: text, variation: block.label }, null, null, `removed voicings for ${text}`));
  }
}

/**
 * Compare two parsed song models and report what changed, in musical terms.
 *
 * @param {object} before - the earlier model (last saved, prior version).
 * @param {object} after - the later model (working copy, newer version).
 * @returns {{ changes: object[], summary: string }} an ordered list of change
 *   records `{ kind, op, where, before, after, text }`, and the `text` of each
 *   joined with "; " on one line (empty string when nothing changed). Ordering
 *   is deterministic: title, properties (model order), sections (document
 *   order, each with its chord then words changes), then voicing blocks (model
 *   order), so the summary is reproducible.
 */
export function diff(before, after) {
  const changes = [];
  const numbered = !before.sung && !after.sung;
  diffTitle(before, after, changes);
  diffProperties(before, after, changes);
  diffSections(before, after, numbered, changes);
  diffVoicings(before, after, changes);
  const summary = changes.map((c) => c.text).join("; ");
  return { changes, summary };
}
