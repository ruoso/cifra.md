"""Canonical writer (spec §8): the document model back to text.

`write(doc)` is `serialize(canonical(doc))`. `canonical` applies everything
canonicalisation changes in the model (§8.2): it drops what the canonical
form does not keep, applies the footnote invariants (§8.3) and lays out
every sung line again (§4.5.3), so that `serialize` only has to print.
"""

from __future__ import annotations

import copy
import re

from .chord import DEFAULT_DIALECT, DIALECTS
from .frets import format_fingers, format_frets
from .layout import (
    chart_line_text,
    converge,
    lyric_text,
    sung_text,
)
from .text import NotUTF8Error, marker_lines, prepare
from .parse import (
    CLOSING_SEQUENCE,
    COUNT,
    _is_chord_run,
    _Parser,
    ascii_lower,
    key_for,
)


# --- the canonical model ---------------------------------------------------------------


def _dialect(doc: dict) -> str:
    for p in doc.get("properties", []):
        if p["key"] == "notation":
            d = ascii_lower(p["value"].strip(" "))
            return d if d in DIALECTS else DEFAULT_DIALECT
    return DEFAULT_DIALECT


def _items(doc):
    for s in doc["sections"]:
        for part in s["body"]:
            if part["type"] != "music":
                continue
            for line in part["lines"]:
                for m in line.get("measures", []):
                    yield from m["items"]


def _chord_items(doc):
    for s in doc["sections"]:
        for part in s["body"]:
            if part["type"] != "music":
                continue
            for line in part["lines"]:
                for m in line.get("measures", []):
                    for it in m["items"]:
                        if it["type"] == "chord":
                            yield it


def _same_shape(a, b):
    return a["frets"] == b["frets"] and a.get("fingers") == b.get("fingers")


def footnotes(doc: dict) -> None:
    """I1, I3 and I2 of §8.3, in that order, on the model in place."""
    used: dict[str, list[int]] = {}
    unknown = {it["text"] for it in _items(doc) if it["type"] == "unknown"}
    for it in _chord_items(doc):
        used.setdefault(it["symbol"], [])
        if it["index"] not in used[it["symbol"]]:
            used[it["symbol"]].append(it["index"])
    # I1: keys the chart does not use are dropped from every block.
    for b in doc["blocks"]:
        b["voicings"] = [e for e in b["voicings"] if e["index"] in used.get(e["symbol"], []) or e["key"] in unknown]
    for symbol, indices in used.items():
        indices = sorted(indices)
        shapes = [{e["index"]: e for e in b["voicings"] if e["symbol"] == symbol} for b in doc["blocks"]]

        def same(i, j):
            both = False
            for sh in shapes:
                a, c = sh.get(i), sh.get(j)
                if a is None and c is None:
                    continue
                if a is None or c is None or not _same_shape(a, c):
                    return False
                both = True
            return both

        # I3: an index that no block tells apart from a lower one joins the lowest such.
        rep: dict[int, int] = {}
        for i in indices:
            rep[i] = next((r for r in indices if r < i and rep[r] == r and same(r, i)), i)
        # I2: the indices that remain become 1 to n, in order.
        survivors = sorted(set(rep.values()))
        new = {i: survivors.index(rep[i]) + 1 for i in indices}
        for it in _chord_items(doc):
            if it["symbol"] == symbol:
                it["index"] = new[it["index"]]
                it["key"] = key_for(symbol, it["index"])
        for b in doc["blocks"]:
            kept = []
            for e in b["voicings"]:
                if e["symbol"] == symbol:
                    if rep[e["index"]] != e["index"]:
                        continue
                    e["index"] = new[e["index"]]
                    e["key"] = key_for(symbol, e["index"])
                kept.append(e)
            b["voicings"] = kept


def _collapse_blank_runs(text: str) -> str:
    out: list[str] = []
    for ln in text.split("\n"):
        if ln == "" and out and out[-1] == "":
            continue
        out.append(ln)
    return "\n".join(out)


