attribute float aNormId;
attribute vec4 aSeed;
attribute vec3 aGrid3;
attribute vec2 aSurfaceUV;

uniform float uTime;
uniform float uFromFormation;
uniform float uToFormation;
uniform float uMorph;
uniform vec3 uColShadow;
uniform vec3 uColPrimary;
uniform vec3 uColSecondary;
uniform vec3 uColHighlight;
uniform vec3 uShatterOrigin[3];
uniform float uShatterAge[3];
uniform float uShatterSeed[3];
uniform float uShatterStrength[3];

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vBaseColor;
varying vec3 vRimColor;
varying float vEnergy;
varying float vAo;
varying float vDepth;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;
const float GOLDEN_ANGLE = 2.39996322973;

vec3 safeNormalize(vec3 v, vec3 fallback) {
  float lenSq = dot(v, v);
  if (lenSq < 1e-8) {
    return fallback;
  }
  return v * inversesqrt(lenSq);
}

mat3 rotateX(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(
    1.0, 0.0, 0.0,
    0.0,   c,  -s,
    0.0,   s,   c
  );
}

mat3 rotateY(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(
      c, 0.0,   s,
    0.0, 1.0, 0.0,
     -s, 0.0,   c
  );
}

mat3 rotateZ(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(
      c,  -s, 0.0,
      s,   c, 0.0,
    0.0, 0.0, 1.0
  );
}

mat3 rotateAxis(vec3 axis, float angle) {
  vec3 a = safeNormalize(axis, vec3(0.0, 1.0, 0.0));
  float s = sin(angle);
  float c = cos(angle);
  float oc = 1.0 - c;
  return mat3(
    oc * a.x * a.x + c,       oc * a.x * a.y - a.z * s, oc * a.z * a.x + a.y * s,
    oc * a.x * a.y + a.z * s, oc * a.y * a.y + c,       oc * a.y * a.z - a.x * s,
    oc * a.z * a.x - a.y * s, oc * a.y * a.z + a.x * s, oc * a.z * a.z + c
  );
}

mat3 basisFromDir(vec3 dir, float roll) {
  vec3 fwd = safeNormalize(dir, vec3(0.0, 1.0, 0.0));
  vec3 refUp = abs(fwd.y) > 0.94 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 right = safeNormalize(cross(refUp, fwd), vec3(1.0, 0.0, 0.0));
  vec3 up = cross(fwd, right);

  float cr = cos(roll);
  float sr = sin(roll);
  vec3 rRolled = right * cr + up * sr;
  vec3 uRolled = -right * sr + up * cr;

  return mat3(rRolled, uRolled, fwd);
}

