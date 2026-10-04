# 4. Words

Depends on: §0, §1, §2, and, for the layout of sung lines, the chord
line tokens of §8.4.4.

A cifra is a chart with the words under the chords. It is not a second
format: its intro and solo sections *are* chord lines, and its verses are
chord lines with a line of words beneath each. So the two live in one
document and are told apart line by line, by what is on them, because
nothing marks a pasted cifra as one.

```
[Intro] G  D  Em  C

[Verse]
G           D
When I first saw you
Em              C
walking down the road
```

## 4.1 Line shapes

Before the document as a whole is considered, each non-heading line inside
a fence in the chart has a **shape**, decided by its own content.

Take the line's space-separated words, leaving out bar lines, bare
marks, repeat signs, beat marks, counts, ending markers and bar anchors
(§2.3). Annotation lines (§1.9) have no shape and take no part in any of
this. A word is a **chord word** if it is a chord token under §2.4 (after splitting off
marks) or a no-chord mark (§2.6), otherwise a **plain word**. Then the
line's shape is given by the first row whose condition holds:

| Shape | Condition |
|---|---|
| `forced` | The line starts with `>`, after any spaces, and something other than spaces follows the marker (§4.3). |
| `blank` | No items at all (§2.3): the line is empty, or holds only bar lines, bar anchors and punctuation. |
| `chords` | Every word is a chord word, or the line contains a bar line. |
| `prose` | At least half of the words are plain words. |
| `chart` | Anything else: a line of chords with a plain word among them, such as `C  Am wobble G`. |

A line containing a bar line and an item is always `chords`. Words are
not written with bar lines, and a chart line with a typo in it is still a
chart line.

Note that `prose` includes a line with a single word that is not a chord.
Whether such a line is read as words depends on the document (§4.2).

## 4.2 Whether the document is sung

Words are read only when the document has some. A document is **sung** if
either:

- some line of shape `chords` is immediately followed (with no blank line
  between) by a line of shape `prose` that has at least two words; or
- any line is `forced`.

The `words` property (§1.4.3) overrides this: `words: no` makes the
document a chart whatever its lines look like, which is the answer when a
strumming pattern written under a chord line, `D DU UDU`, would otherwise
read as words and take the bar numbers with it; `words: yes` makes it
sung. A reader MUST expose which line made a document sung, so that an
application can show why a chart lost its bar numbers.

Two words are required, because a chart line with one typo looks exactly
like a chord line with one word under it. Once a song is known to be sung,
one word is a line of words like any other; a verse that wraps often ends
in one.

In a document that is not sung, every non-blank, non-heading line inside a
fence is a chord line (§2.1), whatever its shape. This is the guarantee for
every chart written without words: it reads exactly as it would under §2
alone.

In a sung document:

- a `chords` line immediately followed by a `prose` or `forced` line is a
  **sung line**: the chord line with its words (§4.4), and the pair counts
  as one line of the section;
- a `prose` or `forced` line not consumed by the rule above is a **lyric
  line**: words with no chords over them;
- a `chords` or `chart` line not followed by words is a chord line as in §2.

## 4.3 Forcing a line to be words

Where no rule can decide (a verse that really does read "A", against the
chord of the same name), a line beginning with `>`, after any spaces, is
words, however it would otherwise read. The `>` and one optional following
space are not part of the words: the `>` is read as a space, so the words
keep their columns (§4.4). A line that is `>` and nothing else is blank.
Canonical form writes the marker back in place of the first character of
the words, which is that space (§8.4.4).

Inside a fence, `>` has no Markdown meaning, so a forced line renders as
written. Its one visible cost is the marker itself.

A `forced` line following a `chords` line makes a sung line, exactly as a
`prose` line would.

## 4.4 Sung lines: columns and attachment

What a sung line means is which character of the words each chord is
over. The rest of the line, how many spaces separate one chord from the
next, is layout, and a reader lays it out again (§4.5) so that the model
holds the line as canonical form writes it.

**Columns.** The column of a token is the position of its first
character, counted in Unicode code points from the start of its line,
starting at 0, in the text as prepared by §1.3 (after NFC, after tabs
became spaces and after the spaces at the end of the line were removed).
Every item of the chord line has a column, and so has every bar line and
every bar anchor (§2.8).

Columns are code points, not bytes and not UTF-16 code units: an
implementation whose strings are UTF-16, as JavaScript's are, MUST count a
character outside the Basic Multilingual Plane as one column. Counting in
NFC is what keeps a chord over an accented syllable whether the file
spelled the accent as one character or two; it is also how a monospaced
editor shows it.

