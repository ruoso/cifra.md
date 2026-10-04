"""The merge of setlists (spec §11.13). `merge` in merge.py calls
`merge_setlists` with the three canonical texts once whole files, unreadable
inputs and unchanged sides are dealt with (§11.2 to §11.4)."""

from __future__ import annotations

from collections import Counter

from .merge import CONFLICT, OURS, SIDES, THEIRS, Outcome, finish_marked, keyed_order, merge_value, other, region
from .setlist import canonicalise_setlist, entry_line, item_content, ordered_entries, parse_setlist, write_path, write_setlist

VERSIONS = ("base", OURS, THEIRS)


def entry_ids(entries: list[dict]) -> list[tuple]:
    """Identities of a list of entries: a property by its key, an
    unrecognised entry by its text and occurrence (§11.13)."""
    out = []
    seen = Counter()
    for e in entries:
        if e["type"] == "property":
            out.append(("p", e["key"]))
        else:
            seen[e["text"]] += 1
            out.append(("u", e["text"], seen[e["text"]]))
    return out


def entry_sort(i: tuple) -> tuple:
    return (i[1], i[2] if i[0] == "u" else 0)


def body_ids(body: list[dict]) -> list[tuple]:
    out = []
    seen = Counter()
    last = None
    for el in body:
        if el["type"] == "song":
            seen[("song", el["path"])] += 1
            i = ("song", el["path"], seen[("song", el["path"])])
            last = i
        elif el["type"] == "unlinked":
            seen[("unlinked", el["content"])] += 1
            i = ("unlinked", el["content"], seen[("unlinked", el["content"])])
            last = i
        else:
            i = ("notes", last)
        out.append(i)
    return out


def item_name(i: tuple) -> str:
    """An item's identity as the JSON writes it: its path as written, or its content."""
    return write_path(i[1]) if i[0] == "song" else i[1]


class EntryMerge:
    """A keyed list of entries (§11.13): the setlist's own, or an item's."""

    def __init__(self, versions: dict, kind: str, conflicts: list, extra: dict):
        ids = {k: entry_ids(v) if v is not None else [] for k, v in versions.items()}
        by = {k: dict(zip(ids[k], v)) if v is not None else {} for k, v in versions.items()}
        values = {k: {i: (e["value"] if e["type"] == "property" else True) for i, e in by[k].items()} for k in by}
        self.in_result = set()
        self.value = {}
        self.conflict = {}
        for i in set(ids["base"]) | set(ids[OURS]) | set(ids[THEIRS]):
            a, x, y = (values[k].get(i) for k in VERSIONS)
            if a is None or (x is not None and y is not None):
                self.in_result.add(i)
                val = merge_value(a, x, y)
            elif x is None and y is None:
                continue
            else:
                kept = x if x is not None else y
                if kept == a:
                    continue
                self.in_result.add(i)
                val = CONFLICT
            self.value[i] = val
            if val is CONFLICT:
                c = {"kind": kind, **extra, "key": i[1], "base": a, OURS: x, THEIRS: y}
                if kind == "property":
                    c.pop("item", None)
                self.conflict[i] = c
                conflicts.append(c)
        self.order = keyed_order(ids["base"], ids[OURS], ids[THEIRS], self.in_result, entry_sort)

    def entries(self) -> list[dict]:
        out = []
        for i in self.order:
            if i[0] == "p":
                out.append({"type": "property", "key": i[1], "value": self.value[i]})
            else:
                out.append({"type": "unrecognised", "text": i[1]})
        return out

    def lines(self, indent: int, item: bool) -> list[str]:
        """The entry lines, with a region for each conflict (§11.13)."""
        order = self.order
        if item:
            first = [i for k in ("key", "note") for i in order if i == ("p", k)]
            order = first + [i for i in order if i not in first]
        out = []
        for i in order:
            if i in self.conflict:
                c = self.conflict[i]
                side = lambda v: [entry_line({"type": "property", "key": i[1], "value": v}, indent)] if v is not None else []
                out.extend(region(c, side(c[OURS]), side(c[THEIRS])))
            elif i[0] == "p":
                out.append(entry_line({"type": "property", "key": i[1], "value": self.value[i]}, indent))
            else:
                out.append(entry_line({"type": "unrecognised", "text": i[1]}, indent))
        return out


