import {
  WORLD_ARCHITECTURE_PADS,
  WORLD_LAYOUT_V5,
  WorldLayout,
  type WorldDistrictSample
} from "./WorldLayout";
import { SUNREACH_ANCHORS, type WorldBiomeId, type WorldIslandId } from "./WorldIslands";

export type WorldDistrictId =
  | "farm"
  | "village"
  | "harbor"
  | "headland"
  | "coast"
  | "river"
  | "sunreach-cove"
  | "sunreach-terraces"
  | "sunreach-scrub"
  | "sunreach-ridge";
export type WorldHabitatId =
  | "woodland"
  | "meadow"
  | "orchard"
  | "working-edge"
  | "riparian"
  | "exposed"
  | "dry-scrub"
  | "terrace"
  | "olive-grove"
  | "dry-wash"
  | "exposed-ridge"
  | "reef-edge";
export type CompositionCategory = "tree" | "bush" | "flower" | "short-cover" | "reed" | "rock";
export type CompositionPlacementRole = "core" | "edge" | "isolate" | "landmark" | "riparian" | "route-frame";

export interface WorldCompositionSample {
  islandId: WorldIslandId;
  biomeId: WorldBiomeId;
  district: WorldDistrictSample & { dominant: WorldDistrictId };
  habitat: Readonly<Record<WorldHabitatId, number>> & { dominant: WorldHabitatId };
  route: {
    clearance: number;
    frame: number;
    gateway: number;
  };
  architectureClearance: number;
  coastlineClearance: number;
  fishingAccessClearance: number;
  opening: number;
  macro: number;
  meso: number;
  density: Readonly<Record<CompositionCategory, number>>;
}

/** Presentation-only provenance. It is never stored in GameState or saves. */
export interface CompositionPlacementTag {
  address: string;
  islandId: WorldIslandId;
  biomeId: WorldBiomeId;
  category: CompositionCategory;
  district: WorldDistrictId;
  habitat: WorldHabitatId;
  role: CompositionPlacementRole;
  priority: number;
}

const CATEGORY_SALTS: Readonly<Record<CompositionCategory, number>> = {
  tree: 0x27d4eb2d,
  bush: 0x165667b1,
  flower: 0x9e3779b9,
  "short-cover": 0x85ebca6b,
  reed: 0xc2b2ae35,
  rock: 0x6d2b79f5
};

const ISLAND_SALTS: Readonly<Record<WorldIslandId, number>> = {
  "island.neva": 0,
  "island.sunreach": 0x4f1bbcdc
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / Math.max(0.000001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function mix32(value: number): number {
  let mixed = value | 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x21f0aaad);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x735a2d97);
  return (mixed ^ (mixed >>> 15)) >>> 0;
}

function hashCoordinates(seed: number, x: number, z: number, salt: number): number {
  return mix32(
    Math.imul(seed | 0, 0x9e3779b1)
    ^ Math.imul(x | 0, 0x85ebca77)
    ^ Math.imul(z | 0, 0xc2b2ae3d)
    ^ salt
  ) / 0x100000000;
}

function valueNoise(seed: number, x: number, z: number, scale: number, salt: number): number {
  const scaledX = x / scale;
  const scaledZ = z / scale;
  const x0 = Math.floor(scaledX);
  const z0 = Math.floor(scaledZ);
  const x1 = x0 + 1;
  const z1 = z0 + 1;
  const tx = smoothstep(0, 1, scaledX - x0);
  const tz = smoothstep(0, 1, scaledZ - z0);
  const a = hashCoordinates(seed, x0, z0, salt);
  const b = hashCoordinates(seed, x1, z0, salt);
  const c = hashCoordinates(seed, x0, z1, salt);
  const d = hashCoordinates(seed, x1, z1, salt);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * tz;
}

function radialWeight(x: number, z: number, centerX: number, centerZ: number, radius: number, feather: number): number {
  return 1 - smoothstep(radius, radius + feather, Math.hypot(x - centerX, z - centerZ));
}

function dominantKey<T extends string>(values: Readonly<Record<T, number>>): T {
  let selected = Object.keys(values)[0] as T;
  for (const key of Object.keys(values) as T[]) {
    if (values[key] > values[selected]) selected = key;
  }
  return selected;
}

