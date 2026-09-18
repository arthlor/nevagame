/**
 * Pure farming-space layout shared by simulation, physics, input and rendering.
 * Keep this module free of Three.js and mutable game state.
 */

import { SUNREACH_ANCHORS } from "./WorldIslands";

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
  type: "hand-mill" | "workbench" | "compost-bin" | "kitchen";
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

export interface StarterDonkeyAnchor extends FarmPoint {
  id: "mount.donkey_starter";
  mountTypeId: "mount.donkey";
  rotationY: number;
  clearanceRadius: number;
  frontApproachDistanceMeters: number;
  grounding: readonly [number, number];
}

export type FarmPathKind = "lane" | "trail";

export interface FarmPathDefinition {
  id: string;
  kind: FarmPathKind;
  widthMeters: number;
  points: readonly FarmPoint[];
}

/**
 * A crop-shaped decoration that belongs to the authored world presentation,
 * not to the simulation's placed-crop records. These plants are deliberately
 * non-interactive and never enter inventory, quests, saves, or crop capacity.
 */
export interface FarmCropDecoration {
  cropId: string;
  x: number;
  z: number;
  rotationRadians: number;
}

export interface FarmLayoutDefinition {
  farmId: string;
  origin: FarmPoint;
  farmBounds: FarmRect;
  plantableAreas: readonly FarmRect[];
  /** Optional authored cultivated silhouettes; simulation still uses plantableAreas. */
  visualAreas?: readonly FarmRect[];
  /** Optional presentation-only mature crops surrounding the playable clearings. */
  visualCropDecorations?: readonly FarmCropDecoration[];
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
    // Working windmill east of the compact village square. Its working face
    // opens west-southwest toward the produce market at (39.7, -65.9) so the
    // mill approach, not the mill body, is what the player walks up to.
    x: 130,
    z: -14.9,
    rotationY: 1.7278,
    clearanceRadius: 2.65,
    frontApproachDistanceMeters: 1.75
  },
  {
    id: "struct.workbench",
    type: "workbench",
    x: -10.1,
    z: -0.9,
    // The vise/drawer face opens toward the farm work trail (south).
    rotationY: 0,
    clearanceRadius: 1.3,
    frontApproachDistanceMeters: 1.05
  },
  {
    id: "struct.starter_compost",
    type: "compost-bin",
    x: -11.2,
    z: -6.4,
    // The open slatted working face opens onto the northeast work-trail apron.
    rotationY: 3.8416,
    clearanceRadius: 1.15,
    frontApproachDistanceMeters: 1.0
  },
  {
    id: "struct.kitchen",
    type: "kitchen",
    // Farm kitchen in the southeast yard pocket: east of the home-lane
    // approach, clear of the plantable rectangle, fences, well and parked
    // wagon, with its working face opening north toward the house door.
    x: 14.6,
    z: -5.4,
    rotationY: 3.1416,
    clearanceRadius: 2.2,
    frontApproachDistanceMeters: 2.35
  }
] as const satisfies readonly FarmStructureAnchor[];

const STARTER_MARKET_ANCHORS: readonly FarmMarketAnchor[] = [];

const STARTER_FARMSTEAD_ANCHORS = [
  {
    id: "farmhouse",
    x: 10.9,
    z: 5.5,
    rotationY: 3.1416,
    // The authored medieval timber cottage is wider and shallower than the old
    // Blender farmhouse, so it is scaled to keep a comparable homestead footprint.
    scale: 0.9,
    clearanceRadius: 5.2
  },
  {
    id: "well",
    x: 7.9,
    z: 2.1,
    rotationY: -0.5236,
    scale: 1,
    clearanceRadius: 1.65
  }
] as const satisfies readonly FarmsteadAnchor[];

