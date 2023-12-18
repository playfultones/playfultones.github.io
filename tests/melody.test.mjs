import { validateSequence, generateNotes, chordAt, makeTimeline,
  nextEventFrame, advanceTimeline, seekTimeline } from '../scope/valley-sequence.js';
import { noteBlocks, safeLane } from '../scope/valley-runner.js';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const signature = notes => notes.map(n => `${n.beat}:${n.pitch}`).join(',');
const onsets = notes => [...new Set(notes.map(n => n.beat))];

export function checkMelody(source) {
  const results = [];
  const check = (name, fn) => { fn(); results.push(name); };
  const sequence = validateSequence(structuredClone(source));
  const original = JSON.stringify(sequence);
  const loops = Array.from({ length: 64 }, (_, cycle) => generateNotes(sequence, cycle));

  check('Authored notes bypass the generator without mutation', () => {
    const authored = { ...sequence, generator: undefined,
      notes: [{ beat: 1, pitch: 81, duration: 1, velocity: .6 }] };
    assert(generateNotes(authored, 12) === authored.notes, 'Authored notes changed');
  });
  check('Loops are reproducible when requested out of order', () => {
    for (const cycle of [63, 2, 17, 0, 32, 1, 63]) {
      assert(equal(generateNotes(sequence, cycle), loops[cycle]), `Unstable loop ${cycle}`);
    }
    assert(JSON.stringify(sequence) === original, 'Authoring data was mutated');
  });
  check('The opening question returns, while answers and grooves vary', () => {
    const question = signature(loops[0].filter(n => n.beat < 8));
    for (const notes of loops) {
      assert(signature(notes.filter(n => n.beat < 8)) === question, 'Opening hook drifted');
      const sparse = onsets(notes.filter(n => n.beat < 14)).length;
      const busy = onsets(notes.filter(n => n.beat >= 16)).length;
      assert(sparse >= 5 && sparse <= 9 && busy >= 20 && busy > sparse * 2, 'Lost the sparse/arp form');
      assert(notes.some(n => n.beat === 12.5) && notes.some(n => n.beat === 14), 'Bar-four entry or pickup missing');
    }
    assert(new Set(loops.map(signature)).size >= 8, 'Variation is only velocity, or repeats too soon');
    for (let cycle = 4; cycle < loops.length; cycle += 4) {
      assert(signature(loops[cycle]) === signature(loops[0]), 'Theme never comes home');
    }
  });
  check('Arp bars share a rhythmic motif and end with breathing room', () => {
    for (const notes of loops) {
      const rhythm = start => onsets(notes.filter(n => n.beat >= start && n.beat < start + 4))
        .map(beat => beat - start);
      assert(equal(rhythm(16), rhythm(20)), 'Successive bars lost their shared groove');
      assert(notes.every(n => n.beat < 31), 'No breath before the loop restart');
      const last = notes[notes.length - 1];
      assert(last.pitch % 12 === chordAt(sequence, last.beat).pitches[0] % 12, 'Cadence did not resolve');
    }
  });
  check('Chord, register, duration and playable-route bounds hold across seeds', () => {
    const seeds = [0, 1, -1, 42, 270926, 987654321];
    const cycles = [...Array(32).keys(), 1000000];
    for (const seed of seeds) for (const cycle of cycles) {
      const seq = { ...sequence, generator: { ...sequence.generator, seed } };
      const notes = generateNotes(seq, cycle), blocks = noteBlocks(seq, cycle);
      validateSequence({ ...seq, notes });
      const simultaneous = new Map();
      for (let i = 0; i < notes.length; i++) {
        const n = notes[i], block = blocks[i];
        const change = seq.chords.find(c => c.beat > n.beat)?.beat ?? seq.loopBeats;
        assert(i === 0 || n.beat >= notes[i - 1].beat, 'Notes out of order');
        assert(chordAt(seq, n.beat).pitches.some(p => p % 12 === n.pitch % 12), 'Off-chord note');
        assert(n.pitch >= seq.generator.register.low && n.pitch <= seq.generator.register.high, 'Out of register');
        assert(n.duration <= 1.1 && n.beat + n.duration <= change, 'Held across a chord change');
        assert(n.velocity > 0 && n.velocity <= .71, 'Unexpected accent level');
        simultaneous.set(n.beat, (simultaneous.get(n.beat) ?? 0) + 1);
        assert(simultaneous.get(n.beat) <= 2, 'More than a dyad at one onset');
        const absolute = cycle * seq.loopBeats + n.beat;
        for (let bar = Math.floor((absolute - 1) / 4); bar <= Math.floor((absolute + n.duration + 1) / 4); bar++) {
          assert(block.lane !== safeLane(bar, seed || 270926), 'The safe route is blocked');
        }
      }
    }
  });
  check('Narrow chords and transposed registers still produce finite notes', () => {
    for (const register of [{ low: 36, high: 47 }, { low: 76, high: 87 }, { low: 85, high: 96 }]) {
      const seq = { ...sequence, generator: { ...sequence.generator, register },
        chords: sequence.chords.map(c => ({ ...c, pitches: [60, 72] })) };
      for (let cycle = 0; cycle < 4; cycle++) {
        const notes = generateNotes(seq, cycle);
        validateSequence({ ...seq, notes });
        assert(notes.every(n => n.pitch >= register.low && n.pitch <= register.high), 'Voicing escaped bounds');
      }
    }
  });
  check('Visual note IDs and sample-accurate audio agree across loop seams', () => {
    for (const sr of [44100, 48000]) {
      const timeline = makeTimeline(sequence, sr, .12);
      for (let cycle = 0; cycle < 12; cycle++) {
        const blocks = noteBlocks(sequence, cycle);
        for (const block of blocks) {
          const event = timeline.events[timeline.index];
          assert(`${timeline.cycle}:${event.index}` === block.id, 'Block/voice IDs diverged');
          const expected = timeline.startFrame + Math.round(block.time * sr);
          assert(nextEventFrame(timeline) === expected, 'Note onset is not on its block');
          assert(Math.abs(event.frequency - 440 * 2 ** ((block.pitch - 69) / 12)) < 1e-8, 'Pitch mismatch');
          assert(Math.abs(event.duration / sr - (block.end - block.time)) < 1e-8, 'Duration mismatch');
          advanceTimeline(timeline);
        }
      }
      for (const beats of [0, 12, 31.9, 32, 64.1, 127.5]) {
        const from = Math.round((.12 + beats * 60 / sequence.tempo) * sr);
        const seek = seekTimeline(sequence, sr, .12, from);
        assert(nextEventFrame(seek) >= from && seek.triggered === 0, 'Seek replayed old notes');
      }
    }
  });
  return results;
}
