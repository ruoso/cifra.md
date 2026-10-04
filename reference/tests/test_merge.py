"""Spec §11: the parts of the merge, one rule at a time, and the git merge
driver (§11.14). The worked examples are in test_merge_examples.py, the
corpus in test_merge_corpus.py, the properties in test_merge_properties.py."""

import json

import pytest

from cifra_md.merge import (
    CONFLICT,
    KeyMatch,
    align,
    conflicts_json,
    keyed_order,
    merge,
    merge_sequence,
    merge_value,
    pairs_of,
    side_changes,
)

F = "```"
eq = lambda x, y: x == y


# --- §11.6 values ---


@pytest.mark.parametrize(
    "a,x,y,want",
    [
        ("a", "a", "a", "a"),
        ("a", "b", "a", "b"),
        ("a", "a", "b", "b"),
        ("a", "b", "b", "b"),
        ("a", "b", "c", CONFLICT),
        (None, "b", None, "b"),
        ("a", None, "a", None),
        ("a", None, "b", CONFLICT),
        (None, "b", "c", CONFLICT),
    ],
)
def test_values(a, x, y, want):
    assert merge_value(a, x, y) is want or merge_value(a, x, y) == want


# --- §11.5 sequences ---


def test_alignment_pairs_whenever_it_can_and_drops_before_it_takes():
    assert align(list("ab"), list("ba"), eq) == [("drop", 0, None), ("pair", 1, 0), ("take", 2, 1)]
    assert pairs_of(align(list("abc"), list("xbc"), eq)) == {1: 1, 2: 2}


def test_a_run_dropping_as_many_as_it_takes_is_one_change_per_element():
    A, C = list("abcd"), list("aXYd")
    changes = side_changes("ours", A, C, align(A, C, eq), {}, eq)
    assert [(c.a, c.b, c.run) for c in changes] == [(1, 2, ["X"]), (2, 3, ["Y"])]


def test_a_run_of_different_lengths_is_one_change():
    A, C = list("abcd"), list("aXYZd")
    changes = side_changes("ours", A, C, align(A, C, eq), {}, eq)
    assert [(c.a, c.b, c.run) for c in changes] == [(1, 3, ["X", "Y", "Z"])]


def test_adjacent_lines_and_insertions_next_to_a_change_do_not_touch():
    A = list("abcd")
    pieces = merge_sequence(A, list("aXcd"), list("abYd"), eq, eq, eq)
    assert [p[0] for p in pieces] == ["both", "one", "one", "both"]
    pieces = merge_sequence(A, list("aXbcd"), list("abcYd"), eq, eq, eq)
    assert "conflict" not in [p[0] for p in pieces]
    # a change to a line and an insertion just before it
    pieces = merge_sequence(A, list("aXbcd"), list("aYcd"), eq, eq, eq)
    assert [p[2] if p[0] == "one" else p[1] for p in pieces] == ["a", "X", "Y", "c", "d"]


def test_two_insertions_at_one_place_conflict_after_their_common_ends():
    pieces = merge_sequence(list("ab"), list("aPXQb"), list("aPYQb"), eq, eq, eq)
    assert pieces == [("both", "a", "a", "a"), ("common", "P", "P"), ("conflict", [], ["X"], ["Y"]), ("common", "Q", "Q"), ("both", "b", "b", "b")]


def test_identical_changes_are_taken_once():
    pieces = merge_sequence(list("abc"), list("aXc"), list("aXc"), eq, eq, eq)
    assert pieces == [("both", "a", "a", "a"), ("common", "X", "X"), ("both", "c", "c", "c")]


def test_an_insertion_inside_a_cluster_joins_it():
    # ours replaces b..c; theirs inserts between them
    pieces = merge_sequence(list("abcd"), list("aXd"), list("abYcd"), eq, eq, eq)
    assert pieces == [("both", "a", "a", "a"), ("conflict", ["b", "c"], ["X"], ["b", "Y", "c"]), ("both", "d", "d", "d")]


def test_deletions_that_overlap_conflict_over_what_each_kept():
    pieces = merge_sequence(list("abcde"), list("ade"), list("abe"), eq, eq, eq)
    assert pieces[1] == ("conflict", ["b", "c", "d"], ["d"], ["b"])


