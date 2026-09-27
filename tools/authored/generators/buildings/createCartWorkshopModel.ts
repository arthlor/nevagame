import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import {
  SurfaceBuilder, addCollisionMarkers, assembleLodLevels, mulberry32,
  type AuthoredModel, type GeneratorContext, type V3
} from "../../kit";
import { rope, timber, wheel } from "../props/parts";

/**
 * A wheelwright's shop: +Y up, +Z toward the display yard, metres.
 * The left store, open right repair bay and stepped roof share the same post
 * datums. Details are authored again at each LOD, never decimated into shards.
 * Mortises, scarf joints and roof laps deliberately overlap their supports.
 */
export function createCartWorkshopModel({ spec, parameters, seed }: GeneratorContext): AuthoredModel {
  const id = spec.id;
  const width = Number(parameters.width);
  const depth = Number(parameters.depth);
  const ridgeHeight = Number(parameters.ridgeHeight);
  const bayFraction = Number(parameters.bayFraction);
  const overhang = Number(parameters.roofOverhang);
  const signRadius = Number(parameters.signRadius);
  const left = -width / 2, right = width / 2;
  const partition = right - width * bayFraction;
  const ridgeX = (left + partition) / 2;
  const back = -depth / 2, front = depth / 2;
  const wallTop = ridgeHeight * 0.61;
  const bayTop = wallTop - 0.65;
  const root = new THREE.Group(); root.name = spec.rootNode;
  // The palette is supplied by the catalog, including matte coastal charcoal
  // for slate. No texture, local shader, light or runtime animation is needed.
  const [HONEY, WARM, DARK, SLATE, IRON, PAPER, RED, GLOW] = spec.palette.map((_, i) => i);

  assembleLodLevels(spec, root, level => {
    const group = new THREE.Group(); group.name = `${id}_assembly_${level}`;
    const random = mulberry32(seed);
    const fine = level === 0, middle = level === 1;
    const sides = fine ? 16 : middle ? 12 : 8;
    const part = (name: string, draw: (s: SurfaceBuilder) => void): THREE.Mesh => {
      const surface = new SurfaceBuilder(spec.palette);
      draw(surface);
      const mesh = surface.buildMesh(`${id}_${name}_${level}`);
      group.add(mesh);
      return mesh;
    };
    const beam = (s: SurfaceBuilder, a: V3, b: V3, half: [number, number], token = HONEY, shade = 0.96): void => {
      timber(s, a, b, half, token, { bevel: fine ? Math.min(...half) * 0.22 : 0, shade });
    };
    const box = (s: SurfaceBuilder, p: V3, size: V3, token: number, shade = 0.96): void => {
      // A fixed frame avoids swapping the width and depth of vertical members.
      timber(s, [p[0], p[1] - size[1] / 2, p[2]], [p[0], p[1] + size[1] / 2, p[2]],
        [size[0] / 2, size[2] / 2], token, { ref: [0, 0, 1], bevel: fine ? Math.min(...size) * 0.16 : 0, shade });
    };
    const pin = (s: SurfaceBuilder, p: V3, radius = 0.046): void => {
      if (fine) s.addDisc(p, [0, 0, 1], radius, { token: IRON, dome: radius * 0.24, sides: 6 });
    };
    const frontWheel = (p: V3, r: number, iron = true): void => {
      // The shared wheel's axle is +X. Rotate its geometry into a front-facing
      // XY plane, then keep the whole semantic assembly in the normal merge path.
      const w = new SurfaceBuilder(spec.palette);
      wheel(w, [0, 0, 0], r, r * 0.15, fine ? 10 : 8,
        iron ? { rim: WARM, spoke: HONEY, hub: WARM, tyre: IRON }
          : { rim: DARK, spoke: DARK, hub: DARK, tyre: DARK }, { segments: sides });
      const mesh = w.buildMesh(`${id}_wheel_${level}_${group.children.length}`);
      mesh.geometry.rotateY(-Math.PI / 2); mesh.geometry.translate(...p);
      // This helper is used by named wheel subassemblies; the caller owns its
      // backing, while the wheel stays separately inspectable before export.
      group.add(mesh);
    };
    const barrel = (s: SurfaceBuilder, x: number, z: number, r: number, h: number): void => {
      const stations = [0, 0.12, 0.5, 0.88, 1].map((t) => ({
        p: [x, t * h, z] as V3, w: r * (0.85 + 0.15 * Math.sin(t * Math.PI)), h: r * (0.85 + 0.15 * Math.sin(t * Math.PI))
      }));
      s.addLoft(stations, { sides, ref: [0, 0, 1], capStart: 0, capEnd: 0, flat: true,
        token: f => Math.cos(f.theta * sides / 2) > 0 ? WARM : HONEY, shade: 0.9 });
      for (const t of [0.14, 0.8]) {
        const radius = r * (0.85 + 0.15 * Math.sin(t * Math.PI)) + 0.016;
        s.addPanel({ cols: sides, rows: 1, wrap: true, thickness: 0.025,
          point: (u, v) => new THREE.Vector3(x + Math.cos(u * Math.PI * 2) * radius, t * h + (v - 0.5) * 0.12, z + Math.sin(u * Math.PI * 2) * radius), token: () => IRON });
      }
      if (fine) for (let i = -1; i <= 1; i++)
        beam(s, [x - r * 0.61, h + 0.012, z + i * r * 0.36], [x + r * 0.61, h + 0.012, z + i * r * 0.36], [0.009, 0.009], DARK);
    };

    part("timber_frame", s => {
      for (const x of [left, partition, right]) for (const z of [back, front]) {
        const top = x === right ? bayTop : wallTop;
        box(s, [x, 0.16, z], [0.68, 0.32, 0.65], SLATE, 1);
        beam(s, [x, 0.3, z], [x, top, z], [0.22, 0.22], HONEY);
        box(s, [x, 0.85, z], [0.46, 0.18, 0.46], IRON);
        box(s, [x, top - 0.1, z], [0.65, 0.32, 0.59], WARM);
        if (fine) for (const y of [0.85, top - 0.1]) pin(s, [x, y, z + 0.245]);
      }
      for (const x of [left, partition, right]) {
        const top = x === right ? bayTop : wallTop;
        beam(s, [x, top, back - 0.24], [x, top, front + 0.27], [0.22, 0.22], WARM);
        if (level < 2) for (const z of [back, front]) {
          beam(s, [x, top - 1.05, z], [x, top - 0.17, z + (z === back ? 0.88 : -0.88)], [0.12, 0.12]);
        }
      }
      for (const z of [back, front]) {
        beam(s, [left - 0.12, wallTop, z], [partition + 0.1, wallTop, z], [0.22, 0.21], WARM);
        beam(s, [partition, wallTop, z], [right + 0.2, bayTop, z], [0.19, 0.19], WARM);
        beam(s, [left, wallTop - 0.1, z], [ridgeX, ridgeHeight - 0.12, z], [0.19, 0.21]);
        beam(s, [ridgeX, ridgeHeight - 0.12, z], [partition, wallTop - 0.1, z], [0.19, 0.21]);
        beam(s, [ridgeX, wallTop, z], [ridgeX, ridgeHeight - 0.1, z], [0.14, 0.14], WARM);
        for (const [x, sign] of [[left, 1], [partition, -1], [right, -1]]) {
          const top = x === right ? bayTop : wallTop;
          beam(s, [x, top - 1.1, z], [x + sign * 0.9, top - 0.12 + (x === right ? 0.12 : 0), z], [0.14, 0.14]);
        }
      }
      beam(s, [ridgeX, ridgeHeight - 0.12, back - 0.35], [ridgeX, ridgeHeight - 0.12, front + 0.4], [0.18, 0.18], WARM);
      if (level < 2) for (const z of [-2, 0.4]) {
        for (const x of [left, partition]) beam(s, [x, 0.3, z], [x, wallTop, z], [0.15, 0.15], WARM);
        beam(s, [left, wallTop, z], [ridgeX, ridgeHeight - 0.16, z], [0.09, 0.13], DARK);
        beam(s, [ridgeX, ridgeHeight - 0.16, z], [partition, wallTop, z], [0.09, 0.13], DARK);
        beam(s, [partition, wallTop, z], [right, bayTop, z], [0.09, 0.13], DARK);
      }
    });

    part("boarded_store", s => {
      const boards = fine ? 19 : middle ? 10 : 3;
      // Grounded wall boards, with a real doorway and a real upper loft hatch.
      for (const x of [left, partition]) for (let i = 0; i < boards; i++) {
        const step = depth / boards, z = back + (i + 0.5) * step;
        box(s, [x, wallTop / 2, z], [0.15, wallTop - 0.12, step - 0.018], i % 4 === 1 ? HONEY : WARM, 0.88 + (i % 3) * 0.045);
      }
      const across = fine ? 23 : middle ? 12 : 4;
      for (let i = 0; i < across; i++) {
        const step = width / across, x = left + (i + 0.5) * step;
        const top = x > partition ? wallTop + (bayTop - wallTop) * (x - partition) / (right - partition) : wallTop;
        box(s, [x, top / 2, back], [step - 0.018, top - 0.12, 0.17], i % 4 === 0 ? HONEY : WARM, 0.88 + (i % 3) * 0.04);
      }
      const storeWidth = partition - left;
      const count = fine ? 12 : middle ? 7 : 4;
      for (let i = 0; i < count; i++) {
        const step = storeWidth / count, x = left + (i + 0.5) * step;
        const triangleTop = ridgeHeight - Math.abs(x - ridgeX) / (storeWidth / 2) * (ridgeHeight - wallTop) - 0.1;
        for (const z of [back, front]) {
          // Skip the central lower doorway and the two open loft-hatch columns.
          const door = Math.abs(x - ridgeX) < 1.3 && z === front;
          const hatch = Math.abs(x - ridgeX) < 0.62 && z === front;
          const bottom = door ? 3.25 : 0.14;
          const end = hatch ? 4.65 : triangleTop;
          if (end > bottom) box(s, [x, (bottom + end) / 2, z], [step - 0.016, end - bottom, 0.15], i % 3 === 0 ? HONEY : WARM, 0.91);
          if (hatch && triangleTop > 6.13) box(s, [x, (triangleTop + 6.13) / 2, z], [step - 0.016, triangleTop - 6.13, 0.15], WARM);
        }
      }
      for (const x of [left, partition]) for (const y of [0.35, 2.45])
        beam(s, [x, y, back], [x, y, front], [0.12, 0.12], HONEY);
      for (const y of [0.36, 2.55]) beam(s, [left, y, back - 0.12], [right, y, back - 0.12], [0.09, 0.11], HONEY);
      // Rear bracing and a small shutter give the unseen elevation construction.
      if (level < 2) {
        for (const x of [left + 0.25, partition + 0.25])
          beam(s, [x, 0.62, back - 0.16], [x + 1.6, 2.45, back - 0.16], [0.08, 0.09], HONEY);
        box(s, [ridgeX, 3.45, back - 0.16], [1.35, 1.2, 0.15], DARK);
        for (const x of [ridgeX - 0.42, ridgeX, ridgeX + 0.42]) box(s, [x, 3.45, back - 0.27], [0.39, 1.05, 0.08], HONEY);
      }
    });

    part("slate_roof", s => {
      const z0 = back - overhang, z1 = front + overhang;
      const courseCount = fine ? 4 : middle ? 3 : 1;
      const lengthCount = fine ? 5 : middle ? 2 : 1;
      const slope = (a: [number, number], b: [number, number], rows: number): void => {
        // Four broad courses per pitch; thickness and a staggered lower edge
        // carry the slate read without hundreds of individual tiny shingles.
        for (let row = 0; row < rows; row++) for (let col = 0; col < lengthCount; col++) {
          const t0 = row / rows, t1 = Math.min(1, (row + 1) / rows + (level < 2 ? 0.035 : 0));
          const x0 = THREE.MathUtils.lerp(a[0], b[0], t0), x1 = THREE.MathUtils.lerp(a[0], b[0], t1);
          const y0 = THREE.MathUtils.lerp(a[1], b[1], t0), y1 = THREE.MathUtils.lerp(a[1], b[1], t1);
          const za = z0 + (z1 - z0) * col / lengthCount, zb = z0 + (z1 - z0) * (col + 1) / lengthCount;
          const lift = (rows - row) * 0.042;
          s.addPanel({ cols: 1, rows: 1, thickness: level < 2 ? 0.13 : 0.18,
            point: (u, v) => new THREE.Vector3(THREE.MathUtils.lerp(x0, x1, v), THREE.MathUtils.lerp(y0, y1, v) + lift,
              THREE.MathUtils.lerp(za, zb, u) + (fine && v === 1 && col > 0 && col < lengthCount - 1 ? ((row + col) % 2) * 0.055 : 0)),
            token: () => SLATE, shade: () => 0.88 + ((row * 2 + col) % 4) * 0.04 });
        }
      };
      slope([ridgeX, ridgeHeight + 0.13], [left - overhang, wallTop - 0.12], courseCount);
      slope([ridgeX, ridgeHeight + 0.13], [partition, wallTop + 0.27], courseCount);
      slope([partition - 0.1, wallTop + 0.38], [right + overhang, bayTop + 0.32], Math.max(1, courseCount - 1));
      for (const z of [z0, z1]) {
        beam(s, [left - overhang, wallTop - 0.1, z], [ridgeX, ridgeHeight + 0.1, z], [0.11, 0.15], SLATE);
        beam(s, [ridgeX, ridgeHeight + 0.1, z], [partition, wallTop + 0.22, z], [0.11, 0.15], SLATE);
        beam(s, [partition, wallTop + 0.33, z], [right + overhang, bayTop + 0.27, z], [0.11, 0.15], SLATE);
      }
      for (const [x, y] of [[left - overhang, wallTop - 0.12], [right + overhang, bayTop + 0.27]])
        beam(s, [x, y, z0], [x, y, z1], [0.11, 0.17], SLATE);
      beam(s, [ridgeX, ridgeHeight + 0.22, z0 - 0.03], [ridgeX, ridgeHeight + 0.22, z1 + 0.03], [0.19, 0.15], SLATE);
    });

    part("cupola_and_pennant", s => {
      const z = front - 1.15, base = ridgeHeight + 0.2;
      box(s, [ridgeX, base + 0.13, z], [1.33, 0.27, 1.28], WARM);
      for (const dx of [-0.49, 0.49]) for (const dz of [-0.46, 0.46])
        beam(s, [ridgeX + dx, base + 0.18, z + dz], [ridgeX + dx, base + 1.03, z + dz], [0.095, 0.095]);
      for (const dz of [-0.5, 0.5]) beam(s, [ridgeX - 0.6, base + 1.0, z + dz], [ridgeX + 0.6, base + 1.0, z + dz], [0.1, 0.1], WARM);
      // Hip cap is a closed four-sided loft, including a narrow solid crown.
      s.addLoft([{ p: [ridgeX, base + 1.02, z], w: 0.83, h: 0.8 }, { p: [ridgeX, base + 1.61, z], w: 0.18, h: 0.16 }],
        { sides: 4, ref: [0, 0, 1], profile: [[-1, -1], [1, -1], [1, 1], [-1, 1]], flat: true, capStart: 0, capEnd: 0, token: SLATE });
      beam(s, [ridgeX, base + 1.58, z], [ridgeX, base + 3.12, z], [0.055, 0.055], IRON);
      s.addPanel({ cols: fine ? 8 : 4, rows: 2, thickness: 0.025,
        point: (u, v) => new THREE.Vector3(ridgeX + 0.06 + u * 1.55 - (1 - Math.abs(v * 2 - 1)) * u ** 6 * 0.44,
          base + 2.93 - v * 0.78 - u * 0.16, z + Math.sin(u * Math.PI * 2.1) * 0.13), token: () => RED });
      if (fine) for (const y of [base + 2.25, base + 2.9]) box(s, [ridgeX + 0.075, y, z], [0.12, 0.05, 0.12], HONEY);
    });

    part("loft_vent", s => {
      // A long, shallow clerestory is seated on the main right pitch.
      const x = ridgeX + 1.28, z0 = back + 1.3, z1 = front - 1.9;
      const roofY = ridgeHeight + 0.13 - 1.28 / (partition - ridgeX) * (ridgeHeight - wallTop - 0.14);
      const top = roofY + 0.67;
      const seatedY = (px: number): number => ridgeHeight + 0.19 - (px - ridgeX) / (partition - ridgeX) * (ridgeHeight - wallTop - 0.14);
      const sill = seatedY(x + 0.91) + 0.23;
      s.addHull([
        ...[z0, z1].flatMap(z => [[x - 0.08, seatedY(x - 0.08), z], [x + 0.91, seatedY(x + 0.91), z],
          [x + 0.91, sill, z], [x - 0.08, seatedY(x - 0.08) + 0.23, z]] as V3[])
      ], { token: WARM });
      for (let i = 0; i <= 4; i++) {
        const z = THREE.MathUtils.lerp(z0, z1, i / 4);
        beam(s, [x + 0.88, sill, z], [x + 0.88, top, z], [0.08, 0.08], HONEY);
      }
      beam(s, [x + 0.88, sill, z0 - 0.08], [x + 0.88, sill, z1 + 0.08], [0.09, 0.1], HONEY);
      beam(s, [x + 0.88, top, z0 - 0.08], [x + 0.88, top, z1 + 0.08], [0.09, 0.1], HONEY);
      s.addPanel({ cols: 1, rows: 1, thickness: 0.13,
        point: (u, v) => new THREE.Vector3(x - 0.12 + v * 1.18, top + 0.31 - v * 0.18, THREE.MathUtils.lerp(z0 - 0.18, z1 + 0.18, u)), token: () => SLATE });
      for (const z of [z0, z1]) s.addHull([[x - 0.08, seatedY(x - 0.08), z - 0.07], [x + 0.88, seatedY(x + 0.88), z - 0.07], [x + 0.88, top, z - 0.07],
        [x - 0.08, top + 0.18, z - 0.07], [x - 0.08, seatedY(x - 0.08), z + 0.07], [x + 0.88, seatedY(x + 0.88), z + 0.07],
        [x + 0.88, top, z + 0.07], [x - 0.08, top + 0.18, z + 0.07]], { token: WARM });
    });

    part("doors_and_sign", s => {
      const z = front + 0.17;
      for (const side of [-1, 1]) {
        const x = ridgeX + side * 1.86;
        // Sliding leaves rest outside the 2.5m entrance, with iron tracks above.
        const count = fine ? 4 : 2;
        for (let i = 0; i < count; i++) box(s, [x - 0.52 + (i + 0.5) * 1.04 / count, 1.65, z + 0.02], [1.04 / count - 0.014, 3.0, 0.14], WARM, 0.87 + (i % 3) * 0.045);
        for (const y of [0.54, 2.81]) {
          box(s, [x, y, z + 0.13], [1.15, 0.12, 0.075], IRON);
          for (const dx of [-0.43, 0.43]) pin(s, [x + dx, y, z + 0.18]);
        }
        beam(s, [x - side * 0.47, 0.66, z + 0.14], [x + side * 0.47, 2.68, z + 0.14], [0.066, 0.10], HONEY);
        box(s, [x - side * 0.33, 1.55, z + 0.2], [0.06, 0.32, 0.085], IRON);
      }
      box(s, [ridgeX, 3.32, z + 0.19], [5.0, 0.1, 0.11], IRON);
      for (const x of [ridgeX - 1.3, ridgeX + 1.3]) beam(s, [x, 0.1, front], [x, 3.24, front], [0.13, 0.14], HONEY);
      beam(s, [ridgeX - 1.48, 3.22, front], [ridgeX + 1.48, 3.22, front], [0.16, 0.17], HONEY);
      for (const x of [ridgeX - 0.73, ridgeX + 0.73]) beam(s, [x, 4.67, front + 0.04], [x, 6.2, front + 0.04], [0.10, 0.11], HONEY);
      beam(s, [ridgeX - 0.85, 4.63, front + 0.06], [ridgeX + 0.85, 4.63, front + 0.06], [0.14, 0.12], HONEY);
      beam(s, [ridgeX - 1.53, 5.55, z + 0.46], [ridgeX + 1.53, 5.55, z + 0.46], [0.10, 0.10], IRON);
      for (const dx of [-1.15, 1.15]) {
        beam(s, [ridgeX + dx, 5.55, front], [ridgeX + dx, 5.55, z + 0.5], [0.07, 0.07], IRON);
        rope(s, [[ridgeX + dx, 5.5, z + 0.46], [ridgeX + dx, 4.87, z + 0.46]], 0.035, IRON, { sides: 5 });
      }
      for (let row = 0; row < 4; row++) box(s, [ridgeX + (row % 2 ? 0.045 : -0.02), 3.9 + row * 0.30, z + 0.45],
        [2.85 + (row % 2) * 0.12, 0.32, 0.19], HONEY, 0.88 + row * 0.035);
      frontWheel([ridgeX, 4.34, z + 0.62], signRadius, false);
    });

    part("repair_cart", s => {
      const x = partition + 1.77, z = back + 2.85, axleY = 0.92;
      const wheelR = 0.86;
      for (const dx of [-1.02, 1.02]) wheel(s, [x + dx, axleY, z], wheelR, 0.15, fine ? 10 : 8,
        { rim: WARM, spoke: HONEY, hub: WARM, tyre: IRON }, { segments: sides });
      beam(s, [x - 1.17, axleY, z], [x + 1.17, axleY, z], [0.1, 0.1], IRON);
      // Two-wheel body rests on its axle and a planted prop stand at the shafts.
      for (const dx of [-0.68, 0.68]) {
        beam(s, [x + dx, 1.05, z - 1.25], [x + dx, 1.05, z + 1.35], [0.12, 0.12], DARK);
        beam(s, [x + dx, 1.05, z + 1.0], [x + dx * 0.76, 0.56, z + 2.15], [0.07, 0.085], HONEY);
        for (const dz of [-1.12, 1.12]) beam(s, [x + dx, 1.14, z + dz], [x + dx * 1.22, 2.0, z + dz], [0.07, 0.08], HONEY);
      }
      const planks = fine ? 7 : middle ? 4 : 1;
      for (let i = 0; i < planks; i++) box(s, [x, 1.17, z - 1.15 + (i + 0.5) * 2.3 / planks], [1.66, 0.15, 2.3 / planks - 0.012], HONEY, 0.94);
      for (const dx of [-0.82, 0.82]) for (let row = 0; row < (level < 2 ? 3 : 1); row++) {
        const y = level < 2 ? 1.35 + row * 0.24 : 1.6;
        box(s, [x + dx * (1 + (y - 1.3) * 0.18), y, z], [0.1, level < 2 ? 0.215 : 0.7, 2.32], row % 2 ? HONEY : WARM);
      }
      box(s, [x, 1.62, z - 1.13], [1.62, 0.8, 0.12], WARM);
      beam(s, [x, 0.04, z + 1.62], [x, 0.72, z + 1.62], [0.1, 0.1], WARM);
      box(s, [x, 0.07, z + 1.62], [0.64, 0.14, 0.34], WARM);
    });

    const workbench = part("workbench_and_patterns", s => {
      const x = right - 0.75, z = front - 1.15, top = 1.2;
      for (const dx of [-0.5, 0.5]) for (const dz of [-0.78, 0.78]) {
        beam(s, [x + dx * 1.12, 0, z + dz * 1.08], [x + dx, top - 0.15, z + dz], [0.105, 0.105], WARM);
      }
      box(s, [x, top - 0.13, z], [1.35, 0.25, 2.04], HONEY);
      box(s, [x, 0.3, z], [1.12, 0.13, 1.85], WARM);
      box(s, [x, 0.94, z + 0.79], [1.27, 0.28, 0.12], WARM);
      // A real end vise, screw and cross-handle at the working end.
      box(s, [x + 0.34, 1.1, z + 1.16], [0.4, 0.36, 0.18], WARM);
      rope(s, [[x + 0.34, 1.06, z + 0.9], [x + 0.34, 1.06, z + 1.44]], 0.047, IRON, { sides: 6 });
      beam(s, [x + 0.34, 0.84, z + 1.4], [x + 0.34, 1.3, z + 1.4], [0.027, 0.027], HONEY);
      if (level < 2) {
        box(s, [x - 0.15, 1.28, z + 0.1], [0.38, 0.16, 0.20], DARK);
        beam(s, [x - 0.15, 1.28, z + 0.17], [x - 0.15, 1.29, z + 0.68], [0.035, 0.035], HONEY);
        // A spokeshave, mallet and spare hub explain the wheelwright's trade.
        beam(s, [x + 0.29, 1.27, z - 0.6], [x + 0.29, 1.29, z - 0.16], [0.025, 0.025], HONEY);
        box(s, [x + 0.29, 1.31, z - 0.56], [0.32, 0.19, 0.16], WARM);
        s.addLoft([{ p: [x - 0.3, 1.34, z - 0.52], w: 0.12, h: 0.12 }, { p: [x + 0.08, 1.34, z - 0.52], w: 0.12, h: 0.12 }],
          { sides: 8, ref: [0, 1, 0], capStart: 0, capEnd: 0, token: HONEY });
      }
      const boardX = right - 0.07, boardZ = front - 1.0;
      for (const dz of [-0.88, 0.88])
        beam(s, [boardX, top - 0.2, boardZ + dz], [boardX, 3.12, boardZ + dz], [0.065, 0.065], DARK);
      box(s, [boardX, 2.36, boardZ], [0.14, 1.6, 2.15], WARM);
      box(s, [boardX - 0.083, 2.56, boardZ], [0.035, 1.13, 1.63], PAPER);
      if (fine) {
        // The measured cart plan is line geometry attached to the board, not a
        // texture or text that becomes illegible from the gameplay camera.
        const px = boardX - 0.11;
        for (const dz of [-0.48, 0.48]) {
          s.addPanel({ cols: 14, rows: 1, wrap: true, thickness: 0.012,
            point: (u, v) => new THREE.Vector3(px, 2.29 + Math.cos(u * Math.PI * 2) * (0.18 + v * 0.026), boardZ + dz + Math.sin(u * Math.PI * 2) * (0.18 + v * 0.026)), token: () => WARM });
        }
        for (const y of [2.52, 2.89]) beam(s, [px, y, boardZ - 0.6], [px, y, boardZ + 0.63], [0.018, 0.018], WARM);
        for (const dz of [-0.6, 0.63]) beam(s, [px, 2.5, boardZ + dz], [px, 2.89, boardZ + dz * 1.08], [0.018, 0.018], WARM);
        for (let i = 0; i < 5; i++) {
          const tz = boardZ - 0.78 + i * 0.37;
          beam(s, [boardX - 0.16, 1.7, tz], [boardX - 0.16, 2.07, tz], [0.028, 0.03], HONEY);
          box(s, [boardX - 0.16, 2.07, tz], [0.12, 0.09, 0.18], IRON);
        }
      }
    });
    // Face the pattern and working edge toward the yard. Transform the surface
    // itself so the shipping material merge retains this bench-local rotation.
    workbench.geometry.translate(-(right - 0.75), 0, -(front - 1.15));
    workbench.geometry.rotateY(Math.PI / 2);
    workbench.geometry.translate(right - 0.75, 0, front - 1.15);

    part("stored_timber_and_wheels", s => {
      // Left stockpile stays outside the entrance; every course sits on bearers.
      const x = left - 0.02, z = front + 0.8;
      for (const dx of [-0.67, 0.67]) box(s, [x + dx, 0.1, z], [0.22, 0.2, 1.18], DARK);
      const rows = fine ? 5 : middle ? 3 : 1;
      for (let row = 0; row < rows; row++) for (let col = 0; col < (level < 2 ? 3 : 1); col++) {
        box(s, [x + (row % 2) * 0.08, level < 2 ? 0.31 + row * 0.24 : 0.77, z + (level < 2 ? (col - 1) * 0.34 : 0)],
          [1.75 + (row % 3) * 0.13, level < 2 ? 0.21 : 1.1, level < 2 ? 0.31 : 1.0], row % 3 === 0 ? WARM : HONEY, 0.9 + random() * 0.1);
      }
      if (level < 2) {
        frontWheel([left + 0.58, 0.9, front + 1.65], 0.86);
        frontWheel([left + 1.58, 0.7, front + 1.84], 0.67);
        barrel(s, partition - 0.48, front + 0.89, 0.5, 1.25);
        // Resting replacement axle beneath the open bay, clear of the entrance.
        beam(s, [right - 1.55, 0.28, front + 0.7], [right + 0.24, 0.28, front + 0.7], [0.105, 0.105], DARK);
        for (const ax of [right - 1.35, right + 0.05]) s.addLoft([
          { p: [ax - 0.15, 0.28, front + 0.7], w: 0.23, h: 0.23 }, { p: [ax + 0.15, 0.28, front + 0.7], w: 0.23, h: 0.23 }
        ], { sides, ref: [0, 1, 0], capStart: 0, capEnd: 0, token: WARM });
        barrel(s, left + 0.72, back + 0.75, 0.46, 1.12);
        for (let i = 0; i < 3; i++) beam(s, [partition + 0.26 + i * 0.21, 0.03, front - 0.6], [partition + 0.09 + i * 0.21, 2.1 - i * 0.18, front - 1.15], [0.085, 0.11], HONEY);
      }
    });

    part("hanging_lanterns", s => {
      for (const [x, supportY, z] of [[partition + 0.2, wallTop - 0.17, front + 0.27], [right - 0.05, bayTop - 0.1, front + 0.3]]) {
        const y = supportY - 0.96;
        rope(s, [[x, supportY, z], [x, y + 0.64, z]], 0.026, IRON, { sides: 5 });
        box(s, [x, y + 0.22, z], [0.30, 0.43, 0.30], GLOW);
        for (const dx of [-0.19, 0.19]) for (const dz of [-0.19, 0.19])
          beam(s, [x + dx, y - 0.04, z + dz], [x + dx, y + 0.49, z + dz], [0.028, 0.028], IRON);
        for (const h of [-0.045, 0.2, 0.5]) box(s, [x, y + h, z], [0.44, 0.055, 0.44], IRON);
        s.addLoft([{ p: [x, y + 0.53, z], w: 0.28, h: 0.28 }, { p: [x, y + 0.75, z], w: 0.065, h: 0.065 }],
          { sides: 4, ref: [0, 0, 1], profile: [[-1, -1], [1, -1], [1, 1], [-1, 1]], flat: true, capStart: 0, capEnd: 0, token: IRON });
      }
    });
    // Parts remain named during construction/inspection. The shipping LOD is
    // one geometry with one group per used palette token: eight draws, not a
    // draw for every plank, wheel and lantern. Never merge across LOD roots.
    const meshes = group.children as THREE.Mesh[];
    const geometry = mergeGeometries(meshes.map(mesh => mesh.geometry), false);
    if (!geometry) throw new Error(`${id}: workshop surfaces could not be merged`);
    const byToken = spec.palette.map(() => [] as number[]);
    let offset = 0;
    for (const mesh of meshes) {
      const source = mesh.geometry;
      for (const materialGroup of source.groups) {
        const target = byToken[materialGroup.materialIndex ?? 0];
        for (let i = materialGroup.start; i < materialGroup.start + materialGroup.count; i++)
          target.push(source.index!.getX(i) + offset);
      }
      offset += source.getAttribute("position").count;
    }
    geometry.setIndex(byToken.flat());
    geometry.clearGroups();
    let start = 0;
    byToken.forEach((indices, token) => {
      if (indices.length) geometry.addGroup(start, indices.length, token);
      start += indices.length;
    });
    const surface = new THREE.Mesh(geometry, meshes[0].material);
    surface.name = `${id}_surface_${level}`;
    meshes.forEach(mesh => mesh.geometry.dispose());
    return surface;
  });
  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}
