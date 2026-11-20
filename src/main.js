import {
  ACESFilmicToneMapping, BoxGeometry, Color, InstancedBufferAttribute,
  InstancedBufferGeometry, Mesh, PerspectiveCamera, PlaneGeometry, Scene,
  ShaderMaterial, Vector2, Vector3, Vector4, WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { WAKE_COUNT, WAKE_LIFETIME, cubeFragment, cubeVertex, stageFragment, stageVertex } from './shaders.js';
import './style.css';

const COUNT = 12288;
const acts = [
  // Hold, dissolve, camera azimuth/elevation/distance, ink/body/rim/ember/stage.
  [9.5, 6.1, 0.28, 0.18, 15.1, '#283d9b', '#a34391', '#ffaa50', '#fff1aa', '#565faa'],
  [10, 5.2, 0.04, 0.11, 15.1, '#1059a5', '#16c9a7', '#b0e88b', '#fbff9d', '#2a7f96'],
  [10.5, 5.5, -0.24, 0.30, 15.7, '#382ba5', '#8765fd', '#59d5ff', '#ffd6fa', '#684ba6'],
  [10, 6.4, -0.27, 0.26, 15.5, '#263c83', '#448ee4', '#bcefff', '#ff907b', '#426b99'],
  [11.5, 6.2, 0.27, 0.24, 15.4, '#a2205d', '#ed5461', '#ffbe51', '#ffe8b5', '#a54c72'],
].map(([hold, dissolve, yaw, pitch, distance, ...palette]) => ({
  hold, dissolve, yaw, pitch, distance, palette: palette.map((hex) => new Color(hex)),
}));

const duration = acts.reduce((sum, { hold, dissolve }) => sum + hold + dissolve, 0);
const opening = 2.4;
const wakeSpacing = 0.1;
const wakeRetireStart = 64;
const wakeRetireDuration = 1.2;
const shatterDuration = 3.8;
const smooth = (x) => x * x * (3 - 2 * x);
const mix = (a, b, x) => a + (b - a) * x;
const actStart = (index) => acts.slice(0, index).reduce((sum, act) => sum + act.hold + act.dissolve, 0);

function frameAt(seconds) {
  let local = seconds % duration;
  for (let index = 0; index < acts.length; index++) {
    const { hold, dissolve } = acts[index];
    if (local < hold + dissolve) {
      return { index, next: (index + 1) % acts.length, blend: Math.max(0, (local - hold) / dissolve) };
    }
    local -= hold + dissolve;
  }
}

function cubeInstances() {
  const box = new BoxGeometry();
  const geometry = new InstancedBufferGeometry();
  geometry.setIndex(box.index);
  for (const [name, attribute] of Object.entries(box.attributes)) geometry.setAttribute(name, attribute);
  const seeds = new Float32Array(COUNT * 4);
  const ids = new Float32Array(COUNT);
  let state = 0x41c6ce57;
  for (let i = 0; i < seeds.length; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    seeds[i] = (state >>> 0) / 4294967296;
  }
  for (let i = 0; i < COUNT; i++) ids[i] = i / COUNT;
  geometry.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 4));
  geometry.setAttribute('aId', new InstancedBufferAttribute(ids, 1));
  geometry.instanceCount = COUNT;
  return geometry;
}

const gallery = document.querySelector('#gallery');
const unavailable = document.querySelector('#unavailable');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const still = new URLSearchParams(location.search).get('t');
const stillTime = still?.trim() ? Number(still) : NaN;
const pinned = Number.isFinite(stillTime) && stillTime >= 0;
const canvas = document.createElement('canvas');
canvas.setAttribute('role', 'img');
canvas.setAttribute('aria-label', 'Colored cubes arrange into ribbons, a waterfall, a vortex, a lattice, and a bloom in a dark room.');

function showStatus(message) {
  unavailable.textContent = message;
  unavailable.hidden = !message;
  canvas.hidden = Boolean(message);
}

const context = canvas.getContext('webgl2', { powerPreference: 'high-performance', alpha: false });
if (context) {
  install(context);
} else {
  showStatus('Aftermatter needs WebGL 2. Try a browser with hardware acceleration enabled.');
}

