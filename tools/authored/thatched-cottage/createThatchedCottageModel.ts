import * as THREE from 'three';

/**
 * Procedural Thatched Cottage
 * Code-only reconstruction from a 4-view turnaround via the img2threejs pipeline.
 *
 * Identity systems matched to the reference:
 * - Thick sculpted thatch shell: chevron cross-section lofted solid with a rounded
 *   pegged ridge, shaggy overhanging eave edge and a straw-relief surface.
 * - Exposed half-timbering: corner posts, girts, curved braces and a gable truss over
 *   cream lime plaster.
 * - Arched oak plank door with iron strap hinges and ring knocker in a stone surround.
 * - Stacked-stone plinth and chimney with a terracotta cap.
 * - Casement / shutter / flower-box modules.
 * - Thatched eyebrow dormer pushed through the right roof slope.
 * - Garden ring: ivy, flower beds, barrel, log store lean-to, split-rail fences,
 *   field rocks, grass mound and dirt path.
 *
 * Runtime:
 * - root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups }
 * - root.userData.setExplode(t)  radial explode for the inspector
 * - root.userData.tick(dt, elapsed)  lantern flicker + foliage sway
 */

export interface ThatchedCottageOptions {
  scale?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  seed?: number;
}

// ---------------------------------------------------------------------------
// Deterministic RNG
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Palette sampled from the reference turnaround
// ---------------------------------------------------------------------------
const C = {
  thatch: '#8a6a26',
  thatchLight: '#cbab58',
  thatchDark: '#584219',
  plaster: '#b3a27d',
  plasterDark: '#9b8f74',
  timber: '#42301c',
  timberDark: '#241708',
  door: '#573319',
  doorDark: '#462e1c',
  stone: '#837a6c',
  stoneDark: '#524f47',
  stoneLight: '#a29a88',
  terracotta: '#8f4a2e',
  iron: '#3a3834',
  foliage: '#4f6b2e',
  foliageDark: '#2e4a1c',
  bloom: '#f2eee2',
  bloomPink: '#e2aec4',
  bloomPurple: '#8d6fb0',
  soil: '#6f6047',
  grass: '#7c8a4c',
  glass: '#d9b06a',
};

// ---------------------------------------------------------------------------
// Canvas texture helpers
// ---------------------------------------------------------------------------
function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function canvasTexture(canvas: HTMLCanvasElement, repeat: number, srgb: boolean): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 8;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function noiseOverlay(ctx: CanvasRenderingContext2D, size: number, rng: () => number, amount: number): void {
  const image = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = (rng() - 0.5) * amount;
    image.data[i] = Math.max(0, Math.min(255, image.data[i] + n));
    image.data[i + 1] = Math.max(0, Math.min(255, image.data[i + 1] + n));
    image.data[i + 2] = Math.max(0, Math.min(255, image.data[i + 2] + n));
  }
  ctx.putImageData(image, 0, 0);
}

function thatchAlbedo(size: number, rng: () => number): HTMLCanvasElement {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#8a7038';
  ctx.fillRect(0, 0, size, size);
  // Fine, dense, short combed fibres: many thin low-alpha strokes build a felted
  // straw surface instead of a few long readable needles.
  for (let i = 0; i < 30000; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const len = 6 + rng() * 20;
    const lean = (rng() - 0.5) * 3.2;
    const roll = rng();
    ctx.strokeStyle = roll > 0.72 ? '#d2c086' : roll > 0.34 ? '#ac8f52' : '#5e4a24';
    ctx.globalAlpha = 0.1 + rng() * 0.22;
    ctx.lineWidth = 0.4 + rng() * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + lean, y + len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  noiseOverlay(ctx, size, rng, 12);
  return canvas;
}

function thatchBump(size: number, rng: () => number): HTMLCanvasElement {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  // High-frequency combing for normal relief; short strokes only.
  for (let i = 0; i < 22000; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const len = 5 + rng() * 17;
    const lean = (rng() - 0.5) * 2.6;
    ctx.strokeStyle = rng() > 0.5 ? '#d0d0d0' : '#3a3a3a';
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 0.4 + rng() * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + lean, y + len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return canvas;
}

/** Fine rough-cast lime plaster: subtle stipple, no readable circular blotches. */
function plasterAlbedo(size: number, rng: () => number): HTMLCanvasElement {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = C.plaster;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 30000; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 0.4 + rng() * 1.4;
    const v = rng();
    ctx.fillStyle = v > 0.62 ? '#cfc4a7' : v > 0.32 ? '#a2937a' : '#7d7059';
    ctx.globalAlpha = 0.06 + rng() * 0.16;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 40; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 40 + rng() * 120;
    ctx.fillStyle = rng() > 0.5 ? '#9b8c6e' : '#c6ba9c';
    ctx.globalAlpha = 0.05 + rng() * 0.08;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  noiseOverlay(ctx, size, rng, 9);
  return canvas;
}

function plasterBump(size: number, rng: () => number): HTMLCanvasElement {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 34000; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 0.5 + rng() * 1.6;
    ctx.fillStyle = rng() > 0.5 ? '#bdbdbd' : '#4c4c4c';
    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return canvas;
}

function blotchAlbedo(size: number, rng: () => number, base: string, spots: string[], count: number, radius: number): HTMLCanvasElement {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const r = radius * (0.4 + rng());
    ctx.fillStyle = spots[Math.floor(rng() * spots.length)];
    ctx.globalAlpha = 0.18 + rng() * 0.3;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + rng() * 0.7), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  noiseOverlay(ctx, size, rng, 16);
  return canvas;
}

function grainAlbedo(size: number, rng: () => number, base: string, dark: string): HTMLCanvasElement {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i += 1) {
    const x = rng() * size;
    ctx.strokeStyle = dark;
    ctx.globalAlpha = 0.1 + rng() * 0.22;
    ctx.lineWidth = 0.5 + rng() * 2.2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + (rng() - 0.5) * 20, size / 3, x + (rng() - 0.5) * 20, (2 * size) / 3, x + (rng() - 0.5) * 12, size);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  noiseOverlay(ctx, size, rng, 14);
  return canvas;
}

function streakAlbedo(size: number, rng: () => number, base: string, dark: string): HTMLCanvasElement {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const planks = 8;
  for (let p = 0; p <= planks; p += 1) {
    const x = (p / planks) * size;
    ctx.strokeStyle = dark;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 120; i += 1) {
    const x = rng() * size;
    ctx.strokeStyle = dark;
    ctx.lineWidth = 0.6 + rng();
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (rng() - 0.5) * 8, size);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  noiseOverlay(ctx, size, rng, 12);
  return canvas;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
type Materials = Record<string, THREE.Material>;

function buildMaterials(rng: () => number): Materials {
  const size = 512;

  const mk = (
    map: HTMLCanvasElement,
    rough: number,
    repeat: number,
    opts: { bump?: HTMLCanvasElement; bumpScale?: number; metal?: number; emissive?: string; emissiveIntensity?: number; color?: string } = {},
  ): THREE.MeshStandardMaterial => {
    const material = new THREE.MeshStandardMaterial({
      map: canvasTexture(map, repeat, true),
      roughness: rough,
      metalness: opts.metal ?? 0,
    });
    if (opts.color) material.color = new THREE.Color(opts.color);
    if (opts.bump) {
      material.bumpMap = canvasTexture(opts.bump, repeat, false);
      material.bumpScale = opts.bumpScale ?? 0.04;
    }
    if (opts.emissive) {
      material.emissive = new THREE.Color(opts.emissive);
      material.emissiveIntensity = opts.emissiveIntensity ?? 0.6;
      material.emissiveMap = canvasTexture(map, repeat, true);
    }
    return material;
  };

  const thatchMap = thatchAlbedo(size, rng);
  const thatchBumpMap = thatchBump(size, rng);
  // Faceted fieldstone for the rubble walls / quoins.
  const rubbleSpots = ['#6f675a', '#aaa08d', '#82796a', '#b5ab97'];
  const rubbleStone = mk(
    blotchAlbedo(size, rng, '#978d7b', rubbleSpots, 300, 15),
    0.93,
    3,
    { bump: blotchAlbedo(size, rng, '#808080', ['#c8c8c8', '#4a4a4a'], 260, 16), bumpScale: 0.035 },
  );
  rubbleStone.flatShading = true;

  return {
    rubbleStone,
    thatch: mk(thatchMap, 0.96, 3, { bump: thatchBumpMap, bumpScale: 0.075 }),
    ridge: mk(thatchAlbedo(size, rng), 0.96, 2, { bump: thatchBump(size, rng), bumpScale: 0.05 }),
    plaster: mk(plasterAlbedo(size, rng), 0.97, 3, { bump: plasterBump(size, rng), bumpScale: 0.045 }),
    stone: mk(blotchAlbedo(size, rng, '#978d7b', ['#6f675a', '#aaa08d', '#82796a', '#b5ab97'], 300, 15), 0.9, 3, { bump: blotchAlbedo(size, rng, '#808080', ['#c8c8c8', '#4a4a4a'], 260, 16), bumpScale: 0.05 }),
    mortar: mk(blotchAlbedo(size, rng, '#6b6257', ['#544d42', '#7c7263'], 110, 20), 0.95, 4),
    chimneyStone: mk(blotchAlbedo(size, rng, '#8a8375', ['#5f5a4e', '#a29a88', '#6f6a5e'], 320, 15), 0.92, 3, { bump: blotchAlbedo(size, rng, '#808080', ['#c8c8c8', '#4a4a4a'], 260, 16), bumpScale: 0.06 }),
    timber: mk(grainAlbedo(size, rng, C.timber, C.timberDark), 0.82, 2, { bump: grainAlbedo(size, rng, '#808080', '#303030'), bumpScale: 0.03 }),
    door: mk(streakAlbedo(size, rng, C.door, C.doorDark), 0.7, 1, { bump: streakAlbedo(size, rng, '#808080', '#303030'), bumpScale: 0.025 }),
    terracotta: mk(blotchAlbedo(size, rng, C.terracotta, ['#b4623f', '#682e1e', '#c67a52'], 80, 30), 0.78, 2),
    iron: new THREE.MeshStandardMaterial({ color: C.iron, roughness: 0.5, metalness: 0.85 }),
    glass: new THREE.MeshStandardMaterial({ color: C.glass, roughness: 0.18, metalness: 0, emissive: new THREE.Color('#c98a3c'), emissiveIntensity: 0.9 }),
    foliage: mk(blotchAlbedo(size, rng, C.foliage, [C.foliageDark, '#7a9648', '#41602a'], 160, 16), 0.78, 2),
    bed: mk(blotchAlbedo(size, rng, '#4f6b30', ['#3a5222', '#6b8a3e'], 140, 14), 0.82, 2),
    bloom: new THREE.MeshStandardMaterial({ color: C.bloom, roughness: 0.6 }),
    bloomPink: new THREE.MeshStandardMaterial({ color: C.bloomPink, roughness: 0.6 }),
    bloomPurple: new THREE.MeshStandardMaterial({ color: C.bloomPurple, roughness: 0.6 }),
    barrel: mk(grainAlbedo(size, rng, '#7e5a36', '#543a22'), 0.85, 2),
    bark: mk(grainAlbedo(size, rng, '#6a4c30', '#3f2c1a'), 0.92, 2),
    logEnd: mk(blotchAlbedo(size, rng, '#c9a06a', ['#a97c48', '#e0c08a', '#8a6238'], 60, 22), 0.8, 2),
    ground: mk(blotchAlbedo(size, rng, C.grass, ['#6a7a40', '#8a9a56', '#5a6a38'], 200, 30), 0.98, 5),
    dirt: mk(blotchAlbedo(size, rng, '#8a7a5a', ['#6f6047', '#a2916c'], 140, 26), 0.98, 4),
  };
}

// ---------------------------------------------------------------------------
// Mesh helpers
// ---------------------------------------------------------------------------
function shadowed<T extends THREE.Object3D>(object: T, cast: boolean, receive: boolean): T {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
    }
  });
  return object;
}

