"""Note names and pitches (spec §5.1.1, §6.1)."""

from __future__ import annotations

import re

LETTERS = "CDEFGAB"
NATURAL_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]

_ACCIDENTALS = {"": 0, "#": 1, "♯": 1, "##": 2, "b": -1, "♭": -1, "bb": -2}
NOTE_RE = r"[A-G](?:bb|##|[b#♯♭])?"
_NOTE_FULL = re.compile(rf"^({NOTE_RE})$")
_NOTE_SPLIT = re.compile(r"^([A-G])(bb|##|[b#♯♭])?$")
_PITCH = re.compile(rf"^({NOTE_RE})(-?\d+)$")


def parse_note(text: str) -> dict:
    """A note name such as C, F#, Bb, Ebb. Uppercase letters only."""
    m = _NOTE_SPLIT.match(text)
    if not m:
        raise ValueError(f"not a note name: {text!r}")
    return {"letter": m.group(1), "accidental": _ACCIDENTALS[m.group(2) or ""]}


def is_note(text: str) -> bool:
    return bool(_NOTE_FULL.match(text))


def format_note(note: dict) -> str:
    acc = {-2: "bb", -1: "b", 0: "", 1: "#", 2: "##"}[note["accidental"]]
    return note["letter"] + acc


def parse_pitch(text: str) -> dict:
    """Scientific pitch notation: E2, F#3, Bb1, C-1."""
    m = _PITCH.match(text.strip())
    if not m:
        raise ValueError(f"not a pitch: {text!r}")
    return {"note": parse_note(m.group(1)), "octave": int(m.group(2))}


def midi(pitch: dict) -> int:
    """MIDI number with C4 = 60; the accidental applies to the number, so Cb4 is 59."""
    return (pitch["octave"] + 1) * 12 + NATURAL_PC[pitch["note"]["letter"]] + pitch["note"]["accidental"]