function architectureClearanceAt(x: number, z: number): number {
  let clearance = 0;
  for (const pad of WORLD_ARCHITECTURE_PADS) {
    const radius = Math.hypot(pad.envelope[0], pad.envelope[1]) + pad.frontageClearanceMeters;
    clearance = Math.max(clearance, radialWeight(x, z, pad.center.x, pad.center.z, radius, 4));
  }
  for (const landmarkId of ["farmhouse", "well", "bridge", "fish-market", "lighthouse", "windmill", "dock"] as const) {
    const landmark = WorldLayout.landmark(landmarkId);
    const radius = landmarkId === "lighthouse" ? 11 : landmarkId === "bridge" ? 12 : 8;
    clearance = Math.max(clearance, radialWeight(x, z, landmark.x, landmark.z, radius, 5));
  }
  return clamp01(clearance);
}

function routeGatewayAt(x: number, z: number): number {
  let gateway = 0;
  for (const junction of WorldLayout.routeJunctions()) {
    gateway = Math.max(
      gateway,
      radialWeight(x, z, junction.center.x, junction.center.z, junction.radiusMeters + 2, junction.blendLengthMeters + 4)
    );
  }
  return clamp01(gateway);
}

function districtField(x: number, z: number): WorldDistrictSample & { dominant: WorldDistrictId } {
  const source = WorldLayout.districtSampleAt(x, z);
  const values: Record<WorldDistrictId, number> = {
    farm: source.farm,
    village: source.village,
    harbor: source.harbor,
    headland: source.headland,
    coast: source.coast,
    river: source.riverCorridor,
    "sunreach-cove": 0,
    "sunreach-terraces": 0,
    "sunreach-scrub": 0,
    "sunreach-ridge": 0
  };
  return { ...source, dominant: dominantKey(values) };
}

export function compositionPriority(
  worldSeed: number,
  category: CompositionCategory,
  addressX: number,
  addressZ: number,
  slot: number = 0
): number {
  return hashCoordinates(
    worldSeed,
    addressX,
    addressZ,
    CATEGORY_SALTS[category] ^ Math.imul(slot + 1, 0x45d9f3b)
  );
}

export function compositionAddress(
  worldSeed: number,
  category: CompositionCategory,
  addressX: number,
  addressZ: number,
  slot: number = 0
): string {
  const hash = mix32(
    Math.imul(worldSeed | 0, 0x9e3779b1)
    ^ Math.imul(addressX | 0, 0x85ebca77)
    ^ Math.imul(addressZ | 0, 0xc2b2ae3d)
    ^ CATEGORY_SALTS[category]
    ^ Math.imul(slot + 1, 0x45d9f3b)
  );
  return `${category}:${addressX}:${addressZ}:${slot}:${hash.toString(36)}`;
}

export function islandCompositionPriority(
  islandId: WorldIslandId,
  worldSeed: number,
  category: CompositionCategory,
  addressX: number,
  addressZ: number,
  slot: number = 0
): number {
  if (islandId === "island.neva") {
    return compositionPriority(worldSeed, category, addressX, addressZ, slot);
  }
  return hashCoordinates(
    worldSeed ^ ISLAND_SALTS[islandId],
    addressX,
    addressZ,
    CATEGORY_SALTS[category] ^ Math.imul(slot + 1, 0x45d9f3b)
  );
}

export function islandCompositionAddress(
  islandId: WorldIslandId,
  worldSeed: number,
  category: CompositionCategory,
  addressX: number,
  addressZ: number,
  slot: number = 0
): string {
  if (islandId === "island.neva") {
    return compositionAddress(worldSeed, category, addressX, addressZ, slot);
  }
  const hash = mix32(
    Math.imul((worldSeed ^ ISLAND_SALTS[islandId]) | 0, 0x9e3779b1)
    ^ Math.imul(addressX | 0, 0x85ebca77)
    ^ Math.imul(addressZ | 0, 0xc2b2ae3d)
    ^ CATEGORY_SALTS[category]
    ^ Math.imul(slot + 1, 0x45d9f3b)
  );
  return `${islandId}/${category}:${addressX}:${addressZ}:${slot}:${hash.toString(36)}`;
}

