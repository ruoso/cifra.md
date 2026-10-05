// The text layer (spec §1.3) and the marker-line primitive (§11.12.3), shared
// by songs and setlists (§10.2). A port of the reference's
// reference/cifra_md/text.py — never imported from it: agreement is by the
// corpus, not shared code (DIRECTION §3.6).
//
// Framework-free and zero runtime dependencies (DIRECTION §3.7): this module
// uses only the platform built-ins `TextDecoder` and
// `String.prototype.normalize`, both available in the browser and in Node. It
// is a pure function of its input — it knows nothing of React, storage, the
// network or logging.

// A line ends at LF, at CR LF, or at a lone CR. CR LF is listed first so the
// pair is consumed as one terminator, not two (§1.3 step 4). The terminator is
// not part of the line.
const LINE_END = /\r\n|\r|\n/;

// git's conflict markers (§11.12.3): a marker line is exactly one of these, or
// one of these followed by a space and anything.
const MARKERS = ["<<<<<<<", "=======", ">>>>>>>", "|||||||"];

// The bytes are not UTF-8: not a document, and never rewritten (§1.1 lines 6–9,
// §1.3 step 1). Mirrors the reference's NotUTF8Error.
export class NotUtf8Error extends Error {
  constructor(message) {
    super(message);
    this.name = "NotUtf8Error";
  }
}

// UTF-8 decode, throwing NotUtf8Error on invalid bytes (§1.3 step 1). Accepts a
// Uint8Array (the harness passes Node Buffers, which are Uint8Arrays). A fatal
// TextDecoder rejects any ill-formed sequence rather than substituting U+FFFD.
export function decode(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new NotUtf8Error("not valid UTF-8");
  }
}

// The lines of a document, prepared in the order §1.3 gives — the order is
// observable, so it is followed exactly:
//
//   1. reject non-UTF-8 bytes (only when given bytes; a string is already
//      decoded and is trusted, as the reference's `str | bytes` entry does);
//   2. remove every U+FEFF — a byte order mark at the start and anywhere else,
//      so none can come to begin a canonical text;
//   3. normalise to NFC (before the split, so a recomposition cannot move a
//      line boundary);
//   4. split at LF, CR LF, or a lone CR; a terminator at the very end does not
//      begin another line; the empty text is zero lines;
//   5. replace each tab with exactly one space — never a run to a tab stop
//      (§1.3 lines 58–62);
//   6. strip trailing U+0020 from each line — only U+0020, never U+00A0 or any
//      other Unicode whitespace (§1.3 lines 49–54).
export function prepare(text) {
  if (typeof text !== "string") {
    text = decode(text);
  }
  text = text.replace(/﻿/g, "");
  text = text.normalize("NFC");
  if (text === "") {
    return [];
  }
  const lines = text.split(LINE_END);
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.map((ln) => ln.replace(/\t/g, " ").replace(/ +$/, ""));
}

// Whether a prepared line (§1.3) is one of git's conflict markers: one of the
// four, alone or followed by a space and anything (§11.12.3 lines 1037–1041).
export function isMarkerLine(line) {
  return MARKERS.some((m) => line === m || line.startsWith(m + " "));
}

// The 1-based line numbers of the marker lines of a text, computed over
// prepare(...) so the text layer of §1.3 is applied first (§11.12.3).
export function markerLines(text) {
  const out = [];
  prepare(text).forEach((line, i) => {
    if (isMarkerLine(line)) out.push(i + 1);
  });
  return out;
}
