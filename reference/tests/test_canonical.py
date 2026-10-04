"""Spec §8: the canonical form, one test per rule the canonical writer follows.

Every case gives an input whose canonical text is now fully determined, and
`canon` checks that canonicalising is a fixed point and that the canonical
text reads back as the canonical model.
"""

import pytest

from cifra_md import parse, write
from cifra_md.text import NotUTF8Error
from cifra_md.write import canonical, serialize

from conftest import chart

GUITAR = "E2 A2 D3 G3 B3 E4"


def canon(text):
    doc = parse(text)
    out = write(doc)
    again = parse(out)
    strip = lambda d: {k: v for k, v in d.items() if k not in ("diagnostics", "sungAt")}
    assert strip(again) == strip(canonical(doc)), out
    assert write(again) == out, "canonicalising twice differs from once"
    return out


def fenced(body, heading="## A"):
    return f"{heading}\n```\n{body}\n```\n"


# --- §8.4 step 1: the text -------------------------------------------------------------


class TestText:
    def test_bom_crlf_and_lone_cr(self):
        assert canon("\ufeff# T\r\n\r## A\r```\rC\r\n```") == "# T\n\n" + fenced("C")

    def test_every_byte_order_mark_is_removed(self):
        # Kept, a U+FEFF that came to begin the canonical text would read as a
        # byte order mark the next time, and canonicalising would not settle.
        assert canon("\ufeff\ufeff# T\n") == "# T\n"
        assert canon("\n\ufeffhello\n") == "hello\n"
        assert canon("- a: x\ufeffy\n") == "- a: xy\n"

    def test_trailing_spaces_are_removed_everywhere(self):
        text = "# T  \n\n## A  \nnotes   \n\n```tab  \ne|--0--|   \n```   \n"
        assert canon(text) == "# T\n\n## A\nnotes\n\n```tab\ne|--0--|\n```\n"

    def test_tabs_become_one_space(self):
        assert canon("## A\n```\nG\tD\nWhen\tI saw\n```\n\tindented note\n") == (
            "## A\n```\nG D\nWhen I saw\n```\n\n indented note\n"
        )

    def test_nfc(self):
        assert canon("# Cafe\u0301\n") == "# Caf\u00e9\n"

    def test_nfc_keeps_chords_over_their_syllables(self):
        # Columns count code points of the NFC text, so a chord placed over
        # a composed letter stays over it.
        text = fenced("     G\nCafe\u0301 com leite")
        doc = parse(text)
        items = doc["sections"][0]["body"][0]["lines"][0]["measures"][0]["items"]
        assert items[0]["words"] == "Caf\u00e9 " and items[1]["words"] == "com leite"
        assert canon(text) == fenced("     G\nCaf\u00e9 com leite")

    def test_no_break_space_is_not_whitespace(self):
        doc = parse(fenced("C\u00a0| G"))
        items = [it for m in doc["sections"][0]["body"][0]["lines"][0]["measures"] for it in m["items"]]
        assert items[0] == {"type": "unknown", "text": "C\u00a0"}
        assert canon("- a: \u00a0x\n") == "- a: \u00a0x\n"
        assert canon("- a:\u00a0x\n") == ""  # no space after the colon: not a property

    def test_not_utf8_is_refused(self):
        with pytest.raises(NotUTF8Error):
            parse(b"# T\n\xff\n")

    def test_empty_document_is_the_empty_file(self):
        assert canon("") == ""
        assert canon("\ufeff\n  \n\t\n") == ""

    def test_one_final_newline(self):
        assert canon(fenced("C") + "\n\n\n") == fenced("C")
        assert canon("```\nC\n```") == "```\nC\n```\n"


# --- §8.4 step 2: metadata ---------------------------------------------------------------


