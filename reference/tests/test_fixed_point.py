"""Spec §8.1: canonicalising is a fixed point, and the canonical text reads
back as the canonical model, for any document a reader can be given.

The documents are generated from a fixed seed, out of the constructs most
likely to be written back wrongly: repeat marks against bar lines, counts
and endings outside a measure, marks touching chords, anchors, tokens that
change width, cifra headings, fences inside fences, blank lines, tabs and
line ends of every kind.
"""

import random

import pytest

from cifra_md import parse, write
from cifra_md.layout import lyric_text, unpad
from cifra_md.parse import _Parser, substantive
from cifra_md.write import canonical

TOKENS = [
    "C", "G", "Am", "Cm[2]", "Cm[1]", "Cm[3]", "Cm[0]", "Cm", "nc", "N.C.", "%", "/", ".", "-",
    "x2", "3x", "(2x)", "bis", "1.", "2.", "(", ")", "(C", "G)", "((G", "Am))", "C,)", "@9)",
    "|", "||", "|:", ":|", ":||", "||:", "|||", "@9", "@012", "wobble", ",", "C,", "G;", "fine",
    "(solo)", ">x", "//", "[x]", "Tom:", "```", "C(7", "Em7(b5)", ":", "é", "C ",
]
WORDS = ["la", "when", "I", "saw", "you", "A", "oh", "tarde", "é", "x", "[y]", "Café", "\t"]
OTHER = ["[B]", "Intro: C G", "[Ref] (2x)", "// note", "@5", "| |", "", "", "  > A", ">", "````", "~~~"]


def chord_line(rnd):
    return "".join(rnd.choice(TOKENS) + " " * rnd.choice([0, 1, 1, 1, 2, 3, 5]) for _ in range(rnd.randint(1, 8)))


def lyric(rnd):
    return " ".join(rnd.choice(WORDS) for _ in range(rnd.randint(1, 7)))


def document(rnd):
    lines = []
    for _ in range(rnd.randint(1, 7)):
        r = rnd.random()
        if r < 0.45:
            lines.append(" " * rnd.choice([0, 0, 2]) + chord_line(rnd))
        elif r < 0.7:
            lines.append(lyric(rnd))
        elif r < 0.8:
            lines.append("> " + lyric(rnd))
        else:
            lines.append(rnd.choice(OTHER))
    head = rnd.choice(["", "- words: yes\n\n", "- words: no\n\n", "#  T  #\n- A: 1\n- a: 2\n\n"])
    heading = rnd.choice(["## S", "#### S  ##", "  ## C# # #", "", "[Intro]"])
    fence = rnd.choice(["```", "~~~ cifra", "````"])
    closer = {"```": "```", "~~~ cifra": "~~~", "````": "````"}[fence]
    voicings = rnd.choice(
        [
            "",
            "\n---\n\n## Voicings: E2 A2 D3 G3 B3 E4\n- Cm: x35543\n- Cm[2]: x35543\n- Cm[3]: 8-10-10-8-8-8\n- G: 320003 (t 2 - - - 4)\n",
            "\n---\nnotes\n## voicings: e2, a2, d3, g3, b3, e4\n- C: x32010 (- - - - - -)\n---\n## Easy: E2 A2 D3 G3 B3 E4\n- Cm[2]: x35543\n",
        ]
    )
    body = "\n".join(lines)
    text = f"{head}{heading}\n{fence}\n{body}\n" + (closer + "\n" if rnd.random() < 0.9 else "") + voicings
    return text.replace("\n", rnd.choice(["\n", "\r\n", "\r", "\n"]))


STRIP = ("diagnostics", "sungAt")


@pytest.mark.parametrize("seed", range(20))
def test_canonical_form_is_a_fixed_point(seed):
    rnd = random.Random(seed)
    for _ in range(100):
        text = document(rnd)
        doc = parse(text)
        out = write(doc)
        again = parse(out)
        assert write(again) == out, text
        strip = lambda d: {k: v for k, v in d.items() if k not in STRIP}
        assert strip(again) == strip(canonical(doc)), text


def _signature(words, columns):
    """What each chord is attached to: the letters before its character,
    spaces and padding left out, and the character (None past the end)."""
    bare, ref = unpad(words.rstrip(" "))
    out = []
    for c in columns:
        p = ref(c)
        out.append((bare[:p].replace(" ", ""), bare[p] if p < len(bare) else None))
    return out


def _sung_lines(doc):
    for s in doc["sections"]:
        for part in s["body"]:
            if part["type"] == "music":
                for line in part["lines"]:
                    if line["kind"] == "sung":
                        yield line


def _attached_columns(line):
    return sorted(it["column"] for m in line["measures"] for it in m["items"] if it["type"] != "lead" and substantive(it))


def _as_written(text, monkeypatch):
    """Each sung line's attachments as written, before the layout runs."""
    seen = []
    original = _Parser.converge_sung

    def record(self):
        for s in self.sections:
            for part in s["body"]:
                if part["type"] == "music":
                    for line in part["lines"]:
                        if line["kind"] == "sung":
                            seen.append(_signature(line["_words"], _attached_columns(line)))
        original(self)

    monkeypatch.setattr(_Parser, "converge_sung", record)
    parse(text)
    monkeypatch.undo()
    return seen


@pytest.mark.parametrize("seed", range(20))
def test_canonicalising_keeps_every_chord_over_its_character(seed, monkeypatch):
    """§4.5: the words are pushed, never a chord. Two chords written over one
    character (over one run of padding, say) cannot both stay; such lines
    are left out."""
    rnd = random.Random(seed)
    checked = 0
    for _ in range(100):
        text = document(rnd)
        before = _as_written(text, monkeypatch)
        doc = parse(text)
        out = write(doc)
        after = [_signature(lyric_text(line), _attached_columns(line)) for line in _sung_lines(parse(out))]
        model = [_signature(lyric_text(line), _attached_columns(line)) for line in _sung_lines(doc)]
        assert len(before) == len(after) == len(model), text
        for b, a, m in zip(before, after, model):
            inside = [x for x in b if x[1] is not None]
            if len(set(inside)) < len(inside):
                continue
            ends = lambda sig: [x if x[1] is not None else (None, None) for x in sig]
            assert ends(a) == ends(b) == ends(m), (text, out)
            checked += 1
        strip = lambda d: {k: v for k, v in d.items() if k not in STRIP}
        assert strip(parse(out)) == strip(canonical(doc)), text
    assert checked >= 10
