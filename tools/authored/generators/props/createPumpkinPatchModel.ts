import * as THREE from "three";

import {
  SurfaceBuilder, mulberry32,
  type AuthoredModel, type FaceContext, type GeneratorContext, type Station, type V3
} from "../../kit";

// Catalog palette order: bed soil, ripe pumpkins, vines and leaves, blossoms and a ripening squash.
const TOKENS = ["soil_warm_01", "roof_warm_orange_01", "foliage_olive_01", "accent_ochre_01"] as const;
const SOIL = 0;
const PUMPKIN = 1;
const LEAF = 2;
const BLOSSOM = 3;

/** The bed mound along X: [x, half-width in Z, crown height]. Its section is a superellipse. */
const BED: ReadonlyArray<readonly [number, number, number]> = [
  [-1.5, 0.42, 0.02], [-1.45, 0.72, 0.045], [-1.34, 0.9, 0.07], [-1.1, 0.98, 0.085], [0, 1.0, 0.1],
  [1.1, 0.98, 0.085], [1.34, 0.9, 0.07], [1.45, 0.72, 0.045], [1.5, 0.42, 0.02]
];
const BED_N = 2.6;

/** Pumpkin seats in the bed, [x, z, radius]; the first is the prize pumpkin. */
const SEATS: ReadonlyArray<readonly [number, number, number]> = [
  [0.18, -0.12, 0.27], [-0.92, 0.42, 0.19], [0.98, 0.44, 0.2], [-0.56, -0.5, 0.16],
  [1.04, -0.46, 0.17], [-1.14, -0.18, 0.14], [0.42, 0.6, 0.15], [-0.2, 0.62, 0.13],
  [0.66, -0.66, 0.13], [-0.36, 0.08, 0.12], [1.3, 0.06, 0.12], [-1.3, 0.62, 0.11]
];
/** Where the vines leave the ground: two crowns, so the runners cross the bed from both sides. */
const CROWNS: ReadonlyArray<readonly [number, number]> = [[-0.3, -0.02], [0.62, 0.1]];

/**
 * Pumpkin patch, glTF space: +Y up, bed long along X, ground-centred, metres.
 *
 * Redesigned from the Blender patch, a flat soil slab with lumpy ochre blobs and stick vines. The
 * bed is now a soft mound that sinks into the ground at its rim. Ribbed pumpkins (`lobes` sets the
 * rib pairs), one of them a prize, sit on it with curled stems. Vines wander from two crowns to each
 * fruit, and broad lobed leaves stand on stalks along them, cupped and tilted to the light.
 * Trumpet blossoms open along the runners.
 */
