import * as THREE from "three";

import { SurfaceBuilder, mulberry32, type AuthoredModel, type GeneratorContext } from "../../kit";
import { fruit, rope } from "../props/parts";

// Catalog palette order: wicker, dark willow for the base and braids, red apples.
const TOKENS = ["wood_honey_01", "wood_dark_01", "accent_red_01"] as const;
const WICKER = 0;
const WILLOW = 1;
const APPLE = 2;

const BASE_R = 0.27;
const RIM_R = 0.35;
const RIM_Y = 0.46;

/**
 * Harvest basket, glTF space: standing on its base at the origin, +Y up. The origin matches the
 * Blender basket because the runtime holds it there (it has no grip marker).
 *
 * Redesigned from the Blender basket's rods and rings: a flared wicker wall with a real over-under
 * weave and both faces, so the inside reads as basket too; a twisted braid round the rim and over
 * the arched handle; and a heap of red apples crowning the top.
 */
export function createHarvestBasketModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  const surface = new SurfaceBuilder(TOKENS);

  surface.addLoft([
    { p: [0, 0, 0], w: BASE_R - 0.02, h: BASE_R - 0.02 },
    { p: [0, 0.035, 0], w: BASE_R, h: BASE_R }
  ], { sides: 20, ref: [0, 0, 1], capStart: 0, capEnd: 0, token: WILLOW, shade: 0.9 });
  const cols = 24;
  const rows = 8;
  surface.addPanel({
    cols, rows, thickness: 0.022,
    point: (u, v) => {
      const a = u * Math.PI * 2;
      const r = THREE.MathUtils.lerp(BASE_R, RIM_R, v ** 0.9);
      return new THREE.Vector3(Math.cos(a) * r, THREE.MathUtils.lerp(0.03, RIM_Y, v), Math.sin(a) * r);
    },
    token: () => WICKER,
    // Over-under weave: each strand passes in front of one stake and behind the next.
    shade: (u, v) => ((Math.floor(u * cols) + Math.floor(v * rows)) % 2 ? 0.84 : 1.03),
    tone: (_, v) => 0.9 + 0.1 * v
  });

  // Twisted braid: two strands wound round a path, half a turn apart.
  const braid = (path: (t: number) => THREE.Vector3, normal: (t: number) => THREE.Vector3, twists: number, samples: number): void => {
    for (const phase of [0, Math.PI]) {
      rope(surface, Array.from({ length: samples + 1 }, (_, i) => {
        const t = i / samples;
        const angle = t * twists * Math.PI * 2 + phase;
        const n = normal(t);
        const tangent = path(Math.min(1, t + 0.001)).sub(path(Math.max(0, t - 0.001))).normalize();
        const b = new THREE.Vector3().crossVectors(tangent, n);
        return path(t).addScaledVector(n, Math.cos(angle) * 0.011).addScaledVector(b, Math.sin(angle) * 0.011);
      }), 0.011, WILLOW, { sides: 4, caps: false });
    }
  };
  braid(
    (t) => new THREE.Vector3(Math.cos(t * Math.PI * 2) * (RIM_R + 0.004), RIM_Y + 0.008, Math.sin(t * Math.PI * 2) * (RIM_R + 0.004)),
    (t) => new THREE.Vector3(Math.cos(t * Math.PI * 2), 0, Math.sin(t * Math.PI * 2)), 14, 48
  );
  braid(
    (t) => new THREE.Vector3(Math.cos(t * Math.PI) * RIM_R, RIM_Y + Math.sin(t * Math.PI) * 0.42, 0),
    () => new THREE.Vector3(0, 0, 1), 6, 26
  );

  // Apples heaped to a crown.
  const apples: Array<readonly [number, number]> = [[0, 0], ...Array.from({ length: 6 }, (_, k) => [k * 1.05 + 0.3, 0.17] as const),
    ...Array.from({ length: 3 }, (_, k) => [k * 2.1 + 0.9, 0.08] as const)];
  apples.forEach(([angle, r], index) => {
    const y = RIM_Y - 0.02 + (0.17 - r) * 0.55 + (index > 6 ? 0.07 : 0);
    fruit(surface, [Math.cos(angle) * r, y, Math.sin(angle) * r], 0.058 + random() * 0.01, APPLE, { stem: WILLOW, shade: 0.92 + random() * 0.1 });
  });

  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}
