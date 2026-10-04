# 10. Setlists

Depends on: §0, the title and properties of §1.4, the fences of §1.9, and,
for the `key` property only, the roots of §5.1.1. Nothing in a setlist is
music, and a setlist reader reads no chart.

A **setlist** is an ordered list of songs, built for a gig, a lesson or a
rehearsal and played through in order. It is a file of its own, beside the
songs it names, and like a song it is Markdown: on any git host it renders
as a numbered list of links, each of which opens the song.

```
# Bar do Zé, 10 October

1. [Garota de Ipanema](bossa/garota-de-ipanema.cifra.md)
   - key: D
2. [Corcovado](bossa/corcovado.cifra.md)
3. [Carinhoso](choro/carinhoso.cifra.md)
   - note: start from the B section
```

The title is a level-1 heading, as in a song. Each numbered item is one
song: a link whose target is the song's file. Under an item, a list of
properties says what is particular to that song in this setlist: the key
the band plays it in, a note.

This chapter is self-contained in one respect the song chapters are not:
it defines a setlist's canonical form completely, byte for byte (§10.9).
A program can decide whether a setlist is canonical from its text alone,
without the songs it names.

## 10.1 Files and books

A setlist is a file named `<name>.setlist.md`, by the same convention as a
song (§1.2): the `.md` makes every Markdown tool treat it as Markdown, and
the `.setlist` before it tells a setlist from a song or from other Markdown
without opening it. A reader MUST accept a setlist whatever its name. A
writer that chooses a file name MUST use the convention. A tool that looks
for setlists in a directory SHOULD look for `*.setlist.md`.

A **book** is a directory of songs, and of setlists, treated as one
collection: in practice one git repository. A setlist belongs to the book
it is in, and **points only at songs in that same book**. Its targets are
relative paths, so the setlist keeps working wherever the book is: in a
clone, in a download, rendered on a git host. A link to a song in another
book, or anywhere else, is not a song of the setlist (§10.8).

The book's root is not written in the setlist. A reader that is given the
setlist together with its book knows it; one that is given only the text
(by paste, say) can read the setlist but resolves nothing (§10.8.1).

## 10.2 Text

A setlist's text is prepared exactly as a song's is, by the text layer of
§1.3, which is the same for every file this specification defines: a file
that is not valid UTF-8 is reported and never rewritten; then every
U+FEFF is removed, the text is normalised to NFC, it is split into lines
at LF, CR LF or a lone CR, every tab becomes one space, and spaces at the
end of each line are removed. **Space** means U+0020 and nothing else, and
a **blank line** is a line that is empty after this.

A lone CR ends a line because that is how CommonMark reads it, and in a
setlist what a line begins with decides what it is (§10.3), so a reader
and a Markdown viewer must agree on where lines begin.

## 10.3 Structure

Every line of a setlist is one of: the title, a property line, an item
line, an entry line, a notes line, or blank. A reader classifies lines in
this order:

1. **Fences.** A line that would otherwise be a notes line (step 6) and
   that opens a fence as §1.9 defines one, together with every line up to
   and including the line that closes it, is notes. A fence that is not
   closed runs to the end of the setlist, and a reader MUST report it.
   Nothing inside a fence is an item, an entry or a title, whatever it
   looks like.
2. **The title**: the first non-blank line, if it is a level-1 heading
   (§10.3.1).
3. **Property lines**: bullet lines immediately after the title, or at the
   start of a setlist with no title (§10.3.1).
4. **Item lines**: a number and a marker (§10.3.2), anywhere else.
5. **Entry lines**: bullet lines under an item (§10.3.3).
6. **Notes lines**: every other non-blank line (§10.3.4).

A **bullet line** is a line that begins with zero or more spaces, then
`-`, `*` or `+`, then either the end of the line or one or more spaces.
Its **content** is the rest of the line after those spaces.

