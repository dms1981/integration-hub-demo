import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { vertexShader, fragmentShader, finishShader, floorShader } from './shaders.js';

const COUNT = 25 * 25 * 25; // 15,625 cubes
const params = new URLSearchParams(location.search);
const timeOffset = parseFloat(params.get('t') || '0');

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x01020a);
const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 200);

const base = new THREE.BoxGeometry(1, 1, 1);
const geo = new THREE.InstancedBufferGeometry();
geo.index = base.index;
geo.setAttribute('position', base.getAttribute('position'));
geo.setAttribute('normal', base.getAttribute('normal'));
geo.setAttribute('uv', base.getAttribute('uv'));
const rand = new Float32Array(COUNT * 4);
const idx = new Float32Array(COUNT);
for (let i = 0; i < COUNT; i++) {
  idx[i] = i;
  for (let k = 0; k < 4; k++) rand[i * 4 + k] = Math.random();
}
geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rand, 4));
geo.setAttribute('aIdx', new THREE.InstancedBufferAttribute(idx, 1));
geo.instanceCount = COUNT;

// palettes: dark -> mid -> bright -> hot highlight
// deep base hue -> base -> bright -> glow, plus a vivid complementary accent for sparks
const PALETTES = [
  ['#12063a', '#4a1fd8', '#8f52ff', '#c9a8ff', '#ffb020'],
  ['#02262e', '#0a9fb4', '#35e8d8', '#b8fff4', '#ff2f8e'],
  ['#30040f', '#c0102c', '#ff4a38', '#ffb08a', '#35e0ff'],
  ['#06402e', '#14c283', '#5cffb0', '#c4ffe4', '#b04cff'],
  ['#4a0f78', '#ff3fd0', '#3fd0ff', '#ffffff', '#ffd060'],
  ['#030a38', '#1050e0', '#20c8ff', '#ff7a30', '#ff4a20'],
  ['#2a0540', '#e0207a', '#ff7a30', '#ffd060', '#40e8ff'],
  ['#2c0e04', '#d84a14', '#ffa828', '#fff0a0', '#3a9cff'],
  ['#021a3a', '#1a6cff', '#5ce1ff', '#e8fbff', '#ff4a8a'],
  ['#2a0420', '#d81e5a', '#ff6a3a', '#ffe0a0', '#30e0ff'],
  ['#041a14', '#12c79a', '#8affd0', '#f0fff8', '#ff8a1e'],
].map((p) => p.map((c) => new THREE.Color(c)));

// shader formation ids: 0 sphere, 1 knot, 2 helix, 3 lattice, 4 galaxy, 5 wave, 6 ribbons, 7 rain
const ORDER = [0, 1, 7, 2, 3, 4, 5, 6];
const FORM_PAL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const FORM_CAM = [15.5, 17, 21, 36, 18, 22, 18, 27, 19, 20, 21];
const FORM_HEIGHT = [2.5, 2, 1, 11, 15, 8, 8, 3, 3, 3, 6];
const FLOOR_BY = [-8, -8, -8, -9, -4.5, -4.5, -6, -6.5, -8, -8, -8];
const HOLD = 9, TRANS = 6, CYCLE = HOLD + TRANS;

const FLOOR_Y = -8.5;
const uniforms = {
  uTime: { value: 0 },
  uMix: { value: 0 },
  uFrom: { value: 0 },
  uTo: { value: 0 },
  uStyle: { value: 0 },
  uCount: { value: COUNT },
  uLock: { value: 99 },
  uMirror: { value: 0 },
  uFloor: { value: FLOOR_Y },
  uAccent: { value: new THREE.Color() },
  uPal: { value: PALETTES[0].slice(0, 4).map((c) => c.clone()) },
  uL0: { value: new THREE.Vector3() },
  uL1: { value: new THREE.Vector3() },
  uLc0: { value: new THREE.Color() },
  uLc1: { value: new THREE.Color() },
  uTimeC: { value: 0 },
  uSim: { value: null },
  uSimTexel: { value: new THREE.Vector2(1 / 256, 1 / 144) },
  uWakeGain: { value: 22 },
  uShape: { value: -1 },
  uPrevShape: { value: -1 },
  uPrevT: { value: 0 },
  uPrevPt: { value: new THREE.Vector3() },
  uTS: { value: 1 },
  uAmp: { value: 1 },
  uClickPt: { value: new THREE.Vector3() },
  uClickT: { value: 0 },
  uRelT: { value: -1 },
};
const mat = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
const mesh = new THREE.Mesh(geo, mat);
mesh.frustumCulled = false;
scene.add(mesh);

