"""The text layer (spec §1.3), shared by songs and setlists (§10.2)."""

from __future__ import annotations

import re
import unicodedata

_LINE_END = re.compile(r"\r\n|\r|\n")


class NotUTF8Error(ValueError):
    """The bytes are not UTF-8: not a document, and never rewritten (§1.3)."""


def decode(data: bytes) -> str:
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError as e:
        raise NotUTF8Error(f"not valid UTF-8 at byte {e.start}") from None


def prepare(text: str | bytes) -> list[str]:
    """The lines of a document, prepared in the order §1.3 gives:

    1. every U+FEFF removed: a byte order mark at the start, and anywhere
       else, so that none can come to begin a canonical text;
    2. NFC;
    3. split at LF, CR LF, or a lone CR; a terminator at the very end does
       not begin another line;
    4. every tab replaced by one space;
    5. spaces at the end of each line removed.
    """
    if isinstance(text, bytes):
        text = decode(text)
    text = text.replace("\ufeff", "")
    text = unicodedata.normalize("NFC", text)
    if text == "":
        return []
    lines = _LINE_END.split(text)
    if lines[-1] == "":
        lines.pop()
    return [ln.replace("\t", " ").rstrip(" ") for ln in lines]


# --- marker lines (§11.12.3) -------------------------------------------------------------

MARKERS = ("<<<<<<<", "=======", ">>>>>>>", "|||||||")


def is_marker_line(line: str) -> bool:
    """A line of git's conflict markers: one of the four, alone or followed by
    a space and anything (§11.12.3). `line` is a prepared line (§1.3)."""
    return any(line == m or line.startswith(m + " ") for m in MARKERS)


def marker_lines(text: str | bytes) -> list[int]:
    """The 1-based numbers of the marker lines of a text, after §1.3."""
    return [i + 1 for i, ln in enumerate(prepare(text)) if is_marker_line(ln)]
