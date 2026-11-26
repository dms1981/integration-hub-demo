import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const FilmicGradeShader = {
  name: 'FilmicGradePass',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uExposure: { value: 1.00 },
    uChromaticAberration: { value: 0.0014 },
    uSaturation: { value: 1.15 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uExposure;
    uniform float uChromaticAberration;
    uniform float uSaturation;

    varying vec2 vUv;

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    vec3 linearToSRGB(vec3 c) {
      vec3 clamped = clamp(c, 0.0, 1.0);
      vec3 low = clamped * 12.92;
      vec3 high = 1.055 * pow(clamped, vec3(1.0 / 2.4)) - 0.055;
      return mix(low, high, step(vec3(0.0031308), clamped));
    }

    void main() {
      // Subtle radial chromatic aberration proportional to r^2, clamped so center stays razor sharp
      vec2 toCenter = vUv - 0.5;
      float r2 = dot(toCenter, toCenter);
      vec2 caOffset = toCenter * min(r2 * 2.0, 1.0) * uChromaticAberration;

      float r = texture2D(tDiffuse, clamp(vUv + caOffset, 0.0, 1.0)).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, clamp(vUv - caOffset, 0.0, 1.0)).b;
      vec3 col = max(vec3(r, g, b), vec3(0.0));

      // Exposure + Narkowicz ACES Filmic tone mapping
      col *= uExposure;
      col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
      col = clamp(col, 0.0, 1.0);

      // Subtle saturation polish to keep neon hues vibrant after ACES compression
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = clamp(mix(vec3(luma), col, uSaturation), 0.0, 1.0);

      // Gentle cinematic vignette blending down to 0.72 at far corners
      float vig = smoothstep(1.42, 0.35, length((vUv - 0.5) * vec2(1.18, 1.0)) * 1.45);
      col *= mix(0.72, 1.0, vig);

      // Exact linear-to-sRGB transfer (single conversion; renderer uses LinearSRGB + NoToneMapping)
      col = linearToSRGB(col);

      // Fine anti-banding triangular dither (±0.6 / 255.0) for smooth dark obsidian gradients
      float dither =
        (hash12(gl_FragCoord.xy) + hash12(gl_FragCoord.xy + vec2(17.13, 31.71)) - 1.0) *
        (0.6 / 255.0);
      col = clamp(col + dither, 0.0, 1.0);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class PostProcessing {
  public readonly composer: EffectComposer;
  public readonly renderPass: RenderPass;
  public readonly bloomPass: UnrealBloomPass;
  public readonly gradePass: ShaderPass;

  private currentPixelRatio: number;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    width: number,
    height: number,
    pixelRatio: number = renderer.getPixelRatio(),
  ) {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    const safePixelRatio = Math.max(0.5, Math.min(pixelRatio, 2));
    this.currentPixelRatio = safePixelRatio;

    const samples = renderer.capabilities.isWebGL2
      ? Math.min(4, renderer.capabilities.maxSamples || 0)
      : 0;

    // Pass logical dimensions; resize() below expands targets and passes once by pixelRatio.
    const renderTarget = new THREE.WebGLRenderTarget(safeWidth, safeHeight, {
      type: THREE.HalfFloatType,
      samples,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    this.composer = new EffectComposer(renderer, renderTarget);

    this.renderPass = new RenderPass(scene, camera);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(safeWidth, safeHeight),
      0.48,
      0.52,
      0.86,
    );
    this.gradePass = new ShaderPass(FilmicGradeShader);

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.gradePass);

    this.composer.setPixelRatio(safePixelRatio);
    this.composer.setSize(safeWidth, safeHeight);
  }

  public render(): void {
    this.composer.render();
  }

  public resize(width: number, height: number, pixelRatio: number): void {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    const safePixelRatio = Math.max(0.5, Math.min(pixelRatio, 2));

    if (safePixelRatio !== this.currentPixelRatio) {
      this.currentPixelRatio = safePixelRatio;
      this.composer.setPixelRatio(safePixelRatio);
    }
    this.composer.setSize(safeWidth, safeHeight);
  }

  public setBloomStrength(v: number): void {
    this.bloomPass.strength = v;
  }

  public dispose(): void {
    this.renderPass.dispose();
    this.bloomPass.dispose();
    this.gradePass.dispose();
    this.composer.dispose();
  }
}
