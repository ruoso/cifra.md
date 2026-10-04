"""Spec §11.15: every example of the chapter that shows a text is what the
implementation gives, byte for byte. The examples' merges are entries of the
merge corpus; this test holds the chapter's code blocks to those entries'
files, so the chapter and the corpus cannot drift apart."""

import re

import pytest

from conftest import ROOT

SPEC = ROOT / "spec" / "11-merge.md"
MERGE = ROOT / "corpus" / "merge"


def blocks() -> dict[str, list[str]]:
    """The fenced code blocks of each subsection of §11.15, in order."""
    out: dict[str, list[str]] = {}
    section = None
    lines = SPEC.read_text().split("\n")
    k = 0
    while k < len(lines):
        ln = lines[k]
        m = re.match(r"^### (11\.15\.\d+)", ln)
        if m:
            section = m.group(1)
        elif ln.startswith("## "):
            section = None
        f = re.match(r"^(`{3,})", ln)
        if f and section:
            fence = f.group(1)
            body = []
            k += 1
            while lines[k] != fence:
                body.append(lines[k])
                k += 1
            out.setdefault(section, []).append("\n".join(body) + "\n")
        k += 1
    return out


BLOCKS = blocks()

# (subsection, block, entry, file, how): `whole` compares the files, `part`
# finds the block's lines as consecutive lines of the file.
EXAMPLES = [
    ("11.15.1", 0, "01-different-sections", "base.cifra.md", "whole"),
    ("11.15.1", 1, "01-different-sections", "result.cifra.md", "whole"),
    ("11.15.2", 0, "02-one-line-two-changes", "marked.cifra.md", "whole"),
    ("11.15.2", 1, "02-one-line-two-changes", "conflicts.json", "whole"),
    ("11.15.3", 0, "04-section-deleted-and-changed", "marked.cifra.md", "whole"),
    ("11.15.4", 0, "06-sung-line-two-changes", "base.cifra.md", "whole"),
    ("11.15.4", 1, "06-sung-line-two-changes", "marked.cifra.md", "whole"),
    ("11.15.5", 0, "08-two-instruments-two-markers", "base.cifra.md", "whole"),
    ("11.15.5", 1, "08-two-instruments-two-markers", "result.cifra.md", "whole"),
    ("11.15.6", 0, "10-marker-renumbered", "base.cifra.md", "whole"),
    ("11.15.6", 1, "10-marker-renumbered", "result.cifra.md", "whole"),
    ("11.15.7", 0, "11-line-changed-under-new-marker", "marked.cifra.md", "whole"),
    ("11.15.8", 0, "12-two-shapes-one-chord", "marked.cifra.md", "whole"),
    ("11.15.8", 1, "12-two-shapes-one-chord", "conflicts.json", "whole"),
    ("11.15.9", 0, "14-bar-split-chord-revoiced", "result.cifra.md", "whole"),
    ("11.15.10", 0, "16-variation-renamed-and-edited", "base.cifra.md", "whole"),
    ("11.15.10", 1, "16-variation-renamed-and-edited", "result.cifra.md", "part"),
    ("11.15.10", 2, "17-variation-deleted-and-edited", "marked.cifra.md", "part"),
    ("11.15.11", 0, "19-one-tuning-two-spellings", "ours.cifra.md", "part"),
    ("11.15.11", 1, "19-one-tuning-two-spellings", "theirs.cifra.md", "part"),
    ("11.15.11", 2, "19-one-tuning-two-spellings", "result.cifra.md", "part"),
    ("11.15.12", 0, "20-properties-added", "base.cifra.md", "whole"),
    ("11.15.12", 1, "20-properties-added", "result.cifra.md", "part"),
    ("11.15.12", 2, "21-property-two-values", "marked.cifra.md", "part"),
    ("11.15.12", 3, "22-reading-notation", "marked.cifra.md", "whole"),
    ("11.15.12", 4, "22-reading-notation", "conflicts.json", "whole"),
    ("11.15.13", 0, "23-added-on-both-sides", "ours.cifra.md", "whole"),
    ("11.15.13", 1, "23-added-on-both-sides", "marked.cifra.md", "whole"),
    ("11.15.14", 0, "24-setlist-moved-and-added", "base.setlist.md", "whole"),
    ("11.15.14", 1, "24-setlist-moved-and-added", "result.setlist.md", "whole"),
    ("11.15.14", 2, "25-setlist-removed-and-changed", "marked.setlist.md", "whole"),
    ("11.15.14", 3, "25-setlist-removed-and-changed", "conflicts.json", "whole"),
    ("11.15.15", 0, "58-bar-moved-to-existing-marker", "base.cifra.md", "whole"),
    ("11.15.15", 1, "58-bar-moved-to-existing-marker", "result.cifra.md", "whole"),
    ("11.15.16", 0, "57-new-chord-on-both-sides", "result.cifra.md", "whole"),
    ("11.15.17", 0, "56-only-line-of-a-chord-deleted", "base.cifra.md", "whole"),
    ("11.15.17", 1, "56-only-line-of-a-chord-deleted", "result.cifra.md", "whole"),
    ("11.15.18", 0, "26-marked-ours", "ours.cifra.md", "whole"),
    ("11.15.18", 1, "26-marked-ours", "conflicts.json", "whole"),
    ("11.15.19", 0, "69-joined-on-both-sides", "base.cifra.md", "whole"),
    ("11.15.19", 1, "69-joined-on-both-sides", "result.cifra.md", "whole"),
    ("11.15.20", 0, "66-setlist-song-played-twice", "base.setlist.md", "whole"),
    ("11.15.20", 1, "66-setlist-song-played-twice", "result.setlist.md", "whole"),
    ("11.15.20", 2, "67-setlist-note-on-the-first-copy", "result.setlist.md", "whole"),
]


def test_every_block_of_the_examples_is_checked():
    checked = {(s, b) for s, b, *_ in EXAMPLES}
    assert checked == {(s, b) for s, bs in BLOCKS.items() for b in range(len(bs))}


@pytest.mark.parametrize("section,block,entry,name,how", EXAMPLES, ids=[f"{e[0]}-{e[1]}" for e in EXAMPLES])
def test_the_example_is_what_the_merge_gives(section, block, entry, name, how):
    shown = BLOCKS[section][block]
    actual = (MERGE / entry / name).read_text()
    if how == "whole":
        assert shown == actual
    else:
        want = shown.rstrip("\n").split("\n")
        have = actual.rstrip("\n").split("\n")
        assert any(have[k : k + len(want)] == want for k in range(len(have))), (shown, actual)
