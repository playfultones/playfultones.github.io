import { createValleyRenderer } from './valley-renderer.js';
import { SPEED, READER_DEPTH, DEFAULT_CHARACTER, makeTerrainRide,
  paintTerrainAhead, readTerrainCharacter } from './valley-terrain.js';
import { loadSequence, nextRideEntry } from './valley-sequence.js';
import { makeRunner, setRunnerSequence, updateRunner, steerRunner, runnerCharacter,
  receiveNotePulses, MAX_STEER, LANE_WIDTH } from './valley-runner.js';
import { makeCarMotion, enterCar, advanceCar, parkCar, hideCar } from './valley-car-motion.js';

const $ = id => document.getElementById(id);
const hero = $('hero'), canvas = $('valley'), landscape = $('landscape');
const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const debug = new URLSearchParams(location.search).has('debug');
const frameInterval = 1000 / (mobile ? 30 : 60);
let paused = reducedMotion.matches, inView = true, contextLost = false;
let renderer = null, raf = 0, lastDraw = 0, lastSend = 0, lastStats = performance.now();
let frames = 0, slowFrames = 0, lastFrame = 0;
let distance = 0, clockAt = performance.now();
const terrainRide = makeTerrainRide(), runner = makeRunner();
const car = runner.carMotion = makeCarMotion();
let targetCharacter = DEFAULT_CHARACTER, pointer = null, lastX = 0, dragDistance = 0;
let audio = null, soundRequested = false, suspendTimer = 0, sequenceReady, audioUpdate = 0;
let rideState = 'idle', entryAt = Infinity, engaged = false;
let demoSong = 0, demoDistance = 0, pausedSong = 0, noteCount = 0, lastSteering;
const sequenceURL = new URL('./sequence.json', import.meta.url);
const carReady = fetch(new URL('./assets/valley-car.bin', import.meta.url)).then(response => {
  if (!response.ok) throw new Error('The car could not load.');
  return response.arrayBuffer();
}).then(buffer => new Float32Array(buffer));