function sunreachCompositionSample(worldSeed: number, x: number, z: number): WorldCompositionSample {
  const drainage = WorldLayout.drainageSampleAt(x, z);
  const marine = WorldLayout.marineSampleAt(x, z);
  const routeClearance = WorldLayout.roadsideInfluence(x, z);
  const routeProjection = WorldLayout.nearestRouteDistance(x, z);
  const routeEdgeBand = smoothstep(
    routeProjection.halfWidth + routeProjection.shoulderWidthMeters + 1.8,
    routeProjection.halfWidth + routeProjection.shoulderWidthMeters + 5.2,
    routeProjection.distance
  ) * (1 - smoothstep(
    routeProjection.halfWidth + routeProjection.shoulderWidthMeters + 8.5,
    routeProjection.halfWidth + routeProjection.shoulderWidthMeters + 15,
    routeProjection.distance
  ));
  const cove = radialWeight(x, z, SUNREACH_ANCHORS.coveMarket.x, SUNREACH_ANCHORS.coveMarket.z, 25, 52);
  const terraces = radialWeight(x, z, SUNREACH_ANCHORS.terraceFarm.x, SUNREACH_ANCHORS.terraceFarm.z, 34, 62);
  const scrub = radialWeight(x, z, SUNREACH_ANCHORS.dryScrub.x, SUNREACH_ANCHORS.dryScrub.z, 40, 65);
  const ridge = radialWeight(x, z, SUNREACH_ANCHORS.exposedRidge.x, SUNREACH_ANCHORS.exposedRidge.z, 32, 72);
  const districtValues: Record<WorldDistrictId, number> = {
    farm: terraces,
    village: cove * 0.35,
    harbor: cove,
    headland: ridge,
    coast: clamp01(Math.max(cove * 0.55, drainage.saltExposure)),
    river: 0,
    "sunreach-cove": cove,
    "sunreach-terraces": terraces,
    "sunreach-scrub": scrub,
    "sunreach-ridge": ridge
  };
  const district = {
    farm: terraces,
    village: cove * 0.35,
    harbor: cove,
    headland: ridge,
    coast: clamp01(Math.max(cove * 0.55, drainage.saltExposure)),
    riverCorridor: 0,
    dominant: dominantKey(districtValues)
  };
  const macro = valueNoise(worldSeed ^ ISLAND_SALTS["island.sunreach"], x, z, 58, 0x4cf5ad43);
  const meso = valueNoise(worldSeed ^ ISLAND_SALTS["island.sunreach"], x, z, 19, 0x7f4a7c15);
  const dryScrub = clamp01(scrub * (0.5 + meso * 0.5) * (1 - drainage.wash * 0.48));
  const terrace = clamp01(terraces * (0.58 + drainage.moisturePotential * 0.42));
  const oliveGrove = clamp01(terraces * (0.34 + macro * 0.66) * (1 - routeClearance));
  const dryWash = clamp01(drainage.wash * (0.46 + drainage.deposition * 0.54));
  const exposedRidge = clamp01(ridge * (0.55 + drainage.saltExposure * 0.45));
  const reefEdge = clamp01(drainage.reefShelfInfluence * marine.reefInfluence);
  const habitatValues: Record<WorldHabitatId, number> = {
    woodland: oliveGrove * 0.18,
    meadow: terrace * 0.28,
    orchard: oliveGrove,
    "working-edge": cove * 0.72,
    riparian: 0,
    exposed: exposedRidge,
    "dry-scrub": dryScrub,
    terrace,
    "olive-grove": oliveGrove,
    "dry-wash": dryWash,
    "exposed-ridge": exposedRidge,
    "reef-edge": reefEdge
  };
  const habitat = { ...habitatValues, dominant: dominantKey(habitatValues) };
  const coveOpening = radialWeight(x, z, 365, 58, 16, 18);
  const terraceOpening = radialWeight(x, z, 455, 5, 26, 18);
  const ridgeOpening = radialWeight(x, z, 590, 25, 18, 32);
  const opening = clamp01(Math.max(coveOpening, terraceOpening, ridgeOpening, smoothstep(0.78, 0.94, macro) * 0.7));
  const architectureClearance = clamp01(Math.max(coveOpening * 0.82, terraceOpening * 0.62));
  const coastlineClearance = 1 - smoothstep(2, 15, Math.max(0, -marine.signedShoreDistance));
  const structuralClearance = clamp01(Math.max(routeClearance, architectureClearance, coastlineClearance));
  return {
    islandId: "island.sunreach",
    biomeId: "biome.sunreach_warm_dry",
    district,
    habitat,
    route: {
      clearance: routeClearance,
      frame: clamp01(routeEdgeBand * (0.45 + meso * 0.55)),
      gateway: 0
    },
    architectureClearance,
    coastlineClearance,
    fishingAccessClearance: 0,
    opening,
    macro,
    meso,
    density: {
      tree: clamp01((oliveGrove * 0.64 + cove * 0.12) * (1 - structuralClearance) * (1 - opening * 0.72)),
      bush: clamp01((dryScrub * 0.48 + dryWash * 0.26) * (1 - structuralClearance) * (1 - opening * 0.48)),
      flower: clamp01(terrace * 0.3 * (1 - structuralClearance)),
      "short-cover": clamp01((dryScrub * 0.45 + terrace * 0.28) * (1 - structuralClearance)),
      reed: 0,
      rock: clamp01((exposedRidge * 0.62 + drainage.erosion * 0.54) * (1 - routeClearance))
    }
  };
}