function box(w: number, h: number, d: number, material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}

/** Flat pointed-oval leaf blade, unit length along +Y and its normal on +Z. */
function leafBladeGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.5);
  shape.quadraticCurveTo(0.34, -0.12, 0, 0.5);
  shape.quadraticCurveTo(-0.34, -0.12, 0, -0.5);
  return new THREE.ShapeGeometry(shape, 8);
}

// ---------------------------------------------------------------------------
// Thatched roof shell
// ---------------------------------------------------------------------------
const THATCH_HALF_DEPTH = 1.55;
/** Outer face of the flush gable panel: BODY_D/2 (1.2) + 0.1. */
const GABLE_FACE = 1.3;
const THATCH_EAVE_X = 2.22;
const THATCH_EAVE_Y = 2.62;
const THATCH_RIDGE_Y = 4.68;
/** Where the eyebrow dormer pierces the +X slope (rear half of the roof). */
const THATCH_MID_DEPTH = 0.5;

const THATCH_PROFILE_N = 24;
/** Vertical thickness of the rolled thatch edge at the eave. */
const THATCH_LIP = 0.42;
/** Thickness of the thatch blanket at the ridge. */
const THATCH_RIDGE_T = 0.44;

/**
 * Height fraction of the slope: 1 at the ridge, 0 at the eave. Only the top
 * fraction is rounded, so the roof reads as a true gable rather than a barrel.
 */
function thatchSlope(d: number): number {
  const d0 = 0.26;
  const a = 1 / (2 * d0 - d0 * d0);
  if (d <= d0) return 1 - a * d * d;
  const m = 2 * a * d0;
  return Math.max(0, m * (1 - d));
}

/**
 * The two matched sampling chains of the roof cross-section: the visible outer
 * crown and the inner soffit. Both hold the same point count and correspond by
 * index, so the gable caps are a plain quad strip and can never tear open the
 * way a general 2D earcut triangulation silently can.
 */
interface ThatchChain {
  outer: THREE.Vector2[];
  inner: THREE.Vector2[];
}

function thatchChains(): ThatchChain {
  const ex = THATCH_EAVE_X;
  const ey = THATCH_EAVE_Y;
  const ry = THATCH_RIDGE_Y;
  const H = ry - ey;
  const ix = ex - THATCH_LIP;
  const iey = ey - THATCH_LIP;
  const iry = ry - THATCH_RIDGE_T;
  const M = THATCH_PROFILE_N * 2;
  const outer: THREE.Vector2[] = [];
  const inner: THREE.Vector2[] = [];
  for (let k = 0; k <= M; k += 1) {
    const xb = ex * (1 - (2 * k) / M);
    const d = Math.abs(xb) / ex;
    const flare = 0.13 * Math.pow(d, 3);
    outer.push(new THREE.Vector2(
      Math.sign(xb || 1) * (Math.abs(xb) + flare),
      ey + H * thatchSlope(d) - flare * 0.55,
    ));
    const xin = xb * (ix / ex);
    const di = Math.min(1, Math.abs(xin) / ix);
    inner.push(new THREE.Vector2(xin, iey + (iry - iey) * thatchSlope(di)));
  }
  return { outer, inner };
}

/** Outer-slope surface point for seating sub-parts (dormer, chimney flashing). */
function thatchSurfacePoint(x: number, z: number): THREE.Vector3 {
  const d = Math.min(1, Math.abs(x) / THATCH_EAVE_X);
  const H = THATCH_RIDGE_Y - THATCH_EAVE_Y;
  const flare = 0.13 * Math.pow(d, 3);
  const baseY = THATCH_EAVE_Y + H * thatchSlope(d) - flare * 0.55;
  const ddx = x - 1.68;
  const ddz = z + THATCH_MID_DEPTH;
  const swell = 0.16 * Math.exp(-((ddx * ddx) / 0.5 + (ddz * ddz) / 0.6));
  return new THREE.Vector3(
    Math.sign(x || 1) * (Math.abs(x) + flare + swell * 0.3),
    baseY + swell,
    z,
  );
}

/**
 * Watertight thatch shell. The cross-section is a thick rounded gable band
 * (outer crown over inner soffit). Each z ring holds the outer chain then the
 * inner chain, so every surface — outer, soffit, both eave rolls and both gable
 * caps — is an explicit quad strip. The gable caps can therefore never tear
 * open the way a general 2D earcut of the combined profile can.
 */
