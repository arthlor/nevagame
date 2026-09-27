import type { EnvironmentAssetPlacement } from "./WorldEnvironmentLayout";
import type { WorldIslandId } from "./WorldIslands";
import { HARBOR_MAIN_PIER, HARBOR_PIER_DECK } from "./WorldAnchors";

type Point = Readonly<{ x: number; z: number }>;
export type HarborId = "neva" | "sunreach";

/** Working wharves flank the retained player berths; their entrances face dry shore. */
export const HARBOR_WORKING_PIERS = [
  { id: "neva-west-wharf", harbor: "neva", islandId: "island.neva", x: 54, z: 78, rotationY: Math.PI / 2 },
  { id: "neva-net-jetty", harbor: "neva", islandId: "island.neva", x: 132, z: 88, rotationY: Math.PI / 2 },
  { id: "sunreach-north-wharf", harbor: "sunreach", islandId: "island.sunreach", x: 1149, z: 32, rotationY: 0 },
  { id: "sunreach-south-jetty", harbor: "sunreach", islandId: "island.sunreach", x: 1163, z: 94, rotationY: 0 }
] as const;
export type HarborWorkingPier = typeof HARBOR_WORKING_PIERS[number];

/** The catalog's working_dock deck/stairs, shared by support and placement. */
export const WORKING_PIER = {
  halfLength: 7, halfWidth: 2.6, deckTop: 2.68, stairHalfWidth: 1.7,
  stairCenters: [7.16, 7.5, 7.84, 8.18, 8.52],
  stairTops: [2.61, 2.43, 2.25, 2.07, 1.89], stairHalfDepth: 0.19,
  approachX: 9.3, firstStep: 0.12
} as const;

export function harborPierWorldPoint(pier: HarborWorkingPier, x: number, z = 0): Point {
  const c = Math.cos(pier.rotationY), s = Math.sin(pier.rotationY);
  return { x: pier.x + x * c + z * s, z: pier.z - x * s + z * c };
}

export function harborPierRootY(pier: HarborWorkingPier, terrain: (x: number, z: number) => number): number {
  const entry = harborPierWorldPoint(pier, WORKING_PIER.approachX);
  return terrain(entry.x, entry.z) + WORKING_PIER.firstStep - WORKING_PIER.stairTops[4];
}

/** Query exact tops, not a visual ramp or a second terrain surface. */
export function harborWorkingPierAt(x: number, z: number): { pier: HarborWorkingPier; top: number; stairs: boolean } | null {
  for (const pier of HARBOR_WORKING_PIERS) {
    const dx = x - pier.x, dz = z - pier.z;
    if (Math.abs(dx) > 10 || Math.abs(dz) > 10) continue;
    const c = Math.cos(pier.rotationY), s = Math.sin(pier.rotationY);
    const localX = dx * c - dz * s, localZ = dx * s + dz * c;
    if (Math.abs(localX) <= WORKING_PIER.halfLength && Math.abs(localZ) <= WORKING_PIER.halfWidth) {
      return { pier, top: WORKING_PIER.deckTop, stairs: false };
    }
    if (localX < WORKING_PIER.halfLength || Math.abs(localZ) > WORKING_PIER.stairHalfWidth) continue;
    for (let i = 0; i < WORKING_PIER.stairCenters.length; i++) {
      if (localX <= WORKING_PIER.stairCenters[i] + WORKING_PIER.stairHalfDepth) {
        return { pier, top: WORKING_PIER.stairTops[i], stairs: true };
      }
    }
  }
  return null;
}

export interface HarborDressingSpec extends EnvironmentAssetPlacement {
  harbor: HarborId;
  /** Extra room beyond the roof/prop for people, loading and entrances. */
  reserve: number;
}

function prop(harbor: HarborId, id: string, assetId: string, x: number, z: number,
  rotationY = 0, scale = 1, footprint: readonly [number, number] = [0.5, 0.5], reserve = 1): HarborDressingSpec {
  return { id: `authored.harbor-district.${harbor}.${id}`, origin: "authored", harbor,
    islandId: harbor === "neva" ? "island.neva" : "island.sunreach", assetId, x, z, rotationY,
    scale: [scale, scale, scale], grounding: footprint, reserve,
    practicalLight: assetId === "prop_dock_lantern_a" || assetId === "prop_lamp_post_a" };
}

