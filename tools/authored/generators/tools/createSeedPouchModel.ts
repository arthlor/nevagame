import * as THREE from "three";

import { SurfaceBuilder, type AuthoredModel, type GeneratorContext } from "../../kit";
import { catenary, rope, sack, timber } from "../props/parts";

// Catalog palette order: burlap, dark cord and tag.
const TOKENS = ["burlap_grain_01", "wood_dark_01"] as const;
const BURLAP = 0;
const CORD = 1;

/**
 * Seed pouch, glTF space: standing on its base at the origin, +Y up, its face toward +Z. The origin
 * and axes match the Blender pouch because the runtime holds it by them (it has no grip marker).
 *
 * Redesigned from the Blender pouch's box flaps: a plump burlap bag gathered at the neck by a cord
 * with a ruffled mouth, a carrying loop tied through the gather, and a small wooden tally tag hung
 * from the knot.
 */
export function createSeedPouchModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  const surface = new SurfaceBuilder(TOKENS);

  sack(surface, [0, 0, 0], [0.32, 0.2, 0.42], BURLAP, CORD, { seed: context.seed, yaw: -0.1, lean: 0.04 });
  // Carrying loop through the gather.
  rope(surface, catenary([-0.03, 0.36, 0.01], [0.03, 0.36, 0.01], -0.12, 8).map((p, i, all) => {
    const t = i / (all.length - 1);
    return p.add(new THREE.Vector3(Math.sin(t * Math.PI) * 0.02, 0, -0.04 * Math.sin(t * Math.PI)));
  }), 0.008, CORD, { sides: 5 });
  // Knot ends and the tally tag hanging from them.
  rope(surface, [[0.02, 0.36, 0.05], [0.05, 0.3, 0.075], [0.06, 0.25, 0.085]], 0.005, CORD, { sides: 4 });
  timber(surface, [0.06, 0.25, 0.088], [0.066, 0.18, 0.093], [0.028, 0.006], CORD, { ref: [0, 0, 1], shade: 1.04, bevel: 0.004 });

  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}
