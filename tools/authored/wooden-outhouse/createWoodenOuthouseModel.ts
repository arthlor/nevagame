import * as THREE from 'three';

/**
 * Procedural Wooden Outhouse
 * Code-only reconstruction from a 4-view turnaround via the img2threejs pipeline.
 *
 * Identity systems matched to the reference:
 * - Vertical-plank shell (front / rear / flank panels) with proud corner boards and a
 *   rectangular door opening punched through the front panel.
 * - Crescent-moon plank door with two iron strap hinges and a sliding wooden bolt on an
 *   iron strike plate.
 * - Grey-green shingled gable roof: two overlapping shingle slopes, a raised ridge board,
 *   a squared finial post at each apex and layered barge / rafter tails at the gable.
 * - Fieldstone footing, a dressed stone threshold slab and a broad lower step stone.
 * - Rear louvered vent with three slats and a wide sill board.
 * - Grounded prop ring: oak barrel with iron hoops, split-rail post, cut-log stack, ivy,
 *   leafy sprigs, white daisies, grass tufts and boulders on a sandy mound.
 *
 * Runtime:
 * - root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups }
 * - root.userData.setExplode(t)  radial explode for the inspector
 * - root.userData.tick(dt, elapsed)
 */

export interface WoodenOuthouseOptions {
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
  plank: '#523a22',
  plankDark: '#291a0b',
  plankLight: '#67482a',
  door: '#4e341c',
  doorDark: '#2b1a0a',
  shingle: '#4f5341',
  shingleDark: '#2a2e25',
  shingleMoss: '#46532d',
  timber: '#3f2d1a',
  timberDark: '#241a0e',
  stone: '#7c7466',
  stoneDark: '#4c483f',
  step: '#8f8674',
  stepDark: '#6a6254',
  soil: '#94805f',
  soilDark: '#6e5b41',
  grass: '#6f7d40',
  foliage: '#31431a',
  foliageDark: '#18280c',
  bloom: '#eeece0',
  iron: '#26231f',
  ash: '#e8e3da',
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

function canvasTexture(canvas: HTMLCanvasElement, repeatX: number, repeatY: number, srgb: boolean): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
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

/** Vertical board-and-gap timber, like the reference wall planks. */
function planksAlbedo(size: number, rng: () => number, base: string, dark: string, light: string, boards: number): HTMLCanvasElement {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const step = size / boards;
  for (let b = 0; b < boards; b += 1) {
    const x = b * step;
    ctx.fillStyle = b % 2 === 0 ? base : light;
    ctx.globalAlpha = 0.22;
    ctx.fillRect(x, 0, step, size);
    ctx.globalAlpha = 1;
    // seam
    ctx.strokeStyle = dark;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (rng() - 0.5) * 3, size);
    ctx.stroke();
    // grain within the board
    for (let g = 0; g < 10; g += 1) {
      ctx.strokeStyle = dark;
      ctx.globalAlpha = 0.08 + rng() * 0.12;
      ctx.lineWidth = 0.6 + rng() * 1.6;
      const gx = x + 3 + rng() * (step - 6);
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.bezierCurveTo(gx + (rng() - 0.5) * 6, size / 3, gx + (rng() - 0.5) * 6, (2 * size) / 3, gx + (rng() - 0.5) * 4, size);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  noiseOverlay(ctx, size, rng, 14);
  return canvas;
}

/** Overlapping shingle course bands, running across the slope. */
function shingleAlbedo(size: number, rng: () => number, base: string, dark: string, moss: string): HTMLCanvasElement {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const courses = 7;
  const step = size / courses;
  for (let i = 0; i <= courses; i += 1) {
    const y = i * step;
    ctx.strokeStyle = dark;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (rng() - 0.5) * 4);
    ctx.stroke();
    // per-course tone drift
    ctx.fillStyle = i % 3 === 0 ? moss : dark;
    ctx.globalAlpha = 0.12 + rng() * 0.12;
    ctx.fillRect(0, y, size, step * (0.3 + rng() * 0.5));
    // splits between boards
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1;
    for (let s = 0; s < 5; s += 1) {
      const x = rng() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng() - 0.5) * 6, y + step);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  noiseOverlay(ctx, size, rng, 16);
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
    ctx.globalAlpha = 0.16 + rng() * 0.3;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + rng() * 0.7), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  noiseOverlay(ctx, size, rng, 14);
  return canvas;
}

