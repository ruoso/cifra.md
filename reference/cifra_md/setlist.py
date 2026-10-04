"""Setlists (spec §10): the reader and the canonical writer.

`parse_setlist(text or bytes) -> dict` reads a setlist into its model
(§10.6); `write_setlist(model) -> str` writes the canonical form (§10.9).
The model is plain dicts and lists:

    {"title": str | None,
     "properties": [entry, ...],
     "body": [item | notes, ...],
     "diagnostics": [{"code", "message", "line"}, ...]}

    entry:  {"type": "property", "key": str, "value": str}
          | {"type": "unrecognised", "text": str}
    item:   {"type": "song", "number": int, "text": str, "path": str, "entries": [entry]}
          | {"type": "unlinked", "number": int, "content": str, "entries": [entry]}
    notes:  {"type": "notes", "lines": [str]}

A song item's `path` is its decoded segments joined by `/` (§10.5); a
segment never holds a `/`, so the join is unambiguous.
"""

from __future__ import annotations

import re
import unicodedata

from .parse import fence_open, closes_fence, md_heading
from .text import prepare

BULLET = re.compile(r"^ *[-*+](?: +(.*))?$")
ITEM = re.compile(r"^ {0,3}([0-9]{1,9})[.)](?: +(.*))?$")
PROPERTY = re.compile(r"^([A-Za-z0-9_-]+) *:(?: +(.*))?$")
SCHEME = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*:")
ASCII_PUNCT = set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~")
SAFE = set("-._~!$'*+,;=@")


def _lower(text: str) -> str:
    return "".join(chr(ord(c) + 32) if "A" <= c <= "Z" else c for c in text)


def entry_of(content: str) -> dict:
    """An entry: a property when the content is `key: value` (§10.3)."""
    m = PROPERTY.match(content)
    if m:
        return {"type": "property", "key": _lower(m.group(1)), "value": m.group(2) or ""}
    return {"type": "unrecognised", "text": content}


# --- links and paths (§10.4, §10.5) ------------------------------------------------------


def _link(content: str):
    """(text, destination) when the content has the shape of a song link, else None."""
    if not content.startswith("["):
        return None
    depth = 0
    i = 1
    close = None
    while i < len(content):
        ch = content[i]
        if ch == "\\" and i + 1 < len(content) and content[i + 1] in ASCII_PUNCT:
            i += 2
            continue
        if ch == "[":
            depth += 1
        elif ch == "]":
            if depth == 0:
                close = i
                break
            depth -= 1
        i += 1
    if close is None or content[close + 1 : close + 2] != "(" or not content.endswith(")"):
        return None
    text = content[1:close]
    dest = content[close + 2 : -1]
    if dest.startswith("<"):
        if len(dest) < 2 or not dest.endswith(">"):
            return None
        inner = dest[1:-1]
        k = 0
        while k < len(inner):
            if inner[k] == "\\" and k + 1 < len(inner) and inner[k + 1] in ASCII_PUNCT:
                k += 2
                continue
            if inner[k] in "<>":
                return None
            k += 1
        return text, dest
    if any(c == " " or ord(c) < 32 or ord(c) == 127 for c in dest):
        return None
    depth = 0
    k = 0
    while k < len(dest):
        if dest[k] == "\\" and k + 1 < len(dest) and dest[k + 1] in ASCII_PUNCT:
            k += 2
            continue
        if dest[k] == "(":
            depth += 1
        elif dest[k] == ")":
            depth -= 1
            if depth < 0:
                return None
        k += 1
    if depth != 0:
        return None
    return text, dest


def _unescape(text: str) -> str:
    out = []
    k = 0
    while k < len(text):
        if text[k] == "\\" and k + 1 < len(text) and text[k + 1] in ASCII_PUNCT:
            out.append(text[k + 1])
            k += 2
            continue
        out.append(text[k])
        k += 1
    return "".join(out)


HEX = set("0123456789abcdefABCDEF")