export function sampleWorldComposition(worldSeed: number, x: number, z: number): WorldCompositionSample {
  if (WorldLayout.terrainPatchAt(x, z)?.islandId === "island.sunreach") {
    return sunreachCompositionSample(worldSeed, x, z);
  }
  const district = districtField(x, z);
  const river = WorldLayout.riverBankSample(x, z);
  const routeClearance = WorldLayout.roadsideInfluence(x, z);
  const routeGateway = routeGatewayAt(x, z);
  const routeProjection = WorldLayout.nearestRouteDistance(x, z);
  const routeEdgeBand = smoothstep(
    routeProjection.halfWidth + routeProjection.shoulderWidthMeters + 1.8,
    routeProjection.halfWidth + routeProjection.shoulderWidthMeters + 5.2,
    routeProjection.distance
  ) * (1 - smoothstep(
    routeProjection.halfWidth + routeProjection.shoulderWidthMeters + 8.5,
    routeProjection.halfWidth + routeProjection.shoulderWidthMeters + 15,
    routeProjection.distance
  ));
  const routeFrameRhythm = smoothstep(
    0.38,
    0.66,
    valueNoise(worldSeed, routeProjection.distanceAlongRoute, routeProjection.routeIndex * 31, 27, 0x62a9d9ed)
  );
  const routeFrame = routeEdgeBand * routeFrameRhythm;
  const routeEdgeDensity = 1 - routeEdgeBand * (1 - routeFrameRhythm) * 0.9;
  const architectureClearance = architectureClearanceAt(x, z);
  const fishingAccessClearance = WorldLayout.fishingAccessClearanceAt(x, z, river);
  const coastlineDistance = z - WorldLayout.coastlineZ(x);
  const coastlineClearance = clamp01(smoothstep(-1.8, 1.2, coastlineDistance));
  const macro = valueNoise(worldSeed, x, z, 58, 0x4cf5ad43);
  const meso = valueNoise(worldSeed, x, z, 19, 0x7f4a7c15);
  const fine = valueNoise(worldSeed, x, z, 8.5, 0x1b873593);
  const coverMicro = valueNoise(worldSeed, x, z, 3.4, 0x51ed270b);
  const flowerMicro = valueNoise(worldSeed, x, z, 2.8, 0x2c1b3c6d);

  const farmWorkOpening = radialWeight(
    x,
    z,
    WORLD_LAYOUT_V5.anchors.starterFarm.x,
    WORLD_LAYOUT_V5.anchors.starterFarm.z,
    23,
    18
  );
  const headlandOpening = radialWeight(x, z, WORLD_LAYOUT_V5.anchors.lighthouse.x, WORLD_LAYOUT_V5.anchors.lighthouse.z, 25, 25);
  const villagePlazaOpening = radialWeight(x, z, WORLD_LAYOUT_V5.anchors.villageMarket.x, WORLD_LAYOUT_V5.anchors.villageMarket.z, 13, 8);
  const harborWaterfrontOpening = radialWeight(x, z, WORLD_LAYOUT_V5.anchors.fishMarket.x, WORLD_LAYOUT_V5.anchors.fishMarket.z, 16, 13);
  const authoredOpening = Math.max(
    farmWorkOpening * 0.94,
    headlandOpening * 0.9,
    villagePlazaOpening,
    harborWaterfrontOpening * 0.9,
    routeClearance,
    routeGateway
  );
  const opening = clamp01(Math.max(authoredOpening, smoothstep(0.72, 0.94, macro) * 0.72));

  const sheltered = clamp01(
    district.farm * 0.54
    + district.village * 0.68
    + (1 - district.coast) * 0.18
    - district.headland * 0.72
  );
  const riparian = clamp01(
    Math.max(river.lowerBank, river.floodplain * 0.9)
    * river.wetness
    * (0.34 + river.deposition * 0.76)
  );
  const exposed = clamp01(Math.max(district.headland, district.coast * 0.72) * (0.55 + macro * 0.45));
  const orchard = clamp01(district.farm * radialWeight(x, z, 116, -48, 34, 28));
  const workingEdge = clamp01(district.harbor * (1 - harborWaterfrontOpening * 0.84) * (0.55 + meso * 0.45));
  const meadow = clamp01((district.farm * 0.7 + district.coast * 0.32 + district.village * 0.28) * (0.45 + meso * 0.55));
  const woodland = clamp01(sheltered * (0.34 + macro * 0.76) * (1 - opening * 0.88));
  const habitatValues: Record<WorldHabitatId, number> = {
    woodland,
    meadow,
    orchard,
    "working-edge": workingEdge,
    riparian,
    exposed,
    "dry-scrub": 0,
    terrace: 0,
    "olive-grove": 0,
    "dry-wash": 0,
    "exposed-ridge": 0,
    "reef-edge": 0
  };
  const habitat = { ...habitatValues, dominant: dominantKey(habitatValues) };
  const structuralClearance = clamp01(Math.max(
    routeClearance,
    routeGateway,
    architectureClearance,
    coastlineClearance,
    fishingAccessClearance
  ));
  const treeFloor = district.farm * 0.03
    + district.village * 0.24
    + district.harbor * 0.055
    + district.headland * 0.008
    + district.coast * 0.012;
  const bushFloor = district.farm * 0.04
    + district.village * 0.3
    + district.harbor * 0.36
    + district.headland * 0.012
    + district.coast * 0.018;
  const tree = clamp01((
    (woodland * 0.9 + orchard * 0.54 + riparian * 0.22 + workingEdge * 0.16 + exposed * 0.08)
    * (0.42 + macro * 0.58) * 0.24
    + treeFloor * (1 - opening * 0.82)
  )
    * (1 - structuralClearance)
    * routeEdgeDensity
  );
  const bush = clamp01((
    (woodland * 0.62 + meadow * 0.26 + riparian * 0.48 + workingEdge * 0.34)
    * (0.36 + meso * 0.64) * 0.24
    + bushFloor * (1 - opening * 0.68)
  )
    * (1 - structuralClearance * 0.9)
    * routeEdgeDensity
  );
  const flower = clamp01(
    (meadow * 0.66 + orchard * 0.24 + riparian * 0.2)
    * (0.08 + smoothstep(0.48, 0.78, flowerMicro) * 0.72 + fine * 0.2)
    * (1 - Math.max(routeClearance, architectureClearance, coastlineClearance))
  );
  const shortCover = clamp01(
    (0.22 + meadow * 0.54 + woodland * 0.2 + workingEdge * 0.2)
    * (0.12 + fine * 0.28 + coverMicro * 0.6)
    * (1 - Math.max(routeClearance, architectureClearance, coastlineClearance))
  );
  const reed = clamp01(
    riparian
    * (0.24 + meso * 0.76)
    * (1 - routeGateway)
    * (1 - river.erosion * 0.72)
  );
  const rock = clamp01(
    (exposed * 0.58 + river.erosion * Math.max(river.lowerBank, river.upperBank) * 0.76)
    * (0.34 + meso * 0.66)
    * (1 - Math.max(routeClearance, architectureClearance))
  );
  return {
    islandId: "island.neva",
    biomeId: "biome.neva_temperate",
    district,
    habitat,
    route: {
      clearance: routeClearance,
      frame: clamp01(routeFrame * (1 - routeGateway)),
      gateway: routeGateway
    },
    architectureClearance,
    coastlineClearance,
    fishingAccessClearance,
    opening,
    macro,
    meso,
    density: {
      tree,
      bush,
      flower,
      "short-cover": shortCover,
      reed,
      rock
    }
  };
}

export function compositionPlacementTag(
  worldSeed: number,
  category: CompositionCategory,
  addressX: number,
  addressZ: number,
  slot: number,
  sample: WorldCompositionSample
): CompositionPlacementTag {
  const priority = islandCompositionPriority(
    sample.islandId,
    worldSeed,
    category,
    addressX,
    addressZ,
    slot
  );
  let role: CompositionPlacementRole;
  if (category === "reed" || sample.habitat.riparian >= 0.62) role = "riparian";
  else if (sample.route.frame >= 0.58) role = "route-frame";
  else if (priority < 0.12) role = "isolate";
  else if (sample.density[category] >= 0.18) role = "core";
  else role = "edge";
  return {
    address: islandCompositionAddress(sample.islandId, worldSeed, category, addressX, addressZ, slot),
    islandId: sample.islandId,
    biomeId: sample.biomeId,
    category,
    district: sample.district.dominant,
    habitat: sample.habitat.dominant,
    role,
    priority
  };
}
