import { SUNREACH_ANCHORS } from "./WorldIslands";
import { SUNREACH_FARM_LAYOUT } from "./FarmLayout";
import type { WorldRoute } from "./WorldLayout";

/** Authoring coordinates relative to the retained Sunreach landing. */
function cove(x: number, z: number): { x: number; z: number } {
  return { x: SUNREACH_ANCHORS.coveMarket.x + x, z: SUNREACH_ANCHORS.coveMarket.z + z };
}
function farm(x: number, z: number): { x: number; z: number } {
  return { x: SUNREACH_FARM_LAYOUT.origin.x + x, z: SUNREACH_FARM_LAYOUT.origin.z + z };
}

/** Shared stations keep decoration, moving villagers and interaction aprons apart. */
export const SUNREACH_LIFE_STATIONS = {
  netMender: cove(0, 18),
  fishSorter: cove(17, 18),
  marketNeighbour: cove(21, -9),
  terraceHand: farm(-37, 4),
  oliveKeeper: farm(37.5, -18),
  shoreWalker: cove(28, 50)
} as const;

/** Named NPCs stay outside crops, market geometry and the disembark point. */
export const SUNREACH_NPC_STATIONS = {
  tomas: { ...cove(-9, 0), rotationY: -Math.PI * 0.35, locationName: "Sunreach Landing Forecourt" },
  tomasDawn: { ...cove(-13, -4), rotationY: -1.1, locationName: "Sunreach Dock Approach" },
  tomasDusk: { ...cove(-6, -8), rotationY: 1.8, locationName: "Sunreach Cove Gathering Corner" },
  ines: { ...farm(5, 4.5), rotationY: Math.PI * 0.8, locationName: "Sunreach Cistern Walk" },
  inesDusk: { ...cove(1, -10), rotationY: 2.5, locationName: "Sunreach Cove Gathering Corner" }
} as const;

/**
 * These walks join the retained regional routes in SunreachWorld.
 * The farm gate is south of the farm bounds; its shoulders do not claim crops.
 * The long terrace perimeter is a service lane, not another plantable field.
 */
export const SUNREACH_LIVING_ROUTES: readonly WorldRoute[] = [
  {
    id: "route.sunreach.cove-shore-walk", scope: "regional", kind: "trail", widthMeters: 2.2,
    points: [cove(-10, 6), cove(-6, 25), cove(6, 39), cove(22, 56), cove(41, 61)]
  },
  {
    id: "route.sunreach.harvest-return", scope: "regional", kind: "trail", widthMeters: 2.1,
    // A second way home makes the shoreline a loop, not an ornamental dead end.
    points: [farm(22, 34), farm(21, 55), farm(0, 77), cove(65, 48), cove(41, 61)]
  },
  {
    id: "route.sunreach.terrace-service-loop", scope: "regional", kind: "lane", widthMeters: 2,
    points: [farm(0, 34), farm(-34, 34), farm(-34, -37), farm(34, -37), farm(34, 34), farm(0, 34)]
  },
  {
    id: "route.sunreach.cistern-walk", scope: "regional", kind: "trail", widthMeters: 1.2,
    // The well is at local (-3.8, 2.4). The dogleg passes on its south side.
    points: [farm(-34, 4.5), farm(-10, 4.5), farm(-6, 5.4), farm(0, 5.4), farm(7, 4.5), farm(34, 4.5)]
  },
  {
    id: "route.sunreach.upper-terrace-walk", scope: "regional", kind: "trail", widthMeters: 1.2,
    points: [farm(-34, -14), farm(34, -14)]
  }
];

export interface SunreachDressingSpec {
  readonly id: string;
  readonly assetId: string;
  readonly x: number;
  readonly z: number;
  readonly rotationY: number;
  readonly scale: number;
  /** Conservative unscaled half extents for the existing grounding contract. */
  readonly footprint: readonly [number, number];
  readonly practicalLight?: boolean;
}

function dressing(
  id: string, assetId: string, point: { x: number; z: number },
  footprint: readonly [number, number], rotationY = 0, scale = 1, practicalLight = false
): SunreachDressingSpec {
  return { id: `authored.sunreach.living.${id}`, assetId, ...point, footprint, rotationY, scale, practicalLight };
}