def test_combining_is_symmetric():
    key = lambda x: x
    p1 = merge_sequence(["a"], ["a", "c"], ["a", "b"], eq, eq, eq, "combine", sort_key=key, identity=key)
    p2 = merge_sequence(["a"], ["a", "b"], ["a", "c"], eq, eq, eq, "combine", sort_key=key, identity=key)
    assert p1 == p2 == [("both", "a", "a", "a"), ("combined", "b"), ("combined", "c")]


def test_keyed_order_puts_back_an_identity_one_side_kept():
    # ours deleted b, which theirs changed: b is in the result, after a as theirs has it
    assert keyed_order(list("abc"), list("ac"), list("abc"), set("abc"), lambda x: x) == list("abc")
    # two reorders of one stretch are both kept, combined
    assert keyed_order(list("abc"), list("cab"), list("bca"), set("abc"), lambda x: x) == list("cba")


# --- §11.9.2 corresponding keys ---


def K(s):
    return (s.split("[")[0], int(s.split("[")[1][:-1]) if "[" in s else 1)


def test_the_key_that_keeps_most_occurrences_continues_a_base_key():
    corr = [(K("Cm"), K("Cm"))] * 3 + [(K("Cm"), K("Cm[2]"))]
    km = KeyMatch({K("Cm")}, {K("Cm"), K("Cm[2]")}, corr)
    assert km.match == {K("Cm"): K("Cm")} and K("Cm[2]") not in km.mu


def test_renumbering_is_not_re_keying():
    km = KeyMatch({K("Cm"), K("Cm[2]"), K("Cm[3]")}, {K("Cm"), K("Cm[2]")}, [(K("Cm"), K("Cm")), (K("Cm[3]"), K("Cm[2]"))])
    assert km.match == {K("Cm"): K("Cm"), K("Cm[3]"): K("Cm[2]")}


def test_between_equal_counts_a_key_that_kept_its_index_wins():
    corr = [(K("Cm"), K("Cm[2]")), (K("Cm[2]"), K("Cm[2]"))]
    km = KeyMatch({K("Cm"), K("Cm[2]")}, {K("Cm"), K("Cm[2]")}, corr)
    assert km.match == {K("Cm[2]"): K("Cm[2]")}


def test_a_key_whose_only_occurrences_changed_keeps_its_name():
    km = KeyMatch({K("Cm"), K("Cm[2]")}, {K("Cm"), K("Cm[2]")}, [(K("Cm"), K("Cm"))])
    assert km.match == {K("Cm"): K("Cm"), K("Cm[2]"): K("Cm[2]")}


# --- §11.4 whole files ---

SONG = f"## A\n{F}\nC | G\n{F}\n"
SONG2 = f"## A\n{F}\nC | G7\n{F}\n"
MESSY = f"##   A\r\n~~~\r\nC  |   G\r\n~~~\r\n"


@pytest.mark.parametrize(
    "b,o,t,kind,want",
    [
        (None, None, MESSY, "result", SONG),
        (None, MESSY, None, "result", SONG),
        (None, SONG, MESSY, "result", SONG),
        (SONG, None, None, "deleted", None),
        (SONG, None, MESSY, "deleted", None),
        (SONG, None, SONG2, "conflicts", [{"kind": "file", "deleted": "ours"}]),
        (SONG, MESSY, None, "deleted", None),
        (SONG, SONG2, None, "conflicts", [{"kind": "file", "deleted": "theirs"}]),
        (SONG, b"\xff", SONG2, "conflicts", [{"kind": "file", "unreadable": ["ours"]}]),
        (b"\xfe", SONG, b"\xff", "conflicts", [{"kind": "file", "unreadable": ["base", "theirs"]}]),
    ],
)
def test_whole_files(b, o, t, kind, want):
    r = merge(b, o, t)
    assert r.kind == kind
    if kind == "result":
        assert r.result == want
    elif kind == "conflicts":
        assert r.conflicts == want and r.marked is None


# --- §11.4 marked inputs ---

MARKED = f"## A\n{F}\n<<<<<<< ours\nC | G7\n=======\nC | Em\n>>>>>>> theirs\n{F}\n"


