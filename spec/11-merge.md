# 11. Merge

Depends on: everything before it for songs, and §10 for setlists. This
section is for programs that merge: an application that syncs a book,
merges an upload or brings in the changes of a book it was forked from,
and a git merge driver. A reader or a writer that does not merge needs
none of it.

Two people change copies of the same song, and their changes have to be
brought together. They started from a common version, the **base**; one
copy is **ours**, the side doing the merging, and the other **theirs**.
A line merge of the kind git does would work on the text, but a song's
text is only partly the author's lines: its voicings are a structure, its
footnote markers are names that canonicalising renumbers, and a sung line
is laid out from what it means. A line merge would make two people who
voiced different instruments conflict, and would let a renumbered marker
silently point at the wrong shape.

So the merge works on meaning where the format has structure, and by
lines where the text is the author's: the chart merges line by line, with
footnote markers left out of the comparison and merged as the
arrangement decisions they are; the voicings merge per tuning, then
variation, then voicing key; properties merge per key. What genuinely
collides is a **conflict**: a value the application can show in musical
terms, and also a text with git's conflict markers in it, for whoever
prefers to edit.

Like the canonical form (§8), the merge is defined to the byte. Two
conforming mergers given the same three texts produce the same result,
or the same conflicts and the same marked text. Nothing is left to an
implementation's choice, so the JavaScript merge an application runs on a
device and a git merge driver on a computer agree, and the corpus can
hold them to it (§11.16).

## 11.1 What is merged

A merge takes three texts, **base**, **ours** and **theirs**, any of
which may be **absent**: the file did not exist there, or was deleted.
Its **outcome** is one of:

- a **result**: a text in canonical form (§8, §10.9);
- **deleted**: the file does not exist after the merge;
- **conflicts**: a list of conflicts (§11.12.1) and, unless the only
  conflict is about the whole file (§11.4), a **marked text** (§11.12.2).

What kind of file is merged is decided by its name. A file whose name
ends in `.setlist.md` is merged as a setlist (§11.13); any other file
given to this merge is merged as a song. Files that are neither, such as
a book's `README.md`, are not merged by this chapter: an application
merges them as it merges any text, and a computer with git uses git's own
line merge. Which three texts are versions of the same file, across
renames, is the caller's business (git's rename detection, or an
application's paths); the merge sees only the texts.

The same merge serves every case in which an application brings two
versions together:

| Case | Base | Ours | Theirs |
|---|---|---|---|
| Sync | the text in the merge base commit | the text in the local commit | the text in the fetched commit |
| Unsaved changes carried over a sync or an upload | the saved text the working copy was edited from | the working copy | the newly saved text |
| Uploading a book with history, or bringing in a fork's original | as for sync | the book's | the upload's, or the original's |
| Uploading a book whose history is unrelated | absent (no merge base) | the book's | the upload's |
| The git merge driver | git's `%O` | git's `%A` | git's `%B` |

A book uploaded with no history at all is not merged: with no common
version there is nothing to merge from, and an application that offers to
replace a file with the uploaded one performs no merge.

## 11.2 The method

A merge proceeds in this order:

1. **Whole files.** If any input is absent, or any present input is not
   UTF-8, the outcome is decided by §11.4, which may go on to step 2.
2. **Canonicalise.** Each present input is read and canonicalised: a song
   as §8 says, a setlist as §10.9 says. Everything below works on the
   three canonical models, and an absent base is the empty document.
   Merging three texts is therefore merging their canonical forms; how
   each was spelled makes no difference.
3. **Unchanged sides.** If the canonical texts of ours and theirs are the
   same, the result is that text. Otherwise, if base's is the same as
   ours's, the result is theirs's; if it is the same as theirs's, the
   result is ours's.
4. **Merge.** The models are merged part by part, as the rest of this
   chapter says.
5. **Finish.** With no conflict, the merged model is written and
   canonicalised (§11.11). With conflicts, the conflicts and the marked
   text are produced (§11.12).

What each part of a song is merged as:

| Part | Merged as | Its elements are identified by | It conflicts when |
|---|---|---|---|
| Title | a value (§11.6) | | both changed it differently |
| Properties | values per key, in a merged order (§11.7) | key | both changed one key differently |
| Sections | a sequence (§11.5) | heading, or body | both changed the same stretch of sections |
| A section's heading | values per field (§11.8.3) | | both changed one field differently |
| A section's body | a sequence of units, one per line (§11.8) | the line's text, without footnote markers | both changed the same line, or both inserted lines at the same place |
| Footnote markers | per occurrence (§11.9) | the occurrences that carry them | never in the chart; through the shapes they lead to |
| Voicing blocks | presence, in a merged order (§11.10) | tuning by sound, and variation | one side deleted a block the other changed; both renamed it differently |
| Voicings | values per block and variant (§11.10.3) | | both chose different shapes for one variant in one block |
| A block's notes | a sequence of lines | the line | both changed the same lines |

## 11.3 Properties of the merge

A conforming merger MUST have these properties, and the rest of this
chapter is written so that it does.

- **It is deterministic.** The outcome depends on the three texts and on
  the kind of file, and on nothing else: not on the program, the machine,
  the time, or the order in which anything is visited beyond what this
  chapter fixes. Two conforming mergers produce the same bytes.
- **It depends on canonical forms only.** Inputs with the same canonical
  forms merge alike (§11.2 step 2).
- **Its result is canonical.** A result is in canonical form, and
  canonicalising it changes nothing (§11.11).
- **Unchanged sides change nothing.** Writing *c(x)* for the canonical
  text of *x*: merging *b*, *x*, *x* gives *c(x)*; merging *b*, *b*, *x*
  and merging *b*, *x*, *b* both give *c(x)*. Here *b* and *x* are the
  same when their canonical texts are (§11.2 step 3).
- **It is symmetric.** Merging base, theirs, ours gives the same result,
  or deletes alike, as merging base, ours, theirs. With conflicts, it
  gives the same conflicts in the same order, each with its ours and
  theirs exchanged, at the same lines of a marked text that is the
  original with the two sides of every region exchanged. There is one
  exception, in the numbers given to footnote variants that occur only
  inside conflicts (§11.9.5).
- **Independent changes do not conflict.** Changes to different
  sections, to different lines of a section (adjacent ones included), to
  the title and to properties of different keys, to the chart and to the
  voicings, to different blocks, and to different variants in one block,
  never conflict. Neither do arrangements made for different
  instruments or different variations, including the footnote markers
  they add to the chart (§11.9). What conflicts is two changes to the
  same line, two insertions at the same place, two values for one thing,
  and a deletion of something the other side changed.

## 11.4 Whole files

When an input is absent, the outcome is:

| Base | Ours | Theirs | Outcome |
|---|---|---|---|
| absent | absent | present | theirs, canonicalised |
| absent | present | absent | ours, canonicalised |
| absent | present | present | merged, with the empty document as the base (§11.2) |
| present | absent | absent | deleted |
| present | absent | present | deleted, if theirs is the same as base (§11.3); otherwise a `file` conflict: deleted by ours, changed by theirs |
| present | present | absent | deleted, if ours is the same as base; otherwise a `file` conflict: changed by ours, deleted by theirs |
| present | present | present | merged |

**No base.** When both sides added the file, or the two histories share
no commit, there is no base, and the merge takes the empty document in
its place: everything on each side is then an addition. What both sides
added alike merges; what they added differently conflicts where it
overlaps (§11.15.13). Git gives a merge driver an empty file for a base
that does not exist, and an empty file is the empty document, so the
driver and an application agree. An application MAY, for unrelated
histories, offer each file present on both sides as a choice between the
two instead of merging it, as Estante's upload does.

**Deleted on one side, changed on the other.** The conflict has no
marked text. Keeping the file keeps the changing side's canonical text;
deleting it deletes it.

**Not UTF-8.** If a present input is not valid UTF-8, it is not a
document (§1.3) and there is nothing to merge: the outcome is a `file`
conflict saying which sides are unreadable, with no marked text. A merger
MUST NOT rewrite such a file.

