import { makeTerrainMesh, PERIOD, valleyCenter, readTerrainCharacter } from './valley-terrain.js';
import { createActorRenderer } from './valley-actors.js';
import { CAR_DEPTH } from './valley-runner.js';

const skyVertex = `
attribute vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.9999, 1.0); }
`;

const skyFragment = `
precision highp float;
uniform vec2 uResolution;
uniform vec2 uLook;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float unit = min(uResolution.x, uResolution.y);
  vec2 p = (gl_FragCoord.xy - uResolution * 0.5) / unit;
  vec2 sun = vec2(-uLook.x * 1.5, 0.085 - uLook.y * 1.3);
  float r = 0.158;
  float d = length(p - sun);
  float horizon = 0.51 - uLook.y * 0.9;
  vec3 col = mix(vec3(0.063, 0.019, 0.10), vec3(0.021, 0.018, 0.063),
    smoothstep(horizon, 1.0, uv.y));
  col += vec3(0.28, 0.055, 0.10) * exp(-pow((uv.y - horizon) * 5.5, 2.0));
  col += vec3(0.29, 0.045, 0.068) * exp(-d * d * 14.0);
  col += vec3(0.13, 0.030, 0.016) * exp(-d * d * 55.0);
  float disk = 1.0 - smoothstep(r - 1.0 / unit, r + 1.0 / unit, d);
  float sy = (p.y - sun.y) / r;
  float stripe = smoothstep(0.12, 0.17, fract((sy + 1.0) * 7.0));
  stripe = mix(stripe, 1.0, smoothstep(-0.02, 0.10, sy));
  vec3 sunlight = mix(vec3(1.0, 0.16, 0.40), vec3(1.0, 0.79, 0.37),
    smoothstep(-0.8, 0.9, sy));
  col = mix(col, sunlight, disk * stripe);
  vec2 cell = floor(p * 100.0);
  vec2 local = fract(p * 100.0) - 0.5;
  float star = step(0.993, hash(cell)) * exp(-dot(local, local) * 110.0);
  col += vec3(0.46, 0.48, 0.72) * star * smoothstep(horizon + 0.08, 0.95, uv.y) * 0.45;
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

const terrainVertex = `
precision highp float;
attribute vec3 aPosition;
attribute vec2 aHeights;
attribute float aCharacter;
uniform float uOffset;
uniform float uAspect;
uniform vec3 uCamera;
uniform vec2 uLook;
varying vec3 vWorld;
varying float vDistance;
varying float vCharacter;
void main() {
  vec3 p = aPosition;
  p.y = mix(aHeights.x, aHeights.y, aCharacter);
  p.z += uOffset;
  vWorld = p;
  vCharacter = aCharacter;
  p.x -= uCamera.x;
  p.y -= uCamera.y;
  float cy = cos(uLook.x), sy = sin(uLook.x);
  float cp = cos(uLook.y), sp = sin(uLook.y);
  vec3 view = vec3(cy * p.x - sy * p.z, p.y, sy * p.x + cy * p.z);
  view.yz = vec2(cp * view.y - sp * view.z, sp * view.y + cp * view.z);
  vDistance = p.z;
  float f = 1.72;
  gl_Position = vec4(view.x * f / uAspect, view.y * f,
    1.00235 * view.z - 0.40047, view.z);
}
`;

const terrainFragment = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform float uDistance;
varying vec3 vWorld;
varying float vDistance;
varying float vCharacter;
void main() {
  if (vDistance < 0.25 || vDistance > 168.0) discard;
  vec2 coord = vec2(vWorld.x, vWorld.z + uDistance) * 0.5;
  vec2 deriv = max(fwidth(coord), vec2(0.0001));
  vec2 grid = abs(fract(coord - 0.5) - 0.5) / deriv;
  float lineDistance = min(grid.x, grid.y);
  float wire = 1.0 - smoothstep(0.45, 1.15, lineDistance);
  float halo = exp(-lineDistance * 0.7) * 0.15;
  float wall = smoothstep(0.15, 4.0, vWorld.y);
  vec3 normal = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  float light = abs(dot(normal, normalize(vec3(0.3, 1.0, 0.5))));
  vec3 face = mix(vec3(0.029, 0.015, 0.064), vec3(0.081, 0.024, 0.11), wall);
  face *= 0.6 + light * 0.4;
  vec3 softColor = mix(vec3(0.30, 0.19, 0.67), vec3(0.43, 0.35, 0.68), wall);
  vec3 sharpColor = mix(vec3(0.48, 0.12, 0.70), vec3(1.0, 0.12, 0.39), wall);
  vec3 neon = mix(softColor, sharpColor, vCharacter);
  vec3 col = face + neon * (wire * 0.74 + halo);
  float fog = 1.0 - exp(-pow(max(vDistance, 0.0) * 0.013, 1.6));
  vec3 mist = mix(vec3(0.22, 0.055, 0.16), vec3(0.31, 0.077, 0.15),
    exp(-vWorld.y * 0.18));
  col = mix(col, mist, fog);
  float edge = 1.0 - smoothstep(110.0, 168.0, vDistance);
  gl_FragColor = vec4(col, edge);
}
`;

function shader(gl, kind, source) {
  const result = gl.createShader(kind);
  gl.shaderSource(result, source);
  gl.compileShader(result);
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(result);
    gl.deleteShader(result);
    throw new Error(message);
  }
  return result;
}

