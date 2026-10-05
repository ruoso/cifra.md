// Setlists (spec §10): the reader, the canonical writer, the path machinery and
// the editing operations. A port of the reference's
// reference/cifra_md/setlist.py (the reader, writer and §10.5/§10.9.2 paths),
// matched to it and the thirteen setlist corpus entries, never imported from it:
// agreement is by the corpus, not shared code (DIRECTION §3.6). The §10.10
// editing operations are pure model transforms designed from the spec — the
// reference carries no editor — and unit-tested here.
//
// Nothing in a setlist is music and a setlist reader reads no chart (§10 header
// lines 4–5): this module reads no song and imports no chord layer. A `key` is
// validated against a self-contained regex (the roots of §5.1.1), as the
// reference does, not against the chord parser (§Decisions).
//
// Framework-free and zero runtime dependencies (DIRECTION §3.7): only regular
// expressions, `String.prototype.normalize` (NFC), the platform's
// `TextEncoder`/`TextDecoder` (as the text layer uses), the shared markdown
// primitives and the text layer, and plain objects/arrays. It knows nothing of
// React, storage, the network or the filesystem; a setlist reader with no book
// resolves nothing, and resolution against a real book is the Worker's.

import { prepare } from "./text.js";
import { fenceOpen, closesFence, mdHeading } from "./markdown.js";

