import { OCEAN_ISLAND_DEFINITIONS, type OceanIsletId } from "./OceanIslets";
import type { WorldBounds, WorldPoint } from "./WorldLayout";
import { LoopSegmentIndex } from "./WorldGeometry";
import { nevaHeadlandAt } from "./NevaCoastField";
import { fractalNoise } from "./ProceduralNoise";
import type { MainlandBiomeId } from "./NevaMainland";

export { isInsideLoop, pointSegmentDistance } from "./WorldGeometry";

export const SUNREACH_OFFSET_X = 800;

/** Authored mainland envelope; the coast loop and scatter grids stay inside it. */
export const MAINLAND_BOUNDS = { minX: -890, maxX: 210, minZ: -780, maxZ: 710 } as const;

export type WorldIslandId = "island.neva" | "island.sunreach" | OceanIsletId;
export type WorldBiomeId = MainlandBiomeId | "biome.sunreach_warm_dry";
export type FishingEcologyId = "ecology.neva" | "ecology.sunreach";

export type WorldRegionId =
  | "region.village"
  | "region.farm"
  | "region.coast"
  | "region.harbor"
  | "region.offshore"
  | "region.open_channel"
  | "region.pinewatch"
  | "region.reedhaven"
  | "region.highridge"
  | "region.sunreach_cove"
  | "region.sunreach_terraces"
  | "region.sunreach_scrub"
  | "region.sunreach_ridge";

export interface WorldTerrainPatchDefinition {
  id: "terrain.neva" | "terrain.neva_north" | "terrain.neva_northwest" | "terrain.neva_west" | "terrain.neva_southwest" | "terrain.neva_south" | "terrain.sunreach" | "terrain.gull_rest" | "terrain.driftwood" | "terrain.lantern";
  islandId: WorldIslandId;
  center: Readonly<WorldPoint>;
  sizeMeters: number;
  resolution: number;
  bounds: Readonly<WorldBounds>;
  /** Visual-only skirt below sea level. It is never part of the collider. */
  submergedApronMeters: number;
}

export interface WorldClimateWeatherInput {
  temperatureC: number;
  precipitation: number;
  windSpeed: number;
  windDirectionDeg: number;
  seaRoughness: number;
}

export interface WorldClimateSample {
  islandId: WorldIslandId;
  biomeId: WorldBiomeId;
  climateId: "temperate" | "warm" | "cool";
  temperatureC: number;
  temperatureOffsetC: number;
  precipitation: number;
  rainfallEffectiveness: number;
  effectivePrecipitation: number;
  evaporationMultiplier: number;
  exposure: number;
}

export interface WorldDrainageSample {
  islandId: WorldIslandId;
  catchment: number;
  wash: number;
  erosion: number;
  deposition: number;
  moisturePotential: number;
  slope: number;
  aspect: number;
  saltExposure: number;
  reefShelfInfluence: number;
}

export interface MarineSample {
  /** Positive in water and negative on dry land. */
  signedShoreDistance: number;
  bathymetryMeters: number;
  coveShelter: number;
  openWaterExposure: number;
  reefInfluence: number;
  shallowWaterInfluence: number;
  waveDirection: Readonly<WorldPoint>;
  flowDirection: Readonly<WorldPoint>;
  navigationHazard: number;
  ecologyWeights: Readonly<Record<FishingEcologyId, number>>;
}

export interface FishingEcologyDefinition {
  id: FishingEcologyId;
  islandId: WorldIslandId;
  label: string;
  schoolSpawnPoints: readonly Readonly<WorldPoint & {
    habitatId: "river" | "lake" | "coast" | "offshore";
    reviewSpeciesId?: string;
  }>[];
}

export interface BoatMooringDefinition {
  id: string;
  islandId: WorldIslandId;
  marketId: string | null;
  boatPosition: Readonly<{ x: number; y: number; z: number }>;
  playerPosition: Readonly<WorldPoint>;
  boardRadius: number;
  hullBoardRadius: number;
  dockRadius: number;
  boatTypeIds?: readonly string[];
}

export interface SailingRequirement {
  id: "navigation.open_channel";
  requiredBoatTypeId: "boat.skiff";
  message: string;
  exposureThreshold: number;
}

