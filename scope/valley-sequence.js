// Beat-based authoring data; the AudioWorklet owns note scheduling at audio rate.
// A missing file is drone mode. Invalid composition data is always an error.
export function validateSequence(value) {
  const fail = message => { throw new Error(`Invalid sequence: ${message}`); };
  if (!value || value.version !== 1) fail('expected version 1');
  if (!Number.isFinite(value.tempo) || value.tempo < 20 || value.tempo > 300) fail('tempo must be 20–300 BPM');
  if (!Number.isFinite(value.loopBeats) || value.loopBeats <= 0 || value.loopBeats > 2048) fail('invalid loop length');
  if (!Array.isArray(value.notes) || value.notes.length > 4096) fail('expected at most 4096 notes');
  for (const [i, note] of value.notes.entries()) {
    if (!Number.isFinite(note.beat) || note.beat < 0 || note.beat >= value.loopBeats) fail(`note ${i}: invalid beat`);
    if (!Number.isInteger(note.pitch) || note.pitch < 24 || note.pitch > 96) fail(`note ${i}: pitch must be MIDI 24–96`);
    if (!Number.isFinite(note.duration) || note.duration <= 0 || note.beat + note.duration > value.loopBeats + 1e-7) fail(`note ${i}: invalid duration`);
    if (!Number.isFinite(note.velocity) || note.velocity <= 0 || note.velocity > 1) fail(`note ${i}: velocity must be 0–1`);
  }
  if (value.backing !== undefined && (typeof value.backing !== 'string' || !value.backing.length)) fail('invalid backing URL');
  if (value.generator) {
    if (value.generator.type !== 'chillwave' || !Number.isInteger(value.generator.seed)) fail('invalid generator');
    const register = value.generator.register;
    if (register && (!Number.isInteger(register.low) || !Number.isInteger(register.high)
      || register.low < 36 || register.high > 96 || register.high - register.low < 11)) fail('invalid melody register');
    if (value.loopBeats !== 32) fail('chillwave form needs an eight-bar loop');
    if (!Array.isArray(value.chords) || !value.chords.length || value.chords[0].beat !== 0) fail('chords must begin at beat zero');
    let previous = -1;
    for (const chord of value.chords) {
      if (!Number.isFinite(chord.beat) || chord.beat <= previous || chord.beat >= value.loopBeats) fail('chord beats must be ordered within the loop');
      if (!Array.isArray(chord.pitches) || chord.pitches.length < 2 || chord.pitches.some(p => !Number.isInteger(p) || p < 36 || p > 84)) fail('invalid chord pitches');
      previous = chord.beat;
    }
  }
  return value;
}

