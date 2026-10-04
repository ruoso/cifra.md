"""Reader for cifra.md documents (spec §1 to §7).

`parse(text)` returns a plain dict matching schema/cifra.schema.json.
"""

from __future__ import annotations

import re

from .chord import DEFAULT_DIALECT, DIALECTS, parse_chord
from .frets import check_fingers, parse_fingers, parse_frets
from .text import prepare
from .tuning import parse_tuning

# Whitespace is U+0020 only (§1.3); tabs are already spaces and trailing
# spaces are already gone when these patterns see a line.
RULE = re.compile(r"^ {0,3}-{3,}$")
FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})(.*)$")
MD_HEADING = re.compile(r"^ {0,3}(#{1,6})(?: (.*))?$")
LIST_ITEM = re.compile(r"^ {0,3}[-*+](?: +(.*))?$")
PROPERTY = re.compile(r"^([A-Za-z0-9_-]+) *:(?: +(.*))?$")
BRACKET_HEADING = re.compile(r"^( *\[ *([^\]]*?) *\] *)(.*)$")
LABEL_HEADING = re.compile(r"^( *([^ :|]+):(?: +|$))(.*)$")
HEADING_ANCHOR = re.compile(r" *@([0-9]+) *$")
BAR_ANCHOR = re.compile(r"^@([0-9]+)$")
COUNT = re.compile(r"^\(?(?:[x×]([0-9]+)|([0-9]+)[x×]|(bis))\)?$")
BEAT = {"/", ".", "-"}
ANNOTATION = re.compile(r"^ *// ?(.*)$")
HEADING_COUNT = re.compile(r" *(\(?(?:[x×][0-9]+|[0-9]+[x×]|bis)\)?) *$")
ENDING = re.compile(r"^([0-9]+)\.$")
CHORD_TOKEN = re.compile(r"^(.*?)(?:\[([0-9]+)\])?$")
LYRIC_MARKER = re.compile(r"^( *)>( ?)")
BARS = re.compile(r"(:)?(\|+)(:)?")
WORD = re.compile(r"[^ ]+")
SPACES = re.compile(r" +")
CLOSING_SEQUENCE = re.compile(r"(?:^| )#+$")

REPEAT = "%"
FINGERING = re.compile(r"^(.*?) *\(([^()]*)\) *$")


def ascii_lower(text: str) -> str:
    return "".join(chr(ord(c) + 32) if "A" <= c <= "Z" else c for c in text)


def heading_text(content: str | None) -> str:
    """The text of a Markdown heading (§1.7.1): trimmed, closing `#`s removed,
    runs of spaces collapsed to one."""
    t = (content or "").strip(" ")
    t = CLOSING_SEQUENCE.sub("", t).strip(" ")
    return SPACES.sub(" ", t)


def md_heading(line: str):
    """(level, text) for a Markdown heading line, else None."""
    m = MD_HEADING.match(line)
    if not m:
        return None
    return len(m.group(1)), heading_text(m.group(2))


def fence_open(line: str):
    """(char, length, info) for a line that opens a fence, else None (§1.9)."""
    m = FENCE.match(line)
    if not m:
        return None
    run, info = m.group(1), m.group(2)
    if run[0] == "`" and "`" in info:
        return None  # CommonMark: a backtick fence's info string has no backtick
    return run[0], len(run), ascii_lower(info.strip(" "))


def closes_fence(line: str, fence) -> bool:
    m = re.match(r"^ {0,3}(`+|~+)$", line)
    return bool(m) and m.group(1)[0] == fence[0] and len(m.group(1)) >= fence[1]


def substantive(it: dict) -> bool:
    """Does the item make a measure (§2.2)? Marks, counts and ending markers
    do not, including an ending marker demoted to an unknown token (§3.4)."""
    if it["type"] == "unknown":
        return not ENDING.match(it["text"])
    return it["type"] in ("chord", "nochord", "beat", "repeat")


def is_bar(measure: dict) -> bool:
    return any(substantive(it) for it in measure["items"])


def divide_words(items: list[dict], words: str) -> None:
    """Each item takes the words from its column to the next item's (§4.4).
    `items` are in column order."""
    for k, it in enumerate(items):
        end = items[k + 1]["column"] if k + 1 < len(items) else len(words)
        it["words"] = words[it["column"] : end] if it["column"] < len(words) else ""


