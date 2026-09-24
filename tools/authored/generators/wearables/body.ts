import * as THREE from "three";

import type { Weights } from "../../kit";
import data from "./playerBody.json";

/**
 * The player body the wearables fit to: `char_player_a` at bind pose (T-pose, facing +Z), in its root
 * frame, sampled by `tools/authored/scripts/extract-player-body.mjs`. Garments are shaped against its
 * real surface and borrow its skin weights, so a coat moves exactly as the body beneath it does.
 */

export interface BodyPoint {
  p: THREE.Vector3;
  n: THREE.Vector3;
  tag: string;
  weights: Weights;
}

const BONE_NAMES = data.bones.map(([name]) => String(name));

/** Bind-pose joint positions by bone name. */
export const BODY_BONES: ReadonlyMap<string, THREE.Vector3> = new Map(
  data.bones.map(([name, x, y, z]) => [String(name), new THREE.Vector3(Number(x), Number(y), Number(z))])
);

export const BODY_POINTS: readonly BodyPoint[] = data.tagOf.map((tag, i) => {
  const weights: Weights = {};
  for (let k = 0; k < 3; k += 1) {
    const w = data.weights[i * 3 + k] / 255;
    if (w > 0) {
      const bone = BONE_NAMES[data.joints[i * 3 + k]];
      weights[bone] = (weights[bone] ?? 0) + w;
    }
  }
  return {
    p: new THREE.Vector3(data.positions[i * 3] / 1000, data.positions[i * 3 + 1] / 1000, data.positions[i * 3 + 2] / 1000),
    n: new THREE.Vector3(data.normals[i * 3] / 127, data.normals[i * 3 + 1] / 127, data.normals[i * 3 + 2] / 127).normalize(),
    tag: data.tags[tag],
    weights
  };
});

export function bodyPoints(filter: (point: BodyPoint) => boolean): BodyPoint[] {
  return BODY_POINTS.filter(filter);
}

/**
 * Skin weights at a garment point: the inverse-distance blend of its `k` nearest body points, so a
 * cuff follows the wrist and a waistband the hips exactly as the body there does.
 */
export function weightsNear(points: readonly BodyPoint[], at: THREE.Vector3, k = 4): Weights {
  // Linear scan keeping the k best: garments ask this thousands of times.
  const nearest: Array<{ point: BodyPoint; d: number }> = [];
  for (const point of points) {
    const d = point.p.distanceToSquared(at);
    if (nearest.length < k || d < nearest[nearest.length - 1].d) {
      nearest.push({ point, d });
      nearest.sort((l, r) => l.d - r.d);
      if (nearest.length > k) nearest.pop();
    }
  }
  const blend: Weights = {};
  let total = 0;
  for (const { point, d } of nearest) {
    const w = 1 / (Math.sqrt(d) + 0.004);
    total += w;
    for (const [bone, value] of Object.entries(point.weights)) blend[bone] = (blend[bone] ?? 0) + value * w;
  }
  for (const bone of Object.keys(blend)) blend[bone] /= total;
  return blend;
}

/**
 * The body's outer surface round an axis, as a smoothed grid: for a position `t` along the axis and
 * an angle about it, the furthest body point's distance from the axis. Garments add their ease and
 * cloth thickness to this, so they clear the body everywhere and hug it where it is narrow.
 */
export class Envelope {
  private readonly grid: number[][];

