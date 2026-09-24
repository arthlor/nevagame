export interface Point2D {
  x: number;
  z: number;
}

export function pointSegmentDistance(
  x: number,
  z: number,
  start: Readonly<Point2D>,
  end: Readonly<Point2D>
): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 0.000001) return Math.hypot(x - start.x, z - start.z);
  const t = Math.max(0, Math.min(1, ((x - start.x) * dx + (z - start.z) * dz) / lengthSquared));
  return Math.hypot(x - (start.x + dx * t), z - (start.z + dz * t));
}

export function isInsideLoop(
  x: number,
  z: number,
  loop: readonly Readonly<Point2D>[]
): boolean {
  let inside = false;
  for (let current = 0, previous = loop.length - 1; current < loop.length; previous = current++) {
    const a = loop[current];
    const b = loop[previous];
    const crosses = (a.z > z) !== (b.z > z)
      && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

/**
 * Exact spatial index over a closed loop. Nearest-segment and inside queries
 * return bit-identical results to the brute-force loop walks above: the same
 * per-segment arithmetic runs on a candidate set that provably contains the
 * winner, and ties resolve to the lowest segment index as a forward walk does.
 */
export class LoopSegmentIndex {
  private readonly cells = new Map<number, number[]>();
  private readonly rows = new Map<number, number[]>();
  private readonly stamp: Uint32Array;
  private query = 0;
  private readonly minCellX: number;
  private readonly maxCellX: number;
  private readonly minCellZ: number;
  private readonly maxCellZ: number;

  constructor(readonly loop: readonly Readonly<Point2D>[], readonly cellMeters = 32) {
    this.stamp = new Uint32Array(loop.length);
    let minCellX = Infinity, maxCellX = -Infinity, minCellZ = Infinity, maxCellZ = -Infinity;
    for (let index = 0; index < loop.length; index++) {
      const a = loop[index], b = loop[(index + 1) % loop.length];
      const x0 = Math.floor(Math.min(a.x, b.x) / cellMeters), x1 = Math.floor(Math.max(a.x, b.x) / cellMeters);
      const z0 = Math.floor(Math.min(a.z, b.z) / cellMeters), z1 = Math.floor(Math.max(a.z, b.z) / cellMeters);
      minCellX = Math.min(minCellX, x0); maxCellX = Math.max(maxCellX, x1);
      minCellZ = Math.min(minCellZ, z0); maxCellZ = Math.max(maxCellZ, z1);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const key = this.key(cx, cz), bucket = this.cells.get(key) ?? [];
        bucket.push(index);
        this.cells.set(key, bucket);
      }
      for (let row = z0; row <= z1; row++) {
        const bucket = this.rows.get(row) ?? [];
        bucket.push(index);
        this.rows.set(row, bucket);
      }
    }
    this.minCellX = minCellX; this.maxCellX = maxCellX;
    this.minCellZ = minCellZ; this.maxCellZ = maxCellZ;
  }

  private key(cx: number, cz: number): number {
    return (cx + 32768) * 65536 + (cz + 32768);
  }

  /**
   * Index of the segment (from vertex `i` to `i + 1`) minimising `distanceOf`,
   * which must be a point-to-segment distance for the query point.
   */
  nearest(x: number, z: number, distanceOf: (segment: number) => number): { segment: number; distance: number } {
    const cell = this.cellMeters;
    const gx = Math.floor(x / cell), gz = Math.floor(z / cell);
    let best = Infinity, bestSegment = -1;
    const consider = (segment: number): void => {
      const distance = distanceOf(segment);
      if (distance < best || (distance === best && segment < bestSegment)) {
        best = distance;
        bestSegment = segment;
      }
    };
    const outside = Math.max(this.minCellX - gx, gx - this.maxCellX, this.minCellZ - gz, gz - this.maxCellZ);
    if (outside > 4) {
      for (let segment = 0; segment < this.loop.length; segment++) consider(segment);
      return { segment: bestSegment, distance: best };
    }
    this.query = (this.query + 1) >>> 0;
    if (this.query === 0) { this.stamp.fill(0); this.query = 1; }
    const fx = x - gx * cell, fz = z - gz * cell;
    const edgeGap = Math.min(fx, cell - fx, fz, cell - fz);
    const maxRing = Math.max(gx - this.minCellX, this.maxCellX - gx, gz - this.minCellZ, this.maxCellZ - gz);
    for (let ring = 0; ring <= maxRing; ring++) {
      // Every unvisited segment lies wholly in cells at least this far away.
      if (ring >= 1 && (ring - 1) * cell + edgeGap > best) break;
      for (let cx = gx - ring; cx <= gx + ring; cx++) {
        const edge = cx === gx - ring || cx === gx + ring;
        for (let cz = gz - ring; cz <= gz + ring; cz += edge ? 1 : ring * 2) {
          const bucket = this.cells.get(this.key(cx, cz));
          if (bucket) for (const segment of bucket) {
            if (this.stamp[segment] === this.query) continue;
            this.stamp[segment] = this.query;
            consider(segment);
          }
          if (ring === 0) break;
        }
      }
    }
    return { segment: bestSegment, distance: best };
  }

  /** Unsigned distance to the loop, identical to a `pointSegmentDistance` walk. */
  distance(x: number, z: number): number {
    const loop = this.loop;
    return this.nearest(x, z, segment => pointSegmentDistance(x, z, loop[segment], loop[(segment + 1) % loop.length])).distance;
  }

  /** Even-odd containment, identical to `isInsideLoop` on the same loop. */
  contains(x: number, z: number): boolean {
    const bucket = this.rows.get(Math.floor(z / this.cellMeters));
    if (!bucket) return false;
    const loop = this.loop;
    let inside = false;
    for (const segment of bucket) {
      // `isInsideLoop` pairs vertex `current` with its predecessor; segment i
      // is that pair for current = i + 1.
      const a = loop[(segment + 1) % loop.length];
      const b = loop[segment];
      const crosses = (a.z > z) !== (b.z > z)
        && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x;
      if (crosses) inside = !inside;
    }
    return inside;
  }

  /** Positive outside (in water), negative inside. */
  signedDistance(x: number, z: number): number {
    const distance = this.distance(x, z);
    return this.contains(x, z) ? -distance : distance;
  }
}
