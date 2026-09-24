import * as THREE from "three";

import {
  SurfaceBuilder, buildBones, creatureScaffold, mulberry32, namedNode, posTrack, rotTrack, skinSurface, tokenLinearColor,
  type AuthoredModel, type BoneSpec, type FaceContext, type GeneratorContext, type Station, type V3, type Weights
} from "../../kit";
import {
  ACCENT, BELLY, DORSAL, FISH_SPECIES,
  type BodyKey, type CaudalForm, type FinShape, type MedianFin, type PairedFin
} from "./species";

const SPINE = ["spine_0", "spine_1", "spine_2", "spine_3", "caudal"] as const;
/** Spine joints along the body, as fractions of L from the centre (+Z is the nose). */
const JOINTS = [0.52, 0.16, -0.06, -0.26, -0.44];

const smooth = (edge0: number, edge1: number, x: number): number => {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = THREE.MathUtils.lerp;
/** Half-height of the mouth gape row, in flank units. */
const GAPE = 0.05;
const v3 = (p: THREE.Vector3): V3 => [p.x, p.y, p.z];

/**
 * Catch fish, glTF space: +Y up, nose toward +Z, centred on the origin, metres.
 *
 * Each species (see `species.ts`) is sculpted rather than assembled:
 *
 * - The body is one loft through keyframed side and top silhouettes (monotone cubic, so no
 *   overshoot), in a section whose quad rows are placed on the species' own colour lines: the belly
 *   line, stripes, saddle, lateral line and mouth gape all fall on row edges, so every marking is a
 *   clean band. A per-vertex tone darkens the dorsal ridge and lightens the keel, countershading
 *   inside each palette colour.
 * - The head carries a raised gill-cover flap that throws a real shadow line, a dark gape along the
 *   jaw, and an eyeball (iris, pupil, glint) set in a raised orbit.
 * - Fins are pleated ray fans: rays alternate with membrane, the membrane dips between ray tips, the
 *   slab thins toward its edge, and the fin darkens toward its base, so fins read as fins at any
 *   distance. Each caudal form has its own outline.
 * - Spots and scutes are conformed to the body surface; bills, barbels, keels and finlets finish it.
 *
 * The rig keeps the runtime contract: a five-bone spine bends a travelling wave rearward, the head
 * bone is never keyed so the mouth stays on `_mouth_hook` (which the fishing line follows), and
 * `turn` and `struggle` carry their whole-body yaw, roll and lift on the motion root. Two pectoral
 * bones under the head scull while swimming, fold for a burst and flare while hooked.
 */
export function createFishModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const fish = buildFishSurface(context);
  const { root, motion, rig } = creatureScaffold(ID);
  const bones = buildBones(fish.boneSpecs, rig);
  skinSurface(ID, fish.surface, root, rig, bones);
  namedNode(`${ID}_mouth_hook`, fish.mouthHook, motion);
  // Inert since the body bends on bones; kept because the catalog requires it and `WorldScene`
  // still resolves it by name.
  namedNode(`${ID}_tail_pivot`, [0, 0, -0.43 * fish.length], motion);
  return { root, clips: fishClips(ID, context.spec.animationClips ?? [], fish.girth) };
}

/**
 * The fish's surface, bone joints and mouth point, without the rig: `createFishModel` skins it, and a
 * static catch (the fish trade packs) builds it as a plain mesh from the same species table.
 */
