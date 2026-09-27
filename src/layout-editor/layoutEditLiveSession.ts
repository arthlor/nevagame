import { INTERACTION_PLACEMENTS, INTERACTION_PLACEMENT_OVERRIDES } from "../world/InteractionPlacements";
import { BOAT_MOORINGS } from "../world/WorldMoorings";
/**
 * DEV layout-editor session overlays. Source TypeScript is the persistence
 * path; these mutations keep interact/sim poses aligned until refresh.
 */
import type { Simulation } from "../simulation/Simulation";
import { debugRelocateProcessingStationApproach } from "../world/ProcessingStationApproach";
import type { LayoutEditCommit, LayoutEditTag } from "./layoutEdit";

export function applyLayoutEditLiveSession(
  sim: Simulation,
  tag: LayoutEditTag,
  commit: LayoutEditCommit
): void {
  if (INTERACTION_PLACEMENTS[tag.id]) {
    const binding = INTERACTION_PLACEMENTS[tag.id];
    if (!binding) throw new Error(`Unknown interactive placement ${tag.id}`);
    const previousYaw = INTERACTION_PLACEMENT_OVERRIDES[tag.id]?.rotationY ?? Math.PI / 2;
    const oldBerths = BOAT_MOORINGS.map(m => ({ id: m.id, x: m.boatPosition.x, z: m.boatPosition.z }));
    INTERACTION_PLACEMENT_OVERRIDES[tag.id] = { x: commit.x, z: commit.z, rotationY: commit.rotationY };
    if (binding.stationId) {
      sim.debugRelocateStructure(binding.stationId, commit.x, commit.z, commit.rotationY - Math.PI);
      debugRelocateProcessingStationApproach(binding.stationId, commit.rotationY - Math.PI);
    }
    for (const old of oldBerths) {
      const next = BOAT_MOORINGS.find(m => m.id === old.id)!;
      if (next.boatPosition.x !== old.x || next.boatPosition.z !== old.z) {
        sim.debugRelocateMooredBoats(old, next.boatPosition, commit.rotationY - previousYaw);
      }
    }
    return;
  }
}

export function restoreLayoutPlacementSession(sim: Simulation): void {
  for (const [id, pose] of Object.entries(INTERACTION_PLACEMENT_OVERRIDES)) {
    const stationId = INTERACTION_PLACEMENTS[id]?.stationId;
    if (stationId) sim.debugRelocateStructure(stationId, pose.x, pose.z, pose.rotationY - Math.PI);
  }
}
