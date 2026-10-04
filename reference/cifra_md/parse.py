"""Reader for cifra.md documents (spec §1 to §7).

`parse(text)` returns a plain dict matching schema/cifra.schema.json.
"""

from __future__ import annotations

import re

from .chord import DEFAULT_DIALECT, DIALECTS, parse_chord
from .frets import check_fingers, parse_fingers, parse_frets
from .tuning import parse_tuning

RULE = re.compile(r"^\s*-{3,}\s*$")
FENCE = re.compile(r"^(`{3,}|~{3,})(.*)$")
MD_HEADING = re.compile(r"^(#{1,6})(?:[ \t]+(.*?))?[ \t]*$")
TITLE = re.compile(r"^#[ \t]+(.*?)[ \t]*$")
LIST_ITEM = re.compile(r"^[-*+][ \t]+(.*?)[ \t]*$")
PROPERTY = re.compile(r"^([A-Za-z0-9_-]+)[ \t]*:[ \t]*(.*)$")
BRACKET_HEADING = re.compile(r"^(\s*\[\s*([^\]]*?)\s*\]\s*)(.*)$")
LABEL_HEADING = re.compile(r"^(\s*([^\s:|]+):(?:[ \t]+|$))(.*)$")
HEADING_ANCHOR = re.compile(r"\s*@(\d+)\s*$")
BAR_ANCHOR = re.compile(r"^@(\d+)$")
COUNT = re.compile(r"^(?:[x×](\d+)|(\d+)[x×])$")
ENDING = re.compile(r"^(\d+)\.$")
CHORD_TOKEN = re.compile(r"^(.*?)(?:\[(\d+)\])?$")
LYRIC_MARKER = re.compile(r"^(\s*)>( ?)")
BARS = re.compile(r"(:)?(\|+)(:)?")
WORD = re.compile(r"\S+")

REPEAT = "%"
FINGERING = re.compile(r"^(.*?)\s*\(([^()]*)\)\s*$")


def key_for(symbol: str, index: int) -> str:
    return f"{symbol}[{index}]" if index > 1 else symbol