export interface WorldIslandDefinition {
  id: WorldIslandId;
  biomeId: WorldBiomeId;
  label: string;
  terrainPatch: Readonly<WorldTerrainPatchDefinition>;
  authoredBounds: Readonly<WorldBounds>;
  /** Clockwise closed shoreline loop used by the shared marine field. */
  coastLoop: readonly Readonly<WorldPoint>[];
  fishingEcologyId: FishingEcologyId;
  regions: readonly WorldRegionId[];
  anchors: Readonly<Record<string, Readonly<WorldPoint>>>;
}

function terrainPatch(
  id: WorldTerrainPatchDefinition["id"],
  islandId: WorldIslandId,
  center: Readonly<WorldPoint>,
  sizeMeters: number,
  resolution: number,
  submergedApronMeters: number
): WorldTerrainPatchDefinition {
  const half = sizeMeters * 0.5;
  return {
    id,
    islandId,
    center,
    sizeMeters,
    resolution,
    bounds: {
      minX: center.x - half,
      maxX: center.x + half,
      minZ: center.z - half,
      maxZ: center.z + half
    },
    submergedApronMeters
  };
}


/**
 * Outer mainland rim, from the northeastern bluffs round the mountain coast to
 * the tip of the southern headland. These knots set the continent's outline;
 * the shoreline itself is derived below.
 */
const NEVA_OUTER_RIM_KNOTS: readonly Readonly<WorldPoint>[] = [
  { x: 165, z: -350 }, { x: 120, z: -590 }, { x: -30, z: -710 },
  { x: -310, z: -760 }, { x: -555, z: -735 }, { x: -755, z: -585 },
  { x: -860, z: -330 }, { x: -880, z: -30 }, { x: -850, z: 260 },
  { x: -780, z: 555 }, { x: -570, z: 690 }, { x: -350, z: 650 }
];
const NEVA_RIM_SPACING_METERS = 16;
const NEVA_RIM_HEADLAND_METERS = 46;
/** Keeps the displaced shore, its beach and shelf inside the authored envelope. */
const NEVA_RIM_ENVELOPE_INSET_METERS = 6;

/**
 * Bounded Hermite curve through every knot at roughly `spacing` metres,
 * including both end knots.
 */
function hermiteCurve(knots: readonly Readonly<WorldPoint>[], spacing: number): WorldPoint[] {
  const curve: WorldPoint[] = [];
  for (let i = 0; i < knots.length - 1; i++) {
    const a = knots[Math.max(0, i - 1)], b = knots[i], c = knots[i + 1], d = knots[Math.min(knots.length - 1, i + 2)];
    const length = Math.hypot(c.x - b.x, c.z - b.z);
    const tangent = (previous: WorldPoint, center: WorldPoint, next: WorldPoint): WorldPoint => {
      const before = Math.hypot(center.x - previous.x, center.z - previous.z);
      const after = Math.hypot(next.x - center.x, next.z - center.z);
      const divisor = Math.max(0.001, before + after);
      return { x: (next.x - previous.x) * length / divisor, z: (next.z - previous.z) * length / divisor };
    };
    const first = tangent(a, b, c), second = tangent(b, c, d);
    const steps = Math.max(2, Math.ceil(length / spacing));
    for (let step = i === 0 ? 0 : 1; step <= steps; step++) {
      const t = step / steps, t2 = t * t, t3 = t2 * t;
      const h0 = 2 * t3 - 3 * t2 + 1, h1 = t3 - 2 * t2 + t, h2 = -2 * t3 + 3 * t2, h3 = t3 - t2;
      curve.push({ x: h0 * b.x + h1 * first.x + h2 * c.x + h3 * second.x,
        z: h0 * b.z + h1 * first.z + h2 * c.z + h3 * second.z });
    }
  }
  return curve;
}

/** Arc length from the start of a polyline to each of its points. */
function arcLengths(curve: readonly WorldPoint[]): number[] {
  const arc = [0];
  for (let i = 1; i < curve.length; i++) arc.push(arc[i - 1] + Math.hypot(curve[i].x - curve[i - 1].x, curve[i].z - curve[i - 1].z));
  return arc;
}