An **entry** is the content of a bullet line under the title or under an
item. If the content is a key, zero or more spaces, `:`, and then either
the end of the line or one or more spaces followed by the value, the entry
is a **property**: the key is one or more ASCII letters, digits, `-` and
`_`, compared case-insensitively and held in lowercase, and the value is
everything after those spaces, possibly empty. Any other content is an
**unrecognised entry**, kept as written (§10.8.3).

The space after the colon is required so that a note such as
`- https://example.com/` is not read as the key `https` with the value
`//example.com/`. A song's properties follow the same rule (§1.4.2).

### 10.3.1 Title and properties

The title is the level-1 heading that is the first non-blank line of the
setlist, read as a song's title is (§1.4.1): after any leading spaces, a
single `#` not followed by another `#`. Its text is the rest of the line
after the `#` and the spaces after it, possibly empty. A setlist need
not have a title. A reader MUST NOT require one, and MAY name a setlist
without one by its file name. A `#` heading anywhere else, and a heading
of any other level anywhere, is notes: a setlist has no sections.

The setlist MAY have properties, as a song does: bullet lines immediately
after the title, or, when there is no title, as the first non-blank lines
of the setlist. Blank lines between the title and the list, and between
its lines, are permitted. The list ends at the first non-blank line that
is not a bullet line.

No setlist property is reserved in this version. Every key is
application-defined; a reader MUST keep each property and each
unrecognised entry, in order, and a writer MUST write them back (§10.9).
If a key repeats, the last value wins, at the position of the first; a
reader SHOULD report that the earlier value will not be written back.

### 10.3.2 Items

An **item line** is a line that begins with zero to three spaces, then one
to nine ASCII digits, then `.` or `)`, then either the end of the line or
one or more spaces. Its **content** is the rest of the line after those
spaces, possibly empty.

Each item line begins one **item**. The number written on it is ignored:
items are numbered 1, 2, 3 … in the order they appear, whatever was
written, and gaps, repeats and an order that is not ascending are not
errors. `1)` is accepted as well as `1.`, since Markdown allows it; a
writer emits `.`.

An item whose content is exactly one song link (§10.4) is a **song item**.
Any other item, a line of plain text, a link that is not a song link, a
link followed by more text, an empty item, is an **unlinked item**: its
content is kept as written, it is reported, and it is skipped when the
setlist is played (§10.8.3). A reader MUST NOT drop it, and MUST count it
in the numbering, so that the items keep their places.

A line with four or more spaces before the number is not an item line. In
Markdown it is code, or a list nested inside the item above; in a setlist
it is notes.

### 10.3.3 Entries under an item

A bullet line that follows an item line, with only blank lines and other
such bullet lines between them, is an entry of that item. Its indentation
does not matter: `- key: D` with no indentation directly under an item
belongs to the item, as does one indented by any number of spaces.

The entries of an item are its properties and its unrecognised entries.
The properties are defined in §10.7. If a key repeats under one item, the
last value wins, and a reader SHOULD report it.

A bullet line that follows a notes line is notes, not an entry: a list in
the notes is part of the notes.

### 10.3.4 Notes

Every non-blank line that is none of the above is a **notes line**: a
paragraph before the list, a remark between two sets, a line of text that
continues an entry without a bullet of its own. A run of notes lines, with
the blank lines between them, is a **notes block**.

A reader MUST keep notes verbatim, in their position among the items, and
MUST NOT interpret them: a link inside a notes line is not a song of the
setlist. A writer MUST write them back unchanged, except as §10.2 has
already normalised them.

Notes are allowed for the same reason they are in a song: a setlist is
written by people, and a line saying *second set* or *tune to the piano*
belongs in it. They are not structure. A setlist that needs to say
something about one song says it in that song's `note`.

HTML is not recognised. A line inside an HTML comment is read as it would
be anywhere else.

## 10.4 Links

A **song link** is item content of exactly this shape:

```
[text](target)
```

