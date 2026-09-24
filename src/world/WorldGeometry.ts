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
  /** Lazily built per cell; see `cellCandidates`. */
  private readonly candidates = new Map<number, Int32Array>();
  private readonly rows = new Map<number, number[]>();
  private readonly minCellX: number;
  private readonly maxCellX: number;
  private readonly minCellZ: number;
  private readonly maxCellZ: number;

  constructor(readonly loop: readonly Readonly<Point2D>[], readonly cellMeters = 32) {
    let minCellX = Infinity, maxCellX = -Infinity, minCellZ = Infinity, maxCellZ = -Infinity;
    for (let index = 0; index < loop.length; index++) {
      const a = loop[index], b = loop[(index + 1) % loop.length];
      const x0 = Math.floor(Math.min(a.x, b.x) / cellMeters), x1 = Math.floor(Math.max(a.x, b.x) / cellMeters);
      const z0 = Math.floor(Math.min(a.z, b.z) / cellMeters), z1 = Math.floor(Math.max(a.z, b.z) / cellMeters);
      minCellX = Math.min(minCellX, x0); maxCellX = Math.max(maxCellX, x1);
      minCellZ = Math.min(minCellZ, z0); maxCellZ = Math.max(maxCellZ, z1);
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
   * Segments that can be nearest for some point of cell (cx, cz), ascending.
   * Distance to a segment is 1-Lipschitz and convex, so over the cell it lies
   * within `d(centre) ± half-diagonal` and peaks at a corner. A winner, and any
   * segment tied with it, therefore satisfies `d(centre) - half <= bound`,
   * where `bound` is the least corner maximum over all segments. The margin
   * absorbs floating-point rounding; extra candidates never change the answer.
   */
  private cellCandidates(cx: number, cz: number): Int32Array {
    const key = this.key(cx, cz);
    const cached = this.candidates.get(key);
    if (cached) return cached;
    const loop = this.loop, cell = this.cellMeters, count = loop.length;
    const x0 = cx * cell, z0 = cz * cell, x1 = x0 + cell, z1 = z0 + cell;
    const centerX = x0 + cell / 2, centerZ = z0 + cell / 2, half = cell * Math.SQRT1_2;
    const centerDistance = new Float64Array(count);
    let bound = Infinity;
    for (let segment = 0; segment < count; segment++) {
      const a = loop[segment], b = loop[(segment + 1) % count];
      centerDistance[segment] = pointSegmentDistance(centerX, centerZ, a, b);
      bound = Math.min(bound, Math.max(
        pointSegmentDistance(x0, z0, a, b), pointSegmentDistance(x1, z0, a, b),
        pointSegmentDistance(x0, z1, a, b), pointSegmentDistance(x1, z1, a, b)
      ));
    }
    const selected: number[] = [];
    for (let segment = 0; segment < count; segment++) {
      if (centerDistance[segment] - half <= bound + 1e-6) selected.push(segment);
    }
    const list = Int32Array.from(selected);
    this.candidates.set(key, list);
    return list;
  }

  /**
   * Index of the segment (from vertex `i` to `i + 1`) minimising `distanceOf`,
   * which must be a point-to-segment distance for the query point.
   */
  nearest(x: number, z: number, distanceOf: (segment: number) => number): { segment: number; distance: number } {
    const gx = Math.floor(x / this.cellMeters), gz = Math.floor(z / this.cellMeters);
    const outside = Math.max(this.minCellX - gx, gx - this.maxCellX, this.minCellZ - gz, gz - this.maxCellZ);
    let best = Infinity, bestSegment = -1;
    const consider = (segment: number): void => {
      const distance = distanceOf(segment);
      if (distance < best || (distance === best && segment < bestSegment)) {
        best = distance;
        bestSegment = segment;
      }
    };
    // Candidate lists cover the whole playable world; only absurdly distant
    // queries walk the loop, which also keeps every cell key in range.
    if (outside > 128) {
      for (let segment = 0; segment < this.loop.length; segment++) consider(segment);
    } else {
      for (const segment of this.cellCandidates(gx, gz)) consider(segment);
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
