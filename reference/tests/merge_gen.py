"""Generators of related documents for the merge's property tests: a base,
and sides made from it by the edits people make."""

import random
import re

from cifra_md import parse, write

CHORDS = ["C", "G", "Am", "F", "Dm", "G7", "Cm", "Cm[2]", "Cm[3]", "Em", "C7+", "%", "N.C.", "x2", "|:", ":|", "(", ")", "wobble", "@5"]
WORDS = ["la", "when", "I", "saw", "you", "oh", "tarde", "é", "Café", "the", "road"]
SHAPES = ["x35543", "x3554x", "8-10-10-8-8-8", "320003", "x32010", "133211", "022100"]
UKE = ["0333", "5333", "0003", "2010"]
SYMBOLS = ["C", "G", "Am", "F", "Dm", "G7", "Cm", "Cm[2]", "Cm[3]", "Em"]


def chord_line(rnd):
    n = rnd.randint(1, 4)
    toks = []
    for k in range(n):
        if k:
            toks.append("|")
        toks.extend(rnd.choice(CHORDS) for _ in range(rnd.randint(1, 2)))
    return " ".join(toks)


def words(rnd):
    return " ".join(rnd.choice(WORDS) for _ in range(rnd.randint(2, 5)))


def section_lines(rnd, name):
    out = [rnd.choice([f"## {name}", f"## {name}", f"[{name}]" if rnd.random() < 0.3 else f"## {name}"])]
    if out[0].startswith("["):
        out = ["```", out[0]]
    else:
        if rnd.random() < 0.2:
            out.append("A note about " + name)
        out.append("```")
    for _ in range(rnd.randint(1, 4)):
        r = rnd.random()
        if r < 0.6:
            out.append(chord_line(rnd))
        elif r < 0.85:
            out.append(rnd.choice(["G       D", "C   Am  F", "Cm      Cm[2]", "Em  C"]))
            out.append(words(rnd))
        else:
            out.append("// " + rnd.choice(WORDS))
    out.append("```")
    return out


def blocks(rnd):
    out = []
    if rnd.random() < 0.8:
        out.append("## Voicings: E2 A2 D3 G3 B3 E4")
        for s in rnd.sample(SYMBOLS, rnd.randint(1, 5)):
            out.append(f"- {s}: {rnd.choice(SHAPES)}")
    if rnd.random() < 0.5:
        out.append("## Voicings: G4 C4 E4 A4")
        for s in rnd.sample(SYMBOLS, rnd.randint(0, 3)):
            out.append(f"- {s}: {rnd.choice(UKE)}")
    if rnd.random() < 0.3:
        out.append("## Easy: E2 A2 D3 G3 B3 E4")
        for s in rnd.sample(SYMBOLS, rnd.randint(0, 2)):
            out.append(f"- {s}: {rnd.choice(SHAPES)}")
    return out


def document(rnd) -> str:
    lines = []
    if rnd.random() < 0.7:
        lines.append(rnd.choice(["# Song", "# Tarde", "# Asa Branca"]))
        for k in rnd.sample(["artist: Ana", "key: G", "tempo: 96", "notation: american", "capo: 2"], rnd.randint(0, 2)):
            lines.append("- " + k)
        lines.append("")
    for name in rnd.sample(["Intro", "A", "B", "Chorus", "Verse", "Coda"], rnd.randint(1, 4)):
        lines.extend(section_lines(rnd, name))
        lines.append("")
    b = blocks(rnd)
    if b:
        lines.append("---")
        lines.append("")
        lines.extend(b)
    return write(parse("\n".join(lines) + "\n"))


