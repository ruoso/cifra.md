"""The reference corpus (corpus/README.md): three files per entry."""

import json
import pathlib

import jsonschema
import pytest

from cifra_md import parse, write

from conftest import ROOT, SCHEMA

ENTRIES = sorted(p for p in (ROOT / "corpus").iterdir() if p.is_dir())


def _ids():
    return [p.name for p in ENTRIES]


@pytest.mark.parametrize("entry", ENTRIES, ids=_ids())
def test_parse_matches(entry):
    expected = json.loads((entry / "parsed.json").read_text(encoding="utf-8"))
    assert parse((entry / "input.cifra.md").read_text(encoding="utf-8")) == expected


@pytest.mark.parametrize("entry", ENTRIES, ids=_ids())
def test_write_matches(entry):
    expected = json.loads((entry / "parsed.json").read_text(encoding="utf-8"))
    assert write(expected) == (entry / "canonical.cifra.md").read_text(encoding="utf-8")


@pytest.mark.parametrize("entry", ENTRIES, ids=_ids())
def test_canonical_is_a_fixed_point(entry):
    canonical = (entry / "canonical.cifra.md").read_text(encoding="utf-8")
    again = parse(canonical)
    assert write(again) == canonical
    expected = json.loads((entry / "parsed.json").read_text(encoding="utf-8"))
    strip = lambda d: {k: v for k, v in d.items() if k != "diagnostics"}
    assert strip(again) == strip(expected)


@pytest.mark.parametrize("entry", ENTRIES, ids=_ids())
def test_parsed_is_valid_against_the_schema(entry):
    expected = json.loads((entry / "parsed.json").read_text(encoding="utf-8"))
    jsonschema.validate(expected, SCHEMA)