function grayBump(size: number, rng: () => number, lines: number, vertical: boolean, contrast: number): HTMLCanvasElement {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  const step = size / lines;
  for (let i = 0; i <= lines; i += 1) {
    const p = i * step;
    ctx.strokeStyle = i % 2 === 0 ? '#d0d0d0' : '#383838';
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (vertical) {
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
    } else {
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  noiseOverlay(ctx, size, rng, contrast);
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
    rx: number,
    ry: number,
    opts: { bump?: HTMLCanvasElement; bumpScale?: number; metal?: number; color?: string; emissive?: string; emissiveIntensity?: number } = {},
  ): THREE.MeshStandardMaterial => {
    const material = new THREE.MeshStandardMaterial({
      map: canvasTexture(map, rx, ry, true),
      roughness: rough,
      metalness: opts.metal ?? 0,
    });
    if (opts.color) material.color = new THREE.Color(opts.color);
    if (opts.bump) {
      material.bumpMap = canvasTexture(opts.bump, rx, ry, false);
      material.bumpScale = opts.bumpScale ?? 0.03;
    }
    if (opts.emissive) {
      material.emissive = new THREE.Color(opts.emissive);
      material.emissiveIntensity = opts.emissiveIntensity ?? 0.5;
    }
    return material;
  };

  return {
    plank: mk(
      planksAlbedo(size, rng, C.plank, C.plankDark, C.plankLight, 7), 0.86, 2, 2,
      { bump: grayBump(size, rng, 7, true, 26), bumpScale: 0.035 },
    ),
    door: mk(
      planksAlbedo(size, rng, C.door, C.doorDark, C.plankLight, 6), 0.72, 1, 1,
      { bump: grayBump(size, rng, 6, true, 24), bumpScale: 0.028 },
    ),
    shingle: mk(
      shingleAlbedo(size, rng, C.shingle, C.shingleDark, C.shingleMoss), 0.92, 1, 1,
      { bump: grayBump(size, rng, 7, false, 30), bumpScale: 0.05 },
    ),
    timber: mk(
      blotchAlbedo(size, rng, C.timber, [C.timberDark, '#8e6e4a', '#5a4028'], 90, 30), 0.84, 1, 1,
      { bump: grayBump(size, rng, 10, true, 18), bumpScale: 0.03 },
    ),
    corner: mk(
      blotchAlbedo(size, rng, '#7c5a3c', ['#543c28', '#9a7452'], 70, 26), 0.84, 1, 1,
      { bump: grayBump(size, rng, 8, true, 16), bumpScale: 0.028 },
    ),
    stone: mk(
      blotchAlbedo(size, rng, C.stone, [C.stoneDark, '#c6bca6', '#89847a'], 130, 30), 0.9, 3, 3,
      { bump: grayBump(size, rng, 9, false, 26), bumpScale: 0.04 },
    ),
    step: mk(
      blotchAlbedo(size, rng, C.step, [C.stepDark, '#d6ceba', '#a49c88'], 90, 34), 0.88, 2, 2,
      { bump: grayBump(size, rng, 5, false, 18), bumpScale: 0.03 },
    ),
    soil: mk(
      blotchAlbedo(size, rng, C.soil, [C.soilDark, '#d6c29c', '#a88e68'], 180, 34), 0.97, 4, 4,
    ),
    grass: mk(
      blotchAlbedo(size, rng, C.grass, ['#5c6e36', '#aab86e'], 160, 18), 0.82, 2, 2,
    ),
    foliage: mk(
      blotchAlbedo(size, rng, C.foliage, [C.foliageDark, '#82a84e', '#4a6a2c'], 160, 16), 0.74, 2, 2,
    ),
    bark: mk(
      blotchAlbedo(size, rng, '#7e5a36', ['#543a22', '#9a7048'], 80, 26), 0.86, 2, 2,
    ),
    logEnd: mk(
      blotchAlbedo(size, rng, '#c19a68', ['#a97c48', '#e0c08a', '#8a6238'], 70, 20), 0.82, 1, 1,
    ),
    iron: new THREE.MeshStandardMaterial({ color: C.iron, roughness: 0.5, metalness: 0.85 }),
    bloom: new THREE.MeshStandardMaterial({ color: C.bloom, roughness: 0.6 }),
    bloomCore: new THREE.MeshStandardMaterial({ color: '#e8c64e', roughness: 0.65 }),
    dark: new THREE.MeshStandardMaterial({ color: '#15120e', roughness: 1.0 }),
  };
}

// ---------------------------------------------------------------------------
// Geometry helpers
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

function named<T extends THREE.Mesh>(mesh: T, name: string): T {
  mesh.name = name;
  return mesh;
}

const FOOT_H = 0.16;
const WALL_BASE = FOOT_H;
const WALL_W = 1.3;
const WALL_D = 1.32;
const WALL_H = 1.74;
const WALL_TOP = WALL_BASE + WALL_H;
const ROOF_HALF = 0.82;
const ROOF_RISE = 0.82;
const ROOF_DEPTH = 1.74;
const RIDGE_Y = WALL_TOP + ROOF_RISE;
const OPEN_W = 1.08;
const OPEN_H = 1.54;
const DOOR_BASE = WALL_BASE;
const DOOR_TOP = DOOR_BASE + OPEN_H;
const FRONT_Z = WALL_D / 2;
const BACK_Z = -WALL_D / 2;

// ---------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------
function buildGround(materials: Materials, rng: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'ground-mound';
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 2.0, 0.16, 44, 1), materials.soil);
  mound.position.y = -0.08;
  mound.scale.set(1.02, 1, 0.68);
  group.add(mound);
  const apron = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 2.2, 0.05, 36, 1), materials.soil);
  apron.position.set(0.05, -0.025, 0.1);
  apron.scale.set(1.04, 1, 0.7);
  group.add(apron);
  const path = new THREE.Mesh(new THREE.CircleGeometry(0.85, 20), materials.soil);
  path.rotation.x = -Math.PI / 2;
  path.position.set(0.05, 0.004, 1.6);
  path.scale.set(1.2, 1, 0.65);
  group.add(path);
  // Worn dirt patch in front of the door.
  const patch = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24), materials.soil);
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(0.05, 0.006, 1.35);
  patch.scale.set(1.3, 1, 0.8);
  group.add(patch);

  // Pebbles.
  const pebbleGeo = new THREE.DodecahedronGeometry(0.028, 0);
  const pebbles = new THREE.InstancedMesh(pebbleGeo, materials.stone, 46);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 46; i += 1) {
    const angle = rng() * Math.PI * 2;
    const radius = 0.35 + rng() * 1.85;
    dummy.position.set(Math.cos(angle) * radius, 0.01 + rng() * 0.02, Math.sin(angle) * radius);
    dummy.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    const s = 0.5 + rng() * 1.1;
    dummy.scale.set(s, s * 0.5, s);
    dummy.updateMatrix();
    pebbles.setMatrixAt(i, dummy.matrix);
  }
  pebbles.instanceMatrix.needsUpdate = true;
  pebbles.receiveShadow = true;
  group.add(pebbles);
  return group;
}

