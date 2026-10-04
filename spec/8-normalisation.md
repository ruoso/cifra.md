# 8. Normalisation

Depends on: everything before. This section is for writers: programs that
create or edit documents, or check that one is in canonical form. A
reader needs none of it, except the chord line tokens of §8.4.4, which
the layout of sung lines (§4.5) is defined on.

## 8.1 The canonical form

Every document has exactly one **canonical form**: a text that §8.4
defines byte for byte from the document's model (§0.4). To
**canonicalise** a document is to read it (§1 to §7) and write its model
back as §8.4 says, after the changes of §8.3.

The canonical form has these properties, and a writer MUST preserve them:

- **It is unique.** Two conforming writers given the same document
  produce the same bytes. Nothing in it is left to a writer's choice:
  where this section says what a writer writes, that is the only thing a
  writer may write.
- **It is a fixed point.** Canonicalising a canonical document gives the
  same bytes. A document is canonical exactly when canonicalising it
  changes nothing, which is how a program checks one.
- **It depends on the text alone.** Nothing in it depends on the
  application, the instrument in use, an application's default shapes, or
  any other file.
- **It reads back as its own model.** Reading the canonical text gives the
  model that was written, apart from the line numbers in diagnostics and
  in `sungAt`.

A hand-written document need not be canonical, and a reader MUST accept
documents that are not. A writer that saves a document MUST save it in
canonical form.

**Canonical form takes precedence over preserving the text.** Where
writing the document canonically and keeping something the author wrote
conflict, the canonical form wins: canonicalising may respell, reflow and,
in the cases §8.2 lists, drop. Reading is where nothing is lost: a reader
keeps everything the format defines and reports what it does not keep
(§9.2), so that an application can tell the author before it saves what
canonicalising will drop. What canonicalising never changes is what the
song plays: its sections, chords, bars, repeats, words and chosen shapes,
except that §8.3 merges two footnote markers that no block tells apart;
and it never moves a chord to another syllable. On a sung line it may
push the words to make room for a chord, with spaces between words and
`_` inside one (§4.5): the words are still the same words, under the same
chords.

Canonicalising never applies the conversions of Appendix A. Migrating a
document from a legacy form is an operation of its own (§8.7).

## 8.2 What canonicalising changes

Everything below follows from reading the document and writing it as §8.3
and §8.4 say; the list is here so that nobody has to work it out.
Canonicalising:

**The text.** Removes every U+FEFF; normalises to NFC; ends every line
with LF; replaces each tab with one space; removes spaces at the end of
every line, and the up to three spaces before a heading, a fence, the
rule or a list item; collapses runs of blank lines (§8.4.1).

**Metadata.** Drops an empty title; trims a heading's text, removes its
closing `#`s and collapses runs of spaces in it; lower-cases property
keys; keeps one value per key, the last, at the key's first position;
drops list items that are not `key: value`; writes every list marker as
`-` (§8.4.2).

**The chart.** Writes the chart again from its model (§8.4.3): every
Markdown section heading at level 2; music in backtick fences; verbatim
fences with a trimmed, lower-cased info string; items one space apart,
each in its one spelling (`N.C.`, `x2`, `1.`, a key without `[1]`);
punctuation dropped; a bar anchor at the start of its measure, or on a
sung line at its column (§4.5); a line
that holds no item, such as a bar anchor alone, read as a blank line, its
anchor moving to the measure it numbers; blank lines in music only
between two lines, one for each run. A sung line is written as the
layout of §4.5 lays it out: every chord over the character it was written
over, the words pushed where a token needs more room than it was given,
`_` padding written where the layout needs it and nowhere else, and the
words written forced when, padded, they would no longer read as words.
A reader has already laid the line out, so this changes nothing in the
model that the reader produced. Notes are kept as they were read, with
each run of blank lines in them collapsed to one.

**The voicings part.** Drops what a reader skips: problem items, bad
fingerings, lines before the first block and every rule after the first
(§7.4, §7.5.1). Drops a fingering that frets no string. Applies the
footnote invariants (§8.3), which drop keys the chart does not use and may
rewrite footnote markers in the chart. Merges blocks with the same tuning
and name (§7.3). Writes blocks, items and tunings in canonical order and
spacing (§8.4.6).