class TestMetadata:
    def test_title_and_properties_then_one_blank_line(self):
        text = "\n\n#   My   Song  \n\n* Artist :  Someone  \n\n+ notation: american\n\n\n## A\n```\nC\n```\n"
        assert canon(text) == "# My Song\n- artist: Someone\n- notation: american\n\n" + fenced("C")

    def test_title_only(self):
        assert canon("#  Only  \n\n\n") == "# Only\n"

    def test_empty_title_is_dropped(self):
        assert canon("#\n- a: 1\n") == "- a: 1\n"

    def test_keys_lower_cased_first_position_last_value(self):
        assert canon("- B: 1\n- a: 2\n- b: 3\n") == "- b: 3\n- a: 2\n"

    def test_empty_value(self):
        assert canon("- a:\n- b:    \n") == "- a:\n- b:\n"

    def test_items_that_are_not_properties_are_dropped(self):
        doc = parse("- https://example.com\n- not a property\n-\n- a: 1\n")
        assert [d["code"] for d in doc["diagnostics"]] == ["bad-property"] * 3
        assert write(doc) == "- a: 1\n"

    def test_never_adds_a_property(self):
        # C7+ is ambiguous (§5.6), but copying the author's symbol is not
        # emitting one: canonicalising does not declare `notation`.
        assert canon(fenced("C7+")) == fenced("C7+")


# --- §8.4 step 3: the chart -------------------------------------------------------------------


class TestChartLayout:
    def test_items_and_bars_one_space_apart(self):
        assert canon(fenced("  C   Am |F   G  ||")) == fenced("C Am | F G ||")

    def test_close_mark_then_count(self):
        assert canon(fenced("|:G|D:| x3")) == fenced("|: G | D :| x3")
        assert canon(fenced("|: Am | Dm :|| 2x")) == fenced("|: Am | Dm :|| x2")

    def test_marks_against_bars(self):
        assert canon(fenced("C |:")) == fenced("C |:")
        assert canon(fenced("||: F :||: G :||")) == fenced("||: F :||: G :||")
        assert canon(fenced("x2 :| ) ||: C")) == fenced("x2 :| ) ||: C")

    def test_bar_line_spellings(self):
        assert canon(fenced("C ||| G")) == fenced("C || G")

    def test_counts_endings_marks(self):
        assert canon(fenced("(C G) (2x) | Am bis")) == fenced("( C G ) x2 | Am x2")
        assert canon(fenced("|: Dm |1. C :|2. G |")) == fenced("|: Dm | 1. C :| 2. G |")

    def test_no_chord_and_punctuation(self):
        assert canon(fenced("nc, | n.c.; | C,")) == fenced("N.C. | N.C. | C")

    def test_anchor_comes_first_in_its_measure(self):
        assert canon(fenced("Dm @9 | G7")) == fenced("@9 Dm | G7")
        assert canon(fenced("@9\nDm")) == fenced("@9 Dm")

    def test_unknown_tokens_kept(self):
        assert canon(fenced("C | wobble | (solo) | Cm [2]")) == fenced("C | wobble | (solo) | Cm [2]")

    def test_a_line_that_would_read_as_something_else_is_guarded(self):
        # The leading `,` was punctuation, dropped on reading; written back
        # without it the line would be a forced line, an annotation or a heading.
        for line in (", >x C", ", //x", ", [x] C", ", Tom: C"):
            out = canon(fenced(line))
            assert out == fenced(", " + line[2:]), line

    def test_bracket_and_label_headings_keep_their_first_chord_line(self):
        text = "```\n[Intro]\nG D\n\n[Verse] (2x)\nC | G\nRefrão:\n\nC G\n```\n"
        assert canon(text) == "```\n[Intro] G D\n\n[Verse x2] C | G\n\nRefrão: C G\n```\n"

    def test_a_count_alone_is_not_joined_to_a_bracket_heading(self):
        out = canon("```\n[A]\nx2\n```\n")
        assert out == "```\n[A]\nx2\n```\n"

    def test_a_line_with_unknown_tokens_is_not_joined_to_a_label(self):
        assert canon("```\nIntro:\nC wobble\n```\n") == "```\nIntro:\nC wobble\n```\n"

    def test_annotations(self):
        assert canon(fenced("  //repete\n//")) == fenced("// repete\n//")


class TestBlankLinesInFences:
    def test_runs_collapse_and_ends_are_dropped(self):
        assert canon(fenced("\n\nC | G\n\n\n\nAm | F\n\n")) == fenced("C | G\n\nAm | F")

    def test_a_blank_line_keeps_a_chord_line_from_the_words(self):
        text = fenced("G           D\nWhen I first saw you\nC  G\n\nnot under the chords")
        out = canon(text)
        assert out == fenced("G           D\nWhen I first saw you\nC G\n\nnot under the chords")
        kinds = [ln["kind"] for ln in parse(out)["sections"][0]["body"][0]["lines"]]
        assert kinds == ["sung", "chart", "break", "lyric"]

    def test_in_a_chart_a_blank_line_keeps_a_line_from_making_it_sung(self):
        out = canon(fenced("C | G\n\nla la"))
        assert parse(out)["sung"] is False
        assert out == fenced("C | G\n\nla la")

    def test_a_line_of_bars_alone_reads_as_blank(self):
        assert canon(fenced("C | G\n| |\nAm | F")) == fenced("C | G\n\nAm | F")


