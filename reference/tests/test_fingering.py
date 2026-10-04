"""Spec §7.5.1: fingerings."""

from cifra_md import parse, write
from cifra_md.frets import check_fingers, format_fingers, parse_fingers

GUITAR = "E2 A2 D3 G3 B3 E4"


def doc(items):
    return parse("```\nC\n```\n---\n## Voicings: " + GUITAR + "\n" + items)


def test_parse_fingers_forms():
    assert parse_fingers("3 2 - - - 4") == [3, 2, None, None, None, 4]
    assert parse_fingers("32---4") == [3, 2, None, None, None, 4]
    assert parse_fingers("1 1 2 3 4 1") == [1, 1, 2, 3, 4, 1]
    assert parse_fingers("T 0 2 3 4 1") == ["T", None, 2, 3, 4, 1]
    assert parse_fingers("t12341") == ["T", 1, 2, 3, 4, 1]
    for bad in ("", "5 2 - - - 4", "3 2 x - - 4", "a b"):
        assert parse_fingers(bad) is None, bad


def test_check_fingers():
    assert check_fingers([3, 2, None, None, None, 4], [3, 2, 0, 0, 0, 3]) is None
    assert check_fingers([1, 1, 2, 3, 4, 1], [1, 1, 3, 3, 3, 1]) is None
    assert "6 finger positions for 4 strings" == check_fingers([1, 1, 2, 3, 4, 1], [0, 3, 3, 3])
    assert "not fretted" in check_fingers([1, None, None, None, None, None], ["x", 3, 2, 0, 1, 0])
    assert "not fretted" in check_fingers([None, None, None, 1, None, None], ["x", 3, 2, 0, 1, 0])
    assert "finger 1 on frets 1 and 3" == check_fingers([1, 1, 1, None, None, None], [1, 1, 3, 3, 3, 1])


def test_fingering_is_read_and_kept():
    d = doc("- G: 320003 (3 2 - - - 4)\n- Bb: 113331 (112341)\n- C: x32010\n")
    v = {e["key"]: e for e in d["blocks"][0]["voicings"]}
    assert v["G"]["fingers"] == [3, 2, None, None, None, 4]
    assert v["Bb"]["fingers"] == [1, 1, 2, 3, 4, 1]
    assert "fingers" not in v["C"]
    assert d["diagnostics"] == []


def test_bad_fingering_keeps_the_shape():
    d = doc("- G: 320003 (3 2 - - 4)\n- C: x32010 (1 3 2 - 1 -)\n- F: 133211 (1 3 4 2 1 2)\n- D: xx0232 (nope)\n")
    v = {e["key"]: e for e in d["blocks"][0]["voicings"]}
    assert set(v) == {"G", "C", "F", "D"}
    assert all("fingers" not in e for e in v.values())
    assert [x["code"] for x in d["diagnostics"]] == ["bad-fingering"] * 4
    assert d["diagnostics"][0]["message"] == "5 finger positions for 6 strings"


def test_repeated_key_replaces_fingering():
    d = doc("- G: 320003 (3 2 - - - 4)\n- G: 320003\n")
    assert "fingers" not in d["blocks"][0]["voicings"][0]
    d = doc("- G: 320003\n- G: 320003 (2 1 - - - 3)\n")
    assert d["blocks"][0]["voicings"][0]["fingers"] == [2, 1, None, None, None, 3]


def test_canonical_form():
    d = doc("- G: 320003 (32---4)\n- Bb: 113331 ( 1 1 2 3 4 1 )\n- Cm[2]: 8-10-10-8-8-8 (1 3 4 1 1 1)\n")
    out = write(d)
    assert out.endswith("## Voicings: E2 A2 D3 G3 B3 E4\n- Bb: 113331 (1 1 2 3 4 1)\n- Cm[2]: 8-10-10-8-8-8 (1 3 4 1 1 1)\n- G: 320003 (3 2 - - - 4)\n")
    assert write(parse(out)) == out
    assert format_fingers(["T", None, 2]) == "T - 2"
