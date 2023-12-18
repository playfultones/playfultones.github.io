// The live instrument and offline mix check use this same small Web Audio graph.
// Loaded only after Listen. The backing keeps its own pad/bass/drum balance.
export const MIX = Object.freeze({ master: 0.8, voice: 0.68, drone: 0.85, backing: 0.72 });

export function prepareValleyBacking(context, decoded, sequence) {
  const seconds = sequence.loopBeats * 60 / sequence.tempo;
  if (Math.abs(decoded.duration - seconds) > 0.06) {
    throw new Error(`Backing length (${decoded.duration.toFixed(3)} s) does not match the ${sequence.loopBeats}-beat loop (${seconds.toFixed(3)} s).`);
  }
  // Resampling can round the musical length down by a fractional sample.
  // loopEnd gets clamped to buffer.duration unless a sample beyond it exists.
  // Extend from the loop's beginning so native fractional-sample interpolation
  // can wrap at the exact beat duration, without a cumulative clock mismatch.
  const frames = Math.ceil(seconds * decoded.sampleRate) + 1;
  if (decoded.length >= frames) return decoded;
  const buffer = context.createBuffer(decoded.numberOfChannels, frames, decoded.sampleRate);
  for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
    const source = decoded.getChannelData(ch), target = buffer.getChannelData(ch);
    target.set(source);
    for (let i = source.length; i < frames; i++) target[i] = source[(i - source.length) % source.length];
  }
  return buffer;
}

export function makeValleyMix(context, instrument, { sequence, backingBuffer, startTime }) {
  const master = context.createGain(); master.gain.value = 0;
  const voice = context.createGain(); voice.gain.value = sequence ? MIX.voice : MIX.drone;
  instrument.connect(voice).connect(master).connect(context.destination);
  const feedback = context.createGain(), wet = context.createGain();
  feedback.gain.value = 0.3; wet.gain.value = 0.34;
  wet.connect(master);
  const backingGain = context.createGain(); backingGain.gain.value = MIX.backing;
  backingGain.connect(master);
  const mix = { context, master, masterLevel: MIX.master, voice, wet, feedback,
    backing: null, backingGain, sequence,
    backingBuffer: backingBuffer && sequence ? prepareValleyBacking(context,backingBuffer,sequence) : null };
  resetValleyEcho(mix);
  restartValleyBacking(mix,startTime,0);
  return mix;
}

export function resetValleyEcho(mix) {
  if (mix.delay) { mix.voice.disconnect(mix.delay); mix.delay.disconnect(); mix.damp.disconnect(); mix.feedback.disconnect(); }
  const delay=mix.context.createDelay(1), damp=mix.context.createBiquadFilter();
  delay.delayTime.value=60/(mix.sequence?.tempo||155)*.75;
  damp.type='lowpass'; damp.frequency.value=1850;
  mix.voice.connect(delay).connect(damp).connect(mix.wet);
  damp.connect(mix.feedback).connect(delay);
  mix.delay=delay; mix.damp=damp;
}

export function restartValleyBacking(mix,startTime,songTime) {
  if (mix.backing) { mix.backing.stop(); mix.backing.disconnect(); }
  if (!mix.backingBuffer) return;
  const backing=mix.context.createBufferSource();
  backing.buffer=mix.backingBuffer; backing.loop=true;
  const seconds=mix.sequence.loopBeats*60/mix.sequence.tempo;
  backing.loopStart=0; backing.loopEnd=seconds;
  backing.connect(mix.backingGain);
  backing.start(startTime,((songTime%seconds)+seconds)%seconds);
  mix.backing=backing;
}

export function shapeValleyMix(mix, character) {
  const t = mix.master.context.currentTime;
  mix.wet.gain.setTargetAtTime(0.4 - character * 0.26, t, 0.06);
  mix.feedback.gain.setTargetAtTime(0.34 - character * 0.16, t, 0.06);
}
