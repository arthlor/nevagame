/**
 * Shared world-space Worley cells for meadow mosaic and road-edge agreement.
 * Terrain and road shaders must inject this exact snippet so grass/dirt
 * boundaries use the same field. Presentation only: no displacement.
 */
export const GROUND_POLYGON_CELL_GLSL = /* glsl */ `
vec2 nevaGroundCellJitter(vec2 cell) {
  vec2 signal = vec2(
    dot(cell, vec2(127.1, 311.7)),
    dot(cell, vec2(269.5, 183.3))
  );
  return fract(sin(signal) * 43758.5453123);
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
        nearestSignal = nevaGroundCellJitter(candidateCell + vec2(19.7, 47.3)).x;
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
