import * as THREE from "three";

import { SurfaceBuilder, addCollisionMarkers, mulberry32, type AuthoredModel, type GeneratorContext, type Station } from "../../kit";
import { lumps, rope, v3 } from "./parts";

// Catalog palette order: straw, twine.
const TOKENS = ["accent_ochre_01", "wood_warm_01"] as const;
const STRAW = 0;
const TWINE = 1;

const N = 5;
const SIDES = 16;

/**
 * Stacked hay bales, glTF space: +Y up, ground-centred, the bales' length along Z, metres.
 *
 * Redesigned from the Blender stack of flat boxes with prism spikes: each bale is now a pressed,
 * slightly lumpy block with softened corners and domed cut ends, streaked straw by straw in tone,
 * darker where it meets the ground; `bands` twine loops bind each bale; straw tufts break the top
 * edges and cut ends (`fiberBands` per bale); a few loose stalks lie round the foot. Two bales sit
 * side by side with the third across their seam, turned a little, as a stack is actually thrown up.
 */
export function createHayBaleModel(context: GeneratorContext): AuthoredModel {
  const { spec } = context;
  const ID = spec.id;
  const p = context.parameters;
  const random = mulberry32(context.seed);
  const radius = Number(p.radius ?? 0.58);
  const w = radius * 1.5;
  const h = radius;
  const d = Number(p.length ?? 1.2) * 0.9;
  const bands = Math.max(1, Math.round(Number(p.bands ?? 2)));
  const tufts = Math.round(Number(p.fiberBands ?? 12));

  const root = new THREE.Group();
  root.name = `${ID}_root`;
  const surface = new SurfaceBuilder(TOKENS);

  const bale = (centre: THREE.Vector3, yaw: number, seed: number): void => {
    const turn = (x: number, y: number, z: number): THREE.Vector3 =>
      new THREE.Vector3(x * Math.cos(yaw) + z * Math.sin(yaw), y, -x * Math.sin(yaw) + z * Math.cos(yaw)).add(centre);
    const stations: Station[] = [-0.5, -0.46, -0.25, 0, 0.25, 0.46, 0.5].map((t, i) => {
      const inset = i === 0 || i === 6 ? 0.94 : 1;
      return { p: v3(turn(0, 0, t * d)), w: (w / 2) * inset, h: (h / 2) * inset, n: N };
    });
    surface.addLoft(stations, {
      sides: SIDES, ref: [0, 1, 0], capStart: 0.12, capEnd: 0.12, radial: lumps(seed, 0.035),
      token: STRAW,
      // Straw streaks: every face its own tone, the cut ends lighter.
      shade: ({ u }) => (u < 0 || u > 6 ? 1.02 : 0.86 + random() * 0.16),
      tone: (q) => 0.84 + 0.16 * THREE.MathUtils.clamp((q.y - centre.y + h / 2) / (h * 0.5), 0, 1)
    });
    // Twine loops, sitting proud of the straw.
    for (let b = 0; b < bands; b += 1) {
      const z = bands === 1 ? 0 : (-0.24 + (0.48 * b) / (bands - 1)) * d;
      const loop: Station[] = Array.from({ length: 21 }, (_, k) => {
        const a = (k / 20) * Math.PI * 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const x = Math.sign(c) * Math.abs(c) ** (2 / N) * (w / 2 + 0.012);
        const y = Math.sign(s) * Math.abs(s) ** (2 / N) * (h / 2 + 0.012);
        return { p: v3(turn(x, y, z)), w: 0.011, h: 0.011 };
      });
      surface.addLoft(loop, { sides: 4, ref: v3(turn(0, 0, 1).sub(centre)), token: TWINE, shade: 0.9 });
    }
    // Tufts along the top edges and out of the cut ends.
    for (let t = 0; t < tufts; t += 1) {
      const onEnd = t % 3 === 2;
      const side = random() < 0.5 ? -1 : 1;
      const along = (random() - 0.5) * d * 0.9;
      const base = onEnd
        ? turn((random() - 0.5) * w * 0.7, (random() - 0.2) * h * 0.6, side * d * 0.5)
        : turn(side * w * 0.46, h * 0.44, along);
      const out = onEnd ? turn(0, 0.2, side).sub(centre).normalize() : turn(side, 0.9, 0).sub(centre).normalize();
      out.add(new THREE.Vector3((random() - 0.5) * 0.6, (random() - 0.5) * 0.4, (random() - 0.5) * 0.6)).normalize();
      const length = 0.06 + random() * 0.07;
      for (let k = 0; k < 3; k += 1) {
        const spread = new THREE.Vector3((random() - 0.5) * 0.5, (random() - 0.5) * 0.3, (random() - 0.5) * 0.5);
        rope(surface, [base, base.clone().addScaledVector(out.clone().add(spread).normalize(), length)], 0.007, STRAW, {
          sides: 3, taper: [1, 0.15], shade: 1.02
        });
      }
    }
  };

  const gap = 0.012;
  bale(new THREE.Vector3(-(w / 2 + gap), h / 2, 0.02), 0.02, 1);
  bale(new THREE.Vector3(w / 2 + gap, h / 2, -0.03), -0.03, 2);
  bale(new THREE.Vector3(0.04, h * 1.5 + 0.005, 0.03), 0.09, 3);

  // Loose stalks round the foot.
  for (let k = 0; k < 9; k += 1) {
    const a = k * 0.9 + random() * 0.4;
    const r = w * (1.02 + random() * 0.15);
    const from = new THREE.Vector3(Math.cos(a) * r, 0.006, Math.sin(a) * d * 0.45);
    const dir = new THREE.Vector3(Math.cos(a + 1.3 + random()), 0, Math.sin(a + 1.3 + random()));
    rope(surface, [from, from.clone().addScaledVector(dir, 0.14 + random() * 0.1)] as ReadonlyArray<THREE.Vector3>, 0.006, STRAW, { sides: 3 });
  }

  root.add(surface.buildMesh(`${ID}_mesh`));
  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}

