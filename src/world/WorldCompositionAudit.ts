import {
  generateCausalCompositionPlacements,
  generateSunreachCausalCompositionPlacements,
  type EnvironmentAssetPlacement
} from "./WorldEnvironmentLayout";
import { sampleWorldComposition, type CompositionPlacementRole } from "./WorldCompositionField";
import {
  RIVER_FISHING_ACCESS_RESERVES,
  WORLD_BOUNDS,
  WORLD_LAYOUT_V5,
  WorldLayout,
  type CompiledWorldRoute
} from "./WorldLayout";
import { SUNREACH_ANCHORS } from "./WorldIslands";

export interface WorldCompositionSeedAudit {
  seed: number;
  placementHash: string;
  periodic22Ratio: number;
  periodic555Ratio: number;
  districtDensityCv: number;
  districtDensities: readonly [number, number, number, number];
  districtOrderingPass: boolean;
  largeOpenings: readonly { areaSquareMeters: number; containsFarm: boolean; containsHeadland: boolean }[];
  isolateRatio: number;
  roles: Readonly<Record<CompositionPlacementRole, number>>;
  fishingAccessComponentCount: number;
  fishingAccessClearancePass: boolean;
  routePass: boolean;
  routeFailures: readonly string[];
}

export interface WorldCompositionAuditSummary {
  seeds: readonly WorldCompositionSeedAudit[];
  strongestPeriodicSeed: number;
  weakestDistrictContrastSeed: number;
  repeatedSeed42Hash: readonly [string, string];
}

export interface SunreachCompositionSeedAudit {
  seed: number;
  placementHash: string;
  placementCount: number;
  categoryCounts: Readonly<Record<"tree" | "bush" | "rock", number>>;
  periodic22Ratio: number;
  districtDensityCv: number;
  districtDensities: readonly [number, number, number, number];
  openingPass: boolean;
  islandQualificationPass: boolean;
  routeClearancePass: boolean;
  drainageCouplingPass: boolean;
  roles: Readonly<Record<CompositionPlacementRole, number>>;
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function placementHash(placements: readonly EnvironmentAssetPlacement[]): string {
  return hashText(placements
    .map((placement) => `${placement.id}:${placement.assetId}:${placement.x.toFixed(5)}:${placement.z.toFixed(5)}`)
    .sort()
    .join("|"));
}

function periodicRatio(values: readonly number[], target: number, binWidth: number): number {
  const countAt = (center: number): number => values.filter((value) => Math.abs(value - center) <= binWidth * 0.5).length;
  const targetCount = countAt(target);
  const neighbors = [target - binWidth * 2, target - binWidth, target + binWidth, target + binWidth * 2]
    .map(countAt);
  const neighborMean = neighbors.reduce((sum, value) => sum + value, 0) / neighbors.length;
  return (targetCount + 1) / (neighborMean + 1);
}

function axisSeparations(placements: readonly EnvironmentAssetPlacement[], maximum: number): number[] {
  const values: number[] = [];
  for (let left = 0; left < placements.length; left++) {
    for (let right = left + 1; right < placements.length; right++) {
      const dx = Math.abs(placements[left].x - placements[right].x);
      const dz = Math.abs(placements[left].z - placements[right].z);
      if (dx <= maximum) values.push(dx);
      if (dz <= maximum) values.push(dz);
    }
  }
  return values;
}

function coefficientOfVariation(values: readonly number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  if (mean <= 0.000001) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length);
  return Math.sqrt(variance) / mean;
}

function districtDensity(seed: number, center: { x: number; z: number }): number {
  const values: number[] = [];
  for (let x = center.x - 24; x <= center.x + 24; x += 6) {
    for (let z = center.z - 24; z <= center.z + 24; z += 6) {
      if (!WorldLayout.isWalkable(x, z) || WorldLayout.isWater(x, z)) continue;
      const sample = sampleWorldComposition(seed, x, z);
      values.push(sample.density.tree * 0.68 + sample.density.bush * 0.32);
    }
  }
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function openingComponents(seed: number): Array<{ areaSquareMeters: number; containsFarm: boolean; containsHeadland: boolean }> {
  const step = 5;
  const columns = Math.floor((WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX) / step) + 1;
  const rows = Math.floor((WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ) / step) + 1;
  const open = new Uint8Array(columns * rows);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = WORLD_BOUNDS.minX + column * step;
      const z = WORLD_BOUNDS.minZ + row * step;
      if (WorldLayout.isWalkable(x, z) && sampleWorldComposition(seed, x, z).opening >= 0.62) {
        open[row * columns + column] = 1;
      }
    }
  }
  const visited = new Uint8Array(open.length);
  const components: Array<{ areaSquareMeters: number; containsFarm: boolean; containsHeadland: boolean }> = [];
  for (let start = 0; start < open.length; start++) {
    if (!open[start] || visited[start]) continue;
    const stack = [start];
    visited[start] = 1;
    let cells = 0;
    let containsFarm = false;
    let containsHeadland = false;
    while (stack.length > 0) {
      const index = stack.pop()!;
      const row = Math.floor(index / columns);
      const column = index % columns;
      const x = WORLD_BOUNDS.minX + column * step;
      const z = WORLD_BOUNDS.minZ + row * step;
      cells += 1;
      containsFarm ||= Math.hypot(x + 65, z + 55) <= 24;
      containsHeadland ||= Math.hypot(x + 92, z - 74) <= 28;
      for (const neighbor of [index - 1, index + 1, index - columns, index + columns]) {
        if (neighbor < 0 || neighbor >= open.length || visited[neighbor] || !open[neighbor]) continue;
        const neighborRow = Math.floor(neighbor / columns);
        const neighborColumn = neighbor % columns;
        if (Math.abs(neighborRow - row) + Math.abs(neighborColumn - column) !== 1) continue;
        visited[neighbor] = 1;
        stack.push(neighbor);
      }
    }
    if (cells * step * step >= 900) {
      components.push({ areaSquareMeters: cells * step * step, containsFarm, containsHeadland });
    }
  }
  return components.sort((left, right) => right.areaSquareMeters - left.areaSquareMeters);
}

