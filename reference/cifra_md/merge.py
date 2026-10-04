"""The three-way merge of songs and setlists (spec §11).

`merge(base, ours, theirs, setlist=False) -> Outcome`: each input is the
text (str or bytes) or None when absent. The outcome holds a `result`, or
`deleted`, or `conflicts` with, unless the only conflict is about the whole
file, a `marked` text. `conflicts_json(outcome)` gives the JSON of §11.12.5.
"""

from __future__ import annotations

import copy
import json
from collections import Counter
from dataclasses import dataclass, field

from .chord import DEFAULT_DIALECT, DIALECTS, parse_chord
from .frets import format_fingers, format_frets
from .layout import converge, lyric_text
from .parse import CHORD_TOKEN, ascii_lower, key_for, parse
from .text import NotUTF8Error, decode
from .write import (
    _chart_blocks,
    _collapse_blank_runs,
    canonical,
    fence,
    heading_line,
    heading_name,
    music_lines,
    serialize,
)

OURS, THEIRS = "ours", "theirs"
SIDES = (OURS, THEIRS)


def other(side: str) -> str:
    return THEIRS if side == OURS else OURS


class _Conflict:
    def __repr__(self):
        return "CONFLICT"


CONFLICT = _Conflict()


@dataclass
class Outcome:
    result: str | None = None
    deleted: bool = False
    conflicts: list = field(default_factory=list)
    marked: str | None = None
    kept: str | None = None  # for a `file` conflict, deleted against changed: the changed side's text

    @property
    def kind(self) -> str:
        if self.result is not None:
            return "result"
        if self.deleted:
            return "deleted"
        return "conflicts"


# --- values (§11.6) ------------------------------------------------------------------------


def merge_value(a, x, y):
    if x == y:
        return x
    if y == a:
        return x
    if x == a:
        return y
    return CONFLICT


# --- sequences (§11.5) -----------------------------------------------------------------------


@dataclass(eq=False)
class Change:
    side: str
    a: int
    b: int
    run: list

    @property
    def insertion(self) -> bool:
        return self.a == self.b


def align(A, C, match):
    """The alignment of §11.5.1, as a list of steps ("pair", i, j),
    ("drop", i, None) and ("take", i, j), where i is the base position."""
    n, m = len(A), len(C)
    M = [[bool(match(A[i], C[j])) for j in range(m)] for i in range(n)]
    L = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        row, below = L[i], L[i + 1]
        for j in range(m - 1, -1, -1):
            row[j] = 1 + below[j + 1] if M[i][j] else max(below[j], row[j + 1])
    steps = []
    i = j = 0
    while i < n or j < m:
        if i < n and j < m and M[i][j]:
            steps.append(("pair", i, j))
            i += 1
            j += 1
        elif j == m or (i < n and L[i + 1][j] >= L[i][j + 1]):
            steps.append(("drop", i, None))
            i += 1
        else:
            steps.append(("take", i, j))
            j += 1
    return steps


def pairs_of(steps) -> dict:
    return {i: j for k, i, j in steps if k == "pair"}


def side_changes(side, A, C, steps, other_pairs, same) -> list[Change]:
    """The changes of one side (§11.5.2)."""
    changes: list[Change] = []
    start = None
    drops: list[int] = []
    takes: list[int] = []

    def flush():
        if start is None:
            return
        run = [C[j] for j in takes]
        if len(drops) == len(run) and run:
            for k in range(len(run)):
                changes.append(Change(side, start + k, start + k + 1, [run[k]]))
        else:
            changes.append(Change(side, start, start + len(drops), run))

    for kind, i, j in steps:
        if kind == "pair":
            flush()
            start, drops, takes = None, [], []
            continue
        if start is None:
            start = i
        if kind == "drop":
            drops.append(i)
        else:
            takes.append(j)
    flush()
    for i, j in pairs_of(steps).items():
        if i not in other_pairs and not same(A[i], C[j]):
            changes.append(Change(side, i, i + 1, [C[j]]))
    changes.sort(key=lambda c: (c.a, c.b))
    return changes


def touch(c: Change, d: Change) -> bool:
    if c.insertion and d.insertion:
        return c.a == d.a
    if c.insertion:
        return d.a < c.a < d.b
    if d.insertion:
        return c.a < d.a < c.b
    return c.a < d.b and d.a < c.b


# Pieces of a merged sequence:
#   ("both", base, ours, theirs)     an element in both
#   ("one", side, element)           from a change of one side applied on its own
#   ("common", ours, theirs)         taken once: an identical change, or a common prefix or suffix
#   ("paired", base|None, ours, theirs)  paired in a cluster (§11.5.4), merged as in both
#   ("conflict", base_run, ours_run, theirs_run)
#   ("combined", element)            from a combined cluster