// ---------------------------------------------------------------------------
// Footing + steps
// ---------------------------------------------------------------------------
function buildFooting(materials: Materials, rng: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stone-footing';
  const band = box(WALL_W + 0.1, FOOT_H, WALL_D + 0.1, materials.stone);
  band.name = 'stone-footing';
  band.position.y = FOOT_H / 2;
  group.add(band);
  // Irregular fieldstones packed around the base.
  const stoneGeo = new THREE.DodecahedronGeometry(0.09, 0);
  const count = 46;
  const stones = new THREE.InstancedMesh(stoneGeo, materials.stone, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i += 1) {
    const t = i / count;
    const perim = 2 * ((WALL_W + 0.16) + (WALL_D + 0.16));
    let d = t * perim;
    let x: number;
    let z: number;
    const hx = WALL_W / 2 + 0.08;
    const hz = WALL_D / 2 + 0.08;
    if (d < 2 * hx) {
      x = -hx + d;
      z = hz;
    } else if (d < 2 * hx + 2 * hz) {
      d -= 2 * hx;
      x = hx;
      z = hz - d;
    } else if (d < 4 * hx + 2 * hz) {
      d -= 2 * hx + 2 * hz;
      x = hx - d;
      z = -hz;
    } else {
      d -= 4 * hx + 2 * hz;
      x = -hx;
      z = -hz + d;
    }
    dummy.position.set(x + (rng() - 0.5) * 0.05, 0.04 + rng() * 0.04, z + (rng() - 0.5) * 0.05);
    dummy.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    const s = 0.7 + rng() * 0.8;
    dummy.scale.set(s, s * 0.7, s);
    dummy.updateMatrix();
    stones.setMatrixAt(i, dummy.matrix);
  }
  stones.instanceMatrix.needsUpdate = true;
  stones.name = 'footing-stones';
  stones.castShadow = true;
  stones.receiveShadow = true;
  group.add(stones);
  // Named boulders the spec lists as individual meso components.
  const namedStones: [string, number, number, number, number, number][] = [
    ['base-stone-fl', -0.52, 0.08, 0.86, 0.3, 0.18],
    ['base-stone-fr', 0.66, 0.07, 0.96, 0.26, 0.16],
    ['base-stone-mid', -0.3, 0.06, 1.1, 0.24, 0.14],
    ['base-stone-rear', 0.8, 0.06, -0.3, 0.24, 0.14],
    ['base-stone-rear2', -0.7, 0.06, -0.4, 0.22, 0.13],
  ];
  for (const [nm, x, y, z, s1, s2] of namedStones) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14, 0), materials.stone);
    rock.name = nm;
    rock.position.set(x, y, z);
    rock.scale.set(s1 / 0.14, s2 / 0.14, s1 / 0.14);
    group.add(rock);
  }
  return group;
}