@pytest.mark.parametrize(
    "b,o,t,want",
    [
        (SONG, MARKED, SONG2, {"ours": 3}),
        (MARKED, SONG, SONG2, {"base": 3}),
        (SONG, SONG2, MARKED, {"theirs": 3}),
        (MARKED, MARKED, SONG2, {"base": 3, "ours": 3}),
        # after the text layer: a BOM, CR LF, a tab and trailing spaces
        (SONG, SONG, "\ufeff## A\r\n\r\n=======\t  \r\n", {"theirs": 3}),
        (SONG, SONG, "## A\n|||||||  base\n", {"theirs": 2}),
    ],
)
def test_a_marked_input_is_never_merged(b, o, t, want):
    r = merge(b, o, t)
    assert r.kind == "conflicts" and r.marked is None and r.result is None
    assert r.conflicts == [{"kind": "unresolved", **want}]
    assert r.kept is o


def test_a_marked_input_stops_before_the_unchanged_sides():
    # merging b, b, x would give x; a marked x is not merged at all
    assert merge(SONG, SONG, MARKED).conflicts == [{"kind": "unresolved", "theirs": 3}]
    assert merge(MARKED, SONG, SONG).conflicts == [{"kind": "unresolved", "base": 3}]
    assert merge(None, None, MARKED).conflicts == [{"kind": "unresolved", "theirs": 3}]


def test_a_marked_input_leaves_ours_exactly_as_it_is():
    ours = MARKED.replace("\n", "\r\n").encode("utf-8")
    r = merge(SONG, ours, SONG2)
    assert r.kept is ours
    assert merge(SONG, None, MARKED).kept is None


def test_deleted_on_both_sides_and_unreadable_come_before_a_marked_input():
    assert merge(MARKED, None, None).deleted
    assert merge(MARKED, b"\xff", SONG).conflicts == [{"kind": "file", "unreadable": ["ours"]}]


def test_a_marked_setlist_is_never_merged():
    b = "1. [A](a.cifra.md)\n"
    t = b + "<<<<<<< ours\n2. [B](b.cifra.md)\n=======\n>>>>>>> theirs\n"
    r = merge(b, b + "2. [C](c.cifra.md)\n", t, setlist=True)
    assert r.conflicts == [{"kind": "unresolved", "theirs": 2}] and r.marked is None


def test_exchanging_the_sides_names_the_other_input():
    assert merge(SONG, SONG2, MARKED).conflicts == [{"kind": "unresolved", "theirs": 3}]
    assert merge(SONG, MARKED, SONG2).conflicts == [{"kind": "unresolved", "ours": 3}]


def test_unresolved_json_members_are_in_order():
    data = json.loads(conflicts_json(merge(MARKED, MARKED, MARKED)))
    assert data == {"conflicts": [{"kind": "unresolved", "base": 3, "ours": 3, "theirs": 3}]}
    assert list(data["conflicts"][0]) == ["kind", "base", "ours", "theirs"]


def test_an_empty_base_is_the_empty_document():
    assert merge("", SONG, SONG2).conflicts == merge(None, SONG, SONG2).conflicts


def test_json_members_are_in_order():
    r = merge(SONG, SONG2, SONG.replace("C | G", "C | Em"))
    data = json.loads(conflicts_json(r))
    assert list(data["conflicts"][0]) == ["kind", "line", "base", "ours", "theirs"]


# --- §11.10.3 a side that kept no occurrence of a key ---


def test_a_side_that_deleted_every_use_of_a_key_did_not_decide_its_shape():
    base = f"## A\n{F}\nCm | F\nG | G\n{F}\n\n---\n\n## Voicings: E2 A2 D3 G3 B3 E4\n- Cm: x35543\n"
    ours = base.replace("G | G\n", "G | G\nCm | G\n")
    theirs = base.replace("Cm | F\n", "")
    assert "- Cm: x35543" in merge(base, ours, theirs).result
    assert "- Cm: x35543" in merge(base, theirs, ours).result


def test_a_chord_new_to_both_sides_is_one_chord():
    base = f"## A\n{F}\nC | G\n{F}\n\n## B\n{F}\nF | C\n{F}\n"
    r = merge(base, base.replace("C | G\n", "C | G\nE7 | Am\n"), base.replace("F | C\n", "F | C\nE7 | Dm\n"))
    assert "E7[2]" not in r.result


