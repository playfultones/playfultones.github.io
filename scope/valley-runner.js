import { generateNotes } from './valley-sequence.js';
import { SPEED, READER_DEPTH } from './valley-terrain.js';

export const CAR_DEPTH = READER_DEPTH;
export const LANE_WIDTH = 2.6;
export const MAX_STEER = LANE_WIDTH;
export const LOOK_AHEAD = 7.5;
export const HIT_WINDOW = 0.14;
export const HIT_WIDTH = 1.03;

function hash(n) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

// A gentle, adjacent-lane route: center, side, side, center. The side varies
// every four bars, while every note still gets its own obstacle and onset.
export function safeLane(bar, seed) {
  const quarter = ((bar % 4) + 4) % 4;
  return quarter === 0 || quarter === 3 ? 0 : hash(Math.floor(bar / 4) + seed) < 0.5 ? -1 : 1;
}

// Blocks sounding together sit side by side in one lane, lower pitch on the
// left. The offset keeps even fully pulsed blocks (1.12x wide) from touching.
export const PAIR_OFFSET = 0.64;

export function noteBlocks(sequence, cycle) {
  const seed = sequence.generator?.seed || 270926, beatSeconds = 60 / sequence.tempo;
  let previous = null;
  return generateNotes(sequence, cycle).map((note, index) => {
    const absoluteBeat = cycle * sequence.loopBeats + note.beat;
    // A block is as long as its note: the front face crosses the car on note-on.
    const time = absoluteBeat * beatSeconds, end = time + note.duration * beatSeconds;
    if (previous?.time === time) {
      const low = note.pitch < previous.pitch ? -1 : 1;
      previous.x = previous.lane * LANE_WIDTH - low * PAIR_OFFSET;
      return { id: `${cycle}:${index}`, time, end, lane: previous.lane, x: previous.lane * LANE_WIDTH + low * PAIR_OFFSET,
        pitch: note.pitch, velocity: note.velocity, pulse: 0, hit: false, passed: false };
    }
    // Keep the route's safe lane clear for the whole note, plus a full beat on
    // either side, so a held note never walls off a route change.
    const protectedLanes = [];
    for (let bar = Math.floor((absoluteBeat - 1) / 4); bar <= Math.floor((absoluteBeat + note.duration + 1) / 4); bar++) {
      protectedLanes.push(safeLane(bar, seed));
    }
    const lanes = [-1, 0, 1].filter(lane => !protectedLanes.includes(lane));
    if (!lanes.length) throw new Error(`Note ${cycle}:${index} spans too many route changes to place`);
    const lane = lanes[Math.floor(hash(seed + cycle * 4099 + index * 37) * lanes.length)];
    return previous = { id: `${cycle}:${index}`, time, end, lane, x: lane * LANE_WIDTH,
      pitch: note.pitch, velocity: note.velocity, pulse: 0, hit: false, passed: false };
  });
}

export function makeRunner(sequence = null) {
  return { sequence, cache: new Map(), cycle: -1, blocks: [], fromTime: -Infinity, time: 0, previousTime: 0,
    x: 0, targetX: 0, lean: 0, age: 0, mode: 'welcome', protectedUntil: 2.4,
    hits: 0, passed: 0, flash: 0, collider: false };
}

export function setRunnerSequence(runner, sequence, time = 0, fromTime = -Infinity) {
  runner.sequence = sequence; runner.cache.clear(); runner.cycle = -1;
  runner.fromTime = fromTime;
  runner.blocks = []; runner.time = runner.previousTime = time;
  runner.mode = 'welcome'; runner.protectedUntil = runner.age + 2.4; runner.collider = false;
}

export function steerRunner(runner, delta) {
  if (runner.mode === 'rejoining') return;
  runner.targetX = Math.max(-MAX_STEER, Math.min(MAX_STEER, runner.targetX + delta));
}

export function runnerCharacter(runner) {
  const x = runner.x / MAX_STEER;
  return x < 0 ? 0.32 * (1 + x) : 0.32 + x * 0.68;
}

export function canRejoin(runner, x = 0) {
  return !runner.blocks.some(b => b.end > runner.time - HIT_WINDOW
    && b.time < runner.time + 0.9 && Math.abs(b.x - x) < HIT_WIDTH + 0.25);
}

