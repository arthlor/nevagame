import { ContentRegistry } from "../content/ContentRegistry";
import type { GameState } from "../simulation/core/types";

interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const DEFAULT_FOOTPRINT = 1;

function footprintOfDefinition(cropDefinitionId: string): number {
  ContentRegistry.initializeAndValidate();
  const definition = ContentRegistry.crops.get(cropDefinitionId);
  if (!definition) return DEFAULT_FOOTPRINT;
  return Math.max(definition.footprint.width, definition.footprint.depth);
}

function areaSize(area: Rect): number {
  return (area.maxX - area.minX) * (area.maxZ - area.minZ);
}

/**
 * Deterministic non-overlapping slot centres inside `area` for a square
 * footprint, centre first so a single retained crop keeps the authored centre
 * of its clearing.
 */
function slotsFor(area: Rect, footprint: number): Array<{ x: number; z: number }> {
  const centerX = (area.minX + area.maxX) / 2;
  const centerZ = (area.minZ + area.maxZ) / 2;
  const halfX = (area.maxX - area.minX - footprint) / 2;
  const halfZ = (area.maxZ - area.minZ - footprint) / 2;
  if (halfX < -1e-9 || halfZ < -1e-9) return [];
  const step = Math.max(footprint, 0.5);
  const countX = Math.floor(halfX / step + 1e-9);
  const countZ = Math.floor(halfZ / step + 1e-9);
  const offsetsX = [0];
  for (let i = 1; i <= countX; i += 1) offsetsX.push(i, -i);
  const offsetsZ = [0];
  for (let j = 1; j <= countZ; j += 1) offsetsZ.push(j, -j);
  const slots: Array<{ x: number; z: number }> = [];
  for (const dx of offsetsX) {
    for (const dz of offsetsZ) slots.push({ x: centerX + dx * step, z: centerZ + dz * step });
  }
  return slots;
}

interface OccupiedSlot {
  x: number;
  z: number;
  radius: number;
}

/**
 * Assigns every retained Commons crop a deterministic, non-overlapping local
 * position inside the authored `areas`.
 *
 * Crops are allocated largest-footprint first so a legacy tree claims the
 * clearing that can actually contain it before small crops fill the space, but
 * each crop still prefers the clearing its original farm order points at. A
 * crop that cannot fit a free slot anywhere is preserved at the largest
 * clearing's centre rather than dropped: capacity only blocks new planting, so
 * no retained record or growth state is ever discarded.
 */
export function allocateCommonsCrops(
  cropIds: readonly string[],
  crops: GameState["crops"],
  areas: readonly Rect[]
): Record<string, { x: number; z: number }> {
  const result: Record<string, { x: number; z: number }> = {};
  if (areas.length === 0) return result;

  const footprintFor = (recordId: string): number => {
    const record = crops[recordId];
    return record ? footprintOfDefinition(record.cropId) : DEFAULT_FOOTPRINT;
  };

  const originalIndex = new Map<string, number>();
  cropIds.forEach((cropId, index) => originalIndex.set(cropId, index));
  const ordered = [...cropIds].sort((a, b) => {
    const byFootprint = footprintFor(b) - footprintFor(a);
    if (byFootprint !== 0) return byFootprint;
    return (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0);
  });

  const occupied: OccupiedSlot[][] = areas.map(() => []);
  for (const cropId of ordered) {
    if (!crops[cropId]) continue;
    const radius = footprintFor(cropId) / 2;
    const start = (originalIndex.get(cropId) ?? 0) % areas.length;

    let placed: { x: number; z: number } | null = null;
    for (let offset = 0; offset < areas.length && !placed; offset += 1) {
      const areaIndex = (start + offset) % areas.length;
      const area = areas[areaIndex];
      for (const slot of slotsFor(area, radius * 2)) {
        const clear = occupied[areaIndex].every(
          (other) => Math.hypot(other.x - slot.x, other.z - slot.z) >= other.radius + radius - 1e-6
        );
        if (clear) {
          placed = slot;
          occupied[areaIndex].push({ ...slot, radius });
          break;
        }
      }
    }

    if (!placed) {
      const largest = areas.reduce((best, area) => (areaSize(area) > areaSize(best) ? area : best), areas[0]);
      placed = { x: (largest.minX + largest.maxX) / 2, z: (largest.minZ + largest.maxZ) / 2 };
    }
    result[cropId] = placed;
  }

  return result;
}
