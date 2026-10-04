# 7. Voicings

Depends on: §0, §1, §2 (voicing keys), §6 (tunings).

The chart says which chords the song has. The voicings part says how each is
fingered, per instrument. It comes after the rule and is made of voicing
blocks, one per tuning and variation.

```
---

## Voicings: E2 A2 D3 G3 B3 E4
- A: x02220
- Cm: x35543
- Cm[2]: 8-10-10-8-8-8

## Voicings: G4 C4 E4 A4
- Cm: 0333
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

In the voicings part, every Markdown heading (§1.7.1) opens a voicing
block. Canonical form writes it at level 2 (§8.4.6). Its text is:

```
## Voicings: <tuning>
## <name>: <tuning>
```

A label, a colon, and a tuning (§6.2): the label is the heading's text up
to its first colon, and the tuning everything after it. Spaces around the
colon are not significant.

- The label `Voicings`, in any case of its ASCII letters, names the
  **default variation** of that tuning (§7.3). Canonical form writes it
  `Voicings`.
- Any other label names a **variation** called by that label:
  `## Simple: E2 A2 D3 G3 B3 E4` is a variation called *Simple*. The label
  may contain spaces; it is trimmed and each run of spaces in it is one
  space, as in any heading's text (§1.7.1). Two labels name the same
  variation only if they are then the same, character for character:
  `Simple` and `simple` are two variations.
- The tuning MUST parse under §6.2. A heading whose text after the colon is
  not a tuning is an error; a reader MUST report it and MUST skip the lines
  that follow it up to the next heading, so that they are not attributed to
  the previous block.
- A heading with no colon is an error, handled the same way. The report
  MUST say that a heading after the rule is read as a voicings block, that
  the lines under it are not read, and that a section belongs before the
  rule, because the likeliest cause is a `---` written between two
  sections out of Markdown habit (§1.6).

A teacher will write `## Voicings: cavaquinho`, or `## Voicings: D G B D`
without octaves, because that is how an instrument is named in a lesson.
The format does not keep a table of instrument names: the pitch list is
what makes a block usable on any instrument at all, and a name would be
one more thing to get wrong in four languages. So the diagnostic does the
teaching. A reader's report for a heading whose tuning does not parse MUST
say what a tuning is and show one, for example: *a tuning is the open
strings as pitches with octave numbers, lowest string first, like
`E2 A2 D3 G3 B3 E4` for a guitar or `G4 C4 E4 A4` for a ukulele*. An
application MAY offer to fill the pitches in from a name it knows.

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
  a later line for a key replaces an earlier one, and MUST report it. The
  merged block stands where the first was, with the first heading's
  spelling of the tuning; its notes are those of both, in order.
- When no variation is chosen, an application uses the tuning's default
  variation, the `Voicings` block, if there is one, and otherwise the
  tuning's first block in the order written.
- An empty block (a heading with no list items) is a variation that exists
  and has nothing chosen in it yet. A reader MUST keep it, and a writer
  writes it back as its heading. A block is never removed by
  canonicalising, not even when §8.3 leaves it empty: whether a tuning was
  considered is not something the chart can say.

## 7.4 Voicing items

The voicings of a block are a Markdown list, one item per key:

```
- <key>: <fret string>
- <key>: <fret string> (<fingering>)
```

- A voicing item is a list item as for properties (§1.4.2): up to three
  spaces, `-`, `*` or `+`, and one or more spaces. Canonical form writes
  `- ` (§8.4.6).
- `key` is a voicing key (§2.4): a chord symbol, optionally followed by a
  footnote marker. It MUST NOT contain a space, `:`, `[` or `]` except
  as the marker. `Cm[1]` and `Cm[0]` are the key `Cm`.
- `:` with optional whitespace around it, then a fret string (§7.5),
  then optionally a fingering in round brackets (§7.5.1).

The symbol in a key is text, matched character for character against the
chart's tokens (§2.4). It is not required to parse as a chord, and a reader
MUST NOT validate it against §5; a key for an unknown token (§2.9) is as
good as any other. A reader accepts a key the chart does not use, and
resolving simply never reaches it; canonical form does not keep it (§8.3
I1).

