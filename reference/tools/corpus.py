"""Generate or check the reference corpus (../corpus).

    python -m tools.corpus --write    regenerate every entry's outputs from its input.cifra.md
    python -m tools.corpus --check    report entries whose files disagree with the implementation

Per entry (corpus/README.md):

    input.cifra.md        the document as written                  (hand-written)
    input.parsed.json     parse(input.cifra.md)                     (generated)
    canonical.cifra.md    write(input.parsed.json)                  (generated)
    parsed.json           parse(canonical.cifra.md)                 (generated)
"""

from __future__ import annotations

import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from cifra_md import parse, write  # noqa: E402

CORPUS = pathlib.Path(__file__).resolve().parents[2] / "corpus"


def dump(model: dict) -> str:
    """How the corpus serialises a model: two-space indent, UTF-8, final newline."""
    return json.dumps(model, indent=2, ensure_ascii=False) + "\n"


def entries():
    return sorted(p for p in CORPUS.iterdir() if p.is_dir() and (p / "input.cifra.md").exists())


def generate(entry: pathlib.Path) -> dict[str, str]:
    source = (entry / "input.cifra.md").read_bytes()
    model = parse(source)
    canonical = write(model)
    return {
        "input.parsed.json": dump(model),
        "canonical.cifra.md": canonical,
        "parsed.json": dump(parse(canonical)),
    }


def main(argv) -> int:
    if argv == ["--write"]:
        for entry in entries():
            for name, text in generate(entry).items():
                (entry / name).write_bytes(text.encode("utf-8"))
            print("wrote", entry.name)
        return 0
    if argv == ["--check"]:
        bad = 0
        for entry in entries():
            for name, text in generate(entry).items():
                path = entry / name
                if not path.exists() or path.read_bytes() != text.encode("utf-8"):
                    print(f"{name} differs: {entry.name}")
                    bad += 1
        print("ok" if not bad else f"{bad} problems")
        return 1 if bad else 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
