import * as THREE from "three";
import { SurfaceBuilder, addCollisionMarkers, addMarker, mulberry32, type AuthoredModel, type GeneratorContext, type V3 } from "../../kit";
import { crate, net, rope, sack, timber } from "../props/parts";

/** A covered packing bench, open approach and stores; +Z is the working front. */
export function createTradingStationModel({ spec, parameters, seed }: GeneratorContext): AuthoredModel {
  const id = spec.id;
  const specialty = String(parameters.specialty);
  const tokens = spec.palette;
  const root = new THREE.Group(); root.name = spec.rootNode;
  const s = new SurfaceBuilder(tokens), random = mulberry32(seed);
  const beam = (a: V3, b: V3, half: [number, number], token = 0) => timber(s, a, b, half, token);
  for (const x of [-1.65, 1.65]) for (const z of [-1.1, 1.1]) {
    beam([x, 0, z], [x, 0.24, z], [0.19, 0.19], 6);
    beam([x, 0.23, z], [x, 2.6, z], [0.115, 0.115], 1);
    beam([x, 2.02, z], [x - Math.sign(x) * 0.48, 2.55, z], [0.055, 0.06], 1);
  }
  for (const z of [-1.1, 1.1]) beam([-1.88, 2.6, z], [1.88, 2.6, z], [0.12, 0.105], 1);
  for (const x of [-1.65, 0, 1.65]) {
    beam([x, 2.6, -1.35], [x, 3.28, 0], [0.07, 0.075], 1);
    beam([x, 3.28, 0], [x, 2.6, 1.35], [0.07, 0.075], 1);
  }
  beam([-1.92, 3.28, 0], [1.92, 3.28, 0], [0.095, 0.1], 1);
  for (const side of [-1, 1]) s.addPanel({
    cols: 12, rows: 5, thickness: 0.035,
    point: (u, v) => new THREE.Vector3((u - 0.5) * 4.05, 3.43 - v * 0.78 - 0.07 * Math.sin(v * Math.PI), side * v * 1.5),
    token: (u) => u < 0.13 || u > 0.87 ? 3 : 2,
    shade: (_, v) => 0.91 + v * 0.08
  });
  // A scalloped hem, sewn edge and tied corners make the canopy a fitted
  // working shelter. They leave the sign and the whole approach visible.
  s.addPanel({ cols: 24, rows: 1, thickness: 0.028,
    point: (u, v) => new THREE.Vector3((u - 0.5) * 4.05, 2.65 - v * (0.16 + 0.065 * Math.sin(u * Math.PI * 8) ** 2), 1.5),
    token: u => u < 0.13 || u > 0.87 ? 3 : 2 });
  for (const side of [-1, 1]) {
    rope(s, [[side * 2.02, 2.65, 1.49], [side * 1.65, 2.12, 1.1]], 0.017, 4);
    beam([side * 1.65, 2.6, -1.2], [side * 1.65, 2.6, 1.3], [0.075, 0.075], 1);
  }
  // Solid work top, legs and a low supply shelf. The center-front stays reachable.
  for (let plank = 0; plank < 5; plank++) timber(s, [-1.47, 1.02, 0.216 + plank * 0.172], [1.47, 1.02, 0.216 + plank * 0.172], [0.08, 0.075], 0, { shade: 0.90 + plank * 0.025 });
  for (const x of [-1.3, 1.3]) for (const z of [0.24, 0.87]) beam([x, 0, z], [x, 0.95, z], [0.075, 0.075], 1);
  beam([-1.35, 0.3, 0.5], [1.35, 0.3, 0.5], [0.35, 0.045]);
  beam([-1.35, 0.78, 0.87], [1.35, 0.78, 0.87], [0.04, 0.12], 1);
  for (let i = 0; i < 7; i++) beam([-1.43 + i * 0.47, 0.24, -1.11], [-1.43 + i * 0.47, 1.42, -1.11], [0.20, 0.035], 0);
  for (const y of [0.28, 1.30]) beam([-1.56, y, -1.17], [1.56, y, -1.17], [0.055, 0.05], 1);
  // Packing jig and screw press make this read differently from a produce stall.
  for (const x of [-0.55, 0.45]) beam([x, 1.095, 0.36], [x, 1.72, 0.36], [0.06, 0.06], 1);
  beam([-0.65, 1.75, 0.36], [0.55, 1.75, 0.36], [0.09, 0.06], 1);
  rope(s, [[-0.05, 1.25, 0.36], [-0.05, 1.99, 0.36]], 0.036, 5, { sides: 8 });
  beam([-0.29, 1.92, 0.36], [0.19, 1.92, 0.36], [0.025, 0.025], 1);
  beam([-0.46, 1.24, 0.36], [0.36, 1.24, 0.36], [0.28, 0.038]);
  crate(s, [-1.04, 1.1, 0.5], [0.5, 0.45, 0.27], 0, 1, { random });
  // The same packing service handles different regional goods. Keep supplies
  // behind the counter and reserve its right end for a wrapping roll/ledger.
  s.addLoft([{ p: [0.87, 1.18, 0.48], w: 0.11, h: 0.11 }, { p: [1.28, 1.18, 0.48], w: 0.11, h: 0.11 }],
    { sides: 10, ref: [0, 1, 0], capStart: 0, capEnd: 0, token: 2 });
  beam([0.82, 1.115, 0.75], [1.32, 1.115, 0.75], [0.11, 0.016], 3);
  const storedCrate = (x: number, y: number, fill = false) => crate(s, [x, y, -0.81], [0.72, 0.62, 0.52], 0, 1,
    { random, fill: fill ? { tokens: [3, 4], radius: 0.09, stem: 1 } : undefined });
  if (specialty === "grain") {
    for (let i = 0; i < 3; i++) sack(s, [-1.14 + i * 0.54, 0, -0.78], [0.46, 0.44, 0.72 + (i % 2) * 0.17], 4, 1, { seed: seed + i, lean: 0.035 });
    storedCrate(1.10, 0);
    for (let i = 0; i < 8; i++) {
      const x = 0.98 + (i % 4) * 0.08, z = -0.87 + Math.floor(i / 4) * 0.12;
      rope(s, [[x, 0.10, z], [x + (i - 4) * 0.025, 1.23, z]], 0.014, 4);
      s.addLoft([{ p: [x + (i - 4) * 0.025, 1.15, z], w: 0.045, h: 0.038 }, { p: [x + (i - 4) * 0.03, 1.42, z], w: 0.012, h: 0.012 }],
        { sides: 5, ref: [1, 0, 0], capStart: 0.15, capEnd: 0.1, token: 4 });
    }
  } else if (specialty === "timber") {
    // Stickered planks and barked rounds, all resting on two bearers.
    for (const x of [-1.1, 1.1]) beam([x, 0.1, -1], [x, 0.1, -0.44], [0.11, 0.1], 1);
    for (let row = 0; row < 4; row++) for (const z of [-0.9, -0.60])
      timber(s, [-1.42 + (row % 2) * 0.05, 0.25 + row * 0.18, z], [1.42, 0.25 + row * 0.18, z], [0.13, 0.065], 0, { shade: 0.88 + row * 0.035 });
    for (const x of [-0.90, 0.85]) rope(s, [[x, 0.2, -1.05], [x, 0.89, -1.05], [x, 0.89, -0.44], [x, 0.2, -0.44]], 0.022, 4);
  } else if (specialty === "marsh") {
    storedCrate(-1.1, 0);
    sack(s, [-0.32, 0, -0.78], [0.46, 0.46, 0.7], 2, 4, { seed });
    for (let i = 0; i < 9; i++) rope(s, [[0.52 + i * 0.07, 0.05, -0.82], [0.42 + i * 0.075, 1.58 + (i % 3) * 0.09, -0.85]], 0.032, 4, { sides: 5 });
    for (const y of [0.35, 1.0]) beam([0.46, y, -0.74], [1.12, y, -0.74], [0.035, 0.025], 1);
    net(s, (u, v) => new THREE.Vector3(-1.67, 2.32 - v * 1.1, -0.95 + u * 1.26), [4, 4], 4, 0.02);
  } else if (specialty === "ore") {
    storedCrate(-1.1, 0);
    for (let i = 0; i < 5; i++) s.addHull(Array.from({ length: 8 }, (_, k): V3 => [
      -1.25 + (i % 2) * 0.26 + Math.cos(k * 2.4) * 0.17,
      0.26 + Math.floor(i / 2) * 0.10 + (k % 3) * 0.08,
      -0.83 + Math.sin(k * 2.4) * 0.20]), { token: 4, shade: 0.85 + i * 0.03 });
    for (const x of [0.12, 1.16]) beam([x, 0.12, -1], [x, 0.12, -0.51], [0.07, 0.12], 1);
    for (let i = 0; i < 3; i++) for (const z of [-0.94, -0.68]) beam([0.04, 0.29 + i * 0.16, z], [1.22, 0.29 + i * 0.16, z], [0.105, 0.065], 4);
    // A hanging balance identifies the mountain weighing service.
    beam([1.18, 1.10, 0.2], [1.18, 1.76, 0.2], [0.025, 0.025], 5);
    beam([0.86, 1.74, 0.2], [1.50, 1.74, 0.2], [0.022, 0.018], 5);
    for (const x of [0.89, 1.47]) {
      for (const dx of [-0.1, 0.1]) rope(s, [[x, 1.74, 0.2], [x + dx, 1.42, 0.2]], 0.01, 5);
      beam([x - 0.13, 1.40, 0.2], [x + 0.13, 1.40, 0.2], [0.1, 0.015], 5);
    }
  } else {
    storedCrate(-1.1, 0, true); storedCrate(-1.08, 0.52, true); storedCrate(0.0, 0, true);
    sack(s, [1.12, 0, -0.8], [0.49, 0.48, 0.71], 4, 1, { seed, lean: -0.07 });
  }
  // Broad raised trade emblems stay readable when the canopy hides the stores.
  for (const x of [-0.53, 0.53]) rope(s, [[x, 2.58, 1.18], [x, 2.25, 1.18]], 0.018, 4);
  beam([-0.7, 2.19, 1.2], [0.7, 2.19, 1.2], [0.07, 0.2], 3);
  if (specialty === "grain" || specialty === "marsh") {
    for (const x of [-0.18, 0, 0.18]) {
      beam([x * 0.45, 2.035, 1.30], [x, 2.29, 1.30], [0.019, 0.019], 2);
      if (specialty === "grain") for (const side of [-1, 1])
        beam([x, 2.22, 1.30], [x + side * 0.065, 2.30, 1.30], [0.026, 0.026], 2);
      else beam([x, 2.23, 1.30], [x, 2.34, 1.30], [0.033, 0.033], 4);
    }
  } else if (specialty === "timber") {
    beam([-0.24, 2.07, 1.30], [0.24, 2.31, 1.30], [0.042, 0.045], 2);
    beam([-0.24, 2.31, 1.32], [0.24, 2.07, 1.32], [0.042, 0.045], 2);
  } else if (specialty === "ore") {
    for (const x of [-0.16, 0.16]) beam([x - 0.11, 2.09, 1.31], [x + 0.11, 2.09, 1.31], [0.035, 0.046], 2);
    beam([-0.11, 2.24, 1.31], [0.11, 2.24, 1.31], [0.035, 0.046], 2);
  } else {
    s.addLoft([{ p: [0, 2.065, 1.31], w: 0.06, h: 0.025 }, { p: [0, 2.15, 1.31], w: 0.14, h: 0.035 },
      { p: [0, 2.28, 1.31], w: 0.11, h: 0.03 }], { sides: 10, ref: [0, 0, 1], capStart: 0.2, capEnd: 0, token: 2 });
    beam([0, 2.28, 1.31], [0.06, 2.36, 1.31], [0.018, 0.018], 4);
  }
  root.add(s.buildMesh(`${id}_workyard`));
  addMarker(`${id}_work_surface`, [0, 1.1, 0.76], "socket", root);
  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}
