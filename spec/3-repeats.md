# 3. Repeats

Depends on: §0, §1, §2.

A chart is shorter than the song it describes because it does not write
out what is played again. This section defines the three ways a chart says
"again": the measure repeat sign, repeat groups with an optional count, and
first and second endings. For each, it defines both what a reader sees
**as written** and what the chart means **as played**.

A reader is never required to expand a repeat. The chart's structure, its
bar numbers (§2.8) and its voicings all refer to the chart as written. But a
reader that does expand MUST do so as defined here, so that two readers
agree on what the song plays.

```
Dm | % | G7 | %
|: C | Am | F | G :| x3
|: Dm | G7 |1. C | A7 :|2. C | C |
( Cm  Cm/A#  Am7/5- )
```

## 3.1 The measure repeat sign

`%` as the only item of a measure means: play the previous measure again.

As written, it is a measure of its own containing one repeat item (§2.3).
It is not a chord. There is nothing to look up and no shape to choose,
because the chord it stands for has both where it was written. A reader
MUST keep it as written, MUST NOT replace it with the chord it repeats, and
MUST count it as a bar (§2.8).

As played, it is the previous measure *as played*: if that measure is itself
`%`, the one before, and so on. The previous measure is the previous
measure of the chart in reading order, across lines and across sections. A
`%` with no measure before it in the chart is an error; a reader MUST keep
it and report it.

`%` beside other items in one measure has no defined meaning in this
version. A reader MUST keep it where it is written and report it.

## 3.2 Repeat groups

A repeat group encloses a run of measures that is played more than once.
It is written in either of two notations, which mean the same thing:

| Notation | Opens | Closes |
|---|---|---|
| Bar-line repeats | `\|:` | `:\|` |
| Cifra brackets | `(` | `)` |

`|:` is a bar line followed by an opening mark; `:|` is a closing mark
followed by a bar line. `||:` and `:||` are the same with a double bar. The
marks attach to the bar line they are written against and belong to the
measure on the inner side of it.

Brackets are the way a cifra writes it: `( Cm  Cm/A#  Am7/5- )` or
`(Cm Cm/A# Am7/5-)`. A bracket may stand alone or be written against a
chord; either way it is a mark of its own (§2.3), because it brackets the
run and not the chord it happens to touch. Only a bracket that nothing
closes, or that nothing opened, within one word is a mark; a chord symbol's
own balanced brackets, as in `Em7(b5)`, belong to the symbol.

Rules:

- A group begins at an opening mark and ends at the next closing mark of
  either notation. A reader MUST pair `(` with `:|` and `|:` with `)`; the
  notations are interchangeable, and a document that mixes them is merely
  untidy.
- A group MAY span lines within a section. It MUST NOT span a heading: a
  heading closes any open group, and a reader MUST report the unclosed
  mark.
- Groups do not nest. An opening mark inside an open group, or a closing
  mark with no open group, is a **stray mark**: it is kept as an item and
  reported, and has no repeat meaning.
- A group with no measures in it (`( )`) is two stray marks.

As written, the marks are items in their measures. As played, the measures
from the opening mark to the closing mark are played *count* times (§3.3),
with the endings, if any, substituted on each pass (§3.4).

The run inside a group may begin or end mid-measure (`C (Am | F) G`). As
played, the measure is split where the mark falls; as written, nothing
changes. A writer SHOULD put marks at measure boundaries.

## 3.3 Counts

A **count** is a token of the form `x2`, `2x`, `×2` or `2×`: the letter `x`
or the sign `×` and a positive integer, in either order; the same in round
brackets, `(2x)`, `(x3)`, which is how a cifra writes it; or `bis` or
`(bis)`, which is twice. It says how many times something is played in
total, so `x2` is twice. A writer emits `x2`.

- A count immediately after a group's closing mark, as the next item on the
  same line, is the group's count: `( C | G ) x3`, `|: C | G :| 3x`.
  It is a word of its own: `(C | G)x3` is not a count. A group with endings (§3.4) takes its count from them and
  MUST NOT also carry a count token; a reader MUST report one that does and
  use the endings.
- A group without a count or endings is played **twice**.
- A count at the end of a chord line that has no group on it is the
  **line's** count: the line's measures are played that many times.
  `C | G | Am | F  2x` is eight bars as played.
- A count at the end of a heading is the section's count (§1.7.4): the
  whole section is played that many times.
- A count anywhere else is an unknown token (§2.9).

As written, a count is an item of the measure it is in. It is not a bar
and takes no words.

A count applies to the group or line as *written*; a measure repeat inside
a group repeats within each pass, as it would if the pass were written out.

## 3.4 Endings

A group may end differently on each pass. An **ending marker** is a
positive integer followed by `.`, as an item: `1.`, `2.`, `3.`. It marks
where the ending for that pass begins.

```
|: Dm | G7 |1. C | A7 :|2. C | C |
```

Here the first pass plays `Dm G7 C A7` and the second `Dm G7 C C`.

Rules:

- Ending markers are recognised only inside a group or immediately after
  its closing mark. Anywhere else, `1.` is an unknown token.
- Ending *n* begins at the marker `n.` and runs to the next ending marker,
  or to the closing mark, whichever comes first.
- The **last ending** is written after the closing mark, since it is played
  once and not repeated. It runs from its marker to the end of the line.
- The markers MUST be `1.` to *k*, in order, with no gaps; *k* is the
  group's count. One marker numbered higher than the pass count, or a gap,
  is an error; a reader MUST report it and MAY still expand by taking the
  endings in the order written.
- The repeated part is everything from the opening mark to the first
  marker. On pass *n* it is followed by ending *n*.
- A group whose only marker is after the closing mark has a first ending
  that is empty, which is legal and means "the second time, go straight
  on": `|: C | G :|2. Am |`.

As written, markers are items. They are not bars and take no words. A
measure that holds only a marker (`|1. |`) is not a measure (§2.2), and
the marker belongs to the measure that follows.

## 3.5 Expansion

A reader that produces the chart as played does so measure by measure,
section by section:

1. Replace each `%` by the measure it repeats (§3.1).
2. For each group, emit its passes: for pass *n* from 1 to *count*, the
   repeated part followed by ending *n* if there are endings.
3. For a line with a line count and no group, emit the line *count* times.
4. Drop marks, counts and markers.

Each emitted measure keeps a reference to the measure it came from as
written, so that an expanded chart can still show bar numbers and look up
voicings, both of which are defined on the chart as written.

## 3.6 Repeats and words

On a sung line (§4.4), marks, counts and markers are items and take words
like any other item, since the words under them belong somewhere. A group
on a sung line means the chords repeat; what is sung the second time is
whatever the author wrote under it. This is how a cifra writes a line
"(2x)", and a reader MUST NOT try to do better.

## Open questions

Deferred to a later version; each reads as an unknown token or as name
text today:

- Whether to define `%%`, the two-bar repeat, which some charts use.
- Navigation marks (D.C., D.S., Coda, Fine, `§`) are also repeats, in the
  structural sense. They need anchors and a notion of the end of the song,
  and are left for a later version.
