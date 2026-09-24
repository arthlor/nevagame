const CELL_HASH_A = [127.1, 311.7] as const;
const CELL_HASH_B = [269.5, 183.3] as const;
const CELL_SIGNAL_OFFSET = [19.7, 47.3] as const;
const CELL_HASH_SCALE = 43758.5453123;

function fract(value: number): number {
  return value - Math.floor(value);
}

function cellJitterX(x: number, z: number): number {
  const signal = Math.fround(Math.fround(x * CELL_HASH_A[0]) + Math.fround(z * CELL_HASH_A[1]));
  return fract(Math.fround(Math.sin(signal) * CELL_HASH_SCALE));
}

function cellJitterZ(x: number, z: number): number {
  const signal = Math.fround(Math.fround(x * CELL_HASH_B[0]) + Math.fround(z * CELL_HASH_B[1]));
  return fract(Math.fround(Math.sin(signal) * CELL_HASH_SCALE));
}

export function groundPolygonCellAt(x: number, z: number, cellScale: number): { signal: number; edgeDistance: number } {
  const scale = Math.max(cellScale, 0.001);
  const px = Math.fround(x / scale);
  const pz = Math.fround(z / scale);
  const baseX = Math.floor(px);
  const baseZ = Math.floor(pz);
  const localX = fract(px);
  const localZ = fract(pz);
  let nearestDistance = 8;
  let secondNearestDistance = 8;
  let nearestSignal = 0.5;
  for (let row = -1; row <= 1; row += 1) {
    for (let column = -1; column <= 1; column += 1) {
      const cellX = baseX + column;
      const cellZ = baseZ + row;
      const dx = column + cellJitterX(cellX, cellZ) - localX;
      const dz = row + cellJitterZ(cellX, cellZ) - localZ;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared < nearestDistance) {
        secondNearestDistance = nearestDistance;
        nearestDistance = distanceSquared;
        nearestSignal = cellJitterX(
          cellX + CELL_SIGNAL_OFFSET[0], cellZ + CELL_SIGNAL_OFFSET[1]
        );
      } else if (distanceSquared < secondNearestDistance) {
        secondNearestDistance = distanceSquared;
      }
    }
  }
  return {
    signal: nearestSignal,
    edgeDistance: Math.sqrt(secondNearestDistance) - Math.sqrt(nearestDistance)
  };
}

/**
 * Shared world-space Worley cells for meadow mosaic and road-edge agreement.
 * Terrain and road shaders must inject this exact snippet so grass/dirt
 * boundaries use the same field. Presentation only: no displacement.
 */
export const GROUND_POLYGON_CELL_GLSL = /* glsl */ `
vec2 nevaGroundCellJitter(vec2 cell) {
  vec2 signal = vec2(
    dot(cell, vec2(${CELL_HASH_A[0]}, ${CELL_HASH_A[1]})),
    dot(cell, vec2(${CELL_HASH_B[0]}, ${CELL_HASH_B[1]}))
  );
  return fract(sin(signal) * ${CELL_HASH_SCALE});
}

vec4 nevaGroundPolygonCell(vec2 worldPosition, float cellScale) {
  vec2 position = worldPosition / max(cellScale, 0.001);
  vec2 baseCell = floor(position);
  vec2 localPosition = fract(position);
  float nearestDistance = 8.0;
  float secondNearestDistance = 8.0;
  float nearestSignal = 0.5;
  vec2 winningJitter = vec2(0.5);
  for (int row = -1; row <= 1; row++) {
    for (int column = -1; column <= 1; column++) {
      vec2 offset = vec2(float(column), float(row));
      vec2 candidateCell = baseCell + offset;
      vec2 jitter = nevaGroundCellJitter(candidateCell);
      vec2 delta = offset + jitter - localPosition;
      float distanceSquared = dot(delta, delta);
      if (distanceSquared < nearestDistance) {
        secondNearestDistance = nearestDistance;
        nearestDistance = distanceSquared;
        winningJitter = jitter;
        nearestSignal = nevaGroundCellJitter(candidateCell + vec2(${CELL_SIGNAL_OFFSET[0]}, ${CELL_SIGNAL_OFFSET[1]})).x;
      } else if (distanceSquared < secondNearestDistance) {
        secondNearestDistance = distanceSquared;
      }
    }
  }
  float edgeDistance = sqrt(secondNearestDistance) - sqrt(nearestDistance);
  return vec4(nearestSignal, winningJitter.x, winningJitter.y, edgeDistance);
}

float nevaGroundPolygonCellSignal(vec2 worldPosition, float cellScale) {
  return nevaGroundPolygonCell(worldPosition, cellScale).x;
}

float nevaGroundPolygonCellEdge(vec2 worldPosition, float cellScale) {
  return nevaGroundPolygonCell(worldPosition, cellScale).w;
}
`;