- It begins with `[`. The **text** runs to the first `]` that is not
  escaped and does not close a `[` opened inside the text. A `\` followed
  by an ASCII punctuation character is an escape: the two characters are
  part of the text, and the second neither opens nor closes anything. A
  `\` followed by anything else is an ordinary character.
- The `]` is followed immediately by `(`, and the content ends with `)`.
  Everything between the two is the **destination**. Nothing may follow
  the `)`.
- The destination is either **plain**: not beginning with `<`, containing
  no space and no ASCII control character, and with its unescaped `(` and
  `)` balanced; or **bracketed**: beginning with `<` and ending with `>`,
  with no unescaped `<` or `>` between them.
- The destination, once unescaped and decoded (§10.5), is a song path.

Content that does not have this shape is not a song link, and its item is
unlinked. In particular, a link title (`[A](a.cifra.md "A")`), a reference
link (`[A][a]`), an image (`![A](a.cifra.md)`), an autolink and a link
with more text after it are all unlinked items.

### 10.4.1 The text

The text is kept **as written**, character for character, escapes
included. It is Markdown source, and a reader does not interpret it; a
reader showing it MAY render it as inline Markdown.

The text is the song's title as the setlist's writer saw it. **The target
decides which song an item is; the text does not.** A reader showing a
song item SHOULD show the song's own title (§1.4.1), read from the song,
and uses the text only where it has no song to read: for an item whose
song is missing (§10.8.2), or when it was given no book.

The target is authoritative because it is the only part that can be
checked: it names one file, and the file says what its title is. The text
is there for Markdown viewers, which cannot open the song to find its
title, and as the last-known name of a song that has gone missing. A
song's title can change without any setlist that names it changing
(§10.9.3), and a reader must not take a stale text for the song.

## 10.5 Paths

A song link's destination is turned into a **path** in these steps. If
any step fails, the item is unlinked and the reader MUST report it, saying
which step failed.

1. **Unbracket and unescape.** A bracketed destination loses its `<` and
   `>`. Then each `\` followed by an ASCII punctuation character is
   replaced by that character.
2. **Not a URL.** The result MUST NOT begin with a URL scheme: an ASCII
   letter, then zero or more ASCII letters, digits, `+`, `-` and `.`, then
   `:`. It MUST NOT contain `?` or `#`, which would begin a query or a
   fragment. It MUST NOT begin with `/`. A link to a web page, an absolute
   path, `C:/…` and `bossa/a.cifra.md#verse` all fail here.
3. **Split.** The result is split at every `/` into segments. No segment
   may be empty: `a//b.cifra.md` and `bossa/` fail.
4. **Decode.** In each segment, every `%` followed by two hexadecimal
   digits, in either case, is replaced by the byte they name; every other
   character is replaced by its UTF-8 bytes, a `%` that is not followed by
   two hexadecimal digits included. The bytes MUST be valid UTF-8, and the
   decoded segment MUST NOT contain `/` or U+0000. The decoded segment is
   normalised to NFC.
5. **Remove dot segments.** The segments are taken from left to right. A
   segment `.` is dropped. A segment `..` drops the last segment kept so
   far, if there is one and it is not `..`, and is dropped with it;
   otherwise it is kept. Every other segment is kept. What is kept is the
   path: zero or more leading `..` segments, then one or more other
   segments. A `..` written as `%2E%2E` is a `..`, as it is to a browser.
   An empty result fails.
6. **A song.** The last segment MUST end in `.cifra.md`, compared exactly
   (case matters), and be longer than it.

The path is relative to the directory the setlist is in, with `/` between
segments, as a relative link in Markdown is to every git host. Dot
segments are removed by the text alone, without looking at the disk, as
RFC 3986 §5.2.4 removes them from a URL; whether a leading `..` climbs out
of the book is a question for resolution (§10.8.1), since it depends on
where the setlist is.

A `\` that is not an escape is an ordinary character of a file name, not a
separator. A reader SHOULD report a path containing one, since it is
usually a Windows path written by hand.

Character references (`&amp;`, `&#38;`) are not decoded in a destination,
although CommonMark decodes them: `&` is an ordinary character. A writer
never writes a literal `&` in a destination (§10.9.2), so a canonical
setlist means the same to a reader and to a Markdown viewer.

