export const choreography = /* glsl */ `
const float sculptPi = 3.14159265359;
const float sculptTau = 6.28318530718;

vec2 sculptCircle(float angle) {
    return vec2(cos(angle), sin(angle));
}

vec3 sculptRibbon(vec4 seed, float id, float t) {
    float band = step(0.5, id);
    float u = sculptTau * (2.0 * id - band) + 0.18 * t;
    vec2 ring = sculptCircle(2.0 * u);
    vec2 tube = sculptCircle(3.0 * u);
    float radius = 3.04 + 1.07 * tube.x;

    // Transport the straps in the knot's cross-section, not in world axes.
    vec3 normal = vec3(ring * tube.x, tube.y);
    vec3 aroundTube = vec3(-ring * tube.y, tube.x);
    vec3 aroundRing = vec3(-ring.y, ring.x, 0.0);
    vec3 side = normalize(2.0 * radius * aroundTube - 3.21 * aroundRing);
    vec2 roll = sculptCircle(u + 0.31 * sin(3.0 * u - 0.59 * t) + 0.19 * t);
    float across = (band - 0.5) * 1.09 + (seed.x - 0.5) * 0.79;
    float depth = (seed.y - 0.5) * 0.28;
    vec3 p = vec3(radius * ring, 1.07 * tube.y);
    p += normal * (roll.x * across - roll.y * depth);
    p += side * (roll.y * across + roll.x * depth);
    return vec3(p.x, 1.09 * p.y, p.z);
}

vec3 sculptCurtain(vec4 seed, float id, float t) {
    const float fall = 0.66;
    const float turn = 0.08;
    const float rise = 0.18;
    const float rim = 4.14;
    float thread = min(floor(56.0 * id), 55.0);
    float across = (thread + 0.5) / 28.0 - 1.0;
    float flow = 0.202 + 0.012 * sin(0.76 * thread);
    float phase = fract(56.0 * id + thread * 0.61803398875 + flow * t);
    float behind;
    float y;

    // Hermite turns match the adjoining vertical velocities. The quick
    // return is recessed behind the curtain, with no teleport at the seam.
    if (phase < fall) {
        behind = 0.0;
        y = rim * (1.0 - 2.0 * phase / fall);
    } else if (phase < fall + turn) {
        float u = (phase - fall) / turn;
        behind = u * u * (3.0 - 2.0 * u);
        y = -rim - (2.0 * rim * turn) * u * (1.0 - u) * mix(1.0 / fall, 1.0 / rise, u);
    } else if (phase < 1.0 - turn) {
        behind = 1.0;
        y = rim * (2.0 * (phase - fall - turn) / rise - 1.0);
    } else {
        float u = (phase - (1.0 - turn)) / turn;
        behind = 1.0 - u * u * (3.0 - 2.0 * u);
        y = rim + (2.0 * rim * turn) * u * (1.0 - u) * mix(1.0 / rise, 1.0 / fall, u);
    }

    float wave = 1.16 * y + 1.58 * t + 2.3 * across;
    float height = y / rim;
    float x = across * (4.30 + 0.30 * height * height - 0.28 * behind);
    x += 0.15 * sin(wave) + 0.06 * (seed.x - 0.5);
    float z = 0.42 * cos(8.0 * across + 0.30 * y) + 0.28 * sin(wave);
    z += 0.10 * (seed.y - 0.5) - 1.45 * behind;
    return vec3(x, y, z);
}

vec3 sculptVortex(vec4 seed, float id, float t) {
    float arm = min(floor(5.0 * id), 4.0);
    float u = 5.0 * id - arm;
    float pulse = sin(sculptTau * u - 1.03 * t);
    float angle = sculptTau * (u * (1.43 - 0.25 * u) + arm / 5.0);
    angle += -0.61 * t + 0.34 * pulse + (seed.x - 0.5) * (0.63 - 0.14 * u);
    float radius = 1.30 + u * (1.22 + 1.91 * u);
    radius += (seed.y - 0.5) * (0.64 + 0.32 * u) + 0.11 * pulse;
    vec2 center = (u - 0.5) * vec2(0.77, -0.37);
    vec2 orbit = center + radius * sculptCircle(angle);
    float y = mix(-4.42, 4.01, u) + 0.27 * (seed.z - 0.5);
    y += 0.16 * sin(sculptPi * u) * pulse;
    return vec3(orbit.x, y, orbit.y);
}

vec3 sculptFrameCorner(float floorIndex, float corner, bool inner, float sway, float fold) {
    float level = floorIndex - 4.0;
    float pitch = inner ? -0.105 : 0.152;
    float offset = inner ? 0.22 : 0.0;
    float radius = (inner ? 2.52 : 4.54) + 0.16 * cos(0.76 * level + fold);
    float angle = 0.25 * sculptPi + 0.5 * sculptPi * corner;
    angle += offset + level * pitch + sway + 0.10 * sin(level * 0.82 - fold);
    vec2 p = radius * sculptCircle(angle);
    return vec3(p.x, 1.06 * level, p.y);
}

vec3 sculptLattice(vec4 seed, float id, float t) {
    // Give the longer members more points so the cubes read as clean beams.
    bool inner;
    bool tierLink = id >= 0.65;
    bool bridge = id >= 0.86;
    float along;
    if (bridge) {
        inner = false;
        along = min((id - 0.86) / 0.14, 0.999999);
    } else if (tierLink) {
        inner = id >= 0.77;
        along = inner ? (id - 0.77) / 0.09 : (id - 0.65) / 0.12;
    } else {
        inner = id >= 0.42;
        along = inner ? (id - 0.42) / 0.23 : id / 0.42;
    }

    float edge = along * (tierLink ? 32.0 : 36.0);
    float floorIndex = floor(edge * 0.25);
    float corner = floor(edge) - 4.0 * floorIndex;
    float sway = 0.26 * sin(0.43 * t);
    float fold = 0.62 * t;
    vec3 a = sculptFrameCorner(floorIndex, corner, inner, sway, fold);
    vec3 b = sculptFrameCorner(floorIndex + (tierLink ? 1.0 : 0.0),
        corner + (tierLink ? 0.0 : 1.0), inner || bridge, sway, fold);
    return mix(a, b, fract(edge)) + 0.043 * (seed.xyz - 0.5);
}

vec3 sculptBloom(vec4 seed, float id, float t) {
    float inner = step(0.70, id);
    float count = mix(7.0, 5.0, inner);
    float blade = count * (inner > 0.0 ? (id - 0.70) / 0.30 : id / 0.70);
    float petal = min(floor(blade), count - 1.0);
    float u = clamp(blade - petal, 0.0, 1.0);
    float azimuth = sculptTau * petal / count + 0.37 * inner;
    float unfold = sin(0.72 * t - 0.95 * inner + 0.30 * cos(2.0 * azimuth));
    float angle = azimuth + u * (0.28 + 0.35 * inner) + 0.19 * sin(0.48 * t);

    // The lens section tapers in both width and depth at the root and tip.
    float envelope = (0.30 + 0.70 * u) * sqrt(4.0 * u * (1.0 - u));
    float crossBlade = 2.0 * seed.x - 1.0;
    float lens = envelope * (2.0 * seed.y - 1.0) * sqrt(1.0 - crossBlade * crossBlade);
    float cup = envelope * (crossBlade * crossBlade - 0.23);
    float reach = mix(3.90, 2.03, inner) + 0.43 * unfold;
    float u2 = u * u;
    float radius = mix(1.02, 0.87, inner) + reach * u * (2.0 - u);
    radius += -mix(0.65, 0.52, inner) * u2 * u2 - 0.35 * cup + 0.39 * lens;
    float width = mix(1.68, 1.17, inner) * crossBlade * envelope;
    vec2 axis = sculptCircle(angle);
    vec2 p = radius * axis + width * vec2(-axis.y, axis.x);
    float y = mix(-4.19, -2.96, inner) + u * (mix(6.55, 7.25, inner) - 0.68 * unfold);
    y += 0.94 * cup + 0.51 * lens;
    return vec3(p.x, y, p.y);
}

vec3 sculpt(int act, vec4 seed, float id, float t) {
    if (act == 0) return sculptRibbon(seed, id, t);
    if (act == 1) return sculptCurtain(seed, id, t);
    if (act == 2) return sculptVortex(seed, id, t);
    if (act == 3) return sculptLattice(seed, id, t);
    return sculptBloom(seed, id, t);
}
`;
