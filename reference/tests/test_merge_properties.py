"""Spec §11.3: the properties of the merge, over generated documents.

Each case is a base and two sides made from it by the edits people make
(merge_gen.py). The checks: unchanged sides change nothing; the result is
canonical and a fixed point; exchanging the sides mirrors the outcome, but
for the numbering of §11.9.5; resolving a marked text by either side gives
a document; changes to different sections, and to the voicings of different
tunings, never conflict.
"""

import random

import pytest

from cifra_md import is_canonical, parse
from cifra_md.merge import canonical_song, merge
from cifra_md.setlist import canonicalise_setlist
from cifra_md.text import marker_lines
from merge_gen import document, edit, edit_setlist, only_section_changed, setlist
from merge_props import resolve, symmetric

SEEDS = range(12)
N = 25


def cases(seed, make=document, change=edit):
    rnd = random.Random(seed)
    for _ in range(N):
        b = make(rnd)
        yield b, change(rnd, b), change(rnd, b)


@pytest.mark.parametrize("seed", SEEDS)
def test_unchanged_sides_change_nothing(seed):
    for b, x, y in cases(seed):
        for side in (x, y):
            c = canonical_song(side)
            assert merge(b, side, side).result == c
            assert merge(b, b, side).result == c
            assert merge(b, side, b).result == c


@pytest.mark.parametrize("seed", SEEDS)
def test_the_result_is_canonical_and_a_fixed_point(seed):
    for b, o, t in cases(seed):
        r = merge(b, o, t)
        if r.result is not None:
            assert is_canonical(r.result), (b, o, t)
            assert merge(r.result, r.result, r.result).result == r.result


@pytest.mark.parametrize("seed", SEEDS)
def test_merging_depends_on_canonical_forms_only(seed):
    def messy(s):
        # what the text layer removes (§1.3): a byte order mark, CR LF, trailing spaces
        return "\ufeff" + s.replace("\n", "  \r\n")

    for b, o, t in cases(seed):
        assert canonical_song(messy(o)) == canonical_song(o)
        r, r2 = merge(b, o, t), merge(messy(b), messy(o), messy(t))
        assert (r.result, r.marked, r.conflicts) == (r2.result, r2.marked, r2.conflicts)


@pytest.mark.parametrize("seed", SEEDS)
def test_exchanging_the_sides_mirrors_the_outcome(seed):
    for b, o, t in cases(seed):
        assert symmetric(merge(b, o, t), merge(b, t, o)), (b, o, t)


@pytest.mark.parametrize("seed", SEEDS)
def test_resolving_by_one_side_gives_a_document(seed):
    for b, o, t in cases(seed):
        r = merge(b, o, t)
        if r.marked is None:
            continue
        lines = r.marked.split("\n")
        for c in r.conflicts:
            assert lines[c["line"] - 1] == "<<<<<<< ours"
        for side in ("ours", "theirs"):
            resolved = resolve(r.marked, side)
            assert not marker_lines(resolved)
            text = canonical_song(resolved)
            assert canonical_song(text) == text


@pytest.mark.parametrize("seed", SEEDS)
def test_changes_to_different_sections_do_not_conflict(seed):
    """Edits confined to one section each. A side whose edit reached another
    section (an anchor carried on, §2.8) or changed whether the document is
    sung (§4.2), which changes how every line reads, is left out."""
    rnd = random.Random(seed)
    tried = 0
    while tried < N:
        b = document(rnd)
        n = len(parse(b)["sections"])
        if n < 2:
            continue
        i, j = rnd.sample(range(n), 2)
        o, t = edit(rnd, b, ("section", i)), edit(rnd, b, ("section", j))
        if not (only_section_changed(b, o, i) and only_section_changed(b, t, j)):
            continue
        if not parse(b)["sung"] == parse(o)["sung"] == parse(t)["sung"]:
            continue
        tried += 1
        r = merge(b, o, t)
        assert r.result is not None, (b, o, t, r.marked)


@pytest.mark.parametrize("seed", SEEDS)
def test_voicings_of_different_tunings_do_not_conflict(seed):
    rnd = random.Random(seed)
    tried = 0
    while tried < N:
        b = document(rnd)
        if "## Voicings: G4 C4 E4 A4" not in b or "## Voicings: E2 A2 D3 G3 B3 E4" not in b:
            continue
        tried += 1
        o, t = edit(rnd, b, ("tuning", "E2 A2 D3 G3 B3 E4")), edit(rnd, b, ("tuning", "G4 C4 E4 A4"))
        r = merge(b, o, t)
        assert r.result is not None, (b, o, t, r.marked)


@pytest.mark.parametrize("seed", SEEDS)
def test_setlists(seed):
    for b, o, t in cases(seed, setlist, edit_setlist):
        for side in (o, t):
            c = canonicalise_setlist(side)
            assert merge(b, side, side, setlist=True).result == c
            assert merge(b, b, side, setlist=True).result == c
            assert merge(b, side, b, setlist=True).result == c
        r, r2 = merge(b, o, t, setlist=True), merge(b, t, o, setlist=True)
        assert symmetric(r, r2), (b, o, t)
        if r.result is not None:
            assert canonicalise_setlist(r.result) == r.result
        else:
            for side in ("ours", "theirs"):
                resolved = resolve(r.marked, side)
                assert not marker_lines(resolved)
                text = canonicalise_setlist(resolved)
                assert canonicalise_setlist(text) == text
