import * as THREE from "three";

import { tokenLinearColor, tokenMaterial } from "./palette";
import type { V3, Weights } from "./types";

/**
 * Surface construction for authored assets.
 *
 * A primary organic mass is one lofted surface whose cross-sections change shape along its length
 * (superellipse sections with separate upper and lower half-heights), so anatomy reads as one form
 * rather than primitives pushed through each other. Markings are palette tokens assigned per face
 * (per quad on lofts, so their edges are clean). Cloth and fans are closed panels. Timber is
 * hard-edged boxes. Everything accumulates into one multi-material mesh per builder.
 */

/**
 * One cross-section of a lofted surface. `w` is the half-width along the section's side axis, `h`
 * and `hb` the half-heights above and below the path along its up axis, and `n` a superellipse
 * exponent (2 is an ellipse, higher is boxier). `bones` overrides the part's skin weights for this
 * ring, which is how a spine chain blends along the body.
 */
export interface Station {
  p: V3;
  w: number;
  h: number;
  hb?: number;
  n?: number;
  bones?: Weights;
}

export interface FaceContext {
  /** Station coordinate of the face (0 .. stations-1; caps sit just beyond the ends). */
  u: number;
  /** Section angle of the face centroid: 0 on the +side axis, PI/2 on the up axis. */
  theta: number;
  centroid: THREE.Vector3;
  normal: THREE.Vector3;
}

type TokenRule = number | ((face: FaceContext) => number);

export interface LoftOptions {
  sides: number;
  /** Reference the section's up axis is built from; must never be parallel to the path. */
  ref: V3;
  /** Cap bulge along the path, as a multiple of the end section's smallest radius. */
  capStart?: number;
  capEnd?: number;
  bones?: Weights;
  token: TokenRule;
  /** Hard-edged facets (timber, stone) instead of interpolated normals (anatomy, cloth). */
  flat?: boolean;
  /** Radial scale per ring vertex, e.g. seeded lumps that make a fleece read as wool. */
  radial?: (stationIndex: number, theta: number) => number;
  /** Section angle offset in radians; PI / sides turns a 4-sided loft from a diamond into a square. */
  phase?: number;
  /**
   * A custom section instead of the superellipse: points in unit section space, x along the side
   * axis (scaled by `w`) and y along the up axis (scaled by `h`, or `hb` below the path), in order
   * around the section. Overrides `sides`. Chamfered planks, shouldered churns, moulded rails.
   */
  profile?: ReadonlyArray<readonly [number, number]>;
  /**
   * Value mask on the token colour, per face: 1 is the pure token, lower is darker. Clamped to the
   * pipeline's COLOR_0 contract (0.72..1.04). Use it for plank-to-plank tone, weathering, shadowed
   * undersides; the token itself never changes.
   */
  shade?: number | ((face: FaceContext) => number);
  /**
   * Value mask per vertex, from its rest position: a smooth gradient inside one token (a darker
   * dorsal ridge fading down the flank, countershading, a sooty base). Multiplies `shade`; the
   * product is clamped to the same COLOR_0 contract.
   */
  tone?: (p: THREE.Vector3) => number;
}

export interface PanelOptions {
  cols: number;
  rows: number;
  /** Mid-surface point for grid coordinates u (across) and v (down), both 0..1. */
  point: (u: number, v: number) => THREE.Vector3;
  /** Slab thickness, constant or per grid vertex (a fin thinning toward its edge). */
  thickness: number | ((u: number, v: number) => number);
  /** Cell mask, evaluated at the cell centre. Defaults to every cell. */
  inside?: (u: number, v: number) => boolean;
  /**
   * `u` is periodic: column `cols` is column 0, so the panel closes into a tube (a sleeve, a coat
   * body, a boot shaft) with rim walls only at its open ends and masked cells. `point` must return
   * the same point at u = 0 and u = 1.
   */
  wrap?: boolean;
  token: (u: number, v: number) => number;
  /**
   * Skin weights: one set for the whole panel, or per vertex from its position, for a panel long
   * enough to bend with the body it sits on (a fin along a spine, a sail).
   */
  bones?: Weights | ((p: THREE.Vector3) => Weights);
  /** Value mask per cell (see `LoftOptions.shade`). */
  shade?: (u: number, v: number) => number;
  /** Value mask per grid vertex (see `LoftOptions.tone`). */
  tone?: (u: number, v: number) => number;
}

