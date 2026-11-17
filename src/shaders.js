export const vertexShader = /* glsl */ `
attribute vec4 aRand;
attribute float aIdx;

uniform float uTime;
uniform float uMix;
uniform float uFrom;
uniform float uTo;
uniform float uStyle;
uniform float uCount;

varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;
varying float vCt;
varying float vGlow;
varying float vSpark;
varying float vPulse;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

mat3 rot(vec3 a, float ang) {
  a = normalize(a);
  float s = sin(ang), c = cos(ang), oc = 1.0 - c;
  return mat3(
    oc*a.x*a.x + c,     oc*a.x*a.y + a.z*s, oc*a.z*a.x - a.y*s,
    oc*a.x*a.y - a.z*s, oc*a.y*a.y + c,     oc*a.y*a.z + a.x*s,
    oc*a.z*a.x + a.y*s, oc*a.y*a.z - a.x*s, oc*a.z*a.z + c);
}

mat3 rotY(float a){ float s=sin(a), c=cos(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 rotX(float a){ float s=sin(a), c=cos(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }

// divergence-free swirl: each component depends only on the other two axes
vec3 curl(vec3 p, float t) {
  return vec3(
    sin(p.y*0.55 + t*0.9) + cos(p.z*0.83 - t*0.7),
    sin(p.z*0.61 - t*0.8) + cos(p.x*0.77 + t*0.6),
    sin(p.x*0.49 + t*0.7) + cos(p.y*0.91 - t*0.9));
}

vec3 knotP(float a) {
  float r = 2.0 + cos(3.0*a);
  return vec3(r*cos(2.0*a), r*sin(2.0*a), sin(3.0*a)) * 1.85;
}

vec3 lissa(float a, float k, float t) {
  return vec3(
    5.2*sin(3.0*a + k*1.05 + t*0.22),
    3.6*sin(2.0*a + k*0.71 - t*0.31),
    5.2*sin(5.0*a + k*0.43 + t*0.17 + 1.2) * cos(a + k*0.5));
}

// returns position; sz = cube size, ord = 0 (chaotic tumble) .. 1 (aligned)
vec3 formation(float id, float i, vec4 r, float t, out float sz, out float ord) {
  float u = i / uCount;
  sz = 0.11; ord = 0.0;
  vec3 p = vec3(0.0);

  if (id < 0.5) { // sphere
    float y = 1.0 - 2.0*(i + 0.5)/uCount;
    float rad = sqrt(max(1.0 - y*y, 0.0));
    float th = i * 2.399963;
    float R = 4.9 + 0.55*sin(y*7.0 - t*1.3 + sin(th*2.0 + t*0.4)) + 0.25*sin(th*3.0 + t*0.8);
    p = vec3(cos(th)*rad, y, sin(th)*rad) * R;
    sz = 0.09;
  } else if (id < 1.5) { // torus knot
    float a = u * TAU;
    p = knotP(a);
    vec3 tg = normalize(knotP(a + 0.01) - p);
    vec3 nn = normalize(cross(tg, vec3(0.0,0.0,1.0)) + 1e-4);
    vec3 bn = cross(tg, nn);
    float ang = r.z * TAU + t*0.5;
    float rr = (0.35 + 0.45*sqrt(r.y)) * (1.0 + 0.4*sin(a*12.0 - t*1.5));
    p += (nn*cos(ang) + bn*sin(ang)) * rr;
    p = rotY(t*0.15) * p;
    sz = 0.095;
  } else if (id < 2.5) { // triple helix
    float strand = mod(i, 3.0);
    float h = floor(i/3.0) / (uCount/3.0);
    float y = (h*2.0 - 1.0) * 7.0;
    float ang = y*0.9 + t*0.45 + strand*TAU/3.0;
    float rad = 2.6 + 0.9*sin(y*0.8 - t*0.6);
    p = vec3(cos(ang)*rad, y, sin(ang)*rad);
    p += (r.xyz - 0.5) * 0.9;
    sz = 0.1;
  } else if (id < 3.5) { // lattice
    float ix = mod(i, 25.0);
    float iy = mod(floor(i/25.0), 25.0);
    float iz = floor(i/625.0);
    p = (vec3(ix, iy, iz) - 12.0) * 0.52;
    p *= 1.0 + 0.12*sin(length(p)*1.1 - t*1.4);
    p += 0.22*sin(p.yzx*1.2 + t*0.9);
    p = rotY(p.y*0.045*sin(t*0.3) + t*0.12) * p;
    sz = 0.26; ord = 1.0;
  } else if (id < 4.5) { // galaxy vortex
    float arm = floor(r.z*4.0);
    float rr = 0.25 + pow(fract(i*0.618034), 0.72)*9.6;
    float ang = rr*0.42 - t*0.11 + 0.7*sin(t*0.23 - rr*0.5) + arm*PI*0.5 + (r.x-0.5)*(0.9/(0.6+rr*0.2));
    float h = (r.y-0.5) * (0.55 + 1.8*exp(-rr*0.55));
    p = vec3(cos(ang)*rr, h, sin(ang)*rr);
    p = rotX(0.15) * p;
    sz = 0.09 + 0.06*exp(-rr*0.5);
  } else if (id < 5.5) { // wave plane
    float gx = mod(i, 125.0);
    float gz = floor(i/125.0);
    vec2 q = (vec2(gx, gz)/124.0 - 0.5) * 15.0;
    float d = length(q);
    float y = 1.7*sin(d*1.1 - t*2.0)*exp(-d*0.10)
            + 0.55*sin(q.x*0.7 + t*0.9)*sin(q.y*0.8 - t*0.7)
            + 0.35*sin((q.x+q.y)*1.3 + t*1.7);
    p = vec3(q.x, y - 1.2, q.y);
    sz = 0.1; ord = 0.6;
  } else if (id < 6.5) { // lissajous ribbons
    float k = mod(i, 6.0);
    float a = floor(i/6.0)/(uCount/6.0) * TAU;
    p = lissa(a, k, t);
    vec3 tg = normalize(lissa(a + 0.01, k, t) - p);
    vec3 nn = normalize(cross(tg, vec3(0.0,1.0,0.0)) + 1e-4);
    vec3 bn = cross(tg, nn);
    p += nn*(r.x-0.5)*(0.9 + 0.7*sin(a*4.0 + t + k)) + bn*(r.y-0.5)*0.12;
    sz = 0.085;
  } else { // rain columns
    float cx = mod(i, 25.0);
    float cz = mod(floor(i/25.0), 25.0);
    float h = floor(i/625.0);
    vec2 c = (vec2(cx, cz) - 12.0) * 0.56;
    float spd = 1.2 + 1.5*fract(sin(cx*12.9898 + cz*78.233)*43758.5453);
    float H = 14.0;
    float y = mod(h*(H/25.0) + t*spd*1.4 + cx*0.7 + cz*1.3, H) - H*0.5;
    float tw = y*0.05*sin(t*0.3) + t*0.1;
    p = rotY(tw) * vec3(c.x, y, c.y);
    p.xz *= 1.0 + 0.3*sin(y*0.4 + t*0.5);
    sz = 0.14; ord = 0.8;
  }
  return p;
}

void main() {
  float t = uTime;
  vec4 r = aRand;

  float szA, szB, ordA, ordB;
  vec3 A = formation(uFrom, aIdx, r, t, szA, ordA);
  vec3 B = formation(uTo,   aIdx, r, t, szB, ordB);

  float delay = (uStyle < 0.5)
    ? 0.62*clamp((8.0 - A.y)/16.0, 0.0, 1.0) + 0.38*r.w
    : 0.62*clamp(length(B)/11.0, 0.0, 1.0) + 0.38*r.w;
  float w = 0.5;
  float e = clamp((uMix - delay*(1.0 - w))/w, 0.0, 1.0);
  e = e*e*e*(e*(e*6.0 - 15.0) + 10.0);
  float bump = sin(PI*e);

  vec3 pos = mix(A, B, e);
  vec3 cv = curl(pos*0.9 + r.xyz*3.0, t*0.8);
  pos += cv * bump * (1.6 + 2.6*r.y);
  pos = rotY(bump*(r.x - 0.3)*2.4) * pos;
  pos.y -= bump*bump*(2.0 + 4.0*r.z) * (uStyle < 0.5 ? 1.0 : 0.0);

  float sz = mix(szA, szB, e) * (0.75 + 0.7*r.z*r.z);
  float ord = mix(ordA, ordB, e) * (1.0 - bump);

  float ang = (r.w*TAU + t*(0.25 + r.x*0.7)) * (1.0 - ord) + bump*(3.0 + 6.0*r.y);
  vec3 axis = normalize(r.xyz*2.0 - 1.0 + 1e-3);
  mat3 R = rot(axis, ang);

  float pulse = 0.5 + 0.5*sin(dot(pos, normalize(vec3(0.6,0.3,0.7)))*0.55 - t*1.6 + r.x*0.8);
  pulse = pow(pulse, 6.0);
  sz *= 1.0 + 0.55*pulse + 0.5*bump;

  vec3 world = pos + R * (position * sz);
  vNormal = R * normal;
  vWorld = world;
  vUv = uv;
  vPulse = pulse;
  vGlow = bump;
  vSpark = step(0.965, fract(r.w*17.31 + r.x*3.7));

  float ct = 0.4 + pos.y*0.045 + 0.34*sin(length(pos.xz)*0.33 - t*0.16 + r.x*0.5) + (r.y - 0.5)*0.22;
  ct += 0.18*bump*sin(r.w*6.0);
  vCt = clamp(ct, 0.0, 1.0);

  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const fragmentShader = /* glsl */ `