def merge_sequence(A, O, T, match, same, equal, policy="conflict", pairing=False, sort_key=None, identity=None):
    so, st = align(A, O, match), align(A, T, match)
    po, pt = pairs_of(so), pairs_of(st)
    co = side_changes(OURS, A, O, so, pt, same)
    ct = side_changes(THEIRS, A, T, st, po, same)
    ident: dict[Change, Change] = {}
    for c in co:
        for d in ct:
            if c.a == d.a and c.b == d.b and len(c.run) == len(d.run) and all(equal(x, y) for x, y in zip(c.run, d.run)):
                ident[c], ident[d] = d, c
    rest = [c for c in co + ct if c not in ident]
    # clusters
    parent = {id(c): c for c in rest}

    def find(c):
        while parent[id(c)] is not c:
            c = parent[id(c)]
        return c

    for c in rest:
        for d in rest:
            if c.side == OURS and d.side == THEIRS and touch(c, d):
                rc, rd = find(c), find(d)
                if rc is not rd:
                    parent[id(rd)] = rc
    groups: dict[int, list[Change]] = {}
    for c in rest:
        groups.setdefault(id(find(c)), []).append(c)
    clusters = [g for g in groups.values() if len(g) >= 2]
    member = {id(c): k for k, g in enumerate(clusters) for c in g}
    moved = True
    while moved:
        moved = False
        for k, g in enumerate(clusters):
            if not g:
                continue
            lo, hi = min(c.a for c in g), max(c.b for c in g)
            for c in rest:
                if c.insertion and lo < c.a < hi and member.get(id(c)) != k:
                    if id(c) in member:
                        other_k = member[id(c)]
                        for e in clusters[other_k]:
                            member[id(e)] = k
                        g.extend(clusters[other_k])
                        clusters[other_k] = []
                    else:
                        g.append(c)
                        member[id(c)] = k
                    moved = True
    clusters = [g for g in clusters if g]
    member = {id(c): g for g in clusters for c in g}
    spans = {id(g): (min(c.a for c in g), max(c.b for c in g)) for g in clusters}
    empty_at = {spans[id(g)][0]: g for g in clusters if spans[id(g)][0] == spans[id(g)][1]}
    starts_at = {spans[id(g)][0]: g for g in clusters if spans[id(g)][0] < spans[id(g)][1]}
    inserts = {(c.side, c.a): c for c in co + ct if c.insertion}
    nonempty = {(c.side, c.a): c for c in co + ct if not c.insertion}
    side_of = {OURS: (O, po), THEIRS: (T, pt)}

    def side_run(side, g, lo, hi):
        C, pairs = side_of[side]
        mine = {c.a: c for c in g if c.side == side and c.insertion}
        run = []
        p = lo
        while p <= hi:
            if p in mine:
                run.extend(mine[p].run)
            if p == hi:
                break
            c = nonempty.get((side, p))
            if c is not None:
                run.extend(c.run)
                p = c.b
                continue
            run.append(C[pairs[p]])
            p += 1
        return run

    def settle(g):
        lo, hi = spans[id(g)]
        X, Y, B = side_run(OURS, g, lo, hi), side_run(THEIRS, g, lo, hi), A[lo:hi]
        if policy == "combine":
            return [("combined", e) for e in combine(X, Y, equal, sort_key, identity)]
        k = 0
        while k < min(len(X), len(Y)) and equal(X[k], Y[k]):
            k += 1
        s = 0
        while s < min(len(X), len(Y)) - k and equal(X[len(X) - 1 - s], Y[len(Y) - 1 - s]):
            s += 1
        pre = [("common", X[q], Y[q]) for q in range(k)]
        post = [("common", X[len(X) - s + q], Y[len(Y) - s + q]) for q in range(s)]
        Xr, Yr = X[k : len(X) - s], Y[k : len(Y) - s]
        mid = []
        if Xr or Yr:
            if pairing and len(Xr) == len(Yr) and all(match(x, y) for x, y in zip(Xr, Yr)):
                for q in range(len(Xr)):
                    b = None
                    if len(B) == len(Xr) and all(match(B[r], Xr[r]) and match(B[r], Yr[r]) for r in range(len(B))):
                        b = B[q]
                    mid.append(("paired", b, Xr[q], Yr[q]))
            else:
                mid.append(("conflict", B, Xr, Yr))
        return pre + mid + post

    def apply(c):
        if c in ident:
            o, t = (c, ident[c]) if c.side == OURS else (ident[c], c)
            return [("common", x, y) for x, y in zip(o.run, t.run)]
        return [("one", c.side, x) for x in c.run]

    pieces = []
    n = len(A)
    p = 0
    while True:
        if p in empty_at:
            pieces.extend(settle(empty_at[p]))
        done = set()
        for side in SIDES:
            c = inserts.get((side, p))
            if c is not None and id(c) not in member and id(c) not in done:
                pieces.extend(apply(c))
                done.add(id(c))
                if c in ident:
                    done.add(id(ident[c]))
        if p >= n:
            break
        if p in starts_at:
            g = starts_at[p]
            pieces.extend(settle(g))
            p = spans[id(g)][1]
            continue
        c = nonempty.get((OURS, p)) or nonempty.get((THEIRS, p))
        if c is not None:
            assert id(c) not in member
            pieces.extend(apply(c))
            p = c.b
            continue
        pieces.append(("both", A[p], O[po[p]], T[pt[p]]))
        p += 1
    return pieces


def combine(X, Y, equal, sort_key, identity):
    """Combining two runs (§11.5.4)."""
    if len(X) == len(Y) and all(equal(x, y) for x, y in zip(X, Y)):
        return list(X)
    kx, ky = [sort_key(x) for x in X], [sort_key(y) for y in Y]
    first, second = (X, Y) if kx <= ky else (Y, X)
    seen = {identity(e) for e in first}
    return list(first) + [e for e in second if identity(e) not in seen]


def keyed_order(B, O, T, in_result, sort_key):
    """The order of a keyed list (§11.5.5): identities, in merged order."""
    eq = lambda x, y: x == y
    pieces = merge_sequence(B, O, T, eq, eq, eq, "combine", sort_key=sort_key, identity=lambda x: x)
    seq = []
    for pc in pieces:
        el = pc[1] if pc[0] in ("both", "common", "combined") else pc[2]
        if el in in_result and el not in seq:
            seq.append(el)
    for el in sorted((e for e in in_result if e not in seq), key=sort_key):
        holder = O if el in O else T
        pos = 0
        for prev in reversed(holder[: holder.index(el)]):
            if prev in seq:
                pos = seq.index(prev) + 1
                break
        seq.insert(pos, el)
    return seq


# --- conflicts ---------------------------------------------------------------------------------

MEMBERS = (
    "kind", "line", "deleted", "unreadable", "item", "occurrence", "after",
    "tuning", "variation", "key", "changed", "symbols", "base", "ours", "theirs",
)


def conflict_json(c: dict) -> dict:
    return {k: c[k] for k in MEMBERS if k in c and c[k] is not None}


def conflicts_json(outcome: Outcome) -> str:
    """The conflicts as JSON (§11.12.5), as the corpus writes it."""
    data = {"conflicts": [conflict_json(c) for c in outcome.conflicts]}
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


class Marker(str):
    """The `<<<<<<< ours` line of a region, carrying its conflict."""

    def __new__(cls, conflict):
        s = super().__new__(cls, "<<<<<<< ours")
        s.conflict = conflict
        return s


MID = "======="
END = ">>>>>>> theirs"


def region(conflict, ours_lines, theirs_lines) -> list[str]:
    return [Marker(conflict), *ours_lines, MID, *theirs_lines, END]


def finish_marked(blocks: list[list[str]], conflicts: list[dict]) -> str:
    """Join the blocks, number each region's first line, order the conflicts."""
    lines = []
    for k, b in enumerate(blocks):
        if k:
            lines.append("")
        lines.extend(b)
    for n, ln in enumerate(lines, 1):
        if isinstance(ln, Marker):
            ln.conflict["line"] = n
    conflicts.sort(key=lambda c: c.get("line", 0))
    return "\n".join(str(x) for x in lines) + "\n" if lines else ""


# --- whole files (§11.4) and the method (§11.2) ---------------------------------------------------


def canonical_song(text: str) -> str:
    return serialize(canonical(parse(text)))


def merge(base, ours, theirs, setlist: bool = False) -> Outcome:
    """Merge three versions of a file (§11.2). Each is str, bytes, or None
    for an absent input."""
    from .setlist import canonicalise_setlist

    raw = {"base": base, "ours": ours, "theirs": theirs}
    texts = {}
    unreadable = []
    for name, t in raw.items():
        if isinstance(t, bytes):
            try:
                t = decode(t)
            except NotUTF8Error:
                unreadable.append(name)
                continue
        texts[name] = t
    if unreadable:
        return Outcome(conflicts=[{"kind": "file", "unreadable": unreadable}])
    canon = canonicalise_setlist if setlist else canonical_song
    b, o, t = (None if texts[k] is None else canon(texts[k]) for k in ("base", "ours", "theirs"))
    if b is None:
        if o is None and t is None:
            return Outcome(deleted=True)
        if o is None:
            return Outcome(result=t)
        if t is None:
            return Outcome(result=o)
        b = ""
    else:
        if o is None and t is None:
            return Outcome(deleted=True)
        if o is None:
            return Outcome(deleted=True) if t == b else Outcome(conflicts=[{"kind": "file", "deleted": OURS}], kept=t)
        if t is None:
            return Outcome(deleted=True) if o == b else Outcome(conflicts=[{"kind": "file", "deleted": THEIRS}], kept=o)
    if o == t:
        return Outcome(result=o)
    if b == o:
        return Outcome(result=t)
    if b == t:
        return Outcome(result=o)
    if setlist:
        from .setlist_merge import merge_setlists

        return merge_setlists(b, o, t)
    return SongMerge(b, o, t).run()


