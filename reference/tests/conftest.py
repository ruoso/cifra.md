import json
import pathlib

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLES = sorted((ROOT / "examples").glob("*.cifra.md"))
CASES = sorted((ROOT / "tests" / "cases").glob("*.json"))
SCHEMA = json.loads((ROOT / "schema" / "cifra.schema.json").read_text())


@pytest.fixture(scope="session")
def schema():
    return SCHEMA


def chart(text: str) -> str:
    """Wrap chart lines in a section fence, the shortest well-formed document."""
    return "## A\n```\n" + text + "\n```\n"