def edit(rnd, text: str, scope=None) -> str:
    """A side: the text with one to three edits. `scope` restricts the edits:
    ("section", k) to the body of the k-th section, ("tuning", t) to the
    blocks of one tuning."""
    lines = text.split("\n")[:-1] if text else []
    for _ in range(rnd.randint(1, 3)):
        inside = []
        fence = False
        sec = -1
        voicings = False
        tuning = None
        for k, ln in enumerate(lines):
            if ln == "---" and not fence:
                voicings = True
                continue
            if voicings:
                if ln.startswith("## "):
                    tuning = ln.split(": ", 1)[1]
                elif ln.startswith("- "):
                    if scope is None or (scope[0] == "tuning" and scope[1] == tuning):
                        inside.append(("voicing", k))
                continue
            if ln.startswith("## ") and not fence:
                sec += 1
                if scope is None:
                    inside.append(("heading", k))
                continue
            if ln.startswith("```") or ln.startswith("~~~"):
                fence = not fence
                continue
            if fence and (scope is None or (scope[0] == "section" and scope[1] == sec)):
                if not ln.startswith("["):
                    inside.append(("music", k))
            elif scope is None and ln.startswith("- ") and not voicings:
                inside.append(("property", k))
        if not inside:
            break
        what, k = rnd.choice(inside)
        r = rnd.random()
        if what == "music":
            if r < 0.25:
                del lines[k]
            elif r < 0.5:
                lines.insert(k + rnd.choice([0, 1]), chord_line(rnd))
            elif r < 0.75:
                lines[k] = chord_line(rnd)
            elif "Cm[" in lines[k] and r < 0.85:
                # two keys joined on this line (§8.3 I3)
                lines[k] = re.sub(r"Cm\[\d+\]", "Cm", lines[k])
            else:
                # a marker split off, or a key moved
                lines[k] = lines[k].replace("Cm", "Cm[2]", 1) if "Cm" in lines[k] and "Cm[" not in lines[k] else lines[k] + " Cm[3]"
        elif what == "voicing":
            sym = lines[k][2:].split(":")[0]
            if r < 0.3:
                del lines[k]
            elif r < 0.8:
                pool = UKE if "G4 C4" in (tuning or "") else SHAPES
                lines[k] = f"- {sym}: {rnd.choice(pool)}"
            else:
                pool = UKE if "G4 C4" in (tuning or "") else SHAPES
                lines.insert(k + 1, f"- {rnd.choice(SYMBOLS)}: {rnd.choice(pool)}")
        elif what == "heading":
            lines[k] = rnd.choice(["## Bridge", "## A", lines[k] + " x2", "## Intro @5"])
        elif what == "property":
            lines[k] = rnd.choice(["- artist: Bia", "- key: D", "- words: no", "- notation: realbook", "- tempo: 120"])
    if scope is None and rnd.random() < 0.15:
        return join(write(parse("\n".join(lines) + "\n")))
    return write(parse("\n".join(lines) + "\n"))


def join(text: str) -> str:
    """Every `Cm[n]` of the chart written `Cm`: the keys of `Cm` joined into
    one, as someone who drops the markers does. The blocks are left as they
    are, and canonical form drops the keys nothing uses any more (§8.3 I1)."""
    chart, rule, rest = text.partition("\n---\n")
    return write(parse(re.sub(r"Cm\[\d+\]", "Cm", chart) + rule + rest))


def section_texts(text: str) -> list[str]:
    """Each section of a document as canonical form writes it."""
    from cifra_md.write import _chart_blocks, _dialect

    doc = parse(text)
    return ["\n\n".join("\n".join(b) for b in _chart_blocks([s], _dialect(doc))) for s in doc["sections"]]


def only_section_changed(base: str, side: str, k: int) -> bool:
    a, b = section_texts(base), section_texts(side)
    return len(a) == len(b) and all(x == y for n, (x, y) in enumerate(zip(a, b)) if n != k)


SONGS = ["corcovado", "wave", "carinhoso", "garota", "samba", "aguas"]