/**
 * Curves the outer rim through its knots, then pushes hard-rock headlands out
 * to sea and lets soft ground erode back into bays, using the same geology
 * field that later picks cliff or beach for each shore.
 */
function deriveNevaOuterRim(): WorldPoint[] {
  const curve = hermiteCurve(NEVA_OUTER_RIM_KNOTS, NEVA_RIM_SPACING_METERS);
  const arc = arcLengths(curve);
  const total = arc[arc.length - 1];
  const inset = NEVA_RIM_ENVELOPE_INSET_METERS;
  return curve.map((point, i) => {
    if (i === 0 || i === curve.length - 1) return { x: point.x, z: point.z };
    const previous = curve[i - 1], next = curve[i + 1];
    const tx = next.x - previous.x, tz = next.z - previous.z, length = Math.max(0.001, Math.hypot(tx, tz));
    // Travelling from the northeastern bluffs round to the southern headland,
    // the open sea lies on the left of travel: (-tz, tx) in x/z.
    const seaX = -tz / length, seaZ = tx / length;
    // The rim meets the authored bluffs and headland without a kink.
    const join = Math.min(1, arc[i] / 70, (total - arc[i]) / 70);
    let offset = nevaHeadlandAt(point.x, point.z) * NEVA_RIM_HEADLAND_METERS * join * join * (3 - 2 * join);
    if (offset > 0) {
      // Headlands ease off before the envelope instead of being sheared flat by it.
      const margin = Math.max(0, Math.min(point.x - MAINLAND_BOUNDS.minX, MAINLAND_BOUNDS.maxX - point.x,
        point.z - MAINLAND_BOUNDS.minZ, MAINLAND_BOUNDS.maxZ - point.z) - inset);
      offset = offset * margin / (margin + offset);
    }
    return { x: point.x + seaX * offset, z: point.z + seaZ * offset };
  });
}

/**
 * The cove shore, from the southern headland's outer face round its rocky tip,
 * along the sheltered inner shore past the Reedhaven landing and the river
 * mouth, then east under Pinewatch to the retained starter coast at
 * (-184, 89). The knots set the cove's form: a rounded headland tip, a lowland
 * shore that opens into a small estuary where the river meets the sea, and a
 * northern shore of low points and shallow bights. Both ends join their
 * neighbours exactly and are supplied by them.
 */
const NEVA_COVE_SHORE_KNOTS: readonly Readonly<WorldPoint>[] = [
  { x: -350, z: 650 },
  // Rocky tip of the southern headland.
  { x: -296, z: 612 }, { x: -256, z: 566 }, { x: -236, z: 530 }, { x: -254, z: 503 },
  // Two pocket bays along the headland's inner shore, split by a low point.
  { x: -290, z: 482 }, { x: -324, z: 478 }, { x: -352, z: 444 }, { x: -396, z: 438 },
  { x: -434, z: 404 }, { x: -462, z: 376 },
  // Reedhaven's landing and the lowland shore down to the estuary.
  { x: -478, z: 352 }, { x: -487, z: 333 }, { x: -492, z: 302 }, { x: -500, z: 266 },
  { x: -510, z: 236 }, { x: -524, z: 202 }, { x: -506, z: 172 }, { x: -488, z: 152 },
  // Pinewatch's bight, then low points and shallow bays toward the starter coast.
  { x: -460, z: 128 }, { x: -424, z: 108 }, { x: -384, z: 100.5 }, { x: -350, z: 106 },
  { x: -322, z: 98 }, { x: -292, z: 80 }, { x: -262, z: 90 }, { x: -236, z: 106 },
  { x: -210, z: 96 },
  { x: -184, z: 89 }
];
const NEVA_COVE_SPACING_METERS = 8;
/** Gentle points and pocket bays: sheltered water never builds the fetch that cuts deep bays. */
const NEVA_COVE_HEADLAND_METERS = 10;
const NEVA_COVE_RIPPLE_METERS = 5;
const NEVA_COVE_RIPPLE_SALT = 0x434f5645;
/**
 * Working shores that must not move: the two village landings stand on the
 * shore, and the estuary keeps its authored funnel round the river mouth.
 */
