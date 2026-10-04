"""Command line.

    cifra-md parse FILE                      the model as JSON
    cifra-md write FILE                      the canonical text
    cifra-md check FILE                      exit 0 if FILE is canonical, 1 if not (§8.1)
    cifra-md merge [--json] BASE OURS THEIRS [PATH]
                                             the git merge driver (§11.14)

`merge` merges the three files as §11 says, a setlist when PATH (or, without
it, OURS) ends in `.setlist.md`, and a song otherwise. A file that does not
exist is an absent input. It writes the result to OURS and exits 0; writes
the marked text to OURS and exits 1 when something conflicts; deletes OURS
and exits 0 when the merge deletes the file; and leaves OURS as it is and
exits 1, saying why on standard error, when an input is not UTF-8, when an
input holds a marker line (an `unresolved` conflict), or when the file was
deleted on one side and changed on the other. With `--json`, the
conflicts are printed on standard output as §11.12.5 gives them.
"""

from __future__ import annotations

import json
import os
import sys

from .parse import parse
from .text import NotUTF8Error
from .write import MarkedTextError, is_canonical, write

USAGE = "usage: cifra-md (parse|write|check) FILE | cifra-md merge [--json] BASE OURS THEIRS [PATH]"


def _read(path: str) -> bytes | None:
    try:
        with open(path, "rb") as f:
            return f.read()
    except FileNotFoundError:
        return None


def merge_driver(argv) -> int:
    from .merge import conflicts_json, merge

    as_json = False
    if argv and argv[0] == "--json":
        as_json, argv = True, argv[1:]
    if len(argv) not in (3, 4):
        print(USAGE, file=sys.stderr)
        return 2
    base, ours, theirs = argv[:3]
    path = argv[3] if len(argv) == 4 else ours
    outcome = merge(_read(base), _read(ours), _read(theirs), setlist=path.endswith(".setlist.md"))
    if as_json:
        sys.stdout.write(conflicts_json(outcome))
    if outcome.result is not None:
        with open(ours, "wb") as f:
            f.write(outcome.result.encode("utf-8"))
        return 0
    if outcome.deleted:
        if os.path.exists(ours):
            os.remove(ours)
        return 0
    for c in outcome.conflicts:
        if c["kind"] == "file" and "unreadable" in c:
            print(f"{path}: not UTF-8 ({', '.join(c['unreadable'])}); not merged", file=sys.stderr)
        elif c["kind"] == "unresolved":
            where = ", ".join(f"{side} (line {c[side]})" for side in ("base", "ours", "theirs") if side in c)
            print(f"{path}: conflict markers left in {where}; not merged, resolve them first", file=sys.stderr)
        elif c["kind"] == "file":
            print(f"{path}: deleted by {c['deleted']} and changed by the other side; not merged", file=sys.stderr)
    if outcome.marked is not None:
        with open(ours, "wb") as f:
            f.write(outcome.marked.encode("utf-8"))
        print(f"{path}: {len(outcome.conflicts)} conflict(s)", file=sys.stderr)
    return 1


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if argv and argv[0] == "merge":
        return merge_driver(argv[1:])
    if len(argv) != 2 or argv[0] not in ("parse", "write", "check"):
        print(USAGE, file=sys.stderr)
        return 2
    with open(argv[1], "rb") as f:
        data = f.read()
    if argv[0] == "check":
        return 0 if is_canonical(data) else 1
    try:
        doc = parse(data)
    except NotUTF8Error as e:
        # Not a document: reported, and never rewritten (§1.3).
        print(f"{argv[1]}: {e}", file=sys.stderr)
        return 1
    if argv[0] == "parse":
        json.dump(doc, sys.stdout, indent=2, ensure_ascii=False)
        print()
    else:
        try:
            sys.stdout.write(write(doc))
        except MarkedTextError as e:
            print(f"{argv[1]}: {e}", file=sys.stderr)
            return 1
    for d in doc["diagnostics"]:
        print(f"{argv[1]}:{d['line']}: {d['code']}: {d['message']}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
