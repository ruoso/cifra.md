"""Canonical writer (spec §8): the document model back to text.

Only what the model holds is written. Problems reported while reading are
not; the chart's layout is regenerated, except the columns of sung lines.
"""

from __future__ import annotations

from .frets import format_frets


def _item_text(it: dict) -> str:
    t = it["type"]
    if t == "chord":
        return it["key"]
    if t == "repeat":
        return "%"
    if t == "nochord":
        return "N.C."
    if t == "mark":
        if it["notation"] == "bracket":
            return "(" if it["open"] else ")"
        return ":"  # merged with the bar line by the caller
    if t == "count":
        return f"x{it['times']}"
    if t == "ending":
        return f"{it['number']}."
    if t == "unknown":
        return it["text"]
    return ""


def _chart_line_text(line: dict) -> str:
    """Chart line with close marks placed before the bar line they precede."""
    measures = [dict(m) for m in line["measures"]]
    parts = []
    pending_close = ""
    for i, m in enumerate(measures):
        items = list(m["items"])
        opens = ""
        closes = ""
        while items and items[0]["type"] == "mark" and items[0]["open"] and items[0]["notation"] == "barline":
            opens += ":"
            items.pop(0)
        while items and items[-1]["type"] == "mark" and not items[-1]["open"] and items[-1]["notation"] == "barline":
            closes += ":"
            items.pop()
        bar = m["bar"]
        if i == 0:
            lead = (bar or "|") + opens if (bar is not None or opens) else ""
        else:
            lead = pending_close + (bar or "|") + opens
        words = []
        if "anchor" in m:
            words.append(f"@{m['anchor']}")
        words.extend(_item_text(it) for it in items if it["type"] != "lead")
        parts.append((lead, " ".join(words)))
        pending_close = closes
    text = ""
    for lead, body in parts:
        if lead:
            text += ("" if not text else " ") + lead + " "
        elif text:
            text += " "
        text += body
    close = line["closeBar"]
    if pending_close or close is not None:
        text += " " + pending_close + (close or "|")
    return text.rstrip()


def _sung_lines(line: dict) -> list[str]:
    """Rebuild the chord line by column and the lyric line from the words."""
    cells = []  # (column, text)
    lyric = ""
    for m in line["measures"]:
        if "column" in m and m["bar"] is not None:
            cells.append((m["column"], m["bar"]))
        if "anchor" in m:
            first = next((it for it in m["items"] if it["type"] != "lead"), None)
            col = first["column"] - len(f"@{m['anchor']} ") if first else 0
            cells.append((max(col, 0), f"@{m['anchor']}"))
        for it in m["items"]:
            if "words" in it:
                lyric += it["words"]
            if it["type"] == "lead":
                continue
            cells.append((it["column"], _item_text(it)))
    cells.sort(key=lambda c: c[0])
    chords = ""
    for col, text in cells:
        if len(chords) < col:
            chords += " " * (col - len(chords))
        elif chords and not chords.endswith(" ") and not text.startswith(":"):
            chords += " "
        chords += text
    if line["closeBar"] is not None:
        chords += ("" if chords.endswith(":") else " ") + line["closeBar"]
    if line.get("forced"):
        lyric = ">" + lyric[1:] if lyric.startswith(" ") else "> " + lyric
    return [chords.rstrip(), lyric.rstrip()]


def _music_lines(lines: list[dict]) -> list[str]:
    out = []
    for line in lines:
        k = line["kind"]
        if k == "chart":
            out.append(_chart_line_text(line))
        elif k == "sung":
            out.extend(_sung_lines(line))
        elif k == "lyric":
            out.append(("> " + line["text"].lstrip()) if line["forced"] else line["text"])
        elif k == "break":
            out.append("")
    return out


def _inner_heading(section: dict):
    name = section["name"]
    if section["anchor"] is not None:
        name = f"{name} @{section['anchor']}".strip()
    if section["heading"] == "bracket":
        return f"[{name}]"
    if section["heading"] == "label":
        return f"{name}:"
    return None


def _sections_text(sections: list[dict]) -> list[str]:
    """Sections as lines. A cifra-style section continues the fence of the
    section before it, so a pasted cifra stays one block."""
    out: list[str] = []
    fence_open = False

    def close_fence():
        nonlocal fence_open
        if fence_open:
            out.append("```")
            out.append("")
            fence_open = False

    for section in sections:
        name = section["name"]
        if section["anchor"] is not None:
            name = f"{name} @{section['anchor']}".strip()
        inner = _inner_heading(section)
        if inner is None:
            close_fence()
            if section["heading"] == "markdown" or name:
                out.append(f"## {name}".rstrip())
        for part in section["body"]:
            if part["type"] == "notes":
                close_fence()
                out.append(part["text"])
                out.append("")
                continue
            lines = _music_lines(part["lines"])
            if inner is not None:
                if lines and part["lines"][0]["kind"] == "chart":
                    lines[0] = f"{inner} {lines[0]}"
                else:
                    lines.insert(0, inner)
                inner = None
                if fence_open:
                    out.append("")
                else:
                    out.append("```")
                    fence_open = True
            else:
                close_fence()
                out.append("```")
                fence_open = True
            out.extend(lines)
        if inner is not None:
            if fence_open:
                out.append("")
            else:
                out.append("```")
                fence_open = True
            out.append(inner)
        if section["heading"] != "bracket" and section["heading"] != "label":
            close_fence()
            if out and out[-1] != "":
                out.append("")
    close_fence()
    return out


def _sort_key(entry: dict):
    return (entry["symbol"], entry["index"])


def write(doc: dict) -> str:
    """The canonical text of a parsed document (§8.3)."""
    out: list[str] = []
    if doc.get("title"):
        out.append(f"# {doc['title']}")
    for k, v in doc.get("properties", {}).items():
        out.append(f"- {k}: {v}")
    if out:
        out.append("")
    out.extend(_sections_text(doc["sections"]))
    blocks = doc.get("blocks", [])
    # order: first appearance of the tuning; default variation first within it
    order = []
    for b in blocks:
        if b["tuning"]["id"] not in order:
            order.append(b["tuning"]["id"])
    ordered = sorted(blocks, key=lambda b: (order.index(b["tuning"]["id"]), b["label"] != "", blocks.index(b)))
    written = []
    for b in ordered:
        lines = [f"## {b['label'] or 'Voicings'}: {b['tuning']['text']}"]
        for e in sorted(b["voicings"], key=_sort_key):
            lines.append(f"- {e['key']}: {format_frets(e['frets'])}")
        lines.extend(b["notes"])
        written.append("\n".join(lines))
    text = "\n".join(out).rstrip("\n")
    if written:
        text += "\n\n---\n\n" + "\n\n".join(written)
    return text.rstrip("\n") + "\n"