function buildThatchGeometry(rng: () => number): THREE.BufferGeometry {
  const { outer, inner } = thatchChains();
  const M = outer.length - 1;
  const steps = 72;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Arc-length along the crown keeps the straw relief at a constant physical size.
  const arc: number[] = [0];
  for (let k = 1; k <= M; k += 1) arc.push(arc[k - 1] + outer[k].distanceTo(outer[k - 1]));
  const arcTotal = arc[M];
  for (let k = 0; k <= M; k += 1) arc[k] /= arcTotal;

  const sample = (chain: THREE.Vector2, side: number, z: number, k: number): [number, number, number] => {
    let x = chain.x;
    let y = chain.y;
    const across = Math.min(1, Math.abs(x) / THATCH_EAVE_X);
    const crown = Math.cos(across * Math.PI * 0.5);
    const comb =
      Math.sin(z * 30.0 + k * 0.7) * 0.6 +
      Math.sin(z * 57.0 - k * 0.4) * 0.3 +
      Math.sin(z * 15.0 + k * 1.3) * 0.2;
    const lumps =
      Math.sin(z * 1.7 + x * 1.6) * 0.02 +
      Math.sin(z * 4.3 + y * 2.9) * 0.011;
    const jitter = (rng() - 0.5) * 0.012;
    let out = comb * 0.012 + lumps + jitter;
    // Rounded swell the eyebrow dormer grows out of, so its hood is anchored.
    if (side === 0) {
      const ddx = x - 1.68;
      const ddz = z + THATCH_MID_DEPTH;
      out += 0.16 * Math.exp(-((ddx * ddx) / 0.5 + (ddz * ddz) / 0.6));
    }
    y += out * (side === 0 ? 1 : 0.72);
    x += Math.sign(x || 1) * out * (0.18 + crown * 0.28);
    return [x, y, z + jitter];
  };

  const P = (M + 1) * 2;
  const vi = (j: number, side: number, k: number): number => j * P + side * (M + 1) + k;
  const quad = (a: number, b: number, c: number, d: number): void => {
    indices.push(a, b, c, a, c, d);
  };

  const shadeAt = (z: number, x: number, k: number): number =>
    0.9 + 0.1 * (0.5 + 0.5 * Math.sin(z * 4.0 + x * 2.7 + k * 0.2));

  for (let j = 0; j <= steps; j += 1) {
    const z = -THATCH_HALF_DEPTH + (j / steps) * THATCH_HALF_DEPTH * 2;
    for (let side = 0; side < 2; side += 1) {
      const chain = side === 0 ? outer : inner;
      for (let k = 0; k <= M; k += 1) {
        const [x, y, zz] = sample(chain[k], side, z, k);
        positions.push(x, y, zz);
        uvs.push((j / steps) * 7, arc[k] * 9);
        const base = shadeAt(z, x, k);
        const shade = side === 0 ? base : base * 0.82;
        colors.push(shade, shade * 0.98, shade * 0.93);
      }
    }
  }

  for (let j = 0; j < steps; j += 1) {
    for (let k = 0; k < M; k += 1) {
      // Outer crown and inner soffit.
      quad(vi(j, 0, k), vi(j, 0, k + 1), vi(j + 1, 0, k + 1), vi(j + 1, 0, k));
      quad(vi(j, 1, k), vi(j + 1, 1, k), vi(j + 1, 1, k + 1), vi(j, 1, k + 1));
    }
    // Eave rolls close the two long edges.
    quad(vi(j, 0, 0), vi(j, 1, 0), vi(j + 1, 1, 0), vi(j + 1, 0, 0));
    quad(vi(j, 0, M), vi(j + 1, 0, M), vi(j + 1, 1, M), vi(j, 1, M));
  }
  // Gable end caps: a quad strip across the matched chains at both z ends.
  for (const j of [0, steps]) {
    for (let k = 0; k < M; k += 1) {
      quad(vi(j, 0, k), vi(j, 1, k), vi(j, 1, k + 1), vi(j, 0, k + 1));
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildThatch(rng: () => number, materials: Materials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'thatch-roof';

  const shellMaterial = (materials.thatch as THREE.MeshStandardMaterial).clone();
  shellMaterial.vertexColors = true;
  // Render both faces so the roof stays opaque from every angle.
  shellMaterial.side = THREE.DoubleSide;
  // Give the shell its own map instances so the straw scale can be tuned for the
  // large roof area without disturbing the small thatch parts.
  if (shellMaterial.map) {
    shellMaterial.map = shellMaterial.map.clone();
    shellMaterial.map.repeat.set(1, 1);
    shellMaterial.map.needsUpdate = true;
  }
  if (shellMaterial.bumpMap) {
    shellMaterial.bumpMap = shellMaterial.bumpMap.clone();
    shellMaterial.bumpMap.repeat.set(1, 1);
    shellMaterial.bumpMap.needsUpdate = true;
  }
  shellMaterial.bumpScale = 0.16;
  const shell = new THREE.Mesh(buildThatchGeometry(rng), shellMaterial);
  shell.name = 'thatch-shell';
  group.add(shell);

  // Ridge roll: a shallow capped tube sunk into the crest so it reads as the
  // bound top of the thatch rather than a log laid on the roof.
  const ridgeLen = THATCH_HALF_DEPTH * 2 - 0.5;
  const ridgeGeo = new THREE.CapsuleGeometry(0.175, ridgeLen, 4, 14);
  ridgeGeo.rotateX(Math.PI / 2);
  const ridge = new THREE.Mesh(ridgeGeo, materials.ridge);
  ridge.name = 'thatch-ridge-cap';
  ridge.position.set(0, THATCH_RIDGE_Y - 0.09, 0);
  ridge.scale.set(1, 0.6, 1);
  group.add(ridge);

  // Shaggy straw fringe hanging down from both eave rolls, kept short and dark
  // so it reads as the ragged thatch edge rather than a row of spikes.
  const tuft = new THREE.ConeGeometry(0.026, 0.11, 5);
  const tuftCount = 260;
  const tufts = new THREE.InstancedMesh(tuft, materials.ridge, tuftCount);
  tufts.name = 'thatch-eave-tufts';
  const dummy = new THREE.Object3D();
  for (let i = 0; i < tuftCount; i += 1) {
    const side = i % 2 === 0 ? 1 : -1;
    const along = (Math.floor(i / 2) / (tuftCount / 2)) * (THATCH_HALF_DEPTH * 2) - THATCH_HALF_DEPTH;
    dummy.position.set(
      side * (THATCH_EAVE_X + 0.05 + rng() * 0.05),
      THATCH_EAVE_Y - 0.1 - rng() * 0.08,
      along + (rng() - 0.5) * 0.12,
    );
    dummy.rotation.set(Math.PI + (rng() - 0.5) * 0.35, rng() * 0.4, -side * (0.35 + rng() * 0.35));
    dummy.scale.set(0.7 + rng() * 0.6, 0.7 + rng() * 0.8, 0.7 + rng() * 0.6);
    dummy.updateMatrix();
    tufts.setMatrixAt(i, dummy.matrix);
  }
  tufts.instanceMatrix.needsUpdate = true;
  group.add(tufts);

  // Ridge pegs driven across the crown (their axis lies along X so they straddle
  // the crest); seated low enough to bite into the ridge roll, not float over it.
  const peg = new THREE.CylinderGeometry(0.016, 0.016, 0.3, 6);
  const pegCount = 7;
  const pegs = new THREE.InstancedMesh(peg, materials.timber, pegCount);
  for (let i = 0; i < pegCount; i += 1) {
    const z = -0.68 + ((i + 0.5) / pegCount) * 1.36;
    dummy.position.set(0, THATCH_RIDGE_Y + 0.005, z);
    dummy.rotation.set(0, 0, Math.PI / 2);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    pegs.setMatrixAt(i, dummy.matrix);
  }
  pegs.instanceMatrix.needsUpdate = true;
  group.add(pegs);

  return group;
}

// ---------------------------------------------------------------------------
// Eyebrow dormer
// ---------------------------------------------------------------------------
function buildEyebrowDormer(materials: Materials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'eyebrow-dormer';

  const ex = THATCH_EAVE_X;
  const ey = THATCH_EAVE_Y;
  const ry = THATCH_RIDGE_Y;
  const H = ry - ey;
  // Slope frame: out of the +X slope (normal), up the slope, and along the ridge.
  const normal = new THREE.Vector3(H, ex, 0).normalize();
  const upslope = new THREE.Vector3(-ex, H, 0).normalize();

  // Lay the casement into the slope plane instead of standing it vertical, so
  // the whole frame stays flush with the thatch and nothing sinks or floats.
  const sx = 1.68;
  const seat = thatchSurfacePoint(sx, -THATCH_MID_DEPTH);
  const winW = 0.34;
  const winH = 0.38;

  const casement = buildCasement(winW, winH, materials);
  // Face +X, then tilt back by the slope angle so the glazing lies in the slope.
  const qFace = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const qTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(ex, H));
  casement.quaternion.copy(qTilt).multiply(qFace);
  casement.position.copy(seat).addScaledVector(normal, 0.03);
  group.add(casement);

  // Eyebrow hood: a thatch crescent lying in the slope plane, springing from the
  // window's top corners and arching over it, finished with a rolled leading edge.
  // Built from a half-ring + half-torus so it curves with the roof instead of
  // reading as a straight bar laid across the slope.
  const hoodMat = (materials.ridge as THREE.MeshStandardMaterial).clone();
  hoodMat.side = THREE.DoubleSide;
  const winHalf = winW / 2;
  const hoodR = winHalf + 0.19;
  const qHood = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), upslope.clone(), normal.clone()),
  );
  const hoodCentre = seat.clone().addScaledVector(upslope, winH * 0.5 - 0.02);

  const pad = new THREE.Mesh(new THREE.RingGeometry(winHalf + 0.02, hoodR, 24, 1, 0, Math.PI), hoodMat);
  pad.quaternion.copy(qHood);
  pad.position.copy(hoodCentre).addScaledVector(normal, 0.025);
  group.add(pad);

  const roll = new THREE.Mesh(new THREE.TorusGeometry(hoodR - 0.02, 0.07, 7, 26, Math.PI), hoodMat);
  roll.quaternion.copy(qHood);
  roll.position.copy(hoodCentre).addScaledVector(normal, 0.05);
  group.add(roll);

  return group;
}

// ---------------------------------------------------------------------------
// Stone chimney
// ---------------------------------------------------------------------------
function buildChimney(materials: Materials, rng: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stone-chimney';
  // Rises through the +X slope on the rear half, seated clear of the rear wall so
  // no ashlar course can poke through the gable plaster.
  group.position.set(0.7, 0, -0.72);

  const courseH = 0.30;
  const courses = 9;
  const bottom = 1.95;
  const stackH = courses * courseH;
  const stackTop = bottom + stackH;

  const core = box(0.62, stackH, 0.62, materials.chimneyStone);
  core.position.set(0, bottom + stackH / 2, 0);
  group.add(core);

  // Squared ashlar blocks, two per course per face, with a staggered joint.
  const blockGeo = new THREE.BoxGeometry(1, 1, 1);
  const perFace = 2;
  const blocks = new THREE.InstancedMesh(blockGeo, materials.chimneyStone, courses * 4 * perFace);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  let idx = 0;
  for (let c = 0; c < courses; c += 1) {
    const y = bottom + c * courseH + courseH / 2;
    const even = c % 2 === 0;
    // Two blocks tile the full 0.62 face edge to edge; the joint staggers each
    // course. Centres/widths are derived from one split so no strip of the core
    // is ever left exposed between the blocks.
    const split = even ? 0.36 : 0.26;
    const half = 0.31;
    const widths = [split, 0.62 - split];
    const centres = [-half + split / 2, -half + split + (0.62 - split) / 2];
    for (let face = 0; face < 4; face += 1) {
      for (let b = 0; b < perFace; b += 1) {
        const w = widths[b] * 0.985;
        const lat = centres[b];
        let px = 0;
        let pz = 0;
        let rotY = 0;
        if (face === 0) { px = lat; pz = 0.30; rotY = 0; }
        else if (face === 1) { px = lat; pz = -0.30; rotY = Math.PI; }
        else if (face === 2) { px = 0.30; pz = lat; rotY = Math.PI / 2; }
        else { px = -0.30; pz = lat; rotY = -Math.PI / 2; }
        dummy.position.set(px, y + (rng() - 0.5) * 0.012, pz);
        dummy.rotation.set(0, rotY, 0);
        dummy.scale.set(w, courseH * 0.9, 0.06);
        dummy.updateMatrix();
        blocks.setMatrixAt(idx, dummy.matrix);
        const g = 0.9 + rng() * 0.22;
        tint.setRGB(g, g * 0.99, g * 0.95);
        blocks.setColorAt(idx, tint);
        idx += 1;
      }
    }
  }
  blocks.instanceMatrix.needsUpdate = true;
  if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
  group.add(blocks);

  // Projecting corbel + cap course, then the terracotta pot.
  const corbel = box(0.72, 0.1, 0.72, materials.chimneyStone);
  corbel.position.set(0, stackTop + 0.05, 0);
  group.add(corbel);
  const cap = box(0.82, 0.15, 0.82, materials.chimneyStone);
  cap.position.set(0, stackTop + 0.18, 0);
  group.add(cap);
  const potBase = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.08, 16), materials.terracotta);
  potBase.position.set(0, stackTop + 0.29, 0);
  group.add(potBase);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.36, 16), materials.terracotta);
  pot.position.set(0, stackTop + 0.51, 0);
  group.add(pot);
  const potRim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.09, 16), materials.terracotta);
  potRim.position.set(0, stackTop + 0.73, 0);
  group.add(potRim);

  return group;
}