A reader reports each of these drops when it reads the document, except
those of layout (spaces, blank lines, closing `#`s, list markers, U+FEFF),
a fingering that frets no string, and what §8.3 computes from the model.

## 8.3 Footnote invariants

Footnote markers are shared by every block: the marker is the
arrangement's decision and each block says what that decision looks like
on its instrument. The invariants below therefore hold across the whole
document, and they are part of the canonical form: canonicalising applies
I1, then I3, then I2.

A key is **used** if a chord occurrence in the chart has it (§2.4), or if
an unknown token in the chart (§2.9) is written exactly as the key.

**I1. Every key in a block is used.** A key no occurrence uses is dropped
from every block. A reader still accepts such a key (§7.4); canonical
form does not keep it.

**I3. One shape, one key.** For a chord symbol *S* used with several
indices, two indices *i* < *j* are **the same** when at least one block
has a shape for both, and every block either has the same shape for both
or has a shape for neither. The same shape means the same frets and the
same fingering, or the same frets and no fingering for either. Taking the
indices in ascending order, each index that is the same as a lower index
which has not itself been merged is merged into the lowest such index:
its occurrences in the chart are rewritten to that index, and its entries
in the blocks are dropped. A block that has a shape for one of two
indices and not the other tells them apart, and so does a block that
gives them different shapes: two occurrences another instrument tells
apart are different arrangement decisions, and merging them would destroy
that instrument's arrangement. With no block at all, no two indices are
the same.

**I2. Indices are contiguous.** For each symbol, the indices used in the
chart are renumbered 1 to *n* in ascending order, in the chart and in
every block alike, so a chord back to one voicing loses its marker. A
reader does not renumber (§2.4); canonical form does. Keys used only by
unknown tokens are not renumbered.

**I4. Defaults are not written.** A block holds chosen shapes only
(§7.6). This invariant binds an application when it edits: it MUST NOT
write its default shape into a block. It is not part of the canonical
form, which cannot know what an application's default is.

**I5. The chart and the blocks agree.** Rewriting under I3 and I2 is
applied to chart tokens and block keys in one step; a writer MUST NOT
leave a state where a chart token names an index no block was rewritten
for.

A rewritten token on a sung line changes width, so canonicalising lays
the line out again (§4.5) after applying these invariants: every chord
stays over its syllable, and the words move if they must.

## 8.4 Writing the canonical text

This section is the canonical writer. It takes a model in which §8.3 has
been applied and writes it, in the order given. An implementation in any
language follows it step by step.

### 8.4.1 The text

The canonical text:

- is UTF-8, with no U+FEFF anywhere;
- is in NFC: it is written from text that was normalised when it was
  read (§1.3), and the writer's own characters are ASCII, which composes
  with nothing that follows it;
- has lines separated by LF, with no CR anywhere;
- contains no tab;
- has no line ending in a space;
- has no blank line at its start or its end, and never two blank lines in
  a row outside a verbatim fence;
- ends with exactly one LF after its last line, unless it is empty.

The text is a sequence of **blocks**: the metadata (§8.4.2), the chart's
blocks (§8.4.3) and the voicings part (§8.4.6), each present only when it
has something in it, separated by exactly one blank line. A document with
none, the empty document, is the empty file, zero bytes long.

### 8.4.2 Metadata

If the document has a title or a property, the first block is:

1. the title line, `# ` followed by the title, if there is a title,
   written as a heading's text is (§8.4.3);
2. one line per property, in the model's order: `- `, the key in lower
   case, `:`, and then a space and the value, or nothing when the value is
   empty: `- key: G`, `- capo:`.

No blank line separates them. A document with a title only is the title
line and a LF: `# Title\n`.

### 8.4.3 The chart

The chart is written section by section, in order. Each section gives one
or more blocks; a section headed by a bracket or a label heading (§1.7.2,
§1.7.3) may instead continue the fence of the section before it.

**Heading text.** A section's heading text is its name, then ` @` and the
anchor if it has one, then ` x` and the count if it has one, with the
leading space dropped when the name is empty: `Chorus @9 x2`, `@9`. On a
Markdown heading, the title's included, if the text ends with a `#`
preceded by a space, or consists only of `#`s, ` #` is written after it,
so that a reader does not take the end of the name for a closing sequence
(§1.7.1): `## C# # #` for a section called *C# #*.

