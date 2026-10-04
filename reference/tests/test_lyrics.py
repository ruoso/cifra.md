"""Spec §4: words."""

from cifra_md import parse

from conftest import chart


def lines(text):
    doc = parse(chart(text))
    return doc, [p for p in doc["sections"][0]["body"] if p["type"] == "music"][0]["lines"]


CIFRA = "[Intro] G D Em C\n\n[Verse]\nG           D\nQuando eu te vi passar\n\nEm            C\nnaquela tarde clara\n"


class TestSungDecision:
    def test_chart_only_is_not_sung(self):
        doc, _ = lines("C | G\nAm | F")
        assert doc["sung"] is False

    def test_words_under_chords(self):
        doc, _ = lines("G            D\nWhen I first saw you")
        assert doc["sung"] is True

    def test_one_word_is_not_enough(self):
        doc, ls = lines("C Am | F G\nwobble")
        assert doc["sung"] is False
        assert [ln["kind"] for ln in ls] == ["chart", "chart"]

    def test_a_single_typo_stays_a_chart_line(self):
        doc, ls = lines("C Am wobble G")
        assert doc["sung"] is False
        assert ls[0]["kind"] == "chart"

    def test_sung_at_names_the_line(self):
        doc = parse("## A\n```\nC | G\nG            D\nWhen I first saw you\n```\n")
        assert doc["sungAt"] == 5
        assert parse(chart("C | G"))["sungAt"] is None

    def test_words_property_overrides(self):
        text = "- words: no\n\n```\nG | C | D | G\nD DU UDU\n```\n"
        doc = parse(text)
        assert doc["sung"] is False and doc["sungAt"] is None
        lines_ = doc["sections"][0]["body"][0]["lines"]
        assert [m["number"] for m in lines_[0]["measures"]] == [1, 2, 3, 4]
        assert lines_[1]["run"] is True and "number" not in lines_[1]["measures"][0]
        doc = parse("- words: yes\n\n```\nC | G\n```\n")
        assert doc["sung"] is True
        doc = parse("- words: maybe\n\n```\nC | G\n```\n")
        assert doc["diagnostics"][0]["code"] == "bad-property"

    def test_beat_marks_take_words_and_are_not_words(self):
        doc, ls = lines("C / / G\nla la la la")
        assert doc["sung"] is True
        its = ls[0]["measures"][0]["items"]
        assert [it["type"] for it in its] == ["chord", "beat", "beat", "chord"]
        assert "".join(it["words"] for it in its) == "la la la la"

    def test_a_forced_line_makes_the_song_sung(self):
        doc, ls = lines("C | G\n> A")
        assert doc["sung"] is True
        assert [ln["kind"] for ln in ls] == ["sung"]
        assert ls[0]["forced"] is True

    def test_a_forced_line_on_its_own(self):
        doc, ls = lines("C | G\n\n> A")
        assert doc["sung"] is True
        assert ls[1] == {"kind": "break"}
        assert ls[2] == {"kind": "lyric", "text": "  A", "forced": True}

    def test_once_sung_one_word_is_a_lyric_line(self):
        doc, ls = lines("G            D\nWhen I first saw you\nEm\nyou")
        assert [ln["kind"] for ln in ls] == ["sung", "sung"]

    def test_prose_not_under_chords_is_a_lyric_line(self):
        doc, ls = lines("G            D\nWhen I first saw you\n\nsecond verse same chords")
        assert [ln["kind"] for ln in ls] == ["sung", "break", "lyric"]

    def test_no_chord_is_a_chord_word(self):
        doc, ls = lines("N.C.      C\nWhen I first saw you")
        assert doc["sung"] is True
        its = ls[0]["measures"][0]["items"]
        assert its[0]["type"] == "nochord"
        assert its[0]["words"] == "When I fir"

    def test_a_line_with_a_bar_is_always_chords(self):
        doc, ls = lines("G            D\nWhen I first saw you\nC | wobble foo bar")
        assert ls[-1]["kind"] == "chart"

    def test_chart_lines_stay_chart_lines_in_a_sung_song(self):
        doc = parse("```\n" + CIFRA + "```\n")
        intro = doc["sections"][0]["body"][0]["lines"]
        assert intro[0]["kind"] == "chart"
        assert [it["key"] for it in intro[0]["measures"][0]["items"]] == ["G", "D", "Em", "C"]

    def test_no_words_means_every_line_reads_as_before(self):
        text = "x y z\nC | wobble | G\nAm F"
        # three words, none chords: prose; but no chord line above it, so not sung
        doc, ls = lines(text)
        assert doc["sung"] is False
        assert [ln["kind"] for ln in ls] == ["chart"] * 3


