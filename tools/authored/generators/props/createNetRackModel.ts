import * as THREE from "three";

import { SurfaceBuilder, mulberry32, type AuthoredModel, type GeneratorContext } from "../../kit";
import { catenary, fruit, net, rope, timber } from "./parts";

// Catalog palette order: weathered frame, wet timber and floats, dark iron and buoys, teal net.
const TOKENS = ["wood_weathered_01", "wood_wet_01", "metal_dark_01", "accent_teal_01"] as const;
const WOOD = 0;
const WET = 1;
const DARK = 2;
const NET = 3;

/**
 * Net-drying rack, glTF space: +Y up, ground-centred, the pole along X, metres.
 *
 * Redesigned from the Blender rack's flat lattice card: two splayed A-frame trestles carry a drying
 * pole; the net is thrown over it and hangs down both sides in soft folds, a float line of wooden
 * corks along its hem; buoys hang from the pole on short lines and a coil of rope lies at one foot.
 */
export function createNetRackModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const p = context.parameters;
  const random = mulberry32(context.seed);
  const width = Number(p.width ?? 2.45);
  const depth = Number(p.depth ?? 0.82);
  const height = Number(p.height ?? 2.1);
  const meshCols = Math.max(3, Math.round(Number(p.netColumns ?? 7)));
  const meshRows = Math.max(2, Math.round(Number(p.netRows ?? 5)));
  const buoys = Math.max(0, Math.round(Number(p.buoys ?? 4)));

  const root = new THREE.Group();
  root.name = `${ID}_root`;
  const surface = new SurfaceBuilder(TOKENS);
  const poleY = height * 0.92;
  const ends = [-width / 2, width / 2];

  // A-frame trestles and the pole.
  for (const x of ends) {
    for (const z of [-1, 1]) {
      timber(surface, [x, 0, z * depth / 2], [x, poleY + 0.1, z * 0.02], [0.045, 0.045], WOOD, { bevel: 0.012, shade: 0.9 + random() * 0.1 });
    }
    timber(surface, [x, poleY * 0.35, -depth * 0.33], [x, poleY * 0.35, depth * 0.33], [0.03, 0.035], WOOD, { ref: [0, 1, 0] });
  }
  timber(surface, [-width / 2 - 0.15, poleY, 0], [width / 2 + 0.15, poleY, 0], [0.045, 0.045], WET, { ref: [0, 1, 0], bevel: 0.014 });

  // The net over the pole: u across its width, v from the front hem, over the pole, to the back hem.
  const netWidth = width - 0.3;
  const front = poleY * 0.62;
  const back = poleY * 0.4;
  const drape = (u: number, v: number): THREE.Vector3 => {
    const x = (u - 0.5) * netWidth;
    const fold = Math.sin(u * Math.PI * 5) * 0.03;
    if (v < 0.5) {
      const t = v / 0.5;
      const y = poleY - (1 - t) * front * (1 - 0.08 * Math.sin(u * Math.PI));
      return new THREE.Vector3(x, y, -0.05 - (1 - t) * 0.12 - fold * (1 - t));
    }
    const t = (v - 0.5) / 0.5;
    return new THREE.Vector3(x, poleY - t * back, 0.05 + t * 0.08 + fold * t);
  };
  net(surface, drape, [meshCols, meshRows * 2], NET, 0.01);
  // Float line along the front hem with wooden corks.
  const hem = Array.from({ length: 13 }, (_, i) => drape(i / 12, 0).add(new THREE.Vector3(0, -0.01, 0)));
  rope(surface, hem, 0.012, NET, { sides: 4 });
  for (let k = 0; k < 7; k += 1) {
    const at = drape((k + 0.5) / 7, 0);
    surface.addLoft([
      { p: [at.x - 0.05, at.y - 0.01, at.z], w: 0.022, h: 0.022 }, { p: [at.x + 0.05, at.y - 0.01, at.z], w: 0.022, h: 0.022 }
    ], { sides: 6, ref: [0, 1, 0], capStart: 0.3, capEnd: 0.3, token: WET, shade: 1.04 });
  }

  // Buoys on short lines from the pole.
  for (let k = 0; k < buoys; k += 1) {
    const x = -netWidth * 0.4 + (netWidth * 0.8 * k) / Math.max(1, buoys - 1) + (random() - 0.5) * 0.1;
    const drop = 0.35 + random() * 0.25;
    rope(surface, [[x, poleY - 0.03, -0.06], [x, poleY - drop, -0.2]], 0.007, WOOD, { sides: 4 });
    fruit(surface, [x, poleY - drop - 0.1, -0.21], 0.09, k % 2 ? NET : DARK, { squash: 1.2 });
  }
  // A coil of rope at the left foot.
  const coil = Array.from({ length: 33 }, (_, i) => {
    const a = (i / 11) * Math.PI * 2;
    const r = 0.2 - i * 0.003;
    return new THREE.Vector3(-width / 2 + 0.35 + Math.cos(a) * r, 0.02 + Math.floor(i / 11) * 0.025, depth * 0.6 + Math.sin(a) * r);
  });
  rope(surface, coil, 0.018, WOOD, { sides: 4, shade: 1.02 });
  rope(surface, catenary(coil[coil.length - 1], [-width / 2, poleY * 0.35, depth * 0.33], 0.05, 5), 0.016, WOOD, { sides: 4, shade: 1.02 });

  // Built facing -Z; turned to face +Z, the front the world layout's rotations were authored for.
  const mesh = surface.buildMesh(`${ID}_mesh`);
  mesh.geometry.rotateY(Math.PI);
  root.add(mesh);
  return { root, clips: [] };
}