// fake floor reflection: same instanced mesh, mirrored about the floor in the shader
const mirrorMat = new THREE.ShaderMaterial({
  uniforms: { ...uniforms, uMirror: { value: 1 } },
  vertexShader, fragmentShader, side: THREE.DoubleSide,
});
const mirror = new THREE.Mesh(geo, mirrorMat);
mirror.frustumCulled = false;
scene.add(mirror);

const floorU = { uColor: { value: new THREE.Color() }, uGain: { value: 0.4 } };
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.ShaderMaterial({ uniforms: floorU, vertexShader: floorShader.vertex, fragmentShader: floorShader.fragment, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = FLOOR_Y;
scene.add(floor);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.75, 0.7, 0.4);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass(finishShader);
composer.addPass(finish);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const ss = (a, b, x) => { x = Math.min(Math.max((x - a) / (b - a), 0), 1); return x * x * (3 - 2 * x); };

// ---- interaction state ----
const SHAPES = [8, 9, 10];
const SETTLE = 5.6, HOLD_CLICK = 6.5, REL = 2.4, COOLDOWN = 0.6, RETARGET_TS = 1.7;
const click = { phase: 'idle', shape: -1, prev: -1, prevT: 0, prevPt: null, ts: 1, amp: 1, t0: 0, rel0: 0, n: 0, pending: null };
const settleT = () => SETTLE / click.ts;
let tc = timeOffset;        // continuous time (camera, shapes, trail)
let loopClock = timeOffset; // loop time; frozen during a click
let cpBlend = 0, clickPal = 8, camDs = null, camHs = null, snap = true;
// ---- water wake: 2D wave-equation sim on a small half-float target ----
const SW = 256, SH = 144, SIM_DT = 1 / 60;
const simRT = [0, 1].map(() => new THREE.WebGLRenderTarget(SW, SH, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false }));
let simCur = 0, simAcc = 0, lastPt = null;
const quadScene = new THREE.Scene();
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quadVert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const stepMat = new THREE.ShaderMaterial({
  uniforms: { uS: { value: null }, uTexel: { value: new THREE.Vector2(1 / SW, 1 / SH) } },
  vertexShader: quadVert,
  fragmentShader: `varying vec2 vUv; uniform sampler2D uS; uniform vec2 uTexel;
    void main(){
      vec2 s = texture2D(uS, vUv).rg;
      float l = texture2D(uS, vUv - vec2(uTexel.x,0.)).r, r = texture2D(uS, vUv + vec2(uTexel.x,0.)).r;
      float d = texture2D(uS, vUv - vec2(0.,uTexel.y)).r, u = texture2D(uS, vUv + vec2(0.,uTexel.y)).r;
      float lap = l + r + d + u - 4.0*s.r;
      float e = min(min(vUv.x, 1.0 - vUv.x)*SWf, min(vUv.y, 1.0 - vUv.y)*SHf);
      float edge = smoothstep(0.0, 8.0, e);
      float hn = (s.r + (s.r - s.g)*0.992 + 0.17*lap + 0.03*lap) * mix(0.9, 1.0, edge);
      gl_FragColor = vec4(hn, s.r, 0.0, 1.0);
    }`.replace('SWf', SW.toFixed(1)).replace('SHf', SH.toFixed(1)),
  depthTest: false, depthWrite: false,
});
const dropMat = new THREE.ShaderMaterial({
  uniforms: { uA: { value: new THREE.Vector2() }, uB: { value: new THREE.Vector2() }, uAmp: { value: 0 }, uSigma: { value: 3 } },
  vertexShader: quadVert,
  fragmentShader: `varying vec2 vUv; uniform vec2 uA, uB; uniform float uAmp, uSigma;
    void main(){
      vec2 sz = vec2(SWf, SHf);
      vec2 p = vUv*sz, a = uA*sz, b = uB*sz;
      vec2 ab = b - a; float t = clamp(dot(p - a, ab)/max(dot(ab, ab), 1e-4), 0.0, 1.0);
      float d = length(p - (a + ab*t));
      float h = uAmp*exp(-d*d/(2.0*uSigma*uSigma)); gl_FragColor = vec4(h, h, 0.0, 0.0);
    }`.replace(/SWf/g, SW.toFixed(1)).replace(/SHf/g, SH.toFixed(1)),
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  depthTest: false, depthWrite: false,
});
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), stepMat);
quad.frustumCulled = false;
quadScene.add(quad);
function simPass(mat, target) {
  const ac = renderer.autoClear; renderer.autoClear = false;
  quad.material = mat;
  renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); renderer.setRenderTarget(null);
  renderer.autoClear = ac;
}
function simStep() {
  const nxt = 1 - simCur;
  stepMat.uniforms.uS.value = simRT[simCur].texture;
  simPass(stepMat, simRT[nxt]);
  simCur = nxt;
  uniforms.uSim.value = simRT[simCur].texture;
}
function simReset() {
  for (const rt of simRT) { renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); }
  renderer.setRenderTarget(null); renderer.setClearColor(0x01020a, 1);
  uniforms.uSim.value = simRT[simCur].texture;
}
// a tiny drop at the cursor, stretched along the move so fast drags leave a continuous line; still cursor = nothing
function wakeDrop(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  const p = new THREE.Vector2((ev.clientX - r.left) / r.width, 1 - (ev.clientY - r.top) / r.height);
  if (lastPt) {
    const lenPx = p.distanceTo(lastPt) * SW;
    const amp = Math.min(0.006 * lenPx, 0.03);
    if (amp > 0.0005) {
      dropMat.uniforms.uA.value.copy(lastPt); dropMat.uniforms.uB.value.copy(p); dropMat.uniforms.uAmp.value = amp;
      simPass(dropMat, simRT[simCur]);
    }
  }
  lastPt = p;
}
const ray = new THREE.Raycaster();

