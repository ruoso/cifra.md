// The corpus harness: the check that holds cifra.md for JavaScript to the
// reference corpus, byte for byte, in both directions (DIRECTION §3.6,
// corpus/README.md). It is ported from the Python reference's harness
// (reference/tools/corpus.py, reference/tests/test_corpus.py) — never shared
// code and never calling it: it reads only the corpus bytes every
// implementation is held to.
//
// These functions are pure in the sense that matters here: the implementation
// under test is injected (`impl`), so the same harness runs against the real
// package and against a synthetic impl in the unit tests. The functions read
// corpus files from disk (this is a test-only module under js/test/, where
// Node built-ins are allowed; js/src/ imports none of them).

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

// How the corpus serialises a model (corpus/README.md lines 48–53;
// reference/tools/corpus.py lines 45–47): two-space indent, characters
// outside ASCII as themselves (JSON.stringify never escapes them), a final
// newline. Compared byte for byte, so key order (insertion order, as the
// reader emits it) is part of the model.
export function dump(model) {
  return JSON.stringify(model, null, 2) + "\n";
}

// The four possible generated output names of a merge entry, given its text
// extension (reference/tools/corpus.py line 101). `asymmetric` is a
// hand-written input marker, not an output, and is not among them.
function mergeOutputNames(ext) {
  return [`result${ext}`, "result.deleted", "conflicts.json", `marked${ext}`];
}

// `.setlist.md` when the merge entry merges setlists, `.cifra.md` otherwise
// (reference/tools/corpus.py lines 64–66).
function mergeExtension(entryDir) {
  const hasSetlist = readdirSync(entryDir).some((n) => n.endsWith(".setlist.md"));
  return hasSetlist ? ".setlist.md" : ".cifra.md";
}

function isDir(path) {
  return existsSync(path) && statSync(path).isDirectory();
}

// Enumerate the corpus exactly as the reference does (corpus/README.md lines
// 19–21, reference/tools/corpus.py lines 50–61): a directory with
// `input.cifra.md` is a song reading entry, one with `input.setlist.md` a
// setlist reading entry, and `merge/`'s directories are merge entries. Reading
// entries are returned as one list sorted by name (song and setlist names do
// not overlap and sort into order); merge entries sorted by name. The harness
// must find every entry present, so a newly added corpus entry cannot be
// silently skipped.
export function discover(corpusDir) {
  const reading = [];
  for (const name of readdirSync(corpusDir).sort()) {
    if (name === "merge") continue;
    const dir = join(corpusDir, name);
    if (!isDir(dir)) continue;
    if (existsSync(join(dir, "input.cifra.md"))) {
      reading.push({ name, dir, kind: "song" });
    } else if (existsSync(join(dir, "input.setlist.md"))) {
      reading.push({ name, dir, kind: "setlist" });
    }
  }

  const merge = [];
  const mergeDir = join(corpusDir, "merge");
  if (isDir(mergeDir)) {
    for (const name of readdirSync(mergeDir).sort()) {
      const dir = join(mergeDir, name);
      if (isDir(dir)) merge.push({ name, dir });
    }
  }

  return { reading, merge };
}

// A one-line byte diff for a failure message. Fixture text is purpose-written
// corpus/test material, acceptable as test output (cifra_js.package refinement
// §Constraints) — this harness is a format library, never a service log.
function describeDiff(label, actual, expected) {
  const show = (b) => JSON.stringify(b.toString("utf-8"));
  return (
    `${label}: ${actual.length} bytes produced, ${expected.length} expected\n` +
    `  produced: ${show(actual)}\n` +
    `  expected: ${show(expected)}`
  );
}

function toBytes(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(value, "utf-8");
}

// Compare produced bytes to expected bytes; throw on any difference. Texts
// compare byte for byte (corpus/README.md line 48); an empty canonical file is
// zero bytes.
export function compareBytes(actual, expected, label) {
  const a = toBytes(actual);
  const e = toBytes(expected);
  if (!a.equals(e)) {
    throw new Error(describeDiff(label, a, e));
  }
}

// Compare a produced model to expected bytes by its pinned serialisation
// (corpus/README.md lines 48–53): never a deep-equal, always `dump(model)`
// compared byte for byte, so key order and non-ASCII spelling are part of what
// the later reader and writer owe the corpus.
export function compareModelBytes(model, expected, label) {
  compareBytes(dump(model), expected, label);
}

// Top-level `diagnostics` and `sungAt` describe a text, not a model, so check
// 6 drops them from both sides before comparing (reference/tests/test_corpus.py
// lines 55–61). Insertion order of the remaining keys is preserved.
function stripModel(model) {
  const out = {};
  for (const [k, v] of Object.entries(model)) {
    if (k !== "diagnostics" && k !== "sungAt") out[k] = v;
  }
  return out;
}