def key_for(symbol: str, index: int) -> str:
    return f"{symbol}[{index}]" if index > 1 else symbol


# --- tokens ------------------------------------------------------------------


def _count_times(m) -> int:
    if m.group(3):
        return 2
    return int(m.group(1) or m.group(2))


def _balanced(text: str) -> bool:
    depth = 0
    for ch in text:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth < 0:
                return False
    return depth == 0


def _split_marks(word: str):
    """Leading `(` and trailing `)` that nothing balances become marks (§2.3, §3.2)."""
    before, core, after = "", word, ""
    while core and not _balanced(core):
        if core.startswith("("):
            before += "("
            core = core[1:]
        elif core.endswith(")"):
            after = ")" + after
            core = core[:-1]
        else:
            break
    return before, core, after


def _classify_core(core: str, dialect: str):
    """Steps 2, 3, 4 and 6 of §2.3 for a word with its marks removed."""
    if core == REPEAT:
        return {"type": "repeat"}
    if core.upper() in ("N.C.", "NC"):
        return {"type": "nochord"}
    if core in BEAT:
        return {"type": "beat", "mark": core}
    m = COUNT.match(core)
    if m:
        return {"type": "count", "times": _count_times(m)}
    m = ENDING.match(core)
    if m:
        return {"type": "ending", "number": int(m.group(1))}
    m = CHORD_TOKEN.match(core)
    symbol = m.group(1) or core
    index = max(int(m.group(2)), 1) if m.group(2) else 1
    result = parse_chord(symbol, dialect)
    if result["chord"] is None:
        return {"type": "unknown", "text": core}
    item = {
        "type": "chord",
        "symbol": symbol,
        "index": index,
        "key": key_for(symbol, index),
        "chord": result["chord"],
    }
    if result["ambiguities"]:
        item["ambiguities"] = result["ambiguities"]
    return item


def scan_line(body: str, dialect: str) -> dict:
    """Measures and items of one chord line, with every item's column.

    Returns {"measures": [...], "closeBar": ..., "trailing": anchor|None,
    "has_bar": bool}. Measures carry a private "_col" for their bar line.
    """
    bars = list(BARS.finditer(body))
    pieces = []
    prev_end = 0
    for m in bars:
        pieces.append((prev_end, body[prev_end : m.start()], m))
        prev_end = m.end()
    pieces.append((prev_end, body[prev_end:], None))

    measures = []
    close_bar = None
    carry_anchor = None
    pending = []  # items waiting for the next measure: open marks, orphaned close marks
    bar_before = None
    bar_col = None

    for start, text, bar in pieces:
        items = []
        anchor = None
        for w in WORD.finditer(text):
            col = start + w.start()
            word = w.group(0).rstrip(",;")
            if not word:
                continue
            a = BAR_ANCHOR.match(word)
            if a:
                anchor = int(a.group(1))
                continue
            if COUNT.match(word):
                items.append({"type": "count", "times": _count_times(COUNT.match(word)), "column": col})
                continue
            before, core, after = _split_marks(word)
            core = core.rstrip(",;")
            for k in range(len(before)):
                items.append({"type": "mark", "open": True, "notation": "bracket", "column": col + k})
            if core and BAR_ANCHOR.match(core):
                anchor = int(core[1:])
                core = ""
            if core:
                item = _classify_core(core, dialect)
                item["column"] = col + len(before)
                items.append(item)
            for k in range(len(after)):
                items.append({"type": "mark", "open": False, "notation": "bracket", "column": col + len(before) + len(core) + k})
        close_mark = None
        if bar is not None and bar.group(1):
            close_mark = {"type": "mark", "open": False, "notation": "barline", "column": bar.start(1)}

        substantive = any(it["type"] in ("chord", "nochord", "beat", "repeat", "unknown") for it in items)
        if substantive:
            measure = {"bar": bar_before, "items": pending + items}
            pending = []
            if bar_col is not None:
                measure["_col"] = bar_col
            if anchor is not None:
                measure["anchor"] = anchor
            elif carry_anchor is not None:
                measure["anchor"] = carry_anchor
            carry_anchor = None
            if close_mark is not None:
                measure["items"].append(close_mark)
            measures.append(measure)
        else:
            # Nothing to play here: marks, counts and endings find a home on
            # the measure before or after them (§2.2, §3).
            if anchor is not None:
                carry_anchor = anchor
            if close_mark is not None:
                items.append(close_mark)
            for it in items:
                backwards = it["type"] == "count" or (it["type"] == "mark" and not it["open"])
                if backwards and measures:
                    measures[-1]["items"].append(it)
                else:
                    pending.append(it)
            if bar is None and bar_before is not None:
                close_bar = bar_before

        if bar is None:
            break
        bar_before = "||" if len(bar.group(2)) >= 2 else "|"
        bar_col = bar.start(2)
        if bar.group(3):
            pending.append({"type": "mark", "open": True, "notation": "barline", "column": bar.start(3)})

    if pending:
        if measures:
            measures[-1]["items"].extend(pending)
        else:
            measures.append({"bar": None, "items": pending})
    return {"measures": measures, "closeBar": close_bar, "trailing": carry_anchor, "has_bar": bool(bars)}