interface Vertex {
  p: THREE.Vector3;
  weights: Weights;
  /** Per-vertex value mask, multiplied into its faces' shade. */
  tone?: number;
}

interface Triangle {
  a: number;
  b: number;
  c: number;
  token: number;
  flat: boolean;
  /** Value mask on the token colour, already clamped. */
  shade: number;
}

const SHADE_MIN = 0.72;
const SHADE_MAX = 1.04;
const clampShade = (value: number): number => Math.min(SHADE_MAX, Math.max(SHADE_MIN, value));

/**
 * Accumulates connected surfaces with per-face palette tokens and per-vertex skin weights, then
 * emits one multi-material mesh (skinned or static). Each part keeps its own shared vertex loops, so
 * normals interpolate across a part but never across two parts that merely touch.
 */
export class SurfaceBuilder {
  private readonly vertices: Vertex[] = [];
  private readonly triangles: Triangle[] = [];

  public constructor(private readonly tokens: readonly string[]) {}

  public addLoft(stations: readonly Station[], options: LoftOptions): void {
    const profile = options.profile;
    const sides = profile?.length ?? options.sides;
    const ref = new THREE.Vector3(...options.ref).normalize();
    const base = this.vertices.length;
    const frames = stations.map((_, index) => {
      const prev = new THREE.Vector3(...stations[Math.max(0, index - 1)].p);
      const next = new THREE.Vector3(...stations[Math.min(stations.length - 1, index + 1)].p);
      const tangent = next.sub(prev).normalize();
      const side = new THREE.Vector3().crossVectors(tangent, ref).normalize();
      const up = new THREE.Vector3().crossVectors(side, tangent).normalize();
      return { tangent, side, up };
    });
    const ringWeights = (index: number): Weights => stations[index].bones ?? options.bones ?? {};

    stations.forEach((station, index) => {
      const { side, up } = frames[index];
      const exponent = 2 / (station.n ?? 2);
      for (let k = 0; k < sides; k += 1) {
        const theta = (options.phase ?? 0) + (k / sides) * Math.PI * 2;
        const scale = options.radial ? options.radial(index, theta) : 1;
        let x: number;
        let y: number;
        if (profile) {
          const [px, py] = profile[k];
          x = px * station.w * scale;
          y = py * (py >= 0 ? station.h : station.hb ?? station.h) * scale;
        } else {
          const c = Math.cos(theta);
          const s = Math.sin(theta);
          x = Math.sign(c) * Math.abs(c) ** exponent * station.w * scale;
          y = Math.sign(s) * Math.abs(s) ** exponent * (s >= 0 ? station.h : station.hb ?? station.h) * scale;
        }
        const point = new THREE.Vector3(...station.p).addScaledVector(side, x).addScaledVector(up, y);
        this.vertices.push({ p: point, weights: ringWeights(index), tone: options.tone?.(point) });
      }
    });

    // [a, b, c, station coordinate, outward direction for caps (null: away from the path), the
    // vertices whose centre decides the palette token: a whole quad, so markings have clean edges]
    const faces: Array<[number, number, number, number, THREE.Vector3 | null, number[]]> = [];
    for (let i = 0; i < stations.length - 1; i += 1) {
      for (let k = 0; k < sides; k += 1) {
        const k1 = (k + 1) % sides;
        const a = base + i * sides + k;
        const b = base + i * sides + k1;
        const c = base + (i + 1) * sides + k1;
        const d = base + (i + 1) * sides + k;
        faces.push([a, b, c, i + 0.5, null, [a, b, c, d]], [a, c, d, i + 0.5, null, [a, b, c, d]]);
      }
    }
    const cap = (end: boolean, bulge: number): void => {
      const i = end ? stations.length - 1 : 0;
      const station = stations[i];
      const direction = frames[i].tangent.clone().multiplyScalar(end ? 1 : -1);
      const radius = Math.min(station.w, station.h, station.hb ?? station.h);
      const hub = this.vertices.length;
      const hubPoint = new THREE.Vector3(...station.p).addScaledVector(direction, radius * bulge);
      this.vertices.push({ p: hubPoint, weights: ringWeights(i), tone: options.tone?.(hubPoint) });
      for (let k = 0; k < sides; k += 1) {
        const a = base + i * sides + k;
        const b = base + i * sides + ((k + 1) % sides);
        faces.push([a, b, hub, end ? i + 0.75 : -0.25, direction, [a, b, hub]]);
      }
    };
    if (options.capStart !== undefined) cap(false, options.capStart);
    if (options.capEnd !== undefined) cap(true, options.capEnd);

    // Orient every face away from its station's path point. One explicit test is simpler and safer
    // than reasoning about each part's frame handedness.
    for (const [a, b, c, u, capDirection, tokenVertices] of faces) {
      const pa = this.vertices[a].p;
      const pb = this.vertices[b].p;
      const pc = this.vertices[c].p;
      const normal = new THREE.Vector3().subVectors(pb, pa).cross(new THREE.Vector3().subVectors(pc, pa));
      if (normal.lengthSq() < 1e-16) continue;
      normal.normalize();
      const centroid = new THREE.Vector3().add(pa).add(pb).add(pc).multiplyScalar(1 / 3);
      const stationIndex = Math.min(stations.length - 1, Math.max(0, Math.round(u)));
      const axis = new THREE.Vector3(...stations[stationIndex].p);
      const local = centroid.clone().sub(axis);
      // A flat cap lies in its own station's plane, so it is oriented along the path instead.
      const flip = normal.dot(capDirection ?? local) < 0;
      if (flip) normal.negate();
      const frame = frames[stationIndex];
      let token: number;
      let shade = typeof options.shade === "number" ? options.shade : 1;
      if (typeof options.token === "number" && typeof options.shade !== "function") {
        token = options.token;
      } else {
        const region = new THREE.Vector3();
        for (const index of tokenVertices) region.add(this.vertices[index].p);
        region.multiplyScalar(1 / tokenVertices.length);
        const offset = region.clone().sub(axis);
        const regionNormal = offset.dot(normal) >= 0 || capDirection ? normal.clone() : normal.clone().negate();
        if (tokenVertices.length === 4) {
          const [qa, qb, qc, qd] = tokenVertices.map((index) => this.vertices[index].p);
          const quadNormal = new THREE.Vector3().subVectors(qc, qa).cross(new THREE.Vector3().subVectors(qd, qb));
          if (quadNormal.lengthSq() > 1e-16) {
            quadNormal.normalize();
            regionNormal.copy(quadNormal.dot(offset) >= 0 ? quadNormal : quadNormal.negate());
          }
        }
        const theta = Math.atan2(offset.dot(frame.up), offset.dot(frame.side));
        const face = { u, theta, centroid: region, normal: regionNormal };
        token = typeof options.token === "number" ? options.token : options.token(face);
        if (typeof options.shade === "function") shade = options.shade(face);
      }
      const flat = options.flat === true;
      this.triangles.push(flip
        ? { a, b: c, c: b, token, flat, shade: clampShade(shade) }
        : { a, b, c, token, flat, shade: clampShade(shade) });
    }
  }