**Not canonical.** A text that is not canonical is canonicalised before
it is merged (§11.2), which may drop what its reader reported (§8.2). A
program that merges a text not known to be canonical, such as an unsaved
working copy, SHOULD first tell the user what canonicalising it will drop,
as it does before saving (§9.2). Texts from a book's history are
canonical already.

## 11.5 Sequences

Most of a song merges as a sequence: the sections of the chart, the lines
of a section, the notes of a block. This section defines the three-way
merge of a sequence once; the sections that use it say what the elements
are and how three predicates are decided for them:

- **match**, between an element of base and an element of a side: whether
  the two are versions of the same element;
- **same**, between an element of base and a matching element of a side:
  whether the side left it unchanged;
- **equal**, between an element of ours and an element of theirs: whether
  the two sides wrote the same thing.

### 11.5.1 Alignment

The **alignment** of base *A* (*n* elements) with a side *C* (*m*
elements) pairs elements of *A* with matching elements of *C*, in order.
Let *L*(*i*, *j*), for 0 ≤ *i* ≤ *n* and 0 ≤ *j* ≤ *m*, be:

- 0, if *i* = *n* or *j* = *m*;
- 1 + *L*(*i*+1, *j*+1), if *A*[*i*] matches *C*[*j*];
- otherwise the greater of *L*(*i*+1, *j*) and *L*(*i*, *j*+1).

Then, from *i* = 0 and *j* = 0, until *i* = *n* and *j* = *m*:

1. If *i* < *n*, *j* < *m* and *A*[*i*] matches *C*[*j*], they are
   **paired**, and both *i* and *j* advance.
2. Otherwise, if *j* = *m*, or *i* < *n* and *L*(*i*+1, *j*) ≥
   *L*(*i*, *j*+1), *A*[*i*] is **dropped**, and *i* advances.
3. Otherwise *C*[*j*] is **taken**, and *j* advances.

This pairs as many elements as any alignment can (a longest common
subsequence), and its tie-breaking (pair whenever possible; between
dropping and taking, drop first) makes the pairs the same in every
implementation. An implementation MAY compute them by any algorithm that
gives the same pairs. The cost is proportional to *n* × *m*, which for
the sequences of one song is small.

This is not the alignment git computes, and need not be: what matters is
that every merger computes the same one.

### 11.5.2 Changes

From the alignment of base with a side *V*, the side's **changes** are:

- **Runs.** Each maximal stretch of steps that are not pairings, between
  two pairings or an end of the walk, replaces the base elements it
  dropped, a range [*a*, *b*) of base positions, with the side elements
  it took. When *a* = *b* the change is an **insertion** at position *a*;
  when it took nothing, a **deletion**. A run that dropped as many
  elements as it took, at least one, is instead that many changes of one
  element each, the *k*-th dropped element replaced by the *k*-th taken
  one: a line rewritten is a change to that line.
- **Modifications.** A base element paired by *V*'s alignment but not by
  the other side's, and not the same in *V*, is a change replacing
  [*i*, *i*+1) with its counterpart.

A base element paired by both alignments is **in both**. It is not part
of any change, whether or not either side changed it: the sequence's
kind says how it is merged (§11.8.2, §11.8.4).

An ours change and a theirs change **touch** when:

- both are insertions at the same position; or
- one replaces [*a*, *b*) with *b* > *a*, and the other is an insertion
  at a position *g* with *a* < *g* < *b*; or
- both replace ranges that are not empty, and the ranges overlap.

So a change to one line and a change to the next do not touch, nor does
a change to a line and an insertion just before or after it. Two
insertions at the same place touch, because nothing says which comes
first; so do a deletion of a line and a change to it.

Two changes are **identical** when they replace the same range with runs
of the same length whose elements are pairwise equal.

### 11.5.3 The merged sequence

1. Each pair of identical changes is taken once, as a change made by both
   sides.
2. The remaining changes that touch are grouped into **clusters**: two
   changes are in one cluster when they touch, directly or through other
   changes in it. The **span** of a cluster runs from the least start to
   the greatest end of its changes' ranges; an insertion by either side at
   a position strictly inside a cluster's span joins the cluster, which
   is then taken again until nothing joins.
3. The merged sequence is the base sequence with: each element in both
   replaced by its merge; each change in no cluster applied, its range
   replaced by its run; and each cluster's span replaced by the cluster's
   **settlement** (§11.5.4). Where an insertion and a change or element
   stand at the same position, the insertion comes first.

The **run of a side** over a cluster's span [*a*, *b*) is what that side
has there: for each position *p* from *a* to *b*, the side's insertion at
*p*, if it is in the cluster; then, if *p* < *b*, the run of the side's
change starting at base position *p*, if one does, nothing if *p* lies
inside one of the side's changes, and otherwise the element paired with
*A*[*p*]. The **base run** is *A*[*a*..*b*). An insertion at *a* or at
*b* that is not in the cluster is applied on its own, before or after the
cluster's settlement.

### 11.5.4 Settling a cluster

A cluster is settled by the policy of its sequence's kind:

- **Conflict.** The longest common prefix and the longest common suffix
  of the two sides' runs, compared by equal and not overlapping, are taken
  once, as made by both sides. Then, if the kind allows **pairing**, the
  remaining runs have the same length, at least one, and each ours element
  matches the theirs element at the same offset, the pairs are merged as
  elements in both, each with the base element at the same offset as its
  base if the base run has the same length and each of its elements
  matches both, and with none otherwise. Otherwise what remains is a
  **conflict region**, holding the base run and the two remaining runs.
- **Combine.** The two runs are combined (below), and no conflict is
  reported.

**Combining** two runs *X* and *Y*: if they are equal element for
element, the result is *X*. Otherwise each element has a **sort string**,
which its kind defines; the run whose sort strings come first, compared
element by element by code point and with a run that is a prefix of the
other coming first, is written first, followed by every element of the
other run whose identity is not already in it. Combining is symmetric: it
gives the same sequence whichever run is ours.

### 11.5.5 Keyed lists

Some lists have elements with an **identity**, unique within each
version, whose order matters only for how they are written: properties
(identified by key), voicing blocks (by tuning and variation), a
setlist's entries and items. A keyed list merges in three parts.

**Presence.** An identity is in the result when:

- it is absent from base and present on either side, or both (*added*);
- it is present in base and on both sides;
- it is present in base and on one side only, and that side changed it:
  this is a conflict, deleted against changed, and the identity is in the
  result until the conflict is resolved. If the side that kept it did not
  change it, it is not in the result.

What counts as a change is the list's to say.

**Values.** An identity in the result has its value merged as the list
says, with an absent base where it was added.

**Order.** The three sequences of identities are merged as §11.5.1 to
§11.5.4 say, with match, same and equal all being equality of identity,
and every cluster combined. Then every identity that is not in the result
is removed, and every repeat of an identity after its first. Last, each
identity in the result that the sequence lacks is inserted, taking them
in code-point order of their sort strings, right after the nearest
identity that precedes it in the side that holds it and is already in the
sequence, or first if there is none. Only one side can hold an identity
the sequence lacks: it is one that side kept and the other side deleted,
in a stretch where the other side's change was applied.

A reorder made by one side is therefore kept, two reorders of different
stretches are both kept, and two reorders of one stretch are combined
deterministically. Order never conflicts.

## 11.6 Values

A **value** is merged from its base value *a*, ours *x* and theirs *y*,
any of which may be **none**: absent on that side.

1. If *x* = *y*, the result is *x*.
2. Otherwise, if *y* = *a*, the result is *x*; if *x* = *a*, it is *y*.
3. Otherwise the value is in conflict.

A result of none means the thing is absent from the result: a property
not written, a voicing not in its block.

## 11.7 Metadata

### 11.7.1 Title and properties

The title is a value (§11.6), none when the document has no title. A
conflict is a `title` conflict.

The properties are a keyed list (§11.5.5). The identity of a property is
its key, which is also its sort string; its value is its value; a side
changed a property when its value differs from base's. A conflict on a
value is a `property` conflict, and so is one of presence (deleted
against changed). The result holds the merged properties in the merged
order, which canonical form then writes as it is (§8.4.2).

