import * as THREE from "three";
import { SurfaceBuilder, addCollisionMarkers, mulberry32, type AuthoredModel, type GeneratorContext, type V3 } from "../../kit";
import { rope, timber } from "../props/parts";

/** Local +X is the shore end; Y is up. Deck and stairs meet the catalog's contact planes. */
export function createWorkingDockModel({ spec, parameters, seed }: GeneratorContext): AuthoredModel {
  const root = new THREE.Group(); root.name = spec.rootNode;
  const s = new SurfaceBuilder(spec.palette), random = mulberry32(seed);
  const length = Number(parameters.length), width = Number(parameters.width);
  const planks = Number(parameters.deckPlanks), rows = Number(parameters.pileRows);
  const box = (p: V3, size: V3, token: number, shade = 1) => s.addBox(
    [p[0] - size[0] / 2, p[1], p[2]], [p[0] + size[0] / 2, p[1], p[2]], [size[2] / 2, size[1] / 2],
    { ref: [0, 1, 0], token, bevel: Math.min(.018, size[1] * .12), shade });
  box([0, 2.42, 0], [length, .24, width], 1);
  for (let i = 0; i < planks; i++) {
    const x = -length / 2 + (i + .5) * length / planks;
    box([x, 2.61, 0], [length / planks - .015, .14, width - .04], i % 4 === 0 ? 1 : 0, .89 + random() * .1);
  }
  for (const side of [-1, 1]) box([0, 2.69, side * (width / 2 - .07)], [length, .14, .14], 4);
  for (let i = 0; i < rows; i++) {
    const x = -length * .44 + i * length * .88 / (rows - 1);
    for (const side of [-1, 1]) {
      const z = side * width * .46;
      box([x, .15, z], [.64, .3, .64], 5);
      s.addLoft([{ p: [x, .3, z], w: .26, h: .26 }, { p: [x, 2.64, z], w: .18, h: .18 }],
        { sides: 8, ref: [0, 0, 1], capStart: 0, capEnd: 0, flat: true, token: 1 });
      s.addLoft([{ p: [x, .32, z], w: .275, h: .275 }, { p: [x, .6, z], w: .275, h: .275 }],
        { sides: 8, ref: [0, 0, 1], capStart: 0, capEnd: 0, flat: true, token: 4 });
      box([x, 2.77, z], [.46, .26, .46], 4);
      if (i > 0) {
        const lastX = -length * .44 + (i - 1) * length * .88 / (rows - 1);
        timber(s, [lastX, .7, z], [x, 2.28, z], [.055, .07], 1);
      }
    }
    timber(s, [x, .95, -width * .44], [x, 2.15, width * .44], [.06, .065], 1);
    box([x, 2.23, 0], [.24, .2, width], 4);
  }
  for (let i = 0; i < 5; i++) {
    const x = length / 2 + .16 + i * .34, top = 2.61 - i * .18;
    box([x, top - .07, 0], [.38, .14, 3.4], i % 2 ? 1 : 0);
  }
  for (const side of [-1, 1]) {
    timber(s, [length / 2, 2.44, side * 1.72], [length / 2 + 1.78, 1.49, side * 1.72], [.06, .10], 4);
    for (const [x, top] of [[length / 2 + .22, 2.95], [length / 2 + 1.62, 2.05]])
      timber(s, [x, top - .55, side * 1.62], [x, top, side * 1.62], [.05, .05], 4);
  }
  // Fittings stay along the edge, leaving one continuous cargo-handling lane.
  for (const side of [-1, 1]) for (let i = 0; i < Math.max(3, Math.floor(length / 7)); i++) {
    const x = -length * .42 + i * length * .84 / (Math.max(3, Math.floor(length / 7)) - 1), z = side * (width / 2 - .3);
    box([x, 2.81, z], [.14, .26, .14], 4); box([x, 2.93, z], [.58, .1, .14], 4);
    rope(s, Array.from({ length: 25 }, (_, k): V3 => {
      const a = k / 12 * Math.PI * 2, r = .25 + k / 24 * .07;
      return [x + .75 + Math.cos(a) * r, 2.71, z - side * .2 + Math.sin(a) * r];
    }), .023, 3, { sides: 4 });
  }
  for (const x of [-length * .28, length * .28]) {
    const z = width * .52;
    for (const dx of [-.30, .30]) timber(s, [x + dx, .18, z], [x + dx, 2.73, z], [.045, .045], 1);
    for (let i = 0; i < 9; i++) box([x, .28 + i * .28, z], [.6, .075, .09], 1);
  }
  if (parameters.canopy) {
    const cx = .7;
    for (const x of [cx - .97, cx + .97]) for (const z of [-.66, .66])
      timber(s, [x, 2.68, z], [x, 4.68 - z * .42, z], [.07, .07], 4);
    for (const z of [-.66, .66]) box([cx, 4.72 - z * .42, z], [2.2, .12, .12], 4);
    s.addPanel({ cols: 6, rows: 3, thickness: .05,
      point: (u, v) => new THREE.Vector3(cx + (u - .5) * 2.4, 5.02 - v * .65, -.8 + v * 1.6),
      token: u => Math.floor(u * 6) % 2 ? 2 : 3 });
    box([cx, 3.03, .06], [1.7, .7, .68], 0); box([cx, 3.43, .06], [1.84, .10, .8], 4);
  }
  root.add(s.buildMesh(`${spec.id}_timber`));
  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}