  /**
   * Hard-edged timber or stone block from `from` to `to`, with half-extents `half` = [across, up]
   * measured against `ref` (the block's up direction).
   */
  public addBox(
    from: V3, to: V3, half: readonly [number, number],
    options: {
      ref?: V3; token: number; bones?: Weights; shade?: LoftOptions["shade"];
      /** Chamfer on the four long edges, in metres. */
      bevel?: number;
      /** Half-size at `to`, for a tapered member (a hewn rail, a splayed leg); `half` is at `from`. */
      halfEnd?: readonly [number, number];
    }
  ): void {
    const bevel = options.bevel ?? 0;
    const end = options.halfEnd ?? half;
    if (bevel > 0) {
      // Chamfered section: the long edges are cut at 45 degrees, the "readable chamfer" timber needs.
      const cx = Math.min(0.45, bevel / half[0]);
      const cy = Math.min(0.45, bevel / half[1]);
      this.addLoft([{ p: from, w: half[0], h: half[1] }, { p: to, w: end[0], h: end[1] }], {
        sides: 8, ref: options.ref ?? [0, 1, 0], capStart: 0, capEnd: 0, flat: true,
        profile: [[1, -1 + cy], [1, 1 - cy], [1 - cx, 1], [-1 + cx, 1], [-1, 1 - cy], [-1, -1 + cy], [-1 + cx, -1], [1 - cx, -1]],
        token: options.token, bones: options.bones, shade: options.shade
      });
      return;
    }
    this.addLoft([
      { p: from, w: half[0] * Math.SQRT2, h: half[1] * Math.SQRT2 },
      { p: to, w: end[0] * Math.SQRT2, h: end[1] * Math.SQRT2 }
    ], {
      sides: 4, phase: Math.PI / 4, ref: options.ref ?? [0, 1, 0], capStart: 0, capEnd: 0,
      flat: true, token: options.token, bones: options.bones, shade: options.shade
    });
  }

