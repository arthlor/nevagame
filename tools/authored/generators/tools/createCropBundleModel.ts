import * as THREE from "three";

import { SurfaceBuilder, mulberry32, type AuthoredModel, type GeneratorContext, type Station } from "../../kit";
import { rope, v3 } from "../props/parts";

// Catalog palette order: ripe straw and ears, burlap tie, green leaves.
const TOKENS = ["grass_yellow_01", "burlap_grain_01", "foliage_olive_01"] as const;
const STRAW = 0;
const TIE = 1;
const LEAF = 2;

const STALKS = 18;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/**
 * Sheaf of grain, glTF space: the tie at the origin, the ears up +Y. The origin matches the Blender
 * bundle because the runtime holds it there (it has no grip marker).
 *
 * Redesigned from the Blender bundle's nine rods with triangle leaves: a sheaf with an hourglass
 * silhouette, stalks splaying from the cut ends through a bound waist to a crown of plump, nodding
 * ears, a few green blades still on the stalks, and a burlap band knotted round the waist.
 */
export function createCropBundleModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  const surface = new SurfaceBuilder(TOKENS);

  for (let i = 0; i < STALKS; i += 1) {
    const angle = i * GOLDEN;
    const ring = Math.sqrt((i + 0.5) / STALKS);
    const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const foot = out.clone().multiplyScalar(0.05 + 0.06 * ring).setY(-0.34 + random() * 0.03);
    const waist = out.clone().multiplyScalar(0.018 + 0.022 * ring).setY(0);
    const crown = out.clone().multiplyScalar(0.05 + 0.08 * ring).setY(0.3 + random() * 0.06 - ring * 0.04);
    rope(surface, [foot, waist, crown], 0.009, STRAW, { sides: 3, shade: 0.9 + random() * 0.1 });
    // The ear nods outward from the stalk top.
    const nod = out.clone().multiplyScalar(0.3 + ring * 0.5).setY(1).normalize();
    const earLength = 0.09 + random() * 0.025;
    const ear: Station[] = [0, 0.2, 0.55, 0.85, 1].map((t, k) => {
      const r = [0.008, 0.018, 0.02, 0.015, 0.005][k];
      return { p: v3(crown.clone().addScaledVector(nod, earLength * t).add(new THREE.Vector3(0, -0.01 * t * t, 0))), w: r, h: r * 0.8 };
    });
    surface.addLoft(ear, { sides: 4, ref: [0, 0, 1], capEnd: 0.4, token: STRAW, shade: 1.04, tone: () => 0.95 + random() * 0.05 });
  }

  // Green blades peeling off the stalks below the tie.
  for (let i = 0; i < 5; i += 1) {
    const angle = i * 1.3 + 0.4;
    const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const from = out.clone().multiplyScalar(0.03).setY(-0.06 - i * 0.03);
    surface.addPanel({
      cols: 4, rows: 1, thickness: 0.003,
      point: (u, v) => {
        const along = from.clone().addScaledVector(out, 0.03 + 0.11 * u).add(new THREE.Vector3(0, 0.05 * u - 0.1 * u * u, 0));
        const side = new THREE.Vector3(-out.z, 0, out.x);
        return along.addScaledVector(side, (v - 0.5) * 0.026 * (1 - u * 0.8));
      },
      token: () => LEAF, tone: (u) => 0.85 + 0.15 * u
    });
  }

  // Burlap band knotted round the waist.
  const band = Array.from({ length: 13 }, (_, k) => {
    const a = (k / 12) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * 0.045, -0.015 + 0.008 * Math.sin(a * 2), Math.sin(a) * 0.045);
  });
  surface.addLoft(band.map((p) => ({ p: v3(p), w: 0.01, h: 0.016 })), { sides: 5, ref: [0, 1, 0], token: TIE });
  for (const side of [-1, 1]) {
    rope(surface, [[0.04, -0.01, 0.02], [0.07, -0.01 + side * 0.02, 0.05], [0.055, -0.01 + side * 0.035, 0.07]], 0.007, TIE, { sides: 4 });
  }

  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}
