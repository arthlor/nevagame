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
 * round the pipe mouth, an overhanging coping with moss on its lee stones, and wing walls splayed
 * out along the banks and stepping down as they go. The brook's own gravel bed runs up to the pipe
 * mouth, so the wall carries no apron of its own. One stands at each side of a road deck.
 */
export function createCulvertHeadwallModel(context: GeneratorContext): AuthoredModel {
  const { spec } = context;
  const ID = spec.id;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: cool stone, weathered warm stone, pipe shadow, moss.
  const surface = new SurfaceBuilder(spec.palette);
  const COOL = 0;
  const WARM = 1;
  const SHADOW = 2;
  const MOSS = 3;
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
  root.add(surface.buildMesh(`${ID}_mesh`));
  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}

/**
 * Milestone. A dressed stone post beside a cart road at each measured stage out from where the road
 * starts: a tapered shaft on a half-buried plinth, a rounded faceted head that sheds rain, a sunken
 * panel on the road face with the stage cut in it as tally strokes, and moss where water sits on the
 * head's crown. Ground at y = 0, the carved face toward +Z (the road).
 */
export function createRoadMilestoneModel(context: GeneratorContext): AuthoredModel {
  const { spec } = context;
  const ID = spec.id;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  // Catalog palette order: cool stone, weathered warm stone, cut shadow, moss.
  const surface = new SurfaceBuilder(spec.palette);
  const COOL = 0;
  const WARM = 1;
  const SHADOW = 2;
  const MOSS = 3;
  const shaftTop = 0.68;
  const half: readonly [number, number] = [0.15, 0.1];
  const top: readonly [number, number] = [0.13, 0.09];
  const lean = (random() - 0.5) * 0.04;

  // Plinth: a rough, broad stone mostly under the verge, its top just showing.
  const plinth: [number, number, number][] = [];
  for (let k = 0; k < 9; k += 1) {
    const angle = (k / 9) * Math.PI * 2 + random() * 0.3;
    const radius = 0.24 + random() * 0.05;
    plinth.push([Math.cos(angle) * radius, -0.08, Math.sin(angle) * radius * 0.8]);
    plinth.push([Math.cos(angle) * (radius - 0.04), 0.06 + random() * 0.03, Math.sin(angle) * (radius - 0.04) * 0.8]);
  }
  surface.addHull(plinth, { token: (face) => (face.normal.y > 0.7 && random() < 0.4 ? MOSS : WARM), shade: () => 0.84 });
  // Shaft: tapered and a touch out of true, as a set stone settles.
  surface.addBox([0, 0.05, 0], [lean, shaftTop, 0], half, {
    token: COOL, ref: [0, 0, 1], bevel: 0.025, halfEnd: top, shade: () => 0.9 + random() * 0.08
  });
  // Head: a low faceted dome, its crown mossed where rain lingers.
  const head: [number, number, number][] = [];
  for (let ring = 0; ring < 3; ring += 1) {
    const y = shaftTop + ring * 0.07;
    const scale = 1 - ring * ring * 0.18;
    for (let k = 0; k < 8; k += 1) {
      const angle = (k / 8) * Math.PI * 2;
      head.push([lean + Math.cos(angle) * top[0] * 1.05 * scale, y, Math.sin(angle) * top[1] * 1.1 * scale]);
    }
  }
  head.push([lean, shaftTop + 0.2, 0]);
  surface.addHull(head, { token: (face) => (face.normal.y > 0.8 ? MOSS : COOL), shade: () => 0.95 });
  // Sunken panel on the road face, and the stage cut into it as tally strokes.
  const face = half[1] + 0.002;
  const panel = { bottom: 0.28, top: 0.56, half: 0.09 };
  surface.addBox([lean * 0.55, panel.bottom, face - 0.012], [lean * 0.82, panel.top, face - 0.012], [panel.half, 0.012], {
    token: WARM, ref: [0, 0, 1], shade: () => 0.8
  });
  const strokes = Math.max(1, Math.min(4, Math.round(Number(spec.parameters?.stage ?? 2))));
  for (let k = 0; k < strokes; k += 1) {
    const x = (k - (strokes - 1) / 2) * 0.04 + lean * 0.7;
    surface.addBox([x, panel.bottom + 0.05, face - 0.004], [x, panel.top - 0.05, face - 0.004], [0.009, 0.006], {
      token: SHADOW, ref: [0, 0, 1], shade: () => 0.76
    });
  }
  root.add(surface.buildMesh(`${ID}_mesh`));
  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}