def canonical(doc: dict) -> dict:
    """The model of the document's canonical form: what a reader gets back
    from `serialize(canonical(doc))`, derived fields included. `sungAt` and
    `diagnostics` are left as they were: they describe a text, not a model."""
    doc = copy.deepcopy(doc)
    dialect = _dialect(doc)
    if doc.get("title") == "":
        doc["title"] = None
    for b in doc["blocks"]:
        for e in b["voicings"]:
            if "fingers" in e and all(f is None for f in e["fingers"]):
                del e["fingers"]
    footnotes(doc)
    for b in doc["blocks"]:
        b["voicings"].sort(key=lambda e: (e["symbol"], e["index"]))
    for s in doc["sections"]:
        for part in s["body"]:
            if part["type"] == "notes":
                part["text"] = _collapse_blank_runs(part["text"])
            if part["type"] != "music":
                continue
            for line in part["lines"]:
                if line["kind"] == "sung":
                    # The layout again, for tokens whose width §8.3 changed (§4.5.3).
                    converge(line, lyric_text(line), dialect)
    _rederive(doc, dialect)
    return doc


def _rederive(doc: dict, dialect: str) -> None:
    """Bar numbers and repeat groups, recomputed as a reader computes them."""
    p = _Parser("", None)
    p.dialect = dialect
    p.sections = doc["sections"]
    for s in p.sections:
        for part in s["body"]:
            if part["type"] != "music":
                continue
            for line in part["lines"]:
                for m in line.get("measures", []):
                    m.pop("number", None)
                    m.pop("stated", None)
    if not doc["sung"]:
        p.number_bars()
    for s in p.sections:
        p.pair_repeats(s)


# --- printing -----------------------------------------------------------------------


def fence(lines: list[str], info: str = "") -> list[str]:
    """A fence around lines, long enough that none of them closes it."""
    char = "~" if "`" in info else "`"
    longest = 0
    for ln in lines:
        m = re.match(r"^ {0,3}(" + re.escape(char) + "+)", ln)
        if m:
            longest = max(longest, len(m.group(1)))
    marker = char * max(3, longest + 1)
    return [marker + info, *lines, marker]


def music_lines(lines: list[dict], dialect: str = DEFAULT_DIALECT) -> list[str]:
    out = []
    for line in lines:
        k = line["kind"]
        if k == "chart":
            out.append(chart_line_text(line, dialect))
        elif k == "sung":
            out.extend(sung_text(line, dialect))
        elif k == "lyric":
            out.append(">" + line["text"][1:] if line["forced"] else line["text"])
        elif k == "break":
            out.append("")
        elif k == "annotation":
            out.append(("// " + line["text"]) if line["text"] else "//")
    return out


def heading_line(level: int, text: str) -> str:
    """A Markdown heading. A text that ends in what CommonMark would take for
    a closing sequence gets a closing ` #` of its own, so that it reads back."""
    if CLOSING_SEQUENCE.search(text):
        text += " #"
    return "#" * level + (" " + text if text else "")


def heading_name(section: dict) -> str:
    name = section["name"]
    if section["anchor"] is not None:
        name = f"{name} @{section['anchor']}".strip(" ")
    if section.get("times") is not None:
        name = f"{name} x{section['times']}".strip(" ")
    return name