function routePointAt(route: CompiledWorldRoute, distance: number): { x: number; z: number } {
  const segment = route.segments.find((candidate) => distance <= candidate.cumulativeEnd)
    ?? route.segments[route.segments.length - 1];
  const progress = (distance - segment.cumulativeStart) / Math.max(0.0001, segment.length);
  return {
    x: segment.start.x + segment.dx * Math.max(0, Math.min(1, progress)),
    z: segment.start.z + segment.dz * Math.max(0, Math.min(1, progress))
  };
}

function routeFailures(seed: number, placements: readonly EnvironmentAssetPlacement[]): string[] {
  const failures: string[] = [];
  const structural = placements.filter((placement) =>
    placement.compositionTag?.category === "tree" || placement.compositionTag?.category === "bush"
  );
  for (const route of WorldLayout.compiledRouteNetwork().slice(0, 5)) {
    let openSegments = 0;
    let framedSegments = 0;
    let denseRunMeters = 0;
    let maximumDenseRunMeters = 0;
    for (let distance = 0; distance <= route.totalLength; distance += 5) {
      const point = routePointAt(route, distance);
      if (structural.some((placement) => Math.hypot(placement.x - point.x, placement.z - point.z) < route.corridorRadiusMeters)) {
        failures.push(`${route.route.id}:clearance@${Math.round(distance)}`);
        break;
      }
      const nearby = structural.filter((placement) => {
        const separation = Math.hypot(placement.x - point.x, placement.z - point.z);
        return separation >= route.corridorRadiusMeters && separation <= route.corridorRadiusMeters + 11;
      }).length;
      const field = sampleWorldComposition(seed, point.x, point.z);
      if (nearby === 0) openSegments += 1;
      if (nearby >= 1 || field.route.frame >= 0.4 || field.architectureClearance >= 0.4) framedSegments += 1;
      if (nearby >= 7) {
        denseRunMeters += 5;
        maximumDenseRunMeters = Math.max(maximumDenseRunMeters, denseRunMeters);
      } else {
        denseRunMeters = 0;
      }
    }
    if (openSegments === 0) failures.push(`${route.route.id}:no-open-segment`);
    if (framedSegments === 0) failures.push(`${route.route.id}:no-framed-segment`);
    if (maximumDenseRunMeters > 20) failures.push(`${route.route.id}:dense-wall-${maximumDenseRunMeters}`);
  }
  return failures;
}

function fishingAccessComponentCount(): number {
  const ordinary = RIVER_FISHING_ACCESS_RESERVES.filter((reserve) => {
    const section = WorldLayout.riverSectionAt(reserve.z);
    const direction = reserve.side === "left" ? -1 : 1;
    const width = reserve.side === "left" ? section.leftWaterWidth : section.rightWaterWidth;
    const x = section.centerX + direction * (width + 2);
    return WorldLayout.fishingAccessAt(x, reserve.z).accessible;
  }).length;
  const bridge = WORLD_LAYOUT_V5.anchors.bridge;
  return ordinary + (WorldLayout.fishingAccessAt(bridge.x, bridge.z).accessible ? 1 : 0);
}