// The checks of a reading entry (corpus/README.md lines 37–58). Songs use
// parse/write/canonical, setlists parseSetlist/writeSetlist/canonicalSetlist
// (§Constraints); both run checks 1–4 and 6. Check 5 (schema) is not run in
// JavaScript (§Decisions). Each check is `{ id, run }`; `run` throws on
// mismatch or when a stubbed operation is not implemented.
export function readingChecks(entry, impl) {
  const ops =
    entry.kind === "setlist"
      ? {
          parse: impl.parseSetlist,
          write: impl.writeSetlist,
          canonical: impl.canonicalSetlist,
          ext: ".setlist.md",
        }
      : {
          parse: impl.parse,
          write: impl.write,
          canonical: impl.canonical,
          ext: ".cifra.md",
        };

  const bytes = (name) => readFileSync(join(entry.dir, name));
  const model = (name) => JSON.parse(bytes(name).toString("utf-8"));
  const inputText = `input${ops.ext}`;
  const canonicalText = `canonical${ops.ext}`;
  const id = (n) => `${entry.name}/${n}`;

  return [
    // 1. Reading input.*.md gives input.parsed.json.
    {
      id: id(1),
      run: () =>
        compareModelBytes(
          ops.parse(bytes(inputText)),
          bytes("input.parsed.json"),
          id(1),
        ),
    },
    // 2. Writing input.parsed.json gives the canonical text.
    {
      id: id(2),
      run: () =>
        compareBytes(
          ops.write(model("input.parsed.json")),
          bytes(canonicalText),
          id(2),
        ),
    },
    // 3. Reading the canonical text gives parsed.json.
    {
      id: id(3),
      run: () =>
        compareModelBytes(
          ops.parse(bytes(canonicalText)),
          bytes("parsed.json"),
          id(3),
        ),
    },
    // 4. Writing parsed.json gives the canonical text (the fixed point).
    {
      id: id(4),
      run: () =>
        compareBytes(
          ops.write(model("parsed.json")),
          bytes(canonicalText),
          id(4),
        ),
    },
    // 6. Model-level canonicalisation of input.parsed.json gives parsed.json,
    //    apart from diagnostics and sungAt. Compared as the pinned
    //    serialisation of both stripped models.
    {
      id: id(6),
      run: () => {
        const got = stripModel(ops.canonical(model("input.parsed.json")));
        const want = stripModel(model("parsed.json"));
        compareBytes(dump(got), dump(want), id(6));
      },
    },
  ];
}

// The three merge inputs, with the entry's extension; a missing input is
// absent (null) (reference/tools/corpus.py lines 69–75). Read as bytes: a
// merge input need not be UTF-8 (corpus/README.md line 120).
function mergeInputs(entryDir, ext) {
  return ["base", "ours", "theirs"].map((side) => {
    const path = join(entryDir, `${side}${ext}`);
    return existsSync(path) ? readFileSync(path) : null;
  });
}

// The forward merge check of a merge entry (corpus/README.md lines 126–149):
// merge(base, ours, theirs) must produce the entry's stored output files, byte
// for byte, with no unexpected and no missing file (mirroring merge_outputs /
// stale_outputs, reference/tools/corpus.py lines 78–102). The reverse /
// symmetry / canonicality / resolution / idempotence checks belong to
// cifra_js.merge (§Decisions), which owns corpus/merge/. The merge operation
// returns the files it would write, keyed by their corpus names.
export function mergeChecks(entry, impl) {
  const ext = mergeExtension(entry.dir);
  const outputNames = mergeOutputNames(ext);
  const id = `merge/${entry.name}/1`;

  const run = () => {
    const [base, ours, theirs] = mergeInputs(entry.dir, ext);
    const produced = impl.merge(base, ours, theirs, {
      setlist: ext === ".setlist.md",
    });
    const names = produced instanceof Map ? [...produced.keys()] : Object.keys(produced);
    const get = (name) => (produced instanceof Map ? produced.get(name) : produced[name]);

    // Every produced file is one of the entry's stored files, matching it.
    for (const name of names) {
      const path = join(entry.dir, name);
      if (!existsSync(path)) {
        throw new Error(
          `merge/${entry.name}: produced ${name}, which the entry does not have`,
        );
      }
      compareBytes(get(name), readFileSync(path), `merge/${entry.name}/${name}`);
    }

    // No stored output file is left unproduced.
    const producedSet = new Set(names);
    for (const name of outputNames) {
      if (existsSync(join(entry.dir, name)) && !producedSet.has(name)) {
        throw new Error(
          `merge/${entry.name}: the entry has ${name}, which the merge did not produce`,
        );
      }
    }
  };

  return [{ id, run }];
}

// The ledger guard (cifra_js.package refinement §Constraints): the ledger must
// not name a check that no longer exists, so it tracks the corpus and
// cifra_js.conformance can prove it empty and honest. `ledger` is the array of
// `<entry>/<check>` ids expected to fail; `checkIds` is the set the harness
// discovered. Throws listing any stale id.
export function staleLedgerIds(ledger, checkIds) {
  return ledger.filter((id) => !checkIds.has(id));
}