function buildSteps(materials: Materials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'entry-steps';
  const threshold = box(OPEN_W + 0.26, 0.12, 0.34, materials.step);
  threshold.name = 'threshold-step';
  threshold.position.set(0, 0.1, FRONT_Z + 0.13);
  group.add(threshold);
  const step = box(1.12, 0.11, 0.5, materials.step);
  step.name = 'front-step-stone';
  step.position.set(0.02, 0.055, FRONT_Z + 0.44);
  step.rotation.y = -0.04;
  group.add(step);
  const outerStone = box(0.34, 0.13, 0.3, materials.step);
  outerStone.position.set(-0.5, 0.065, FRONT_Z + 0.36);
  outerStone.rotation.y = 0.18;
  group.add(outerStone);
  return group;
}

// ---------------------------------------------------------------------------
// Plank shell + gables
// ---------------------------------------------------------------------------
function buildShell(materials: Materials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'plank-shell';
  const wallThick = 0.06;
  const strips = 0.08;
  const shellY = WALL_BASE + WALL_H / 2;

  // Front wall, punched for the door opening.
  const frontLeft = box(strips, WALL_H, wallThick, materials.plank);
  frontLeft.name = 'wall-front';
  const headerStub = box(OPEN_W, 0.001, 0.001, materials.plank);
  headerStub.name = 'wall-front-opening';
  headerStub.visible = false;
  group.add(headerStub);
  frontLeft.position.set(-(OPEN_W / 2 + strips / 2), shellY, FRONT_Z - wallThick / 2);
  group.add(frontLeft);
  const frontRight = frontLeft.clone();
  frontRight.position.x = OPEN_W / 2 + strips / 2;
  group.add(frontRight);
  const headerH = WALL_TOP - DOOR_TOP;
  const header = box(WALL_W, headerH, wallThick, materials.plank);
  header.position.set(0, DOOR_TOP + headerH / 2, FRONT_Z - wallThick / 2);
  group.add(header);

  const rear = box(WALL_W, WALL_H, wallThick, materials.plank);
  rear.name = 'wall-rear';
  rear.position.set(0, shellY, BACK_Z + wallThick / 2);
  group.add(rear);
  for (const sx of [1, -1]) {
    const side = box(wallThick, WALL_H, WALL_D - wallThick * 2, materials.plank);
    side.name = sx > 0 ? 'wall-right' : 'wall-left';
    side.position.set(sx * (WALL_W / 2 - wallThick / 2), shellY, 0);
    group.add(side);
  }

  // Corner boards.
  const cbW = 0.1;
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const board = box(cbW, WALL_H + 0.02, cbW, materials.corner);
      board.name = `corner-board-${sx > 0 ? 'f' : 'r'}${sz > 0 ? 'l' : 'r'}`;
      board.position.set(sx * (WALL_W / 2 - cbW / 2 + 0.01), shellY, sz * (WALL_D / 2 - cbW / 2 + 0.01));
      group.add(board);
    }
  }

  // Top plates under the gable.
  for (const sz of [1, -1]) {
    const plate = box(WALL_W + 0.08, 0.11, 0.1, materials.timber);
    plate.name = sz > 0 ? 'top-plate-front' : 'top-plate-rear';
    plate.position.set(0, WALL_TOP + 0.035, sz * (WALL_D / 2 - 0.02));
    group.add(plate);
  }

  // Planked gable triangles (extruded right triangles).
  const buildGable = (): THREE.Mesh => {
    const half = WALL_W / 2 - 0.01;
    const shape = new THREE.Shape();
    shape.moveTo(-half, 0);
    shape.lineTo(half, 0);
    shape.lineTo(0, ROOF_RISE);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: wallThick, bevelEnabled: false, steps: 1 });
    return new THREE.Mesh(geo, materials.plank);
  };
  const gableFront = buildGable();
  gableFront.name = 'gable-front';
  gableFront.position.set(0, WALL_TOP, FRONT_Z - wallThick);
  group.add(gableFront);
  const gableRear = buildGable();
  gableRear.name = 'gable-rear';
  gableRear.position.set(0, WALL_TOP, BACK_Z);
  group.add(gableRear);
  return group;
}

function buildVent(materials: Materials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'louver-vent';
  const w = 0.46;
  const h = 0.42;
  const z = BACK_Z - 0.03;
  const frameMat = materials.timber;
  const jambW = 0.09;
  const cy = 1.5;
  const backing = box(w - jambW * 2 + 0.02, h - jambW * 2 + 0.02, 0.05, materials.dark);
  backing.position.set(0, cy, z + 0.04);
  group.add(backing);
  for (const sx of [1, -1]) {
    const jamb = box(jambW, h, 0.09, frameMat);
    jamb.position.set(sx * (w / 2 - jambW / 2), cy, z);
    group.add(jamb);
  }
  const lintel = box(w, jambW + 0.02, 0.09, frameMat);
  lintel.position.set(0, cy + h / 2 - jambW / 2, z);
  group.add(lintel);
  const sill = box(w + 0.12, 0.1, 0.13, frameMat);
  sill.position.set(0, cy - h / 2 - 0.02, z - 0.02);
  group.add(sill);
  // Three angled louver slats filling the opening.
  for (let i = 0; i < 3; i += 1) {
    const slat = box(w - jambW * 2 + 0.02, 0.055, 0.16, materials.timber);
    slat.position.set(0, cy + 0.1 - i * 0.1, z - 0.035);
    slat.rotation.x = -0.55;
    group.add(slat);
  }
  return group;
}