export const NEVA_COVE_SHORE_PINS: readonly Readonly<WorldPoint & { radius: number }>[] = [
  { x: -487, z: 333, radius: 40 },
  { x: -384, z: 100.5, radius: 36 },
  { x: -516, z: 200, radius: 44 }
];

function deriveNevaCoveShore(): WorldPoint[] {
  const curve = hermiteCurve(NEVA_COVE_SHORE_KNOTS, NEVA_COVE_SPACING_METERS);
  const arc = arcLengths(curve);
  const total = arc[arc.length - 1];
  // Both ends are the neighbours' own vertices, so they are dropped here.
  return curve.slice(1, -1).map((point, index) => {
    const i = index + 1;
    const previous = curve[i - 1], next = curve[i + 1];
    const tx = next.x - previous.x, tz = next.z - previous.z, length = Math.max(0.001, Math.hypot(tx, tz));
    // The cove lies on the left of travel, as the open sea does along the rim.
    const seaX = -tz / length, seaZ = tx / length;
    const join = Math.min(1, arc[i] / 60, (total - arc[i]) / 60);
    let hold = join * join * (3 - 2 * join);
    for (const pin of NEVA_COVE_SHORE_PINS) {
      const free = Math.min(1, Math.max(0, (Math.hypot(point.x - pin.x, point.z - pin.z) - pin.radius * 0.35) / (pin.radius * 0.65)));
      hold *= free * free * (3 - 2 * free);
    }
    const offset = (nevaHeadlandAt(point.x, point.z) * NEVA_COVE_HEADLAND_METERS
      + fractalNoise(point.x, point.z, 70, 2, NEVA_COVE_RIPPLE_SALT) * NEVA_COVE_RIPPLE_METERS) * hold;
    return { x: point.x + seaX * offset, z: point.z + seaZ * offset };
  });
}

export const NEVA_COAST_LOOP: readonly Readonly<WorldPoint>[] = Object.freeze([
  // Southern coast (preserving authored shoreline points)
  { x: -184, z: 89 },
  { x: -130, z: 96 },
  { x: -92, z: 94 },
  { x: -52, z: 87 },
  { x: -12, z: 83 },
  { x: 24, z: 79 },
  { x: 52, z: 74 },
  { x: 72, z: 68 },
  { x: 94, z: 73 },
  { x: 130, z: 82 },
  { x: 184, z: 88 },
  // Eastern coast bluffs (facing the open channel to Sunreach)
  { x: 184, z: 45 },
  { x: 182, z: 0 },
  { x: 176, z: -50 },
  { x: 172, z: -100 },
  { x: 160, z: -150 },
  { x: 140, z: -190 },
  { x: 164, z: -220 },
  // The old northern hills lead inland into a broad mountain-backed continent
  // whose outer shore alternates rock headlands and bays.
  ...deriveNevaOuterRim(),
  // A long southern headland cups the cove; the mouth remains open to the east.
  ...deriveNevaCoveShore()
].map(point => Object.freeze(point)));

const NEVA_COAST_INDEX = new LoopSegmentIndex(NEVA_COAST_LOOP);

/** Exact accelerated segment index over `NEVA_COAST_LOOP`. */
export function nevaCoastIndex(): LoopSegmentIndex {
  return NEVA_COAST_INDEX;
}

/** Positive in water, negative on Neva dry land. */
export function signedDistanceToNevaCoast(x: number, z: number): number {
  return NEVA_COAST_INDEX.signedDistance(x, z);
}

/**
 * Authored envelope for the warm-dry island. Fine shoreline character is
 * derived from this loop in SunreachWorld; these fixed points keep the cove,
 * southern reef, and exposed ridge stable across seeds.
 */
