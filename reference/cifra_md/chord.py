"""Chord symbols (spec §5): one permissive grammar, a canonical model, three dialects."""

from __future__ import annotations

import re

from .pitch import NOTE_RE, parse_note

DIALECTS = {
    "brazilian": {"sevenPlus": "majorSeventh", "bareNine": "add", "degreeSign": "diminishedSeventh", "bareFour": "suspended"},
    "american": {"sevenPlus": "dominantSharpFive", "bareNine": "dominant", "degreeSign": "diminishedSeventh", "bareFour": "added"},
    "realbook": {"sevenPlus": "dominantSharpFive", "bareNine": "dominant", "degreeSign": "diminishedSeventh", "bareFour": "added"},
}
DEFAULT_DIALECT = "brazilian"

_ALTERNATIVES = {
    "sevenPlus": ("majorSeventh", "dominantSharpFive"),
    "bareNine": ("add", "dominant"),
    "degreeSign": ("diminishedSeventh", "diminishedTriad"),
    "bareFour": ("suspended", "added"),
}

# Longest and most specific first. `#`/`b` are separate from `+`/`-`/`°`
# because the latter are positional: leading they name a quality, trailing a
# degree they alter it (§5.3.1, §5.3.4).
_TOKENS = [
    ("SUS2", re.compile(r"sus2")),
    ("SUS4", re.compile(r"sus4")),
    ("SUS", re.compile(r"sus")),
    ("ADD", re.compile(r"add", re.I)),
    ("ALT", re.compile(r"alt")),
    ("HALFDIM", re.compile(r"[øØ]")),
    ("DIMWORD", re.compile(r"dim", re.I)),
    ("AUGWORD", re.compile(r"aug", re.I)),
    ("MAJ", re.compile(r"(?:maj|Maj|MAJ|M|[∆Δ])")),
    ("MIN", re.compile(r"(?:min|Min|MIN|m)")),
    ("NUM", re.compile(r"(?:13|11|9|7|6|5|4|3|2)")),
    ("SHARP", re.compile(r"[#♯]")),
    ("FLAT", re.compile(r"[b♭]")),
    ("PLUS", re.compile(r"\+")),
    ("MINUS", re.compile(r"[-−–]")),
    ("DEG", re.compile(r"[°º]")),
    ("LP", re.compile(r"\(")),
    ("RP", re.compile(r"\)")),
    ("SLASH", re.compile(r"/")),
    ("SEP", re.compile(r"[,\s]+")),
]

_ROOT = re.compile(rf"^({NOTE_RE})")
_BASS = re.compile(rf"^{NOTE_RE}$")


def _tokenize(body: str):
    tokens = []
    i = 0
    while i < len(body):
        for kind, rx in _TOKENS:
            m = rx.match(body, i)
            if m:
                if kind != "SEP":
                    tokens.append((kind, m.group(0)))
                i = m.end()
                break
        else:
            return tokens, body[i:]
    return tokens, None


def _balanced(text: str) -> bool:
    depth = 0
    for ch in text:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth < 0:
                return False
    return depth == 0


def _split_bass(text: str):
    idx = text.rfind("/")
    if idx == -1:
        return text, None
    candidate = text[idx + 1 :].strip()
    if _BASS.match(candidate):
        return text[:idx], candidate
    return text, None


def _seventh_alter(quality: str, major_seventh: bool) -> int:
    if major_seventh:
        return 0
    if quality == "dim":
        return -2
    return -1


def _stack(top: int):
    return {9: [9], 11: [9, 11], 13: [9, 13]}.get(top, [])


