# 2. The chart

Depends on: §0, §1. Uses the chord symbol grammar of §5 only to decide
whether a token is a chord; what the chord *means* is §5's business. The
repeat constructs it mentions are defined in §3.

## 2.1 Chord lines

Every line inside a fence (§1.9) in the chart that is not a cifra-style
heading, not blank and not a lyric line (§4) is a chord line. In a document
that has no words, that is every such line, and a reader that does not
implement §4 treats every such line as a chord line. Lines outside a fence
are never chord lines.

```
C  Am | F  G
Dm | % | G7 | C
```

A chord line is a sequence of measures separated by bar lines. A line with
no bar line at all is a **run**: a sequence of chords in order, `Intro: G
D Em C`, which is how a cifra writes an intro or a turnaround. A run says
which chords and in what order, and nothing about bars: usually one bar
each, but the text does not say. A reader keeps a run as one measure with
no bar line on either side, and §2.8 neither numbers it nor lets it
advance the count, for the same reason a sung line is not numbered.

## 2.2 Measures and bar lines

The bar line is `|`. The double bar `||` is also a bar line, and means
nothing more than a bar line; a reader MUST accept it. `|:` and `:|` are a
bar line with a repeat mark against it (§3.2): the bar line divides
measures as usual, and the mark is an item of the measure on its inner
side.

A measure is the text between two bar lines, or between the start of the
line and the first bar line, or between the last bar line and the end of the
line. Text that is empty or whitespace between two bar lines, or before the
first or after the last, is **not** a measure. So all of these are two
measures:

```
C | G
| C | G |
C || G
```

A measure holding only a bar anchor (§2.8), or only an ending marker
(§3.4), is also not a measure; what it holds belongs to the measure that
follows.

A measure MUST contain at least one item (§2.3) to be a measure. A chord
line with no items at all (one made only of bar lines, anchors or
punctuation) contributes nothing to the chart except any anchor it
carries, and is read as a blank line (§4.1). A line holding only marks,
counts or ending markers, `|:` or `:| x3` alone, keeps them as items of a
measure that is not a bar: it is not numbered and an anchor passes over
it (§2.8).

## 2.3 Items

Within a measure, items are separated by spaces (§1.3). A trailing `,` or
`;` on a word is punctuation: it is removed before the word is
classified, and again from what is left when step 7 splits a mark off,
so `C,)` is the chord `C` and a mark. It is never part of a chord symbol
or key, and canonical form does not write it back (§8.4.4).
`Intro: C, G, Am, F` is the chords `C`, `G`, `Am` and `F`. A word that is
only punctuation is nothing. Each remaining word is classified, in this
order:

1. **Bar anchor**: `@` followed by one or more digits whose value is not
   zero (§2.8).
2. **Repeat sign**: exactly `%` (§3.1).
3. **No-chord mark**: `N.C.` or `NC`, in any letter case (§2.6).
4. **Beat mark**: exactly `/`, `.` or `-`: one beat on which the previous
   chord carries on, as American charts write `C / / / | G / / /` and
   ChordPro grids write `C . . .`. Not a chord, not a word; it takes words
   on a sung line like any item.
5. **Count**: `x2`, `2x`, `(2x)`, `bis`, `(bis)` and the forms in §3.3.
6. **Ending marker**: a positive integer followed by `.` (§3.4).
7. **Group marks**: a leading `(` or `:` or a trailing `)` or `:` that is
   not balanced within the word is split off as a mark of its own (§3.2).
   A `:` is a mark only when written against a bar line. What is left, if
   anything, is classified again from step 1, so `@9)` is an anchor and a
   mark.
8. **Chord token**: a chord symbol, optionally followed by a footnote marker
   (§2.4). If the symbol parses under §5, the item is a chord. If it does
   not, the item is an **unknown token** (§2.9).

So `(Cm` is a mark followed by the chord `Cm`; `Dm)` is the chord `Dm`
followed by a mark; `(` alone is a mark; `Em7(b5)` is one chord, because its
brackets balance; `(solo)` is an unknown token, because its brackets
balance and it is not a chord; `(2x)` is a count (step 5).

Items keep the order they were written in. A reader MUST NOT reorder,
merge or drop items.

## 2.4 Chord tokens and footnote markers

A chord token is a chord symbol (§5) immediately followed, with no
whitespace, by an optional footnote marker: `[` then one or more digits then
`]`.

```
Cm        symbol Cm, index 1
Cm[2]     symbol Cm, index 2
Cm[1]     symbol Cm, index 1 — equivalent to Cm
```

The marker says *which way* this occurrence of the chord is played. The
bare symbol is way 1; `[2]`, `[3]` and so on are the others. The marker is
part of the chart, not of any instrument's voicings: it records the
arrangement decision "this bar uses the second Cm", which each tuning's
block then gives a shape to (§7.4).

The pair (symbol, index) is the chord's **voicing key**, written as the
symbol alone for index 1 and `symbol[index]` otherwise. Two occurrences
with the same key are played the same way on any one instrument.

Rules:

- The symbol in the key is the text as written, compared character for
  character. `C7M` and `Cmaj7` are the same chord (§5) but different keys.
  An author does well to spell a chord one way throughout a document;
  canonicalising never respells one.
