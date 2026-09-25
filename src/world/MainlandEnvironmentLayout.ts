import { MAINLAND_BROOK_CULVERT_FACE_METERS, mainlandBrookAt } from "./MainlandBrooks";
import { MAINLAND_BOUNDS, MAINLAND_VILLAGES, mainlandBiomeAt, mainlandBlendAt, mainlandBrookRoadCrossings } from "./NevaMainland";
import { MAINLAND_SETTLEMENT_BUILDINGS, mainlandSettlementClearanceAt } from "./MainlandSettlementLayout";
import { MAINLAND_WORK_SITES, mainlandWorkSitePoint } from "./MainlandWorkSites";
import { WorldLayout } from "./WorldLayout";
import type { EnvironmentAssetPlacement, GroundCoverPlacement } from "./WorldEnvironmentLayout";
import { sampleWorldComposition, type WorldCompositionSample, type CompositionCategory } from "./WorldCompositionField";

/** Retains the old working district's authored scatter addresses as the continent grows. */
export const STARTER_DRESSING_BOUNDS = { minX: -220, maxX: 200, minZ: -250, maxZ: 130 } as const;

function hash(seed: number, address: number, salt: number): number {
  let value = Math.imul(seed ^ salt, 0x9e3779b1) ^ Math.imul(address + 1, 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 0x100000000;
}

function inMainlandDressingArea(x: number, z: number): boolean {
  return (x < STARTER_DRESSING_BOUNDS.minX || x > STARTER_DRESSING_BOUNDS.maxX
    || z < STARTER_DRESSING_BOUNDS.minZ || z > STARTER_DRESSING_BOUNDS.maxZ)
    && mainlandBlendAt(x, z) > 0.1 && WorldLayout.islandAt(x, z) === "island.neva"
    && !WorldLayout.isWater(x, z);
}

function workingSpaceIsClear(x: number, z: number, margin: number): boolean {
  return mainlandSettlementClearanceAt(x, z) > margin;
}

function authored(id: string, assetId: string, x: number, z: number, rotationY: number = 0): EnvironmentAssetPlacement {
  return { id: `authored.mainland.${id}`, origin: "authored", islandId: "island.neva",
    biomeId: mainlandBiomeAt(x, z), assetId, x, z, rotationY, scale: [1, 1, 1] };
}

/** Keep furniture beside the travel shoulder when an authored road bends through its old address. */
function roadsideVillageDetail(id: string, assetId: string, x: number, z: number, rotationY = 0): EnvironmentAssetPlacement {
  const footprintRadius = assetId === "prop_bench_wood_a" ? 1.6 : 0.9;
  for (const radius of [0, 3, 5, 7, 10, 13]) {
    for (let direction = 0; direction < (radius === 0 ? 1 : 12); direction++) {
      const angle = direction * Math.PI / 6;
      const candidateX = x + Math.sin(angle) * radius, candidateZ = z + Math.cos(angle) * radius;
      const road = WorldLayout.nearestRouteDistance(candidateX, candidateZ);
      if (road.distance <= road.halfWidth + road.shoulderWidthMeters + footprintRadius
        || WorldLayout.isWater(candidateX, candidateZ)
        || WorldLayout.terrainNormalY(candidateX, candidateZ) < 0.94
        || !workingSpaceIsClear(candidateX, candidateZ, footprintRadius)) continue;
      return authored(id, assetId, candidateX, candidateZ, rotationY);
    }
  }
  throw new Error(`No clear roadside position for ${id}`);
}

export function mainlandSettlementPlacements(): EnvironmentAssetPlacement[] {
  const placements = MAINLAND_SETTLEMENT_BUILDINGS.map(({ assetId, pad }) => ({
    ...authored(pad.id.replace(/^mainland\./, ""), assetId, pad.center.x, pad.center.z, pad.rotationY),
    grounding: pad.envelope,
    clearanceRadiusMeters: pad.frontageClearanceMeters,
    frontApproachMeters: pad.frontApproachMeters,
    practicalLight: pad.id.endsWith(".market")
  }));
  const details: EnvironmentAssetPlacement[] = [];
  for (const village of Object.values(MAINLAND_VILLAGES)) {
    const { x, z } = village.market;
    const stall = MAINLAND_SETTLEMENT_BUILDINGS.find((building) =>
      building.villageId === village.id && building.pad.id.endsWith(".market"))!.pad;
    const stallRear = (side: number) => ({
      x: stall.center.x + side * Math.cos(stall.rotationY) - 4.2 * Math.sin(stall.rotationY),
      z: stall.center.z - side * Math.sin(stall.rotationY) - 4.2 * Math.cos(stall.rotationY)
    });
    const crates = stallRear(-2.2), supplies = stallRear(2.2);
    // Furniture lives on the plaza edge; the market apron and NPC station stay open.
    details.push(
      authored(`${village.id}.well`, "prop_water_well_a", x - 12, z + 6),
      roadsideVillageDetail(`${village.id}.bench`, "prop_bench_wood_a", x + 15, z + 8, -Math.PI / 2),
      roadsideVillageDetail(`${village.id}.waymark`, "prop_signpost_trail_a", x - 7, z + 16, 0.3),
      authored(`${village.id}.market-crates`, "prop_crate_wood_a", crates.x, crates.z, 0.2),
      authored(`${village.id}.supplies`, "prop_barrel_wood_a", supplies.x, supplies.z, -0.2)
    );
    const work = village.id === "reedhaven" ? "prop_fish_drying_rack_a" : "prop_firewood_stack_a";
    details.push(authored(`${village.id}.working-stock`, work, x + 18, z + 12, -0.3));
    if (village.id === "pinewatch") {
      details.push(authored(`${village.id}.cart`, "prop_wagon_cart_a", x + 27, z + 9, 0.4));
    } else if (village.id === "highridge") {
      details.push(authored(`${village.id}.wheelbarrow`, "prop_wheelbarrow_a", x + 24, z + 12, 0.6));
    }
    if ("landing" in village) {
      details.push(
        authored(`${village.id}.landing-sign`, "prop_signpost_trail_a", village.landing.x - 5, village.landing.z - 3),
        authored(`${village.id}.landing-stock`, "prop_crate_wood_a", village.landing.x - 5, village.landing.z - 6, 0.4)
      );
    }
  }
  for (const { villageId, pad } of MAINLAND_SETTLEMENT_BUILDINGS) {
    if (pad.id.endsWith(".market")) continue;
    const at = (localX: number, localZ: number) => ({
      x: pad.center.x + localX * Math.cos(pad.rotationY) + localZ * Math.sin(pad.rotationY),
      z: pad.center.z - localX * Math.sin(pad.rotationY) + localZ * Math.cos(pad.rotationY)
    });
    const rear = -pad.envelope[1] - 1.7;
    const isWorkshop = pad.id.endsWith("work-shed");
    const garden = villageId === "reedhaven"
      ? ["prop_lobster_trap_a", "prop_fishing_net_rack_a", "prop_cargo_sack_a"]
      : isWorkshop ? ["prop_firewood_stack_a", "prop_fallen_log_a", "prop_garden_hoe_a"]
        : ["prop_potting_bench_a", "prop_harvest_basket_a", "prop_watering_can_rustic_a"];
    for (let index = 0; index < garden.length; index++) {
      const point = at((index - 1) * 2.3, rear - (index === 1 ? 1 : 0));
      const road = WorldLayout.nearestRouteDistance(point.x, point.z);
      if (WorldLayout.isWater(point.x, point.z) || road.distance < road.halfWidth + road.shoulderWidthMeters + 1.6
        || WorldLayout.terrainNormalY(point.x, point.z) < 0.92) continue;
      details.push(authored(`${pad.id}.garden.${index}`, garden[index], point.x, point.z, pad.rotationY));
    }
    if (!isWorkshop) {
      for (const side of [-1, 1]) {
        const point = at(side * (pad.envelope[0] + 0.8), rear);
        const road = WorldLayout.nearestRouteDistance(point.x, point.z);
        if (!WorldLayout.isWater(point.x, point.z) && road.distance > road.halfWidth + road.shoulderWidthMeters + 1.5
          && WorldLayout.terrainNormalY(point.x, point.z) > 0.94) {
          details.push(authored(`${pad.id}.garden-fence.${side}`, "prop_fence_section_a", point.x, point.z, pad.rotationY + Math.PI / 2));
        }
      }
    }
  }
  return [...placements, ...details, ...mainlandWorkSitePlacements(), ...mainlandRouteLandmarks(), ...mainlandCulvertPlacements()];
}

/** Coping top of `prop_culvert_headwall_a` above its floor, before any height scale. */
const CULVERT_HEADWALL_HEIGHT_METERS = 1.34;
const CULVERT_HEADWALL_WIDTH_SCALE = 1.3;

/**
 * Where a road crosses a brook, the water passes under it in a culvert: a
 * stone headwall stands at each side of the road deck, parallel to the road,
 * on the brook's floor, and tall enough to hold the road's edge. The brook
 * carve stops at the same line (`MAINLAND_BROOK_CULVERT_FACE_METERS`).
 */
function mainlandCulvertPlacements(): EnvironmentAssetPlacement[] {
  const placements: EnvironmentAssetPlacement[] = [];
  for (const crossing of mainlandBrookRoadCrossings()) {
    const { point, brook, road, route } = crossing;
    // Road normal, and how squarely the brook meets the road.
    const normal = { x: -road.z, z: road.x };
    const square = Math.max(0.35, Math.abs(brook.x * normal.x + brook.z * normal.z));
    const offset = (route.widthMeters * 0.5 + MAINLAND_BROOK_CULVERT_FACE_METERS) / square;
    for (const side of [-1, 1] as const) {
      const x = point.x + brook.x * offset * side, z = point.z + brook.z * offset * side;
      const facing = Math.sign(normal.x * brook.x * side + normal.z * brook.z * side) || 1;
      const floor = mainlandBrookAt(x, z, 3);
      if (!floor) continue;
      const lift = crossing.roadElevation + 0.06 - floor.bed;
      placements.push({
        ...authored(`culvert.${crossing.brookId}.${route.id}.${side < 0 ? "upstream" : "downstream"}`,
          "prop_culvert_headwall_a", x, z, Math.atan2(normal.x * facing, normal.z * facing)),
        y: floor.bed + 0.04,
        // Wide enough that the wing walls reach the channel's banks.
        scale: [CULVERT_HEADWALL_WIDTH_SCALE, Math.max(0.7, Math.min(2.2, lift / CULVERT_HEADWALL_HEIGHT_METERS)), 1]
      });
    }
  }
  return placements;
}

/**
 * The adit, ice house, salt pans and timber yard that supply the villages'
 * goods, with the everyday props that dress their working ground. A level
 * site keeps the footprint-stability check; a companion that no longer finds
 * dry, open, gentle ground is left out rather than floated or buried.
 */
function mainlandWorkSitePlacements(): EnvironmentAssetPlacement[] {
  const placements: EnvironmentAssetPlacement[] = [];
  for (const site of MAINLAND_WORK_SITES) {
    const [minX, maxX, minZ, maxZ] = site.footprint;
    placements.push({
      ...authored(`worksite.${site.id}`, site.assetId, site.center.x, site.center.z, site.rotationY),
      ...(site.level ? { grounding: [(maxX - minX) * 0.4, (maxZ - minZ) * 0.4] as [number, number] } : {})
    });
    for (const companion of site.companions) {
      const point = mainlandWorkSitePoint(site, companion.local[0], companion.local[1]);
      const road = WorldLayout.nearestRouteDistance(point.x, point.z);
      if (WorldLayout.isWater(point.x, point.z) || road.distance < road.halfWidth + road.shoulderWidthMeters + 1.6
        || WorldLayout.terrainNormalY(point.x, point.z) < 0.9) continue;
      placements.push(authored(`worksite.${site.id}.${companion.key}`, companion.assetId, point.x, point.z,
        site.rotationY + companion.rotationY));
    }
  }
  return placements;
}

/** Working traces occur at useful stopping intervals, each as a small coherent group. */
function mainlandRouteLandmarks(): EnvironmentAssetPlacement[] {
  const placements: EnvironmentAssetPlacement[] = [];
  for (const route of WorldLayout.compiledRouteNetwork()) {
    if (!route.route.id.startsWith("mainland-") || route.route.kind === "lane") continue;
    let nextStop = 170;
    let station = 0;
    for (const sample of route.samples) {
      if (sample.distanceAlongRoute < nextStop) continue;
      nextStop += 230;
      const dx = sample.tangent.x, dz = sample.tangent.z;
      const length = Math.hypot(dx, dz);
      if (length < 0.1) continue;
      const side = station++ % 2 ? -1 : 1;
      const setback = route.halfWidth + route.shoulderWidthMeters + 5;
      const x = sample.point.x + dz / length * setback * side;
      const z = sample.point.z - dx / length * setback * side;
      const nearest = WorldLayout.nearestRouteDistance(x, z);
      if (!inMainlandDressingArea(x, z) || !workingSpaceIsClear(x, z, 5)
        || nearest.distance < nearest.halfWidth + nearest.shoulderWidthMeters + 3
        || WorldLayout.terrainNormalY(x, z) < 0.93) continue;
      const biome = mainlandBiomeAt(x, z);
      const support = biome === "biome.highlands" ? "prop_bench_wood_a"
        : biome === "biome.reed_marsh" ? "prop_lobster_trap_a" : "prop_fallen_log_a";
      placements.push(authored(`waystation.${route.route.id}.${station}.marker`, "prop_signpost_trail_a", x, z, Math.atan2(dx, dz)));
      const supportX = x + dx / length * 2.8, supportZ = z + dz / length * 2.8;
      const supportRoad = WorldLayout.nearestRouteDistance(supportX, supportZ);
      if (!WorldLayout.isWater(supportX, supportZ) && workingSpaceIsClear(supportX, supportZ, 3)
        && supportRoad.distance > supportRoad.halfWidth + supportRoad.shoulderWidthMeters + 2) {
        placements.push(authored(`waystation.${route.route.id}.${station}.rest`, support, supportX, supportZ, Math.atan2(dx, dz)));
      }
    }
  }
  return placements;
}

interface ScatterSpec {
  key: string;
  cellMeters: number;
  spacing: number;
  salt: number;
  category: "tree" | "bush" | "rock" | "reed";
}

// Each habitat has its own spatial address space. Extending a biome cannot
// exhaust a global quota before another part of the continent gets dressed.
const STRUCTURAL_SCATTER: readonly ScatterSpec[] = [
  { key: "canopy", cellMeters: 6.8, spacing: 4.8, salt: 0x5a21, category: "tree" },
  { key: "understory", cellMeters: 10, spacing: 2, salt: 0x5b32, category: "bush" },
  { key: "outcrops", cellMeters: 15, spacing: 4.5, salt: 0x5c43, category: "rock" },
  { key: "wet-margin", cellMeters: 5.8, spacing: 1.5, salt: 0x5d54, category: "reed" }
];

function scatterChoice(spec: ScatterSpec, sample: WorldCompositionSample, roll: number): { assetId: string; density: number } {
  const marsh = sample.biomeId === "biome.reed_marsh";
  const highlands = sample.biomeId === "biome.highlands";
  const forest = sample.biomeId === "biome.pine_forest";
  if (spec.category === "tree") {
    // Most canopy uses published LOD families; un-LODed identity variants are accents.
    const assetId = marsh ? roll > 0.88 ? "tree_dead_a" : roll < 0.48 ? "tree_oak_b" : "tree_oak_a"
      : forest || highlands ? roll > 0.97 ? "tree_pine_young_a" : roll > 0.93 ? "tree_pine_tall_a"
        : roll > 0.88 ? "tree_oak_c" : roll < 0.46 ? "tree_pine_a" : "tree_pine_b"
        : sample.habitat.orchard > 0.4 ? roll < 0.8 ? "tree_apple_a" : "tree_oak_b"
          : roll > 0.94 ? "tree_maple_a" : roll < 0.35 ? "tree_oak_a" : roll < 0.7 ? "tree_oak_b" : "tree_oak_c";
    return { assetId, density: sample.density.tree };
  }
  if (spec.category === "bush") return {
    assetId: sample.habitat.woodland > 0.4 && roll < 0.12 ? "foliage_mushroom_cluster_a"
      : sample.habitat.woodland > 0.3 && roll > 0.93 ? "prop_fallen_log_a"
        : roll < 0.58 ? "foliage_bush_a" : "foliage_bush_round_a",
    density: sample.density.bush
  };
  if (spec.category === "rock") return {
    assetId: highlands && roll > 0.78 ? "rock_boulder_large_a" : roll > 0.42 ? "rock_boulder_a" : "rock_field_a",
    density: sample.density.rock
  };
  return { assetId: roll < 0.64 ? "foliage_reeds_a" : "foliage_cattail_a", density: sample.density.reed };
}

function placementTag(sample: WorldCompositionSample, category: CompositionCategory, address: string, priority: number) {
  return {
    address, islandId: sample.islandId, biomeId: sample.biomeId, category,
    district: sample.district.dominant, habitat: sample.habitat.dominant,
    role: sample.habitat.riparian > 0.6 ? "riparian" as const
      : sample.route.frame > 0.3 ? "route-frame" as const
        : sample.habitat.woodland > 0.45 ? "core" as const : "edge" as const,
    priority
  };
}

/** Local grove density with finite map area; never stored as gameplay state. */
export function* mainlandStructuralPlacementSteps(worldSeed: number): Generator<void, EnvironmentAssetPlacement[], void> {
  const placements: EnvironmentAssetPlacement[] = [];
  const occupied = new Map<string, { x: number; z: number; radius: number }[]>();
  const bucketMeters = 10;
  // Keep working/resting places usable when the surrounding grove is regenerated.
  for (const landmark of mainlandSettlementPlacements().filter((placement) => !placement.grounding)) {
    const key = `${Math.floor(landmark.x / bucketMeters)}:${Math.floor(landmark.z / bucketMeters)}`;
    const bucket = occupied.get(key) ?? [];
    bucket.push({ x: landmark.x, z: landmark.z, radius: 1.8 });
    occupied.set(key, bucket);
  }
  for (const spec of STRUCTURAL_SCATTER) {
    const minCellX = Math.floor(MAINLAND_BOUNDS.minX / spec.cellMeters);
    const maxCellX = Math.ceil(MAINLAND_BOUNDS.maxX / spec.cellMeters);
    const minCellZ = Math.floor(MAINLAND_BOUNDS.minZ / spec.cellMeters);
    const maxCellZ = Math.ceil(MAINLAND_BOUNDS.maxZ / spec.cellMeters);
    for (let cz = minCellZ; cz <= maxCellZ; cz++) {
      yield;
      for (let cx = minCellX; cx <= maxCellX; cx++) {
        const address = Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663);
        const x = (cx + 0.12 + hash(worldSeed, address, spec.salt) * 0.76) * spec.cellMeters;
        const z = (cz + 0.12 + hash(worldSeed, address, spec.salt ^ 0x1573) * 0.76) * spec.cellMeters;
        if (!inMainlandDressingArea(x, z)) continue;
        const roll = hash(worldSeed, address, spec.salt ^ 0x6835);
        const sample = sampleWorldComposition(worldSeed, x, z);
        const choice = scatterChoice(spec, sample, roll);
        if (hash(worldSeed, address, spec.salt ^ 0x3571) > choice.density) continue;
        const scaleRoll = hash(worldSeed, address, spec.salt ^ 0x2387);
        const scale = spec.category === "tree" ? 1.12 + scaleRoll * 0.75
          : spec.category === "rock" ? 0.78 + scaleRoll * (sample.biomeId === "biome.highlands" ? 1.5 : 0.7)
            : 0.82 + scaleRoll * 0.7;
        const margin = spec.category === "tree" ? 2.8 * scale : spec.category === "rock" ? 1.8 * scale : 0.7;
        if (!workingSpaceIsClear(x, z, margin) || sample.route.clearance > 0.015) continue;
        const route = WorldLayout.nearestRouteDistance(x, z);
        if (route.distance <= route.halfWidth + route.shoulderWidthMeters + margin) continue;
        const normalY = WorldLayout.terrainNormalY(x, z);
        if (normalY < (spec.category === "rock" ? 0.7 : spec.category === "reed" ? 0.86 : 0.81)) continue;
        const height = WorldLayout.terrainHeight(x, z);
        if (height < 0.25 || (spec.category === "tree" && height > 85)) continue;
        const gx = Math.floor(x / bucketMeters), gz = Math.floor(z / bucketMeters);
        const radius = spec.category === "tree" ? spec.spacing * 0.5
          : spec.category === "rock" ? 1.7 * scale : spec.spacing * 0.5;
        let crowded = false;
        for (let dx = -1; dx <= 1 && !crowded; dx++) {
          for (let dz = -1; dz <= 1 && !crowded; dz++) {
            crowded = (occupied.get(`${gx + dx}:${gz + dz}`) ?? []).some((other) =>
              Math.hypot(other.x - x, other.z - z) < radius + other.radius);
          }
        }
        if (crowded) continue;
        const id = `seeded-fill.mainland.${spec.key}.${cx}.${cz}`;
        placements.push({
          id, origin: "seeded-fill", islandId: "island.neva", biomeId: sample.biomeId,
          assetId: choice.assetId, x, z, rotationY: roll * Math.PI * 2,
          scale: [scale, scale * (0.95 + scaleRoll * 0.17), scale],
          compositionTag: placementTag(sample, spec.category, id, roll)
        });
        const key = `${gx}:${gz}`;
        const bucket = occupied.get(key) ?? [];
        bucket.push({ x, z, radius });
        occupied.set(key, bucket);
      }
    }
  }
  return placements;
}