class TestFences:
    def test_music_fence_is_bare(self):
        assert canon("~~~ CIFRA \nC\n~~~~\n") == "```\nC\n```\n"

    def test_info_string_trimmed_and_lower_cased(self):
        assert canon("```  Tab  \ne|--0--|\n```\n") == "```tab\ne|--0--|\n```\n"

    def test_verbatim_fence_long_enough_for_its_content(self):
        text = "````tab\n```\ne|--0--|\n```\n````\n"
        assert canon(text) == text
        assert canon("~~~tab\n``` x\n  `````\n~~~\n") == "``````tab\n``` x\n  `````\n``````\n"

    def test_music_fence_long_enough_for_its_content(self):
        assert canon("~~~\n```\n~~~\n") == "````\n```\n````\n"

    def test_info_with_a_backtick_takes_tildes(self):
        assert canon("~~~ a`b\ntext\n~~~\n") == "~~~a`b\ntext\n~~~\n"

    def test_verbatim_keeps_leading_spaces_and_blank_lines(self):
        text = "```tab\n\n  e|--0--|\n\n\n  B|--1--|\n```\n"
        assert canon(text) == text

    def test_unclosed_fence_closes_after_the_last_non_blank_line(self):
        doc = parse("## A\n```tab\ne|--0--|\n\nB|--1--|\n\n\n")
        assert [d["code"] for d in doc["diagnostics"]] == ["unclosed-fence"]
        assert write(doc) == "## A\n```tab\ne|--0--|\n\nB|--1--|\n```\n"
        assert canon("## A\n```\nC | G\n## not a heading\n\n") == fenced("C | G\n## not a heading")

    def test_empty_fence_is_kept(self):
        assert canon("## A\n```\n```\n") == "## A\n```\n```\n"

    def test_a_fence_that_opens_with_a_heading_belongs_to_it(self):
        assert canon("## A\n```\n\n[B]\nC\n```\n") == "## A\n\n```\n[B] C\n```\n"


class TestStructuralLines:
    def test_up_to_three_leading_spaces(self):
        text = "   # T\n   - a: 1\n\n   ## A\n   ```\nC\n   ```\n\n   ---\n\n   ## Voicings: E2 A2\n   - C: 32\n"
        assert canon(text) == "# T\n- a: 1\n\n## A\n```\nC\n```\n\n---\n\n## Voicings: E2 A2\n- C: 32\n"

    def test_four_spaces_is_notes(self):
        assert canon("## A\n    ## not a heading\n") == "## A\n    ## not a heading\n"


class TestHeadings:
    def test_level_text_and_closing_sequence(self):
        assert canon("####   Verse    One  ###\n") == "## Verse One\n"

    def test_a_space_after_the_hashes_is_required(self):
        assert canon("##Verse\n") == "##Verse\n"  # notes
        assert parse("##Verse\n")["sections"][0]["heading"] is None

    def test_text_that_ends_like_a_closing_sequence(self):
        assert canon("## C# # #\n```\nG\n```\n") == "## C# # #\n```\nG\n```\n"
        assert parse("## C# # #\n")["sections"][0]["name"] == "C# #"

    def test_seven_hashes_is_notes(self):
        assert canon("####### x\n") == "####### x\n"

    def test_anchor_then_count(self):
        assert canon("## Chorus (2x) @9\n") == "## Chorus @9 x2\n"
        assert canon("## bis\n") == "## bis\n"

    def test_empty_heading(self):
        assert canon("## ##\n```\nC\n```\n") == "##\n```\nC\n```\n"

    def test_heading_then_first_part_then_one_blank_line(self):
        text = "## A\n\n\nslowly\n\n\n\n```\nC\n```\n\n\n\nthen faster\n\n\nand more\n## B\n"
        assert canon(text) == "## A\nslowly\n\n```\nC\n```\n\nthen faster\n\nand more\n\n## B\n"