# --- songs: the pieces of a version ------------------------------------------------------------------


def dialect_of(props: list[dict]) -> str:
    for p in props:
        if p["key"] == "notation":
            d = ascii_lower(p["value"].strip(" "))
            return d if d in DIALECTS else DEFAULT_DIALECT
    return DEFAULT_DIALECT


def chords_of(line: dict) -> list[dict]:
    return [it for m in line.get("measures", []) for it in m["items"] if it["type"] == "chord"]


def kt(item: dict) -> tuple:
    """A chord occurrence's key as (symbol, index)."""
    return (item["symbol"], item["index"])


def key_text(k) -> str | None:
    return None if k is None else key_for(k[0], k[1])


def masked_line(line: dict) -> dict:
    line = copy.deepcopy(line)
    for it in chords_of(line):
        it["index"] = 1
        it["key"] = it["symbol"]
    return line


@dataclass(eq=False)
class Unit:
    version: str
    kind: tuple
    text: str
    masked: str
    line: dict | None = None
    chords: list = field(default_factory=list)


def units_of(section: dict, dialect: str, version: str) -> list[Unit]:
    """The units of a section's body (§11.8.1)."""
    out = []
    for part in section["body"]:
        if part["type"] == "notes":
            for ln in part["text"].split("\n"):
                out.append(Unit(version, ("notes",), ln, ln))
        elif part["type"] == "verbatim":
            info = part["info"]
            out.append(Unit(version, ("fence", info), "```" + info, "```" + info))
            for ln in part["text"].split("\n"):
                out.append(Unit(version, ("verbatim", info), ln, ln))
        else:
            out.append(Unit(version, ("fence", ""), "```", "```"))
            for line in part["lines"]:
                text = "\n".join(music_lines([line], dialect))
                masked = "\n".join(music_lines([masked_line(line)], dialect))
                out.append(Unit(version, ("music", line["kind"]), text, masked, line, chords_of(line)))
    return out


def heading_of(section: dict) -> tuple:
    return (section["heading"] or "none", section["name"], section["anchor"], section.get("times"))


NO_HEADING = (None, None, None, None)


def heading_text_line(h: tuple) -> str | None:
    """A heading's line (§8.4.3), or None for a section with no heading."""
    form, name, anchor, times = h
    s = {"name": name or "", "anchor": anchor, "times": times}
    if form == "markdown":
        return heading_line(2, heading_name(s))
    if form == "bracket":
        return f"[{heading_name(s)}]"
    if form == "label":
        return f"{name}:"
    return None


@dataclass(eq=False)
class Sec:
    version: str
    model: dict
    heading: tuple
    units: list


def unit_match(u: Unit, v: Unit) -> bool:
    return u.kind == v.kind and u.masked == v.masked


def sec_match(b: Sec, s: Sec) -> bool:
    if b.heading == s.heading:
        return True
    return len(b.units) >= 1 and len(b.units) == len(s.units) and all(unit_match(x, y) for x, y in zip(b.units, s.units))


def sec_equal(o: Sec, t: Sec) -> bool:
    return o.heading == t.heading and len(o.units) == len(t.units) and all(unit_match(x, y) for x, y in zip(o.units, t.units))


class Version:
    def __init__(self, name: str, text: str):
        self.name = name
        self.text = text
        self.doc = parse(text)
        self.dialect = dialect_of(self.doc["properties"])
        self.props = {p["key"]: p["value"] for p in self.doc["properties"]}
        self.prop_order = [p["key"] for p in self.doc["properties"]]
        self.secs = [Sec(name, s, heading_of(s), units_of(s, self.dialect, name)) for s in self.doc["sections"]]
        self.keys = {kt(it) for s in self.secs for u in s.units for it in u.chords}
        self.blocks = self.doc["blocks"]


# --- footnote keys (§11.9.2) -----------------------------------------------------------------


class KeyMatch:
    def __init__(self, base_keys, side_keys, corr):
        self.match: dict = {}
        self.mu: dict = {}
        counts = Counter((b, v) for b, v in corr)
        with_occ_b = {b for b, _ in corr}
        with_occ_v = {v for _, v in corr}
        symbols = sorted({k[0] for k in base_keys | side_keys})
        for sym in symbols:
            while True:
                best = None
                for (b, v), n in counts.items():
                    if b[0] != sym or b in self.match or v in self.mu:
                        continue
                    cand = (-n, b[1] != v[1], b[1], v[1])
                    if best is None or cand < best[0]:
                        best = (cand, b, v)
                if best is None:
                    break
                self.match[best[1]] = best[2]
                self.mu[best[2]] = best[1]
            indices = sorted({k[1] for k in base_keys | side_keys if k[0] == sym})
            for i in indices:
                k = (sym, i)
                if (
                    k in base_keys
                    and k in side_keys
                    and k not in self.match
                    and k not in self.mu
                    and k not in with_occ_b
                    and k not in with_occ_v
                ):
                    self.match[k] = k
                    self.mu[k] = k


# --- the song merge ------------------------------------------------------------------------------


