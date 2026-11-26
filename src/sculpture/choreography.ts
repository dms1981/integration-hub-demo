export const FORMATION_COUNT = 6;

export interface CameraPreset {
  radius: number;
  elevation: number;
  azimuthSpeed: number;
  lookAtY: number;
}

export interface FormationMeta {
  index: number;
  name: string;
  holdDuration: number;
  transitionDuration: number;
  camera: CameraPreset;
}

export const FORMATIONS: readonly FormationMeta[] = [
  {
    index: 0,
    name: 'Vortex Torus',
    holdDuration: 10.5,
    transitionDuration: 4.5,
    camera: { radius: 28.5, elevation: 0.46, azimuthSpeed: 0.14, lookAtY: 1.0 },
  },
  {
    index: 1,
    name: 'Kinetic Monolith',
    holdDuration: 10.0,
    transitionDuration: 4.6,
    camera: { radius: 31.5, elevation: 0.48, azimuthSpeed: 0.11, lookAtY: 0.6 },
  },
  {
    index: 2,
    name: 'Silk Cascades',
    holdDuration: 10.5,
    transitionDuration: 4.4,
    camera: { radius: 29.0, elevation: 0.22, azimuthSpeed: 0.16, lookAtY: 1.0 },
  },
  {
    index: 3,
    name: 'Crystalline Astrolabe',
    holdDuration: 11.2,
    transitionDuration: 4.7,
    camera: { radius: 30.0, elevation: 0.28, azimuthSpeed: 0.13, lookAtY: 1.0 },
  },
  {
    index: 4,
    name: 'Harmonic Attractor',
    holdDuration: 10.0,
    transitionDuration: 4.5,
    camera: { radius: 27.5, elevation: 0.38, azimuthSpeed: 0.15, lookAtY: 1.0 },
  },
  {
    index: 5,
    name: 'Solaris Lotus',
    holdDuration: 10.8,
    transitionDuration: 4.6,
    camera: { radius: 29.5, elevation: 0.50, azimuthSpeed: 0.12, lookAtY: 0.8 },
  },
];

function wrapFormationIndex(index: number): number {
  return ((Math.trunc(index) % FORMATION_COUNT) + FORMATION_COUNT) % FORMATION_COUNT;
}

function smootherstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class ChoreographyController {
  public elapsedTime = 0;
  public fromFormation = 0;
  public toFormation = 1;
  public morph = 0;
  public energyPulse = 0.15;
  public paused = false;

  public readonly cameraPreset: CameraPreset = { ...FORMATIONS[0].camera };

  private phaseTime = 0;

  constructor(initialFormation = 0) {
    this.jumpToFormation(initialFormation);
  }

  public get activeFormationIndex(): number {
    return this.morph < 0.5 ? this.fromFormation : this.toFormation;
  }

  public get activeFormation(): FormationMeta {
    return FORMATIONS[this.activeFormationIndex];
  }

  public get isTransitioning(): boolean {
    return this.morph > 0.0001 && this.morph < 0.9999;
  }

  public update(dt: number): void {
    const safeDt = Math.min(Math.max(dt, 0), 0.1);

    if (!this.paused && safeDt > 0) {
      this.elapsedTime += safeDt;
      this.phaseTime += safeDt;

      let currentMeta = FORMATIONS[this.fromFormation];
      let cycleDuration = currentMeta.holdDuration + currentMeta.transitionDuration;

      while (this.phaseTime >= cycleDuration) {
        this.phaseTime -= cycleDuration;
        this.fromFormation = this.toFormation;
        this.toFormation = wrapFormationIndex(this.fromFormation + 1);
        currentMeta = FORMATIONS[this.fromFormation];
        cycleDuration = currentMeta.holdDuration + currentMeta.transitionDuration;
      }

      if (this.phaseTime <= currentMeta.holdDuration) {
        this.morph = 0;
      } else {
        const transElapsed = this.phaseTime - currentMeta.holdDuration;
        this.morph = Math.min(1, Math.max(0, transElapsed / currentMeta.transitionDuration));
      }
    }

    this.recomputeDerivedState();
  }

  /**
   * Snaps cleanly to steady-state of the requested formation (`morph = 0`).
   */
  public jumpToFormation(index: number): void {
    const target = wrapFormationIndex(index);
    this.fromFormation = target;
    this.toFormation = wrapFormationIndex(target + 1);
    this.morph = 0;
    this.phaseTime = 0;
    this.recomputeDerivedState();
  }

  /**
   * Sets an exact transition state between any two formations for inspection or choreography cues.
   */
  public setTransitionState(fromIndex: number, toIndex: number, morph: number): void {
    const from = wrapFormationIndex(fromIndex);
    const to = wrapFormationIndex(toIndex);
    const clampedMorph = Math.min(1, Math.max(0, morph));

    this.fromFormation = from;
    this.toFormation = to;
    this.morph = clampedMorph;

    const meta = FORMATIONS[from];
    this.phaseTime =
      clampedMorph <= 0 ? 0 : meta.holdDuration + clampedMorph * meta.transitionDuration;

    this.recomputeDerivedState();
  }

  public setTime(t: number): void {
    this.elapsedTime = t;
    this.recomputeDerivedState();
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
  }

  public togglePaused(): boolean {
    this.paused = !this.paused;
    return this.paused;
  }

  private recomputeDerivedState(): void {
    const transitionArc = Math.sin(this.morph * Math.PI);
    const ambientBreath = 0.16 + 0.08 * Math.sin(this.elapsedTime * 1.15);
    this.energyPulse = Math.min(1, ambientBreath + 0.76 * transitionArc);

    const fromCam = FORMATIONS[this.fromFormation].camera;
    const toCam = FORMATIONS[this.toFormation].camera;
    const blend = smootherstep(this.morph);

    this.cameraPreset.radius = lerp(fromCam.radius, toCam.radius, blend) + transitionArc * 1.1;
    this.cameraPreset.elevation = lerp(fromCam.elevation, toCam.elevation, blend);
    this.cameraPreset.azimuthSpeed = lerp(fromCam.azimuthSpeed, toCam.azimuthSpeed, blend);
    this.cameraPreset.lookAtY = lerp(fromCam.lookAtY, toCam.lookAtY, blend);
  }
}
