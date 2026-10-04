# 1. Document structure

Depends on: §0.

## 1.1 Encoding

A document is text encoded as UTF-8. Bytes that are not valid UTF-8 are
not a document: a reader MUST report them and read nothing, and a writer
MUST NOT rewrite them (§1.3).

Chord symbols use a few non-ASCII characters by convention (`°`, `∆`, `ø`,
`♭`, `♯`, `−`); every one has an ASCII spelling that means the same (§5.3).
An author may use either, and canonicalising keeps the one used (§8). A
document that uses only ASCII is complete.

## 1.2 File names

A document is a file named `<name>.cifra.md`. The final `.md` is what makes
every Markdown tool treat it as Markdown; the `.cifra` before it is what
lets a person or a program tell a song from the other Markdown in a
repository without opening it.

A reader MUST accept a document whatever its name, since text arrives by
paste and by link as often as by file. A writer that chooses a file name
MUST use the convention. A tool that looks for songs in a directory SHOULD
look for `*.cifra.md` and MAY also look inside other `.md` files.

## 1.3 Text and lines

This section is the text layer of every file this specification defines,
songs and setlists alike (§10.2). Before anything else is read, a reader
prepares the text in this order:

1. If the bytes are not valid UTF-8, the file is not a document. A reader
   MUST report it and read nothing; a writer MUST NOT rewrite it.
2. Every U+FEFF is removed. At the start of the text it is a byte order
   mark; anywhere else it is an invisible character that, were it kept,
   could come to begin a canonical text and then be taken for a byte
   order mark.
3. The text is normalised to Unicode Normalization Form C (NFC).
4. The text is split into lines. A line ends at LF, at CR LF, or at a CR
   not followed by LF; the terminator is not part of the line. A final
   line without a terminator is a line; a terminator at the very end does
   not begin another one. A lone CR ends a line because that is how
   CommonMark reads it, and where a line begins decides what it is.
5. Every tab (U+0009) is replaced by one space.
6. Spaces at the end of each line are removed.

Throughout this specification, **space** and **whitespace** mean U+0020
and nothing else. A no-break space, an ideographic space or any other
character Unicode calls whitespace is an ordinary character: it is never
trimmed and never separates anything. This is deliberate: which
characters count as whitespace differs between programming languages, and
a rule that depended on it would let two readers disagree.

A **blank line** is a line that is empty after step 6.

A tab becomes one space, not the run of spaces to the next tab stop,
because on a sung line columns are counted in characters (§4.4): a tab
already counted as one column, and replacing it with one space keeps every
chord over the syllable it was read over. What the author saw in an editor
that expands tabs may differ; tabs are best not used in a chart.

Leading spaces are significant on sung lines and lyric lines, where they
are columns (§4.4), in notes and inside verbatim fences, where Markdown
gives them meaning, and nowhere else. A line that is a Markdown heading,
a fence, the rule or a list item (a property or a voicing) is recognised
with up to three spaces before it, as CommonMark recognises it; four or
more make it something else, usually notes. Canonical form writes these
lines with none (§8.4).

## 1.4 Title and properties

A document MAY begin with its title, and the title MAY be followed by a
list of properties. Together they are the document's **metadata**.

```
# Garota de Ipanema
- artist: Tom Jobim
- notation: brazilian

## Intro
```

### 1.4.1 Title

The title is a level-1 Markdown heading (§1.7.1), a single `#` followed
by a space and the title text, and it is the first non-blank line of the
document. Its text is read as every heading's is: trimmed, without a
closing sequence, runs of spaces collapsed to one. A level-1 heading
anywhere else is a section heading, so the title is the only construct
that is recognised by its position.

A document need not have a title. A reader MUST NOT require one. A title
whose text is empty, `#` alone, is no title: the line is read as the
title line and the document has no title.

### 1.4.2 Properties