uniform vec3 uPal[4];
uniform vec3 uL0;
uniform vec3 uL1;
uniform vec3 uLc0;
uniform vec3 uLc1;

varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;
varying float vCt;
varying float vGlow;
varying float vSpark;
varying float vPulse;

vec3 grad(float t) {
  t = clamp(t, 0.0, 1.0) * 3.0;
  vec3 c = mix(uPal[0], uPal[1], smoothstep(0.0, 1.0, t));
  c = mix(c, uPal[2], smoothstep(1.0, 2.0, t));
  c = mix(c, uPal[3], smoothstep(2.0, 3.0, t));
  return c;
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  float dist = length(cameraPosition - vWorld);

  vec3 col = grad(vCt);
  vec3 bright = mix(col, uPal[3], vSpark*0.85);

  vec3 K = normalize(vec3(0.5, 0.85, 0.35));
  float key = max(dot(n, K), 0.0);
  vec3 l0 = uL0 - vWorld; vec3 l1 = uL1 - vWorld;
  float a0 = max(dot(n, normalize(l0)), 0.0) / (1.0 + 0.05*dot(l0, l0));
  float a1 = max(dot(n, normalize(l1)), 0.0) / (1.0 + 0.05*dot(l1, l1));

  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);

  vec2 d = min(vUv, 1.0 - vUv);
  float edge = 1.0 - smoothstep(0.0, 0.12, min(d.x, d.y));

  vec3 lit = bright * (0.012 + 0.3*key*key);
  lit += (uLc0*a0 + uLc1*a1) * 0.9 * mix(bright, vec3(1.0), 0.15);
  lit += bright * fres * 0.45;
  lit += bright * edge * (0.18 + 0.9*vPulse + 0.6*vGlow + 1.2*vSpark);
  lit += bright * vPulse * 0.12;

  float fog = exp(-max(dist - 10.0, 0.0)*0.045);
  vec3 fogCol = vec3(0.004, 0.006, 0.02);
  lit = mix(fogCol, lit, fog);

  gl_FragColor = vec4(lit, 1.0);
}
`;

export const finishShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime)*43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c,c);
      vec2 off = c * r2 * 0.022;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      float vig = smoothstep(0.95, 0.22, length(c)*1.25);
      col *= mix(0.35, 1.0, vig);
      col += (hash(vUv*vec2(1920.0,1080.0)) - 0.5) * 0.035;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
