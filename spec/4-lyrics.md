# 4. Words

Depends on: §0, §1, §2.

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

## 4.4 Sung lines: placing chords over words

In a sung line the chord line's items are placed over the words by
**column**: the position of an item's first character, counted in Unicode
code points from the start of its line, starting at 0, in the text as
prepared by §1.3 (after NFC and after tabs became spaces). The words from
an item's column up to the next item's column, in column order, belong to
that item, and a chord written inside a word divides that word, which is
why it was written there.

Columns are code points, not bytes and not UTF-16 code units: an
implementation whose strings are UTF-16, as JavaScript's are, MUST count a
character outside the Basic Multilingual Plane as one column. Counting in
NFC is what keeps a chord over an accented syllable whether the file
spelled the accent as one character or two; it is also how a monospaced
editor shows it.

```
G           D
When I first saw you
```

`G` is at column 0 and `D` at column 12. `G` takes `When I first`, and `D`
takes ` saw you`.

Rules:

- Every item of the chord line (chords, repeat signs, marks, unknown
  tokens) has a column and takes words. Bar lines do not; they divide
  measures as in §2.2, and the words divide with the chords.
- Words before the first item's column, if they are not all whitespace,
  form a leading item with no chord in the first measure.
- An item whose column is at or past the end of the words has no words. A
  reader MUST NOT invent spaces to give it width; separating chords that
  have no words under them is a display concern.
- Words past the last item's column belong to the last item.
- On a `forced` lyric line, the `>` marker and its following space count as
  columns (they are replaced by spaces, not removed), so the chords above
  stay over the syllables they were written over.
- Leading whitespace on both lines is significant, since it is columns.

The words an item takes are kept exactly, including leading and trailing
spaces. Trimming is a display decision.

Column counting assumes the author aligned the lines in a monospaced
editor. A reader cannot do better than what was written; a writer keeps
every item's column wherever it can, and §8.4.5 says exactly how.

## 4.5 Breaks

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

## 4.6 What a sung document does not have

A sung document has no bar numbers (§2.8). It may still contain chord lines
with bar lines in them, such as an intro, and those are measures as in §2;
they are simply not numbered.

## Open questions

- Nothing at present. A chord line with bar lines may be sung: the words
  divide at item columns and the bar lines divide measures (§4.4). A
  document need not declare itself sung, because one `>` line already
  makes it so (§4.2, §4.3).