The properties are a Markdown list immediately following the title. A
**list item** is a line that begins with up to three spaces, then `-`,
`*` or `+`, then one or more spaces or the end of the line; its content
is the rest of the line. The list ends at the first non-blank line that
is not a list item. Blank lines between the title and the list, and
between items, are permitted.

- An item is a property if its content is a key, zero or more spaces,
  `:`, and then either the end of the line or one or more spaces followed
  by the value. The key is one or more ASCII letters, digits, `-` and
  `_`, compared case-insensitively and held in lower case; the value is
  everything after those spaces, possibly empty.
- The space after the colon is required, so that `- https://example.com`
  is not read as the key `https`. A list item that is not a property is
  reported, and it is not kept: canonical form does not write it.
- Properties keep the order in which their keys first appear. If a key
  repeats, the last value wins, at the position of the key's first
  appearance; a reader reports the repetition, because the earlier value
  will not be written back.
- `*` and `+` are accepted as the list marker, since Markdown allows them.
  Canonical form writes `-` (§8.4.2).
- A property list MAY appear without a title, as the first non-blank lines
  of the document.
- A reader MUST NOT require any property.

Values are strings. There are no lists, nesting or quoting rules; a value
that needs structure belongs in an application's own key.

### 1.4.3 Reserved properties

| Key | Meaning |
|---|---|
| `artist` | Who the song is by. Free text. |
| `notation` | The dialect the chart's symbols are written in: `brazilian`, `american` or `realbook` (§5.6). Affects only the four ambiguous spellings. Default `brazilian`. |
| `language` | BCP 47 tag for the words, when the song has them. Informative. |
| `key` | The song's key, as a chord symbol root with `m` for minor: `G`, `Em`, `Bb`. Informative: it changes nothing a reader does. |
| `capo` | Where the song is commonly played with a capo, as a fret number: `2`. Informative: the arrangement itself is in the voicing blocks, where a capo is a tuning (§6.3). |
| `tempo` | Beats per minute: `96`. Informative. |
| `time` | Time signature: `4/4`, `3/4`, `6/8`. Informative. |
| `words` | `yes` or `no`: whether the document is to be read as sung (§4.2), overriding the rule that decides it from the text. |

The value of `notation` compares case-insensitively: `American` is
`american`. A reader given any other value MUST fall back to `brazilian`
and MUST report that it did, where the person who wrote the document will
see it, because the fallback changes which chord `C7+` is.

The title is not a property; it is the heading. Any other key is
application-defined. A reader MUST keep keys it does not know, and a
writer MUST write their values back unchanged; the key itself is written
in lower case (§8.4.2).

A document that uses one of the four ambiguous spellings (§5.6) SHOULD
declare `notation`.

## 1.5 The two parts

After the metadata, the document is two parts:

1. The **chart**: every line up to the first rule.
2. The **voicings part**: every line after it.

A document with no rule is all chart, and has no voicings. A document whose
chart is empty and which has voicings is well-formed but says nothing a
reader can play.

What a line means depends on which part it is in. A heading in the chart
names a section; a heading in the voicings part names a voicing block. This
is the only thing the rule does, and it is why the voicings heading does not
need to be recognised by its words.

In the chart, the music itself is written inside fences (§1.9). A section is
a heading, then notes and fences in any order.

## 1.6 The rule

The rule is a line consisting of three or more `-` characters and nothing
else, after up to three spaces (§1.3).

```
---
```

The first rule in the document, outside any fence (§1.9), ends the chart.
A later rule divides nothing: a reader MUST report it and otherwise
ignore it, and canonical form does not write it. A line of hyphens inside
a fence is not a rule; it is an unknown token (§2.9). Canonical form
writes exactly one rule, with a blank line before it (§0.5, §8.4.6).

A rule is never a chord. `---` does not occur in the chord grammar, so there
is no conflict; this sentence exists so that a reader need not consider it.

## 1.7 Headings