## 10.6 The model

A reader produces this structure. As with a song (§0.4), an implementation
may represent it however it likes, but a conforming reader must be able to
produce it, and a canonical writer (§10.9) must be able to take it back.

```
Setlist
  title           from the level-1 heading, or none ("" is a title)
  properties[]    entries under the title, in order (§10.3.1)
  body[]          items and notes blocks, in document order

Entry
  one of:
    Property      key (lowercase), value
    Unrecognised  text: the bullet line's content, as written

Item
  number          its position among the items, from 1
  one of:
    Song          text (as written), path (decoded, §10.5)
    Unlinked      content: the item line's content, as written
  entries[]       its properties and unrecognised entries (§10.3.3)

Notes
  lines[]         as written, blank lines inside the block included
```

The setlist also carries `diagnostics`: everything the reader had to
report, each with a line number. Resolution (§10.8) adds to each song item
the song it found or the reason it found none; that is not part of what
reading produces, and the canonical form does not depend on it.

## 10.7 Properties of an item

Two keys are reserved under an item.

| Key | Meaning |
|---|---|
| `key` | The key the song is played in from this setlist, written as a song's `key` property is (§1.4.3): a root as in §5.1.1, then `m` for minor or nothing for major. `D`, `Em`, `Bb`, `F#m`. |
| `note` | Free text about the song in this setlist, on one line: `start from the B section`, `capo 2 on the twelve-string`. |

Any other key is application-defined. A reader MUST keep it, and keep its
place among the item's unknown keys and unrecognised entries; a writer
MUST write it back (§10.9). This is the rule a song's properties follow
(§1.4.3).

### 10.7.1 The key

`key` is a **target key**, not an interval: `- key: D` means "play it in
D", and reads the same whatever key the song is written in. While a song
is played from this setlist, a reader that shows it transposed for reading
transposes it by the interval from the song's own `key` property to this
one. The song's file is not changed, and outside the setlist the song is
read as written.

The interval is from the song's root to the setlist's root, as pitch
classes, so enharmonic spellings are the same key: a song in `A#` played
from `- key: Bb` is not transposed. How the transposed chords are spelled,
and what is done about the song's voicing blocks, are not defined here;
transposition itself is not defined by this version of the song format
(§8.6), and a setlist only fixes the interval.

The key is not applied, and a reader SHOULD show it to the player as a
note instead (*key: D*), when:

- the song has no `key` property, or its value is not a key as defined
  above, since without the song's key there is no interval;
- the two keys differ in mode, `C` for a song in `Am`, since whether that
  means C minor or the relative major is not something a reader should
  guess;
- the setlist's value is not a key as defined above. A reader MUST also
  report this, where the setlist's writer will see it.

A `key` the reader does not apply is still kept, and written back as it
was.

### 10.7.2 The note

The note is shown with the song while it is played from the setlist. It is
text, kept as written; a reader MAY render it as inline Markdown. A note
that needs more than one line belongs in the song, or in the setlist's
notes.

## 10.8 Resolving and playing

### 10.8.1 Resolution

To **resolve** a song item, a reader joins its path to the directory the
setlist is in, removing each leading `..` by going up one directory. If
that would go above the root of the book, the item is **outside the
book**. Otherwise it names a file in the book, and if that file exists and
is a regular file, that file is the item's song. If it does not, the item
is **missing**.

File names are compared exactly, after normalising both to NFC. Case
matters, as it does to git. A reader MUST NOT follow a symbolic link to a
file outside the book.

A reader that was not given the book resolves nothing: every song item is
**unresolved**, which is not an error, and the setlist is shown with each
item's text.

Resolution never changes the setlist. An item that is missing today may
be found tomorrow, when the song is restored or the setlist is moved back.

### 10.8.2 Playing

To **play** a setlist is to go through its songs in item order. A song
item that resolved to a song is played. Every other item, unlinked,
outside the book, missing or unresolved, is skipped, and a reader showing
the setlist MUST still show it in its place, marked for what it is.