/**
 * Shore-side rooms frame useful open ground. Neva's west freight court and east
 * repair beach flank the fish market; Sunreach's cove bazaar faces the channel,
 * with the retained packing counter between its northern stores and net yard.
 */
export const HARBOR_DISTRICT_DRESSING: readonly HarborDressingSpec[] = [
  prop("neva", "freight-store", "building_coastal_store_a", 44.5, 57.5, Math.PI / 2, 1.35, [2.6, 2.25], 4.5),
  prop("neva", "fishmongers-awning", "building_market_stall_a", 58, 44, 0.3, 1.25, [1.7, 1.25], 2.8),
  prop("neva", "repair-shed", "building_coastal_shelter_a", 94, 45, 0.05, 1.3, [2.9, 2.4], 4.6),
  prop("neva", "net-store", "building_coastal_store_a", 123, 61, 0.35, 1.15, [2.2, 1.9], 3.8),
  prop("neva", "freight-cart", "prop_wagon_cart_a", 51, 54, 0.4, 1, [1, 1.85], 2.3),
  prop("neva", "freight-crates-a", "prop_cargo_crate_large_a", 51.5, 60, 0.1, 1.25, [0.6, 0.6]),
  prop("neva", "freight-crates-b", "prop_cargo_crate_large_a", 52, 62, -0.08, 1.1, [0.55, 0.55]),
  prop("neva", "freight-barrel", "prop_barrel_wood_a", 49, 63, 0.2, 1, [0.5, 0.5]),
  prop("neva", "freight-sacks", "prop_cargo_sack_a", 53.5, 61.5, -0.4, 1.4, [0.3, 0.3]),
  prop("neva", "west-lantern", "prop_dock_lantern_a", 57, 67, -0.25, 1, [0.25, 0.4]),
  prop("neva", "awning-basket", "prop_harvest_basket_a", 60.5, 43.5, 0.4, 1, [0.65, 0.6]),
  prop("neva", "awning-crate", "prop_produce_crate_a", 55.5, 44, -0.2, 1, [0.7, 0.5]),
  prop("neva", "square-bench", "prop_bench_wood_a", 72, 44, 0.1, 1, [1.4, 0.75], 2),
  prop("neva", "square-banner", "prop_banner_cloth_a", 69, 43, 0.3, 1, [0.3, 0.3]),
  prop("neva", "repair-timber", "prop_timber_stack_a", 99.5, 46, Math.PI / 2, 0.5, [2, 1], 2.5),
  prop("neva", "repair-bench", "prop_farm_workbench_a", 94, 49, Math.PI, 1, [1.2, 0.8], 1.8),
  prop("neva", "repair-cart", "prop_wheelbarrow_a", 99, 50, -0.6, 1, [1.1, 0.7], 1.6),
  prop("neva", "repair-traps", "prop_lobster_trap_a", 90, 47, 0.4, 1, [0.9, 0.7]),
  prop("neva", "repair-lamp", "prop_dock_lantern_a", 90, 50, 0.2, 1, [0.3, 0.4]),
  prop("neva", "sailmakers-net", "prop_fishing_net_rack_a", 115, 65, 0.35, 1.1, [1.5, 0.65], 2),
  prop("neva", "sailmakers-traps", "prop_lobster_trap_a", 118, 64, -0.1, 1.1, [1, 0.7]),
  prop("neva", "net-store-crates", "prop_cargo_crate_large_a", 126, 65.5, 0.25, 1.2, [0.6, 0.6]),
  prop("neva", "net-store-sacks", "prop_cargo_sack_a", 125.5, 67.5, -0.1, 1.3, [0.3, 0.3]),
  prop("neva", "east-lamp", "prop_dock_lantern_a", 129, 75, 0.2, 1, [0.3, 0.4]),
  prop("neva", "east-net-rack", "prop_fishing_net_rack_a", 135.5, 74.5, 1.2, 1, [1.4, 0.6], 1.8),
  prop("sunreach", "north-store", "building_coastal_store_a", 1172, 25, -1.45, 1.25, [2.4, 2.1], 4.1),
  prop("sunreach", "bazaar-awning", "building_market_stall_a", 1183, 29, -0.3, 1.25, [1.7, 1.25], 2.7),
  prop("sunreach", "bazaar-shelter", "building_coastal_shelter_a", 1194, 37, -1.7, 1.25, [2.75, 2.35], 4.5),
  prop("sunreach", "cargo-store", "building_coastal_store_a", 1197, 59, -Math.PI / 2, 1.35, [2.6, 2.25], 4.4),
  prop("sunreach", "netmakers-shelter", "building_coastal_shelter_a", 1182, 92, Math.PI, 1.2, [2.65, 2.25], 4.4),
  prop("sunreach", "north-cart", "prop_wagon_cart_a", 1172, 32, -0.5, 1, [1, 1.85], 2.3),
  prop("sunreach", "north-crate", "prop_cargo_crate_large_a", 1168, 27.5, 0.2, 1.2, [0.55, 0.55]),
  prop("sunreach", "north-sacks", "prop_cargo_sack_a", 1166.5, 29, -0.1, 1.3, [0.3, 0.3]),
  prop("sunreach", "north-lamp", "prop_dock_lantern_a", 1162, 36, -1.6, 1, [0.3, 0.4]),
  prop("sunreach", "north-net", "prop_fishing_net_rack_a", 1166, 38, -1.3, 1, [1.4, 0.6], 1.8),
  prop("sunreach", "bazaar-baskets", "prop_harvest_basket_a", 1180, 29, -0.2, 1, [0.65, 0.6]),
  prop("sunreach", "bazaar-produce", "prop_produce_crate_a", 1186, 29.5, 0.3, 1, [0.7, 0.5]),
  prop("sunreach", "bazaar-banner", "prop_banner_cloth_a", 1187, 33, 0.2, 1, [0.3, 0.3]),
  prop("sunreach", "gathering-table", "prop_picnic_table_a", 1188, 38, 0.1, 1, [1.6, 1.1], 2.3),
  prop("sunreach", "gathering-lamp", "prop_dock_lantern_a", 1188, 41, -1.5, 1, [0.3, 0.4]),
  prop("sunreach", "cargo-cart", "prop_wheelbarrow_a", 1191, 59, -1.4, 1, [1.1, 0.7], 1.6),
  prop("sunreach", "cargo-crates-a", "prop_cargo_crate_large_a", 1193, 63, -0.1, 1.3, [0.6, 0.6]),
  prop("sunreach", "cargo-crates-b", "prop_cargo_crate_large_a", 1195, 63.5, 0.25, 1.15, [0.55, 0.55]),
  prop("sunreach", "cargo-barrel", "prop_barrel_wood_a", 1200, 63, 0.1, 1, [0.5, 0.5]),
  prop("sunreach", "cargo-sacks", "prop_cargo_sack_a", 1198, 63.5, 0.3, 1.3, [0.3, 0.3]),
  prop("sunreach", "south-traps", "prop_lobster_trap_a", 1177, 93, 0.4, 1.1, [1, 0.7]),
  prop("sunreach", "south-net", "prop_fishing_net_rack_a", 1186, 88.5, 0.4, 1, [1.4, 0.6], 1.8),
  prop("sunreach", "south-barrel", "prop_barrel_wood_a", 1185.5, 94, 0.1, 1, [0.5, 0.5]),
  prop("sunreach", "south-mooring", "prop_mooring_post_a", 1173, 97, -1.5, 1, [0.4, 0.4]),
  prop("sunreach", "south-lantern", "prop_dock_lantern_a", 1172, 90, -1.5, 1, [0.3, 0.4])
];