def song_path(dest: str):
    """The path of a destination (§10.5), or (None, reason) when a step fails.

    Returns (path, None) on success."""
    if dest.startswith("<"):
        dest = dest[1:-1]
    p = _unescape(dest)
    if SCHEME.match(p):
        return None, "step 2: a URL, not a path"
    if "?" in p or "#" in p:
        return None, "step 2: a query or a fragment"
    if p.startswith("/"):
        return None, "step 2: an absolute path"
    segments = p.split("/")
    if any(s == "" for s in segments):
        return None, "step 3: an empty segment"
    decoded = []
    for s in segments:
        data = bytearray()
        k = 0
        while k < len(s):
            if s[k] == "%" and k + 2 < len(s) and s[k + 1] in HEX and s[k + 2] in HEX:
                data.append(int(s[k + 1 : k + 3], 16))
                k += 3
                continue
            data.extend(s[k].encode("utf-8"))
            k += 1
        try:
            seg = bytes(data).decode("utf-8")
        except UnicodeDecodeError:
            return None, "step 4: a segment that is not UTF-8"
        if "/" in seg or "\x00" in seg:
            return None, "step 4: a segment holding `/` or U+0000"
        decoded.append(unicodedata.normalize("NFC", seg))
    kept: list[str] = []
    for s in decoded:
        if s == ".":
            continue
        if s == "..":
            if kept and kept[-1] != "..":
                kept.pop()
            else:
                kept.append(s)
            continue
        kept.append(s)
    if not kept or all(s == ".." for s in kept):
        return None, "step 5: nothing left"
    last = kept[-1]
    if not last.endswith(".cifra.md") or len(last) <= len(".cifra.md"):
        return None, "step 6: not a song (`.cifra.md`)"
    return "/".join(kept), None


def write_path(path: str) -> str:
    """A path as canonical form writes it (§10.9.2)."""
    out = []
    for seg in path.split("/"):
        enc = []
        after_pct = False
        for ch in seg:
            if ord(ch) >= 128:
                if after_pct:
                    enc.append("".join(f"%{b:02X}" for b in ch.encode("utf-8")))
                else:
                    enc.append(ch)
            elif ch.isalnum() or ch in SAFE:
                enc.append(ch)
                after_pct = False
            else:
                enc.append(f"%{ord(ch):02X}")
                after_pct = True
        out.append("".join(enc))
    return "/".join(out)


# --- the reader (§10.3) ------------------------------------------------------------------


def _set_entry(entries: list, entry: dict, diag, lineno: int) -> None:
    """A repeated key: the last value, at the first's position (§10.3.1, §10.3.3)."""
    if entry["type"] == "property":
        for e in entries:
            if e["type"] == "property" and e["key"] == entry["key"]:
                diag("duplicate-key", lineno, f"`{entry['key']}` is set again; the earlier value is not kept")
                e["value"] = entry["value"]
                return
    else:
        diag("unrecognised-entry", lineno, "an entry that is not `key: value`; kept as written")
    entries.append(entry)


def _check_key(entry: dict, diag, lineno: int) -> None:
    if entry["type"] == "property" and entry["key"] == "key" and not _is_key(entry["value"]):
        diag("bad-key", lineno, f"`{entry['value']}` is not a key: a root, then `m` for minor (§10.7.1)")


