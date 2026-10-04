# cifra.md reference implementation

A reader and canonical writer for the cifra.md format, in Python with no
runtime dependencies. It exists to pin down the specification: where the
prose and this code disagree, one of them is wrong and an issue is due.

```
pip install -e ".[test]"       # or: python -m venv .venv && .venv/bin/pip install -e ".[test]"
python -m pytest               # the test suite
python -m cifra_md parse song.md    # the model as JSON (schema/cifra.schema.json)
python -m cifra_md write song.md    # the canonical text
python -m tools.corpus --check      # the reference corpus against this implementation
python -m tools.corpus --write      # regenerate the corpus outputs after a deliberate change
```

## Layout

| Module | Spec | Does |
|---|---|---|
| `cifra_md/text.py` | §1.3 | The text layer: UTF-8, U+FEFF, NFC, lines, tabs, trailing spaces |
| `cifra_md/pitch.py` | §5.1.1, §6.1 | Note names, pitches, MIDI numbers |
| `cifra_md/chord.py` | §5 | The chord symbol grammar, the canonical model, dialects, spelled tones |
| `cifra_md/tuning.py` | §6 | Tuning lists and identity by sound |
| `cifra_md/frets.py` | §7.5 | Fret strings |
| `cifra_md/parse.py` | §1 to §4, §7 | `parse(text or bytes) -> dict`: the whole reader |
| `cifra_md/layout.py` | §4.4, §4.5, §8.4.4, §8.4.5 | Chord line tokens; `converge`, the layout of a sung line that the reader and `canonical` both run; printing a laid-out sung line |
| `cifra_md/write.py` | §8 | `write(doc) -> str`: the canonical writer; `canonical(doc)`, the model of the canonical form (§8.2, §8.3, §4.5); `serialize`, which prints a canonical model (§8.4) |
| `tools/corpus.py` | corpus/README.md | Generates and checks the reference corpus |

`parse` returns plain dicts and lists that match the JSON Schema exactly, so
`json.dumps(parse(text))` is the document's model and `write(json.loads(...))`
takes it back. `write(parse(text))` canonicalises a document; a document
is canonical when that gives back the same text.

## Choices the specification leaves open

None in the canonical form: §8 defines every byte a writer writes, and
this implementation is checked against the corpus in both directions and
against randomised documents for the fixed point. What the specification
leaves to an implementation is outside the text:

- The wording of diagnostics, and their order: this one sorts them by
  line number.
- What a reader does with an anchor that no later bar picks up: this one
  drops it silently.

## Tests

`tests/` holds one file per chapter of the specification, each test naming
the rule it checks, plus `test_writer.py` and `test_canonical.py` for the
canonical form, each case with its exact canonical text and a check that
canonicalising twice gives what once did, and `test_corpus.py`, which runs
the six checks of `corpus/README.md` on every entry of the reference
corpus.
