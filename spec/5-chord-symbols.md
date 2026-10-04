# 5. Chord symbols

Depends on: §0. Used by §2 (to recognise a chord token) and §7 (keys).

A chord symbol is the spelling of a chord: `Cm7`, `G/B`, `F#°`, `Bb7M(9)`.
There are several living conventions for spelling chords. Players mix them
freely, and most spellings do not conflict, so this format defines **one
permissive grammar** that reads them all, a **canonical model** that every
spelling maps to, and three **notation dialects** that matter only where
spellings genuinely collide.

A reader MUST keep a symbol as written. The model is what a symbol means,
not what a writer rewrites it to.

## 5.1 Shape of a symbol

```
symbol  = root body [ "/" bass ]
```

A symbol has no whitespace. Case is significant everywhere and MUST NOT be
normalised: `CM7` is a major seventh, `Cm7` a minor seventh.

### 5.1.1 Root

A letter `A` to `G`, followed by an optional accidental: `#` or `♯` (sharp),
`b` or `♭` (flat), `##` (double sharp), `bb` (double flat).

`Bb` is B flat. `B` is B. The letter is uppercase: `bb`, `am` and `e7` are
not chords. Nobody writes a chord that way, and ruling it out is what keeps
the lyric words *a*, *e* and *be* from reading as chords (§4.1).

### 5.1.2 Bass

A trailing `/` followed by a note name (a root as in §5.1.1) names the bass
note of a slash chord: `C/E`, `Am7/G`. The bass is the lowest sounding note
and may or may not be a chord tone.

`/` is overloaded. Followed by a note name at the end of the symbol it is a
slash bass; followed by a digit it is part of the body (`C6/9`). A symbol
may have both: `C6/9/E`. A `/` followed by nothing is an error.

### 5.1.3 Body

Everything between the root and the bass. It is a sequence of the elements
in §5.3. The empty body is a major triad.

## 5.2 The canonical model

Every valid symbol denotes exactly one chord:

```
Chord
  root        letter + accidental (spelled; Db and C# are different roots)
  quality     major | minor | dim | aug | sus2 | sus4 | power
  extensions  set of (degree, alter), degree in {2, 4, 6, 7, 9, 11, 13},
              alter in semitones (-2 .. +2); at most one entry per degree
  bass        letter + accidental, or none
```

The quality gives the chord's base tones:

| Quality | Tones |
|---|---|
| major | 1 3 5 |
| minor | 1 ♭3 5 |
| dim | 1 ♭3 ♭5 |
| aug | 1 3 ♯5 |
| sus2 | 1 2 5 |
| sus4 | 1 4 5 |
| power | 1 5 |

Each extension adds its degree, altered by `alter` semitones from the
degree's position in the major scale of the root. A degree already in the
base (5, say) with an alteration in the extensions replaces the base tone.

The model is **dialect-free**. `C7M`, `Cmaj7`, `CM7` and `C∆7` all denote
`{root C, major, {(7, 0)}}`. This is what lets a document written in one
convention be read by someone who uses another.

Two chords are **the same chord** when root, quality, extensions and bass
are all equal. Roots compare by spelling: `Db` and `C#` are different
chords that sound alike. A reader MAY additionally offer enharmonic
matching.

### 5.2.1 Normalisation into the quality

Two alterations define a triad rather than extend one, and the model folds
them into the quality so that chords which sound and function alike compare
equal:

- minor with ♭5 → dim (so `Cm7b5` is `{dim, {(7, -1)}}`, the half-diminished
  seventh);
- major with ♯5 → aug (so `C7#5` is `{aug, {(7, -1)}}`).

A ♭5 on a dim chord, or ♯5 on an aug chord, is redundant and dropped.

## 5.3 Elements of the body

Elements are read left to right. Each is listed with its spellings and its
effect on the model. Where an element has a Brazilian spelling, an American
spelling and a Real Book spelling, all are accepted by every reader; the
dialect (§5.6) matters only for the four cases marked *ambiguous*.

Whitespace, commas and round brackets inside the body are separators and
grouping with no meaning of their own: `C7(9)`, `C7 9` and `C7,9` are the
same, and `Cm7(b5)` is `Cm7b5`. A writer MAY use brackets for readability.

### 5.3.1 Quality words

At most one, and it comes first in the body. Absent, the quality is major.

| Spellings | Quality |
|---|---|
| `m`, `min`, `-`, `−`, `–` | minor |
| `dim`, `°`, `º` | dim (see §5.6 for a bare `°`) |
| `aug`, `+` | aug |
| `sus2` | sus2 |
| `sus4`, `sus` | sus4 |
| `4`, as the first element | sus4 (Brazilian: `C4`); later, see §5.6 |
| `5`, as the only element | power chord (`C5`) |
| `ø`, `Ø` | dim, with a minor seventh: the half-diminished seventh |

