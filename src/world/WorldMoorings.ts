import { HARBOR_DOCK, HARBOR_SKIFF_MOORING } from "./WorldAnchors";
import { SUNREACH_ANCHORS, type BoatMooringDefinition } from "./WorldIslands";

export const BOAT_MOORINGS: readonly Readonly<BoatMooringDefinition>[] = Object.freeze([
  Object.freeze({
    id: "mooring.neva_harbor_rowboat",
    islandId: "island.neva",
    marketId: HARBOR_DOCK.marketId,
    boatPosition: HARBOR_DOCK.boatPosition,
    playerPosition: HARBOR_DOCK.playerPosition,
    boardRadius: HARBOR_DOCK.boardRadius,
    hullBoardRadius: HARBOR_DOCK.hullBoardRadius,
    dockRadius: HARBOR_DOCK.dockRadius,
    boatTypeIds: ["boat.rowboat"]
  }),
  Object.freeze({
    id: "mooring.neva_harbor_skiff",
    islandId: "island.neva",
    marketId: HARBOR_SKIFF_MOORING.marketId,
    boatPosition: HARBOR_SKIFF_MOORING.boatPosition,
    playerPosition: HARBOR_SKIFF_MOORING.playerPosition,
    boardRadius: HARBOR_SKIFF_MOORING.boardRadius,
    hullBoardRadius: HARBOR_SKIFF_MOORING.hullBoardRadius,
    dockRadius: HARBOR_SKIFF_MOORING.dockRadius,
    boatTypeIds: ["boat.skiff"]
  }),
  Object.freeze({
    id: "mooring.sunreach_cove",
    islandId: "island.sunreach",
    marketId: "market.sunreach_cove",
    boatPosition: { ...SUNREACH_ANCHORS.dockBoat, y: 0 },
    playerPosition: SUNREACH_ANCHORS.dockPlayer,
    boardRadius: 5,
    hullBoardRadius: 10,
    dockRadius: 7,
    boatTypeIds: ["boat.rowboat", "boat.skiff"]
  })
]);

export interface SailingRouteDefinition {
  id: "sailing.neva-sunreach";
  fromMooringId: "mooring.neva_harbor_skiff";
  toMooringId: "mooring.sunreach_cove";
  requiredBoatTypeId: "boat.skiff";
  points: readonly Readonly<{ x: number; z: number }>[];
}

/**
 * The centerline of the readable open-channel crossing. It remains water-only
 * and clear of both shoreline collider aprons, so playtests exercise the real
 * sailing gate instead of relying on relocation helpers.
 */
export const WORLD_SAILING_ROUTES: readonly Readonly<SailingRouteDefinition>[] = Object.freeze([
  Object.freeze({
    id: "sailing.neva-sunreach",
    fromMooringId: "mooring.neva_harbor_skiff",
    toMooringId: "mooring.sunreach_cove",
    requiredBoatTypeId: "boat.skiff",
    points: Object.freeze([
      { x: HARBOR_SKIFF_MOORING.boatPosition.x, z: HARBOR_SKIFF_MOORING.boatPosition.z },
      { x: 125, z: 96 },
      { x: 180, z: 116 },
      { x: 238, z: 112 },
      { x: 288, z: 96 },
      { x: 324, z: 78 },
      SUNREACH_ANCHORS.dockBoat
    ])
  })
]);

export function mooringById(id: string): Readonly<BoatMooringDefinition> | null {
  return BOAT_MOORINGS.find((mooring) => mooring.id === id) ?? null;
}

export function defaultMooringForBoatType(boatTypeId: string): Readonly<BoatMooringDefinition> {
  return BOAT_MOORINGS.find((mooring) =>
    mooring.islandId === "island.neva" && mooring.boatTypeIds?.includes(boatTypeId)
  ) ?? BOAT_MOORINGS[0];
}

export function nearestMooring(
  x: number,
  z: number,
  boatTypeId?: string
): Readonly<BoatMooringDefinition> {
  const compatible = boatTypeId
    ? BOAT_MOORINGS.filter((mooring) => !mooring.boatTypeIds || mooring.boatTypeIds.includes(boatTypeId))
    : BOAT_MOORINGS;
  return compatible.reduce((nearest, candidate) =>
    Math.hypot(candidate.boatPosition.x - x, candidate.boatPosition.z - z)
      < Math.hypot(nearest.boatPosition.x - x, nearest.boatPosition.z - z)
      ? candidate
      : nearest
  );
}

export function dockedMooring(
  marketId: string | null,
  boatTypeId: string,
  x: number,
  z: number
): Readonly<BoatMooringDefinition> | null {
  if (!marketId) return null;
  const matches = BOAT_MOORINGS.filter((mooring) =>
    mooring.marketId === marketId
    && (!mooring.boatTypeIds || mooring.boatTypeIds.includes(boatTypeId))
  );
  if (matches.length === 0) return null;
  return matches.reduce((nearest, candidate) =>
    Math.hypot(candidate.boatPosition.x - x, candidate.boatPosition.z - z)
      < Math.hypot(nearest.boatPosition.x - x, nearest.boatPosition.z - z)
      ? candidate
      : nearest
  );
}
