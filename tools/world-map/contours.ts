export interface Point { x: number; z: number }
export interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number }

/** Linear marching squares. A deterministic centre-sign rule resolves saddle cells. */
export function contours(field: (x: number, z: number) => number, bounds: Bounds, step: number): Point[][] {
  if (!(step > 0) || !(bounds.maxX > bounds.minX) || !(bounds.maxZ > bounds.minZ)) {
    throw new Error("Water contours require positive sampling steps and non-empty bounds.");
  }
  const nx = Math.ceil((bounds.maxX - bounds.minX) / step) + 1;
  const nz = Math.ceil((bounds.maxZ - bounds.minZ) / step) + 1;
  const values = new Float64Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const value = field(bounds.minX + i * step, bounds.minZ + j * step);
    if (!Number.isFinite(value)) throw new Error("Water contour query returned a non-finite value.");
    if ((i === 0 || j === 0 || i === nx - 1 || j === nz - 1) && value >= 0) {
      throw new Error("Water contour touches its sampling bounds; increase waterContourMarginMeters.");
    }
    values[j * nx + i] = value;
  }
  const segments: [Point, Point][] = [];
  const adjacency = new Map<string, number[]>();
  const key = (point: Point): string => `${point.x.toFixed(5)},${point.z.toFixed(5)}`;
  function add(a: Point, b: Point): void {
    const index = segments.length;
    segments.push([a, b]);
    for (const point of [a, b]) adjacency.set(key(point), [...(adjacency.get(key(point)) ?? []), index]);
  }
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const x = bounds.minX + i * step, z = bounds.minZ + j * step;
    const points = [{ x, z }, { x: x + step, z }, { x: x + step, z: z + step }, { x, z: z + step }];
    const cell = [values[j * nx + i], values[j * nx + i + 1], values[(j + 1) * nx + i + 1], values[(j + 1) * nx + i]];
    const hits: Point[] = [];
    for (let edge = 0; edge < 4; edge++) {
      const next = (edge + 1) % 4;
      if ((cell[edge] > 0) === (cell[next] > 0)) continue;
      const fraction = cell[edge] / (cell[edge] - cell[next]);
      hits.push({ x: points[edge].x + fraction * (points[next].x - points[edge].x),
        z: points[edge].z + fraction * (points[next].z - points[edge].z) });
    }
    if (hits.length === 2) add(hits[0], hits[1]);
    if (hits.length === 4) {
      const center = field(x + step / 2, z + step / 2);
      if ((cell[0] > 0) === (center > 0)) {
        add(hits[0], hits[1]); add(hits[2], hits[3]);
      } else {
        add(hits[0], hits[3]); add(hits[1], hits[2]);
      }
    }
  }
  const used = new Set<number>();
  const loops: Point[][] = [];
  for (let index = 0; index < segments.length; index++) {
    if (used.has(index)) continue;
    used.add(index);
    const loop = [...segments[index]];
    let last = key(loop[loop.length - 1]);
    while (true) {
      const next = (adjacency.get(last) ?? []).find(candidate => !used.has(candidate));
      if (next === undefined) break;
      used.add(next);
      const segment = segments[next];
      const point = key(segment[0]) === last ? segment[1] : segment[0];
      loop.push(point);
      last = key(point);
    }
    if (loop.length > 3) {
      if (last !== key(loop[0])) throw new Error("Water contour touches its sampling bounds; increase waterContourMarginMeters.");
      loops.push(loop);
    }
  }
  return loops.sort((a, b) => b.length - a.length);
}
