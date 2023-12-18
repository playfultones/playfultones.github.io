# Melody checks

Serve this repository over HTTP and open `/tests/melody.html`. The checks cover
repeatable generation, recognizable phrases with musical variation, chord and
register bounds, safe driving routes, and agreement between note blocks and
the audio timeline at 44.1 and 48 kHz. They run silently.

`melody-mix.mjs` exports `auditMelodyMix(sequence, character)`. It renders four
loops through the real DSP, AAC backing and effects in an OfflineAudioContext,
returning an AudioBuffer and peak/RMS/clipping measurements. `character` is 0
for soft slopes, .32 for the initial position, and 1 for sharp terrain. Rendering
does not play audio. An optional third argument accepts another note generator
for a controlled comparison.

The phrase vocabulary lives in `scope/valley-sequence.js`. A four-loop arc uses
the original melodic skeleton, an alternate answer, a developed arp with a
placed upper-register note, then a return with more space at the ending. Each
arc selects a few related phrases and rhythms from the seeded vocabulary;
the first question stays stable. Small velocity variations use a separate
random stream. All notes follow the current chord; gates stop at chord changes.

Generation is a pure function of authoring data and absolute loop number. Do
not carry evolving random state between calls: the worklet and road request
different loops at different times, including after pause, mute and seek.