def test_a_key_used_only_by_unknown_tokens_merges_by_its_text():
    base = f"## A\n{F}\nCm | X[2]\n{F}\n\n---\n\n## Voicings: E2 A2 D3 G3 B3 E4\n- X[2]: x00000\n"
    r = merge(base, base.replace("x00000", "000000"), base.replace("Cm | X[2]", "Cm | X[2] | G"))
    assert r.result.endswith("- X[2]: 000000\n")


# --- §11.9.4 rule 4: a distinction only base made ---

GUITAR = "## Voicings: E2 A2 D3 G3 B3 E4"


def song(chart, *voicings):
    text = f"## A\n{F}\n{chart}\n{F}\n"
    if voicings:
        text += f"\n---\n\n{GUITAR}\n" + "".join(f"- {v}\n" for v in voicings)
    return text


def test_keys_both_sides_joined_are_one_key_with_no_shapes():
    base = song("Cm | F7 | Cm[2] | G7\nF | G7")
    ours = "- key: Cm\n\n" + song("Cm | F7 | Cm | G7\nF | G7")
    theirs = song("Cm | F7 | Cm | G7\nF | G7(b9)")
    want = "- key: Cm\n\n" + song("Cm | F7 | Cm | G7\nF | G7(b9)")
    assert merge(base, ours, theirs).result == want
    assert merge(base, theirs, ours).result == want


def test_keys_one_side_still_tells_apart_stay_apart():
    # theirs kept bar 3's marker, so theirs tells the two apart, and with
    # no shapes nothing joins them again (§8.3 I3)
    base = song("Cm | F7 | Cm[2] | G7\nF | G7")
    ours = song("Cm | F7 | Cm | G7\nF | G7")
    theirs = song("Cm | F7 | Cm[2] | G7\nF | G7(b9)")
    assert merge(base, ours, theirs).result == song("Cm | F7 | Cm[2] | G7\nF | G7(b9)")


def test_a_join_by_one_side_against_an_unchanged_side_is_that_side():
    base = song("Cm | Cm[2]")
    assert merge(base, base, song("Cm | Cm")).result == song("Cm | Cm")
    assert merge(base, song("Cm | Cm"), base).result == song("Cm | Cm")


def test_a_joined_variant_has_the_shape_of_the_base_key_most_of_it_continues():
    # Cm has three bars, Cm[2] one: the joined variant's base voicing is Cm's,
    # so theirs, which kept it, takes ours's new shape
    base = song("Cm | Cm | Cm[2] | Cm", "Cm: x35543", "Cm[2]: 8-10-10-8-8-8")
    ours = song("Cm | Cm | Cm | Cm", "Cm: x3554x")
    theirs = "# Tarde\n\n" + song("Cm | Cm | Cm | Cm", "Cm: x35543")
    want = "# Tarde\n\n" + song("Cm | Cm | Cm | Cm", "Cm: x3554x")
    assert merge(base, ours, theirs).result == want
    assert merge(base, theirs, ours).result == want


def test_a_joined_variant_conflicts_when_both_sides_moved_off_its_base_shape():
    # Cm[2] has three bars: base's voicing is Cm[2]'s, which neither side kept
    base = song("Cm | Cm[2] | Cm[2] | Cm[2]", "Cm: x35543", "Cm[2]: 8-10-10-8-8-8")
    ours = song("Cm | Cm | Cm | Cm", "Cm: x3554x")
    theirs = song("Cm | Cm | Cm | Cm", "Cm: x35543")
    r = merge(base, ours, theirs)
    assert [(c["kind"], c["key"], c["base"], c["ours"], c["theirs"]) for c in r.conflicts] == [
        ("voicing", "Cm", "8-10-10-8-8-8", "x3554x", "x35543")
    ]