**A section with a Markdown heading**: its heading line is `## ` followed
by the heading text, or `##` alone when the text is empty. Its body parts
follow, each a block of its own; the heading line is the first line of
the first block, with no blank line after it, or a block alone when the
body is empty.

**A section with no heading** (the music and notes before the first
heading): its body parts, each a block, with no heading line.

**A part** is written as:

- **notes**: its lines, as read, with each run of blank lines in them
  written as one blank line;
- **a music fence**: its music lines (§8.4.4) in a fence with no info
  string;
- **a verbatim fence**: its lines, each as read, blank lines included, in
  a fence whose opening line is the fence followed directly by the info
  string: ```` ```tab ````.

**A fence** is a run of one character: the backtick, unless the info
string contains a backtick, in which case the tilde. Its length is three,
or one more than the longest run of that character at the start of any
line inside it, after at most three spaces, whichever is greater. The
closing line is the same run as the opening one, with nothing after it.
An empty music part is an empty fence: its opening and closing lines.

**A section with a bracket or label heading** is written inside a music
fence, which it opens or continues:

1. Its heading line is `[`, the heading text and `]` for a bracket
   heading, or the name followed by `:` for a label heading.
2. If its first part is music and that part's first line is a chord line
   that is not sung, the chord line (§8.4.4) is written on the heading
   line, after one space, instead of on a line of its own, provided that
   for a bracket heading the chord line's text is not a count alone
   (§3.3), and for a label heading every word of it is a chart item that
   is not an unknown token (the condition of §1.7.3): `[Intro] G D Em C`,
   `Refrão: C G`.
3. If the section before was also written into a fence that is still
   open, a blank line and the heading line continue that fence; otherwise
   a new fence opens with the heading line.
4. If its first part is music, that part's remaining lines follow in the
   same fence, which stays open for the next section; so it does if the
   section has no parts. Any other part closes the fence and is a block of
   its own. A later music part opens a
   new fence, which also stays open; a later music part with no lines is
   an empty fence, closed at once.

A fence still open after the last section, or before a section with a
Markdown heading or none, is closed there.

### 8.4.4 Music lines

A music part's lines are written in order:

- a **break** is a blank line;
- an **annotation** is `// ` followed by its text, or `//` alone when the
  text is empty;
- a **lyric line** is its text; if it is forced, `>` replaces the text's
  first character, which is the space the marker was read as (§4.3);
- a **chord line** is written as below;
- a **sung line** is two lines, its chord line and its line of words
  (§8.4.5).

**Item text.** Each item is written as:

| Item | Text |
|---|---|
| Chord | its key: the symbol, then `[`, the index and `]` if the index is more than 1 |
| Repeat sign | `%` |
| No-chord mark | `N.C.` |
| Beat mark | `/`, `.` or `-` |
| Bracket mark | `(` or `)` |
| Count | `x` and the number: `x2` |
| Ending marker | the number and `.`: `2.` |
| Unknown token | its text |

A repeat mark of bar-line notation is not written as an item of its own:
it is a `:` on a bar line, as follows.

**Tokens.** A chord line is first turned into a sequence of tokens: bar
lines, anchors and items. The items that **make a measure** are chords,
no-chord marks, beat marks, repeat signs and unknown tokens, except an
unknown token whose text is an ending marker (§3.4). For each measure in
order, leaving out the lead item of a sung line:

1. If it is not the first measure, write a bar line token. If a close
   mark is held over from the measure before (step 4), this bar line
   carries it.
2. Write the measure's items in order, as steps 3 to 5 say.
3. Just before the first item that makes the measure: if the measure has
   a bar line and no bar line token has yet been written for it, write
   one. The last bar line token written for the measure takes the
   measure's bar line, `|` or `||`; every other bar line token is `|`
   unless step 6 says otherwise. Then, on a chord line that is not sung,
   write the measure's anchor, `@` and its number, if it has one.
4. An open repeat mark of bar-line notation goes on the token written
   last for this measure, if that is a bar line with no open mark yet;
   otherwise a new bar line token is written to carry it. A close repeat
   mark of bar-line notation is held over to the next measure's bar line
   if it is the measure's last item and the measure is not the line's
   last; otherwise a new bar line token is written to carry it.
