# 0. Overview

## 0.1 Scope

cifra.md is a plain-text format for a song's chord chart, its words if it has
them, and the fingerings chosen for its chords on one or more fretted string
instruments.

It is designed to be:

- written by hand, the way a musician already writes a chart or a cifra;
- read by a program, without ambiguity about where a bar starts, which chord
  is in it, or which shape that chord takes on a given instrument;
- valid Markdown, so a document is readable anywhere Markdown is.

It does **not** notate melody, rhythm within a bar, or voice leading. A bar
with two chords in it says the bar is divided between them and nothing about
how. Those are deliberately outside this format.

## 0.2 Conformance language

The key words MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, MAY and OPTIONAL
are to be read as in RFC 2119.

Two kinds of implementation are addressed. A **reader** turns a document into
the structure described here. A **writer** produces or edits documents. Most
requirements fall on readers; section 7 is for writers. Section 8 defines
conformance profiles.

Throughout, "a reader MUST accept" means the construct is part of the format
and a conforming reader recognises it. "A writer MUST emit" means the
canonical spelling, which a writer producing a document uses even where a
reader would accept more.

## 0.3 Terms

**Document.** One file, one song.

**Front matter.** An optional block of metadata at the top of the document
(§1.3).

**Chart.** The first part of the document: everything from the start (after
any front matter) to the rule. The chart is the song as music, independent
of any instrument.

**Rule.** A line of three or more hyphens that ends the chart (§1.5).

**Voicings part.** Everything after the rule: the voicing blocks (§7).

**Section.** A named division of the chart, opened by a heading: *Intro*,
*Verse*, *Chorus* (§1.6).

**Line.** One line of text. Every line in the chart is a heading, a chord
line, a lyric line, or blank (§1.4).

**Chord line.** A line whose content is chords and chart punctuation (§2).

**Lyric line.** A line of words (§4). A chord line directly above a lyric
line is *sung*: its chords are placed over the words by column.

**Measure** or **bar.** A unit of a chord line, delimited by bar lines (§2.2).

**Chord token.** One chord as written in the chart: a chord symbol, optionally
followed by a footnote marker (§2.3).

**Chord symbol.** The spelling of a chord: `Cm7`, `G/B`, `F#°` (§5).

**Footnote marker.** `[2]`, `[3]` and so on after a symbol, saying this
occurrence is played a second or third way (§2.4).

**Voicing key.** A chord symbol together with its footnote index: `Cm` or
`Cm[2]`. The thing a voicing block maps to a shape (§7.4).

**Occurrence.** One chord token at one place in the chart.

**Repeat group.** A run of measures played more than once, enclosed in
`|:` `:|` or round brackets, optionally with a count and endings (§3).

**Tuning.** The open-string pitches of an instrument, low string first as
written (§6).

**Voicing block.** A block in the voicings part giving, for one tuning and
one variation, the shape of each voicing key (§7.2).

**Variation.** One of several named sets of voicings for the same tuning
(§7.3).

**Fret string.** A shape written as frets, one per string: `x32010` (§7.5).

**Notation dialect.** One of the conventions for spelling chord symbols:
Brazilian cifra, American jazz, Real Book. Most spellings mean the same in
every dialect; three do not (§5.6).

## 0.4 The document model

A reader produces this structure. Names are given for reference; an
implementation may represent them however it likes, but a conforming reader
must be able to answer every question the model answers.

```
Document
  metadata        key → value, from front matter
  sections[]      in document order
  blocks[]        voicing blocks, in document order

Section
  name            text of the heading, "" for text before any heading
  anchor?         bar number stated on the heading
  lines[]         chord lines, sung lines and lyric lines, in order

Line
  kind            "chart" | "sung" | "lyric" | "break"
  measures[]      (chart, sung) one or more measures
  text            (lyric) the words

Measure
  anchor?         bar number stated in this measure
  number?         bar number, counted (chart lines in an unsung document)
  items[]         in order

Item
  one of:
    Chord         symbol, index, key, text (as written), words?, valid
    Repeat        the % sign; words?
    Mark          open or close of a repeat group (§3.2); words?
    Count         a repeat count, x2 (§3.3); words?
    Ending        an ending marker, 1. (§3.4); words?
    Unknown       a token that is not a chord; text; words?

Block
  tuning          the pitches, as parsed
  tuningText      the tuning as written on the heading
  variation       name, "" for the default variation
  voicings        key → frets
  problems[]      lines in the block that could not be read
```

`words` is present only on items of a sung line: the syllables under that
item, up to the next item's column (§4.4).

Two cross-cutting facts about the document, both derivable from the model:

- **Is it sung?** A document is sung if any chord line is immediately
  followed by a lyric line, or any line is explicitly marked as words (§4.2).
- **Which voicing keys does the chart use?** The set of `key` over every
  chord occurrence, in first-seen order. This is what the voicing blocks are
  expected to cover, and what normalisation (§8) is computed from.

## 0.5 Markdown compatibility

A cifra.md document is a CommonMark document. The format uses only these
Markdown constructs, and gives each its ordinary meaning:

| Construct | Markdown | cifra.md |
|---|---|---|
| `# Name` | ATX heading | Section heading, or voicing block heading after the rule |
| `---` on its own line, after a blank line | Thematic break | The rule between chart and voicings |
| `---` as the first line | Front matter (common extension) | Front matter |
| `> words` | Block quote | A line forced to be read as words |
| Everything else | Paragraph text | Chord lines, lyric lines, voicing lines |

This means a cifra.md document shown by a Markdown renderer is readable:
headings and the rule render as such, and the chords and words appear as
text. The renderer does not know a chart line from a lyric line, and
consecutive lines flow into one paragraph, so a Markdown render is a
fallback, not a chart.

Two consequences for writers:

- The rule MUST be preceded by a blank line. In Markdown, `---` directly
  under a line of text turns that text into a heading.
- A chord line SHOULD NOT begin with a Markdown block marker (`#`, `>`, `-`,
  `*`, `+`, a digit followed by `.` or `)`), since a renderer would read it
  as a heading, quote or list item. Chord symbols never start with these, so
  this only matters for a line that opens with an annotation.

## 0.6 Processing order

A reader classifies lines in a fixed order, because several constructs could
otherwise claim the same line. The order is:

1. Front matter (§1.3), only at the very start of the document.
2. The rule (§1.5). The first rule ends the chart.
3. In the chart: a heading (§1.6), in any of its three forms, opens a
   section. Otherwise the line is a chord line, a lyric line or blank (§2,
   §4), decided after the whole chart has been read (§4.2).
4. In the voicings part: a heading opens a voicing block (§7.2). Any other
   non-blank line belongs to the current block (§7.4), or is an error if
   there is none.

Within a chord line, tokens are read left to right and classified in the
order given in §2.3. Repeat groups are paired after the section's lines
have been read (§3.2).

## Open questions

- Whether a reader should expose heading level (`#` versus `##`). This
  draft says level is not significant.
