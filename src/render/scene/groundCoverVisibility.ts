/**
 * Quality density is a cap on how many nearby clumps to submit, not a random
 * prefix of the world-wide placement list. A hash-sorted prefix drops grass
 * that sits beside the camera whenever it falls in the unused tail.
 *
 * The caller supplies a player/world anchor rather than a camera position or
 * look direction. Sticky keep-distance holds already-drawn clumps while that
 * anchor moves, then fills remaining slots with nearest in-range placements.
 */
export interface GroundCoverSpatialIndex {
  readonly cellSize: number;
  readonly cells: ReadonlyMap<string, readonly number[]>;
}

function groundCoverCellKey(x: number, z: number): string {
  return `${x}:${z}`;
}

export function buildGroundCoverSpatialIndex(
  instances: readonly Readonly<{ x: number; z: number }>[],
  cellSize = 20
): GroundCoverSpatialIndex {
  const cells = new Map<string, number[]>();
  for (let index = 0; index < instances.length; index += 1) {
    const instance = instances[index];
    const cellX = Math.floor(instance.x / cellSize);
    const cellZ = Math.floor(instance.z / cellSize);
    const key = groundCoverCellKey(cellX, cellZ);
    const entries = cells.get(key) ?? [];
    entries.push(index);
    cells.set(key, entries);
  }
  return { cellSize, cells };
}

export function queryGroundCoverSpatialIndex(
  index: GroundCoverSpatialIndex,
  focusX: number,
  focusZ: number,
  radius: number
): number[] {
  const minX = Math.floor((focusX - radius) / index.cellSize);
  const maxX = Math.floor((focusX + radius) / index.cellSize);
  const minZ = Math.floor((focusZ - radius) / index.cellSize);
  const maxZ = Math.floor((focusZ + radius) / index.cellSize);
  const candidates: number[] = [];
  for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
    for (let cellX = minX; cellX <= maxX; cellX += 1) {
      const entries = index.cells.get(groundCoverCellKey(cellX, cellZ));
      if (entries) candidates.push(...entries);
    }
  }
  return candidates;
}

export function selectStableGroundCoverIndices(
  instances: readonly Readonly<{ x: number; z: number }>[],
  focusX: number,
  focusZ: number,
  drawDistanceMeters: number,
  maxVisible: number,
  previousIndices: readonly number[] = [],
  keepDistanceMeters: number = drawDistanceMeters,
  candidateIndices?: readonly number[]
): number[] {
  if (maxVisible <= 0 || instances.length === 0 || drawDistanceMeters <= 0) {
    return [];
  }

  const drawDistanceSquared = drawDistanceMeters * drawDistanceMeters;
  const keepDistanceSquared = Math.max(
    drawDistanceSquared,
    keepDistanceMeters * keepDistanceMeters
  );
  const previous = new Set<number>();
  const kept: Array<{ index: number; distSq: number }> = [];
  for (const index of previousIndices) {
    if (!Number.isInteger(index) || index < 0 || index >= instances.length) continue;
    if (previous.has(index)) continue;
    previous.add(index);
    const dx = instances[index].x - focusX;
    const dz = instances[index].z - focusZ;
    const distSq = dx * dx + dz * dz;
    if (distSq <= keepDistanceSquared) kept.push({ index, distSq });
  }

  if (kept.length > maxVisible) {
    kept.sort((left, right) => left.distSq - right.distSq || left.index - right.index);
    return kept.slice(0, maxVisible).map((entry) => entry.index);
  }

  const selected = kept.map((entry) => entry.index);
  if (selected.length === maxVisible) return selected;

  const newcomers: Array<{ index: number; distSq: number }> = [];
  const candidates = candidateIndices ?? instances.keys();
  for (const index of candidates) {
    if (previous.has(index)) continue;
    const dx = instances[index].x - focusX;
    const dz = instances[index].z - focusZ;
    const distSq = dx * dx + dz * dz;
    if (distSq > drawDistanceSquared) continue;
    newcomers.push({ index, distSq });
  }
  newcomers.sort((left, right) => left.distSq - right.distSq || left.index - right.index);

  for (const entry of newcomers) {
    if (selected.length >= maxVisible) break;
    selected.push(entry.index);
  }
  return selected;
}

export function selectNearestGroundCoverIndices(
  instances: readonly Readonly<{ x: number; z: number }>[],
  focusX: number,
  focusZ: number,
  drawDistanceMeters: number,
  maxVisible: number
): number[] {
  return selectStableGroundCoverIndices(
    instances,
    focusX,
    focusZ,
    drawDistanceMeters,
    maxVisible
  );
}

export function groundCoverIndexListsEqual(
  left: readonly number[],
  right: readonly number[]
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}