function planePoint(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  const nx = ((ev.clientX - r.left) / r.width) * 2 - 1, ny = -((ev.clientY - r.top) / r.height) * 2 + 1;
  camera.updateMatrixWorld();
  ray.setFromCamera({ x: nx, y: ny }, camera);
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
  const d = -camera.position.dot(fwd) / ray.ray.direction.dot(fwd);
  return ray.ray.origin.clone().addScaledVector(ray.ray.direction, d);
}
function startClick(pt) {
  const T = (tc - click.t0) * click.ts;
  const fresh = click.phase !== 'active';
  if (!fresh) { click.prev = click.shape; click.prevT = T; click.prevPt = click.pt; }
  else click.prev = -1;
  click.shape = SHAPES[click.n++ % SHAPES.length];
  click.ts = fresh || T >= SETTLE ? 1 : RETARGET_TS;
  click.amp = fresh || T >= SETTLE ? 1 : 0.5;
  click.phase = 'active'; click.t0 = tc; click.pt = pt; click.pending = null;
  clickPal = FORM_PAL[click.shape];
}
const canvasEl = renderer.domElement;
canvasEl.style.touchAction = 'none';
canvasEl.addEventListener('pointermove', wakeDrop);
canvasEl.addEventListener('pointerleave', () => { lastPt = null; });
canvasEl.addEventListener('pointerdown', (ev) => {
  const pt = planePoint(ev);
  wakeDrop(ev);
  const T = tc - click.t0;
  if (click.phase === 'idle') startClick(pt);
  else if (click.phase === 'active') { if (T >= COOLDOWN) startClick(pt); } // retarget from current positions
  else click.pending = pt; // releasing: start once back in the loop
});
function stepClick() {
  const T = tc - click.t0;
  if (click.phase === 'active' && T >= settleT()) {
    if (T >= settleT() + HOLD_CLICK) { click.phase = 'rel'; click.rel0 = tc; }
  } else if (click.phase === 'rel' && tc - click.rel0 >= REL) {
    click.phase = 'idle'; click.shape = -1; click.prev = -1;
    if (click.pending) startClick(click.pending);
  }
}