def parse_chord(text: str, dialect: str = DEFAULT_DIALECT) -> dict:
    """Parse a chord symbol.

    Returns {"chord": Chord|None, "ambiguities": [...], "errors": [...]}.
    Never raises on bad input.
    """
    errors: list[str] = []
    ambiguities: list[dict] = []
    readings = DIALECTS.get(dialect)
    if readings is None:
        return {"chord": None, "ambiguities": [], "errors": [f"unknown dialect {dialect!r}"]}

    def fail(msg):
        return {"chord": None, "ambiguities": ambiguities, "errors": errors + [msg]}

    if not isinstance(text, str) or not text.strip():
        return fail("empty")
    t = text.strip()
    rm = _ROOT.match(t)
    if not rm:
        return fail(f"{t!r} does not start with a note name")
    root = parse_note(rm.group(1))
    if not _balanced(t):
        return fail(f"unbalanced brackets in {t!r}")
    body, bass_text = _split_bass(t[rm.end() :])
    bass = parse_note(bass_text) if bass_text is not None else None

    tokens, bad = _tokenize(body)
    if bad is not None:
        return fail(f"cannot read {bad!r} in {t!r}")

    quality = "major"
    major_seventh = False
    saw_seventh = False
    bare_degree_sign = False
    primary_top = None
    saw_quality_word = False
    exts: dict[int, int] = {}

    def at(j):
        return tokens[j][0] if 0 <= j < len(tokens) else None

    def ambiguity(kind, chosen):
        alt = [a for a in _ALTERNATIVES[kind] if a != chosen][0]
        ambiguities.append({"kind": kind, "chosen": chosen, "alternative": alt})

    i = 0
    while i < len(tokens):
        kind, tx = tokens[i]
        if kind in ("LP", "RP"):
            i += 1
        elif kind == "MIN":
            if not saw_quality_word and primary_top is None and not exts:
                quality = "dim" if quality == "dim" else "minor"
                saw_quality_word = True
            else:
                errors.append(f"unexpected {tx!r}")
            i += 1
        elif kind == "MAJ":
            major_seventh = True
            saw_quality_word = True
            i += 1
        elif kind in ("DIMWORD", "DEG"):
            if primary_top is None and not exts:
                quality = "dim"
                saw_quality_word = True
                if kind == "DEG":
                    bare_degree_sign = True
            else:
                errors.append(f"unexpected {tx!r}")
            i += 1
        elif kind == "HALFDIM":
            quality = "dim"
            saw_quality_word = True
            exts[7] = -1
            saw_seventh = True
            i += 1
        elif kind == "AUGWORD":
            quality = "aug"
            saw_quality_word = True
            i += 1
        elif kind == "PLUS":
            if at(i + 1) == "NUM":
                exts[int(tokens[i + 1][1])] = 1
                i += 2
                continue
            if primary_top is None and not exts:
                quality = "aug"
                saw_quality_word = True
            else:
                errors.append("unexpected '+'")
            i += 1
        elif kind == "MINUS":
            if at(i + 1) == "NUM" and (saw_quality_word or primary_top is not None or exts):
                exts[int(tokens[i + 1][1])] = -1
                i += 2
                continue
            if not saw_quality_word and primary_top is None and not exts:
                quality = "minor"
                saw_quality_word = True
            else:
                errors.append(f"unexpected {tx!r}")
            i += 1
        elif kind == "SUS2":
            quality = "sus2"
            saw_quality_word = True
            i += 1
        elif kind in ("SUS4", "SUS"):
            quality = "sus4"
            saw_quality_word = True
            i += 1
        elif kind == "ALT":
            exts[7] = -1
            exts[9] = -1
            exts[5] = 1
            saw_seventh = True
            i += 1
        elif kind == "ADD":
            if at(i + 1) != "NUM":
                errors.append("'add' must be followed by a number")
                i += 1
                continue
            exts[int(tokens[i + 1][1])] = 0
            i += 2
        elif kind in ("SHARP", "FLAT"):
            if at(i + 1) != "NUM":
                errors.append(f"{tx!r} must be followed by a number")
                i += 1
                continue
            degree = int(tokens[i + 1][1])
            exts[degree] = 1 if kind == "SHARP" else -1
            if degree == 7:
                saw_seventh = True
            i += 2
        elif kind == "NUM":
            degree = int(tx)
            j = i + 1
            alter = 0
            handled = False
            mod = at(j)
            binds_forward = at(j + 1) == "NUM"
            if mod == "MAJ":
                alter, handled, j = 0, True, j + 1
            elif mod == "MIN":
                alter, handled, j = -1, True, j + 1
            elif mod in ("MINUS", "DEG") and not binds_forward:
                alter, handled, j = -1, True, j + 1
            elif mod == "PLUS" and not binds_forward:
                if degree == 7:
                    reading = readings["sevenPlus"]
                    ambiguity("sevenPlus", reading)
                    if reading == "majorSeventh":
                        major_seventh = True
                        alter = 0
                    else:
                        alter = -1
                        exts[5] = 1
                else:
                    alter = 1
                handled, j = True, j + 1

            if not handled and degree == 4 and not saw_quality_word and not exts:
                quality = "sus4"
                saw_quality_word = True
                i = j
                continue
            if not handled and degree == 4 and quality == "major":
                # The fourth ambiguity (§5.6): a cifra writes C7(4) for C7sus4.
                reading = readings["bareFour"]
                ambiguity("bareFour", reading)
                if reading == "suspended":
                    quality = "sus4"
                    saw_quality_word = True
                    i = j
                    continue

            is_primary = primary_top is None and not handled and degree >= 5
            if is_primary:
                primary_top = degree
                if degree == 5:
                    if not saw_quality_word:
                        quality = "power"
                elif degree == 6:
                    exts[6] = 0
                else:
                    add_seventh = True
                    if degree == 9 and not major_seventh and not saw_seventh:
                        reading = readings["bareNine"]
                        ambiguity("bareNine", reading)
                        if reading == "add":
                            add_seventh = False
                    if add_seventh and not saw_seventh:
                        exts[7] = _seventh_alter(quality, major_seventh)
                        saw_seventh = True
                    if degree != 7:
                        exts[degree] = 0
                    for implied in _stack(degree):
                        exts.setdefault(implied, 0)
            else:
                exts[degree] = alter
                if degree == 7:
                    saw_seventh = True
                if primary_top is None and handled and degree >= 7:
                    primary_top = degree
            i = j
        elif kind == "SLASH":
            if at(i + 1) != "NUM":
                errors.append("a '/' must be followed by a bass note or a number")
            i += 1
        else:
            errors.append(f"unexpected {tx!r}")
            i += 1

    if major_seventh and 7 not in exts:
        exts[7] = 0

    if bare_degree_sign and quality == "dim" and 7 not in exts:
        reading = readings["degreeSign"]
        ambiguity("degreeSign", reading)
        if reading == "diminishedSeventh":
            exts[7] = -2

    # Fold triad-defining alterations into the quality (§5.2.1).
    if quality == "minor" and exts.get(5) == -1:
        quality = "dim"
        del exts[5]
    if quality == "major" and exts.get(5) == 1:
        quality = "aug"
        del exts[5]
    if quality == "aug" and exts.get(5) == 1:
        del exts[5]
    if quality == "dim" and exts.get(5) == -1:
        del exts[5]

    if errors:
        return {"chord": None, "ambiguities": ambiguities, "errors": errors}

    for degree in exts:
        if degree not in (2, 4, 5, 6, 7, 9, 11, 13):
            return fail(f"degree {degree} cannot be an extension")

    chord = {
        "root": root,
        "quality": quality,
        "extensions": [{"degree": d, "alter": a} for d, a in sorted(exts.items())],
        "bass": bass,
    }
    return {"chord": chord, "ambiguities": ambiguities, "errors": []}


