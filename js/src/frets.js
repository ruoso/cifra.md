// Fret strings and fingerings (spec §7.5, §7.5.1). A port of the reference's
// reference/cifra_md/frets.py — never imported from it: agreement is by the
// corpus, not shared code (DIRECTION §3.6). The reader (parse.js) reads a
// voicing's frets and fingering through these; the writer re-prints them.
//
// Framework-free and zero runtime dependencies (DIRECTION §3.7): pure functions
// of their text, built on regular expressions and plain arrays alone. They know
// nothing of React, storage, the network or the filesystem.

// One fret: one or two digits. A compact string is one digit per character; a
// hyphenated one is parts split on `-` (needed once a fret reaches 10, §7.5).
const PART = /^\d{1,2}$/;

// Strip only U+0020 from both ends, as the reference's `text.strip(" ")` does.
function stripSpaces(text) {
  return text.replace(/^ +/, "").replace(/ +$/, "");
}

// A fret string as a list of ints and `"x"` (a muted string, written `x`/`X`),
// or `null` when the text is not a fret string (§7.5). Compact (`x32010`) unless
// a fret reaches 10, then hyphenated (`8-10-10-8-8-8`).
export function parseFrets(text) {
  const t = stripSpaces(text);
  if (!t) return null;
  const parts = t.includes("-") ? t.split("-") : [...t];
  const out = [];
  for (const part of parts) {
    if (part === "x" || part === "X") {
      out.push("x");
    } else if (PART.test(part)) {
      out.push(parseInt(part, 10));
    } else {
      return null;
    }
  }
  return out.length ? out : null;
}

// A fret list printed compactly unless a fret reaches 10, then hyphenated
// (§7.5).
export function formatFrets(frets) {
  const parts = frets.map((f) => (f === "x" ? "x" : String(f)));
  const wide = frets.some((f) => typeof f === "number" && f >= 10);
  return wide ? parts.join("-") : parts.join("");
}

// A fingering (§7.5.1): positions 1–4, `T` (the thumb), or `-` (0 is read as
// `-`), each as `int | "T" | null`. Spaced or run together. Returns the list,
// or `null` when the text is not a fingering.
export function parseFingers(text) {
  const t = stripSpaces(text);
  if (!t) return null;
  const parts = t.includes(" ") ? t.split(" ").filter((p) => p) : [...t];
  const out = [];
  for (const part of parts) {
    if (part === "-" || part === "0") {
      out.push(null);
    } else if (part === "T" || part === "t") {
      out.push("T");
    } else if (part === "1" || part === "2" || part === "3" || part === "4") {
      out.push(parseInt(part, 10));
    } else {
      return null;
    }
  }
  return out;
}

// Why a fingering is wrong for a shape, as a message, or `null` when it is fine
// (§7.5.1): a finger count that does not match the strings, a finger on a string
// that is not fretted, or one finger on two different frets (a barre is one
// finger on one fret across strings, which is fine).
export function checkFingers(fingers, frets) {
  if (fingers.length !== frets.length) {
    return `${fingers.length} finger positions for ${frets.length} strings`;
  }
  const at = {};
  for (let i = 0; i < fingers.length; i += 1) {
    const finger = fingers[i];
    const fret = frets[i];
    if (finger === null) continue;
    if (fret === "x" || fret === 0) {
      return `finger ${finger} on a string that is not fretted`;
    }
    if (finger in at && at[finger] !== fret) {
      return `finger ${finger} on frets ${at[finger]} and ${fret}`;
    }
    at[finger] = fret;
  }
  return null;
}

// A fingering printed one position per string, spaced, `-` for no finger
// (§7.5.1).
export function formatFingers(fingers) {
  return fingers.map((f) => (f === null ? "-" : String(f))).join(" ");
}