const STARTER_FENCE_ANCHORS = [
  ...[-6, -4, -2, 0, 2, 4, 6].map((x) => ({ id: `fence_north_${x}`, x, z: 6.2, rotationY: 0 })),
  ...[-6, -4, -2, 2, 4, 6].map((x) => ({ id: `fence_south_${x}`, x, z: -6.2, rotationY: 0 })),
  ...[-4, -2, 0, 2, 4].map((z) => ({ id: `fence_west_${z}`, x: -7.2, z, rotationY: Math.PI / 2 })),
  // Keep the east field fence outside the farmhouse collider and its access apron.
  ...[-4, -2, 0, 2, 4].map((z) => ({ id: `fence_east_${z}`, x: 13.2, z, rotationY: Math.PI / 2 }))
] as const satisfies readonly FarmFenceAnchor[];

/** DEV layout-editor pins for generated fence posts. Empty until an in-game drop writes an id. */
export const FARM_FENCE_OVERRIDES: Readonly<Record<string, { x: number; z: number; rotationY: number }>> = {
  "fence_east_-4": { x: 15.9, z: -1.6, rotationY: 1.5708 },
  "fence_east_2": { x: 15.9, z: 2.6, rotationY: 1.5708 },
  "fence_east_4": { x: 16.1, z: 4.6, rotationY: 1.5708 },
  "fence_east_0": { x: 15.9, z: 0.5, rotationY: 1.5708 },
  "fence_east_-2": { x: 15.9, z: -0.55, rotationY: 1.5708 },
};

/** Extra fence posts created by the DEV layout editor (copy/paste). */
export const FARM_FENCE_EXTRAS: readonly FarmFenceAnchor[] = [
];

/** Generated fence posts removed by the DEV layout editor. */
export const FARM_FENCE_REMOVED: readonly string[] = [
];

function applyFarmFenceOverrides(anchors: readonly FarmFenceAnchor[]): readonly FarmFenceAnchor[] {
  return anchors
    .filter((anchor) => !FARM_FENCE_REMOVED.includes(anchor.id))
    .map((anchor) => {
      const override = FARM_FENCE_OVERRIDES[anchor.id];
      return override ? { ...anchor, ...override } : anchor;
    });
}

const STARTER_PROP_ANCHORS = [
  { id: "farm_hay_a", type: "hay-bale", x: -13.4, z: -8.2, rotationY: 0.22, scale: 1 },
  { id: "farm_hay_b", type: "hay-bale", x: -12.1, z: -8.5, rotationY: 0.66, scale: 0.94 },
  { id: "stall_crate_a", type: "produce-crate", x: 12.2, z: -2.4, rotationY: -0.18, scale: 0.9 },
  { id: "stall_basket_a", type: "harvest-basket", x: 17.3, z: -2.1, rotationY: 0.24, scale: 1 },
  { id: "farm_lamp_a", type: "lamp-post", x: 7.5, z: -6.4, rotationY: 0.7854, scale: 0.88 },
  { id: "farm_lamp_a_copy_1", type: "lamp-post", x: 14.8, z: 2.4, rotationY: 2.8798, scale: 0.88},
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
    // The final local point resolves to the current outside door at
    // world (-53.76, -53.79). Approach from the south without crossing the
    // well or cutting through the farmhouse body.
    points: [{ x: 7.4, z: -8.4 }, { x: 8.8, z: -5.2 }, { x: 10.4, z: -2.0 }, { x: 11.24, z: 1.21 }]
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
  fenceAnchors: applyFarmFenceOverrides([...STARTER_FENCE_ANCHORS, ...FARM_FENCE_EXTRAS]),
  propAnchors: STARTER_PROP_ANCHORS,
  paths: STARTER_PATHS
};

/**
 * The starter mount is a farm gameplay anchor, not a static-fauna coordinate.
 * It sits just south of the home lane, with its nose turned toward the path.
 */
export const STARTER_DONKEY_LOCAL_ANCHOR: StarterDonkeyAnchor = {
  id: "mount.donkey_starter",
  mountTypeId: "mount.donkey",
  x: 8,
  z: -10.4,
  rotationY: Math.atan2(1.4, 3.2),
  clearanceRadius: 1.5,
  frontApproachDistanceMeters: 1.8,
  grounding: [1.25, 0.95]
};