  /** Small closed ellipsoid for eyes, noses and pads, stacked along +Z. */
  public addEllipsoid(centre: V3, radii: V3, options: { bones?: Weights; token: number; sides?: number; shade?: number }): void {
    const [cx, cy, cz] = centre;
    const [rx, ry, rz] = radii;
    const stations: Station[] = [-0.5, 0, 0.5].map((t) => {
      const s = Math.sqrt(1 - t * t);
      return { p: [cx, cy, cz + t * rz], w: rx * s, h: ry * s };
    });
    const bulge = (rz * 0.5) / (Math.min(rx, ry) * Math.sqrt(0.75));
    this.addLoft(stations, {
      sides: options.sides ?? 6,
      ref: [0, 1, 0],
      capStart: bulge,
      capEnd: bulge,
      bones: options.bones,
      token: options.token,
      shade: options.shade
    });
  }

  /**
   * A flat or gently domed disc facing `normal`: an eye, a spot, a rivet head. Open and one-sided,
   * so it must sit on a surface that hides its back; `lift` raises it off that surface and `dome`
   * raises its centre. `radius` is [along `up`, across]; `up` fixes the disc's in-plane orientation.
   * `rect` makes it a rectangle with those half-extents (a label, a pane, a painted panel) instead of
   * the diamond a four-sided disc would be.
   */
  public addDisc(
    centre: V3, normal: V3, radius: number | readonly [number, number],
    options: {
      token: number; up?: V3; sides?: number; lift?: number; dome?: number;
      bones?: Weights; shade?: number; rect?: boolean;
    }
  ): void {
    const n = new THREE.Vector3(...normal).normalize();
    const hint = new THREE.Vector3(...(options.up ?? [0, 1, 0]));
    if (Math.abs(hint.dot(n)) > 0.95) hint.set(1, 0, 0);
    const up = hint.sub(n.clone().multiplyScalar(hint.dot(n))).normalize();
    const across = new THREE.Vector3().crossVectors(up, n);
    const corner = options.rect ? Math.SQRT2 : 1;
    const [ru, ra] = (typeof radius === "number" ? [radius, radius] : radius).map((r) => r * corner);
    const sides = options.rect ? 4 : options.sides ?? 8;
    const phase = options.rect ? Math.PI / 4 : 0;
    const base = new THREE.Vector3(...centre).addScaledVector(n, options.lift ?? 0);
    const weights = options.bones ?? {};
    const hub = this.vertices.length;
    this.vertices.push({ p: base.clone().addScaledVector(n, options.dome ?? 0), weights });
    for (let k = 0; k < sides; k += 1) {
      const angle = phase + (k / sides) * Math.PI * 2;
      this.vertices.push({
        p: base.clone().addScaledVector(up, Math.cos(angle) * ru).addScaledVector(across, Math.sin(angle) * ra),
        weights
      });
    }
    const shade = clampShade(options.shade ?? 1);
    for (let k = 0; k < sides; k += 1) {
      const a = hub + 1 + k;
      const b = hub + 1 + ((k + 1) % sides);
      const face = new THREE.Vector3().subVectors(this.vertices[a].p, this.vertices[hub].p)
        .cross(new THREE.Vector3().subVectors(this.vertices[b].p, this.vertices[hub].p));
      this.triangles.push(face.dot(n) >= 0
        ? { a: hub, b: a, c: b, token: options.token, flat: false, shade }
        : { a: hub, b, c: a, token: options.token, flat: false, shade });
    }
  }

