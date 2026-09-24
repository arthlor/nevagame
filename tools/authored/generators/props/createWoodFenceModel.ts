import * as THREE from "three";

import {
  SurfaceBuilder, addCollisionMarkers, mulberry32,
  type AuthoredModel, type FaceContext, type GeneratorContext, type V3
} from "../../kit";

// Catalog palette order: weathered rails and gate leaf, dark posts, pegs and ironwork.
const TOKENS = ["wood_weathered_01", "wood_dark_01"] as const;
const RAIL = 0;
const DARK = 1;

/** Post top (below the cap) and square half-size, for a fence bay and for gate posts. */
const FENCE_POST = { top: 1.0, half: 0.082 };
const GATE_POST = { top: 1.18, half: 0.096 };
const POST_FOOT = -0.04;
/** Gap under the gate leaf, so daylight shows above the dirt. */
const LEAF_FOOT = 0.12;
/** The leaf stands ajar, swung back about its hinge line: a gate, not another fence bay. */
const LEAF_AJAR = THREE.MathUtils.degToRad(12);

/**
 * Post-and-rail fence bay or farm gate, glTF space: +Y up, the run along X, ground-centred, metres.
 *
 * Redesigned from the Blender fence, whose rails were rows of floating face blocks and whose gate
 * was a solid slab. Chamfered square posts carry a cap plate and a low pyramid that break the top
 * line; the rails are mortised through the post centres, so a bay reads the same from both sides and
 * bays placed end to end share their end posts cleanly (the end posts are plumb and identical for
 * that reason; only the inner posts lean). Each rail plank sits a little crooked with its own tone,
 * the controlled asymmetry the art bible asks of a fence.
 *
 * With `hasGate` the first bay becomes a braced five-bar style leaf hung on strap hinges and left
 * ajar: stiles, `rails` bars, and a diagonal brace board from the hinge foot to the latch head, with
 * daylight between every member and a gap under the leaf.
 */
export function createWoodFenceModel(context: GeneratorContext): AuthoredModel {
  const { spec } = context;
  const ID = spec.id;
  const length = Number(context.parameters.length ?? 2);
  const posts = Math.max(2, Math.round(Number(context.parameters.posts ?? 3)));
  const rails = Math.max(1, Math.round(Number(context.parameters.rails ?? 2)));
  const hasGate = context.parameters.hasGate === true;
  const random = mulberry32(context.seed);
  const jitter = (amount: number): number => (random() * 2 - 1) * amount;

  const root = new THREE.Group();
  root.name = `${ID}_root`;
  const surface = new SurfaceBuilder(TOKENS);
  const bay = length / (posts - 1);
  const postX = Array.from({ length: posts }, (_, index) => -length / 2 + index * bay);
  const post = hasGate ? GATE_POST : FENCE_POST;

  // Posts: damp and darker at the foot, the cap's top faces catching the light.
  const postShade = ({ centroid, normal }: FaceContext): number =>
    normal.y > 0.3 ? 1.03 : centroid.y < 0.14 ? 0.8 : 0.95;
  postX.forEach((x, index) => {
    const inner = index > 0 && index < posts - 1;
    const lean = inner ? jitter(0.025) : 0;
    const top = post.top + (inner ? jitter(0.02) : 0);
    const head: V3 = [x + lean, top, lean * 0.4];
    surface.addBox([x, POST_FOOT, 0], head, [post.half, post.half], {
      ref: [0, 0, 1], bevel: post.half * 0.22, token: DARK, shade: postShade
    });
    // Cap plate and low pyramid, one loft: the plate's overhang throws a crisp shadow line.
    const plate = post.half * 1.38 * Math.SQRT2;
    const rise = post.half * 1.5;
    surface.addLoft([
      { p: [head[0], top, head[2]], w: plate, h: plate },
      { p: [head[0], top + post.half * 0.42, head[2]], w: plate, h: plate }
    ], {
      sides: 4, phase: Math.PI / 4, ref: [0, 0, 1], capStart: 0, capEnd: rise / plate, flat: true,
      token: DARK, shade: postShade
    });
  });

  // Rails: one hewn plank per bay and rail, mortised through the post centres, each a little
  // crooked and tapered, with its own tone.
  const railY = (index: number): number => (rails === 1 ? 0.6 : 0.34 + (index * 0.48) / (rails - 1));
  const firstBay = hasGate ? 1 : 0;
  for (let b = firstBay; b < posts - 1; b += 1) {
    for (let r = 0; r < rails; r += 1) {
      const y = railY(r);
      const swap = random() < 0.5;
      const thick: [number, number] = [0.034, 0.074];
      const thin: [number, number] = [0.03, 0.062];
      surface.addBox([postX[b], y + jitter(0.02), 0], [postX[b + 1], y + jitter(0.02), 0], swap ? thick : thin, {
        ref: [0, 1, 0], bevel: 0.014, token: RAIL, shade: 0.88 + random() * 0.14, halfEnd: swap ? thin : thick
      });
    }
  }
  // Square treenail heads where each rail passes through a post, front and back.
  for (let index = 0; index < posts; index += 1) {
    const bays = [index - 1, index].filter((b) => b >= firstBay && b < posts - 1);
    if (!bays.length) continue;
    for (let r = 0; r < rails; r += 1) {
      for (const face of [-1, 1]) {
        const z = face * post.half;
        surface.addBox([postX[index], railY(r), z], [postX[index], railY(r), z + face * 0.014], [0.017, 0.017], {
          ref: [0, 1, 0], token: DARK, shade: 0.9
        });
      }
    }
  }

  if (hasGate) addGateLeaf(surface, postX[0], postX[1], rails, jitter, random);

  root.add(surface.buildMesh(`${ID}_mesh`));
  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}

