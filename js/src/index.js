// cifra.md for JavaScript — the app's implementation of the format
// (DIRECTION §3.6). Framework-free, ES modules, no runtime dependencies: this
// module knows nothing of React; the view is the only layer that does
// (DIRECTION §3.7). The reader, writer, setlist reader/writer and merge are
// filled in by the later `cifra_js` tasks (`text_layer`, `chords`, `reader`,
// `writer`, `setlists`, `merge`); until then every corpus-facing operation is
// a named stub that throws, so the corpus harness can call them and record
// each check as an expected failure.
//
// The names and the fact that they are corpus-facing are fixed here; their
// real signatures and any richer public surface belong to the tasks that
// implement them (cifra_js.package refinement, §Decisions).

// The text layer (spec §1.3) and the marker-line primitive (§11.12.3), the
// floor every reader stands on: re-exported from one place so the reader,
// writer, merge and the canonicality check all import one correct
// implementation (cifra_js.text_layer refinement, §Decisions).
export { decode, prepare, markerLines, isMarkerLine, NotUtf8Error } from "./text.js";

// Chord symbols (spec §5): the permissive parser, the canonical dialect-free
// model, the three dialects and their four ambiguities, and the §5.5 spelled
// tones. Re-exported from one place so the reader (which classifies every
// chart token) and future tasks import one correct implementation
// (cifra_js.chords refinement, §Decisions). The note-name helpers of pitch.js
// come with them, as the reference exposes parse_note alongside parse_chord.
export { parseChord, isChord, chordTones, DIALECTS, DEFAULT_DIALECT } from "./chord.js";
export { parseNote, formatNote, isNote } from "./pitch.js";

class NotImplementedError extends Error {
  constructor(op) {
    super(
      `cifra.md/js: ${op} is not implemented yet — a later cifra_js task fills it in`,
    );
    this.name = "NotImplementedError";
    this.op = op;
  }
}

// Reader: bytes of a cifra.md document -> model (spec §1–§7). Takes bytes
// because the text layer (spec §1.3) begins by validating UTF-8.
export function parse(_bytes) {
  throw new NotImplementedError("parse");
}

// Canonical writer: model -> canonical text (spec §8).
export function write(_model) {
  throw new NotImplementedError("write");
}

// Model-level canonicalisation: model -> canonical model (spec §8.2, §8.3, §4.5).
export function canonical(_model) {
  throw new NotImplementedError("canonical");
}

// Setlist reader: bytes of a setlist -> model (spec §10.6).
export function parseSetlist(_bytes) {
  throw new NotImplementedError("parseSetlist");
}

// Setlist canonical writer: model -> canonical setlist text (spec §10.9).
export function writeSetlist(_model) {
  throw new NotImplementedError("writeSetlist");
}

// Setlist model-level canonicalisation: model -> canonical model.
export function canonicalSetlist(_model) {
  throw new NotImplementedError("canonicalSetlist");
}

// Three-way merge (spec §11). Each of base/ours/theirs is bytes or absent
// (null); a merge input need not be UTF-8 (corpus/README.md). Returns the
// files the merge would write, keyed by their corpus names — the forward-merge
// seam the harness checks; the richer Outcome and the reverse/canonical/
// resolution checks belong to cifra_js.merge.
export function merge(_base, _ours, _theirs, _options) {
  throw new NotImplementedError("merge");
}