function install(gl) {
  const renderer = new WebGLRenderer({ canvas, context: gl });
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;

  const scene = new Scene();
  const camera = new PerspectiveCamera(43, 1, 0.1, 70);
  const pigments = ['uInk', 'uBody', 'uRim', 'uFire'];
  const cubeUniforms = {
    uTime: { value: 0 }, uBlend: { value: 0 }, uAct: { value: 0 }, uNext: { value: 0 },
    uShatter: { value: 0 }, uTarget: { value: 0 }, uAspect: { value: 1 }, uWakeCount: { value: 0 },
    uTip: { value: new Vector3() },
    uWake: { value: Array.from({ length: WAKE_COUNT }, () => new Vector4()) },
    uWakeData: { value: Array.from({ length: WAKE_COUNT }, () => new Vector2()) },
    ...Object.fromEntries(pigments.map((name) => [name, { value: new Color() }])),
  };
  const stageUniforms = { uTime: { value: 0 }, uAspect: { value: 1 }, uWash: { value: new Color() } };
  const stage = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({
    uniforms: stageUniforms, vertexShader: stageVertex, fragmentShader: stageFragment,
    depthWrite: false, depthTest: false,
  }));
  stage.frustumCulled = false;
  stage.renderOrder = -1;
  scene.add(stage);

  const sculpture = new Mesh(cubeInstances(), new ShaderMaterial({
    uniforms: cubeUniforms, vertexShader: cubeVertex, fragmentShader: cubeFragment,
  }));
  sculpture.frustumCulled = false;
  scene.add(sculpture);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new Vector2(1, 1), 0.28, 0.42, 0.94));
  composer.addPass(new OutputPass());

  let elapsed = opening;
  let scoreTime = opening;
  let previous;
  let raf = 0;
  let lost = false;
  let shatter = null;
  let lastPointer = null;
  let tip = null;
  const wake = [];

  function draw() {
    if (shatter && elapsed - shatter.started >= shatterDuration) {
      scoreTime = actStart(shatter.target);
      shatter = null;
    }
    const time = pinned ? stillTime : elapsed;
    const { index, next, blend } = shatter ? shatter.from : frameAt(pinned ? stillTime : scoreTime);
    const from = acts[index];
    const to = acts[next];
    const ease = smooth(blend);
    const progress = shatter ? Math.min(1, (elapsed - shatter.started) / shatterDuration) : 0;
    const reform = smooth(Math.max(0, Math.min(1, (progress - 0.15) / 0.80)));
    const target = shatter ? acts[shatter.target] : from;
    cubeUniforms.uTime.value = time;
    cubeUniforms.uBlend.value = blend;
    cubeUniforms.uAct.value = index;
    cubeUniforms.uNext.value = next;
    cubeUniforms.uShatter.value = progress;
    cubeUniforms.uTarget.value = shatter ? shatter.target : index;
    cubeUniforms.uAspect.value = camera.aspect;
    cubeUniforms.uWakeCount.value = wake.length;
    if (tip?.fresh) {
      tip.time = elapsed;
      tip.fresh = false;
    }
    cubeUniforms.uTip.value.set(tip?.x ?? 0, tip?.y ?? 0, tip ? Math.exp(-8 * (elapsed - tip.time)) : 0);
    for (let i = 0; i < wake.length; i++) {
      const sample = wake[i];
      const age = Math.max(0, elapsed - sample.time);
      const retirement = sample.retire === undefined ? 1 : 1 - smooth(Math.min(1, (elapsed - sample.retire) / wakeRetireDuration));
      const lifetime = 1 - smooth(Math.max(0, Math.min(1, (age - 7.5) / (WAKE_LIFETIME - 7.5))));
      cubeUniforms.uWake.value[i].set(sample.x, sample.y, age, sample.tx);
      cubeUniforms.uWakeData.value[i].set(sample.ty, retirement * lifetime * Math.exp(-0.1 * age));
    }
    for (const [i, name] of pigments.entries()) {
      cubeUniforms[name].value.copy(from.palette[i]).lerp(to.palette[i], ease).lerp(target.palette[i], reform);
    }
    stageUniforms.uTime.value = time;
    stageUniforms.uWash.value.copy(from.palette[4]).lerp(to.palette[4], ease).lerp(target.palette[4], reform);

    const yaw = mix(mix(from.yaw, to.yaw, ease), target.yaw, reform) + 0.13 * Math.sin(time * 0.19);
    const pitch = mix(mix(from.pitch, to.pitch, ease), target.pitch, reform) + 0.033 * Math.sin(time * 0.31 + 1.2);
    const distance = mix(mix(from.distance, to.distance, ease), target.distance, reform) * Math.max(1.09, 1.22 / camera.aspect);
    const orbit = distance * Math.cos(pitch);
    camera.position.set(Math.sin(yaw) * orbit, Math.sin(pitch) * distance, Math.cos(yaw) * orbit);
    camera.lookAt(0, -0.12, 0);
    composer.render();
  }

  function tick(timestamp) {
    raf = 0;
    if (previous !== undefined) {
      const delta = Math.min(0.10, (timestamp - previous) / 1000);
      elapsed += delta;
      if (!shatter) scoreTime += delta;
      while (wake.length && (elapsed - wake[0].time >= WAKE_LIFETIME
        || (wake[0].retire !== undefined && elapsed - wake[0].retire >= wakeRetireDuration))) wake.shift();
    }
    previous = timestamp;
    draw();
    raf = requestAnimationFrame(tick);
  }

  function playback() {
    cancelAnimationFrame(raf);
    raf = 0;
    previous = undefined;
    if (lost || document.hidden) return;
    if (pinned || reduced.matches) {
      draw();
    } else {
      raf = requestAnimationFrame(tick);
    }
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = gallery;
    if (lost || width < 1 || height < 1) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    stageUniforms.uAspect.value = camera.aspect;
    const dpr = Math.min(devicePixelRatio, 1.65, Math.sqrt(3200000 / (width * height)));
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(dpr);
    composer.setSize(width, height);
    lastPointer = null;
    tip = null;
    draw();
  }

  canvas.addEventListener('pointermove', (event) => {
    if (pinned || reduced.matches || lost || event.pointerType === 'touch') return;
    const rect = canvas.getBoundingClientRect();
    const point = {
      x: 2 * (event.clientX - rect.left) / rect.width - 1,
      y: 1 - 2 * (event.clientY - rect.top) / rect.height,
    };
    tip = { ...point, time: elapsed, fresh: true };
    if (lastPointer) {
      const dx = (point.x - lastPointer.x) * camera.aspect;
      const dy = point.y - lastPointer.y;
      const distance = Math.hypot(dx, dy);
      if (distance < wakeSpacing) return;
      const steps = Math.min(WAKE_COUNT, Math.ceil(distance / wakeSpacing));
      const startTime = Math.max(lastPointer.time, elapsed - 0.1);
      for (let i = 1; i <= steps; i++) {
        if (wake.length >= WAKE_COUNT) break;
        const amount = i / steps;
        wake.push({
          x: mix(lastPointer.x, point.x, amount), y: mix(lastPointer.y, point.y, amount),
          time: mix(startTime, elapsed, amount), tx: dx / distance, ty: dy / distance,
        });
        if (wake.length > wakeRetireStart) {
          for (let i = 0; i < wake.length - wakeRetireStart; i++) wake[i].retire ??= elapsed;
        }
      }
    }
    lastPointer = { ...point, time: elapsed };
  });
  canvas.addEventListener('pointerleave', () => {
    lastPointer = null;
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (pinned || lost || event.button !== 0 || shatter) return;
    const from = frameAt(scoreTime);
    const target = (from.blend < 0.5 ? from.index : from.next) + 1;
    const next = target % acts.length;
    lastPointer = null;
    if (reduced.matches) {
      scoreTime = actStart(next);
      draw();
    } else {
      shatter = { from, target: next, started: elapsed };
    }
  });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    lost = true;
    playback();
    showStatus('The graphics context was interrupted. Aftermatter will resume when it returns.');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    showStatus('');
    resize();
    playback();
  });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', playback);
  reduced.addEventListener('change', () => {
    if (reduced.matches && shatter) scoreTime = actStart(shatter.target);
    shatter = null;
    wake.length = 0;
    lastPointer = null;
    tip = null;
    playback();
  });
  gallery.prepend(canvas);
  resize();
  playback();
}
