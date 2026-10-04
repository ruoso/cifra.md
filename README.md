# cifra.md

A Markdown profile for chord charts.

A song is one plain-text file, named `something.cifra.md` so that it is both
recognisable as a song and handled as Markdown. The smallest valid document
is a chart: the
sections of the song, each with the chords of its bars in a fenced block.

````
# Blues in D minor

## Intro
```
Dm | G7 | C7 | F
```

## A
```
Dm | G7 | C7 | F
Bb | A7 | Dm | %
```

## B
```
Gm | C7 | F  Dm | Gm  A7
```
````

That is a complete document. Nothing else is required. The fences are what
mark the music; anything else written in a section is notes, kept for the
reader and not interpreted.

A song may also be written with its words, the way a cifra is: a line of
chords over each line of words, the chords placed by column over the
syllables they change on. A whole cifra can be pasted into one
fence: the bracket headings inside it name the sections, exactly as `##`
headings outside it would.

````
# Walking Down the Road

```
[Intro] G  D  Em  C

[Verse]
G           D
When I first saw you
Em              C
walking down the road
```
````

Both are the **chart**, the song as music, independent of any instrument.
Either may be followed by a rule and a second part, the **voicings**: how
each chord is actually fingered on each instrument the song has been
arranged for.

````
# Walking Down the Road
- artist: Nobody
- notation: american

## Intro
```
A | Cm | A | Cm[2]
```

## Verse
```
A           Cm
When I first saw you
A           Cm[2]
walking down the road
```

---

## Voicings: E2 A2 D3 G3 B3 E4
- A: x02220
- Cm: x35543
- Cm[2]: 8-10-10-8-8-8

## Voicings: G4 C4 E4 A4
- Cm: 0333
````

The chart is the same on every instrument. What differs per instrument is
how each chord is played, so voicings are kept in blocks headed by the
tuning they are for, and a document with no block for your instrument is
still a song you can play from. A chord the song plays more than one way
carries a footnote marker, `Cm[2]`, and each tuning's block says what its
second `Cm` is.

The title is a level-1 heading, and the list under it holds the song's
properties. Both are optional. The `notation` property says which
chord-spelling convention the chart uses, Brazilian cifra, American jazz or
Real Book, for the few symbols that mean different things in each.

Every cifra.md file is also a valid Markdown file, and renders as one: the
title and sections are an outline, the music is a monospaced block that
keeps every chord over its syllable, the voicings are a list, and notes are
prose. A song opened in any Markdown viewer is readable as a sheet; a
cifra.md reader adds the structure.

Songs are gathered into **setlists** for a gig or a rehearsal. A setlist is
a file of its own, `something.setlist.md`, beside the songs: a title and a
numbered list of links to them, with the key the band plays each one in
and a note where it needs one.

```
# Bar do Zé, 10 October

1. [Garota de Ipanema](bossa/garota-de-ipanema.cifra.md)
   - key: D
2. [Corcovado](bossa/corcovado.cifra.md)
3. [Carinhoso](choro/carinhoso.cifra.md)
   - note: start from the B section
```

On a git host it is a list of links that open the songs; to a reader it
is the order to play them in, each transposed for reading to the key
given.

## Status