/**
 * Small working groups, not random clutter. Nothing here is a shop, a resource
 * node, a planted crop or a boat. All assets already belong to Neva's catalog.
 * Large landmarks and the existing dock retain their current assets/support.
 */
export const SUNREACH_DRESSING: readonly SunreachDressingSpec[] = [
  dressing("landing-lamp", "prop_lamp_post_a", cove(-12, -8), [0.4, 0.4], 0.2, 1, true),
  dressing("landing-sign", "prop_signpost_trail_a", cove(-10, -3), [0.4, 0.4], -1.5),
  dressing("landing-barrel", "prop_barrel_wood_a", cove(-5, 10), [0.55, 0.55], 0.1),
  dressing("landing-crate", "prop_crate_wood_a", cove(-2, 10), [0.6, 0.55], -0.18),
  dressing("net-rack", "prop_fishing_net_rack_a", cove(1, 27), [1.8, 0.75], 1.4),
  dressing("net-traps", "prop_lobster_trap_a", cove(6, 24), [0.9, 0.65], 0.3),
  dressing("net-supplies", "prop_cargo_sack_a", cove(3, 22), [0.65, 0.6], -0.3),
  dressing("net-lamp", "prop_lamp_post_a", cove(4, 15), [0.4, 0.4], 0, 1, true),
  dressing("fish-rack", "prop_fish_drying_rack_a", cove(13, 19), [1.75, 0.75], 1.55),
  dressing("fish-crate", "prop_crate_wood_a", cove(18, 22), [0.6, 0.55], -0.1),
  dressing("fish-barrel", "prop_barrel_wood_a", cove(21, 20), [0.55, 0.55], 0.2),
  dressing("market-baskets", "prop_harvest_basket_a", cove(9, -4), [0.65, 0.6], -0.15),
  dressing("market-sacks", "prop_cargo_sack_a", cove(11, -7), [0.65, 0.6], 0.2),
  dressing("gathering-bench", "prop_bench_wood_a", cove(5, -13), [1.4, 0.75], Math.PI),
  dressing("gathering-lamp", "prop_lamp_post_a", cove(-3, -13), [0.4, 0.4], 0, 1, true),
  dressing("market-olive", "tree_olive_a", cove(12, -14), [1.05, 0.85], 0.25, 0.95),
  dressing("market-flowers", "foliage_wildflower_b", cove(8, -16), [0.5, 0.5], 0.4, 0.8),
  dressing("shore-driftwood", "prop_driftwood_log_a", cove(10, 50), [1.7, 0.65], 0.7, 0.9),
  dressing("shore-rock-west", "rock_field_a", cove(4, 42), [0.9, 0.7], 0.6),
  dressing("shore-rock-east", "rock_field_a", cove(18, 59), [0.9, 0.7], -0.4, 1.1),
  dressing("shore-bench", "prop_bench_wood_a", cove(32, 48), [1.4, 0.75], -1.8),
  dressing("shore-olive", "tree_olive_b", cove(38, 42), [1.05, 0.85], 1.8),
  dressing("shore-sign", "prop_signpost_trail_a", cove(33, 54), [0.4, 0.4], 1.1),
  dressing("farm-gate-sign", "prop_signpost_trail_a", farm(-4, 29), [0.4, 0.4], 0.4),
  dressing("farm-gate-lamp", "prop_lamp_post_a", farm(4, 29), [0.4, 0.4], 0, 1, true),
  dressing("farm-baskets", "prop_harvest_basket_a", farm(-24, 28), [0.65, 0.6], 0.25),
  dressing("farm-wheelbarrow", "prop_wheelbarrow_a", farm(-26, 25.5), [1.1, 0.7], -0.6),
  dressing("farm-water-barrel", "prop_barrel_wood_a", farm(-27, 21), [0.55, 0.55], 0.3),
  dressing("farm-potting-bench", "prop_potting_bench_a", farm(-39, 0), [1.25, 0.9], -Math.PI / 2),
  dressing("farm-work-basket", "prop_harvest_basket_a", farm(-40, 6), [0.65, 0.6], 0.4),
  dressing("farm-beehive", "prop_beehive_a", farm(42, -16), [0.8, 0.7], -Math.PI / 2),
  dressing("farm-orchard-basket", "prop_harvest_basket_a", farm(39, -21), [0.65, 0.6], 0.2),
  dressing("farm-east-olive", "tree_olive_a", farm(42, -26), [1.05, 0.85], 0.7),
  dressing("farm-east-olive-b", "tree_olive_b", farm(43, -8), [1.05, 0.85], 1.9),
  dressing("farm-west-olive", "tree_olive_b", farm(-43, -10), [1.05, 0.85], 0.8),
  dressing("farm-west-olive-b", "tree_olive_a", farm(-44, 16), [1.05, 0.85], -0.3),
  dressing("farm-south-sunflowers", "foliage_sunflower_a", farm(15, 29), [0.7, 0.6], 0.1, 0.9),
  dressing("farm-south-sunflowers-b", "foliage_sunflower_a", farm(18, 29), [0.7, 0.6], 0.3, 0.9),
  dressing("farm-north-sunflowers", "foliage_sunflower_a", farm(-15, -33), [0.7, 0.6], Math.PI, 0.9),
  dressing("farm-north-sunflowers-b", "foliage_sunflower_a", farm(-18, -33), [0.7, 0.6], 2.9, 0.9),
  dressing("farm-north-lamp", "prop_lamp_post_a", farm(0, -33), [0.4, 0.4], 0, 1, true),
  dressing("farm-east-lamp", "prop_lamp_post_a", farm(29, 25), [0.4, 0.4], 0, 1, true),
  dressing("ridge-bench", "prop_bench_wood_a", { x: SUNREACH_ANCHORS.exposedRidge.x - 5, z: SUNREACH_ANCHORS.exposedRidge.z + 9.2 }, [1.4, 0.75], -2.2),
  dressing("ridge-sign", "prop_signpost_trail_a", { x: SUNREACH_ANCHORS.exposedRidge.x - 10, z: SUNREACH_ANCHORS.exposedRidge.z + 12 }, [0.4, 0.4], -0.7),
  dressing("ridge-pine", "tree_pine_b", { x: SUNREACH_ANCHORS.exposedRidge.x + 6, z: SUNREACH_ANCHORS.exposedRidge.z + 15 }, [1.05, 0.85], 1.8, 0.9),
  dressing("reef-bench", "prop_bench_wood_a", { x: SUNREACH_ANCHORS.southernReefView.x - 7, z: SUNREACH_ANCHORS.southernReefView.z - 2 }, [1.4, 0.75], -0.2),
  dressing("reef-sign", "prop_signpost_trail_a", { x: SUNREACH_ANCHORS.southernReefView.x - 5, z: SUNREACH_ANCHORS.southernReefView.z - 8 }, [0.4, 0.4], 0.3),
  dressing("reef-rock", "rock_field_a", { x: SUNREACH_ANCHORS.southernReefView.x + 14, z: SUNREACH_ANCHORS.southernReefView.z + 1 }, [1, 0.8], 0.5, 1.1),
  dressing("reef-olive", "tree_olive_b", { x: SUNREACH_ANCHORS.southernReefView.x - 13, z: SUNREACH_ANCHORS.southernReefView.z - 14 }, [1.05, 0.85], 1.4),
  dressing("reef-driftwood", "prop_driftwood_log_a", { x: SUNREACH_ANCHORS.southernReefView.x + 6, z: SUNREACH_ANCHORS.southernReefView.z + 5 }, [1.4, 0.6], 1.3, 0.8)
];