// ---------------------------------------------------------------------------
// Door
// ---------------------------------------------------------------------------
function crescentLoop(cx: number, cy: number, R: number, r: number, d: number, rotDeg: number): [number, number][] {
  const x = (R * R - r * r + d * d) / (2 * d);
  const y = Math.sqrt(Math.max(R * R - x * x, 0));
  const aOut = Math.atan2(y, x);
  const aIn = Math.atan2(y, x - d);
  const steps = 22;
  const loop: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = aOut + (2 * Math.PI - 2 * aOut) * (i / steps);
    loop.push([cx + R * Math.cos(t), cy + R * Math.sin(t)]);
  }
  for (let i = 0; i <= steps; i += 1) {
    const t = 2 * Math.PI - aIn - (2 * Math.PI - 2 * aIn) * (i / steps);
    loop.push([cx + d + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  const rad = (rotDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return loop.map(([px, py]) => {
    const dx = px - cx;
    const dy = py - cy;
    return [cx + dx * c - dy * s, cy + dx * s + dy * c] as [number, number];
  });
}

function buildHinge(materials: Materials): THREE.Mesh {
  // A tapered iron strap: plate on the jamb, spear point into the leaf.
  const shape = new THREE.Shape();
  shape.moveTo(-0.13, -0.04);
  shape.lineTo(0.02, -0.038);
  shape.lineTo(0.15, 0.0);
  shape.lineTo(0.02, 0.038);
  shape.lineTo(-0.13, 0.04);
  shape.closePath();
  for (const rx of [-0.075, 0.04]) {
    const hole = new THREE.Path();
    hole.absarc(rx, 0, 0.009, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.022, bevelEnabled: false, steps: 1 });
  return new THREE.Mesh(geo, materials.iron);
}

function buildDoor(materials: Materials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'door-frame';
  const leafZ = FRONT_Z - 0.005;

  // Casing: proud stiles and header around the opening.
  const stileW = 0.09;
  for (const sx of [1, -1]) {
    const stile = box(stileW, OPEN_H + 0.16, 0.07, materials.plank);
    stile.position.set(sx * (OPEN_W / 2 - 0.01), DOOR_BASE + OPEN_H / 2, FRONT_Z + 0.005);
    group.add(stile);
  }
  const header = named(box(OPEN_W + 0.3, 0.11, 0.07, materials.timber), 'door-header');
  header.position.set(0, DOOR_TOP + 0.05, FRONT_Z + 0.005);
  group.add(header);

  // Plank leaf with the crescent-moon opening.
  const shape = new THREE.Shape();
  const hw = OPEN_W / 2;
  const hh = OPEN_H / 2;
  shape.moveTo(-hw, -hh);
  shape.lineTo(hw, -hh);
  shape.lineTo(hw, hh);
  shape.lineTo(-hw, hh);
  shape.closePath();
  const moon = crescentLoop(0.05, 0.44, 0.14, 0.122, 0.055, -16);
  const hole = new THREE.Path();
  moon.forEach(([px, py], i) => {
    if (i === 0) hole.moveTo(px, py);
    else hole.lineTo(px, py);
  });
  hole.closePath();
  shape.holes.push(hole);
  const leafGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false, steps: 1 });
  const leaf = new THREE.Mesh(leafGeo, materials.door);
  leaf.position.set(0, DOOR_BASE + hh, leafZ);
  leaf.name = 'door-leaf';
  group.add(leaf);

  // Dark recess behind the moon opening so the cutout reads as a through-hole.
  const caver = box(0.26, 0.26, 0.02, materials.dark);
  caver.position.set(0.055, DOOR_BASE + hh + 0.46, FRONT_Z - 0.06);
  group.add(caver);

  // Iron strap hinges on the left edge.
  for (const y of [DOOR_BASE + OPEN_H * 0.78, DOOR_BASE + OPEN_H * 0.24]) {
    const hinge = buildHinge(materials);
    hinge.name = y > DOOR_BASE + OPEN_H * 0.5 ? 'top-hinge' : 'bottom-hinge';
    hinge.position.set(-hw + 0.12, y, FRONT_Z + 0.055);
    hinge.scale.setScalar(0.85);
    group.add(hinge);
  }

  // Sliding wooden bolt + iron strike plate on the right.
  const boltY = DOOR_BASE + OPEN_H * 0.5;
  const bolt = named(box(0.52, 0.075, 0.05, materials.plank), 'latch-bar');
  bolt.position.set(0.16, boltY, FRONT_Z + 0.062);
  group.add(bolt);
  const cross = named(box(0.075, 0.17, 0.045, materials.plank), 'latch-cross');
  cross.position.set(0.26, boltY, FRONT_Z + 0.068);
  group.add(cross);
  const plate = named(box(0.07, 0.15, 0.02, materials.iron), 'latch-plate');
  plate.position.set(0.24, boltY, FRONT_Z + 0.09);
  group.add(plate);
  const knob = named(box(0.045, 0.045, 0.05, materials.iron), 'latch-knob');
  knob.position.set(0.06, boltY, FRONT_Z + 0.08);
  group.add(knob);
  const keeper = named(box(0.045, 0.1, 0.06, materials.iron), 'latch-keeper');
  keeper.position.set(hw + 0.015, boltY, FRONT_Z + 0.04);
  group.add(keeper);
  return group;
}

// ---------------------------------------------------------------------------
// Roof
// ---------------------------------------------------------------------------
function buildRoof(materials: Materials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'roof-mass';
  const halfSpanWithOverhang = ROOF_HALF;
  const slopeLength = Math.hypot(halfSpanWithOverhang, ROOF_RISE);
  const angle = Math.atan2(ROOF_RISE, halfSpanWithOverhang);
  const halfDepth = ROOF_DEPTH / 2;
  const midY = WALL_TOP + ROOF_RISE / 2;

  // sign = +1 builds the left slope (local +X points up-slope to the ridge);
  // sign = -1 builds the right slope (local +X points down-slope to the eave).
  const buildSlope = (sign: number): THREE.Group => {
    const slope = new THREE.Group();
    slope.position.set((-sign * halfSpanWithOverhang) / 2, midY, 0);
    slope.rotation.z = sign * angle;
    const eaveLocalX = sign > 0 ? -slopeLength / 2 : slopeLength / 2;
    const ridgeLocalX = -eaveLocalX;

    const deck = box(slopeLength + 0.04, 0.1, ROOF_DEPTH, materials.shingle);
    deck.name = sign > 0 ? 'roof-slope-left' : 'roof-slope-right';
    slope.add(deck);

    // Overlapping shingle courses stepping down the slope toward the eave.
    const courses = 8;
    for (let i = 0; i < courses; i += 1) {
      const t = i / (courses - 1);
      const course = box((slopeLength / (courses - 1)) * 1.5, 0.03, ROOF_DEPTH + 0.02, materials.shingle);
      course.position.set(ridgeLocalX - sign * t * slopeLength, 0.07, 0);
      course.rotation.z = -sign * 0.045;
      slope.add(course);
    }

    // Barge board lying flush along each gable verge of this slope.
    for (const sz of [1, -1]) {
      const barge = box(slopeLength - 0.06, 0.07, 0.055, materials.timber);
      barge.name = `barge-${sign > 0 ? 'left' : 'right'}-${sz > 0 ? 'front' : 'rear'}`;
      barge.position.set(0, 0.008, sz * (halfDepth - 0.015));
      slope.add(barge);
    }

    // Eave fascia along the lower edge of the slope.
    const fascia = box(0.1, 0.15, ROOF_DEPTH + 0.02, materials.timber);
    fascia.position.set(eaveLocalX + sign * 0.03, -0.01, 0);
    slope.add(fascia);

    // Short rafter / purlin tails projecting under the overhang at the gables,
    // kept inside the slope span so none detach from the roof.
    for (const sz of [1, -1]) {
      for (let i = 0; i < 3; i += 1) {
        const tail = box(0.22, 0.075, 0.12, materials.timber);
        tail.position.set(eaveLocalX + sign * (0.14 + i * 0.34), -0.035, sz * (halfDepth + 0.07));
        slope.add(tail);
      }
    }
    return slope;
  };

  group.add(buildSlope(1));
  group.add(buildSlope(-1));

  // Ridge board and cap along Z.
  const ridge = box(0.16, 0.11, ROOF_DEPTH + 0.05, materials.timber);
  ridge.name = 'ridge-cap';
  ridge.position.set(0, RIDGE_Y + 0.055, 0);
  group.add(ridge);
  const cap = box(0.22, 0.05, ROOF_DEPTH + 0.07, materials.timber);
  cap.position.set(0, RIDGE_Y + 0.13, 0);
  group.add(cap);

  // Squared finial posts rising from each apex.
  const finFront = box(0.11, 0.32, 0.11, materials.timber);
  finFront.name = 'ridge-finial-front';
  finFront.position.set(0, RIDGE_Y + 0.22, halfDepth - 0.2);
  group.add(finFront);
  const finFrontCap = box(0.15, 0.045, 0.15, materials.timber);
  finFrontCap.position.set(0, RIDGE_Y + 0.4, halfDepth - 0.2);
  group.add(finFrontCap);
  const finRear = box(0.11, 0.28, 0.11, materials.timber);
  finRear.name = 'ridge-finial-rear';
  finRear.position.set(0, RIDGE_Y + 0.2, -(halfDepth - 0.2));
  group.add(finRear);
  return group;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
function buildBarrel(materials: Materials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'barrel';
  group.position.set(-0.95, 0, 0.72);
  const profile = [
    [0.14, -0.28], [0.185, -0.18], [0.21, -0.06], [0.215, 0.0], [0.21, 0.06], [0.185, 0.18], [0.14, 0.28],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 28), materials.bark);
  body.name = 'barrel-body';
  body.position.y = 0.28;
  group.add(body);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.136, 0.136, 0.04, 24), materials.bark);
  lid.name = 'barrel-lid';
  lid.position.y = 0.56;
  group.add(lid);
  const hoops = [0.13, 0.28, 0.43];
  for (const y of hoops) {
    const r = y === 0.28 ? 0.219 : 0.192;
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(r, 0.017, 8, 24), materials.iron);
    hoop.name = `barrel-hoop-${hoops.indexOf(y)}`;
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y;
    group.add(hoop);
  }
  return group;
}