class SongMerge:
    def __init__(self, b: str, o: str, t: str):
        self.v = {"base": Version("base", b), OURS: Version(OURS, o), THEIRS: Version(THEIRS, t)}
        self.conflicts: list[dict] = []

    # same, for units and sections, needs the key matching (§11.9.3)
    def unit_same(self, b: Unit, s: Unit) -> bool:
        if not unit_match(b, s):
            return False
        km = self.km[s.version]
        return all(km.match.get(kt(x)) == kt(y) for x, y in zip(b.chords, s.chords))

    def sec_same(self, b: Sec, s: Sec) -> bool:
        return (
            b.heading == s.heading
            and len(b.units) == len(s.units)
            and all(self.unit_same(x, y) for x, y in zip(b.units, s.units))
        )

    def run(self) -> Outcome:
        B, O, T = self.v["base"], self.v[OURS], self.v[THEIRS]
        # Key matching: corresponding occurrences in units paired within paired sections.
        self.km = {}
        for side in SIDES:
            V = self.v[side]
            corr = []
            for i, j in pairs_of(align(B.secs, V.secs, sec_match)).items():
                bu, vu = B.secs[i].units, V.secs[j].units
                for p, q in pairs_of(align(bu, vu, unit_match)).items():
                    corr.extend((kt(x), kt(y)) for x, y in zip(bu[p].chords, vu[q].chords))
            self.km[side] = KeyMatch(B.keys, V.keys, corr)

        self.merge_metadata()
        self.merge_chart()
        self.assign_variants()
        self.reading_conflicts()
        self.merge_blocks()
        self.sections_out = self.merged_sections()
        if not self.conflicts:
            return Outcome(result=self.result())
        marked = self.marked()
        return Outcome(conflicts=self.conflicts, marked=marked)

    # --- metadata (§11.7) ---
    def merge_metadata(self):
        B, O, T = self.v["base"], self.v[OURS], self.v[THEIRS]
        self.title = merge_value(B.doc["title"], O.doc["title"], T.doc["title"])
        self.title_conflict = None
        if self.title is CONFLICT:
            self.title_conflict = {"kind": "title", "base": B.doc["title"], "ours": O.doc["title"], "theirs": T.doc["title"]}
            self.conflicts.append(self.title_conflict)
        keys = set(B.props) | set(O.props) | set(T.props)
        self.prop_in = set()
        self.prop_value = {}
        self.prop_conflict = {}
        for k in keys:
            a, x, y = B.props.get(k), O.props.get(k), T.props.get(k)
            if a is None or (x is not None and y is not None):
                self.prop_in.add(k)
                val = merge_value(a, x, y)
                if val is CONFLICT:
                    self.prop_conflict[k] = {"kind": "property", "key": k, "base": a, "ours": x, "theirs": y}
                self.prop_value[k] = val
            elif x is None and y is None:
                continue
            else:
                kept = x if x is not None else y
                if kept != a:
                    self.prop_in.add(k)
                    self.prop_value[k] = CONFLICT
                    self.prop_conflict[k] = {"kind": "property", "key": k, "base": a, "ours": x, "theirs": y}

    def property_order(self):
        B, O, T = self.v["base"], self.v[OURS], self.v[THEIRS]
        return keyed_order(B.prop_order, O.prop_order, T.prop_order, self.prop_in, lambda k: k)

    # --- the chart (§11.8) ---
    def merge_chart(self):
        B, O, T = self.v["base"], self.v[OURS], self.v[THEIRS]
        pieces = merge_sequence(B.secs, O.secs, T.secs, sec_match, self.sec_same, sec_equal, "conflict", pairing=True)
        self.chart = []  # merged sections, see below
        for pc in pieces:
            kind = pc[0]
            if kind in ("both", "paired"):
                self.chart.append(self.merge_section(pc[1], pc[2], pc[3]))
            elif kind == "one":
                sec = pc[2]
                self.chart.append({"type": "section", "base": None, "heading": sec.heading, "hconflict": None,
                                   "sides": {pc[1]: sec.heading}, "body": [("one", pc[1], u) for u in sec.units]})
            elif kind == "common":
                o, t = pc[1], pc[2]
                self.chart.append({"type": "section", "base": None, "heading": o.heading, "hconflict": None,
                                   "sides": {}, "body": [("common", x, y) for x, y in zip(o.units, t.units)]})
            else:
                self.chart.append({"type": "conflict", "base": pc[1], OURS: pc[2], THEIRS: pc[3]})

    def merge_section(self, b: Sec | None, o: Sec, t: Sec) -> dict:
        bh = b.heading if b is not None else NO_HEADING
        fields = [merge_value(bh[k], o.heading[k], t.heading[k]) for k in range(4)]
        hconflict = None
        if any(f is CONFLICT for f in fields):
            def side_heading(s):
                return tuple(s.heading[k] if fields[k] is CONFLICT else fields[k] for k in range(4))

            hconflict = {"kind": "heading", "base": heading_text_line(bh) if b is not None else None,
                         "_ours": side_heading(o), "_theirs": side_heading(t)}
            hconflict["ours"] = heading_text_line(hconflict["_ours"])
            hconflict["theirs"] = heading_text_line(hconflict["_theirs"])
        body = merge_sequence(b.units if b is not None else [], o.units, t.units, unit_match, self.unit_same, unit_match, "conflict")
        return {"type": "section", "base": b, "heading": tuple(fields), "hconflict": hconflict,
                "sides": {OURS: o.heading, THEIRS: t.heading}, "body": body}

    # --- footnote markers (§11.9) ---
    def occurrences(self):
        """Every unit of the merged chart as a piece, in order, the units of a
        conflict region as pieces ("one", side, unit): ours's, then theirs's.
        A piece's unit, whose chords are realised, is always its third member."""
        for ms in self.chart:
            if ms["type"] == "conflict":
                for side in SIDES:
                    for sec in ms[side]:
                        for u in sec.units:
                            yield ("one", side, u)
                continue
            for pc in ms["body"]:
                if pc[0] == "conflict":
                    for u in pc[2]:
                        yield ("one", OURS, u)
                    for u in pc[3]:
                        yield ("one", THEIRS, u)
                else:
                    yield pc

    def sigs_for(self, pc):
        """Rules 1 and 2 of §11.9.4; rule 3 is left as None for later."""
        kind = pc[0]
        if kind in ("both", "paired"):
            b, o, t = pc[1], pc[2], pc[3]
            n = len(o.chords)
            bk = [kt(x) for x in b.chords] if b is not None else [None] * n
            return [(bk[k], kt(o.chords[k]), kt(t.chords[k])) for k in range(n)], 1
        if kind == "common":
            o, t = pc[1], pc[2]
            out = []
            for x, y in zip(o.chords, t.chords):
                mo, mt = self.km[OURS].mu.get(kt(x)), self.km[THEIRS].mu.get(kt(y))
                out.append((mo if mo == mt else None, kt(x), kt(y)))
            return out, 2
        return None, 3

    def assign_variants(self):
        # Occurrences under rules 1 and 2, by their key on each side, for rule 3.
        rule1_by_side_key = {OURS: {}, THEIRS: {}}
        units = list(self.occurrences())
        sigs: list = [None] * len(units)
        for n, pc in enumerate(units):
            s, rule = self.sigs_for(pc)
            sigs[n] = s
            if rule in (1, 2):
                for k, sg in enumerate(s):
                    for side, pos in ((OURS, 1), (THEIRS, 2)):
                        rule1_by_side_key[side].setdefault(sg[pos], []).append((n, k, sg))
        for n, pc in enumerate(units):
            if sigs[n] is not None:
                continue
            side, u = pc[1], pc[2]
            V, W = self.km[side], self.km[other(side)]
            out = []
            for it in u.chords:
                v = kt(it)
                b = V.mu.get(v)
                if b is not None:
                    w = W.match.get(b)
                    out.append((b, v, w) if side == OURS else (b, w, v))
                    continue
                found = rule1_by_side_key[side].get(v)
                if found:
                    counts = Counter(sg for _, _, sg in found)
                    firsts = {}
                    for nn, kk, sg in found:
                        firsts.setdefault(sg, (nn, kk))
                    best = max(counts, key=lambda sg: (counts[sg], tuple(-x for x in firsts[sg])))
                    out.append(best)
                    continue
                # A chord neither side had in base, written bare on both: one decision.
                w = v if v[1] == 1 and v in self.v[other(side)].keys and v not in W.mu else None
                out.append((None, v, w) if side == OURS else (None, w, v))
            sigs[n] = out
        first = {}
        pos = 0
        for n, pc in enumerate(units):
            for k, it in enumerate(pc[2].chords):
                key = (it["symbol"], sigs[n][k])
                first.setdefault(key, pos)
                pos += 1
        self.unit_sigs = {}
        for n, pc in enumerate(units):
            self.unit_sigs[self.piece_id(pc)] = sigs[n]
        self.vindex = {}
        by_symbol: dict[str, list] = {}
        for key in first:
            by_symbol.setdefault(key[0], []).append(key)
        for sym, keys in by_symbol.items():
            keys.sort(key=lambda key: (sorted((k[1] for k in key[1] if k is not None), reverse=True), first[key]))
            for i, key in enumerate(keys, 1):
                self.vindex[key] = i
        # Keys used only by unknown tokens are not markers: identified by their
        # text in every version alike (§11.9.1), each is a variant of its own.
        self.fixed = {}
        for pc in units:
            line = pc[2].line
            if line is None:
                continue
            for m in line.get("measures", []):
                for it in m["items"]:
                    if it["type"] != "unknown":
                        continue
                    t = it["text"]
                    cm = CHORD_TOKEN.match(t)
                    sym = cm.group(1) or t
                    k = (sym, max(int(cm.group(2)), 1) if cm.group(2) else 1)
                    if key_for(*k) == t:
                        self.fixed[(sym, (k, k, k))] = k
        self.variants = sorted(self.vindex, key=lambda key: (key[0], self.vindex[key]))
        self.variants += sorted(self.fixed, key=lambda key: self.fixed[key])

    @staticmethod
    def piece_id(pc):
        if pc[0] == "one":
            return ("one", id(pc[2]))
        return (pc[0], id(pc[2]))

    def variant_key(self, symbol, sig) -> tuple:
        if (symbol, sig) in self.fixed:
            return self.fixed[(symbol, sig)]
        return (symbol, self.vindex[(symbol, sig)])

    # --- reading (§11.7.2) ---
    def applied_units(self, side):
        for ms in self.chart:
            if ms["type"] != "section":
                continue
            for pc in ms["body"]:
                if pc[0] == "one" and pc[1] == side and pc[2].kind[0] == "music":
                    yield pc[2]

    def reading_conflicts(self):
        B = self.v["base"]
        self.reading = {}
        for prop in ("notation", "words"):
            a = B.props.get(prop)
            for side in SIDES:
                V, W = self.v[side], self.v[other(side)]
                x, y = V.props.get(prop), W.props.get(prop)
                if x == a or y != a:
                    continue
                applied = list(self.applied_units(other(side)))
                if prop == "notation":
                    dv, db = dialect_of(V.doc["properties"]), dialect_of(B.doc["properties"])
                    if dv == db or dialect_of(W.doc["properties"]) != db:
                        continue
                    symbols = []
                    for u in applied:
                        for it in u.chords:
                            s = it["symbol"]
                            if s not in symbols and parse_chord(s, dv)["chord"] != parse_chord(s, db)["chord"]:
                                symbols.append(s)
                    if not symbols:
                        continue
                    # in the order they first appear in the merged chart
                    seen = []
                    for pc in self.occurrences():
                        u = pc[2]
                        for it in u.chords:
                            if it["symbol"] in symbols and it["symbol"] not in seen:
                                seen.append(it["symbol"])
                    c = {"kind": "reading", "key": prop, "changed": side, "symbols": seen,
                         "base": a, OURS: self.v[OURS].props.get(prop), THEIRS: self.v[THEIRS].props.get(prop)}
                else:
                    if not applied:
                        continue
                    c = {"kind": "reading", "key": prop, "changed": side,
                         "base": a, OURS: self.v[OURS].props.get(prop), THEIRS: self.v[THEIRS].props.get(prop)}
                self.reading[prop] = c
                self.prop_in.add(prop)
                self.prop_value[prop] = CONFLICT
                self.prop_conflict[prop] = c
        for k in sorted(self.prop_conflict):
            self.conflicts.append(self.prop_conflict[k])

    @property
    def dialect(self) -> str:
        v = self.prop_value.get("notation")
        if v is CONFLICT:
            return self.v["base"].dialect
        return dialect_of([{"key": "notation", "value": v}] if v is not None else [])

    # --- voicings (§11.10) ---
    def merge_blocks(self):
        B = self.v["base"]
        # A version's voicing for a variant in a block: its item for the key it gives the variant.
        def items(block):
            return {(e["symbol"], e["index"]): e for e in block["voicings"]} if block is not None else {}

        def vtext(e):
            if e is None:
                return None
            t = format_frets(e["frets"])
            if e.get("fingers") and any(f is not None for f in e["fingers"]):
                t += f" ({format_fingers(e['fingers'])})"
            return t

        self.vtext = vtext
        pos = {"base": 0, OURS: 1, THEIRS: 2}

        def voicing(version, block, variant, base_block=None):
            """A version's voicing for a variant in its counterpart of a block.
            A side that kept no occurrence of the variant's base key made no
            decision about its shape, so its voicing is base's: `base_block`."""
            sym, sig = variant
            k = sig[pos[version]]
            if block is None:
                return None
            if k is None:
                if version != "base" and sig[0] is not None and base_block is not None:
                    return items(base_block).get(sig[0])
                return None
            return items(block).get(k)

        self.voicing = voicing
        ident = lambda blk: (blk["tuning"]["id"], blk["label"])
        base_by = {ident(b): b for b in B.blocks}
        # renames (§11.10.1)
        self.rename = {OURS: {}, THEIRS: {}}  # side block identity -> base identity
        for side in SIDES:
            V = self.v[side]
            side_by = {ident(b): b for b in V.blocks}
            cands = []
            for X in B.blocks:
                if ident(X) in side_by:
                    continue
                for Y in V.blocks:
                    if ident(Y) in base_by or Y["tuning"]["id"] != X["tuning"]["id"]:
                        continue
                    if X["notes"] != Y["notes"]:
                        continue
                    if all(vtext(voicing("base", X, var)) == vtext(voicing(side, Y, var, X)) for var in self.variants):
                        cands.append((ident(X), ident(Y)))
            for x, y in cands:
                if sum(1 for a, _ in cands if a == x) == 1 and sum(1 for _, c in cands if c == y) == 1:
                    self.rename[side][y] = x
        blocks = {"base": {ident(b): b for b in B.blocks}}
        seqs = {"base": [ident(b) for b in B.blocks]}
        for side in SIDES:
            blocks[side] = {}
            seqs[side] = []
            for Y in self.v[side].blocks:
                i = self.rename[side].get(ident(Y), ident(Y))
                blocks[side][i] = Y
                seqs[side].append(i)
        self.blk = blocks
        ids = set(blocks["base"]) | set(blocks[OURS]) | set(blocks[THEIRS])
        # weak absence (§11.10.3)
        def weak(side, i, var):
            sym, sig = var
            beta = sig[0]
            if beta is None:
                return False
            blk = blocks[side].get(i)
            if blk is None:
                return False
            k = sig[pos[side]]
            m = self.km[side].match.get(beta)
            if k == m or items(blk).get(k) is not None:
                return False
            return vtext(items(blk).get(m) if m is not None else None) == vtext(voicing("base", blocks["base"].get(i), var))

        self.weak = weak

        def changed(side, i):
            b, s = blocks["base"][i], blocks[side][i]
            if s["label"] != b["label"] or s["notes"] != b["notes"]:
                return True
            for var in self.variants:
                if vtext(voicing(side, s, var, b)) != vtext(voicing("base", b, var)) and not weak(side, i, var):
                    return True
            return False

        self.block_in = set()
        self.block_conflict = {}
        for i in ids:
            inb, ino, int_ = i in blocks["base"], i in blocks[OURS], i in blocks[THEIRS]
            if not inb or (ino and int_):
                self.block_in.add(i)
            elif ino or int_:
                side = OURS if ino else THEIRS
                if changed(side, i):
                    self.block_in.add(i)
                    self.block_conflict[i] = {"kind": "block", "_deleted": other(side)}
        # values
        self.bname = {}
        self.bspell = {}
        self.bvoicings = {}
        self.bnotes = {}
        self.bconflicts = {}
        for i in self.block_in:
            vers = {k: blocks[k].get(i) for k in ("base", OURS, THEIRS)}
            names = {k: (b["label"] if b is not None else None) for k, b in vers.items()}
            name = merge_value(names["base"], names[OURS], names[THEIRS])
            self.bname[i] = (name, names)
            sp = {k: (b["tuning"]["text"] if b is not None else None) for k, b in vers.items()}
            spell = merge_value(sp["base"], sp[OURS], sp[THEIRS])
            if spell is CONFLICT:
                spell = min(s for s in (sp[OURS], sp[THEIRS]) if s is not None)
            if spell is None:  # a block one side deleted and the other kept as it was
                spell = sp["base"]
            self.bspell[i] = spell
        for i in sorted(self.block_in, key=self.block_sort):
            if i in self.block_conflict:
                continue
            vers = {k: blocks[k].get(i) for k in ("base", OURS, THEIRS)}
            name, names = self.bname[i]
            tuning = self.bspell[i]
            if name is CONFLICT:
                self.conflicts.append({"kind": "variation", "tuning": tuning, "base": names["base"],
                                       OURS: names[OURS], THEIRS: names[THEIRS], "_block": i})
            merged = {}
            for var in self.variants:
                a = vtext(voicing("base", vers["base"], var))
                x = vtext(voicing(OURS, vers[OURS], var, vers["base"]))
                y = vtext(voicing(THEIRS, vers[THEIRS], var, vers["base"]))
                val = merge_value(a, x, y)
                if val is CONFLICT:
                    if weak(OURS, i, var):
                        val = y
                    elif weak(THEIRS, i, var):
                        val = x
                if val is CONFLICT:
                    c = {"kind": "voicing", "tuning": tuning, "variation": self.block_name(i),
                         "key": key_text(self.variant_key(*var)), "base": a, OURS: x, THEIRS: y, "_block": i}
                    self.conflicts.append(c)
                    merged[var] = c
                elif val is not None:
                    src = None
                    for k in (OURS, THEIRS, "base"):
                        e = voicing(k, vers[k], var, vers["base"])
                        if vtext(e) == val:
                            src = e
                            break
                    merged[var] = src
            self.bvoicings[i] = merged
            nb = vers["base"]["notes"] if vers["base"] is not None else []
            no = vers[OURS]["notes"] if vers[OURS] is not None else []
            nt = vers[THEIRS]["notes"] if vers[THEIRS] is not None else []
            eq = lambda x, y: x == y
            notes = merge_sequence(nb, no, nt, eq, eq, eq, "conflict")
            for pc in notes:
                if pc[0] == "conflict":
                    self.conflicts.append({"kind": "block-notes", "tuning": tuning, "variation": self.block_name(i),
                                           "base": list(pc[1]), OURS: list(pc[2]), THEIRS: list(pc[3]), "_pc": pc})
            self.bnotes[i] = notes
        for i, c in self.block_conflict.items():
            c["tuning"] = self.bspell[i]
            c["variation"] = self.block_name(i)
            c["_block"] = i
            for k in ("base", OURS, THEIRS):
                blk = blocks[k].get(i)
                c[k] = "\n".join(self.side_block_lines(k, blk)) if blk is not None else None
            self.conflicts.append(c)

    def block_name(self, i) -> str:
        name, names = self.bname[i]
        if name is CONFLICT or name is None:
            sides = [names[k] for k in (OURS, THEIRS) if names.get(k) is not None]
            return min(sides) if sides else names["base"]
        return name

    def block_sort(self, i) -> str:
        name = self.block_name(i) if i in self.bname else i[1]
        spell = self.bspell.get(i)
        if spell is None:
            spell = next(self.blk[k][i]["tuning"]["text"] for k in ("base", OURS, THEIRS) if i in self.blk[k])
        return f"## {name or 'Voicings'}: {spell}"

    def block_order(self):
        B = [i for i in (self.rename_id("base", b) for b in self.v["base"].blocks)]
        O = [self.rename_id(OURS, b) for b in self.v[OURS].blocks]
        T = [self.rename_id(THEIRS, b) for b in self.v[THEIRS].blocks]
        for i in set(B) | set(O) | set(T):
            if i not in self.bspell:
                self.bname.setdefault(i, (i[1], {"base": i[1]}))
        seq = keyed_order(B, O, T, self.block_in, self.block_sort)
        # canonical order: by first appearance of the tuning, the default variation first (§8.4.6)
        tunings = []
        for i in seq:
            if i[0] not in tunings:
                tunings.append(i[0])
        return sorted(seq, key=lambda i: (tunings.index(i[0]), self.block_name(i) != "", seq.index(i)))

    def rename_id(self, version, blk):
        i = (blk["tuning"]["id"], blk["label"])
        if version == "base":
            return i
        return self.rename[version].get(i, i)

    def side_block_lines(self, version, blk) -> list[str]:
        """A block as one version has it, in the result's keys (§11.12.2)."""
        lines = [f"## {blk['label'] or 'Voicings'}: {blk['tuning']['text']}"]
        rows = []
        for var in self.variants:
            e = self.voicing(version, blk, var, self.blk["base"].get(self.rename_id(version, blk)) if version != "base" else None)
            if e is not None:
                k = self.variant_key(*var)
                rows.append((k, f"- {key_text(k)}: {self.vtext(e)}"))
        rows.sort(key=lambda r: r[0])
        lines.extend(r[1] for r in rows)
        lines.extend(blk["notes"])
        return lines

    # --- building the result (§11.11) and the marked text (§11.12.2) ---
    def realise(self, pc) -> tuple:
        """A unit of the merged chart, in the result's keys: ("fence", info),
        ("line", kind, text_or_line)."""
        u = pc[2]
        if u.kind[0] == "fence":
            return ("fence", u.kind[1])
        if u.kind[0] != "music":
            return ("line", u.kind, u.text)
        line = copy.deepcopy(u.line)
        sigs = self.unit_sigs[self.piece_id(pc)]
        for it, sg in zip(chords_of(line), sigs):
            sym, idx = self.variant_key(it["symbol"], sg)
            it["index"] = idx
            it["key"] = key_for(sym, idx)
        if line["kind"] == "sung":
            converge(line, lyric_text(line), self.dialect)
        return ("line", u.kind, line)

    def unit_lines(self, r) -> list[str]:
        if r[0] == "fence":
            return ["```" + r[1]]
        if r[1][0] == "music":
            return music_lines([r[2]], self.dialect)
        return [r[2]]

    def unit_string(self, r) -> str:
        return "\n".join(self.unit_lines(r))

    @staticmethod
    def to_parts(seq) -> list[dict]:
        """Units back into parts (§11.8.4). Elements are realised units or
        regions ({"region": conflict, "kind": kind, ...})."""
        parts = []
        for el in seq:
            if isinstance(el, dict):
                kind = el["kind"]
                item = el
            elif el[0] == "fence":
                info = el[1]
                parts.append({"type": "verbatim", "info": info, "lines": []} if info else {"type": "music", "lines": []})
                continue
            else:
                kind = el[1]
                item = el[2]
            want = {"notes": "notes", "music": "music", "verbatim": "verbatim"}[kind[0]]
            cur = parts[-1] if parts else None
            if cur is None or cur["type"] != want or (want == "verbatim" and cur["info"] != kind[1]):
                cur = {"type": want, "lines": []}
                if want == "verbatim":
                    cur["info"] = kind[1]
                parts.append(cur)
            cur["lines"].append(item)
        return parts

    def section_model(self, heading: tuple, seq) -> dict:
        form, name, anchor, times = heading
        s = {"name": name or "", "heading": None if form in ("none", None) else form, "anchor": anchor, "body": [], "groups": []}
        if times is not None:
            s["times"] = times
        for part in self.to_parts(seq):
            if part["type"] == "notes":
                s["body"].append({"type": "notes", "text": "\n".join(part["lines"]), "_lines": part["lines"]})
            elif part["type"] == "verbatim":
                s["body"].append({"type": "verbatim", "info": part["info"], "text": "\n".join(part["lines"]) if all(isinstance(x, str) for x in part["lines"]) else "", "_lines": part["lines"]})
            else:
                s["body"].append({"type": "music", "lines": part["lines"]})
        return s

    def side_sections(self, side, secs) -> list[dict]:
        out = []
        for sec in secs:
            seq = [self.realise(("one", side, u)) for u in sec.units]
            out.append(self.section_model(sec.heading, seq))
        return out

    def section_text(self, s: dict, dialect=None) -> str:
        blocks = _chart_blocks([s], dialect or self.dialect)
        return "\n\n".join("\n".join(b) for b in blocks)

    def merged_sections(self):
        """The merged chart as items for writing: ("section", model) for a
        section with no region that cannot stand in place, and ("region",
        conflict, ours_models, theirs_models) for a block region."""
        out = []
        for ms in self.chart:
            if ms["type"] == "conflict":
                c = {"kind": "sections",
                     "base": [self.section_text(s.model, self.v["base"].dialect) for s in ms["base"]]}
                o, t = self.side_sections(OURS, ms[OURS]), self.side_sections(THEIRS, ms[THEIRS])
                c[OURS] = [self.section_text(s) for s in o]
                c[THEIRS] = [self.section_text(s) for s in t]
                self.conflicts.append(c)
                out.append(("region", c, o, t))
                continue
            seq = []
            regions = []
            whole = False
            for pc in ms["body"]:
                if pc[0] == "conflict":
                    ro = [self.realise(("one", OURS, u)) for u in pc[2]]
                    rt = [self.realise(("one", THEIRS, u)) for u in pc[3]]
                    kinds = {(("music",) if r[1][0] == "music" else r[1]) if r[0] == "line" else ("fence",) for r in ro + rt}
                    c = {"kind": "chart", "base": [u.text for u in pc[1]],
                         OURS: [self.unit_string(r) for r in ro], THEIRS: [self.unit_string(r) for r in rt]}
                    if len(kinds) != 1 or next(iter(kinds))[0] == "fence":
                        whole = True
                    regions.append(c)
                    seq.append({"region": c, "kind": next(iter(kinds)), OURS: ro, THEIRS: rt})
                else:
                    seq.append(self.realise(pc))
            hc = ms["hconflict"]
            if hc is not None and any(h[0] in ("bracket", "label") for h in (ms["sides"][OURS], ms["sides"][THEIRS])):
                whole = True
            if whole:
                def way(side):
                    h = hc["_" + side] if hc is not None else ms["heading"]
                    sq = []
                    for el in seq:
                        if isinstance(el, dict):
                            sq.extend(el[side])
                        else:
                            sq.append(el)
                    return self.section_model(h, sq)

                o, t = way(OURS), way(THEIRS)
                base = ms["base"]
                c = {"kind": "sections",
                     "base": [self.section_text(base.model, self.v["base"].dialect)] if base is not None else [],
                     OURS: [self.section_text(o)], THEIRS: [self.section_text(t)]}
                self.conflicts.append(c)
                out.append(("region", c, [o], [t]))
                continue
            for c in regions:
                self.conflicts.append(c)
            if hc is not None:
                self.conflicts.append(hc)
            heading = ms["heading"]
            if hc is not None:
                heading = tuple(None if f is CONFLICT else f for f in heading)
                heading = (hc["_ours"][0] if hc["_ours"][0] == hc["_theirs"][0] else "markdown",) + heading[1:]
            model = self.section_model(heading, seq)
            model["_hconflict"] = hc
            out.append(("section", model))
        return out

    def result_model(self) -> dict:
        props = [{"key": k, "value": self.prop_value[k]} for k in self.property_order()]
        sections = [m[1] for m in self.sections_out]
        for s in sections:
            for part in s["body"]:
                part.pop("_lines", None)
            s.pop("_hconflict", None)
        blocks = []
        for i in self.block_order():
            vers = self.bvoicings[i]
            blk = {"label": self.bname[i][0], "tuning": dict(self.any_block(i)["tuning"]), "voicings": [], "notes": []}
            blk["tuning"]["text"] = self.bspell[i]
            for var, e in vers.items():
                sym, idx = self.variant_key(*var)
                item = {"key": key_for(sym, idx), "symbol": sym, "index": idx, "frets": e["frets"]}
                if "fingers" in e:
                    item["fingers"] = e["fingers"]
                blk["voicings"].append(item)
            blk["notes"] = [pc[1] if pc[0] in ("both", "common") else pc[2] for pc in self.bnotes[i]]
            blocks.append(blk)
        return {"title": self.title, "properties": props, "sections": sections, "blocks": blocks,
                "sung": False, "sungAt": None, "diagnostics": []}

    def any_block(self, i):
        for k in (OURS, THEIRS, "base"):
            if i in self.blk[k]:
                return self.blk[k][i]

    def result(self) -> str:
        text = serialize(canonical(self.result_model()))
        return canonical_song(text)

    # --- the marked text (§11.12.2) ---
    def marked(self) -> str:
        blocks: list[list[str]] = []
        meta = []
        if self.title_conflict is not None:
            c = self.title_conflict
            meta.extend(region(c, [heading_line(1, c[OURS])] if c[OURS] else [], [heading_line(1, c[THEIRS])] if c[THEIRS] else []))
        elif self.title:
            meta.append(heading_line(1, self.title))
        for k in self.property_order():
            if k in self.prop_conflict:
                c = self.prop_conflict[k]
                line = lambda v: [f"- {k}: {v}" if v else f"- {k}:"] if v is not None else []
                meta.extend(region(c, line(c[OURS]), line(c[THEIRS])))
            else:
                v = self.prop_value[k]
                meta.append(f"- {k}: {v}" if v else f"- {k}:")
        if meta:
            blocks.append(meta)
        blocks.extend(self.marked_chart())
        vb = self.marked_voicings()
        if vb:
            blocks.append(["---"])
            blocks.extend(vb)
        return finish_marked(blocks, self.conflicts)

    def marked_part_lines(self, part) -> list[str]:
        out = []
        if part["type"] == "music":
            for el in part["lines"]:
                if isinstance(el, dict) and "region" in el:
                    out.extend(region(el["region"],
                                      [x for r in el[OURS] for x in self.unit_lines(r)],
                                      [x for r in el[THEIRS] for x in self.unit_lines(r)]))
                else:
                    out.extend(music_lines([el], self.dialect))
            return out
        plain = []
        for el in part["_lines"]:
            if isinstance(el, dict):
                out.extend(plain if part["type"] == "verbatim" else _collapse(plain))
                plain = []
                ol = [r[2] for r in el[OURS]]
                tl = [r[2] for r in el[THEIRS]]
                if part["type"] == "notes":
                    ol, tl = _collapse(ol), _collapse(tl)
                out.extend(region(el["region"], ol, tl))
            else:
                plain.append(el)
        out.extend(plain if part["type"] == "verbatim" else _collapse(plain))
        return out

    def marked_chart(self) -> list[list[str]]:
        blocks: list[list[str]] = []
        open_fence: list[str] | None = None

        def flush():
            nonlocal open_fence
            if open_fence is not None:
                blocks.append(fence(open_fence))
                open_fence = None

        def part_block(part):
            lines = self.marked_part_lines(part)
            if part["type"] == "notes":
                return lines
            if part["type"] == "verbatim":
                return fence(lines, part["info"])
            return fence(lines)

        for item in self.sections_out:
            if item[0] == "region":
                flush()
                c, o, t = item[1], item[2], item[3]

                def side_lines(models):
                    lines = []
                    for k, s in enumerate(models):
                        if k:
                            lines.append("")
                        lines.extend(self.section_text(s).split("\n"))
                    return lines

                blocks.append(region(c, side_lines(o), side_lines(t)))
                continue
            s = item[1]
            hc = s.get("_hconflict")
            if s["heading"] in ("bracket", "label"):
                head = f"[{heading_name(s)}]" if s["heading"] == "bracket" else f"{s['name']}:"
                body = s["body"]
                joined = False
                first = body[0]["lines"] if body and body[0]["type"] == "music" else []
                if first and "region" not in first[0] and first[0]["kind"] == "chart":
                    from .layout import chart_line_text
                    from .parse import COUNT, _is_chord_run

                    text = chart_line_text(first[0], self.dialect)
                    if s["heading"] == "bracket" and not COUNT.match(text):
                        head, joined = f"{head} {text}", True
                    elif s["heading"] == "label" and _is_chord_run(text, self.dialect):
                        head, joined = f"{head} {text}", True
                open_fence = [head] if open_fence is None else open_fence + ["", head]
                for idx, part in enumerate(body):
                    if part["type"] == "music" and idx == 0:
                        p2 = dict(part)
                        p2["lines"] = part["lines"][1:] if joined else part["lines"]
                        open_fence.extend(self.marked_part_lines(p2))
                    elif part["type"] == "music" and part["lines"]:
                        flush()
                        open_fence = self.marked_part_lines(part)
                    else:
                        flush()
                        blocks.append(part_block(part))
                continue
            flush()
            parts = [part_block(p) for p in s["body"]]
            if hc is not None:
                head = region(hc, [hc[OURS]] if hc[OURS] is not None else [], [hc[THEIRS]] if hc[THEIRS] is not None else [])
            elif s["heading"] == "markdown":
                head = [heading_line(2, heading_name(s))]
            else:
                head = []
            if head:
                if parts:
                    parts[0] = head + parts[0]
                else:
                    parts = [head]
            blocks.extend(parts)
        flush()
        return blocks

    def marked_voicings(self) -> list[list[str]]:
        out = []
        for i in self.block_order():
            if i in self.block_conflict:
                c = self.block_conflict[i]
                o = c[OURS].split("\n") if c[OURS] is not None else []
                t = c[THEIRS].split("\n") if c[THEIRS] is not None else []
                out.append(region(c, o, t))
                continue
            name, names = self.bname[i]
            tuning = self.bspell[i]
            if name is CONFLICT:
                c = next(x for x in self.conflicts if x["kind"] == "variation" and x.get("_block") == i)
                lines = region(c, [f"## {names[OURS] or 'Voicings'}: {tuning}"], [f"## {names[THEIRS] or 'Voicings'}: {tuning}"])
            else:
                lines = [f"## {name or 'Voicings'}: {tuning}"]
            rows = []
            for var, e in self.bvoicings[i].items():
                k = self.variant_key(*var)
                if isinstance(e, dict) and e.get("kind") == "voicing":
                    c = e
                    item = lambda v: [f"- {key_text(k)}: {v}"] if v is not None else []
                    rows.append((k, region(c, item(c[OURS]), item(c[THEIRS]))))
                else:
                    rows.append((k, [f"- {key_text(k)}: {self.vtext(e)}"]))
            rows.sort(key=lambda r: r[0])
            for _, r in rows:
                lines.extend(r)
            for pc in self.bnotes[i]:
                if pc[0] == "conflict":
                    c = next(x for x in self.conflicts if x.get("_pc") is pc)
                    lines.extend(region(c, list(pc[2]), list(pc[3])))
                else:
                    lines.append(pc[1] if pc[0] in ("both", "common") else pc[2])
            out.append(lines)
        return out


def _collapse(lines: list[str]) -> list[str]:
    out: list[str] = []
    for ln in lines:
        if ln == "" and out and out[-1] == "":
            continue
        out.append(ln)
    return out