### 11.7.2 Properties that change how the text reads

Two properties change how the rest of the document is read: `notation`
decides the four ambiguous spellings (§5.6), and `words` decides whether
the document is sung (§4.2). When one side changes one of them and the
other side adds music, the music the other side wrote is read in the
result under a property its author did not see. The merge does not let
that pass silently.

Let *V* be the side that changed the property, *W* the other, and let
*W*'s **applied music** be the music lines in the changes of *W* that the
chart's merge applied on their own (§11.5.3 step 3, at the level of
sections and of units).

- **`notation`.** If the dialect *V* reads its chart in (§5.6, with the
  fallback of §1.4.3) differs from base's, *W*'s does not, and *W*'s
  applied music holds a chord whose chord model (§5.2) differs between
  the two dialects, the property `notation` is in conflict: a `reading`
  conflict naming those chords' symbols, distinct, in the order they
  first appear in the merged chart.
- **`words`.** If *V*'s value of `words` differs from base's, *W*'s does
  not, and *W* has applied music at all, the property `words` is in
  conflict: a `reading` conflict.

A `reading` conflict takes the place of the property's merge; resolving
it chooses the property's value, and the music stays as merged. Where the
property was changed by both sides, it is merged as any property, and a
difference is a `property` conflict.

## 11.8 The chart

### 11.8.1 Units

The body of a section (§1.9) is merged as a sequence of **units**:

- each line of a notes part, as the model holds it (a blank line in notes
  is a unit with empty text);
- for each music part, a **fence unit**, then one unit per line of its
  music (§0.4: a chart, sung, lyric, break or annotation line; a sung
  line, chords and words, is one unit);
- for each verbatim part, a fence unit carrying its info string, then one
  unit per line, blank lines included.

Each unit has a **kind**: notes, fence (with its info string), music, or
verbatim (with its part's info string). Its **text** is what canonical
form writes for it: the line as held, for notes and verbatim; ```` ``` ````
and the info string, for a fence unit; and for a music line its line, or
for a sung line its two lines joined by a LF, as §8.4.4 and §8.4.5 write
them.

Its **masked text** is its text written with every chord's symbol in
place of its key, so that `Cm[2]` is written `Cm`. On a sung line each
token stays at the column it is written at (§4.5.1); a symbol is never
wider than its key, so masking moves nothing. Unknown tokens, and
everything other than a chord, are written as in the text.

For units:

- a base unit and a side unit **match** when their kinds are the same and
  their masked texts are the same;
- a matching side unit is the **same** as the base unit unless one of its
  chords is re-keyed (§11.9.3);
- an ours unit and a theirs unit are **equal** when their kinds are the
  same and their masked texts are the same.

So a change to a footnote marker alone is not a change to the line it is
on: the line matches, and the marker is merged as an arrangement decision
(§11.9). A marker that grew enough to push the words (§4.5) did change the
line, because its words were pushed; that line is then a change of the
side that pushed them.

A sung line is one unit because what it means, which character each chord
is over, needs both its lines. A change to a chord on it and a change to
its words are two changes to one unit, and conflict.

### 11.8.2 Sections

The sections of the chart are merged as a sequence. A section's
**heading** is four fields: its heading form (`markdown`, `bracket`,
`label`, or `none` for the music before any heading), its name, its
anchor and its times (§1.7.4); two headings are the same when all four
are.

- A base section and a side section **match** when their headings are the
  same, or when their bodies have at least one unit and the same number of
  units, each matching its counterpart. So a section that one side renamed
  is still the same section, and one whose body one side edited is too.
- A matching side section is the **same** when its heading is the same,
  and its body has as many units as base's, each the same as base's at
  the same position.
- An ours section and a theirs section are **equal** when their headings
  are the same and their bodies' units are pairwise equal.

A section in both is merged as §11.8.3 and §11.8.4 say. Clusters are
settled by the conflict policy, with pairing: two sections that both
sides added under the same heading, as happens when two people write the
same song, are merged as one, line by line. Two sections paired with no
base are merged as if their base had a heading whose every field is none
and a body with no units, so that everything in them is added.

A conflict region of sections is a `sections` conflict. It arises when
one side deleted a section the other changed; when both inserted
different sections at the same place; and when one side renamed a section
and changed its body while the other changed it too, since the section
then matches nothing on the side that did both (§11.15.3).

### 11.8.3 Headings

A heading in both is merged field by field, each field a value (§11.6).
If any field is in conflict, the heading is a `heading` conflict, which
shows each side's heading with every field that did not conflict merged.

### 11.8.4 Bodies

A body is merged as a sequence of units, clusters settled by the conflict
policy without pairing. A unit in both is written once, its chords
carrying the keys of their variants (§11.9).

The merged sequence of units is put back into parts in order: a fence
unit begins a music part, or a verbatim part with its info string; a line
unit whose kind is not that of the part it follows begins a part of its
kind (a notes line, a notes part; a music line, a music part; a verbatim
line, a verbatim part with its info string); and a line unit with no part
before it begins one likewise. Each side's own sequence is always in
parts; the rule settles what a merge of two of them leaves.

### 11.8.5 What the merged text decides

Repeat groups (§3.2), bar numbers (§2.8), which line a chord line takes
as its words (§4.2) and whether the document is sung are not merged. They
are what the merged text says when it is read (§11.11).

So a repeat group spanning lines merges as those lines: a side that moved
its closing mark to another line changed those two lines, and a change by
the other side to a line between them merges with it. If the merged text
leaves a mark unpaired, the reader reports a stray mark and keeps it
(§3.2), as it would in any document; that is not a conflict. Likewise, a
chord line one side added directly above a line of words the other side
added at the same place is an insertion at the same place by both, and
conflicts; one added above a line both sides kept takes that line as its
words, as it would had one person written both.

## 11.9 Footnote markers

### 11.9.1 Why names are not enough

A footnote marker names an arrangement decision, "this bar plays the
second `Cm`", and each block says what that decision is on its instrument
(§2.4, §7.4). The names are local to one text. Canonicalising renumbers
them (§8.3): a side that deleted the only `Cm[2]` has its `Cm[3]` called
`Cm[2]`. And two sides choose names independently: ours may add `Cm[2]` in
bar 3 for the guitar while theirs adds `Cm[2]` in bar 7 for the ukulele,
two decisions under one name.

So the merge never takes a marker's name as its identity. It identifies
decisions by the occurrences that carry them, merges which occurrences
share a decision, and numbers the decisions afresh. Keys used only by
unknown tokens (§8.3) are not markers: they are identified by their text,
in every version alike.

### 11.9.2 Corresponding keys

Two units paired by an alignment have the same masked text, so they hold
the same chords in the same order. The *k*-th chord of one and the *k*-th
of the other are **corresponding occurrences**. Units are aligned within
sections (§11.8.2), and corresponding occurrences are taken from every
pair of units in every pair of matching sections that the alignment of
base with the side pairs.

For a side *V* and each chord symbol, let *c*(*b*, *v*) be the number of
corresponding occurrences whose key is *b* in base and *v* in *V*. Then:

1. Among the pairs with *c*(*b*, *v*) > 0 whose *b* and *v* are both
   unmatched, the pair with the greatest count is **matched**; between
   equal counts, the one with the least index of *b*, then the least
   index of *v*. This is repeated until no such pair is left.
2. Then, for each index in ascending order: if base and *V* both have a
   key of that symbol with that index, both are unmatched, and neither
   has any corresponding occurrence, they are matched. This is the key
   whose only occurrences are in lines *V* changed, where *V* kept its
   name.
3. Every other key of *V* is **new** in *V*.

**match**_V_(*b*) is the key of *V* matched with base key *b*, or none;
**μ**_V_(*v*) is the base key matched with *v*, or none.

The greatest count wins because a side that splits one occurrence off a
key (§8.5.1 step 4) leaves most of them where they were: the key that
keeps most of a base key's occurrences continues it, and the one split
off is new.

### 11.9.3 Re-keyed occurrences

An occurrence in a side unit that corresponds to a base occurrence with
key *b* is **re-keyed** when its key on that side is not
match_V_(*b*). Renumbering is not re-keying: the renumbered key is matched
with the base key it was. Re-keying is a side moving an occurrence to
another decision: splitting it off (§8.5.1 step 4), moving it to an
existing key (§8.5.1 step 2), or joining two keys (§8.3 I3).

A unit with a re-keyed occurrence is not the same as its base (§11.8.1),
and neither is a section holding one (§11.8.2). Where both sides paired
the unit, that changes nothing: the occurrence is in both, and §11.9.4
merges its decision with the other side's. Where the other side changed
the unit, the two changes touch and conflict. Were it otherwise, a
voicing chosen for one bar would be lost without a word because someone
fixed another chord on its line.

### 11.9.4 Variants

The decisions of the merged document are its **variants**. Every chord
occurrence in the merged chart, and in each side of each conflict region,
has a **signature** (*β*, *ω*, *τ*): its key in base, ours and theirs,
or none:

1. In a unit in both: its three keys.
2. In a unit taken once from a change made by both sides, or from the
   common prefix or suffix of a cluster (§11.5.4): (*β*, *o*, *t*), where
   *o* and *t* are its keys in ours and theirs, and *β* is μ_O_(*o*) if
   that is the same base key as μ_T_(*t*), and none otherwise.
3. In a unit from one side *V* only (a change applied on its own, or *V*'s
   side of a conflict region), with key *v*, and *W* the other side: if
   μ_V_(*v*) is a base key *b*, the signature has *b* for base, *v* for
   *V* and match_W_(*b*) for *W*. Otherwise, if some occurrence under rule
   1 has key *v* on side *V*, the signature that most such occurrences
   have, and between equal numbers the one that occurs first in the merged
   chart. Otherwise none for base, *v* for *V*, none for *W*.

Occurrences of one symbol with the same signature are one variant.
Occurrences that any version tells apart are therefore different
variants, and occurrences no version has seen together are different too,
unless rule 3 joins them: a line one side added with a key that side also
gave to a bar that both sides kept joins that bar's variant.

Keeping apart whatever any version tells apart is safe, because the
canonical form joins variants again when no block tells them apart
(§8.3 I3). So a side that joined two keys loses nothing: each is merged
on its own with the shapes the joining side gave it, and they are one key
again in the result unless the other side gave them different shapes on
some instrument, in which case keeping them apart is what that
instrument's arrangement needs.

### 11.9.5 Numbering

Each variant is given an index, which the merged model writes as its
marker. For each symbol, its variants are ordered:

1. by the indices of the keys in their signatures, those that are not
   none, taken in descending order and compared as lists, element by
   element, a list that is a prefix of another coming first;
2. then by their first occurrence in the merged chart, in which the
   occurrences inside a conflict region are those of ours's side, then
   those of theirs's.

The first variant takes index 1, the next 2, and so on. The canonical
form then joins and renumbers as §8.3 says (§11.11).

The first rule keeps the numbering both sides already agree on: a key
neither side renamed keeps its relative place, a key a side renumbered
takes its new place, and a variant either side split off comes after the
ones it was split from. The second only decides between variants that the
first cannot tell apart, such as two that the two sides split off at
the same time. Ordering by position in the merged chart is symmetric
except between two variants whose first occurrences are on opposite sides
of one conflict region: there ours's comes first. That is the one place
where merging base, theirs, ours is not the exact mirror of merging base,
ours, theirs (§11.3), and it only changes which of two markers in a
conflict the user is about to resolve is called which.

## 11.10 The voicings part

### 11.10.1 Blocks

A voicing block's identity is its tuning, compared by sound (§6.3), and
its variation's name (§7.3), `""` for the default variation. Blocks
written for the same tuning in different spellings, `Eb2` and `D#2`, are
the same tuning.

A side may also have **renamed** a block. A base block *X* and a side
block *Y* are a rename when *X* has no block of its identity on that side,
*Y* has none in base, they are for the same tuning, every variant's
voicing (§11.10.3) is the same in *Y* on that side as in *X* in base,
their notes are the same, and no other block of that side is a rename of
*X* and no other base block a rename of *Y*. A renamed block is the same
block under another name, so a variation renamed on one side and edited
on the other keeps the edits.

The blocks are a keyed list (§11.5.5). A block's identity is its tuning
and its name in base, through a rename where there is one; its sort string
is its heading as the result writes it. A side **changed** a block when it
renamed it, when its notes differ from base's, or when some variant's
voicing in it differs from base's and is not weak (§11.10.3). A block
deleted by one side and changed by the other is a `block` conflict.

A block's name is a value: base's, and each side's after any rename. A
conflict, both sides renaming one block differently, is a `variation`
conflict.

An empty block is a variation that exists (§7.3): adding one, deleting
one and keeping one are changes of presence like any other.

### 11.10.2 Tunings

A tuning's **spelling** is the text a version writes for it (§6.2,
§8.4.6), or none where the version has no block for it. The spelling is a
value, but it never conflicts: where §11.6 would report a conflict, the
result is whichever of the two sides' spellings that is not none comes
first by code point. Spelling is not music, and two people who wrote one
tuning two ways have not disagreed about anything.