export function auditWorldCompositionSeed(seed: number): WorldCompositionSeedAudit {
  const placements = generateCausalCompositionPlacements(seed);
  const structural = placements.filter((placement) => placement.compositionTag);
  const reeds = structural.filter((placement) => placement.compositionTag?.category === "reed");
  const separations22 = axisSeparations(structural, 24);
  const separations555 = axisSeparations(reeds, 7);
  const districtDensities: [number, number, number, number] = [
    districtDensity(seed, { x: -65, z: -55 }),
    districtDensity(seed, { x: 53, z: -52 }),
    districtDensity(seed, { x: 68, z: 60 }),
    districtDensity(seed, { x: -92, z: 74 })
  ];
  const roles: Record<CompositionPlacementRole, number> = {
    core: 0,
    edge: 0,
    isolate: 0,
    landmark: 0,
    riparian: 0,
    "route-frame": 0
  };
  for (const placement of structural) roles[placement.compositionTag!.role] += 1;
  const structuralVegetation = structural.filter((placement) =>
    placement.compositionTag?.category === "tree" || placement.compositionTag?.category === "bush"
  );
  const routeFailureList = routeFailures(seed, placements);
  return {
    seed,
    placementHash: placementHash(placements),
    periodic22Ratio: periodicRatio(separations22, 22, 0.5),
    periodic555Ratio: periodicRatio(separations555, 5.55, 0.35),
    districtDensityCv: coefficientOfVariation(districtDensities),
    districtDensities,
    districtOrderingPass: districtDensities[2] > districtDensities[1]
      && districtDensities[1] > districtDensities[0]
      && districtDensities[0] > districtDensities[3],
    largeOpenings: openingComponents(seed),
    isolateRatio: structuralVegetation.filter((placement) => placement.compositionTag?.role === "isolate").length
      / Math.max(1, structuralVegetation.length),
    roles,
    fishingAccessComponentCount: fishingAccessComponentCount(),
    fishingAccessClearancePass: structural.every((placement) =>
      sampleWorldComposition(seed, placement.x, placement.z).fishingAccessClearance <= 0.08
    ),
    routePass: routeFailureList.length === 0,
    routeFailures: routeFailureList
  };
}

export function auditSunreachCompositionSeed(seed: number): SunreachCompositionSeedAudit {
  const placements = generateSunreachCausalCompositionPlacements(seed);
  const separations = axisSeparations(placements, 24);
  const districtDensities: [number, number, number, number] = [
    districtDensity(seed, SUNREACH_ANCHORS.coveMarket),
    districtDensity(seed, SUNREACH_ANCHORS.terraceFarm),
    districtDensity(seed, SUNREACH_ANCHORS.dryScrub),
    districtDensity(seed, SUNREACH_ANCHORS.exposedRidge)
  ];
  const roles: Record<CompositionPlacementRole, number> = {
    core: 0,
    edge: 0,
    isolate: 0,
    landmark: 0,
    riparian: 0,
    "route-frame": 0
  };
  const categoryCounts = { tree: 0, bush: 0, rock: 0 };
  for (const placement of placements) {
    const tag = placement.compositionTag!;
    roles[tag.role] += 1;
    if (tag.category === "tree" || tag.category === "bush" || tag.category === "rock") {
      categoryCounts[tag.category] += 1;
    }
  }
  const upperWash = WorldLayout.drainageSampleAt(574, 37);
  const washFlank = WorldLayout.drainageSampleAt(545, 5);
  return {
    seed,
    placementHash: placementHash(placements),
    placementCount: placements.length,
    categoryCounts,
    periodic22Ratio: periodicRatio(separations, 22, 0.5),
    districtDensityCv: coefficientOfVariation(districtDensities),
    districtDensities,
    openingPass: [SUNREACH_ANCHORS.coveMarket, SUNREACH_ANCHORS.terraceFarm, SUNREACH_ANCHORS.exposedRidge]
      .every((point) => sampleWorldComposition(seed, point.x, point.z).opening >= 0.62),
    islandQualificationPass: placements.every((placement) =>
      placement.id.startsWith("seeded-fill.island.sunreach/")
      && placement.islandId === "island.sunreach"
      && placement.biomeId === "biome.sunreach_warm_dry"
      && placement.compositionTag?.islandId === "island.sunreach"
    ),
    routeClearancePass: placements.every((placement) =>
      sampleWorldComposition(seed, placement.x, placement.z).route.clearance <= 0.04
    ),
    drainageCouplingPass: upperWash.wash > washFlank.wash
      && upperWash.erosion > washFlank.erosion
      && upperWash.moisturePotential > washFlank.moisturePotential,
    roles
  };
}

export function auditWorldCompositionSeeds(seeds: readonly number[]): WorldCompositionAuditSummary {
  const audits = seeds.map(auditWorldCompositionSeed);
  const strongestPeriodic = audits.reduce((strongest, candidate) =>
    Math.max(candidate.periodic22Ratio, candidate.periodic555Ratio)
      > Math.max(strongest.periodic22Ratio, strongest.periodic555Ratio)
      ? candidate
      : strongest
  );
  const weakestContrast = audits.reduce((weakest, candidate) =>
    candidate.districtDensityCv < weakest.districtDensityCv ? candidate : weakest
  );
  const first42 = auditWorldCompositionSeed(42).placementHash;
  const second42 = auditWorldCompositionSeed(42).placementHash;
  return {
    seeds: audits,
    strongestPeriodicSeed: strongestPeriodic.seed,
    weakestDistrictContrastSeed: weakestContrast.seed,
    repeatedSeed42Hash: [first42, second42]
  };
}
