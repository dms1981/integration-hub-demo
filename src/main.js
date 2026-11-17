import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { vertexShader, fragmentShader, finishShader } from './shaders.js';

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
const PALETTES = [
  ['#3b1fb0', '#e0239a', '#ff7a2f', '#ffe3a0'], // dusk
  ['#0a3a9a', '#10b0d0', '#6af0d0', '#effffa'], // glacier
  ['#7a0c30', '#ff3a3a', '#ffa020', '#fff0c0'], // solar
  ['#2a3ad0', '#9a4cff', '#2ee6a6', '#eafff2'], // aurora
  ['#4a0f78', '#ff3fd0', '#3fd0ff', '#ffffff'], // orchid
].map((p) => p.map((c) => new THREE.Color(c)));

// shader formation ids: 0 sphere, 1 knot, 2 helix, 3 lattice, 4 galaxy, 5 wave, 6 ribbons, 7 rain
const ORDER = [0, 1, 7, 2, 3, 4, 5, 6];
const FORM_PAL = [0, 1, 2, 3, 4, 1, 4, 2];
const FORM_CAM = [15.5, 17, 21, 26, 18, 22, 18, 27];
const FORM_HEIGHT = [2.5, 2, 1, 3, 15, 8, 8, 3];
const HOLD = 9, TRANS = 6, CYCLE = HOLD + TRANS;

const uniforms = {
  uTime: { value: 0 },
  uMix: { value: 0 },
  uFrom: { value: 0 },
  uTo: { value: 0 },
  uStyle: { value: 0 },
  uCount: { value: COUNT },
  uPal: { value: PALETTES[0].map((c) => c.clone()) },
  uL0: { value: new THREE.Vector3() },
  uL1: { value: new THREE.Vector3() },
  uLc0: { value: new THREE.Color() },
  uLc1: { value: new THREE.Color() },
};
const mat = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
const mesh = new THREE.Mesh(geo, mat);
mesh.frustumCulled = false;
scene.add(mesh);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.75, 0.7, 0.4));
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
  const P = uniforms.uPal.value;

  uniforms.uL0.value.set(Math.sin(clock * 0.37) * 6, Math.cos(clock * 0.29) * 3.5, Math.cos(clock * 0.37) * 6);
  uniforms.uL1.value.set(Math.cos(clock * 0.23 + 2) * 5, Math.sin(clock * 0.31 + 1) * 4, Math.sin(clock * 0.27 + 4) * 5);
  uniforms.uLc0.value.copy(P[1]);
  uniforms.uLc1.value.copy(P[2]);

  const e = ss(0, 1, mix);
  const camD = THREE.MathUtils.lerp(FORM_CAM[f], FORM_CAM[tf], e);
  const camH = THREE.MathUtils.lerp(FORM_HEIGHT[f], FORM_HEIGHT[tf], e);
  const dist = camD + Math.sin(clock * 0.21) * 1.2;
  const az = clock * 0.055 + Math.sin(clock * 0.13) * 0.4;
  camera.position.set(Math.sin(az) * dist, camH + Math.sin(clock * 0.17) * 1.5, Math.cos(az) * dist);
  camera.lookAt(0, Math.sin(clock * 0.11) * 0.6, 0);

  finish.uniforms.uTime.value = clock % 10;
}

const t0 = performance.now();
let frame = 0;
function loop() {
  frame++;
  if (!window.__freeze) {
    update(timeOffset + (performance.now() - t0) / 1000);
    composer.render();
  }
  window.__frames = frame;
  requestAnimationFrame(loop);
}
loop();

// capture hook: freeze the clock at an exact moment and render
window.__setClock = (c) => { window.__freeze = true; update(c); composer.render(); };
