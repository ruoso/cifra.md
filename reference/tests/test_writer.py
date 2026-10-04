"""Spec §8: the canonical writer."""

import jsonschema
import pytest

from cifra_md import parse, write
from cifra_md.write import canonical

from conftest import EXAMPLES, SCHEMA, chart


@pytest.mark.parametrize("path", EXAMPLES, ids=[p.name for p in EXAMPLES])
def test_examples_are_canonical(path):
    text = path.read_text(encoding="utf-8")
    assert write(parse(text)) == text


@pytest.mark.parametrize("path", EXAMPLES, ids=[p.name for p in EXAMPLES])
def test_examples_have_no_diagnostics(path):
    assert parse(path.read_text(encoding="utf-8"))["diagnostics"] == []


@pytest.mark.parametrize("path", EXAMPLES, ids=[p.name for p in EXAMPLES])
def test_examples_validate(path):
    jsonschema.validate(parse(path.read_text(encoding="utf-8")), SCHEMA)


def roundtrip(text):
    """Canonicalise, check the result reads back as the canonical model, and
    that canonicalising again changes nothing."""
    doc = parse(text)
    out = write(doc)
    again = parse(out)
    strip = lambda d: {k: v for k, v in d.items() if k not in ("diagnostics", "sungAt")}
    assert strip(again) == strip(canonical(doc)), out
    assert write(again) == out
    return out


class TestChartLayout:
    def test_single_spaces_and_bars(self):
        assert roundtrip(chart("  C   Am |F   G  ")) == "## A\n```\nC Am | F G\n```\n"

    def test_leading_and_closing_bars(self):
        assert roundtrip(chart("| C | G ||")) == "## A\n```\n| C | G ||\n```\n"

    def test_double_bar(self):
        assert roundtrip(chart("C || G")) == "## A\n```\nC || G\n```\n"

    def test_repeat_marks(self):
        assert roundtrip(chart("|: C | G :|")) == "## A\n```\n|: C | G :|\n```\n"
        assert roundtrip(chart("( C | G ) 3x")) == "## A\n```\n( C | G ) x3\n```\n"
        assert roundtrip(chart("(C G)")) == "## A\n```\n( C G )\n```\n"

    def test_endings(self):
        assert roundtrip(chart("|: Dm | G7 |1. C | A7 :|2. C | C |")) == "## A\n```\n|: Dm | G7 | 1. C | A7 :| 2. C | C |\n```\n"

    def test_close_mark_against_a_chord(self):
        assert roundtrip(chart("|: C | G7:| F")) == "## A\n```\n|: C | G7 :| F\n```\n"

    def test_anchors(self):
        assert roundtrip(chart("@9 Dm | G7 | @17 Em")) == "## A\n```\n@9 Dm | G7 | @17 Em\n```\n"

    def test_anchor_only_line_moves_to_the_next_bar(self):
        assert roundtrip(chart("@9\nDm | G7")) == "## A\n```\n@9 Dm | G7\n```\n"

    def test_unknown_tokens_and_repeat_signs(self):
        assert roundtrip(chart("C | % | fine | (solo)")) == "## A\n```\nC | % | fine | (solo)\n```\n"

    def test_cifra_counts_become_x_form(self):
        assert roundtrip(chart("( C | G ) (2x)")) == "## A\n```\n( C | G ) x2\n```\n"
        assert roundtrip(chart("C | G bis")) == "## A\n```\nC | G x2\n```\n"

    def test_beats_runs_and_annotations(self):
        text = "C / / / | G . . .\nG D Em C\n// repete\n"
        assert roundtrip(chart(text)) == "## A\n```\n" + text + "```\n"

    def test_heading_count_and_anchor(self):
        assert roundtrip("## Refrão (2x)\n```\nC\n```\n") == "## Refrão x2\n```\nC\n```\n"
        assert roundtrip("## A x2 @9\n```\nC | G\n```\n") == "## A @9 x2\n```\nC | G\n```\n"

    def test_verbatim_fence(self):
        text = "## A\n```tab\ne|--0--|\n```\n\n```\nC\n```\n"
        assert roundtrip(text) == text

    def test_no_chord_is_written_canonically(self):
        assert roundtrip(chart("nc | NC | n.c. | C")) == "## A\n```\nN.C. | N.C. | N.C. | C\n```\n"

    def test_line_count(self):
        assert roundtrip(chart("C | G 2x")) == "## A\n```\nC | G x2\n```\n"


