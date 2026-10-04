# Reference corpus

Each entry is a directory with four files:

| File | What it is | Made by |
|---|---|---|
| `input.cifra.md` | A document as someone might write it: uncanonical spacing, mixed conventions, mistakes a reader must survive. | Hand |
| `input.parsed.json` | The model a conforming reader produces from `input.cifra.md`, diagnostics included. It is what an application has in hand before it saves: the diagnostics are what it can tell the author that canonicalising will drop. | Generated |
| `canonical.cifra.md` | The canonical text (spec §8) of that model: what a conforming writer saves. | Generated |
| `parsed.json` | The model a conforming reader produces from `canonical.cifra.md`, diagnostics included: the model of the canonical form, and what any reader gets from the file once it has been saved. | Generated |

Where canonicalising changes the model, the two JSON files differ, and the
difference is the change: a problem item or a list item that is not a
property is gone, footnote markers are merged and renumbered (§8.3), a
sung line's columns have moved where a token changed width (§8.4.5), and
diagnostics that only the uncanonical input could produce are absent.
Line numbers in diagnostics and in `sungAt` are those of the file each
model was read from.

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
