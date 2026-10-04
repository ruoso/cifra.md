# Reference corpus

The corpus has two kinds of entry: reading entries, here, which pin the
reader and the canonical writer, and merge entries, in `merge/`, which pin
the merge (see [Merge entries](#merge-entries)).

Each reading entry is a directory with four files:

| File | What it is | Made by |
|---|---|---|
| `input.cifra.md` | A document as someone might write it: uncanonical spacing, mixed conventions, mistakes a reader must survive. | Hand |
| `input.parsed.json` | The model a conforming reader produces from `input.cifra.md`, diagnostics included. It is what an application has in hand before it saves: the diagnostics are what it can tell the author that canonicalising will drop. | Generated |
| `canonical.cifra.md` | The canonical text (spec §8) of that model: what a conforming writer saves. | Generated |
| `parsed.json` | The model a conforming reader produces from `canonical.cifra.md`, diagnostics included: the model of the canonical form, and what any reader gets from the file once it has been saved. | Generated |

A reader lays out every sung line as canonical form writes it (spec
§4.5), so the two JSON files agree on every sung line's columns and words
however the input was spaced. Where canonicalising changes the model, the
two JSON files differ, and the difference is the change: a problem item or
a list item that is not a property is gone, an unused voicing or an empty
fingering is dropped, footnote markers are merged and renumbered (§8.3),
with any sung line whose token that changed laid out again, and
diagnostics that only the uncanonical input could produce are absent.
Line numbers in diagnostics and in `sungAt` are those of the file each
model was read from. Nothing else may differ between them.

An implementation validates itself by checking, for every entry:

1. Reading `input.cifra.md` gives `input.parsed.json`.
2. Writing `input.parsed.json` gives `canonical.cifra.md`.
3. Reading `canonical.cifra.md` gives `parsed.json`.
4. Writing `parsed.json` gives `canonical.cifra.md`. With check 3, the
   cycle from canonical text to model and back is closed in both
   directions, which is what makes the canonical form a fixed point.
5. Both JSON files are valid against
   [`schema/cifra.schema.json`](../schema/cifra.schema.json).

Texts compare byte for byte. Models compare exactly: the same keys with
the same values, arrays in the same order (the order of `properties` is
part of the model), nothing normalised. The JSON files are written with a
two-space indent, characters outside ASCII as themselves, and a final
newline, and the reference implementation checks that its own
serialisation of each model matches them byte for byte.

The reference implementation's checks are `reference/tests/test_corpus.py`.
It adds a sixth, for its own model-level canonicalisation: applying it to
`input.parsed.json` gives `parsed.json`, apart from `sungAt` and
`diagnostics`, which describe a text rather than a model.

The generated files are made by the reference implementation from
`input.cifra.md`, then reviewed. To add an entry, write its
`input.cifra.md`, run `python -m tools.corpus --write` in `reference/`,
and read what came out before committing it. `python -m tools.corpus
--check` reports any entry whose files disagree with the implementation.

## Entries

| Entry | Shows |
|---|---|
| 01 to 20 | The format chapter by chapter: charts, metadata, line ends, words, voicings, variations, repeats, bar numbers, notes, unknown tokens, diagnostics, ambiguities, sung lines with bars, heading levels, an unclosed fence, unheaded music, chord spellings, `N.C.`, an unfenced paste, cifra conventions |
| 21-blank-lines-in-fences | Which blank lines are kept as breaks, and how runs collapse |
| 22-repeat-marks-and-counts | Close marks before counts, marks on bar lines, marks outside any measure |
| 23-fence-lengths | Fences long enough for what they hold; info strings |
| 24-footnote-invariants | `[0]`, `[02]`, and I1, I3 and I2 on a chart and a sung line |
| 25-headings | Levels, closing sequences, spacing, anchors and counts, empty headings |
| 26-text-layer | Lone CRs, tabs, NFC, U+FEFF inside a line, a no-break space |
| 27-properties | Key case, order, repeated keys, empty values, items that are not properties |
| 28-sung-line-layout | Tokens that grow and shrink on a sung line, marks, anchors, the guard |
| 29-voicings-part | What canonicalising drops after the rule, label and tuning spelling, merged blocks |
| 30-title-only | A document that is only its title |
| 31-empty | A document with nothing in it, which is the empty file |
| 32-unclosed-verbatim | An unclosed verbatim fence and the blank lines after it |
| 33-sung-anchors | Bar anchors on sung lines kept at their columns: against bar lines and brackets, the last of several, past a token that grows, and numbers carried in from an anchor-only line and from the end of the line before |
| 34-pushed-words | Sung lines whose words are pushed so that every chord stays over its character: brackets, a token that grows, `_` padding inside words (one, several, two in one word), padding written in excess or too little, underscores that are words, a chord line longer than its words, a carried anchor with no room, and words forced because they would read as chords without their padding |

## Merge entries

The merge of spec §11 is pinned by the entries in `merge/`, one directory
each. An entry holds the three inputs of a merge, and the outcome it must
give:

| File | What it is | Made by |
|---|---|---|
| `base.cifra.md`, `ours.cifra.md`, `theirs.cifra.md` | The three inputs. A missing file is an absent input (spec §11.4). For a setlist, `.setlist.md`, and the entry is merged as a setlist. | Hand |
| `result.cifra.md` | The result, when the merge gives one: a canonical text. For a setlist, `result.setlist.md`. | Generated |
| `result.deleted` | An empty file, when the merge deletes the file. | Generated |
| `conflicts.json` | The conflicts, as spec §11.12.5 writes them, when there are any. | Generated |
| `marked.cifra.md` | The marked text (spec §11.12.2), when a conflict has a region. For a setlist, `marked.setlist.md`. | Generated |
| `asymmetric` | An empty file, in an entry whose conflicts number footnote variants under the one exception to symmetry (spec §11.9.5). | Hand |

Exactly one of the result, `result.deleted` and `conflicts.json` is
present. Inputs need not be canonical, one of them need not be UTF-8, and
any of them may be a marked text, which the merge does not merge (spec
§11.4): such an entry holds only `conflicts.json`, with its `unresolved`
conflict, and no marked text, since what the merge leaves is the entry's
ours, as it is.

An implementation validates its merge by checking, for every entry:

1. Merging base, ours and theirs gives the expected files, byte for byte,
   and no other.
2. Merging base, theirs and ours gives the same result or deletion; or
   the expected conflicts with every `ours` and `theirs` member, and every
   `"ours"` and `"theirs"` value, exchanged, and the expected marked text
   with the two sides of every region exchanged. An entry marked
   `asymmetric` skips this check.
3. The result is canonical.
4. Resolving every region of the marked text by ours, and every one by
   theirs (spec §11.12.4), gives a text with no marker line, whose
   canonical form is a fixed point.

and, generated from the files rather than stored: merging *b*, *x*, *x*,
*b*, *b*, *x* and *b*, *x*, *b* gives the canonical text of *x*, for each
readable input of the entry that holds no marker line as *b* and as *x*.

The reference implementation's checks are
`reference/tests/test_merge_corpus.py`, and
`reference/tests/test_merge_examples.py` holds every text the examples of
spec §11.15 show to the files of the entries below. `python -m
tools.corpus --write` writes the expected files of the merge entries too,
and `--check` checks them.

| Entry | Shows |
|---|---|
| 01 to 25 | The examples of spec §11.15, one each, and the alternatives their text describes: different sections, a rename and an edit (§11.15.1); one line changed twice, and two lines once each (§11.15.2); a section deleted and changed, and one renamed and edited (§11.15.3); a sung line changed twice, and two sung lines once each (§11.15.4); two instruments with two new markers, and with one (§11.15.5); a renumbered marker (§11.15.6); a line changed under a new marker (§11.15.7); two shapes for one chord, and for two instruments (§11.15.8); a bar split off with its chord revoiced elsewhere, and not (§11.15.9); a variation renamed and edited, deleted and edited, and variations added apart (§11.15.10); one tuning in two spellings (§11.15.11); properties added, a property given two values, and a `reading` conflict on `notation` (§11.15.12); a song added on both sides (§11.15.13); a setlist reordered and added to, and one whose item was removed and changed (§11.15.14) |
| 26 to 28 | The example of spec §11.15.18 and its alternatives: a marked ours, a marked base, and a marked theirs as git writes one (its own labels, a `|||||||` section, a BOM and CR LF) against an unchanged ours, each an `unresolved` conflict |
| 30 to 38 | Whole files (spec §11.4): added by one side, by both alike, deleted by both, deleted by one side with the other's unchanged or only respelled, deleted against changed on either side, and an input that is not UTF-8 |
| 40-title-two-values | A `title` conflict |
| 41-reading-words | A `reading` conflict on `words` |
| 42-heading-two-fields | A heading changed in two fields by two sides, merged |
| 43-heading-two-names | A `heading` conflict |
| 44-bracket-heading-two-names | A `heading` conflict on a bracket heading, written as a `sections` region |
| 45-conflict-across-parts | A `chart` conflict holding fence units, written as a `sections` region |
| 46-variation-two-names | A `variation` conflict |
| 47-block-notes-two-changes | A `block-notes` conflict |
| 48-property-deleted-and-changed | A `property` conflict of presence |
| 50-renumbered-on-each-side | A pure renumbering on each side |
| 51-joined-and-revoiced | A key joined on one side and revoiced on the other |
| 52-key-of-unknown-tokens | A key used only by unknown tokens, merged by its text |
| 53-repeat-marks-and-inner-line | A repeat group's closing mark moved by one side and an inner line changed by the other |
| 54-words-pushed-by-merged-marker | A sung line whose words are pushed because the merged marker grew |
| 55-non-canonical-inputs | Inputs spelled every way canonical form does not keep |
| 56 to 58 | The examples of spec §11.15.17, §11.15.16 and §11.15.15: the only line of a chord deleted, one new chord added on both sides, a bar moved to an existing marker |
| 59-numbering-inside-a-conflict | Variants numbered inside a conflict, the exception to symmetry (marked `asymmetric`) |
| 60 to 64 | Setlists: two reorders of one stretch, the same song added twice, a notes block changed on both sides, `title`, `text` and `entry` conflicts, and entries merged under the title and under an item |
| 65-setlist-marked-side | A setlist whose theirs is a marked text: an `unresolved` conflict |
