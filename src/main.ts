import * as THREE from 'three';
import './style.css';
import { StageEnvironment } from './environment/StageEnvironment';
import { CameraRig } from './rendering/CameraRig';
import { PostProcessing } from './rendering/PostProcessing';
import { KineticSculpture } from './sculpture/KineticSculpture';
import { ChoreographyController, FORMATION_COUNT } from './sculpture/choreography';
import { CUBE_COUNT } from './sculpture/geometry';
import { PALETTES, createMutablePalette, sampleBlendedPalette } from './sculpture/palettes';

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

export interface SculptureInspectionState {
  time: number;
  fromFormation: number;
  toFormation: number;
  morph: number;
  formationName: string;
  paletteName: string;
  cubeCount: number;
}

export interface SculptureDebugAPI {
  setState(opts: SculptureStateOptions): SculptureInspectionState;
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

function syncScene(): void {
  sampleBlendedPalette(
    choreography.fromFormation,
    choreography.toFormation,
    choreography.morph,
    blendedPalette,
  );

  sculpture.update(
    choreography.elapsedTime,
    choreography.fromFormation,
    choreography.toFormation,
    choreography.morph,
    blendedPalette,
    choreography.energyPulse,
  );

  stage.update(choreography.elapsedTime, blendedPalette, choreography.energyPulse);
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

window.addEventListener('resize', handleResize);
window.addEventListener('keydown', handleKeyDown);

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

  resume(): void {
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
  cameraRig.update(dt, choreography.elapsedTime, choreography.cameraPreset);
  syncScene();
  postProcessing.render();
}

rafId = window.requestAnimationFrame(animate);

window.addEventListener('beforeunload', () => {
  window.cancelAnimationFrame(rafId);
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('keydown', handleKeyDown);
  postProcessing.dispose();
  cameraRig.dispose();
  stage.dispose();
  sculpture.dispose();
  renderer.dispose();
});

