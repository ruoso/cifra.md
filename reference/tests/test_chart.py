"""Spec §2: chord lines, measures, items, markers, anchors, bar numbers."""

from cifra_md import parse

from conftest import chart


def lines(doc, section=0):
    return [p for p in doc["sections"][section]["body"] if p["type"] == "music"][0]["lines"]


def measures(text):
    return lines(parse(chart(text)))[0]["measures"]


def item_texts(text):
    out = []
    for m in measures(text):
        out.append([(it["type"], it.get("key") or it.get("text") or it.get("times") or it.get("number") or it.get("open")) for it in m["items"]])
    return out


class TestMeasures:
    def test_split_on_bars(self):
        ms = measures("C Am | F G")
        assert [[it["key"] for it in m["items"]] for m in ms] == [["C", "Am"], ["F", "G"]]

    def test_a_line_with_no_bar_is_one_measure(self):
        assert len(measures("C G Am")) == 1

    def test_empty_measures_do_not_exist(self):
        for text in ("C | G", "| C | G |", "C || G", "C | | G", "|C|G|"):
            ms = measures(text)
            assert [[it["key"] for it in m["items"]] for m in ms] == [["C"], ["G"]], text

    def test_bar_line_forms_are_kept(self):
        ms = measures("C || G")
        assert ms[1]["bar"] == "||"
        ln = lines(parse(chart("| C | G ||")))[0]
        assert ln["measures"][0]["bar"] == "|"
        assert ln["closeBar"] == "||"
        ln = lines(parse(chart("C | G")))[0]
        assert ln["measures"][0]["bar"] is None
        assert ln["closeBar"] is None

    def test_whitespace_is_not_significant(self):
        assert item_texts("  C   Am  |F   G  ") == item_texts("C Am | F G")


class TestItems:
    def test_chord_tokens_with_markers(self):
        its = measures("Cm Cm[2] Cm[1]")[0]["items"]
        assert [(it["symbol"], it["index"], it["key"]) for it in its] == [("Cm", 1, "Cm"), ("Cm", 2, "Cm[2]"), ("Cm", 1, "Cm")]

    def test_marker_with_a_space_is_an_unknown_token(self):
        its = measures("Cm [2]")[0]["items"]
        assert [it["type"] for it in its] == ["chord", "unknown"]
        assert its[1]["text"] == "[2]"

    def test_unknown_tokens_are_kept_in_place(self):
        its = measures("C wobble (solo) fine G")[0]["items"]
        assert [it["type"] for it in its] == ["chord", "unknown", "unknown", "unknown", "chord"]
        assert [it["text"] for it in its if it["type"] == "unknown"] == ["wobble", "(solo)", "fine"]

    def test_beat_marks(self):
        its = measures("C / / / | G . . . | Am - - -")
        assert [it["type"] for it in its[0]["items"]] == ["chord", "beat", "beat", "beat"]
        assert its[1]["items"][1] == {"type": "beat", "mark": "."}
        assert its[2]["items"][3] == {"type": "beat", "mark": "-"}

    def test_runs_have_no_bars(self):
        doc = parse(chart("G D Em C"))
        ln = lines(doc)[0]
        assert ln["run"] is True
        assert len(ln["measures"]) == 1
        assert "number" not in ln["measures"][0]
        assert "run" not in lines(parse(chart("G | D")))[0]

    def test_no_chord_mark(self):
        for spelling in ("N.C.", "NC", "n.c.", "nc"):
            ms = measures(f"{spelling} | C")
            assert ms[0]["items"] == [{"type": "nochord"}], spelling
        ms = measures("C N.C. G")
        assert [it["type"] for it in ms[0]["items"]] == ["chord", "nochord", "chord"]

    def test_chord_carries_its_model(self):
        it = measures("Am7/G")[0]["items"][0]
        assert it["chord"]["quality"] == "minor"
        assert it["chord"]["bass"]["letter"] == "G"

    def test_chord_with_its_own_brackets(self):
        its = measures("Em7(b5) A7(b13) C7(9)")[0]["items"]
        assert [it["type"] for it in its] == ["chord"] * 3

    def test_repeat_sign_is_not_a_chord(self):
        ms = measures("Dm | % | G7")
        assert ms[1]["items"] == [{"type": "repeat"}]

    def test_group_marks_split_off(self):
        assert item_texts("(Cm Dm)") == [[("mark", True), ("chord", "Cm"), ("chord", "Dm"), ("mark", False)]]
        assert item_texts("( Cm Dm )") == item_texts("(Cm Dm)")

    def test_unbalanced_bracket_in_the_middle_is_unknown(self):
        its = measures("C(7 G")[0]["items"]
        assert its[0] == {"type": "unknown", "text": "C(7"}

    def test_a_bracket_inside_a_chord_and_around_it(self):
        its = measures("(C7(9) Am)")[0]["items"]
        assert [it["type"] for it in its] == ["mark", "chord", "chord", "mark"]
        assert its[1]["symbol"] == "C7(9)"

    def test_items_are_not_reordered(self):
        its = measures("G C F")[0]["items"]
        assert [it["key"] for it in its] == ["G", "C", "F"]


