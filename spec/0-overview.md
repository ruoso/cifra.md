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
the structure described here. A **writer** produces or edits documents, and
always saves them in the one **canonical form** that section 8 defines byte
for byte. Most requirements fall on readers; section 8 is for writers.
Section 9 defines conformance profiles.

Throughout, "a reader MUST accept" means the construct is part of the format
and a conforming reader recognises it. Where a chapter says what a writer
writes, or what canonical form writes, it means the canonical spelling,
which §8 defines and a writer uses even where a reader would accept more.
Nothing in the canonical form is left to a writer's choice.

## 0.3 Terms

**Document.** One file, one song.

**Metadata.** The optional title and property list at the top of the
document (§1.4).

**Chart.** The first part of the document: everything from the start (after
any metadata) to the rule. The chart is the song as music, independent
of any instrument.

**Rule.** A line of three or more hyphens that ends the chart (§1.6).

**Voicings part.** Everything after the rule: the voicing blocks (§7).

**Section.** A named division of the chart, opened by a heading: *Intro*,
*Verse*, *Chorus* (§1.7).

**Fence.** A Markdown fenced code block. In the chart, the music of a
section is written inside fences (§1.9).

**Notes.** Text in the chart outside any fence. Kept, never interpreted
(§1.9).

**Canonical form.** The one text a document's model is written as (§8).
Reading keeps and reports everything; canonicalising may respell, reflow
and drop.

**Line.** One line of text. Every line inside a fence is a cifra-style
heading, a chord line, a lyric line, or blank; every line outside one is a
heading, a fence, the rule, or notes (§1.5).

**Chord line.** A line whose content is chords and chart punctuation (§2).

**Lyric line.** A line of words (§4). A chord line directly above a lyric
line is *sung*: each of its chords is attached to the character of the
words it is written over, and when a chord needs more room the words are
pushed, never the chord (§4.4, §4.5).

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
every dialect; four do not (§5.6).

## 0.4 The document model

A reader produces this structure. Its normative shape is the JSON Schema in
`schema/cifra.schema.json`; the sketch below is the same thing in prose. An
implementation may represent it however it likes, but a conforming reader
must be able to produce it as JSON, and a canonical writer (§8) must be able
to take that JSON back.

```
Document
  title           from the level-1 heading, or none
  properties[]    key and value, in order of first appearance
  sections[]      in document order
  blocks[]        voicing blocks, in document order

Section
  name            text of the heading, "" for music before any heading
  anchor?         bar number stated on the heading
  times?          count on the heading: the section is played n times
  heading         markdown, bracket, label, or none (§1.7)
  body[]          notes, music fences and verbatim fences, in order (§1.9)

Line
  kind            "chart" | "sung" | "lyric" | "break" | "annotation"
                  (a break is a run of blank lines between two lines, §4.6)
  run?            (chart) the line has no bar lines: a run of chords (§2.1)
  measures[]      (chart, sung) one or more measures
  closeBar        (chart, sung) the bar line after the last measure, if any
  times?          (chart, sung) the line's repeat count (§3.3)
  forced          (sung, lyric) whether the words carried a `>` marker
  text            (lyric) the words

Measure
  bar             the bar line before this measure, if any
  column?         (sung) column of that bar line, as laid out (§4.5)
  anchor?         bar number stated in this measure
  anchorColumn?   (sung) column of that anchor, as laid out (§2.8, §4.5)
  number?         bar number, counted (chart lines in an unsung document)
  stated?         whether `number` was stated rather than counted
  items[]         in order

Item
  one of:
    Chord         symbol, index, key, chord (the §5.2 model), ambiguities?
    Repeat        the % sign
    NoChord       the N.C. mark (§2.6)
    Beat          a beat mark, / . or - (§2.3)
    Mark          open or close of a repeat group (§3.2), and its notation
    Count         a repeat count, x2 (§3.3)
    Ending        an ending marker, 1. (§3.4)
    Unknown       a token that is not a chord; text
    Lead          (sung only) words before the first attached item
  column?         on every item of a sung line, as laid out (§4.5)
  words?          on the lead and on each item of a sung line that makes
                  a measure, the items attached to the words (§4.4)

Block
  label           variation name, "" for the default variation
  tuning          text as written, pitches, and identity by sound (§6.3)
  voicings[]      key, symbol, index, frets, fingers?; in canonical order (§8.4.6)
  notes[]         the lines that are not list items, verbatim

Document also carries `sung` and `sungAt`, the line that made it sung
(§4.2), and `diagnostics`: everything the
reader had to report, each with a code and a line number.
```