- **The same song twice** is allowed, and is played each time it appears.
  A song played as the opening number and again as the encore is two
  items, each with its own properties.
- **A missing song** is kept, reported and skipped; it is never removed by
  a reader, and never by a writer except when the user asks (§10.10). It
  is shown by its text, the last name the setlist knew it by. An editor
  SHOULD offer to point it at a song.
- **An empty setlist**, with no items, is a setlist. It has nothing to
  play, and is not an error.

### 10.8.3 What is reported

A reader MUST NOT fail on a setlist because of a line it does not
understand, and MUST NOT discard one. Everything below is reported, where
the person who wrote the setlist will see it, and kept.

| Problem | Found when | What the reader does |
|---|---|---|
| An item that is not a song link (§10.3.2, §10.4) | Reading | Keeps its content; skips it when playing |
| A destination that fails §10.5 | Reading | Keeps the item's content; skips it; says which step failed |
| An unrecognised entry under the title or an item | Reading | Keeps it in place |
| A key repeated under the title or an item | Reading | Last value wins |
| A `key` value that is not a key (§10.7.1) | Reading | Keeps it; shows it as a note |
| A fence not closed | Reading | Notes to the end of the setlist |
| A path outside the book | Resolving | Keeps the item; skips it |
| A missing song | Resolving | Keeps the item; shows its text; skips it |
| A `key` that cannot be applied to its song (§10.7.1) | Resolving | Shows it as a note |

## 10.9 Canonical form

A setlist has a **canonical form**, and unlike a song's (§8) it constrains
every byte. A reader MUST accept setlists that are not canonical. A writer
MUST write the canonical form.

To **canonicalise** a setlist is to read it (§10.2 to §10.5) and write the
model back as this section says. The canonical form has these properties,
and a writer MUST preserve them:

- **It depends on the text alone.** Nothing in it depends on the songs the
  setlist names, on whether they exist, or on where the setlist is. A
  program checking one file needs only that file.
- **It is unique.** Two conforming writers given the same model produce
  the same bytes. Nothing is left to a writer's choice.
- **It is a fixed point.** Canonicalising a canonical setlist gives the
  same bytes. A setlist is canonical exactly when canonicalising it changes
  nothing.
- **It keeps what was written.** Canonicalising never changes which file
  an item points at, its text, its properties' values, or a line of notes.
  It changes spelling (whitespace, numbering, markers, encoding, order),
  never content. The one exception is a repeated key, whose earlier value
  is lost (§10.3.1, §10.3.3).

### 10.9.1 The text

The canonical text:

- is UTF-8, with no byte order mark;
- is in NFC;
- has lines separated by LF, with no CR anywhere;
- contains no tab;
- has no line ending in a space;
- has no blank line at its start and none at its end;
- ends with exactly one LF after its last line, unless it is empty.

A setlist with no title, no properties, no items and no notes is written
as the empty file, zero bytes long.

### 10.9.2 The lines

The canonical text is a sequence of **parts**, separated by exactly one
blank line:

1. **The metadata**, if there is a title or a setlist property: the title
   line, then one line per entry under the title, with no blank line
   between them. The title line is `# ` followed by the title, or `#` alone
   if the title is the empty string. With no title, the part is the entry
   lines alone.
2. Then, in document order, **runs of items** and **notes blocks**. A run
   of items is a maximal sequence of consecutive items, each item's line
   followed directly by its entry lines, with no blank line anywhere in
   the run. A notes block is written as its lines, blank lines inside the
   block included as they were.

So consecutive items are never separated by a blank line, a notes block
between two items splits the list into two runs, with a blank line on
either side of the notes, and a setlist's numbering continues across them.

**An item line** is the item's number in decimal, without leading zeros,
then `.`, then:

- for a song item: one space, `[`, the text as written, `](`, the path
  written as below, `)`;
- for an unlinked item whose content is not empty: one space and the
  content as written;
- for an unlinked item whose content is empty: nothing.

