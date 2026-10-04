"""Canonical writer (spec §8): the document model back to text.

`write(doc)` is `serialize(canonical(doc))`. `canonical` applies everything
canonicalisation changes in the model (§8.2): it drops what the canonical
form does not keep, applies the footnote invariants (§8.3) and lays out
every sung line (§8.5.5), so that `serialize` only has to print.
"""

from __future__ import annotations

import copy
import re

from .chord import DEFAULT_DIALECT, DIALECTS
from .frets import format_fingers, format_frets
from .parse import (
    ANNOTATION,
    BRACKET_HEADING,
    CLOSING_SEQUENCE,
    COUNT,
    LABEL_HEADING,
    LYRIC_MARKER,
    _is_chord_run,
    _Parser,
    divide_words,
    substantive,
    ascii_lower,
    key_for,
)


# --- item text -------------------------------------------------------------------


def item_text(it: dict) -> str:
    t = it["type"]
    if t == "chord":
        return it["key"]
    if t == "repeat":
        return "%"
    if t == "nochord":
        return "N.C."
    if t == "beat":
        return it["mark"]
    if t == "mark":
        if it["notation"] == "bracket":
            return "(" if it["open"] else ")"
        return ":"
    if t == "count":
        return f"x{it['times']}"
    if t == "ending":
        return f"{it['number']}."
    if t == "unknown":
        return it["text"]
    return ""


def _is_open_bar(it):
    return it["type"] == "mark" and it["notation"] == "barline" and it["open"]


def _is_close_bar(it):
    return it["type"] == "mark" and it["notation"] == "barline" and not it["open"]


# --- chord line tokens -------------------------------------------------------------


def line_tokens(line: dict, sung: bool = False) -> list[dict]:
    """A chord line as a sequence of bar, anchor and item tokens, in writing
    order (§8.5.4).

    Bar tokens: {"kind": "bar", "bar": "|" or "||", "close": item|None,
    "open": item|None, "measure": measure|None}. The bar token that carries a
    measure's bar line is the last one written before the measure's first
    item that makes it a measure; any other bar token is one the model holds
    no place for: one written so that a repeat mark has a bar line to stand
    against, or the line's closing bar.
    """
    toks: list[dict] = []
    ms = line["measures"]
    n = len(ms)
    pending_close = None  # a close mark waiting for the next measure's bar

    def bar(open_=None, close=None):
        return {"kind": "bar", "bar": "|", "close": close, "open": open_, "measure": None}

    for i, m in enumerate(ms):
        items = [it for it in m["items"] if it["type"] != "lead"]
        start = len(toks)
        anchor = {"kind": "anchor", "text": f"@{m['anchor']}", "measure": m} if "anchor" in m else None
        if i > 0:
            toks.append(bar(close=pending_close))
            pending_close = None
        subst = [j for j, it in enumerate(items) if substantive(it)]
        first = subst[0] if subst else None
        last_subst = subst[-1] if subst else None
        for j, it in enumerate(items):
            mine = toks[start:]
            if j == first:
                bars = [t for t in mine if t["kind"] == "bar"]
                if m["bar"] is not None:
                    if not bars:
                        toks.append(bar())
                        bars = [toks[-1]]
                    bars[-1]["bar"] = m["bar"]
                    bars[-1]["measure"] = m
                if anchor is not None and not sung:
                    toks.append(anchor)
            last = toks[-1] if len(toks) > start else None
            if _is_open_bar(it):
                if last is not None and last["kind"] == "bar" and last["open"] is None:
                    last["open"] = it
                else:
                    toks.append(bar(open_=it))
            elif _is_close_bar(it):
                if j == len(items) - 1 and i + 1 < n:
                    pending_close = it
                else:
                    toks.append(bar(close=it))
            else:
                toks.append({"kind": "item", "item": it, "text": item_text(it)})
        if anchor is not None and sung and subst:
            toks.insert(_anchor_slot(toks, start, m.get("anchorColumn")), anchor)
    close_bar = line["closeBar"]
    if close_bar is not None:
        last_bar = max((x for x, t in enumerate(toks) if t["kind"] == "bar"), default=None)
        if (
            last_bar is not None
            and toks[last_bar]["measure"] is None
            and not any(t["kind"] == "item" and substantive(t["item"]) for t in toks[last_bar + 1 :])
        ):
            toks[last_bar]["bar"] = close_bar
        else:
            toks.append(bar())
            toks[-1]["bar"] = close_bar
    return toks


def _anchor_slot(toks: list[dict], start: int, column) -> int:
    """Where a sung measure's anchor goes among the measure's tokens,
    `toks[start:]` (§8.4.4 step 5): in the stretch between the bar line
    before the measure's first item that makes it and the first bar line
    after its last, so that it reads back in the same measure; there,
    before the first token that wants a column greater than its own, or
    right after the last item that makes the measure when it has no
    column."""
    made = [x for x in range(start, len(toks)) if toks[x]["kind"] == "item" and substantive(toks[x]["item"])]
    if column is None:
        return made[-1] + 1
    lo = made[0]
    while lo > start and toks[lo - 1]["kind"] != "bar":
        lo -= 1
    hi = made[-1] + 1
    while hi < len(toks) and toks[hi]["kind"] != "bar":
        hi += 1
    for x in range(lo, hi):
        want = _desired(toks[x])
        if want is not None and want > column:
            return x
    return hi


def _token_text(t: dict) -> str:
    if t["kind"] == "bar":
        return (":" if t["close"] else "") + t["bar"] + (":" if t["open"] else "")
    return t["text"]


GUARD = ","