A heading is a line in one of three forms. In the chart it names a section
(§1.8). In the voicings part only the first form is used, and it names a
voicing block (§7.2).

### 1.7.1 Markdown heading

As CommonMark defines an ATX heading: up to three spaces, then one to six
`#`, then either the end of the line or one or more spaces followed by the
heading's content. `##Verse`, with no space, is not a heading, and neither
is a line of seven `#`s; both are notes.

The heading's **text** is its content with the spaces around it removed,
then without a closing sequence, then with every run of spaces collapsed
to one space. A **closing sequence**, as in CommonMark, is a run of `#`
at the end of the content that is preceded by a space or is the whole
content: `## Verse ##` is *Verse*, `## C#` is *C#*, `## C# #` is *C#*,
and `## #` is a heading whose text is empty.

```
## Verse
## Chorus
```

A Markdown heading is recognised only outside a fence (§1.9). Heading
level is significant in one place only: a level-1 heading that is
the first non-blank line of the document is the title (§1.4.1). Every other
Markdown heading, of any level, is a section heading in the chart or a
block heading in the voicings part. Canonical form writes those at level
2, `##`, so that the document's outline reads as title, then sections, in
any Markdown tool (§8.4.3); the level is not part of the model. Levels
deeper than two are accepted and reserved: a reader MUST treat `###` as
`##` in this version.

### 1.7.2 Bracket heading

A line beginning with `[`, a name, `]`. This is how a cifra names its
sections, and it is accepted so a pasted cifra reads without editing.

```
[Intro]
[Intro] G  D  Em  C
```

The name is what is between the brackets, trimmed, with runs of spaces
collapsed to one. It MUST be non-empty and MUST NOT consist only of
digits, so that a footnote marker standing at the start of a line is never
mistaken for a heading. Anything after the `]` and the spaces after it, on
the same line, is read as a line of its own belonging to the new section:
usually a chord line, but it may be another bracket heading,
`[Intro] [Verse]`, or a count that is the section's (§1.7.4).

A bracket heading is recognised only inside a fence in the chart (§1.9):
it is how a cifra pasted whole names its sections. Outside a fence, a line
in brackets is notes.

### 1.7.3 Label heading

A line whose first word ends in `:`, where everything after the colon is
chart items that are not unknown tokens (chords, no-chord marks, repeat
signs, beat marks, counts, group marks, §2.3) or nothing.

```
Intro: Fm  Fm/D#
Chorus:
```

This is the other way a cifra names a section. The condition that what
follows the colon be chords is what keeps a lyric line containing a colon
from being read as a heading. The first word (the label) MUST NOT contain
whitespace, `:` or `|`.

A label heading is recognised only inside a fence in the chart, and only
on a line that is not a bracket heading. A line of words that happens to
fit the pattern, `Amor: A`, is forced to read as words with a leading `>`
(§4.3), which is the same marker that settles every other line no rule can
call.

A cifra copied from the web opens with header lines in this shape: `Tom: G`
for the key, `Capo: 2`. Inside a fence they read as sections called *Tom*
and *Capo*. A reader MUST report a label heading whose whole content is a
single chord, saying that a key belongs in the properties as `- key: G`
(§1.4.3). The heading is still read as written.

### 1.7.4 Bar number and count on a heading

A heading's text MAY end with `@` and a number: `## A second time @1`. The
number is removed from the section's name and becomes the section's
*anchor*, the bar number of its first bar (§2.8).

It MAY also end with a count (§3.3): `## Refrão x2`, `[Refrão] (2x)`,
`## Chorus bis`. The count is removed from the name and becomes the
section's *times*: the whole section is played that many times. Both may
be present, in either order: `## A @9 x2`.

This applies to the Markdown and bracket forms; for a bracket heading the
count may also stand after the `]`, `[Refrão] (2x)`. A label heading's
name is one word and carries neither: `@9:` is a section called *@9*.

## 1.8 Sections