`-` is minor only in first position. After a degree it is a lowering (§5.3.4).
Likewise `+` is aug only in first position; after a degree it raises that
degree. `°` after a degree lowers it (`5°` is ♭5).

### 5.3.2 Major-seventh words

`maj`, `Maj`, `MAJ`, `M`, `∆`, `Δ` state that the seventh is major.
Followed by a degree (`maj7`, `maj9`, `M13`) they apply to that stack;
alone (`CM`, `C∆`) they mean a major seventh chord. Brazilian writes the same
thing after the degree: `7M` (§5.3.4).

`m` followed by one of these is the minor-major seventh: `Cm(maj7)`,
`CmM7`, `Cm7M`, `C−∆7`.

### 5.3.3 The top degree

One of `6`, `7`, `9`, `11`, `13`, stating how far the chord is stacked.

| Top | Adds |
|---|---|
| `6` | 6 |
| `7` | 7 |
| `9` | 7, 9 |
| `11` | 7, 9, 11 |
| `13` | 7, 9, 13 (the 11th is conventionally omitted) |

The seventh added by a top of 7 or more is: major (0) if a major-seventh
word is present; diminished (−2) if the quality is dim (`C°7`, `Cdim7`);
minor (−1) otherwise. So `C7` is the dominant seventh, `Cm7` the minor
seventh, `Cmaj7` the major seventh, `C°7` the diminished seventh and `Cø7`
the half-diminished seventh.

A bare `9` with no seventh otherwise stated is *ambiguous* (§5.6).

### 5.3.4 Degree modifiers

Any number, in any order, after the top degree or in place of one. Each
names a degree in {2, 4, 5, 6, 7, 9, 11, 13}.

| Spelling | Effect |
|---|---|
| `#d`, `♯d` | add degree d, raised a semitone |
| `bd`, `♭d` | add degree d, lowered a semitone |
| `d+` | add degree d raised (`5+`, `9+`); except `7+`, which is *ambiguous* (§5.6) |
| `d-`, `d−`, `d°` | add degree d lowered (`5-`, `9-`, `5°`) |
| `7M` | the seventh is major |
| `7m` | the seventh is minor |
| `add d`, `addd` | add degree d unaltered, without implying a seventh (`add9`, `add2`, `add11`) |
| `6/9` | add 6 and 9, no seventh |
| `d/e` | a `/` between two degree elements is a separator, like a comma or brackets: `Am7/9` is `Am7(9)`, `C7/9-` is `C7(9-)`, `Cm7/5-` is `Cm7(5-)`. Brazilian cifras write it constantly. A `/` followed by a note name is a bass (§5.1.2) |
| `alt` | the altered dominant: ♭7, ♭9 and ♯5 |

A plain degree other than the top (`C7(9)`, `C7 13`) adds that degree
unaltered. In a parenthesised list after a seventh, `(9)`, `(9 13)`,
`(b9 #11)` are the usual way to write this.

`#` and `b` always *precede* the degree they alter, so in `maj7#11` the
sharp belongs to the 11th. `+`, `-` and `°` *follow* theirs, unless a degree
also follows, in which case they precede it: `C7+9` is a seventh with a
raised ninth, `C7(5+)` a seventh with a raised fifth.

### 5.3.5 Examples

| Symbol | Tones |
|---|---|
| `C` | C E G |
| `Cm` | C E♭ G |
| `C7` | C E G B♭ |
| `C7M`, `Cmaj7`, `CM7`, `C∆7` | C E G B |
| `C6` | C E G A |
| `Cm6` | C E♭ G A |
| `C5` | C G |
| `C4`, `Csus4`, `Csus` | C F G |
| `Csus2` | C D G |
| `C+`, `Caug` | C E G♯ |
| `Cdim` | C E♭ G♭ |
| `C°7`, `Cdim7` | C E♭ G♭ B♭♭ |
| `Cm7(5-)`, `Cm7b5`, `Cø7` | C E♭ G♭ B♭ |
| `Cmaj7#11` | C E G B F♯ |
| `C7b9`, `C7(9-)` | C E G B♭ D♭ |
| `C7#5`, `C7(5+)` | C E G♯ B♭ |
| `C13` | C E G B♭ D A |
| `C11` | C E G B♭ D F |
| `Cm(maj7)`, `Cm7M` | C E♭ G B |
| `C7M9`, `Cmaj9` | C E G B D |
| `C6/9` | C E G A D |
| `Cadd9` | C E G D |
| `C/E` | C E G over E |
| `Am7/G` | A C E G over G |

## 5.4 Errors

A symbol that does not fit the grammar is not a chord. A reader MUST report
the failure rather than guess, and MUST NOT throw away the text: in a chart
the token becomes an unknown token (§2.9).