// ---------------------------------------------------------------------------
// Arched door + stone surround
// ---------------------------------------------------------------------------
function archedShape(width: number, height: number): THREE.Shape {
  const shape = new THREE.Shape();
  const r = width / 2;
  const straight = height - r;
  shape.moveTo(-r, 0);
  shape.lineTo(r, 0);
  shape.lineTo(r, straight);
  shape.absarc(0, straight, r, 0, Math.PI, false);
  shape.lineTo(-r, 0);
  return shape;
}

function buildDoor(materials: Materials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'entry-system';
  const doorWidth = 0.86;
  const doorHeight = 1.7;
  const geometry = new THREE.ExtrudeGeometry(archedShape(doorWidth, doorHeight), {
    depth: 0.09,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.01,
    bevelSegments: 1,
    curveSegments: 12,
  });
  const door = new THREE.Mesh(geometry, materials.door);
  door.position.set(0, 0, 0);
  group.add(door);

  const hinge = box(0.34, 0.06, 0.03, materials.iron);
  for (const y of [0.5, 1.12]) {
    const left = hinge.clone();
    left.position.set(-0.28, y, 0.11);
    group.add(left);
    const right = hinge.clone();
    right.position.set(0.28, y, 0.11);
    group.add(right);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 8, 16), materials.iron);
  ring.position.set(0.2, 0.98, 0.12);
  group.add(ring);
  const plate = box(0.1, 0.14, 0.02, materials.iron);
  plate.position.set(0.2, 0.98, 0.1);
  group.add(plate);

  // Stone surround sized to the door arch: voussoirs tile the half-circle on a
  // fixed radial pitch so they butt without gaps, and the jambs sit flush to the
  // door sides up to the springing.
  const surround = new THREE.Group();
  surround.name = 'stone-arch-surround';
  const radius = doorWidth / 2;
  const straight = doorHeight - radius;
  const radial = 0.15;
  const innerR = radius + 0.012;
  const midR = innerR + radial / 2;
  const archCount = 11;
  const blockZ = 0.03;
  const voussoirW = 2 * midR * Math.sin(Math.PI / (2 * archCount)) + 0.006;
  for (let i = 0; i < archCount; i += 1) {
    const angle = (Math.PI * (i + 0.5)) / archCount;
    const stone = box(voussoirW, radial, 0.24, materials.chimneyStone);
    stone.position.set(-Math.cos(angle) * midR, straight + Math.sin(angle) * midR, blockZ);
    stone.rotation.z = angle - Math.PI / 2;
    surround.add(stone);
  }
  const jambH = straight / 4;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i += 1) {
      const jamb = box(voussoirW, jambH - 0.01, 0.24, materials.chimneyStone);
      jamb.position.set(side * (radius + voussoirW / 2), jambH * (i + 0.5), blockZ);
      surround.add(jamb);
    }
  }
  group.add(surround);
  // group origin is at ground level of the doorway; position in the caller.
  return group;
}

// ---------------------------------------------------------------------------
// Windows, shutters, flower boxes
// ---------------------------------------------------------------------------
function buildCasement(width: number, height: number, materials: Materials): THREE.Group {
  const group = new THREE.Group();
  const frame = box(width + 0.14, height + 0.14, 0.11, materials.timber);
  group.add(frame);
  const pane = box(width, height, 0.04, materials.glass);
  pane.position.z = 0.04;
  group.add(pane);
  const barV = box(0.03, height, 0.05, materials.timber);
  barV.position.z = 0.07;
  group.add(barV);
  const barH = box(width, 0.03, 0.05, materials.timber);
  barH.position.z = 0.07;
  group.add(barH);
  const sill = box(width + 0.2, 0.06, 0.16, materials.stone);
  sill.position.set(0, -height / 2 - 0.06, 0.03);
  group.add(sill);
  return group;
}

function buildShutterPair(width: number, height: number, offset: number, materials: Materials): THREE.Group {
  const group = new THREE.Group();
  for (const side of [-1, 1]) {
    const shutter = box(width, height, 0.04, materials.door);
    shutter.position.set(side * offset, 0, 0);
    group.add(shutter);
    for (let i = -1; i <= 1; i += 1) {
      const board = box(width * 0.94, 0.02, 0.02, materials.timber);
      board.position.set(side * offset, i * height * 0.26, 0.035);
      group.add(board);
    }
  }
  return group;
}

function buildFlowerBox(width: number, materials: Materials, rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const trough = box(width * 0.86, 0.15, 0.17, materials.timber);
  group.add(trough);
  const soil = box(width * 0.8, 0.03, 0.12, materials.dirt);
  soil.position.y = 0.085;
  group.add(soil);

  // Dense trailing foliage spilling over the front lip.
  const leafGeo = leafBladeGeometry();
  const leafMat = (materials.foliage as THREE.MeshStandardMaterial).clone();
  leafMat.side = THREE.DoubleSide;
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, 96);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const pos = new THREE.Vector3();
  for (let i = 0; i < 96; i += 1) {
    pos.set((rng() - 0.5) * width * 0.96, 0.09 + rng() * 0.15, (rng() - 0.5) * 0.14);
    dummy.position.copy(pos);
    const out = new THREE.Vector3((rng() - 0.5) * 0.7, 0.5 + rng() * 0.7, (rng() - 0.5) * 0.7).normalize();
    dummy.lookAt(pos.x + out.x, pos.y + out.y, pos.z + out.z);
    dummy.rotateZ((rng() - 0.5) * Math.PI);
    const s = 0.07 + rng() * 0.06;
    dummy.scale.set(s * (0.85 + rng() * 0.4), s * (0.95 + rng() * 0.5), s);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
    const g = 0.6 + rng() * 0.46;
    tint.setRGB(g * 0.84, g, g * 0.62);
    leaves.setColorAt(i, tint);
  }
  leaves.instanceMatrix.needsUpdate = true;
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  group.add(leaves);

  // Small blossom heads rather than oversized berries.
  const bloomGeo = new THREE.SphereGeometry(0.02, 6, 5);
  const bloomMats = [materials.bloom, materials.bloomPink, materials.bloomPurple];
  for (let i = 0; i < 42; i += 1) {
    const bloom = new THREE.Mesh(bloomGeo, bloomMats[i % 3]);
    bloom.position.set((rng() - 0.5) * width * 0.92, 0.16 + rng() * 0.13, (rng() - 0.5) * 0.13);
    bloom.scale.setScalar(0.8 + rng() * 0.7);
    group.add(bloom);
  }
  return group;
}

// ---------------------------------------------------------------------------
// Walls, timber frame, plinth
// ---------------------------------------------------------------------------
const BODY_W = 3.25;
const BODY_D = 2.4;
const PLINTH_H = 0.46;
const WALL_H = 2.0;
const WALL_BASE = PLINTH_H;
/** Top of the squared-stone band. The timber frame starts just above it so no
 *  post or rail ever cuts through the rubble courses. */
const RUBBLE_TOP = 0.96;
const FRAME_BASE = RUBBLE_TOP + 0.04;

/** Shared gable frame: rafter feet land on the corner posts and follow the roof pitch. */
const GABLE_HALF = BODY_W / 2 - 0.06;
const GABLE_BASE_Y = WALL_BASE + WALL_H;
const GABLE_APEX_Y = GABLE_BASE_Y + GABLE_HALF * ((THATCH_RIDGE_Y - THATCH_EAVE_Y) / THATCH_EAVE_X);

function buildPlinth(materials: Materials, rng: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'foundation-plinth';
  // Flush base: the rubble band in buildRubbleWalls dresses the whole lower
  // storey as one continuous squared-stone course.
  const plinth = box(BODY_W + 0.04, PLINTH_H, BODY_D + 0.04, materials.mortar);
  plinth.position.y = PLINTH_H / 2;
  group.add(plinth);

  const dummy = new THREE.Object3D();

  // Moss creeping along the lower courses.
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x5f7a3c, roughness: 0.96 });
  const mossGeo = new THREE.SphereGeometry(0.08, 6, 5);
  const moss = new THREE.InstancedMesh(mossGeo, mossMat, 26);
  for (let i = 0; i < 26; i += 1) {
    const angle = (i / 26) * Math.PI * 2 + rng() * 0.4;
    const hw = (BODY_W + 0.04) / 2;
    const hd = (BODY_D + 0.04) / 2;
    const x = Math.cos(angle) * (hw + 0.02);
    const z = Math.sin(angle) * (hd + 0.02);
    dummy.position.set(x, 0.08 + rng() * 0.28, z);
    dummy.rotation.set(rng(), rng() * Math.PI, rng());
    const sc = 0.6 + rng() * 1.1;
    dummy.scale.set(sc, sc * 0.5, sc);
    dummy.updateMatrix();
    moss.setMatrixAt(i, dummy.matrix);
  }
  moss.instanceMatrix.needsUpdate = true;
  group.add(moss);

  return group;
}

