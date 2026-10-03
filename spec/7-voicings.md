# 7. Voicings

Depends on: §0, §1, §2 (voicing keys), §6 (tunings).

The chart says which chords the song has. The voicings part says how each is
fingered, per instrument. It comes after the rule and is made of voicing
blocks, one per tuning and variation.

```
---

# Voicings: E2 A2 D3 G3 B3 E4
A     = x02220
Cm    = x35543
Cm[2] = 8-10-10-8-8-8

# Voicings: G4 C4 E4 A4
Cm = 0333
```

## 7.1 Why per tuning

A shape is meaningless without the tuning it is for: `x32010` is C on a
guitar in standard tuning and nothing in particular on anything else. So a
block is headed by its tuning, and a document carries one block (or several
variations, §7.3) per instrument it has been arranged for.

A document therefore fits every instrument. On one with no block, every
chord simply has no chosen shape, and the application shows whatever it
shows by default. Nothing needs "bringing across"; a song does not belong
to an instrument.

## 7.2 Voicing block headings

In the voicings part, every Markdown heading (§1.6.1) opens a voicing
block. Its text is:

```
Voicings: <tuning>
<name>: <tuning>
```

A label, a colon, and a tuning (§6.2). Whitespace around the colon is not
significant.

- The label `Voicings` (case-insensitive) names the **default variation**
  of that tuning (§7.3). It is the canonical label, and the one a writer
  emits for a block it creates.
- Any other label names a **variation** called by that label, as written:
  `# Simple: E2 A2 D3 G3 B3 E4` is a variation called *Simple*. The label
  may contain spaces. Leading and trailing whitespace is trimmed.
- The tuning MUST parse under §6.2. A heading whose text after the colon is
  not a tuning is an error; a reader MUST report it and MUST skip the lines
  that follow it up to the next heading, so that they are not attributed to
  the previous block.
- A heading with no colon is an error, handled the same way.

Because the block heading is recognised by its position after the rule and
not by its words, a section in the chart called `Voicings: something` is
just a section, and a block label may be any word in any language.

## 7.3 Variations

One instrument may want several sets of voicings for the same song: an easy
version for a student and a fuller one for the teacher, or two arrangements
kept side by side to compare. Each is a block for the same tuning with a
different label.

- The variation named by `Voicings` is the default; its name is the empty
  string.
- Variations do not inherit from one another. A block means exactly what it
  says. A key missing from a variation has no chosen shape in that
  variation, whatever another variation says.
- A document SHOULD NOT contain two blocks with the same tuning (§6.3) and
  the same name. If it does, a reader MUST read them as one block, in which
  a later line for a key replaces an earlier one.
- The order of blocks is the order written. The **first** block for a
  tuning is the one an application uses when no variation is chosen.
- An empty block (a heading with no lines) is a variation that exists and
  has nothing chosen in it yet. A reader MUST keep it.

## 7.4 Voicing lines

Every non-blank line in a block is a voicing line:

```
<key> = <fret string>
```

- `key` is a voicing key (§2.4): a chord symbol, optionally followed by a
  footnote marker. It MUST NOT contain whitespace, `=`, `[` or `]` except
  as the marker. `Cm[1]` is the key `Cm`.
- `=` with optional whitespace around it.
- A fret string (§7.5).

The symbol in a key is text, matched character for character against the
chart's tokens (§2.4). It is not required to parse as a chord, and a reader
MUST NOT validate it against §5; a block may name a chord the chart does not
use, and a key for an unknown token (§2.8) is as good as any other.

A line that is not of this form, or whose fret string does not parse or has
the wrong number of strings (§7.5), is a **problem**. A reader MUST skip it,
MUST report it with the text of the line, and MUST continue with the rest
of the block. A writer MUST NOT write problems back; see §8.

Keys within a block are unique. If a key repeats, the last line wins.

## 7.5 Fret strings

A fret string gives one fret per string, in tuning order (§6.2).

```
x32010          compact: one character per string
8-10-10-8-8-8   hyphenated: needed once any fret reaches 10
x-3-2-0-1-0     hyphenated with single digits, also valid
```

- Each position is `x` or `X` (the string is not played) or a fret number
  from 0 (open) to 99.
- The **compact** form is one character per string and can only express
  frets 0 to 9.
- The **hyphenated** form separates positions with `-`, and each position is
  `x` or one or two digits. A fret string containing any `-` is hyphenated
  throughout.
- The number of positions MUST equal the number of strings in the block's
  tuning. A reader MUST treat a mismatch as a problem (§7.4).

A writer MUST emit the compact form unless some fret is 10 or more, and the
hyphenated form otherwise. `x` is lowercase in both.

A fret string is a shape, not a fingering. Which finger goes where, and
whether a barre is used, is for the application to work out from the shape
and the instrument. This keeps the text to what a player would actually
write.

## 7.6 Resolving a chord to its shape

Given an occurrence in the chart and an instrument:

1. Find the block for the instrument's tuning (§6.3) and the variation in
   use; with no variation in use, the first block for the tuning (§7.3).
   None: the occurrence has no chosen shape.
2. Look up the occurrence's voicing key (§2.4) in that block. Absent: the
   occurrence has no chosen shape.
3. Otherwise the fret string found is the shape.

"No chosen shape" is a defined outcome, not an error. The application
supplies whatever default it likes (the easiest open-position shape, say)
and SHOULD show that it is a default. A reader MUST NOT fall back from
`Cm[2]` to `Cm`, from one variation to another, or from one tuning to
another: a footnoted variant on an instrument that has not chosen it is
simply unchosen there, which is the truth.

Defaults are never written into the document. A block holds what somebody
chose; writing defaults in would hide the choices among the guesses.

## 7.7 The legend

The **legend** of a document on an instrument is every voicing key the chart
uses that has a shape in that instrument's block, with its shape. The
**unvoiced** keys are those the chart uses that have none. Both are ordered
by symbol, then index (§8.3). A reader SHOULD expose both; they are what a
printed sheet and an editor need.

## Open questions

- Whether to allow a fingering after the fret string (`Cm = x35543 (1 3 4 2 1 1)`)
  for applications that cannot derive one, or want to override it.
- Whether a block for a tuning should be able to say which *kind* of
  instrument it is for (guitar, cavaquinho) for display, given that the
  tuning does not say.
