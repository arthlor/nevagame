import * as THREE from "three";

import {
  SurfaceBuilder, buildBones, creatureScaffold, namedNode, rotTrack, skinSurface,
  type AuthoredModel, type BoneSpec, type GeneratorContext, type V3
} from "../../kit";

// Catalog palette order: dark body and wing margins, ochre forewings, red hindwings.
const TOKENS = ["wood_dark_01", "accent_ochre_01", "accent_red_01"] as const;
const DARK = 0;
const OCHRE = 1;
const RED = 2;

/**
 * Meadow butterfly, glTF space: +Y up, head toward +Z, metres; the ambient-flyer runtime scales it
 * up about 3.4x. Redesigned from the Blender butterfly, whose wings were four thin lozenges: the
 * forewing is now a rounded triangle swept forward and the hindwing a rounded lobe swept back, each a
 * closed thin panel with a dark outer margin, hinged at the thorax on one wing bone per side. No
 * antennae, per the brief: at gameplay distance they are only noise.
 */
export function createButterflyModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const s = Number(context.parameters.scale ?? 0.45);
  const span = Number(context.parameters.wingSpan ?? 1);
  const at = (x: number, y: number, z: number): V3 => [x * s, y * s, z * s];
  const hingeY = 0.030;

  const { root, motion, rig } = creatureScaffold(ID);
  const bones = buildBones([
    { name: "thorax", head: at(0, 0.024, 0) },
    { name: "wing_left", head: at(-0.012, hingeY, 0), parent: "thorax" },
    { name: "wing_right", head: at(0.012, hingeY, 0), parent: "thorax" }
  ] satisfies BoneSpec[], rig);
  const surface = new SurfaceBuilder(TOKENS);

  // Slim dark body: tapering abdomen, the thorax where the wings hinge, a small head.
  surface.addLoft([
    { p: at(0, 0.022, -0.12), w: 0.006 * s, h: 0.006 * s },
    { p: at(0, 0.023, -0.08), w: 0.013 * s, h: 0.013 * s },
    { p: at(0, 0.024, -0.03), w: 0.017 * s, h: 0.017 * s },
    { p: at(0, 0.025, 0.005), w: 0.024 * s, h: 0.022 * s },
    { p: at(0, 0.025, 0.035), w: 0.019 * s, h: 0.018 * s },
    { p: at(0, 0.025, 0.056), w: 0.016 * s, h: 0.016 * s },
    { p: at(0, 0.025, 0.07), w: 0.007 * s, h: 0.007 * s }
  ], { sides: 6, ref: [0, 1, 0], capStart: 0.6, capEnd: 0.6, bones: { thorax: 1 }, token: DARK });

  /**
   * One wing as a closed panel. Grid u runs root to tip along the span, v from the leading edge to
   * the trailing edge; the last column is the narrow dark margin. `centre(t)` and `half(t)` give the
   * chord centre line and half-chord at span fraction t, which set the outline.
   */
  const wing = (
    sx: number, bone: string, token: number, reach: number,
    centre: (t: number) => number, half: (t: number) => number
  ): void => {
    const spanFraction = (u: number): number => (u < 0.75 ? (u / 0.75) * 0.8 : 0.8 + ((u - 0.75) / 0.25) * 0.2);
    surface.addPanel({
      cols: 4,
      rows: 2,
      thickness: 0.004 * s,
      bones: { [bone]: 1 },
      point: (u, v) => {
        const t = spanFraction(u);
        const x = sx * (0.012 + t * reach * span);
        const z = centre(t) + half(t) * (1 - 2 * v);
        // A gentle dihedral: the wing lifts a little toward the tip.
        return new THREE.Vector3(x * s, (hingeY + 0.006 * t) * s, z * s);
      },
      token: (u) => (u > 0.75 ? DARK : token)
    });
  };

  for (const [side, sx] of [["left", -1], ["right", 1]] as const) {
    const bone = `wing_${side}`;
    // Forewing: swept forward, widest mid-span, rounded at the apex.
    wing(sx, bone, OCHRE, 0.15,
      (t) => 0.012 + 0.030 * t,
      (t) => (0.030 + 0.022 * Math.sin(Math.PI * t * 0.85)) * Math.sqrt(Math.max(0.06, 1 - t ** 6)));
    // Hindwing: a rounded lobe swept back under the forewing.
    wing(sx, bone, RED, 0.11,
      (t) => -0.030 - 0.028 * t,
      (t) => (0.030 + 0.018 * Math.sin(Math.PI * t)) * Math.sqrt(Math.max(0.08, 1 - t ** 4)));
  }

  skinSurface(ID, surface, root, rig, bones);
  namedNode(`${ID}_wing_left_pivot`, at(-0.02, 0.02, 0), motion);
  namedNode(`${ID}_wing_right_pivot`, at(0.02, 0.02, 0), motion);
  return { root, clips: butterflyClips() };
}

function butterflyClips(): THREE.AnimationClip[] {
  // Flap: wing bones only. The wings clap up almost closed over the back, then sweep down past flat.
  // Left wing tips rise with negative Z; the right wing mirrors.
  const beat: Array<readonly [number, number]> = [[0, 0], [0.08, -72], [0.16, 24], [0.24, 0]];
  return [new THREE.AnimationClip("flap", 0.24, [
    rotTrack("wing_left", beat.map(([t, roll]) => [t, 0, 0, roll] as const)),
    rotTrack("wing_right", beat.map(([t, roll]) => [t, 0, 0, -roll] as const))
  ])];
}
