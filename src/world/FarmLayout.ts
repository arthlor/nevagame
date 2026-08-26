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
  /** World-space distance from the structure center to its authored local -Z working face. */
  frontApproachDistanceMeters: number;
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

export type FarmPathKind = "lane" | "trail";

export interface FarmPathDefinition {
  id: string;
  kind: FarmPathKind;
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
    // Working windmill on the mill pad southwest of the northeast village plaza.
    // World (36, -76); door faces the plaza at (54, -52) from outside the courtyard.
    x: 101,
    z: -21,
    rotationY: Math.atan2(-18, -24),
    clearanceRadius: 2.65,
    frontApproachDistanceMeters: 1.75
  },
  {
    id: "struct.workbench",
    type: "workbench",
    x: -10,
    z: -1.8,
    // The vise/drawer face opens toward the farm work trail (south).
    rotationY: 0,
    clearanceRadius: 1.3,
    frontApproachDistanceMeters: 1.05
  },
  {
    id: "struct.starter_compost",
    type: "compost-bin",
    x: -10.8,
    z: -6.2,
    // The open slatted working face opens onto the northeast work-trail apron.
    rotationY: Math.PI + 0.7,
    clearanceRadius: 1.15,
    frontApproachDistanceMeters: 1.0
  }
] as const satisfies readonly FarmStructureAnchor[];

const STARTER_MARKET_ANCHORS: readonly FarmMarketAnchor[] = [];

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
    kind: "lane",
    widthMeters: 2.4,
    // The field junction and yard gateway are both shared. The old southward
    // lead-in ended in open meadow because the arterial already began at the
    // yard gateway, so it read as a road to nowhere.
    points: [{ x: 0, z: -7 }, { x: 4.2, z: -7.2 }, { x: 7.4, z: -8.4 }]
  },
  {
    id: "farm-work-zone",
    kind: "trail",
    widthMeters: 1.8,
    // Shares the field junction with farm-entry instead of leaving a small
    // walkable/rendered gap at the fork.
    points: [{ x: 0, z: -7 }, { x: -7.8, z: -7 }, { x: -10.4, z: -4.8 }, { x: -10, z: -1.8 }]
  },
  {
    id: "farm-home",
    kind: "lane",
    widthMeters: 2.2,
    // Local z -2.8 resolves to FARMHOUSE_OUTSIDE_DOOR.z. Never route the
    // visible path through the farmhouse body at local z 1.5.
    points: [{ x: 7.4, z: -8.4 }, { x: 8.0, z: -5.0 }, { x: 8.0, z: -3.0 }, { x: 8.0, z: -2.8 }]
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
  // Keep the garden east of the mill pad and south of the village plaza.
  farmBounds: { minX: -1, maxX: 8, minZ: -8, maxZ: 2 },
  plantableAreas: [{ minX: 0, maxX: 7, minZ: -6, maxZ: 1 }],
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