// Six compact per-voice reports from the worklet, keyed to the same loop/note
// IDs as the course. Peak holding preserves even a 3 ms stab on a 30 fps phone.
export function receiveNotePulses(runner, pulses) {
  if (!pulses) return;
  for (let i=0;i<pulses.length;i+=3) {
    if (pulses[i]<0 || pulses[i+2]<=0) continue;
    const id=`${pulses[i]}:${pulses[i+1]}`;
    const block=runner.blocks.find(b=>b.id===id);
    if (block) block.pulse=Math.max(block.pulse||0,Math.min(1,pulses[i+2]*1.6));
  }
}

function refreshBlocks(runner) {
  if (!runner.sequence) return;
  const seconds = runner.sequence.loopBeats * 60 / runner.sequence.tempo;
  const cycle = Math.max(0, Math.floor(runner.time / seconds));
  if (cycle === runner.cycle) return;
  runner.cycle = cycle;
  for (const key of runner.cache.keys()) if (key < cycle - 1 || key > cycle + 1) runner.cache.delete(key);
  for (let c = Math.max(0, cycle - 1); c <= cycle + 1; c++) {
    if (!runner.cache.has(c)) runner.cache.set(c, noteBlocks(runner.sequence, c));
  }
  runner.blocks = [...runner.cache.values()].flat().filter(block => block.time >= runner.fromTime);
}

export function updateRunner(runner, time, dt, moving = true) {
  const previousX = runner.x;
  runner.time = time;
  refreshBlocks(runner);
  if (moving) runner.age += dt;
  if (runner.mode === 'ghost' && runner.age >= runner.protectedUntil) runner.mode = 'rejoining';
  if (runner.mode === 'rejoining') runner.targetX = 0;
  const response = runner.mode === 'rejoining' ? 0.2 : 0.075;
  const step = (runner.targetX - runner.x) * (1 - Math.exp(-dt / response));
  runner.x += Math.max(-9 * dt, Math.min(9 * dt, step));
  if (Math.abs(runner.targetX - runner.x) < 0.0001) runner.x = runner.targetX;
  runner.lean += ((runner.x - previousX) / Math.max(dt, 0.001) * 0.02 - runner.lean) * (1 - Math.exp(-dt / 0.1));
  if (moving && runner.mode === 'welcome' && runner.age >= runner.protectedUntil && canRejoin(runner, runner.x)) runner.mode = 'cruise';
  if (moving && runner.mode === 'rejoining' && Math.abs(runner.x) < 0.035 && canRejoin(runner)) {
    runner.x = runner.targetX = 0; runner.mode = 'cruise';
  }
  runner.collider = runner.mode === 'cruise';
  const pulseDecay=Math.exp(-dt/.10);
  if (moving) for (const block of runner.blocks) {
    block.pulse=(block.pulse||0)*pulseDecay;
    // The onset accent happens at the car, even in the silent preview. While
    // listening, the real voice envelope sustains the note's glow afterward.
    if (block.time>=runner.previousTime && block.time<=time) block.pulse=1;
    if (block.end < time - HIT_WINDOW && !block.passed) {
      block.passed = true;
      if (!block.hit && block.end >= runner.previousTime - HIT_WINDOW && runner.collider) runner.passed++;
    }
    // The whole length of a block is solid, not just its front face.
    if (!runner.collider || block.hit || block.passed || block.end < runner.previousTime - HIT_WINDOW || block.time > time + HIT_WINDOW) continue;
    const bx = block.x;
    if (bx >= Math.min(previousX, runner.x) - HIT_WIDTH && bx <= Math.max(previousX, runner.x) + HIT_WIDTH) {
      block.hit = true; runner.hits++; runner.mode = 'ghost'; runner.collider = false;
      runner.protectedUntil = runner.age + 2.2;
    }
  }
  // Collision feedback pulses only the car, at two cycles per second.
  runner.flash = runner.mode === 'ghost' ? (Math.sin(runner.age * Math.PI * 4) + 1) * 0.5 : 0;
  runner.previousTime = time;
  return Math.abs(runner.targetX - runner.x) > 0.0001 || Math.abs(runner.lean) > 0.0001;
}

export function blockDepth(block, time) { return CAR_DEPTH + (block.time - time) * SPEED; }