### 11.10.3 Voicings

A block in the result holds, for each variant (§11.9.4), the merge of
its **voicing** in that block: the fret string and fingering, as §8.4.6
writes them after the key, or none. For a variant with signature
(*β*, *ω*, *τ*), its voicing on each version is that version's item for
its key there in that version's counterpart of the block, and none where
the key, the block or the item is absent.

**Weak absence.** A side that splits an occurrence off a key, for one
instrument, leaves it with no voicing on every other instrument, though it
had one there before (§8.5.1 step 4, §7.6). That absence is a side effect,
not a decision about those instruments. So a side's voicing for a variant
in a block is **weak** when the variant has a base key *β*; the side's
key is not match(*β*) on that side; the side has the block but no item for
its key in it; and the item for match(*β*) in that block on that side
(none if there is none) is the same as base's voicing for the variant.

The voicing is merged as a value (§11.6), with one more step between
steps 2 and 3: if ours's voicing is weak, the result is theirs's; if
theirs's is weak, it is ours's. So a bar one side split off for the
guitar takes the shape the other side then chose for its chord on the
ukulele, and keeps none on the ukulele if the other side chose nothing
(§11.15.9).

A conflict is a `voicing` conflict: one variant, one block, two shapes,
or a shape on one side and none on the other where both decided.

A voicing for a key that no occurrence in the merged chart uses is not
merged: the result does not keep it (§8.3 I1). A side that chose a shape
for a chord in a line the other side deleted has made a choice nothing
plays any more, and it goes with the line.

### 11.10.4 Notes and order

A block's notes are merged as a sequence of lines, each line an element;
two lines match, are the same and are equal when their texts are. Clusters
are settled by the conflict policy without pairing; a conflict region is
a `block-notes` conflict.

The result's blocks are in the merged order of the keyed list. Canonical
form then writes them grouped by tuning, the default variation first
(§8.4.6), so the merged order decides only the order of tunings and of
named variations within one.

## 11.11 The result

When nothing is in conflict, the result is built from the merged model:

1. The model holds the merged title and properties, the merged sections
   with their bodies put back into parts (§11.8.4), and the merged blocks.
   Each chord carries its variant's symbol and index (§11.9.5); each block
   holds an item for every variant whose merged voicing in it is not
   none.
2. The footnote invariants are applied to it, I1, then I3, then I2
   (§8.3).
3. Every sung line is laid out (§4.5), which pushes its words where a
   marker grew.
4. It is written as §8.4 says.
5. The text written is canonicalised (§8): read, and written again. The
   result is that text.

Step 5 is what makes the result a document: reading the text the merge
wrote decides what is sung, which groups are paired and how bars are
numbered, exactly as it would for a text someone typed, and canonicalising
gives the one text a document has. Each step is defined to the byte, so
the result is; and a canonical text is a fixed point (§8.1), so the
result is canonical and canonicalising it changes nothing.