/** Stone stair from the ground up to the door threshold; carries a box collider. */
function buildEntryStairs(materials: Materials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'entry-stairs';
  const count = 4;
  const run = 0.28;
  const width = 1.3;
  const topY = PLINTH_H + 0.16;
  for (let k = 0; k < count; k += 1) {
    const h = topY - (k * topY) / count;
    const zInner = BODY_D / 2 + k * run;
    const step = box(width, h, run, materials.stone);
    step.position.set(0, h / 2, zInner + run / 2);
    group.add(step);
  }
  return group;
}

function buildWalls(materials: Materials): THREE.Mesh {
  const walls = box(BODY_W, WALL_H, BODY_D, materials.plaster);
  walls.position.y = WALL_BASE + WALL_H / 2;
  walls.name = 'wall-shell';
  return walls;
}

function buildRubbleWalls(materials: Materials, rng: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'rubble-walls';

  // Three even courses, tight joints and a single flush face depth so the band
  // reads as tidy coursed rubble instead of a random scatter.
  const courseH = 0.32;
  const courses = [
    { y: 0.16, h: courseH },
    { y: 0.48, h: courseH },
    { y: 0.80, h: courseH },
  ];
  const bandH = RUBBLE_TOP;
  const frontZ = BODY_D / 2 + 0.02;
  const sideX = BODY_W / 2 + 0.02;
  const faceDepth = 0.07;

  // Mortar joints behind the flush stones.
  const backing = (w: number, d: number, x: number, z: number) => {
    const b = box(w, bandH, d, materials.mortar);
    b.position.set(x, bandH / 2, z);
    group.add(b);
  };
  backing(BODY_W + 0.02, 0.05, 0, BODY_D / 2 - 0.005);
  backing(BODY_W + 0.02, 0.05, 0, -(BODY_D / 2 - 0.005));
  backing(0.05, BODY_D + 0.02, BODY_W / 2 - 0.005, 0);
  backing(0.05, BODY_D + 0.02, -(BODY_W / 2 - 0.005), 0);

  interface Face {
    axis: 'z' | 'x';
    sign: number;
    span: number;
    skip?: (u: number) => boolean;
  }
  const faces: Face[] = [
    { axis: 'z', sign: 1, span: BODY_W, skip: (u) => Math.abs(u) < 0.6 },
    { axis: 'z', sign: -1, span: BODY_W },
    { axis: 'x', sign: 1, span: BODY_D },
    { axis: 'x', sign: -1, span: BODY_D },
  ];

  const geo = new THREE.BoxGeometry(1, 1, 1);
  interface Place { pos: [number, number, number]; rotY: number; scale: [number, number, number]; shade: number }
  const placements: Place[] = [];
  for (const f of faces) {
    for (const c of courses) {
      // Fill the face exactly edge to edge; varied block widths stagger the joints.
      let u = -f.span / 2;
      while (u < f.span / 2 - 1e-3) {
        let w = 0.3 + rng() * 0.2;
        if (u + w > f.span / 2) w = f.span / 2 - u;
        const cu = u + w / 2;
        if (w > 0.12 && !(f.skip && f.skip(cu))) {
          const pos: [number, number, number] = f.axis === 'z'
            ? [cu, c.y, f.sign * frontZ]
            : [f.sign * sideX, c.y, cu];
          placements.push({
            pos,
            rotY: f.axis === 'x' ? Math.PI / 2 : 0,
            scale: [w, c.h * (0.95 + rng() * 0.05), faceDepth],
            shade: 0.88 + rng() * 0.16,
          });
        }
        u += w + 0.02;
      }
    }
  }

  const inst = new THREE.InstancedMesh(geo, materials.rubbleStone, placements.length);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  placements.forEach((p, i) => {
    dummy.position.set(p.pos[0], p.pos[1], p.pos[2]);
    dummy.rotation.set(0, p.rotY, 0);
    dummy.scale.set(p.scale[0], p.scale[1], p.scale[2]);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
    tint.setRGB(p.shade, p.shade * 0.99, p.shade * 0.95);
    inst.setColorAt(i, tint);
  });
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  group.add(inst);

  // Corner quoins: flat dressed stones stacked flush on the four vertical edges.
  const quoins: Place[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (const c of courses) {
        quoins.push({
          pos: [sx * (BODY_W / 2 - 0.03), c.y, sz * (BODY_D / 2 - 0.03)],
          rotY: 0,
          scale: [0.34, c.h * 0.96, 0.34],
          shade: 0.94 + rng() * 0.1,
        });
      }
    }
  }
  const qinst = new THREE.InstancedMesh(geo, materials.rubbleStone, quoins.length);
  quoins.forEach((p, i) => {
    dummy.position.set(p.pos[0], p.pos[1], p.pos[2]);
    dummy.rotation.set(0, p.rotY, 0);
    dummy.scale.set(p.scale[0], p.scale[1], p.scale[2]);
    dummy.updateMatrix();
    qinst.setMatrixAt(i, dummy.matrix);
    tint.setRGB(p.shade, p.shade * 0.99, p.shade * 0.95);
    qinst.setColorAt(i, tint);
  });
  qinst.instanceMatrix.needsUpdate = true;
  if (qinst.instanceColor) qinst.instanceColor.needsUpdate = true;
  group.add(qinst);
  return group;
}

function buildTimberFrame(materials: Materials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'timber-frame';
  const t = 0.12;
  const half = BODY_W / 2;
  const zF = BODY_D / 2 + 0.02;
  const zR = -(BODY_D / 2 + 0.02);
  const frameTop = WALL_BASE + WALL_H;
  const frameH = frameTop - FRAME_BASE;
  const frameCY = (FRAME_BASE + frameTop) / 2;
  // Posts flanking the doorway sit just outside the stone arch surround.
  const doorHalf = 0.72;
  const add = (mesh: THREE.Mesh) => group.add(mesh);

  // Vertical posts: front corners and door flanks, rear corners, and flank bays.
  for (const x of [-half + 0.06, -doorHalf, doorHalf, half - 0.06]) {
    const post = box(t, frameH, t, materials.timber);
    post.position.set(x, frameCY, zF);
    add(post);
  }
  for (const x of [-half + 0.06, half - 0.06]) {
    const post = box(t, frameH, t, materials.timber);
    post.position.set(x, frameCY, zR);
    add(post);
  }
  for (const z of [-BODY_D / 3, BODY_D / 3]) {
    for (const side of [-1, 1]) {
      const post = box(t, frameH, t, materials.timber);
      post.position.set(side * (half + 0.02), frameCY, z);
      add(post);
    }
  }

  // Front rails: sill above the stone, a head rail split around the doorway,
  // and the top plate.
  const sill = box(BODY_W, t, t, materials.timber);
  sill.position.set(0, FRAME_BASE + 0.06, zF);
  add(sill);
  const railW = half - doorHalf;
  for (const side of [-1, 1]) {
    const head = box(railW, t, t, materials.timber);
    head.position.set(side * (doorHalf + railW / 2), 1.82, zF);
    add(head);
  }
  const plate = box(BODY_W, t, t, materials.timber);
  plate.position.set(0, frameTop - 0.06, zF);
  add(plate);
  const rearPlate = plate.clone();
  rearPlate.position.z = zR;
  add(rearPlate);

  // Corner knee braces under the eaves.
  for (const side of [-1, 1]) {
    const brace = box(0.62, t, t, materials.timber);
    brace.position.set(side * (half - 0.22), frameTop - 0.2, zF);
    brace.rotation.z = side * 0.8;
    add(brace);
  }
  return group;
}

