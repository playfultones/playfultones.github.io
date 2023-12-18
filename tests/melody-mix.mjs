import { generateNotes, makeTimeline } from '../scope/valley-sequence.js';
import { makeValleyState, renderValleyBlock } from '../scope/valley-dsp.js';
import { makeValleyMix, shapeValleyMix } from '../scope/valley-audio.js';

// Offline only: exercise the real synth, backing and effects across the entire
// four-loop arc without connecting anything to the speakers or running the game.
export async function auditMelodyMix(sequence, character = .32, generate = generateNotes) {
  const sampleRate = 44100, loops = 4;
  const seconds = loops * sequence.loopBeats * 60 / sequence.tempo;
  const context = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const url = new URL(sequence.backing, new URL('../scope/sequence.json', import.meta.url));
  const response = await fetch(url);
  if (!response.ok) throw new Error('Missing backing');
  const backingBuffer = await context.decodeAudioData(await response.arrayBuffer());
  const notes = Array.from({ length: loops }, (_, cycle) => generate(sequence, cycle)
    .map(n => ({ ...n, beat: n.beat + cycle * sequence.loopBeats }))).flat();
  const state = makeValleyState(sampleRate);
  state.character = state.characterTarget = character;
  state.envelope = 1;
  state.timeline = makeTimeline({ ...sequence, generator: undefined,
    loopBeats: loops * sequence.loopBeats, notes }, sampleRate, 0);
  const voiceBuffer = context.createBuffer(2, context.length, sampleRate);
  const left = voiceBuffer.getChannelData(0), right = voiceBuffer.getChannelData(1);
  for (let at = 0; at < context.length; at += 128) {
    renderValleyBlock(state, left.subarray(at, at + 128), right.subarray(at, at + 128));
  }
  const instrument = context.createBufferSource(); instrument.buffer = voiceBuffer;
  const mix = makeValleyMix(context, instrument, { sequence, backingBuffer, startTime: 0 });
  mix.master.gain.value = mix.masterLevel;
  shapeValleyMix(mix, character);
  instrument.start(0);
  const buffer = await context.startRendering();
  const measure = audio => {
    let peak = 0, energy = 0, clipped = 0;
    for (let ch = 0; ch < audio.numberOfChannels; ch++) {
      const samples = audio.getChannelData(ch);
      for (const sample of samples) {
        if (!Number.isFinite(sample)) throw new Error('Non-finite audio sample');
        peak = Math.max(peak, Math.abs(sample)); energy += sample * sample;
        if (Math.abs(sample) >= 1) clipped++;
      }
    }
    return { peakDBFS: 20 * Math.log10(peak),
      rmsDBFS: 10 * Math.log10(energy / (audio.length * audio.numberOfChannels)), clipped };
  };
  return { buffer, report: { character, notes: notes.length,
    lead: measure(voiceBuffer), mix: measure(buffer) } };
}
