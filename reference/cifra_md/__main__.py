"""Command line: `cifra-md parse FILE` prints the model as JSON, `cifra-md write FILE` the canonical text."""

from __future__ import annotations

import json
import sys

from .parse import parse
from .write import write


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 2 or argv[0] not in ("parse", "write"):
        print("usage: cifra-md (parse|write) FILE", file=sys.stderr)
        return 2
    with open(argv[1], encoding="utf-8") as f:
        text = f.read()
    doc = parse(text)
    if argv[0] == "parse":
        json.dump(doc, sys.stdout, indent=2, ensure_ascii=False)
        print()
    else:
        sys.stdout.write(write(doc))
    for d in doc["diagnostics"]:
        print(f"{argv[1]}:{d['line']}: {d['code']}: {d['message']}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
