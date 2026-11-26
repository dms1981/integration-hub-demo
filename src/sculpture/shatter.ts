import * as THREE from 'three';

export const MAX_SHATTERS = 3;
export const SHATTER_DURATION = 3.5;

export interface ShatterUniformPayload {
  origins: THREE.Vector3[];
  ages: Float32Array;
  seeds: Float32Array;
  strengths: Float32Array;
}

export class ShatterController {
  private readonly origins: THREE.Vector3[];
  private readonly ages: Float32Array;
  private readonly seeds: Float32Array;
  private readonly strengths: Float32Array;
  private readonly payload: ShatterUniformPayload;

  private latestSlot = 0;
  private seedCounter = 0;

  constructor() {
    this.origins = Array.from({ length: MAX_SHATTERS }, () => new THREE.Vector3(0, 1.0, 0));
    this.ages = new Float32Array(MAX_SHATTERS).fill(-1);
    this.seeds = new Float32Array(MAX_SHATTERS);
    this.strengths = new Float32Array(MAX_SHATTERS);
    this.payload = {
      origins: this.origins,
      ages: this.ages,
      seeds: this.seeds,
      strengths: this.strengths,
    };
  }

  public trigger(origin: THREE.Vector3, strength = 1.0): void {
    let idx = -1;
    let oldestIdx = 0;
    let oldestAge = -Infinity;

    for (let i = 0; i < MAX_SHATTERS; i++) {
      const age = this.ages[i];
      if (age < 0 || age >= SHATTER_DURATION) {
        idx = i;
        break;
      }
      if (age > oldestAge) {
        oldestAge = age;
        oldestIdx = i;
      }
    }

    if (idx === -1) {
      idx = oldestIdx;
    }

    this.seedCounter += 1;
    const nextSeed = 1.37 + this.seedCounter * 2.137;

    this.origins[idx].copy(origin);
    this.ages[idx] = 0;
    this.seeds[idx] = nextSeed;
    this.strengths[idx] = THREE.MathUtils.clamp(strength, 0.1, 1.5);
    this.latestSlot = idx;
  }

  public setDeterministic(
    origin: THREE.Vector3,
    age: number,
    seed = 1.37,
    strength = 1.0,
  ): void {
    this.clear();
    this.origins[0].copy(origin);
    if (age >= 0 && age < SHATTER_DURATION) {
      this.ages[0] = age;
      this.seeds[0] = seed;
      this.strengths[0] = THREE.MathUtils.clamp(strength, 0.1, 1.5);
    } else {
      this.ages[0] = -1;
      this.seeds[0] = seed;
      this.strengths[0] = 0;
    }
    this.latestSlot = 0;
  }

  public clear(): void {
    for (let i = 0; i < MAX_SHATTERS; i++) {
      this.ages[i] = -1;
      this.strengths[i] = 0;
    }
    this.latestSlot = 0;
  }

  public update(dt: number): void {
    const safeDt = Math.max(0, dt);
    for (let i = 0; i < MAX_SHATTERS; i++) {
      const age = this.ages[i];
      if (age >= 0) {
        const nextAge = age + safeDt;
        if (nextAge >= SHATTER_DURATION) {
          this.ages[i] = -1;
          this.strengths[i] = 0;
        } else {
          this.ages[i] = nextAge;
        }
      }
    }
  }

  public get activeCount(): number {
    let count = 0;
    for (let i = 0; i < MAX_SHATTERS; i++) {
      const age = this.ages[i];
      if (age >= 0 && age < SHATTER_DURATION) {
        count += 1;
      }
    }
    return count;
  }

  public get impactEnergy(): number {
    let total = 0;
    for (let i = 0; i < MAX_SHATTERS; i++) {
      const age = this.ages[i];
      if (age >= 0 && age < SHATTER_DURATION) {
        total += Math.min(1, age / 0.05) * Math.exp(-age * 2.15) * this.strengths[i];
      }
    }
    return THREE.MathUtils.clamp(total, 0, 1);
  }

  public get latestOrigin(): THREE.Vector3 {
    return this.origins[this.latestSlot];
  }

  public get latestAge(): number {
    const age = this.ages[this.latestSlot];
    return age >= 0 && age < SHATTER_DURATION ? age : -1;
  }

  public get uniformPayload(): ShatterUniformPayload {
    return this.payload;
  }
}