5. On a sung line, the measure's anchor, if it has one, is written once
   the measure's other tokens are, among them. Its **stretch** runs from
   just after the last bar line token written before the measure's first
   item that makes it (from the measure's first token, if none was) up to
   the first bar line token written after the measure's last item that
   makes it (to the end of the measure's tokens, if none was); written
   anywhere in it, the anchor reads back in this measure. If the measure
   has an `anchorColumn`, the anchor goes just before the first token of
   the stretch that has a written column (§4.5.1) greater than that column, or
   at the end of the stretch if none does. If it has none, the anchor
   goes right after the measure's last item that makes it.
6. After the last measure, if the line has a closing bar line: if the
   last bar line token written does not carry a measure's bar line and no
   item that makes a measure comes after it, that token takes the closing
   bar line's value; otherwise a final bar line token is written with it.

A bar line token is written as `:` if it carries a close mark, then its
bar line, then `:` if it carries an open mark: `|`, `||`, `:|`, `|:`,
`:||:`. An anchor token is `@` and its number; an item token, its text.

These steps are such that every chord line a reader can produce reads
back as the same measures and items. Marks, counts and endings that sat
outside a measure when they were read come back to the measure they
belong to, and a bar line the model holds no place for is written where a
reader does not count it.

**A chord line that is not sung** is its tokens joined by single spaces:

```
|: G | D :| x3
( Gm C7 | F Dm ) x3
|: Dm | G7 | 1. C | A7 :| 2. C | C |
@9 Dm | G7 | @17 Em | A7
```

**The guard.** If the line so written would be read inside a fence as a
bracket heading, a label heading, an annotation or a forced line (§1.7.2,
§1.7.3, §1.9, §4.3), it is written after `, ` instead. A `,` alone is
punctuation, which a reader drops (§2.3), so the line reads back as the
chord line it is. This happens only to a line that began with punctuation
when it was read, `, >x C`, and would otherwise lose it.

### 8.4.5 Sung lines

A sung line in a canonical model is already laid out (§4.5): a reader
lays it out when it reads it, and canonicalising lays it out again after
§8.3. The writer prints it, two lines, from the columns and words the
model holds, and decides nothing.

**The chord line** is its tokens (§8.4.4), each at its written column
(§4.5.1), with spaces before it; a token with no written column, which in
a laid-out line is only the closing bar line, goes one space after the
token before it. If the line so written would be read as a heading, an
annotation or a forced line, its first character, which the layout left
as a space, is written `,`: the guard of §8.4.4.

**The line of words** is the lead item's words, or, when there is no lead
item, as many spaces as the first attached item's column; then, for each
attached item (§4.4) in column order that has words, the gap from the
end of what is written so far up to the item's column, filled with `_`
(the padding of §4.5.2; such a gap is always inside a word), followed by
the item's words. A forced line is written with `>` in place of its first
character, which is a space.

```
( G   D ) Em        N.C. G      Am         G @9 | D
l_a la la la la     Qua__ndo eu te vi      Wh_____en I first
```

Because the reader lays the line out exactly as written here, reading the
canonical text gives back the same columns and words, and writing them
again gives the same text. Layout that was once a writer's choice, such
as where a token that grew should go, is all in §4.5.

### 8.4.6 The voicings part

If the document has at least one block, the voicings part follows the
chart: a block holding the rule, `---`, alone, then one block per voicing
block. When nothing comes before it, the rule is the first line of the
text. With no block, the rule is not written either.

**Block order.** Blocks are ordered by the first appearance of their
tuning (§6.3) in the document as read; within a tuning, the default
variation first, then the named variations in order of first appearance.

**A block** is:

1. the heading: `## `, the label (`Voicings` for the default variation,
   the variation's name otherwise), `: `, and the tuning's text, which is
   each pitch as it was first written for that tuning, its letter
   uppercase, joined by single spaces (§6.2);
2. one line per item, ordered by symbol, then by index: `- `, the key,
   `: `, the fret string in the form §7.5 requires, then, if the item has
   a fingering, a space and the fingering in round brackets, its positions
   separated by single spaces, `T` for the thumb and `-` for a string not
   fretted (§7.5.1);
3. the block's notes, each line as read, in order.

No blank line separates them. A block with no items is its heading alone,
with its notes if it has any: its existence says the tuning was
considered (§7.3).

Symbols are compared by Unicode code point, which is the same on every
machine. An implementation whose strings are UTF-16, as JavaScript's are,
MUST NOT compare code units: a character outside the Basic Multilingual
Plane sorts after U+FFFF by code point but before it by code unit.

## 8.5 Editing operations

These are the operations a writer performs, defined so that two writers
make the same change to the same document. A writer MAY offer others.
After any of them the document is written in canonical form, which
applies §8.3.

A writer that creates a section adds to the model a section with a
Markdown heading and one music part holding its lines; §8.4 then says how
it is written. A writer that creates or edits a sung line chooses its
columns and words; canonicalising lays the line out (§4.5), and from then
on the layout keeps every chord over the character it was put over.

### 8.5.1 Choose a shape for one occurrence

Input: an occurrence (a chart position), a tuning, a variation, a shape.

Let *S* be the occurrence's symbol and *i* its index. In the target block:

1. If the block's shape for key (*S*, *i*) is already the given shape,
   nothing changes.
2. Else, if some other index *j* of *S* used in the chart has the given
   shape in this block, and no other block tells *i* from *j* (§8.3 I3),
   the occurrence's token is rewritten to index *j*. The shape is reused.
3. Else, if the occurrence is the only one with index *i*, or key (*S*,
   *i*) has no shape in this block yet, the block's entry for (*S*, *i*)
   becomes the given shape. The second case is what makes the first choice
   for a chord apply to every bare occurrence, rather than splitting the
   first one chosen off into a footnote.
4. Else, the occurrence's token is rewritten to the smallest index of *S*
   not used in the chart, and the block gets an entry for that key.

### 8.5.2 Choose a shape for a key

Input: a voicing key, a tuning, a variation, a shape. Every occurrence with
that key moves together. Steps 1 and 2 of §8.5.1 apply, with "the
occurrence" read as all of them; otherwise the block's entry for the key
becomes the given shape.

### 8.5.3 Clear a key

Input: a voicing key, a tuning, a variation. The block's entry for the key
is removed. Every occurrence with that key has no chosen shape on that
instrument (§7.6). The marker stays in the chart: the variant may still
mean something on another instrument. The canonical form then applies
§8.3, under which the marker goes away only if I3 now finds its index the
same as a lower one.

### 8.5.4 Choose shapes for many occurrences at once

Input: a map from occurrences to shapes, a tuning, a variation. This is
what an arrangement tool produces, and it MUST NOT be implemented as a
sequence of §8.5.1, for two reasons: rewriting one token shifts the
positions of every later one, and the renumbering after each step moves
indices later steps were aiming at.

Instead, for each symbol with planned occurrences:

1. Occurrences the plan does not mention keep their index, and those
   indices are reserved.
2. Planned occurrences are grouped by shape, except that two occurrences
   whose current indices another block tells apart (I3) are never put in
   one group.
3. Each group takes the smallest of its members' current indices that is
   not reserved, so a plan that agrees with the document rewrites nothing;
   failing that, the smallest unused index. Its members' tokens are
   rewritten to that index and the block gets the group's shape under it.

All tokens are rewritten in one pass from the end of the chart to the
start, so that positions stay valid, and the document is then written in
canonical form.

### 8.5.5 Add a variation

Input: a tuning, a name, optionally a variation to copy. A block with that
tuning and name is created, empty or with the copied entries. If one
already exists the document is unchanged; a writer SHOULD refuse rather
than silently land the user in the existing one.

## 8.6 Transposition

Not defined in this version. Transposing a chart is a rewrite of every
symbol's root and bass, which a writer could do while keeping the author's
spelling, but it also invalidates every voicing block except those for a
tuning shifted by the same interval, and what a teacher wants done about
that (re-voice, shift the shapes, or suggest a capo and keep them) is a
workflow question this draft does not settle. A writer that transposes
MUST say what it did to the blocks. The `key` property (§1.4.3) is
informative and is not changed by a reader.

## 8.7 Legacy forms

Canonicalising never applies a conversion of Appendix A, even where a
reader accepts the legacy form. A legacy line is read as whatever this
version makes of it, usually notes, and written back as that.

Migrating a document from a legacy form is a separate operation, which an
application performs only when asked, because a conversion can need
context the text does not hold: the instrument a document was written on
(A.2), or whether a level-1 heading is a title (A.5). Its result is then
written in canonical form like that of any other edit.