const active = () => !document.hidden && inView && !contextLost;
const participating = () => rideState === 'entering' || rideState === 'armed' || rideState === 'playing';
const courseReady = () => rideState === 'armed' || rideState === 'playing';
const steeringEnabled = () => courseReady() && !paused;
const travelAt = now => distance + (active() && !paused ? (now - clockAt) / 1000 * SPEED : 0);
function anchor(now = performance.now()) { distance = travelAt(now); clockAt = now; }
function silentSongAt(now = performance.now()) { return demoSong + (travelAt(now) - demoDistance) / SPEED; }
function songTimeAt(now = performance.now()) {
  if (paused) return pausedSong;
  return audio?.synced && soundRequested ? audio.context.currentTime - audio.startTime : silentSongAt(now);
}
function rememberSong() {
  demoSong = Math.max(0, songTimeAt()); demoDistance = travelAt(performance.now());
  if (audio) audio.synced = false;
}
function syncParameters(now = performance.now()) {
  const d = travelAt(now), character = readTerrainCharacter(terrainRide, d + READER_DEPTH);
  audio?.worklet.port.postMessage({ type: 'position', distance: d, moving: !paused, character });
  if (audio) audio.shapeMix(audio, character);
  lastSend = now;
}
function rideUI() {
  const enabled = participating(), steerable = steeringEnabled();
  hero.dataset.ride = rideState;
  $('take-ride').disabled = !renderer || rideState === 'loading' || rideState === 'exiting';
  $('take-ride').setAttribute('aria-pressed', String(enabled));
  $('take-ride').setAttribute('aria-busy', String(rideState === 'loading' || rideState === 'exiting'));
  $('take-ride').setAttribute('aria-label', enabled ? 'End ride' : 'Take a ride');
  $('take-ride').title = enabled ? 'End ride' : '';
  $('sound').hidden = !enabled;
  $('sound').setAttribute('aria-pressed', String(!soundRequested));
  $('sound').setAttribute('aria-label', soundRequested ? 'Mute audio' : 'Unmute audio');
  $('sound').title = soundRequested ? 'Mute audio' : 'Unmute audio';
  $('steering-hint').hidden = !steerable || engaged;
  landscape.tabIndex = steerable ? 0 : -1;
  if (steerable) {
    landscape.setAttribute('role', 'slider');
    landscape.setAttribute('aria-label', 'Steer left or right. Arrow keys steer; Escape centers.');
    landscape.setAttribute('aria-valuemin', '-100'); landscape.setAttribute('aria-valuemax', '100');
  } else {
    for (const attr of ['role', 'aria-label', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext']) landscape.removeAttribute(attr);
    lastSteering = undefined;
  }
  motionUI();
}
function scheduleSequence(playFrom) {
  if (!courseReady()) audio.worklet.port.postMessage({ type: 'silence' });
  else if (audio.sequence) audio.worklet.port.postMessage({ type: 'sequence', sequence: audio.sequence,
    startTime: audio.startTime, playFrom: Math.max(playFrom, audio.startTime + entryAt) });
  else audio.worklet.port.postMessage({ type: 'drone' });
}
async function updateAudio() {
  if (!audio) return;
  clearTimeout(suspendTimer);
  const update = ++audioUpdate;
  const { context, master } = audio;
  // Suspension freezes the backing, voices, envelopes and delay lines on the
  // same audio clock. Preserve their state and gain automation on resume.
  if (paused || !active()) {
    await context.suspend();
    if (update !== audioUpdate) return;
    if (!soundRequested || !participating()) {
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setValueAtTime(0, context.currentTime); audio.gainOpen = false;
    }
    return;
  }
  if (soundRequested && participating() && active()) {
    await context.resume();
    if (update !== audioUpdate) return;
    if (!audio.synced) {
      const song = silentSongAt();
      const start = context.currentTime + .08, songAtStart = Math.max(0, song) + .08;
      audio.startTime = start - songAtStart;
      audio.resetEcho(audio); audio.restartBacking(audio, start, songAtStart);
      scheduleSequence(start); audio.synced = true;
    }
    syncParameters();
    if (!audio.gainOpen) {
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(audio.masterLevel, context.currentTime, .04);
      audio.gainOpen = true;
    }
  } else {
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(0, context.currentTime, .025);
    audio.gainOpen = false;
    suspendTimer = setTimeout(() => {
      if (!soundRequested || !participating() || paused || !active()) context.suspend().catch(console.error);
    }, 140);
  }
}
async function createAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('This browser does not support audio playback.');
  const context = new AudioContextClass({ latencyHint: 'interactive' });
  // Resume in the user gesture before any downloads, including on iOS.
  const resumed = context.resume();
  sequenceReady ||= loadSequence(sequenceURL);
  try {
    if (!context.audioWorklet) throw new Error('This browser does not support the instrument.');
    const [{ makeValleyMix, shapeValleyMix, restartValleyBacking, resetValleyEcho }] = await Promise.all([
      import('./valley-audio.js'), resumed,
      context.audioWorklet.addModule(new URL('./valley-processor.js', import.meta.url)),
    ]);
    const sequence = await sequenceReady;
    let backingBuffer = null;
    if (sequence?.backing) {
      const response = await fetch(new URL(sequence.backing, sequenceURL));
      if (!response.ok) throw new Error(`Backing track failed to load (${response.status}).`);
      backingBuffer = await context.decodeAudioData(await response.arrayBuffer());
    }
    const worklet = new AudioWorkletNode(context, 'valley-synth', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
      processorOptions: { distance: travelAt(performance.now()) },
    });
    const startTime = context.currentTime + .12;
    const mix = makeValleyMix(context, worklet, { sequence, backingBuffer, startTime });
    worklet.port.onmessage = ({ data }) => {
      if (!soundRequested || !active() || !steeringEnabled()) return;
      noteCount = data.triggered;
      if (rideState === 'playing') receiveNotePulses(runner, data.notePulses);
    };
    worklet.onprocessorerror = () => { stopRide(); $('status').textContent = 'Audio stopped. Reload to try again.'; };
    context.onstatechange = () => { hero.dataset.audio = context.state; };
    hero.dataset.audio = context.state;
    return { context, worklet, sequence, startTime, ...mix, shapeMix: shapeValleyMix,
      restartBacking: restartValleyBacking, resetEcho: resetValleyEcho, synced: true, gainOpen: false };
  } catch (error) { await context.close(); sequenceReady = null; throw error; }
}
function armCourse(time) {
  // Choose the musical entry only after the car arrives. A paused entrance
  // freezes the backing and camera together.
  entryAt = audio.sequence ? nextRideEntry(audio.sequence, Math.max(0, time) + .08) : time;
  rideState = 'armed';
  setRunnerSequence(runner, audio.sequence, time, entryAt);
  scheduleSequence(audio.context.currentTime); rideUI();
}
function beginCourse() {
  // The blocks are already approaching. Keep their identities and positions
  // intact when the lead starts, and grant grace at the musical entry.
  rideState = 'playing'; runner.mode = 'welcome';
  runner.protectedUntil = runner.age + 2.4; rideUI();
}
function stopRide() {
  if (pointer !== null && landscape.hasPointerCapture(pointer)) landscape.releasePointerCapture(pointer);
  pointer = null;
  parkCar(car, travelAt(performance.now()), runner);
  rememberSong(); soundRequested = false; entryAt = Infinity;
  // Let the existing master fade finish before the context suspends. The next
  // entrance silences and clears the synth before audio is brought back up.
  if (paused || reducedMotion.matches) hideCar(car);
  rideState = car.visible ? 'exiting' : 'idle';
  setRunnerSequence(runner, null, demoSong); runner.targetX = 0;
  rideUI(); updateAudio().catch(console.error);
  if (reducedMotion.matches) setPaused(true);
  schedule();
}
$('take-ride').addEventListener('click', async () => {
  if (participating()) { stopRide(); return; }
  if (rideState === 'loading' || rideState === 'exiting') return;
  const button = $('take-ride'); button.disabled = true; $('status').textContent = '';
  rideState = 'loading'; rideUI();
  try {
    soundRequested = true;
    if (!audio) {
      audio = await createAudio();
      demoSong = pausedSong = 0; demoDistance = travelAt(performance.now());
    }
    entryAt = Infinity; noteCount = 0; rideState = 'entering';
    runner.x = runner.targetX = runner.lean = 0;
    if (paused) setPaused(false);
    enterCar(car, travelAt(performance.now()), 4 * 60 / (audio.sequence?.tempo || 155));
    rideUI();
    scheduleSequence(audio.context.currentTime);
    await updateAudio(); schedule();
  } catch (error) {
    stopRide();
    $('status').textContent = `Audio could not start. ${error.message}`; console.error(error);
  } finally { rideUI(); }
});
$('sound').addEventListener('click', async () => {
  if (!participating() || !audio) return;
  const button = $('sound'); button.disabled = true;
  if (soundRequested) rememberSong();
  soundRequested = !soundRequested; rideUI();
  try { await updateAudio(); }
  catch (error) { soundRequested = false; rideUI(); $('status').textContent = 'Audio could not resume.'; console.error(error); }
  finally { button.disabled = false; }
});
function motionUI() {
  const label = `${paused ? 'Resume' : 'Pause'} ${participating() ? 'ride' : 'animation'}`;
  $('motion').setAttribute('aria-pressed', String(paused));
  $('motion').setAttribute('aria-label', label);
  $('motion').title = label;
  hero.dataset.motion = paused ? 'paused' : 'running';
}
function setPaused(value) {
  if (paused === value) return;
  const song = songTimeAt(); anchor(); paused = value;
  cancelAnimationFrame(raf); raf = 0; lastDraw = performance.now(); lastFrame = 0;
  advanceCar(car, distance, runner);
  if (paused) {
    pausedSong = song;
    if (pointer !== null && landscape.hasPointerCapture(pointer)) landscape.releasePointerCapture(pointer);
    pointer = null;
  } else {
    demoSong = pausedSong; demoDistance = distance;
  }
  rideUI(); syncParameters();
  updateAudio().catch(error => { soundRequested = false; rideUI(); $('status').textContent = 'Audio could not resume.'; console.error(error); });
  drawOnce(); schedule();
}
$('motion').addEventListener('click', () => setPaused(!paused));
reducedMotion.addEventListener('change', event => setPaused(event.matches));
motionUI(); rideUI();
function steer(delta, intentional = true) {
  if (!steeringEnabled()) return;
  steerRunner(runner, delta);
  if (intentional && delta && !engaged) { engaged = true; rideUI(); }
  shapeUI(); schedule();
}
function shapeUI() {
  targetCharacter = runnerCharacter(runner);
  if (!steeringEnabled()) return;
  const steering = Math.round(runner.targetX / MAX_STEER * 100);
  if (lastSteering !== steering) {
    lastSteering = steering; landscape.setAttribute('aria-valuenow', String(steering));
    landscape.setAttribute('aria-valuetext', steering < -30 ? 'Left lane' : steering > 30 ? 'Right lane' : 'Center lane');
  }
}
landscape.addEventListener('pointerdown', event => {
  if (!steeringEnabled() || !renderer || (event.pointerType === 'mouse' && event.button !== 0)) return;
  pointer = event.pointerId; lastX = event.clientX; dragDistance = 0; landscape.setPointerCapture(pointer);
});
landscape.addEventListener('pointermove', event => {
  if (event.pointerId !== pointer) return;
  const delta = event.clientX - lastX; dragDistance += Math.abs(delta);
  steer(delta / Math.min(650, Math.max(260, landscape.clientWidth)) * 2.4 * MAX_STEER * 2, dragDistance >= 12);
  lastX = event.clientX;
});
const release = () => { pointer = null; };
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) landscape.addEventListener(event, release);
landscape.addEventListener('keydown', event => {
  if (!steeringEnabled()) return;
  const keys = { ArrowLeft: -LANE_WIDTH, ArrowRight: LANE_WIDTH, Home: -MAX_STEER * 2, End: MAX_STEER * 2 };
  if (keys[event.key]) { event.preventDefault(); steer(keys[event.key]); }
  if (event.key === 'Escape') steer(-runner.targetX);
});
function drawOnce(now = performance.now()) {
  if (renderer && active()) renderer.draw({ distance: travelAt(now), ride: terrainRide, runner });
}
function schedule() { if (!raf && renderer && active() && !paused) raf = requestAnimationFrame(frame); }
function frame(now) {
  raf = 0;
  if (!active() || !renderer || paused) return;
  if (now - lastDraw < frameInterval - 1) { schedule(); return; }
  const dt = Math.min(.1, (now - lastDraw) / 1000 || .016), time = songTimeAt(now);
  advanceCar(car, travelAt(now), runner);
  if (rideState === 'entering' && car.phase === 'driving') armCourse(time);
  if (rideState === 'exiting' && !car.visible) { rideState = 'idle'; rideUI(); }
  if (rideState === 'armed' && time >= entryAt) beginCourse();
  updateRunner(runner, time, dt);
  if (car.phase === 'driving') { car.x = runner.x; car.lean = runner.lean; }
  if (rideState !== 'playing') runner.collider = false;
  shapeUI();
  paintTerrainAhead(terrainRide, travelAt(now), targetCharacter, dt);
  drawOnce(now);
  if (audio && soundRequested && now - lastSend > 30) syncParameters(now);
  if (lastFrame && now - lastFrame > frameInterval * 1.65) slowFrames++;
  lastFrame = now; lastDraw = now; frames++;
  if (now - lastStats > 3000) {
    if (slowFrames > frames * .25 && frames > 15) renderer.reduceQuality();
    frames = 0; slowFrames = 0; lastStats = now;
  }
  schedule();
}
function visibilityChanged() {
  hero.dataset.visible = String(active());
  clockAt = performance.now(); lastDraw = clockAt; lastFrame = 0;
  if (!active()) { cancelAnimationFrame(raf); raf = 0; }
  else { drawOnce(); schedule(); }
  updateAudio().catch(error => { soundRequested = false; rideUI(); console.error(error); });
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && inView && !paused) distance += (performance.now() - clockAt) / 1000 * SPEED;
  visibilityChanged();
});
new IntersectionObserver(([entry]) => {
  anchor(); inView = entry.isIntersecting; visibilityChanged();
}, { threshold: .05 }).observe(hero);
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault(); anchor(); contextLost = true; hero.dataset.ready = 'false';
  $('take-ride').disabled = true; visibilityChanged();
});
canvas.addEventListener('webglcontextrestored', () => { contextLost = false; initRenderer(); visibilityChanged(); });
window.addEventListener('pagehide', () => { audio?.context.suspend(); cancelAnimationFrame(raf); raf = 0; });
window.addEventListener('pageshow', visibilityChanged);
async function initRenderer() {
  try {
    const carData = await carReady;
    renderer?.destroy(); renderer = createValleyRenderer(canvas, { mobile, carData });
    rideUI(); $('motion').disabled = false;
    hero.dataset.ready = 'true'; drawOnce(); schedule();
  } catch (error) {
    renderer = null; hero.dataset.ready = 'false'; $('motion').disabled = true; $('take-ride').disabled = true;
    $('take-ride').title = 'Interactive view unavailable in this browser'; console.warn('Static landscape fallback:', error);
  }
}
new ResizeObserver(() => { renderer?.resize(); drawOnce(); }).observe(hero);
if (debug) window.__valleyRunner = {
  snapshot: () => ({ x: runner.x, target: runner.targetX, mode: runner.mode, collider: runner.collider,
    hits: runner.hits, time: runner.time, noteCount, rideState, entryAt, engaged, distance: travelAt(performance.now()),
    paused, age: runner.age, protectedUntil: runner.protectedUntil,
    audio: audio && { state: audio.context.state, time: audio.context.currentTime, startTime: audio.startTime },
    blocks: runner.blocks.length, visible: active(), info: renderer?.info,
    car: { phase: car.phase, visible: car.visible, depth: car.depth, x: car.x, lean: car.lean, stoppedAt: car.stoppedAt },
    steeringEnabled: steeringEnabled(),
    sounding: runner.blocks.filter(b => b.pulse > .1).map(b => ({ id: b.id, time: b.time, pulse: b.pulse })),
    next: runner.blocks.filter(b => b.time > runner.time).slice(0, 16).map(b => ({ time: b.time, lane: b.lane, pitch: b.pitch })) }),
  steer: value => steer(Math.max(-MAX_STEER, Math.min(MAX_STEER, value)) - runner.targetX),
};
// The idle flight draws only terrain. Music loads on demand; the tiny car mesh
// is ready for its entrance, but submits no car or shadow draws before opt-in.
requestAnimationFrame(() => requestAnimationFrame(initRenderer));
