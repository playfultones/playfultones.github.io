import { makeValleyState, renderValleyBlock } from './valley-dsp.js';
import { seekTimeline } from './valley-sequence.js';
import { SPEED } from './valley-terrain.js';

class ValleySynth extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.state = makeValleyState(sampleRate);
    this.state.distance = options.processorOptions?.distance || 0;
    this.enabled = false;
    this.untilReport = 0;
    this.port.onmessage = ({ data: m }) => {
      if (m.type === 'position') {
        this.state.distance = m.distance;
        this.state.speed = m.moving ? SPEED : 0;
        if (Number.isFinite(m.character)) this.state.characterTarget = Math.max(0, Math.min(1, m.character));
      } else if (m.type === 'sequence') {
        this.enabled = true;
        this.state.timeline = seekTimeline(m.sequence, sampleRate, m.startTime,
          Math.max(currentFrame, Math.round((m.playFrom ?? m.startTime) * sampleRate)));
        for (const voice of this.state.voices) {
          voice.frequency=0; voice.envelope=0; voice.visualPeak=0; voice.noteCycle=-1; voice.noteIndex=-1;
        }
      } else if (m.type === 'noteOn') {
        this.enabled = true;
        this.state.pitchRatio = Math.max(0.25, Math.min(4, m.freq / 110));
        this.state.gate = Math.max(0, Math.min(1, m.vel));
        this.pitch = m.pitch;
      } else if (m.type === 'noteOff' && this.pitch === m.pitch) {
        this.state.gate = 0;
      } else if (m.type === 'drone') {
        this.enabled = true;
        this.state.gate = 1;
        this.state.pitchRatio = 1;
      } else if (m.type === 'silence') {
        this.enabled = false;
        // A stopped processor must not release an old filter tail when the
        // next entrance finishes. The delay graph is reset on audio resume.
        for (const filter of this.state.filters) filter.z1L = filter.z2L = filter.z1R = filter.z2R = 0;
      }
    };
  }

  process(inputs, outputs) {
    const [L, R] = outputs[0];
    if (!this.enabled) { L.fill(0); R.fill(0); return true; }
    renderValleyBlock(this.state, L, R, currentFrame);
    this.untilReport -= L.length;
    if (this.untilReport <= 0) {
      this.untilReport += sampleRate / 20;
      const st = this.state;
      for(let i=0;i<st.voices.length;i++) {
        const voice=st.voices[i];
        st.notePulses[i*3]=voice.noteCycle; st.notePulses[i*3+1]=voice.noteIndex;
        st.notePulses[i*3+2]=voice.visualPeak; voice.visualPeak=0;
      }
      this.port.postMessage({
        energy: st.energy, roughness: st.roughness, envelope: st.envelopePeak,
        character: st.character,
        triggered: st.timeline?.triggered || 0,
        notePulses: st.notePulses,
        waveform: st.waveform, waveAt: st.waveAt,
      });
      st.envelopePeak = 0;
    }
    return true;
  }
}

registerProcessor('valley-synth', ValleySynth);