/**
 * The gate leaf between two posts, hung on the first. Built in leaf coordinates (u along the leaf
 * from the hinge line, y up, d through its thickness) and swung ajar about the hinge line.
 */
function addGateLeaf(
  surface: SurfaceBuilder, hingePostX: number, latchPostX: number, bars: number,
  jitter: (amount: number) => number, random: () => number
): void {
  const hingeX = hingePostX + GATE_POST.half + 0.015;
  const span = latchPostX - GATE_POST.half - 0.035 - hingeX;
  const along = new THREE.Vector3(Math.cos(LEAF_AJAR), 0, -Math.sin(LEAF_AJAR));
  const normal = new THREE.Vector3(Math.sin(LEAF_AJAR), 0, Math.cos(LEAF_AJAR));
  const at = (u: number, y: number, d = 0): V3 => {
    const p = new THREE.Vector3(hingeX, y, 0).addScaledVector(along, u).addScaledVector(normal, d);
    return [p.x, p.y, p.z];
  };
  const leafRef: V3 = [normal.x, normal.y, normal.z];
  const top = GATE_POST.top - 0.12;
  const stile = 0.05;

  // Stiles: the hinge stile is the heavier of the two, as it carries the leaf.
  surface.addBox(at(stile, LEAF_FOOT), at(stile, top + 0.03), [0.03, stile], { ref: leafRef, bevel: 0.01, token: RAIL, shade: 0.94 });
  surface.addBox(at(span - 0.038, LEAF_FOOT + 0.02), at(span - 0.038, top), [0.028, 0.038], { ref: leafRef, bevel: 0.01, token: RAIL, shade: 0.9 });

  // Bars, evenly spaced; the top bar is the heaviest, a hand rail you would lean on.
  const barY = (index: number): number => LEAF_FOOT + 0.07 + (index * (top - LEAF_FOOT - 0.1)) / Math.max(1, bars - 1);
  for (let index = 0; index < bars; index += 1) {
    const heavy = index === bars - 1;
    const y = barY(index) - (heavy ? 0.01 : 0);
    surface.addBox(at(0.01, y), at(span, y + jitter(0.01)), heavy ? [0.036, 0.058] : [0.028, 0.046], {
      ref: [0, 1, 0], bevel: 0.01, token: RAIL, shade: 0.88 + random() * 0.14
    });
  }
  // Brace board on the front face, from the hinge foot up to the latch head: a separate board.
  const braceFrom = at(stile + 0.05, barY(0), -0.058);
  const braceTo = at(span - 0.09, barY(bars - 1) - 0.02, -0.058);
  surface.addBox(braceFrom, braceTo, [0.02, 0.052], { ref: leafRef, bevel: 0.01, token: RAIL, shade: 0.82 });

  // Strap hinges on the top and bottom bars, with pintle blocks on the post.
  for (const index of [0, bars - 1]) {
    const y = barY(index) - (index === bars - 1 ? 0.01 : 0);
    surface.addBox(at(-0.01, y, -0.034), at(0.34, y, -0.034), [0.005, 0.02], { ref: leafRef, token: DARK, shade: 0.85 });
    surface.addBox([hingePostX + GATE_POST.half - 0.01, y, -0.03], [hingeX + 0.005, y, -0.03], [0.02, 0.022], {
      ref: [0, 1, 0], token: DARK, shade: 0.85
    });
  }
  // Latch bar on the latch stile, and its keeper on the latch post.
  const latchY = barY(bars - 1) - 0.12;
  surface.addBox(at(span - 0.2, latchY, -0.036), at(span + 0.01, latchY, -0.036), [0.008, 0.016], { ref: leafRef, token: DARK, shade: 0.85 });
  surface.addBox([latchPostX - GATE_POST.half - 0.012, latchY - 0.05, -0.05], [latchPostX - GATE_POST.half - 0.012, latchY + 0.05, -0.05], [0.014, 0.018], {
    ref: [0, 0, 1], token: DARK, shade: 0.85
  });
}
