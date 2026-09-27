import * as THREE from "three";
import {
  SurfaceBuilder, addCollisionMarkers, assembleLodLevels, lodDetail, mulberry32,
  type AuthoredModel, type FaceContext, type GeneratorContext, type Station, type V3
} from "../../kit";
import { rope } from "../props/parts";

/**
 * Riverside family: the stones, reeds and understory of the Silverwater.
 * Stones follow how running water shapes them (rounded, polished shoulders
 * above a damp foot, moss only on the tops the spray keeps wet); plants follow
 * the bank zones (reed beds in the shallows, ferns in the spray, willow scrub
 * on the bank top). Metres, Y up, ground pivot, front +Z.
 */

const smooth = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Low-frequency deterministic field over a stone's surface, for moss patches. */
const patchField = (p: THREE.Vector3, phase: number): number =>
  0.5 + 0.28 * Math.sin(p.x * 4.1 + p.z * 2.3 + phase) + 0.22 * Math.sin(p.z * 5.7 - p.x * 1.9 + phase * 1.7);

/** Resizes a built mesh onto the catalog footprint with its base on the ground. */
function fitToCatalog(mesh: THREE.Mesh, dimensions: { width: number; depth: number; height: number }, fill = 0.96): void {
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox!;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  mesh.geometry.translate(-center.x, -box.min.y, -center.z);
  mesh.geometry.scale(dimensions.width * fill / size.x, dimensions.height * fill / size.y, dimensions.depth * fill / size.z);
  mesh.geometry.computeBoundingBox();
  mesh.geometry.computeBoundingSphere();
}

/**
 * Water-worn boulder, built as convex hulls around point clouds. `rounded`
 * stones are one polished mass (plus buried satellite lobes): an ellipsoid
 * cloud with broad shoulders, cut by two or three fracture planes into big
 * facets, a gently tilted polish plane on top and a flat bed. `tabular`
 * stones are bedded slabs with chamfered corners and a slight overhang where
 * a harder bed protrudes: the flat-topped blocks that hold a step-pool sill
 * or armour a bank. Moss grows only on upward faces high on the stone; the
 * lower flanks carry the dark wet line. Palette: 0 stone, 1 moss, 2 warm
 * facets, 3 wet stone.
 */
