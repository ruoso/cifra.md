# Appendix B. Differences from the reference implementation

Informative. explore-chords implements this format and is where it grew up,
but its parser evolved with the application rather than from a written
plan. This draft was written from the semantics, and departs from the
current parser in the places below. Each item is a change to make there, or
a decision to revisit here.

| # | Topic | This draft | explore-chords today |
|---|---|---|---|
| 1 | Notation dialect | Declared by the `notation` property; default `brazilian` (§1.3.3) | An application preference, not in the text |
| 2 | Title and properties | Level-1 heading as the first line, then a `- key: value` list (§1.3) | Title kept outside the text; a leading `# Title` would be read as a section |
| 2a | Heading levels | `#` is the title; sections and blocks are `##` (§1.6.1) | Level ignored; sections are written `#` |
| 3 | Block heading recognition | By position: every `#` heading after the rule is a block; label, colon, tuning (§7.2) | Anywhere in the document, by whether the heading text names a tuning; `for`, `(`, `-`, `–` accepted as separators |
| 4 | Heading after the rule that is not a block | Error; its lines are skipped | Opens a chart section, whose lines are read as chart |
| 5 | The rule | The first rule ends the chart; later rules ignored (§1.5) | Every rule closes the current section or block; chart can continue after one |
| 6 | Tuning identity | By sounding pitch; `Eb2` = `D#2` (§6.3) | By uppercased text; `Eb2` ≠ `D#2` |
| 7 | Fret string length | Must equal the string count; else a problem (§7.5) | Not checked at parse time |
| 8 | Bar-line forms | `\|\|`, `\|:`, `:\|`, `:\|\|` are bar lines (§2.2) | `\|\|` works by accident (empty measures dropped); a `:` becomes an unknown token |
| 8a | Repeat groups | Paired, with counts and endings; expansion defined (§3) | Brackets kept as marks with no pairing; `x2` and `1.` are unknown tokens |
| 8b | `%` beside other items | Reported | Kept silently |
| 9 | Lines containing a bar line | Always chord lines (§4.1) | Classified by word ratio like any other line |
| 10 | Two blocks, same tuning and name | Read as one; later line wins (§7.3) | Reading uses the first only; writing merges |
| 11 | Columns on sung lines | Counted in code points (§4.4) | UTF-16 code units; identical outside the supplementary planes |
| 12 | Block order when writing | First appearance of the tuning, default variation first (§8.3) | Sorted by normalised tuning text, then name |
| 13 | Voicing line spacing | Canonical `key = frets` with single spaces; any whitespace accepted | Same |
| 14 | Lowercase root letters | Readers MAY accept; writers use uppercase (§5.1.1) | Accepted |
| 15 | Legacy `# Tuning` and unlabelled `# Voicings` | Appendix A: MAY accept, convert on save | Accepted and migrated on load |
| 16 | Bracket heading with digits only | Never a heading (§1.6.2) | Same |
| 17 | `[1]` | Equals the bare key; never written (§2.4) | Same |
| 18 | Bar anchors | Same rules (§2.7) | Same |
| 19 | Unknown tokens | Kept, reported (§2.8) | Same |
| 20 | Section with no lines | Kept (§1.7) | Kept when named |

Items 1 to 10, 2a, 8a, 8b and 12 are behavioural changes the reference parser would
need to make to conform. Items 11 and 13 to 20 are confirmations.

## Decisions taken in this draft that the reference did not have to make

- A document without a rule has no voicings part. The reference let blocks
  appear anywhere because it recognised them by content; this draft trades
  that flexibility for a heading grammar with no heuristic in it.
- The label of a block heading is the variation's name, full stop. The
  reference arrived at the same place (its §2.13) but by repurposing a
  label it had previously treated as a synonym.
- Bar-line forms are notation, not structure. Defining them costs nothing
  and stops `:|` from being an unknown token.
