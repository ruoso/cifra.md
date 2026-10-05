# cifra.md for JavaScript

The app's implementation of the cifra.md format (DIRECTION §3.6): the reader,
the canonical writer, the setlist reader and writer, and the three-way merge.
Framework-free, ES modules, zero runtime dependencies — this package knows
nothing of React, git, storage or the network; the view is the only layer that
knows React (DIRECTION §3.7).

## Conformance

cifra.md for JavaScript claims the following profiles of the specification's
§9.1, against the specification in this repository's `spec/`:

- **Full** — the Chart, Chord, Cifra and Voicings readers and the Writer
  (§1–§8): it reads a document into the model and writes every document in the
  canonical form of §8.4.
- **Merger** (§11) — it merges three versions of a song, giving the same
  result, or the same conflicts and marked text, as any other conforming
  merger, and refuses to save a marked text (§11.12.3). As a setlist writer, it
  merges setlists as §11.13 says.
- **Setlist reader** and **Setlist writer** (§10) — it reads a setlist into its
  model and writes every setlist in the canonical form.

The claim is checked, not merely stated (§9.3). The reference corpus in
`../corpus/` is the conformance level: `npm test` holds this package to every
reading entry (checks 1–4, 6) and every `corpus/merge/` entry (the §11.16
battery) byte for byte, in both directions, with an **empty expected-failures
ledger** (`test/corpus/expected-failures.json` is `[]`) — so no corpus check is
hidden as an expected failure while the profile is claimed. Beyond the corpus's
fixed examples, `test/merge_properties.test.js` exercises the §11.3 merge
properties over generated songs and setlists, inside this one implementation
(agreement with the other implementations is by the corpus and by
`format.cross_check`, not by shared code — DIRECTION §3.6).

## Tests

```
npm test
```

runs the unit suites and the corpus conformance level under Vitest.
