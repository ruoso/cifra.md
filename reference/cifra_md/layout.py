"""Chord-line tokens and the layout of sung lines (spec §8.4.4, §4.5).

The layout is one function, `converge`, used by the reader and by the
canonical writer alike: given a sung line's tokens with their columns as
written and its line of words as written, it works out what each token is
attached to and lays the line out canonically, pushing the words, never a
chord. The reader records its result in the model; `canonical` re-runs it
after anything that changes a token's width; the writer only prints.
"""

from __future__ import annotations

import re

from .chord import DEFAULT_DIALECT
from .parse import (
    ANNOTATION,
    BRACKET_HEADING,
    LABEL_HEADING,
    LYRIC_MARKER,
    _is_chord_run,
    line_shape,
    substantive,
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




# --- the words: padding and attachment (§4.5) -----------------------------------------------

PAD = "_"
_PAD_RUN = re.compile(r"_+")


def unpad(text: str):
    """The words of a sung line without their padding, and where each column
    of the line as written lands in them.

    A run of `_` with a character other than a space on each side is
    padding (§4.5.2), not words. Returns `(words, ref)`: `ref(column)` is the
    index in `words` of the character at that column, the character after
    the run for a column on padding, and for a column at or past the end of
    the line, the end plus the distance past it.
    """
    pad = [False] * len(text)
    for m in _PAD_RUN.finditer(text):
        s, e = m.span()
        if s > 0 and e < len(text) and text[s - 1] != " " and text[e] != " ":
            for k in range(s, e):
                pad[k] = True
    index = []
    kept = []
    for k, ch in enumerate(text):
        index.append(len(kept))
        if not pad[k]:
            kept.append(ch)
    words = "".join(kept)

    def ref(column: int) -> int:
        if column < len(text):
            return index[column]
        return len(words) + column - len(text)

    return words, ref


def _padding(words: str, at: int) -> str:
    """The character that pads before `words[at]`: `_` inside a word, where
    the character pushed and the one before it are both neither a space nor
    `_`; a space otherwise."""
    if at > 0 and words[at - 1] not in " _" and words[at] not in " _":
        return PAD
    return " "


def _pushed(words: str, inserts: list[tuple[int, int]]):
    """The words with the padding inserted, and which columns are `_` padding."""
    out = []
    mask = []
    k = 0
    for at, n in inserts:
        out.append(words[k:at])
        mask.extend([False] * (at - k))
        ch = _padding(words, at)
        out.append(ch * n)
        mask.extend([ch == PAD] * n)
        k = at
    out.append(words[k:])
    mask.extend([False] * (len(words) - k))
    return "".join(out), mask


def _attached(t: dict) -> bool:
    """Is the token attached to a character of the words? Items that make a
    measure are; marks, counts, endings, bar lines and anchors follow."""
    return t["kind"] == "item" and substantive(t["item"])


# --- the layout (§4.5.3) -----------------------------------------------------------------------


def _place(toks: list[dict], words: str, ref) -> list[tuple[int, int]]:
    """Place the tokens left to right, each in "at"; return the padding to
    insert into the words, as (index, width) pairs in increasing index."""
    inserts: list[tuple[int, int]] = []
    total = 0
    end = 0
    prev = None
    shift = 0  # how far the last attached token moved from where it was written
    floor = -1  # no padding may go before this character: a token is over it

    def current(p):
        return p + sum(n for q, n in inserts if q <= p)

    for t in toks:
        written = 0 if t["kind"] == "guard" else _desired(t)
        attached = _attached(t) and written is not None
        if attached:
            p = ref(written)
            want = current(p)
        else:
            want = None if written is None else written + (0 if t["kind"] == "guard" else shift)
        if prev is None:
            at = want if want is not None and want >= 0 else 0
        elif want is not None and (want > end or (want == end and _may_touch(prev, t))):
            at = want
        else:
            at = end + 1
        if attached:
            if at > want and floor < p < len(words):
                inserts.append((p, at - want))
                total += at - want
                q = p
            elif at == want:
                q = p
            else:
                q = at - total  # the character it lands on, past all padding so far
            floor = max(floor, q)
            shift = at - written
        t["at"] = at
        if t["kind"] == "anchor":
            t["after_open"] = prev is not None and at == end and _is_bracket(prev, True)
        end = at + len(_token_text(t))
        prev = t
    return inserts


def _render(toks: list[dict]) -> str:
    out = ""
    for t in toks:
        out += " " * (t["at"] - len(out)) + _token_text(t)
    return out


def _reads_as_words(text: str, dialect: str) -> bool:
    """Would a reader take this line, not forced, for a line of words again?"""
    if _misread(text, dialect):
        return False
    return line_shape(text, dialect)["kind"] == "prose"


def converge(line: dict, text: str, dialect: str = DEFAULT_DIALECT) -> None:
    """Lay a sung line out (§4.5.3) and record the result in the model.

    `line` holds the chord line's tokens with their columns as written; `text`
    is the line of words as written, with a `>` marker already read as a
    space. Afterwards every column in `line` is the column the token is
    written at, and the words are divided again at the new columns.
    """
    text = text.rstrip(" ")
    for m in line["measures"]:
        m["items"] = [it for it in m["items"] if it["type"] != "lead"]
    words, ref = unpad(text)
    toks = line_tokens(line, sung=True)
    inserts = _place(toks, words, ref)
    if _misread(_render(toks), dialect):
        # As on a chart line, a `,` at column 0 keeps the line a chord line.
        toks = [{"kind": "guard", "text": GUARD}] + line_tokens(line, sung=True)
        inserts = _place(toks, words, ref)
    laid, mask = _pushed(words, inserts)
    shift = 0
    if not line["forced"] and not _reads_as_words(laid, dialect):
        # Padded, the words would no longer read as words: they are forced,
        # with the line moved right by one when its first column is not free.
        line["forced"] = True
        if not laid.startswith(" "):
            laid, mask, shift = " " + laid, [False] + mask, 1
    for t in toks:
        x = t["at"] + shift
        if t["kind"] == "item":
            t["item"]["column"] = x
        elif t["kind"] == "bar":
            if t["close"] is not None:
                t["close"]["column"] = x
                x += 1
            if t["measure"] is not None:
                t["measure"]["column"] = x
            if t["open"] is not None:
                t["open"]["column"] = x + len(t["bar"])
        elif t["kind"] == "anchor":
            t["measure"]["anchorColumn"] = x
    _divide(line, laid, mask)
    for m in line["measures"]:
        # Keys in one order, however the measure came by its columns.
        order = ["bar", "items", "column", "anchor", "anchorColumn"]
        kept = {k: m.pop(k) for k in order if k in m}
        rest = dict(m)
        m.clear()
        m.update(kept)
        m.update(rest)


def _divide(line: dict, laid: str, mask: list[bool]) -> None:
    """Each item that makes a measure takes the words from its column to the
    next such item's (§4.4), padding left out; words before the first are
    the lead item's, unless they are all spaces."""

    def segment(a, b):
        return "".join(ch for k, ch in enumerate(laid[a:b], a) if not mask[k])

    items = [it for m in line["measures"] for it in m["items"]]
    attached = sorted((it for it in items if substantive(it)), key=lambda it: it["column"])
    for it in items:
        it.pop("words", None)
    for k, it in enumerate(attached):
        end = attached[k + 1]["column"] if k + 1 < len(attached) else len(laid)
        it["words"] = segment(it["column"], end) if it["column"] < len(laid) else ""
    lead = segment(0, attached[0]["column"] if attached else len(laid))
    if lead.strip(" "):
        line["measures"][0]["items"].insert(0, {"type": "lead", "column": 0, "words": lead})


# --- printing a sung line (§8.4.5) ----------------------------------------------------------


def lyric_text(line: dict) -> str:
    """The line of words of a sung line, printed from the model: each item's
    words at its column, a gap inside the words filled with `_`, the gap
    before words that begin the line with spaces. A forced line is printed
    here with a space for its marker."""
    items = [it for m in line["measures"] for it in m["items"]]
    lead = next((it["words"] for it in items if it["type"] == "lead"), "")
    attached = sorted((it for it in items if it["type"] != "lead" and substantive(it) and "column" in it), key=lambda it: it["column"])
    text = lead
    for it in attached:
        w = it.get("words", "")
        if w and len(text) < it["column"]:
            text += (PAD if text.strip(" ") else " ") * (it["column"] - len(text))
        text += w
    return text


def chord_text(line: dict, dialect: str = DEFAULT_DIALECT) -> str:
    """The chord line of a sung line, printed from the model: every token at
    its column; one with none (the closing bar line) one space after the
    token before it. A line that would be misread gets the `,` guard at
    column 0, which the layout has left free."""
    toks = line_tokens(line, sung=True)
    end = 0
    for k, t in enumerate(toks):
        want = _desired(t)
        t["at"] = want if want is not None and (k == 0 or want >= end) else (0 if k == 0 else end + 1)
        end = t["at"] + len(_token_text(t))
    text = _render(toks)
    if _misread(text, dialect):
        text = GUARD + text[1:] if text[:2] == "  " else GUARD + " " + text
    return text


def sung_text(line: dict, dialect: str = DEFAULT_DIALECT) -> list[str]:
    lyric = lyric_text(line)
    if line.get("forced"):
        lyric = ">" + lyric[1:]
    return [chord_text(line, dialect), lyric]
