import * as THREE from 'three';
import './style.css';
import { StageEnvironment } from './environment/StageEnvironment';
import { CameraRig } from './rendering/CameraRig';
import { PostProcessing } from './rendering/PostProcessing';
import { KineticSculpture } from './sculpture/KineticSculpture';
import { ChoreographyController, FORMATION_COUNT } from './sculpture/choreography';
import { CUBE_COUNT } from './sculpture/geometry';
import { PALETTES, createMutablePalette, sampleBlendedPalette } from './sculpture/palettes';
import { ShatterController } from './sculpture/shatter';

export interface SculptureStateOptions {
  fromFormation?: number;
  toFormation?: number;
  morph?: number;
  time?: number;
  azimuth?: number;
  elevation?: number;
  radius?: number;
  lookAtY?: number;
}

export interface ShatterStateOptions {
  origin?: [number, number, number];
  age: number;
  seed?: number;
  strength?: number;
}

export interface SculptureInspectionState {
  time: number;
  fromFormation: number;
  toFormation: number;
  morph: number;
  formationName: string;
  paletteName: string;
  cubeCount: number;
  activeShatters: number;
  shatterEnergy: number;
}

export interface SculptureDebugAPI {
  setState(opts: SculptureStateOptions): SculptureInspectionState;
  triggerShatter(ndcX?: number, ndcY?: number): { x: number; y: number; z: number };
  setShatterState(opts: ShatterStateOptions | null): SculptureInspectionState;
  resume(): void;
  getState(): SculptureInspectionState;
}

declare global {
  interface Window {
    __SCULPTURE__?: SculptureDebugAPI;
  }
}

const appRoot = document.getElementById('app');
if (!appRoot) {
  throw new Error('Missing #app mount container');
}

let width = window.innerWidth;
let height = window.innerHeight;
let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: 'high-performance',
  stencil: false,
  alpha: false,
});
// FilmicGradePass handles ACES Filmic tone mapping and linear-to-sRGB output after HDR bloom.
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(pixelRatio);
renderer.setSize(width, height);
renderer.setClearColor(0x03040a, 1);

appRoot.replaceChildren(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03040a);

const choreography = new ChoreographyController(0);
const blendedPalette = createMutablePalette(PALETTES[0]);
const shatter = new ShatterController();
let shatterFrozen = false;

const raycaster = new THREE.Raycaster();
const tempNdc = new THREE.Vector2();
const sculptureCenter = new THREE.Vector3(0, 1.0, 0);
const sculptureSphere = new THREE.Sphere(sculptureCenter, 8.2);
const impactPlane = new THREE.Plane();
const tempNormal = new THREE.Vector3();
const tempImpact = new THREE.Vector3();
const tempOffset = new THREE.Vector3();

const sculpture = new KineticSculpture(blendedPalette);
const stage = new StageEnvironment(blendedPalette);
stage.setPixelRatio(pixelRatio);

scene.add(stage.group);
scene.add(sculpture.mesh);

const cameraRig = new CameraRig(renderer.domElement, width, height, choreography.cameraPreset);
const postProcessing = new PostProcessing(
  renderer,
  scene,
  cameraRig.camera,
  width,
  height,
  pixelRatio,
);

function projectNdcToImpact(ndcX: number, ndcY: number, out: THREE.Vector3): THREE.Vector3 {
  cameraRig.camera.updateMatrixWorld();
  raycaster.setFromCamera(tempNdc.set(ndcX, ndcY), cameraRig.camera);

  if (raycaster.ray.intersectSphere(sculptureSphere, out) !== null) {
    return out;
  }

  cameraRig.camera.getWorldDirection(tempNormal).negate();
  impactPlane.setFromNormalAndCoplanarPoint(tempNormal, sculptureCenter);

  if (raycaster.ray.intersectPlane(impactPlane, out) === null) {
    return out.copy(sculptureCenter);
  }

  tempOffset.subVectors(out, sculptureCenter);
  if (tempOffset.lengthSq() > 9.2 * 9.2) {
    tempOffset.setLength(9.2);
    out.copy(sculptureCenter).add(tempOffset);
  }

  return out;
}

function syncScene(): void {
  sampleBlendedPalette(
    choreography.fromFormation,
    choreography.toFormation,
    choreography.morph,
    blendedPalette,
  );

  const impactEnergy = shatter.impactEnergy;
  const stagePulse = Math.min(choreography.energyPulse + impactEnergy * 0.45, 1.0);

  sculpture.update(
    choreography.elapsedTime,
    choreography.fromFormation,
    choreography.toFormation,
    choreography.morph,
    blendedPalette,
    choreography.energyPulse,
    shatter.uniformPayload,
  );

  stage.update(
    choreography.elapsedTime,
    blendedPalette,
    stagePulse,
    shatter.latestOrigin,
    shatter.latestAge,
  );

  postProcessing.setBloomStrength(0.48 + impactEnergy * 0.16);
  postProcessing.setChromaticAberration(0.0014 + impactEnergy * 0.0010);
}

function getInspectionState(): SculptureInspectionState {
  return {
    time: choreography.elapsedTime,
    fromFormation: choreography.fromFormation,
    toFormation: choreography.toFormation,
    morph: choreography.morph,
    formationName: choreography.activeFormation.name,
    paletteName: blendedPalette.name,
    cubeCount: CUBE_COUNT,
    activeShatters: shatter.activeCount,
    shatterEnergy: shatter.impactEnergy,
  };
}