def test_between_equal_numbers_the_joined_variant_continues_the_least_index():
    base = song("Cm | Cm[2]", "Cm: x35543", "Cm[2]: 8-10-10-8-8-8")
    ours = song("Cm | Cm", "Cm: x3554x")
    theirs = "# Tarde\n\n" + song("Cm | Cm", "Cm: x35543")
    assert merge(base, ours, theirs).result == "# Tarde\n\n" + song("Cm | Cm", "Cm: x3554x")
    theirs = "# Tarde\n\n" + song("Cm | Cm", "Cm: 8-10-10-8-8-8")
    assert merge(base, ours, theirs).conflicts[0]["base"] == "x35543"


def test_a_joined_variant_is_numbered_by_the_base_key_it_continues():
    # Cm[3]'s two bars joined into Cm[2]'s one: the variant continues Cm[3]
    # and is numbered after Cm, which no one joined
    base = song("Cm | Cm[2] | Cm[3] | Cm[3]\nF | G")
    ours = song("Cm | Cm[2] | Cm[2] | Cm[2]\nF | G")
    theirs = song("Cm | Cm[2] | Cm[2] | Cm[2]\nF | G7")
    assert merge(base, ours, theirs).result == song("Cm | Cm[2] | Cm[2] | Cm[2]\nF | G7")


def test_joining_takes_the_base_key_most_occurrences_have_none_aside():
    from cifra_md.merge import SongMerge

    a, b, o, t = K("Cm"), K("Cm[2]"), K("Cm[3]"), K("Cm[4]")
    sigs = [[(None, o, t), (b, o, t)], [(a, o, t), (b, o, t)], [(a, o, None), (b, o, None)]]
    SongMerge.join_base_only(sigs)
    assert sigs == [[(b, o, t), (b, o, t)], [(b, o, t), (b, o, t)], [(a, o, None), (b, o, None)]]
    sigs = [[(None, o, t)]]
    SongMerge.join_base_only(sigs)
    assert sigs == [[(None, o, t)]]


def test_a_key_of_unknown_tokens_is_not_joined():
    base = song("Cm | Cm[2] | X[2]\nF | G", "Cm: x35543", "X[2]: x00000")
    ours = song("Cm | Cm | X[2]\nF | G", "Cm: x35543", "X[2]: x00000")
    theirs = song("Cm | Cm | X[2]\nF | G7", "Cm: x35543", "X[2]: x00000")
    assert merge(base, ours, theirs).result == song("Cm | Cm | X[2]\nF | G7", "Cm: x35543", "X[2]: x00000")


# --- §11.13 a song played more than once ---


def setlist_text(*items):
    lines = ["# Friday", ""]
    for n, it in enumerate(items, 1):
        name, *entries = it.split(";")
        lines.append(f"{n}. [{name}]({name.lower()}.cifra.md)" if not name.startswith("~") else f"{n}. {name[1:]}")
        lines.extend(f"{' ' * (len(str(n)) + 2)}- {e}" for e in entries)
    return "\n".join(lines) + "\n"


def ids(base, side):
    from cifra_md.setlist import parse_setlist
    from cifra_md.setlist_merge import side_body_ids

    return [(i[1].split(".")[0], i[2]) for i in side_body_ids(parse_setlist(base)["body"], parse_setlist(side)["body"])]


def test_a_copy_inserted_before_another_is_the_new_one():
    b = setlist_text("A", "B", "A")
    assert ids(b, setlist_text("A;key: D", "A", "B", "A")) == [("a", 3), ("a", 1), ("b", 1), ("a", 2)]


def test_a_copy_changed_pairs_with_the_base_copy_in_its_place():
    b = setlist_text("A", "B", "A")
    # step 2: the changed last copy is base's second, the new first copy is new
    assert ids(b, setlist_text("A;key: D", "A", "B", "A;note: encore")) == [("a", 3), ("a", 1), ("b", 1), ("a", 2)]


def test_a_copy_moved_pairs_in_order_of_appearance():
    b = setlist_text("A", "B", "A;note: encore")
    # step 3: B, unpaired by both alignments, is base's B; the plain A is deleted
    assert ids(b, setlist_text("A;note: encore", "B")) == [("a", 2), ("b", 1)]
    assert ids(setlist_text("A", "B"), setlist_text("B", "A")) == [("b", 1), ("a", 1)]