export const PLAYER_HOMESTEAD_LAYOUT: FarmLayoutDefinition = {
  farmId: "farm.player_homestead",
  // The origin is the commons entrance, not a private house. The two beds sit
  // just beyond the gate on an open inland meadow, well clear of the village
  // market's packed courtyard.
  origin: { x: 74, z: -75 },
  farmBounds: { minX: -2, maxX: 19, minZ: -7, maxZ: 5 },
  // The Commons is presented as two broad worked beds. Three clearings inside
  // them are the only simulation-valid planting surfaces; the surrounding
  // mature crops are explicitly presentation-only decorations.
  visualAreas: [
    { minX: 0.5, maxX: 10.4, minZ: -5.5, maxZ: -0.5 },
    { minX: 12.4, maxX: 17, minZ: -5.5, maxZ: -0.5 }
  ],
  plantableAreas: [
    // Keep the v40 bed centres stable so migration can preserve crop identity
    // while normalizing older placements into the new three-clearance layout.
    { minX: 2, maxX: 4, minZ: -4, maxZ: -2 },
    { minX: 6.6, maxX: 10.4, minZ: -4.9, maxZ: -1.1 },
    { minX: 13, maxX: 15, minZ: -4, maxZ: -2 }
  ],
  visualCropDecorations: [
    { cropId: "crop.carrot", x: 2.2, z: -4.72, rotationRadians: 0.18 },
    { cropId: "crop.wheat", x: 3.8, z: -4.7, rotationRadians: -0.24 },
    { cropId: "crop.potato", x: 2.2, z: -1.28, rotationRadians: -0.26 },
    { cropId: "crop.tomato", x: 3.8, z: -1.3, rotationRadians: 0.32 },
    { cropId: "crop.wheat", x: 0.88, z: -4.78, rotationRadians: -0.18 },
    { cropId: "crop.tomato", x: 0.84, z: -3.52, rotationRadians: 0.28 },
    { cropId: "crop.potato", x: 0.92, z: -2.22, rotationRadians: -0.34 },
    { cropId: "crop.wheat", x: 0.86, z: -0.98, rotationRadians: 0.12 },
    { cropId: "crop.tomato", x: 5.34, z: -4.74, rotationRadians: 0.36 },
    { cropId: "crop.potato", x: 5.55, z: -3.62, rotationRadians: -0.24 },
    { cropId: "crop.wheat", x: 5.38, z: -2.34, rotationRadians: 0.18 },
    { cropId: "crop.carrot", x: 5.5, z: -1.06, rotationRadians: -0.42 },
    // Between the two west clearings, not inside the orchard clearing, so a
    // legally planted crop can never visually overlap the dressing.
    { cropId: "crop.wheat", x: 6.02, z: -4.72, rotationRadians: -0.08 },
    { cropId: "crop.tomato", x: 6.08, z: -3.46, rotationRadians: 0.31 },
    { cropId: "crop.potato", x: 6.0, z: -2.18, rotationRadians: -0.27 },
    { cropId: "crop.wheat", x: 10.18, z: -0.96, rotationRadians: 0.22 },
    { cropId: "crop.wheat", x: 7.18, z: -5.08, rotationRadians: 0.16 },
    { cropId: "crop.tomato", x: 8.42, z: -5.06, rotationRadians: -0.28 },
    { cropId: "crop.potato", x: 9.62, z: -5.04, rotationRadians: 0.24 },
    { cropId: "crop.carrot", x: 7.2, z: -0.92, rotationRadians: -0.18 },
    { cropId: "crop.wheat", x: 8.42, z: -0.94, rotationRadians: 0.22 },
    { cropId: "crop.tomato", x: 9.62, z: -0.96, rotationRadians: -0.12 },
    { cropId: "crop.potato", x: 12.54, z: -4.76, rotationRadians: 0.16 },
    { cropId: "crop.wheat", x: 12.5, z: -3.48, rotationRadians: -0.26 },
    { cropId: "crop.tomato", x: 12.52, z: -2.18, rotationRadians: 0.34 },
    { cropId: "crop.carrot", x: 12.5, z: -0.98, rotationRadians: -0.18 },
    { cropId: "crop.wheat", x: 13.18, z: -4.7, rotationRadians: 0.2 },
    { cropId: "crop.potato", x: 14.42, z: -4.7, rotationRadians: -0.22 },
    { cropId: "crop.tomato", x: 13.18, z: -1.3, rotationRadians: -0.16 },
    { cropId: "crop.wheat", x: 14.42, z: -1.28, rotationRadians: 0.28 },
    { cropId: "crop.wheat", x: 16.22, z: -4.74, rotationRadians: 0.12 },
    { cropId: "crop.tomato", x: 16.28, z: -3.5, rotationRadians: -0.32 },
    { cropId: "crop.potato", x: 16.18, z: -2.2, rotationRadians: 0.24 },
    { cropId: "crop.wheat", x: 16.24, z: -0.96, rotationRadians: -0.16 }
  ],
  structureAnchors: [],
  marketAnchors: [],
  farmsteadAnchors: [],
  fenceAnchors: [],
  propAnchors: [],
  paths: []
};