function buildGableWall(sign: number, materials: Materials): THREE.Group {
  const group = new THREE.Group();
  group.name = sign > 0 ? 'gable-wall-front' : 'gable-wall-rear';

  // Thin panel flush with the wall face. The cap is a hand-built fan over the
  // deduplicated soffit outline, so it cannot tear open the way an ExtrudeGeometry
  // earcut of a clamped, duplicate-pointed shape can (which leaked the chimney).
  const half = BODY_W / 2;
  const baseY = WALL_BASE + WALL_H - 0.34;
  const ix = THATCH_EAVE_X - THATCH_LIP;
  const iey = THATCH_EAVE_Y - THATCH_LIP;
  const iry = THATCH_RIDGE_Y - THATCH_RIDGE_T;
  const soffit = (x: number): number => iey + (iry - iey) * thatchSlope(Math.min(1, Math.abs(x) / ix));

  const loop: THREE.Vector2[] = [new THREE.Vector2(-half, baseY), new THREE.Vector2(half, baseY)];
  const segs = 20;
  for (let k = segs; k >= 0; k -= 1) {
    const x = -half + (k / segs) * 2 * half;
    loop.push(new THREE.Vector2(x, Math.max(baseY, soffit(x) - 0.04)));
  }
  const clean: THREE.Vector2[] = [];
  for (const p of loop) {
    const last = clean[clean.length - 1];
    if (!last || last.distanceTo(p) > 1e-4) clean.push(p);
  }
  if (clean[0].distanceTo(clean[clean.length - 1]) < 1e-4) clean.pop();

  const L = clean.length;
  let maxY = baseY;
  for (const p of clean) maxY = Math.max(maxY, p.y);
  const centre = new THREE.Vector2(0, (baseY + maxY) / 2);

  const depth = GABLE_FACE - BODY_D / 2;
  const zIn = sign > 0 ? BODY_D / 2 : -BODY_D / 2;
  const zOut = zIn + sign * depth;

  const positions: number[] = [];
  const indices: number[] = [];
  const front: number[] = [];
  const back: number[] = [];
  const pushV = (x: number, y: number, z: number): number => {
    positions.push(x, y, z);
    return positions.length / 3 - 1;
  };
  const cOut = pushV(centre.x, centre.y, zOut);
  const cIn = pushV(centre.x, centre.y, zIn);
  for (const p of clean) front.push(pushV(p.x, p.y, zOut));
  for (const p of clean) back.push(pushV(p.x, p.y, zIn));
  for (let i = 0; i < L; i += 1) {
    const j = (i + 1) % L;
    indices.push(cOut, front[j], front[i]);
    indices.push(cIn, back[i], back[j]);
    indices.push(front[i], back[i], back[j], front[i], back[j], front[j]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const panelMat = (materials.plaster as THREE.MeshStandardMaterial).clone();
  panelMat.side = THREE.DoubleSide;
  group.add(new THREE.Mesh(geo, panelMat));

  // Barge boards framing the roof edge plus the gable tie, aligned to the truss.
  const zFace = zOut + sign * 0.02;
  const rafterLen = Math.hypot(GABLE_HALF, GABLE_APEX_Y - GABLE_BASE_Y);
  const rafterAngle = Math.atan2(GABLE_APEX_Y - GABLE_BASE_Y, GABLE_HALF);
  for (const side of [-1, 1]) {
    const barge = box(rafterLen, 0.13, 0.13, materials.timber);
    barge.position.set((side * GABLE_HALF) / 2, (GABLE_BASE_Y + GABLE_APEX_Y) / 2, zFace);
    barge.rotation.z = -side * rafterAngle;
    group.add(barge);
  }
  const tie = box(GABLE_HALF * 2 + 0.13, 0.13, 0.13, materials.timber);
  tie.position.set(0, GABLE_BASE_Y - 0.04, zFace);
  group.add(tie);

  return group;
}

function buildGableTruss(materials: Materials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'gable-truss';
  // The barge boards on the gable panel are the rafters/tie; the truss adds the
  // collar, king post, knee braces and pegs on the same frame so they line up.
  const z = GABLE_FACE + 0.06;
  const half = GABLE_HALF;
  const baseY = GABLE_BASE_Y;
  const apexY = GABLE_APEX_Y;
  const t = 0.13;
  const collarY = apexY - 0.46;

  const collar = box(half * 1.15, t, t, materials.timber);
  collar.position.set(0, collarY, z);
  group.add(collar);
  const king = box(t, apexY - collarY, t, materials.timber);
  king.position.set(0, (apexY + collarY) / 2, z);
  group.add(king);

  // Knee braces from the tie ends up to the rafters.
  for (const side of [-1, 1]) {
    const brace = box(0.6, 0.1, 0.1, materials.timber);
    brace.position.set(side * (half - 0.34), baseY + 0.3, z);
    brace.rotation.z = side * 0.72;
    group.add(brace);
  }

  // Pegs at the principal joints.
  const peg = new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6);
  const pegs = new THREE.InstancedMesh(peg, materials.timber, 5);
  const dummy = new THREE.Object3D();
  const spots: [number, number][] = [[-half, baseY], [half, baseY], [0, apexY - 0.08], [-half * 0.58, collarY], [half * 0.58, collarY]];
  spots.forEach((spot, i) => {
    dummy.position.set(spot[0], spot[1], z + 0.06);
    dummy.rotation.set(Math.PI / 2, 0, 0);
    dummy.updateMatrix();
    pegs.setMatrixAt(i, dummy.matrix);
  });
  pegs.instanceMatrix.needsUpdate = true;
  group.add(pegs);
  return group;
}

// ---------------------------------------------------------------------------
// Lantern, ivy, garden
// ---------------------------------------------------------------------------
function buildLantern(materials: Materials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'wall-lantern';
  group.position.set(0.78, 1.75, BODY_D / 2 + 0.16);
  const bracket = box(0.05, 0.05, 0.22, materials.iron);
  bracket.position.set(-0.12, 0.16, -0.1);
  group.add(bracket);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = box(0.03, 0.28, 0.03, materials.iron);
      post.position.set(sx * 0.085, 0, sz * 0.085);
      group.add(post);
    }
  }
  const rimTop = box(0.2, 0.03, 0.2, materials.iron);
  rimTop.position.y = 0.14;
  group.add(rimTop);
  const rimBot = box(0.2, 0.03, 0.2, materials.iron);
  rimBot.position.y = -0.14;
  group.add(rimBot);
  const pane = box(0.15, 0.24, 0.15, materials.glass);
  group.add(pane);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.12, 4), materials.iron);
  cap.position.y = 0.2;
  cap.rotation.y = Math.PI / 4;
  group.add(cap);
  return group;
}

function buildIvy(materials: Materials, rng: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'climbing-ivy';
  const leafMat = (materials.foliage as THREE.MeshStandardMaterial).clone();
  leafMat.side = THREE.DoubleSide;
  const leafGeo = leafBladeGeometry();

  // Main runners climbing the front-right corner, kept clear of the right window.
  const stemPaths: number[][][] = [
    [[0.92, 0.05, 1.02], [1.3, 0.6, 1.0], [1.56, 1.25, 0.92], [1.62, 1.95, 0.82], [1.5, 2.5, 0.7]],
    [[1.6, 0.25, 1.18], [1.66, 0.95, 1.26], [1.6, 1.65, 1.16], [1.44, 2.28, 1.02]],
    [[0.85, 0.15, 1.38], [1.15, 0.75, 1.44], [1.42, 1.45, 1.4], [1.56, 2.05, 1.3]],
    [[1.05, 0.05, 0.62], [1.4, 0.7, 0.66], [1.6, 1.4, 0.6]],
  ];
  const curves = stemPaths.map((pts) => new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]))));
  const stemMat = (materials.bark as THREE.MeshStandardMaterial).clone();
  stemMat.color = new THREE.Color('#3f4d24');
  curves.forEach((curve) => {
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.01, 5, false), stemMat));
  });

  // Leaf blades clustered around the runners and facing away from the walls.
  const count = 1150;
  const inst = new THREE.InstancedMesh(leafGeo, leafMat, count);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const tmp = new THREE.Vector3();
  for (let i = 0; i < count; i += 1) {
    const curve = curves[i % curves.length];
    const t = Math.min(0.99, Math.max(0.01, rng()));
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t).normalize();
    const ref = Math.abs(tan.y) > 0.85 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const sideA = new THREE.Vector3().crossVectors(tan, ref).normalize();
    const sideB = new THREE.Vector3().crossVectors(tan, sideA).normalize();
    const ang = rng() * Math.PI * 2;
    const rad = 0.02 + Math.pow(rng(), 0.6) * 0.18;
    tmp.copy(p).addScaledVector(sideA, Math.cos(ang) * rad).addScaledVector(sideB, Math.sin(ang) * rad);
    dummy.position.copy(tmp);
    const outward = new THREE.Vector3(
      Math.max(0, tmp.x - BODY_W / 2) + 0.12,
      0.25 + rng() * 0.5,
      Math.max(0, tmp.z - BODY_D / 2) + 0.12,
    ).normalize();
    dummy.lookAt(tmp.x + outward.x, tmp.y + outward.y, tmp.z + outward.z);
    dummy.rotateZ((rng() - 0.5) * Math.PI);
    const s = 0.09 + rng() * 0.1;
    dummy.scale.set(s * (0.85 + rng() * 0.4), s * (0.9 + rng() * 0.5), s);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
    const g = 0.6 + rng() * 0.5;
    tint.setRGB(g * 0.88, g, g * 0.68);
    inst.setColorAt(i, tint);
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  group.add(inst);
  return group;
}