/** Stations reserve their complete walking envelopes in the same world data as the work yards. */
export const HARBOR_LIFE_STATIONS = [
  { id: "neva.freight-hand", harbor: "neva", x: 55.5, z: 60, assetId: "char_npc_tomas_b", heading: -1.5 },
  { id: "neva.fish-buyer", harbor: "neva", x: 58, z: 48, assetId: "char_npc_maeve_b", heading: Math.PI },
  { id: "neva.shipwright", harbor: "neva", x: 94, z: 51.5, assetId: "char_npc_silas_b", heading: Math.PI },
  { id: "neva.net-worker", harbor: "neva", x: 118, z: 68, assetId: "char_npc_ines_b", heading: Math.PI },
  { id: "neva.pier-deckhand", harbor: "neva", x: 77.4, z: 86.3, assetId: "char_npc_silas_b", heading: Math.PI },
  { id: "neva.pier-loader", harbor: "neva", x: 73.5, z: 99.2, assetId: "char_npc_tomas_b", heading: -Math.PI / 2 },
  { id: "sunreach.quay-hand", harbor: "sunreach", x: 1166, z: 32, assetId: "char_npc_tomas_b", heading: 1.5 },
  { id: "sunreach.bazaar-buyer", harbor: "sunreach", x: 1181, z: 34, assetId: "char_npc_maeve_b", heading: Math.PI },
  { id: "sunreach.store-hand", harbor: "sunreach", x: 1191, z: 64, assetId: "char_npc_silas_b", heading: 1.5 },
  { id: "sunreach.net-worker", harbor: "sunreach", x: 1178, z: 88, assetId: "char_npc_ines_b", heading: 1.5 }
] as const;