`words` is present only on items of a sung line that are attached to the
words: the syllables under that item, up to the next attached item's
column (§4.4). The line of words is not stored apart: it is the lead's
words and the items' words in column order, with the gaps between them
filled with `_` padding inside a word (§4.5.2). The model holds a sung
line as laid out (§4.5): its columns and words are those of the
canonical form, whatever spacing the text was written with.

Two cross-cutting facts about the document, both derivable from the model:

- **Is it sung?** A document is sung if any chord line is immediately
  followed by a lyric line, or any line is explicitly marked as words (§4.2).
- **Which voicing keys does the chart use?** The set of `key` over every
  chord occurrence, in first-seen order. This is what the voicing blocks are
  expected to cover, and what the footnote invariants (§8.3) are computed
  from.

## 0.5 Markdown compatibility

A cifra.md document is a CommonMark document. The format uses only these
Markdown constructs, and gives each its ordinary meaning:

| Construct | Markdown | cifra.md |
|---|---|---|
| `# Name` as the first line | ATX heading, level 1 | The song's title |
| `- key: value` under the title | Bullet list | A property |
| `## Name` | ATX heading | Section heading, or voicing block heading after the rule |
| ```` ``` ```` fenced block | Code block | The music of a section: chord lines and lyric lines |
| `---` on its own line, after a blank line | Thematic break | The rule between chart and voicings |
| `- Cm: x35543` after a block heading | Bullet list | A voicing |
| Everything else | Paragraph text | Notes, kept and not interpreted |

This means a cifra.md document shown by a Markdown renderer is readable,
and more than readable: the title and sections make an outline, the music
is set in a monospaced block that keeps every chord over the syllable it
was written over, the voicings are a list, and notes are prose. What the
renderer does not know is which lines are chords and which are words, or
what a shape looks like; that is what a cifra.md reader adds.

Two consequences for writers:

- The rule MUST be preceded by a blank line. In Markdown, `---` directly
  under a line of text turns that text into a heading.
- Music outside a fence is not music (§1.9). A writer MUST fence every
  chord line and lyric line it emits.

## 0.6 Processing order

A reader first prepares the text (§1.3): every U+FEFF removed, NFC, lines,
tabs, trailing spaces. It then classifies lines in a fixed order, because
several constructs could otherwise claim the same line. The order is:

1. The title and properties (§1.4), only at the very start of the
   document.
2. Fences (§1.9). A fence opens a run of music that ends at the next
   fence; nothing inside it is a Markdown heading, the rule or notes.
3. Outside a fence: the rule (§1.6), and the first rule ends the chart.
4. Outside a fence, in the chart: a Markdown heading (§1.7.1) opens a
   section. Any other line is notes (§1.9).
5. Inside a fence, in the chart: a bracket or label heading (§1.7.2,
   §1.7.3) opens a section; what follows a bracket heading on its line is
   classified again from this step. Otherwise the line is an annotation, a
   chord line, a lyric line or blank (§2, §4), decided after the whole
   chart has been read (§4.2).
6. In the voicings part: a Markdown heading opens a voicing block (§7.2).
   A list item belongs to the current block (§7.4), or is an error if
   there is none. Any other line is notes.

Within a chord line, tokens are read left to right and classified in the
order given in §2.3. Repeat groups are paired after the section's lines
have been read (§3.2).

## Open questions

None that block this version. Each chapter ends with the questions it
leaves for a later version, each with the syntax it would use reserved or
reading harmlessly today.
