"""Generate or check the reference corpus (../corpus).

    python -m tools.corpus --write    regenerate every entry's outputs from its inputs
    python -m tools.corpus --check    report entries whose files disagree with the implementation

Per reading entry (corpus/README.md), a song entry discovered by its
`input.cifra.md` and a setlist entry (spec §10) by its `input.setlist.md`,
each read and written by its own reader and canonical writer:

    input.cifra.md        the document as written                  (hand-written)
    input.parsed.json     parse(input.cifra.md)                     (generated)
    canonical.cifra.md    write(input.parsed.json)                  (generated)
    parsed.json           parse(canonical.cifra.md)                 (generated)

    input.setlist.md      the setlist as written                    (hand-written)
    input.parsed.json     parse_setlist(input.setlist.md)           (generated)
    canonical.setlist.md  write_setlist(input.parsed.json)          (generated)
    parsed.json           parse_setlist(canonical.setlist.md)       (generated)

Per merge entry, in corpus/merge/ (corpus/README.md, spec §11.16), with
EXT `.cifra.md` for a song and `.setlist.md` for a setlist:

    base.EXT, ours.EXT, theirs.EXT   the inputs; a missing one is absent (hand-written)
    result.EXT                       the result, when the merge gives one       (generated)
    result.deleted                   empty, when the merge deletes the file     (generated)
    conflicts.json                   the conflicts (§11.12.5), when there are any (generated)
    marked.EXT                       the marked text, when a conflict has a region (generated)
"""

from __future__ import annotations

import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from cifra_md import parse, write  # noqa: E402

CORPUS = pathlib.Path(__file__).resolve().parents[2] / "corpus"
MERGE = CORPUS / "merge"
SIDES = ("base", "ours", "theirs")


def dump(model: dict) -> str:
    """How the corpus serialises a model: two-space indent, UTF-8, final newline."""
    return json.dumps(model, indent=2, ensure_ascii=False) + "\n"


def entries():
    return sorted(p for p in CORPUS.iterdir() if p.is_dir() and (p / "input.cifra.md").exists())


def setlist_entries():
    return sorted(p for p in CORPUS.iterdir() if p.is_dir() and (p / "input.setlist.md").exists())


def merge_entries():
    if not MERGE.is_dir():
        return []
    return sorted(p for p in MERGE.iterdir() if p.is_dir())


def extension(entry: pathlib.Path) -> str:
    """`.setlist.md` when the entry merges setlists, `.cifra.md` otherwise."""
    return ".setlist.md" if any(entry.glob("*.setlist.md")) else ".cifra.md"


def merge_inputs(entry: pathlib.Path) -> tuple:
    ext = extension(entry)
    out = []
    for side in SIDES:
        path = entry / (side + ext)
        out.append(path.read_bytes() if path.exists() else None)
    return tuple(out)


def merge_outputs(outcome, ext: str) -> dict[str, str]:
    """The expected files of a merge entry, from an outcome."""
    from cifra_md.merge import conflicts_json

    if outcome.result is not None:
        return {"result" + ext: outcome.result}
    if outcome.deleted:
        return {"result.deleted": ""}
    files = {"conflicts.json": conflicts_json(outcome)}
    if outcome.marked is not None:
        files["marked" + ext] = outcome.marked
    return files


def generate_merge(entry: pathlib.Path) -> dict[str, str]:
    from cifra_md.merge import merge

    ext = extension(entry)
    return merge_outputs(merge(*merge_inputs(entry), setlist=ext == ".setlist.md"), ext)


def stale_outputs(entry: pathlib.Path, files: dict) -> list[pathlib.Path]:
    ext = extension(entry)
    names = {"result" + ext, "result.deleted", "conflicts.json", "marked" + ext}
    return [entry / n for n in sorted(names - set(files)) if (entry / n).exists()]


def generate(entry: pathlib.Path) -> dict[str, str]:
    source = (entry / "input.cifra.md").read_bytes()
    model = parse(source)
    canonical = write(model)
    return {
        "input.parsed.json": dump(model),
        "canonical.cifra.md": canonical,
        "parsed.json": dump(parse(canonical)),
    }


def generate_setlist(entry: pathlib.Path) -> dict[str, str]:
    """A setlist reading entry's outputs (spec §10.6, §10.9), the song reading
    entry's four files with `.setlist.md` for the texts."""
    from cifra_md.setlist import parse_setlist, write_setlist

    source = (entry / "input.setlist.md").read_bytes()
    model = parse_setlist(source)
    canonical = write_setlist(model)
    return {
        "input.parsed.json": dump(model),
        "canonical.setlist.md": canonical,
        "parsed.json": dump(parse_setlist(canonical)),
    }


def main(argv) -> int:
    if argv == ["--write"]:
        for entry in entries():
            for name, text in generate(entry).items():
                (entry / name).write_bytes(text.encode("utf-8"))
            print("wrote", entry.name)
        for entry in setlist_entries():
            for name, text in generate_setlist(entry).items():
                (entry / name).write_bytes(text.encode("utf-8"))
            print("wrote", entry.name)
        for entry in merge_entries():
            files = generate_merge(entry)
            for path in stale_outputs(entry, files):
                path.unlink()
            for name, text in files.items():
                (entry / name).write_bytes(text.encode("utf-8"))
            print("wrote merge/" + entry.name)
        return 0
    if argv == ["--check"]:
        bad = 0
        for entry in entries():
            for name, text in generate(entry).items():
                path = entry / name
                if not path.exists() or path.read_bytes() != text.encode("utf-8"):
                    print(f"{name} differs: {entry.name}")
                    bad += 1
        for entry in setlist_entries():
            for name, text in generate_setlist(entry).items():
                path = entry / name
                if not path.exists() or path.read_bytes() != text.encode("utf-8"):
                    print(f"{name} differs: {entry.name}")
                    bad += 1
        for entry in merge_entries():
            files = generate_merge(entry)
            for name, text in files.items():
                path = entry / name
                if not path.exists() or path.read_bytes() != text.encode("utf-8"):
                    print(f"{name} differs: merge/{entry.name}")
                    bad += 1
            for path in stale_outputs(entry, files):
                print(f"{path.name} should not exist: merge/{entry.name}")
                bad += 1
        print("ok" if not bad else f"{bad} problems")
        return 1 if bad else 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
