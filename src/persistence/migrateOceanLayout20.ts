import type { GameState } from "../simulation/core/types";
import { WorldLayout } from "../world/WorldLayout";
import { OCEAN_ISLETS, isletShoreDistance } from "../world/OceanIslets";
import { defaultMooringForBoatType, dockedMooring, nearestMooring } from "../world/WorldMoorings";

/** Frozen layout-19 -> 20 translation. Run before legacy terrain recovery,
 * which queries current terrain, so it never mistakes the old island for sea.
 * Crop positions are farm-local and deliberately excluded. */
export function translateLegacyOceanPositions(state: GameState): void {
  const move = (point: { x: number; z: number }) => {
    if (point.x >= 300) point.x += 800;
  };
  const playerMoved = state.player.x >= 300;
  move(state.player);
  for (const point of Object.values(state.boats ?? {})) move(point);
  for (const point of Object.values(state.mounts ?? {})) move(point);
  for (const point of Object.values(state.world.structures ?? {})) move(point);
  for (const point of Object.values(state.world.activeSchools ?? {})) move(point);
  if (playerMoved && state.sportFishing?.dynamics) state.sportFishing.dynamics.originX += 800;
}

export function migrateOceanLayout20(previous: GameState): GameState {
  const state = structuredClone(previous);
  state.schemaVersion = 42;
  state.world.layoutRevision = 20;
  // New land may replace a saved sea pose on the near side of the translation
  // boundary. Move only obstructed vessels; ownership, hold, fuel and catch stay.
  for (const boat of Object.values(state.boats)) {
    if (!OCEAN_ISLETS.some((islet) => isletShoreDistance(islet, boat.x, boat.z) <= 2)) continue;
    const position = WorldLayout.nearestValidSailable(boat);
    Object.assign(boat, position, { y: 0, speed: 0 });
    if (state.player.activeBoatId === boat.id) {
      Object.assign(state.player, position, { y: 0.5 });
      if (state.sportFishing?.dynamics) Object.assign(state.sportFishing.dynamics, { originX: position.x, originZ: position.z });
    }
  }
  if (!state.player.activeBoatId && !state.player.activeMountId && state.player.x >= 1100
    && !WorldLayout.isInterior(state.player.x, state.player.z)) {
    const point = WorldLayout.nearestValidGround(state.player);
    if (!WorldLayout.isWalkable(point.x, point.z)) throw new Error("Ocean migration could not recover the Sunreach landing");
    Object.assign(state.player, point, { y: WorldLayout.traversalSurfaceHeight(point.x, point.z) + 0.5 });
    if (state.sportFishing?.dynamics) Object.assign(state.sportFishing.dynamics, { originX: point.x, originZ: point.z });
  }
  // Harden the strict v42 docked-mooring validator: a drifted mooring table or
  // a legacy incoherent flag must re-dock, never read corrupt.
  for (const boat of Object.values(state.boats)) {
    if (boat.isDocked && dockedMooring(boat.dockedMarketId, boat.boatTypeId, boat.x, boat.z)) continue;
    if (boat.isDocked) {
      // Islet moorings carry marketId null and are excluded by serviced-only
      // lookup; a drifted islet-docked boat must re-dock at its islet, never
      // teleport to the mainland.
      const candidate = nearestMooring(boat.x, boat.z, boat.boatTypeId, boat.dockedMarketId !== null);
      if (candidate.marketId === boat.dockedMarketId || boat.dockedMarketId === null) {
        Object.assign(boat, { ...candidate.boatPosition, y: 0, speed: 0, isDocked: true, dockedMarketId: candidate.marketId });
        if (state.player.activeBoatId === boat.id) Object.assign(state.player, candidate.boatPosition, { y: candidate.boatPosition.y + 0.5 });
        continue;
      }
      const fallback = defaultMooringForBoatType(boat.boatTypeId);
      Object.assign(boat, { ...fallback.boatPosition, y: 0, speed: 0, isDocked: true, dockedMarketId: fallback.marketId });
      if (state.player.activeBoatId === boat.id) Object.assign(state.player, fallback.boatPosition, { y: fallback.boatPosition.y + 0.5 });
    } else if (boat.dockedMarketId !== null) {
      boat.dockedMarketId = null;
    }
  }
  return state;
}