def setlist(rnd) -> str:
    from cifra_md.setlist import canonicalise_setlist

    lines = []
    if rnd.random() < 0.8:
        lines.append(rnd.choice(["# Friday", "# Sexta"]))
        for e in rnd.sample(["place: Bar do Zé", "date: 2026-10-09", "bring the flute"], rnd.randint(0, 2)):
            lines.append("- " + e)
        lines.append("")
    n = 0
    for _ in range(rnd.randint(1, 6)):
        if rnd.random() < 0.15:
            lines.extend(["", rnd.choice(["Second set.", "Tune to the piano.", "```", "Break"]), ""])
            continue
        n += 1
        # a set that plays a song more than once, often
        song = rnd.choice(SONGS[:3] if rnd.random() < 0.4 else SONGS)
        lines.append(f"{n}. [{song.title()}]({song}.cifra.md)" if rnd.random() < 0.9 else f"{n}. {song} (unlinked)")
        for e in rnd.sample(["key: D", "key: E", "note: slow", "singer: Ana", "a remark"], rnd.randint(0, 2)):
            lines.append("   - " + e)
    return canonicalise_setlist("\n".join(lines) + "\n")


def edit_setlist(rnd, text: str) -> str:
    from cifra_md.setlist import canonicalise_setlist

    lines = text.split("\n")[:-1] if text else []
    for _ in range(rnd.randint(1, 3)):
        if not lines:
            break
        k = rnd.randrange(len(lines))
        r = rnd.random()
        if r < 0.25:
            del lines[k]
        elif r < 0.5:
            song = rnd.choice(SONGS)
            lines.insert(k, f"1. [{song.title()}]({song}.cifra.md)")
        elif r < 0.7:
            ln = lines.pop(k)
            lines.insert(rnd.randrange(len(lines) + 1), ln)
        elif r < 0.78:
            lines.insert(k + 1, "   - " + rnd.choice(["key: F", "note: fast", "singer: Bia"]))
        elif r < 0.85:
            # a song played again: a copy of an item line, elsewhere
            items = [ln for ln in lines if re.match(r"\d+\. ", ln)]
            if items:
                lines.insert(k, rnd.choice(items))
        else:
            lines[k] = rnd.choice(["# Saturday", "- place: upstairs", "Second set, later.", "2. [Wave](wave.cifra.md)"])
    return canonicalise_setlist("\n".join(lines) + "\n")


def insert_copy(rnd, text: str):
    """A setlist with a bare copy of one of its songs inserted at an item
    boundary whose neighbours are other songs, so that where it went is not
    ambiguous; or None if there is no such place."""
    from cifra_md.setlist import canonicalise_setlist, parse_setlist, write_setlist

    doc = parse_setlist(text)
    body = doc["body"]
    songs = [el for el in body if el["type"] == "song"]
    if not songs:
        return None
    song = rnd.choice(songs)
    copy = {"type": "song", "number": 0, "text": song["text"], "path": song["path"], "entries": []}
    places = []
    for p in range(len(body) + 1):
        before = next((el for el in reversed(body[:p]) if el["type"] != "notes"), None)
        after = next((el for el in body[p:] if el["type"] != "notes"), None)
        if all(el is None or el["type"] != "song" or el["path"] != song["path"] for el in (before, after)):
            places.append(p)
    if not places:
        return None
    p = rnd.choice(places)
    doc["body"] = body[:p] + [copy] + body[p:]
    return canonicalise_setlist(write_setlist(doc)), p, copy


def add_note(rnd, text: str, k: int | None = None):
    """A setlist with a note no item has yet given to its k-th item."""
    from cifra_md.setlist import canonicalise_setlist, parse_setlist, write_setlist

    doc = parse_setlist(text)
    body = doc["body"]
    items = [n for n, el in enumerate(body) if el["type"] != "notes"]
    if not items:
        return None
    n = items[rnd.randrange(len(items))] if k is None else items[k]
    body[n]["entries"] = [e for e in body[n]["entries"] if not (e["type"] == "property" and e["key"] == "note")]
    body[n]["entries"].append({"type": "property", "key": "note", "value": f"take {rnd.randrange(10**6)}"})
    return canonicalise_setlist(write_setlist(doc)), n, body[n]
