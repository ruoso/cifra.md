"""Spec §5: chord symbols."""

import pytest

from cifra_md.chord import DIALECTS, chord_tones, parse_chord


def tones(text, dialect="brazilian"):
    r = parse_chord(text, dialect)
    assert r["chord"] is not None, r["errors"]
    return " ".join(chord_tones(r["chord"]))


@pytest.mark.parametrize(
    "text,expected",
    [
        ("C", "C E G"),
        ("Cm", "C Eb G"),
        ("C7", "C E G Bb"),
        ("C7M", "C E G B"),
        ("Cmaj7", "C E G B"),
        ("CM7", "C E G B"),
        ("C∆7", "C E G B"),
        ("CM", "C E G B"),
        ("C∆", "C E G B"),
        ("C6", "C E G A"),
        ("Cm6", "C Eb G A"),
        ("C5", "C G"),
        ("C4", "C F G"),
        ("Csus4", "C F G"),
        ("Csus", "C F G"),
        ("Csus2", "C D G"),
        ("C+", "C E G#"),
        ("Caug", "C E G#"),
        ("Cdim", "C Eb Gb"),
        ("C°7", "C Eb Gb Bbb"),
        ("Cdim7", "C Eb Gb Bbb"),
        ("Cm7(5-)", "C Eb Gb Bb"),
        ("Cm7b5", "C Eb Gb Bb"),
        ("Cø7", "C Eb Gb Bb"),
        ("Cø", "C Eb Gb Bb"),
        ("Cmaj7#11", "C E G B F#"),
        ("C7b9", "C E G Bb Db"),
        ("C7(9-)", "C E G Bb Db"),
        ("C7#5", "C E G# Bb"),
        ("C7(5+)", "C E G# Bb"),
        ("C7#9", "C E G Bb D#"),
        ("C7+9", "C E G Bb D#"),
        ("C13", "C E G Bb D A"),
        ("C11", "C E G Bb D F"),
        ("Cm(maj7)", "C Eb G B"),
        ("Cm7M", "C Eb G B"),
        ("CmM7", "C Eb G B"),
        ("C−∆7", "C Eb G B"),
        ("C7M9", "C E G B D"),
        ("Cmaj9", "C E G B D"),
        ("C6/9", "C E G A D"),
        ("Cadd9", "C E G D"),
        ("Cadd2", "C D E G"),
        ("C7(9)", "C E G Bb D"),
        ("C7 9", "C E G Bb D"),
        ("C7,9", "C E G Bb D"),
        ("C7(b9 #11)", "C E G Bb Db F#"),
        ("Calt", "C E G# Bb Db"),
        ("C−7", "C Eb G Bb"),
        ("C-7", "C Eb G Bb"),
        ("Cmin7", "C Eb G Bb"),
        ("Db", "Db F Ab"),
        ("F#m", "F# A C#"),
        ("Bb7", "Bb D F Ab"),
        ("Ebb", "Ebb Gb Bbb"),
        ("Em7(b5)", "E G Bb D"),
        ("A7(b13)", "A C# E G F"),
        ("G7(13)", "G B D F E"),
        ("Fm6", "F Ab C D"),
        ("C♯m7", "C# E G# B"),
        ("D♭7", "Db F Ab Cb"),
    ],
)
def test_tones(text, expected):
    assert tones(text) == expected


def test_slash_bass():
    c = parse_chord("C/E")["chord"]
    assert c["bass"] == {"letter": "E", "accidental": 0}
    assert c["extensions"] == []
    c = parse_chord("Am7/G")["chord"]
    assert c["bass"] == {"letter": "G", "accidental": 0}
    assert c["quality"] == "minor"


def test_compound_quality_is_not_a_bass():
    c = parse_chord("C6/9")["chord"]
    assert c["bass"] is None
    assert [e["degree"] for e in c["extensions"]] == [6, 9]


def test_compound_quality_with_a_bass():
    c = parse_chord("C6/9/E")["chord"]
    assert c["bass"] == {"letter": "E", "accidental": 0}
    assert [e["degree"] for e in c["extensions"]] == [6, 9]


def test_case_is_significant():
    assert parse_chord("CM7")["chord"]["quality"] == "major"
    assert parse_chord("Cm7")["chord"]["quality"] == "minor"
    assert tones("CM7") == "C E G B"
    assert tones("Cm7") == "C Eb G Bb"


def test_flat_root_is_not_a_flat_five():
    assert parse_chord("Bb")["chord"]["root"] == {"letter": "B", "accidental": -1}
    assert parse_chord("B")["chord"]["root"] == {"letter": "B", "accidental": 0}