class TestNotes:
    def test_leading_spaces_kept(self):
        assert canon("## A\n  two\n      code\n") == "## A\n  two\n      code\n"


# --- §8.3 the footnote invariants ------------------------------------------------------------


VOICED = "\n---\n\n## Voicings: " + GUITAR + "\n"


class TestFootnotes:
    def test_index_zero_and_leading_zeros(self):
        doc = parse(fenced("Cm[0] | Cm[02] | Cm[1]"))
        keys = [it["key"] for m in doc["sections"][0]["body"][0]["lines"][0]["measures"] for it in m["items"]]
        assert keys == ["Cm", "Cm[2]", "Cm"]
        assert canon(fenced("Cm[0] | Cm[02] | Cm[1]")) == fenced("Cm | Cm[2] | Cm")

    def test_i1_unused_keys_dropped(self):
        out = canon(fenced("C") + VOICED + "- C: x32010\n- G: 320003\n- C[2]: x35553\n")
        assert out == fenced("C") + VOICED + "- C: x32010\n"

    def test_i2_renumbered_from_use(self):
        text = fenced("Cm | Cm[3]") + VOICED + "- Cm: x35543\n- Cm[2]: 5333xx\n- Cm[3]: 8-10-10-8-8-8\n"
        assert canon(text) == fenced("Cm | Cm[2]") + VOICED + "- Cm: x35543\n- Cm[2]: 8-10-10-8-8-8\n"

    def test_i2_on_a_sung_line_keeps_the_columns(self):
        text = fenced("Cm[3]  G     Cm\nquando eu te vi passar")
        assert canon(text) == fenced("Cm[2]  G     Cm\nquando eu te vi passar")
        text = fenced("Cm[2] G     Cm[3]\nquando eu te vi passar") + VOICED + "- Cm[2]: x35543\n"
        assert canon(text) == fenced("Cm    G     Cm[2]\nquando eu te vi passar") + VOICED + "- Cm: x35543\n"

    def test_i3_merges_what_no_block_tells_apart(self):
        text = fenced("D | D[2]") + VOICED + "- D: xx0232\n- D[2]: xx0232\n\n## Easy: " + GUITAR + "\n- D: xx0232\n- D[2]: xx0232\n"
        assert canon(text) == fenced("D | D") + VOICED + "- D: xx0232\n\n## Easy: " + GUITAR + "\n- D: xx0232\n"

    def test_i3_keeps_what_another_block_tells_apart(self):
        text = fenced("D | D[2]") + VOICED + "- D: xx0232\n- D[2]: xx0232\n\n## Voicings: G4 C4 E4 A4\n- D: 2220\n- D[2]: 7655\n"
        assert canon(text) == text

    def test_i3_a_block_with_one_of_the_two_tells_them_apart(self):
        text = fenced("D | D[2]") + VOICED + "- D: xx0232\n- D[2]: xx0232\n\n## Voicings: G4 C4 E4 A4\n- D: 2220\n"
        assert canon(text) == text

    def test_i3_fingering_is_part_of_the_shape(self):
        text = fenced("D | D[2]") + VOICED + "- D: xx0232 (- - - 1 3 2)\n- D[2]: xx0232 (- - - 1 2 3)\n"
        assert canon(text) == text

    def test_no_blocks_no_merge(self):
        assert canon(fenced("D | D[2]")) == fenced("D | D[2]")

    def test_a_block_emptied_stays_as_its_heading(self):
        assert canon(fenced("C") + VOICED + "- G: 320003\n") == fenced("C") + VOICED.rstrip("\n") + "\n"


# --- §8.4 step 4: voicings ---------------------------------------------------------------------