/** Circle-to-rectangle distance, so large canopies never enter a legal bed. */
export function sunreachPlantingClearance(x: number, z: number): number {
  const localX = x - SUNREACH_FARM_LAYOUT.origin.x;
  const localZ = z - SUNREACH_FARM_LAYOUT.origin.z;
  let distance = Number.POSITIVE_INFINITY;
  for (const bed of SUNREACH_FARM_LAYOUT.plantableAreas) {
    distance = Math.min(distance, Math.hypot(
      Math.max(bed.minX - localX, 0, localX - bed.maxX),
      Math.max(bed.minZ - localZ, 0, localZ - bed.maxZ)
    ));
  }
  return distance;
}

interface Reservation { readonly x: number; readonly z: number; readonly radius: number }

// Coordinates follow retained authorities instead of copying a second well or
// boarding point. All schedule phases and their whole motion rings are reserved.
const SUNREACH_ACTIVITY_RESERVES: readonly Reservation[] = [
  { ...SUNREACH_ANCHORS.dockPlayer, radius: 4 },
  { ...SUNREACH_ANCHORS.coveMarket, radius: 7 },
  { ...SUNREACH_ANCHORS.exposedRidge, radius: 5 },
  { x: SUNREACH_ANCHORS.coveMarket.x + 9, z: SUNREACH_ANCHORS.coveMarket.z + 5, radius: 2.7 },
  ...SUNREACH_FARM_LAYOUT.structureAnchors.map(anchor => ({
    ...farm(anchor.x, anchor.z), radius: anchor.clearanceRadius + anchor.frontApproachDistanceMeters + 0.6
  })),
  ...SUNREACH_FARM_LAYOUT.farmsteadAnchors.map(anchor => ({
    ...farm(anchor.x, anchor.z), radius: anchor.clearanceRadius + 0.6
  })),
  ...Object.values(SUNREACH_LIFE_STATIONS).map(point => ({ ...point, radius: 2.2 })),
  ...Object.values(SUNREACH_NPC_STATIONS).map(point => ({ ...point, radius: 1.6 }))
];

