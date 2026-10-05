// Note names, accidentals and the scale tables chord spelling needs (spec
// §5.1.1, §5.5). A port of the reference's reference/cifra_md/pitch.py —
// never imported from it: agreement is by the corpus, not shared code
// (DIRECTION §3.6).
//
// Framework-free and zero runtime dependencies (DIRECTION §3.7): this module
// uses only regular expressions and plain objects. It knows nothing of React,
// storage, the network or logging; it is a pure function of its input. Only
// the note-name half of pitch.py is ported here — scientific-pitch notation
// (§6.1: parse_pitch, midi) is a §6 concern, not a chord one, and is left to
// the task that needs it.

// The seven letters in scale order from C, and their natural pitch classes
// (semitones above C). The major scale as semitone offsets from its tonic;
// index i is the (i+1)th scale degree. These feed the §5.5 tone spelling in
// chord.js, which spells every tone from the root's letter, never from pitch
// class.
export const LETTERS = "CDEFGAB";
export const NATURAL_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];

// An accidental as a count of semitones, −2..+2; both the ASCII and the
// Unicode spellings are accepted (§5.1.1 lines 24–32). The reverse map writes
// the ASCII form (format_note in the reference).
const ACCIDENTALS = { "": 0, "#": 1, "♯": 1, "##": 2, b: -1, "♭": -1, bb: -2 };
const ACCIDENTAL_TEXT = { "-2": "bb", "-1": "b", 0: "", 1: "#", 2: "##" };

// The grammar of a note name (§5.1.1): a letter A–G (uppercase) and at most one
// accidental. Exported as a pattern string so chord.js can build the root and
// bass anchors from it, exactly as the reference shares NOTE_RE.
export const NOTE_RE = "[A-G](?:bb|##|[b#♯♭])?";
const NOTE_FULL = new RegExp(`^(${NOTE_RE})$`);
const NOTE_SPLIT = /^([A-G])(bb|##|[b#♯♭])?$/;

// A note name such as C, F#, Bb, Ebb, modelled as { letter, accidental } with
// the accidental in semitones. Uppercase letters only (§5.1.1 line 30): a
// lowercase letter is not a note. Throws on anything that is not a note name;
// callers that must not throw (parseChord) guard the input first.
export function parseNote(text) {
  const m = NOTE_SPLIT.exec(text);
  if (!m) {
    throw new Error(`not a note name: ${JSON.stringify(text)}`);
  }
  return { letter: m[1], accidental: ACCIDENTALS[m[2] || ""] };
}

export function isNote(text) {
  return NOTE_FULL.test(text);
}

// The ASCII spelling of a note, letter then accidental (§5.1.1). Db and C# are
// different notes and format to different text — the model preserves spelling
// (§5.2 lines 52–54).
export function formatNote(note) {
  return note.letter + ACCIDENTAL_TEXT[note.accidental];
}