class TestVoicings:
    def test_tuning_spelling_kept_letters_uppercase_single_spaces(self):
        out = canon(fenced("C") + "\n---\n\n## Voicings:  e♭2,a2 , D3,g3 B3  e4\n- C: x32010\n")
        assert "## Voicings: E♭2 A2 D3 G3 B3 E4\n" in out

    def test_merged_blocks_take_the_first_spelling(self):
        text = fenced("C | G") + "\n---\n\n## Voicings: Eb2 A2\n- C: 32\n## Voicings: D#2 A2\n- G: 10\n"
        assert canon(text) == fenced("C | G") + "\n---\n\n## Voicings: Eb2 A2\n- C: 32\n- G: 10\n"

    def test_label_trimmed_and_collapsed_case_kept(self):
        text = fenced("C") + "\n---\n\n## Up   the  neck : E2 A2\n- C: 32\n## up the neck: E2 A2\n- C: 55\n## VOICINGS: E2 A2\n"
        assert canon(text) == fenced("C") + "\n---\n\n## Voicings: E2 A2\n\n## Up the neck: E2 A2\n- C: 32\n\n## up the neck: E2 A2\n- C: 55\n"

    def test_what_canonicalising_drops_in_the_voicings_part(self):
        text = fenced("C") + "\n---\nbefore any block\n- C: 32\n## Voicings: E2 A2\n- C: 32\nnote   \n\n- G 32\n---\n- D: nope\n"
        doc = parse(text)
        codes = [d["code"] for d in doc["diagnostics"]]
        assert codes == ["notes-outside-block", "item-outside-block", "bad-voicing", "extra-rule", "bad-voicing"]
        assert write(doc) == fenced("C") + "\n---\n\n## Voicings: E2 A2\n- C: 32\nnote\n"

    def test_no_blocks_no_rule_and_rule_first_when_alone(self):
        assert canon(fenced("C") + "\n---\n") == fenced("C")
        assert canon("---\n## Voicings: E2 A2\n") == "---\n\n## Voicings: E2 A2\n"

    def test_items_sort_by_code_point(self):
        # U+FF0B sorts before U+1D12B by code point, after it by UTF-16 code unit.
        text = fenced("X\U0001d12b | X\uff0b | A\u266d | Am | A") + VOICED
        text += "- X\U0001d12b: x32010\n- X\uff0b: x32010\n- A\u266d: x32010\n- Am: x02210\n- A: x02220\n"
        out = canon(text)
        assert out.endswith("- A: x02220\n- Am: x02210\n- A\u266d: x32010\n- X\uff0b: x32010\n- X\U0001d12b: x32010\n")

    def test_a_key_an_unknown_token_uses_is_kept(self):
        text = fenced("C | Cx7(#11b13)") + VOICED + "- C: x32010\n- Cx7(#11b13): x3x330\n- N.C.: xxxxxx\n"
        assert canon(text) == fenced("C | Cx7(#11b13)") + VOICED + "- C: x32010\n- Cx7(#11b13): x3x330\n"

    def test_legacy_forms_are_not_converted(self):
        # Appendix A: a `key = frets` line is notes to this reader, and stays notes.
        text = fenced("C") + VOICED + "C = x32010\n"
        assert canon(text) == text


# --- §8.4.5 sung lines ---------------------------------------------------------------------------


class TestSungLines:
    def test_columns_kept(self):
        text = fenced("G           D\nWhen I first saw you")
        assert canon(text) == text

    def test_a_token_that_shrinks_leaves_the_rest_in_place(self):
        assert canon(fenced("Cm[1] (2x)  G\nla la la la la la")) == fenced("Cm    x2    G\nla la la la la la")

    def test_a_token_that_grows_pushes_only_when_it_must(self):
        assert canon(fenced("nc    G\nla la la la")) == fenced("N.C.  G\nla la la la")
        out = canon(fenced("nc G\nla la la la"))
        assert out == fenced("N.C. G\nla la la la")
        items = parse(out)["sections"][0]["body"][0]["lines"][0]["measures"][0]["items"]
        assert [(it["column"], it["words"]) for it in items] == [(0, "la la"), (5, " la la")]

    def test_only_a_bar_line_touches_its_neighbours(self):
        assert canon(fenced("(G   D)  Em\nla la la la la")) == fenced("( G  D ) Em\nla la la la la")
        assert canon(fenced("G|D    :|\nla la la la la")) == fenced("G|D    :|\nla la la la la")
        assert canon(fenced("(nc  )\nla la la la")) == fenced("( N.C. )\nla la la la")

    def test_anchor_keeps_its_column_on_a_sung_line(self):
        assert canon(fenced("@9 G     D\nla la la la")) == fenced("@9 G     D\nla la la la")

    def test_lead_words_and_leading_spaces(self):
        text = fenced("        G\nOh when I first\n    D\n    la la")
        assert canon(text) == text

    def test_forced_line(self):
        assert canon(fenced("G             D\n>  A tarde era clara")) == fenced("G             D\n>  A tarde era clara")
        assert canon(fenced("C | G\n\n  > A")) == fenced("C | G\n\n>   A")

    def test_guard_on_a_sung_chord_line(self):
        text = fenced(", >x  |  C\noh my words are here")
        assert parse(text)["sung"] is True
        assert canon(text) == text