function clearsReservations(reserves: readonly Reservation[], x: number, z: number, radius: number): boolean {
  for (const point of reserves) {
    const dx = x - point.x, dz = z - point.z, reach = radius + point.radius;
    if (dx * dx + dz * dz <= reach * reach) return false;
  }
  return true;
}

export function clearsSunreachActivity(x: number, z: number, radius: number): boolean {
  return Number.isFinite(x) && Number.isFinite(z) && Number.isFinite(radius) && radius >= 0
    && sunreachPlantingClearance(x, z) > radius + 0.4
    && clearsReservations(SUNREACH_ACTIVITY_RESERVES, x, z, radius);
}

/** Conservative visual envelopes; trunk footprints alone do not reserve crowns. */
export function sunreachDressingRadius(spec: SunreachDressingSpec): number {
  return Math.max(Math.hypot(...spec.footprint) * Math.max(1, spec.scale), spec.assetId.startsWith("tree_") ? 3.2 * spec.scale : 0);
}

const SUNREACH_DRESSING_RESERVES: readonly Reservation[] = SUNREACH_DRESSING.map(spec => ({
  x: spec.x, z: spec.z, radius: sunreachDressingRadius(spec) + 0.4
}));

/** Shared by BOTH Sunreach structural and small-cover passes. */
export function clearsSunreachDressing(x: number, z: number, radius: number): boolean {
  return clearsSunreachActivity(x, z, radius)
    && clearsReservations(SUNREACH_DRESSING_RESERVES, x, z, radius);
}

/**
 * Road feathers must not re-grade or emboss wheel ruts into productive beds.
 * Keep-out fades outside each bed, rather than introducing a height seam at
 * its boundary. The early bounds test keeps mainland queries inexpensive.
 */
export function sunreachRoadEarthworkScale(x: number, z: number): number {
  const localX = x - SUNREACH_FARM_LAYOUT.origin.x;
  const localZ = z - SUNREACH_FARM_LAYOUT.origin.z;
  const bounds = SUNREACH_FARM_LAYOUT.farmBounds;
  if (localX < bounds.minX - 2 || localX > bounds.maxX + 2
    || localZ < bounds.minZ - 2 || localZ > bounds.maxZ + 2) return 1;
  const t = Math.min(1, sunreachPlantingClearance(x, z) / 1.5);
  return t * t * (3 - 2 * t);
}
