"""Spec §11.12.3 and §8.1: a text with a marker line is a merge waiting for
someone. It is never canonical, a writer refuses to save it, and a reader
reports each marker line."""

import pytest

from cifra_md import MarkedTextError, is_canonical, parse, write
from cifra_md.text import is_marker_line, marker_lines

MARKED = """## A
```
<<<<<<< ours
C | G
=======
C | G7
>>>>>>> theirs
```
"""


@pytest.mark.parametrize("line", ["<<<<<<<", "=======", ">>>>>>>", "|||||||", "<<<<<<< ours", ">>>>>>> theirs", "||||||| base", "======= x"])
def test_marker_lines(line):
    assert is_marker_line(line)


@pytest.mark.parametrize("line", ["========", "<<<<<<", "=======x", " =======", "<<<<<<<ours", "a ======="])
def test_lines_that_are_not_markers(line):
    assert not is_marker_line(line)


def test_markers_are_found_after_the_text_layer():
    # A trailing space and a tab are gone before the line is looked at (§1.3).
    assert marker_lines("a\r\n=======  \r\n<<<<<<<\t\n") == [2, 3]


def test_a_marked_text_is_never_canonical():
    assert not is_canonical(MARKED)
    # whatever canonical form would make of its lines
    text = write(parse("## A\n```\nC | G\n```\n"))
    assert is_canonical(text)
    assert not is_canonical(text + "\n=======\n")


def test_a_marker_line_in_notes_is_not_canonical_either():
    assert not is_canonical("# Song\n\nSome notes.\n=======\n")


def test_the_writer_refuses_a_marked_text_and_points_at_the_first_marker():
    with pytest.raises(MarkedTextError) as e:
        write(parse(MARKED))
    assert e.value.line == 3
    assert e.value.text == "<<<<<<< ours"


def test_the_writer_refuses_a_marker_in_notes():
    with pytest.raises(MarkedTextError) as e:
        write(parse("# Song\n\nnotes\n|||||||\n"))
    assert e.value.line == 4


def test_the_reader_reads_a_marked_text_and_reports_each_marker_line():
    doc = parse(MARKED)
    found = [d["line"] for d in doc["diagnostics"] if d["code"] == "marker-line"]
    assert found == [3, 5, 7]


def test_text_that_is_not_utf8_is_not_canonical():
    assert not is_canonical(b"## A\n\xff\n")


def test_the_cli_check(tmp_path):
    from cifra_md.__main__ import main

    good = tmp_path / "a.cifra.md"
    good.write_text("## A\n```\nC | G\n```\n")
    bad = tmp_path / "b.cifra.md"
    bad.write_text(MARKED)
    messy = tmp_path / "c.cifra.md"
    messy.write_text("##  A\n```\nC  | G\n```\n")
    assert main(["check", str(good)]) == 0
    assert main(["check", str(bad)]) == 1
    assert main(["check", str(messy)]) == 1
    assert main(["write", str(bad)]) == 1