Working draft. The format grew out of
[explore-chords](https://github.com/ruoso/explore-chords), but it is defined
here, by the specification, the schema, the reference implementation and the
corpus below, and explore-chords is one implementation among the possible
ones. Where it does not yet follow this draft, the gap is listed in
[Appendix B](spec/appendix-b-reference-differences.md).

## What is in this repository

| Directory | What | For whom |
|---|---|---|
| [`spec/`](spec/) | The specification, one document per layer | Anyone implementing or extending the format |
| [`schema/cifra.schema.json`](schema/cifra.schema.json) | JSON Schema (2020-12) of the parsed document model | Readers, to say what they produce; writers, to say what they take |
| [`reference/`](reference/) | A reader and canonical writer in Python, with a test suite of one file per chapter | A second opinion on every sentence of the spec |
| [`corpus/`](corpus/) | Reference corpus: per entry an uncanonical `input.cifra.md` and its model `input.parsed.json`, its `canonical.cifra.md` and that text's model `parsed.json` | New implementations, to validate themselves in both directions |
| [`examples/`](examples/) | Complete documents, `*.cifra.md`, one per feature, and two setlists, `*.setlist.md`, all in canonical form | Reading |

The model is what a reader produces and a writer consumes. The schema is its
normative shape; §0.4 of the overview describes it in prose. A **canonical
writer** regenerates a document from the model alone, byte for byte as §8
says, so anything the model does not hold (malformed voicing items, the
exact spacing of a chord line) is not written back. Every document has
exactly one canonical form, two conforming writers produce the same bytes
for it, and it is a fixed point: reading it and writing it again gives the
same text. A program can therefore refuse any file that is not canonical.

## The specification

The specification is split so that an implementation can take it a layer at a
time. Each document says what it depends on.

| Document | Covers | Needed for |
|---|---|---|
| [0. Overview](spec/0-overview.md) | Scope, terms, the document model, Markdown compatibility, conformance language | Everything |
| [1. Document structure](spec/1-document.md) | Encoding, file names, lines, title and properties, the two parts, the rule, headings, sections, fences and notes | Everything |
| [2. The chart](spec/2-chart.md) | Chord lines, measures, bar lines, chord tokens, footnote markers, bar numbers | Reading a chart |
| [3. Repeats](spec/3-repeats.md) | The measure repeat sign, repeat groups and counts, first and second endings, expansion | Reading a chart |
| [4. Words](spec/4-lyrics.md) | Lyric lines, how chords are placed over syllables, stanza breaks | Reading a cifra with its words |
| [5. Chord symbols](spec/5-chord-symbols.md) | The chord symbol grammar, its meaning, notation dialects, the four ambiguities | Knowing what a chord *is* |
| [6. Tunings](spec/6-tunings.md) | Pitch names, tuning lists, tuning identity | Reading voicings |
| [7. Voicings](spec/7-voicings.md) | Voicing blocks, variations, fret strings, how a chord in the chart finds its shape | Reading voicings |
| [8. Normalisation](spec/8-normalisation.md) | The canonical form of a document, byte for byte, the footnote invariants, and the editing operations | Writing, editing, or checking that a file is canonical |
| [9. Conformance](spec/9-conformance.md) | Conformance profiles and what each requires | Claiming conformance |
| [10. Setlists](spec/10-setlists.md) | The setlist file: a numbered list of links to songs, per-song `key` and `note`, paths, resolution, and its canonical form | Reading or writing setlists |
| [11. Merge](spec/11-merge.md) | The three-way merge of songs and setlists: the chart by lines, the voicings and properties by structure, footnote markers across versions, conflicts as values and as text with conflict markers | Syncing, merging, the git merge driver |
| [Appendix A. Legacy forms](spec/appendix-a-legacy.md) | Earlier spellings a reader may accept | Compatibility |
| [Appendix B. Reference differences](spec/appendix-b-reference-differences.md) | Where this draft and explore-chords disagree | Maintainers |

A reader that only wants the chords of each bar needs documents 0 to 3 and
the symbol grammar of 5. Adding words needs 4. Adding voicings needs 6 and 7.
Only an editor needs 8. Setlists need 10, and only the parts of 1 and 5 it
names. Only a program that merges needs 11.

The [examples](examples/) directory holds complete documents, one per feature.

## Writing one by hand

The format is small, but five things catch people who write it from a
template or paste a cifra from the web.

1. **Music goes between fences.** The lines ` ``` ` (or `~~~`, easier on a
   keyboard where the backtick is a dead key) mark where the chords and
   words are. A chart pasted without them is notes, and a reader will tell
   you so, but it will not play.
2. **One `---`, after the last section.** The rule is where the song ends
   and the voicings begin. A `---` between two verses, Markdown habit, puts
   every verse after it into the voicings part, where it is not read.
3. **Sections are `##`.** `[Intro]` and `Intro:` also work, so a pasted
   cifra reads as it is; write `##` yourself.
4. **A tuning is pitches with octave numbers**, lowest string first:
   `## Voicings: E2 A2 D3 G3 B3 E4` for a guitar, `G4 C4 E4 A4` for a
   ukulele, `D4 G4 B4 D5` for a cavaquinho. `## Voicings: guitar` is not
   read. A capo is a tuning three (or however many) frets up.
5. **Repeats are `|: :|` or `( )`, with a count after them**: `x2`, `2x`,
   `(2x)` or `bis` all work. A count at the end of a heading, `## Refrão
   x2`, repeats the whole section.

And three smaller ones. A line of words that happens to be chords, `A` or
`Em`, is forced to read as words by starting it with `>`. The first line
of words under a chord line needs at least two words, or the reader takes
it for a chart with a typo. A cifra's header lines, `Tom: G`, `Capo: 2`,
belong in the property list under the title, `- key: G`, not in the music.

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
- **Degrade gracefully.** Music is what is inside a fence; everything else
  is notes and is never interpreted. Inside a fence, a token that does not
  parse is still shown, and a voicing that does not parse is reported and
  skipped. A reader never silently discards what it did not understand:
  it keeps it, or reports it.
- **One text per song.** Every document has one canonical form, and it
  takes precedence over preserving what was typed: a writer respells,
  reflows, and drops what the reader reported, so that a song saved by any
  conforming program is the same bytes. What a song plays never changes in
  the process; only how it is written.

## Open questions

Listed at the end of each document under *Open questions*. The largest are
collected in [Appendix B](spec/appendix-b-reference-differences.md).
