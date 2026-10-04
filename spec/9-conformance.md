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

- read music only inside fences, and keep notes verbatim;
- keep music before the first heading, empty sections, unknown tokens,
  marks and repeat signs;
- read all three heading forms;
- read `[1]` as the bare key and accept index gaps;
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

A voicings reader (and a cifra reader, if it edits sung lines) that creates
or edits documents.

Must meet: §8.

### Full

All of the above.

## 9.2 What every profile must do

Whatever the profile:

- A reader MUST NOT fail on a document because of a line it does not
  understand. It reports and continues.
- A reader MUST NOT alter the document it was given. The text is the
  author's.
- A reader MUST read a document that uses only the constructs of its
  profile identically to a full reader. A chart reader and a full reader
  agree on every chart without words or voicings.
- Properties that an implementation does not define MUST be kept.

## 9.3 Test corpus

The reference corpus in `corpus/` holds, per entry, an uncanonical input,
the model a reader must produce and the text a writer must produce. An
implementation claiming any profile SHOULD pass every entry in both
directions, as `corpus/README.md` describes.
