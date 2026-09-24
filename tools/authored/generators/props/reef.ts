import * as THREE from "three";

import { SurfaceBuilder, mulberry32, type AuthoredModel, type GeneratorContext, type Station } from "../../kit";
import { lumps, v3 } from "./parts";

/**
 * Reef corals: pillar, staghorn and table. glTF space: +Y up, ground-centred on the seabed, metres.
 * Colour is carried by value gradients inside each palette colour: deeper at the base, bright at the
 * growing tips.
 */

/** A rough seabed rock the coral grows from. */
function seabedRock(surface: SurfaceBuilder, centre: THREE.Vector3, radius: number, token: number, seed: number): void {
  surface.addLoft([
    { p: v3(centre.clone().add(new THREE.Vector3(0, -0.02, 0))), w: radius, h: radius * 0.8 },
    { p: v3(centre.clone().add(new THREE.Vector3(0, radius * 0.25, 0))), w: radius * 0.9, h: radius * 0.72 },
    { p: v3(centre.clone().add(new THREE.Vector3(0, radius * 0.4, 0))), w: radius * 0.5, h: radius * 0.4 }
  ], { sides: 8, ref: [0, 0, 1], capStart: 0, capEnd: 0.3, radial: lumps(seed, 0.18), flat: true, token, shade: 0.9 });
}

/**
 * Pillar coral. Redesigned from the Blender pillar: a clump of knobbly upright columns of different
 * heights rising from a mossy rock, rounded at the crowns, deepening in tone toward the base, freckled
 * with cream polyps and crusted in places with red encrusting growth.
 */
export function createCoralPillarModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: teal columns, red crust, cream polyps, mossy rock.
  const surface = new SurfaceBuilder(context.spec.palette);
  const TEAL = 0;
  const RED = 1;
  const CREAM = 2;
  const ROCK = 3;
  seabedRock(surface, new THREE.Vector3(0, 0, 0), 0.4, ROCK, 2);
  const columns = [[0, 0, 1.7, 0.13], [0.2, 0.12, 1.25, 0.11], [-0.18, 0.1, 1.05, 0.1], [0.08, -0.2, 0.85, 0.09], [-0.12, -0.16, 1.4, 0.1]] as const;
  for (const [x, z, h, r] of columns) {
    const count = 7;
    const stations: Station[] = Array.from({ length: count }, (_, i) => {
      const t = i / (count - 1);
      const knob = 1 + 0.12 * Math.sin(t * 14 + x * 10);
      const k = t > 0.85 ? 1 - (t - 0.85) * 3 : 1;
      return { p: [x + Math.sin(t * 3 + z * 9) * 0.03, 0.08 + t * h, z], w: r * knob * k, h: r * knob * k };
    });
    surface.addLoft(stations, {
      sides: 9, ref: [0, 0, 1], capEnd: 0.6, radial: lumps(Math.round(h * 10), 0.08),
      token: ({ centroid }) => (centroid.y < 0.35 && Math.sin(centroid.x * 40 + centroid.z * 30) > 0.2 ? RED : TEAL),
      tone: (q) => 0.78 + 0.26 * THREE.MathUtils.clamp(q.y / h, 0, 1)
    });
    for (let k = 0; k < 9; k += 1) {
      const t = 0.2 + random() * 0.75;
      const a = random() * Math.PI * 2;
      const n = new THREE.Vector3(Math.cos(a), 0.2, Math.sin(a)).normalize();
      surface.addDisc([x + Math.cos(a) * r * 1.02, 0.08 + t * h, z + Math.sin(a) * r * 1.02], v3(n), 0.014, { token: CREAM, sides: 5, dome: 0.008 });
    }
  }
  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}

/**
 * Staghorn coral. Redesigned from the Blender staghorn's five sticks: a true branching colony, a
 * stout trunk forking twice into antler tines that taper and curve upward, ochre deepening to teal at
 * the base, every tip a pale growing cream.
 */