function buildGarden(materials: Materials, rng: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'garden-vegetation';

  const soilGeo = new THREE.SphereGeometry(0.11, 7, 5);
  const bushGeo = new THREE.SphereGeometry(0.08, 7, 6);
  const bloomGeo = new THREE.SphereGeometry(0.023, 7, 6);
  const stemGeo = new THREE.CylinderGeometry(0.0045, 0.007, 1, 5);
  const spikeGeo = new THREE.ConeGeometry(0.016, 0.2, 5);
  const grassGeo = new THREE.ConeGeometry(0.011, 0.3, 4);
  const leafGeo = leafBladeGeometry();
  const rockGeo = new THREE.DodecahedronGeometry(0.07, 0);

  const leafMat = (materials.bed as THREE.MeshStandardMaterial).clone();
  leafMat.side = THREE.DoubleSide;
  const stemMat = (materials.foliage as THREE.MeshStandardMaterial).clone();
  stemMat.color = new THREE.Color('#3d5222');
  const grassMat = (materials.foliage as THREE.MeshStandardMaterial).clone();
  grassMat.side = THREE.DoubleSide;

  // Beds ring the cottage, leaving the entry path and the barrel/log store clear.
  const beds: [number, number, number][] = [
    [-1.75, 1.35, 0.78], [1.55, 1.3, 0.72], [-1.95, 0.3, 0.82], [-1.85, -0.8, 0.66],
    [1.9, 0.42, 0.6], [1.82, -0.95, 0.56], [-1.35, -1.6, 0.66], [1.1, -1.8, 0.6],
    [-0.55, 1.9, 0.62], [-0.2, -2.0, 0.58],
  ];
  const PER = { soil: 6, bush: 12, leaf: 46, flower: 7, lavender: 4, grass: 14, rock: 1 };
  const total = (key: keyof typeof PER) => beds.length * PER[key];

  const soil = new THREE.InstancedMesh(soilGeo, materials.dirt, total('soil'));
  const bushes = new THREE.InstancedMesh(bushGeo, materials.bed, total('bush'));
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, total('leaf'));
  const stems = new THREE.InstancedMesh(stemGeo, stemMat, total('flower') + total('lavender'));
  const blooms = new THREE.InstancedMesh(bloomGeo, materials.bloom, total('flower'));
  const spikes = new THREE.InstancedMesh(spikeGeo, materials.bloomPurple, total('lavender'));
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, total('grass'));
  const rocks = new THREE.InstancedMesh(rockGeo, materials.stone, total('rock'));

  const d = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  const bloomTints = [new THREE.Color('#f2eee2'), new THREE.Color('#e2aec4'), new THREE.Color('#c9b3e0'), new THREE.Color('#f0d98a')];
  const idx = { soil: 0, bush: 0, leaf: 0, stem: 0, bloom: 0, spike: 0, grass: 0, rock: 0 };

  beds.forEach((bed) => {
    const [bx, bz, br] = bed;
    // Dark soil showing through the planting.
    for (let i = 0; i < PER.soil; i += 1) {
      const a = rng() * Math.PI * 2;
      const r = Math.pow(rng(), 0.5) * br * 0.8;
      d.position.set(bx + Math.cos(a) * r, 0.02 + rng() * 0.03, bz + Math.sin(a) * r * 0.85);
      d.rotation.set(rng() * 0.4, rng() * Math.PI, rng() * 0.4);
      const s = 0.7 + rng() * 0.7;
      d.scale.set(s, s * 0.35, s);
      d.updateMatrix();
      soil.setMatrixAt(idx.soil, d.matrix);
      idx.soil += 1;
    }
    // Low green mound, taller toward the middle.
    for (let i = 0; i < PER.bush; i += 1) {
      const a = rng() * Math.PI * 2;
      const r = Math.pow(rng(), 0.6) * br * 0.5;
      d.position.set(bx + Math.cos(a) * r, 0.05 + (br * 0.5 - r) * 0.3, bz + Math.sin(a) * r * 0.85);
      d.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      const s = 0.7 + rng() * 0.9;
      d.scale.set(s, s * (0.5 + rng() * 0.35), s);
      d.updateMatrix();
      bushes.setMatrixAt(idx.bush, d.matrix);
      const g = 0.74 + rng() * 0.38;
      tint.setRGB(g * 0.94, g, g * 0.72);
      bushes.setColorAt(idx.bush, tint);
      idx.bush += 1;
    }
    // Leaf blades fanning up and out of the mound.
    for (let i = 0; i < PER.leaf; i += 1) {
      const a = rng() * Math.PI * 2;
      const r = Math.pow(rng(), 0.5) * br * 0.85;
      const px = bx + Math.cos(a) * r;
      const pz = bz + Math.sin(a) * r * 0.85;
      const py = 0.05 + rng() * 0.26;
      d.position.set(px, py, pz);
      const out = new THREE.Vector3(Math.cos(a), 0.6 + rng() * 0.7, Math.sin(a)).normalize();
      d.lookAt(px + out.x, py + out.y, pz + out.z);
      d.rotateZ((rng() - 0.5) * Math.PI);
      const s = 0.12 + rng() * 0.14;
      d.scale.set(s * (0.85 + rng() * 0.35), s * (1 + rng() * 0.5), s);
      d.updateMatrix();
      leaves.setMatrixAt(idx.leaf, d.matrix);
      const g = 0.62 + rng() * 0.46;
      tint.setRGB(g * 0.82, g, g * 0.6);
      leaves.setColorAt(idx.leaf, tint);
      idx.leaf += 1;
    }
    // Flower stems with a blossom on top.
    for (let i = 0; i < PER.flower; i += 1) {
      const a = rng() * Math.PI * 2;
      const r = Math.pow(rng(), 0.5) * br * 0.8;
      const base = new THREE.Vector3(bx + Math.cos(a) * r, 0.03, bz + Math.sin(a) * r * 0.85);
      const tilt = new THREE.Vector3((rng() - 0.5) * 0.6, 1, (rng() - 0.5) * 0.6).normalize();
      const h = 0.2 + rng() * 0.18;
      d.position.copy(base).addScaledVector(tilt, h / 2);
      d.quaternion.setFromUnitVectors(up, tilt);
      d.scale.set(1, h, 1);
      d.updateMatrix();
      stems.setMatrixAt(idx.stem, d.matrix);
      idx.stem += 1;
      const tip = base.clone().addScaledVector(tilt, h);
      d.position.copy(tip);
      d.quaternion.identity();
      d.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      d.scale.setScalar(0.7 + rng() * 0.8);
      d.updateMatrix();
      blooms.setMatrixAt(idx.bloom, d.matrix);
      blooms.setColorAt(idx.bloom, bloomTints[Math.floor(rng() * bloomTints.length)]);
      idx.bloom += 1;
    }
    // Lavender: taller stems topped with a purple spike.
    for (let i = 0; i < PER.lavender; i += 1) {
      const a = rng() * Math.PI * 2;
      const r = Math.pow(rng(), 0.5) * br * 0.85;
      const base = new THREE.Vector3(bx + Math.cos(a) * r, 0.03, bz + Math.sin(a) * r * 0.85);
      const tilt = new THREE.Vector3((rng() - 0.5) * 0.35, 1, (rng() - 0.5) * 0.35).normalize();
      const h = 0.24 + rng() * 0.14;
      d.position.copy(base).addScaledVector(tilt, h / 2);
      d.quaternion.setFromUnitVectors(up, tilt);
      d.scale.set(1, h, 1);
      d.updateMatrix();
      stems.setMatrixAt(idx.stem, d.matrix);
      idx.stem += 1;
      d.position.copy(base).addScaledVector(tilt, h + 0.06);
      d.quaternion.setFromUnitVectors(up, tilt);
      d.scale.setScalar(0.8 + rng() * 0.5);
      d.updateMatrix();
      spikes.setMatrixAt(idx.spike, d.matrix);
      idx.spike += 1;
    }
    // Fine ornamental grass for silhouette texture.
    for (let i = 0; i < PER.grass; i += 1) {
      const a = rng() * Math.PI * 2;
      const r = Math.pow(rng(), 0.5) * br;
      const tilt = new THREE.Vector3(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5).normalize();
      d.position.set(bx + Math.cos(a) * r, 0.03, bz + Math.sin(a) * r * 0.85).addScaledVector(tilt, 0.15);
      d.quaternion.setFromUnitVectors(up, tilt);
      d.scale.set(0.7 + rng() * 0.6, 0.7 + rng() * 0.9, 0.7 + rng() * 0.6);
      d.updateMatrix();
      grass.setMatrixAt(idx.grass, d.matrix);
      const g = 0.66 + rng() * 0.4;
      tint.setRGB(g * 0.86, g, g * 0.55);
      grass.setColorAt(idx.grass, tint);
      idx.grass += 1;
    }
    // A fieldstone tucked into the bed.
    for (let i = 0; i < PER.rock; i += 1) {
      const a = rng() * Math.PI * 2;
      const r = br * (0.6 + rng() * 0.4);
      d.position.set(bx + Math.cos(a) * r, 0.05, bz + Math.sin(a) * r * 0.85);
      d.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      const s = 0.6 + rng() * 0.9;
      d.scale.set(s, s * 0.65, s);
      d.updateMatrix();
      rocks.setMatrixAt(idx.rock, d.matrix);
      idx.rock += 1;
    }
  });

  [soil, bushes, leaves, stems, blooms, spikes, grass, rocks].forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });
  return group;
}

function buildBarrel(materials: Materials, rng: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'barrel-planter';
  group.position.set(-1.35, 0, 1.5);
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.24, 0),
    new THREE.Vector2(0.29, 0.16),
    new THREE.Vector2(0.31, 0.34),
    new THREE.Vector2(0.29, 0.52),
    new THREE.Vector2(0.24, 0.66),
  ];
  const barrel = new THREE.Mesh(new THREE.LatheGeometry(profile, 16), materials.barrel);
  group.add(barrel);
  for (const y of [0.12, 0.33, 0.54]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 6, 18), materials.iron);
    hoop.position.y = y;
    hoop.rotation.x = Math.PI / 2;
    group.add(hoop);
  }

  // Soil fill so the open top never reads as a hollow shell, plus a mound of
  // planting that spills over the rim.
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.215, 0.05, 16), materials.dirt);
  soil.position.y = 0.61;
  group.add(soil);

  const leafGeo = leafBladeGeometry();
  const leafMat = (materials.foliage as THREE.MeshStandardMaterial).clone();
  leafMat.side = THREE.DoubleSide;
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, 70);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const pos = new THREE.Vector3();
  for (let i = 0; i < 70; i += 1) {
    const a = rng() * Math.PI * 2;
    const r = Math.pow(rng(), 0.6) * 0.22;
    pos.set(Math.cos(a) * r, 0.64 + (0.22 - r) * 0.5 + rng() * 0.05, Math.sin(a) * r);
    dummy.position.copy(pos);
    const out = new THREE.Vector3(Math.cos(a), 0.7 + rng() * 0.6, Math.sin(a)).normalize();
    dummy.lookAt(pos.x + out.x, pos.y + out.y, pos.z + out.z);
    dummy.rotateZ((rng() - 0.5) * Math.PI);
    const s = 0.08 + rng() * 0.07;
    dummy.scale.set(s * (0.85 + rng() * 0.4), s * (0.95 + rng() * 0.5), s);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
    const g = 0.6 + rng() * 0.48;
    tint.setRGB(g * 0.86, g, g * 0.6);
    leaves.setColorAt(i, tint);
  }
  leaves.instanceMatrix.needsUpdate = true;
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  group.add(leaves);

  const bloomGeo = new THREE.SphereGeometry(0.022, 6, 5);
  const bloomMats = [materials.bloom, materials.bloomPink, materials.bloomPurple];
  for (let i = 0; i < 14; i += 1) {
    const a = rng() * Math.PI * 2;
    const r = Math.pow(rng(), 0.5) * 0.2;
    const bloom = new THREE.Mesh(bloomGeo, bloomMats[i % 3]);
    bloom.position.set(Math.cos(a) * r, 0.76 + rng() * 0.12, Math.sin(a) * r);
    bloom.scale.setScalar(0.8 + rng() * 0.7);
    group.add(bloom);
  }
  return group;
}

