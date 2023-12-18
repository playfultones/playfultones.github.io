// Shared by the mesh builder and the audio worklet. Distances are world units.
// Integer longitudinal frequencies make the strip join without a height seam.
export const PERIOD = 256;
export const SPEED = 7.2;
export const TAU = Math.PI * 2;
// The car is the playhead: terrain scanning and note onsets share this plane.
export const READER_DEPTH = 18;
export const DEFAULT_CHARACTER = 0.32;
export const ROW_STEP = 2;

export function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function valleyCenter(z) {
  return 1.7 * Math.sin(z * TAU / PERIOD * 2) + 0.6 * Math.sin(z * TAU / PERIOD * 5);
}

// Endpoints are precomputed once for every mesh vertex. Painting changes only
// one small character attribute; the GPU mixes smooth and sharp heights.
export function terrainHeight(x, z, character = DEFAULT_CHARACTER) {
  const t = z * TAU / PERIOD;
  const side = x - valleyCenter(z);
  const width = 5.2 + 0.8 * Math.sin(t * 3 + 0.4);
  const softWall = smoothstep(width, width + 18, Math.abs(side));
  const soft = softWall * (9 + 3.0 * Math.sin(t * 2 + x * 0.085)
    + 1.7 * Math.sin(t * 4 - x * 0.13));
  const sharpWall = smoothstep(width, width + 7, Math.abs(side));
  // Piecewise-linear ridges create pointed summits, rather than taller sines.
  const ridge = v => 1 - Math.abs(2 * (v - Math.floor(v)) - 1);
  const peaks = 5 + 13 * ridge(z / PERIOD * 9 + x * 0.085)
    + 5 * ridge(z / PERIOD * 19 - x * 0.13);
  const sharp = sharpWall * peaks;
  return soft + (sharp - soft) * Math.max(0, Math.min(1, character));
}

// One transverse gridline, retraced sinusoidally to make a closed oscillator.
// The car sits in this exact world-z plane; notes pulse as they cross it.
export function scanHeight(phase, distance, character = DEFAULT_CHARACTER) {
  const z = distance + READER_DEPTH;
  const x = valleyCenter(z) + Math.sin(phase * TAU) * 23;
  return terrainHeight(x, z, character);
}

// A bounded rolling history: 1,024 world units (~142 seconds). Samples behind
// the playhead are frozen; only future rows can be painted. Absolute row tags
// prevent the repeating geometry from repeating the user's old brush strokes.
export function makeTerrainRide(character = DEFAULT_CHARACTER) {
  return { values: new Float32Array(512).fill(character),
    tags: new Float64Array(512).fill(-Infinity), initial: character, version: 0 };
}

function rowValue(ride, row) {
  const slot = ((row % ride.values.length) + ride.values.length) % ride.values.length;
  return ride.tags[slot] === row ? ride.values[slot] : ride.initial;
}

export function readTerrainCharacter(ride, z) {
  const p = z / ROW_STEP, row = Math.floor(p), t = p - row;
  return rowValue(ride, row) * (1 - t) + rowValue(ride, row + 1) * t;
}

export function paintTerrainAhead(ride, distance, target, dt) {
  const reader = distance + READER_DEPTH;
  const first = Math.floor(reader / ROW_STEP);
  const last = Math.ceil((reader + PERIOD * 2) / ROW_STEP);
  const amount = 1 - Math.exp(-Math.min(0.1, dt) / 0.13);
  const value = Math.max(0, Math.min(1, target));
  let changed = false;
  for (let row = first; row <= last; row++) {
    const slot = row % ride.values.length;
    if (ride.tags[slot] !== row) {
      ride.tags[slot] = row;
      ride.values[slot] = value;
      changed = true;
    } else {
      const before = ride.values[slot];
      const next = Math.fround(Math.abs(value - before) < 0.00002
        ? value : before + (value - before) * amount);
      if (next !== before) { ride.values[slot] = next; changed = true; }
    }
  }
  if (changed) ride.version++;
  return changed;
}

export function makeTerrainMesh(columns = 64, rows = 128) {
  const stride = columns + 1;
  const positions = new Float32Array(stride * (rows + 1) * 3);
  const heights = new Float32Array(stride * (rows + 1) * 2);
  const indices = new Uint16Array(columns * rows * 6);
  for (let r = 0; r <= rows; r++) {
    const z = r / rows * PERIOD;
    for (let c = 0; c <= columns; c++) {
      const x = (c / columns * 2 - 1) * 64;
      const i = (r * stride + c) * 3;
      positions[i] = x;
      positions[i + 1] = terrainHeight(x, z);
      positions[i + 2] = z;
      const h = (r * stride + c) * 2;
      heights[h] = terrainHeight(x, z, 0);
      heights[h + 1] = terrainHeight(x, z, 1);
    }
  }
  let i = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    const a = r * stride + c, b = a + stride;
    indices.set([a, b, a + 1, a + 1, b, b + 1], i);
    i += 6;
  }
  return { positions, heights, indices };
}
