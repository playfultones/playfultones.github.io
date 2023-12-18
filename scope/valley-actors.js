import { CAR_DEPTH, LOOK_AHEAD, blockDepth } from './valley-runner.js';
import { valleyCenter, SPEED } from './valley-terrain.js';

const vertex = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec3 aColor;
attribute float aGlow;
attribute vec2 aUV;
uniform vec4 uPose;
uniform vec3 uCamera;
uniform float uAspect;
uniform float uPitch;
uniform float uRoll;
varying vec3 vColor;
varying vec3 vNormal;
varying float vGlow;
varying float vDepth;
varying vec2 vUV;
void main() {
  float c = cos(uPose.w), s = sin(uPose.w), cr = cos(uRoll), sr = sin(uRoll);
  vec3 p = aPosition, n = aNormal;
  p.xy = vec2(cr*p.x-sr*p.y, sr*p.x+cr*p.y);
  n.xy = vec2(cr*n.x-sr*n.y, sr*n.x+cr*n.y);
  p.xz = vec2(c*p.x+s*p.z, -s*p.x+c*p.z);
  n.xz = vec2(c*n.x+s*n.z, -s*n.x+c*n.z);
  p += uPose.xyz;
  vDepth = p.z; vColor = aColor; vNormal = n; vGlow = aGlow; vUV = aUV;
  p -= uCamera;
  float cp = cos(uPitch), sp = sin(uPitch);
  p.yz = vec2(cp*p.y-sp*p.z, sp*p.y+cp*p.z);
  gl_Position = vec4(p.x*1.72/uAspect, p.y*1.72, 1.00235*p.z-0.40047, p.z);
}`;
const fragment = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform float uOpacity;
uniform float uFlash;
uniform float uEdges;
varying vec3 vColor;
varying vec3 vNormal;
varying float vGlow;
varying float vDepth;
varying vec2 vUV;
void main() {
  if (vGlow < -0.5) {
    float a = (1.0-smoothstep(0.2,1.0,length((vUV-.5)*2.0))) * .72;
    gl_FragColor = vec4(.018,.012,.042,a); return;
  }
  float light = .55 + .45*max(0.0,dot(normalize(vNormal),normalize(vec3(-.35,.8,-.5))));
  vec3 col = vColor * mix(light,1.35,clamp(vGlow,0.0,1.0));
  vec2 edge = min(vUV,1.0-vUV) / max(fwidth(vUV),vec2(.001));
  float wire = 1.0-smoothstep(.5,1.6,min(edge.x,edge.y));
  col += uEdges*wire*(vColor*.65+vec3(.18,.12,.10));
  col = mix(col, vec3(.7,1.0,.9),uFlash*.65);
  float fog = 1.0-exp(-pow(max(vDepth-18.0,0.0)*.017,1.4));
  col = mix(col,vec3(.27,.055,.15),fog*.7);
  // New notes emerge from the far end of the road, never as a course-wide fade.
  float horizon = 1.0-smoothstep(${(CAR_DEPTH+(LOOK_AHEAD-2)*SPEED).toFixed(1)},${(CAR_DEPTH+LOOK_AHEAD*SPEED).toFixed(1)},vDepth);
  gl_FragColor = vec4(col,uOpacity*mix(1.0,horizon,uEdges));
}`;

const faces = [
  { n:[0,0,-1], p:[[-.5,0,-.5],[-.5,1,-.5],[.5,1,-.5],[.5,0,-.5]] },
  { n:[0,0,1], p:[[.5,0,.5],[.5,1,.5],[-.5,1,.5],[-.5,0,.5]] },
  { n:[-1,0,0], p:[[-.5,0,.5],[-.5,1,.5],[-.5,1,-.5],[-.5,0,-.5]] },
  { n:[1,0,0], p:[[.5,0,-.5],[.5,1,-.5],[.5,1,.5],[.5,0,.5]] },
  { n:[0,1,0], p:[[-.5,1,-.5],[-.5,1,.5],[.5,1,.5],[.5,1,-.5]] },
];
const order = [0,1,2,0,2,3], uv = [[0,0],[0,1],[1,1],[1,0]];
const palette = [[1,.50,.25],[.32,.89,.88],[1,.34,.53],[.72,.57,1]];
const MAX_BLOCKS = 64;
const OFFSCREEN_DEPTH = 2;
const NO_ACTORS = { draws: 0, triangles: 0, blocks: 0 };

