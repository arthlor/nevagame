/**
 * Pure farming-space layout shared by simulation, physics, input and rendering.
 * Keep this module free of Three.js and mutable game state.
 */

export interface FarmPoint {
  x: number;
  z: number;
}

export interface FarmRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface FarmStructureAnchor extends FarmPoint {
  id: string;
  type: "hand-mill" | "workbench" | "compost-bin";
  rotationY: number;
  clearanceRadius: number;
}

export interface FarmMarketAnchor extends FarmPoint {
  id: "market.village";
  radiusMeters: number;
  rotationY: number;
  clearanceRadius: number;
}

export interface FarmsteadAnchor extends FarmPoint {
  id: "farmhouse" | "well";
  rotationY: number;
  scale: number;
  clearanceRadius: number;
}

export interface FarmFenceAnchor extends FarmPoint {
  id: string;
  rotationY: number;
}

export interface FarmPropAnchor extends FarmPoint {
  id: string;
  type: "hay-bale" | "produce-crate" | "harvest-basket" | "lamp-post";
  rotationY: number;
  scale: number;
}

export interface FarmPathDefinition {
  id: string;
  widthMeters: number;
  points: readonly FarmPoint[];
}

export interface FarmLayoutDefinition {
  farmId: string;
  origin: FarmPoint;
  farmBounds: FarmRect;
  plantableAreas: readonly FarmRect[];
  structureAnchors: readonly FarmStructureAnchor[];
  marketAnchors: readonly FarmMarketAnchor[];
  farmsteadAnchors: readonly FarmsteadAnchor[];
  fenceAnchors: readonly FarmFenceAnchor[];
  propAnchors: readonly FarmPropAnchor[];
  paths: readonly FarmPathDefinition[];
}

const STARTER_STRUCTURE_ANCHORS = [
  {
    id: "struct.starter_mill",
    type: "hand-mill",
    // The starter hand-mill is the working windmill on the northeast plateau.
    // It intentionally creates an early farm-to-uplands processing journey.
    x: 119,
    z: -3,
    rotationY: 0.34,
    clearanceRadius: 2.65
  },
  {
    id: "struct.workbench",
    type: "workbench",
    x: -10,
    z: -1.8,
    rotationY: Math.PI * 0.48,
    clearanceRadius: 1.3
  },
  {
    id: "struct.starter_compost",
    type: "compost-bin",
    x: -10.8,
    z: -6.2,
    rotationY: Math.PI * 0.42,
    clearanceRadius: 1.15
  }
] as const satisfies readonly FarmStructureAnchor[];

const STARTER_MARKET_ANCHORS = [
  {
    id: "market.village",
    // Market anchors live in farm-local space; this resolves to the central
    // village gateway at world (0, -5), not the starter farmyard.
    x: 65,
    z: 50,
    rotationY: Math.PI - 0.12,
    radiusMeters: 3,
    clearanceRadius: 2.15
  }
] as const satisfies readonly FarmMarketAnchor[];

const STARTER_FARMSTEAD_ANCHORS = [
  {
    id: "farmhouse",
    x: 8,
    z: 1.5,
    rotationY: Math.PI + 0.08,
    scale: 1.12,
    clearanceRadius: 5.2
  },
  {
    id: "well",
    x: 6,
    z: 5.5,
    rotationY: 0.18,
    scale: 1,
    clearanceRadius: 1.65
  }
] as const satisfies readonly FarmsteadAnchor[];

const STARTER_FENCE_ANCHORS = [
  ...[-6, -4, -2, 0, 2, 4, 6].map((x) => ({ id: `fence_north_${x}`, x, z: 6.2, rotationY: 0 })),
  ...[-6, -4, -2, 2, 4, 6].map((x) => ({ id: `fence_south_${x}`, x, z: -6.2, rotationY: 0 })),
  ...[-4, -2, 0, 2, 4].map((z) => ({ id: `fence_west_${z}`, x: -7.2, z, rotationY: Math.PI / 2 })),
  ...[-4, -2, 0, 2, 4].map((z) => ({ id: `fence_east_${z}`, x: 7.2, z, rotationY: Math.PI / 2 }))
] as const satisfies readonly FarmFenceAnchor[];

const STARTER_PROP_ANCHORS = [
  { id: "farm_hay_a", type: "hay-bale", x: -13.4, z: -8.2, rotationY: 0.22, scale: 1 },
  { id: "farm_hay_b", type: "hay-bale", x: -12.1, z: -8.5, rotationY: 0.66, scale: 0.94 },
  { id: "stall_crate_a", type: "produce-crate", x: 8.4, z: -8.2, rotationY: -0.18, scale: 0.9 },
  { id: "stall_basket_a", type: "harvest-basket", x: 9.1, z: -7.8, rotationY: 0.24, scale: 1 },
  { id: "farm_lamp_a", type: "lamp-post", x: 9.8, z: -2.2, rotationY: 0.1, scale: 0.88 }
] as const satisfies readonly FarmPropAnchor[];

