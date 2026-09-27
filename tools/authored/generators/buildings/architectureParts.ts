import * as THREE from "three";
import { SurfaceBuilder, mulberry32, type V3 } from "../../kit";
import { timber, rope } from "../props/parts";

/** Family-local construction vocabulary. All dimensions are metres, +Y up, +Z front.
 * Parts accumulate by palette slot; construction detail never becomes a draw per plank. */
export class Architecture {
  readonly surface: SurfaceBuilder;
  readonly random: () => number;
  readonly fine: boolean;
  constructor(readonly palette: string[], readonly level: number, seed: number) {
    this.surface = new SurfaceBuilder(palette);
    this.random = mulberry32(seed);
    this.fine = level === 0;
  }
  count(near: number, middle: number, far = middle): number { return this.fine ? near : this.level === 1 ? middle : far; }
  shade(): number { return 0.86 + this.random() * 0.14; }
  beam(a: V3, b: V3, half: [number, number], token: number, shade = 0.97, ref?: V3): void {
    timber(this.surface, a, b, half, token, { ref, bevel: this.fine ? Math.min(...half) * 0.22 : 0, shade });
  }
  box(p: V3, size: V3, token: number, shade = 0.97): void {
    timber(this.surface, [p[0], p[1] - size[1] / 2, p[2]], [p[0], p[1] + size[1] / 2, p[2]],
      [size[0] / 2, size[2] / 2], token,
      { ref: [0, 0, 1], bevel: this.fine ? Math.min(...size) * 0.13 : 0, shade });
  }
  rod(a: V3, b: V3, radius: number, token: number): void {
    rope(this.surface, [a, b], radius, token, { sides: this.count(8, 5, 4) });
  }
  pin(p: V3, normal: V3, token: number, radius = 0.037): void {
    if (this.fine) this.surface.addDisc(p, normal, radius, { token, dome: radius * 0.22, sides: 6 });
  }
  cylinder(p: V3, h: number, r0: number, r1: number, token: number, sides = 12, shade = 1): void {
    this.surface.addLoft([{ p, w: r0, h: r0 }, { p: [p[0], p[1] + h, p[2]], w: r1, h: r1 }],
      { sides, ref: [0, 0, 1], capStart: 0, capEnd: 0, flat: true, token, shade });
  }
  /** A closed annulus, also used for iron collars and lantern galleries. */
  ring(p: V3, radius: number, width: number, height: number, token: number, sides = 16): void {
    this.surface.addPanel({ cols: sides, rows: 1, wrap: true, thickness: width,
      point: (u, v) => new THREE.Vector3(p[0] + Math.cos(u * Math.PI * 2) * radius,
        p[1] + (v - 0.5) * height, p[2] + Math.sin(u * Math.PI * 2) * radius), token: () => token });
  }
  /** Local front coordinates, allowing the same joinery on all four elevations. */
  frame(origin: V3, yaw = 0): (x: number, y: number, z: number) => V3 {
    return (x, y, z) => [origin[0] + x * Math.cos(yaw) + z * Math.sin(yaw),
      origin[1] + y, origin[2] - x * Math.sin(yaw) + z * Math.cos(yaw)];
  }
  faceBeam(at: ReturnType<Architecture["frame"]>, a: V3, b: V3, width: number, depth: number, token: number): void {
    timber(this.surface, at(...a), at(...b), [width / 2, depth / 2], token,
      { ref: [at(0, 0, 1)[0] - at(0, 0, 0)[0], 0, at(0, 0, 1)[2] - at(0, 0, 0)[2]],
        bevel: this.fine ? Math.min(width, depth) * 0.16 : 0 });
  }
  door(origin: V3, w: number, h: number, wood: number, dark: number, metal = dark, yaw = 0): void {
    const f = this.frame(origin, yaw);
    const board = (x: number, y: number, width: number, height: number, z: number, token: number) =>
      this.faceBeam(f, [x, y - height / 2, z], [x, y + height / 2, z], width, 0.1, token);
    board(0, h / 2, w + 0.16, h + 0.12, -0.04, dark);
    const n = this.count(7, 4, 3);
    for (let i = 0; i < n; i++) board(-w / 2 + (i + 0.5) * w / n, h / 2, w / n - 0.015, h, 0.025, wood);
    for (const x of [-w / 2 - 0.09, w / 2 + 0.09]) board(x, h / 2, 0.17, h + 0.25, 0.10, wood);
    this.faceBeam(f, [-w / 2 - 0.2, h + 0.08, 0.1], [w / 2 + 0.2, h + 0.08, 0.1], 0.18, 0.19, wood);
    for (const y of [0.25, h - 0.3]) {
      this.faceBeam(f, [-w * 0.44, y, 0.1], [w * 0.44, y, 0.1], 0.07, 0.07, metal);
    }
    this.faceBeam(f, [-w * 0.4, 0.32, 0.105], [w * 0.4, h - 0.37, 0.105], 0.10, 0.065, dark);
    this.rod(f(w * 0.31, h * 0.41, 0.15), f(w * 0.31, h * 0.53, 0.15), 0.026, metal);
  }
  window(origin: V3, w: number, h: number, frame: number, recess: number, pane: number, yaw = 0, shutters = false): void {
    const f = this.frame(origin, yaw);
    // The recess projects into an opaque wall. No transparent plane, sorting or light needed.
    this.faceBeam(f, [0, -h / 2 - 0.04, -0.02], [0, h / 2 + 0.04, -0.02], w + 0.12, 0.13, recess);
    this.faceBeam(f, [0, -h / 2 + 0.08, 0.06], [0, h / 2 - 0.08, 0.06], w - 0.16, 0.055, pane);
    for (const x of [-w / 2, 0, w / 2]) this.faceBeam(f, [x, -h / 2, 0.12], [x, h / 2, 0.12], x ? 0.12 : 0.055, 0.13, frame);
    for (const y of [-h / 2, 0, h / 2]) this.faceBeam(f, [-w / 2 - 0.08, y, 0.12], [w / 2 + 0.08, y, 0.12], y ? 0.13 : 0.05, 0.14, frame);
    this.faceBeam(f, [-w / 2 - 0.16, -h / 2 - 0.12, 0.14], [w / 2 + 0.16, -h / 2 - 0.12, 0.14], 0.13, 0.36, frame);
    if (shutters) for (const sign of [-1, 1]) {
      for (let i = 0; i < this.count(3, 1); i++) {
        const x = sign * (w / 2 + 0.18 + (i + 0.5) * w * 0.34 / this.count(3, 1));
        this.faceBeam(f, [x, -h / 2, 0.05], [x, h / 2, 0.05], w * 0.34 / this.count(3, 1) - 0.012, 0.08, frame);
      }
      for (const y of [-h * 0.3, h * 0.3]) this.faceBeam(f, [sign * (w / 2 + 0.17), y, 0.11], [sign * (w * 0.84 + 0.17), y, 0.11], 0.06, 0.05, recess);
    }
  }
  /** Staggered courses along a wall, with a continuous recessed core behind the joints. */
  masonry(origin: V3, w: number, h: number, depth: number, rows: number, columns: number, token: number, yaw = 0): void {
    const f = this.frame(origin, yaw);
    const nr = this.count(rows, Math.max(2, Math.ceil(rows * 0.65)), 2);
    const nc = this.count(columns, Math.max(2, Math.ceil(columns * 0.6)), 2);
    for (let r = 0; r < nr; r++) {
      for (let c = -1; c < nc; c++) {
        const a = Math.max(-w / 2, -w / 2 + (c + (r % 2) * 0.5) * w / nc);
        const b = Math.min(w / 2, -w / 2 + (c + 1 + (r % 2) * 0.5) * w / nc);
        if (b - a < 0.03) continue;
        this.faceBeam(f, [(a + b) / 2, r * h / nr + 0.013, 0], [(a + b) / 2, (r + 1) * h / nr - 0.013, 0], b - a - 0.018, depth, token);
      }
    }
  }
  foundation(w: number, d: number, h: number, stone: number, rows = 3, columns = 8): void {
    this.box([0, h / 2, 0], [w - 0.09, h, d - 0.09], stone, 0.84);
    for (const sign of [-1, 1]) {
      this.masonry([0, 0, sign * d / 2], w, h, 0.16, rows, columns, stone, sign < 0 ? Math.PI : 0);
      this.masonry([sign * w / 2, 0, 0], d, h, 0.16, rows, Math.ceil(columns * d / w), stone, sign * Math.PI / 2);
    }
    this.box([0, h + 0.035, 0], [w + 0.13, 0.11, d + 0.13], stone);
  }
  triangularGable(origin: V3, w: number, rise: number, infill: number, wood: number, yaw = 0, frameInset = 0): void {
    const f = this.frame(origin, yaw);
    this.surface.addHull([f(-w / 2, 0, -0.05), f(w / 2, 0, -0.05), f(0, rise, -0.05),
      f(-w / 2, 0, 0.05), f(w / 2, 0, 0.05), f(0, rise, 0.05)], { token: infill });
    // Keep exposed rafters below the roof skin while the plaster closes against its soffit.
    const frameW = w - frameInset * 2, frameRise = rise - frameInset;
    this.beam(f(-frameW / 2, 0, 0.09), f(frameW / 2, 0, 0.09), [0.11, 0.10], wood);
    for (const sign of [-1, 1]) this.beam(f(sign * frameW / 2, 0, 0.09), f(0, frameRise, 0.09), [0.12, 0.105], wood);
    for (const x of [-frameW * 0.26, 0, frameW * 0.26]) this.beam(f(x, 0.04, 0.07), f(x, frameRise * (1 - Math.abs(x) * 2 / frameW) - 0.03, 0.07), [0.075, 0.075], wood);
  }
  /** Ridge along local Z. Tiles overlap in the drainage direction; soffit closes their seams. */
  roof(origin: V3, w: number, d: number, rise: number, tile: number, wood: number, rows = 7, columns = 11, yaw = 0): void {
    const f = this.frame(origin, yaw);
    const nr = this.count(rows, Math.max(2, Math.round(rows * 0.48)), 2);
    const nc = this.count(columns, Math.max(3, Math.round(columns * 0.48)), 3);
    for (const side of [-1, 1]) {
      const at = (u: number, v: number): THREE.Vector3 => new THREE.Vector3(...f(side * w * 0.5 * v, rise * (1 - v), (u - 0.5) * d));
      this.surface.addPanel({ cols: 1, rows: 1, thickness: 0.13, point: at, token: () => wood });
      for (let r = 0; r < nr; r++) for (let c = -1; c < nc; c++) {
        const u0 = Math.max(0, (c + (r % 2) * 0.5) / nc), u1 = Math.min(1, (c + 1 + (r % 2) * 0.5) / nc);
        if (u1 - u0 < 0.01) continue;
        const inset = this.fine ? 0.007 / d : 0.003 / d;
        const tone = this.shade();
        this.surface.addPanel({ cols: 1, rows: 1, thickness: this.fine ? 0.075 : 0.07,
          point: (u, v) => {
            const t = (r + v * 1.065) / nr;
            const p = at(THREE.MathUtils.lerp(u0 + inset, u1 - inset, u), t);
            p.y += 0.105 + (1 - v) * 0.04;
            return p;
          }, token: () => tile, shade: () => tone });
      }
      for (const z of [-d / 2 - 0.035, d / 2 + 0.035]) this.beam(f(0, rise + 0.055, z), f(side * w / 2, -0.055, z), [0.115, 0.13], wood);
      this.beam(f(side * w / 2, -0.05, -d / 2), f(side * w / 2, -0.05, d / 2), [0.10, 0.15], wood);
      for (let i = 0; i < this.count(7, 4, 2); i++) {
        const z = -d * 0.42 + d * 0.84 * i / (this.count(7, 4, 2) - 1);
        this.beam(f(side * w * 0.34, rise * 0.3 - 0.12, z), f(side * w * 0.51, -0.15, z), [0.08, 0.09], wood);
      }
    }
    const segments = this.count(8, 4, 2);
    for (let i = 0; i < segments; i++) this.beam(f(0, rise + 0.15, -d / 2 + i * d / segments), f(0, rise + 0.15, -d / 2 + (i + 1.025) * d / segments), [0.16, 0.13], tile);
  }
  lantern(origin: V3, scale: number, metal: number, glow: number, emitter: Architecture = this): void {
    const [x, y, z] = origin, r = scale * 0.19;
    emitter.box([x, y + scale * 0.39, z], [r * 1.52, scale * 0.5, r * 1.52], glow);
    for (const dy of [0.08, 0.64]) this.box([x, y + scale * dy, z], [r * 2.18, scale * 0.09, r * 2.18], metal);
    for (const dx of [-r, r]) for (const dz of [-r, r]) this.rod([x + dx, y + scale * 0.12, z + dz], [x + dx, y + scale * 0.66, z + dz], scale * 0.024, metal);
    this.cylinder([x, y + scale * 0.685, z], scale * 0.25, r * 1.6, r * 0.22, metal, 4);
    this.rod([x, y + scale * 0.88, z], [x, y + scale * 1.1, z], scale * 0.026, metal);
  }
  leanRoof(origin: V3, w: number, d: number, fall: number, tile: number, wood: number, rows = 5, columns = 8): void {
    const [x, y, z] = origin;
    const point = (u: number, v: number) => new THREE.Vector3(x + (u - 0.5) * w, y - fall * v, z + (v - 0.5) * d);
    this.surface.addPanel({ cols: 1, rows: 1, thickness: 0.12, point, token: () => wood });
    const nr = this.count(rows, 3, 2), nc = this.count(columns, 4, 3);
    for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
      const tone = this.shade();
      this.surface.addPanel({ cols: 1, rows: 1, thickness: 0.07,
        point: (u, v) => point((c + 0.012 + u * 0.976) / nc, (r + v * 1.08) / nr).add(new THREE.Vector3(0, 0.105 + (1 - v) * 0.04, 0)),
        token: () => tile, shade: () => tone });
    }
    for (const side of [-1, 1]) this.beam([x + side * w / 2, y, z - d / 2], [x + side * w / 2, y - fall, z + d / 2], [0.115, 0.12], wood);
    for (const v of [0, 1]) this.beam([x - w / 2, y - fall * v, z + (v - 0.5) * d], [x + w / 2, y - fall * v, z + (v - 0.5) * d], [0.11, 0.13], wood);
    for (let i = 0; i < this.count(6, 3, 2); i++) {
      const xx = x - w * 0.43 + w * 0.86 * i / (this.count(6, 3, 2) - 1);
      this.beam([xx, y - fall * 0.7 - 0.15, z + d * 0.2], [xx, y - fall - 0.15, z + d * 0.54], [0.07, 0.09], wood);
    }
  }
  chimney(origin: V3, height: number, w: number, d: number, stone: number, soot: number, pot: number, courseHeight = 0.37): void {
    const [x, y, z] = origin;
    this.box([x, y + height / 2, z], [w - 0.04, height, d - 0.04], stone, 0.86);
    for (const side of [-1, 1]) {
      this.masonry([x, y, z + side * d / 2], w, height - 0.55, 0.10, Math.ceil(height / courseHeight), 2, stone, side < 0 ? Math.PI : 0);
      this.masonry([x + side * w / 2, y, z], d, height - 0.55, 0.10, Math.ceil(height / courseHeight), 2, stone, side * Math.PI / 2);
    }
    this.box([x, y + height - 0.57, z], [w + 0.20, 0.23, d + 0.20], stone);
    this.cylinder([x, y + height - 0.48, z], 0.40, w * 0.26, w * 0.23, pot, this.count(10, 6));
    this.ring([x, y + height - 0.04, z], w * 0.24, 0.08, 0.13, pot, this.count(10, 6));
    this.surface.addDisc([x, y + height - 0.08, z], [0, 1, 0], w * 0.20, { token: soot, up: [0, 0, 1], sides: this.count(10, 6) });
  }
  mesh(name: string): THREE.Mesh { return this.surface.buildMesh(name); }
}