function buildPost(materials: Materials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'fence-post';
  const post = box(0.13, 0.68, 0.13, materials.corner);
  post.name = 'fence-post';
  post.position.set(0.84, 0.34, 0.72);
  group.add(post);
  const postCap = box(0.14, 0.05, 0.14, materials.timber);
  postCap.position.set(0.84, 0.7, 0.72);
  group.add(postCap);
  const rail = box(0.66, 0.1, 0.09, materials.timber);
  rail.position.set(0.56, 0.44, 0.7);
  group.add(rail);
  const rail2 = box(0.5, 0.08, 0.08, materials.timber);
  rail2.position.set(0.62, 0.24, 0.72);
  group.add(rail2);
  const brace = box(0.07, 0.07, 0.42, materials.timber);
  brace.position.set(0.84, 0.5, 0.52);
  brace.rotation.x = -0.35;
  group.add(brace);
  const second = box(0.11, 0.5, 0.11, materials.corner);
  second.position.set(1.16, 0.25, 0.72);
  group.add(second);
  return group;
}

function buildLogs(materials: Materials, rng: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'log-pile';
  const cx = 0.72;
  const cz = -0.74;
  const placements: [number, number][] = [
    [-0.13, 0.06], [0, 0.06], [0.13, 0.06],
    [-0.065, 0.17], [0.065, 0.17],
    [0, 0.28],
    [0.0, 0.06],
  ];
  const logGeo = new THREE.CylinderGeometry(0.062, 0.058, 0.4, 10);
  placements.forEach(([dz, y], i) => {
    const log = new THREE.Mesh(logGeo, materials.bark);
    log.name = `log-${Math.min(i, 5)}`;
    log.position.set(cx, y, cz + dz);
    log.rotation.set(0, 0, Math.PI / 2);
    log.scale.set(1, 1 + rng() * 0.15, 1);
    group.add(log);
    if (i < 6) {
      const end = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 10), materials.logEnd);
      end.name = `log-end-${i}`;
      end.position.set(cx + 0.2, y, cz + dz);
      end.rotation.set(0, 0, Math.PI / 2);
      group.add(end);
    }
  });
  return group;
}

