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

**Metadata.** The optional title and property list at the top of the
document (§1.3).

**Chart.** The first part of the document: everything from the start (after
any metadata) to the rule. The chart is the song as music, independent
of any instrument.

**Rule.** A line of three or more hyphens that ends the chart (§1.5).

**Voicings part.** Everything after the rule: the voicing blocks (§7).

**Section.** A named division of the chart, opened by a heading: *Intro*,
*Verse*, *Chorus* (§1.6).

**Fence.** A Markdown fenced code block. In the chart, the music of a
section is written inside fences (§1.8).

**Notes.** Text in the chart outside any fence. Kept, never interpreted
(§1.8).

**Line.** One line of text. Every line inside a fence is a cifra-style
heading, a chord line, a lyric line, or blank; every line outside one is a
heading, a fence, the rule, or notes (§1.4).

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

A reader produces this structure. Its normative shape is the JSON Schema in
`schema/cifra.schema.json`; the sketch below is the same thing in prose. An
implementation may represent it however it likes, but a conforming reader
must be able to produce it as JSON, and a canonical writer (§8) must be able
to take that JSON back.

```
Document
  title           from the level-1 heading, or none
  properties      key → value, from the property list
  sections[]      in document order
  blocks[]        voicing blocks, in document order

Section
  name            text of the heading, "" for music before any heading
  anchor?         bar number stated on the heading
  lines[]         chord lines, sung lines and lyric lines, in order,
                  from every fence in the section
  notes           the text outside fences, verbatim

Line
  kind            "chart" | "sung" | "lyric" | "break"
  measures[]      (chart, sung) one or more measures
  closeBar        (chart, sung) the bar line after the last measure, if any
  times?          (chart, sung) the line's repeat count (§3.3)
  forced          (sung, lyric) whether the words carried a `>` marker
  text            (lyric) the words

Measure
  bar             the bar line before this measure, if any
  column?         (sung) column of that bar line
  anchor?         bar number stated in this measure
  number?         bar number, counted (chart lines in an unsung document)
  stated?         whether `number` was stated rather than counted
  items[]         in order

Item
  one of:
    Chord         symbol, index, key, chord (the §5.2 model), ambiguities?
    Repeat        the % sign
    NoChord       the N.C. mark (§2.6)
    Mark          open or close of a repeat group (§3.2), and its notation
    Count         a repeat count, x2 (§3.3)
    Ending        an ending marker, 1. (§3.4)
    Unknown       a token that is not a chord; text
    Lead          (sung only) words before the first item
  column?, words? on every item of a sung line (§4.4)

Block
  label           variation name, "" for the default variation
  tuning          text as written, pitches, and identity by sound (§6.3)
  voicings[]      key, symbol, index, frets; in canonical order (§8.3)
  notes[]         the lines that are not list items, verbatim

Document also carries `sung` (§4.2) and `diagnostics`: everything the
reader had to report, each with a code and a line number.
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
- Music outside a fence is not music (§1.8). A writer MUST fence every
  chord line and lyric line it emits.

## 0.6 Processing order

A reader classifies lines in a fixed order, because several constructs could
otherwise claim the same line. The order is:

1. The title and properties (§1.3), only at the very start of the
   document.
2. Fences (§1.8). A fence opens a run of music that ends at the next
   fence; nothing inside it is a Markdown heading, the rule or notes.
3. Outside a fence: the rule (§1.5), and the first rule ends the chart.
4. Outside a fence, in the chart: a Markdown heading (§1.6.1) opens a
   section. Any other line is notes (§1.8).
5. Inside a fence, in the chart: a bracket or label heading (§1.6.2,
   §1.6.3) opens a section. Otherwise the line is a chord line, a lyric
   line or blank (§2, §4), decided after the whole chart has been read
   (§4.2).
6. In the voicings part: a Markdown heading opens a voicing block (§7.2).
   A list item belongs to the current block (§7.4), or is an error if
   there is none. Any other line is notes.

Within a chord line, tokens are read left to right and classified in the
order given in §2.3. Repeat groups are paired after the section's lines
have been read (§3.2).

## Open questions

- Whether `###` should nest sections. Reserved; see §1.6.1.