function buildLogStore(materials: Materials, rng: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'woodshed-lean-to';
  group.position.set(0.92, 0, -1.5);
  group.rotation.y = Math.PI;
  const roof = box(1.06, 0.07, 0.62, materials.timber);
  roof.position.set(0, 1.0, 0);
  roof.rotation.x = 0.24;
  group.add(roof);
  for (const x of [-0.46, 0.46]) {
    const post = box(0.09, 1.0, 0.09, materials.timber);
    post.position.set(x, 0.5, 0.24);
    group.add(post);
    const backPost = box(0.09, 1.14, 0.09, materials.timber);
    backPost.position.set(x, 0.57, -0.22);
    group.add(backPost);
  }
  // Stacked logs with visible cut ends facing outward.
  const placements: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < 42; i += 1) {
    const row = Math.floor(i / 7);
    const col = i % 7;
    placements.push({ x: -0.42 + col * 0.14, y: 0.12 + row * 0.115, z: (rng() - 0.5) * 0.05 });
  }
  const logGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.55, 8);
  const logs = new THREE.InstancedMesh(logGeo, materials.bark, placements.length);
  const ends = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 8), materials.logEnd, placements.length);
  const dummy = new THREE.Object3D();
  placements.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(Math.PI / 2, 0, 0);
    dummy.scale.set(1, 1 + rng() * 0.2, 1);
    dummy.updateMatrix();
    logs.setMatrixAt(i, dummy.matrix);
    dummy.position.set(p.x, p.y, p.z + 0.27);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    ends.setMatrixAt(i, dummy.matrix);
  });
  logs.instanceMatrix.needsUpdate = true;
  ends.instanceMatrix.needsUpdate = true;
  group.add(logs);
  group.add(ends);
  return group;
}

function buildFences(materials: Materials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'fences';
  const build = (cx: number, cz: number, length: number, rotation: number) => {
    const fence = new THREE.Group();
    fence.position.set(cx, 0, cz);
    fence.rotation.y = rotation;
    const postCount = Math.max(2, Math.round(length / 0.6));
    for (let i = 0; i <= postCount; i += 1) {
      const post = box(0.08, 0.7, 0.08, materials.timber);
      post.position.set(-length / 2 + (i / postCount) * length, 0.35, 0);
      fence.add(post);
    }
    for (const y of [0.28, 0.54]) {
      const rail = box(length, 0.07, 0.06, materials.timber);
      rail.position.set(0, y, 0);
      rail.rotation.z = 0.02;
      fence.add(rail);
    }
    group.add(fence);
  };
  build(-1.7, 1.9, 1.3, 0.25);
  build(1.95, -1.6, 1.3, -0.4);
  return group;
}

function buildRocks(materials: Materials, rng: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'rocks';
  const rockGeo = new THREE.DodecahedronGeometry(0.12, 0);
  const count = 30;
  const inst = new THREE.InstancedMesh(rockGeo, materials.stone, count);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const clearX = BODY_W / 2 + 0.16;
  const clearZ = BODY_D / 2 + 0.16;
  let placed = 0;
  let guard = 0;
  while (placed < count && guard < count * 60) {
    guard += 1;
    const angle = rng() * Math.PI * 2;
    const radius = 1.7 + rng() * 1.6;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    // Skip any stone that would sink inside the plinth; only scatter the ground.
    if (Math.abs(x) < clearX && Math.abs(z) < clearZ) continue;
    dummy.position.set(x, 0.05 + rng() * 0.05, z);
    dummy.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    const s = 0.55 + rng() * 1.2;
    dummy.scale.set(s, s * 0.62, s * 0.92);
    dummy.updateMatrix();
    inst.setMatrixAt(placed, dummy.matrix);
    const g = 0.72 + rng() * 0.32;
    tint.setRGB(g * 0.98, g, g * 0.92);
    inst.setColorAt(placed, tint);
    placed += 1;
  }
  inst.count = placed;
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  group.add(inst);
  return group;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------
export function createThatchedCottageModel(options: ThatchedCottageOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = 'building_thatched_cottage_a_root';
  const scale = options.scale ?? 1;
  const cast = options.castShadow ?? true;
  const receive = options.receiveShadow ?? true;
  const rng = mulberry32(options.seed ?? 20260914);

  const materials = buildMaterials(rng);
  const nodes: Record<string, THREE.Object3D> = { root };
  const meshes: Record<string, THREE.Mesh> = {};
  const sockets: Record<string, THREE.Object3D> = {};
  const colliders: Record<string, unknown> = {};
  const destructionGroups: Record<string, THREE.Object3D[]> = { root: [] };

  const register = (name: string, group: THREE.Object3D): THREE.Object3D => {
    group.name = name;
    shadowed(group, cast, receive);
    root.add(group);
    nodes[name] = group;
    destructionGroups.root.push(group);
    colliders[name] = { type: 'box', offset: [0, 0, 0], scale: [1, 1, 1], isTrigger: false };
    return group;
  };

  register('foundation-plinth', buildPlinth(materials, rng));
  const entryStairs = register('entry-stairs', buildEntryStairs(materials));
  entryStairs.position.set(0, 0, 0);
  colliders['entry-stairs'] = {
    type: 'box',
    offset: [0, (PLINTH_H + 0.16) / 2, BODY_D / 2 + 0.56],
    scale: [1.3, PLINTH_H + 0.16, 1.12],
    isTrigger: false,
  };
  register('rubble-walls', buildRubbleWalls(materials, rng));

  const walls = buildWalls(materials);
  shadowed(walls, cast, receive);
  root.add(walls);
  nodes['wall-shell'] = walls;
  meshes['wall-shell'] = walls;

  const gables = new THREE.Group();
  gables.add(buildGableWall(1, materials));
  gables.add(buildGableWall(-1, materials));
  register('gable-walls', gables);

  register('timber-frame', buildTimberFrame(materials));
  register('gable-truss', buildGableTruss(materials));

  register('thatch-roof', buildThatch(rng, materials));
  register('eyebrow-dormer', buildEyebrowDormer(materials));
  register('stone-chimney', buildChimney(materials, rng));

  // Entry: door group positioned at the facade.
  const door = buildDoor(materials);
  door.position.set(0, PLINTH_H + 0.16, BODY_D / 2 + 0.02);
  register('entry-system', door);
  register('wall-lantern', buildLantern(materials));

  // Fenestration: upper casement, flank casement + shutters + flower boxes.
  // The gable casement sits below the raised collar so no timber crosses it.
  const upper = buildCasement(0.66, 0.54, materials);
  upper.position.set(0, WALL_BASE + 2.53, GABLE_FACE + 0.03);
  register('upper-casement', upper);
  const upperBox = buildFlowerBox(0.78, materials, rng);
  upperBox.position.set(0, WALL_BASE + 2.10, GABLE_FACE + 0.10);
  register('upper-flower-box', upperBox);
  const gableShutters = buildShutterPair(0.24, 0.58, 0.47, materials);
  gableShutters.position.set(0, WALL_BASE + 2.53, GABLE_FACE + 0.05);
  register('gable-shutters', gableShutters);

  const flank = buildCasement(0.52, 0.44, materials);
  flank.position.set(-1.05, WALL_BASE + 0.95, BODY_D / 2 + 0.06);
  register('side-casement', flank);
  const shutters = buildShutterPair(0.22, 0.56, 0.4, materials);
  shutters.position.set(-1.05, WALL_BASE + 0.95, BODY_D / 2 + 0.1);
  register('shutters', shutters);

  // Right-hand flank window, between the flank posts like the reference.
  const rightFlank = buildCasement(0.5, 0.44, materials);
  rightFlank.position.set(BODY_W / 2 + 0.06, WALL_BASE + 1.0, 0);
  rightFlank.rotation.y = Math.PI / 2;
  register('right-casement', rightFlank);
  const rightShutters = buildShutterPair(0.2, 0.54, 0.39, materials);
  rightShutters.position.set(BODY_W / 2 + 0.1, WALL_BASE + 1.0, 0);
  rightShutters.rotation.y = Math.PI / 2;
  register('right-shutters', rightShutters);

  const rear = buildCasement(0.6, 0.48, materials);
  rear.position.set(0, WALL_BASE + 1.0, -BODY_D / 2 - 0.06);
  rear.rotation.y = Math.PI;
  register('rear-casement', rear);

  register('climbing-ivy', buildIvy(materials, rng));
  register('garden-vegetation', buildGarden(materials, rng));
  register('barrel-planter', buildBarrel(materials, rng));
  register('woodshed-lean-to', buildLogStore(materials, rng));
  register('fences', buildFences(materials));
  register('rocks', buildRocks(materials, rng));

  const runtime = { nodes, meshes, sockets, colliders, destructionGroups };
  root.userData.sculptRuntime = runtime;
  root.userData.reconstructionEvidence = {
    source: 'output/thatched-cottage/reference/*.png (4-view turnaround)',
    route: 'procedural-code-only',
  };

  root.userData.setExplode = (t: number): void => {
    const amount = Math.max(0, Math.min(1, t));
    for (const [name, node] of Object.entries(nodes)) {
      if (name === 'root') continue;
      if (!node.userData.basePosition) node.userData.basePosition = node.position.clone();
      const base = node.userData.basePosition as THREE.Vector3;
      const dir = base.clone();
      dir.y += 0.25;
      if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
      dir.normalize().multiplyScalar(amount * 1.2);
      node.position.set(base.x + dir.x, base.y + dir.y, base.z + dir.z);
    }
  };

  root.userData.tick = (delta: number, elapsed: number): void => {
    const flicker = 0.85 + Math.sin(elapsed * 11) * 0.08 + Math.sin(elapsed * 23) * 0.05;
    const glass = materials.glass as THREE.MeshStandardMaterial;
    glass.emissiveIntensity = 0.8 * flicker;
    void delta;
  };

  root.scale.setScalar(scale);
  return root;
}