vec3 curlField(vec3 p, float t) {
  vec3 q = p + vec3(t * 0.31, -t * 0.23, t * 0.19);
  vec3 a = vec3(
    sin(q.y * 1.35 + cos(q.z * 1.15 + t * 0.5)),
    sin(q.z * 1.35 + cos(q.x * 1.15 - t * 0.45)),
    sin(q.x * 1.35 + cos(q.y * 1.15 + t * 0.4))
  );
  vec3 q2 = p * 2.15 - vec3(t * 0.42, t * 0.37, -t * 0.29);
  vec3 b = vec3(
    cos(q2.y - sin(q2.z)),
    cos(q2.z - sin(q2.x)),
    cos(q2.x - sin(q2.y))
  );
  return a * 0.72 + b * 0.28;
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 mixVivid(vec3 a, vec3 b, float t) {
  float k = clamp(t, 0.0, 1.0);
  if (k <= 0.0001) return a;
  if (k >= 0.9999) return b;
  vec3 hsvA = rgb2hsv(max(a, vec3(0.0)));
  vec3 hsvB = rgb2hsv(max(b, vec3(0.0)));
  float dh = hsvB.x - hsvA.x;
  if (dh > 0.5) dh -= 1.0;
  else if (dh < -0.5) dh += 1.0;
  float h = fract(hsvA.x + dh * k);
  float s = clamp(mix(hsvA.y, hsvB.y, k) + 0.08 * sin(k * PI), 0.0, 1.0);
  float v = mix(hsvA.z, hsvB.z, k);
  return hsv2rgb(vec3(h, s, v));
}

vec3 samplePalette(float param) {
  float c = clamp(param, 0.0, 1.0);
  vec3 col = mix(uColShadow, uColPrimary, smoothstep(0.0, 0.38, c));
  col = mixVivid(col, uColSecondary, smoothstep(0.36, 0.74, c));
  col = mixVivid(col, uColHighlight, smoothstep(0.72, 1.0, c));
  return col;
}

vec3 silkRibbonCenter(float along, float ribbonIdx, float t) {
  float angleOffset = ribbonIdx * (TAU / 6.0);
  float s = (along - 0.5) * 2.0;
  float uAngle = s * PI * 1.45 + angleOffset + t * 0.14;
  float rad = 5.4 + 2.9 * sin(s * PI * 2.0 + ribbonIdx * 1.05 + t * 0.45);
  float py = -6.5 * s + 1.35 * sin(s * PI * 3.0 + angleOffset - t * 0.7);
  return vec3(rad * cos(uAngle), py, rad * sin(uAngle));
}

vec3 trefoilCurve(float s, float t) {
  float rBase = 5.9 + 2.65 * cos(3.0 * s) + 0.55 * sin(5.0 * s - t * 0.6);
  float x = rBase * cos(2.0 * s);
  float z = rBase * sin(2.0 * s);
  float y = 3.9 * sin(3.0 * s) + 1.15 * cos(5.0 * s + t * 0.45);
  return vec3(x, y, z);
}

void evaluateFormation(
  int id,
  float t,
  out vec3 pos,
  out vec3 dir,
  out float scale,
  out float colorParam,
  out float energy
) {
  if (id == 0) {
    // 0: Vortex Torus — 5 distinct braided sculptural ribbons around an open central eye
    float u = aSurfaceUV.x;
    float v = aSurfaceUV.y;
    float strandIdx = floor(v * 5.0);
    float strandAcross = fract(v * 5.0) - 0.5;
    float theta = u * TAU + t * 0.22;
    float phi = strandIdx * (TAU / 5.0) + theta * 1.6 + t * 0.38 + strandAcross * 0.52;

    float majorR = 7.9 + 0.35 * cos(5.0 * theta - t * 0.65);
    float tubeR = 1.65 + 0.42 * sin(3.0 * theta - t * 0.8) + (aSeed.x - 0.5) * 0.42;

    float cTheta = cos(theta);
    float sTheta = sin(theta);
    float cPhi = cos(phi);
    float sPhi = sin(phi);

    float radial = majorR + tubeR * cPhi;
    vec3 rawPos = vec3(radial * cTheta, tubeR * sPhi * 1.12, radial * sTheta);

    vec3 dTheta = vec3(-radial * sTheta, 0.0, radial * cTheta);
    vec3 dPhi = vec3(-tubeR * sPhi * cTheta, tubeR * cPhi * 1.12, -tubeR * sPhi * sTheta);
    vec3 rawDir = safeNormalize(dTheta + dPhi * 1.6, vec3(0.0, 1.0, 0.0));

    mat3 tilt = rotateX(0.48) * rotateZ(0.16 * sin(t * 0.22));
    pos = tilt * rawPos;
    dir = tilt * rawDir;

    float wave = 0.5 + 0.5 * sin(5.0 * phi - 3.0 * theta + t * 2.25);
    float pulse = pow(max(wave, 0.0001), 4.0);

    scale = mix(0.15, 0.30, 0.40 * aSeed.y + 0.60 * wave);
    colorParam = clamp(
      0.14 + 0.64 * (0.5 + 0.5 * sin(phi * 1.0 - theta * 0.6 + t * 0.45)) + 0.22 * pulse,
      0.0,
      1.0
    );
    energy = 0.10 + 0.85 * pulse * smoothstep(0.35, 0.95, aSeed.x);

  } else if (id == 1) {
    // 1: Kinetic Monolith — suspended architectural 30x12x30 wave interference lattice
    vec3 g = aGrid3;
    float x = g.x * 10.0;
    float y = g.y * 2.6;
    float z = g.z * 10.0;

    float d = length(g.xz);
    float p1 = g.x * 4.2 + g.z * 3.6 - t * 1.65;
    float p2 = g.x * 3.1 - g.z * 4.4 + t * 1.25;
    float p3 = d * 6.5 - t * 2.15;
    float radialEnv = exp(-d * 0.65);

    float w1 = sin(p1);
    float w2 = sin(p2);
    float w3 = cos(p3) * radialEnv;
    float h = w1 * 0.42 + w2 * 0.30 + w3 * 0.54;

    float dhdx = cos(p1) * 4.2 * 0.42 + cos(p2) * 3.1 * 0.30
      - sin(p3) * 6.5 * radialEnv * (g.x / max(d, 0.05)) * 0.54;
    float dhdz = cos(p1) * 3.6 * 0.42 - cos(p2) * 4.4 * 0.30
      - sin(p3) * 6.5 * radialEnv * (g.z / max(d, 0.05)) * 0.54;

    float yLift = h * (1.85 + 0.55 * g.y);
    float xzSpread = 1.0 + 0.05 * h;
    vec3 rawPos = vec3(x * xzSpread, y + yLift, z * xzSpread);
    vec3 rawDir = safeNormalize(vec3(-dhdx * 0.14, 1.0, -dhdz * 0.14), vec3(0.0, 1.0, 0.0));

    mat3 poise = rotateY(t * 0.06) * rotateZ(0.08 * sin(t * 0.34)) * rotateX(0.11 * cos(t * 0.27));
    pos = poise * rawPos;
    dir = poise * rawDir;

    float crest = smoothstep(0.24, 1.02, h) * smoothstep(-0.35, 1.0, g.y);
    float edgeRim = smoothstep(0.84, 1.0, max(abs(g.x), abs(g.z))) * 0.25;

    scale = mix(0.16, 0.40, clamp(0.28 + 0.48 * crest + 0.22 * (0.5 + 0.5 * g.y), 0.0, 1.0));
    colorParam = clamp(0.42 + 0.38 * h + 0.20 * g.y + edgeRim * 0.35, 0.0, 1.0);
    energy = 0.08 + 0.98 * pow(max(crest, 0.0001), 1.45) + edgeRim * max(0.0, w1 * 0.5 + 0.5);

  } else if (id == 2) {
    // 2: Silk Cascades — 6 intertwining zero-G luminous ribbons
    float ribbonIdx = floor(aSurfaceUV.y * 6.0);
    float ribbonAcross = fract(aSurfaceUV.y * 6.0) - 0.5;
    float along = fract(aSurfaceUV.x - t * 0.055 + ribbonIdx / 6.0);

    float endFade = smoothstep(0.0, 0.085, along) * smoothstep(1.0, 0.915, along);

    vec3 cPos = silkRibbonCenter(along, ribbonIdx, t);
    vec3 cNext = silkRibbonCenter(along + 0.004, ribbonIdx, t);
    vec3 T = safeNormalize(cNext - cPos, vec3(0.0, -1.0, 0.0));
    vec3 outward = safeNormalize(vec3(cPos.x, 0.15, cPos.z), vec3(1.0, 0.0, 0.0));
    vec3 B = safeNormalize(cross(T, outward), vec3(1.0, 0.0, 0.0));
    vec3 N = safeNormalize(cross(B, T), vec3(0.0, 1.0, 0.0));

    float twist = along * TAU * 1.5 + ribbonIdx * 1.047 + t * 0.4;
    float ct = cos(twist);
    float st = sin(twist);
    vec3 ribRight = B * ct + N * st;
    vec3 ribNormal = -B * st + N * ct;

    float width = (2.25 + 0.55 * sin(along * TAU * 2.0 - t * 1.15)) * (0.4 + 0.6 * endFade);
    float ripple = 0.52 * sin(along * 18.0 - t * 2.8 + ribbonAcross * 5.2 + ribbonIdx * 1.3);

    pos = cPos + ribRight * (ribbonAcross * width) + ribNormal * ripple;
    dir = T;

    float pulse = pow(
      max(0.5 + 0.5 * sin(along * TAU * 3.0 - t * 2.6 + ribbonIdx * 1.05), 0.0001),
      4.0
    );
    float edgeGlow = smoothstep(0.30, 0.50, abs(ribbonAcross));

    scale = mix(0.15, 0.30, 0.54 * (1.0 - abs(ribbonAcross) * 1.05) + 0.46 * pulse)
      * (0.04 + 0.96 * endFade);
    colorParam = clamp(
      0.12 + 0.66 * (0.5 + 0.5 * sin(along * TAU + ribbonIdx * 1.05 - t * 0.5)) + 0.22 * edgeGlow,
      0.0,
      1.0
    );
    energy = (0.10 + 0.72 * pulse + 0.22 * edgeGlow * (0.5 + 0.5 * sin(along * 14.0 - t * 2.2)))
      * endFade;

  } else if (id == 3) {
    // 3: Crystalline Astrolabe — 4 concentric architectural shells & faceted crystal core
    if (aNormId < 0.14) {
      // Layer 0: Rich faceted glowing crystal Fibonacci core
      float u = aNormId / 0.14;
      float idx = floor(u * 1512.0);
      float yFib = 1.0 - 2.0 * (idx + 0.5) / 1512.0;
      float rFib = sqrt(max(0.0, 1.0 - yFib * yFib));
      float phiFib = idx * GOLDEN_ANGLE;
      vec3 fibDir = vec3(cos(phiFib) * rFib, yFib, sin(phiFib) * rFib);

      float coreR = 2.55 + 0.25 * sin(t * 2.4 + yFib * 5.0) + 0.28 * (aSeed.x - 0.5);
      mat3 rotCore = rotateY(t * 0.45) * rotateX(t * 0.26);
      pos = rotCore * (fibDir * coreR);
      dir = safeNormalize(pos, vec3(0.0, 1.0, 0.0));
      scale = mix(0.18, 0.33, 0.5 + 0.5 * sin(t * 2.8 + aSeed.y * TAU));
      colorParam = clamp(0.62 + 0.38 * aSeed.z, 0.0, 1.0);
      energy = 0.34 + 0.52 * pow(max(0.5 + 0.5 * sin(t * 2.8 + yFib * 6.0 + aSeed.x * TAU), 0.0001), 3.0);

    } else if (aNormId < 0.48) {
      // Layer 1: Precision-machined inner 3-track armillary cage (r = 5.8)
      float u = (aNormId - 0.14) / 0.34;
      float band = floor(u * 6.0);
      float inBand = fract(u * 6.0);
      float ringIdx = floor(inBand * 612.0);
      float row = mod(ringIdx, 3.0) - 1.0;
      float col = floor(ringIdx / 3.0) / 204.0;
      float ang = col * TAU;
      float bandW = row * 0.34;
      float bandThick = (aSeed.y - 0.5) * 0.18;
      float r = 5.8 + bandThick;

      vec3 ringP = vec3(r * cos(ang), bandW, r * sin(ang));
      vec3 ringT = vec3(-sin(ang), 0.0, cos(ang));

      mat3 bandTilt = rotateX(0.0);
      if (band < 0.5) {
        bandTilt = rotateX(0.0);
      } else if (band < 1.5) {
        bandTilt = rotateX(PI * 0.5);
      } else if (band < 2.5) {
        bandTilt = rotateZ(PI * 0.5);
      } else if (band < 3.5) {
        bandTilt = rotateX(PI * 0.25) * rotateZ(PI * 0.25);
      } else if (band < 4.5) {
        bandTilt = rotateX(-PI * 0.25) * rotateZ(PI * 0.25);
      } else {
        bandTilt = rotateX(PI * 0.25) * rotateZ(-PI * 0.25);
      }

      mat3 gimbal = rotateY(-t * 0.34) * rotateX(0.42 + t * 0.19) * bandTilt;
      pos = gimbal * ringP;
      dir = gimbal * ringT;

      float pulse = pow(max(0.5 + 0.5 * sin(ang * 4.0 - t * 2.4 + band * 1.1), 0.0001), 4.0);
      scale = mix(0.20, 0.34, aSeed.z);
      colorParam = clamp(0.22 + 0.48 * (band / 5.0) + 0.16 * pulse, 0.0, 1.0);
      energy = 0.18 + 0.72 * pulse;

    } else if (aNormId < 0.82) {
      // Layer 2: Precision-machined outer 3-track meridian cage & latitude crowns (r = 8.4)
      float u = (aNormId - 0.48) / 0.34;
      float arch = floor(u * 6.0);
      float inArch = fract(u * 6.0);
      float ringIdx = floor(inArch * 612.0);
      float row = mod(ringIdx, 3.0) - 1.0;
      float col = floor(ringIdx / 3.0) / 204.0;
      float ang = col * TAU;
      float bandW = row * 0.40;
      float bandThick = (aSeed.y - 0.5) * 0.18;
      float r = 8.4 + bandThick;

      vec3 ringP = vec3(r * cos(ang), bandW, r * sin(ang));
      vec3 ringT = vec3(-sin(ang), 0.0, cos(ang));

      mat3 archTilt = rotateY(0.0);
      if (arch < 3.5) {
        archTilt = rotateY(arch * (PI * 0.25)) * rotateX(PI * 0.5);
      } else if (arch < 4.5) {
        // Upper latitude architectural crown
        float crownR = 6.45 + bandThick;
        ringP = vec3(crownR * cos(ang), 5.4 + row * 0.32, crownR * sin(ang));
      } else {
        // Lower latitude architectural crown
        float crownR = 6.45 + bandThick;
        ringP = vec3(crownR * cos(ang), -5.4 + row * 0.32, crownR * sin(ang));
      }

      mat3 outerRot = rotateY(t * 0.20) * rotateZ(-0.30 - t * 0.11) * archTilt;
      pos = outerRot * ringP;
      dir = outerRot * ringT;

      float pulse = pow(max(0.5 + 0.5 * sin(ang * 3.0 + t * 1.7 + arch), 0.0001), 4.0);
      scale = mix(0.22, 0.38, aSeed.w);
      colorParam = clamp(0.10 + 0.54 * (0.5 + 0.5 * safeNormalize(pos, vec3(0.0, 1.0, 0.0)).y) + 0.20 * pulse, 0.0, 1.0);
      energy = 0.12 + 0.60 * pulse;

    } else {
      // Layer 3: Precision twin-track Saturnian halo ring (r = 10.65 & 11.45)
      float u = (aNormId - 0.82) / 0.18;
      float haloIdx = floor(u * 1944.0);
      float track = mod(haloIdx, 2.0);
      float col = floor(haloIdx / 2.0) / 972.0;
      float ang = col * TAU + t * (track < 0.5 ? 0.15 : 0.11);
      float r = (track < 0.5 ? 10.65 : 11.45) + (aSeed.x - 0.5) * 0.14;
      float py = 0.14 * sin(ang * 6.0 - t * 1.4 + track * PI) + (aSeed.z - 0.5) * 0.10;

      vec3 rawP = vec3(r * cos(ang), py, r * sin(ang));
      vec3 rawT = vec3(-sin(ang), 0.0, cos(ang));
      mat3 haloTilt = rotateX(0.46) * rotateZ(-0.24);
      pos = haloTilt * rawP;
      dir = haloTilt * rawT;

      float pulse = pow(max(0.5 + 0.5 * sin(ang * 3.0 - t * 2.1), 0.0001), 5.0);
      scale = mix(0.15, 0.27, aSeed.w);
      colorParam = clamp(0.42 + 0.44 * (0.5 + 0.5 * sin(ang * 2.0 - t * 0.75)), 0.0, 1.0);
      energy = 0.22 + 0.62 * pulse;
    }

  } else if (id == 4) {
    // 4: Harmonic Attractor — dense 600x6x3 silky braided ribbon knot
    float idx = min(floor(aNormId * 10800.0 + 0.5), 10799.0);
    float strand = floor(idx / 3600.0);
    float inStrand = idx - strand * 3600.0;
    float stepAlong = floor(inStrand / 6.0) / 600.0;
    float across = (mod(inStrand, 6.0) / 5.0) - 0.5;
    float s = fract(stepAlong + t * 0.032) * TAU;

    vec3 cCenter = trefoilCurve(s, t);
    vec3 cNext = trefoilCurve(s + 0.01, t);
    vec3 cPrev = trefoilCurve(s - 0.01, t);

    vec3 T = safeNormalize(cNext - cPrev, vec3(1.0, 0.0, 0.0));
    vec3 refUp = abs(T.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 N0 = safeNormalize(cross(refUp, T), vec3(1.0, 0.0, 0.0));
    vec3 B0 = cross(T, N0);

    float twist = s * 3.0 + strand * (TAU / 3.0) + t * 0.55;
    float ct = cos(twist);
    float st = sin(twist);
    vec3 N = N0 * ct + B0 * st;
    vec3 B = -N0 * st + B0 * ct;

    float braidRadius = 0.78 + 0.20 * sin(s * 5.0 - t * 1.1);
    float ribbonWidth = 1.65;
    float thickness = (aSeed.x - 0.5) * 0.24;

    vec3 rawPos = cCenter + N * (braidRadius + thickness) + B * (across * ribbonWidth);
    mat3 slowSpin = rotateY(t * 0.13) * rotateX(0.22 * sin(t * 0.24));
    pos = slowSpin * rawPos;
    dir = slowSpin * T;

    float pulse = pow(
      max(0.5 + 0.5 * sin(s * 6.0 - t * 4.4 + strand * 2.0944), 0.0001),
      5.0
    );
    float edgeHighlight = smoothstep(0.32, 0.5, abs(across));

    scale = mix(0.15, 0.30, 0.48 * (1.0 - abs(across)) + 0.52 * pulse);
    colorParam = clamp(
      0.16 + 0.62 * (0.5 + 0.5 * sin(s * 3.0 + strand * 2.0944 - t * 0.7)) + 0.22 * pulse,
      0.0,
      1.0
    );
    energy = 0.12 + 0.82 * pulse + 0.16 * edgeHighlight;

  } else {
    // 5: Solaris Lotus — 3D golden-angle phyllotaxis blooming chandelier in 5 undulating petal tiers
    float u = aNormId;
    float tier = floor(min(u * 5.0, 4.0));
    float tierU = fract(u * 5.0);
    float idx = floor(u * 10800.0);

    float theta = idx * GOLDEN_ANGLE + t * (0.14 - tier * 0.02);
    float petalCount = 5.0 + tier * 2.0;
    float lobe = 0.5 + 0.5 * cos(theta * petalCount - tier * 0.85);
    float bloom = 0.5 + 0.5 * sin(t * 0.72 - tier * 0.55);

    float rBase = mix(1.0 + tier * 1.55, 2.7 + tier * 1.88, pow(max(tierU, 0.0001), 0.75));
    float r = rBase * (0.82 + 0.26 * lobe);
    float rNorm = clamp(r / 10.6, 0.0, 1.0);

    float radWave = sin(r * 0.78 - t * 2.15);
    float cupY = -2.8
      + pow(max(rNorm, 0.0001), 1.55) * (5.6 + 1.5 * bloom)
      - tier * 0.38
      + lobe * (0.75 + 0.75 * tierU)
      + 0.38 * radWave * rNorm;

    float ct = cos(theta);
    float st = sin(theta);
    pos = vec3(r * ct, cupY, r * st);
    dir = safeNormalize(vec3(ct, 0.42 + 0.75 * rNorm, st), vec3(0.0, 1.0, 0.0));

    float coreGlow = exp(-r * 0.36);
    float tipPulse = smoothstep(0.60, 1.0, tierU)
      * pow(max(0.5 + 0.5 * radWave, 0.0001), 2.0)
      * (0.4 + 0.6 * lobe);

    scale = mix(
      0.16,
      0.37,
      clamp(0.25 + 0.42 * lobe + 0.33 * (1.0 - abs(tierU - 0.55)), 0.0, 1.0)
    );
    colorParam = clamp(rNorm * 0.70 + 0.25 * lobe + 0.22 * coreGlow, 0.0, 1.0);
    energy = 0.10 + 0.54 * coreGlow + 0.64 * tipPulse;
  }
}

void main() {
  int fromId = int(floor(uFromFormation + 0.5));
  int toId = int(floor(uToFormation + 0.5));

  vec3 posA;
  vec3 dirA;
  float scaleA;
  float colorA;
  float energyA;
  evaluateFormation(fromId, uTime, posA, dirA, scaleA, colorA, energyA);

  vec3 finalPos = posA;
  vec3 finalDir = dirA;
  float finalScale = scaleA;
  float finalColorParam = colorA;
  float finalEnergy = energyA;
  float cascadeArc = 0.0;

  if (uMorph > 0.0001) {
    vec3 posB;
    vec3 dirB;
    float scaleB;
    float colorB;
    float energyB;
    evaluateFormation(toId, uTime, posB, dirB, scaleB, colorB, energyB);

    // Staggered cascade delay organizing cubes into ribbon-like rivers during morph
    float heightDelay = clamp((posA.y + 10.0) / 20.0, 0.0, 1.0);
    float radialDelay = clamp(length(posA.xz) / 14.0, 0.0, 1.0);
    float delay = clamp(
      heightDelay * 0.40 + radialDelay * 0.30 + aSurfaceUV.y * 0.20 + aSeed.w * 0.10,
      0.0,
      1.0
    );

    float win = 0.56;
    float start = delay * (1.0 - win);
    float localT = smoothstep(start, start + win, uMorph);
    cascadeArc = sin(localT * PI);

    float radialExpand = 1.0 + 0.36 * cascadeArc;
    vec3 basePos = mix(posA, posB, localT) * radialExpand;
    float ribbonPhase = sin(aSurfaceUV.y * TAU * 3.0 + aSeed.x * 1.4);
    float swirlAngle = cascadeArc * (1.75 + 0.55 * ribbonPhase);
    vec3 swirledPos = rotateY(swirlAngle) * basePos;
    swirledPos.y += cascadeArc * 1.35 * sin(swirlAngle * 1.5 + aSurfaceUV.x * TAU);
    vec3 curlDisp = curlField(basePos * 0.16, uTime * 0.55) * (cascadeArc * 2.15);

    finalPos = swirledPos + curlDisp;
    finalDir = safeNormalize(
      mix(dirA, dirB, localT) + curlDisp * 0.18,
      vec3(0.0, 1.0, 0.0)
    );
    finalScale = mix(scaleA, scaleB, localT) * (1.0 + 0.14 * cascadeArc);
    finalColorParam = mix(colorA, colorB, localT);
    float sparkMask = pow(max(cascadeArc, 0.0001), 2.8) * smoothstep(0.70, 0.98, aSeed.x);
    finalEnergy = mix(energyA, energyB, localT) * (1.0 - 0.38 * cascadeArc)
      + cascadeArc * 0.08
      + sparkMask * 0.58;
  }

  // Float sculpture gracefully above the obsidian gallery floor
  finalPos.y += 1.0;

  vec3 totalShatterDisp = vec3(0.0);
  mat3 shatterRot = mat3(1.0);
  float totalShockGlow = 0.0;
  float totalShockRing = 0.0;
  float totalShatterEnv = 0.0;

  for (int i = 0; i < 3; i++) {
    float age = uShatterAge[i];
    float strength = uShatterStrength[i];
    if (age >= 0.0 && age < 3.5 && strength > 0.001) {
      vec3 toCube = finalPos - uShatterOrigin[i];
      float dist = length(toCube);
      vec3 fallbackDir = safeNormalize(aSeed.xyz - 0.5, vec3(0.0, 1.0, 0.0));
      vec3 radialDir = safeNormalize(toCube, fallbackDir);

      // Fast spherical shockfront radiating outward from the exact click impact point
      float waveDelay = dist * 0.030 + aSeed.w * 0.065;
      float localAge = age - waveDelay;
      float localDur = 2.65 + 0.55 * aSeed.y;

      if (localAge > 0.0 && localAge < localDur) {
        float u = clamp(localAge / localDur, 0.0, 1.0);

        // Explosive crystalline burst -> zero-G hang -> C2-smooth magnetic reformation
        float rise = smoothstep(0.0, 0.22, u);
        float launch = 1.0 - pow(max(1.0 - rise, 0.0001), 2.6);
        float reform = pow(max(1.0 - smoothstep(0.24, 1.0, u), 0.0001), 2.35);
        float env = launch * reform;

        float prox = 1.0 / (1.0 + dist * 0.085);
        float blastDist = mix(2.6, 8.6, prox) * (0.62 + 0.76 * aSeed.x) * strength;

        float sSeed = uShatterSeed[i];
        vec3 jitter = safeNormalize(
          sin(aSeed.xyz * 19.7 + vec3(sSeed * 7.3, sSeed * 11.1, sSeed * 5.9)),
          vec3(0.0, 1.0, 0.0)
        );
        vec3 tangentSwirl = safeNormalize(
          cross(radialDir, vec3(0.0, 1.0, 0.25)),
          vec3(1.0, 0.0, 0.0)
        );
        float swirlArc = sin(u * PI) * (1.0 + 1.65 * prox) * (aSeed.z - 0.5) * 2.0;
        vec3 curlDrift = curlField(
          finalPos * 0.16 + uShatterOrigin[i] * 0.08,
          uTime * 0.75 + sSeed
        ) * (1.9 * sin(u * PI) * strength);

        vec3 disp = (radialDir + jitter * 0.42) * (blastDist * env)
          + tangentSwirl * (swirlArc * env)
          + curlDrift * env;
        disp.y += (0.95 * sin(u * PI) - 0.55 * u * env) * strength;
        totalShatterDisp += disp;

        vec3 tumbleAxis = safeNormalize(cross(radialDir, jitter), vec3(0.0, 1.0, 0.0));
        float tumbleAngle = env * (5.2 + 9.2 * aSeed.z) * (0.65 + 0.75 * prox) * strength;
        shatterRot = rotateAxis(tumbleAxis, tumbleAngle) * shatterRot;

        // Sharp luminous shockwave ring racing across the cubes + crystalline shard embers
        float shockRing = exp(-pow((localAge - 0.065) / 0.11, 2.0))
          * smoothstep(0.0, 0.025, localAge)
          * strength;
        float emberMask = smoothstep(0.42, 0.96, aSeed.x);
        totalShockGlow += shockRing * (0.76 + 0.48 * prox)
          + env * (0.14 + 0.54 * emberMask * (0.5 + 0.5 * prox)) * strength;
        totalShockRing += shockRing;
        totalShatterEnv += env * strength;
      }
    }
  }

  // Soft-compress combined displacement so overlapping multi-clicks stay framed & sculptural
  float dispLen = length(totalShatterDisp);
  if (dispLen > 0.0001) {
    float compressed = dispLen / (1.0 + dispLen / 16.0);
    finalPos += totalShatterDisp * (compressed / dispLen);
    // Keep flying shards smoothly above the obsidian gallery floor (y = -13.2)
    finalPos.y = max(finalPos.y, -12.2 + 0.4 * sin(aSeed.x * TAU));
  }

  float clampedRing = clamp(totalShockRing, 0.0, 1.0);
  float clampedEnv = clamp(totalShatterEnv, 0.0, 1.0);
  finalScale *= (1.0 + 0.18 * clampedRing - 0.12 * clampedEnv);
  finalColorParam = clamp(finalColorParam + clamp(clampedRing * 0.34 + clampedEnv * 0.12, 0.0, 0.44), 0.0, 1.0);
  finalEnergy = min(finalEnergy + clamp(totalShockGlow, 0.0, 1.22), 1.65);

  float axialRoll = aSeed.z * TAU + uTime * (0.28 + 0.35 * aSeed.y) + cascadeArc * 2.4;
  mat3 cubeBasis = shatterRot * basisFromDir(finalDir, axialRoll);

  vec3 localVertex = cubeBasis * (position * vec3(finalScale));
  vec3 displacedPos = finalPos + localVertex;

  vec4 worldPosition = modelMatrix * vec4(displacedPos, 1.0);
  vec4 viewPosition = viewMatrix * worldPosition;

  vWorldPos = worldPosition.xyz;
  vWorldNormal = safeNormalize(mat3(modelMatrix) * (cubeBasis * normal), vec3(0.0, 1.0, 0.0));
  vBaseColor = samplePalette(finalColorParam);
  vRimColor = mixVivid(
    mixVivid(uColPrimary, uColSecondary, smoothstep(0.18, 0.82, finalColorParam)),
    uColHighlight,
    clamp(finalEnergy * 0.35, 0.0, 0.65)
  );
  vEnergy = finalEnergy;

  float radialAo = 0.54 + 0.46 * clamp(length(finalPos - vec3(0.0, 1.0, 0.0)) / 9.5, 0.0, 1.0);
  vAo = mix(radialAo, 1.0, clamp(finalEnergy * 0.65, 0.0, 1.0));
  vDepth = -viewPosition.z;

  gl_Position = projectionMatrix * viewPosition;
}
