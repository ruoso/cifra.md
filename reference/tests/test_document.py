"""Spec §1: document structure, metadata, fences, notes, headings, sections."""

from cifra_md import parse

from conftest import chart


def names(doc):
    return [s["name"] for s in doc["sections"]]


def music(section):
    return [p for p in section["body"] if p["type"] == "music"]


def symbols(doc):
    out = []
    for s in doc["sections"]:
        for p in music(s):
            for line in p["lines"]:
                for m in line.get("measures", []):
                    for it in m["items"]:
                        if it["type"] == "chord":
                            out.append(it["symbol"])
    return out


class TestMetadata:
    def test_title_and_properties(self):
        doc = parse("# My Song\n- artist: Someone\n- Notation: american\n\n## A\n```\nC\n```\n")
        assert doc["title"] == "My Song"
        assert doc["properties"] == {"artist": "Someone", "notation": "american"}
        assert names(doc) == ["A"]

    def test_no_metadata(self):
        doc = parse("## A\n```\nC\n```\n")
        assert doc["title"] is None
        assert doc["properties"] == {}

    def test_properties_without_title(self):
        doc = parse("- notation: american\n\n## A\n```\nC9\n```\n")
        assert doc["title"] is None
        assert doc["properties"] == {"notation": "american"}

    def test_blank_lines_in_the_list(self):
        doc = parse("# T\n\n- a: 1\n\n- b: 2\n\n## A\n```\nC\n```\n")
        assert doc["properties"] == {"a": "1", "b": "2"}

    def test_last_value_wins(self):
        doc = parse("# T\n- a: 1\n- a: 2\n")
        assert doc["properties"] == {"a": "2"}

    def test_reserved_informative_properties_are_just_kept(self):
        doc = parse("# T\n- key: Em\n- capo: 2\n- tempo: 96\n- time: 3/4\n")
        assert doc["properties"] == {"key": "Em", "capo": "2", "tempo": "96", "time": "3/4"}
        assert doc["diagnostics"] == []

    def test_bad_property_is_reported(self):
        doc = parse("# T\n- not a property\n- a: 1\n")
        assert doc["properties"] == {"a": "1"}
        assert [d["code"] for d in doc["diagnostics"]] == ["bad-property"]

    def test_level_one_heading_elsewhere_is_a_section(self):
        doc = parse("## A\n```\nC\n```\n# B\n```\nG\n```\n")
        assert doc["title"] is None
        assert names(doc) == ["A", "B"]

    def test_notation_drives_the_ambiguous_readings(self):
        us = parse("- notation: american\n\n```\nC9\n```\n")
        br = parse("```\nC9\n```\n")
        item = lambda d: d["sections"][0]["body"][0]["lines"][0]["measures"][0]["items"][0]
        assert item(us)["ambiguities"][0]["chosen"] == "dominant"
        assert item(br)["ambiguities"][0]["chosen"] == "add"

    def test_unknown_notation_falls_back(self):
        doc = parse("- notation: klingon\n\n```\nC\n```\n")
        assert doc["diagnostics"][0]["code"] == "bad-notation"
        assert symbols(doc) == ["C"]

    def test_bom_and_crlf(self):
        doc = parse("﻿# T\r\n\r\n## A\r\n```\r\nC | G\r\n```\r\n")
        assert doc["title"] == "T"
        assert symbols(doc) == ["C", "G"]


class TestFencesAndNotes:
    def test_music_only_inside_fences(self):
        doc = parse("## A\nC | G\n```\nAm\n```\nF\n")
        assert symbols(doc) == ["Am"]
        body = doc["sections"][0]["body"]
        assert [p["type"] for p in body] == ["notes", "music", "notes"]
        assert body[0]["text"] == "C | G"
        assert body[2]["text"] == "F"

    def test_notes_keep_blank_lines_inside_but_not_around(self):
        doc = parse("## A\n\nfirst\n\nsecond\n\n```\nC\n```\n")
        assert doc["sections"][0]["body"][0]["text"] == "first\n\nsecond"

    def test_several_fences_in_a_section(self):
        doc = parse("## A\n```\nC\n```\nnote\n```\nG\n```\n")
        assert symbols(doc) == ["C", "G"]
        assert [p["type"] for p in doc["sections"][0]["body"]] == ["music", "notes", "music"]

    def test_tilde_fences_and_longer_fences(self):
        doc = parse("~~~\nC\n~~~\n````\nG\n```\n````\n")
        assert symbols(doc) == ["C", "G"]

    def test_cifra_info_string_is_music(self):
        doc = parse("```cifra\nC\n```\n")
        assert symbols(doc) == ["C"]

    def test_other_info_strings_are_verbatim(self):
        doc = parse("## A\n```tab\ne|--0--|\nB|--1--|\n```\n```\nC\n```\n")
        body = doc["sections"][0]["body"]
        assert body[0] == {"type": "verbatim", "info": "tab", "text": "e|--0--|\nB|--1--|"}
        assert symbols(doc) == ["C"]

    def test_annotation_lines(self):
        doc = parse("```\nC | G\n// repete o refrão\nAm | F\n```\n")
        lines = doc["sections"][0]["body"][0]["lines"]
        assert [ln["kind"] for ln in lines] == ["chart", "annotation", "chart"]
        assert lines[1]["text"] == "repete o refrão"
        assert doc["sung"] is False

    def test_annotation_does_not_make_a_document_sung(self):
        doc = parse("```\nC | G\n// two words here\n```\n")
        assert doc["sung"] is False

    def test_unclosed_fence_is_reported(self):
        doc = parse("## A\n```\nC\n")
        assert symbols(doc) == ["C"]
        assert doc["diagnostics"][0]["code"] == "unclosed-fence"
        assert doc["diagnostics"][0]["line"] == 2

    def test_nothing_inside_a_fence_is_a_heading_or_rule(self):
        doc = parse("```\n## not a heading\n---\nC\n```\n")
        assert names(doc) == [""]
        assert doc["blocks"] == []
        lines = doc["sections"][0]["body"][0]["lines"]
        assert len(lines) == 3
        kinds = [it["type"] for ln in lines for m in ln["measures"] for it in m["items"]]
        assert "unknown" in kinds

    def test_music_before_any_heading(self):
        doc = parse("```\nC | G\n```\n## A\n```\nF\n```\n")
        assert names(doc) == ["", "A"]
        assert doc["sections"][0]["heading"] is None