def parse_setlist(text: str | bytes) -> dict:
    """Read a setlist into its model (§10.6)."""
    lines = prepare(text)
    diagnostics: list[dict] = []

    def diag(code, line, message):
        diagnostics.append({"code": code, "message": message, "line": line})

    n = len(lines)
    i = 0
    title = None
    properties: list[dict] = []
    while i < n and not lines[i]:
        i += 1
    if i < n:
        h = md_heading(lines[i])
        if h and h[0] == 1:
            title = h[1] or None
            i += 1
    # Properties: bullet lines right after the title, blank lines allowed.
    j = i
    while j < n:
        if not lines[j]:
            j += 1
            continue
        m = BULLET.match(lines[j])
        if not m:
            break
        _set_entry(properties, entry_of(m.group(1) or ""), diag, j + 1)
        j += 1
        i = j

    body: list[dict] = []
    notes: list[str] | None = None  # the notes block being read, blank lines included
    pending_blank = 0
    item = None  # the item whose entries may follow
    fence = None
    number = 0

    def flush_notes():
        nonlocal notes
        if notes is not None:
            body.append({"type": "notes", "lines": notes})
            notes = None

    for k in range(i, n):
        ln = lines[k]
        lineno = k + 1
        if fence is not None:
            if not ln:
                pending_blank += 1  # kept only if a line of the fence follows
                continue
            notes.extend([""] * pending_blank)
            pending_blank = 0
            notes.append(ln)
            if closes_fence(ln, fence):
                fence = None
            continue
        if not ln:
            pending_blank += 1
            continue
        m = ITEM.match(ln)
        if m:
            flush_notes()
            pending_blank = 0
            number += 1
            content = m.group(2) or ""
            link = _link(content)
            path = reason = None
            if link is not None:
                path, reason = song_path(link[1])
            if path is not None:
                item = {"type": "song", "number": number, "text": link[0], "path": path, "entries": []}
                if "\\" in path:
                    diag("backslash-in-path", lineno, "a `\\` in a path is part of a file name, not a separator")
            else:
                item = {"type": "unlinked", "number": number, "content": content, "entries": []}
                if link is not None:
                    diag("bad-path", lineno, f"the link's destination is not a song path ({reason})")
                else:
                    diag("unlinked-item", lineno, "an item that is not a song link; kept, and skipped when playing")
            body.append(item)
            continue
        b = BULLET.match(ln)
        if b and item is not None and notes is None:
            pending_blank = 0
            entry = entry_of(b.group(1) or "")
            _check_key(entry, diag, lineno)
            _set_entry(item["entries"], entry, diag, lineno)
            continue
        # notes
        item = None
        if notes is None:
            notes = []
        else:
            notes.extend([""] * pending_blank)
        pending_blank = 0
        notes.append(ln)
        fo = fence_open(ln)
        if fo:
            fence = (fo[0], fo[1], lineno)
    if fence is not None:
        diag("unclosed-fence", fence[2], "a fence was opened and never closed; it runs to the end of the setlist")
    flush_notes()
    diagnostics.sort(key=lambda d: d["line"])
    return {"title": title, "properties": properties, "body": body, "diagnostics": diagnostics}


KEY = re.compile(r"^[A-G](?:#|b|♯|♭)?m?$")


def _is_key(value: str) -> bool:
    return bool(KEY.match(value))


# --- the writer (§10.9) ------------------------------------------------------------------


def entry_line(entry: dict, indent: int = 0) -> str:
    pad = " " * indent
    if entry["type"] == "property":
        return f"{pad}- {entry['key']}:" + (f" {entry['value']}" if entry["value"] else "")
    return f"{pad}- {entry['text']}" if entry["text"] else f"{pad}-"


def ordered_entries(entries: list[dict]) -> list[dict]:
    """An item's entries in canonical order: `key`, `note`, then the rest (§10.9.2)."""
    first = [e for k in ("key", "note") for e in entries if e["type"] == "property" and e["key"] == k]
    return first + [e for e in entries if not any(e is f for f in first)]


def item_content(item: dict) -> str:
    """The item line after its number and the space (§10.9.2)."""
    if item["type"] == "song":
        return f"[{item['text']}]({write_path(item['path'])})"
    return item["content"]


def item_lines(item: dict, number: int) -> list[str]:
    content = item_content(item)
    head = f"{number}." + (f" {content}" if content else "")
    indent = len(str(number)) + 2
    return [head] + [entry_line(e, indent) for e in ordered_entries(item["entries"])]


def write_setlist(model: dict) -> str:
    """The canonical text of a setlist model (§10.9)."""
    parts: list[list[str]] = []
    meta = []
    if model.get("title"):
        meta.append(f"# {model['title']}")
    meta.extend(entry_line(e) for e in model.get("properties", []))
    if meta:
        parts.append(meta)
    run: list[str] | None = None
    number = 0
    for el in model.get("body", []):
        if el["type"] == "notes":
            if run is not None:
                parts.append(run)
                run = None
            parts.append(list(el["lines"]))
            continue
        number += 1
        if run is None:
            run = []
        run.extend(item_lines(el, number))
    if run is not None:
        parts.append(run)
    if not parts:
        return ""
    return "\n\n".join("\n".join(p) for p in parts) + "\n"


def canonicalise_setlist(text: str | bytes) -> str:
    return write_setlist(parse_setlist(text))
