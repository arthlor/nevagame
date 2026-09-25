import * as THREE from "three";

import { SurfaceBuilder, addCollisionMarkers, mulberry32, type AuthoredModel, type GeneratorContext } from "../../kit";
import { timber } from "./parts";

/**
 * Road works where the mainland roads meet the ground they cross. glTF space: +Y up, ground at
 * y = 0 (the channel floor at the wall's foot), the face toward +Z, away from the road, metres.
 */

/**
 * Culvert headwall. Where a road crosses a brook, the water passes under the road embankment in a
 * round stone pipe; this is the dressed face of one end. Coursed blocks with a ring of voussoirs
 * round the pipe mouth, an overhanging coping with moss on its lee stones, wing walls splayed out
 * along the banks and stepping down as they go, and a flagstone apron where the water spills out.
 * One stands at each side of a road deck.
 */
export function createCulvertHeadwallModel(context: GeneratorContext): AuthoredModel {
  const { spec } = context;
  const ID = spec.id;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: cool stone, weathered warm stone, pipe shadow, wet stone, moss.
  const surface = new SurfaceBuilder(spec.palette);
  const COOL = 0;
  const WARM = 1;
  const SHADOW = 2;
  const WET = 3;
  const MOSS = 4;
  const halfWall = 1.55;
  const face = 0;
  const back = -0.45;
  const courses = [0, 0.3, 0.6, 0.9, 1.2] as const;
  const pipe = { y: 0.46, radius: 0.4 };
  const ringOuter = pipe.radius + 0.18;
  const stone = (): number => (random() < 0.7 ? COOL : WARM);
  const shade = (): number => 0.82 + random() * 0.2;

  // Coursed face. Each course is laid in blocks of uneven length; round the pipe the course stops at
  // the voussoir ring on either side.
  for (let c = 0; c < courses.length - 1; c += 1) {
    const y0 = courses[c];
    const y1 = courses[c + 1];
    const mid = (y0 + y1) / 2;
    const nearest = Math.max(y0, Math.min(y1, pipe.y));
    const dy = Math.abs(nearest - pipe.y);
    const ring = dy < ringOuter ? Math.sqrt(ringOuter * ringOuter - dy * dy) - 0.04 : 0;
    const runs: [number, number][] = ring > 0 ? [[-halfWall, -ring], [ring, halfWall]] : [[-halfWall, halfWall]];
    for (const [start, end] of runs) {
      let x = start + (c % 2 === 0 ? 0 : -0.2);
      while (x < end - 0.05) {
        const from = Math.max(start, x);
        const to = Math.min(end, x + 0.46 + random() * 0.32);
        if (to - from > 0.08) {
          const inset = random() * 0.025;
          timber(surface, [(from + to) / 2, mid, back], [(from + to) / 2, mid, face - inset],
            [(to - from) / 2 - 0.012, (y1 - y0) / 2 - 0.012], stone(), { ref: [0, 1, 0], bevel: 0.035, shade: shade() });
        }
        x = to;
      }
    }
  }
  // Voussoirs, each set radially round the pipe mouth and standing a little proud of the face.
  const voussoirs = 13;
  for (let k = 0; k < voussoirs; k += 1) {
    const angle = (k / voussoirs) * Math.PI * 2 + 0.12;
    const radial = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
    const centre = new THREE.Vector3(0, pipe.y, 0).addScaledVector(radial, (pipe.radius + ringOuter) / 2);
    if (centre.y - 0.1 < 0.02) continue;
    timber(surface, [centre.x, centre.y, back + 0.1], [centre.x, centre.y, face + 0.04],
      [0.1, (ringOuter - pipe.radius) / 2], stone(), { ref: [radial.x, radial.y, 0], bevel: 0.03, shade: shade() * 0.97 });
  }
  // The pipe: a dark bore closed deep inside, so the mouth reads as depth, not paint.
  surface.addLoft([
    { p: [0, pipe.y, face + 0.01], w: pipe.radius, h: pipe.radius },
    { p: [0, pipe.y, back - 0.2], w: pipe.radius * 0.96, h: pipe.radius * 0.96 }
  ], { sides: 12, ref: [0, 1, 0], flat: true, token: SHADOW, shade: 0.7 });
  surface.addDisc([0, pipe.y, back - 0.18], [0, 0, 1], pipe.radius * 0.97, { token: SHADOW, sides: 12, shade: 0.6 });
  // Coping: an overhanging course of long stones, moss on the ones the rain runs off least.
  let x = -halfWall - 0.08;
  while (x < halfWall + 0.05) {
    const to = Math.min(halfWall + 0.08, x + 0.62 + random() * 0.3);
    timber(surface, [(x + to) / 2, 1.27, back - 0.04], [(x + to) / 2, 1.27, face + 0.1],
      [(to - x) / 2 - 0.012, 0.07], random() < 0.3 ? MOSS : stone(), { ref: [0, 1, 0], bevel: 0.03, shade: shade() });
    x = to;
  }
  // Wing walls splay out along the banks and step down twice.
  for (const side of [-1, 1]) {
    const splay = side * 0.62;
    const direction = new THREE.Vector3(Math.sin(splay), 0, Math.cos(splay));
    const start = new THREE.Vector3(side * (halfWall - 0.12), 0, back / 2);
    const steps = [[0, 0.5, 1.12], [0.5, 0.95, 0.8], [0.95, 1.35, 0.48]] as const;
    for (const [a, b, height] of steps) {
      const from = start.clone().addScaledVector(direction, a);
      const to = start.clone().addScaledVector(direction, b);
      timber(surface, [from.x, height / 2, from.z], [to.x, height / 2, to.z], [0.2, height / 2 - 0.01], stone(),
        { ref: [0, 1, 0], bevel: 0.035, shade: shade() });
      timber(surface, [from.x, height + 0.05, from.z], [to.x, height + 0.05, to.z], [0.24, 0.05], random() < 0.35 ? MOSS : COOL,
        { ref: [0, 1, 0], bevel: 0.02, shade: shade() });
    }
  }
  // Flagstone apron under the spill, dark with wet.
  const flags = [[0, 0.32, 0.36, 0.24], [-0.42, 0.42, 0.24, 0.28], [0.4, 0.46, 0.26, 0.22], [-0.08, 0.86, 0.34, 0.2],
    [0.38, 0.9, 0.18, 0.2]] as const;
  for (const [fx, fz, hx, hz] of flags) {
    timber(surface, [fx, 0.03, fz - hz], [fx, 0.03, fz + hz], [hx, 0.035], WET, { ref: [0, 1, 0], bevel: 0.02, shade: 0.84 + random() * 0.12 });
  }
  root.add(surface.buildMesh(`${ID}_mesh`));
  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}
