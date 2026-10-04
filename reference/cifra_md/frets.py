"""Fret strings (spec §7.5)."""

from __future__ import annotations

import re

_PART = re.compile(r"^\d{1,2}$")


def parse_frets(text: str):
    """Return a list of ints and 'x', or None when the text is not a fret string."""
    t = text.strip()
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