export const SUNREACH_FARM_LAYOUT: FarmLayoutDefinition = {
  farmId: "farm.sunreach_terraces",
  origin: SUNREACH_ANCHORS.terraceFarm,
  farmBounds: { minX: -28, maxX: 28, minZ: -31, maxZ: 25 },
  plantableAreas: [
    { minX: -23, maxX: 23, minZ: -29, maxZ: -16 },
    { minX: -26, maxX: 26, minZ: -12, maxZ: 2 },
    { minX: -21, maxX: 21, minZ: 7, maxZ: 22 }
  ],
  structureAnchors: [
    {
      id: "struct.sunreach_hand_mill",
      type: "hand-mill",
      x: -11,
      z: 16,
      rotationY: 2.35,
      clearanceRadius: 1.35,
      frontApproachDistanceMeters: 1.2
    },
    {
      id: "struct.sunreach_workbench",
      type: "workbench",
      x: 11,
      z: 12,
      rotationY: -0.7,
      clearanceRadius: 1.3,
      frontApproachDistanceMeters: 1.05
    }
  ],
  marketAnchors: [],
  farmsteadAnchors: [
    {
      id: "well",
      x: -3.8,
      z: 2.4,
      rotationY: 0.3,
      scale: 0.9,
      clearanceRadius: 1.75
    }
  ],
  fenceAnchors: [],
  propAnchors: [],
  paths: []
};

const FARM_LAYOUTS: Readonly<Record<string, FarmLayoutDefinition>> = {
  [STARTER_FARM_LAYOUT.farmId]: STARTER_FARM_LAYOUT,
  [PLAYER_HOMESTEAD_LAYOUT.farmId]: PLAYER_HOMESTEAD_LAYOUT,
  [SUNREACH_FARM_LAYOUT.farmId]: SUNREACH_FARM_LAYOUT
};

/** Parked on the open southern edge of the home yard, facing the farm exit. */
export const STARTER_CARRIAGE_ANCHOR = { x: -51, z: -66.5, rotationY: Math.PI / 2 } as const;

export const STARTER_DONKEY_ANCHOR: StarterDonkeyAnchor = {
  ...STARTER_DONKEY_LOCAL_ANCHOR,
  ...farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, STARTER_DONKEY_LOCAL_ANCHOR)
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

export function findFarmIdAtWorld(x: number, z: number, padding: number = 0.5): string | null {
  for (const layout of Object.values(FARM_LAYOUTS)) {
    const local = worldToFarmLocal(layout.farmId, { x, z });
    if (isPointInsideRect(local, layout.farmBounds, padding)) return layout.farmId;
  }
  return null;
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

/** World-space well used for field-pump install and irrigate. Decorative village wells are not farms. */
export function farmWellWorldAnchor(farmId: string): FarmsteadAnchor | undefined {
  const local = getFarmLayout(farmId)?.farmsteadAnchors.find((anchor) => anchor.id === "well");
  if (!local) return undefined;
  return { ...local, ...farmLocalToWorld(farmId, local) };
}

export const STARTER_STRUCTURE_IDS = STARTER_STRUCTURE_ANCHORS.map((anchor) => anchor.id);
