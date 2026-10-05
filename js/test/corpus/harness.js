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

// Every `type: "chord"` item anywhere in a stored model, in document order.
// A recursive walk rather than a model-shape traversal, so it finds chords
// wherever the model carries them (chart measures today, embedded songs
// tomorrow) and needs no change as the model grows. The chord sub-object has
// no `type`, so it is never mistaken for an item.
function collectChordItems(node, out = []) {
  if (Array.isArray(node)) {
    for (const v of node) collectChordItems(v, out);
  } else if (node && typeof node === "object") {
    if (node.type === "chord" && typeof node.symbol === "string") out.push(node);
    for (const v of Object.values(node)) collectChordItems(v, out);
  }
  return out;
}

// The dialect a document's `notation` property resolves to (§1.4.3 lines
// 128–152): the value compared case-insensitively, one of the three dialect
// ids or `brazilian` by default and on any other value. This mirrors the
// reader's mapping minimally to feed the chord parser; the reader owns the
// `bad-notation` diagnostic (cifra_js.chords refinement §Decisions). `dialects`
// is the implementation's DIALECTS table, so the harness stays
// implementation-agnostic.
function resolveDialect(model, dialects) {
  let value = null;
  for (const p of Array.isArray(model.properties) ? model.properties : []) {
    if (p && typeof p.key === "string" && p.key.toLowerCase() === "notation") {
      value = typeof p.value === "string" ? p.value : null;
    }
  }
  if (value === null) return "brazilian";
  const lower = value.toLowerCase();
  return Object.prototype.hasOwnProperty.call(dialects, lower) ? lower : "brazilian";
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

  const checks = [
    // tl. The text layer (§1.3): the canonical text is a fixed point of
    //     prepare — prepare(canonical bytes) rejoined (lines by LF, one
    //     trailing LF iff there is at least one line, the empty file → zero
    //     bytes) equals the canonical bytes. Holds for every reading entry,
    //     because §8 makes canonical form text-layer-clean (UTF-8, NFC, LF, no
    //     BOM, no tabs, no trailing spaces, one final newline); born passing,
    //     outside the ledger (cifra_js.text_layer refinement §Decisions). This
    //     is the strongest text-layer assertion computable from the committed
    //     corpus bytes without a reader: checks 1–4/6 need the model the text
    //     layer alone cannot build.
    {
      id: id("tl"),
      run: () => {
        const canonical = bytes(canonicalText);
        const lines = impl.prepare(canonical);
        const rejoined = lines.length ? lines.join("\n") + "\n" : "";
        compareBytes(rejoined, canonical, id("tl"));
      },
    },
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

  // chords. The chord layer (§5): for every stored `type: "chord"` item,
  //     re-derive its model from its written symbol under the document's
  //     dialect and compare, byte for byte, to what the entry stored. This is
  //     the strongest §5 assertion computable from the committed corpus bytes
  //     without a reader — checks 1–4/6 need the whole-song model this task
  //     does not build (cifra_js.chords refinement §Decisions). Registered only
  //     for an entry whose stored model holds chords, and born passing (outside
  //     the ledger) like `<entry>/tl`: the §5 parser must handle every chord in
  //     the corpus, not only the dense 12/17 entries.
  const stored = model("parsed.json");
  const chordItems = collectChordItems(stored);
  if (chordItems.length) {
    checks.push({
      id: id("chords"),
      run: () => {
        const dialect = resolveDialect(stored, impl.DIALECTS);
        for (const item of chordItems) {
          const result = impl.parseChord(item.symbol, dialect);
          // The reader stores `chord` then `ambiguities`, omitting the latter
          // when empty; mirror that field order and omission on both sides so
          // the byte comparison pins §5 exactly as the corpus records it.
          const produced = { chord: result.chord };
          if (result.ambiguities && result.ambiguities.length) {
            produced.ambiguities = result.ambiguities;
          }
          const expected = { chord: item.chord };
          if ("ambiguities" in item) expected.ambiguities = item.ambiguities;
          compareBytes(dump(produced), dump(expected), `${id("chords")} [${item.symbol}]`);
        }
      },
    });
  }

  return checks;
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

// The §11.12.5 member order and the pruning conflict_json does (drop None, keep
// only known members), ported from reference/cifra_md/merge.py so the mirror and
// normal helpers of the reverse check can compare conflicts the way the corpus
// does. The merge module owns the real serialiser; this is the harness's own
// copy for the symmetry comparison (a test-only transform, like the mirror
// helpers below), not a second implementation the gate depends on.
const MEMBERS = [
  "kind", "line", "deleted", "unreadable", "item", "occurrence", "after",
  "tuning", "variation", "key", "changed", "symbols", "base", "ours", "theirs",
];

function conflictJson(c) {
  const out = {};
  for (const k of MEMBERS) {
    if (k in c && c[k] !== null && c[k] !== undefined) out[k] = c[k];
  }
  return out;
}

// Split a marked text into plain lines and [ours, theirs] regions
// (reference/tests/merge_props.py `regions`).
function markedRegions(marked) {
  const out = [];
  const lines = marked.split("\n");
  let k = 0;
  while (k < lines.length) {
    if (lines[k] === "<<<<<<< ours") {
      const m = lines.indexOf("=======", k);
      const e = lines.indexOf(">>>>>>> theirs", m);
      out.push([lines.slice(k + 1, m), lines.slice(m + 1, e)]);
      k = e + 1;
    } else {
      out.push(lines[k]);
      k += 1;
    }
  }
  return out;
}

// The marked text with the two sides of every region exchanged (merge_props.py
// `mirror_text`).
function mirrorText(marked) {
  const out = [];
  for (const el of markedRegions(marked)) {
    if (Array.isArray(el)) out.push("<<<<<<< ours", ...el[1], "=======", ...el[0], ">>>>>>> theirs");
    else out.push(el);
  }
  return out.join("\n");
}

// A conflict with ours/theirs exchanged (merge_props.py `mirror_conflict`).
function mirrorConflict(c) {
  c = conflictJson(c);
  const swap = { ours: "theirs", theirs: "ours" };
  const out = {};
  for (const [k, v0] of Object.entries(c)) {
    const k2 = swap[k] || k;
    let v = v0;
    if (k === "changed" || k === "deleted") v = swap[v];
    if (k === "unreadable") v = ["base", "ours", "theirs"].filter((x) => v0.includes(swap[x] || x));
    out[k2] = v;
  }
  const res = {};
  for (const k of Object.keys(c)) if (k in out) res[k] = out[k];
  for (const [k, v] of Object.entries(out)) if (!(k in c)) res[k] = v;
  return res;
}

// A conflict's JSON with its members in sorted order, as one comparable string
// (merge_props.py `normal`, compared as bytes rather than deep-equal).
function normalConflict(c) {
  const cj = conflictJson(c);
  const o = {};
  for (const k of Object.keys(cj).sort()) o[k] = cj[k];
  return JSON.stringify(o);
}

// The merge checks of a merge entry: the full §11.16 battery (corpus/README.md
// lines 126–149, spec §11.16). This task builds them onto the forward check the
// `package` task landed (cifra_js.merge refinement §Decisions). `impl.merge`
// returns an `Outcome`; `impl.mergeOutputs` maps it to the corpus file set, and
// the reverse/canonical/resolution checks use the `Outcome` and `marked`
// directly. Each check is `{ id, run }`; `run` throws on mismatch.
export function mergeChecks(entry, impl) {
  const ext = mergeExtension(entry.dir);
  const outputNames = mergeOutputNames(ext);
  const setlist = ext === ".setlist.md";
  const run3 = (base, ours, theirs) => impl.merge(base, ours, theirs, { setlist });
  const outputs = (outcome) => impl.mergeOutputs(outcome, { setlist });
  const canon = (text) => (setlist ? impl.writeSetlist(impl.parseSetlist(text)) : impl.write(impl.parse(text)));

  const checks = [];

  // 1. merge(base, ours, theirs) gives the entry's stored output files, byte for
  //    byte, with no unexpected and no missing file (mirroring merge_outputs /
  //    stale_outputs, reference/tools/corpus.py).
  checks.push({
    id: `merge/${entry.name}/1`,
    run: () => {
      const [base, ours, theirs] = mergeInputs(entry.dir, ext);
      const produced = outputs(run3(base, ours, theirs));
      const names = produced instanceof Map ? [...produced.keys()] : Object.keys(produced);
      const get = (name) => (produced instanceof Map ? produced.get(name) : produced[name]);
      for (const name of names) {
        const path = join(entry.dir, name);
        if (!existsSync(path)) {
          throw new Error(`merge/${entry.name}: produced ${name}, which the entry does not have`);
        }
        compareBytes(get(name), readFileSync(path), `merge/${entry.name}/${name}`);
      }
      const producedSet = new Set(names);
      for (const name of outputNames) {
        if (existsSync(join(entry.dir, name)) && !producedSet.has(name)) {
          throw new Error(`merge/${entry.name}: the entry has ${name}, which the merge did not produce`);
        }
      }
    },
  });

  // 2. Exchanging the sides mirrors the outcome (§11.16): the same result or
  //    deletion, or the conflicts and marked text with ours/theirs exchanged. An
  //    entry flagged `asymmetric` skips this (§11.9.5).
  if (!existsSync(join(entry.dir, "asymmetric"))) {
    checks.push({
      id: `merge/${entry.name}/2`,
      run: () => {
        const [base, ours, theirs] = mergeInputs(entry.dir, ext);
        const r = run3(base, ours, theirs);
        const r2 = run3(base, theirs, ours);
        if (r.kind !== r2.kind) throw new Error(`merge/${entry.name}/2: kind ${r2.kind}, expected ${r.kind}`);
        if (r.kind === "result") {
          compareBytes(r2.result, r.result, `merge/${entry.name}/2 result`);
        } else if (r.kind === "conflicts") {
          const got = r2.conflicts.map(normalConflict);
          const want = r.conflicts.map((c) => normalConflict(mirrorConflict(c)));
          if (JSON.stringify(got) !== JSON.stringify(want)) {
            throw new Error(`merge/${entry.name}/2: conflicts are not the mirror\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`);
          }
          const wantMarked = r.marked === null ? null : mirrorText(r.marked);
          if ((r2.marked ?? null) !== wantMarked) {
            throw new Error(`merge/${entry.name}/2: marked text is not the mirror`);
          }
        }
      },
    });
  }

  // 3. The result is canonical (§11.16): canonicalising it is itself.
  if (existsSync(join(entry.dir, `result${ext}`))) {
    checks.push({
      id: `merge/${entry.name}/3`,
      run: () => {
        const text = readFileSync(join(entry.dir, `result${ext}`)).toString("utf-8");
        compareBytes(canon(text), text, `merge/${entry.name}/3`);
      },
    });
  }

  // 4. Resolving every region of the marked text by ours, and every one by
  //    theirs (§11.12.4), gives a text with no marker line whose canonical form
  //    is a fixed point (§11.16).
  if (existsSync(join(entry.dir, `marked${ext}`))) {
    checks.push({
      id: `merge/${entry.name}/4`,
      run: () => {
        const marked = readFileSync(join(entry.dir, `marked${ext}`)).toString("utf-8");
        for (const side of ["ours", "theirs"]) {
          const resolved = impl.resolveMarked(marked, side);
          if (impl.markerLines(resolved).length) {
            throw new Error(`merge/${entry.name}/4: resolving by ${side} left a marker line`);
          }
          const text = canon(resolved);
          compareBytes(canon(text), text, `merge/${entry.name}/4 ${side}`);
        }
      },
    });
  }

  // perm. The generated unchanged-side checks (§11.16, §11.3): for each readable,
  //       marker-free input taken as b and x, merge(b, x, x), merge(b, b, x) and
  //       merge(b, x, b) give the canonical text of x.
  checks.push({
    id: `merge/${entry.name}/perm`,
    run: () => {
      const inputs = [];
      for (const bytes of mergeInputs(entry.dir, ext)) {
        if (bytes === null) continue;
        let text;
        try {
          text = impl.decode(bytes);
        } catch {
          continue;
        }
        if (impl.markerLines(text).length) continue; // a marked input is never merged (§11.4)
        inputs.push(text);
      }
      for (const b of inputs) {
        for (const x of inputs) {
          const want = canon(x);
          for (const args of [[b, x, x], [b, b, x], [b, x, b]]) {
            const r = run3(args[0], args[1], args[2]);
            compareBytes(r.result ?? "", want, `merge/${entry.name}/perm`);
          }
        }
      }
    },
  });

  return checks;
}

// The ledger guard (cifra_js.package refinement §Constraints): the ledger must
// not name a check that no longer exists, so it tracks the corpus and
// cifra_js.conformance can prove it empty and honest. `ledger` is the array of
// `<entry>/<check>` ids expected to fail; `checkIds` is the set the harness
// discovered. Throws listing any stale id.
export function staleLedgerIds(ledger, checkIds) {
  return ledger.filter((id) => !checkIds.has(id));
}

// The Merger-profile guard (cifra_js.conformance refinement §Decisions; §9.3,
// §11.16): once the package claims the Merger profile (§9.1), no corpus check
// may be an expected failure, so the ledger must be empty. Every id it names is
// therefore an unexpected failure; this returns them (all of them), so the
// corpus assertion and its unit test share one source of truth for the rule. A
// later spec change that re-ledgers a broken check breaks this guard, which
// correctly means the claim no longer holds until the check is made to pass.
export function unexpectedFailures(ledger) {
  return [...ledger];
}