# --- line shapes (§4.1) ----------------------------------------------------------


def _strip_marker(raw: str) -> str:
    return LYRIC_MARKER.sub(lambda m: m.group(1) + " " + m.group(2), raw, count=1)


def line_shape(raw: str, dialect: str) -> dict:
    am = ANNOTATION.match(raw)
    if am:
        return {"kind": "annotation", "body": am.group(1), "words": 0, "scan": None, "forced": False}
    forced = bool(LYRIC_MARKER.match(raw))
    body = _strip_marker(raw) if forced else raw
    if forced and not body.strip(" "):
        forced, body = False, raw  # `>` alone has no words to force
    scan = scan_line(body, dialect)
    items = [it for m in scan["measures"] for it in m["items"]]
    words = [it for it in items if it["type"] in ("chord", "nochord", "unknown")]
    chords = [it for it in words if it["type"] in ("chord", "nochord")]
    if forced:
        kind = "forced"
    elif not items:
        # No items: empty, or only bar lines, anchors and punctuation. Read as
        # a blank line, though an anchor on it still carries forward (§2.8).
        kind = "blank"
    elif forced:
        kind = "forced"
    elif scan["has_bar"] or not words or len(chords) == len(words):
        kind = "chords"
    elif (len(words) - len(chords)) / len(words) >= 0.5:
        kind = "prose"
    else:
        kind = "chart"
    return {"kind": kind, "body": body, "words": len(words), "scan": scan, "forced": forced}


# --- the parser --------------------------------------------------------------------


