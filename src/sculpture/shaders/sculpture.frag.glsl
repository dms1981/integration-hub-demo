uniform float uTime;
uniform vec3 uColHighlight;
uniform vec3 uBgColor;
uniform float uCorePulse;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vBaseColor;
varying vec3 vRimColor;
varying float vEnergy;
varying float vAo;
varying float vDepth;

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float NdotV = max(dot(N, V), 0.0);

  // Gallery 3-point sculptural lighting
  vec3 Lkey = normalize(vec3(0.65, 0.85, 0.55));
  vec3 Lrim = normalize(vec3(-0.75, 0.35, -0.75));
  vec3 Lunder = normalize(vec3(0.15, -0.90, 0.35));

  float keyDiff = max(dot(N, Lkey), 0.0);
  float rimDiff = max(dot(N, Lrim), 0.0);
  float underDiff = max(dot(N, Lunder), 0.0);

  vec3 Hkey = normalize(Lkey + V);
  vec3 Hrim = normalize(Lrim + V);

  // Crisp bevel specular + anodized metallic sheen
  float specSharp = pow(max(dot(N, Hkey), 0.0), 96.0);
  float specBroad = pow(max(dot(N, Hkey), 0.0), 22.0);
  float specRim = pow(max(dot(N, Hrim), 0.0), 48.0);

  vec3 keyLightCol = vec3(0.95, 0.98, 1.03);
  vec3 underLightCol = vec3(0.92, 0.76, 0.66);

  // Deep jewel-saturated shading: ~70% rich dark midtones, ~20% vivid key/rim lighting
  vec3 ambient = vBaseColor * 0.08 * vAo;
  vec3 diffuse =
    vBaseColor * keyLightCol * (keyDiff * 0.44) * vAo +
    vRimColor * (rimDiff * 0.24) * vAo +
    vBaseColor * underLightCol * (underDiff * 0.10) * vAo;

  vec3 specular =
    mix(vRimColor, uColHighlight, 0.55) * (specSharp * 1.12) +
    mix(vBaseColor, vRimColor, 0.50) * (specBroad * 0.14) +
    vRimColor * (specRim * 0.34);

  // Subtle warm inner core illumination around (0, 1, 0) without whiteout
  vec3 toCore = vec3(0.0, 1.0, 0.0) - vWorldPos;
  float coreDist = length(toCore);
  vec3 Lcore = toCore / max(coreDist, 0.001);
  float coreAtten = 1.0 / (1.0 + 0.09 * coreDist * coreDist);
  float coreDiff = max(dot(N, Lcore), 0.0);
  vec3 Hcore = normalize(Lcore + V);
  float coreSpec = pow(max(dot(N, Hcore), 0.0), 28.0);
  vec3 coreTint = mix(vBaseColor, uColHighlight, 0.35);
  float coreStrength = 0.34 + 0.18 * uCorePulse + 0.04 * sin(uTime * 1.9);
  vec3 coreLight = coreTint * coreAtten * coreStrength * (coreDiff * 0.55 + coreSpec * 0.28);

  // Razor-thin dichroic neon rim carving silhouette against obsidian void
  float fresnel = pow(1.0 - NdotV, 3.8);
  vec3 fresnelGlow = vRimColor * fresnel * (0.42 + 0.34 * clamp(vEnergy, 0.0, 1.0));

  // Strictly selective HDR emissive: only narrow crests & bevel glints cross bloom threshold
  float glowMask = smoothstep(0.56, 1.15, vEnergy);
  vec3 emissiveCol = mix(
    mix(vBaseColor, vRimColor, 0.55),
    uColHighlight,
    0.35 * smoothstep(0.82, 1.25, vEnergy)
  );
  vec3 emissive = emissiveCol * glowMask * (0.50 + 0.62 * glowMask);

  vec3 color = ambient + diffuse + specular + coreLight + fresnelGlow + emissive;

  // Keep HDR highlights vivid and saturated for selective bloom without whiteout
  color = min(color, vec3(1.85));

  // Subtle exponential atmospheric depth fog for far cubes
  float fogDist = max(length(cameraPosition - vWorldPos) - 38.0, 0.0);
  float fogFactor = 1.0 - exp(-(fogDist * fogDist) * 0.00055);
  color = mix(color, uBgColor * 0.55, clamp(fogFactor, 0.0, 0.82));

  gl_FragColor = vec4(color, 1.0);
}