export function createCoralStaghornModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: ochre branches, teal base, cream tips.
  const surface = new SurfaceBuilder(context.spec.palette);
  const OCHRE = 0;
  const TEAL = 1;
  const CREAM = 2;
  const branch = (from: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number, depth: number): void => {
    const d = dir.clone().normalize();
    const points = [0, 0.35, 0.7, 1].map((t) => from.clone().addScaledVector(d, length * t).add(new THREE.Vector3(0, length * 0.12 * t * t, 0)));
    const tip = depth === 0;
    surface.addLoft(points.map((p, i): Station => {
      const r = radius * (1 - 0.35 * (i / 3));
      return { p: v3(p), w: r, h: r };
    }), {
      sides: 6, ref: Math.abs(d.y) > 0.9 ? [1, 0, 0] : [0, 1, 0], capEnd: tip ? 0.6 : undefined,
      token: ({ u, centroid }) => (tip && u > 2 ? CREAM : centroid.y < 0.25 ? TEAL : OCHRE),
      tone: (q) => 0.82 + 0.2 * THREE.MathUtils.clamp(q.y / 1.3, 0, 1)
    });
    if (depth === 0) return;
    const end = points[points.length - 1];
    const forks = depth === 2 ? 3 : 2 + Math.round(random());
    for (let k = 0; k < forks; k += 1) {
      const a = (k / forks) * Math.PI * 2 + random() * 0.8;
      const spread = depth === 2 ? 0.7 : 0.5;
      const nd = d.clone().add(new THREE.Vector3(Math.cos(a) * spread, 0.25, Math.sin(a) * spread)).normalize();
      branch(end, nd, length * (0.72 + random() * 0.15), radius * 0.66, depth - 1);
    }
  };
  branch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.05, 1, 0), 0.32, 0.075, 2);
  for (let k = 0; k < 2; k += 1) {
    const a = k * 2.6 + 0.8;
    branch(new THREE.Vector3(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12), new THREE.Vector3(Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6), 0.22, 0.05, 1);
  }
  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}

/**
 * Table coral. Redesigned from the Blender table: a broad, gently wavy plate with a lobed rim spreads
 * from a short stalk over a dark rock, sage deepening to teal toward the centre and bright at the
 * growing edge, with a smaller tier beneath and cream polyps round the rim.
 */
export function createCoralTableModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: teal core, sage plate, cream polyps, dark rock.
  const surface = new SurfaceBuilder(context.spec.palette);
  const TEAL = 0;
  const SAGE = 1;
  const CREAM = 2;
  const ROCK = 3;
  seabedRock(surface, new THREE.Vector3(0, 0, 0), 0.32, ROCK, 7);
  surface.addLoft([[0.1, 0.1], [0.3, 0.08], [0.46, 0.12], [0.52, 0.2]].map(([y, r]): Station => ({ p: [0, y, 0], w: r, h: r })),
    { sides: 8, ref: [0, 0, 1], token: TEAL, tone: () => 0.82 });
  const plate = (y: number, radius: number, lobes: number, x0: number, z0: number): void => {
    surface.addPanel({
      cols: 16, rows: 4, thickness: 0.035,
      point: (u, v) => {
        const a = u * Math.PI * 2;
        const r = radius * v * (0.88 + 0.12 * Math.cos(a * lobes));
        const wave = 0.03 * Math.sin(a * 3) * v + 0.06 * v * v;
        return new THREE.Vector3(x0 + Math.cos(a) * r, y + wave, z0 + Math.sin(a) * r);
      },
      token: (_, v) => (v < 0.4 ? TEAL : SAGE),
      tone: (_, v) => 0.8 + 0.24 * v
    });
    for (let k = 0; k < 14; k += 1) {
      const a = (k / 14) * Math.PI * 2 + random() * 0.2;
      const r = radius * 0.96 * (0.88 + 0.12 * Math.cos(a * lobes));
      surface.addDisc([x0 + Math.cos(a) * r, y + 0.06 + 0.02 + 0.03 * Math.sin(a * 3), z0 + Math.sin(a) * r], [0, 1, 0], 0.018, { token: CREAM, sides: 5, dome: 0.008 });
    }
  };
  plate(0.52, 0.78, 7, 0, 0);
  plate(0.3, 0.36, 5, 0.3, -0.25);
  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}