# --- §2.8, §8.4.5: a bar anchor on a sung line keeps its column -----------------------------------

WORDS = "When I first saw you walking down"


def sung_measures(text):
    return parse(text)["sections"][0]["body"][0]["lines"][0]["measures"]


def columns(text, line=0, kind="chord"):
    """Every item's column of one kind on a sung line, in order."""
    ms = parse(text)["sections"][0]["body"][0]["lines"][line]["measures"]
    return [it["column"] for m in ms for it in m["items"] if it["type"] == kind]


class TestSungAnchors:
    @pytest.mark.parametrize(
        "chords",
        [
            "@12 G|D",
            "| @5 G   | D   | Em  |",
            "@5 G       D",
            "|@5 G|@6 D",  # touching a bar line
            "(@5 G   D )",  # touching a `(` before it
            "G  @5) D",  # touching a `)` after it
            "G    D @5  Em",  # anywhere in its measure
        ],
    )
    def test_written_back_where_it_was_written(self, chords):
        text = fenced(f"{chords}\n{WORDS}")
        want = chords.replace("Em  |", "Em |")  # the closing bar line has no column
        assert canon(text) == fenced(f"{want}\n{WORDS}")
        assert columns(canon(text)) == columns(text)

    def test_the_column_is_in_the_model(self):
        ms = sung_measures(fenced(f"| @5 G   | D   | Em  |\n{WORDS}"))
        assert [(m.get("anchor"), m.get("anchorColumn"), m["column"]) for m in ms] == [(5, 2, 0), (None, None, 9), (None, None, 15)]

    def test_the_anchor_does_not_divide_the_words(self):
        ms = sung_measures(fenced(f"G     @5     D\n{WORDS}"))
        assert [it["words"] for it in ms[0]["items"]] == ["When I first ", "saw you walking down"]

    def test_the_last_anchor_wins_with_its_column(self):
        text = fenced(f"@5 G @6  D\n{WORDS}")
        m = sung_measures(text)[0]
        assert (m["anchor"], m["anchorColumn"]) == (6, 5)
        assert canon(text) == fenced(f"   G @6  D\n{WORDS}")

    def test_a_heading_anchor_has_no_column(self):
        text = fenced(f"G     D\n{WORDS}", heading="## A @9")
        assert "anchor" not in sung_measures(text)[0]
        assert canon(text) == text

    def test_an_anchor_on_a_chart_line_has_no_column(self):
        text = fenced(f"G     D\n{WORDS}\n@5 C | F")
        line = parse(text)["sections"][0]["body"][0]["lines"][1]
        assert line["kind"] == "chart" and "anchorColumn" not in line["measures"][0]
        assert canon(text) == fenced(f"G     D\n{WORDS}\n@5 C | F")

    # A number carried in from elsewhere has no column on this line: it goes
    # right after the last item that makes its measure, then keeps that column.

    def test_carried_from_an_anchor_only_line(self):
        text = fenced(f"@9\n| G       | D\n{WORDS}")
        m = sung_measures(text)[0]
        assert m["anchor"] == 9 and "anchorColumn" not in m
        out = canon(text)
        assert out == fenced(f"| G @9    | D\n{WORDS}")
        assert sung_measures(out)[0]["anchorColumn"] == 4
        assert columns(out) == columns(text)

    def test_carried_from_before_the_measure_s_bar_line(self):
        text = fenced(f"@9 | G      | D\n{WORDS}")
        assert "anchorColumn" not in sung_measures(text)[0]
        assert canon(text) == fenced(f"   | G @9   | D\n{WORDS}")

    def test_carried_from_the_end_of_the_line_before(self):
        # The number used to be dropped here: a sung line did not pass on an
        # anchor after its last bar.
        text = fenced(f"G     | @9\n{WORDS}\n| D      | Em\n{WORDS}")
        line = parse(text)["sections"][0]["body"][0]["lines"][1]
        assert line["measures"][0]["anchor"] == 9 and "anchorColumn" not in line["measures"][0]
        assert canon(text) == fenced(f"G |\n{WORDS}\n| D @9   | Em\n{WORDS}")

    def test_carried_with_no_room_moves_what_follows(self):
        # Where the gap cannot hold it, the rest of the line moves right, as
        # it does for a token that grows; once written, it stays put.
        text = fenced(f"@9\nG  | D\n{WORDS}")
        assert canon(text) == fenced(f"G @9 | D\n{WORDS}")

    # Tokens that change width move the anchor as they move any token.

    def test_a_token_that_grows_pushes_the_anchor_not_the_chord(self):
        text = fenced(f"nc @5   G\n{WORDS}")
        out = canon(text)
        assert out == fenced(f"N.C. @5 G\n{WORDS}")
        assert sung_measures(out)[0]["anchorColumn"] == 5
        assert columns(out) == columns(text)

    def test_a_token_that_shrinks_leaves_the_anchor_in_place(self):
        text = (
            fenced(f"Cm[2] @5  G\n{WORDS}")
            + f"\n---\n\n## Voicings: {GUITAR}\n- Cm: x35543\n- Cm[2]: x35543\n- G: 320003\n"
        )
        out = canon(text)
        assert out.startswith(fenced(f"Cm    @5  G\n{WORDS}"))
        assert sung_measures(out)[0]["anchorColumn"] == 6

    # A model an application edited: the anchor yields, never a chord.

    def test_an_anchor_column_on_a_chord_goes_after_it(self):
        doc = parse(fenced(f"@5 G       D\n{WORDS}"))
        doc["sections"][0]["body"][0]["lines"][0]["measures"][0]["anchorColumn"] = 3
        out = write(doc)
        assert out == fenced(f"   G @5    D\n{WORDS}")
        assert write(parse(out)) == out

    def test_an_anchor_column_outside_its_measure_stays_in_it(self):
        doc = parse(fenced(f"G     | @5 D\n{WORDS}"))
        doc["sections"][0]["body"][0]["lines"][0]["measures"][1]["anchorColumn"] = 1
        out = write(doc)
        assert out == fenced(f"G     | @5 D\n{WORDS}")
        assert sung_measures(out)[1]["anchor"] == 5

    def test_brackets_on_both_sides_are_never_touched_at_once(self):
        doc = parse(fenced(f"( @5 ) G\n{WORDS}"))
        m = doc["sections"][0]["body"][0]["lines"][0]["measures"][0]
        m["items"][1]["column"] = 3  # the `)` moved against the anchor
        m["anchorColumn"] = 1  # and the anchor against the `(`
        out = write(doc)
        assert out == fenced(f"(@5 )  G\n{WORDS}")
        assert sung_measures(out)[0]["anchor"] == 5