def test_new_copies_are_numbered_after_base_s():
    assert ids(setlist_text("A"), setlist_text("A", "B", "A", "A")) == [("a", 1), ("b", 1), ("a", 2), ("a", 3)]
    assert ids(setlist_text("~a song", "~a song"), setlist_text("~a song", "~a song", "~a song")) == [
        ("a song", 1), ("a song", 2), ("a song", 3)
    ]


def test_a_song_played_twice_keeps_each_copy_s_entries():
    b = setlist_text("A", "B", "A")
    o = setlist_text("A;key: D", "A", "B", "A")
    t = setlist_text("A", "B", "A;note: encore")
    want = setlist_text("A;key: D", "A", "B", "A;note: encore")
    assert merge(b, o, t, setlist=True).result == want
    assert merge(b, t, o, setlist=True).result == want
    # the note on the first copy stays on the first copy
    t = setlist_text("A;note: slow", "B", "A")
    want = setlist_text("A;key: D", "A;note: slow", "B", "A")
    assert merge(b, o, t, setlist=True).result == want


def test_a_copy_added_by_both_sides_is_one_item():
    b = setlist_text("A", "B")
    assert merge(b, setlist_text("A", "B", "A"), setlist_text("A", "B", "A", "C"), setlist=True).result == setlist_text(
        "A", "B", "A", "C"
    )


def test_a_copy_removed_and_changed_names_its_occurrence():
    b = setlist_text("A", "B", "A;key: D")
    r = merge(b, setlist_text("A", "B"), setlist_text("A;note: slow", "B", "A;key: E"), setlist=True)
    data = json.loads(conflicts_json(r))["conflicts"]
    assert [(c["kind"], c["item"], c.get("occurrence")) for c in data] == [("item", "a.cifra.md", 2)]


# --- §11.14 the git merge driver ---


def driver(tmp_path, b, o, t, name="song.cifra.md", extra=()):
    from cifra_md.__main__ import main

    paths = []
    for side, text in (("base", b), ("ours", o), ("theirs", t)):
        p = tmp_path / side
        if text is not None:
            p.write_bytes(text.encode("utf-8") if isinstance(text, str) else text)
        paths.append(str(p))
    code = main(["merge", *extra, *paths, name])
    ours = tmp_path / "ours"
    return code, ours.read_bytes().decode("utf-8") if ours.exists() else None


def test_the_driver_writes_the_result(tmp_path):
    assert driver(tmp_path, SONG, MESSY, SONG2) == (0, SONG2)


def test_the_driver_writes_the_marked_text(tmp_path):
    code, text = driver(tmp_path, SONG, SONG2, SONG.replace("C | G", "C | Em"))
    assert code == 1 and text.split("\n")[2] == "<<<<<<< ours"


def test_the_driver_leaves_ours_alone_when_an_input_is_not_utf8(tmp_path, capsys):
    assert driver(tmp_path, SONG, MESSY, b"\xff") == (1, MESSY)
    assert "not UTF-8" in capsys.readouterr().err


def test_the_driver_leaves_ours_alone_when_an_input_is_marked(tmp_path, capsys):
    ours = MARKED.replace("\n", "\r\n")
    code, text = driver(tmp_path, SONG, ours.encode("utf-8"), SONG2)
    assert (code, text) == (1, ours)
    err = capsys.readouterr().err
    assert "conflict markers" in err and "ours (line 3)" in err


def test_the_driver_takes_an_empty_base_as_no_base(tmp_path):
    assert driver(tmp_path, "", SONG, MESSY) == (0, SONG)


def test_the_driver_merges_a_setlist_by_its_path(tmp_path):
    b = "1. [A](a.cifra.md)\n"
    code, text = driver(tmp_path, b, b + "2. [B](b.cifra.md)\n", "1.  [A](a.cifra.md)\n- key: D\n", name="gig.setlist.md")
    assert code == 0 and text == "1. [A](a.cifra.md)\n   - key: D\n2. [B](b.cifra.md)\n"


def test_the_driver_prints_the_conflicts_as_json(tmp_path, capsys):
    driver(tmp_path, SONG, SONG2, SONG.replace("C | G", "C | Em"), extra=["--json"])
    assert json.loads(capsys.readouterr().out)["conflicts"][0]["kind"] == "chart"
