# 6. Tunings

Depends on: §0.

A tuning is the list of an instrument's open-string pitches. It is the whole
identity of an instrument as far as this format is concerned: a guitar in
drop D, a guitar with a capo at the second fret and a ukulele are three
tunings, and nothing else about the instrument is recorded.

```
E2 A2 D3 G3 B3 E4        guitar, standard
D2 A2 D3 G3 B3 E4        guitar, drop D
F#2 B2 E3 A3 C#4 F#4     guitar, capo 2
G4 C4 E4 A4              ukulele, re-entrant
E1 A1 D2 G2              bass
```

## 6.1 Pitches

A pitch is a note name followed by an octave number, in scientific pitch
notation: `E2`, `F#3`, `Bb1`, `C4`. Middle C is `C4`; `A4` is 440 Hz. The
octave number may be negative.

The note name is a root as in §5.1.1: a letter `A` to `G` and an optional
accidental `#`, `b`, `##`, `bb` (and the `♯`, `♭` forms). The accidental is
applied to the pitch, so `Cb4` sounds the same as `B3` and `B#3` the same as
`C4`.

The letter is uppercase, as in a chord symbol (§5.1.1).

## 6.2 Writing a tuning

A tuning is one or more pitches separated by commas, whitespace, or both.
All of these are the same tuning:

```
E2, A2, D3, G3, B3, E4
E2 A2 D3 G3 B3 E4
E2,A2,D3,G3,B3,E4
```

A writer SHOULD separate pitches with a single space, and MUST use the same
separator throughout one tuning.

The order is the order strings are written in a fret string (§7.5): the
first pitch is the string that gets the first fret. By convention that is
the lowest-pitched or thickest string, the one nearest the player's face,
but the format does not require pitches to ascend. A re-entrant tuning like
the ukulele's `G4 C4 E4 A4` is simply a tuning.

## 6.3 Identity

Two tunings are the same tuning when they have the same number of strings
and each string sounds the same pitch. Pitches compare by sound: `Eb2` and
`D#2` are the same string, as are `Cb4` and `B3`. Spacing, separators and
letter case never matter.

A reader MUST use this identity when matching a voicing block to an
instrument (§7.6). A writer MUST keep the spelling the document used when
writing a block back.

A capo is a tuning. Raising every string by the same amount is exactly what
a capo does, and a document arranged for "guitar, capo 2" has a block for
`F#2 B2 E3 A3 C#4 F#4`. Fret numbers in that block are then relative to the
capo, which is the convention capo users want. There is deliberately no
separate capo field.

The chart does not change for a capo. It names the harmony as it sounds
(§0.1, §7.1): a song in G says `G`, on every instrument. The capo'd block
voices that `G` with the frets a hand makes above the capo, which for a
capo at the third fret is the shape a guitarist calls *E*, `022100`. That
the shape is "an E shape" is a fact a reader can derive from the shape and
the tuning, and an application MAY show it beside the chord, the way it may
show that a shape sounds an inversion (§7.6.1). It is never written into
the text: the chart holds one name for the harmony, and the shape names
would have to be repeated for every capo'd tuning and would go stale the
moment a shape changed.

This is also why a document arranged for guitar with a capo and for
ukulele is coherent: both blocks voice the same `G`, each in its own
tuning.

## 6.4 What is not a tuning

A single pitch is a pitch, not a tuning. This matters nowhere in the current
draft but is stated so that a future extension cannot make `E2` ambiguous.
