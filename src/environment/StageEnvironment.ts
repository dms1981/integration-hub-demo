import * as THREE from 'three';
import { PALETTES, type PaletteColors } from '../sculpture/palettes';

const DUST_COUNT = 1100;
const FLOOR_Y = -13.2;

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKY_VERT = /* glsl */ `
varying vec3 vLocalDir;

void main() {
  vLocalDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uBgTint;
uniform vec3 uColPrimary;
uniform vec3 uColSecondary;
uniform float uCorePulse;

varying vec3 vLocalDir;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec3 d = normalize(vLocalDir);
  float horizonBand = exp(-abs(d.y - 0.04) * 3.4);
  float zenithMask = smoothstep(-0.25, 0.85, d.y);

  vec3 obsidianDeep = vec3(0.004, 0.006, 0.014);
  vec3 galleryGlow = mix(obsidianDeep, uBgTint * 0.46, horizonBand * (0.72 + 0.18 * uCorePulse));

  // Subtle chromatic gallery wash along the horizon (integer az harmonic prevents ±PI seam)
  float az = atan(d.z, d.x);
  vec3 chromaWash = mix(uColPrimary, uColSecondary, 0.5 + 0.5 * sin(az * 2.0)) * 0.014;
  vec3 col = galleryGlow + chromaWash * horizonBand * (0.75 + 0.35 * uCorePulse);
  col = mix(col, obsidianDeep * 0.72, zenithMask * 0.55);

  // Subtle anti-banding triangular dither
  float n = (hash12(gl_FragCoord.xy) + hash12(gl_FragCoord.xy + 19.37) - 1.0) / 255.0;
  col = max(col + n, vec3(0.0));

  gl_FragColor = vec4(col, 1.0);
}
`;

const FLOOR_VERT = /* glsl */ `
varying vec3 vWorldPos;
varying vec2 vPlanePos;

void main() {
  vPlanePos = position.xy;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FLOOR_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uBgTint;
uniform vec3 uColPrimary;
uniform vec3 uColSecondary;
uniform vec3 uColHighlight;
uniform float uCorePulse;
uniform vec3 uShatterOrigin;
uniform float uShatterAge;

varying vec3 vWorldPos;
varying vec2 vPlanePos;

void main() {
  float r = length(vPlanePos);
  float ang = atan(vPlanePos.y, vPlanePos.x);

  // Smooth fade to zero toward perimeter so no hard floor edge is ever visible
  float edgeFade = smoothstep(68.0, 14.0, r);
  if (edgeFade <= 0.001) {
    discard;
  }

  vec3 N = vec3(0.0, 1.0, 0.0);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 4.0);

  // Satin obsidian base with subtle concentric brushed micro-roughness
  float brushRings = 0.5 + 0.5 * sin(r * 3.6 + 0.25 * sin(ang * 6.0));
  float fineGrain = 0.5 + 0.5 * sin(r * 19.0 - ang * 4.0);
  float microRough = mix(0.86, 1.08, brushRings * 0.65 + fineGrain * 0.35);

  vec3 obsidianBase = mix(vec3(0.004, 0.005, 0.011), uBgTint * 0.22, 0.38);

  // Living reactive neon reflection pool directly beneath the sculpture
  float poolCore = exp(-(r * r) * 0.0075);
  float poolWide = exp(-(r * r) * 0.0018);

  float centerSmooth = smoothstep(0.0, 5.5, r);
  float shimmer1 = 0.5 + 0.5 * sin(r * 0.58 - uTime * 1.15 + sin(ang * 3.0 + uTime * 0.35) * centerSmooth);
  float shimmer2 = 0.5 + 0.5 * cos(r * 0.36 + uTime * 0.85 - ang * 2.0 * centerSmooth);
  float caustic = mix(0.74, 1.24, shimmer1 * 0.6 + shimmer2 * 0.4);

  float angularMix = 0.5 + 0.5 * sin(ang * 2.0 - uTime * 0.28 + r * 0.09) * centerSmooth;
  vec3 poolTint = mix(uColPrimary, uColSecondary, angularMix);
  float pulseFactor = 0.78 + 0.52 * uCorePulse;

  vec3 reflectionPool =
    poolTint * poolWide * (0.08 * caustic * microRough * pulseFactor) +
    mix(poolTint, uColHighlight, 0.48) * poolCore * (0.11 * pulseFactor);

  // Grazing Fresnel sheen across the gallery floor
  vec3 grazingSheen = mix(uBgTint, poolTint, 0.35) * fresnel * (0.10 * poolWide + 0.03) * microRough;

  // Whisper-subtle dark architectural ring accent for gallery refinement (masked clear at center)
  float archRing = smoothstep(0.96, 1.0, sin(r * 1.25)) * 0.025 * poolWide * smoothstep(2.4, 7.0, r);
  vec3 ringAccent = mix(uColPrimary, uColHighlight, 0.35) * archRing;

  vec3 shatterRipple = vec3(0.0);
  if (uShatterAge >= 0.0 && uShatterAge < 2.4) {
    float dImpact = length(vWorldPos.xz - uShatterOrigin.xz);
    float ringR = uShatterAge * 14.0;
    float ringWidth = 1.6 + uShatterAge * 1.1;
    float ringWave = exp(-pow((dImpact - ringR) / ringWidth, 2.0));
    float ringFade = smoothstep(0.0, 0.05, uShatterAge) * exp(-uShatterAge * 1.30);
    vec3 rippleCol = mix(uColPrimary, uColHighlight, 0.52);
    shatterRipple = rippleCol * ringWave * ringFade * 0.42 * edgeFade;
  }

  vec3 col = obsidianBase + reflectionPool + grazingSheen + ringAccent + shatterRipple;
  float alpha = edgeFade * (0.94 - 0.14 * (1.0 - poolWide));

  gl_FragColor = vec4(col, alpha);
}
`;