## 11.12 Conflicts

### 11.12.1 The conflict model

A merge with conflicts produces this structure. As with a document's
(§0.4), an implementation may represent it however it likes, but a
conforming merger must be able to produce it as JSON (§11.12.5).

```
Outcome
  result?         the merged text, when nothing conflicts
  deleted?        when the merge deletes the file
  conflicts[]     in the order of their regions in the marked text
  marked?         the marked text, when a conflict has a region

Conflict
  kind            what is in conflict (below)
  line?           the line of its region's first marker in the marked text
  about           what the kind says it is about: a key, a block, an item
  base?           the thing in base
  ours?           the thing on our side
  theirs?         the thing on their side
                  (a side on which the thing is absent has none; a run
                  of lines or sections that is empty is an empty run)
```

The kinds, for songs:

| Kind | About | Base, ours and theirs are |
|---|---|---|
| `file` | the whole file: deleted on one side and changed on the other, or not UTF-8 | which side deleted it, or which sides are unreadable |
| `title` | the title | the titles |
| `property` | one property: two values, or deleted against changed | the values |
| `reading` | `notation` or `words` changed by one side, under music the other side wrote (§11.7.2) | the values, which side changed it, and for `notation` the symbols that read differently |
| `heading` | a section's heading (§11.8.3) | the heading lines |
| `chart` | a stretch of lines in one section | the runs of units, as their texts |
| `sections` | a stretch of sections (§11.8.2), or a section whose conflicts are written whole (§11.12.2) | the runs of sections, as their texts |
| `voicing` | one variant in one block | the voicings |
| `variation` | a block renamed differently by both sides | the names |
| `block` | a block deleted by one side and changed by the other | the blocks, as their texts |
| `block-notes` | a stretch of a block's notes | the runs of lines |

and for setlists, `title`, `property`, `item`, `text`, `entry` and
`notes` (§11.13).

These are the conflicts an application presents in musical terms: a
stretch of chart with each side's bars, a shape for one chord in one
tuning and variation with each side's diagram, a property with each
side's value, a section or a block one side deleted. Runs are written in
the result's keys (§11.9.5), except a base run of units or sections, which
is written as base has it.

### 11.12.2 The marked text

The **marked text** is the merged document written with each conflict in
its place as a **region**: a line `<<<<<<< ours`, ours's lines, a line
`=======`, theirs's lines, and a line `>>>>>>> theirs`. A side that has
nothing there has no lines between its markers. It is what the *edit*
choice of an application opens, and what a git merge driver writes. It is
written as the result would be (§11.11 steps 1, 3 and 4), from the
merged model in which every variant of both sides is kept, without the
footnote invariants (step 2) and without canonicalising (step 5). Its
markers are those of §11.9.5, already 1 to *n* for each symbol; the
variants of both sides of every chart region are among them; and each
block holds an item for every variant whose merged voicing in it is not
none, and a region for every voicing in conflict.

Where each region goes, and what each side's lines are:

| Kind | Region | Each side's lines |
|---|---|---|
| `title` | in place of the title line | `# ` and the title, or nothing |
| `property`, `reading` | in place of the property's line, at its place in the merged order | `- key: value`, or nothing |
| `heading` | in place of the heading line | the side's heading line (§8.4.3) |
| `chart` | in place of the lines, inside the part they are in | the side's lines, written as their part writes them (§8.4.3 to §8.4.5) |
| `sections` | a block of its own (§8.4.1) | the side's sections, each written as §8.4.3 writes a section, with one blank line between them |
| `voicing` | in place of the item, at its place in its block (§8.4.6) | the item line, or nothing |
| `variation` | in place of the block's heading line | the block heading with the side's name |
| `block` | a block of its own, at the block's place | the block as the side has it, in the result's keys, or nothing |
| `block-notes` | in place of the notes lines | the side's lines |

Further:

- A region in place of lines is lines: no blank line is added before or
  after it. A region that is a block is separated from the blocks around
  it by one blank line, as any block is. Inside any region there is no
  blank line directly after `<<<<<<< ours` or `=======` or directly before
  `=======` or `>>>>>>> theirs`, other than a side's own blank lines.
- A `chart` region is written inside a part only when every unit of its
  two runs is a line of one kind (§11.8.1), not a fence unit: it then
  stands in the merged body as a line of that kind, and the body is put
  into parts with it (§11.8.4). If its runs hold a fence unit or lines of
  different kinds, the region cannot stand in one part, and the section
  is written whole instead: every conflict in the section, its heading's
  included, becomes one `sections` region whose sides are the whole
  section with each of those conflicts settled ours's way and theirs's
  way. So does a section with a `heading` conflict whose heading is a
  bracket or a label heading on either side, since that heading line is
  written inside a fence on one side and might not be on the other.
- A section whose first line is in a region does not have it written on
  its bracket or label heading line (§8.4.3 step 2).
- A fence that canonical form would continue across sections (§8.4.3) is
  closed before a region that is a block, and a section after it opens a
  new one.
- A fence is as long as its contents require (§8.4.3), the lines of both
  sides of the regions inside it included.

### 11.12.3 Marker lines

A **marker line** is a line, after the text layer of §1.3, that is
`<<<<<<<`, `=======`, `>>>>>>>` or `|||||||`, either alone or followed by
a space and anything. The four markers are those git writes, so a merge
made by git's own line merge, in any of its styles, is caught too. A text
that holds a marker line is a **marked text**.

A marked text is not a document anyone has written: it is a merge waiting
for someone. It is never canonical, whatever §8 would make of its lines.
A writer MUST NOT save one: it MUST refuse, and point at the first marker
line. A program that checks whether a text is canonical, such as a hook
that guards a book, MUST find a marked text not canonical. A reader reads
a marked text as any text, where the marker lines are notes, unknown
tokens or forced lines depending on where they fall, and SHOULD report
each marker line.

So a document cannot hold a line of exactly seven `=` or `<` or `>`, even
in its notes. That is the price of making an unresolved merge impossible
to save by accident, and a line of seven of anything has better
spellings.

### 11.12.4 Resolving

To resolve a conflict **by one side** is to replace its region in the
marked text by that side's lines; to resolve it **by editing** is to
replace the region by any lines. When no region is left, the text is
canonicalised (§8), and that is the merge's result. Resolving every
conflict by ours, or every conflict by theirs, gives a document; so does
any mix of the two. A `file` conflict has no region: it is resolved by
keeping the changed side's canonical text, or by deleting the file (§11.4),
or for an unreadable file by choosing one side's bytes.

An application presents conflicts one at a time, from the conflict
model, and offers *keep mine* and *take theirs* as resolution by one side
and *edit* as resolution by editing the marked text, since a region it
can resolve by a side is exactly a region of the marked text.

### 11.12.5 As JSON

A merger MUST be able to give the conflicts as a JSON object with one
member, `conflicts`, an array with one object per conflict, in the order
of their regions in the marked text, a `file` conflict first. Each object
has these members, in this order, and no others:

| Member | Present | Value |
|---|---|---|
| `kind` | always | the kind |
| `line` | when the conflict has a region | the 1-based line number, in the marked text, of its `<<<<<<< ours` line |
| `deleted` | `file`, deleted against changed | `"ours"` or `"theirs"` |
| `unreadable` | `file`, not UTF-8 | the sides that are not, in the order `"base"`, `"ours"`, `"theirs"` |
| `item`, `occurrence`, `after` | the setlist kinds (§11.13) | which item or notes block |
| `tuning` | `voicing`, `variation`, `block`, `block-notes` | the tuning as the marked text writes it |
| `variation` | `voicing`, `block`, `block-notes` | the variation's name in the result, `""` for the default |
| `key` | `property`, `reading`, `voicing`, `entry` | the property's key, or the variant's key as the marked text writes it |
| `changed` | `reading` | the side that changed the property |
| `symbols` | `reading` of `notation` | the symbols that read differently |
| `base`, `ours`, `theirs` | every kind but `file`: each when the thing is present on that side, and always for a run | a string for a value, a heading line, a voicing, a block or an item; an array of strings for a run, one per unit, section or line |