class _Parser:
    def __init__(self, text, dialect: str | None):
        self.lines = prepare(text)
        self.diagnostics = []
        self.title = None
        self.properties = []  # [{"key", "value"}], in order of first appearance
        self.sections = []
        self.blocks = []
        self.dialect_override = dialect

    def diag(self, code, line, message, text=None):
        d = {"code": code, "message": message, "line": line}
        if text is not None:
            d["text"] = text
        self.diagnostics.append(d)

    def prop(self, key):
        for p in self.properties:
            if p["key"] == key:
                return p["value"]
        return None

    # metadata ------------------------------------------------------------
    def read_metadata(self) -> int:
        i = 0
        n = len(self.lines)
        while i < n and not self.lines[i]:
            i += 1
        if i < n:
            h = md_heading(self.lines[i])
            if h and h[0] == 1:
                # An empty title is no title (§1.4.1); the line is still the title line.
                self.title = h[1] or None
                i += 1
        j = i
        while j < n:
            ln = self.lines[j]
            if not ln:
                j += 1
                continue
            m = LIST_ITEM.match(ln)
            if not m:
                break
            pm = PROPERTY.match(m.group(1) or "")
            if pm:
                key, value = ascii_lower(pm.group(1)), pm.group(2) or ""
                for p in self.properties:
                    if p["key"] == key:
                        self.diag("duplicate-property", j + 1, f"`{key}` is set again; the earlier value is not kept", ln)
                        p["value"] = value
                        break
                else:
                    self.properties.append({"key": key, "value": value})
            else:
                self.diag("bad-property", j + 1, "a property is `key: value`, with a space after the colon; this line is not kept", ln)
            i = j + 1
            j += 1
        return i

    # sections ------------------------------------------------------------
    def new_section(self, name, heading):
        name = SPACES.sub(" ", name.strip(" "))
        anchor = times = None
        if heading != "label":  # a label is one word and carries neither (§1.7.4)
            name, anchor, times = _take_anchor(name)
        section = {"name": name, "heading": heading, "anchor": anchor, "body": [], "groups": []}
        if times is not None:
            section["times"] = times
        self.sections.append(section)
        return section

    def run(self):
        start = self.read_metadata()
        dialect = ascii_lower((self.dialect_override or self.prop("notation") or DEFAULT_DIALECT).strip(" "))
        if dialect not in DIALECTS:
            self.diag("bad-notation", 1, f"unknown notation {dialect!r}; using {DEFAULT_DIALECT}")
            dialect = DEFAULT_DIALECT
        self.dialect = dialect

        section = self.new_section("", None)
        part = None  # current body part being filled
        fence = None  # (char, length, line) while inside a fence
        in_voicings = False
        block = None
        skipping = False

        for idx in range(start, len(self.lines)):
            raw = self.lines[idx]
            lineno = idx + 1

            if in_voicings:
                block, skipping = self.voicings_line(raw, lineno, block, skipping)
                continue

            if fence is not None:
                if closes_fence(raw, fence):
                    fence = None
                    part = None
                    continue
                if part["type"] == "verbatim":
                    part["raw"].append(raw)
                    continue
                # inside a fence: cifra-style headings open sections. What
                # follows a bracket heading on its line is read as a line of
                # its own, so it may be another heading (§1.7.2).
                text = raw
                headed = False

                def leave_opening_part():
                    # A fence that opens with a cifra heading holds nothing for
                    # the section before it; its blank lines are not a part.
                    if part.get("_opening") and all(not t for _, t in part["raw"]):
                        body = part["_section"]["body"]
                        del body[next(i for i, p in enumerate(body) if p is part)]

                while True:
                    bm = BRACKET_HEADING.match(text)
                    if not (bm and bm.group(2) and not bm.group(2).isdigit()):
                        break
                    rest = bm.group(3)
                    cm = COUNT.match(rest) if rest else None
                    leave_opening_part()
                    section = self.new_section(bm.group(2) + (f" {rest}" if cm else ""), "bracket")
                    part = {"type": "music", "raw": []}
                    section["body"].append(part)
                    headed = True
                    text = "" if cm else rest
                    if not text:
                        break
                if headed and not text:
                    continue
                lm = LABEL_HEADING.match(text)
                if lm and lm.group(2) and _is_chord_run(lm.group(3), dialect):
                    leave_opening_part()
                    section = self.new_section(lm.group(2), "label")
                    part = {"type": "music", "raw": []}
                    section["body"].append(part)
                    rest = lm.group(3)
                    if rest:
                        part["raw"].append((lineno, rest))
                        if "|" not in rest and len(rest.split(" ")) == 1 and _classify_core(rest.rstrip(",;"), dialect)["type"] == "chord":
                            self.diag(
                                "heading-looks-like-key",
                                lineno,
                                f"`{text.strip(' ')}` reads as a section called {lm.group(2)!r} holding one chord; "
                                f"if it is the song's key, write `- key: {rest}` in the properties",
                                raw,
                            )
                    continue
                part["raw"].append((lineno, text))
                continue

            fo = fence_open(raw)
            if fo:
                fence = (fo[0], fo[1], lineno)
                info = fo[2]
                if info and info != "cifra":
                    part = {"type": "verbatim", "info": info, "raw": []}
                else:
                    part = {"type": "music", "raw": [], "_opening": True, "_section": section}
                section["body"].append(part)
                continue
            if RULE.match(raw):
                in_voicings = True
                part = None
                continue
            h = md_heading(raw)
            if h:
                section = self.new_section(h[1], "markdown")
                part = None
                continue
            # notes
            if part is None or part["type"] != "notes":
                part = {"type": "notes", "raw": []}
                section["body"].append(part)
            part["raw"].append((lineno, raw))

        if fence is not None:
            self.diag("unclosed-fence", fence[2], "a fence was opened and never closed; it runs to the end of the document")
            if part is not None and part["type"] == "verbatim":
                while part["raw"] and not part["raw"][-1]:
                    part["raw"].pop()

        self.finish_sections()
        return self.result()

    # voicings part ------------------------------------------------------------
    def voicings_line(self, raw, lineno, block, skipping):
        if not raw:
            return block, skipping
        if RULE.match(raw):
            self.diag("extra-rule", lineno, "a second rule; only the first divides the document, and this one is not kept", raw)
            return block, skipping
        h = md_heading(raw)
        if h:
            text = h[1]
            label, sep, tuning_text = text.partition(":")
            label = label.strip(" ")
            tuning_text = tuning_text.strip(" ")
            if not sep or not label or not tuning_text:
                self.diag(
                    "bad-block-heading",
                    lineno,
                    f"`{raw.strip(' ')}` comes after the rule, where a heading is a voicings block and needs a tuning "
                    "(`## Voicings: E2 A2 D3 G3 B3 E4`). If it is a section of the song, move the rule below it; "
                    "the lines under it are not read",
                    raw,
                )
                return None, True
            try:
                tuning = parse_tuning(tuning_text)
            except ValueError:
                self.diag(
                    "bad-block-heading",
                    lineno,
                    f"not a tuning: {tuning_text!r}. A tuning is the open strings as pitches with octave numbers, "
                    "lowest string first, like E2 A2 D3 G3 B3 E4 for a guitar or G4 C4 E4 A4 for a ukulele",
                    raw,
                )
                return None, True
            name = "" if ascii_lower(label) == "voicings" else label
            for existing in self.blocks:
                if existing["tuning"]["id"] == tuning["id"] and existing["label"] == name:
                    self.diag("duplicate-block", lineno, "a second block for the same tuning and variation; merged", raw)
                    return existing, False
            block = {"label": name, "tuning": tuning, "voicings": [], "notes": []}
            self.blocks.append(block)
            return block, False
        if skipping:
            return block, skipping
        lm = LIST_ITEM.match(raw)
        if lm:
            if block is None:
                self.diag("item-outside-block", lineno, "a voicing before any block heading; not kept", raw)
                return block, skipping
            key, sep, frets_text = (lm.group(1) or "").partition(":")
            key = key.strip(" ")
            if not sep or not key or " " in key:
                self.diag("bad-voicing", lineno, "a voicing is `- key: frets`; this line is not kept", raw)
                return block, skipping
            fingers_text = None
            fm = FINGERING.match(frets_text)
            if fm:
                frets_text, fingers_text = fm.group(1), fm.group(2)
            frets = parse_frets(frets_text)
            if frets is None:
                self.diag("bad-voicing", lineno, f"not a fret string: {frets_text.strip(' ')!r}", raw)
                return block, skipping
            if len(frets) != len(block["tuning"]["pitches"]):
                self.diag("bad-voicing", lineno, f"{len(frets)} frets for {len(block['tuning']['pitches'])} strings", raw)
                return block, skipping
            m = CHORD_TOKEN.match(key)
            symbol = m.group(1) or key
            index = max(int(m.group(2)), 1) if m.group(2) else 1
            entry = {"key": key_for(symbol, index), "symbol": symbol, "index": index, "frets": frets}
            if fingers_text is not None:
                fingers = parse_fingers(fingers_text)
                problem = "not a fingering" if fingers is None else check_fingers(fingers, frets)
                if problem:
                    self.diag("bad-fingering", lineno, problem, raw)
                else:
                    entry["fingers"] = fingers
            for existing in block["voicings"]:
                if existing["key"] == entry["key"]:
                    existing["frets"] = frets
                    existing.pop("fingers", None)
                    if "fingers" in entry:
                        existing["fingers"] = entry["fingers"]
                    break
            else:
                block["voicings"].append(entry)
            return block, skipping
        if block is None:
            self.diag("notes-outside-block", lineno, "text in the voicings part before any block; not kept", raw)
            return block, skipping
        block["notes"].append(raw)
        return block, skipping

    # finishing -----------------------------------------------------------
    def finish_sections(self):
        dialect = self.dialect
        # Shapes first, for the whole document, since sung is a document property.
        shaped = []
        for section in self.sections:
            for part in section["body"]:
                if part["type"] == "music":
                    part["shapes"] = [line_shape(raw, dialect) for _, raw in part["raw"]]
                    shaped.append(part)
        sung = False
        sung_at = None
        for part in shaped:
            shapes = part["shapes"]
            for i, sh in enumerate(shapes):
                if sung:
                    break
                if sh["kind"] == "forced":
                    sung, sung_at = True, part["raw"][i][0]
                elif sh["kind"] == "chords" and i + 1 < len(shapes) and shapes[i + 1]["kind"] == "prose" and shapes[i + 1]["words"] >= 2:
                    sung, sung_at = True, part["raw"][i + 1][0]
        words = ascii_lower((self.prop("words") or "").strip(" "))
        if words in ("yes", "no"):
            sung, sung_at = words == "yes", None
        elif words:
            self.diag("bad-property", 1, f"`words` is yes or no, not {words!r}")
        self.sung = sung
        self.sung_at = sung_at

        kept_sections = []
        for section in self.sections:
            body = []
            for part in section["body"]:
                if part["type"] == "notes":
                    lines = part["raw"]
                    while lines and not lines[0][1]:
                        lines.pop(0)
                    while lines and not lines[-1][1]:
                        lines.pop()
                    if lines:
                        body.append({"type": "notes", "text": "\n".join(t for _, t in lines)})
                        if not shaped:
                            self.unfenced_check(lines)
                elif part["type"] == "verbatim":
                    body.append({"type": "verbatim", "info": part["info"], "text": "\n".join(part["raw"])})
                else:
                    body.append({"type": "music", "lines": self.assemble(part, sung)})
            section["body"] = body
            if body or section["heading"] is not None:
                kept_sections.append(section)
        self.sections = kept_sections

        self.carry_anchors()
        if not sung:
            self.number_bars()
        for section in self.sections:
            self.pair_repeats(section)
        self.check_repeat_signs()
        for section in self.sections:
            for part in section["body"]:
                if part["type"] == "music":
                    for line in part["lines"]:
                        for m in line.get("measures", []):
                            m.pop("_col", None)
                            m.pop("_trailing", None)
                        line.pop("_anchor_only", None)
                        line.pop("_line", None)

    def unfenced_check(self, lines):
        """A chart with no fence at all whose notes look like chord lines is
        almost certainly a paste that was never fenced (§1.9)."""
        if any(d["code"] == "unfenced-music" for d in self.diagnostics):
            return
        for lineno, text in lines:
            if MD_HEADING.match(text) or LIST_ITEM.match(text):
                continue
            shape = line_shape(text, self.dialect)
            if shape["scan"] is None:
                continue
            chords = [it for m in shape["scan"]["measures"] for it in m["items"] if it["type"] in ("chord", "nochord")]
            if shape["kind"] == "chords" and chords:
                self.diag(
                    "unfenced-music",
                    lineno,
                    "this reads as a line of chords, but it is outside a fence, so it is notes; "
                    "put the music between ``` lines (or ~~~)",
                    text,
                )
                return

    def assemble(self, part, sung):
        """The lines of one music part. A run of blank lines between two
        lines of the part is one break (§4.5); a line with no items reads as
        blank, though its anchor is kept to carry forward (§2.8)."""
        shapes = part["shapes"]
        raws = part["raw"]
        out = []
        content = False  # a line other than an anchor carrier has been emitted
        gap = False  # blank lines since the last content line
        i = 0
        while i < len(shapes):
            sh = shapes[i]
            lineno = raws[i][0]
            if sh["kind"] == "blank":
                if sh["scan"] is not None and sh["scan"]["trailing"] is not None:
                    out.append({"kind": "chart", "measures": [], "closeBar": None, "_anchor_only": sh["scan"]["trailing"]})
                gap = True
                i += 1
                continue
            if gap and content:
                out.append({"kind": "break"})
            gap = False
            content = True
            if sh["kind"] == "annotation":
                out.append({"kind": "annotation", "text": sh["body"]})
                i += 1
                continue
            if not sung:
                line = self.chart_line(sh)
                line["_line"] = lineno
                out.append(line)
                i += 1
                continue
            nxt = shapes[i + 1] if i + 1 < len(shapes) else None
            paired = sh["kind"] == "chords" and nxt is not None and nxt["kind"] in ("prose", "forced")
            if paired:
                line = self.sung_line(sh, nxt)
                line["_line"] = lineno
                out.append(line)
                i += 2
            elif sh["kind"] in ("prose", "forced"):
                out.append({"kind": "lyric", "text": sh["body"], "forced": sh["forced"]})
                i += 1
            else:
                line = self.chart_line(sh)
                line["_line"] = lineno
                out.append(line)
                i += 1
        return out

    def chart_line(self, sh):
        scan = sh["scan"]
        for m in scan["measures"]:
            for it in m["items"]:
                it.pop("column", None)
        line = {"kind": "chart", "measures": scan["measures"], "closeBar": scan["closeBar"]}
        if not scan["has_bar"]:
            line["run"] = True
        if scan["trailing"] is not None:
            line["measures"][-1]["_trailing"] = scan["trailing"]
        return line

    def sung_line(self, sh, nxt):
        scan = sh["scan"]
        words = nxt["body"]
        measures = scan["measures"]
        items = sorted((it for m in measures for it in m["items"]), key=lambda it: it["column"])
        divide_words(items, words)
        if items:
            lead = words[: items[0]["column"]]
            if lead.strip(" "):
                measures[0]["items"].insert(0, {"type": "lead", "column": 0, "words": lead})
        for m in measures:
            if "_col" in m:
                m["column"] = m.pop("_col")
        return {"kind": "sung", "measures": measures, "closeBar": scan["closeBar"], "forced": nxt["forced"]}

    def carry_anchors(self):
        """A stated number with no bar of its own belongs to the next bar (§2.8)."""
        pending = None
        for section in self.sections:
            for part in section["body"]:
                if part["type"] != "music":
                    continue
                kept = []
                for line in part["lines"]:
                    if line["kind"] == "chart" and "_anchor_only" in line:
                        pending = line["_anchor_only"]
                        continue
                    kept.append(line)
                    if line["kind"] not in ("chart", "sung"):
                        continue
                    for m in line["measures"]:
                        if "_trailing" in m and not is_bar(m):
                            # marks alone are not a bar: the number passes on
                            pending = m.pop("_trailing")
                            continue
                        if not is_bar(m):
                            continue
                        if pending is not None and "anchor" not in m:
                            m["anchor"] = pending
                        pending = None
                        if "_trailing" in m:
                            pending = m.pop("_trailing")
                part["lines"] = kept

    def number_bars(self):
        bar = 1
        for section in self.sections:
            if section["anchor"] is not None:
                bar = section["anchor"]
            for part in section["body"]:
                if part["type"] != "music":
                    continue
                for line in part["lines"]:
                    if line["kind"] != "chart" or line.get("run"):
                        continue
                    for m in line["measures"]:
                        if not is_bar(m):
                            continue
                        if "anchor" in m:
                            bar = m["anchor"]
                        m["number"] = bar
                        m["stated"] = "anchor" in m
                        bar += 1

    def positions(self, section):
        for pi, part in enumerate(section["body"]):
            if part["type"] != "music":
                continue
            for li, line in enumerate(part["lines"]):
                if line["kind"] in ("chart", "sung"):
                    for mi, m in enumerate(line["measures"]):
                        for ii, it in enumerate(m["items"]):
                            yield {"part": pi, "line": li, "measure": mi, "item": ii}, it, line

    def pair_repeats(self, section):
        seq = list(self.positions(section))
        open_pos = None
        group = None
        groups = []
        consumed = set()

        def key(pos):
            return (pos["part"], pos["line"], pos["measure"], pos["item"])

        def same_line(a, b):
            return a["part"] == b["part"] and a["line"] == b["line"]

        for n, (pos, it, line) in enumerate(seq):
            t = it["type"]
            lineno = line.get("_line", 1)
            if t == "mark":
                if it["open"]:
                    if open_pos is not None:
                        self.diag("stray-mark", lineno, "an opening mark inside an open repeat group")
                    else:
                        open_pos = pos
                        group = {"open": pos, "close": None, "count": None, "endings": []}
                elif open_pos is None:
                    self.diag("stray-mark", lineno, "a closing mark with no open repeat group")
                else:
                    group["close"] = pos
                    if n + 1 < len(seq):
                        npos, nit, _ = seq[n + 1]
                        if same_line(npos, pos) and nit["type"] == "count":
                            group["count"] = nit["times"]
                            group["countItem"] = npos
                            consumed.add(key(npos))
                        elif same_line(npos, pos) and nit["type"] == "ending":
                            group["endings"].append({"number": nit["number"], "at": npos})
                            consumed.add(key(npos))
                    groups.append(self.finish_group(group, lineno))
                    open_pos = None
                    group = None
            elif t == "ending":
                if key(pos) in consumed:
                    continue
                if group is not None and group["close"] is None:
                    group["endings"].append({"number": it["number"], "at": pos})
                    consumed.add(key(pos))
                else:
                    self.diag("ending-outside-group", lineno, f"{it['number']}. outside a repeat group is not an ending")
            elif t == "count":
                if key(pos) in consumed:
                    continue
                last = n + 1 == len(seq) or not same_line(seq[n + 1][0], pos)
                has_marks = any(i2["type"] == "mark" for p2, i2, _ in seq if same_line(p2, pos))
                if last and not has_marks:
                    line["times"] = it["times"]
                else:
                    self.diag("count-out-of-place", lineno, "a count that follows neither a repeat group nor ends a line")
        if open_pos is not None:
            self.diag("unclosed-group", seq[-1][2].get("_line", 1) if seq else 1, "a repeat group was opened and never closed")
        section["groups"] = groups
        self._demote(section, consumed)

    def finish_group(self, group, lineno):
        endings = group["endings"]
        if endings:
            numbers = [e["number"] for e in endings]
            if numbers != list(range(1, len(numbers) + 1)):
                self.diag("bad-ending-sequence", lineno, f"endings must be 1. to n. in order, got {numbers}")
            if group["count"] is not None:
                self.diag("count-with-endings", lineno, "a group with endings takes its count from them")
            group["count"] = max(numbers)
        elif group["count"] is None:
            group["count"] = 2
        if group.get("countItem") is None:
            group.pop("countItem", None)
        return group

    def _demote(self, section, consumed):
        for pos, it, line in list(self.positions(section)):
            key = (pos["part"], pos["line"], pos["measure"], pos["item"])
            if it["type"] == "ending" and key not in consumed:
                text = f"{it['number']}."
                kept = {k: it[k] for k in ("column", "words") if k in it}
                it.clear()
                it.update({"type": "unknown", "text": text, **kept})

    def check_repeat_signs(self):
        previous = None
        for section in self.sections:
            for part in section["body"]:
                if part["type"] != "music":
                    continue
                for line in part["lines"]:
                    if line["kind"] not in ("chart", "sung"):
                        continue
                    for m in line["measures"]:
                        kinds = [it["type"] for it in m["items"] if it["type"] in ("chord", "nochord", "repeat", "unknown")]
                        if "repeat" in kinds:
                            if previous is None:
                                self.diag("repeat-without-previous", line.get("_line", 1), "a % with no measure before it")
                            if len(kinds) > 1:
                                self.diag("repeat-beside-items", line.get("_line", 1), "a % beside other items has no defined meaning")
                        previous = m

    def result(self):
        self.diagnostics.sort(key=lambda d: d["line"])
        for b in self.blocks:
            b["voicings"].sort(key=lambda e: (e["symbol"], e["index"]))
        order = []
        for b in self.blocks:
            if b["tuning"]["id"] not in order:
                order.append(b["tuning"]["id"])
        indexed = list(enumerate(self.blocks))
        indexed.sort(key=lambda ib: (order.index(ib[1]["tuning"]["id"]), ib[1]["label"] != "", ib[0]))
        self.blocks = [b for _, b in indexed]
        return {
            "title": self.title,
            "properties": self.properties,
            "sections": self.sections,
            "blocks": self.blocks,
            "sung": self.sung,
            "sungAt": self.sung_at,
            "diagnostics": self.diagnostics,
        }


def _take_anchor(name: str):
    """Strip a trailing bar anchor and/or count from a heading, in either order (§1.7.4)."""
    anchor = None
    times = None
    while True:
        m = HEADING_ANCHOR.search(name)
        if m and anchor is None:
            anchor = int(m.group(1))
            name = name[: m.start()].strip(" ")
            continue
        m = HEADING_COUNT.search(name)
        if m and times is None and m.start() > 0:
            times = _count_times(COUNT.match(m.group(1)))
            name = name[: m.start()].strip(" ")
            continue
        break
    return name, anchor, times


def _is_chord_run(text: str, dialect: str) -> bool:
    """Every word is a chart item that is not an unknown token (§1.7.3)."""
    words = [w.rstrip(",;") for w in text.replace("|", " ").split(" ") if w]
    for w in words:
        if not w or BAR_ANCHOR.match(w) or COUNT.match(w):
            continue
        _, core, _ = _split_marks(w)
        if not core:
            continue
        if _classify_core(core, dialect)["type"] == "unknown":
            return False
    return True


def parse(text: str | bytes, dialect: str | None = None) -> dict:
    """Read a cifra.md document into its model (schema/cifra.schema.json)."""
    return _Parser(text, dialect).run()