/** Arrival-to-work walks reserve breathing space; they do not re-grade the coast. */
export const HARBOR_WORKING_WALKS = [
  { harbor: "neva", points: [{ x: 64.5, z: 54.5 }, { x: 58, z: 54 }, { x: 56, z: 64 }, { x: 54, z: 68.7 }] },
  { harbor: "neva", points: [{ x: 94, z: 54.5 }, { x: 99, z: 54 }, { x: 104, z: 59 }] },
  { harbor: "neva", points: [{ x: 122, z: 67 }, { x: 130, z: 72 }, { x: 132, z: 78.7 }] },
  { harbor: "sunreach", points: [{ x: 1163, z: 53 }, { x: 1163, z: 42 }, { x: 1161, z: 32 }, { x: 1158.3, z: 32 }] },
  { harbor: "sunreach", points: [{ x: 1163, z: 42 }, { x: 1174, z: 38 }, { x: 1182, z: 38 }] },
  { harbor: "sunreach", points: [{ x: 1167, z: 81 }, { x: 1174, z: 86 }, { x: 1175, z: 92 }, { x: 1172.3, z: 94 }] }
] as const;

function segmentDistance(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz);
}

const WORK_YARDS = HARBOR_DISTRICT_DRESSING.filter(p => p.assetId.startsWith("building_")).map(p => ({
  x: p.x + Math.sin(p.rotationY) * 2, z: p.z + Math.cos(p.rotationY) * 2,
  rotationY: p.rotationY, radius: p.reserve * 1.4
}));

/** Compacted soil under loading/repair activity; the terrain and meadow share these weights. */
export function harborWorkWearAt(x: number, z: number): number {
  if (!((x > 32 && x < 147 && z > 28 && z < 105) || (x > 1135 && x < 1210 && z > 14 && z < 105))) return 0;
  const fade = (distance: number, inner: number, outer: number) => {
    const t = Math.max(0, Math.min(1, (distance - inner) / (outer - inner)));
    return 1 - t * t * (3 - 2 * t);
  };
  let wear = 0;
  for (const yard of WORK_YARDS) {
    const dx = x - yard.x, dz = z - yard.z, c = Math.cos(yard.rotationY), s = Math.sin(yard.rotationY);
    const distance = Math.hypot((dx * c - dz * s) / yard.radius, (dx * s + dz * c) / (yard.radius * .85));
    wear = Math.max(wear, fade(distance, .62, 1.1));
  }
  for (const walk of HARBOR_WORKING_WALKS) for (let i = 1; i < walk.points.length; i++) {
    wear = Math.max(wear, fade(segmentDistance({ x, z }, walk.points[i - 1], walk.points[i]), .8, 2));
  }
  return wear;
}

export function inHarborWorkingReserve(point: Point, radius = 0): boolean {
  // Fast rejection keeps continent-wide placement sampling inexpensive.
  if (!((point.x > 38 && point.x < 143 && point.z > 30 && point.z < 105)
    || (point.x > 1135 && point.x < 1210 && point.z > 16 && point.z < 104))) return false;
  return HARBOR_DISTRICT_DRESSING.some(p => Math.hypot(point.x - p.x, point.z - p.z) < p.reserve + radius)
    || HARBOR_LIFE_STATIONS.some(p => Math.hypot(point.x - p.x, point.z - p.z) < 2 + radius)
    || HARBOR_WORKING_WALKS.some(walk => walk.points.slice(1).some((b, i) => segmentDistance(point, walk.points[i], b) < 2 + radius))
    || HARBOR_WORKING_PIERS.some(p => Math.hypot(point.x - p.x, point.z - p.z) < 10 + radius);
}

/** Existing shore habitat stays between working pockets; only conflicting natural scatter yields. */
export function retainHarborDistrictDressing(placement: EnvironmentAssetPlacement): boolean {
  if (!/^(tree_|foliage_|rock_)/.test(placement.assetId)) return true;
  const radius = placement.assetId.startsWith("tree_") ? 3 : placement.grounding ? Math.max(...placement.grounding) : 1;
  return !inHarborWorkingReserve(placement, radius);
}