export function createPumpkinPatchModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const count = Math.min(SEATS.length, Math.max(1, Math.round(Number(context.parameters.pumpkins ?? 7))));
  const vineStations = Math.max(3, Math.round(Number(context.parameters.vineSegments ?? 9)));
  const ribs = 2 * Math.max(2, Math.round(Number(context.parameters.lobes ?? 4)));
  const blossoms = Math.max(0, Math.round(Number(context.parameters.blossomCount ?? 6)));
  const random = mulberry32(context.seed);
  const jitter = (amount: number): number => (random() * 2 - 1) * amount;

  const root = new THREE.Group();
  root.name = `${ID}_root`;
  const surface = new SurfaceBuilder(TOKENS);

  // Bed: a superellipse mound, damp and darker down its flanks, clods of tone across the top.
  const bedAt = (x: number): { w: number; h: number } => {
    let i = 0;
    while (i < BED.length - 2 && BED[i + 1][0] < x) i += 1;
    const t = THREE.MathUtils.clamp((x - BED[i][0]) / (BED[i + 1][0] - BED[i][0]), 0, 1);
    return { w: THREE.MathUtils.lerp(BED[i][1], BED[i + 1][1], t), h: THREE.MathUtils.lerp(BED[i][2], BED[i + 1][2], t) };
  };
  const groundY = (x: number, z: number): number => {
    const { w, h } = bedAt(x);
    const q = Math.min(1, Math.abs(z) / w);
    return h * Math.max(0, 1 - q ** BED_N) ** (1 / BED_N);
  };
  surface.addLoft(BED.map(([x, w, h]) => ({ p: [x, 0, 0] as V3, w, h, hb: 0.03, n: BED_N })), {
    sides: 14, ref: [0, 1, 0], capStart: 0.25, capEnd: 0.25, token: SOIL,
    shade: ({ normal }: FaceContext) => (normal.y < 0.55 ? 0.82 : 0.93 + random() * 0.08)
  });

  // Pumpkins: ribbed, oblate, a little tilted, each with its own tone; one or two still ripening.
  const fruits = SEATS.slice(0, count).map(([x, z, r], index) => {
    const seat: V3 = [x + jitter(0.05), 0, z + jitter(0.05)];
    seat[1] = groundY(seat[0], seat[2]) - 0.012;
    return { seat, r: r * (0.94 + random() * 0.12), ripening: index === 3 || index === 8 };
  });
  for (const { seat, r, ripening } of fruits) {
    const tilt = new THREE.Vector3(jitter(0.16), 1, jitter(0.16)).normalize();
    const height = r * 1.45;
    const along = (t: number): V3 => [seat[0] + tilt.x * height * t, seat[1] + tilt.y * height * t, seat[2] + tilt.z * height * t];
    const profile: ReadonlyArray<readonly [number, number]> = [[0, 0.42], [0.08, 0.82], [0.4, 1], [0.72, 0.9], [0.92, 0.52], [1, 0.2]];
    const stations: Station[] = profile.map(([t, k]) => ({ p: along(t), w: r * k, h: r * k }));
    const tone = 0.92 + random() * 0.1;
    const phase = random() * Math.PI;
    surface.addLoft(stations, {
      sides: ribs * 2, ref: [1, 0, 0], phase, capStart: 0, capEnd: -0.25,
      radial: (_, theta) => 0.9 + 0.1 * Math.abs(Math.cos((ribs * (theta - phase)) / 2)),
      token: ripening ? BLOSSOM : PUMPKIN,
      shade: tone
    });
    // Curled stem out of the crown dimple.
    const top = along(0.96);
    const lean = random() * Math.PI * 2;
    const dx = Math.cos(lean);
    const dz = Math.sin(lean);
    surface.addLoft([
      { p: top, w: 0.024, h: 0.024 },
      { p: [top[0] + dx * 0.01, top[1] + 0.05, top[2] + dz * 0.01], w: 0.02, h: 0.02 },
      { p: [top[0] + dx * 0.035, top[1] + 0.085, top[2] + dz * 0.035], w: 0.016, h: 0.016 },
      { p: [top[0] + dx * 0.07, top[1] + 0.095, top[2] + dz * 0.07], w: 0.012, h: 0.012 }
    ], { sides: 5, ref: [0, 1, 0], capStart: 0, capEnd: 0.3, token: LEAF, shade: 0.76 });
  }

  // Vines: from a crown to each fruit, wandering, hugging the bed.
  const vines: THREE.Vector3[][] = fruits.map(({ seat, r }, index) => {
    const crown = CROWNS[index % CROWNS.length];
    const start = new THREE.Vector3(crown[0], 0, crown[1]);
    const end = new THREE.Vector3(seat[0], 0, seat[2]);
    const direction = end.clone().sub(start);
    const length = direction.length();
    direction.normalize();
    end.addScaledVector(direction, -r * 0.8);
    const across = new THREE.Vector3(-direction.z, 0, direction.x);
    const wander = jitter(0.22);
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < vineStations; i += 1) {
      const t = i / (vineStations - 1);
      const p = start.clone().lerp(end, t).addScaledVector(across, Math.sin(t * Math.PI) * wander * Math.min(1, length));
      p.y = groundY(p.x, p.z) + 0.012 + Math.sin(t * Math.PI * 3) * 0.006;
      points.push(p);
    }
    surface.addLoft(points.map((p) => ({ p: [p.x, p.y, p.z] as V3, w: 0.016, h: 0.014 })), {
      sides: 4, ref: [0, 1, 0], capStart: 0.3, capEnd: 0.3, token: LEAF, shade: 0.86
    });
    return points;
  });

  // Leaves along the vines, alternating sides, never on a fruit.
  const clearOfFruit = (p: THREE.Vector3, margin: number): boolean =>
    fruits.every(({ seat, r }) => Math.hypot(p.x - seat[0], p.z - seat[2]) > r + margin);
  let leafSide = 1;
  for (const points of vines) {
    for (let i = 2; i < points.length - 1; i += 2) {
      const at = points[i];
      const tangent = points[i + 1].clone().sub(points[i - 1]).setY(0).normalize();
      const sideways = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(leafSide);
      leafSide = -leafSide;
      const size = 0.22 + random() * 0.09;
      const base = at.clone().addScaledVector(sideways, 0.06);
      if (!clearOfFruit(base.clone().addScaledVector(sideways, size * 0.6), size * 0.35)) continue;
      addLeaf(surface, at, base, sideways.clone().addScaledVector(tangent, jitter(0.5)).normalize(), size, random, groundY);
    }
  }

  // A pair of leaves beside each fruit, off the end of its vine: the plant shading its own fruit.
  fruits.forEach(({ seat, r }, index) => {
    const points = vines[index];
    const end = points[points.length - 1];
    const heading = new THREE.Vector3(seat[0] - end.x, 0, seat[2] - end.z).normalize();
    for (const side of [-1, 1]) {
      const sideways = new THREE.Vector3(-heading.z, 0, heading.x).multiplyScalar(side);
      const base = end.clone().addScaledVector(sideways, r * 0.9 + 0.04).addScaledVector(heading, -0.02);
      base.y = groundY(base.x, base.z);
      const size = 0.2 + random() * 0.08;
      const facing = sideways.clone().addScaledVector(heading, 0.35 + jitter(0.2)).normalize();
      if (!clearOfFruit(base.clone().addScaledVector(facing, size * 0.6), size * 0.3)) continue;
      addLeaf(surface, end, base, facing, size, random, groundY);
    }
  });

  // Blossoms: yellow trumpets on short stalks along the runners.
  for (let index = 0; index < blossoms; index += 1) {
    const points = vines[index % vines.length];
    const at = points[Math.min(points.length - 2, 2 + Math.floor(random() * (points.length - 3)))];
    const lean = random() * Math.PI * 2;
    const out = new THREE.Vector3(Math.cos(lean) * 0.6, 1, Math.sin(lean) * 0.6).normalize();
    const p = (d: number): V3 => [at.x + out.x * d, at.y + out.y * d, at.z + out.z * d];
    surface.addLoft([
      { p: p(0), w: 0.008, h: 0.008 },
      { p: p(0.07), w: 0.014, h: 0.014 },
      { p: p(0.115), w: 0.03, h: 0.03 },
      { p: p(0.135), w: 0.06, h: 0.06 }
    ], { sides: 5, ref: [0, 1, 0], capStart: 0, capEnd: -0.3, token: BLOSSOM, shade: ({ u }) => (u < 1 ? 0.9 : 1.02) });
  }

  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}

