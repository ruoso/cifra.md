// Tunings (spec §6). A port of the reference's reference/cifra_md/tuning.py —
// never imported from it: agreement is by the corpus, not shared code (DIRECTION
// §3.6). The reader (parse.js) reads a voicings block's tuning through these.
//
// Framework-free and zero runtime dependencies (DIRECTION §3.7): pure functions
// of their text, standing on the scientific-pitch helpers of pitch.js. They know
// nothing of React, storage, the network or the filesystem.

import { canonicalPitchText, midi, parsePitch } from "./pitch.js";

// Pitches are separated by commas and/or spaces (§6.2).
const SEP = /[, ]+/;

// A tuning: the open strings as pitches, lowest first (§6). Throws when the text
// is not a tuning (no pitch, or a part that is not a pitch); the reader catches
// to report `bad-block-heading`. A single pitch is still a tuning here — §6.4's
// "a single pitch is not a tuning" is the reader's rule for a block heading, not
// this grammar's.
export function parseTuning(text) {
  const parts = text.split(SEP).filter((p) => p);
  if (parts.length === 0) {
    throw new Error("a tuning needs at least one pitch");
  }
  const pitches = parts.map((p) => parsePitch(p));
  // The text is each pitch as written, letter uppercased, one space apart (§6.2).
  const canonical = parts.map((p) => canonicalPitchText(p)).join(" ");
  return { text: canonical, pitches, id: tuningId(pitches) };
}

// Identity by sound (§6.3): Eb2 and D#2 are the same string, so a tuning's id is
// the space-joined MIDI numbers of its pitches.
export function tuningId(pitches) {
  return pitches.map((p) => String(midi(p))).join(" ");
}

export function isTuning(text) {
  try {
    parseTuning(text);
    return true;
  } catch {
    return false;
  }
}
