"""Spec §3: repeats."""

from cifra_md import parse

from conftest import chart


def section(text):
    return parse(chart(text))["sections"][0]


def codes(text):
    return [d["code"] for d in parse(chart(text))["diagnostics"]]


class TestMeasureRepeat:
    def test_is_an_item_and_a_bar(self):
        s = section("Dm | % | %")
        ms = s["body"][0]["lines"][0]["measures"]
        assert ms[1]["items"] == [{"type": "repeat"}]
        assert ms[2]["number"] == 3
        assert codes("Dm | % | %") == []

    def test_without_a_previous_measure(self):
        assert codes("% | Dm") == ["repeat-without-previous"]

    def test_previous_measure_across_sections(self):
        doc = parse("## A\n```\nDm\n```\n## B\n```\n%\n```\n")
        assert doc["diagnostics"] == []

    def test_beside_other_items(self):
        assert codes("Dm | % G7") == ["repeat-beside-items"]


class TestGroups:
    def test_barline_notation(self):
        s = section("|: C | G :|")
        assert len(s["groups"]) == 1
        g = s["groups"][0]
        assert g["open"] == {"part": 0, "line": 0, "measure": 0, "item": 0}
        assert g["close"] == {"part": 0, "line": 0, "measure": 1, "item": 1}
        assert g["count"] == 2
        assert g["endings"] == []
        ms = s["body"][0]["lines"][0]["measures"]
        assert ms[0]["items"][0] == {"type": "mark", "open": True, "notation": "barline"}
        assert ms[1]["items"][1] == {"type": "mark", "open": False, "notation": "barline"}

    def test_bracket_notation(self):
        s = section("( C | G )")
        g = s["groups"][0]
        assert g["count"] == 2
        ms = s["body"][0]["lines"][0]["measures"]
        assert ms[0]["items"][0]["notation"] == "bracket"

    def test_notations_pair_with_each_other(self):
        assert len(section("( C | G :|")["groups"]) == 1
        assert len(section("|: C | G )")["groups"]) == 1

    def test_double_bar_with_marks(self):
        s = section("||: C | G :||")
        assert len(s["groups"]) == 1
        ln = s["body"][0]["lines"][0]
        assert ln["measures"][0]["bar"] == "||"
        assert ln["closeBar"] == "||"

    def test_group_spans_lines(self):
        s = section("|: C | G\nAm | F :|")
        g = s["groups"][0]
        assert g["open"]["line"] == 0
        assert g["close"]["line"] == 1

    def test_group_does_not_span_a_heading(self):
        doc = parse("## A\n```\n|: C | G\n```\n## B\n```\nAm | F :|\n```\n")
        assert [d["code"] for d in doc["diagnostics"]] == ["unclosed-group", "stray-mark"]
        assert doc["sections"][0]["groups"] == []
        assert doc["sections"][1]["groups"] == []

    def test_no_nesting(self):
        assert codes("( C ( G ) )") == ["stray-mark", "stray-mark"]

    def test_stray_close(self):
        assert codes("C | G )") == ["stray-mark"]

    def test_mark_against_a_chord(self):
        s = section("(C G)")
        assert len(s["groups"]) == 1

    def test_close_mark_against_a_chord_before_a_bar(self):
        s = section("|: C | G:| F")
        assert len(s["groups"]) == 1
        ms = s["body"][0]["lines"][0]["measures"]
        assert [it["type"] for it in ms[1]["items"]] == ["chord", "mark"]

    def test_empty_group_is_two_stray_marks(self):
        assert codes("C ( ) G") == []  # paired: a group with nothing in it is reported? see spec §3.2


class TestCounts:
    def test_cifra_count_spellings(self):
        for text, n in (("( C | G ) (2x)", 2), ("( C | G ) (x3)", 3), ("( C | G ) bis", 2), ("( C | G ) (bis)", 2), ("|: C | G :| (×4)", 4)):
            assert section(text)["groups"][0]["count"] == n, text
        ln = section("C | G (2x)")["body"][0]["lines"][0]
        assert ln["times"] == 2

    def test_count_after_a_group(self):
        for text in ("( C | G ) x3", "|: C | G :| 3x", "(C | G) x3", "( C | G ) ×3"):
            g = section(text)["groups"][0]
            assert g["count"] == 3, text
            assert g["countItem"] == {"part": 0, "line": 0, "measure": 1, "item": 2}

    def test_count_item_stays_in_the_measure(self):
        ms = section("( C | G ) x3")["body"][0]["lines"][0]["measures"]
        assert ms[1]["items"][-1] == {"type": "count", "times": 3}

    def test_line_count(self):
        s = section("C | G | Am | F x2")
        ln = s["body"][0]["lines"][0]
        assert ln["times"] == 2
        assert s["groups"] == []

    def test_count_elsewhere_is_reported(self):
        assert codes("C x2 | G") == ["count-out-of-place"]
        assert codes("( C | G ) Am x2") == ["count-out-of-place"]

    def test_count_with_endings_is_reported(self):
        assert codes("|: C | 1. G :| 2. Am | x2") == ["count-out-of-place"]
        assert "count-with-endings" in codes("|: C | 1. G :| x2 2. Am")


class TestEndings:
    def test_first_and_second_ending(self):
        s = section("|: Dm | G7 | 1. C | A7 :| 2. C | C |")
        g = s["groups"][0]
        assert g["count"] == 2
        assert [e["number"] for e in g["endings"]] == [1, 2]
        assert g["endings"][0]["at"] == {"part": 0, "line": 0, "measure": 2, "item": 0}
        assert g["endings"][1]["at"] == {"part": 0, "line": 0, "measure": 4, "item": 0}

    def test_three_endings(self):
        g = section("|: C | 1. G | 2. Am :| 3. F |")["groups"][0]
        assert g["count"] == 3

    def test_only_a_last_ending(self):
        g = section("|: C | G :| 2. Am |")["groups"][0]
        assert g["count"] == 2
        assert [e["number"] for e in g["endings"]] == [2]
        assert "bad-ending-sequence" in codes("|: C | G :| 2. Am |")

    def test_bad_sequence_is_reported(self):
        assert codes("|: C | 2. G :| 1. Am |") == ["bad-ending-sequence"]
        assert codes("|: C | 1. G :| 3. Am |") == ["bad-ending-sequence"]

    def test_ending_outside_a_group_is_an_unknown_token(self):
        s = section("C | 1. G")
        its = s["body"][0]["lines"][0]["measures"][1]["items"]
        assert its[0] == {"type": "unknown", "text": "1."}
        assert codes("C | 1. G") == ["ending-outside-group"]

    def test_ending_marker_alone_in_a_measure_belongs_to_the_next(self):
        s = section("|: C | 1. | G :| 2. | Am")
        ms = s["body"][0]["lines"][0]["measures"]
        assert len(ms) == 3
        assert ms[1]["items"][0]["type"] == "ending"
        assert ms[2]["items"][0]["type"] == "ending"
        assert s["groups"][0]["count"] == 2