A heading in the chart opens a new section whose name is the heading's text
(after removing an anchor, §1.7.4). Everything until the next heading or
the rule belongs to it: its fences hold its music (§1.9), and its other
lines are its notes.

Music and notes before the first heading belong to a section with the empty
name. A reader MUST keep them; they are as much a part of the song as any
other line.

A section with no lines is still a section: a heading alone names a part of
the song the author has not written out, and a reader MUST keep it so that a
writer can round-trip it.

Section names are free text. They have no reserved values; `Voicings` as a
section name in the chart is just a section called Voicings.

## 1.9 Fences and notes

The music of the chart, its chord lines and lyric lines, is written inside
Markdown fenced code blocks. As in CommonMark, a fence opens at a line of
up to three spaces, then three or more backticks or three or more tildes,
then an optional **info string**; a backtick fence's info string may not
contain a backtick. The block runs to the next line that is up to three
spaces and then a run of the same character at least as long as the
opening one, with nothing after it.

````
## Verse
```
G           D
When I first saw you
Em              C
walking down the road
```
````

Inside a fence:

- every line is music: a chord line, a lyric line, a cifra-style heading
  (§1.7.2, §1.7.3) or blank (§2, §4);
- nothing is a Markdown heading, the rule, a list item or notes, whatever
  it looks like.

Outside a fence, in the chart, every line that is not a Markdown heading,
a fence or the rule is **notes**: free text for whoever reads the sheet.
A reader MUST keep notes as they read them (§1.3), attached to the section
they are in and in their position relative to the section's fences, and
MUST NOT interpret them. Blank lines at either end of a run of notes are
not part of it. Canonical form writes notes back line for line, with each
run of blank lines inside them as one blank line (§8.4.3).

Rules:

- A section MAY contain any number of fences, and its music is the
  concatenation of their lines in order. A fence MAY contain several
  sections, when cifra-style headings inside it open them.
- A fence's info string, trimmed and with its ASCII letters in lower
  case, decides what the fence holds. Empty, or `cifra`, is music.
  Anything else is **verbatim**: a block of text kept as it is, line for
  line, blank lines included, shown in a monospaced face, and not read as
  music. `tab` is the name to use for tablature, `strum` for a strumming
  pattern; a reader does not interpret either in this version. Canonical
  form writes a bare fence for music, and the info string as read for a
  verbatim fence, with a fence long enough that no line inside closes it
  (§8.4.3).
- A fence with nothing in it is kept, as an empty part of its section. A
  fence whose first non-blank line is a cifra-style heading holds nothing
  for the section before it.
- Inside a music fence, a line beginning with `//` is an **annotation**:
  free text kept in its place among the lines, shown as text, never read as
  chords or words, and counted neither as a bar nor towards whether the
  document is sung. `// repete o refrão` between two verses is the use.
- A fence that is not closed runs to the end of the document, and the
  blank lines at the end of the document are not part of it. A reader
  MUST report it. Canonical form closes it after its last line (§8.4.3).
- Fences are not recognised in the voicings part. A fence there is notes.
- A chart with no fence at all, one of whose notes lines would read as a
  chord line, is almost always a paste that was never fenced. A reader MUST
  report it, naming the first such line and saying that music goes between
  fences. A chart that has at least one fence is not checked: its notes are
  notes.
- `~~~` is a fence as much as ` ``` ` is, and is easier to type on a
  keyboard where the backtick is a dead key.

The fence is what makes the document render: a Markdown viewer sets the
block in a monospaced face and keeps its line breaks, so the chords stay
over the syllables they were written over. It is also what makes the
format safe to annotate: anything a reader cannot parse is, by position,
not music.

## Open questions

Deferred to a later version:

- Whether `###` should one day nest sections (a *Verse* with *a* and *b*
  halves). Reserved for that reason.
- Whether a `tab` or `strum` fence should one day be read rather than kept
  verbatim.