export function buildFishSurface(context: GeneratorContext): {
  surface: SurfaceBuilder; boneSpecs: BoneSpec[]; mouthHook: V3; length: number; girth: number;
} {
  const ID = context.spec.id;
  const p = context.parameters;
  const sp = FISH_SPECIES[String(p.species)];
  if (!sp) throw new Error(`${ID}: unknown fish species ${String(p.species)}`);
  const L = Number(p.length);
  const G = Number(p.girth);
  const D = G * Number(p.bodyDepth);
  const finScale = Number(p.finScale ?? 1);
  const segments = Math.round(Number(p.bodySegments ?? 20));
  const radial = Math.round(Number(p.radialSegments ?? 16));
  const random = mulberry32(context.seed);

  // ---- Body surface ---------------------------------------------------------------------------
  const top = keyCurve(sp.keys, 1);
  const bottom = keyCurve(sp.keys, 2);
  const width = keyCurve(sp.keys, 3);
  const clampS = (s: number): number => THREE.MathUtils.clamp(s, 0, 1);
  const topAt = (s: number): number => Math.max(0.002, D * top(clampS(s)));
  const bottomAt = (s: number): number => Math.max(0.002, D * bottom(clampS(s)));
  const widthAt = (s: number): number => Math.max(0.002, G * width(clampS(s)));
  const zOf = (s: number): number => L * (0.5 - s);
  const sOf = (z: number): number => 0.5 - z / L;
  const surfacePoint = (s: number, hf: number, side: number): THREE.Vector3 => {
    const h = hf >= 0 ? topAt(s) : bottomAt(s);
    const x = side * widthAt(s) * Math.max(0, 1 - Math.min(1, Math.abs(hf)) ** sp.n) ** (1 / sp.n);
    return new THREE.Vector3(x, hf * h, zOf(s));
  };
  const surfaceNormal = (s: number, hf: number, side: number): THREE.Vector3 => {
    const along = surfacePoint(s + 0.004, hf, side).sub(surfacePoint(s - 0.004, hf, side));
    const around = surfacePoint(s, Math.min(0.995, hf + 0.012), side).sub(surfacePoint(s, Math.max(-0.995, hf - 0.012), side));
    const normal = new THREE.Vector3().crossVectors(along, around).normalize();
    return normal.dot(surfacePoint(s, hf, side).setZ(0)) < 0 ? normal.negate() : normal;
  };
  const flank = (q: THREE.Vector3): number => {
    const s = clampS(sOf(q.z));
    return q.y >= 0 ? q.y / topAt(s) : q.y / bottomAt(s);
  };

  // Skin: each vertex follows the spine bone whose stretch it sits on, blended across each joint.
  const blend = 0.07;
  const spineWeights = (z: number): Weights => {
    const f = z / L;
    for (let joint = 1; joint < JOINTS.length; joint += 1) {
      if (f > JOINTS[joint] + blend) return { [SPINE[joint - 1]]: 1 };
      if (f > JOINTS[joint] - blend) {
        const t = smooth(JOINTS[joint] + blend, JOINTS[joint] - blend, f);
        return { [SPINE[joint - 1]]: 1 - t, [SPINE[joint]]: t };
      }
    }
    return { caudal: 1 };
  };
  const bodyWeights = (q: THREE.Vector3): Weights => spineWeights(q.z);
  const HEAD: Weights = { spine_0: 1 };

  const pectoralRoot = (side: number): THREE.Vector3 =>
    surfacePoint(sp.pectoral.at + sp.pectoral.base * 0.75, sp.pectoral.hf, side).multiplyScalar(0.9).setZ(zOf(sp.pectoral.at + sp.pectoral.base * 0.75));
  const boneSpecs: BoneSpec[] = SPINE.map((name, index) => ({
    name, head: [0, 0, JOINTS[index] * L] as V3, parent: index > 0 ? SPINE[index - 1] : undefined
  }));
  for (const [side, name] of [[-1, "pectoral_left"], [1, "pectoral_right"]] as const) {
    boneSpecs.push({ name, head: v3(pectoralRoot(side)), parent: "spine_0" });
  }
  const surface = new SurfaceBuilder(context.spec.palette);
  const darkest = darkestToken(context.spec.palette);

  // Colour lines, shared by the body, the gill covers and the eye orbits.
  const mouthRow = (s: number, hf: number): boolean =>
    sp.mouth !== undefined && s < sp.mouth.to && Math.abs(hf - sp.mouth.hf) < GAPE;
  const barPeriod = sp.bars ? (sp.bars.s[1] - sp.bars.s[0]) / sp.bars.count : 1;
  const bodyTokenAt = (s: number, hf: number): number => {
    if (mouthRow(s, hf)) return darkest;
    if (hf < sp.beltLine) return BELLY;
    if (sp.crownBand && sp.saddle !== undefined && hf > sp.saddle && s > sp.crownBand[0] && s < sp.crownBand[1]) return DORSAL;
    if (sp.stripe && hf > sp.stripe[0] && hf < sp.stripe[1] && s > sp.stripe[2] && s < sp.stripe[3]) return ACCENT;
    if (sp.bars && s > sp.bars.s[0] && s < sp.bars.s[1] && hf > sp.bars.down && hf < 0.82
      && ((s - sp.bars.s[0]) / barPeriod) % 1 < 0.5) return ACCENT;
    if (sp.saddle !== undefined && hf > sp.saddle) return ACCENT;
    return DORSAL;
  };
  /** Countershading inside each colour: a darker ridge and snout, a paler keel. */
  const countershade = (s: number, hf: number): number =>
    1 - 0.17 * smooth(0.2, 1, hf) + 0.04 * smooth(-0.45, -1, hf) - 0.05 * (1 - smooth(0, 0.14, s)) * smooth(0, 0.6, hf);

  // Section rows: an even spread, with a row edge on every colour line.
  const lines = [sp.beltLine, sp.saddle, sp.stripe?.[0], sp.stripe?.[1], sp.bars?.down,
    sp.mouth ? sp.mouth.hf - GAPE : undefined, sp.mouth ? sp.mouth.hf + GAPE : undefined,
    sp.lateralLine !== undefined ? sp.lateralLine - 0.018 : undefined, sp.lateralLine !== undefined ? sp.lateralLine + 0.018 : undefined
  ].filter((value): value is number => value !== undefined && Math.abs(value) < 0.98);
  const perSide = Math.max(6, Math.round(radial / 2));
  const rowHeights = [...new Set([
    ...lines,
    ...Array.from({ length: perSide + 1 }, (_, k) => {
      const s = Math.sin(-Math.PI / 2 + (Math.PI * k) / perSide);
      return Math.sign(s) * Math.abs(s) ** (2 / sp.n);
    }).filter((hf) => Math.abs(hf) > 0.999 || lines.every((line) => Math.abs(hf - line) > 0.07))
  ].map((hf) => Number(hf.toFixed(4))))].sort((a, b) => a - b);
  const across = (hf: number): number => Math.max(0, 1 - Math.abs(hf) ** sp.n) ** (1 / sp.n);
  const profile: Array<[number, number]> = [
    ...rowHeights.map((hf): [number, number] => [across(hf), hf]),
    ...rowHeights.slice(1, -1).reverse().map((hf): [number, number] => [-across(hf), hf])
  ];

  // Stations: cosine-spaced (fine at nose and tail), plus a ring on every colour edge along the body.
  const stationSet = new Set<number>([0, 0.01]);
  for (let i = 1; i <= segments; i += 1) stationSet.add((1 - Math.cos((i / segments) * Math.PI)) / 2);
  const edges = [sp.mouth?.to, sp.gill, sp.stripe?.[2], sp.stripe?.[3], sp.crownBand?.[0], sp.crownBand?.[1],
    sp.lateralLine !== undefined ? 0.97 : undefined];
  if (sp.bars) {
    const [from, to] = sp.bars.s;
    for (const s of [...stationSet]) if (s > from && s < to) stationSet.delete(s);
    for (let k = 0; k <= sp.bars.count * 2; k += 1) edges.push(from + ((to - from) * k) / (sp.bars.count * 2));
  }
  for (const edge of edges) {
    if (edge === undefined) continue;
    for (const s of [...stationSet]) if (Math.abs(s - edge) < 0.012 && s > 0.011 && s < 0.999) stationSet.delete(s);
    stationSet.add(edge);
  }
  const bodyStations: Station[] = [...stationSet].map((s) => Number(s.toFixed(4))).sort((a, b) => a - b)
    .filter((s, index, all) => index === 0 || s - all[index - 1] > 0.002)
    .map((s) => ({ p: [0, 0, zOf(s)], w: widthAt(s), h: topAt(s), hb: bottomAt(s), bones: spineWeights(zOf(s)) }));

  const sideStep = (Math.PI * 2) / profile.length;
  surface.addLoft(bodyStations, {
    sides: profile.length, profile, ref: [0, 1, 0], capStart: 0.55, capEnd: 0.2,
    token: ({ centroid }: FaceContext) => bodyTokenAt(sOf(centroid.z), flank(centroid)),
    shade: ({ centroid, u, theta }: FaceContext) => {
      const s = sOf(centroid.z);
      const hf = flank(centroid);
      if (sp.lateralLine !== undefined && s > sp.gill && s < 0.97 && Math.abs(hf - sp.lateralLine) < 0.018) return 0.8;
      if (sp.scales && s > sp.gill && s < 0.95) {
        return (Math.floor(u) + Math.floor((theta + Math.PI) / sideStep)) % 2 ? 0.94 : 1.02;
      }
      return 1;
    },
    tone: (q) => countershade(sOf(q.z), flank(q))
  });

  // ---- Head -------------------------------------------------------------------------------------
  for (const side of [-1, 1]) {
    // Gill cover: a thin flap on the cheek whose trailing lip stands proud and throws a shadow line.
    // Its outline bows back at mid flank and it lies flush at the nape and the throat.
    const coverS = (u: number, hf: number): number => sp.gill + 0.03 * (1 - hf * hf) - 0.034 * (1 - u);
    const coverHf = (v: number): number => lerp(0.62, -0.66, v);
    surface.addPanel({
      cols: 3, rows: 8, thickness: L * 0.0016,
      bones: bodyWeights,
      point: (u, v) => {
        const hf = coverHf(v);
        const s = coverS(u, hf);
        const flare = Math.sin(Math.PI * v) ** 0.7;
        // The leading edge and both ends start under the skin, so only the trailing lip shows.
        return surfacePoint(s, hf, side).addScaledVector(surfaceNormal(s, hf, side), L * (-0.0022 + 0.0094 * flare * u * u));
      },
      token: (u, v) => bodyTokenAt(coverS(u, coverHf(v)), coverHf(v)),
      tone: (u, v) => countershade(coverS(u, coverHf(v)), coverHf(v)) * (1 - 0.14 * u)
    });

    // Eye: a raised orbit round an eyeball with iris, pupil and glint.
    const r = sp.eye.size * L;
    const at = surfacePoint(sp.eye.at, sp.eye.hf, side);
    const normal = surfaceNormal(sp.eye.at, sp.eye.hf, side);
    const tangent = new THREE.Vector3(0, 0, 1).addScaledVector(normal, -normal.z).normalize();
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent);
    const onEye = (along: number, radius: number, angle: number): THREE.Vector3 => at.clone()
      .addScaledVector(normal, along).addScaledVector(tangent, Math.cos(angle) * radius).addScaledVector(bitangent, Math.sin(angle) * radius);
    const orbit: Station[] = Array.from({ length: 13 }, (_, k) => ({
      p: v3(onEye(r * 0.04, r * 1.16, (k / 12) * Math.PI * 2)), w: r * 0.17, h: r * 0.14, bones: HEAD
    }));
    surface.addLoft(orbit, {
      sides: 5, ref: v3(normal), token: bodyTokenAt(sp.eye.at, sp.eye.hf), shade: 0.9,
      tone: () => countershade(sp.eye.at, sp.eye.hf)
    });
    surface.addLoft([
      { p: v3(onEye(-r * 0.45, 0, 0)), w: r * 0.96, h: r * 0.96, bones: HEAD },
      { p: v3(onEye(r * 0.02, 0, 0)), w: r, h: r, bones: HEAD },
      { p: v3(onEye(r * 0.2, 0, 0)), w: r * 0.9, h: r * 0.9, bones: HEAD },
      { p: v3(onEye(r * 0.3, 0, 0)), w: r * 0.62, h: r * 0.62, bones: HEAD },
      { p: v3(onEye(r * 0.4, 0, 0)), w: r * 0.34, h: r * 0.34, bones: HEAD }
    ], {
      sides: 12, ref: v3(tangent), capEnd: 0.4,
      token: ({ u }: FaceContext) => (u < 3 ? sp.eye.iris : darkest),
      shade: ({ u }: FaceContext) => (u < 3 ? 1 : 0.72)
    });
    const up = new THREE.Vector3(0, 1, 0.5).addScaledVector(normal, -normal.dot(new THREE.Vector3(0, 1, 0.5))).normalize();
    const glint = onEye(r * 0.47, 0, 0).addScaledVector(up, r * 0.24);
    surface.addDisc(v3(glint), v3(normal), r * 0.15, { token: BELLY, shade: 1.04, sides: 5, bones: HEAD });
  }

  if (sp.bill) {
    const { length, width: half, height } = sp.bill;
    const reach = length * L;
    surface.addLoft([
      { p: [0, 0, zOf(0.08)], w: widthAt(0.08) * 0.5, h: topAt(0.08) * 0.4, bones: HEAD },
      { p: [0, 0, zOf(0)], w: half * L * 1.6, h: height * L * 1.8, bones: HEAD },
      { p: [0, 0, zOf(0) + reach * 0.5], w: half * L, h: height * L, bones: HEAD },
      { p: [0, 0, zOf(0) + reach], w: half * L * 0.12, h: height * L * 0.3, bones: HEAD }
    ], { sides: 8, ref: [0, 1, 0], capEnd: 0.4, token: DORSAL, shade: 0.82, tone: (q) => 1 - 0.1 * smooth(0, reach, q.z - zOf(0)) });
  }

  for (const barbel of sp.barbels ?? []) {
    for (const side of [-1, 1]) {
      const from = surfacePoint(barbel.s, barbel.hf, side).multiplyScalar(0.95).setZ(zOf(barbel.s));
      const dir = new THREE.Vector3(barbel.dir[0] * side, barbel.dir[1], barbel.dir[2]).normalize();
      const reach = barbel.length * L;
      const along = (t: number): V3 => {
        const q = from.clone().addScaledVector(dir, reach * t);
        return [q.x, q.y - reach * 0.2 * t * t, q.z];
      };
      const thick = Math.max(0.0025, L * 0.006);
      surface.addLoft([0, 0.35, 0.7, 1].map((t) => ({ p: along(t), w: thick * (1 - 0.7 * t), h: thick * (1 - 0.7 * t), bones: HEAD })), {
        sides: 4, ref: [0, 1, 0], capEnd: 0.5, token: DORSAL, shade: 0.8
      });
    }
  }

  // ---- Fins -------------------------------------------------------------------------------------
  interface Fan {
    rays: number;
    base: (t: number) => THREE.Vector3;
    tip: (t: number) => THREE.Vector3;
    normal: THREE.Vector3;
    pleat: number;
    scallop: number;
    thickness: readonly [number, number];
    token: number;
    edgeToken?: number;
    bones: Weights | ((q: THREE.Vector3) => Weights);
    baseTone?: number;
  }
  /** A pleated ray fan: rays alternate with membrane that dips between their tips. */
  const fan = (fin: Fan): void => {
    const cols = Math.max(2, (fin.rays - 1) * 2);
    const baseTone = fin.baseTone ?? 0.82;
    surface.addPanel({
      cols, rows: 3,
      thickness: (_, v) => lerp(fin.thickness[0], fin.thickness[1], v),
      point: (u, v) => {
        const ray = Math.round(u * cols) % 2 === 0;
        const q = fin.base(u).lerp(fin.tip(u), v * (ray ? 1 : 1 - fin.scallop));
        return q.addScaledVector(fin.normal, fin.pleat * v * (ray ? 0.5 : -0.5));
      },
      token: (u) => (fin.edgeToken !== undefined && u < 1 / cols ? fin.edgeToken : fin.token),
      tone: (_, v) => baseTone + (1 - baseTone) * smooth(0, 0.75, v),
      bones: fin.bones
    });
  };
  const thin: readonly [number, number] = [L * 0.009, L * 0.0028];
  const xAxis = new THREE.Vector3(1, 0, 0);

  const medianFin = (fin: MedianFin, upper: boolean, edgeToken?: number): void => {
    const sign = upper ? 1 : -1;
    const height = fin.height * L * finScale;
    const rays = fin.rays === 0 ? 3 : fin.rays ?? (fin.shape === "sail" ? 15 : THREE.MathUtils.clamp(Math.round((fin.to - fin.from) * 45) + 3, 4, 12));
    const base = (t: number): THREE.Vector3 => {
      const s = lerp(fin.from, fin.to, t);
      return new THREE.Vector3(0, sign * (upper ? topAt(s) : bottomAt(s)) * 0.84, zOf(s));
    };
    const tip = (t: number): THREE.Vector3 => {
      const h = height * finProfile(fin.shape, t);
      return base(t).add(new THREE.Vector3(0, sign * h, -h * (fin.sweep ?? 0.4)));
    };
    fan({
      rays, base, tip, normal: xAxis,
      pleat: fin.rays === 0 ? 0 : Math.min(L * 0.006, height * 0.07),
      scallop: fin.rays === 0 ? 0 : fin.shape === "sail" ? 0.05 : fin.shape === "sickle" ? 0.04 : 0.12,
      thickness: fin.rays === 0 ? [L * 0.012, L * 0.004] : thin,
      token: fin.token ?? sp.finToken, edgeToken, bones: bodyWeights, baseTone: fin.rays === 0 ? 0.95 : 0.82
    });
    if (fin.shape === "sail") {
      // Dark spots scattered over both faces of the sail.
      for (let index = 0; index < 16; index += 1) {
        const t = 0.1 + random() * 0.8;
        const v = 0.2 + random() * 0.65;
        const centre = base(t).lerp(tip(t), v);
        const radius = L * (0.008 + random() * 0.006);
        for (const face of [-1, 1]) {
          const n: V3 = [face, 0, 0];
          const lifted = centre.clone().setX(face * (lerp(thin[0], thin[1], v) / 2 + L * 0.0012));
          const ring = Array.from({ length: 6 }, (_, k) => {
            const angle = (k / 6) * Math.PI * 2;
            return v3(lifted.clone().add(new THREE.Vector3(0, Math.sin(angle) * radius, Math.cos(angle) * radius)));
          });
          surface.addPatch(v3(lifted.clone().setX(lifted.x + face * L * 0.0006)), ring, n, {
            token: DORSAL, shade: 0.72, bones: spineWeights(centre.z)
          });
        }
      }
    }
  };
  sp.dorsal.forEach((fin) => medianFin(fin, true));
  sp.anal.forEach((fin, index) => medianFin(fin, false, index === 0 ? sp.finEdge : undefined));

  if (sp.finlets) {
    const [from, to, count] = sp.finlets;
    for (let index = 0; index < count; index += 1) {
      const s = from + ((to - from) * index) / Math.max(1, count - 1);
      for (const upper of [true, false]) {
        medianFin({ from: s, to: s + 0.018, height: 0.028 * (1 - index / (count * 1.8)), shape: "tri", sweep: 0.8, token: ACCENT, rays: 2 }, upper);
      }
    }
  }

  const pairedFin = (fin: PairedFin, side: number, rays: number, bones: Weights | ((q: THREE.Vector3) => Weights), edgeToken?: number): void => {
    const length = fin.length * L * finScale;
    // The rays fan from a lead ray raised toward the flank to a trailing ray dropped below it, so the
    // fin opens as a fan from the side instead of collapsing to an edge-on sliver.
    const lead = new THREE.Vector3(side * fin.out, 0.35 - fin.down * 0.3, -1).normalize();
    const trail = new THREE.Vector3(side * fin.out * 0.7, -fin.down * 1.6 - 0.4, -1).normalize();
    const baseLength = fin.base * 1.5;
    const base = (t: number): THREE.Vector3 =>
      surfacePoint(fin.at + baseLength * t, fin.hf, side).multiplyScalar(0.9).setZ(zOf(fin.at + baseLength * t));
    const reach = (t: number): number => (fin.shape === "sickle" ? 1 - 0.72 * t ** 0.8 : 0.55 + 0.45 * Math.sin(Math.PI * (0.15 + 0.7 * t)));
    const direction = (t: number): THREE.Vector3 => lead.clone().lerp(trail, t).normalize();
    fan({
      rays, base, tip: (t) => base(t).addScaledVector(direction(t), length * reach(t)),
      normal: new THREE.Vector3().crossVectors(direction(0.5), new THREE.Vector3(0, 0, 1)).normalize(),
      pleat: Math.min(L * 0.005, length * 0.06), scallop: fin.shape === "sickle" ? 0.05 : 0.12,
      thickness: thin, token: sp.finToken, edgeToken, bones
    });
  };
  for (const [side, bone] of [[-1, "pectoral_left"], [1, "pectoral_right"]] as const) {
    pairedFin(sp.pectoral, side, 7, { [bone]: 1 });
    if (sp.pelvic) pairedFin(sp.pelvic, side, 5, bodyWeights, sp.finEdge);
  }

  // Caudal fin in the species' form, its rays radiating from the peduncle.
  const tailLength = sp.tailLength * L * finScale;
  const spread = sp.tailSpread * L * finScale;
  const tailBase = zOf(0.985);
  fan({
    rays: 10,
    base: (t) => new THREE.Vector3(0, lerp(-bottomAt(0.99) * 0.85, topAt(0.99) * 0.85, t), tailBase),
    tip: (t) => {
      const [reach, height] = caudalOutline(sp.tail, t);
      return new THREE.Vector3(0, height * spread, zOf(1) - reach * tailLength);
    },
    normal: xAxis, pleat: L * 0.005,
    scallop: sp.tail === "lunate" ? 0.03 : sp.tail === "heterocercal" ? 0.06 : 0.12,
    thickness: [L * 0.011, L * 0.003], token: sp.finToken, bones: bodyWeights, baseTone: 0.8
  });

  if (sp.keel) {
    for (const side of [-1, 1]) {
      fan({
        rays: 3,
        base: (t) => surfacePoint(lerp(0.86, 0.99, t), 0, side).multiplyScalar(0.92).setZ(zOf(lerp(0.86, 0.99, t))),
        tip: (t) => surfacePoint(lerp(0.86, 0.99, t), 0, side).setZ(zOf(lerp(0.86, 0.99, t))).add(new THREE.Vector3(side * L * 0.014 * Math.sin(Math.PI * t), 0, 0)),
        normal: new THREE.Vector3(0, 1, 0), pleat: 0, scallop: 0,
        thickness: [L * 0.008, L * 0.004], token: DORSAL, bones: bodyWeights, baseTone: 0.9
      });
    }
  }

  // ---- Markings, conformed to the body --------------------------------------------------------
  const patch = (s: number, hf: number, side: number, radius: number, stretch: number, token: number, shade: number, dome = 0.5): void => {
    const lift = L * 0.0018;
    const h = hf >= 0 ? topAt(s) : bottomAt(s);
    const on = (ds: number, dh: number): THREE.Vector3 =>
      surfacePoint(s + ds, THREE.MathUtils.clamp(hf + dh, -0.99, 0.99), side)
        .addScaledVector(surfaceNormal(s + ds, THREE.MathUtils.clamp(hf + dh, -0.99, 0.99), side), lift);
    const ring = Array.from({ length: 7 }, (_, k) => {
      const angle = (k / 7) * Math.PI * 2;
      return v3(on((Math.cos(angle) * radius * stretch) / L, (Math.sin(angle) * radius) / h));
    });
    const normal = surfaceNormal(s, hf, side);
    const hub = on(0, 0).addScaledVector(normal, radius * dome * 0.3);
    surface.addPatch(v3(hub), ring, v3(normal), { token, shade, bones: spineWeights(zOf(s)), tone: countershade(s, hf) });
  };
  for (const field of sp.spots ?? []) {
    for (const side of [-1, 1]) {
      for (let index = 0; index < field.count; index += 1) {
        const s = field.row
          ? field.s[0] + ((field.s[1] - field.s[0]) * index) / Math.max(1, field.count - 1)
          : lerp(field.s[0], field.s[1], random());
        const hf = field.row ? field.hf[0] : lerp(field.hf[0], field.hf[1], random());
        const radius = field.size * L * (field.row ? 1 : 0.75 + random() * 0.5);
        patch(s, hf, side, radius, field.stretch ?? 1, field.token, field.shade ?? 1);
      }
    }
  }
  for (const [hf, from, to, count] of sp.scutes ?? []) {
    for (let index = 0; index < count; index += 1) {
      const s = from + ((to - from) * index) / Math.max(1, count - 1);
      const radius = L * 0.0085 * (1.15 - 0.5 * s);
      for (const side of hf > 0.95 ? [1] : [-1, 1]) patch(s, Math.min(hf, 0.97), side, radius, 1.4, BELLY, 0.92, 4);
    }
  }

  const mouthHf = sp.mouth?.hf ?? -0.3;
  const mouthHook: V3 = [0, mouthHf * (mouthHf >= 0 ? topAt(0.01) : bottomAt(0.01)), zOf(0)];
  return { surface, boneSpecs, mouthHook, length: L, girth: G };
}