These are not chords: an empty string; `H7` (no such letter); `7` (no
root); `C##bb7` (two accidentals); `Cmaj/` (a bass with no note); `xyz`.

## 5.5 Spelled tones

A reader that resolves a chord to tones MUST spell them from the root, not
from pitch class: `#11` on C is F♯, `b5` on C is G♭, and the seventh of
`C°7` is B♭♭. Degree *d* altered by *a* is the letter *d − 1* steps above the
root's letter, with the accidental that makes it *a* semitones from the
major-scale degree. This is what keeps `Db7` from coming out as `C# F G#`.

## 5.6 Notation dialects and the four ambiguities

Three dialects are named. Each is a *default reading* for the four
spellings below and a *preferred spelling* for writers (§5.7). Everything
not in this table means the same thing in every dialect.

| Spelling | `brazilian` | `american` | `realbook` | The other reading |
|---|---|---|---|---|
| `7+` (`C7+`) | major seventh: `C7M` | dominant seventh with ♯5: `C7#5` | as american | whichever was not chosen |
| bare `9` with no seventh stated (`C9`) | added ninth, no seventh: `Cadd9` | dominant ninth, ♭7 included | as american | the other |
| bare `°` with no seventh stated (`B°`) | diminished seventh: `B°7` | diminished seventh | diminished seventh | the diminished triad, `Bdim` |
| `4` after a stated degree, on a major triad (`C7(4)`) | suspended fourth: `C7sus4` | added fourth: `C7add4` | as american | the other |

`C7+` is the dangerous one: three identical characters, two chords
differing by a semitone in two places. A literally sharpened seventh would
be an octave, so Brazilian notation reuses `7+` for the major seventh;
American reads the `+` as the augmented fifth.

`B°` is the deceptive one. Read strictly it is a diminished triad, but in
practice the symbol nearly always means the diminished seventh, and the
shape every guitarist knows for it has the diminished seventh in it. So a
bare `°` reads as the seventh in every dialect, the word `dim` is the triad,
and `°7` and `dim7` are unambiguous.

`C7(4)` is the Brazilian suspended chord: a cifra writes `C7(4)` for what
American notation spells `C7sus4`. The suspended reading applies only when
the triad is major, since a suspension replaces a major third; `Cm7(4)` is
an added fourth in every dialect and is not reported. `add4` and `sus4`
spelled out are never ambiguous.

Rules:

- The document's dialect is the `notation` property (§1.4.3), or
  `brazilian` if absent.
- A reader MUST apply the document's dialect to these four spellings and
  MUST report that it did, so that an application can show which reading
  was taken and offer the other.
- A reader MUST NOT apply the dialect to anything else.
- A writer SHOULD avoid the four spellings and write the unambiguous
  form: `C7M` or `Cmaj7`, `Cadd9` or `C7(9)`, `B°7` or `Bdim`, `C7sus4` or
  `C7add4`. A writer that emits one of them MUST declare `notation`.
- Where a spelling is unclear, the format's answer is the same: the
  document says which notation it is in, and the reader follows it.

Spellings that look ambiguous but are not: `5+` and `9+` are plain sharps;
`C7(9)`, `Cmaj9` and `Cadd9` each state their seventh or its absence; `C4`
in first position is sus4 everywhere (§5.3.1).

## 5.7 Preferred spellings

A writer that produces a symbol *from the model* (as opposed to copying one
the author wrote) SHOULD use the document's dialect:

| Chord | `brazilian` | `american` | `realbook` |
|---|---|---|---|
| major seventh | `C7M` | `Cmaj7` | `C∆7` |
| minor seventh | `Cm7` | `Cm7` | `C−7` |
| half-diminished | `Cm7(5-)` | `Cm7b5` | `Cø7` |
| diminished seventh | `C°` | `Cdim7` | `C°` |
| diminished triad | `Cdim` | `Cdim` | `Cdim` |
| augmented | `C+` | `C+` | `C+` |
| suspended fourth | `C4` | `Csus4` | `Csus4` |
| raised or lowered degree | `C7(9-)`, `C7(5+)` | `C7b9`, `C7#5` | `C7b9`, `C7#5` |
| added ninth | `C(9)` | `Cadd9` | `Cadd9` |
| slash bass | `C/E` | `C/E` | `C/E` |

The contract on a writer's formatter is the round trip: for every chord *c*
and dialect *d*, reading `format(c, d)` under *d* gives *c*. A formatter
MUST NOT emit a spelling the grammar of §5.3 does not accept.

## Open questions

Deferred to a later version:

- Solfège roots (`Dó7M`) and German `H`/`B` are note-name conventions, not
  quality conventions. The grammar separates the two axes, but this draft
  defines only letter names.
- Nashville and Roman numeral charts need a key context and are a different
  input mode, not a dialect. Out of scope for this draft.