class TestHeadings:
    def test_markdown_heading_levels_are_alike(self):
        doc = parse("## A\n```\nC\n```\n### B\n```\nG\n```\n#### C\n")
        assert names(doc) == ["A", "B", "C"]
        assert all(s["heading"] == "markdown" for s in doc["sections"])

    def test_empty_section_is_kept(self):
        doc = parse("## A\n## B\n```\nC\n```\n")
        assert names(doc) == ["A", "B"]
        assert doc["sections"][0]["body"] == []

    def test_bracket_heading_inside_a_fence(self):
        doc = parse("```\n[Intro] G D\n\n[Verse]\nC | G\n```\n")
        assert names(doc) == ["Intro", "Verse"]
        assert [s["heading"] for s in doc["sections"]] == ["bracket", "bracket"]
        assert symbols(doc) == ["G", "D", "C", "G"]

    def test_bracket_heading_outside_a_fence_is_notes(self):
        doc = parse("## A\n[Intro]\n```\nC\n```\n")
        assert names(doc) == ["A"]
        assert doc["sections"][0]["body"][0] == {"type": "notes", "text": "[Intro]"}

    def test_digits_in_brackets_are_not_a_heading(self):
        doc = parse("```\n[2] C\n```\n")
        assert names(doc) == [""]

    def test_label_heading_needs_chords_after_it(self):
        doc = parse("```\nIntro: Fm Fm/D#\nChorus:\nNote: this is words here\n```\n")
        assert names(doc)[:2] == ["Intro", "Chorus"]
        assert "Note" not in names(doc)

    def test_forced_line_is_never_a_label_heading(self):
        doc = parse("```\nG      D\n> Amor: A\nC\n```\n")
        assert names(doc) == [""]
        lines = doc["sections"][0]["body"][0]["lines"]
        assert lines[0]["kind"] == "sung" and lines[0]["forced"] is True

    def test_label_heading_with_a_close_mark_against_a_chord_is_not_a_heading(self):
        doc = parse(chart("|: C | G7:| F"))
        assert names(doc) == ["A"]

    def test_heading_anchor(self):
        doc = parse("## A second time @1\n```\nDm\n```\n")
        assert doc["sections"][0]["name"] == "A second time"
        assert doc["sections"][0]["anchor"] == 1

    def test_heading_count(self):
        for text, name in (("## Refrão x2", "Refrão"), ("## Refrão 2x", "Refrão"), ("## Chorus bis", "Chorus"), ("## A @9 x3", "A"), ("## A x3 @9", "A")):
            doc = parse(text + "\n```\nC\n```\n")
            s = doc["sections"][0]
            assert s["name"] == name, text
            assert s["times"] == (3 if "x3" in text else 2), text
        doc = parse("```\n[Refrão] (2x)\nC | G\n```\n")
        assert doc["sections"][0]["name"] == "Refrão"
        assert doc["sections"][0]["times"] == 2
        assert parse("## x2\n```\nC\n```\n")["sections"][0]["name"] == "x2"

    def test_label_heading_with_a_count(self):
        doc = parse("```\nIntro: C G Am F (2x)\n```\n")
        assert names(doc) == ["Intro"]
        its = doc["sections"][0]["body"][0]["lines"][0]["measures"][0]["items"]
        assert its[-1] == {"type": "count", "times": 2}

    def test_key_looking_label_heading_is_reported(self):
        doc = parse("```\nTom: G\n\nIntro: C G\n```\n")
        assert names(doc) == ["Tom", "Intro"]
        assert [d["code"] for d in doc["diagnostics"]] == ["heading-looks-like-key"]
        assert "- key: G" in doc["diagnostics"][0]["message"]

    def test_section_called_voicings_in_the_chart_is_just_a_section(self):
        doc = parse("## Voicings: E2 A2\n```\nC\n```\n")
        assert names(doc) == ["Voicings: E2 A2"]
        assert doc["blocks"] == []


class TestRule:
    def test_first_rule_ends_the_chart(self):
        doc = parse("```\nC\n```\n\n---\n\n## Voicings: E2 A2\n- C: 32\n\n---\n\n## B\n```\nG\n```\n")
        assert symbols(doc) == ["C"]
        assert len(doc["blocks"]) == 1

    def test_rule_needs_three_hyphens_alone(self):
        doc = parse("## A\n--\n```\nC\n```\n")
        assert doc["sections"][0]["body"][0]["text"] == "--"

    def test_document_without_a_rule_has_no_voicings(self):
        doc = parse("```\nC\n```\n## Voicings: E2 A2\n")
        assert doc["blocks"] == []
        assert names(doc) == ["", "Voicings: E2 A2"]
