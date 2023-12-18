import { TAU, SPEED, DEFAULT_CHARACTER, scanHeight } from './valley-terrain.js';
import { nextEventFrame, advanceTimeline } from './valley-sequence.js';

const TABLE_SIZE = 512;
const PROFILE_SIZE = 32;
const HARMONICS = 4;
const NOTES = [440, 523.251, 659.255, 987.767]; // A minor(add9), fallback drone
const sine = Float32Array.from({ length: TABLE_SIZE + 1 }, (_, i) => Math.sin(i / TABLE_SIZE * TAU));
const basis = Array.from({ length: HARMONICS }, (_, h) => ({
  sin: Float32Array.from({ length: TABLE_SIZE }, (_, i) => Math.sin((h + 1) * i / TABLE_SIZE * TAU)),
  cos: Float32Array.from({ length: TABLE_SIZE }, (_, i) => Math.cos((h + 1) * i / TABLE_SIZE * TAU)),
}));

function lookup(table, phase) {
  const f = phase * TABLE_SIZE, i = f | 0;
  return table[i] + (table[i + 1] - table[i]) * (f - i);
}

function biquad(type, frequency, q, sampleRate, gain = 0) {
  const w = TAU * frequency / sampleRate, c = Math.cos(w), alpha = Math.sin(w) / (2 * q);
  let b0, b1, b2, a0 = 1 + alpha, a1 = -2 * c, a2 = 1 - alpha;
  if (type === 'highpass') {
    b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0;
  } else if (type === 'lowpass') {
    b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0;
  } else {
    const a = 10 ** (gain / 40);
    b0 = 1 + alpha * a; b1 = -2 * c; b2 = 1 - alpha * a;
    a0 = 1 + alpha / a; a2 = 1 - alpha / a;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0,
    z1L: 0, z2L: 0, z1R: 0, z2R: 0 };
}

export function makeValleyState(sampleRate = 48000) {
  const st = {
    sampleRate, distance: 0, speed: SPEED,
    character: DEFAULT_CHARACTER, characterTarget: DEFAULT_CHARACTER,
    table: new Float32Array(TABLE_SIZE + 1), previous: new Float32Array(TABLE_SIZE + 1),
    profile: new Float32Array(PROFILE_SIZE),
    coefficients: new Float32Array(HARMONICS * 2),
    phaseL: new Float64Array([0, 0.17, 0.31, 0.53]),
    phaseR: new Float64Array([0.23, 0.43, 0.67, 0.83]),
    breathPhase: 0, updateIn: 0, blend: 1,
    // Broad body around the carved 800–1,000 Hz region. The fourth-order
    // Butterworth low-pass keeps the sharper voice's overtones below ~4 kHz.
    filters: [biquad('highpass', 520, 0.7071, sampleRate),
      biquad('peak', 900, 1.0, sampleRate, 3),
      biquad('lowpass', 3500, 0.541196, sampleRate),
      biquad('lowpass', 3500, 1.306563, sampleRate)],
    energy: 0, roughness: 0, pitchRatio: 1, gate: 1, envelope: 0,
    waveform: new Float32Array(64), waveAt: 0,
    notePulses: new Float64Array(18),
    envelopeLevel: 0, envelopePeak: 0,
    frame: 0, timeline: null,
    voices: Array.from({ length: 6 }, () => ({
      phaseL: 0, phaseR: 0, frequency: 0, velocity: 0, age: 0, duration: 0, envelope: 0,
      level: 0, release: 1, noteCycle: -1, noteIndex: -1, visualPeak: 0,
    })),
  };
  updateTerrainVoice(st);
  st.previous.set(st.table);
  return st;
}