const AURA_VERT = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  // Camera-facing view-space billboard centered at mesh origin
  vec4 mvCenter = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mvCenter.xy += position.xy;
  gl_Position = projectionMatrix * mvCenter;
}
`;

const AURA_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColPrimary;
uniform vec3 uColSecondary;
uniform vec3 uColHighlight;
uniform float uCorePulse;

varying vec2 vUv;

void main() {
  vec2 centered = (vUv - 0.5) * 2.0;
  float r = length(centered);
  if (r >= 1.0) {
    discard;
  }

  float ang = atan(centered.y, centered.x);
  float radial = exp(-r * r * 4.4) * smoothstep(1.0, 0.15, r);
  float inner = exp(-r * r * 14.0);
  float swirl = 0.5 + 0.5 * sin(ang * 2.0 - uTime * 0.45 + r * 3.0);

  vec3 outerTint = mix(uColPrimary, uColSecondary, swirl);
  vec3 col = mix(outerTint, uColHighlight, inner * 0.28);

  float opacity = mix(0.05, 0.11, clamp(uCorePulse, 0.0, 1.0));
  float alpha = radial * opacity;

  gl_FragColor = vec4(col * alpha, alpha);
}
`;

const DUST_VERT = /* glsl */ `
attribute vec3 aSeed;

uniform float uTime;
uniform float uPixelRatio;

varying vec3 vSeed;
varying float vTwinkle;

void main() {
  vSeed = aSeed;

  // Slow orbital drift and gentle upward rise wrapped smoothly within y = [-10, 18]
  float orbitSpeed = (0.018 + 0.026 * aSeed.x) * (aSeed.y > 0.5 ? 1.0 : -1.0);
  float angle = uTime * orbitSpeed;
  float ca = cos(angle);
  float sa = sin(angle);

  vec3 p = position;
  p.xz = mat2(ca, -sa, sa, ca) * p.xz;

  float spanY = 28.0;
  float driftY = p.y + uTime * (0.14 + 0.18 * aSeed.y);
  p.y = mod(driftY + 10.0, spanY) - 10.0;

  // Fade gently near vertical wrap boundaries
  float yFade = smoothstep(-10.0, -7.0, p.y) * smoothstep(18.0, 15.0, p.y);
  float twinkle = 0.55 + 0.45 * sin(uTime * (0.9 + 1.6 * aSeed.z) + aSeed.x * 62.8318);
  vTwinkle = twinkle * yFade;

  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  float baseSize = mix(1.8, 4.2, aSeed.z);
  gl_PointSize = clamp(baseSize * uPixelRatio * (24.0 / max(-mvPosition.z, 1.0)), 1.0, 9.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const DUST_FRAG = /* glsl */ `