def item_string(item: dict) -> str:
    """An item as the JSON writes it: its line without the number, then its
    entry lines without their indentation (§11.13)."""
    return "\n".join([item_content(item)] + [entry_line(e) for e in ordered_entries(item["entries"])])


def item_value(item: dict):
    entries = tuple(entry_line(e) for e in ordered_entries(item["entries"]))
    return (item.get("text"), entries)


class SetlistMerge:
    def __init__(self, b: str, o: str, t: str):
        self.m = {"base": parse_setlist(b), OURS: parse_setlist(o), THEIRS: parse_setlist(t)}
        self.conflicts: list[dict] = []

    def run(self) -> Outcome:
        m = self.m
        self.title = merge_value(*(m[k]["title"] for k in VERSIONS))
        self.title_conflict = None
        if self.title is CONFLICT:
            self.title_conflict = {"kind": "title", **{k: m[k]["title"] for k in VERSIONS}}
            self.conflicts.append(self.title_conflict)
        self.props = EntryMerge({k: m[k]["properties"] for k in VERSIONS}, "property", self.conflicts, {})
        ids = {k: body_ids(m[k]["body"]) for k in VERSIONS}
        by = {k: dict(zip(ids[k], m[k]["body"])) for k in VERSIONS}
        self.by = by

        def value(el):
            if el is None:
                return None
            return tuple(el["lines"]) if el["type"] == "notes" else item_value(el)

        self.in_result = set()
        self.presence = {}
        for i in set(ids["base"]) | set(ids[OURS]) | set(ids[THEIRS]):
            a, x, y = (value(by[k].get(i)) for k in VERSIONS)
            if a is None or (x is not None and y is not None):
                self.in_result.add(i)
            elif x is None and y is None:
                continue
            else:
                kept = x if x is not None else y
                if kept != a:
                    self.in_result.add(i)
                    self.presence[i] = OURS if x is None else THEIRS  # the side that deleted it
        self.order = keyed_order(ids["base"], ids[OURS], ids[THEIRS], self.in_result, self.sort_key)
        self.items = {}
        for i in self.order:
            vers = {k: by[k].get(i) for k in VERSIONS}
            if i in self.presence:
                c = {"kind": "notes" if i[0] == "notes" else "item"}
                c.update(self.identity_members(i))
                for k in VERSIONS:
                    el = vers[k]
                    if el is not None:
                        c[k] = "\n".join(el["lines"]) if i[0] == "notes" else item_string(el)
                self.conflicts.append(c)
                self.items[i] = ("conflict", c)
                continue
            if i[0] == "notes":
                lines = merge_value(*(None if vers[k] is None else tuple(vers[k]["lines"]) for k in VERSIONS))
                if lines is CONFLICT:
                    c = {"kind": "notes", **self.identity_members(i)}
                    for k in VERSIONS:
                        if vers[k] is not None:
                            c[k] = "\n".join(vers[k]["lines"])
                    self.conflicts.append(c)
                    self.items[i] = ("conflict", c)
                else:
                    self.items[i] = ("notes", list(lines))
                continue
            extra = self.identity_members(i)
            text = None
            text_conflict = None
            if i[0] == "song":
                text = merge_value(*(None if vers[k] is None else vers[k]["text"] for k in VERSIONS))
                if text is CONFLICT:
                    text_conflict = {"kind": "text", **extra, **{k: vers[k]["text"] for k in VERSIONS if vers[k] is not None}}
                    self.conflicts.append(text_conflict)
            entries = EntryMerge({k: (vers[k]["entries"] if vers[k] is not None else None) for k in VERSIONS}, "entry", self.conflicts, extra)
            self.items[i] = ("item", text, text_conflict, entries)
        if not self.conflicts:
            return Outcome(result=self.result())
        return Outcome(conflicts=self.conflicts, marked=self.marked())

    def identity_members(self, i: tuple) -> dict:
        if i[0] == "notes":
            after = i[1]
            if after is None:
                return {}
            out = {"after": item_name(after)}
            if after[2] > 1:
                out["occurrence"] = after[2]
            return out
        out = {"item": item_name(i)}
        if i[2] > 1:
            out["occurrence"] = i[2]
        return out

    def sort_key(self, i: tuple) -> tuple:
        """The sort string of an item or a notes block (§11.13), then what
        decides between equal ones: an item first, the lower occurrence, a
        notes block that is first, then the item a notes block follows."""
        if i[0] == "notes":
            first = min(self.by[k][i]["lines"][0] for k in VERSIONS if i in self.by[k])
            after = i[1]
            if after is None:
                return (first, 1, 0, "", 0)
            return (first, 1, 1, self.sort_key(after)[0], after[2])
        line = min(item_content(self.by[k][i]) for k in VERSIONS if i in self.by[k])
        return (line, 0, i[2], "", 0)

    def result_model(self) -> dict:
        body = []
        n = 0
        for i in self.order:
            kind = self.items[i]
            if kind[0] == "notes":
                body.append({"type": "notes", "lines": kind[1]})
                continue
            n += 1
            _, text, _, entries = kind
            if i[0] == "song":
                body.append({"type": "song", "number": n, "text": text, "path": i[1], "entries": entries.entries()})
            else:
                body.append({"type": "unlinked", "number": n, "content": i[1], "entries": entries.entries()})
        return {"title": self.title, "properties": self.props.entries(), "body": body, "diagnostics": []}

    def result(self) -> str:
        return canonicalise_setlist(write_setlist(self.result_model()))

    def marked(self) -> str:
        parts: list[list[str]] = []
        meta = []
        if self.title_conflict is not None:
            c = self.title_conflict
            meta.extend(region(c, [f"# {c[OURS]}"] if c[OURS] else [], [f"# {c[THEIRS]}"] if c[THEIRS] else []))
        elif self.title:
            meta.append(f"# {self.title}")
        meta.extend(self.props.lines(0, item=False))
        if meta:
            parts.append(meta)
        run: list[str] | None = None
        n = 0

        def side_item(k, i, number):
            el = self.by[k].get(i)
            if el is None:
                return []
            content = item_content(el)
            indent = len(str(number)) + 2
            return [f"{number}." + (f" {content}" if content else "")] + [entry_line(e, indent) for e in ordered_entries(el["entries"])]

        for i in self.order:
            kind = self.items[i]
            if i[0] == "notes":
                if run is not None:
                    parts.append(run)
                    run = None
                if kind[0] == "conflict":
                    c = kind[1]
                    side = lambda k: list(self.by[k][i]["lines"]) if i in self.by[k] else []
                    parts.append(region(c, side(OURS), side(THEIRS)))
                else:
                    parts.append(list(kind[1]))
                continue
            if run is None:
                run = []
            if kind[0] == "conflict":
                c = kind[1]
                ol, tl = side_item(OURS, i, n + 1), side_item(THEIRS, i, n + 1)
                run.extend(region(c, ol, tl))
                n += max(1 if ol else 0, 1 if tl else 0)
                continue
            n += 1
            _, text, text_conflict, entries = kind
            indent = len(str(n)) + 2

            def head(t):
                if i[0] == "song":
                    content = item_content({"type": "song", "text": t, "path": i[1]})
                else:
                    content = i[1]
                return f"{n}." + (f" {content}" if content else "")

            if text_conflict is not None:
                run.extend(region(text_conflict, [head(text_conflict[OURS])], [head(text_conflict[THEIRS])]))
            else:
                run.append(head(text))
            run.extend(entries.lines(indent, item=True))
        if run is not None:
            parts.append(run)
        return finish_marked(parts, self.conflicts)


def merge_setlists(b: str, o: str, t: str) -> Outcome:
    return SetlistMerge(b, o, t).run()
