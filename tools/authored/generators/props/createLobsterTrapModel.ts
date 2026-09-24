import * as THREE from "three";

import { SurfaceBuilder, mulberry32, type AuthoredModel, type GeneratorContext, type Station } from "../../kit";
import { catenary, net, rope, timber, v3 } from "./parts";

// Catalog palette order: weathered laths, dark iron and ballast, teal netting and rope.
const TOKENS = ["wood_weathered_01", "metal_dark_01", "accent_teal_01"] as const;
const WOOD = 0;
const IRON = 1;
const NET = 2;

/**
 * Lobster pot, glTF space: +Y up, ground-centred, its length along X, metres.
 *
 * Redesigned from the Blender pot: a slatted base on two skids carries bent-wood hoops, and `ribs`
 * laths run over them with daylight between, so the cage reads as board-thick timber; the D-shaped
 * ends are netted, one of them drawn into a funnel entrance; a hatch with a latch sits in the top;
 * a rope bridle with a lift loop arches over it; two ballast bricks are lashed to the base.
 */
export function createLobsterTrapModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const p = context.parameters;
  const random = mulberry32(context.seed);
  const length = Number(p.length ?? 1);
  const laths = Math.max(4, Math.round(Number(p.ribs ?? 7)));
  const meshCols = Math.max(2, Math.round(Number(p.netColumns ?? 4)));
  const meshRows = Math.max(2, Math.round(Number(p.netRows ?? 3)));

  const root = new THREE.Group();
  root.name = `${ID}_root`;
  const surface = new SurfaceBuilder(TOKENS);
  const half = length / 2;
  const radius = 0.28;
  const floorY = 0.1;
  const hoop = (angle: number, r = radius): [number, number] => [Math.cos(angle) * r, floorY + Math.sin(angle) * r];

  // Skids and the slatted base.
  for (const z of [-0.2, 0.2]) {
    timber(surface, [-half - 0.08, 0.035, z], [half + 0.08, 0.035, z], [0.04, 0.035], WOOD, { ref: [0, 1, 0], shade: 0.85 });
  }
  for (let k = 0; k < 5; k += 1) {
    const z = -radius + 0.06 + ((2 * radius - 0.12) / 4) * k;
    timber(surface, [-half, floorY - 0.02, z], [half, floorY - 0.02, z], [0.045, 0.014], WOOD, { ref: [0, 1, 0], shade: 0.88 + random() * 0.12 });
  }
  // Bent-wood hoops.
  const hoops = [-half + 0.03, -half / 3, half / 3, half - 0.03];
  for (const x of hoops) {
    const arc: Station[] = Array.from({ length: 11 }, (_, i) => {
      const [z, y] = hoop((i / 10) * Math.PI);
      return { p: [x, y, z], w: 0.022, h: 0.016 };
    });
    surface.addLoft(arc, { sides: 4, phase: Math.PI / 4, ref: [1, 0, 0], capStart: 0, capEnd: 0, flat: true, token: WOOD, shade: 0.82 });
  }
  // Laths over the hoops, leaving the top hatch open.
  for (let k = 0; k < laths; k += 1) {
    const angle = (0.08 + (0.84 * k) / (laths - 1)) * Math.PI;
    const [z, y] = hoop(angle, radius + 0.022);
    const normal = new THREE.Vector3(0, Math.sin(angle), Math.cos(angle));
    const middle = Math.abs(angle - Math.PI / 2) < 0.2;
    const segments: Array<readonly [number, number]> = middle ? [[-half - 0.02, -0.2], [0.2, half + 0.02]] : [[-half - 0.02, half + 0.02]];
    for (const [x0, x1] of segments) {
      timber(surface, [x0, y, z], [x1, y, z], [0.03, 0.011], WOOD, { ref: v3(normal), shade: 0.86 + random() * 0.16, bevel: 0.005 });
    }
  }
  // Hatch between the middle laths, with a latch.
  const [hz, hy] = hoop(Math.PI / 2, radius + 0.04);
  for (const x of [-0.14, 0, 0.14]) {
    timber(surface, [x, hy, hz - 0.1], [x, hy, hz + 0.1], [0.055, 0.012], WOOD, { ref: [0, 1, 0], shade: 0.95 });
  }
  timber(surface, [0.22, hy + 0.012, hz - 0.02], [0.3, hy + 0.012, hz - 0.02], [0.02, 0.008], IRON, { ref: [0, 1, 0] });

  // Netted ends; the +X end draws in to a funnel entrance.
  const endNet = (x: number, funnel: boolean): void => {
    net(surface, (u, v) => {
      const angle = u * Math.PI;
      const r = radius * (funnel ? 1 - 0.7 * v : v);
      const [z, y] = hoop(angle, r * 0.97);
      return new THREE.Vector3(x - (funnel ? v * length * 0.3 : 0), funnel ? y + v * 0.06 : y, z);
    }, [meshCols, meshRows], NET, 0.01);
  };
  endNet(-half + 0.02, false);
  endNet(half - 0.02, true);
  rope(surface, Array.from({ length: 13 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return new THREE.Vector3(half - 0.02 - length * 0.3, floorY + 0.06 + Math.sin(a) * radius * 0.3, Math.cos(a) * radius * 0.3);
  }), 0.012, NET, { sides: 4, caps: false });

  // Bridle and lift loop.
  const ridge = floorY + radius + 0.06;
  rope(surface, catenary([-half * 0.8, ridge - 0.02, 0], [half * 0.8, ridge - 0.02, 0], -0.12, 10), 0.012, NET, { sides: 5 });
  rope(surface, Array.from({ length: 11 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    return new THREE.Vector3(Math.sin(a) * 0.05, ridge + 0.16 + Math.cos(a) * 0.06, 0);
  }), 0.01, NET, { sides: 4, caps: false });
  // Ballast bricks lashed to the base.
  for (const x of [-half * 0.6, half * 0.6]) {
    timber(surface, [x - 0.1, floorY + 0.03, -0.05], [x + 0.1, floorY + 0.03, -0.05], [0.07, 0.035], IRON, { ref: [0, 1, 0], bevel: 0.01, shade: 0.9 });
    rope(surface, Array.from({ length: 9 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return new THREE.Vector3(x + Math.sin(a) * 0.004, floorY + 0.03 + Math.cos(a) * 0.045, -0.05 + Math.sin(a) * 0.08);
    }), 0.007, NET, { sides: 4, caps: false });
  }

  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}