  constructor(
    points: readonly BodyPoint[],
    private readonly origin: THREE.Vector3,
    private readonly axis: THREE.Vector3,
    private readonly zero: THREE.Vector3,
    private readonly t0: number,
    private readonly t1: number,
    private readonly rows: number,
    private readonly angles: number,
    fallback: number,
    /** Bridge concavities (between the legs, the small of the back) as cloth does: each ring's convex hull. */
    hull = false
  ) {
    const side = new THREE.Vector3().crossVectors(axis, zero);
    const grid = Array.from({ length: rows }, () => new Array<number>(angles).fill(-1));
    const offset = new THREE.Vector3();
    for (const { p } of points) {
      offset.subVectors(p, origin);
      const t = offset.dot(axis);
      if (t < t0 - (t1 - t0) / rows || t > t1 + (t1 - t0) / rows) continue;
      const x = offset.dot(zero);
      const y = offset.dot(side);
      const row = Math.round(((t - t0) / (t1 - t0)) * (rows - 1));
      const angle = Math.round((((Math.atan2(y, x) / (Math.PI * 2)) + 1) % 1) * angles) % angles;
      if (row < 0 || row >= rows) continue;
      grid[row][angle] = Math.max(grid[row][angle], Math.hypot(x, y));
    }
    // Fill empty cells from their neighbours round the ring, then along the axis.
    for (const ring of grid) {
      if (ring.every((r) => r < 0)) continue;
      for (let pass = 0; pass < angles; pass += 1) {
        for (let a = 0; a < angles; a += 1) {
          if (ring[a] >= 0) continue;
          const l = ring[(a + angles - 1) % angles];
          const r = ring[(a + 1) % angles];
          if (l >= 0 || r >= 0) ring[a] = Math.max(l, r);
        }
      }
    }
    for (let row = 0; row < rows; row += 1) {
      if (grid[row].some((r) => r >= 0)) continue;
      const near = grid.map((ring, i) => ({ ring, d: Math.abs(i - row) })).filter(({ ring }) => ring.some((r) => r >= 0)).sort((a, b) => a.d - b.d)[0];
      grid[row] = near ? [...near.ring] : new Array<number>(angles).fill(fallback);
    }
    if (hull) for (let row = 0; row < rows; row += 1) grid[row] = convexRing(grid[row]);
    // Smooth, keeping the outer surface: a max over each cell's close neighbours.
    this.grid = grid.map((ring, row) => ring.map((_, a) => {
      let r = 0;
      for (let dr = -1; dr <= 1; dr += 1) {
        const rr = grid[Math.min(rows - 1, Math.max(0, row + dr))];
        for (let da = -1; da <= 1; da += 1) r = Math.max(r, rr[(a + da + angles) % angles] * (dr === 0 && da === 0 ? 1 : 0.985));
      }
      return r;
    }));
  }

  /** Surface distance from the axis at `t` along it and `angle` (radians) from `zero`, interpolated. */
  radius(t: number, angle: number): number {
    const fr = THREE.MathUtils.clamp(((t - this.t0) / (this.t1 - this.t0)) * (this.rows - 1), 0, this.rows - 1);
    const fa = ((((angle / (Math.PI * 2)) % 1) + 1) % 1) * this.angles;
    const r0 = Math.floor(fr);
    const r1 = Math.min(this.rows - 1, r0 + 1);
    const a0 = Math.floor(fa) % this.angles;
    const a1 = (a0 + 1) % this.angles;
    const u = fr - r0;
    const v = fa - Math.floor(fa);
    const at = (r: number, a: number): number => this.grid[r][a];
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(r0, a0), at(r0, a1), v), THREE.MathUtils.lerp(at(r1, a0), at(r1, a1), v), u);
  }

  /** The point on (or `ease` outside) the surface at `t` and `angle`. */
  point(t: number, angle: number, ease = 0): THREE.Vector3 {
    const side = new THREE.Vector3().crossVectors(this.axis, this.zero);
    const r = this.radius(t, angle) + ease;
    return this.origin.clone().addScaledVector(this.axis, t)
      .addScaledVector(this.zero, Math.cos(angle) * r).addScaledVector(side, Math.sin(angle) * r);
  }
}

/** A polar ring (radius per equal angle step) replaced by its convex hull, read back along the same angles. */
function convexRing(ring: readonly number[]): number[] {
  const n = ring.length;
  const points = ring.map((r, a) => [Math.cos((a / n) * Math.PI * 2) * r, Math.sin((a / n) * Math.PI * 2) * r] as const)
    .sort((l, r) => l[0] - r[0] || l[1] - r[1]);
  const cross = (o: readonly number[], a: readonly number[], b: readonly number[]): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<readonly [number, number]> = [];
  const upper: Array<readonly [number, number]> = [];
  for (const p of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  for (const p of [...points].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  const polygon = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return ring.map((r, a) => {
    const dx = Math.cos((a / n) * Math.PI * 2);
    const dy = Math.sin((a / n) * Math.PI * 2);
    let best = r;
    for (let k = 0; k < polygon.length; k += 1) {
      const [x0, y0] = polygon[k];
      const [x1, y1] = polygon[(k + 1) % polygon.length];
      // Ray t*(dx, dy) against the edge p0 + s*(p1 - p0).
      const ex = x1 - x0;
      const ey = y1 - y0;
      const det = dx * -ey - dy * -ex;
      if (Math.abs(det) < 1e-12) continue;
      const t = (x0 * -ey - y0 * -ex) / det;
      const s = (dx * y0 - dy * x0) / det;
      if (s >= -1e-9 && s <= 1 + 1e-9 && t > best) best = t;
    }
    return best;
  });
}
