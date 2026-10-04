# 1. Document structure

Depends on: §0.

## 1.1 Encoding

A document is text encoded as UTF-8. A reader MUST accept a leading byte
order mark and ignore it.

Chord symbols use a few non-ASCII characters by convention (`°`, `∆`, `ø`,
`♭`, `♯`, `−`); every one has an ASCII spelling that means the same (§5.3).
A writer MAY use either. A document that uses only ASCII is complete.

## 1.2 File names

A document is a file named `<name>.cifra.md`. The final `.md` is what makes
every Markdown tool treat it as Markdown; the `.cifra` before it is what
lets a person or a program tell a song from the other Markdown in a
repository without opening it.

A reader MUST accept a document whatever its name, since text arrives by
paste and by link as often as by file. A writer that chooses a file name
MUST use the convention. A tool that looks for songs in a directory SHOULD
look for `*.cifra.md` and MAY also look inside other `.md` files.

## 1.3 Lines

A document is a sequence of lines separated by LF. A reader MUST also accept
CRLF, treating the CR as trailing whitespace on the line. A final line
without a terminator is a line.

Trailing whitespace on any line is not significant. Leading whitespace is
significant only on sung lines, where it positions chords over words (§4.4);
everywhere else a reader MUST ignore it.

Tabs are permitted but discouraged. On a sung line a tab counts as one
column (§4.4), which is rarely what the author sees in their editor, so a
writer MUST NOT emit tabs and SHOULD replace them when editing a line.

A **blank line** is a line that is empty or contains only whitespace.

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

The title is a level-1 heading, `#` followed by the title text, and it is
the first non-blank line of the document. A level-1 heading anywhere else
is a section heading (§1.7.1), so the title is the only construct that is
recognised by its position.

A document need not have a title. A reader MUST NOT require one.

### 1.4.2 Properties

The properties are a Markdown list immediately following the title: each
line is `-`, a space, and `key: value`. The list ends at the first line that
is not a list item. Blank lines between the title and the list, and
between items, are permitted.

- The key is one word of letters, digits, `-` and `_`, compared
  case-insensitively. The value is the rest of the line after the colon,
  trimmed. A list item that is not `key: value` is reported and ignored.
- Keys are unique. If a key repeats, the last value wins.
- `*` and `+` are accepted as the list marker, since Markdown allows them.
  A writer MUST emit `-`.
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

The value of `notation` compares case-insensitively: `American` is
`american`. A reader given any other value MUST fall back to `brazilian`
and MUST report that it did, where the person who wrote the document will
see it, because the fallback changes which chord `C7+` is.

The title is not a property; it is the heading. Any other key is
application-defined. A reader MUST keep keys it does not know; a writer
MUST write them back unchanged.

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
else, with optional surrounding whitespace.

```
---
```

The first rule in the document, outside any fence (§1.9), ends the chart.
A reader MUST ignore any later rule. A line of hyphens inside a fence is
not a rule; it is an unknown token (§2.9). A writer MUST emit exactly
one, and MUST put a blank line before it (§0.5).

A rule is never a chord. `---` does not occur in the chord grammar, so there
is no conflict; this sentence exists so that a reader need not consider it.

## 1.7 Headings

A heading is a line in one of three forms. In the chart it names a section
(§1.8). In the voicings part only the first form is used, and it names a
voicing block (§7.2).

### 1.7.1 Markdown heading

One or more `#`, then optional whitespace, then the heading text, to the end
of the line.

```
## Verse
## Chorus
```

A Markdown heading is recognised only outside a fence (§1.9). Heading
level is significant in one place only: a level-1 heading that is
the first non-blank line of the document is the title (§1.4.1). Every other
Markdown heading, of any level, is a section heading in the chart or a
block heading in the voicings part. A writer MUST emit `##` for those, so
that the document's outline reads as title, then sections, in any Markdown
tool. Levels deeper than two are accepted and reserved: a reader MUST treat
`###` as `##` in this version.

Trailing `#`s, which CommonMark permits as a closing sequence, are part of
the text in cifra.md. A writer MUST NOT emit them.

### 1.7.2 Bracket heading

A line beginning with `[`, a name, `]`. This is how a cifra names its
sections, and it is accepted so a pasted cifra reads without editing.

```
[Intro]
[Intro] G  D  Em  C
```

The name MUST be non-empty and MUST NOT consist only of digits, so that a
footnote marker standing at the start of a line is never mistaken for a
heading. Anything after the `]` on the same line is a chord line belonging
to the new section.

A bracket heading is recognised only inside a fence in the chart (§1.9):
it is how a cifra pasted whole names its sections. Outside a fence, a line
in brackets is notes.

### 1.7.3 Label heading

A line whose first word ends in `:`, where everything after the colon is
chord tokens (§2.3) or nothing.

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

### 1.7.4 Bar number on a heading

A heading's text MAY end with `@` and a number: `## A second time @1`. The
number is removed from the section's name and becomes the section's
*anchor*, the bar number of its first bar (§2.8). This applies to all three
forms.

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
Markdown fenced code blocks. A fence is a line of three or more backticks
(or three or more tildes), with nothing else on it but an optional info
string; the block runs to the next line that is a fence of the same kind
and at least the same length.

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

Outside a fence, in the chart, every line that is not a Markdown heading or
the rule is **notes**: free text for whoever reads the sheet. A reader MUST
keep notes verbatim, attached to the section they are in and in their
position relative to the section's fences, and MUST NOT interpret them. A
writer MUST write them back unchanged.

Rules:

- A section MAY contain any number of fences, and its music is the
  concatenation of their lines in order. A fence MAY contain several
  sections, when cifra-style headings inside it open them.
- A fence's info string (` ```chords `) is ignored by this version and
  reserved. A writer MUST emit a bare fence.
- A fence that is not closed runs to the end of the document. A reader
  MUST report it. A writer MUST close every fence it opens.
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
- Whether the fence info string should select a dialect or a mode (a
  `tab` block, say) in a later version.
