# Examples

Complete documents, one per feature. Each is a valid cifra.md file and a
valid Markdown file.

| File | Shows |
|---|---|
| [minimal.cifra.md](minimal.cifra.md) | A chart with sections and bars, nothing else |
| [two-instruments.cifra.md](two-instruments.cifra.md) | Footnote markers and a voicing block per tuning |
| [with-words.cifra.md](with-words.cifra.md) | A cifra: chords over words, bracket headings, a forced lyric line |
| [repeats.cifra.md](repeats.cifra.md) | The measure repeat sign, a group with endings, a counted group, a counted line |
| [bar-numbers.cifra.md](bar-numbers.cifra.md) | Stated bar numbers for a repeat written out straight |
| [variations.cifra.md](variations.cifra.md) | Two variations of the voicings for one tuning |
| [metadata.cifra.md](metadata.cifra.md) | A title, properties and a declared notation dialect |
| [notes.cifra.md](notes.cifra.md) | Free notes outside the fences, kept but not interpreted |
| [capo.cifra.md](capo.cifra.md) | A capo as a tuning: the chart sounds, the block voices, the shape name is derived |

And two setlists (spec §10), which name the songs above. Both are in
canonical form.

| File | Shows |
|---|---|
| [rehearsal.setlist.md](rehearsal.setlist.md) | The smallest useful setlist: a title, three songs, a `key` and a `note`. *Minimal* has no `key` of its own, so its `key: E` is shown as a note rather than applied (§10.7.1) |
| [gig.setlist.md](gig.setlist.md) | A setlist property, notes before the list and between two sets, numbering that continues across them, link text that is not the song's title, a song played twice, an application-defined key, and the deeper indentation under item 10 |