const STARTER_PATHS = [
  {
    id: "farm-entry",
    widthMeters: 2.4,
    points: [{ x: 0, z: -14 }, { x: 0, z: -7 }, { x: 6.8, z: -7.6 }, { x: 9.2, z: -9.5 }]
  },
  {
    id: "farm-work-zone",
    widthMeters: 1.8,
    points: [{ x: -0.3, z: -7 }, { x: -7.8, z: -7 }, { x: -10.4, z: -4.8 }, { x: -10, z: -1.8 }]
  },
  {
    id: "farm-home",
    widthMeters: 2.2,
    points: [{ x: 6.8, z: -7.6 }, { x: 8.0, z: -5.0 }, { x: 8.0, z: -3.0 }, { x: 8.0, z: 1.5 }]
  }
] as const satisfies readonly FarmPathDefinition[];

export const STARTER_FARM_LAYOUT: FarmLayoutDefinition = {
  farmId: "farm.starter_garden",
  origin: { x: -65, z: -55 },
  farmBounds: { minX: -18, maxX: 18, minZ: -14, maxZ: 14 },
  plantableAreas: [{ minX: -6, maxX: 6, minZ: -5, maxZ: 5 }],
  structureAnchors: STARTER_STRUCTURE_ANCHORS,
  marketAnchors: STARTER_MARKET_ANCHORS,
  farmsteadAnchors: STARTER_FARMSTEAD_ANCHORS,
  fenceAnchors: STARTER_FENCE_ANCHORS,
  propAnchors: STARTER_PROP_ANCHORS,
  paths: STARTER_PATHS
};

export const PLAYER_HOMESTEAD_LAYOUT: FarmLayoutDefinition = {
  farmId: "farm.player_homestead",
  origin: { x: 60, z: -60 },
  farmBounds: { minX: -8, maxX: 8, minZ: -8, maxZ: 8 },
  plantableAreas: [{ minX: -8, maxX: 8, minZ: -8, maxZ: 8 }],
  structureAnchors: [],
  marketAnchors: [],
  farmsteadAnchors: [],
  fenceAnchors: [],
  propAnchors: [],
  paths: []
};

const FARM_LAYOUTS: Readonly<Record<string, FarmLayoutDefinition>> = {
  [STARTER_FARM_LAYOUT.farmId]: STARTER_FARM_LAYOUT,
  [PLAYER_HOMESTEAD_LAYOUT.farmId]: PLAYER_HOMESTEAD_LAYOUT
};

export function getFarmLayout(farmId: string): FarmLayoutDefinition | undefined {
  return FARM_LAYOUTS[farmId];
}

export function farmWorldOrigin(farmId: string): FarmPoint {
  return getFarmLayout(farmId)?.origin ?? { x: 0, z: 0 };
}

export function farmLocalToWorld(farmId: string, point: FarmPoint): FarmPoint {
  const origin = farmWorldOrigin(farmId);
  return { x: origin.x + point.x, z: origin.z + point.z };
}

export function worldToFarmLocal(farmId: string, point: FarmPoint): FarmPoint {
  const origin = farmWorldOrigin(farmId);
  return { x: point.x - origin.x, z: point.z - origin.z };
}

export function isPointInsideRect(point: FarmPoint, rect: FarmRect, tolerance: number = 0): boolean {
  return (
    point.x >= rect.minX - tolerance &&
    point.x <= rect.maxX + tolerance &&
    point.z >= rect.minZ - tolerance &&
    point.z <= rect.maxZ + tolerance
  );
}

export function isPlantableFarmSurface(farmId: string, localPoint: FarmPoint): boolean {
  const layout = getFarmLayout(farmId);
  return Boolean(layout?.plantableAreas.some((area) => isPointInsideRect(localPoint, area, 0.0001)));
}

export function starterStructureLocalAnchor(id: string): FarmStructureAnchor | undefined {
  return STARTER_STRUCTURE_ANCHORS.find((anchor) => anchor.id === id);
}

/** Returns the canonical world-space position for a starter-farm structure. */
export function starterStructureAnchor(id: string): FarmStructureAnchor | undefined {
  const local = starterStructureLocalAnchor(id);
  if (!local) return undefined;
  const world = farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, local);
  return { ...local, ...world };
}

export function farmStructureWorldAnchor(
  farmId: string,
  id: string
): FarmStructureAnchor | undefined {
  const local = getFarmLayout(farmId)?.structureAnchors.find((anchor) => anchor.id === id);
  if (!local) return undefined;
  return { ...local, ...farmLocalToWorld(farmId, local) };
}

export function starterMarketAnchor(id: FarmMarketAnchor["id"]): FarmMarketAnchor | undefined {
  const local = STARTER_MARKET_ANCHORS.find((anchor) => anchor.id === id);
  if (!local) return undefined;
  return { ...local, ...farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, local) };
}

export function starterFarmsteadAnchor(id: FarmsteadAnchor["id"]): FarmsteadAnchor | undefined {
  const local = STARTER_FARMSTEAD_ANCHORS.find((anchor) => anchor.id === id);
  if (!local) return undefined;
  return { ...local, ...farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, local) };
}

export const STARTER_STRUCTURE_IDS = STARTER_STRUCTURE_ANCHORS.map((anchor) => anchor.id);
