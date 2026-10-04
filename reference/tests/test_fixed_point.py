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
