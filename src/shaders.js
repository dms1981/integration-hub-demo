import { choreography } from './choreography.glsl.js';

export const WAKE_COUNT = 96;
export const WAKE_LIFETIME = 10;

export const rippleField = /* glsl */ `
  vec3 rippleOffset(vec3 center, vec4 seed) {
    if (uWakeCount == 0 && uTip.z < 0.001) return vec3(0.0);
    vec4 projected = projectionMatrix * viewMatrix * vec4(center, 1.0);
    vec2 screen = projected.xy / projected.w;
    vec2 tipDelta = (screen - uTip.xy) * vec2(uAspect, 1.0);
    float tipDistance = length(tipDelta);
    float contact = uTip.z * (1.0 - smoothstep(0.002, 0.009, tipDistance));
    vec2 tipDirection = tipDelta / max(tipDistance, 0.0001);
    vec2 directionSum = vec2(0.0);
    float depthSum = 0.0;
    float weightSum = 0.0;
    for (int i = 0; i < ${WAKE_COUNT}; i++) {
      if (i >= uWakeCount) break;
      float sampleAge = uWake[i].z;
      float age = max(0.0, sampleAge - 0.45 * seed.y);
      vec2 delta = (screen - uWake[i].xy) * vec2(uAspect, 1.0);
      float radius = 0.02 + 0.075 * age;
      if (abs(delta.x) > radius + 0.45 || abs(delta.y) > radius + 0.45) continue;
      vec2 tangent = vec2(uWake[i].w, uWakeData[i].x);
      vec2 normal = vec2(-tangent.y, tangent.x);
      float along = dot(delta, tangent);
      float side = dot(delta, normal);
      if (along > 0.10 || along < -0.15 || abs(side) > radius + 0.30) continue;

      float damping = uWakeData[i].y * smoothstep(0.15, 0.8, age);
      float alongWeight = (1.0 - smoothstep(0.015, 0.10, along)) * (1.0 - smoothstep(0.04, 0.15, -along));
      float distanceFromCrest = abs(side) - radius;
      float crestDistance = distanceFromCrest / (distanceFromCrest < 0.0 ? mix(0.10, 0.16, seed.w) : mix(0.035, 0.075, seed.w));
      float troughDistance = (distanceFromCrest + 0.17) / 0.09;
      float crest = damping * alongWeight * exp(-crestDistance * crestDistance);
      float trough = 0.08 * damping * alongWeight * exp(-troughDistance * troughDistance);
      float force = crest - trough;
      directionSum += normal * sign(side) * force;
      depthSum += force * mix(0.65, 1.35, seed.z);
      weightSum += crest + trough;
    }
    float normalization = max(1.0, 0.8 * weightSum);
    vec3 cameraRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 cameraUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 cameraBack = cross(cameraRight, cameraUp);
    float worldPerScreen = projected.w / projectionMatrix[1][1];
    return worldPerScreen * (
      (0.15 * mix(0.06, 1.35, pow(seed.x, 1.4)) * (cameraRight * directionSum.x + cameraUp * directionSum.y)
        + 0.22 * cameraBack * depthSum) / normalization
      + contact * (0.018 * (cameraRight * tipDirection.x + cameraUp * tipDirection.y) + 0.140 * cameraBack)
    );
  }
`;