def chart_line_text(line: dict, dialect: str = DEFAULT_DIALECT) -> str:
    text = " ".join(_token_text(t) for t in line_tokens(line))
    if _misread(text, dialect):
        # A chord line whose first word would make it a heading, an
        # annotation or words is written after a `,`, which a reader drops.
        text = GUARD + " " + text
    return text


def _misread(text: str, dialect: str) -> bool:
    """Would a reader take this chord line for a heading, an annotation or words?"""
    bm = BRACKET_HEADING.match(text)
    if bm and bm.group(2) and not bm.group(2).isdigit():
        return True
    lm = LABEL_HEADING.match(text)
    if lm and lm.group(2) and _is_chord_run(lm.group(3), dialect):
        return True
    return bool(ANNOTATION.match(text) or LYRIC_MARKER.match(text))


# --- sung lines --------------------------------------------------------------------


def _desired(t: dict):
    if t["kind"] == "item":
        return t["item"].get("column")
    if t["kind"] == "anchor":
        return t["measure"].get("anchorColumn")
    if t["kind"] == "bar":
        if t["close"] is not None and "column" in t["close"]:
            return t["close"]["column"]
        if t["measure"] is not None and "column" in t["measure"]:
            return t["measure"]["column"]
        if t["open"] is not None and "column" in t["open"]:
            return max(t["open"]["column"] - len(t["bar"]), 0)
    return None


def _is_bracket(t: dict, open_: bool) -> bool:
    if t["kind"] != "item":
        return False
    it = t["item"]
    return it["type"] == "mark" and it["notation"] == "bracket" and it["open"] == open_


def _may_touch(prev: dict, t: dict) -> bool:
    """Two tokens may be written with no space between them only where one is
    a bar line, which a reader splits off before anything else, and no colon
    would then be taken for a repeat mark; or where one is an anchor and the
    other a bar line, a `(` before it or a `)` after it, which a reader
    splits off again, though not both brackets, since `(@9)` balances and is
    one word (§8.4.5)."""
    if t["kind"] == "anchor":
        return prev["kind"] == "bar" or _is_bracket(prev, True)
    if prev["kind"] == "anchor":
        return t["kind"] == "bar" or (_is_bracket(t, False) and not prev.get("after_open"))
    if prev["kind"] == "bar" and t["kind"] == "item":
        return not t["text"].startswith(":")
    if prev["kind"] == "item" and t["kind"] == "bar":
        return not prev["text"].endswith(":")
    return False


def layout_sung(line: dict, dialect: str = DEFAULT_DIALECT) -> list[dict]:
    """Place the chord line's tokens, each at its column where it fits; the
    column chosen is left in "at"."""
    toks = _place(line_tokens(line, sung=True))
    if _misread(_render_sung(toks), dialect):
        # As on a chart line, a `,` at column 0 keeps the line a chord line.
        toks = _place([{"kind": "guard", "text": GUARD}] + line_tokens(line, sung=True))
    return toks


def _place(toks: list[dict]) -> list[dict]:
    pos = 0
    prev = None
    for t in toks:
        want = 0 if t["kind"] == "guard" else _desired(t)
        if prev is None:
            at = want if want is not None else 0
        elif want is not None and (pos < want or (pos == want and _may_touch(prev, t))):
            at = want
        else:
            at = pos + 1
        t["at"] = at
        if t["kind"] == "anchor":
            t["after_open"] = prev is not None and at == pos and _is_bracket(prev, True)
        pos = at + len(_token_text(t))
        prev = t
    return toks


def _render_sung(toks: list[dict]) -> str:
    out = ""
    for t in toks:
        out += " " * (t["at"] - len(out)) + _token_text(t)
    return out


def _lyric(line: dict) -> str:
    """The line of words, rebuilt from the words its items hold."""
    items = sorted((it for m in line["measures"] for it in m["items"]), key=lambda it: it["column"])
    if items and items[0]["type"] == "lead":
        text = items[0]["words"]
        items = items[1:]
    else:
        text = " " * (items[0]["column"] if items else 0)
    return text + "".join(it.get("words", "") for it in items)


def _settle_sung(line: dict, dialect: str) -> None:
    """Give a sung line its canonical columns and divide the words again."""
    lyric = _lyric(line)
    for m in line["measures"]:
        m["items"] = [it for it in m["items"] if it["type"] != "lead"]
    toks = layout_sung(line, dialect)
    for t in toks:
        if t["kind"] == "item":
            t["item"]["column"] = t["at"]
        elif t["kind"] == "bar":
            x = t["at"]
            if t["close"] is not None:
                t["close"]["column"] = x
                x += 1
            if t["measure"] is not None:
                t["measure"]["column"] = x
            if t["open"] is not None:
                t["open"]["column"] = x + len(t["bar"])
        elif t["kind"] == "anchor":
            t["measure"]["anchorColumn"] = t["at"]
    items = sorted((it for m in line["measures"] for it in m["items"]), key=lambda it: it["column"])
    divide_words(items, lyric)
    lead = lyric[: items[0]["column"]]
    if lead.strip(" "):
        line["measures"][0]["items"].insert(0, {"type": "lead", "column": 0, "words": lead})


def sung_lines(line: dict, dialect: str = DEFAULT_DIALECT) -> list[str]:
    chords = _render_sung(layout_sung(line, dialect))
    lyric = _lyric(line)
    if line.get("forced"):
        lyric = ">" + lyric[1:]
    return [chords, lyric]


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
                    _settle_sung(line, dialect)
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
            out.extend(sung_lines(line, dialect))
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


def write(doc: dict) -> str:
    """The canonical text of a document model (§8)."""
    return serialize(canonical(doc))