function randomSource(seed) {
  let n = seed >>> 0;
  return () => {
    n += 0x6D2B79F5;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function chordAt(sequence, beat) {
  let chord = sequence.chords[0];
  for (const candidate of sequence.chords) { if (candidate.beat > beat) break; chord = candidate; }
  return chord;
}

// Compose phrases once per loop. The seed and absolute loop number are the
// entire state, so the worklet and the road can request loops in any order.
// Repetition lives inside the phrases; variation happens between their answers.
// Each four-loop arc establishes, answers, develops, then returns to the theme.
// Entries are [beat within the phrase, chord degree, gate in beats].
const QUESTION = [[.5, 1, .9], [2, 4, .7], [4.5, 1, 1.05], [6.5, 2, .8]];
const ANSWERS = [
  [[.5, 1, .9], [2, 3, .7], [4.5, 2, .9]],             // Original hook.
  [[.5, 1, .9], [2, 2, .7], [4.5, 1, 1.05]],          // Descending answer.
  [[.5, 1, .9], [2.5, 4, .45], [4.5, 2, .9]],         // One delayed reply.
  [[.5, 1, .8], [2, 3, .65], [3, 2, .4], [4.5, 4, .9]], // Pickup into the change.
];
// The original arp, aligned to the start of bar five. Related shapes share
// their first two beats; the answer changes the tail, not the whole contour.
const ARPS = [
  [2, 4, 1, 2, 0, 2, 1, 3],
  [2, 4, 1, 2, 0, 1, 3, 2],
  [2, 4, 1, 2, 3, 2, 0, 1],
];
const GROOVES = [
  [1, 1, 1, 1, 1, 0, 1, 1],
  [1, 0, 1, 1, 1, 0, 1, 1],
  [1, 1, 0, 1, 1, 1, 0, 1],
];
// Six eighth notes, landing on the root before a full beat without an attack.
const ENDINGS = [[2, 4, 1, 2, 1, 0], [0, 2, 1, 3, 2, 0], [2, 1, 0, 1, 2, 0]];

export function generateNotes(sequence, cycle = 0) {
  if (!sequence.generator) return sequence.notes;
  const seed = sequence.generator.seed, arc = cycle % 4;
  const arrange = randomSource(seed + Math.imul(Math.floor(cycle / 4), 7919));
  const humanise = randomSource(seed ^ Math.imul(cycle + 1, 0x9e3779b1));
  // Decide a small vocabulary for this four-loop arc, rather than rerolling
  // every onset. A separate stream keeps phrasing independent of velocity.
  const answer = 1 + Math.floor(arrange() * 2);
  const development = 1 + Math.floor(arrange() * 2);
  const groove = arrange() < .6 ? 1 : 2;
  const ending = 1 + Math.floor(arrange() * 2);
  const harmony = arrange() < .5;
  const register = sequence.generator.register;
  const notes = [];

  const voice = pitch => {
    if (!register) return pitch;
    // Keep a stable voicing in the carved-out register, with no chance octave
    // jumps. The one optional upper-octave note is placed explicitly below.
    return register.low + ((pitch - register.low) % 12 + 12) % 12;
  };
  const add = (beat, degree, duration, level, lift = false) => {
    const chord = chordAt(sequence, beat);
    let pitch = voice(chord.pitches[degree % chord.pitches.length]);
    if (lift && register && pitch + 12 <= register.high) pitch += 12;
    const change = sequence.chords.find(c => c.beat > beat)?.beat ?? sequence.loopBeats;
    const note = { beat, pitch, duration: Math.min(duration, change - beat),
      velocity: (level + (humanise() - .5) * .04) * (lift ? .92 : 1) };
    notes.push(note);
    return note;
  };
  const phrase = (pattern, offset) => {
    for (let i = 0; i < pattern.length; i++) {
      const [beat, degree, duration] = pattern[i];
      add(offset + beat, degree, duration, i === 0 ? .68 : .62);
    }
  };

  // Keep the first question intact. The second phrase answers it, then hands
  // over to the same two-beat pickup the original melody used in bar four.
  phrase(QUESTION, 0);
  phrase(ANSWERS[arc === 1 ? answer : arc === 2 ? 3 : 0], 8);
  // One quiet, intentional harmony on the return; never random chord hits or
  // notes below the lead register competing with the backing pad and bass.
  if (arc === 3 && harmony) {
    const lead = notes[notes.length - 1];
    const below = chordAt(sequence, lead.beat).pitches.map(voice)
      .filter(p => lead.pitch - p >= 3 && lead.pitch - p <= 7);
    if (below.length) notes.push({ ...lead, pitch: Math.max(...below), velocity: lead.velocity * .4 });
  }
  for (let i = 0; i < 4; i++) {
    if (arc === 3 && i === 1) continue;
    add(14 + i * .5, [0, 2, 1, 3][i], .3, i % 2 ? .44 : .52);
  }

  const rhythm = GROOVES[arc === 1 || arc === 2 ? groove : 0];
  for (let bar = 0; bar < 3; bar++) {
    const shape = ARPS[(arc === 2 && bar > 0) || (arc === 1 && bar === 2) ? development : 0];
    for (let step = 0; step < 8; step++) {
      const lift = arc === 2 && bar === 2 && step === 1;
      if (!rhythm[step] && !lift) continue;
      const beat = 16 + bar * 4 + step * .5;
      add(beat, shape[step], rhythm[step + 1] === 0 ? .46 : .3,
        step % 4 === 0 ? .54 : step % 2 === 0 ? .49 : .44, lift);
    }
  }
  const cadence = ENDINGS[arc === 1 || arc === 2 ? ending : 0];
  for (let step = 0; step < cadence.length; step++) {
    // The return answers with two longer notes before its final resolution.
    if (arc === 3 && (step === 1 || step === 3)) continue;
    add(28 + step * .5, cadence[step], step === 5 ? .45 : arc === 3 ? .46 : .3,
      step === 0 || step === 5 ? .53 : .45);
  }
  return notes;
}

export async function loadSequence(url) {
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Sequence failed to load (${response.status})`);
  return validateSequence(await response.json());
}

// Enter at the next bar 1 or bar 4 of the eight-bar phrase. A fresh listen
// starts the backing at bar 1 and gets a three-bar musical lead-in.
export function nextRideEntry(sequence, songTime) {
  const beatSeconds = 60 / sequence.tempo;
  const cycle = Math.max(0, Math.floor(songTime / (sequence.loopBeats * beatSeconds)));
  for (const beat of [0, 12, sequence.loopBeats]) {
    if (beat > sequence.loopBeats) continue;
    const time = (cycle * sequence.loopBeats + beat) * beatSeconds;
    if (time > songTime + 1e-6) return time;
  }
  return ((cycle + 1) * sequence.loopBeats + Math.min(12, sequence.loopBeats)) * beatSeconds;
}

export function makeTimeline(sequence, sampleRate, startTime) {
  validateSequence(sequence);
  const beatSeconds = 60 / sequence.tempo;
  const timeline = {
    startFrame: Math.round(startTime * sampleRate),
    loopFrames: sequence.loopBeats * beatSeconds * sampleRate,
    events: [], sequence, sampleRate, beatSeconds,
    cycle: 0, index: 0, triggered: 0,
  };
  setEvents(timeline);
  return timeline;
}

// Resume a muted runner at its current song position without replaying all
// skipped notes. Audio and visual blocks share the same absolute loop index.
export function seekTimeline(sequence, sampleRate, startTime, fromFrame) {
  const timeline = makeTimeline(sequence, sampleRate, startTime);
  timeline.cycle = Math.max(0, Math.floor((fromFrame - timeline.startFrame) / timeline.loopFrames));
  setEvents(timeline);
  while (timeline.events.length && nextEventFrame(timeline) < fromFrame) advanceTimeline(timeline);
  // Seeking skips events; only notes actually rendered count as played.
  timeline.triggered = 0;
  return timeline;
}

function setEvents(timeline) {
  const unit = timeline.beatSeconds * timeline.sampleRate;
  timeline.events = generateNotes(timeline.sequence, timeline.cycle).map((note,index)=>({...note,index}))
    .sort((a, b) => a.beat - b.beat).map(note => ({
      index: note.index, frame: note.beat * unit, duration: note.duration * unit,
      frequency: 440 * 2 ** ((note.pitch - 69) / 12), velocity: note.velocity,
    }));
}

export function nextEventFrame(timeline) {
  const event = timeline.events[timeline.index];
  return event ? timeline.startFrame + Math.round(timeline.cycle * timeline.loopFrames + event.frame) : Infinity;
}

export function advanceTimeline(timeline) {
  timeline.triggered++;
  timeline.index++;
  if (timeline.index === timeline.events.length) {
    timeline.index = 0; timeline.cycle++;
    if (timeline.sequence.generator) setEvents(timeline);
  }
}
