/** Authored harbor landform. Pure world data: no renderer, state or marine-query dependency. */
export const HARBOR_COAST_BOUNDS = Object.freeze({ minX: 54, maxX: 164, minZ: 40, maxZ: 134 });

export const HARBOR_BEACH_PATH = Object.freeze([
  { x: 64.5, z: 54.5 }, { x: 73, z: 54.5 }, { x: 83, z: 53 }, { x: 94, z: 54.5 },
  { x: 104, z: 59 }, { x: 113, z: 61 }, { x: 122, z: 67 }, { x: 133, z: 70 }
]);
export const HARBOR_LANDING_PATH = Object.freeze([
  { x: 83, z: 53 }, { x: 88, z: 58 }, { x: 91, z: 63 }, { x: 93, z: 68.5 }
]);

export function coastSmooth(a: number, b: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function harborCoastContains(x: number, z: number): boolean {
  const b = HARBOR_COAST_BOUNDS;
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

export function harborCoastInfluence(x: number, z: number): number {
  return coastSmooth(78, 98, x) * (1 - coastSmooth(148, 164, x))
    * coastSmooth(40, 51, z) * (1 - coastSmooth(116, 134, z));
}

/** The established landing and hull lanes stay west of the new coves. */
export function harborShoreOffset(x: number): number {
  const edge = coastSmooth(97, 105, x) * (1 - coastSmooth(148, 162, x));
  const cove = -3.1 * Math.exp(-(((x - 116) / 8.5) ** 2));
  const rockSpur = 2.2 * Math.exp(-(((x - 139) / 5.8) ** 2));
  return (cove + rockSpur) * edge;
}

/** Mean-sea-level shore, with a matching derivative on either side of the wash. */
export function harborCoastElevation(x: number, z: number, shorelineZ: number): number {
  const distance = z - shorelineZ;
  if (distance > 0) return -0.055 * distance - 0.0018 * distance * distance;
  const inland = -distance;
  const dune = coastSmooth(5, 20, inland) * 0.7 + coastSmooth(18, 32, inland) * 1.25;
  const relief = Math.sin(x * 0.22 + inland * 0.29) * 0.045 * coastSmooth(1, 8, inland);
  return inland * 0.055 + dune + relief;
}

export function harborSandInfluence(x: number, z: number, shorelineZ: number): number {
  const inland = shorelineZ - z;
  const dryBeachWidth = 7 + coastSmooth(118, 130, x) * 6;
  const edge = 1 - coastSmooth(dryBeachWidth, dryBeachWidth + 10, inland + Math.sin(x * 0.17) * 1.2);
  return harborCoastInfluence(x, z) * edge;
}