Items are numbered from 1, consecutively, in order.

**The path** is written as its segments joined by `/`. In each segment,
each character is written as itself if it is outside ASCII, or an ASCII
letter or digit, or one of

```
- . _ ~ ! $ ' * + , ; = @
```

Every other ASCII character, space and control characters included, is
written as `%` followed by its byte as two uppercase hexadecimal digits:
a space is `%20`, `&` is `%26`, `(` is `%28`. One more rule: a character
outside ASCII that immediately follows a percent-encoded character in the
segment is percent-encoded too, as each of its UTF-8 bytes, so that
`<` followed by U+0301 is `%3C%CC%81`. Without it, the `C` of `%3C` and an
accent written after it would compose to `Ć` under NFC, and the path would
read back as something else. The path is never written in angle brackets,
and contains no backslash escape.

This is the character set RFC 3986 allows in a path segment, less four
characters: `(` and `)`, which Markdown would have to balance or escape;
`&`, which Markdown would read as the start of a character reference; and
`:`, which in a first segment would read as a URL scheme. Characters
outside ASCII are written as themselves so that a path stays readable, a
song called `canção.cifra.md` included; CommonMark accepts them in a link
destination, and a git host encodes them for the browser.

**An entry line** under the title has no indentation. Under an item, it is
indented by as many spaces as the item's marker and the space after it
take: three for items 1 to 9, four for items 10 to 99, and so on, which is
what Markdown requires for the list to be nested inside the item. After
the indentation:

- a property is `- `, the key in lowercase, `:`, and then one space and
  the value, or nothing if the value is empty: `- key: D`, `- note:`;
- an unrecognised entry is `- ` followed by its text, or `-` alone if the
  text is empty.

The setlist's own entries are written in the order they were read, each
key at the position of its first appearance with its last value. An
item's entries are written in this order: `key`, then `note`, then every
other entry, properties and unrecognised entries alike, in the order they
were read, each repeated key at the position of its first appearance with
its last value. The fixed order is so that a writer adding a `key` to an
item that already has a `note` has nowhere to choose to put it.

**A notes line** is written as read, after §10.2. In particular its
leading spaces are kept: they are what makes it code, or a continuation
of the item above, to a Markdown viewer.

Every piece of text the writer copies was NFC when it was read. Where two
pieces meet, the character after the seam is ASCII, which never composes
with what precedes it, or the character before it is one of the writer's
own ` `, `[`, `(` and `/`, which compose with nothing; inside a path, the
rule above covers the rest. The canonical text is therefore NFC as
written, and a writer need not normalise it again.

### 10.9.3 The text of a link is not refreshed

Canonicalising keeps each link's text as written, even where it is not the
song's current title. A writer MUST NOT replace it with the song's title
when canonicalising.

Were it otherwise, the canonical form of a setlist would depend on the
files it names. Whether a setlist is canonical could then not be decided
from the setlist alone, a check made on one file would need the whole
book, and editing a song's title would make every setlist that names it
non-canonical, though none of them had been touched. It would also need
the song to be there, and the text matters most precisely when it is not:
for a missing song, it is the only name left.

An editor MAY offer to bring a link's text up to date, as an edit the user
makes (§10.10). It is then a change to the setlist like any other.

### 10.9.4 Example

This setlist, written by hand:

````
#   Thursday

3) [Minimal](./minimal.cifra.md)
     - Note: count in slowly
     - KEY: E
1)   [Tarde Clara](<with-words.cifra.md>)

Second set.
7. [Repeats](songs/../repeats.cifra.md "Repeats")
````

is canonically:

````
# Thursday

1. [Minimal](minimal.cifra.md)
   - key: E
   - note: count in slowly
2. [Tarde Clara](with-words.cifra.md)

Second set.

3. [Repeats](songs/../repeats.cifra.md "Repeats")
````

The third item is unlinked, because a link title is not part of a song
link, so its content is written as it was, and the reader reported it.

## 10.10 Editing operations

These are the changes an editor makes to a setlist, defined so that two
editors make the same change. After any of them the setlist is written in
canonical form.