def test_lowercase_roots_are_not_chords():
    # The reference takes the strict option of §5.1.1: a lyric "a" or "be" is not a chord.
    for text in ("a", "am", "bb", "e7"):
        assert parse_chord(text)["chord"] is None


def test_same_chord_from_different_spellings():
    forms = ["C7M", "Cmaj7", "CM7", "C∆7", "CΔ7", "CMaj7"]
    parsed = [parse_chord(f)["chord"] for f in forms]
    assert all(p == parsed[0] for p in parsed)


def test_half_diminished_normalises_to_dim():
    for f in ("Cm7b5", "Cm7(5-)", "Cø7", "Cø"):
        c = parse_chord(f)["chord"]
        assert c["quality"] == "dim"
        assert c["extensions"] == [{"degree": 7, "alter": -1}]


def test_sharp_five_normalises_to_aug():
    c = parse_chord("C7#5")["chord"]
    assert c["quality"] == "aug"
    assert c["extensions"] == [{"degree": 7, "alter": -1}]


class TestAmbiguities:
    def test_seven_plus_brazilian(self):
        r = parse_chord("C7+", "brazilian")
        assert tones("C7+", "brazilian") == "C E G B"
        assert r["ambiguities"] == [{"kind": "sevenPlus", "chosen": "majorSeventh", "alternative": "dominantSharpFive"}]

    def test_seven_plus_american(self):
        assert tones("C7+", "american") == "C E G# Bb"
        assert tones("C7+", "realbook") == "C E G# Bb"
        r = parse_chord("C7+", "american")
        assert r["ambiguities"][0]["chosen"] == "dominantSharpFive"

    def test_five_plus_and_nine_plus_are_plain_sharps(self):
        assert parse_chord("C7(5+)")["ambiguities"] == []
        assert parse_chord("C7(9+)")["ambiguities"] == []

    def test_bare_nine(self):
        assert tones("C9", "brazilian") == "C E G D"
        assert tones("C9", "american") == "C E G Bb D"
        assert tones("C9", "realbook") == "C E G Bb D"
        r = parse_chord("C9", "brazilian")
        assert r["ambiguities"] == [{"kind": "bareNine", "chosen": "add", "alternative": "dominant"}]

    def test_nine_with_a_stated_seventh_is_not_ambiguous(self):
        for f in ("C7(9)", "Cmaj9", "Cadd9", "C7M9"):
            assert parse_chord(f)["ambiguities"] == [], f

    def test_bare_degree_sign(self):
        for d in DIALECTS:
            assert tones("B°", d) == "B D F Ab"
            r = parse_chord("B°", d)
            assert r["ambiguities"] == [{"kind": "degreeSign", "chosen": "diminishedSeventh", "alternative": "diminishedTriad"}]

    def test_dim_word_is_the_triad(self):
        assert tones("Bdim") == "B D F"
        assert parse_chord("Bdim")["ambiguities"] == []
        assert parse_chord("B°7")["ambiguities"] == []
        assert parse_chord("Bdim7")["ambiguities"] == []

    def test_bare_four_after_a_degree(self):
        assert tones("C7(4)", "brazilian") == "C F G Bb"
        assert tones("C7(4)", "american") == "C E F G Bb"
        assert tones("C7(4)", "realbook") == "C E F G Bb"
        r = parse_chord("C7(4)", "brazilian")
        assert r["ambiguities"] == [{"kind": "bareFour", "chosen": "suspended", "alternative": "added"}]
        assert tones("C9(4)", "brazilian") == "C F G D"  # bare 9 is add9 in Brazilian too

    def test_bare_four_on_a_minor_triad_is_added_everywhere(self):
        for d in DIALECTS:
            assert tones("Cm7(4)", d) == "C Eb F G Bb"
            assert parse_chord("Cm7(4)", d)["ambiguities"] == []

    def test_sus4_and_add4_spelled_out_are_not_ambiguous(self):
        for f in ("C7sus4", "C7sus", "C7add4", "Csus4", "C4"):
            assert parse_chord(f)["ambiguities"] == [], f
        assert tones("C7sus4") == "C F G Bb"
        assert tones("C7add4") == "C E F G Bb"

    def test_unknown_dialect(self):
        r = parse_chord("C", "klingon")
        assert r["chord"] is None


@pytest.mark.parametrize("bad", ["", "   ", "H7", "xyz", "C##bb7", "7", "Cmaj/", "C(7", "C7)", "(2x)", "N.C.", "1.", "x2", "%", "@9"])
def test_errors_are_returned_not_raised(bad):
    r = parse_chord(bad)
    assert r["chord"] is None
    assert r["errors"]


def test_spelling_from_root():
    assert tones("Db7") == "Db F Ab Cb"
    assert tones("C7b5") == "C E Gb Bb"
    assert tones("Cmaj7#11") == "C E G B F#"