export function createRiverBoulderModel({ spec, parameters: p, seed }: GeneratorContext): AuthoredModel {
  const root = new THREE.Group();
  root.name = spec.rootNode;
  const form = String(p.form);
  const lobes = Number(p.lobes);
  const moss = Number(p.moss);
  const build = (lod: number): THREE.Object3D => {
    const random = mulberry32(seed);
    const surface = new SurfaceBuilder(spec.palette);
    const phase = random() * 6.28;
    const tabular = form === "tabular";
    const totalHeight = tabular ? 0.6 : 0.68;
    const token = ({ normal, centroid }: FaceContext): number => {
      const high = smooth(totalHeight * 0.36, totalHeight * 0.72, centroid.y);
      // The polished crown stays damp from spray and holds moss most often.
      if (normal.y > 0.78 && high > 0.35 && patchField(centroid, phase) < moss * 1.3) return 1;
      if (normal.y > 0.55 && high > 0.25 && patchField(centroid, phase) < moss * (0.72 + high * 0.6)) return 1;
      // Wet line: the low flanks the water keeps dark.
      if (spec.palette.length > 3 && normal.y < 0.45 && centroid.y < totalHeight * 0.3) return 3;
      if (spec.palette.length > 2 && normal.x > 0.5 && normal.y < 0.6 && patchField(centroid, phase + 2.1) > 0.78) return 2;
      return 0;
    };
    // Damp foot: faces darken toward the water line and splash, one value per
    // face so the stone keeps its flat facet colours.
    const shade = ({ normal, centroid }: FaceContext): number =>
      (0.88 + 0.12 * Math.max(0, normal.y)) * (0.8 + 0.2 * smooth(0, totalHeight * 0.5, centroid.y))
      * (0.95 + 0.07 * patchField(centroid, phase + 4.3));
    /** Moves points beyond a plane onto it: one broad fracture facet. */
    const cut = (points: THREE.Vector3[], normal: THREE.Vector3, keep: number): void => {
      for (const point of points) {
        const excess = point.dot(normal) - keep;
        if (excess > 0) point.addScaledVector(normal, -excess);
      }
    };
    for (let lobe = 0; lobe < lobes; lobe += 1) {
      const primary = lobe === 0;
      const angle = random() * Math.PI * 2;
      const reach = primary ? 0 : 0.28 + random() * 0.14;
      const centre = new THREE.Vector3(Math.cos(angle) * reach, 0, Math.sin(angle) * reach * 0.8);
      const size = primary ? 1 : 0.5 + random() * 0.16;
      const points: THREE.Vector3[] = [];
      if (tabular) {
        // Two bedded slabs; the upper one steps back a little and tilts.
        const beds = primary ? 2 : 1;
        let base = 0;
        for (let bed = 0; bed < beds; bed += 1) {
          const bedPoints: THREE.Vector3[] = [];
          const thickness = totalHeight * size * (beds === 2 ? (bed === 0 ? 0.55 : 0.45) : 0.8);
          const halfX = 0.5 * size * (bed === 0 ? 1 : 0.84);
          const halfZ = 0.4 * size * (bed === 0 ? 1 : 0.86);
          const shift = new THREE.Vector3((random() - 0.5) * 0.12, 0, (random() - 0.5) * 0.1);
          const tiltX = (random() - 0.5) * 0.1;
          const tiltZ = (random() - 0.5) * 0.08;
          const corners = lod ? 6 : 10;
          for (const level of [0, 0.12, 0.88, 1]) {
            const inset = level === 0 || level === 1 ? 0.84 : 1;
            for (let k = 0; k < corners; k += 1) {
              const theta = (k / corners) * Math.PI * 2 + phase;
              // A rounded rectangle section: straight sides, softened corners.
              const cx = Math.sign(Math.cos(theta)) * Math.pow(Math.abs(Math.cos(theta)), 0.45);
              const cz = Math.sign(Math.sin(theta)) * Math.pow(Math.abs(Math.sin(theta)), 0.45);
              const jitter = 1 + (random() - 0.5) * 0.12;
              const x = cx * halfX * inset * jitter;
              const z = cz * halfZ * inset * jitter;
              const y = base + level * thickness + x * tiltX + z * tiltZ;
              bedPoints.push(new THREE.Vector3(x, y, z).add(shift).add(centre));
            }
          }
          cut(bedPoints, new THREE.Vector3(0, -1, 0), -base);
          surface.addHull(bedPoints.map((point) => [point.x, point.y, point.z] as V3), { token, shade });
          base += thickness * 0.94;
        }
        continue;
      }
      const count = lod ? 18 : 36;
      const halfX = 0.5 * size;
      const halfZ = 0.42 * size;
      const height = totalHeight * size;
      for (let k = 0; k < count; k += 1) {
        const y = 1 - (2 * (k + 0.5)) / count;
        const ring = Math.sqrt(1 - y * y);
        const theta = k * 2.399963 + phase;
        // Water-worn: wide shoulders and a low, broad crown, not a sphere.
        const shoulder = Math.pow(ring, 0.7);
        const lump = 1 + 0.1 * Math.sin(theta * 2 + phase) + 0.06 * Math.cos(theta * 3 - phase * 0.7);
        points.push(new THREE.Vector3(
          Math.cos(theta) * shoulder * halfX * lump,
          (y * 0.5 + 0.5) * height,
          Math.sin(theta) * shoulder * halfZ * lump
        ).add(centre));
      }
      // Two or three fracture planes on the flanks give it broad facets.
      const fractures = primary ? 2 + Math.floor(random() * 2) : 1;
      for (let f = 0; f < fractures; f += 1) {
        const around = phase + f * 2.1 + random() * 0.6;
        const normal = new THREE.Vector3(Math.cos(around), 0.15 + random() * 0.45, Math.sin(around)).normalize();
        const support = Math.max(...points.map((point) => point.clone().sub(centre).dot(normal)));
        cut(points, normal, centre.dot(normal) + support * (0.8 + random() * 0.1));
      }
      // Polished, slightly tilted top and a flat bed.
      const top = new THREE.Vector3((random() - 0.5) * 0.3, 1, (random() - 0.5) * 0.3).normalize();
      const topSupport = Math.max(...points.map((point) => point.dot(top)));
      cut(points, top, topSupport * 0.93);
      cut(points, new THREE.Vector3(0, -1, 0), 0);
      surface.addHull(points.map((point) => [point.x, point.y, point.z] as V3), { token, shade });
    }
    const mesh = surface.buildMesh(`${spec.id}_LOD${lod}_stone`);
    fitToCatalog(mesh, spec.dimensions);
    return mesh;
  };
  assembleLodLevels(spec, root, build);
  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}