class TestColumns:
    def test_words_divide_at_chord_columns(self):
        _, ls = lines("G           D\nWhen I first saw you")
        its = ls[0]["measures"][0]["items"]
        assert [(it["key"], it["column"], it["words"]) for it in its] == [("G", 0, "When I first"), ("D", 12, " saw you")]

    def test_a_chord_inside_a_word_divides_it(self):
        _, ls = lines("G      D\nQuando eu te vi")
        its = ls[0]["measures"][0]["items"]
        assert [it["words"] for it in its] == ["Quando ", "eu te vi"]

    def test_lead_words_before_the_first_chord(self):
        _, ls = lines("        G\nOh when I first")
        its = ls[0]["measures"][0]["items"]
        assert its[0] == {"type": "lead", "column": 0, "words": "Oh when "}
        assert its[1]["words"] == "I first"

    def test_whitespace_lead_is_not_an_item(self):
        _, ls = lines("    G\n    I first")
        its = ls[0]["measures"][0]["items"]
        assert its[0]["type"] == "chord"
        assert its[0]["words"] == "I first"

    def test_chords_past_the_words_have_none(self):
        _, ls = lines("G        D    Em    C\nWhen I saw\n")
        its = ls[0]["measures"][0]["items"]
        assert [it["words"] for it in its] == ["When I sa", "w", "", ""]

    def test_words_past_the_last_chord_belong_to_it(self):
        _, ls = lines("G\nWhen I first saw you")
        assert ls[0]["measures"][0]["items"][0]["words"] == "When I first saw you"

    def test_bars_divide_measures_and_words_follow_chords(self):
        _, ls = lines("G      | D\nWhen I   saw you")
        ms = ls[0]["measures"]
        assert len(ms) == 2
        assert ms[1]["bar"] == "|"
        assert ms[1]["column"] == 7
        assert ms[0]["items"][0]["words"] == "When I   "
        assert ms[1]["items"][0]["words"] == "saw you"

    def test_repeat_signs_take_words_and_marks_do_not(self):
        _, ls = lines("( G    % )\nla la la la")
        its = ls[0]["measures"][0]["items"]
        assert [it["type"] for it in its] == ["lead", "mark", "chord", "repeat", "mark"]
        assert [it.get("words") for it in its] == ["la", None, " la l", "a la", None]
        assert [it["column"] for it in its] == [0, 0, 2, 7, 9]

    def test_forced_line_keeps_columns(self):
        _, ls = lines("G             D\n> A tarde era clara")
        its = ls[0]["measures"][0]["items"]
        assert ls[0]["forced"] is True
        assert its[0]["words"] == "  A tarde era "
        assert its[1]["words"] == "clara"

    def test_trailing_whitespace_is_dropped(self):
        _, ls = lines("G   \nWhen I   ")
        assert ls[0]["measures"][0]["items"][0]["words"] == "When I"


class TestBreaks:
    def test_blank_between_sung_lines_is_a_break(self):
        doc = parse("```\n" + CIFRA + "```\n")
        verse = doc["sections"][1]["body"][0]["lines"]
        assert [ln["kind"] for ln in verse] == ["sung", "break", "sung"]

    def test_several_blanks_are_one_break(self):
        _, ls = lines("G\nla la\n\n\n\nD\nla la")
        assert [ln["kind"] for ln in ls] == ["sung", "break", "sung"]

    def test_blank_before_a_chart_line_is_a_break_too(self):
        _, ls = lines("G\nla la\n\nC | G")
        assert [ln["kind"] for ln in ls] == ["sung", "break", "chart"]

    def test_blank_lines_in_a_chart_are_breaks(self):
        doc, ls = lines("C | G\n\n\nAm | F")
        assert doc["sung"] is False
        assert [ln["kind"] for ln in ls] == ["chart", "break", "chart"]

    def test_a_blank_line_keeps_words_from_a_chord_line(self):
        doc, ls = lines("G            D\nWhen I first saw you\nC  G\n\nthese words are not sung")
        assert [ln["kind"] for ln in ls] == ["sung", "chart", "break", "lyric"]

    def test_a_line_with_no_items_reads_as_blank(self):
        doc, ls = lines("G            D\nWhen I first saw you\nC  G\n| |\nnot under the chords")
        assert [ln["kind"] for ln in ls] == ["sung", "chart", "break", "lyric"]
        doc, ls = lines("C | G\n@9\nAm | F")
        assert [ln["kind"] for ln in ls] == ["chart", "break", "chart"]
        assert ls[2]["measures"][0]["anchor"] == 9

    def test_blank_at_the_start_is_nothing(self):
        _, ls = lines("\n\nG\nla la")
        assert [ln["kind"] for ln in ls] == ["sung"]
