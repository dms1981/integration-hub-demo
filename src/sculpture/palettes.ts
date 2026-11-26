import * as THREE from 'three';

export interface PaletteColors {
  name: string;
  shadow: THREE.Color;
  primary: THREE.Color;
  secondary: THREE.Color;
  highlight: THREE.Color;
  bgTint: THREE.Color;
}

function makePalette(
  name: string,
  shadow: string,
  primary: string,
  secondary: string,
  highlight: string,
  bgTint: string,
): PaletteColors {
  return {
    name,
    shadow: new THREE.Color(shadow),
    primary: new THREE.Color(primary),
    secondary: new THREE.Color(secondary),
    highlight: new THREE.Color(highlight),
    bgTint: new THREE.Color(bgTint),
  };
}

export const PALETTES: readonly PaletteColors[] = [
  makePalette(
    'Electric Prism',
    '#081442',
    '#00e5ff',
    '#ff0d7a',
    '#ffaa1d',
    '#060e20',
  ),
  makePalette(
    'Bioluminescent Abyss',
    '#0b0f32',
    '#00ffd0',
    '#7a2eff',
    '#ff667a',
    '#070b1f',
  ),
  makePalette(
    'Molten Aurora',
    '#160724',
    '#ff3d1f',
    '#ffd43b',
    '#2ef2ff',
    '#12071a',
  ),
  makePalette(
    'Emerald Orchid',
    '#041b22',
    '#00e878',
    '#c81dff',
    '#ffd866',
    '#05141a',
  ),
  makePalette(
    'Cobalt Rose',
    '#070e2b',
    '#1f6fff',
    '#ff2a91',
    '#ffcf75',
    '#060d20',
  ),
  makePalette(
    'Solaris Neon',
    '#13062b',
    '#ff6d00',
    '#ff007f',
    '#00f5ff',
    '#11071e',
  ),
];

export function createMutablePalette(source: PaletteColors = PALETTES[0]): PaletteColors {
  return {
    name: source.name,
    shadow: source.shadow.clone(),
    primary: source.primary.clone(),
    secondary: source.secondary.clone(),
    highlight: source.highlight.clone(),
    bgTint: source.bgTint.clone(),
  };
}

function wrapPaletteIndex(idx: number): number {
  const len = PALETTES.length;
  return ((Math.trunc(idx) % len) + len) % len;
}

/**
 * Smoothly interpolates colors between two curated palettes into `out`,
 * using HSL hue-preserving blending for vivid accent colors so midpoints stay chromatic.
 */
export function sampleBlendedPalette(
  fromIdx: number,
  toIdx: number,
  t: number,
  out: PaletteColors,
): PaletteColors {
  const from = PALETTES[wrapPaletteIndex(fromIdx)];
  const to = PALETTES[wrapPaletteIndex(toIdx)];
  const clamped = Math.min(1, Math.max(0, t));
  const smooth = clamped * clamped * (3 - 2 * clamped);

  out.name = smooth < 0.5 ? from.name : to.name;
  out.shadow.lerpColors(from.shadow, to.shadow, smooth);
  out.primary.copy(from.primary).lerpHSL(to.primary, smooth);
  out.secondary.copy(from.secondary).lerpHSL(to.secondary, smooth);
  out.highlight.copy(from.highlight).lerpHSL(to.highlight, smooth);
  out.bgTint.lerpColors(from.bgTint, to.bgTint, smooth);

  return out;
}