/**
 * Emergent reed bed: dense stems taller in the heart of the clump and
 * leaning out at its edge, arching blades, occasional cattail heads, and a
 * low skirt of sedge blades that grounds the clump in the shallows.
 * Palette: 0 stems and blades, 1 cattail heads, 2 fresh blades, 3 dry tips.
 */
export function createReedBedModel({ spec, seed, parameters: p }: GeneratorContext): AuthoredModel {
  const root = new THREE.Group();
  root.name = spec.rootNode;
  const stalks = Number(p.stalks);
  const height = Number(p.height);
  const spread = Number(p.spread);
  const cattailEvery = Number(p.cattailEvery);
  const bladeCount = Number(p.bladeCount);
  const build = (lod: number): THREE.Object3D => {
    const s = new SurfaceBuilder(spec.palette);
    const random = mulberry32(seed);
    for (let i = 0; i < stalks; i += 1) {
      const a = i * 2.399963 + random() * 0.4;
      const ring = Math.sqrt((i + 0.5) / stalks);
      const reach = spread * ring * (0.82 + random() * 0.3);
      const x = Math.cos(a) * reach;
      const z = Math.sin(a) * reach * 0.62;
      // Heart of the clump stands tallest; the edge is shorter and leans out.
      const h = height * (1 - ring * 0.38) * (0.8 + random() * 0.26);
      const lean = 0.05 + ring * 0.22;
      const tip: V3 = [x + Math.cos(a) * lean * h * 0.35, h, z + Math.sin(a) * lean * h * 0.35];
      const keep = lod === 0 || i % 2 === 0;
      if (!keep) continue;
      rope(s, [[x, 0, z], [x + (tip[0] - x) * 0.4, h * 0.55, z + (tip[2] - z) * 0.4], tip], 0.008 + (1 - ring) * 0.003, 0,
        { sides: 3, taper: [1, 0.4] });
      const blades = lod ? 1 : bladeCount;
      for (let j = 0; j < blades; j += 1) {
        const b = a + j * 2.1 + random() * 0.5;
        const base = new THREE.Vector3(x, h * (0.08 + j * 0.16), z);
        const length = h * (0.32 + random() * 0.22);
        const side = new THREE.Vector3(-Math.sin(b), 0, Math.cos(b));
        const dry = random() < 0.22;
        s.addPanel({
          cols: 1, rows: lod ? 1 : 3, thickness: 0.003,
          point: (u, v) => base.clone()
            .add(new THREE.Vector3(Math.cos(b) * length * v * 0.62, length * (1.5 * v - 1.05 * v * v), Math.sin(b) * length * v * 0.62))
            .addScaledVector(side, (u - 0.5) * 0.036 * (1 - v * 0.9)),
          token: (_u, v) => (dry && v > 0.62 ? 3 : j % 2 === 0 ? 0 : 2),
          shade: () => 0.86 + j * 0.05
        });
      }
      if (cattailEvery > 0 && i % cattailEvery === 0 && ring < 0.85) {
        rope(s, [[tip[0] - 0.004, h - 0.2, tip[2]], [tip[0], h - 0.04, tip[2]]], 0.022, 1, { sides: lod ? 4 : 6, taper: [0.85, 0.7] });
      }
    }
    if (lod === 0) {
      // Sedge skirt: short arched blades around the base of the clump.
      const skirt = Math.round(10 + spread * 10);
      for (let k = 0; k < skirt; k += 1) {
        const a = (k / skirt) * Math.PI * 2 + random() * 0.5;
        const r = spread * (0.75 + random() * 0.35);
        const base = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r * 0.62);
        const length = 0.22 + random() * 0.2;
        const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
        s.addPanel({
          cols: 1, rows: 2, thickness: 0.003,
          point: (u, v) => base.clone()
            .add(new THREE.Vector3(Math.cos(a) * length * v * 0.8, length * (1.3 * v - 0.9 * v * v), Math.sin(a) * length * v * 0.8))
            .addScaledVector(side, (u - 0.5) * 0.05 * (1 - v * 0.85)),
          token: () => 2,
          shade: () => 0.84
        });
      }
    }
    return s.buildMesh(`${spec.id}_LOD${lod}_reeds`);
  };
  assembleLodLevels(spec, root, build);
  return { root, clips: [] };
}