// A bullet line: a `-`/`*`/`+` marker and, after it, the content (§10.3).
const BULLET = /^ *[-*+](?: +(.*))?$/;
// An item line: 0–3 leading spaces, 1–9 digits, `.` or `)`, then the content
// (§10.3.2). Four or more leading spaces is not an item.
const ITEM = /^ {0,3}([0-9]{1,9})[.)](?: +(.*))?$/;
// A property: a `[A-Za-z0-9_-]+` key, optional spaces, `:`, then — only if more
// follows — a required space and the value (§10.3). The required space after
// `:` is what makes `- https://example.com/` an unrecognised entry, not the
// key `https`.
const PROPERTY = /^([A-Za-z0-9_-]+) *:(?: +(.*))?$/;
// A URL scheme (§10.5 step 2).
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
// ASCII punctuation, the set a Markdown backslash may escape (§10.4).
const ASCII_PUNCT = new Set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~");
// The characters a path segment keeps unencoded besides the alphanumerics
// (§10.9.2).
const SAFE = new Set("-._~!$'*+,;=@");
// A `key` value: a root as in §5.1.1, then `m` for minor or nothing for major
// (§10.7.1). Written inline, as the reference does, so the setlist module does
// not import the chord layer (§Decisions).
const KEY = /^[A-G](?:#|b|♯|♭)?m?$/;
// Hex digits, for percent-decoding (§10.5 step 4).
const HEX = new Set("0123456789abcdefABCDEF");
// The characters a song's file name escapes when it has no title (§10.10).
const FILENAME_SPECIAL = new Set(["\\", "`", "*", "_", "[", "]", "<", "&"]);

const SUFFIX = ".cifra.md";

const encoder = new TextEncoder();
const utf8 = new TextDecoder("utf-8", { fatal: true });

// Lowercase only ASCII A–Z (§10.3): a property key is held lowercase.
function lower(text) {
  let out = "";
  for (const c of text) {
    out += c >= "A" && c <= "Z" ? String.fromCharCode(c.charCodeAt(0) + 32) : c;
  }
  return out;
}

// An entry: a property when the content is `key: value`, else unrecognised
// (§10.3).
function entryOf(content) {
  const m = PROPERTY.exec(content);
  if (m) return { type: "property", key: lower(m[1]), value: m[2] || "" };
  return { type: "unrecognised", text: content };
}

function isKey(value) {
  return KEY.test(value);
}

// --- links and paths (§10.4, §10.5) ----------------------------------------

// `{ text, dest }` when the content has the shape of a song link, else `null`
// (§10.4). Scanned over code points so the index arithmetic matches the
// reference's on characters outside the BMP.
function parseLink(content) {
  if (!content.startsWith("[")) return null;
  const cs = [...content];
  let depth = 0;
  let i = 1;
  let close = null;
  while (i < cs.length) {
    const ch = cs[i];
    if (ch === "\\" && i + 1 < cs.length && ASCII_PUNCT.has(cs[i + 1])) {
      i += 2;
      continue;
    }
    if (ch === "[") {
      depth += 1;
    } else if (ch === "]") {
      if (depth === 0) {
        close = i;
        break;
      }
      depth -= 1;
    }
    i += 1;
  }
  if (close === null || cs[close + 1] !== "(" || cs[cs.length - 1] !== ")") {
    return null;
  }
  const text = cs.slice(1, close).join("");
  const dest = cs.slice(close + 2, cs.length - 1).join("");
  if (dest.startsWith("<")) {
    if (dest.length < 2 || !dest.endsWith(">")) return null;
    const inner = [...dest.slice(1, -1)];
    let k = 0;
    while (k < inner.length) {
      if (inner[k] === "\\" && k + 1 < inner.length && ASCII_PUNCT.has(inner[k + 1])) {
        k += 2;
        continue;
      }
      if (inner[k] === "<" || inner[k] === ">") return null;
      k += 1;
    }
    return { text, dest };
  }
  for (const ch of dest) {
    const cp = ch.codePointAt(0);
    if (ch === " " || cp < 32 || cp === 127) return null;
  }
  const ds = [...dest];
  let depth2 = 0;
  let k = 0;
  while (k < ds.length) {
    if (ds[k] === "\\" && k + 1 < ds.length && ASCII_PUNCT.has(ds[k + 1])) {
      k += 2;
      continue;
    }
    if (ds[k] === "(") {
      depth2 += 1;
    } else if (ds[k] === ")") {
      depth2 -= 1;
      if (depth2 < 0) return null;
    }
    k += 1;
  }
  if (depth2 !== 0) return null;
  return { text, dest };
}

// Remove a backslash before each ASCII-punctuation character (§10.5 step 1).
function unescape(text) {
  const cs = [...text];
  let out = "";
  let k = 0;
  while (k < cs.length) {
    if (cs[k] === "\\" && k + 1 < cs.length && ASCII_PUNCT.has(cs[k + 1])) {
      out += cs[k + 1];
      k += 2;
      continue;
    }
    out += cs[k];
    k += 1;
  }
  return out;
}

// The path of a destination (§10.5): `{ path }` on success, `{ error }` naming
// the step that failed. `path` is the decoded segments joined by `/`; a segment
// never holds a `/`, so the join is unambiguous.
export function songPath(dest) {
  let d = dest;
  if (d.startsWith("<")) d = d.slice(1, -1);
  const p = unescape(d);
  if (SCHEME.test(p)) return { error: "step 2: a URL, not a path" };
  if (p.includes("?") || p.includes("#")) return { error: "step 2: a query or a fragment" };
  if (p.startsWith("/")) return { error: "step 2: an absolute path" };
  const segments = p.split("/");
  if (segments.some((s) => s === "")) return { error: "step 3: an empty segment" };
  const decoded = [];
  for (const s of segments) {
    const cs = [...s];
    const data = [];
    let k = 0;
    while (k < cs.length) {
      if (cs[k] === "%" && k + 2 < cs.length && HEX.has(cs[k + 1]) && HEX.has(cs[k + 2])) {
        data.push(parseInt(cs[k + 1] + cs[k + 2], 16));
        k += 3;
        continue;
      }
      for (const b of encoder.encode(cs[k])) data.push(b);
      k += 1;
    }
    let seg;
    try {
      seg = utf8.decode(new Uint8Array(data));
    } catch {
      return { error: "step 4: a segment that is not UTF-8" };
    }
    if (seg.includes("/") || seg.includes("\u0000")) {
      return { error: "step 4: a segment holding `/` or U+0000" };
    }
    decoded.push(seg.normalize("NFC"));
  }
  const kept = [];
  for (const s of decoded) {
    if (s === ".") continue;
    if (s === "..") {
      if (kept.length && kept[kept.length - 1] !== "..") kept.pop();
      else kept.push(s);
      continue;
    }
    kept.push(s);
  }
  if (kept.length === 0 || kept.every((s) => s === "..")) {
    return { error: "step 5: nothing left" };
  }
  const last = kept[kept.length - 1];
  if (!last.endsWith(SUFFIX) || last.length <= SUFFIX.length) {
    return { error: "step 6: not a song (`.cifra.md`)" };
  }
  return { path: kept.join("/") };
}

function isAsciiAlnum(ch) {
  return (ch >= "0" && ch <= "9") || (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z");
}

function pctByte(byte) {
  return "%" + byte.toString(16).toUpperCase().padStart(2, "0");
}

// A path as canonical form writes it (§10.9.2): each segment percent-encoded,
// with the rule that a non-ASCII character immediately after a percent-encoded
// one is itself percent-encoded, so an accent cannot compose with a decoded
// byte.
export function writePath(path) {
  const out = [];
  for (const seg of path.split("/")) {
    let enc = "";
    let afterPct = false;
    for (const ch of seg) {
      if (ch.codePointAt(0) >= 128) {
        if (afterPct) {
          for (const b of encoder.encode(ch)) enc += pctByte(b);
        } else {
          enc += ch;
        }
      } else if (isAsciiAlnum(ch) || SAFE.has(ch)) {
        enc += ch;
        afterPct = false;
      } else {
        enc += pctByte(ch.codePointAt(0));
        afterPct = true;
      }
    }
    out.push(enc);
  }
  return out.join("/");
}

// --- the reader (§10.3) ----------------------------------------------------

// A repeated key keeps its first position with the last value, and is reported
// (§10.3.1, §10.3.3); an entry that is not `key: value` is reported and kept.
function setEntry(entries, entry, diag, lineno) {
  if (entry.type === "property") {
    for (const e of entries) {
      if (e.type === "property" && e.key === entry.key) {
        diag("duplicate-key", lineno, `\`${entry.key}\` is set again; the earlier value is not kept`);
        e.value = entry.value;
        return;
      }
    }
  } else {
    diag("unrecognised-entry", lineno, "an entry that is not `key: value`; kept as written");
  }
  entries.push(entry);
}

function checkKey(entry, diag, lineno) {
  if (entry.type === "property" && entry.key === "key" && !isKey(entry.value)) {
    diag("bad-key", lineno, `\`${entry.value}\` is not a key: a root, then \`m\` for minor (§10.7.1)`);
  }
}

// Read a setlist into its model (§10.6). Takes bytes because the text layer
// (§10.2) begins by validating UTF-8; a string is accepted too (already
// decoded), as the reference's `str | bytes` entry does. Never throws on a
// setlist it does not understand: it reports in `diagnostics` and keeps
// everything (§10.8.3).
export function parseSetlist(bytes) {
  const lines = prepare(bytes);
  const diagnostics = [];
  const diag = (code, line, message) => diagnostics.push({ code, message, line });

  const n = lines.length;
  let i = 0;
  let title = null;
  const properties = [];
  while (i < n && !lines[i]) i += 1;
  if (i < n) {
    const h = mdHeading(lines[i]);
    if (h && h.level === 1) {
      title = h.text || null;
      i += 1;
    }
  }
  // Properties: bullet lines right after the title, blank lines allowed.
  let j = i;
  while (j < n) {
    if (!lines[j]) {
      j += 1;
      continue;
    }
    const m = BULLET.exec(lines[j]);
    if (!m) break;
    setEntry(properties, entryOf(m[1] || ""), diag, j + 1);
    j += 1;
    i = j;
  }

  const body = [];
  let notes = null; // the notes block being read, blank lines included
  let pendingBlank = 0;
  let item = null; // the item whose entries may follow
  let fence = null;
  let number = 0;

  const flushNotes = () => {
    if (notes !== null) {
      body.push({ type: "notes", lines: notes });
      notes = null;
    }
  };

  for (let k = i; k < n; k += 1) {
    const ln = lines[k];
    const lineno = k + 1;
    if (fence !== null) {
      if (!ln) {
        pendingBlank += 1; // kept only if a line of the fence follows
        continue;
      }
      for (let z = 0; z < pendingBlank; z += 1) notes.push("");
      pendingBlank = 0;
      notes.push(ln);
      if (closesFence(ln, fence)) fence = null;
      continue;
    }
    if (!ln) {
      pendingBlank += 1;
      continue;
    }
    const m = ITEM.exec(ln);
    if (m) {
      flushNotes();
      pendingBlank = 0;
      number += 1;
      const content = m[2] || "";
      const link = parseLink(content);
      let path = null;
      let reason = null;
      if (link !== null) {
        const r = songPath(link.dest);
        if ("path" in r) path = r.path;
        else reason = r.error;
      }
      if (path !== null) {
        item = { type: "song", number, text: link.text, path, entries: [] };
        if (path.includes("\\")) {
          diag("backslash-in-path", lineno, "a `\\` in a path is part of a file name, not a separator");
        }
      } else {
        item = { type: "unlinked", number, content, entries: [] };
        if (link !== null) diag("bad-path", lineno, `the link's destination is not a song path (${reason})`);
        else diag("unlinked-item", lineno, "an item that is not a song link; kept, and skipped when playing");
      }
      body.push(item);
      continue;
    }
    const b = BULLET.exec(ln);
    if (b && item !== null && notes === null) {
      pendingBlank = 0;
      const entry = entryOf(b[1] || "");
      checkKey(entry, diag, lineno);
      setEntry(item.entries, entry, diag, lineno);
      continue;
    }
    // notes
    item = null;
    if (notes === null) notes = [];
    else for (let z = 0; z < pendingBlank; z += 1) notes.push("");
    pendingBlank = 0;
    notes.push(ln);
    const fo = fenceOpen(ln);
    if (fo) fence = { char: fo.char, length: fo.length, line: lineno };
  }
  if (fence !== null) {
    diag("unclosed-fence", fence.line, "a fence was opened and never closed; it runs to the end of the setlist");
  }
  flushNotes();
  diagnostics.sort((a, b) => a.line - b.line);
  return { title, properties, body, diagnostics };
}

// --- the writer (§10.9) ----------------------------------------------------

function entryLine(entry, indent = 0) {
  const pad = " ".repeat(indent);
  if (entry.type === "property") {
    return `${pad}- ${entry.key}:` + (entry.value ? ` ${entry.value}` : "");
  }
  return entry.text ? `${pad}- ${entry.text}` : `${pad}-`;
}

// An item's entries in canonical order: `key`, `note`, then the rest (§10.9.2).
function orderedEntries(entries) {
  const first = [];
  for (const k of ["key", "note"]) {
    for (const e of entries) {
      if (e.type === "property" && e.key === k) first.push(e);
    }
  }
  return first.concat(entries.filter((e) => !first.some((f) => f === e)));
}

// The item line after its number and the space (§10.9.2).
function itemContent(item) {
  if (item.type === "song") return `[${item.text}](${writePath(item.path)})`;
  return item.content;
}

function itemLines(item, number) {
  const content = itemContent(item);
  const head = `${number}.` + (content ? ` ${content}` : "");
  const indent = String(number).length + 2;
  return [head, ...orderedEntries(item.entries).map((e) => entryLine(e, indent))];
}

// The canonical text of a setlist model (§10.9): parts separated by one blank
// line (the metadata, then runs of items and notes blocks in document order),
// with a final LF — or the zero-byte file for a setlist with no title,
// properties, items or notes.
export function writeSetlist(model) {
  const parts = [];
  const meta = [];
  if (model.title) meta.push(`# ${model.title}`);
  for (const e of model.properties || []) meta.push(entryLine(e));
  if (meta.length) parts.push(meta);
  let run = null;
  let number = 0;
  for (const el of model.body || []) {
    if (el.type === "notes") {
      if (run !== null) {
        parts.push(run);
        run = null;
      }
      parts.push([...el.lines]);
      continue;
    }
    number += 1;
    if (run === null) run = [];
    run.push(...itemLines(el, number));
  }
  if (run !== null) parts.push(run);
  if (parts.length === 0) return "";
  return parts.map((p) => p.join("\n")).join("\n\n") + "\n";
}

// Model-level canonicalisation (§10.9), defined as read-after-write so there is
// no second code path to keep in step with the writer: write the model to
// canonical text and read it back, which reorders each item's entries into
// `key`→`note`→rest order, collapses a repeated key, and renumbers
// (§Decisions). The result's `diagnostics` describe the canonical text.
export function canonicalSetlist(model) {
  return parseSetlist(writeSetlist(model));
}

// --- the editing operations (§10.10) ---------------------------------------

// A deep copy of a plain-data model, preserving key insertion order — the model
// is JSON (strings, numbers, arrays, plain objects), so the round trip is
// faithful and keeps each operation from mutating its input.
function clone(model) {
  return JSON.parse(JSON.stringify(model));
}

// The body indices of the items (songs and unlinked), in document order; the
// editing operations address an item by its 0-based position among these.
function itemBodyIndices(body) {
  const indices = [];
  body.forEach((el, idx) => {
    if (el.type === "song" || el.type === "unlinked") indices.push(idx);
  });
  return indices;
}

// Items number by position, 1 from the top, so a clean model carries the
// numbers the canonical form would write.
function renumber(body) {
  let n = 0;
  for (const el of body) {
    if (el.type === "song" || el.type === "unlinked") {
      n += 1;
      el.number = n;
    }
  }
  return body;
}

// The path from the setlist's directory to a song, both given as segments from
// the book root (§10.10). Remove the longest run of leading directory segments
// they share (never the song's file name); the path is one `..` per segment
// left in the setlist's directory, then the segments left in the song's path. A
// song beside the setlist is its file name alone.
export function pathFromSetlistToSong(setlistDirSegments, songPathSegments) {
  const D = setlistDirSegments;
  const S = songPathSegments;
  let common = 0;
  while (common < D.length && common < S.length - 1 && D[common] === S[common]) {
    common += 1;
  }
  const ups = [];
  for (let z = 0; z < D.length - common; z += 1) ups.push("..");
  return ups.concat(S.slice(common)).join("/");
}

// A link's text from a song's title as read (§10.10): a `\` and the ASCII
// punctuation after it are copied as a pair; any other `[` or `]` is preceded
// by `\`; a trailing `\` that is not the second of a pair is doubled.
function escapeTitleText(title) {
  const cs = [...title];
  let out = "";
  let k = 0;
  while (k < cs.length) {
    const ch = cs[k];
    if (ch === "\\") {
      if (k + 1 < cs.length && ASCII_PUNCT.has(cs[k + 1])) {
        out += ch + cs[k + 1];
        k += 2;
        continue;
      }
      if (k + 1 >= cs.length) {
        out += "\\\\";
        k += 1;
        continue;
      }
      out += ch;
      k += 1;
      continue;
    }
    if (ch === "[" || ch === "]") {
      out += "\\" + ch;
      k += 1;
      continue;
    }
    out += ch;
    k += 1;
  }
  return out;
}

// A link's text from a song's file name (§10.10): a file name is not Markdown,
// so each of `` \ ` * _ [ ] < & `` is preceded by `\`.
function escapeFileNameText(name) {
  let out = "";
  for (const ch of name) {
    out += FILENAME_SPECIAL.has(ch) ? "\\" + ch : ch;
  }
  return out;
}

// The text for a song (§10.10): its title as read, escaped for a link's text;
// or, when the song has no title or an empty one, its file name without
// `.cifra.md`, escaped as a file name. Pure, given the title or file name — the
// caller reads the song.
export function textForSong({ title, fileName } = {}) {
  if (title) return escapeTitleText(title);
  const name = (fileName ?? "").endsWith(SUFFIX)
    ? fileName.slice(0, -SUFFIX.length)
    : fileName ?? "";
  return escapeFileNameText(name);
}

// Add a song: a song item with the given text and path and no entries, inserted
// at the 0-based item position `at`, or last when `at` is omitted or past the
// end (§10.10).
export function addSong(model, { text, path }, at) {
  const m = clone(model);
  const newItem = { type: "song", number: 0, text, path, entries: [] };
  const indices = itemBodyIndices(m.body);
  if (at == null || at >= indices.length) m.body.push(newItem);
  else m.body.splice(indices[at], 0, newItem);
  renumber(m.body);
  return m;
}

// Remove the item at the 0-based position `at`; its entries go with it, and the
// rest are renumbered (§10.10).
export function removeItem(model, at) {
  const m = clone(model);
  m.body.splice(itemBodyIndices(m.body)[at], 1);
  renumber(m.body);
  return m;
}

// Move the item at position `from` so it becomes the item at position `to` in
// the resulting sequence; the item and its entries go together, and all are
// renumbered (§10.10).
export function moveItem(model, from, to) {
  const m = clone(model);
  const [el] = m.body.splice(itemBodyIndices(m.body)[from], 1);
  const indices = itemBodyIndices(m.body);
  const dest = to >= indices.length ? m.body.length : indices[to];
  m.body.splice(dest, 0, el);
  renumber(m.body);
  return m;
}

// Set a property under the item at position `at`: the entry for that key is
// given the new value, or added (§10.10). The key is held lowercase, as the
// reader holds it.
export function setProperty(model, at, key, value) {
  const m = clone(model);
  const item = m.body[itemBodyIndices(m.body)[at]];
  const k = lower(key);
  const existing = item.entries.find((e) => e.type === "property" && e.key === k);
  if (existing) existing.value = value;
  else item.entries.push({ type: "property", key: k, value });
  return m;
}

// Remove a property from the item at position `at` (§10.10).
export function removeProperty(model, at, key) {
  const m = clone(model);
  const item = m.body[itemBodyIndices(m.body)[at]];
  const k = lower(key);
  item.entries = item.entries.filter((e) => !(e.type === "property" && e.key === k));
  return m;
}

// Point the item at position `at` at a song: its path becomes the new song's
// path and its text the new song's text, and its entries are kept (§10.10). An
// unlinked item becomes a song item.
export function pointItemAtSong(model, at, { text, path }) {
  const m = clone(model);
  const bi = itemBodyIndices(m.body)[at];
  const old = m.body[bi];
  m.body[bi] = { type: "song", number: old.number, text, path, entries: old.entries };
  return m;
}

// Retarget the item at position `at` to a new path, keeping its text and
// entries (§10.10) — the path-only change the app's book-wide moves (a song
// moved or renamed; the setlist moved) compose with `songPath` and
// `pathFromSetlistToSong`, which resolve items against the working copy the
// Worker owns.
export function retargetItem(model, at, path) {
  const m = clone(model);
  const bi = itemBodyIndices(m.body)[at];
  const old = m.body[bi];
  m.body[bi] = { type: "song", number: old.number, text: old.text, path, entries: old.entries };
  return m;
}

// Refresh a link's text (§10.10): the text of the item at position `at` becomes
// the given text; nothing else changes.
export function refreshText(model, at, text) {
  const m = clone(model);
  m.body[itemBodyIndices(m.body)[at]].text = text;
  return m;
}
