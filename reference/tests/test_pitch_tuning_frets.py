"""Spec §6 (tunings, pitches) and §7.5 (fret strings)."""

import pytest

from cifra_md.frets import format_frets, parse_frets
from cifra_md.pitch import midi, parse_note, parse_pitch
from cifra_md.tuning import is_tuning, parse_tuning, tuning_id


def test_pitch_parsing():
    assert parse_pitch("E2") == {"note": {"letter": "E", "accidental": 0}, "octave": 2}
    assert parse_pitch("F#3")["note"]["accidental"] == 1
    assert parse_pitch("Bb1")["note"]["accidental"] == -1
    assert parse_pitch("C-1")["octave"] == -1
    assert parse_pitch("E♭2")["note"]["accidental"] == -1


def test_midi():
    assert midi(parse_pitch("C4")) == 60
    assert midi(parse_pitch("A4")) == 69
    assert midi(parse_pitch("Cb4")) == 59
    assert midi(parse_pitch("B#3")) == 60
    assert midi(parse_pitch("E2")) == 40


@pytest.mark.parametrize("bad", ["H2", "E", "Ebb", "2", "", "E\u00a02"])
def test_bad_pitches(bad):
    with pytest.raises(ValueError):
        parse_pitch(bad)


def test_tuning_separators():
    a = parse_tuning("E2, A2, D3, G3, B3, E4")
    b = parse_tuning("E2 A2 D3 G3 B3 E4")
    c = parse_tuning("E2,A2,D3,G3,B3,E4")
    assert a["id"] == b["id"] == c["id"]
    assert len(a["pitches"]) == 6
    assert a["text"] == b["text"] == c["text"] == "E2 A2 D3 G3 B3 E4"


def test_letter_case_is_read_and_written_uppercase():
    # §6.1: case never matters to a reader; the text holds the letter uppercase,
    # every other character as written.
    assert parse_pitch("e2") == parse_pitch("E2")
    assert parse_pitch("bb2") == parse_pitch("Bb2")
    t = parse_tuning("e2 a2 d3 g3 b3 e4")
    assert t["text"] == "E2 A2 D3 G3 B3 E4"
    assert parse_tuning("eb2 E♭3")["text"] == "Eb2 E♭3"


def test_tuning_identity_is_by_sound():
    assert tuning_id(parse_tuning("Eb2 A2")["pitches"]) == tuning_id(parse_tuning("D#2 A2")["pitches"])
    assert tuning_id(parse_tuning("Cb4")["pitches"]) == tuning_id(parse_tuning("B3")["pitches"])
    assert parse_tuning("E2 A2")["id"] != parse_tuning("A2 E2")["id"]


def test_reentrant_tuning_is_fine():
    assert is_tuning("G4 C4 E4 A4")


@pytest.mark.parametrize("bad", ["", "   ", "E2 foo", "guitar", "E2, , A2x"])
def test_bad_tunings(bad):
    assert not is_tuning(bad)


def test_single_pitch_is_a_tuning_of_one_string():
    # §6.4 says a single pitch is not a tuning for *heading recognition*; the
    # list parser itself accepts one string, since a one-string instrument exists.
    assert is_tuning("E2")


@pytest.mark.parametrize(
    "text,frets",
    [
        ("x32010", ["x", 3, 2, 0, 1, 0]),
        ("X32010", ["x", 3, 2, 0, 1, 0]),
        ("8-10-10-8-8-8", [8, 10, 10, 8, 8, 8]),
        ("x-3-2-0-1-0", ["x", 3, 2, 0, 1, 0]),
        ("0333", [0, 3, 3, 3]),
        ("12-12-12-12", [12, 12, 12, 12]),
    ],
)
def test_parse_frets(text, frets):
    assert parse_frets(text) == frets


@pytest.mark.parametrize("bad", ["", "x3a010", "x--3", "3-", "x 3 2", "100-1", "x320-10"])
def test_bad_frets(bad):
    assert parse_frets(bad) is None


def test_format_frets():
    assert format_frets(["x", 3, 2, 0, 1, 0]) == "x32010"
    assert format_frets([8, 10, 10, 8, 8, 8]) == "8-10-10-8-8-8"
    assert format_frets([0, 3, 3, 3]) == "0333"
    assert parse_frets(format_frets([5, "x", 10])) == [5, "x", 10]