/**
 * Fern clump for the spray zone and shaded banks: arching fronds from one
 * crown, each a pinnate blade whose lobed edge reads the leaflets without
 * modelling them one by one. Palette: 0 frond, 1 sunlit tips, 2 crown/rachis.
 */
export function createFernModel({ spec, seed, parameters: p }: GeneratorContext): AuthoredModel {
  const root = new THREE.Group();
  root.name = spec.rootNode;
  const fronds = Number(p.fronds);
  const frondLength = Number(p.length);
  const build = (lod: number): THREE.Object3D => {
    const s = new SurfaceBuilder(spec.palette);
    const random = mulberry32(seed);
    const rows = lodDetail(14, lod, 0.5, 5);
    for (let i = 0; i < fronds; i += 1) {
      if (lod && i % 3 === 2) continue;
      const a = i * 2.399963 + random() * 0.35;
      const length = frondLength * (0.72 + random() * 0.32);
      const rise = 0.55 + random() * 0.35;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      const up = new THREE.Vector3(0, 1, 0);
      const base = dir.clone().multiplyScalar(0.03);
      const spine = (v: number): THREE.Vector3 => base.clone()
        .addScaledVector(dir, length * v * (0.55 + 0.45 * v))
        .addScaledVector(up, length * (rise * v - (rise * 0.95) * v * v));
      const pinnae = 7 + Math.floor(random() * 3);
      s.addPanel({
        cols: 2, rows, thickness: 0.004,
        point: (u, v) => {
          const lobe = 0.58 + 0.42 * Math.abs(Math.cos(v * Math.PI * pinnae));
          const width = length * 0.17 * Math.sin(Math.PI * Math.pow(Math.min(0.999, v), 0.75)) * lobe;
          const across = (u - 0.5) * 2;
          return spine(v)
            .addScaledVector(side, across * width)
            .addScaledVector(up, -Math.abs(across) * width * 0.35);
        },
        token: (_u, v) => (v > 0.72 ? 1 : 0),
        shade: (_u, v) => 0.84 + v * 0.14
      });
      if (lod === 0) rope(s, [spine(0), spine(0.3), spine(0.6)], 0.006, 2, { sides: 3, taper: [1, 0.5] });
    }
    // Crown: the curled base the fronds rise from.
    s.addEllipsoid([0, 0.035, 0], [0.07, 0.05, 0.07], { token: 2, sides: lod ? 5 : 7, shade: 0.85 });
    return s.buildMesh(`${spec.id}_LOD${lod}_fern`);
  };
  assembleLodLevels(spec, root, build);
  return { root, clips: [] };
}

/**
 * Riparian willow scrub (osier / grey willow): one soft, lopsided mound of
 * leaf built from a few overlapping faceted masses, its lower rim weeping into
 * narrow drooping leaf strands, over a stool of short splayed stems. The
 * masses give one readable silhouette from the gameplay camera; the fringe
 * and silver strands read as willow up close. It is the bank-top layer
 * between the reeds and the trees. Palette: 0 leaves, 1 silver undersides and
 * sunlit tops, 2 shaded leaves, 3 stems.
 */