  /**
   * A triangle fan from `hub` over a closed `ring`, facing `normal`: a spot or scute conformed to a
   * curved surface, where a flat disc would float off it. Open and one-sided, like `addDisc`.
   */
  public addPatch(
    hub: V3, ring: readonly V3[], normal: V3,
    options: { token: number; bones?: Weights; shade?: number; tone?: number }
  ): void {
    const n = new THREE.Vector3(...normal);
    const weights = options.bones ?? {};
    const first = this.vertices.length;
    this.vertices.push({ p: new THREE.Vector3(...hub), weights, tone: options.tone });
    for (const point of ring) this.vertices.push({ p: new THREE.Vector3(...point), weights, tone: options.tone });
    const shade = clampShade(options.shade ?? 1);
    for (let k = 0; k < ring.length; k += 1) {
      const a = first + 1 + k;
      const b = first + 1 + ((k + 1) % ring.length);
      const face = new THREE.Vector3().subVectors(this.vertices[a].p, this.vertices[first].p)
        .cross(new THREE.Vector3().subVectors(this.vertices[b].p, this.vertices[first].p));
      if (face.lengthSq() < 1e-16) continue;
      this.triangles.push(face.dot(n) >= 0
        ? { a: first, b: a, c: b, token: options.token, flat: false, shade }
        : { a: first, b, c: a, token: options.token, flat: false, shade });
    }
  }