export function harborDistrictPlacements(terrain: (x: number, z: number) => number): EnvironmentAssetPlacement[] {
  return [
    ...HARBOR_DISTRICT_DRESSING,
    ...HARBOR_WORKING_PIERS.flatMap(pier => {
      const rootY = harborPierRootY(pier, terrain);
      return [
        { id: `authored.harbor-district.${pier.id}`, origin: "authored" as const,
          islandId: pier.islandId as WorldIslandId, assetId: "dock_harbor_coastal_a",
          x: pier.x, z: pier.z, y: rootY, rotationY: pier.rotationY, scale: [1, 1, 1] as const },
        ...[
          { id: "crates", assetId: "prop_cargo_crate_large_a", x: -4, z: 1.65 },
          { id: "barrel", assetId: "prop_barrel_wood_a", x: -5.5, z: 1.65 },
          { id: "sacks", assetId: "prop_cargo_sack_a", x: -2.8, z: 1.8 }
        ].map(cargo => ({ id: `authored.harbor-district.${pier.id}.${cargo.id}`, origin: "authored" as const,
          islandId: pier.islandId as WorldIslandId, assetId: cargo.assetId,
          ...harborPierWorldPoint(pier, cargo.x, cargo.z), y: rootY + WORKING_PIER.deckTop,
          rotationY: pier.rotationY + .12, scale: [1, 1, 1] as const }))
      ];
    })
  ];
}

/** Cargo groups flank a 3 m through lane; every boarding bay remains empty. */
export function mainHarborDockDressing(terrain: (x: number, z: number) => number): EnvironmentAssetPlacement[] {
  const y = terrain(HARBOR_MAIN_PIER.supportDatum.x, HARBOR_MAIN_PIER.supportDatum.z) + HARBOR_PIER_DECK.deckSurfaceAssetY;
  const at = (id: string, assetId: string, x: number, z: number, rotationY = 0, scale = 1): EnvironmentAssetPlacement => ({
    id: `authored.main-harbor-dock.${id}`, origin: "authored", islandId: "island.neva", assetId,
    x, y, z, rotationY, scale: [scale, scale, scale], practicalLight: assetId === "prop_dock_lantern_a"
  });
  return [
    at("arrival-lantern", "prop_dock_lantern_a", 72.6, 68.5),
    at("fish-crates-a", "prop_cargo_crate_large_a", 72.8, 72),
    at("fish-crates-b", "prop_produce_crate_a", 72.8, 73.3, .1),
    at("fish-barrel", "prop_barrel_wood_a", 72.9, 75),
    at("east-net", "prop_fishing_net_rack_a", 78.1, 79, Math.PI / 2, .9),
    at("east-traps", "prop_lobster_trap_a", 78, 81.8, Math.PI / 2),
    at("east-barrel", "prop_barrel_wood_a", 78.1, 84),
    at("skiff-lantern", "prop_dock_lantern_a", 72.7, 84),
    at("supplies-a", "prop_cargo_crate_large_a", 78, 89, .15, 1.15),
    at("supplies-b", "prop_cargo_sack_a", 78.2, 90.4, -.2, 1.35),
    at("supplies-c", "prop_cargo_crate_large_a", 78, 92.1, -.1),
    at("workbench", "prop_farm_workbench_a", 72.9, 95, Math.PI / 2, .8),
    at("repair-bucket", "prop_harvest_basket_a", 72.8, 97, .4),
    at("freight-lantern", "prop_dock_lantern_a", 78.2, 98.2, Math.PI),
    at("freight-crates-a", "prop_cargo_crate_large_a", 72.8, 102, .1, 1.25),
    at("freight-crates-b", "prop_cargo_crate_large_a", 72.8, 103.4, -.12, 1.2),
    at("freight-sacks", "prop_cargo_sack_a", 72.8, 105, .2, 1.5),
    at("outer-net", "prop_fishing_net_rack_a", 78, 108, Math.PI / 2, .9),
    at("outer-barrel", "prop_barrel_wood_a", 72.9, 109),
    at("outer-lantern", "prop_dock_lantern_a", 78.2, 111, Math.PI),
    at("outer-traps", "prop_lobster_trap_a", 72.9, 111, Math.PI / 2, .85)
  ];
}