export const cubeVertex = /* glsl */ `
  attribute vec4 aSeed;
  attribute float aId;
  uniform float uTime, uBlend, uShatter, uAspect;
  uniform int uAct, uNext, uTarget, uWakeCount;
  uniform vec4 uWake[${WAKE_COUNT}];
  uniform vec2 uWakeData[${WAKE_COUNT}];
  uniform vec3 uTip;
  varying vec2 vFace;
  varying vec3 vWorld, vNormal;
  varying vec4 vPigment;

  ${choreography}
  ${rippleField}

  mat2 turn(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, s, -s, c);
  }

  vec3 tumble(vec3 p, mat2 a, mat2 b, mat2 c) {
    p.yz = a * p.yz;
    p.xz = b * p.xz;
    p.xy = c * p.xy;
    return p;
  }

  void main() {
    vec3 center = sculpt(uAct, aSeed, aId, uTime);
    float travel = 0.0;
    if (uBlend > 0.0) {
      vec3 destination = sculpt(uNext, aSeed, aId, uTime);
      float order = 0.64 * (0.5 + 0.5 * tanh(center.y * 0.39)) + 0.36 * aSeed.x;
      if (uAct == 1 || uAct == 3) order = 1.0 - order;
      travel = smoothstep(order * 0.36, 0.64 + order * 0.36, uBlend);
      float spill = 4.0 * travel * (1.0 - travel);
      center = mix(center, destination, travel);
      float swing = (uAct == 3 ? -1.0 : 1.0) * (0.77 + aSeed.y * 0.35);
      center.xz = turn(swing * spill) * center.xz;
      center += spill * vec3(
        (aSeed.z - 0.5) * 1.7,
        (aSeed.w - 0.5) * 1.5 - (uAct == 0 ? 1.8 : 0.46),
        (aSeed.x - 0.5) * 1.7
      );
    }

    if (uShatter > 0.0) {
      vec3 destination = sculpt(uTarget, aSeed, aId, uTime);
      float reform = smoothstep(0.15, 0.95, uShatter);
      float burst = smoothstep(0.0, 0.20, uShatter) * (1.0 - smoothstep(0.30, 0.94, uShatter));
      vec3 scatter = vec3(aSeed.xyz - 0.5) * 2.0;
      vec3 outward = normalize(center + 0.8 * scatter + vec3(0.0001));
      center = mix(center, destination, reform);
      center += burst * (outward * (0.95 + 1.3 * aSeed.w) + 0.65 * scatter);
    }

    center += rippleOffset(center, aSeed);

    float fleck = pow(aSeed.z, 7.0);
    float size = mix(0.048, 0.105, pow(aSeed.w, 1.8)) + 0.042 * fleck;
    float spin = uTime * (0.17 + aSeed.x * 0.39);
    mat2 x = turn(aSeed.y * 3.14159 + spin);
    mat2 y = turn(aSeed.z * 6.28318 - spin * 0.72);
    mat2 z = turn(aSeed.x * 6.28318 + spin * 0.6);
    vWorld = center + size * tumble(position, x, y, z);
    vNormal = tumble(normal, x, y, z);
    vFace = uv;
    vPigment = vec4(
      aSeed.y,
      fleck,
      sin(dot(center, vec3(0.43, 0.58, 0.38)) + 9.0 * aId - uTime * 0.37),
      aSeed.x
    );
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

export const cubeFragment = /* glsl */ `
  uniform vec3 uInk, uBody, uRim, uFire;
  uniform float uTime;
  varying vec2 vFace;
  varying vec3 vWorld, vNormal;
  varying vec4 vPigment;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 eye = normalize(cameraPosition - vWorld);
    vec3 key = normalize(vec3(-0.60, 0.66, 0.55));
    vec3 strip = normalize(vec3(0.78, 0.27, -0.51));
    float diffuse = max(dot(n, key), 0.0);
    float side = max(dot(n, strip), 0.0);
    float glint = pow(max(dot(n, normalize(key + eye)), 0.0), 24.0);
    float backGlint = pow(max(dot(n, normalize(strip + eye)), 0.0), 14.0);
    float grazing = pow(1.0 - max(dot(n, eye), 0.0), 2.3);

    float bands = 0.32 + vPigment.x * 0.40 + vPigment.z * 0.27;
    vec3 albedo = mix(uInk, uBody, smoothstep(0.17, 0.59, bands));
    albedo = mix(albedo, uRim, smoothstep(0.60, 0.97, bands));
    float ember = smoothstep(0.60, 1.0, vPigment.y);
    albedo = mix(albedo, uFire, ember);

    float facet = max(abs(vFace.x - 0.5), abs(vFace.y - 0.5));
    float bevel = smoothstep(0.41, 0.50, facet);
    vec3 lit = albedo * (0.29 + 0.86 * diffuse + 0.48 * side);
    lit += glint * (0.13 + 0.43 * albedo) + backGlint * 0.36 * uRim;
    lit += bevel * (0.04 * glint + 0.09 * grazing) * uRim;
    float current = 0.5 + 0.5 * sin(uTime * 0.97 - vWorld.y * 1.4 + vPigment.w * 1.3);
    lit += (0.16 + 0.65 * current) * ember * uFire;

    float depth = length(cameraPosition - vWorld);
    float haze = smoothstep(13.0, 29.0, depth) * 0.30;
    gl_FragColor = vec4(mix(lit, vec3(0.020, 0.023, 0.045), haze), 1.0);
  }
`;

export const stageVertex = /* glsl */ `
  varying vec2 vScreen;

  void main() {
    vScreen = position.xy;
    gl_Position = vec4(position.xy, 0.99, 1.0);
  }
`;

export const stageFragment = /* glsl */ `
  uniform float uAspect, uTime;
  uniform vec3 uWash;
  varying vec2 vScreen;

  float sq(float x) { return x * x; }

  void main() {
    vec2 p = vScreen;
    vec2 q = p * vec2(uAspect, 1.0);
    float aura = exp(-2.2 * dot(q - vec2(-0.04, 0.08), q - vec2(-0.04, 0.08)));
    float ceiling = exp(-4.0 * dot(q - vec2(-0.74, 0.88), q - vec2(-0.74, 0.88)));
    float horizon = exp(-38.0 * sq(p.y + 0.52)) * exp(-2.7 * sq(q.x));
    float pool = exp(-13.0 * sq(q.x) - 103.0 * sq(p.y + 0.73));
    float shade = exp(-46.0 * sq(q.x) - 385.0 * sq(p.y + 0.72));
    float sweep = exp(-5.0 * sq(q.x + 0.37 * q.y + 0.57 + 0.04 * sin(uTime * 0.16)));
    float vignette = 1.0 - 0.67 * smoothstep(0.42, 1.50, length(p * vec2(0.75, 0.93)));
    vec3 wall = vec3(0.0040, 0.0045, 0.0085);
    wall += aura * (vec3(0.0075, 0.0095, 0.0160) + uWash * 0.017);
    wall += ceiling * vec3(0.003, 0.004, 0.010) + sweep * aura * uWash * 0.004;
    wall += horizon * vec3(0.002, 0.0025, 0.003) + (pool - 0.55 * shade) * (0.005 + 0.018 * uWash);
    float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    gl_FragColor = vec4(max(wall * vignette + 0.0016 * (grain - 0.5), 0.0), 1.0);
  }
`;