A unit's string is its text (§11.8.1), a sung line's two lines joined by
a LF; a section's or a block's is the text canonical form writes for it,
its lines joined by LFs, with no final LF. The JSON is written as the
corpus writes its JSON: a two-space indent, characters outside ASCII as
themselves, and a final newline.

## 11.13 Setlists

A setlist (§10) merges as a song does, with less in it. Its inputs are
canonicalised as §10.9 says; whole files, unreadable inputs and unchanged
sides are as §11.2 to §11.4 say; and its result is written and
canonicalised as §10.9 says.

**Title.** A value; a conflict is a `title` conflict.

**The setlist's entries** (§10.3.1) are a keyed list. A property is
identified by its key; an unrecognised entry by its text and, if the
same text occurs more than once, by its **occurrence**, 1 for the first,
2 for the second. The sort string is the key, or the text. A property's
value merges as a value, a conflict being a `property` conflict; an
unrecognised entry has no value, only presence.

**The body** (§10.6) is a keyed list of items and notes blocks:

- A song item is identified by its path, as §10.9.2 writes it, and its
  occurrence among the song items with that path: the same song played
  twice is two items. An unlinked item is identified by its content and
  its occurrence among the unlinked items with that content.
- A notes block is identified by the item it follows, or by being first
  when it precedes every item. Two notes blocks never stand next to each
  other, so this is unique.
- The sort string of an item is its line as §10.9.2 writes it without the
  number and the space after it; of a notes block, its first line.
- A song item's value is its link text and its entries; an unlinked
  item's, its entries; a notes block's, its lines. A side **changed** an
  element when its value differs from base's.

Items move freely: a reorder by one side is kept, and two reorders are
combined (§11.5.5). An item each side added is in the result, both
items, ordered by their sort strings where they were added at the same
place. A song one side removed and the other changed, a different `key`
or `note`, is an `item` conflict: deleted against changed.

The merge of an item in the result: its link text is a value, a conflict
being a `text` conflict; its entries are a keyed list as the setlist's
are, each property's value a value, a conflict being an `entry` conflict.
A notes block's lines are a value, a conflict on them or on its presence
being a `notes` conflict. Canonical form writes an item's `key` and
`note` first whatever the merged order says (§10.9.2).

**The marked text** is written as §10.9 writes a setlist, with regions as
for songs (§11.12.2):

| Kind | Region | Each side's lines |
|---|---|---|
| `title`, `property` | in place of the line | the line, or nothing |
| `item` | in place of the item's lines, inside its run | the item line and its entry lines, or nothing |
| `text` | in place of the item line | the item line with the side's text |
| `entry` | in place of the entry line | the entry line, or nothing |
| `notes` | a part of its own (§10.9.2) | the notes lines, or nothing |

Items are numbered as canonical form numbers them, each side of a region
counting on from the number before the region; after the region, the
numbering continues from the number before it plus the greater of the
numbers of items on the two sides. Entry lines are indented for the
number on their item line.

In the JSON (§11.12.5), an `item`, `text` or `entry` conflict has
`item`, the item's identity (its path as written, or its content), and
`occurrence` when that is more than 1; an `entry` conflict has `key`; a
`notes` conflict has `after`, the identity of the item the block follows
(with `occurrence` when more than 1), and no `after` when it is first. An
item's string is its line without the number, then its entry lines
without their indentation, joined by LFs; a notes block's, its lines
joined by LFs.

## 11.14 The git merge driver

A computer that holds a book merges its songs and setlists the way an
application does through a git merge driver, a program git runs for each
file both sides changed. Configured as:

```
[merge "cifra"]
	name = cifra.md songs and setlists
	driver = git-merge-cifra %O %A %B %P
```

with, in the book's `.gitattributes`:

```
*.cifra.md merge=cifra
*.setlist.md merge=cifra
```

git gives the driver the base (`%O`, an empty file when the file has no
base), ours (`%A`), theirs (`%B`) and the file's path (`%P`). A
conforming driver:

- merges the three as this chapter says, choosing a song or a setlist by
  the path;
- writes the result to `%A` and exits with status 0 when nothing
  conflicts;
- writes the marked text to `%A` and exits with status 1 when something
  conflicts;
- leaves `%A` as it is and exits with status 1 when an input is not UTF-8,
  saying so on its standard error;
- writes markers of exactly seven characters with the labels `ours` and
  `theirs`, whatever marker size git asks for, so that its marked text is
  the one the corpus holds.

git does not run a driver when only one side changed a file; it takes
that side's text, which in a book whose texts are canonical is what
§11.2 step 3 gives. Nor does it run one for a file one side deleted: git
reports that conflict itself, where §11.4 deletes the file when the other
side's change left its canonical form as it was. When every text is
canonical the two agree, since a change that leaves a canonical form as it
was leaves its bytes as they were; they can differ only over a text that
is not canonical, such as one saved under an earlier version of this
specification.

## 11.15 Examples

Each example gives what changed on each side and what the merge gives.
Texts not shown are as in the example they come from.

### 11.15.1 Different sections, a rename and an edit

Base:

````
# Blues in D minor

## A
```
Dm | G7 | C7 | F
Bb | A7 | Dm | %
```

## B
```
Gm | C7 | F Dm | Gm A7
```
````

Ours renames *B* to *Bridge* and writes the last bar of *A* out as `A7`.
Theirs makes the last bar of *B* `Gm7 A7` and adds `- key: Dm`. The result:

````
# Blues in D minor
- key: Dm

## A
```
Dm | G7 | C7 | F
Bb | A7 | Dm | A7
```

## Bridge
```
Gm | C7 | F Dm | Gm7 A7
```
````

Ours's *Bridge* matches base's *B* by its body, theirs's *B* by its
heading; *B* is in both, its heading takes ours's name and its body
theirs's line.

### 11.15.2 One line, two changes

From 11.15.1's base, ours writes the first line's last bar `F7M`, and
theirs `Fmaj7`, the same chord spelled two ways; to the merge, which
compares text, two different lines. The marked text:

````
# Blues in D minor

## A
```
<<<<<<< ours
Dm | G7 | C7 | F7M
=======
Dm | G7 | C7 | Fmaj7
>>>>>>> theirs
Bb | A7 | Dm | %
```

## B
```
Gm | C7 | F Dm | Gm A7
```
````

and the conflicts:

```json
{
  "conflicts": [
    {
      "kind": "chart",
      "line": 5,
      "base": [
        "Dm | G7 | C7 | F"
      ],
      "ours": [
        "Dm | G7 | C7 | F7M"
      ],
      "theirs": [
        "Dm | G7 | C7 | Fmaj7"
      ]
    }
  ]
}
```

Had theirs changed the second line instead, `Bb7M | A7 | Dm | %`, the two
changes would not touch (§11.5.2), and the result would hold both.

### 11.15.3 A section deleted and changed

From 11.15.1's base, ours deletes *B*, and theirs makes its last bar
`Gm7 A7`. Base's *B* matches theirs's and nothing of ours's; theirs's is
not the same, so the deletion and the change touch:

````
# Blues in D minor

## A
```
Dm | G7 | C7 | F
Bb | A7 | Dm | %
```

<<<<<<< ours
=======
## B
```
Gm | C7 | F Dm | Gm7 A7
```
>>>>>>> theirs
````

with one `sections` conflict at line 9, its `ours` an empty run. Had
ours renamed *B* to *Bridge* and also changed a bar in it, ours's section
would match nothing in base, and theirs's change to *B* would conflict
with it in the same way.

### 11.15.4 Lines of words

Base:

````
## Verse
```
G           D
When I first saw you
Em              C
walking down the road
```
````

Ours makes the first chord line's `D` a `D7`; theirs makes the first line
of words *When I first met you*. Both changed the first sung line, which
is one unit:

