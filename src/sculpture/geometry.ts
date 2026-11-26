import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const CUBE_COUNT = 10800; // 30 * 12 * 30 = 180 * 60 = 6 * 1800

const GRID_X = 30;
const GRID_Y = 12;
const GRID_Z = 30;
const SURFACE_U = 180;
const SURFACE_V = 60;

/**
 * Deterministic Mulberry32 PRNG for reproducible cube attributes.
 */
function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSculptureGeometry(): THREE.InstancedBufferGeometry {
  const baseGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.13);
  const geometry = new THREE.InstancedBufferGeometry();

  if (baseGeo.index) {
    geometry.setIndex(baseGeo.index.clone());
  }

  const posAttr = baseGeo.getAttribute('position');
  const normAttr = baseGeo.getAttribute('normal');
  geometry.setAttribute('position', posAttr.clone());
  geometry.setAttribute('normal', normAttr.clone());
  baseGeo.dispose();

  geometry.instanceCount = CUBE_COUNT;

  const normIds = new Float32Array(CUBE_COUNT);
  const seeds = new Float32Array(CUBE_COUNT * 4);
  const grid3 = new Float32Array(CUBE_COUNT * 3);
  const surfaceUV = new Float32Array(CUBE_COUNT * 2);

  const rand = createMulberry32(0x4e454f4e);
  const invCountMinusOne = 1 / (CUBE_COUNT - 1);
  const invGridX = 2 / (GRID_X - 1);
  const invGridY = 2 / (GRID_Y - 1);
  const invGridZ = 2 / (GRID_Z - 1);

  for (let i = 0; i < CUBE_COUNT; i++) {
    normIds[i] = i * invCountMinusOne;

    const s4 = i * 4;
    seeds[s4] = rand();
    seeds[s4 + 1] = rand();
    seeds[s4 + 2] = rand();
    seeds[s4 + 3] = rand();

    const gx = i % GRID_X;
    const gy = Math.floor(i / GRID_X) % GRID_Y;
    const gz = Math.floor(i / (GRID_X * GRID_Y));

    const g3 = i * 3;
    grid3[g3] = gx * invGridX - 1;
    grid3[g3 + 1] = gy * invGridY - 1;
    grid3[g3 + 2] = gz * invGridZ - 1;

    const u2 = i * 2;
    surfaceUV[u2] = (i % SURFACE_U) / SURFACE_U;
    surfaceUV[u2 + 1] = Math.floor(i / SURFACE_U) / SURFACE_V;
  }

  geometry.setAttribute('aNormId', new THREE.InstancedBufferAttribute(normIds, 1));
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geometry.setAttribute('aGrid3', new THREE.InstancedBufferAttribute(grid3, 3));
  geometry.setAttribute('aSurfaceUV', new THREE.InstancedBufferAttribute(surfaceUV, 2));

  // Generous bounds prevent frustum culling of GPU-displaced instanced cubes.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 40);
  geometry.boundingBox = new THREE.Box3(
    new THREE.Vector3(-39, -39, -39),
    new THREE.Vector3(39, 41, 39),
  );

  return geometry;
}
