import * as THREE from 'three';
import { createSculptureGeometry } from './geometry';
import { PALETTES, type PaletteColors } from './palettes';
import { MAX_SHATTERS, type ShatterUniformPayload } from './shatter';
import sculptureVert from './shaders/sculpture.vert.glsl?raw';
import sculptureFrag from './shaders/sculpture.frag.glsl?raw';

interface SculptureUniforms {
  [uniform: string]: THREE.IUniform<unknown>;
  uTime: THREE.IUniform<number>;
  uFromFormation: THREE.IUniform<number>;
  uToFormation: THREE.IUniform<number>;
  uMorph: THREE.IUniform<number>;
  uColShadow: THREE.IUniform<THREE.Color>;
  uColPrimary: THREE.IUniform<THREE.Color>;
  uColSecondary: THREE.IUniform<THREE.Color>;
  uColHighlight: THREE.IUniform<THREE.Color>;
  uBgColor: THREE.IUniform<THREE.Color>;
  uCorePulse: THREE.IUniform<number>;
  uShatterOrigin: THREE.IUniform<THREE.Vector3[]>;
  uShatterAge: THREE.IUniform<Float32Array>;
  uShatterSeed: THREE.IUniform<Float32Array>;
  uShatterStrength: THREE.IUniform<Float32Array>;
}

export class KineticSculpture {
  public readonly geometry: THREE.InstancedBufferGeometry;
  public readonly material: THREE.ShaderMaterial;
  public readonly mesh: THREE.Mesh;

  private readonly uniforms: SculptureUniforms;

  constructor(initialPalette: PaletteColors = PALETTES[0]) {
    this.geometry = createSculptureGeometry();

    this.uniforms = {
      uTime: { value: 0 },
      uFromFormation: { value: 0 },
      uToFormation: { value: 1 },
      uMorph: { value: 0 },
      uColShadow: { value: initialPalette.shadow.clone() },
      uColPrimary: { value: initialPalette.primary.clone() },
      uColSecondary: { value: initialPalette.secondary.clone() },
      uColHighlight: { value: initialPalette.highlight.clone() },
      uBgColor: { value: initialPalette.bgTint.clone() },
      uCorePulse: { value: 0.15 },
      uShatterOrigin: {
        value: Array.from({ length: MAX_SHATTERS }, () => new THREE.Vector3(0, 1.0, 0)),
      },
      uShatterAge: { value: new Float32Array(MAX_SHATTERS).fill(-1) },
      uShatterSeed: { value: new Float32Array(MAX_SHATTERS) },
      uShatterStrength: { value: new Float32Array(MAX_SHATTERS) },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: sculptureVert,
      fragmentShader: sculptureFrag,
      uniforms: this.uniforms,
      side: THREE.FrontSide,
      transparent: false,
      depthWrite: true,
      depthTest: true,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'KineticSculpture';
    this.mesh.frustumCulled = false;
  }

  public update(
    time: number,
    fromIdx: number,
    toIdx: number,
    morph: number,
    palette: PaletteColors,
    corePulse: number,
    shatterPayload?: ShatterUniformPayload,
  ): void {
    this.uniforms.uTime.value = time;
    this.uniforms.uFromFormation.value = fromIdx;
    this.uniforms.uToFormation.value = toIdx;
    this.uniforms.uMorph.value = morph;
    this.uniforms.uColShadow.value.copy(palette.shadow);
    this.uniforms.uColPrimary.value.copy(palette.primary);
    this.uniforms.uColSecondary.value.copy(palette.secondary);
    this.uniforms.uColHighlight.value.copy(palette.highlight);
    this.uniforms.uBgColor.value.copy(palette.bgTint);
    this.uniforms.uCorePulse.value = corePulse;

    if (shatterPayload) {
      const origins = this.uniforms.uShatterOrigin.value;
      const ages = this.uniforms.uShatterAge.value;
      const seeds = this.uniforms.uShatterSeed.value;
      const strengths = this.uniforms.uShatterStrength.value;

      for (let i = 0; i < MAX_SHATTERS; i++) {
        origins[i].copy(shatterPayload.origins[i]);
        ages[i] = shatterPayload.ages[i];
        seeds[i] = shatterPayload.seeds[i];
        strengths[i] = shatterPayload.strengths[i];
      }
    }
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
