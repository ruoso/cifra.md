"""Spec §10: the setlist reader and its canonical writer."""

import pathlib

import pytest

from cifra_md.setlist import canonicalise_setlist, parse_setlist, song_path, write_path, write_setlist

ROOT = pathlib.Path(__file__).resolve().parents[2]


def test_the_example_of_10_9_4():
    text = """#   Thursday

3) [Minimal](./minimal.cifra.md)
     - Note: count in slowly
     - KEY: E
1)   [Tarde Clara](<with-words.cifra.md>)

Second set.
7. [Repeats](songs/../repeats.cifra.md "Repeats")
"""
    assert canonicalise_setlist(text) == """# Thursday

1. [Minimal](minimal.cifra.md)
   - key: E
   - note: count in slowly
2. [Tarde Clara](with-words.cifra.md)

Second set.

3. [Repeats](songs/../repeats.cifra.md "Repeats")
"""
    model = parse_setlist(text)
    assert [d["code"] for d in model["diagnostics"]] == ["unlinked-item"]


@pytest.mark.parametrize("path", sorted((ROOT / "examples").glob("*.setlist.md")), ids=lambda p: p.name)
def test_the_examples_are_canonical(path):
    text = path.read_text()
    assert canonicalise_setlist(text) == text


def test_canonical_form_is_a_fixed_point():
    text = "# T\n- a: 1\n\n1. [A](a.cifra.md)\n   - key: D\n\nnotes\n\n2. b\n"
    assert canonicalise_setlist(text) == text
    assert canonicalise_setlist(canonicalise_setlist(text)) == text


def test_the_empty_setlist_is_the_empty_file():
    assert canonicalise_setlist("") == ""
    assert canonicalise_setlist("\n\n") == ""
    assert write_setlist(parse_setlist("#\n")) == ""


def test_an_empty_title_is_no_title():
    assert parse_setlist("#\n1. [A](a.cifra.md)\n")["title"] is None


def test_properties_follow_the_title_with_blank_lines_between():
    m = parse_setlist("# T\n\n- date: today\n\n- Place: here\n- loose\n\n1. [A](a.cifra.md)\n")
    assert m["properties"] == [
        {"type": "property", "key": "date", "value": "today"},
        {"type": "property", "key": "place", "value": "here"},
        {"type": "unrecognised", "text": "loose"},
    ]


def test_properties_with_no_title():
    m = parse_setlist("- a: 1\n\n1. [A](a.cifra.md)\n")
    assert m["title"] is None and m["properties"] == [{"type": "property", "key": "a", "value": "1"}]


def test_a_repeated_key_keeps_its_first_place_and_last_value():
    m = parse_setlist("1. [A](a.cifra.md)\n   - note: x\n   - key: D\n   - note: y\n")
    assert m["body"][0]["entries"] == [
        {"type": "property", "key": "note", "value": "y"},
        {"type": "property", "key": "key", "value": "D"},
    ]
    assert [d["code"] for d in m["diagnostics"]] == ["duplicate-key"]


def test_item_entries_are_written_key_then_note_then_the_rest():
    text = "1. [A](a.cifra.md)\n- singer: Ana\n      - note: n\n - other\n  - key: E\n"
    assert canonicalise_setlist(text) == "1. [A](a.cifra.md)\n   - key: E\n   - note: n\n   - singer: Ana\n   - other\n"


def test_entry_indentation_follows_the_number():
    items = "".join(f"{n}. [S{n}](s{n}.cifra.md)\n" for n in range(1, 11)) + "- key: D\n"
    out = canonicalise_setlist(items)
    assert out.endswith("10. [S10](s10.cifra.md)\n    - key: D\n")


def test_numbers_are_positions():
    m = parse_setlist("7. [A](a.cifra.md)\n7) [B](b.cifra.md)\n1. [C](c.cifra.md)\n")
    assert [i["number"] for i in m["body"]] == [1, 2, 3]


def test_four_spaces_before_a_number_is_notes():
    m = parse_setlist("1. [A](a.cifra.md)\n    2. [B](b.cifra.md)\n")
    assert m["body"][1] == {"type": "notes", "lines": ["    2. [B](b.cifra.md)"]}


def test_a_bullet_after_notes_is_notes():
    m = parse_setlist("1. [A](a.cifra.md)\nsome notes\n- a list in the notes\n")
    assert m["body"][1]["lines"] == ["some notes", "- a list in the notes"]
    assert m["body"][0]["entries"] == []


