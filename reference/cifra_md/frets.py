"""Fret strings (spec §7.5)."""

from __future__ import annotations

import re

_PART = re.compile(r"^\d{1,2}$")


def parse_frets(text: str):
    """Return a list of ints and 'x', or None when the text is not a fret string."""
    t = text.strip(" ")
    if not t:
        return None
    parts = t.split("-") if "-" in t else list(t)
    out = []
    for part in parts:
        if part in ("x", "X"):
            out.append("x")
        elif _PART.match(part):
            out.append(int(part))
        else:
            return None
    return out or None


def format_frets(frets) -> str:
    """Compact unless a fret reaches 10, then hyphenated (§7.5)."""
    parts = ["x" if f == "x" else str(f) for f in frets]
    wide = any(isinstance(f, int) and f >= 10 for f in frets)
    return "-".join(parts) if wide else "".join(parts)


def parse_fingers(text: str):
    """A fingering (§7.5.1): positions 1-4, T, or - (0 is read as -), spaced or run together.

    Returns a list of int | "T" | None, or None when the text is not a fingering.
    """
    t = text.strip(" ")
    if not t:
        return None
    parts = [p for p in t.split(" ") if p] if " " in t else list(t)
    out = []
    for part in parts:
        if part in ("-", "0"):
            out.append(None)
        elif part in ("T", "t"):
            out.append("T")
        elif part in ("1", "2", "3", "4"):
            out.append(int(part))
        else:
            return None
    return out


def check_fingers(fingers, frets):
    """Why a fingering is wrong for a shape, or None when it is fine (§7.5.1)."""
    if len(fingers) != len(frets):
        return f"{len(fingers)} finger positions for {len(frets)} strings"
    at = {}
    for finger, fret in zip(fingers, frets):
        if finger is None:
            continue
        if fret == "x" or fret == 0:
            return f"finger {finger} on a string that is not fretted"
        if finger in at and at[finger] != fret:
            return f"finger {finger} on frets {at[finger]} and {fret}"
        at[finger] = fret
    return None


def format_fingers(fingers) -> str:
    return " ".join("-" if f is None else str(f) for f in fingers)