export function updateTerrainVoice(st) {
  st.previous.set(st.table);
  let mean = 0, lo = Infinity, hi = -Infinity;
  for (let i = 0; i < PROFILE_SIZE; i++) {
    const h = scanHeight(i / PROFILE_SIZE, st.distance, st.character);
    st.profile[i] = h;
    mean += h / PROFILE_SIZE;
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  const scale = Math.max(hi - lo, 14);
  st.roughness = Math.min(1, (hi - lo) / 18);
  for (let h = 0; h < HARMONICS; h++) {
    let a = 0, b = 0;
    for (let i = 0; i < PROFILE_SIZE; i++) {
      const value = (st.profile[i] - mean) / scale;
      const k = i * TABLE_SIZE / PROFILE_SIZE;
      a += value * basis[h].sin[k];
      b += value * basis[h].cos[k];
    }
    // Give the terrain a much larger say in the spectrum, especially in the
    // second to fourth partials. Smooth terrain still has a clear fundamental.
    const strength = h === 0 ? 0.22 : (0.7 + st.character * 2.1) * (1 + h * 0.22);
    const gain = strength * 2 / PROFILE_SIZE;
    st.coefficients[2 * h] = a * gain;
    st.coefficients[2 * h + 1] = b * gain;
  }
  let peak = 0;
  for (let i = 0; i < TABLE_SIZE; i++) {
    let value = sine[i] * 0.66 + basis[1].sin[i] * 0.055;
    for (let h = 0; h < HARMONICS; h++) {
      value += st.coefficients[2 * h] * basis[h].sin[i]
        + st.coefficients[2 * h + 1] * basis[h].cos[i];
    }
    st.table[i] = value;
    peak = Math.max(peak, Math.abs(value));
  }
  const normalise = 0.72 / Math.max(0.85, peak);
  for (let i = 0; i < TABLE_SIZE; i++) st.table[i] *= normalise;
  st.table[TABLE_SIZE] = st.table[0];
  st.blend = 0;
}

// No allocations in the audio-rate loop. Terrain analysis runs at 20 Hz;
// the character slews at block rate and controls envelope times continuously.
export function renderValleyBlock(st, L, R, startFrame = st.frame) {
  const sr = st.sampleRate, dt = L.length / sr;
  const slew = 1 - Math.exp(-dt / 0.055);
  st.character += (st.characterTarget - st.character) * slew;
  if (st.updateIn <= 0) {
    updateTerrainVoice(st);
    st.updateIn += sr * 0.05;
  }
  st.updateIn -= L.length;
  const shape = st.character;
  const attackSeconds = 0.09 * (0.003 / 0.09) ** shape;
  const decaySeconds = 0.9 * (0.075 / 0.9) ** shape;
  const releaseSeconds = 0.42 * (0.045 / 0.42) ** shape;
  const voiceGain = 0.47 + shape * 0.27;
  const envK = 1 - Math.exp(-1 / (sr * 0.45));
  const noteDecay = Math.exp(-1 / (sr * decaySeconds));
  const noteRelease = Math.exp(-1 / (sr * releaseSeconds));
  let sum = 0;
  let next = st.timeline ? nextEventFrame(st.timeline) : Infinity;
  for (let n = 0; n < L.length; n++) {
    st.blend = Math.min(1, st.blend + 1 / (sr * 0.045));
    let l = 0, r = 0;
    let envelopeLevel = 0;
    if (st.timeline) {
      while (startFrame + n >= next) {
        const event = st.timeline.events[st.timeline.index];
        let voice = st.voices[0];
        for (const candidate of st.voices) if (candidate.envelope < voice.envelope) voice = candidate;
        voice.frequency = event.frequency; voice.velocity = event.velocity;
        voice.noteCycle=st.timeline.cycle; voice.noteIndex=event.index; voice.visualPeak=0;
        voice.envelope = 0.00001; voice.level = event.velocity; voice.release = 1;
        voice.phaseL = 0; voice.phaseR = 0.003;
        voice.age = 0; voice.duration = event.duration * (1.3 - shape * 0.85);
        advanceTimeline(st.timeline);
        next = nextEventFrame(st.timeline);
      }
      for (const voice of st.voices) {
        if (!voice.frequency) continue;
        const attack = Math.min(1, voice.age / (sr * attackSeconds));
        voice.envelope = attack * voice.level * voice.release;
        voice.visualPeak=Math.max(voice.visualPeak,voice.envelope*st.envelope);
        voice.level *= noteDecay;
        if (voice.age > voice.duration) voice.release *= noteRelease;
        envelopeLevel = Math.max(envelopeLevel, voice.envelope);
        if (voice.age > sr * 3) { voice.frequency = 0; voice.envelope = 0; continue; }
        const pl = voice.phaseL, pr = voice.phaseR;
        l += (lookup(st.previous, pl) * (1 - st.blend) + lookup(st.table, pl) * st.blend) * voice.envelope * voiceGain;
        r += (lookup(st.previous, pr) * (1 - st.blend) + lookup(st.table, pr) * st.blend) * voice.envelope * voiceGain;
        voice.phaseL = (pl + voice.frequency * 0.9993 / sr) % 1;
        voice.phaseR = (pr + voice.frequency * 1.0007 / sr) % 1;
        voice.age++;
      }
    } else for (let v = 0; v < NOTES.length; v++) {
      const pl = st.phaseL[v], pr = st.phaseR[v];
      const left = lookup(st.previous, pl) * (1 - st.blend) + lookup(st.table, pl) * st.blend;
      const right = lookup(st.previous, pr) * (1 - st.blend) + lookup(st.table, pr) * st.blend;
      const weight = v === 3 ? 0.12 : v === 0 ? 0.29 : 0.2;
      l += left * weight;
      r += right * weight;
      const step = NOTES[v] * st.pitchRatio / sr;
      st.phaseL[v] = (pl + step * (1 - 0.0009 * (v + 1))) % 1;
      st.phaseR[v] = (pr + step * (1 + 0.0009 * (v + 1))) % 1;
    }
    const breath = 0.88 + 0.12 * lookup(sine, st.breathPhase);
    st.breathPhase = (st.breathPhase + 0.13 / sr) % 1;
    l *= breath; r *= breath;
    for (const f of st.filters) {
      const nextL = f.b0 * l + f.z1L, nextR = f.b0 * r + f.z1R;
      f.z1L = f.b1 * l - f.a1 * nextL + f.z2L;
      f.z2L = f.b2 * l - f.a2 * nextL;
      f.z1R = f.b1 * r - f.a1 * nextR + f.z2R;
      f.z2R = f.b2 * r - f.a2 * nextR;
      l = nextL; r = nextR;
    }
    st.envelope += (st.gate - st.envelope) * envK;
    L[n] = l * st.envelope;
    R[n] = r * st.envelope;
    st.envelopeLevel = envelopeLevel * st.envelope;
    st.envelopePeak = Math.max(st.envelopePeak, st.envelopeLevel);
    sum += (L[n] * L[n] + R[n] * R[n]) * 0.5;
    if ((n & 3) === 0) {
      st.waveform[st.waveAt] = (L[n] + R[n]) * 0.5;
      st.waveAt = (st.waveAt + 1) % st.waveform.length;
    }
  }
  st.energy += (Math.sqrt(sum / L.length) - st.energy) * 0.12;
  st.distance += dt * st.speed;
  st.frame = startFrame + L.length;
}
