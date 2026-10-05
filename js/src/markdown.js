// The two block-level Markdown primitives chapter 10 borrows from the song
// chapters: the §1.4.1 level-1 title and the §1.9 fences. A port of the
// reference's reference/cifra_md/parse.py (`md_heading`, `fence_open`,
// `closes_fence` and the helpers they use) — never imported from it: agreement
// is by the corpus, not shared code (DIRECTION §3.6).
//
// These live in a small, neutral module so the setlist reader uses them now and
// `cifra_js.reader` imports the same one correct copy when it lands, without
// either reader depending on the other's internals (cifra_js.setlists
// refinement §Decisions).
//
// Framework-free and zero runtime dependencies (DIRECTION §3.7): pure functions
// of one line, built on regular expressions alone. They know nothing of React,
// storage, the network or the filesystem.

// A Markdown heading: up to three leading spaces, 1–6 `#`, then — only if more
// follows — one space and the content (§1.7.1, §1.4.1). `#` with no space and
// no content is still a heading; `#x` is not.
const MD_HEADING = /^ {0,3}(#{1,6})(?: (.*))?$/;
// A fence: up to three leading spaces, a run of three or more backticks or
// tildes, then the info string (§1.9).
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
// A fence close: only the fence character, nothing after (§1.9).
const FENCE_CLOSE = /^ {0,3}(`+|~+)$/;
// A closing `#` sequence of a heading: at the end, alone or after a space
// (§1.7.1).
const CLOSING_SEQUENCE = /(?:^| )#+$/;

// Lowercase only ASCII A–Z, as the reference's `ascii_lower` does — a title or
// an info string is compared and held with the document's own casing elsewhere.
function asciiLower(text) {
  let out = "";
  for (const c of text) {
    out += c >= "A" && c <= "Z" ? String.fromCharCode(c.charCodeAt(0) + 32) : c;
  }
  return out;
}

// Strip only U+0020 from both ends — never other Unicode whitespace.
function stripSpaces(text) {
  return text.replace(/^ +/, "").replace(/ +$/, "");
}

// The text of a Markdown heading (§1.7.1): trimmed of spaces, the closing `#`
// sequence removed, runs of spaces collapsed to one.
function headingText(content) {
  let t = stripSpaces(content ?? "");
  t = stripSpaces(t.replace(CLOSING_SEQUENCE, ""));
  return t.replace(/ +/g, " ");
}

// `{ level, text }` for a Markdown heading line, else `null` (§1.4.1). `text`
// is the heading's text, which may be empty (`#` alone).
export function mdHeading(line) {
  const m = MD_HEADING.exec(line);
  if (!m) return null;
  return { level: m[1].length, text: headingText(m[2]) };
}

// `{ char, length, info }` for a line that opens a fence, else `null` (§1.9).
// `char` is the fence character, `length` the run length, `info` the info
// string (ASCII-lowercased, trimmed). CommonMark: a backtick fence's info
// string may hold no backtick, so such a line opens no fence.
export function fenceOpen(line) {
  const m = FENCE.exec(line);
  if (!m) return null;
  const run = m[1];
  const info = m[2];
  if (run[0] === "`" && info.includes("`")) return null;
  return { char: run[0], length: run.length, info: asciiLower(stripSpaces(info)) };
}

// Whether a line closes the given open fence (§1.9): the same fence character,
// a run at least as long as the opener's, and nothing after it. `fence` is a
// `{ char, length }` as `fenceOpen` returns.
export function closesFence(line, fence) {
  const m = FENCE_CLOSE.exec(line);
  return !!m && m[1][0] === fence.char && m[1].length >= fence.length;
}
