"""Spec §7: voicings."""

from cifra_md import parse

GUITAR = "E2 A2 D3 G3 B3 E4"
UKE = "G4 C4 E4 A4"
DOC = (
    "```\nA | Cm | A | Cm[2]\n```\n\n---\n\n"
    f"## Voicings: {GUITAR}\n- A: x02220\n- Cm: x35543\n- Cm[2]: 8-10-10-8-8-8\n\n"
    f"## Voicings: {UKE}\n- Cm: 0333\n"
)


def block(doc, i=0):
    return {v["key"]: v["frets"] for v in doc["blocks"][i]["voicings"]}


class TestBlocks:
    def test_one_block_per_tuning(self):
        doc = parse(DOC)
        assert [b["tuning"]["text"] for b in doc["blocks"]] == [GUITAR, UKE]
        assert block(doc, 0)["Cm[2]"] == [8, 10, 10, 8, 8, 8]
        assert block(doc, 1) == {"Cm": [0, 3, 3, 3]}
        assert doc["diagnostics"] == []

    def test_default_variation_has_the_empty_label(self):
        doc = parse(DOC)
        assert doc["blocks"][0]["label"] == ""

    def test_label_case_does_not_matter(self):
        doc = parse(f"```\nC\n```\n---\n## voicings: {GUITAR}\n- C: x32010\n")
        assert doc["blocks"][0]["label"] == ""

    def test_named_variation(self):
        doc = parse(f"```\nC\n```\n---\n## Up the neck: {GUITAR}\n- C: x35553\n")
        assert doc["blocks"][0]["label"] == "Up the neck"

    def test_tuning_with_commas(self):
        doc = parse("```\nC\n```\n---\n## Voicings: E2, A2, D3, G3, B3, E4\n- C: x32010\n")
        assert doc["blocks"][0]["tuning"]["id"] == parse(DOC)["blocks"][0]["tuning"]["id"]
        assert doc["blocks"][0]["tuning"]["text"] == "E2 A2 D3 G3 B3 E4"

    def test_heading_without_a_colon(self):
        doc = parse(f"```\nC\n```\n---\n## Voicings {GUITAR}\n- C: x32010\n")
        assert doc["blocks"] == []
        assert doc["diagnostics"][0]["code"] == "bad-block-heading"
        assert "move the rule" in doc["diagnostics"][0]["message"]

    def test_heading_with_a_bad_tuning_skips_its_lines(self):
        doc = parse(f"```\nC\n```\n---\n## Voicings: {GUITAR}\n- C: x32010\n## Voicings: guitar\n- G: 320003\nnotes\n## Voicings: {UKE}\n- C: 0003\n")
        assert [b["tuning"]["text"] for b in doc["blocks"]] == [GUITAR, UKE]
        assert doc["blocks"][0]["notes"] == []
        assert [d["code"] for d in doc["diagnostics"]] == ["bad-block-heading"]
        assert "E2 A2 D3 G3 B3 E4" in doc["diagnostics"][0]["message"]

    def test_duplicate_blocks_merge_with_the_later_winning(self):
        doc = parse(f"```\nC\n```\n---\n## Voicings: {GUITAR}\n- C: x32010\n- G: 320003\n## Voicings: E2, A2, D3, G3, B3, E4\n- C: x35553\n")
        assert len(doc["blocks"]) == 1
        assert block(doc) == {"C": ["x", 3, 5, 5, 5, 3], "G": [3, 2, 0, 0, 0, 3]}
        assert [d["code"] for d in doc["diagnostics"]] == ["duplicate-block"]

    def test_tuning_identity_is_by_sound(self):
        doc = parse("```\nC\n```\n---\n## Voicings: Eb2 A2\n- C: 32\n## Voicings: D#2 A2\n- G: 10\n")
        assert len(doc["blocks"]) == 1

    def test_empty_block_is_kept(self):
        doc = parse(f"```\nC\n```\n---\n## Simple: {GUITAR}\n")
        assert doc["blocks"][0]["voicings"] == []

    def test_notes_in_a_block(self):
        doc = parse(f"```\nC\n```\n---\n## Voicings: {GUITAR}\nUse a capo.\n- C: x32010\n```\nnot music\n```\n")
        assert doc["blocks"][0]["notes"] == ["Use a capo.", "```", "not music", "```"]
        assert block(doc) == {"C": ["x", 3, 2, 0, 1, 0]}

    def test_lines_before_any_block_are_dropped_and_reported(self):
        doc = parse(f"```\nC\n```\n---\nstray\n- C: x32010\n## Voicings: {GUITAR}\n- C: x32010\n")
        assert [d["code"] for d in doc["diagnostics"]] == ["notes-outside-block", "item-outside-block"]


class TestItems:
    def test_key_with_marker(self):
        doc = parse(DOC)
        entry = doc["blocks"][0]["voicings"][2]
        assert entry == {"key": "Cm[2]", "symbol": "Cm", "index": 2, "frets": [8, 10, 10, 8, 8, 8]}

    def test_index_one_is_the_bare_key(self):
        doc = parse(f"```\nC\n```\n---\n## Voicings: {GUITAR}\n- C[1]: x32010\n")
        assert doc["blocks"][0]["voicings"][0]["key"] == "C"

    def test_key_need_not_be_a_chord(self):
        doc = parse(f"```\nwobble\n```\n---\n## Voicings: {GUITAR}\n- wobble: x32010\n- N.C.: xxxxxx\n")
        assert set(block(doc)) == {"wobble", "N.C."}

    def test_whitespace_around_the_colon(self):
        doc = parse(f"```\nC\n```\n---\n## Voicings: {GUITAR}\n-   C :   x32010  \n")
        assert block(doc) == {"C": ["x", 3, 2, 0, 1, 0]}

    def test_other_list_markers(self):
        doc = parse(f"```\nC\n```\n---\n## Voicings: {GUITAR}\n* C: x32010\n+ G: 320003\n")
        assert set(block(doc)) == {"C", "G"}

    def test_problems_are_reported_and_skipped(self):
        doc = parse(f"```\nC\n```\n---\n## Voicings: {GUITAR}\n- C: not-a-shape\n- G 320003\n- : x32010\n- Am: x0221\n- D: xx0232\n")
        assert block(doc) == {"D": ["x", "x", 0, 2, 3, 2]}
        assert [d["code"] for d in doc["diagnostics"]] == ["bad-voicing"] * 4
        assert doc["diagnostics"][3]["message"] == "5 frets for 6 strings"

    def test_repeated_key_last_wins(self):
        doc = parse(f"```\nC\n```\n---\n## Voicings: {GUITAR}\n- C: x32010\n- C: x35553\n")
        assert block(doc) == {"C": ["x", 3, 5, 5, 5, 3]}
        assert len(doc["blocks"][0]["voicings"]) == 1

    def test_items_are_presented_in_canonical_order(self):
        doc = parse(f"```\nC\n```\n---\n## Voicings: {GUITAR}\n- G: 320003\n- Cm[2]: x35543\n- C: x32010\n")
        assert [v["key"] for v in doc["blocks"][0]["voicings"]] == ["C", "Cm[2]", "G"]

    def test_blocks_are_presented_in_canonical_order(self):
        doc = parse(f"```\nC\n```\n---\n## Hard: {UKE}\n## Voicings: {GUITAR}\n## Voicings: {UKE}\n## Easy: {UKE}\n")
        assert [(b["tuning"]["text"], b["label"]) for b in doc["blocks"]] == [(UKE, ""), (UKE, "Hard"), (UKE, "Easy"), (GUITAR, "")]
