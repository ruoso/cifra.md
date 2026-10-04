# cifra.md reference implementation

A reader and canonical writer for the cifra.md format, a setlist reader
and writer, and the three-way merge of both, in Python with no runtime
dependencies. It exists to pin down the specification: where the
prose and this code disagree, one of them is wrong and an issue is due.

```
pip install -e ".[test]"       # or: python -m venv .venv && .venv/bin/pip install -e ".[test]"
python -m pytest               # the test suite
python -m cifra_md parse song.md    # the model as JSON (schema/cifra.schema.json)
python -m cifra_md write song.md    # the canonical text
python -m cifra_md check song.md    # exit 0 if canonical, 1 if not (a marked text never is)
python -m cifra_md merge BASE OURS THEIRS [PATH]   # the git merge driver of spec §11.14
python -m tools.corpus --check      # the reference corpus against this implementation
python -m tools.corpus --write      # regenerate the corpus outputs after a deliberate change
```

## Layout

| Module | Spec | Does |
|---|---|---|
| `cifra_md/text.py` | §1.3, §11.12.3 | The text layer: UTF-8, U+FEFF, NFC, lines, tabs, trailing spaces; marker lines |
| `cifra_md/pitch.py` | §5.1.1, §6.1 | Note names, pitches, MIDI numbers |
| `cifra_md/chord.py` | §5 | The chord symbol grammar, the canonical model, dialects, spelled tones |
| `cifra_md/tuning.py` | §6 | Tuning lists and identity by sound |
| `cifra_md/frets.py` | §7.5 | Fret strings |
| `cifra_md/parse.py` | §1 to §4, §7 | `parse(text or bytes) -> dict`: the whole reader |
| `cifra_md/layout.py` | §4.4, §4.5, §8.4.4, §8.4.5 | Chord line tokens; `converge`, the layout of a sung line that the reader and `canonical` both run; printing a laid-out sung line |
| `cifra_md/write.py` | §8 | `write(doc) -> str`: the canonical writer, which refuses a marked text with `MarkedTextError`; `canonical(doc)`, the model of the canonical form (§8.2, §8.3, §4.5); `serialize`, which prints a canonical model (§8.4); `is_canonical(text)` |
| `cifra_md/setlist.py` | §10 | `parse_setlist(text or bytes) -> dict` and `write_setlist(model) -> str`: the setlist reader and its canonical writer |
| `cifra_md/merge.py` | §11 | `merge(base, ours, theirs, setlist=False) -> Outcome`: whole files, sequences, values, metadata, the chart, footnote markers, voicings, the result, the conflicts, the marked text; `conflicts_json(outcome)` |
| `cifra_md/setlist_merge.py` | §11.13 | The merge of setlists |
| `cifra_md/__main__.py` | §11.14 | The command line, the merge driver among it |
| `tools/corpus.py` | corpus/README.md | Generates and checks the reference corpus, its merge entries included |

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
- The diagnostic codes of the setlist reader (§10.8.3), which the
  specification describes but does not name, and the shape of its model,
  for which there is no schema yet (§10, *Open questions*): see the
  docstring of `cifra_md/setlist.py`.
- What the merge driver does beyond §11.14: a file that does not exist is
  an absent input; a merge that deletes removes `OURS`; a `file` conflict
  leaves `OURS` as it is and exits 1; `--json` prints the conflicts.

## Tests

`tests/` holds one file per chapter of the specification, each test naming
the rule it checks, plus `test_writer.py` and `test_canonical.py` for the
canonical form, each case with its exact canonical text and a check that
canonicalising twice gives what once did, and `test_corpus.py`, which runs
the six checks of `corpus/README.md` on every entry of the reference
corpus.

For the merge: `test_merge.py` checks its parts rule by rule and the merge
driver; `test_merge_corpus.py` runs the checks of `corpus/README.md` on
every merge entry; `test_merge_examples.py` holds every text shown in the
examples of §11.15 to the corpus files, byte for byte; and
`test_merge_properties.py` checks the properties of §11.3 over generated
documents and setlists (`merge_gen.py`, `merge_props.py`).
`test_marker_lines.py` and `test_setlists.py` cover §11.12.3 and §10.