/**
 * One broad palmate leaf on a stalk: a closed fan panel whose outline carries five rounded lobes,
 * rising from the stalk, cupped at the rim and drooping at the tip.
 */
function addLeaf(
  surface: SurfaceBuilder, from: THREE.Vector3, base: THREE.Vector3, facing: THREE.Vector3, size: number,
  random: () => number, groundY: (x: number, z: number) => number
): void {
  const stalkTop = base.clone();
  stalkTop.y = groundY(base.x, base.z) + 0.14 + random() * 0.14;
  surface.addLoft([
    { p: [from.x, from.y, from.z], w: 0.008, h: 0.008 },
    { p: [base.x, (from.y + stalkTop.y) / 2 + 0.02, base.z], w: 0.007, h: 0.007 },
    { p: [stalkTop.x, stalkTop.y, stalkTop.z], w: 0.006, h: 0.006 }
  ], { sides: 4, ref: [0, 1, 0], capEnd: 0, token: LEAF, shade: 0.84 });

  const right = new THREE.Vector3(-facing.z, 0, facing.x);
  const spread = 1.9;
  const lobe = (phi: number): number =>
    (0.8 + 0.2 * Math.abs(Math.cos((Math.PI * phi) / 0.76))) * (1 - 0.3 * (Math.abs(phi) / spread) ** 2);
  const tone = 0.9 + random() * 0.14;
  const rise = 0.35 + random() * 0.3;
  surface.addPanel({
    cols: 7,
    rows: 2,
    thickness: 0.008,
    point: (u, v) => {
      const phi = (u - 0.5) * 2 * spread;
      const r = (0.12 + 0.88 * v) * size * lobe(phi);
      const dir = facing.clone().multiplyScalar(Math.cos(phi)).addScaledVector(right, Math.sin(phi));
      const forward = Math.max(0, Math.cos(phi));
      const lift = rise * r - (0.35 * r * r * forward) / size + 0.05 * size * v * v * Math.abs(Math.sin(phi));
      return stalkTop.clone().addScaledVector(dir, r).setY(stalkTop.y + lift);
    },
    token: () => LEAF,
    // Paler at the rim where the light comes through, deeper toward the stalk.
    shade: (_, v) => tone * (v > 0.5 ? 1 : 0.9)
  });
}