export function createActorRenderer(gl, carData) {
  const p = gl.createProgram();
  for (const [kind, source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]) {
    const s = gl.createShader(kind); gl.shaderSource(s,source); gl.compileShader(s);
    if (!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p,s); gl.deleteShader(s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const attributes = Object.fromEntries(['aPosition','aNormal','aColor','aGlow','aUV'].map(n=>[n,gl.getAttribLocation(p,n)]));
  const uniforms = Object.fromEntries(['uPose','uCamera','uAspect','uPitch','uRoll','uOpacity','uFlash','uEdges'].map(n=>[n,gl.getUniformLocation(p,n)]));
  const car = gl.createBuffer(), blocks = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,car); gl.bufferData(gl.ARRAY_BUFFER,carData,gl.STATIC_DRAW);
  const data = new Float32Array((MAX_BLOCKS*30+6)*12);
  gl.bindBuffer(gl.ARRAY_BUFFER,blocks); gl.bufferData(gl.ARRAY_BUFFER,data.byteLength,gl.DYNAMIC_DRAW);
  const slices = Array.from({length:MAX_BLOCKS+1},(_,i)=>data.subarray(0,(i*30+6)*12));

  function bind(buffer, stride, hasUV) {
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    for (const [name,size,offset] of [['aPosition',3,0],['aNormal',3,12],['aColor',3,24],['aGlow',1,36]]) {
      const loc = attributes[name]; gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,size,gl.FLOAT,false,stride,offset);
    }
    if (hasUV) { gl.enableVertexAttribArray(attributes.aUV); gl.vertexAttribPointer(attributes.aUV,2,gl.FLOAT,false,stride,40); }
    else { gl.disableVertexAttribArray(attributes.aUV); gl.vertexAttrib2f(attributes.aUV,0,0); }
  }

  function draw({ runner, distance, aspect, cameraX, cameraY, pitch }) {
    const pose = runner.carMotion;
    if (pose && !pose.visible) return NO_ACTORS;
    const carDepth = pose?.depth ?? CAR_DEPTH;
    const carX = valleyCenter(distance+carDepth)+(pose?.x ?? runner.x);
    const lean = pose?.lean ?? runner.lean;
    let at=0, count=0;
    function write(x,y,z,nx,ny,nz,r,g,b,glow,u,v) {
      data[at++]=x; data[at++]=y; data[at++]=z;
      data[at++]=nx; data[at++]=ny; data[at++]=nz;
      data[at++]=r; data[at++]=g; data[at++]=b;
      data[at++]=glow; data[at++]=u; data[at++]=v;
    }
    // An analytic soft ground shadow shares the obstacle batch.
    for (const index of order) {
      const u=uv[index][0], v=uv[index][1];
      write(carX+(u-.5)*2.2,.028,carDepth+(v-.5)*3.9,0,1,0,0,0,0,-1,u,v);
    }
    for (const b of runner.blocks) {
      if (b.time-runner.time > LOOK_AHEAD || count===MAX_BLOCKS) continue;
      // Depth spans the note: front at note-on, back at note-off. From the camera
      // (y 4.2, near-level pitch) even the tallest block has left the bottom of the
      // screen by depth 2, so a block is dropped only once all of it is nearer than that.
      const front=Math.max(OFFSCREEN_DEPTH,blockDepth(b,runner.time)), back=CAR_DEPTH+(b.end-runner.time)*SPEED;
      if (back<=front) continue;
      // Each end sits on the valley's curve, so long blocks stay in their lane on bends.
      const z=(front+back)/2, depth=back-front;
      const xFront=valleyCenter(distance+front)+b.x, xBack=valleyCenter(distance+back)+b.x;
      const color=palette[b.pitch%4], pulse=b.pulse||0;
      const height=(.63+(b.pitch%12)*.035)*(1+pulse*.28), width=1.13*(1+pulse*.12);
      for (const face of faces) for (const i of order) {
        const pt=face.p[i];
        write((pt[2]<0?xFront:xBack)+pt[0]*width,.045+pt[1]*height,z+pt[2]*depth,
          face.n[0],face.n[1],face.n[2],color[0]+(1-color[0])*pulse*.8,
          color[1]+(1-color[1])*pulse*.8,color[2]+(1-color[2])*pulse*.8,
          .1+pulse*.9,uv[i][0],uv[i][1]);
      }
      count++;
    }
    gl.useProgram(p);
    const u=uniforms;
    gl.uniform1f(u.uAspect,aspect); gl.uniform1f(u.uPitch,pitch);
    gl.uniform3f(u.uCamera,cameraX,cameraY,0);
    bind(blocks,48,true);
    gl.bufferSubData(gl.ARRAY_BUFFER,0,slices[count]);
    gl.uniform4f(u.uPose,0,0,0,0); gl.uniform1f(u.uRoll,0);
    gl.uniform1f(u.uEdges,1); gl.uniform1f(u.uOpacity,1); gl.uniform1f(u.uFlash,0);
    gl.drawArrays(gl.TRIANGLES,0,count*30+6);
    bind(car,40,false);
    const protectedCar=runner.mode==='ghost'||runner.mode==='rejoining';
    gl.uniform4f(u.uPose,carX,.02,carDepth,lean);
    gl.uniform1f(u.uRoll,-lean*.45); gl.uniform1f(u.uEdges,0);
    gl.uniform1f(u.uOpacity,runner.mode==='ghost'?.35+.65*runner.flash:protectedCar?.6:1);
    gl.uniform1f(u.uFlash,runner.mode==='ghost'?runner.flash:protectedCar?.35:0);
    gl.drawArrays(gl.TRIANGLES,0,carData.length/10);
    for (const location of Object.values(attributes)) gl.disableVertexAttribArray(location);
    return { draws:2,triangles:count*10+2+carData.length/30,blocks:count };
  }
  return { draw, destroy() { gl.deleteBuffer(car); gl.deleteBuffer(blocks); gl.deleteProgram(p); } };
}