/** Dense local accents share the instanced, distance-limited cover renderer. */
export function* mainlandGroundCoverSteps(worldSeed: number): Generator<void, GroundCoverPlacement[], void> {
  const placements: GroundCoverPlacement[] = [];
  const cellMeters = 4.2;
  const minX = Math.floor(MAINLAND_BOUNDS.minX / cellMeters), maxX = Math.ceil(MAINLAND_BOUNDS.maxX / cellMeters);
  const minZ = Math.floor(MAINLAND_BOUNDS.minZ / cellMeters), maxZ = Math.ceil(MAINLAND_BOUNDS.maxZ / cellMeters);
  for (let cz = minZ; cz <= maxZ; cz++) {
    yield;
    for (let cx = minX; cx <= maxX; cx++) {
      const address = Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663);
      const x = (cx + hash(worldSeed, address, 0x6331)) * cellMeters;
      const z = (cz + hash(worldSeed, address, 0x6887)) * cellMeters;
      if (!inMainlandDressingArea(x, z) || !workingSpaceIsClear(x, z, 0.3)) continue;
      const sample = sampleWorldComposition(worldSeed, x, z);
      if (sample.route.clearance > 0.04 || WorldLayout.pathInfluence(x, z) > 0.03) continue;
      const roll = hash(worldSeed, address, 0x6911);
      const flower = roll < sample.density.flower;
      const density = flower ? sample.density.flower * 1.6 : sample.density["short-cover"] * 0.85 + sample.habitat.riparian * 0.25;
      if (hash(worldSeed, address, 0x6921) > density || WorldLayout.terrainNormalY(x, z) < 0.79) continue;
      const woodland = sample.habitat.woodland > 0.48;
      const wet = sample.habitat.riparian > 0.55;
      const assetId = flower ? roll < 0.14 ? "foliage_flower_drift_a" : roll < 0.28 ? "foliage_flower_drift_b" : "foliage_flower_drift_c"
        : woodland && roll < 0.18 ? "foliage_mushroom_cluster_a" : wet && roll > 0.72 ? "foliage_reeds_a" : "foliage_meadow_tall_a";
      const scale = 0.72 + hash(worldSeed, address, 0x6937) * 0.72;
      const id = `seeded-fill.mainland.cover.${cx}.${cz}`;
      placements.push({
        id, origin: "seeded-fill", islandId: "island.neva", biomeId: sample.biomeId,
        category: flower ? "flowers" : "meadowTall", assetId, x, z,
        rotationY: hash(worldSeed, address, 0x6959) * Math.PI * 2,
        scale: [scale, scale * (flower ? 0.62 : wet ? 1.12 : 0.88), scale],
        compositionTag: placementTag(sample, flower ? "flower" : "short-cover", id, roll)
      });
    }
  }
  return placements;
}
