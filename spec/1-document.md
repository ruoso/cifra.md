# 1. Document structure

Depends on: §0.

## 1.1 Encoding

A document is text encoded as UTF-8. A reader MUST accept a leading byte
order mark and ignore it.

Chord symbols use a few non-ASCII characters by convention (`°`, `∆`, `ø`,
`♭`, `♯`, `−`); every one has an ASCII spelling that means the same (§5.3).
A writer MAY use either. A document that uses only ASCII is complete.

## 1.2 Lines

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

## 1.3 Front matter

A document MAY begin with a front matter block: a line consisting of exactly
`---` as the very first line, then lines of `key: value`, then a line of
exactly `---`. This is the convention shared by Jekyll, Hugo, Obsidian and
pandoc, so a document with front matter renders as expected in those tools.

```
---
title: Garota de Ipanema
artist: Tom Jobim
notation: brazilian
---
```

Rules:

- The opening `---` MUST be the first line of the document. A `---` anywhere
  else is the rule (§1.5), never front matter.
- Each line between the fences is `key: value`. The key is one word of
  letters, digits, `-` and `_`, case-insensitive; the value is the rest of
  the line, trimmed. A reader MUST ignore a line it cannot read as a pair
  and MUST NOT fail on it.
- Keys are unique. If a key repeats, the last value wins.
- A reader MUST NOT require any key. A document with no front matter is
  complete.

The front matter is deliberately not full YAML. Values are strings; there are
no lists, nesting or quoting rules. An implementation that parses it with a
YAML library MUST treat every value as a string.

### 1.3.1 Reserved keys

| Key | Meaning |
|---|---|
| `title` | The song's title. |
| `artist` | Who the song is by. Free text. |
| `notation` | The dialect the chart's symbols are written in: `brazilian`, `american` or `realbook` (§5.6). Affects only the three ambiguous spellings. Default `brazilian`. |
| `language` | BCP 47 tag for the words, when the song has them. Informative. |

Any other key is application-defined. A reader MUST keep keys it does not
know; a writer MUST write them back unchanged.

A document that uses one of the three ambiguous spellings (§5.6) SHOULD
declare `notation`.

## 1.4 The two parts

After the front matter, the document is two parts:

1. The **chart**: every line up to the first rule.
2. The **voicings part**: every line after it.

A document with no rule is all chart, and has no voicings. A document whose
chart is empty and which has voicings is well-formed but says nothing a
reader can play.

What a line means depends on which part it is in. A heading in the chart
names a section; a heading in the voicings part names a voicing block. This
is the only thing the rule does, and it is why the voicings heading does not
need to be recognised by its words.

## 1.5 The rule

The rule is a line consisting of three or more `-` characters and nothing
else, with optional surrounding whitespace.

```
---
```

The first rule in the document (not counting the front matter fences) ends
the chart. A reader MUST ignore any later rule. A writer MUST emit exactly
one, and MUST put a blank line before it (§0.5).

A rule is never a chord. `---` does not occur in the chord grammar, so there
is no conflict; this sentence exists so that a reader need not consider it.

## 1.6 Headings

A heading is a line in one of three forms. In the chart it names a section
(§1.7). In the voicings part only the first form is used, and it names a
voicing block (§7.2).

### 1.6.1 Markdown heading

One or more `#`, then optional whitespace, then the heading text, to the end
of the line.

```
# Verse
## Chorus
```

The number of `#` is not significant in this version. A reader MUST treat
every level alike. A writer SHOULD use one `#`.

Trailing `#`s, which CommonMark permits as a closing sequence, are part of
the text in cifra.md. A writer MUST NOT emit them.

### 1.6.2 Bracket heading

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

A bracket heading is recognised only in the chart.

### 1.6.3 Label heading

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

A label heading is recognised only in the chart, and only on a line that is
not a Markdown heading or bracket heading.

### 1.6.4 Bar number on a heading

A heading's text MAY end with `@` and a number: `# A second time @1`. The
number is removed from the section's name and becomes the section's
*anchor*, the bar number of its first bar (§2.7). This applies to all three
forms.

## 1.7 Sections

A heading in the chart opens a new section whose name is the heading's text
(after removing an anchor, §1.6.4). Every following line until the next
heading or the rule belongs to it.

Lines before the first heading belong to a section with the empty name. A
reader MUST keep them; they are as much a part of the song as any other
line.

A section with no lines is still a section: a heading alone names a part of
the song the author has not written out, and a reader MUST keep it so that a
writer can round-trip it.

Section names are free text. They have no reserved values; `Voicings` as a
section name in the chart is just a section called Voicings.

## Open questions

- Whether `#` level should become significant, with `#` as the song title
  and `##` as sections. This draft puts the title in front matter instead,
  so that existing documents using `# Verse` keep their meaning.
