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
