"""Generate or check the reference corpus (../corpus).

    python -m tools.corpus --write    regenerate parsed.json and canonical.cifra.md from every input.cifra.md
    python -m tools.corpus --check    report entries whose files disagree with the implementation
"""

from __future__ import annotations

import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from cifra_md import parse, write  # noqa: E402

CORPUS = pathlib.Path(__file__).resolve().parents[2] / "corpus"


def entries():
    return sorted(p for p in CORPUS.iterdir() if p.is_dir() and (p / "input.cifra.md").exists())


def generate(entry: pathlib.Path):
    text = (entry / "input.cifra.md").read_text(encoding="utf-8")
    doc = parse(text)
    canonical = write(doc)
    return doc, canonical


def main(argv) -> int:
    if argv == ["--write"]:
        for entry in entries():
            doc, canonical = generate(entry)
            (entry / "parsed.json").write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            (entry / "canonical.cifra.md").write_text(canonical, encoding="utf-8")
            print("wrote", entry.name)
        return 0
    if argv == ["--check"]:
        bad = 0
        for entry in entries():
            doc, canonical = generate(entry)
            expected = json.loads((entry / "parsed.json").read_text(encoding="utf-8"))
            if doc != expected:
                print("parsed.json differs:", entry.name)
                bad += 1
            if canonical != (entry / "canonical.cifra.md").read_text(encoding="utf-8"):
                print("canonical.md differs:", entry.name)
                bad += 1
        print("ok" if not bad else f"{bad} problems")
        return 1 if bad else 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