def is_chord(text: str, dialect: str = DEFAULT_DIALECT) -> bool:
    return parse_chord(text, dialect)["chord"] is not None


def chord_tones(chord: dict) -> list[str]:
    """Spelled tones of a chord, root first, for tests and display (§5.5)."""
    from .pitch import LETTERS, MAJOR_SCALE, NATURAL_PC, format_note

    base = {
        "major": [(1, 0), (3, 0), (5, 0)],
        "minor": [(1, 0), (3, -1), (5, 0)],
        "dim": [(1, 0), (3, -1), (5, -1)],
        "aug": [(1, 0), (3, 0), (5, 1)],
        "sus2": [(1, 0), (2, 0), (5, 0)],
        "sus4": [(1, 0), (4, 0), (5, 0)],
        "power": [(1, 0), (5, 0)],
    }[chord["quality"]]
    degrees = dict(base)
    for e in chord["extensions"]:
        degrees[e["degree"]] = e["alter"]
    root = chord["root"]
    out = []
    for degree, alter in sorted(degrees.items()):
        steps = degree - 1
        letter = LETTERS[(LETTERS.index(root["letter"]) + steps) % 7]
        wanted = (NATURAL_PC[root["letter"]] + root["accidental"] + MAJOR_SCALE[steps % 7] + alter) % 12
        natural = NATURAL_PC[letter]
        acc = (wanted - natural + 6) % 12 - 6
        out.append(format_note({"letter": letter, "accidental": acc}))
    return out