**Padding.** In the line of words of a sung line, a run of one or more
`_` with a character other than a space immediately before it and
immediately after it, `W_hen`, is **padding**: room the layout made inside
a word (§4.5.2). It is not part of the words. So `W_hen` is the word
*When*, and `W__hen` is too; the padding a line needs is worked out again
every time it is read, so padding written by hand that is more or less
than the line needs, or in the wrong place, is put right. A run of `_`
that touches a space or an end of the line, as in `_x` or `x_ y`, is not
padding but words. The cost is that an underscore cannot be written
inside a word of a sung line: `snake_case` under chords reads as
*snakecase*. Lyric lines with no chords over them, and every line of a
document that is not sung, are not affected: there `_` is an ordinary
character.

The **words** of a sung line are its line of words with the padding
removed; on a `forced` line the `>` marker and its following space count
as spaces (§4.3), so the chords above stay over the syllables they were
written over. Leading spaces are significant, since they are columns.

**Attachment.** Each item that makes a measure (§2.2: a chord, a no-chord
mark, a beat mark, a repeat sign, an unknown token that is not an ending
marker) is **attached** to a character of the words:

- the character at its column, if there is one there;
- the character after the run, if its column falls on padding;
- the **end** of the words, if its column is at or past the end of the
  line; such an item is also said to be the number of columns past the
  end that it is.

Attachment is what the line means, and no layout changes it: a chord
written over the `h` of *When* is over that `h` in the model and in
canonical form, however much room the tokens before it need.

Bar lines, repeat marks of either notation, counts, ending markers and bar
anchors are not attached. They have columns and are written where they
were written when there is room (§4.5), but they **follow** the attached
item before them: when the layout moves that item right, they move with
it. They take no words.

**Words.** The words are divided among the attached items, in column
order: each takes the words from its column up to the next attached
item's column, padding left out, and the last takes the rest. A chord
written inside a word divides it, which is why it was written there;
`W_hen` with a chord over the `h` gives *W* to what comes before and
*hen* to the chord, and the two are still one word. Further:

- Words before the first attached item's column, if they are not all
  spaces, form a **lead** item with no chord, at column 0, in the first
  measure.
- An attached item at or past the end of the words has no words.
- The words an item takes are kept exactly, including leading and
  trailing spaces. Trimming is a display decision.
- A bar line does not divide the words; the words divide with the items,
  and the bar lines divide measures as in §2.2.

```
G           D
When I first saw you
```

`G` is at column 0 and `D` at column 12. `G` takes `When I first`, and `D`
takes ` saw you`.

Column counting assumes the author aligned the lines in a monospaced
editor. A reader cannot do better than what was written: it takes each
chord to be over the character it is over.

## 4.5 Laying out a sung line

A reader lays out every sung line as canonical form writes it, and the
model holds the result: every column and the words are those of the
laid-out line. Reading a document and reading its canonical form
therefore give the same sung lines, and a writer only prints what the
model holds (§8.4.5). The layout below is the one definition both use:
the reader runs it once anchors carried from elsewhere (§2.8) have
reached the line, and canonicalising runs it again on a line whose
tokens §8.3 rewrote, since a rewritten footnote marker changes width.

The layout keeps every attached item over its character. When a token
needs more room than the chord line gives it, the words are pushed: room
is made in the words, before the character of the chord that would
otherwise move, and never by moving a chord onto another syllable.

### 4.5.1 Tokens and gaps

The chord line is laid out as the sequence of tokens that §8.4.4 writes
for it (bar lines, anchors and items, in writing order, with the text
§8.4.4 gives each: `N.C.` for a no-chord mark, `x2` for a count, a key
with its index as the model holds it). A token's **written column** is:

- an item, its column;
- a bar line token that carries a close mark, that mark's column;
- otherwise, a bar line token that takes a measure's bar line, the
  measure's column;
- otherwise, a bar line token that carries an open mark, that mark's
  column less the width of its bar line;
- an anchor, its measure's `anchorColumn`, if it has one;
- any other token (an anchor carried in from elsewhere, the closing bar
  line), none.

Two tokens next to each other are separated by at least one space, except
that two tokens **may touch**, when the second was written touching the
first, only when one is a bar line token and the other an item, and the
item neither ends in `:` before the bar line nor begins with `:` after
it; or when one is an anchor and the other a bar line token on either
side of it, an open bracket mark just before it or a close bracket mark
just after it, except that an anchor placed touching an open bracket
mark does not also touch a close bracket mark, since `(@9)` balances and
would read as one unknown token. A reader splits a bar line from
whatever touches it before anything else, and an unbalanced bracket from
an anchor (§2.3 step 7), while two other tokens touching would read as
one word. So a bracket never touches a chord: `(G` is laid out `( G`.

### 4.5.2 Padding

Room made in the words before a character is padding of one of two
kinds:

- `_`, when the character and the one before it in the words are both
  neither a space nor `_`: the room is inside a word, and it is written
  so that a reader of the text can see that it is not a space between
  words (`W_hen`, `Wh__en`);
