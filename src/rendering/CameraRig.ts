import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FORMATIONS, type CameraPreset } from '../sculpture/choreography';

export type CameraFraming = CameraPreset;

const IDLE_RESUME_SECONDS = 6.5;
const MIN_DISTANCE = 11;
const MAX_DISTANCE = 42;
const MIN_POLAR_ANGLE = 0.25;
const MAX_POLAR_ANGLE = Math.PI * 0.58;

const MIN_ELEVATION = Math.PI * 0.5 - MAX_POLAR_ANGLE;
const MAX_ELEVATION = Math.PI * 0.5 - MIN_POLAR_ANGLE;

export interface OrbitCoordinates {
  azimuth: number;
  elevation: number;
  radius: number;
  lookAtY: number;
}

export class CameraRig {
  public readonly camera: THREE.PerspectiveCamera;
  public readonly controls: OrbitControls;

  private azimuth = 0.52;
  private currentElevation: number;
  private currentRadius: number;
  private currentLookAtY: number;

  private isDragging = false;
  private userOverride = false;
  private wasAlreadyOverriding = false;
  private manualLock = false;
  private idleTimer = 0;

  private readonly tempOffset = new THREE.Vector3();

  private readonly onControlsStart = (): void => {
    this.wasAlreadyOverriding = this.userOverride;
    this.isDragging = true;
    this.userOverride = true;
    this.manualLock = false;
    this.idleTimer = 0;
  };

  private readonly onControlsEnd = (): void => {
    this.isDragging = false;
    this.idleTimer = 0;
  };

  constructor(
    domElement: HTMLElement,
    width: number,
    height: number,
    initialFraming: CameraFraming = FORMATIONS[0].camera,
  ) {
    const aspect = width / Math.max(height, 1);
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.25, 240);

    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.enablePan = false;
    this.controls.minDistance = MIN_DISTANCE;
    this.controls.maxDistance = MAX_DISTANCE;
    this.controls.minPolarAngle = MIN_POLAR_ANGLE;
    this.controls.maxPolarAngle = MAX_POLAR_ANGLE;

    this.currentRadius = initialFraming.radius;
    this.currentElevation = initialFraming.elevation;
    this.currentLookAtY = initialFraming.lookAtY;

    this.applySphericalTransform(
      this.azimuth,
      this.currentElevation,
      this.currentRadius,
      this.currentLookAtY,
    );