# --- serialising a model that was not read --------------------------------------------------------


def test_a_section_created_from_the_model():
    doc = parse("# T\n")
    line = parse(fenced("C  Am |F"))["sections"][0]["body"][0]
    doc["sections"].append({"name": "New", "heading": "markdown", "anchor": None, "body": [line], "groups": []})
    assert write(doc) == "# T\n\n## New\n```\nC Am | F\n```\n"
    assert serialize(canonical(doc)) == write(doc)


# --- Bars are numbered from 1: zero is never an anchor, a count or an ending -----------


class TestZero:
    def test_bar_anchor_zero_is_an_unknown_token(self):
        doc = parse(fenced("@0 C | G"))
        measure = doc["sections"][0]["body"][0]["lines"][0]["measures"][0]
        assert "anchor" not in measure
        assert any(it["type"] == "unknown" and it["text"] == "@0" for it in measure["items"])
        canon(fenced("@0 C | G"))

    def test_bar_anchor_with_leading_zero_is_its_value(self):
        doc = parse(fenced("@05 C | G"))
        assert doc["sections"][0]["body"][0]["lines"][0]["measures"][0]["anchor"] == 5

    def test_heading_anchor_zero_stays_in_the_name(self):
        doc = parse("## A @0\n```\nC\n```\n")
        assert doc["sections"][0]["name"] == "A @0"
        assert doc["sections"][0]["anchor"] is None

    def test_count_zero_is_not_a_count(self):
        doc = parse("## A x0\n```\nC\n```\n")
        assert doc["sections"][0]["name"] == "A x0"
        assert "times" not in doc["sections"][0]
        canon(fenced("C | G x0"))