export const SUNREACH_COAST_LOOP = [
  { x: 349 + SUNREACH_OFFSET_X, z: 42 },
  { x: 365 + SUNREACH_OFFSET_X, z: 18 },
  { x: 389 + SUNREACH_OFFSET_X, z: -18 },
  { x: 431 + SUNREACH_OFFSET_X, z: -61 },
  { x: 480 + SUNREACH_OFFSET_X, z: -82 },
  { x: 532 + SUNREACH_OFFSET_X, z: -78 },
  { x: 581 + SUNREACH_OFFSET_X, z: -55 },
  { x: 621 + SUNREACH_OFFSET_X, z: -22 },
  { x: 646 + SUNREACH_OFFSET_X, z: 18 },
  { x: 653 + SUNREACH_OFFSET_X, z: 62 },
  { x: 642 + SUNREACH_OFFSET_X, z: 105 },
  { x: 613 + SUNREACH_OFFSET_X, z: 143 },
  { x: 571 + SUNREACH_OFFSET_X, z: 174 },
  { x: 525 + SUNREACH_OFFSET_X, z: 198 },
  { x: 479 + SUNREACH_OFFSET_X, z: 194 },
  { x: 433 + SUNREACH_OFFSET_X, z: 177 },
  { x: 397 + SUNREACH_OFFSET_X, z: 149 },
  { x: 372 + SUNREACH_OFFSET_X, z: 116 },
  { x: 360 + SUNREACH_OFFSET_X, z: 84 },
  { x: 349 + SUNREACH_OFFSET_X, z: 72 },
  { x: 350 + SUNREACH_OFFSET_X, z: 58 }
] as const;

export const SUNREACH_ANCHORS = Object.freeze({
  dockBoat: { x: 343 + SUNREACH_OFFSET_X, z: 58 },
  dockPlayer: { x: 355 + SUNREACH_OFFSET_X, z: 58 },
  coveMarket: { x: 373 + SUNREACH_OFFSET_X, z: 56 },
  terraceFarm: { x: 455 + SUNREACH_OFFSET_X, z: 5 },
  dryScrub: { x: 515 + SUNREACH_OFFSET_X, z: 75 },
  exposedRidge: { x: 590 + SUNREACH_OFFSET_X, z: 25 },
  southernReefView: { x: 520 + SUNREACH_OFFSET_X, z: 180 }
});

const NEVA_TERRAIN_PATCH = terrainPatch("terrain.neva", "island.neva", { x: 0, z: 0 }, 600, 384, 18);
/** Non-overlapping extensions retain the detailed original gameplay grid. */
export const MAINLAND_TERRAIN_PATCHES = [
  terrainPatch("terrain.neva_northwest", "island.neva", { x: -600, z: -600 }, 600, 192, 0),
  terrainPatch("terrain.neva_north", "island.neva", { x: 0, z: -600 }, 600, 192, 0),
  terrainPatch("terrain.neva_west", "island.neva", { x: -600, z: 0 }, 600, 192, 0),
  terrainPatch("terrain.neva_southwest", "island.neva", { x: -600, z: 600 }, 600, 192, 0),
  terrainPatch("terrain.neva_south", "island.neva", { x: 0, z: 600 }, 600, 192, 0)
] as const;
const SUNREACH_TERRAIN_PATCH = terrainPatch("terrain.sunreach", "island.sunreach", { x: 500 + SUNREACH_OFFSET_X, z: 60 }, 360, 256, 16);

export const WORLD_ISLAND_DEFINITIONS: Readonly<Record<WorldIslandId, Readonly<WorldIslandDefinition>>> = Object.freeze({
  ...OCEAN_ISLAND_DEFINITIONS,
  "island.neva": Object.freeze({
    id: "island.neva",
    biomeId: "biome.neva_temperate",
    label: "Neva Mainland",
    terrainPatch: NEVA_TERRAIN_PATCH,
    authoredBounds: MAINLAND_BOUNDS,
    coastLoop: NEVA_COAST_LOOP,
    fishingEcologyId: "ecology.neva",
    regions: ["region.village", "region.farm", "region.coast", "region.harbor", "region.offshore", "region.pinewatch", "region.reedhaven", "region.highridge"] as const,
    anchors: Object.freeze({})
  }),
  "island.sunreach": Object.freeze({
    id: "island.sunreach",
    biomeId: "biome.sunreach_warm_dry",
    label: "Sunreach Isle",
    terrainPatch: SUNREACH_TERRAIN_PATCH,
    authoredBounds: Object.freeze({ minX: 330 + SUNREACH_OFFSET_X, maxX: 670 + SUNREACH_OFFSET_X, minZ: -100, maxZ: 220 }),
    coastLoop: SUNREACH_COAST_LOOP,
    fishingEcologyId: "ecology.sunreach",
    regions: [
      "region.sunreach_cove",
      "region.sunreach_terraces",
      "region.sunreach_scrub",
      "region.sunreach_ridge"
    ] as const,
    anchors: SUNREACH_ANCHORS
  })
});

