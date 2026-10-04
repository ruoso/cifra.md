# cifra.md

A Markdown profile for chord charts.

A song is one plain-text file. The smallest valid document is a chart: the
sections of the song, with the chords of each bar.

```
# Intro
Dm | G7 | C7 | F

# A
Dm | G7 | C7 | F
Bb | A7 | Dm | %

# B
Gm | C7 | F  Dm | Gm  A7
```

That is a complete document. Nothing else is required.

A song may also be written with its words, the way a cifra is: a line of
chords over each line of words, the chords placed by column over the
syllables they change on. Sections may be named in brackets, as a cifra
names them, or with `#`.

```
[Intro] G  D  Em  C

[Verse]
G           D
When I first saw you
Em              C
walking down the road
```

Both are the **chart**, the song as music, independent of any instrument.
Either may be followed by a rule and a second part, the **voicings**: how
each chord is actually fingered on each instrument the song has been
arranged for.

```
---
title: Walking Down the Road
notation: american
---

# Intro
A | Cm | A | Cm[2]

# Verse
A           Cm
When I first saw you
A           Cm[2]
walking down the road

---

# Voicings: E2 A2 D3 G3 B3 E4
A = x02220
Cm = x35543
Cm[2] = 8-10-10-8-8-8

# Voicings: G4 C4 E4 A4
Cm = 0333
```

The chart is the same on every instrument. What differs per instrument is
how each chord is played, so voicings are kept in blocks headed by the
tuning they are for, and a document with no block for your instrument is
still a song you can play from. A chord the song plays more than one way
carries a footnote marker, `Cm[2]`, and each tuning's block says what its
second `Cm` is.

The front matter at the top is optional metadata. Its `notation` key says
which chord-spelling convention the chart uses, Brazilian cifra, American
jazz or Real Book, for the few symbols that mean different things in each.

Every cifra.md file is also a valid Markdown file. Headings are headings, the
rule is a rule, lyric lines read as text, and a chart line reads as the line
of chords it is. A song opened in any Markdown viewer is still readable; a
cifra.md reader gets the structure.

## Status

Working draft. The format is implemented by
[explore-chords](https://github.com/ruoso/explore-chords), from which it grew.
This repository is where the format is defined independently of that
implementation, so that other readers and writers can be built against it.

Where this draft departs from what explore-chords currently accepts, the
departure is listed in [Appendix B](spec/appendix-b-reference-differences.md).

## The specification

The specification is split so that an implementation can take it a layer at a
time. Each document says what it depends on.

| Document | Covers | Needed for |
|---|---|---|
| [0. Overview](spec/0-overview.md) | Scope, terms, the document model, Markdown compatibility, conformance language | Everything |
| [1. Document structure](spec/1-document.md) | Encoding, lines, front matter, the two parts, the rule, headings, sections | Everything |
| [2. The chart](spec/2-chart.md) | Chord lines, measures, bar lines, chord tokens, footnote markers, bar numbers | Reading a chart |
| [3. Repeats](spec/3-repeats.md) | The measure repeat sign, repeat groups and counts, first and second endings, expansion | Reading a chart |
| [4. Words](spec/4-lyrics.md) | Lyric lines, how chords are placed over syllables, stanza breaks | Reading a cifra with its words |
| [5. Chord symbols](spec/5-chord-symbols.md) | The chord symbol grammar, its meaning, notation dialects, the three ambiguities | Knowing what a chord *is* |
| [6. Tunings](spec/6-tunings.md) | Pitch names, tuning lists, tuning identity | Reading voicings |
| [7. Voicings](spec/7-voicings.md) | Voicing blocks, variations, fret strings, how a chord in the chart finds its shape | Reading voicings |
| [8. Normalisation](spec/8-normalisation.md) | The canonical form of a document and the invariants an editor must keep | Writing or editing |
| [9. Conformance](spec/9-conformance.md) | Conformance profiles and what each requires | Claiming conformance |
| [Appendix A. Legacy forms](spec/appendix-a-legacy.md) | Earlier spellings a reader may accept | Compatibility |
| [Appendix B. Reference differences](spec/appendix-b-reference-differences.md) | Where this draft and explore-chords disagree | Maintainers |

A reader that only wants the chords of each bar needs documents 0 to 3 and
the symbol grammar of 5. Adding words needs 4. Adding voicings needs 6 and 7.
Only an editor needs 8.

The [examples](examples/) directory holds complete documents, one per feature.

## Design principles

- **The text is the whole state.** Every choice the song carries is in the
  file, readable and editable by hand. Nothing is hidden state an application
  remembers on the song's behalf.
- **Write it the way a musician writes it.** A chart is bars separated by
  bar lines; a cifra is chords over words; a shape is `x32010`. The format
  adds the least it can to those conventions.
- **The chart is instrument-independent.** Fingerings belong to a tuning, not
  to the song, so one document serves every instrument it has been arranged
  for and still reads on one it has not.
- **Chords are stored as written, understood canonically.** `C7M`, `Cmaj7`
  and `C∆7` are the same chord. A document keeps the spelling its author
  used; a reader knows what it means.
- **Degrade gracefully.** A line that does not parse is still shown. A
  voicing that does not parse is reported and skipped. A reader never
  discards what it did not understand.

## Open questions

Listed at the end of each document under *Open questions*. The largest are
collected in [Appendix B](spec/appendix-b-reference-differences.md).