def test_a_fence_in_the_notes_hides_items():
    m = parse_setlist("```\n1. [A](a.cifra.md)\n\n- key: D\n```\n2. [B](b.cifra.md)\n")
    assert m["body"][0] == {"type": "notes", "lines": ["```", "1. [A](a.cifra.md)", "", "- key: D", "```"]}
    assert m["body"][1]["number"] == 1


def test_an_unclosed_fence_runs_to_the_end_and_is_reported():
    m = parse_setlist("1. [A](a.cifra.md)\n~~~\n2. [B](b.cifra.md)\n\n")
    assert m["body"][1] == {"type": "notes", "lines": ["~~~", "2. [B](b.cifra.md)"]}
    assert [d["code"] for d in m["diagnostics"]] == ["unclosed-fence"]


@pytest.mark.parametrize(
    "content",
    ['[A](a.cifra.md "A")', "[A][a]", "![A](a.cifra.md)", "<a.cifra.md>", "[A](a.cifra.md) live", "", "just text", "[A](a b.cifra.md)"],
)
def test_unlinked_items(content):
    m = parse_setlist(f"1. {content}\n")
    assert m["body"][0]["type"] == "unlinked" and m["body"][0]["content"] == content


@pytest.mark.parametrize(
    "dest,path",
    [
        ("a.cifra.md", "a.cifra.md"),
        ("./bossa/../a.cifra.md", "a.cifra.md"),
        ("../../a.cifra.md", "../../a.cifra.md"),
        ("<a b.cifra.md>", "a b.cifra.md"),
        ("a%20b.cifra.md", "a b.cifra.md"),
        ("%2E%2E/a.cifra.md", "../a.cifra.md"),
        ("can%C3%A7%C3%A3o.cifra.md", "canção.cifra.md"),
        ("a\\(1\\).cifra.md", "a(1).cifra.md"),
        ("a(1).cifra.md", "a(1).cifra.md"),
    ],
)
def test_paths(dest, path):
    assert song_path(dest) == (path, None)


@pytest.mark.parametrize(
    "dest,step",
    [
        ("https://example.com/a.cifra.md", "step 2"),
        ("C:/a.cifra.md", "step 2"),
        ("a.cifra.md#verse", "step 2"),
        ("a.cifra.md?x", "step 2"),
        ("/a.cifra.md", "step 2"),
        ("a//b.cifra.md", "step 3"),
        ("bossa/", "step 3"),
        ("%FF.cifra.md", "step 4"),
        ("a%2Fb.cifra.md", "step 4"),
        ("a/..", "step 5"),
        ("a.md", "step 6"),
        (".cifra.md", "step 6"),
        ("A.Cifra.md", "step 6"),
    ],
)
def test_paths_that_fail(dest, step):
    path, reason = song_path(dest)
    assert path is None and reason.startswith(step)


def test_a_failed_path_is_reported_with_its_step():
    m = parse_setlist("1. [A](https://example.com/a.cifra.md)\n")
    assert m["body"][0]["type"] == "unlinked"
    assert "step 2" in m["diagnostics"][0]["message"]


@pytest.mark.parametrize(
    "path,written",
    [
        ("a b.cifra.md", "a%20b.cifra.md"),
        ("a&b (1):x.cifra.md", "a%26b%20%281%29%3Ax.cifra.md"),
        ("canção.cifra.md", "canção.cifra.md"),
        ("<\u0301.cifra.md", "%3C%CC%81.cifra.md"),
        ("-._~!$'*+,;=@.cifra.md", "-._~!$'*+,;=@.cifra.md"),
        ("../x/y.cifra.md", "../x/y.cifra.md"),
    ],
)
def test_writing_paths(path, written):
    assert write_path(path) == written
    assert song_path(written) == (path, None)


def test_link_text_is_kept_as_written():
    text = "1. [A \\] [b] *c*](a.cifra.md)\n"
    m = parse_setlist(text)
    assert m["body"][0]["text"] == "A \\] [b] *c*"
    assert canonicalise_setlist(text) == text


def test_a_bad_key_is_reported_and_kept():
    m = parse_setlist("1. [A](a.cifra.md)\n   - key: H\n")
    assert [d["code"] for d in m["diagnostics"]] == ["bad-key"]
    assert canonicalise_setlist("1. [A](a.cifra.md)\n   - key: H\n").endswith("- key: H\n")


def test_notes_keep_leading_spaces_and_inner_blank_lines():
    text = "1. [A](a.cifra.md)\n\n  indented\n\n\nmore\n\n2. [B](b.cifra.md)\n"
    assert parse_setlist(text)["body"][1]["lines"] == ["  indented", "", "", "more"]
    assert canonicalise_setlist(text) == text
