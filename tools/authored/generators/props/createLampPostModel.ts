import * as THREE from "three";

import { SurfaceBuilder, type AuthoredModel, type GeneratorContext, type Station } from "../../kit";
import { rope, timber, v3 } from "./parts";

// Catalog palette order: dark timber, brass, lantern glow.
const TOKENS = ["wood_dark_01", "metal_brass_01", "emissive_lantern_01"] as const;
const WOOD = 0;
const BRASS = 1;
const GLOW = 2;

/**
 * Street lamp post, glTF space: +Y up, ground-centred, the arm reaching along +X, metres.
 *
 * Redesigned from the Blender post: a chamfered square post rises from a stepped plinth through
 * brass collars to a turned finial; a timber arm with a brass scroll bracket reaches out and hangs
 * the lantern from a hook and two chain links; the lantern is a brass tray, four corner posts and a
 * pyramid hood with an overhang and a ring, round glowing panes and a brighter flame core, so it
 * reads as a lantern lit from inside rather than a glowing box.
 */
export function createLampPostModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const p = context.parameters;
  const height = Number(p.height ?? 3.4);
  const arm = Number(p.armLength ?? 0.55);

  const root = new THREE.Group();
  root.name = `${ID}_root`;
  const surface = new SurfaceBuilder(TOKENS);

  // Stepped plinth and the post.
  timber(surface, [0, 0, 0], [0, 0.16, 0], [0.22, 0.22], WOOD, { ref: [0, 0, 1], bevel: 0.03, shade: 0.9 });
  timber(surface, [0, 0.16, 0], [0, 0.3, 0], [0.16, 0.16], WOOD, { ref: [0, 0, 1], bevel: 0.025 });
  timber(surface, [0, 0.3, 0], [0, height, 0], [0.09, 0.09], WOOD, { ref: [0, 0, 1], halfEnd: [0.07, 0.07], bevel: 0.02 });
  for (const y of [0.34, height * 0.82]) {
    surface.addLoft([
      { p: [0, y - 0.03, 0], w: 0.12, h: 0.12 }, { p: [0, y + 0.03, 0], w: 0.12, h: 0.12 }
    ], { sides: 4, phase: Math.PI / 4, ref: [0, 0, 1], capStart: 0, capEnd: 0, flat: true, token: BRASS });
  }
  surface.addLoft(([[height, 0.1], [height + 0.04, 0.1], [height + 0.08, 0.05], [height + 0.14, 0.065], [height + 0.2, 0.02]] as const)
    .map(([y, r]): Station => ({ p: [0, y, 0], w: r, h: r })), { sides: 8, ref: [0, 0, 1], capStart: 0, capEnd: 0.5, token: BRASS });

  // Arm with a scroll bracket beneath.
  const armY = height * 0.88;
  timber(surface, [0, armY, 0], [arm + 0.08, armY, 0], [0.05, 0.045], WOOD, { ref: [0, 1, 0], halfEnd: [0.04, 0.035], bevel: 0.01 });
  const scroll = Array.from({ length: 14 }, (_, i) => {
    const t = i / 13;
    const a = t * Math.PI * 1.6;
    const r = 0.26 * (1 - t * 0.7);
    return new THREE.Vector3(0.08 + Math.sin(a) * r * 1.3, armY - 0.05 - (1 - Math.cos(a)) * r * 0.5, 0);
  });
  rope(surface, scroll, 0.014, BRASS, { sides: 5 });
  rope(surface, [[0.08, armY - 0.36, 0], [0.08, armY - 0.05, 0]], 0.014, BRASS, { sides: 5 });

  // Hook and two chain links.
  const hangX = arm;
  rope(surface, [[hangX, armY - 0.04, 0], [hangX, armY - 0.11, 0], [hangX + 0.03, armY - 0.13, 0]], 0.009, BRASS, { sides: 4 });
  for (let k = 0; k < 2; k += 1) {
    const cy = armY - 0.16 - k * 0.06;
    rope(surface, Array.from({ length: 9 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return k % 2 ? new THREE.Vector3(hangX, cy + Math.cos(a) * 0.035, Math.sin(a) * 0.02) : new THREE.Vector3(hangX + Math.sin(a) * 0.02, cy + Math.cos(a) * 0.035, 0);
    }), 0.006, BRASS, { sides: 4, caps: false });
  }

  // Lantern.
  const top = armY - 0.26;
  const bottom = top - 0.5;
  const half = 0.15;
  const at = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(hangX + x, y, z);
  timber(surface, at(0, bottom, 0), at(0, bottom + 0.05, 0), [half + 0.03, half + 0.03], BRASS, { ref: [0, 0, 1], bevel: 0.012 });
  surface.addLoft([{ p: v3(at(0, bottom - 0.08, 0)), w: 0.02, h: 0.02 }, { p: v3(at(0, bottom, 0)), w: 0.08, h: 0.08 }],
    { sides: 8, ref: [0, 0, 1], capStart: 0.4, token: BRASS, shade: 0.9 });
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    timber(surface, at(x * half, bottom + 0.05, z * half), at(x * half, top - 0.05, z * half), [0.016, 0.016], BRASS, { ref: [0, 0, 1], bevel: 0.004 });
  }
  // Panes on all four faces, and the flame core within.
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const c = at(nx * (half - 0.004), (top + bottom) / 2, nz * (half - 0.004));
    timber(surface, c.clone().setY(bottom + 0.06), c.clone().setY(top - 0.06), [nx === 0 ? half - 0.016 : 0.006, nx === 0 ? 0.006 : half - 0.016], GLOW,
      { ref: [0, 0, 1], bevel: 0.002, shade: 0.9 });
  }
  surface.addEllipsoid(v3(at(0, (top + bottom) / 2 - 0.02, 0)), [0.05, 0.1, 0.05], { token: GLOW, sides: 6, shade: 1.04 });
  // Hood: brim, pyramid, ring.
  timber(surface, at(0, top - 0.05, 0), at(0, top, 0), [half + 0.05, half + 0.05], BRASS, { ref: [0, 0, 1], bevel: 0.01 });
  surface.addLoft([
    { p: v3(at(0, top, 0)), w: (half + 0.06) * Math.SQRT2, h: (half + 0.06) * Math.SQRT2 },
    { p: v3(at(0, top + 0.02, 0)), w: (half + 0.06) * Math.SQRT2, h: (half + 0.06) * Math.SQRT2 }
  ], { sides: 4, phase: Math.PI / 4, ref: [0, 0, 1], capStart: 0, capEnd: 0.55, flat: true, token: BRASS, shade: 1.02 });
  rope(surface, Array.from({ length: 9 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return at(Math.sin(a) * 0.035, top + 0.16 + Math.cos(a) * 0.035, 0);
  }), 0.008, BRASS, { sides: 4, caps: false });

  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}
