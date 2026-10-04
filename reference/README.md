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
| `cifra_md/pitch.py` | §5.1.1, §6.1 | Note names, pitches, MIDI numbers |
| `cifra_md/chord.py` | §5 | The chord symbol grammar, the canonical model, dialects, spelled tones |
| `cifra_md/tuning.py` | §6 | Tuning lists and identity by sound |
| `cifra_md/frets.py` | §7.5 | Fret strings |
| `cifra_md/parse.py` | §1 to §4, §7 | `parse(text) -> dict`: the whole reader |
| `cifra_md/write.py` | §8 | `write(doc) -> str`: the canonical writer |
| `tools/corpus.py` | corpus/README.md | Generates and checks the reference corpus |

`parse` returns plain dicts and lists that match the JSON Schema exactly, so
`json.dumps(parse(text))` is the document's model and `write(json.loads(...))`
takes it back.

## Choices the specification leaves open

- Lowercase root letters are not chords (§5.1.1 says a reader MAY accept
  them). The strict choice keeps lyric words such as *a*, *e* and *be* from
  reading as chords.
- Diagnostics are sorted by line number.

## Tests

`tests/` holds one file per chapter of the specification, each test naming
the rule it checks, plus `test_writer.py` for the canonical form and
`test_corpus.py`, which runs every entry of the reference corpus in both
directions and validates every model against the schema.