function program(gl, vs, fs, names) {
  const p = gl.createProgram();
  const v = shader(gl, gl.VERTEX_SHADER, vs), f = shader(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  gl.deleteShader(v); gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const uniforms = Object.fromEntries(names.map(name => [name, gl.getUniformLocation(p, name)]));
  return { p, uniforms, position: gl.getAttribLocation(p, 'aPosition') };
}

export function createValleyRenderer(canvas, { mobile = false, carData } = {}) {
  const gl = canvas.getContext('webgl', {
    alpha: false, antialias: false, depth: true, stencil: false,
    preserveDrawingBuffer: false, powerPreference: 'low-power',
  });
  if (!gl || !gl.getExtension('OES_standard_derivatives')) throw new Error('WebGL is unavailable');
  const actors = carData ? createActorRenderer(gl,carData) : null;
  const sky = program(gl, skyVertex, skyFragment, ['uResolution', 'uLook']);
  const land = program(gl, terrainVertex, terrainFragment,
    ['uOffset', 'uAspect', 'uCamera', 'uLook', 'uDistance']);
  land.heights = gl.getAttribLocation(land.p, 'aHeights');
  land.character = gl.getAttribLocation(land.p, 'aCharacter');
  const triangle = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const mesh = makeTerrainMesh();
  const positions = gl.createBuffer(), heights = gl.createBuffer(), indices = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positions);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, heights);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.heights, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
  const characters = Array.from({ length: 2 }, () => {
    const buffer = gl.createBuffer(), data = new Float32Array(mesh.positions.length / 3);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    return { buffer, data, rows: new Float32Array(129).fill(NaN), tile: -1, version: -1 };
  });
  let width = 1, height = 1, scale = 1;
  let draws = 0, triangles = 0;
  const maxPixels = mobile ? 750000 : 1500000;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, mobile ? 1.35 : 1.5,
      Math.sqrt(maxPixels / Math.max(1, rect.width * rect.height))) * scale;
    width = Math.max(1, Math.round(rect.width * dpr));
    height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width; canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  function bindCharacter(tile, ride) {
    const c = characters[tile % 2];
    gl.bindBuffer(gl.ARRAY_BUFFER, c.buffer);
    if (c.tile !== tile) { c.rows.fill(NaN); c.tile = tile; c.version = -1; }
    if (c.version !== ride.version) {
      let first = 129, last = -1;
      for (let row = 0; row <= 128; row++) {
        const value = readTerrainCharacter(ride, tile * PERIOD + row * 2);
        if (!Number.isFinite(c.rows[row]) || Math.abs(c.rows[row] - value) > 0.00001) {
          c.rows[row] = value;
          c.data.fill(value, row * 65, (row + 1) * 65);
          first = Math.min(first, row); last = row;
        }
      }
      if (last >= first) gl.bufferSubData(gl.ARRAY_BUFFER, first * 65 * 4, c.data.subarray(first * 65, (last + 1) * 65));
      c.version = ride.version;
    }
    gl.enableVertexAttribArray(land.character);
    gl.vertexAttribPointer(land.character, 1, gl.FLOAT, false, 0, 0);
  }

  function draw({ distance, ride, runner }) {
    const rotation = 0, pitch = -0.025;
    const cameraX=valleyCenter(distance+CAR_DEPTH), cameraY=4.2;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(sky.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
    gl.enableVertexAttribArray(sky.position);
    gl.vertexAttribPointer(sky.position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(sky.uniforms.uResolution, width, height);
    gl.uniform2f(sky.uniforms.uLook, rotation, pitch);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(land.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, positions);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
    gl.enableVertexAttribArray(land.position);
    gl.vertexAttribPointer(land.position, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, heights);
    gl.enableVertexAttribArray(land.heights);
    gl.vertexAttribPointer(land.heights, 2, gl.FLOAT, false, 0, 0);
    const u = land.uniforms;
    gl.uniform1f(u.uAspect, width / height);
    gl.uniform3f(u.uCamera, cameraX, cameraY, 0);
    gl.uniform2f(u.uLook, rotation, pitch);
    gl.uniform1f(u.uDistance, distance);
    const offset = -(distance % PERIOD);
    // Submit only visible depth rows. Two tiles share the same static buffers;
    // usually only one draw is needed, with about 11k triangles in total.
    draws = 1; triangles = 0;
    for (const ahead of [1, 0]) {
      const tile = offset + ahead * PERIOD;
      const first = Math.max(0, Math.min(128, Math.floor(-tile / 2)));
      const last = Math.max(0, Math.min(128, Math.ceil((168 - tile) / 2)));
      const count = (last - first) * 64 * 6;
      if (count <= 0) continue;
      bindCharacter(Math.floor(distance / PERIOD) + ahead, ride);
      gl.uniform1f(u.uOffset, tile);
      gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, first * 64 * 6 * 2);
      draws++; triangles += count / 3;
    }
    if (actors && runner) {
      const info=actors.draw({runner,distance,aspect:width/height,
        cameraX,cameraY,pitch});
      draws+=info.draws; triangles+=info.triangles;
    }
  }

  resize();
  return {
    draw, resize,
    reduceQuality() { if (scale > 0.65) { scale *= 0.85; resize(); } },
    get info() { return { width, height, vertices: mesh.positions.length / 3,
      triangles, drawCalls: draws }; },
    destroy() {
      actors?.destroy();
      gl.deleteBuffer(triangle); gl.deleteBuffer(positions); gl.deleteBuffer(indices);
      gl.deleteBuffer(heights);
      for (const c of characters) gl.deleteBuffer(c.buffer);
      gl.deleteProgram(sky.p); gl.deleteProgram(land.p);
    },
  };
}
