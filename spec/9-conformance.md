# 9. Conformance

An implementation claims conformance to one or more **profiles**. Each
profile lists the sections whose requirements it must meet. A profile
includes every profile above it in its list.

## 9.1 Profiles

### Chart reader

Reads a document and produces its sections, chord lines, measures and
items, with every chord token's symbol, index and key.

Must meet: §1 (document structure), §2 (the chart), §3 (repeats) as
written, and §5 to the extent of
deciding whether a symbol is valid and reporting which of the three
ambiguous spellings it met. It MAY stop short of building the chord model.

Must, specifically:

- prepare the text exactly as §1.3 says, in that order;
- read music only inside fences, and keep notes;
- keep music before the first heading, empty sections, unknown tokens,
  marks and repeat signs;
- read all three heading forms;
- read `[1]` and `[0]` as the bare key and accept index gaps;
- number bars, carrying stated numbers forward, unless the document is sung
  (which a chart-only reader that does not implement §4 determines by the
  rule in §4.2 nonetheless);
- stop reading the chart at the first rule;
- keep repeat signs, marks, counts and ending markers as items and pair
  groups; expansion (§3.5) is OPTIONAL.

### Chord reader

A chart reader that also builds the canonical chord model (§5.2) for every
valid symbol, applying the document's dialect to the four ambiguities and
reporting that it did.

Must meet: §5 in full.

### Cifra reader

A chart reader that also reads words.

Must meet: §4.

### Voicings reader

A chart reader that also reads the voicings part and resolves occurrences
to shapes.

Must meet: §6, §7.

### Writer

A voicings reader and a cifra reader that creates or edits documents.

Must meet: §8. In particular, it MUST save every document in the
canonical form of §8.4, and canonicalising with it MUST give the same
bytes as with any other conforming writer. A writer that checks whether a
document is canonical does so by canonicalising it and comparing.

### Full

All of the above.

### Merger

A writer that merges three versions of a song (§11): an application that
syncs, or a git merge driver.

Must meet: §11 for songs, and §5 to the extent §11.7.2 needs the chord
model. It MUST give the same result, or the same conflicts and marked
text, as any other conforming merger, and MUST refuse to save a marked
text (§11.12.3). A merger that is also a setlist writer merges setlists
as §11.13 says. Full does not include it.

### Setlist reader

Reads a setlist (§10) and produces its title, properties, items and notes,
with every song item's text and path.

Must meet: §10.1 to §10.8. It needs from the song chapters only what §10
refers to: the title (§1.4.1), fences (§1.9), and, to apply a `key`, a
song's properties (§1.4) and roots (§5.1.1). It is independent of the
profiles above, and Full does not include it.

Must, specifically:

- prepare the text exactly as §10.2 says, in that order;
- number items by position, ignoring the numbers written;
- treat the target as authoritative and the link text as a label;
- decode, check and normalise paths as §10.5 says, and resolve them
  against the setlist's own directory, never outside the book;
- keep, report and skip, but never discard, unlinked items, items outside
  the book, missing songs, unrecognised entries and notes;
- apply a `key` only when §10.7.1 allows it, and otherwise show it as a
  note.

### Setlist writer

A setlist reader that creates or edits setlists.

Must meet: §10.9 and §10.10. In particular, it MUST write every setlist
in the canonical form, which it decides from the setlist's text alone,
and MUST NOT change a link's text except when the user asks (§10.9.3).

## 9.2 What every profile must do

Whatever the profile:

- A reader MUST NOT fail on a document because of a line it does not
  understand. It reports and continues.
- A reader MUST NOT alter the document it was given. The text is the
  author's.
- A reader MUST read a document that uses only the constructs of its
  profile identically to a full reader. A chart reader and a full reader
  agree on every chart without words or voicings.
- Properties that an implementation does not define MUST be kept: a
  reader keeps them, and a writer writes their values back, under their
  keys in lower case (§1.4.3).
- Whatever a reader does not keep (a problem item, a list item that is
  not a property, a later rule) it MUST report, so that an application
  can say what canonicalising will drop before it saves (§8.2).

## 9.3 Test corpus

The reference corpus in `corpus/` holds, per entry, an uncanonical input
and the model a reader must produce from it, and the canonical text a
writer must produce and the model a reader must produce from that. An
implementation claiming any profile SHOULD pass every entry, in both
directions, as `corpus/README.md` describes. The corpus has no setlist
entries yet (§10, *Open questions*), and no merge entries; §11.16
proposes their layout.