function buildVegetation(materials: Materials, rng: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'garden-vegetation';

  // Leafy sprigs: squashed spheres scattered at the front-left corner, right base and rear.
  const leafGeo = new THREE.SphereGeometry(0.058, 8, 6);
  const clusters: { x: number; z: number; base: number; spread: number; height: number }[] = [
    { x: -0.66, z: 0.62, base: 0.05, spread: 0.28, height: 0.95 },
    { x: 0.62, z: 0.9, base: 0.05, spread: 0.34, height: 0.5 },
    { x: 0.5, z: -0.66, base: 0.05, spread: 0.3, height: 0.7 },
    { x: -0.5, z: -0.62, base: 0.05, spread: 0.24, height: 0.45 },
  ];
  let count = 0;
  clusters.forEach(() => { count += 60; });
  const leaves = new THREE.InstancedMesh(leafGeo, materials.foliage, count);
  const dummy = new THREE.Object3D();
  let idx = 0;
  clusters.forEach((c) => {
    for (let i = 0; i < 60; i += 1) {
      const y = c.base + rng() * c.height;
      const taper = 1 - y / (c.height + 0.2);
      const radius = c.spread * (0.4 + taper * 0.8);
      const angle = rng() * Math.PI * 2;
      dummy.position.set(c.x + Math.cos(angle) * radius * rng(), y, c.z + Math.sin(angle) * radius * rng());
      dummy.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      const s = 0.7 + rng() * 0.9;
      dummy.scale.set(s, s * 0.7, s);
      dummy.updateMatrix();
      leaves.setMatrixAt(idx, dummy.matrix);
      idx += 1;
    }
  });
  leaves.name = 'vine-cluster-left';
  leaves.instanceMatrix.needsUpdate = true;
  leaves.castShadow = true;
  group.add(leaves);

  // Grass tufts.
  const tuftGeo = new THREE.ConeGeometry(0.022, 0.16, 5);
  const tuftCount = 150;
  const tufts = new THREE.InstancedMesh(tuftGeo, materials.grass, tuftCount);
  for (let i = 0; i < tuftCount; i += 1) {
    const angle = rng() * Math.PI * 2;
    const radius = 0.9 + rng() * 1.3;
    dummy.position.set(Math.cos(angle) * radius, 0.09 + rng() * 0.03, Math.sin(angle) * radius);
    dummy.rotation.set((rng() - 0.5) * 0.5, rng() * Math.PI, (rng() - 0.5) * 0.5);
    const s = 0.6 + rng() * 0.6;
    dummy.scale.set(s, s * 1.3, s);
    dummy.updateMatrix();
    tufts.setMatrixAt(i, dummy.matrix);
  }
  tufts.name = 'grass-tufts';
  tufts.instanceMatrix.needsUpdate = true;
  group.add(tufts);

  // White daisy blooms at the base.
  const bloomGeo = new THREE.SphereGeometry(0.028, 8, 6);
  const coreGeo = new THREE.SphereGeometry(0.012, 6, 5);
  const bloomSpots: [number, number, number][] = [
    [-0.5, 0.28, 0.86], [-0.62, 0.34, 0.78], [-0.42, 0.2, 0.98],
    [0.55, 0.24, 1.02], [0.66, 0.3, 0.9], [0.44, 0.18, 1.12],
    [0.44, 0.22, -0.68], [0.54, 0.3, -0.6],
  ];
  const blooms = new THREE.InstancedMesh(bloomGeo, materials.bloom, bloomSpots.length);
  const cores = new THREE.InstancedMesh(coreGeo, materials.bloomCore, bloomSpots.length);
  bloomSpots.forEach(([x, y, z], i) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    blooms.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, y + 0.02, z);
    dummy.updateMatrix();
    cores.setMatrixAt(i, dummy.matrix);
  });
  blooms.name = 'ground-sprigs';
  cores.name = 'bloom-heads';
  blooms.instanceMatrix.needsUpdate = true;
  cores.instanceMatrix.needsUpdate = true;
  group.add(blooms, cores);

  // Base boulders.
  const rockGeo = new THREE.DodecahedronGeometry(0.14, 0);
  const rockSpots: [number, number, number][] = [
    [-0.34, 0.08, 1.05], [0.4, 0.07, 1.12], [-0.66, 0.07, 0.4],
    [0.78, 0.07, -0.4], [-0.7, 0.07, -0.5], [0.9, 0.06, 0.2],
    [0.05, 0.06, 1.5], [-0.2, 0.06, -1.0],
  ];
  const rocks = new THREE.InstancedMesh(rockGeo, materials.stone, rockSpots.length);
  rockSpots.forEach(([x, y, z], i) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    const s = 0.7 + rng() * 0.6;
    dummy.scale.set(s, s * 0.65, s);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  });
  rocks.name = 'base-boulders';
  rocks.instanceMatrix.needsUpdate = true;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  group.add(rocks);
  return group;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------
export function createWoodenOuthouseModel(options: WoodenOuthouseOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = 'building_wooden_outhouse_a_root';
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

  register('ground-mound', buildGround(materials, rng));
  register('stone-footing', buildFooting(materials, rng));
  register('entry-steps', buildSteps(materials));
  register('plank-shell', buildShell(materials));
  register('louver-vent', buildVent(materials));
  register('roof-mass', buildRoof(materials));
  register('door-frame', buildDoor(materials));
  register('barrel', buildBarrel(materials));
  register('fence-post', buildPost(materials));
  register('log-pile', buildLogs(materials, rng));
  register('garden-vegetation', buildVegetation(materials, rng));

  const runtime = { nodes, meshes, sockets, colliders, destructionGroups };
  root.userData.sculptRuntime = runtime;
  root.userData.reconstructionEvidence = {
    source: 'output/wooden-outhouse/reference/*.png (4-view turnaround)',
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
      dir.normalize().multiplyScalar(amount * 0.9);
      node.position.set(base.x + dir.x, base.y + dir.y, base.z + dir.z);
    }
  };

  root.userData.tick = (delta: number, elapsed: number): void => {
    void delta;
    void elapsed;
  };

  root.scale.setScalar(scale);
  return root;
}