export function createWillowShrubModel({ spec, seed, parameters: p }: GeneratorContext): AuthoredModel {
  const root = new THREE.Group();
  root.name = spec.rootNode;
  const stems = Number(p.stems);
  const height = Number(p.height);
  const spread = Number(p.spread);
  const build = (lod: number): THREE.Object3D => {
    const s = new SurfaceBuilder(spec.palette);
    const random = mulberry32(seed);
    const phase = random() * 6.28;
    const leafShade = ({ centroid }: FaceContext): number => 0.9 + (patchField(centroid, phase) - 0.5) * 0.18;
    const massToken = ({ normal, centroid }: FaceContext): number =>
      normal.y > 0.72 && patchField(centroid, phase) > 0.45 ? 1
        : normal.y < -0.25 || centroid.y < height * 0.34 ? 2 : 0;

    // Main mound, two lower side masses and a raised crown, all overlapping.
    type Mass = { c: THREE.Vector3; r: THREE.Vector3 };
    const side = (angle: number, offset: number, y: number, scale: number): Mass => ({
      c: new THREE.Vector3(Math.cos(angle) * spread * offset, height * y, Math.sin(angle) * spread * offset),
      r: new THREE.Vector3(spread * 0.6 * scale, height * 0.32 * scale, spread * 0.55 * scale)
    });
    const masses: Mass[] = [
      side(phase, 0.08, 0.5, 1.2),
      side(phase + 2.3, 0.52, 0.3, 0.9),
      side(phase - 2.1, 0.48, 0.28, 0.8),
      side(phase + 0.9, 0.22, 0.72, 0.78)
    ];
    const insideOther = (point: THREE.Vector3, self: Mass): boolean => masses.some((mass) => mass !== self
      && ((point.x - mass.c.x) / mass.r.x) ** 2 + ((point.y - mass.c.y) / mass.r.y) ** 2 + ((point.z - mass.c.z) / mass.r.z) ** 2 < 0.8);

    const cloud = lod ? 16 : 40;
    for (const mass of masses) {
      const points: V3[] = [];
      for (let k = 0; k < cloud; k += 1) {
        const y = 1 - (2 * (k + 0.5)) / cloud;
        const ring = Math.sqrt(1 - y * y);
        const theta = k * 2.399963 + phase;
        const lump = 0.86 + random() * 0.24;
        // Flattened underside: leaf masses hang, they do not balloon below.
        const under = y < 0 ? 0.72 : 1;
        points.push([
          mass.c.x + Math.cos(theta) * ring * mass.r.x * lump,
          mass.c.y + y * mass.r.y * lump * under,
          mass.c.z + Math.sin(theta) * ring * mass.r.z * lump
        ]);
      }
      s.addHull(points, { token: massToken, shade: leafShade });
    }

    // Weeping fringe: narrow leaf strands hang from each mass, facing out: a
    // long curtain from the lower rim and a shorter row from the shoulder.
    const rings = lod
      ? [{ count: 6, level: -0.28, radial: 0.92 }]
      : [{ count: 16, level: -0.28, radial: 0.92 }, { count: 9, level: 0.12, radial: 1.02 }];
    for (const mass of masses) for (const ring of rings) {
      const strands = ring.count;
      for (let k = 0; k < strands; k += 1) {
        const b = (k / strands) * Math.PI * 2 + random() * 0.5;
        const out = new THREE.Vector3(Math.cos(b), 0, Math.sin(b));
        const rim = new THREE.Vector3(
          mass.c.x + out.x * mass.r.x * ring.radial,
          mass.c.y + mass.r.y * ring.level,
          mass.c.z + out.z * mass.r.z * ring.radial
        );
        if (insideOther(rim, mass)) continue;
        const length = Math.min(rim.y - 0.05, height * (0.16 + random() * 0.18));
        const flare = length * (0.12 + random() * 0.12);
        const path: Station[] = [0, 0.45, 1].map((v) => ({
          p: [rim.x + out.x * flare * Math.sqrt(v), rim.y - length * v, rim.z + out.z * flare * Math.sqrt(v)] as V3,
          w: 0.085 * Math.sin(Math.PI * (0.2 + v * 0.62)) + 0.018,
          h: 0.014
        }));
        s.addLoft(path, {
          sides: 3, ref: [out.x, 0, out.z], capStart: 0.2, capEnd: 0.8, flat: true,
          token: k % 4 === 0 ? 1 : rim.y < height * 0.34 ? 2 : 0, shade: leafShade
        });
      }
    }

    // Stool: short whippy stems splay from one root into the masses above.
    for (let i = 0; i < stems; i += 1) {
      const a = i * 2.399963 + random() * 0.5;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const reach = spread * (0.18 + random() * 0.22);
      const top = height * (0.42 + random() * 0.14);
      const points = [0, 0.33, 0.66, 1].map((t) => dir.clone().multiplyScalar(0.05 + reach * t * t).setY(top * t));
      const across: V3 = [-Math.sin(a), 0, Math.cos(a)];
      s.addLoft(points.map((point, index) => {
        const radius = 0.04 * THREE.MathUtils.lerp(1, 0.45, index / (points.length - 1));
        return { p: [point.x, point.y, point.z] as V3, w: radius, h: radius };
      }), { sides: lod ? 4 : 5, ref: across, capStart: 0.3, capEnd: 0.3, token: 3 });
    }
    const mesh = s.buildMesh(`${spec.id}_LOD${lod}_willow`);
    fitToCatalog(mesh, spec.dimensions);
    return mesh;
  };
  assembleLodLevels(spec, root, build);
  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}