````
## Verse
```
<<<<<<< ours
G           D7
When I first saw you
=======
G           D
When I first met you
>>>>>>> theirs
Em              C
walking down the road
```
````

Had theirs changed the second line of words, the two changes would be to
two units, and the result would hold both.

### 11.15.5 Two instruments, two new markers

Base:

````
## A
```
Cm | F7 | Cm | G7
Cm | F7 | Cm | G7
```

---

## Voicings: E2 A2 D3 G3 B3 E4
- Cm: x35543
- F7: 131211
- G7: 320001

## Voicings: G4 C4 E4 A4
- Cm: 0333
````

Ours, arranging the guitar, plays bar 3 higher: it becomes `Cm[2]`, with
`- Cm[2]: 8-10-10-8-8-8` in the guitar's block. Theirs, arranging the
ukulele, plays bar 7 differently: it becomes `Cm[2]`, with
`- Cm[2]: 5333` in the ukulele's block. Both write `Cm[2]`, for two
different decisions.

Masked, neither line changed, so both are in both. Bar 3 has the
signature (`Cm`, `Cm[2]`, `Cm`), bar 7 (`Cm`, `Cm`, `Cm[2]`), and the
other `Cm`s (`Cm`, `Cm`, `Cm`): three variants. Bar 3's guitar voicing is
ours's new shape, and its ukulele voicing, none on ours's side, is weak,
and theirs left the ukulele's `Cm` as it was, so it is none. Bar 7 is the
same the other way round. The other `Cm`s sort by the list `[1, 1, 1]`,
and bars 3 and 7 both by `[2, 1, 1]`, so bar 3, which comes first in the
chart, is `Cm[2]` and bar 7 `Cm[3]`. The result:

````
## A
```
Cm | F7 | Cm[2] | G7
Cm | F7 | Cm[3] | G7
```

---

## Voicings: E2 A2 D3 G3 B3 E4
- Cm: x35543
- Cm[2]: 8-10-10-8-8-8
- F7: 131211
- G7: 320001

## Voicings: G4 C4 E4 A4
- Cm: 0333
- Cm[3]: 5333
````

Had both split off bar 3, one for each instrument, bar 3 would have the
signature (`Cm`, `Cm[2]`, `Cm[2]`), one variant, and the result one
`Cm[2]` with the guitar's shape from ours and the ukulele's from theirs.

### 11.15.6 A marker renumbered on one side

Base:

````
## A
```
Cm | F7 | Cm[3] | G7
Cm[2] | F7 | Cm | G7
```

---

## Voicings: E2 A2 D3 G3 B3 E4
- Cm: x35543
- Cm[2]: x3554x
- Cm[3]: 8-10-10-8-8-8
- F7: 131211
- G7: 320001
````

Ours deletes the second line. `Cm[2]` is no longer used, and canonical
form renames ours's `Cm[3]` to `Cm[2]`. Theirs voices `Cm[3]` differently:
`- Cm[3]: x-x-10-12-13-11`.

Ours's first line matches base's, and its occurrences correspond:

| Base key | Ours key | Corresponding occurrences |
|---|---|---|
| `Cm` | `Cm` | 1 |
| `Cm[3]` | `Cm[2]` | 1 |

so ours's `Cm[2]` continues base's `Cm[3]`, and is not re-keyed. Bar 3
has the signature (`Cm[3]`, `Cm[2]`, `Cm[3]`); its guitar voicing is
theirs's, the only side to change it. The result:

````
## A
```
Cm | F7 | Cm[2] | G7
```

---

## Voicings: E2 A2 D3 G3 B3 E4
- Cm: x35543
- Cm[2]: x-x-10-12-13-11
- F7: 131211
- G7: 320001
````

Merged by marker name, theirs's new shape would have been given to a key
the result no longer has.

### 11.15.7 A line changed under a new marker

From 11.15.5's base, ours changes the first line to
`Cm | Fm7 | Cm | G7`; theirs, as in 11.15.5, splits off bar 3 for the
ukulele. Theirs's first line matches base's but its bar 3 is re-keyed, so
it is not the same, and its change touches ours's. The result is a
`chart` conflict on the first line, with theirs's `Cm[2]` in its run and
`- Cm[2]: 5333` in the ukulele's block of the marked text. Taking ours's
line drops theirs's shape, which then nothing plays.

### 11.15.8 Two shapes for one chord

From 11.15.5's base, ours voices the guitar's `Cm` as `x3554x`, theirs as
`8-10-10-8-8-8`. The marked text:

````
## A
```
Cm | F7 | Cm | G7
Cm | F7 | Cm | G7
```

---

## Voicings: E2 A2 D3 G3 B3 E4
<<<<<<< ours
- Cm: x3554x
=======
- Cm: 8-10-10-8-8-8
>>>>>>> theirs
- F7: 131211
- G7: 320001

## Voicings: G4 C4 E4 A4
- Cm: 0333
````

```json
{
  "conflicts": [
    {
      "kind": "voicing",
      "line": 10,
      "tuning": "E2 A2 D3 G3 B3 E4",
      "variation": "",
      "key": "Cm",
      "base": "x35543",
      "ours": "x3554x",
      "theirs": "8-10-10-8-8-8"
    }
  ]
}
```

Had theirs voiced the ukulele's `Cm` instead, the two would be in
different blocks, and the result would hold both.

### 11.15.9 A bar split off, its chord revoiced elsewhere

From 11.15.5's base, ours splits bar 3 off for the guitar, as in
11.15.5, and theirs revoices the ukulele's `Cm` as `5333`. Bar 3's
ukulele voicing is none on ours's side, which is weak (ours's ukulele
`Cm` is still `0333`, as in base), and `5333` on theirs's: the result
takes theirs's, and bar 3 plays on the ukulele what every other `Cm`
plays.

````
## A
```
Cm | F7 | Cm[2] | G7
Cm | F7 | Cm | G7
```

---

## Voicings: E2 A2 D3 G3 B3 E4
- Cm: x35543
- Cm[2]: 8-10-10-8-8-8
- F7: 131211
- G7: 320001

## Voicings: G4 C4 E4 A4
- Cm: 5333
- Cm[2]: 5333
````

`Cm` and `Cm[2]` stay apart, because the guitar tells them apart. Had
theirs changed nothing on the ukulele, bar 3 would have no ukulele shape,
as on ours's side.

### 11.15.10 Variations

Base:

````
## A
```
C | G | Am | F
```

---

## Voicings: E2 A2 D3 G3 B3 E4
- Am: x02210
- C: x32010
- F: 133211
- G: 320003

## Simple: E2 A2 D3 G3 B3 E4
- F: xx3211
````

Ours renames *Simple* to *Easy*. Theirs changes *Simple*'s `F` to
`xx3210` and adds `- G: 320033`. Ours's *Easy* is a rename of *Simple*
(same tuning, same voicings, same notes), so the block is one, named as
ours named it, with theirs's voicings:

````
## Voicings: E2 A2 D3 G3 B3 E4
- Am: x02210
- C: x32010
- F: 133211
- G: 320003

## Easy: E2 A2 D3 G3 B3 E4
- F: xx3210
- G: 320033
````

Had ours deleted *Simple* instead, the deletion and theirs's change would
be a `block` conflict, written after the default block:

````
<<<<<<< ours
=======
## Simple: E2 A2 D3 G3 B3 E4
- F: xx3210
- G: 320033
>>>>>>> theirs
````

A variation added on each side for different tunings, or under different
names, is two blocks and no conflict.

### 11.15.11 One tuning, two spellings

A guitar tuned down a semitone. Base has no voicings; ours adds

```
## Voicings: Eb2 Ab2 Db3 Gb3 Bb3 Eb4
- Eb: 022100
```

and theirs adds

```
## Voicings: D#2 G#2 C#3 F#3 A#3 D#4
- Ab: x02220
```

The two tunings sound the same, so the two blocks are one block both
sides added. Its voicings merge, and its spelling, added differently on
each side, is the one that comes first by code point:

```
## Voicings: D#2 G#2 C#3 F#3 A#3 D#4
- Ab: x02220
- Eb: 022100
```