function update(clock) {
  const k = Math.floor(clock / CYCLE);
  const local = clock - k * CYCLE;
  const f = ORDER[k % ORDER.length];
  const nf = ORDER[(k + 1) % ORDER.length];
  const inTrans = local > HOLD;
  const mix = inTrans ? (local - HOLD) / TRANS : 0;
  const tf = inTrans ? nf : f;
  uniforms.uFrom.value = f;
  uniforms.uTo.value = tf;
  uniforms.uMix.value = mix;
  uniforms.uStyle.value = k % 2;
  uniforms.uTime.value = clock;

  const pm = ss(0.1, 0.95, mix);
  const pa = PALETTES[FORM_PAL[f]], pb = PALETTES[FORM_PAL[tf]];
  for (let i = 0; i < 4; i++) uniforms.uPal.value[i].copy(pa[i]).lerp(pb[i], pm);
  uniforms.uAccent.value.copy(PALETTES[FORM_PAL[f]][4]).lerp(PALETTES[FORM_PAL[tf]][4], pm);
  uniforms.uLock.value = inTrans ? 99 : local;
  const act = click.phase === 'active';
  const T = tc - click.t0;
  uniforms.uTimeC.value = tc;
  uniforms.uShape.value = click.shape;
  uniforms.uPrevShape.value = click.prev;
  uniforms.uPrevT.value = click.prevT;
  if (click.prevPt) uniforms.uPrevPt.value.copy(click.prevPt);
  uniforms.uTS.value = click.ts;
  uniforms.uAmp.value = click.amp;
  uniforms.uClickPt.value.copy(click.pt || uniforms.uClickPt.value);
  uniforms.uClickT.value = T;
  uniforms.uRelT.value = click.phase === 'rel' ? tc - click.rel0 : -1;
  if (act) uniforms.uLock.value = T >= settleT() ? T - settleT() : 99;
  bloom.strength = 0.75 + (act ? 0.4 * Math.exp(-T * 4) + 0.25 * Math.exp(-Math.max(T - settleT(), 0) * 5) * (T >= settleT() ? 1 : 0) : 0);
  const P = uniforms.uPal.value;
  const cpT = click.phase === 'idle' ? 0 : 1;
  cpBlend = snap ? cpT : cpBlend + (cpT - cpBlend) * Math.min(1, dtNow * 1.6);
  if (cpBlend > 0.001) {
    const cp = PALETTES[clickPal];
    for (let i = 0; i < 4; i++) P[i].lerp(cp[i], cpBlend);
    uniforms.uAccent.value.lerp(cp[4], cpBlend);
  }
  floorU.uColor.value.copy(P[1]);

  uniforms.uL0.value.set(Math.sin(clock * 0.37) * 6, Math.cos(clock * 0.29) * 3.5, Math.cos(clock * 0.37) * 6);
  uniforms.uL1.value.set(Math.cos(clock * 0.23 + 2) * 5, Math.sin(clock * 0.31 + 1) * 4, Math.sin(clock * 0.27 + 4) * 5);
  uniforms.uLc0.value.copy(P[1]);
  uniforms.uLc1.value.copy(P[2]);

  const e = ss(0, 1, mix);
  const fy = THREE.MathUtils.lerp(FLOOR_BY[f], FLOOR_BY[tf], e);
  uniforms.uFloor.value = fy;
  floor.position.y = fy;
  let camD = THREE.MathUtils.lerp(FORM_CAM[f], FORM_CAM[tf], e);
  let camH = THREE.MathUtils.lerp(FORM_HEIGHT[f], FORM_HEIGHT[tf], e);
  if (act || click.phase === 'rel') { /* shape targets while held */ }
  if (act) { camD = FORM_CAM[click.shape]; camH = FORM_HEIGHT[click.shape]; }
  if (camDs === null || snap) { camDs = camD; camHs = camH; }
  else { const k2 = Math.min(1, dtNow * 0.9); camDs += (camD - camDs) * k2; camHs += (camH - camHs) * k2; }
  camD = camDs; camH = camHs;
  const dist = camD + Math.sin(tc * 0.21) * 1.2;
  const az = tc * 0.055 + Math.sin(tc * 0.13) * 0.4;
  camera.position.set(Math.sin(az) * dist, camH + Math.sin(tc * 0.17) * 1.5, Math.cos(az) * dist);
  camera.lookAt(0, Math.sin(clock * 0.11) * 0.6, 0);

  finish.uniforms.uTime.value = clock % 10;
}

uniforms.uSim.value = simRT[0].texture;
let dtNow = 1 / 60;
let last = performance.now();
function advance(dt) {
  dtNow = dt;
  tc += dt;
  simAcc = Math.min(simAcc + dt, 0.2);
  while (simAcc >= SIM_DT) { simStep(); simAcc -= SIM_DT; }
  stepClick();
  if (click.phase === 'idle') loopClock += dt;
  update(loopClock);
  snap = false;
}
let frame = 0;
function loop() {
  frame++;
  const n = performance.now();
  if (!window.__freeze) {
    advance(Math.min((n - last) / 1000, 0.1));
    composer.render();
  }
  last = n;
  window.__frames = frame;
  requestAnimationFrame(loop);
}
loop();

// capture hooks
window.__setClock = (c) => { window.__freeze = true; tc = loopClock = c; snap = true; simReset(); simAcc = 0; lastPt = null; update(c); composer.render(); };
window.__advance = (dt, render = true) => { window.__freeze = true; advance(dt); if (render) composer.render(); };
window.__pointer = (type, x, y) => {
  const ev = { clientX: x, clientY: y };
  if (type === 'move') wakeDrop(ev);
  else if (type === 'down') canvasEl.dispatchEvent(Object.assign(new Event('pointerdown'), ev));
};
window.__simStat = () => {
  const buf = new Uint16Array(SW * SH * 4);
  renderer.readRenderTargetPixels(simRT[simCur], 0, 0, SW, SH, buf);
  const f = (h) => { const e = (h >> 10) & 31, m = h & 1023, sgn = h >> 15 ? -1 : 1; return e === 0 ? sgn * m * 2 ** -24 : e === 31 ? (m ? NaN : sgn * Infinity) : sgn * (1 + m / 1024) * 2 ** (e - 15); };
  let mx = 0, nan = 0, nz = 0;
  for (let i = 0; i < SW * SH; i++) { const v = f(buf[i * 4]); if (Number.isNaN(v)) nan++; else { mx = Math.max(mx, Math.abs(v)); if (Math.abs(v) > 1e-3) nz++; } }
  return { mx, nan, nz };
};