export const WORLD_ISLAND_IDS = Object.freeze(Object.keys(WORLD_ISLAND_DEFINITIONS) as WorldIslandId[]);
export const WORLD_TERRAIN_PATCHES = Object.freeze([
  ...WORLD_ISLAND_IDS.map(id => WORLD_ISLAND_DEFINITIONS[id].terrainPatch),
  ...MAINLAND_TERRAIN_PATCHES
]);

export const FISHING_ECOLOGY_DEFINITIONS: Readonly<Record<FishingEcologyId, Readonly<FishingEcologyDefinition>>> = Object.freeze({
  "ecology.neva": Object.freeze({
    id: "ecology.neva",
    islandId: "island.neva",
    label: "Neva Waters",
    schoolSpawnPoints: Object.freeze([
      { x: 18, z: 92.21637079147003, habitatId: "lake" as const, reviewSpeciesId: "fish.trout" },
      { x: 118, z: 138.00113938994076, habitatId: "coast" as const, reviewSpeciesId: "fish.tuna" },
      { x: 90, z: 221.41154209242305, habitatId: "offshore" as const, reviewSpeciesId: "fish.blue_marlin" },
      // The river taught sport fishing in Act 3 and then had no sport school at
      // all, so the starting water went dead the moment the lesson ended. This
      // sits on the charted Silverwater access, where the bank reserve gives
      // the encounter a channel run to work with.
      { x: -19.193839218632608, z: -40, habitatId: "river" as const, reviewSpeciesId: "fish.trout" },
      // The deep trench, southwest and well past the working grounds. A second
      // offshore point so the far water is a place the player goes rather than
      // a re-roll of the one they already know.
      { x: -40, z: 250, habitatId: "offshore" as const, reviewSpeciesId: "fish.swordfish" },
      { x: 420, z: 325, habitatId: "offshore" as const, reviewSpeciesId: "fish.swordfish" },
      { x: 605, z: 110, habitatId: "coast" as const, reviewSpeciesId: "fish.tuna" },
      { x: -590, z: -180, habitatId: "lake" as const, reviewSpeciesId: "fish.trout" },
      { x: -550, z: 70, habitatId: "river" as const, reviewSpeciesId: "fish.trout" },
      { x: -460, z: 333, habitatId: "coast" as const, reviewSpeciesId: "fish.tuna" }
    ])
  }),
  "ecology.sunreach": Object.freeze({
    id: "ecology.sunreach",
    islandId: "island.sunreach",
    label: "Sunreach Waters",
    schoolSpawnPoints: Object.freeze([
      // The reef edge where the southern shelf drops away. Tomas's whole case
      // for Sunreach is that "the cove is shelter, not a fishery. The shelf is
      // the fishery", and Acts 7 and 8 send the player here; the school used to
      // sit at the cove mouth beside the dock, so the reef the story is about
      // held nothing. Every rotation offset stays in Sunreach coast water and
      // the reef is sailable from the dock, about as far as the offshore point.
      { x: 586 + SUNREACH_OFFSET_X, z: 184, habitatId: "coast" as const, reviewSpeciesId: "fish.amberjack" },
      { x: 620 + SUNREACH_OFFSET_X, z: 250, habitatId: "offshore" as const, reviewSpeciesId: "fish.amberjack" },
      { x: 785, z: -40, habitatId: "coast" as const, reviewSpeciesId: "fish.amberjack" },
      { x: 960, z: 410, habitatId: "offshore" as const, reviewSpeciesId: "fish.amberjack" }
    ])
  })
});

export const OPEN_CHANNEL_REQUIREMENT: Readonly<SailingRequirement> = Object.freeze({
  id: "navigation.open_channel",
  requiredBoatTypeId: "boat.skiff",
  message: "The open channel needs the Coastal Fishing Skiff.",
  exposureThreshold: 0.58
});

export function worldIslandDefinitions(): readonly Readonly<WorldIslandDefinition>[] {
  return WORLD_ISLAND_IDS.map((id) => WORLD_ISLAND_DEFINITIONS[id]);
}
