"""The setlist reading corpus (corpus/README.md, spec §10): four files per
entry, the same round trip the song entries get (test_corpus.py), read and
written by the setlist reader and canonical writer.

These entries pin the setlist reader (§10.6) and canonical writer (§10.9) in
both directions, discovered by `input.setlist.md`. The §10.6 model has no
JSON Schema yet (§10 Open questions; it is the sibling task
format.setlist_schema), so these checks deliberately do not apply the song
schema (test_corpus.py check 5) to a setlist model.
"""

import json

import pytest

from cifra_md.setlist import parse_setlist, write_setlist

from conftest import ROOT
from tools.corpus import dump

ENTRIES = sorted(p for p in (ROOT / "corpus").iterdir() if p.is_dir() and (p / "input.setlist.md").exists())


def _ids():
    return [p.name for p in ENTRIES]


def text(entry, name):
    return (entry / name).read_bytes().decode("utf-8")


def model(entry, name):
    return json.loads(text(entry, name))


@pytest.mark.parametrize("entry", ENTRIES, ids=_ids())
def test_1_input_reads_as_input_parsed(entry):
    assert dump(parse_setlist((entry / "input.setlist.md").read_bytes())) == text(entry, "input.parsed.json")


@pytest.mark.parametrize("entry", ENTRIES, ids=_ids())
def test_2_input_model_writes_the_canonical_text(entry):
    assert write_setlist(model(entry, "input.parsed.json")) == text(entry, "canonical.setlist.md")


@pytest.mark.parametrize("entry", ENTRIES, ids=_ids())
def test_3_canonical_text_reads_as_parsed(entry):
    assert dump(parse_setlist((entry / "canonical.setlist.md").read_bytes())) == text(entry, "parsed.json")


@pytest.mark.parametrize("entry", ENTRIES, ids=_ids())
def test_4_canonical_model_writes_the_canonical_text(entry):
    # With check 3, the cycle from canonical text to model and back is closed
    # in both directions, which is what makes the canonical form a fixed point.
    assert write_setlist(model(entry, "parsed.json")) == text(entry, "canonical.setlist.md")


@pytest.mark.parametrize("entry", ENTRIES, ids=_ids())
def test_6_canonicalising_changes_the_model_only_as_section_10_9_says(entry):
    # The model-level counterpart of test_corpus.py check 6. A setlist has no
    # independent model-level canonicaliser (§10.9 defines canonicalisation as
    # reading and writing; setlist.py has write_setlist, not a model→model
    # transform), so the canonical model is the reader's model of the writer's
    # text. Apart from `diagnostics`, which describe a text and not a model,
    # canonicalising the input model gives the canonical model: the difference
    # between input.parsed.json and parsed.json is only what §10.9 respells
    # (numbering, markers, encoding, entry order), never content.
    strip = lambda d: {k: v for k, v in d.items() if k != "diagnostics"}
    assert strip(parse_setlist(write_setlist(model(entry, "input.parsed.json")))) == strip(model(entry, "parsed.json"))
