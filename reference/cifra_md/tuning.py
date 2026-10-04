"""Tunings (spec §6)."""

from __future__ import annotations

import re

from .pitch import midi, parse_pitch

_SEP = re.compile(r"[,\s]+")


def parse_tuning(text: str) -> dict:
    """A list of pitches separated by commas and/or whitespace. Raises ValueError."""
    parts = [p for p in _SEP.split(text.strip()) if p]
    if not parts:
        raise ValueError("a tuning needs at least one pitch")
    pitches = [parse_pitch(p) for p in parts]
    return {"text": text.strip(), "pitches": pitches, "id": tuning_id(pitches)}


def tuning_id(pitches) -> str:
    """Identity by sound (§6.3): Eb2 and D#2 are the same string."""
    return " ".join(str(midi(p)) for p in pitches)


def is_tuning(text: str) -> bool:
    try:
        parse_tuning(text)
        return True
    except ValueError:
        return False
