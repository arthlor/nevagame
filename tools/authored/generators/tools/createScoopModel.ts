import * as THREE from "three";

import { SurfaceBuilder, addGripMarker, type AuthoredModel, type GeneratorContext, type Station } from "../../kit";
import { rope } from "../props/parts";

// Catalog palette order: turned handle, tinned bowl and ferrule.
const TOKENS = ["wood_honey_01", "metal_iron_01"] as const;
const WOOD = 0;
const IRON = 1;

const BOWL_FROM = 0.41;
const BOWL_TO = 0.64;
const BOWL_R = 0.075;

/**
 * Grain scoop, glTF space, the grip at the origin: the handle along +Y, the bowl at its head (the
 * runtime docks `tool_primary_grip`, whose frame is unchanged from the Blender scoop).
 *
 * Redesigned from the Blender scoop's shallow cup: a real feed scoop, a round tinned barrel closed
 * at the handle end, its mouth cut on a slant with a rolled lip, on a turned handle with an iron
 * ferrule and a strap onto the barrel.
 */
export function createScoopModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  addGripMarker("tool_primary_grip", [0.04, 0, 0], [0, 0, -1], [-1, 0, 0], root);
  const surface = new SurfaceBuilder(TOKENS);

  const turned: ReadonlyArray<readonly [number, number]> = [
    [-0.17, 0.012], [-0.162, 0.032], [-0.145, 0.036], [-0.13, 0.026], [-0.04, 0.03], [0.1, 0.029], [0.25, 0.026], [0.34, 0.024]
  ];
  surface.addLoft(turned.map(([y, r]): Station => ({ p: [0, y, 0], w: r, h: r })), {
    sides: 8, ref: [0, 0, 1], capStart: 0.4, token: WOOD, tone: (p) => 0.9 + 0.1 * Math.cos(p.y * 30) ** 2
  });
  surface.addLoft([
    { p: [0, 0.33, 0], w: 0.029, h: 0.029 },
    { p: [0, 0.34, 0], w: 0.033, h: 0.033 },
    { p: [0, 0.39, 0], w: 0.033, h: 0.033 },
    { p: [0, 0.4, 0], w: 0.03, h: 0.03 }
  ], { sides: 8, ref: [0, 0, 1], capEnd: 0, token: IRON, shade: 0.9 });
  // Strap from the ferrule onto the bowl's back, riveted.
  rope(surface, [[0, 0.395, -0.026], [0, BOWL_FROM + 0.05, -BOWL_R - 0.003]], 0.007, IRON, { sides: 4, shade: 0.86 });

  // Cup: a round barrel closed at the handle end, its mouth cut on a slant so it opens forward and
  // up (+Z), the way a feed scoop is shaped to dig. u runs round the barrel, v from back to mouth.
  const mouthAt = (a: number): number => BOWL_TO - 0.11 * (1 + Math.sin(a)) / 2;
  const cup = (u: number, v: number): THREE.Vector3 => {
    const a = u * Math.PI * 2;
    const r = BOWL_R * (1 + 0.08 * v);
    return new THREE.Vector3(Math.cos(a) * r, THREE.MathUtils.lerp(BOWL_FROM, mouthAt(a), v), Math.sin(a) * r);
  };
  surface.addPanel({
    cols: 16, rows: 4, thickness: 0.005, point: cup, token: () => IRON,
    tone: (_, v) => 0.86 + 0.16 * v
  });
  surface.addLoft([
    { p: [0, BOWL_FROM - 0.004, 0], w: BOWL_R * 0.92, h: BOWL_R * 0.92 },
    { p: [0, BOWL_FROM + 0.004, 0], w: BOWL_R, h: BOWL_R }
  ], { sides: 16, ref: [0, 0, 1], capStart: 0.15, capEnd: 0, token: IRON, shade: 0.88 });
  // Rolled lip round the slanted mouth.
  rope(surface, Array.from({ length: 17 }, (_, i) => cup(i / 16, 1)), 0.0055, IRON, { sides: 5, shade: 1.04, caps: false });

  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}