class TestSungLayout:
    def test_columns_are_kept(self):
        text = "G           D\nWhen I first saw you"
        assert roundtrip(chart(text)) == "## A\n```\n" + text + "\n```\n"

    def test_lead_words(self):
        text = "        G\nOh when I first"
        assert roundtrip(chart(text)) == "## A\n```\n" + text + "\n```\n"

    def test_forced_line(self):
        text = "G             D\n> A tarde era clara"
        assert roundtrip(chart(text)) == "## A\n```\n" + text + "\n```\n"

    def test_lyric_lines_and_breaks(self):
        text = "G\nla la\n\nsecond verse\n> A\nC | G"
        assert roundtrip(chart(text)) == "## A\n```\n" + text + "\n```\n"

    def test_bars_on_a_sung_line(self):
        text = "G      | D\nWhen I   saw you"
        assert roundtrip(chart(text)) == "## A\n```\n" + text + "\n```\n"


class TestStructure:
    def test_metadata(self):
        assert roundtrip("#  Title  \n-  artist :  Me \n\n```\nC\n```\n") == "# Title\n- artist: Me\n\n```\nC\n```\n"

    def test_heading_levels_become_two(self):
        assert roundtrip("### A\n```\nC\n```\n") == "## A\n```\nC\n```\n"

    def test_cifra_headings_share_one_fence(self):
        text = "```\n[Intro]  G   D\n\n[Verse]\nG     D\nla la la\nRefrão:  C G\n```\n"
        assert roundtrip(text) == "```\n[Intro] G D\n\n[Verse]\nG     D\nla la la\n\nRefrão: C G\n```\n"

    def test_notes_are_kept_in_place(self):
        text = "## A\n\nslowly\n\n```\nC\n```\n\nthen faster\n"
        assert roundtrip(text) == "## A\nslowly\n\n```\nC\n```\n\nthen faster\n"

    def test_empty_section_is_kept(self):
        assert roundtrip("## A\n## B\n```\nC\n```\n") == "## A\n\n## B\n```\nC\n```\n"

    def test_heading_anchor(self):
        assert roundtrip("## A @9\n```\nDm\n```\n") == "## A @9\n```\nDm\n```\n"


class TestVoicings:
    def test_sorted_and_single_spaced(self):
        text = "```\nG | C | Cm | Cm[2]\n```\n---\n## voicings : E2,A2,D3,G3,B3,E4\n-   G:320003\n- Cm[2] : 8-10-10-8-8-8\n- C: x32010\n"
        out = roundtrip(text)
        assert out == "```\nG | C | Cm | Cm[2]\n```\n\n---\n\n## Voicings: E2 A2 D3 G3 B3 E4\n- C: x32010\n- Cm[2]: 8-10-10-8-8-8\n- G: 320003\n"

    def test_blocks_ordered_by_first_tuning_default_first(self):
        text = "```\nC\n```\n---\n## Hard: G4 C4 E4 A4\n- C: 5433\n## Voicings: E2 A2 D3 G3 B3 E4\n- C: x32010\n## Voicings: G4 C4 E4 A4\n- C: 0003\n"
        out = roundtrip(text)
        assert out.index("## Voicings: G4") < out.index("## Hard") < out.index("## Voicings: E2")

    def test_problems_are_dropped(self):
        text = "```\nC\n```\n---\n## Voicings: E2 A2 D3 G3 B3 E4\n- C: x32010\n- G: nope\n"
        assert "nope" not in write(parse(text))

    def test_empty_blocks_are_written_as_headings(self):
        text = "```\nC\n```\n---\n## Voicings: E2 A2\n## Simple: E2 A2\n"
        assert roundtrip(text) == "```\nC\n```\n\n---\n\n## Voicings: E2 A2\n\n## Simple: E2 A2\n"

    def test_no_blocks_no_rule(self):
        assert roundtrip("```\nC\n```\n---\n") == "```\nC\n```\n"

    def test_notes_in_blocks_follow_the_items(self):
        text = "```\nC\n```\n---\n## Voicings: E2 A2\nuse a pick\n- C: 32\n"
        assert roundtrip(text) == "```\nC\n```\n\n---\n\n## Voicings: E2 A2\n- C: 32\nuse a pick\n"