**The path from the setlist to a song.** Let *D* be the segments of the
directory the setlist is in, and *S* the segments of the song's path, both
from the root of the book. Remove from both the longest run of leading
directory segments they share (never the song's file name). The path is
one `..` for each segment left in *D*, followed by the segments left in
*S*. A song beside the setlist is its file name alone.

**The text for a song.** When an editor writes a link's text, it is the
song's title as read (§1.4.1), scanned from the start: a `\` and the
ASCII punctuation character after it are copied as a pair; any other `[`
or `]` is preceded by `\`; a `\` that is the last character, and not the
second of a pair, is doubled. The text then ends where it should. If the
song has no title, or its title is empty, the text is the song's file name
without `.cifra.md`, with each of `` \ ` * _ [ ] < & `` preceded by `\`,
since a file name is not Markdown.

- **Add a song**: a song item with the song's text and path, and no
  entries, inserted where the user puts it, or last.
- **Remove an item**, **move an item**: the item and its entries go
  together. Items are renumbered by the canonical form.
- **Set a property**: under an item, the entry for that key is given the
  new value, or added. **Remove a property**: the entry is removed.
- **Point an item at a song**, the action offered on a missing one: the
  item's path becomes the new song's path, and its text the new song's
  text. Its entries are kept.
- **A song is moved or renamed** within the book: every song item, in
  every setlist in the book, whose path resolved to the song's old name,
  is given the song's new path. Its text and entries are kept: the song's
  title has not changed. An editor that moves a song SHOULD make this
  change in the same save.
- **The setlist is moved**: every song item that resolved is given the
  path from the setlist's new place; an item that did not resolve is
  given the path that names the same place in the book it named before,
  if that place is still in the book, and keeps its path otherwise.
- **Refresh a link's text**, when the user asks: the text becomes the
  song's text, as above.

An editor MUST NOT, on its own initiative, remove a missing, unlinked or
outside item, or change what one points at.

## 10.11 Markdown compatibility

A canonical setlist is a CommonMark document that renders as what it is:

| Construct | Markdown | Setlist |
|---|---|---|
| `# Name` as the first line | ATX heading, level 1 | The setlist's title |
| `- key: value` under the title | Bullet list | A setlist property |
| `1. [Title](path.cifra.md)` | Ordered list item holding a link | A song of the setlist |
| `- key: D` indented under an item | Bullet list nested in the item | A property of the song in this setlist |
| Everything else | Paragraphs, code, anything | Notes, kept and not interpreted |

On a git host, each link opens the song it names, because the path is
relative to the setlist's own directory, as the host resolves it. That is
why the path is written that way, and why it is percent-encoded rather
than written raw: a space or a `#` in a file name would otherwise break
the link for the host while still reading correctly here.

## 10.12 Conformance

The setlist profiles are in §9.1. They are independent of the song
profiles: a program can read setlists without reading a chart, and needs
only a song's properties (§1.4) to apply a `key`.

## Open questions

Deferred to a later version:

- Whether a setlist may point at a place in a song, `#verse` or a bar,
  to start from. Today that is a `note`, and a `#` in a destination is
  refused (§10.5) so that the syntax stays free.
- Whether a setlist may point at a song in another book. Today it may not
  (§10.1); a song from elsewhere is copied into the book first.
- Whether a setlist may name another setlist, to build a show from sets.
  Today a target must be a song, and a set break is a line of notes.
- Whether any setlist property should be reserved: a date, a place. Today
  every key under the title is application-defined.
- Whether `key` should apply across modes, and how a transposed chord is
  spelled. Both wait on transposition being defined for songs (§8.6).
- Whether a reader on a case-insensitive file system should find
  `Garota.cifra.md` for a path `garota.cifra.md`. Today names compare
  exactly, as git compares them.
- A JSON Schema for the model of §10.6, a setlist reader and writer in the
  reference implementation, and setlist entries in the corpus. Until they
  exist, the prose model above is the normative one.