def _chart_blocks(sections: list[dict], dialect: str) -> list[list[str]]:
    blocks: list[list[str]] = []
    open_fence: list[str] | None = None  # the music fence a cifra heading continues

    def flush():
        nonlocal open_fence
        if open_fence is not None:
            blocks.append(fence(open_fence))
            open_fence = None

    def part_lines(part):
        if part["type"] == "notes":
            return part["text"].split("\n")
        if part["type"] == "verbatim":
            return fence(part["text"].split("\n"), part["info"])
        return fence(music_lines(part["lines"], dialect))

    for s in sections:
        if s["heading"] in ("bracket", "label"):
            head = f"[{heading_name(s)}]" if s["heading"] == "bracket" else f"{s['name']}:"
            first_music = s["body"][0]["lines"] if s["body"] and s["body"][0]["type"] == "music" else []
            joined = False
            if first_music and first_music[0]["kind"] == "chart":
                text = chart_line_text(first_music[0], dialect)
                if s["heading"] == "bracket" and not COUNT.match(text):
                    head, joined = f"{head} {text}", True
                elif s["heading"] == "label" and _is_chord_run(text, dialect):
                    head, joined = f"{head} {text}", True
            open_fence = [head] if open_fence is None else open_fence + ["", head]
            for idx, part in enumerate(s["body"]):
                if part["type"] == "music" and idx == 0:
                    open_fence.extend(music_lines(part["lines"][1:] if joined else part["lines"], dialect))
                elif part["type"] == "music" and part["lines"]:
                    flush()
                    open_fence = music_lines(part["lines"], dialect)
                else:
                    flush()
                    blocks.append(part_lines(part))
            continue
        flush()
        parts = [part_lines(p) for p in s["body"]]
        if s["heading"] == "markdown":
            name = heading_name(s)
            head = heading_line(2, name)
            if parts:
                parts[0] = [head, *parts[0]]
            else:
                parts = [[head]]
        blocks.extend(parts)
    flush()
    return blocks


def _voicing_blocks(blocks: list[dict]) -> list[list[str]]:
    order = []
    for b in blocks:
        if b["tuning"]["id"] not in order:
            order.append(b["tuning"]["id"])
    ordered = sorted(blocks, key=lambda b: (order.index(b["tuning"]["id"]), b["label"] != "", blocks.index(b)))
    out = []
    for b in ordered:
        lines = [f"## {b['label'] or 'Voicings'}: {b['tuning']['text']}"]
        for e in sorted(b["voicings"], key=lambda e: (e["symbol"], e["index"])):
            item = f"- {e['key']}: {format_frets(e['frets'])}"
            if e.get("fingers"):
                item += f" ({format_fingers(e['fingers'])})"
            lines.append(item)
        lines.extend(b["notes"])
        out.append(lines)
    return out


def serialize(doc: dict) -> str:
    """Print a model that is already canonical. `write` is what callers want."""
    blocks: list[list[str]] = []
    meta = []
    if doc.get("title"):
        meta.append(heading_line(1, doc["title"]))
    for p in doc.get("properties", []):
        meta.append(f"- {p['key']}: {p['value']}" if p["value"] else f"- {p['key']}:")
    if meta:
        blocks.append(meta)
    blocks.extend(_chart_blocks(doc["sections"], _dialect(doc)))
    voicings = _voicing_blocks(doc.get("blocks", []))
    if voicings:
        blocks.append(["---"])
        blocks.extend(voicings)
    if not blocks:
        return ""
    return "\n\n".join("\n".join(b) for b in blocks) + "\n"


class MarkedTextError(ValueError):
    """The text holds a marker line (§11.12.3): a merge waiting for someone,
    which a writer refuses to save. `line` is the first marker line's number
    in the text that would have been written, `text` that line."""

    def __init__(self, line: int, text: str):
        super().__init__(f"line {line} is a conflict marker ({text!r}): resolve the merge before saving")
        self.line = line
        self.text = text


def check_unmarked(text: str) -> None:
    """Raise MarkedTextError at the first marker line of a text (§11.12.3)."""
    found = marker_lines(text)
    if found:
        raise MarkedTextError(found[0], prepare(text)[found[0] - 1])


def write(doc: dict) -> str:
    """The canonical text of a document model (§8). A model whose text would
    hold a marker line is refused with MarkedTextError (§8.1, §11.12.3)."""
    text = serialize(canonical(doc))
    check_unmarked(text)
    return text


def is_canonical(text: str | bytes) -> bool:
    """Is the text a document in canonical form (§8.1)? A text that is not
    UTF-8 is not a document, and a marked text is never canonical."""
    from .parse import parse

    if isinstance(text, bytes):
        try:
            text = text.decode("utf-8")
        except UnicodeDecodeError:
            return False
    if marker_lines(text):
        return False
    try:
        return write(parse(text)) == text
    except (MarkedTextError, NotUTF8Error):
        return False
