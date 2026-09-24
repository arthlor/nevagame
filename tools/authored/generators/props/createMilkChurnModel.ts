import * as THREE from "three";

import { SurfaceBuilder, type AuthoredModel, type FaceContext, type GeneratorContext, type Station } from "../../kit";

// Catalog palette order: iron body, brass fittings, cream dairy band.
const TOKENS = ["metal_iron_01", "metal_brass_01", "canvas_cream_01"] as const;
const IRON = 0;
const BRASS = 1;
const CREAM = 2;

const SIDES = 12;
const BODY_R = 0.172;
const SHOULDER_Y = 0.47;
const NECK_Y = 0.585;
const NECK_R = 0.086;
const LID_Y = 0.665;
/** The painted dairy band around the belly. */
const BAND: readonly [number, number] = [0.2, 0.265];

/**
 * Dairy milk churn, glTF space: +Y up, ground-centred, metres.
 *
 * Redesigned from the Blender churn, which read as a dark bottle: its body rounded straight into the
 * neck and its bail and lugs vanished against it. The silhouette is now the churn's own: a straight
 * drum on a rolled brass foot, a brass bead where it breaks into a conical shoulder, a short neck
 * and a flanged mushroom lid, with two loop handles standing proud of the shoulder so the outline
 * reads from any side at gameplay distance. The cream band is painted on the drum, not a shell.
 */
export function createMilkChurnModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  const surface = new SurfaceBuilder(TOKENS);
  const ring = (y: number, r: number): Station => ({ p: [0, y, 0], w: r, h: r });

  // Drum: grimier toward the foot, the painted band at the belly.
  const drumToken = ({ centroid }: FaceContext): number =>
    centroid.y > BAND[0] && centroid.y < BAND[1] ? CREAM : IRON;
  const drumShade = ({ centroid }: FaceContext): number => 0.86 + Math.min(1, centroid.y / SHOULDER_Y) * 0.16;
  surface.addLoft([
    ring(0.035, BODY_R - 0.004),
    ring(BAND[0], BODY_R),
    ring(BAND[1], BODY_R),
    ring(SHOULDER_Y, BODY_R - 0.002)
  ], { sides: SIDES, ref: [0, 0, 1], capStart: 0, token: drumToken, shade: drumShade });
  // Conical shoulder into the neck, lit from above, with a slight flare at the neck lip.
  surface.addLoft([
    ring(SHOULDER_Y, BODY_R - 0.002),
    ring(SHOULDER_Y + 0.03, BODY_R - 0.012),
    ring(NECK_Y - 0.015, NECK_R + 0.006),
    ring(NECK_Y, NECK_R),
    ring(LID_Y - 0.012, NECK_R),
    ring(LID_Y, NECK_R + 0.01)
  ], { sides: SIDES, ref: [0, 0, 1], token: IRON, shade: 1.02 });

  // Rolled brass beads: the foot, the shoulder break and the neck collar.
  const bead = (y: number, r: number, half: number): void => {
    surface.addLoft([ring(y - half, r - half * 0.6), ring(y, r + half * 0.35), ring(y + half, r - half * 0.6)], {
      sides: SIDES, ref: [0, 0, 1], capStart: 0, capEnd: 0, token: BRASS
    });
  };
  bead(0.024, BODY_R + 0.008, 0.024);
  bead(SHOULDER_Y, BODY_R + 0.004, 0.014);
  bead(NECK_Y + 0.018, NECK_R + 0.004, 0.011);

  // Flanged mushroom lid with a turned knob.
  surface.addLoft([
    ring(LID_Y, NECK_R + 0.034),
    ring(LID_Y + 0.022, NECK_R + 0.036),
    ring(LID_Y + 0.03, NECK_R + 0.018),
    ring(LID_Y + 0.062, NECK_R - 0.006),
    ring(LID_Y + 0.078, 0.03)
  ], { sides: SIDES, ref: [0, 0, 1], capStart: 0, capEnd: 0, token: BRASS, shade: 1.02 });
  surface.addLoft([ring(LID_Y + 0.076, 0.016), ring(LID_Y + 0.1, 0.02), ring(LID_Y + 0.112, 0.024)], {
    sides: 8, ref: [0, 0, 1], capEnd: 0.4, token: BRASS
  });

  // Loop handles on the shoulder: a flat strap bent out from the churn into a grip, tilted up a
  // little, so each reads as a solid ear in the silhouette rather than a wire.
  for (const side of [-1, 1]) {
    const arc = [-1, -0.7, 0, 0.7, 1].map((t) => {
      const reach = Math.cos((t * Math.PI) / 2);
      return {
        p: [side * (BODY_R - 0.02 + 0.062 * reach), SHOULDER_Y + 0.015 + 0.04 * reach, t * 0.058] as [number, number, number],
        w: 0.009,
        h: 0.016
      };
    });
    surface.addLoft(arc, { sides: 4, phase: Math.PI / 4, ref: [0, 1, 0], capStart: 0, capEnd: 0, flat: true, token: BRASS });
  }

  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}
