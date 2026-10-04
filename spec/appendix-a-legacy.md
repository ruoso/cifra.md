# Appendix A. Legacy forms

Informative. These are spellings that documents written against earlier
versions of the format may contain. A reader MAY accept them; a writer MUST
NOT emit them, and a writer that reads one SHOULD convert it on the next
save as described.

## A.1 `# Tuning`

A heading `# Tuning` followed by one non-blank line naming a tuning, in the
voicings part or in the chart. It named the instrument the document's
single voicings block was for.

Conversion: the tuning becomes the tuning of every voicings block that has
none (A.2), and the heading and its line are removed.

## A.2 Unlabelled `# Voicings`

A heading `# Voicings` with nothing after it opened a block for the
instrument in use, which the document did not say. It was the only kind of
block in the earliest form, and a document had at most one.

Conversion: if the document has a `# Tuning` (A.1), that is the block's
tuning. Otherwise the tuning is the instrument the document is being opened
on, since that is where it was written. If the document also has a labelled
block for the same tuning, the labelled one's entries win for any key both
have.

## A.3 Other heading separators

Earlier readers accepted `# Voicings X`, `# Voicings for X`,
`# Voicings (X)`, `# Formas (X)`, `# Digitações - X` and `# Acordes – X`
as block headings, recognising them anywhere in the document by whether the
text after the label parsed as a tuning. This draft recognises block
headings by position after the rule, with a colon (§7.2).

Conversion: rewrite as `# <label>: <tuning>`. The label becomes the
variation's name, so `# Formas (G4 C4 E4 A4)` becomes a variation named
*Formas* for that tuning. If that is not wanted, the label is edited to
`Voicings` by hand.

## A.4 Block headings before any rule

Earlier documents could carry a block with no rule before it. Conversion:
insert the rule before the first block heading.

## A.5 Level-1 section headings

Earlier documents had no title and wrote every section as a level-1
heading, `# Verse`. Under §1.4.1 the first of those would now be read as
the title.

Conversion: demote every heading to level 2. An application that stores
its songs' titles outside the text, as explore-chords does, SHOULD write
the title in as a level-1 heading at the same time. A reader that knows a
document comes from such a store MAY apply this conversion on load; a
reader given an arbitrary file MUST NOT guess, because a one-section song
whose first line is `# Verse` is indistinguishable from a song titled
*Verse*.

## A.6 Unfenced music

Earlier documents had no fences: every line of the chart was music. A
reader MAY accept such a document by treating the whole chart as one fence
per section, in which case Markdown headings are still headings (they were
in the old form) and nothing is notes.

Conversion: wrap the music of each section in a fence.

## A.7 `key = frets` voicing lines

Earlier documents wrote a voicing as a bare line, `Cm[2] = 8-10-10-8-8-8`,
rather than a list item. A reader MAY accept the form. Conversion: rewrite
as `- Cm[2]: 8-10-10-8-8-8`.

## A.8 Several documents for one song

The earliest form produced a *separate copy* of a song per instrument. Two
copies are the same song if their charts are the same (same sections,
tokens and words, ignoring layout and voicings) and no tuning is voiced in
both. Such copies fold into one document holding every block. Anything that
has diverged, or that voices one tuning twice, is a conflict and is left for
a person to resolve.