- spaces otherwise: before the first character of the line, before a
  space, before the first character of a word, or next to an underscore
  that is part of the words. Spaces are words like any other, so once
  inserted they stay, and are read back as what they are.

Padding with `_` reads back as padding (§4.4), because it always has a
character other than a space and other than `_` on each side; and no
padding ever joins an underscore that is part of the words.

### 4.5.3 The layout

The tokens are placed left to right. Let *end* be the column just past
the last character placed so far, *shift* how far the last attached item
placed has moved from its written column (0 before the first), and
*floor* the last character of the words that an attached item has been
placed over (none before the first). The current column of a character
is its index in the words plus the padding inserted so far before it or
at it; the current column of the end is the length of the words, plus
the padding inserted so far, plus the item's distance past the end.

For each token in turn:

1. Its **wanted column** is, for an attached item, the current column of
   its character; for any other token with a written column, that column
   plus *shift*; for a token with none, none.
2. It is placed at the column it wants if this is the first token (at 0
   if it wants none); otherwise at the column it wants if that is greater
   than *end*, or equal to *end* when the two tokens may touch (§4.5.1);
   otherwise at *end* + 1.
3. If it is an attached item placed to the right of the column it wanted,
   and its character is a character of the words that comes after
   *floor*, then padding as wide as the difference is inserted before
   that character (§4.5.2): the character, and everything after it in
   the words, moves right, so the item is over it again.
4. If it is an attached item, *floor* becomes the character it is now
   over (an item past the end is over the end), and *shift* the
   difference between the column it was placed at and its written
   column.

An attached item whose character cannot be pushed is placed as step 2
says and is over whatever it lands on. That happens only to an item at
the end, where there is nothing to push (trailing spaces are not
written), and in a model an application edited so that two items are
over one character: a reader never produces one, except from a line
where two chords were written over one run of padding.

If the chord line so laid out would be read as a heading, an annotation
or a forced line (§1.7.2, §1.7.3, §1.9, §4.3), it is laid out again, from
the same written columns, with a `,` token first at column 0, which
touches nothing: the guard of §8.4.4. The `,` is not in the model; a
writer writes it where the layout left room for it.

If the words, padded, would not be read as a `prose` line (§4.1) or
would be read as a heading, as when `A_m Em la` loses its padding and
becomes `Am Em la`, a line of chords, the line becomes `forced` (§4.3).
The `>` is written in place of the line's first column, so when that
column is not a space, a space is first inserted at the start of the
words and every column of the line moves right by one.

Finally the model takes the result: each item's column is the column it
was placed at, a measure's column that of its bar line, a measure's
`anchorColumn` that of its anchor (an anchor carried in from elsewhere
gains one here), and the words are divided again at the new columns as
§4.4 divides them. The model's words are the words as laid out,
including any spaces the layout inserted; `_` padding is not in them but
is implied by the columns, as a gap inside a word between one item's
words and the next.

When no token changed width and every token was written with room, every
token goes where it was written and nothing moves. Laying out a line
that is already laid out changes nothing, because every token is then at
a column that step 2 accepts, and every attached item over its
character.

So when a token grows, as `nc` does when it is written `N.C.` or `Cm` when
an edit makes it `Cm[2]`, the tokens after it keep their columns as long
as the gap after it can absorb the growth, always leaving one space;
where it cannot, the words move right just enough. When a token shrinks,
as `(2x)` does when it is written `x2`, the tokens after it stay where
they were:

```
nc G      Am                  N.C. G      Am
Quando eu te vi               Qua__ndo eu te vi

(G   D)  Em                   ( G   D ) Em
la la la la la                l_a la la la la
```

A chord line longer than its words keeps its tokens past the end at
their distance from the end of the words, which moves right with any
padding. Stanza breaks, lyric lines and chord lines that are not sung
are not laid out: each sung line is laid out on its own.

## 4.6 Breaks

A run of one or more blank lines between two lines of the same fence's
music is a **break**, and a reader MUST keep it as one line of kind
`break`, in any document, sung or not. Blank lines at the start or end of
a fence's music, or next to a cifra-style heading at the start or end of a
section's music, are not breaks.

Between two sung or lyric lines a break is a stanza break. Elsewhere it is
the breathing room in the text it has always been, and means nothing to
the music; but it is kept all the same, because it is what keeps a chord
line from taking the words below it (§4.2), and dropping it would change
what the document says.

## 4.7 What a sung document does not have

A sung document has no bar numbers (§2.8). It may still contain chord lines
with bar lines in them, such as an intro, and those are measures as in §2;
they are simply not numbered.

## Open questions

- Nothing at present. A chord line with bar lines may be sung: the words
  divide at item columns and the bar lines divide measures (§4.4). A
  document need not declare itself sung, because one `>` line already
  makes it so (§4.2, §4.3).
