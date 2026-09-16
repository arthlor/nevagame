import { OCEAN_ISLETS, OCEAN_ISLAND_DEFINITIONS } from "./OceanIslets";
import { HARBOR_DOCK, HARBOR_SKIFF_MOORING } from "./WorldAnchors";
import { SUNREACH_ANCHORS, type BoatMooringDefinition } from "./WorldIslands";

export const BOAT_MOORINGS: readonly Readonly<BoatMooringDefinition>[] = Object.freeze([
  ...OCEAN_ISLETS.map((islet): BoatMooringDefinition => ({
    id: `mooring.${islet.id.slice(7)}`, islandId: islet.id, marketId: null,
    boatPosition: { x: islet.x, y: 0, z: islet.z + islet.radiusZ + 9 },
    playerPosition: OCEAN_ISLAND_DEFINITIONS[islet.id].anchors.landing,
    boardRadius: 6, hullBoardRadius: 10, dockRadius: 9, boatTypeIds: ["boat.skiff"]
  })),
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
      { x: 350, z: 110 },
      { x: 600, z: 110 },
      { x: 850, z: 100 },
      { x: 1080, z: 90 },
      { x: 1124, z: 78 },
      SUNREACH_ANCHORS.dockBoat
    ])
  })
]);

export function mooringById(id: string): Readonly<BoatMooringDefinition> | null {
  return BOAT_MOORINGS.find((mooring) => mooring.id === id) ?? null;
}

/**
 * The vessel type a market can only be reached with, because it lies at the far
 * end of a sailing route; null when it is reachable without one.
 */
export function requiredBoatTypeForMarket(marketId: string): string | null {
  const route = WORLD_SAILING_ROUTES.find((candidate) => mooringById(candidate.toMooringId)?.marketId === marketId);
  return route?.requiredBoatTypeId ?? null;
}

export function defaultMooringForBoatType(boatTypeId: string): Readonly<BoatMooringDefinition> {
  return BOAT_MOORINGS.find((mooring) =>
    mooring.islandId === "island.neva" && mooring.boatTypeIds?.includes(boatTypeId)
  ) ?? BOAT_MOORINGS[0];
}

export function nearestMooring(
  x: number,
  z: number,
  boatTypeId?: string,
  servicedOnly = false
): Readonly<BoatMooringDefinition> {
  const available = servicedOnly ? BOAT_MOORINGS.filter((mooring) => mooring.marketId !== null) : BOAT_MOORINGS;
  const matching = boatTypeId
    ? available.filter((mooring) => !mooring.boatTypeIds || mooring.boatTypeIds.includes(boatTypeId))
    : available;
  // An unrecognised boat type still gets a mooring: every caller needs one.
  const compatible = matching.length > 0 ? matching : available.length > 0 ? available : BOAT_MOORINGS;
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
  const matches = BOAT_MOORINGS.filter((mooring) =>
    mooring.marketId === marketId
    && (marketId !== null || Math.hypot(mooring.boatPosition.x - x, mooring.boatPosition.z - z) <= mooring.dockRadius)
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