function handleResize(): void {
  width = window.innerWidth;
  height = window.innerHeight;
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height);
  cameraRig.resize(width, height);
  postProcessing.resize(width, height, pixelRatio);
  stage.setPixelRatio(pixelRatio);
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }

  const target = event.target as HTMLElement | null;
  if (
    target &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  ) {
    return;
  }

  if (event.code === 'Space') {
    event.preventDefault();
    choreography.togglePaused();
    return;
  }

  if (event.key >= '1' && event.key <= '6') {
    const formationIndex = Number(event.key) - 1;
    choreography.jumpToFormation(formationIndex);
    return;
  }

  if (event.key === 'r' || event.key === 'R') {
    cameraRig.resumeAuto();
  }
}

interface PointerDownRecord {
  pointerId: number;
  x: number;
  y: number;
  time: number;
}

let activePointer: PointerDownRecord | null = null;

function handlePointerDown(event: PointerEvent): void {
  if (event.pointerType === 'mouse' && event.button !== 0) {
    return;
  }

  activePointer = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    time: performance.now(),
  };
}

function handlePointerCancel(): void {
  activePointer = null;
}

function handlePointerUp(event: PointerEvent): void {
  if (!activePointer || event.pointerId !== activePointer.pointerId) {
    return;
  }

  const moveDist = Math.hypot(event.clientX - activePointer.x, event.clientY - activePointer.y);
  const elapsed = performance.now() - activePointer.time;
  activePointer = null;

  if (moveDist <= 8 && elapsed <= 450) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

    projectNdcToImpact(ndcX, ndcY, tempImpact);
    shatterFrozen = false;
    shatter.trigger(tempImpact);
    cameraRig.cancelClickOverride();
  }
}

window.addEventListener('resize', handleResize);
window.addEventListener('keydown', handleKeyDown);
renderer.domElement.addEventListener('pointerdown', handlePointerDown);
renderer.domElement.addEventListener('pointerup', handlePointerUp);
renderer.domElement.addEventListener('pointercancel', handlePointerCancel);

window.__SCULPTURE__ = {
  setState(opts: SculptureStateOptions): SculptureInspectionState {
    const hasTransitionChange =
      opts.fromFormation !== undefined ||
      opts.toFormation !== undefined ||
      opts.morph !== undefined;

    if (hasTransitionChange) {
      const from = opts.fromFormation ?? choreography.fromFormation;
      const to =
        opts.toFormation ??
        (opts.fromFormation !== undefined
          ? (from + 1) % FORMATION_COUNT
          : choreography.toFormation);
      const morph =
        opts.morph ?? (opts.fromFormation !== undefined ? 0 : choreography.morph);
      choreography.setTransitionState(from, to, morph);
    }

    if (opts.time !== undefined) {
      choreography.setTime(opts.time);
    }

    if (opts.time !== undefined || opts.morph !== undefined) {
      choreography.setPaused(true);
    }

    const hasOrbitOverride =
      opts.azimuth !== undefined ||
      opts.elevation !== undefined ||
      opts.radius !== undefined ||
      opts.lookAtY !== undefined;

    if (hasOrbitOverride) {
      const current = cameraRig.getOrbit();
      const usePresetDefaults = hasTransitionChange && !cameraRig.isManualLocked;
      cameraRig.setOrbit(
        opts.azimuth ?? current.azimuth,
        opts.elevation ?? (usePresetDefaults ? choreography.cameraPreset.elevation : current.elevation),
        opts.radius ?? (usePresetDefaults ? choreography.cameraPreset.radius : current.radius),
        opts.lookAtY ?? (usePresetDefaults ? choreography.cameraPreset.lookAtY : current.lookAtY),
      );
    } else if (hasTransitionChange && !cameraRig.isManualLocked) {
      cameraRig.snapToFraming(choreography.cameraPreset, choreography.elapsedTime);
    }

    syncScene();
    postProcessing.render();

    return getInspectionState();
  },

  triggerShatter(ndcX = 0, ndcY = 0): { x: number; y: number; z: number } {
    projectNdcToImpact(ndcX, ndcY, tempImpact);
    shatterFrozen = false;
    shatter.trigger(tempImpact);
    syncScene();
    postProcessing.render();
    return { x: tempImpact.x, y: tempImpact.y, z: tempImpact.z };
  },

  setShatterState(opts: ShatterStateOptions | null): SculptureInspectionState {
    if (opts === null) {
      shatter.clear();
      shatterFrozen = false;
    } else {
      if (opts.origin) {
        tempImpact.set(opts.origin[0], opts.origin[1], opts.origin[2]);
      } else {
        tempImpact.copy(sculptureCenter);
      }
      shatter.setDeterministic(tempImpact, opts.age, opts.seed, opts.strength);
      shatterFrozen = true;
    }

    syncScene();
    postProcessing.render();
    return getInspectionState();
  },

  resume(): void {
    shatterFrozen = false;
    choreography.setPaused(false);
    cameraRig.resumeAuto();
  },

  getState(): SculptureInspectionState {
    return getInspectionState();
  },
};

syncScene();

let lastFrameTime = performance.now();
let rafId = 0;

function animate(now: number): void {
  rafId = window.requestAnimationFrame(animate);

  const dt = Math.min(Math.max((now - lastFrameTime) * 0.001, 0), 0.05);
  lastFrameTime = now;

  choreography.update(dt);
  if (!shatterFrozen) {
    shatter.update(dt);
  }
  cameraRig.update(dt, choreography.elapsedTime, choreography.cameraPreset);
  syncScene();
  postProcessing.render();
}

rafId = window.requestAnimationFrame(animate);

window.addEventListener('beforeunload', () => {
  window.cancelAnimationFrame(rafId);
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('keydown', handleKeyDown);
  renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
  renderer.domElement.removeEventListener('pointerup', handlePointerUp);
  renderer.domElement.removeEventListener('pointercancel', handlePointerCancel);
  postProcessing.dispose();
  cameraRig.dispose();
  stage.dispose();
  sculpture.dispose();
  renderer.dispose();
});

