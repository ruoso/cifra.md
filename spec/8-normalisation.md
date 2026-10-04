# 8. Normalisation

Depends on: everything before. This section is for writers: programs that
create or edit documents. A reader needs none of it.

## 8.1 What normalisation is

A document has a **canonical form**. A hand-written document need not be in
it, and a reader MUST accept documents that are not. A writer that edits a
document SHOULD leave it in canonical form, because that is what keeps a
document tidy over time: a shape a chord already uses is reused instead of
duplicated, markers renumber from actual use so a chord that returns to one
voicing loses its marker, and entries nothing refers to go away.

The canonical form constrains the **voicings part** fully and the **chart**
hardly at all. The chart is the author's text, and a writer's business with
it is limited to the tokens it changes.

## 8.2 The chart is preserved

A writer MUST write the chart back exactly as read, except for:

- chord tokens whose footnote marker it changed (§8.4);
- the column adjustment that follows such a change on a sung line (§8.5);
- replacing tabs (§1.2), if it chooses to.

In particular a writer MUST NOT reflow lines, change spacing between items,
rewrite a chord symbol into another spelling, change a heading's form
(§1.6), move music between fences, remove unknown tokens, alter notes, or
touch the title or properties it does not know.

A writer that creates a section emits its heading, a blank line, and one
fence holding its music.

## 8.3 Canonical voicings part

The voicings part of a document in canonical form is:

1. The metadata and the chart, with trailing blank lines removed.
2. One blank line, the rule `---`, one blank line.
3. The blocks, each followed by one blank line. For each block: the heading
   `## <label>: <tuning>`, then one list item per key, then the block's
   notes if it had any.

Where:

- The label is `Voicings` for the default variation and the variation's
  name otherwise. A reader that found `## voicings:` in another case writes
  `Voicings`.
- The tuning is written as the document wrote it (§6.3). A block the writer
  creates writes pitches separated by single spaces.
- Blocks are ordered by the first appearance of their tuning in the
  document, and within a tuning the default variation first, then the named
  variations in order of first appearance. A block the writer creates for a
  new tuning goes last.
- Items are `- <key>: <fret string>`, no space before the colon and one
  after, the fret string in the form §7.5 requires.
- Items within a block are ordered by symbol, comparing code points, then by
  index ascending, so a chord's variants sit together: `A`, `Cm`, `Cm[2]`,
  `G`. Code points rather than a locale collation, so that the order is the
  same on every machine.
- A block with no items is omitted if it is the default variation and kept
  if it is named (§7.3), unless it has notes, in which case it is kept.
- Problem items (§7.4) are not written back. A writer that would lose
  information this way SHOULD tell the user before saving.

If no block remains, the rule is omitted too, and the document is the chart
followed by a single newline.

## 8.4 Footnote invariants

Footnote markers are shared by every block: the marker is the arrangement's
decision and each block says what that decision looks like on its
instrument. The invariants below therefore hold across the whole document,
and a writer MUST maintain all of them together.

**I1. Every key in a block is used by the chart.** A key no occurrence has
is dropped from every block.

**I2. Indices are contiguous.** For each symbol, the indices used in the
chart are exactly 1 to *n*. When an index falls out of use, higher ones
move down, in the chart and in every block alike, so a chord back to one
voicing loses its marker.

**I3. One shape, one key, per block.** Within one block, two keys of the
same symbol SHOULD NOT hold the same shape, *unless* some other block holds
different shapes for those two keys. Two occurrences another instrument
tells apart are different arrangement decisions, and collapsing them would
silently destroy that instrument's arrangement.

**I4. Defaults are not written.** A block holds chosen shapes only (§7.6).

**I5. The chart and the blocks agree.** Renumbering under I2 is applied to
chart tokens and block keys in one step; a writer MUST NOT leave a state
where a chart token names an index no block was renumbered for.

## 8.5 Editing operations

These are the operations a writer performs, defined so that two writers
make the same change to the same document. A writer MAY offer others, but
MUST keep §8.4 after any of them.

### 8.5.1 Choose a shape for one occurrence

Input: an occurrence (a chart position), a tuning, a variation, a shape.

Let *S* be the occurrence's symbol and *i* its index. In the target block:

1. If the block's shape for key (*S*, *i*) is already the given shape,
   nothing changes.
2. Else, if some other index *j* of *S* used in the chart has the given
   shape in this block, and no other block distinguishes *i* from *j*
   (§8.4 I3), the occurrence's token is rewritten to index *j*. The shape is
   reused.
3. Else, if the occurrence is the only one with index *i*, or key (*S*,
   *i*) has no shape in this block yet, the block's entry for (*S*, *i*)
   becomes the given shape. The second case is what makes the first choice
   for a chord apply to every bare occurrence, rather than splitting the
   first one chosen off into a footnote.
4. Else, the occurrence's token is rewritten to the smallest index of *S*
   not used in the chart, and the block gets an entry for that key.

Then apply §8.4 (drop unused keys, renumber) and write canonically.

### 8.5.2 Choose a shape for a key

Input: a voicing key, a tuning, a variation, a shape. Every occurrence with
that key moves together. Steps 1 and 2 of §8.5.1 apply, with "the
occurrence" read as all of them; otherwise the block's entry for the key
becomes the given shape. Then §8.4.

### 8.5.3 Clear a key

Input: a voicing key, a tuning, a variation. The block's entry for the key
is removed. Every occurrence with that key has no chosen shape on that
instrument (§7.6). The marker stays in the chart: the variant may still
mean something on another instrument. Then §8.4, under which the marker
goes away only if no block anywhere mentions it any more and the index can
be collapsed.

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
   whose current indices another block distinguishes (I3) are never put in
   one group.
3. Each group takes the smallest of its members' current indices that is
   not reserved, so a plan that agrees with the document rewrites nothing;
   failing that, the smallest unused index. Its members' tokens are
   rewritten to that index and the block gets the group's shape under it.

Then §8.4, all tokens rewritten in one pass from the end of the chart to
the start so that positions stay valid, then canonical output.

### 8.5.5 Add a variation

Input: a tuning, a name, optionally a variation to copy. A block with that
tuning and name is created, empty or with the copied entries. If one
already exists the document is unchanged; a writer SHOULD refuse rather
than silently land the user in the existing one.

## 8.6 Keeping columns on a sung line

On a sung line a chord's column is the syllable it belongs over (§4.4).
Rewriting `Cm` as `Cm[2]` would slide every later item three columns along
and quietly change which words are sung to what. So when a token on a sung
line changes width:

- if it grew by *k*, remove up to *k* spaces from the run of spaces that
  follows it, always leaving at least one, so that two items never touch;
- if it shrank by *k*, insert *k* spaces after it.

Where the following gap is too small to absorb the growth, the rest of the
line shifts. That is visible and fixable, unlike a silent change.

A chart line that is not sung is not realigned; its spacing has no meaning.