- The digits are read as a decimal number: `Cm[02]` is index 2. A reader
  MUST read `[1]`, and `[0]`, as index 1, the bare key. Canonical form
  writes neither (§8.4.4).
- Indices are small positive integers. A document in canonical form uses,
  for each symbol, exactly the indices 1 to *n* with no gaps. A reader
  MUST accept gaps and MUST NOT renumber on reading; the canonical writer
  renumbers (§8.3 I2).
- The marker binds to the chord. `Cm [2]` with a space is the chord `Cm`
  followed by an unknown token `[2]`.

## 2.5 Several chords in a measure

A measure of a line that has bar lines may hold several chords: `C  Am |
F  G`. This says the bar is divided between them, in order. It does not say
how. Beat marks (§2.3) say how many beats the chord before them lasts, and
a reader MAY use them for display. A display convention
is to divide the bar equally, and a reader MAY present it so, but the
format carries no durations and a reader MUST NOT infer any for another
purpose.

## 2.6 The no-chord mark

`N.C.` means *no chord*: the harmony instruments stop, for a melody
pickup, a drum break, a stop-time hit or an a cappella bar.

```
N.C. | N.C. | C | G7
C  N.C.  G
```

It fills a slot the way a chord does: it takes its share of the bar, it
counts as a bar when alone in one, and it takes words on a sung line. It
is not a chord: it has no symbol, no voicing key, no shape to choose, and
it never appears among a document's unvoiced chords (§7.7). A reader MUST
keep it as a no-chord item and MUST NOT treat it as an unknown token.

The spellings `N.C.`, `NC`, `n.c.` and `nc` are accepted. Canonical form
writes `N.C.` (§8.4.4).

## 2.7 Repeat items

Repeat signs, group marks, counts and ending markers are items like any
other: kept in order, in their measure, as written. Their meaning as
played is defined in §3. A reader that does not implement §3 still MUST
keep them as items, MUST NOT treat them as chords, and MUST count a `%`
measure as a bar.

A word whose brackets are unbalanced somewhere other than its ends, such as
`C(7`, is passed whole to the symbol grammar, where it fails and becomes an
unknown token. Round brackets only are marks; square brackets are the
footnote marker.

## 2.8 Bar anchors and bar numbers

Bars are numbered continuously from 1 through the chart, the way a score
numbers them, counting every measure of every chord line that has bar
lines, in order. A run (§2.1) is not a bar and does not advance the count. Section
boundaries do not restart the count.

A player transcribing from a score often writes a repeat out straight. The
chart's bar positions then stop matching the score, and bar numbers are how
musicians find each other: "from bar 9" has to mean bar 9 of the score. So
a bar number can be **stated**, and a stated number overrides the count
from there on.

`@` followed by digits, as an item, states the number of the measure it is
in. Bars are numbered from 1: `@0`, `@00` and the like are not anchors but
unknown tokens (§2.9), and `@05` is bar 5. An anchor SHOULD be the first
item of the measure. A reader MUST accept it anywhere in the measure; if a
measure states more than one, the last wins.

A heading may state the number of its section's first bar instead (§1.7.4).

A stated number with no bar of its own belongs to the next bar: `@9 | Dm`,
`@9` alone on a line, and `## A @9` followed by `Dm` all number the `Dm` bar
9. A reader MUST carry the number forward, across lines and across section
boundaries, to the next measure that is a bar, which then has that number
as its stated number. Dropping it would be the worst outcome, because
nothing would look wrong.

Numbers count the chart as written: a `%` measure is a bar, and a repeat
group's measures are counted once however many times they are played
(§3). Marks, counts and ending markers are not bars.

Numbers may repeat and may jump; that is the point.

````
## A
```
Dm | G7 | C7 | F
```

## A, written out again @1
```
Dm | G7 | C7 | F
Dm | G7 | @17 Em | A7
```
````

The first section is bars 1 to 4. The second is bars 1 to 4 again, then
5, 6, 17 and 18.

Bar numbers exist only in a document that is not sung (§4.2). Under a line
of words a chord may last four bars or half of one, and the text does not
say which, so counting there would be a guess. A reader MUST NOT assign bar
numbers to the measures of a sung line, and a sung line MUST NOT advance
the count. Anchors in a sung document are kept as written but have no
effect.

A reader SHOULD record, for each numbered measure, whether its number was
stated or counted, so that a display can show the stated ones.

## 2.9 Unknown tokens

A word that reaches step 8 of §2.3 and does not parse as a chord symbol is
an unknown token. It is kept as written, in its place among the items, as
an item of its own kind, so that an application can show it and list it.
It is not an error: a reader MUST NOT raise a diagnostic for one.

Unknown tokens are how typos, annotations the format does not define
(`fine`, `rit.`, `(solo)`) and chords a reader's grammar does not cover
all survive a round trip. A reader MUST NOT drop them, and a writer MUST
write them back unchanged. A voicing key written exactly as an unknown
token is used by it (§8.3).

A reader SHOULD make the distinct unknown symbols of a document available,
in first-seen order, so an application can show them.

## Open questions

- Nothing at present. Bar-line forms are preserved by the model (`|` and
  `||` on measures, repeat marks as items), and `N.C.` is defined above.