uniform vec3 uColPrimary;
uniform vec3 uColSecondary;
uniform vec3 uColHighlight;
uniform float uCorePulse;

varying vec3 vSeed;
varying float vTwinkle;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float distSq = dot(c, c);
  if (distSq > 0.25) {
    discard;
  }

  float falloff = exp(-distSq * 18.0) * smoothstep(0.25, 0.06, distSq);
  vec3 tint = mix(uColPrimary, uColSecondary, vSeed.x);
  tint = mix(tint, uColHighlight, 0.35 * vSeed.z);

  float alpha = falloff * vTwinkle * (0.24 + 0.10 * uCorePulse);
  gl_FragColor = vec4(tint * alpha, alpha);
}
`;

export class StageEnvironment {
  public readonly group: THREE.Group;

  private readonly skyGeo: THREE.SphereGeometry;
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly floorGeo: THREE.CircleGeometry;
  private readonly floorMat: THREE.ShaderMaterial;
  private readonly auraGeo: THREE.PlaneGeometry;
  private readonly auraMat: THREE.ShaderMaterial;
  private readonly dustGeo: THREE.BufferGeometry;
  private readonly dustMat: THREE.ShaderMaterial;

  constructor(initialPalette: PaletteColors = PALETTES[0]) {
    this.group = new THREE.Group();
    this.group.name = 'StageEnvironment';

    // 1. Atmospheric Obsidian Sky Dome
    this.skyGeo = new THREE.SphereGeometry(110, 32, 24);
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uBgTint: { value: initialPalette.bgTint.clone() },
        uColPrimary: { value: initialPalette.primary.clone() },
        uColSecondary: { value: initialPalette.secondary.clone() },
        uCorePulse: { value: 0.15 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
    });
    const skyMesh = new THREE.Mesh(this.skyGeo, this.skyMat);
    skyMesh.name = 'ObsidianSkyDome';
    skyMesh.renderOrder = -2;
    this.group.add(skyMesh);

    // 2. Satin Obsidian Reflective Gallery Floor
    this.floorGeo = new THREE.CircleGeometry(68, 96);
    this.floorMat = new THREE.ShaderMaterial({
      vertexShader: FLOOR_VERT,
      fragmentShader: FLOOR_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uBgTint: { value: initialPalette.bgTint.clone() },
        uColPrimary: { value: initialPalette.primary.clone() },
        uColSecondary: { value: initialPalette.secondary.clone() },
        uColHighlight: { value: initialPalette.highlight.clone() },
        uCorePulse: { value: 0.15 },
        uShatterOrigin: { value: new THREE.Vector3(0, 1.0, 0) },
        uShatterAge: { value: -1 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });
    const floorMesh = new THREE.Mesh(this.floorGeo, this.floorMat);
    floorMesh.name = 'ObsidianGalleryFloor';
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = FLOOR_Y;
    floorMesh.renderOrder = -1;
    this.group.add(floorMesh);

    // 3. Subtle Volumetric Core Aura
    this.auraGeo = new THREE.PlaneGeometry(11, 11);
    this.auraMat = new THREE.ShaderMaterial({
      vertexShader: AURA_VERT,
      fragmentShader: AURA_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uColPrimary: { value: initialPalette.primary.clone() },
        uColSecondary: { value: initialPalette.secondary.clone() },
        uColHighlight: { value: initialPalette.highlight.clone() },
        uCorePulse: { value: 0.15 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });
    const auraMesh = new THREE.Mesh(this.auraGeo, this.auraMat);
    auraMesh.name = 'VolumetricCoreAura';
    auraMesh.position.set(0, 1.0, 0);
    auraMesh.frustumCulled = false;
    this.group.add(auraMesh);

    // 4. Atmospheric Micro-Dust Motes
    this.dustGeo = this.createDustGeometry();
    this.dustMat = new THREE.ShaderMaterial({
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: {
          value: typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1,
        },
        uColPrimary: { value: initialPalette.primary.clone() },
        uColSecondary: { value: initialPalette.secondary.clone() },
        uColHighlight: { value: initialPalette.highlight.clone() },
        uCorePulse: { value: 0.15 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });
    const dustPoints = new THREE.Points(this.dustGeo, this.dustMat);
    dustPoints.name = 'AtmosphericDustMotes';
    dustPoints.frustumCulled = false;
    this.group.add(dustPoints);
  }

  public update(
    time: number,
    palette: PaletteColors,
    corePulse: number,
    shatterOrigin?: THREE.Vector3,
    shatterAge = -1,
  ): void {
    this.skyMat.uniforms.uBgTint.value.copy(palette.bgTint);
    this.skyMat.uniforms.uColPrimary.value.copy(palette.primary);
    this.skyMat.uniforms.uColSecondary.value.copy(palette.secondary);
    this.skyMat.uniforms.uCorePulse.value = corePulse;

    this.floorMat.uniforms.uTime.value = time;
    this.floorMat.uniforms.uBgTint.value.copy(palette.bgTint);
    this.floorMat.uniforms.uColPrimary.value.copy(palette.primary);
    this.floorMat.uniforms.uColSecondary.value.copy(palette.secondary);
    this.floorMat.uniforms.uColHighlight.value.copy(palette.highlight);
    this.floorMat.uniforms.uCorePulse.value = corePulse;
    if (shatterOrigin) {
      this.floorMat.uniforms.uShatterOrigin.value.copy(shatterOrigin);
    }
    this.floorMat.uniforms.uShatterAge.value = shatterAge;

    this.auraMat.uniforms.uTime.value = time;
    this.auraMat.uniforms.uColPrimary.value.copy(palette.primary);
    this.auraMat.uniforms.uColSecondary.value.copy(palette.secondary);
    this.auraMat.uniforms.uColHighlight.value.copy(palette.highlight);
    this.auraMat.uniforms.uCorePulse.value = corePulse;

    this.dustMat.uniforms.uTime.value = time;
    this.dustMat.uniforms.uColPrimary.value.copy(palette.primary);
    this.dustMat.uniforms.uColSecondary.value.copy(palette.secondary);
    this.dustMat.uniforms.uColHighlight.value.copy(palette.highlight);
    this.dustMat.uniforms.uCorePulse.value = corePulse;
  }

  public setPixelRatio(pixelRatio: number): void {
    this.dustMat.uniforms.uPixelRatio.value = Math.min(pixelRatio, 2);
  }

  public dispose(): void {
    this.skyGeo.dispose();
    this.skyMat.dispose();
    this.floorGeo.dispose();
    this.floorMat.dispose();
    this.auraGeo.dispose();
    this.auraMat.dispose();
    this.dustGeo.dispose();
    this.dustMat.dispose();
  }

  private createDustGeometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(DUST_COUNT * 3);
    const seeds = new Float32Array(DUST_COUNT * 3);
    const rand = createMulberry32(0x44555354);

    for (let i = 0; i < DUST_COUNT; i++) {
      // Wide atmospheric shell r = 13..42, y = -10..18
      const r = 13 + Math.pow(rand(), 0.78) * 29;
      const theta = rand() * Math.PI * 2;
      const y = -10 + rand() * 28;

      const i3 = i * 3;
      positions[i3] = Math.cos(theta) * r;
      positions[i3 + 1] = y;
      positions[i3 + 2] = Math.sin(theta) * r;

      seeds[i3] = rand();
      seeds[i3 + 1] = rand();
      seeds[i3 + 2] = rand();
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, 0), 46);
    return geo;
  }
}