### 11.15.12 Properties

Base:

````
# Tarde
- artist: Nobody

## A
```
C | Am | Dm | G7
```
````

Ours adds `- tempo: 96`; theirs adds `- key: G`. Both are added at the end
of the list, one cluster, combined by key: `key`, then `tempo`.

```
# Tarde
- artist: Nobody
- key: G
- tempo: 96
```

Had both also changed `artist`, ours to *Ana* and theirs to *Bia*:

```
# Tarde
<<<<<<< ours
- artist: Ana
=======
- artist: Bia
>>>>>>> theirs
- key: G
- tempo: 96
```

If instead ours adds `- notation: american` and theirs adds a line
`C7+ | Am | Dm | G7`, theirs's `C7+`, written as a Brazilian major seventh,
would be read in the result as an American seventh with a sharp fifth.
That is a `reading` conflict:

````
# Tarde
- artist: Nobody
<<<<<<< ours
- notation: american
=======
>>>>>>> theirs

## A
```
C | Am | Dm | G7
C7+ | Am | Dm | G7
```
````

```json
{
  "conflicts": [
    {
      "kind": "reading",
      "line": 3,
      "key": "notation",
      "changed": "ours",
      "symbols": [
        "C7+"
      ],
      "ours": "american"
    }
  ]
}
```

### 11.15.13 Added on both sides

Two people write *Asa Branca* in two books, and the books are merged
with no common history. Ours:

````
# Asa Branca
- artist: Luiz Gonzaga

## Intro
```
G | C | D | G
```

## A
```
G | G | C | G
```
````

Theirs is the same without `artist` and with `G | G7 | C | G` for *A*.
The base is the empty document. The titles are the same; `artist` was
added by ours alone. The sections are one cluster of insertions; *Intro*
is common to both and taken once; the two *A*s pair by their heading and
merge line by line, with no base; their fences are common, and their
lines conflict:

````
# Asa Branca
- artist: Luiz Gonzaga

## Intro
```
G | C | D | G
```

## A
```
<<<<<<< ours
G | G | C | G
=======
G | G7 | C | G
>>>>>>> theirs
```
````

with a `chart` conflict at line 11 whose `base` is an empty run.

### 11.15.14 Setlists

Base:

```
# Thursday

1. [Corcovado](corcovado.cifra.md)
2. [Garota de Ipanema](garota.cifra.md)
   - key: D
3. [Carinhoso](carinhoso.cifra.md)
```

Ours moves *Carinhoso* to the start and adds *Wave* at the end. Theirs
plays *Garota de Ipanema* in E and adds *Samba de uma nota só* at the
end. The move is kept, the key is merged, and both new songs are in:

```
# Thursday

1. [Carinhoso](carinhoso.cifra.md)
2. [Corcovado](corcovado.cifra.md)
3. [Garota de Ipanema](garota.cifra.md)
   - key: E
4. [Wave](wave.cifra.md)
5. [Samba de uma nota só](samba-de-uma-nota-so.cifra.md)
```

Had ours removed *Garota de Ipanema* instead, theirs's change to its key
would conflict with the removal:

```
# Thursday

1. [Corcovado](corcovado.cifra.md)
<<<<<<< ours
=======
2. [Garota de Ipanema](garota.cifra.md)
   - key: E
>>>>>>> theirs
3. [Carinhoso](carinhoso.cifra.md)
```

```json
{
  "conflicts": [
    {
      "kind": "item",
      "line": 4,
      "item": "garota.cifra.md",
      "base": "[Garota de Ipanema](garota.cifra.md)\n- key: D",
      "theirs": "[Garota de Ipanema](garota.cifra.md)\n- key: E"
    }
  ]
}
```

## 11.16 Corpus entries (proposal)

*This section is a proposal. The corpus holds no merge entries yet, and
their layout may change when the first are written.*

Merge entries would live in `corpus/merge/`, one directory per entry,
numbered and named as the other entries are:

| File | What it is |
|---|---|
| `base.cifra.md`, `ours.cifra.md`, `theirs.cifra.md` | The three inputs. A file that is missing is an absent input. For a setlist, `.setlist.md`. |
| `result.cifra.md` | The result, when the merge gives one. |
| `result.deleted` | An empty file, when the merge deletes. |
| `conflicts.json` | The conflicts as JSON (§11.12.5), when there are any. |
| `marked.cifra.md` | The marked text, when a conflict has a region. |

Exactly one of `result.cifra.md`, `result.deleted` and `conflicts.json`
is present. Inputs are written by hand, and need not be canonical; the
expected files are generated by the reference implementation and
reviewed, as the other entries' are.

An implementation would validate itself by checking, for every entry:

1. Merging base, ours and theirs gives the expected files, byte for byte.
2. Merging base, theirs and ours gives the same `result.cifra.md` or
   `result.deleted`; or a `conflicts.json` equal to the expected one with
   every `ours` and `theirs` member, and every `"ours"` and `"theirs"`
   value, exchanged. An entry whose conflicts number variants under the
   exception of §11.9.5 is marked as such and skips this check.
3. `result.cifra.md` is canonical: canonicalising it gives it.
4. Resolving every conflict of `marked.cifra.md` by ours, and every one by
   theirs (§11.12.4), gives a canonical text, and neither holds a marker
   line.

and, generated from every entry's files rather than stored: merging
*b*, *x*, *x*, and *b*, *b*, *x*, gives the canonical text of *x*, for
each of the entry's inputs as *b* and *x*.

The first entries would cover the examples of §11.15, one each, then:
every row of §11.4; a pure renumbering on each side; a key joined by I3
on one side and revoiced on the other; a key used only by unknown tokens;
a heading changed in two fields by two sides; a repeat group whose marks
and inner lines were changed by different sides; a conflict that forces a
section to be written whole (§11.12.2); a sung line whose words are pushed
because the merged marker grew; a non-canonical input; and for setlists,
two reorders of one stretch, the same song added twice, and a notes block
changed on both sides.

## Open questions

Deferred to a later version:

- **Finer units for sung lines.** A sung line is one unit, so a change to
  one of its chords and a change to its words conflict. A merge that
  aligned a sung line's attached items and words could take both. It is
  left out because the layout ties them: a chord that grows can push the
  words.
- **Sections renamed and edited.** A section one side both renamed and
  edited matches nothing, and any change by the other side to it is a
  `sections` conflict. A similarity measure between bodies would match it,
  at the cost of a measure every implementation must compute alike.
- **Variants numbered inside a conflict.** The one asymmetry of §11.9.5.
  It could be removed by ordering such variants by their content, at some
  cost in rules.
- **Choices that go with a deleted line.** A shape chosen for a chord
  whose only occurrence the other side deleted is dropped without a
  conflict (§11.10.3). Whether a merge should report it, as a notice
  rather than a conflict, is open.
- **Combined reorders.** Two reorders of one stretch of a setlist are
  combined without a conflict (§11.5.5). Whether the order of a set
  matters enough to report it is for experience to say.
- **`words` conflicts.** The rule of §11.7.2 for `words` is coarse: any
  music the other side added conflicts with a change of `words`. Whether
  that music would read differently could be computed instead.
- **Keep both.** Keeping both shapes, ours's in the block and theirs's in
  a new variation named for them, is a resolution an application may want
  (Estante's workflow 9 lists it for later). It would be defined here, so
  that two applications keep both alike.
- **Marker lines in notes.** §11.12.3 forbids a notes line of seven `=`
  that someone might have meant. A narrower rule, markers only in the
  shapes this chapter writes them, would allow it and still catch git's.
  §8.1 should, in any case, say that a marked text is not canonical.
- **Labels and marker size.** A git user expects the labels of the
  branches merged, and git can ask for longer markers. A driver that
  honoured them would write a marked text the corpus does not hold; the
  driver's labels are fixed for now (§11.14).
- **A JSON Schema** for `conflicts.json`, as there is for the document
  model, and the merge in the reference implementation. Until they exist,
  §11.12 is the normative description.