  /**
   * A thin slab laid over a (cols x rows) grid: cloth, fans, flags. The front and back sheets share
   * vertices within themselves so the cloth shades softly, the rim walls are hard-edged, and the
   * whole panel is closed, so it lights and shadows correctly from both sides without a double-sided
   * material. Faces are wound against the local grid normal, never assumed.
   */
  public addPanel(options: PanelOptions): void {
    const { cols, rows } = options;
    const wrap = options.wrap ?? false;
    const column = (i: number): number => (wrap ? ((i % cols) + cols) % cols : i);
    const thickness = (i: number, j: number): number =>
      typeof options.thickness === "function" ? options.thickness(column(i) / cols, j / rows) : options.thickness;
    const tone = (i: number, j: number): number | undefined => options.tone?.(column(i) / cols, j / rows);
    const inside = options.inside ?? (() => true);
    const bones = options.bones ?? {};
    const weights = (p: THREE.Vector3): Weights => (typeof bones === "function" ? bones(p) : bones);
    const mid = (i: number, j: number): THREE.Vector3 => options.point(column(i) / cols, j / rows);
    const gridNormal = (i: number, j: number): THREE.Vector3 => {
      const du = wrap
        ? mid(i + 1, j).sub(mid(i - 1, j))
        : mid(Math.min(cols, i + 1), j).sub(mid(Math.max(0, i - 1), j));
      const dv = mid(i, Math.min(rows, j + 1)).sub(mid(i, Math.max(0, j - 1)));
      return new THREE.Vector3().crossVectors(du, dv).normalize();
    };
    const cellInside = (i: number, j: number): boolean => {
      const c = column(i);
      return c >= 0 && j >= 0 && c < cols && j < rows && inside((c + 0.5) / cols, (j + 0.5) / rows);
    };

    const sheets = [new Map<number, number>(), new Map<number, number>()];
    const sheetVertex = (sheet: 0 | 1, i: number, j: number): number => {
      const key = j * (cols + 1) + column(i);
      const existing = sheets[sheet].get(key);
      if (existing !== undefined) return existing;
      const offset = gridNormal(i, j).multiplyScalar((sheet === 0 ? 0.5 : -0.5) * thickness(i, j));
      const index = this.vertices.length;
      const p = mid(i, j).add(offset);
      this.vertices.push({ p, weights: weights(p), tone: tone(i, j) });
      sheets[sheet].set(key, index);
      return index;
    };
    const push = (a: number, b: number, c: number, want: THREE.Vector3, token: number, flat: boolean, shade: number): void => {
      const pa = this.vertices[a].p;
      const n = new THREE.Vector3().subVectors(this.vertices[b].p, pa)
        .cross(new THREE.Vector3().subVectors(this.vertices[c].p, pa));
      if (n.lengthSq() < 1e-16) return;
      this.triangles.push(n.dot(want) >= 0 ? { a, b, c, token, flat, shade } : { a, b: c, c: b, token, flat, shade });
    };

    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        if (!cellInside(i, j)) continue;
        const token = options.token((i + 0.5) / cols, (j + 0.5) / rows);
        const shade = clampShade(options.shade?.((i + 0.5) / cols, (j + 0.5) / rows) ?? 1);
        const normal = gridNormal(i, j).add(gridNormal(i + 1, j + 1)).normalize();
        for (const sheet of [0, 1] as const) {
          const want = sheet === 0 ? normal : normal.clone().negate();
          const a = sheetVertex(sheet, i, j);
          const b = sheetVertex(sheet, i + 1, j);
          const c = sheetVertex(sheet, i + 1, j + 1);
          const d = sheetVertex(sheet, i, j + 1);
          push(a, b, c, want, token, false, shade);
          push(a, c, d, want, token, false, shade);
        }
        // Rim walls where the neighbouring cell is outside the panel.
        const centre = mid(i, j).add(mid(i + 1, j + 1)).multiplyScalar(0.5);
        const edges: Array<[number, number, number, number, number, number]> = [
          [i, j, i + 1, j, 0, -1],
          [i + 1, j, i + 1, j + 1, 1, 0],
          [i + 1, j + 1, i, j + 1, 0, 1],
          [i, j + 1, i, j, -1, 0]
        ];
        for (const [i0, j0, i1, j1, di, dj] of edges) {
          if (cellInside(i + di, j + dj)) continue;
          const corners: Array<[THREE.Vector3, number | undefined]> = [
            [mid(i0, j0).addScaledVector(gridNormal(i0, j0), thickness(i0, j0) * 0.5), tone(i0, j0)],
            [mid(i1, j1).addScaledVector(gridNormal(i1, j1), thickness(i1, j1) * 0.5), tone(i1, j1)],
            [mid(i1, j1).addScaledVector(gridNormal(i1, j1), -thickness(i1, j1) * 0.5), tone(i1, j1)],
            [mid(i0, j0).addScaledVector(gridNormal(i0, j0), -thickness(i0, j0) * 0.5), tone(i0, j0)]
          ];
          const outward = mid(i0, j0).add(mid(i1, j1)).multiplyScalar(0.5).sub(centre);
          const first = this.vertices.length;
          for (const [p, value] of corners) this.vertices.push({ p, weights: weights(p), tone: value });
          push(first, first + 1, first + 2, outward, token, true, shade);
          push(first, first + 2, first + 3, outward, token, true, shade);
        }
      }
    }
  }

  public triangleCount(): number {
    return this.triangles.length;
  }

  public buildSkinned(name: string, skeleton: THREE.Skeleton): THREE.SkinnedMesh {
    const geometry = this.geometry(skeleton);
    const mesh = new THREE.SkinnedMesh(geometry, this.tokens.map(tokenMaterial));
    mesh.name = name;
    return mesh;
  }

  public buildMesh(name: string): THREE.Mesh {
    const mesh = new THREE.Mesh(this.geometry(null), this.tokens.map(tokenMaterial));
    mesh.name = name;
    return mesh;
  }

  /**
   * One BufferGeometry with a group per palette token, in the pipeline's colour contract.
   *
   * Normals are computed on the shared topology first, so a part shades smoothly across a marking
   * edge (normal groups follow construction, never palette boundaries). Vertices are then split per
   * token, because `COLOR_0` is per vertex: a vertex on a saddle edge becomes one coat vertex and one
   * saddle vertex with the same normal. Flat triangles get their own three vertices and stay faceted.
   * A per-face `shade` darkens the token colour as a value mask; a vertex shared by faces of two
   * shades splits the same way, so the tone steps at the face edge while the normal stays smooth.
   */
  private geometry(skeleton: THREE.Skeleton | null): THREE.BufferGeometry {
    const vertices = [...this.vertices];
    const triangles = this.triangles.map((triangle) => {
      if (!triangle.flat) return triangle;
      const start = vertices.length;
      for (const index of [triangle.a, triangle.b, triangle.c]) {
        vertices.push({ ...this.vertices[index], p: this.vertices[index].p.clone() });
      }
      return { ...triangle, a: start, b: start + 1, c: start + 2 };
    });

    // Area-weighted vertex normals on the shared topology.
    const normals = vertices.map(() => new THREE.Vector3());
    const edgeA = new THREE.Vector3();
    const edgeB = new THREE.Vector3();
    for (const { a, b, c } of triangles) {
      edgeA.subVectors(vertices[b].p, vertices[a].p);
      edgeB.subVectors(vertices[c].p, vertices[a].p);
      const face = new THREE.Vector3().crossVectors(edgeA, edgeB);
      normals[a].add(face);
      normals[b].add(face);
      normals[c].add(face);
    }
    for (const normal of normals) {
      if (normal.lengthSq() > 0) normal.normalize();
      else normal.set(0, 1, 0);
    }

    const colours = this.tokens.map(tokenLinearColor);
    const boneIndex = skeleton ? new Map(skeleton.bones.map((bone, i) => [bone.name, i])) : null;
    const positions: number[] = [];
    const normalValues: number[] = [];
    const colourValues: number[] = [];
    const skinIndex: number[] = [];
    const skinWeight: number[] = [];
    const index: number[] = [];
    const geometry = new THREE.BufferGeometry();
    let vertexCount = 0;
    let start = 0;
    for (let token = 0; token < this.tokens.length; token += 1) {
      const group = triangles.filter((triangle) => triangle.token === token);
      if (!group.length) continue;
      const local = new Map<string, number>();
      const colour = colours[token];
      const emit = (original: number, shade: number): number => {
        const key = `${original}:${shade}`;
        const existing = local.get(key);
        if (existing !== undefined) return existing;
        const vertex = vertices[original];
        positions.push(vertex.p.x, vertex.p.y, vertex.p.z);
        normalValues.push(normals[original].x, normals[original].y, normals[original].z);
        // Never lift a bright token past 1 in any channel: glTF clamps COLOR_0 to 0..1.
        const value = Math.min(clampShade(shade * (vertex.tone ?? 1)), 1 / Math.max(colour.r, colour.g, colour.b, 1e-6));
        colourValues.push(colour.r * value, colour.g * value, colour.b * value);
        if (boneIndex) {
          const entries = Object.entries(vertex.weights)
            .filter(([, weight]) => weight > 0)
            .sort((l, r) => r[1] - l[1])
            .slice(0, 4);
          if (!entries.length) throw new Error("Skinned vertex has no bone weights");
          const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
          for (let slot = 0; slot < 4; slot += 1) {
            const entry = entries[slot];
            if (!entry) {
              skinIndex.push(0);
              skinWeight.push(0);
              continue;
            }
            const resolved = boneIndex.get(entry[0]);
            if (resolved === undefined) throw new Error(`Unknown bone ${entry[0]}`);
            skinIndex.push(resolved);
            skinWeight.push(entry[1] / total);
          }
        }
        local.set(key, vertexCount);
        vertexCount += 1;
        return vertexCount - 1;
      };
      for (const triangle of group) {
        index.push(emit(triangle.a, triangle.shade), emit(triangle.b, triangle.shade), emit(triangle.c, triangle.shade));
      }
      geometry.addGroup(start, group.length * 3, token);
      start += group.length * 3;
    }
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normalValues, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colourValues, 3));
    if (boneIndex) {
      geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
      geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));
    }
    geometry.setIndex(index);
    return geometry;
  }
}