# --- tokens ------------------------------------------------------------------


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
    m = COUNT.match(core)
    if m:
        return {"type": "count", "times": int(m.group(1) or m.group(2))}
    m = ENDING.match(core)
    if m:
        return {"type": "ending", "number": int(m.group(1))}
    m = CHORD_TOKEN.match(core)
    symbol = m.group(1) or core
    index = int(m.group(2)) if m.group(2) else 1
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
            word = w.group(0)
            a = BAR_ANCHOR.match(word)
            if a:
                anchor = int(a.group(1))
                continue
            before, core, after = _split_marks(word)
            for k in range(len(before)):
                items.append({"type": "mark", "open": True, "notation": "bracket", "column": col + k})
            if core:
                item = _classify_core(core, dialect)
                item["column"] = col + len(before)
                items.append(item)
            for k in range(len(after)):
                items.append({"type": "mark", "open": False, "notation": "bracket", "column": col + len(before) + len(core) + k})
        close_mark = None
        if bar is not None and bar.group(1):
            close_mark = {"type": "mark", "open": False, "notation": "barline", "column": bar.start(1)}

        substantive = any(it["type"] in ("chord", "nochord", "repeat", "unknown") for it in items)
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
    raw = raw.rstrip()
    forced = bool(LYRIC_MARKER.match(raw))
    body = _strip_marker(raw) if forced else raw
    scan = scan_line(body, dialect)
    items = [it for m in scan["measures"] for it in m["items"]]
    words = [it for it in items if it["type"] in ("chord", "nochord", "unknown")]
    chords = [it for it in words if it["type"] in ("chord", "nochord")]
    if not items and scan["trailing"] is None and not body.strip():
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
    def __init__(self, text: str, dialect: str | None):
        text = text.lstrip("﻿")
        self.lines = [ln[:-1] if ln.endswith("\r") else ln for ln in text.split("\n")]
        self.diagnostics = []
        self.title = None
        self.properties = {}
        self.sections = []
        self.blocks = []
        self.dialect_override = dialect

    def diag(self, code, line, message, text=None):
        d = {"code": code, "message": message, "line": line}
        if text is not None:
            d["text"] = text
        self.diagnostics.append(d)

    # metadata ------------------------------------------------------------
    def read_metadata(self) -> int:
        i = 0
        n = len(self.lines)
        while i < n and not self.lines[i].strip():
            i += 1
        if i < n:
            m = TITLE.match(self.lines[i])
            if m:
                self.title = m.group(1)
                i += 1
        j = i
        while j < n:
            ln = self.lines[j]
            if not ln.strip():
                j += 1
                continue
            m = LIST_ITEM.match(ln)
            if not m:
                break
            pm = PROPERTY.match(m.group(1))
            if pm:
                self.properties[pm.group(1).lower()] = pm.group(2).strip()
            else:
                self.diag("bad-property", j + 1, "a property is `key: value`", ln)
            i = j + 1
            j += 1
        return i

    # sections ------------------------------------------------------------
    def new_section(self, name, heading):
        name, anchor = _take_anchor(name)
        section = {"name": name, "heading": heading, "anchor": anchor, "body": [], "groups": []}
        self.sections.append(section)
        return section

    def run(self):
        start = self.read_metadata()
        dialect = self.dialect_override or self.properties.get("notation", DEFAULT_DIALECT)
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
                fm = FENCE.match(raw)
                if fm and fm.group(1)[0] == fence[0] and len(fm.group(1)) >= fence[1] and not fm.group(2).strip():
                    fence = None
                    part = None
                    continue
                # inside a fence: cifra-style headings open sections
                bm = BRACKET_HEADING.match(raw)
                if bm and bm.group(2) and not bm.group(2).isdigit():
                    section = self.new_section(bm.group(2), "bracket")
                    part = {"type": "music", "raw": []}
                    section["body"].append(part)
                    if bm.group(3).strip():
                        part["raw"].append((lineno, bm.group(3)))
                    continue
                lm = LABEL_HEADING.match(raw)
                if lm and lm.group(2) and _is_chord_run(lm.group(3), dialect):
                    section = self.new_section(lm.group(2), "label")
                    part = {"type": "music", "raw": []}
                    section["body"].append(part)
                    if lm.group(3).strip():
                        part["raw"].append((lineno, lm.group(3)))
                    continue
                part["raw"].append((lineno, raw))
                continue

            fm = FENCE.match(raw)
            if fm:
                fence = (fm.group(1)[0], len(fm.group(1)), lineno)
                part = {"type": "music", "raw": []}
                section["body"].append(part)
                continue
            if RULE.match(raw):
                in_voicings = True
                part = None
                continue
            hm = MD_HEADING.match(raw)
            if hm:
                section = self.new_section(hm.group(2) or "", "markdown")
                part = None
                continue
            # notes
            if part is None or part["type"] != "notes":
                part = {"type": "notes", "raw": []}
                section["body"].append(part)
            part["raw"].append(raw)

        if fence is not None:
            self.diag("unclosed-fence", fence[2], "a fence was opened and never closed")

        self.finish_sections()
        return self.result()

    # voicings part ------------------------------------------------------------
    def voicings_line(self, raw, lineno, block, skipping):
        if not raw.strip() or RULE.match(raw):
            return block, skipping
        hm = MD_HEADING.match(raw)
        if hm:
            text = hm.group(2) or ""
            label, sep, tuning_text = text.partition(":")
            label = label.strip()
            tuning_text = tuning_text.strip()
            if not sep or not label or not tuning_text:
                self.diag("bad-block-heading", lineno, "a block heading is `## Label: tuning`", raw)
                return None, True
            try:
                tuning = parse_tuning(tuning_text)
            except ValueError:
                self.diag("bad-block-heading", lineno, f"not a tuning: {tuning_text!r}", raw)
                return None, True
            name = "" if label.lower() == "voicings" else label
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
                self.diag("item-outside-block", lineno, "a voicing before any block heading", raw)
                return block, skipping
            key, sep, frets_text = lm.group(1).partition(":")
            key = key.strip()
            if not sep or not key or any(ch.isspace() for ch in key):
                self.diag("bad-voicing", lineno, "a voicing is `- key: frets`", raw)
                return block, skipping
            fingers_text = None
            fm = FINGERING.match(frets_text)
            if fm:
                frets_text, fingers_text = fm.group(1), fm.group(2)
            frets = parse_frets(frets_text)
            if frets is None:
                self.diag("bad-voicing", lineno, f"not a fret string: {frets_text.strip()!r}", raw)
                return block, skipping
            if len(frets) != len(block["tuning"]["pitches"]):
                self.diag("bad-voicing", lineno, f"{len(frets)} frets for {len(block['tuning']['pitches'])} strings", raw)
                return block, skipping
            m = CHORD_TOKEN.match(key)
            symbol = m.group(1) or key
            index = int(m.group(2)) if m.group(2) else 1
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
            self.diag("notes-outside-block", lineno, "text in the voicings part before any block; dropped", raw)
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
        for part in shaped:
            shapes = part["shapes"]
            for i, sh in enumerate(shapes):
                if sh["kind"] == "forced":
                    sung = True
                if sh["kind"] == "chords" and i + 1 < len(shapes) and shapes[i + 1]["kind"] == "prose" and shapes[i + 1]["words"] >= 2:
                    sung = True
        self.sung = sung

        kept_sections = []
        for section in self.sections:
            body = []
            for part in section["body"]:
                if part["type"] == "notes":
                    lines = part["raw"]
                    while lines and not lines[0].strip():
                        lines.pop(0)
                    while lines and not lines[-1].strip():
                        lines.pop()
                    if lines:
                        body.append({"type": "notes", "text": "\n".join(lines)})
                else:
                    lines = self.assemble(part, sung)
                    if lines:
                        body.append({"type": "music", "lines": lines})
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

    def assemble(self, part, sung):
        shapes = part["shapes"]
        raws = part["raw"]
        out = []
        blanks = 0
        prev_sung = False
        i = 0
        while i < len(shapes):
            sh = shapes[i]
            lineno = raws[i][0]
            if sh["kind"] == "blank":
                blanks += 1
                i += 1
                continue
            if not sung:
                line = self.chart_line(sh)
                if line is not None:
                    line["_line"] = lineno
                    out.append(line)
                i += 1
                continue
            nxt = shapes[i + 1] if i + 1 < len(shapes) else None
            paired = sh["kind"] == "chords" and nxt is not None and nxt["kind"] in ("prose", "forced")
            sings = paired or sh["kind"] in ("prose", "forced")
            if blanks > 0 and prev_sung and sings:
                out.append({"kind": "break"})
            blanks = 0
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
                if line is not None:
                    line["_line"] = lineno
                    out.append(line)
                i += 1
            prev_sung = sings
        return out

    def chart_line(self, sh):
        scan = sh["scan"]
        if not scan["measures"]:
            if scan["trailing"] is None:
                return None
            return {"kind": "chart", "measures": [], "closeBar": None, "_anchor_only": scan["trailing"]}
        for m in scan["measures"]:
            for it in m["items"]:
                it.pop("column", None)
        line = {"kind": "chart", "measures": scan["measures"], "closeBar": scan["closeBar"]}
        if scan["trailing"] is not None:
            line["measures"][-1]["_trailing"] = scan["trailing"]
        return line

    def sung_line(self, sh, nxt):
        scan = sh["scan"]
        words = nxt["body"]
        measures = scan["measures"]
        items = [it for m in measures for it in m["items"]]
        for k, it in enumerate(items):
            end = items[k + 1]["column"] if k + 1 < len(items) else len(words)
            it["words"] = words[it["column"] : end] if it["column"] < len(words) else ""
        if items:
            lead = words[: items[0]["column"]]
            if lead.strip():
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
                    if line["kind"] != "chart":
                        continue
                    for m in line["measures"]:
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
                it.clear()
                it.update({"type": "unknown", "text": text})

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
            "diagnostics": self.diagnostics,
        }


def _take_anchor(name: str):
    m = HEADING_ANCHOR.search(name)
    if not m:
        return name, None
    return name[: m.start()].strip(), int(m.group(1))


def _is_chord_run(text: str, dialect: str) -> bool:
    words = text.replace("|", " ").split()
    for w in words:
        _, core, _ = _split_marks(w)
        if not core:
            continue
        m = CHORD_TOKEN.match(core)
        if parse_chord(m.group(1) or core, dialect)["chord"] is None:
            return False
    return True


def parse(text: str, dialect: str | None = None) -> dict:
    """Read a cifra.md document into its model (schema/cifra.schema.json)."""
    return _Parser(text, dialect).run()