/** Monotone cubic (Fritsch-Carlson) interpolation through one column of the silhouette keys. */
function keyCurve(keys: readonly BodyKey[], column: 1 | 2 | 3): (s: number) => number {
  const xs = keys.map((key) => key[0]);
  const ys = keys.map((key) => key[column]);
  const n = xs.length;
  const h = xs.slice(1).map((x, i) => x - xs[i]);
  const d = ys.slice(1).map((y, i) => (y - ys[i]) / h[i]);
  const m = ys.map((_, i) => {
    if (i === 0) return d[0];
    if (i === n - 1) return d[n - 2];
    if (d[i - 1] * d[i] <= 0) return 0;
    const w1 = 2 * h[i] + h[i - 1];
    const w2 = h[i] + 2 * h[i - 1];
    return (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  });
  return (s: number): number => {
    let i = 0;
    while (i < n - 2 && s > xs[i + 1]) i += 1;
    const t = THREE.MathUtils.clamp((s - xs[i]) / h[i], 0, 1);
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i]
      + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}

/** Height profile of a median fin along its base, 0 at the front to 1 at the back. */
function finProfile(shape: FinShape, u: number): number {
  const taper = (from: number): number => (u > from ? 1 - smooth(from, 1, u) * 0.94 : 1);
  switch (shape) {
    case "tri": return u < 0.2 ? 0.5 + 0.5 * (u / 0.2) : Math.max(0.06, 1 - 0.94 * ((u - 0.2) / 0.8) ** 0.9);
    case "sickle": return u < 0.1 ? 0.6 + 0.4 * (u / 0.1) : Math.max(0.05, (1 - (u - 0.1) / 0.9) ** 2.4);
    case "sail": return Math.max(0.1, Math.sin(Math.PI * (0.05 + 0.88 * u)) ** 0.5 * (1 - 0.35 * u));
    case "round": return Math.max(0.12, Math.sin(Math.PI * (0.06 + 0.88 * u)) ** 0.7);
    case "rising": return (0.3 + 0.7 * u ** 1.2) * taper(0.88);
    case "lobe": return (u < 0.08 ? 0.6 + 0.4 * (u / 0.08) : 0.2 + 0.8 * (1 - smooth(0.08, 0.36, u))) * taper(0.9);
    case "long": return (0.6 + 0.4 * Math.sin(Math.PI * u) * (1 - 0.3 * u)) * taper(0.88);
  }
}

/** Caudal ray tip for `t` from the lower lobe tip (0) to the upper (1): [reach, height]. */
function caudalOutline(form: CaudalForm, t: number): [number, number] {
  const a = t * 2 - 1;
  const edge = Math.abs(a);
  switch (form) {
    case "forked": return [0.58 + 0.42 * edge ** 1.3, a];
    case "lunate": return [0.28 + 0.72 * edge ** 0.8, a * (0.75 + 0.25 * edge)];
    case "rounded": return [0.72 + 0.28 * Math.cos((a * Math.PI) / 2), a * 0.82];
    case "fan": return [0.84 + 0.16 * Math.cos((a * Math.PI) / 2), a];
    case "heterocercal": return [0.35 + 0.75 * t ** 1.6, -0.55 + 1.6 * t];
  }
}

/** The palette token with the lowest luminance: pupils, gapes and barbels. */
function darkestToken(palette: readonly string[]): number {
  let best = 0;
  let lowest = Infinity;
  palette.forEach((token, index) => {
    const c = tokenLinearColor(token);
    const luminance = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    if (luminance < lowest) {
      lowest = luminance;
      best = index;
    }
  });
  return best;
}

function fishClips(ID: string, specs: ReadonlyArray<{ name: string; durationSeconds: number }>, G: number): THREE.AnimationClip[] {
  const M = `${ID}_motion_root`;
  const duration = (name: string, fallback: number): number => specs.find((clip) => clip.name === name)?.durationSeconds ?? fallback;
  const cycle = (d: number, samples: number, value: (phase: number) => readonly [number, number, number]) =>
    Array.from({ length: samples + 1 }, (_, k) => [(d * k) / samples, ...value(k / samples)] as const);
  /** A travelling body wave: each bone yaws in turn, lagging the one ahead of it. */
  const wave = (d: number, amplitudes: ReadonlyArray<readonly [string, number]>, cycles: number, lag = 0.12): THREE.KeyframeTrack[] =>
    amplitudes.map(([bone, amplitude], index) => rotTrack(bone, cycle(d, cycles * 16, (f) =>
      [0, amplitude * Math.sin(Math.PI * 2 * (cycles * f - lag * index)), 0])));
  /** Pectoral fins: fold (yaw toward the flank) plus a sculling roll; the right fin mirrors. */
  const pectorals = (d: number, fold: number, scull: number, cycles: number): THREE.KeyframeTrack[] =>
    ([["pectoral_left", -1], ["pectoral_right", 1]] as const).map(([bone, side]) => rotTrack(bone, cycle(d, cycles * 8, (f) =>
      [0, side * fold, side * scull * Math.sin(Math.PI * 2 * cycles * f)])));
  const swim = duration("swim", 0.8);
  const burst = duration("burst", 0.4);
  const turn = duration("turn", 0.48);
  const struggle = duration("struggle", 0.6);
  const zero: V3 = [0, 0, 0];
  return [
    new THREE.AnimationClip("swim", swim, [
      ...wave(swim, [["spine_1", 3], ["spine_2", 5], ["spine_3", 7], ["caudal", 10]], 1),
      ...pectorals(swim, 4, 12, 2)
    ]),
    new THREE.AnimationClip("burst", burst, [
      ...wave(burst, [["spine_1", 5], ["spine_2", 8], ["spine_3", 11], ["caudal", 15]], 2),
      ...pectorals(burst, 22, 3, 2)
    ]),
    // A turn yaws the whole body on the motion root and adds the C-bend a fish actually makes: the
    // rear curls back against the yaw, so head and tail both point into the turn; the inside fin
    // flares as a brake.
    new THREE.AnimationClip("turn", turn, [
      rotTrack(M, [[0, 0, 0, 0], [turn / 2, 0, 24, 0], [turn, 0, 0, 0]]),
      posTrack(M, zero, [[0, 0, 0, 0], [turn / 2, -G * 0.08, 0, 0], [turn, 0, 0, 0]]),
      ...([["spine_1", -4], ["spine_2", -7], ["spine_3", -9], ["caudal", -6]] as const).map(([bone, amount]) =>
        rotTrack(bone, [[0, 0, 0, 0], [turn / 2, 0, amount, 0], [turn, 0, 0, 0]])),
      rotTrack("pectoral_left", [[0, 0, 0, 0], [turn / 2, 0, 18, -10], [turn, 0, 0, 0]]),
      rotTrack("pectoral_right", [[0, 0, 0, 0], [turn / 2, 0, 16, 0], [turn, 0, 0, 0]])
    ]),
    // A hooked fish thrashes: roll, yaw and lift stay on the motion root, where the line endpoint
    // follows them, the body whips behind the head and the pectorals flare and beat.
    new THREE.AnimationClip("struggle", struggle, [
      rotTrack(M, ([[0, 0, 0], [0.125, 8, -18], [0.25, 0, 0], [0.375, -8, 18], [0.5, 0, 0], [0.625, 7, -16], [0.75, 0, 0], [0.875, -7, 16], [1, 0, 0]] as const)
        .map(([f, yaw, roll]) => [f * struggle, 0, yaw, roll] as const)),
      posTrack(M, zero, ([[0, 0], [0.125, 0.08], [0.25, 0.03], [0.375, 0], [0.5, 0], [0.625, 0.05], [0.75, 0.02], [0.875, 0], [1, 0]] as const)
        .map(([f, lift]) => [f * struggle, 0, lift * G, 0] as const)),
      ...wave(struggle, [["spine_1", 6], ["spine_2", 10], ["spine_3", 12], ["caudal", 14]], 2),
      ...pectorals(struggle, -14, 20, 4)
    ])
  ];
}
