"""Helpers for checking the properties of the merge (§11.3, §11.12.4)."""

import re

from cifra_md.merge import conflict_json

OPEN, MID, END = "<<<<<<< ours", "=======", ">>>>>>> theirs"


def regions(marked: str):
    """Split a marked text into plain lines and (ours, theirs) regions."""
    out = []
    lines = marked.split("\n")
    k = 0
    while k < len(lines):
        if lines[k] == OPEN:
            m = lines.index(MID, k)
            e = lines.index(END, m)
            out.append((lines[k + 1 : m], lines[m + 1 : e]))
            k = e + 1
        else:
            out.append(lines[k])
            k += 1
    return out


def resolve(marked: str, side: str) -> str:
    """Resolve every region by one side (§11.12.4)."""
    out = []
    for el in regions(marked):
        if isinstance(el, tuple):
            out.extend(el[0] if side == "ours" else el[1])
        else:
            out.append(el)
    return "\n".join(out)


def mirror_text(marked: str) -> str:
    out = []
    for el in regions(marked):
        if isinstance(el, tuple):
            out.extend([OPEN, *el[1], MID, *el[0], END])
        else:
            out.append(el)
    return "\n".join(out)


def mirror_conflict(c: dict) -> dict:
    c = conflict_json(c)
    swap = {"ours": "theirs", "theirs": "ours"}
    out = {}
    for k, v in c.items():
        k2 = swap.get(k, k)
        if k in ("changed", "deleted"):
            v = swap[v]
        if k == "unreadable":
            v = [x for x in ("base", "ours", "theirs") if swap.get(x, x) in v]
        out[k2] = v
    return {k: out[k] for k in c if k in out} | {k: v for k, v in out.items() if k not in c}


def normal(c: dict) -> dict:
    return dict(sorted(conflict_json(c).items()))


MARKER = re.compile(r"\[[0-9]+\]")


def unmarked(x):
    """Footnote markers left out: for the one exception to symmetry (§11.9.5)."""
    if isinstance(x, str):
        # a marker that grew may have pushed the words: padding and spacing go too
        return MARKER.sub("", re.sub(r"[ _]", "", x))
    if isinstance(x, list):
        return [unmarked(y) for y in x]
    if isinstance(x, dict):
        return {k: unmarked(v) for k, v in x.items()}
    return x


def symmetric(r, r2) -> bool:
    """Is merging base, theirs, ours (r2) the mirror of base, ours, theirs (r)?
    Footnote markers are compared only where the exception allows it."""
    if r.kind != r2.kind:
        return False
    if r.kind == "result":
        return r.result == r2.result
    if r.kind == "deleted":
        return True
    a = [normal(mirror_conflict(c)) for c in r.conflicts]
    b = [normal(c) for c in r2.conflicts]
    ma = None if r.marked is None else mirror_text(r.marked)
    if a == b and ma == r2.marked:
        return True
    return unmarked(a) == unmarked(b) and unmarked(ma) == unmarked(r2.marked)