A list item that is not of this form, or whose fret string does not parse
or has the wrong number of strings (§7.5), is a **problem**. A reader MUST
skip it, MUST report it with the text of the item, and MUST continue with
the rest of the block. A writer MUST NOT write problems back; see §8.

A line in a block that is not a list item, not a heading, not the rule and
not blank is **notes**, as in the chart (§1.9): kept as read, in order,
and not interpreted. Blank lines are not significant. A rule after the
first is reported and not kept (§1.6), and so is anything in the voicings
part before its first block heading.

Keys within a block are unique. If a key repeats, the last item wins. The
order of items is not significant; a reader presents them in the order
§8.4.6 defines, and presents blocks in that order too, so that the model of
a document and of its canonical form are the same.

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
and the instrument, unless the document says (§7.5.1). This keeps the text
to what a player would actually write.

### 7.5.1 Fingering

A fingering is a choice, not a fact of the shape: open G, `320003`, is
fingered 2-1-3 or 3-2-4 depending on what comes next, and a teacher may
want to say which. So a voicing item MAY carry one, in round brackets
after the fret string, one position per string in tuning order:

```
- G: 320003 (3 2 - - - 4)
- Bb: 113331 (1 1 2 3 4 1)
- F: 133211 (134211)
```

- Each position is a finger `1` to `4` (index to little finger), `T` for
  the thumb, or `-` for a string the hand does not fret: an open string, a
  muted string, or a fretted string whose finger is left unstated. `0` is
  read as `-`, and `t` as `T`.
- Positions MAY be separated by spaces or run together; canonical form
  separates them with single spaces and writes `T` and `-` (§8.4.6).
- The number of positions MUST equal the number of strings.
- A finger on a string whose fret is `x` or `0` is a contradiction.
- The same finger on several strings is a barre, and those strings MUST be
  at the same fret.

A fingering that breaks one of these rules is a problem of its own,
`bad-fingering`: a reader MUST report it, drop the fingering, and keep the
shape. A fingering is the one optional part of a voicing item, and a reader
that does not use fingerings MUST still keep it, so that a writer can
write it back. A fingering whose every position is `-` frets nothing and
says nothing; a reader keeps it, and canonical form does not write it.

A fingering overrides whatever the application would have worked out, in
the same way a written shape overrides the application's default shape.
Where none is written, the application's fingering is the default and is
never written in.

## 7.6 Resolving a chord to its shape

Given an occurrence in the chart and an instrument:

1. Find the block for the instrument's tuning (§6.3) and the variation in
   use; with no variation in use, the tuning's default variation, else its
   first block (§7.3).
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
chose; writing defaults in would hide the choices among the guesses
(§8.3 I4).

### 7.6.1 Names derived from shapes

Three things about a chord are kept apart:

| Layer | Where it lives | Example |
|---|---|---|
| The harmony | the chart, shared by every instrument | `Gm7` |
| The shape | the block for one tuning | `x1303x` |
| What the shape sounds, or is called | derived, shown, never stored | `Gm7/Bb`; "an E shape" under a capo |

A reader MAY derive the third from the second and the tuning: the bass the
shape actually sounds, so that an inversion reads `Gm7/Bb` beside the
chart's `Gm7`; or the name the shape would have at the nut, so that a `G`
voiced `022100` under a capo at the third fret reads "E shape" (§6.3). An
application MAY show these, and MAY offer to show the whole chart by them.
A writer MUST NOT write them into the text. They go stale when a shape is
edited and they differ for every tuning, which is what the chart is
independent of.

## 7.7 The legend

The **legend** of a document on an instrument is every voicing key the chart
uses that has a shape in that instrument's block, with its shape. The
**unvoiced** keys are those the chart uses that have none. No-chord marks
(§2.6) have no key and belong to neither. Both are ordered
by symbol, then index (§8.4.6). A reader SHOULD expose both; they are what a
printed sheet and an editor need.

## Open questions

Deferred to a later version:

- Whether a block for a tuning should be able to say which *kind* of
  instrument it is for (guitar, cavaquinho) for display, given that the
  tuning does not say.