class TestBarNumbers:
    def bars(self, text):
        doc = parse(text)
        out = []
        for s in doc["sections"]:
            for p in s["body"]:
                if p["type"] != "music":
                    continue
                for ln in p["lines"]:
                    if ln["kind"] == "chart" and not ln.get("run"):
                        out.append(" ".join(str(m["number"]) + ("*" if m["stated"] else "") for m in ln["measures"]))
        return out

    def test_continuous_through_the_song(self):
        assert self.bars("## A\n```\nDm | G7 | C7 | F\n```\n## B\n```\nBb | A7\n```\n") == ["1 2 3 4", "5 6"]

    def test_repeat_sign_counts(self):
        assert self.bars(chart("Dm | % | G7")) == ["1 2 3"]

    def test_no_chord_counts(self):
        assert self.bars(chart("N.C. | N.C. | C")) == ["1 2 3"]

    def test_several_chords_count_once(self):
        assert self.bars(chart("Dm G7 | C7")) == ["1 2"]

    def test_stated_number(self):
        assert self.bars(chart("@9 Dm | G7 | C7")) == ["9* 10 11"]

    def test_stated_in_the_middle(self):
        assert self.bars(chart("Dm | G7 | @17 Em | A7")) == ["1 2 17* 18"]

    def test_heading_anchor(self):
        assert self.bars("## A @9\n```\nDm | G7\n```\n") == ["9 10"]

    def test_repeated_section_numbers(self):
        assert self.bars("## A\n```\nDm | G7\n```\n## A again @1\n```\nDm | G7\n```\n") == ["1 2", "1 2"]

    def test_number_with_no_bar_goes_to_the_next(self):
        assert self.bars(chart("@9\nDm | G7")) == ["9* 10"]
        assert self.bars(chart("@9 | Dm | G7")) == ["9* 10"]
        assert self.bars(chart("Dm | @9\nG7 | C7")) == ["1", "9* 10"]

    def test_carries_across_sections(self):
        assert self.bars("## A\n```\nDm | @9\n```\n## B\n```\nG7 | C\n```\n") == ["1", "9* 10"]

    def test_runs_neither_take_nor_advance_numbers(self):
        assert self.bars(chart("C | G\nAm F\nDm | G7")) == ["1 2", "3 4"]

    def test_lone_number_line_is_dropped(self):
        doc = parse(chart("@9\nDm | G7"))
        assert len(lines(doc)) == 1

    def test_anchor_is_never_a_chord(self):
        doc = parse(chart("@9 Dm | @17 Em"))
        its = [it["type"] for ln in lines(doc) for m in ln["measures"] for it in m["items"]]
        assert its == ["chord", "chord"]

    def test_last_anchor_in_a_measure_wins(self):
        assert self.bars(chart("@3 Dm @5 | G7")) == ["5* 6"]

    def test_marks_and_counts_are_not_bars(self):
        assert self.bars(chart("|: Dm | G7 :| x3")) == ["1 2"]
        assert self.bars(chart("|: Dm | 1. G7 :| 2. C |")) == ["1 2 3"]
        assert self.bars(chart("( Dm | G7 ) x3")) == ["1 2"]

    def test_no_numbers_in_a_sung_document(self):
        doc = parse(chart("Dm | G7\nG            D\nWhen I first saw you"))
        assert doc["sung"] is True
        for ln in lines(doc):
            for m in ln["measures"]:
                assert "number" not in m
