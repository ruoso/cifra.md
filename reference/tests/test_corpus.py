"""The reference corpus (corpus/README.md): four files per entry, six checks."""

import json

import jsonschema
import pytest

from cifra_md import parse, write
from cifra_md.write import canonical

from conftest import ROOT, SCHEMA
from tools.corpus import dump

ENTRIES = sorted(p for p in (ROOT / "corpus").iterdir() if p.is_dir() and (p / "input.cifra.md").exists())


def _ids():
    return [p.name for p in ENTRIES]


def text(entry, name):
    return (entry / name).read_bytes().decode("utf-8")


def model(entry, name):
    return json.loads(text(entry, name))


@pytest.mark.parametrize("entry", ENTRIES, ids=_ids())
def test_1_input_reads_as_input_parsed(entry):
    assert dump(parse((entry / "input.cifra.md").read_bytes())) == text(entry, "input.parsed.json")


@pytest.mark.parametrize("entry", ENTRIES, ids=_ids())
def test_2_input_model_writes_the_canonical_text(entry):
    assert write(model(entry, "input.parsed.json")) == text(entry, "canonical.cifra.md")


@pytest.mark.parametrize("entry", ENTRIES, ids=_ids())
def test_3_canonical_text_reads_as_parsed(entry):
    assert dump(parse((entry / "canonical.cifra.md").read_bytes())) == text(entry, "parsed.json")


@pytest.mark.parametrize("entry", ENTRIES, ids=_ids())
def test_4_canonical_model_writes_the_canonical_text(entry):
    assert write(model(entry, "parsed.json")) == text(entry, "canonical.cifra.md")


@pytest.mark.parametrize("entry", ENTRIES, ids=_ids())
@pytest.mark.parametrize("name", ["input.parsed.json", "parsed.json"])
def test_5_models_are_valid_against_the_schema(entry, name):
    jsonschema.validate(model(entry, name), SCHEMA)


@pytest.mark.parametrize("entry", ENTRIES, ids=_ids())
def test_6_canonicalising_changes_the_model_only_as_section_8_says(entry):
    # The reference's own model-level canonicalisation, against what reading
    # the canonical text gives. `sungAt` and `diagnostics` describe a text,
    # not a model, so they are left out.
    strip = lambda d: {k: v for k, v in d.items() if k not in ("diagnostics", "sungAt")}
    assert strip(canonical(model(entry, "input.parsed.json"))) == strip(model(entry, "parsed.json"))