    this.controls.addEventListener('start', this.onControlsStart);
    this.controls.addEventListener('end', this.onControlsEnd);
  }

  public get isManualLocked(): boolean {
    return this.manualLock;
  }

  public getOrbit(): OrbitCoordinates {
    return {
      azimuth: this.azimuth,
      elevation: this.currentElevation,
      radius: this.currentRadius,
      lookAtY: this.currentLookAtY,
    };
  }

  public update(dt: number, elapsedTime: number, framing: CameraFraming): void {
    const safeDt = Math.max(0, dt);

    if (this.manualLock) {
      return;
    }

    if (this.userOverride) {
      this.controls.update(safeDt);
      this.syncFromCamera();

      if (!this.isDragging) {
        this.idleTimer += safeDt;
        if (this.idleTimer >= IDLE_RESUME_SECONDS) {
          this.userOverride = false;
          this.idleTimer = 0;
        }
      }
      return;
    }

    // Autonomous choreography with smooth framing interpolation and gentle sinusoidal breathing
    const smooth = 1 - Math.exp(-safeDt * 1.85);
    const radiusBreath = Math.sin(elapsedTime * 0.21) * 0.85;
    const elevationBreath = Math.sin(elapsedTime * 0.17) * 0.055;
    const lookAtBreath = Math.sin(elapsedTime * 0.19) * 0.16;

    const targetRadius = THREE.MathUtils.clamp(
      framing.radius + radiusBreath,
      MIN_DISTANCE,
      MAX_DISTANCE,
    );
    const targetElevation = THREE.MathUtils.clamp(
      framing.elevation + elevationBreath,
      MIN_ELEVATION,
      MAX_ELEVATION,
    );
    const targetLookAtY = framing.lookAtY + lookAtBreath;

    this.currentRadius = THREE.MathUtils.lerp(this.currentRadius, targetRadius, smooth);
    this.currentElevation = THREE.MathUtils.lerp(this.currentElevation, targetElevation, smooth);
    this.currentLookAtY = THREE.MathUtils.lerp(this.currentLookAtY, targetLookAtY, smooth);
    this.azimuth += framing.azimuthSpeed * safeDt;

    this.applySphericalTransform(
      this.azimuth,
      this.currentElevation,
      this.currentRadius,
      this.currentLookAtY,
    );
  }

  /**
   * Deterministic camera placement for inspection hooks; disables autonomous drift until `resumeAuto()`.
   */
  public setOrbit(
    azimuth: number,
    elevation: number,
    radius: number,
    lookAtY = 0.8,
  ): void {
    this.manualLock = true;
    this.userOverride = false;
    this.wasAlreadyOverriding = false;
    this.isDragging = false;
    this.idleTimer = 0;

    this.azimuth = azimuth;
    this.currentElevation = THREE.MathUtils.clamp(
      elevation,
      -Math.PI * 0.5 + 0.02,
      Math.PI * 0.5 - 0.02,
    );
    this.currentRadius = Math.max(0.5, radius);
    this.currentLookAtY = lookAtY;

    this.applySphericalTransform(
      this.azimuth,
      this.currentElevation,
      this.currentRadius,
      this.currentLookAtY,
    );
  }

  /**
   * Immediately aligns the camera to a formation framing preset while staying in autonomous mode.
   */
  public snapToFraming(framing: CameraFraming, elapsedTime = 0): void {
    const radiusBreath = Math.sin(elapsedTime * 0.21) * 0.85;
    const elevationBreath = Math.sin(elapsedTime * 0.17) * 0.055;
    const lookAtBreath = Math.sin(elapsedTime * 0.19) * 0.16;

    this.currentRadius = THREE.MathUtils.clamp(
      framing.radius + radiusBreath,
      MIN_DISTANCE,
      MAX_DISTANCE,
    );
    this.currentElevation = THREE.MathUtils.clamp(
      framing.elevation + elevationBreath,
      MIN_ELEVATION,
      MAX_ELEVATION,
    );
    this.currentLookAtY = framing.lookAtY + lookAtBreath;

    this.applySphericalTransform(
      this.azimuth,
      this.currentElevation,
      this.currentRadius,
      this.currentLookAtY,
    );
  }

  public cancelClickOverride(): void {
    if (!this.wasAlreadyOverriding) {
      this.userOverride = false;
      this.isDragging = false;
      this.idleTimer = 0;
    }
  }

  public resumeAuto(): void {
    this.manualLock = false;
    this.userOverride = false;
    this.wasAlreadyOverriding = false;
    this.isDragging = false;
    this.idleTimer = 0;
    this.syncFromCamera();
  }

  public resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  public dispose(): void {
    this.controls.removeEventListener('start', this.onControlsStart);
    this.controls.removeEventListener('end', this.onControlsEnd);
    this.controls.dispose();
  }

  private applySphericalTransform(
    azimuth: number,
    elevation: number,
    radius: number,
    lookAtY: number,
  ): void {
    const cosElev = Math.cos(elevation);
    const sinElev = Math.sin(elevation);

    this.controls.target.set(0, lookAtY, 0);
    this.camera.position.set(
      radius * cosElev * Math.sin(azimuth),
      lookAtY + radius * sinElev,
      radius * cosElev * Math.cos(azimuth),
    );
    this.camera.lookAt(this.controls.target);
    this.camera.updateMatrixWorld();
  }

  private syncFromCamera(): void {
    this.tempOffset.subVectors(this.camera.position, this.controls.target);
    const radius = Math.max(this.tempOffset.length(), 0.001);
    const sinElev = THREE.MathUtils.clamp(this.tempOffset.y / radius, -0.9999, 0.9999);

    this.currentRadius = radius;
    this.currentElevation = Math.asin(sinElev);
    this.azimuth = Math.atan2(this.tempOffset.x, this.tempOffset.z);
    this.currentLookAtY = this.controls.target.y;
  }
}
