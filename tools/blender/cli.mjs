import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { validateSurfaceContract } from "./surface_contract.mjs";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, getBounds, join, meshopt, prune, weld } from "@gltf-transform/functions";
import { validateBytes } from "gltf-validator";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

import {
  computeAssetInputHash,
  computeAssetToolchainHash,
  computeToolchainHash,
  computeCommonToolchainHash,
  computeAssetHash,
  isAssetCurrent,
  isCached,
  assetCachePlan,
  readAssetCache as readAssetCacheModule,
  writeAssetCache,
  recordCache,
  cleanCache,
  ART_CACHE_VERSION,
  DEFAULT_CACHE_ROOT,
  hashFiles,
  generatorModuleFor,
  stableStringify,
  sha256,
} from "./cache.mjs";

import {
  runDynamicBlenderPool,
  BlenderWorkerPool,
  resolveConcurrency,
} from "./pool.mjs";

import {
  optimizeAsset,
  compressImportedAsset,
  optimizeAndGenerateLods,
  mayJoinStaticNode,
  DEFAULT_OPTIMIZE_CONFIG,
} from "./optimize.mjs";
import { compareStaticDocuments } from "./compare_static_source_contract.mjs";

const CLI_PATH = fileURLToPath(import.meta.url);
const HERE = path.dirname(CLI_PATH);
const ROOT = path.resolve(HERE, "../..");
const CATALOG_PATH = path.join(ROOT, "assets/specs/asset-catalog.json");
const SCHEMA_PATH = path.join(ROOT, "assets/specs/asset-catalog.schema.json");
const PALETTE_PATH = path.join(ROOT, "art/palettes/neva.palette.json");
const SCENE_BUDGET_PATH = path.join(ROOT, "tools/blender/asset_budgets.json");
const GENERATED_DIR = path.join(ROOT, "generated/glb");
const PUBLIC_DIR = path.join(ROOT, "public/assets/models");
const REPORT_DIR = path.join(ROOT, "generated/reports");
const STAGING_ROOT = path.join(ROOT, "generated/.staging");
const ART_CACHE_ROOT = path.join(ROOT, "generated/.cache/art");
const MANIFEST_PATH = path.join(REPORT_DIR, "asset-manifest.json");
const QUALITY_REPORT_PATH = path.join(REPORT_DIR, "asset_budget_report.json");
const PUBLIC_MANIFEST_PATH = path.join(PUBLIC_DIR, "asset-manifest.json");
const TOOLCHAIN_EXTENSIONS = new Set([".json", ".mjs", ".mts", ".py"]);
const REQUIRED_REFERENCE_VIEWS = Object.freeze([
  "front",
  "rear",
  "side",
  "three_quarter",
  "gameplay_8m",
  "gameplay_15m",
  "gameplay_read_distance",
]);
const STAGING_RUN_RETENTION = 3;
const ART_YARD_URL = "http://localhost:3000/__neva_art_yard";
const STAGE_PATTERN = /^run-[A-Za-z0-9_-]+$/;
const BLENDER_LOG_BUFFER_BYTES = 16 * 1024 * 1024;
const FAILURE_EXCERPT_LINES = 30;
const INHERITED_STATIC_WARNING_CODES = new Set([
  "IMAGE_FEATURES_UNSUPPORTED",
  "MESH_PRIMITIVE_GENERATED_TANGENT_SPACE",
]);

const readJson = (filename) => JSON.parse(fs.readFileSync(filename, "utf8"));
const safeFilename = (value) => path.basename(value) === value && value.endsWith(".glb");

function paletteTokenForMaterial(material) {
  const token = material?.extras?.neva_palette_token ?? material?.name;
  return typeof token === "string" ? token : null;
}

const srgbChannelToLinear = (value) =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

function staticComparisonPalette(repoRoot = ROOT) {
  const document = readJson(path.join(repoRoot, "art/palettes/neva.palette.json"));
  return Object.fromEntries(Object.entries(document.tokens).map(([token, value]) => {
    const hex = value.hex.replace(/^#/, "");
    const linear = [0, 2, 4].map((offset) =>
      srgbChannelToLinear(Number.parseInt(hex.slice(offset, offset + 2), 16) / 255));
    return [token, {
      linear,
      roughness: value.roughness,
      metalness: value.metalness,
      emissiveStrength: value.emissiveStrength ?? 0,
    }];
  }));
}

async function validateStaticSourceContract(filename, spec, repoRoot = ROOT) {
  if (!spec.staticAuthoring) return null;
  const source = resolveAdmissionSource(spec.staticAuthoring.sourceFile, ".glb", repoRoot);
  const sourceSha256 = sha256(fs.readFileSync(source));
  if (sourceSha256 !== spec.staticAuthoring.sourceSha256) {
    throw new Error(`${spec.id}: immutable static source hash differs from staticAuthoring`);
  }
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const [sourceDocument, candidateDocument] = await Promise.all([
    io.read(source),
    io.read(filename),
  ]);
  const result = compareStaticDocuments(
    sourceDocument,
    candidateDocument,
    spec,
    staticComparisonPalette(repoRoot),
  );
  if (!result.passed) {
    throw new Error(`${spec.id}: decoded static source contract failed: ${result.issues.join("; ")}`);
  }
  return {
    passed: true,
    sourceSha256,
    sourceRegionCount: result.sourceRegionCount,
    candidateRegionCount: result.candidateRegionCount,
    uniformScale: result.transform.uniformScale,
    maximumPositionErrorMeters: Math.max(0, ...result.surfaces.map((row) => row.positionMeters)),
    maximumNormalErrorDegrees: Math.max(
      0,
      ...result.surfaces.map((row) => row.normalRadians * 180 / Math.PI),
    ),
    maximumUvError: Math.max(0, ...result.surfaces.map((row) => row.uv)),
  };
}

async function inheritedStaticSourceWarnings(spec, repoRoot = ROOT) {
  if (!spec.staticAuthoring) return new Set();
  const source = resolveAdmissionSource(spec.staticAuthoring.sourceFile, ".glb", repoRoot);
  const bytes = fs.readFileSync(source);
  const report = await validateBytes(new Uint8Array(bytes), {
    uri: path.basename(source),
    externalResourceFunction: async () => new Uint8Array(),
  });
  const errors = report.issues.messages.filter((issue) => issue.severity === 0);
  if (errors.length) {
    throw new Error(
      `${spec.id}: immutable static source fails Khronos validation\n` +
      errors.map((issue) => `${issue.code}: ${issue.message}`).join("\n"),
    );
  }
  return new Set(
    report.issues.messages
      .filter((issue) => issue.severity === 1 && INHERITED_STATIC_WARNING_CODES.has(issue.code))
      .map((issue) => issue.code),
  );
}

function readGenerationInputs(repoRoot = ROOT) {
  return {
    specHash: sha256(fs.readFileSync(path.join(repoRoot, "assets/specs/asset-catalog.json"))),
    paletteHash: sha256(fs.readFileSync(path.join(repoRoot, "art/palettes/neva.palette.json"))),
    toolchainHash: computeToolchainHash(path.join(repoRoot, "tools/blender")),
  };
}

function assertGenerationInputsUnchanged(expected, phase, repoRoot = ROOT) {
  const current = readGenerationInputs(repoRoot);
  const changed = Object.keys(expected).filter((key) => expected[key] !== current[key]);
  if (changed.length) {
    throw new Error(
      `Generation inputs changed ${phase}: ${changed.join(", ")}; discard this stage and rerun from stable sources`,
    );
  }
}


const number = (min, max) => ({ kind: "number", min, max });
const integer = (min, max) => ({ kind: "integer", min, max });
const choice = (...values) => ({ kind: "choice", values });
const tuple3 = (min, max) => ({ kind: "tuple3", min, max });
const boolean = () => ({ kind: "boolean" });
const repositoryFile = (extension) => ({ kind: "repositoryFile", extension });
const nonemptyString = () => ({ kind: "nonemptyString" });

const PARAMETER_CONTRACTS = Object.freeze({
  coastal_palm: { height: number(4, 12), lean: number(0, 4), spread: number(2, 4.5), fronds: integer(8, 15), leafletPairs: integer(8, 20) },
  coastal_understory: { height: number(0.4, 2.5), spread: number(0.4, 2), leaves: integer(7, 24), form: choice("paddle", "split", "shrub") },
  coastal_rock: { width: number(1, 8), depth: number(1, 6), height: number(0.6, 5), shear: number(-0.3, 0.3), form: choice("cleft", "shelf", "spine") },
  coastal_hut: { width: number(3, 6), depth: number(2.5, 5), wallHeight: number(2, 3.2), roofPitch: number(16, 36), form: choice("shelter", "store") },
  imported_blend: { sourceBlend: repositoryFile(".blend"), sourceCollection: nonemptyString() },
  oak_tree: { height: number(3, 10), spread: number(1, 5), canopyClusters: integer(6, 24), lean: number(-0.4, 0.4), branchCount: integer(4, 10), rootCount: integer(4, 10) },
  olive_tree: { height: number(3, 8), spread: number(1, 4), canopyClusters: integer(6, 24), lean: number(-0.4, 0.4), branchCount: integer(4, 10), rootCount: integer(4, 10), fruitCount: integer(0, 30) },
  pine_tree: { height: number(4, 12), spread: number(1, 4), tiers: integer(5, 12), lean: number(-0.4, 0.4), branchesPerTier: integer(3, 8), rootCount: integer(3, 8) },
  apple_tree: { height: number(2.5, 7), spread: number(1, 4), canopyClusters: integer(6, 20), fruitCount: integer(6, 30), branchCount: integer(3, 8), rootCount: integer(3, 8) },
  bush: { clusters: integer(3, 10), flowerCount: integer(0, 20), leafTips: integer(0, 16) },
  reeds: { stalks: integer(5, 30), height: number(0.5, 3), bladeCount: integer(2, 16) },
  kelp_clump: { fronds: integer(3, 16), height: number(0.4, 3), spread: number(0.1, 2), stalkRadius: number(0.01, 0.12), bladeWidth: number(0.05, 0.8) },
  faceted_rock: {
    scale: tuple3(0.1, 8),
    profile: choice("inland", "coastal", "field"),
    silhouette: choice("cluster", "spine", "shelf", "stack", "cleft"),
    tilt: number(-0.4, 0.4),
    clusterCount: integer(1, 3),
    fractureCount: integer(1, 8),
  },
  farmhouse: {
    width: number(3, 14),
    depth: number(3, 12),
    wallHeight: number(2, 7),
    roofPitchDeg: number(20, 55),
    masonryCourses: integer(2, 10),
    masonryBlocks: integer(3, 12),
    shingleRows: integer(3, 12),
    shingleColumns: integer(4, 14),
    crossGableWidth: number(1.5, 6),
    porchDepth: number(0.8, 3),
    porchPlanks: integer(4, 16),
    chimneyOffsetX: number(0.5, 6),
    chimneyHeight: number(3, 12),
  },
  village_building: {
    width: number(1.4, 16),
    depth: number(1.4, 14),
    wallHeight: number(1.6, 7),
    roofPitchDeg: number(20, 55),
    foundationHeight: number(0.3, 1.4),
    roofOverhang: number(0.15, 1.2),
    roofCourses: integer(2, 8),
    shingleRows: integer(3, 12),
    shingleColumns: integer(4, 14),
    masonryCourses: integer(2, 8),
    masonryBlocks: integer(3, 12),
    porchDepth: number(0, 2.8),
    porchPlanks: integer(0, 16),
    wingOffset: number(-4, 4),
    wingWidth: number(0, 8),
    wingDepth: number(0, 7),
    chimneyOffsetX: number(-6, 6),
    chimneyHeight: number(0, 4),
    plinthScale: number(0.8, 1.5),
    porchWidthRatio: number(0.2, 1.2),
    doorWidth: number(0.4, 2.8),
    doorHeight: number(1.2, 3.2),
    roofForm: choice("front-gable", "side-gable", "lean-to", "offset-gable", "tall-gable"),
    openingLayout: choice("cottage-front", "cottage-side", "cottage-garden", "inn-veranda", "market-arcade", "barn-loft", "shed-tools", "outhouse-vent"),
    variant: choice("cottage-a", "cottage-b", "cottage-c", "inn", "inn-b", "market-hall", "market-hall-b", "barn", "barn-b", "shed", "shed-b", "outhouse", "outhouse-b")
  },
  lighthouse: {
    height: number(6, 24),
    baseRadius: number(1, 5),
    sides: integer(8, 16),
    masonryCourses: integer(2, 12),
    masonryBlocks: integer(6, 24),
    bandCount: integer(4, 12),
    cottageWidth: number(1.5, 5),
  },
  windmill: { height: number(4, 16), baseRadius: number(1, 5), sides: integer(8, 16) },
  stone_bridge: {
    length: number(5, 30),
    width: number(2, 8),
    archCount: integer(1, 4),
    masonryCourses: integer(2, 8),
    railPosts: integer(5, 16),
  },
  log_bridge: {
    length: number(2, 12),
    width: number(1, 4),
    deckPlanks: integer(4, 20),
    railPosts: integer(2, 12),
  },
  working_dock: {
    length: number(3, 20),
    width: number(2, 10),
    canopy: boolean(),
    deckPlanks: integer(4, 40),
    pileRows: integer(2, 8),
  },
  fish_market: {
    width: number(3, 16),
    depth: number(3, 12),
    wallHeight: number(2, 7),
    roofPitchDeg: number(20, 55),
    masonryCourses: integer(2, 10),
    masonryBlocks: integer(3, 14),
    shingleRows: integer(3, 12),
    shingleColumns: integer(4, 14),
    porchDepth: number(0.8, 3),
    porchPlanks: integer(4, 16),
  },
  water_well: { radius: number(0.4, 2), postHeight: number(0.8, 2.4) },
  pumpkin_patch: { pumpkins: integer(3, 12), vineSegments: integer(3, 20), lobes: integer(3, 7), blossomCount: integer(2, 12) },
  lobster_trap: { ribs: integer(4, 14), length: number(0.5, 3), netColumns: integer(2, 8), netRows: integer(2, 8) },
  fishing_net_rack: { width: number(1.2, 5), depth: number(0.4, 2), height: number(1, 4), netColumns: integer(3, 12), netRows: integer(2, 10), buoys: integer(2, 8) },
  fish_drying_rack: { width: number(1.2, 5), depth: number(0.4, 2), height: number(1, 4), fishCount: integer(2, 8) },
  wood_crate: { size: number(0.3, 2), slats: integer(3, 9) },
  wood_barrel: { height: number(0.4, 2), radius: number(0.2, 1), staves: integer(8, 20) },
  wood_fence: { length: number(1, 8), posts: integer(2, 8), rails: integer(1, 4), railSegments: integer(3, 12), hasGate: boolean() },
  hay_bale: { length: number(0.5, 3), radius: number(0.2, 1.5), bands: integer(1, 4), fiberBands: integer(6, 20) },
  lamp_post: { height: number(1.5, 8), armLength: number(0.2, 2) },
  clay_oven: { width: number(0.6, 2.4), depth: number(0.6, 2.4), height: number(0.6, 2.2) },
  worm_compost_bin: { width: number(0.5, 3), depth: number(0.5, 3), height: number(0.4, 2), slatCount: integer(2, 8), lidAngleDeg: number(0, 75), soilFillRatio: number(0.1, 0.95) },
  rowboat: { length: number(2, 8), beam: number(1, 4), ribCount: integer(5, 16), innerPlanks: integer(5, 16), gunwaleSegments: integer(5, 16) },
  fishing_skiff: { length: number(4, 16), beam: number(1.5, 6), ribCount: integer(6, 20), mastHeight: number(3, 14), outerStrakes: integer(2, 7), hullSegments: integer(7, 18), deckBoards: integer(12, 50), sailRows: integer(4, 14) },
  wheat_crop: { stage: choice("seeded", "sprout", "growing", "mature", "overripe", "withered"), stalks: integer(0, 24) },
  barley_crop: { stage: choice("seeded", "sprout", "growing", "mature", "overripe", "withered"), stalks: integer(0, 24) },
  corn_crop: { stage: choice("seeded", "sprout", "growing", "mature", "overripe", "withered"), stalks: integer(0, 8) },
  flax_crop: { stage: choice("seeded", "sprout", "growing", "mature", "overripe", "withered"), stems: integer(0, 32) },
  tomato_crop: { stage: choice("seeded", "sprout", "growing", "mature", "overripe", "withered"), plants: integer(0, 12) },
  potato_crop: { stage: choice("seeded", "sprout", "growing", "mature", "overripe", "withered") },
  carrot_crop: { stage: choice("seeded", "sprout", "growing", "mature", "overripe", "withered"), plants: integer(0, 12) },
  sunflower_crop: { stage: choice("seeded", "sprout", "growing", "mature", "overripe", "withered") },
  olive_crop: { stage: choice("seeded", "sprout", "growing", "mature", "overripe", "withered") },
  apple_tree_crop: { stage: choice("seeded", "sprout", "growing", "mature", "overripe", "withered") },
  turnip_crop: { leafCount: integer(4, 10) },
  pumpkin_crop: { lobes: integer(5, 8), leafCount: integer(3, 8) },
  stylized_fish: {
    species: choice(
      "trout",
      "catfish",
      "pike",
      "arowana",
      "tuna",
      "sturgeon",
      "sailfish",
      "swordfish",
      "blue_marlin",
      "sardine",
      "sea_bream",
      "amberjack"
    ),
    length: number(0.4, 5),
    girth: number(0.05, 1.5),
    finScale: number(0.3, 2),
    bodyDepth: number(0.6, 1.8),
    bodySegments: integer(8, 24),
    radialSegments: integer(8, 18),
    tailPeduncle: number(0.10, 0.42),
  },
  faceted_cloud: {
    variant: choice("bank", "tower"),
    clusters: integer(3, 16),
    width: number(2, 16),
    depth: number(1, 14),
    height: number(1, 16)
  },
  grass_clump: { bladeCount: integer(4, 50), height: number(0.1, 3), spread: number(0.1, 3), bladeWidth: number(0.01, 0.5) },
  wildflower_clump: { stemCount: integer(2, 30), height: number(0.1, 3), spread: number(0.1, 3), petals: integer(3, 12) },
  flower_drift: { blossomCount: integer(3, 12), height: number(0.1, 1.2), spread: number(0.1, 1.2), blossomSize: number(0.02, 0.2) },
  pebble_cluster: { count: integer(2, 50), spread: number(0.1, 4), size: number(0.02, 2) },
  path_slab: { radius: number(0.12, 0.8), height: number(0.02, 0.16), sides: integer(5, 8), chipCount: integer(0, 4) },
  driftwood_cluster: { logCount: integer(1, 10), length: number(0.5, 5), radius: number(0.02, 0.5), angle: number(-3.14, 3.14) },
  farm_workbench: { width: number(1, 5), depth: number(0.5, 3), topHeight: number(0.5, 2.5) },
  produce_stall: { width: number(1, 5), depth: number(0.5, 4), roofHeight: number(1.5, 4.5) },
  seed_pouch: {},
  watering_can: {},
  sickle: {},
  crop_bundle: {},
  harvest_basket: {},
  workstation_scoop: {},
  fishing_rod: { length: number(1, 4), guideCount: integer(3, 8), bendFactor: number(0, 0.4), reelSpoolRadius: number(0.02, 0.15) },
  wagon_cart: { length: number(1.5, 5), width: number(1, 3), height: number(0.8, 3) },
  produce_crate: { size: number(0.4, 2), content: choice("pumpkins", "apples") },
  fauna_cow: { scale: number(0.5, 2), hornScale: number(0.5, 2) },
  fauna_donkey: { scale: number(0.5, 2), earLength: number(0.7, 1.4), legLength: number(0.7, 1.3) },
  fauna_chicken: { scale: number(0.3, 1.5), combScale: number(0.5, 2) },
  fauna_rabbit: { scale: number(0.3, 1.2), earLength: number(0.6, 1.6) },
  fauna_gull: { scale: number(0.4, 1.4), wingSpan: number(0.6, 1.6) },
  fauna_butterfly: { scale: number(0.12, 0.5), wingSpan: number(0.6, 1.6) },
  interior_farmhouse_shell: { width: number(3, 14), depth: number(3, 12), wallHeight: number(2, 7), floorPlanks: integer(6, 30), ceilingBeams: integer(2, 10) },
  cozy_bed: { scale: number(0.5, 2) },
  fireplace_hearth: { width: number(1, 5), depth: number(0.5, 3), height: number(1.5, 5) },
  dining_table: { width: number(1, 4), depth: number(0.5, 3) },
  rustic_chair: { scale: number(0.5, 2) },
  woven_rug: { width: number(1, 6), depth: number(1, 5) },
  cupboard_shelves: { width: number(0.8, 4), depth: number(0.3, 2), height: number(1, 4) },
  cozy_armchair: { scale: number(0.5, 2) },
  // Fully authored family builders: silhouette is fixed by the catalog
  // dimensions and seed, so they take no tuning parameters.
  admiralty_anchor: {},
  algae_frond: {},
  apiary_hive: {},
  beach_grass_tuft: {},
  boulder_large: {},
  broadleaf_oak: {},
  cargo_crate_large: {},
  cargo_sack: {},
  cattail_reeds: {},
  coastal_boulder: {},
  coral_pillar: {},
  coral_staghorn: {},
  coral_table: {},
  dead_tree: {},
  dock_lantern_post: {},
  dock_platform: {},
  driftwood_log: {},
  fallen_log: {},
  fence_section: {},
  fire_pit: {},
  firewood_stack: {},
  floor_plant: {},
  gangplank: {},
  garden_hoe: {},
  hanging_signboard: {},
  item_apple: {},
  item_bread_loaf: {},
  item_carrot: {},
  item_coin_pouch: {},
  item_compass: {},
  item_corn_cob: {},
  item_pie: {},
  lily_pad_cluster: {},
  maple_tree: {},
  marker_buoy: {},
  milk_churn: {},
  mooring_post: {},
  mushroom_cluster: {},
  path_stone_round: {},
  path_stone_slab: {},
  picnic_table: {},
  pier_railing: {},
  potting_bench: {},
  reef_small: {},
  rock_spire: {},
  round_bush: {},
  rustic_watering_can: {},
  sea_stack: {},
  seagrass_tuft: {},
  smoke_plume: {},
  sunflower_stand: {},
  tall_pine: {},
  tilled_soil_tile: {},
  trail_kiosk: {},
  trail_signpost: {},
  treasure_chest: {},
  vegetable_bed_tile: {},
  water_trough: {},
  wheelbarrow: {},
  wood_bench: {},
  wood_bookcase: {},
  wood_side_table: {},
  wood_sideboard: {},
  young_pine: {},
});

const PRIMARY_BINDING_GENERATORS = Object.freeze(
  new Set(["farmhouse", "lighthouse", "stone_bridge", "working_dock", "fish_market"]),
);

function validateGeneratorParameters(asset, repoRoot = ROOT, verifySourceFiles = true) {
  const contract = PARAMETER_CONTRACTS[asset.generator];
  if (!contract) throw new Error(`${asset.id}: missing registered parameter contract for generator ${asset.generator}`);
  const parameters = asset.parameters;
  const expected = new Set(Object.keys(contract));
  const received = new Set(Object.keys(parameters));
  const missing = [...expected].filter((key) => !received.has(key));
  const unknown = [...received].filter((key) => !expected.has(key));
  if (missing.length) throw new Error(`${asset.id}: missing generator parameters: ${missing.join(", ")}`);
  if (unknown.length) throw new Error(`${asset.id}: unknown generator parameters: ${unknown.join(", ")}`);
  for (const [key, rule] of Object.entries(contract)) {
    const value = parameters[key];
    let valid = false;
    if (rule.kind === "number") valid = typeof value === "number" && Number.isFinite(value) && value >= rule.min && value <= rule.max;
    else if (rule.kind === "integer") valid = Number.isInteger(value) && value >= rule.min && value <= rule.max;
    else if (rule.kind === "choice") valid = rule.values.includes(value);
    else if (rule.kind === "tuple3") valid = Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === "number" && Number.isFinite(entry) && entry >= rule.min && entry <= rule.max);
    else if (rule.kind === "boolean") valid = typeof value === "boolean";
    else if (rule.kind === "nonemptyString") valid = typeof value === "string" && value.trim().length > 0 && value.length <= 160;
    else if (rule.kind === "repositoryFile") {
      valid = typeof value === "string" && !path.isAbsolute(value);
      if (valid) {
        validateAdmissionSourcePath(value, rule.extension, repoRoot);
        if (verifySourceFiles) resolveAdmissionSource(value, rule.extension, repoRoot);
      }
    }
    if (!valid) throw new Error(`${asset.id}: invalid generator parameter ${key}`);
  }
  return true;
}

function validateStaticAuthoring(asset, repoRoot = ROOT, verifySourceFiles = true) {
  const authoring = asset.staticAuthoring;
  if (!authoring) return null;
  if (asset.generator !== "imported_blend") {
    throw new Error(`${asset.id}: staticAuthoring requires the imported_blend generator`);
  }
  const source = validateAdmissionSourcePath(authoring.sourceFile, ".glb", repoRoot);
  if (verifySourceFiles) {
    const resolved = resolveAdmissionSource(authoring.sourceFile, ".glb", repoRoot);
    if (sha256(fs.readFileSync(resolved)) !== authoring.sourceSha256) {
      throw new Error(`${asset.id}: staticAuthoring sourceSha256 does not match sourceFile`);
    }
  }
  const tokenPolicies = new Map();
  for (const [sourceMaterial, mapping] of Object.entries(authoring.materialMap)) {
    if (!sourceMaterial.trim()) throw new Error(`${asset.id}: staticAuthoring has an empty source material name`);
    if (!asset.palette.includes(mapping.token)) {
      throw new Error(`${asset.id}: staticAuthoring maps ${sourceMaterial} to undeclared token ${mapping.token}`);
    }
    const previous = tokenPolicies.get(mapping.token);
    if (previous && previous !== mapping.texturePolicy) {
      throw new Error(`${asset.id}: staticAuthoring token ${mapping.token} mixes texture policies`);
    }
    tokenPolicies.set(mapping.token, mapping.texturePolicy);
  }
  if (new Set(tokenPolicies.values()).size > 1) {
    throw new Error(
      `${asset.id}: one static source mesh cannot mix solid COLOR_0 and texture-preserving policies`,
    );
  }
  for (const node of authoring.addedGeometryNodes ?? []) {
    if (!asset.requiredNodes.includes(node)) {
      throw new Error(`${asset.id}: staticAuthoring added geometry node ${node} must be required`);
    }
  }
  return { ...authoring, sourceFile: source };
}

function validateLodContract(asset) {
  const levels = asset.lodLevels;
  if (!levels) return true;
  if (asset.lod === "none") throw new Error(`${asset.id}: lodLevels require a non-none LOD policy`);
  if (levels[0].distanceMeters !== 0 || levels[0].triangleRatioMin !== 1 || levels[0].triangleRatioMax !== 1) {
    throw new Error(`${asset.id}: LOD0 must start at 0 m with a 1.0 triangle ratio`);
  }
  const nodes = new Set();
  let previousDistance = -1;
  let previousRatioMax = 1.01;
  for (const [index, level] of levels.entries()) {
    if (nodes.has(level.node)) throw new Error(`${asset.id}: duplicate LOD node ${level.node}`);
    if (!asset.requiredNodes.includes(level.node)) {
      throw new Error(`${asset.id}: requiredNodes must include LOD node ${level.node}`);
    }
    if (level.distanceMeters <= previousDistance) {
      throw new Error(`${asset.id}: LOD distances must increase strictly`);
    }
    if (level.triangleRatioMin > level.triangleRatioMax) {
      throw new Error(`${asset.id}: invalid triangle ratio range for LOD${index}`);
    }
    if (level.triangleRatioMax > previousRatioMax) {
      throw new Error(`${asset.id}: LOD triangle ratios must not increase with distance`);
    }
    nodes.add(level.node);
    previousDistance = level.distanceMeters;
    previousRatioMax = level.triangleRatioMax;
  }
  return true;
}

const REQUIRED_CHARACTER_CLIPS = [
  "idle",
  "walk_start",
  "walk",
  "run_start",
  "run",
  "stop",
  "jump_start",
  "fall",
  "land_soft",
  "land_hard",
  "turn_left",
  "turn_right",
  "plant",
  "water",
  "harvest",
  "pickup",
  "carry_idle",
  "carry_walk",
  "carry_run",
  "place",
  "workstation",
  "cast",
  "fishing_idle",
  "reel",
  "slack",
  "brace",
  "board",
  "dock",
  "rowboat_idle",
  "row",
  "skiff_idle",
  "skiff_drive",
];

const REQUIRED_NPC_CLIPS = [
  "idle",
  "talk_gesture",
  "walk",
  "carry_idle",
  "turn_left",
  "turn_right",
];

function animationContractClips(asset) {
  return [
    ...(asset.animationClips ?? []),
    ...(asset.additionalAnimationClips ?? []),
  ];
}

function validateAnimationContract(asset) {
  const animationClips = animationContractClips(asset);
  if (!animationClips.length) return true;
  if (asset.family === "character") {
    if (!asset.requiredNodes.includes(asset.rigNode)) {
      throw new Error(`${asset.id}: requiredNodes must include rigNode ${asset.rigNode}`);
    }
    for (const socket of asset.socketNodes) {
      if (!asset.requiredNodes.includes(socket)) {
        throw new Error(`${asset.id}: requiredNodes must include socket ${socket}`);
      }
    }
  }
  const clips = new Map();
  for (const clip of animationClips) {
    if (clips.has(clip.name)) throw new Error(`${asset.id}: duplicate animation clip ${clip.name}`);
    if (clip.durationSeconds <= 0) throw new Error(`${asset.id}: ${clip.name} duration must be positive`);
    if (
      clip.commitMarkerSeconds !== undefined &&
      clip.commitMarkerSeconds >= clip.durationSeconds
    ) {
      throw new Error(`${asset.id}: ${clip.name} commit marker must precede clip completion`);
    }
    if (typeof clip.loop !== "boolean") {
      throw new Error(`${asset.id}: ${clip.name} must declare loop behavior`);
    }
    if (clip.referenceSpeedMetersPerSecond !== undefined && !clip.loop) {
      throw new Error(`${asset.id}: ${clip.name} reference speed requires a looping clip`);
    }
    if (asset.humanoidRig && (!clip.contacts || !clip.motionSource)) {
      throw new Error(`${asset.id}: ${clip.name} requires source motion provenance and authored contact intervals`);
    }
    for (const side of ["left", "right"]) {
      let previousEnd = -1;
      for (const interval of clip.contacts?.[side] ?? []) {
        if (interval.start < 0 || interval.end <= interval.start || interval.end > clip.durationSeconds + 0.000001 || interval.start < previousEnd) {
          throw new Error(`${asset.id}: ${clip.name} ${side} contact intervals must be ordered, disjoint and inside the clip`);
        }
        previousEnd = interval.end;
      }
      const footstep = clip.events?.find((event) => event.name === `footstep_${side}`);
      if (asset.humanoidRig && footstep && !clip.contacts[side].some((interval) => Math.abs(interval.start - footstep.timeSeconds) <= 0.000001)) {
        throw new Error(`${asset.id}: ${clip.name} ${side} footstep must match an authored contact onset`);
      }
    }
    const motion = clip.motionSource;
    if (motion?.kind === "native" && Math.abs(motion.sourceDurationSeconds - clip.durationSeconds) > 0.00001) {
      throw new Error(`${asset.id}: ${clip.name} native motion must retain original seconds`);
    }
    if (motion?.loopClosureStartSeconds !== undefined && (motion.loopClosureEndSeconds !== clip.durationSeconds || motion.loopClosureStartSeconds >= motion.loopClosureEndSeconds || motion.loopClosureEndSeconds - motion.loopClosureStartSeconds > clip.durationSeconds * 0.15 + 0.000001)) {
      throw new Error(`${asset.id}: ${clip.name} source loop repair must declare a bounded final window`);
    }
    const eventNames = new Set();

    for (const event of clip.events ?? []) {
      if (eventNames.has(event.name)) {
        throw new Error(`${asset.id}: ${clip.name} has duplicate event ${event.name}`);
      }
      if (event.timeSeconds < 0 || event.timeSeconds >= clip.durationSeconds) {
        throw new Error(`${asset.id}: ${clip.name} event ${event.name} must be inside the clip range`);
      }
      eventNames.add(event.name);
    }
    clips.set(clip.name, clip);
  }
  for (const clip of clips.values()) {
    if (!clip.optional) continue;
    const fallback = clips.get(clip.fallbackClip);
    if (!fallback || fallback === clip || fallback.optional) {
      throw new Error(`${asset.id}: optional clip ${clip.name} requires a distinct required fallback clip`);
    }
  }
    if (asset.family === "character") {
    const isNpc = asset.id.startsWith("char_npc_");
    const requiredClips = isNpc ? REQUIRED_NPC_CLIPS : REQUIRED_CHARACTER_CLIPS;
    const missing = requiredClips.filter((name) => !clips.has(name) || clips.get(name).optional);
    if (missing.length) throw new Error(`${asset.id}: missing required animation clips: ${missing.join(", ")}`);
  }
  return true;
}

function validateReferenceAuthoring(asset) {
  const brief = asset.referenceAuthoring;
  if (!brief) return null;

  const sourceIds = new Set();
  for (const source of brief.sources) {
    if (sourceIds.has(source.id)) throw new Error(`${asset.id}: duplicate reference source ${source.id}`);
    sourceIds.add(source.id);
    if (source.uri.startsWith("repo://")) {
      const relative = source.uri.slice("repo://".length);
      const resolved = path.resolve(ROOT, relative);
      if (!relative || resolved === ROOT || !resolved.startsWith(`${ROOT}${path.sep}`)) {
        throw new Error(`${asset.id}: unsafe repository reference ${source.uri}`);
      }
      if (!fs.existsSync(resolved)) throw new Error(`${asset.id}: missing repository reference ${source.uri}`);
    } else {
      let url;
      try {
        url = new URL(source.uri);
      } catch {
        throw new Error(`${asset.id}: invalid external reference ${source.uri}`);
      }
      if (url.protocol !== "https:" || !url.hostname) {
        throw new Error(`${asset.id}: external references must use HTTPS: ${source.uri}`);
      }
    }
  }

  const components = new Map();
  for (const component of brief.components) {
    if (components.has(component.id)) throw new Error(`${asset.id}: duplicate reference component ${component.id}`);
    components.set(component.id, component);
  }
  for (const component of components.values()) {
    if (component.parent !== "root" && !components.has(component.parent)) {
      throw new Error(`${asset.id}: reference component ${component.id} has unknown parent ${component.parent}`);
    }
    const ancestry = new Set([component.id]);
    let parent = component.parent;
    while (parent !== "root") {
      if (ancestry.has(parent)) throw new Error(`${asset.id}: reference component hierarchy contains a cycle at ${parent}`);
      ancestry.add(parent);
      parent = components.get(parent).parent;
    }
  }

  const validateComponentIds = (owner, componentIds) => {
    const missing = componentIds.filter((componentId) => !components.has(componentId));
    if (missing.length) throw new Error(`${asset.id}: ${owner} references unknown components: ${missing.join(", ")}`);
  };
  const featureIds = new Set();
  for (const feature of brief.criticalFeatures) {
    if (featureIds.has(feature.id)) throw new Error(`${asset.id}: duplicate critical feature ${feature.id}`);
    featureIds.add(feature.id);
    validateComponentIds(`critical feature ${feature.id}`, feature.componentIds);
  }

  const boundParameters = new Set();
  for (const binding of brief.parameterBindings) {
    if (boundParameters.has(binding.parameter)) {
      throw new Error(`${asset.id}: duplicate reference parameter binding ${binding.parameter}`);
    }
    if (!Object.hasOwn(asset.parameters, binding.parameter)) {
      throw new Error(`${asset.id}: reference binding targets unknown generator parameter ${binding.parameter}`);
    }
    boundParameters.add(binding.parameter);
    validateComponentIds(`parameter binding ${binding.parameter}`, binding.componentIds);
  }

  const missingViews = REQUIRED_REFERENCE_VIEWS.filter((view) => !brief.reviewViews.includes(view));
  if (missingViews.length) {
    throw new Error(`${asset.id}: reference brief is missing required review views: ${missingViews.join(", ")}`);
  }

  if (PRIMARY_BINDING_GENERATORS.has(asset.generator)) {
    const boundComponents = new Set(brief.parameterBindings.flatMap((binding) => binding.componentIds));
    const missingPrimary = brief.components
      .filter((component) => component.importance === "primary" && !boundComponents.has(component.id))
      .map((component) => component.id);
    if (missingPrimary.length) {
      throw new Error(`${asset.id}: primary components missing parameterBindings: ${missingPrimary.join(", ")}`);
    }
  }
  return true;
}

function referenceBriefHash(asset) {
  if (!asset.referenceAuthoring) return null;
  return sha256(Buffer.from(JSON.stringify(asset.referenceAuthoring)));
}

function referenceAuthoringSummary(asset) {
  const brief = asset.referenceAuthoring;
  if (!brief) return null;
  return {
    status: brief.status,
    briefHash: referenceBriefHash(asset),
    sources: brief.sources.length,
    components: brief.components.length,
    criticalFeatures: brief.criticalFeatures.length,
    reviewViews: brief.reviewViews.length,
  };
}

function referenceBriefMarkdown(asset) {
  const brief = asset.referenceAuthoring;
  if (!brief) throw new Error(`${asset.id}: no referenceAuthoring contract exists in the asset catalog`);
  const components = brief.components.map((component) =>
    `- \`${component.id}\` <- \`${component.parent}\` (${component.importance}, ${component.count}): ${component.role}; ${component.shape}. Cues: ${component.cues.join("; ")}`,
  );
  const sources = brief.sources.map((source) =>
    `- \`${source.id}\` [${source.kind}; ${source.use.join(", ")}]: ${source.uri}${source.notes ? ` - ${source.notes}` : ""}`,
  );
  const features = brief.criticalFeatures.map((feature) =>
    `- [${feature.priority}] \`${feature.id}\` (${feature.componentIds.join(", ")}): ${feature.requirement}`,
  );
  const bindings = brief.parameterBindings.map((binding) =>
    `- \`${binding.parameter}\` -> ${binding.componentIds.join(", ")}: ${binding.purpose}`,
  );
  return [
    `# Reference authoring brief: ${asset.id}`,
    "",
    `- Status: ${brief.status}`,
    `- Subject: ${brief.subject}`,
    `- Production route: catalog -> ${asset.generator} -> validated Blender GLB -> atomic runtime publication`,
    `- Dimensions: ${asset.dimensions.width} x ${asset.dimensions.depth} x ${asset.dimensions.height} m`,
    `- Triangle budget: ${asset.budget.trianglesMin} / ${asset.budget.trianglesTarget} / ${asset.budget.trianglesMax} min/target/max`,
    `- Palette: ${asset.palette.join(", ")}`,
    `- Read distance: ${asset.readDistanceMeters} m`,
    `- Brief hash: ${referenceBriefHash(asset)}`,
    "",
    "## Sources",
    "",
    ...sources,
    "",
    "## Component hierarchy",
    "",
    ...components,
    "",
    "## Silhouette",
    "",
    ...brief.silhouette.map((cue) => `- ${cue}`),
    "",
    "## Negative space",
    "",
    ...brief.negativeSpace.map((cue) => `- ${cue}`),
    "",
    "## Hidden surfaces",
    "",
    `- Strategy/confidence: ${brief.hiddenSurfaces.strategy} / ${brief.hiddenSurfaces.confidence}`,
    ...brief.hiddenSurfaces.requirements.map((requirement) => `- ${requirement}`),
    "",
    "## Critical features",
    "",
    ...features,
    "",
    "## Generator parameter bindings",
    "",
    ...bindings,
    "",
    "## Failure modes",
    "",
    ...brief.failureModes.map((failure) => `- ${failure}`),
    "",
    `## Review views\n\n${brief.reviewViews.join(", ")}`,
    "",
    "Direct TypeScript factories, local palettes, local lights, and direct public export are outside this contract.",
    "",
  ].join("\n");
}

function validateAdmissionSourcePath(source, extension, repoRoot = ROOT) {
  if (typeof source !== "string" || !source) throw new Error("Admission source path is required");
  const resolved = path.resolve(repoRoot, source);
  if (!resolved.startsWith(`${path.resolve(repoRoot)}${path.sep}`)) throw new Error("Admission source must remain inside the repository (including symlinks)");
  if (path.extname(resolved) !== extension) throw new Error(`Admission source must be a ${extension} file`);
  if (["public", "generated/glb"].some((relative) => resolved.startsWith(`${path.resolve(repoRoot, relative)}${path.sep}`))) {
    throw new Error("Admission source cannot be a published/runtime destination");
  }
  return resolved;
}

function resolveAdmissionSource(source, extension, repoRoot = ROOT) {
  const resolved = validateAdmissionSourcePath(source, extension, repoRoot);
  const root = fs.realpathSync(repoRoot);
  const real = fs.realpathSync(resolved);
  const inside = (filename, directory) => filename.startsWith(`${directory}${path.sep}`);
  if (!inside(resolved, path.resolve(repoRoot)) || !inside(real, root)) {
    throw new Error("Admission source must remain inside the repository (including symlinks)");
  }
  if (path.extname(real) !== extension || !fs.statSync(real).isFile()) {
    throw new Error(`Admission source must be a ${extension} file`);
  }
  for (const relative of ["public", "generated/glb"]) {
    const directory = path.join(root, relative);
    const actualDirectory = fs.existsSync(directory) ? fs.realpathSync(directory) : directory;
    if (inside(resolved, path.join(path.resolve(repoRoot), relative)) || inside(real, actualDirectory)) {
      throw new Error("Admission source cannot be a published/runtime destination");
    }
  }
  return real;
}

function validateSourceProvenance(asset, repoRoot = ROOT, verifySourceFiles = true) {
  const provenance = asset.sourceProvenance;
  if (!provenance) {
    if (asset.generator === "imported_blend") throw new Error(`${asset.id}: imported_blend requires verified sourceProvenance`);
    return null;
  }
  const schema = readJson(SCHEMA_PATH);
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema.$defs.sourceProvenance);
  if (!validate(provenance)) throw new Error(`${asset.id}: invalid sourceProvenance`);
  if (provenance.provider === "poly-pizza" && provenance.sourceUrl !== `https://poly.pizza/m/${provenance.modelId}`) {
    throw new Error(`${asset.id}: sourceProvenance modelId does not match sourceUrl`);
  }
  if (provenance.provider === "quaternius" && !/^https:\/\/quaternius\.com\/packs\/[a-z0-9]+\.html$/.test(provenance.sourceUrl)) {
    throw new Error(`${asset.id}: Quaternius provenance must identify the original pack page`);
  }
  const licenseUrl = provenance.license === "CC0-1.0"
    ? "https://creativecommons.org/publicdomain/zero/1.0/"
    : "https://creativecommons.org/licenses/by/3.0/";
  if (provenance.licenseUrl !== licenseUrl) throw new Error(`${asset.id}: sourceProvenance license URL mismatch`);
  if (path.isAbsolute(provenance.sourceBlend)) throw new Error(`${asset.id}: sourceBlend must be repository-relative`);
  if (asset.parameters?.sourceBlend && provenance.sourceBlend !== asset.parameters.sourceBlend) {
    throw new Error(`${asset.id}: sourceProvenance must identify the catalog sourceBlend`);
  }
  validateAdmissionSourcePath(provenance.sourceBlend, ".blend", repoRoot);
  if (!verifySourceFiles) return provenance;
  const source = resolveAdmissionSource(provenance.sourceBlend, ".blend", repoRoot);
  if (sha256(fs.readFileSync(source)) !== provenance.sourceSha256) {
    throw new Error(`${asset.id}: sourceBlend SHA-256 mismatch; update provenance only after verifying the adapted source`);
  }
  if (provenance.sourceCapture) {
    for (const field of ["sourceCapture", "sourceCaptureReport", "licenseEvidence"]) {
      if (path.isAbsolute(provenance[field])) throw new Error(`${asset.id}: ${field} must be repository-relative`);
    }
    const capture = resolveAdmissionSource(provenance.sourceCapture, ".blend", repoRoot);
    if (sha256(fs.readFileSync(capture)) !== provenance.sourceCaptureSha256) {
      throw new Error(`${asset.id}: sourceCapture SHA-256 mismatch`);
    }
    const captureReportPath = resolveAdmissionSource(provenance.sourceCaptureReport, ".json", repoRoot);
    const captureReport = readJson(captureReportPath);
    const reportLicense = provenance.license === "CC0-1.0" ? "CC0 1.0" : "CC BY 3.0";
    if (captureReport.modelId !== provenance.modelId
      || captureReport.sourceUrl !== provenance.sourceUrl
      || captureReport.sourceBlend !== provenance.sourceCapture
      || captureReport.sourceSha256 !== provenance.sourceCaptureSha256
      || !Array.isArray(captureReport.license)
      || !captureReport.license.includes(reportLicense)) {
      throw new Error(`${asset.id}: sourceCapture report does not match source provenance`);
    }
    const licensePath = resolveAdmissionSource(provenance.licenseEvidence, ".txt", repoRoot);
    const licenseEvidence = fs.readFileSync(licensePath, "utf8");
    for (const evidence of [provenance.modelId, provenance.sourceUrl, provenance.licenseUrl]) {
      if (!licenseEvidence.includes(evidence)) throw new Error(`${asset.id}: licenseEvidence is incomplete`);
    }
  }
  return provenance;
}

function validateCatalog(stagingSelection = null) {
  const catalog = readJson(CATALOG_PATH);
  const schema = readJson(SCHEMA_PATH);
  const palette = readJson(PALETTE_PATH);
  const sceneBudgets = readJson(SCENE_BUDGET_PATH);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  if (!validate(catalog)) {
    throw new Error(`Asset catalog schema errors:\n${ajv.errorsText(validate.errors, { separator: "\n" })}`);
  }
  // A selected, nonpublishing build does not consume other assets' Blender
  // libraries. Their schemas/contracts still validate; admission/publication
  // and the default catalog check continue to verify every source file/hash.
  const sourceIds = stagingSelection ? new Set(selectAssets(catalog, stagingSelection).map((asset) => asset.id)) : null;

  const ids = new Set();
  const files = new Set();
  for (const asset of catalog.assets) {
    if (ids.has(asset.id)) throw new Error(`Duplicate asset ID: ${asset.id}`);
    if (files.has(asset.file)) throw new Error(`Duplicate asset filename: ${asset.file}`);
    if (!safeFilename(asset.file)) throw new Error(`Unsafe asset filename: ${asset.file}`);
    if (!asset.requiredNodes.includes(asset.rootNode)) {
      throw new Error(`${asset.id}: requiredNodes must include rootNode ${asset.rootNode}`);
    }
    if (
      asset.budget.trianglesMin > asset.budget.trianglesTarget ||
      asset.budget.trianglesTarget > asset.budget.trianglesMax
    ) {
      throw new Error(`${asset.id}: invalid triangle budget ordering`);
    }
    for (const token of asset.palette) {
      if (!palette.tokens[token]) throw new Error(`${asset.id}: unknown palette token ${token}`);
    }
    validateGeneratorParameters(asset, ROOT, !sourceIds || sourceIds.has(asset.id));
    if (asset.surfaceAuthoring && asset.generator === "imported_blend") {
      throw new Error(`${asset.id}: surfaceAuthoring is procedural-only; preserve imported source normals and colors`);
    }
    validateStaticAuthoring(asset, ROOT, !sourceIds || sourceIds.has(asset.id));
    validateLodContract(asset);
    validateAnimationContract(asset);
    validateReferenceAuthoring(asset);
    validateSourceProvenance(asset, ROOT, !sourceIds || sourceIds.has(asset.id));
    ids.add(asset.id);
    files.add(asset.file);
  }
  for (const [profileName, profile] of Object.entries(sceneBudgets.sceneProfiles)) {
    const triangles = profile.visibleTriangles;
    const draws = profile.drawCalls;
    if (
      !(triangles.targetMin <= triangles.targetMax && triangles.targetMax <= triangles.hardMax) ||
      !(draws.preferredMax <= draws.hardMax)
    ) {
      throw new Error(`Invalid scene budget ordering for ${profileName}`);
    }
  }
  return { catalog, palette, specHash: sha256(fs.readFileSync(CATALOG_PATH)) };
}

function parseArgs(argv) {
  const args = {
    command: "generate",
    assets: [],
    families: [],
    all: false,
    publish: true,
    strict: false,
    concurrency: null,
    timeoutMs: 180000,
    useCache: true,
    source: null,
  };
  let index = 0;
  if (argv[0] && !argv[0].startsWith("-")) args.command = argv[index++];
  while (index < argv.length) {
    const flag = argv[index++];
    if (flag === "--asset" || flag === "--family") {
      const value = argv[index++];
      if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
      (flag === "--asset" ? args.assets : args.families).push(value);
    }
    else if (flag === "--source") {
      if (args.source !== null) throw new Error("--source may only be supplied once");
      args.source = argv[index++];
      if (!args.source || args.source.startsWith("--")) throw new Error("--source requires a GLB path");
    }
    else if (flag === "--all") args.all = true;
    else if (flag === "--no-publish") args.publish = false;
    else if (flag === "--strict") args.strict = true;
    else if (flag === "--concurrency" || flag === "-j") args.concurrency = Number(argv[index++]);
    else if (flag === "--timeout") args.timeoutMs = Number(argv[index++]);
    else if (flag === "--no-cache" || flag === "--force") args.useCache = false;
    else if (flag === "--help" || flag === "-h") args.command = "help";
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (args.command === "admit") {
    if (args.assets.length !== 1 || args.families.length || args.all || !args.source) {
      throw new Error("admit requires exactly one --asset ID and --source PATH; --family and --all are not supported");
    }
    if (args.strict || args.concurrency !== null || !args.useCache || args.timeoutMs !== 180000) {
      throw new Error("admit only supports --asset, --source, and --no-publish");
    }
  } else if (args.source !== null) {
    throw new Error("--source is only supported by the admit command");
  }
  return args;
}

function selectAssets(catalog, args) {
  if (!args.all && !args.assets.length && !args.families.length) {
    throw new Error("Select assets explicitly with --asset, --family, or --all");
  }
  if (args.all) return [...catalog.assets];
  const knownIds = new Set(catalog.assets.map((asset) => asset.id));
  const knownFamilies = new Set(catalog.assets.map((asset) => asset.family));
  for (const id of args.assets) if (!knownIds.has(id)) throw new Error(`Unknown asset ID: ${id}`);
  for (const family of args.families) {
    if (!knownFamilies.has(family)) throw new Error(`Unknown asset family: ${family}`);
  }
  return catalog.assets.filter(
    (asset) => args.assets.includes(asset.id) || args.families.includes(asset.family),
  );
}

function resolveBlender() {
  const blenderPaths = [];
  if (process.env.BLENDER_BIN) blenderPaths.push(process.env.BLENDER_BIN);
  const which = spawnSync("which", ["blender"], { encoding: "utf8" });
  if (which.status === 0 && which.stdout.trim()) blenderPaths.push(which.stdout.trim());
  blenderPaths.push("/Applications/Blender.app/Contents/MacOS/Blender");
  const blender = blenderPaths.find((blenderPath) => fs.existsSync(blenderPath));
  if (!blender) throw new Error("Blender was not found via BLENDER_BIN, PATH, or /Applications/Blender.app");
  const version = spawnSync(blender, ["--version"], { encoding: "utf8" });
  if (version.status !== 0) throw new Error(`Could not read Blender version from ${blender}`);
  const versionLine = version.stdout.split("\n")[0].trim();
  console.log(`[NEVA ART] Blender: ${versionLine} (${blender})`);
  return { blender, version: versionLine };
}

function makeStage() {
  fs.mkdirSync(STAGING_ROOT, { recursive: true });
  return fs.mkdtempSync(path.join(STAGING_ROOT, "run-"));
}

function artYardUrl(assetId) {
  return `${ART_YARD_URL}?asset=${encodeURIComponent(assetId)}`;
}

function pruneStagingRuns(stagingRoot = STAGING_ROOT, keep = STAGING_RUN_RETENTION, preserve = []) {
  if (!Number.isInteger(keep) || keep < 1) throw new Error("Stage retention must keep at least one run");
  if (!fs.existsSync(stagingRoot)) return { kept: [], removed: [] };
  const resolvedRoot = path.resolve(stagingRoot);
  const preserved = new Set(preserve.map((entry) => path.resolve(entry)));
  const runs = fs.readdirSync(resolvedRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && STAGE_PATTERN.test(entry.name))
    .map((entry) => {
      const directory = path.resolve(resolvedRoot, entry.name);
      if (path.dirname(directory) !== resolvedRoot) throw new Error(`Unsafe staging run path: ${directory}`);
      return { name: entry.name, directory, modifiedAt: fs.statSync(directory).mtimeMs };
    })
    .sort((left, right) => right.modifiedAt - left.modifiedAt);
  const kept = [];
  const removed = [];
  for (const run of runs) {
    if (preserved.has(run.directory) || kept.length < keep) {
      kept.push(run.name);
      continue;
    }
    fs.rmSync(run.directory, { recursive: true, force: true });
    removed.push(run.name);
  }
  return { kept, removed };
}

function subprocessFailure(label, result) {
  const exitReason = result.signal ? `signal ${result.signal}` : `status ${result.status}`;
  const output = [result.stdout, result.stderr]
    .filter((value) => typeof value === "string" && value.trim())
    .join("\n")
    .trim();
  const excerpt = output
    ? output.split(/\r?\n/).slice(-FAILURE_EXCERPT_LINES).join("\n")
    : "";
  return new Error(`${label} exited with ${exitReason}${excerpt ? `\n${excerpt}` : ""}`);
}

function runBlender(blender, assets, stage, strict = false) {
  const rawDir = path.join(stage, "raw");
  const report = path.join(stage, "blender-report.json");
  fs.mkdirSync(rawDir, { recursive: true });
  const command = [
    "--background", "--python", path.join(HERE, "bootstrap.py"), "--",
    "--catalog", CATALOG_PATH, "--output", rawDir, "--report", report,
  ];
  if (strict) command.push("--strict");
  for (const asset of assets) command.push("--asset", asset.id);
  const result = spawnSync(blender, command, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: BLENDER_LOG_BUFFER_BYTES,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw subprocessFailure("Blender", result);
  if (!fs.existsSync(report)) throw new Error("Blender did not emit its run report");
  return { rawDir, blenderReport: readJson(report) };
}

function runBuilderTests(blender) {
  const result = spawnSync(blender, ["--background", "--python-exit-code", "1", "--python", path.join(HERE, "test_authored_builders.py")], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: BLENDER_LOG_BUFFER_BYTES,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw subprocessFailure("Authored builder tests", result);
  console.log("[NEVA ART] Authored builder tests passed");
}

function parseGlb(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("Not a GLB file");
  let offset = 12;
  let json = null;
  const binary = [];
  while (offset < bytes.length) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk).trim());
    else if (type === 0x004e4942) binary.push(Buffer.from(chunk));
    offset += 8 + length;
  }
  if (!json) throw new Error("GLB is missing a JSON chunk");
  return { json, binary: Buffer.concat(binary) };
}

async function semanticHash(bytes) {
  const { json, binary } = parseGlb(bytes);
  await MeshoptDecoder.ready;
  const semantic = structuredClone(json);
  if (semantic.asset) delete semantic.asset.generator;
  const componentCounts = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
  const componentSizes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const accessorData = [];
  const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const readComponent = (dataView, offset, type) => {
    if (type === 5120) return dataView.getInt8(offset);
    if (type === 5121) return dataView.getUint8(offset);
    if (type === 5122) return dataView.getInt16(offset, true);
    if (type === 5123) return dataView.getUint16(offset, true);
    if (type === 5125) return dataView.getUint32(offset, true);
    return Math.round(dataView.getFloat32(offset, true) * 100000) / 100000;
  };
  for (const accessor of json.accessors ?? []) {
    const bufferView = json.bufferViews?.[accessor.bufferView];
    const meshopt = bufferView?.extensions?.EXT_meshopt_compression;
    if (!bufferView || accessor.sparse) {
      accessorData.push(null);
      continue;
    }
    const components = componentCounts[accessor.type];
    const componentSize = componentSizes[accessor.componentType];
    if (!components || !componentSize) {
      accessorData.push(null);
      continue;
    }
    let accessorView = view;
    let stride = bufferView.byteStride ?? components * componentSize;
    let sourceStart = bufferView.byteOffset ?? 0;
    if (meshopt) {
      const compressedStart = meshopt.byteOffset ?? 0;
      const compressedEnd = compressedStart + meshopt.byteLength;
      const decoded = new Uint8Array(meshopt.count * meshopt.byteStride);
      MeshoptDecoder.decodeGltfBuffer(
        decoded,
        meshopt.count,
        meshopt.byteStride,
        binary.subarray(compressedStart, compressedEnd),
        meshopt.mode,
        meshopt.filter,
      );
      accessorView = new DataView(decoded.buffer, decoded.byteOffset, decoded.byteLength);
      // Codec blocks need not match accessor elements (packed buffer views
      // can contain several shapes). Accessor/view layout still owns stride.
      sourceStart = 0;
    }
    const start = sourceStart + (accessor.byteOffset ?? 0);
    const values = [];
    for (let element = 0; element < accessor.count; element++) {
      for (let component = 0; component < components; component++) {
        values.push(readComponent(accessorView, start + element * stride + component * componentSize, accessor.componentType));
      }
    }
    accessorData.push(values);
  }
  // Buffer offsets, compression headers, and URI metadata describe packaging,
  // not authored geometry. Keep accessor/scene structure, but remove those
  // storage details so raw and Meshopt-compressed artifacts hash semantically.
  delete semantic.buffers;
  semantic.bufferViews = (semantic.bufferViews ?? []).map((bufferView) => {
    const copy = { ...bufferView };
    delete copy.buffer;
    delete copy.byteOffset;
    delete copy.byteLength;
    delete copy.byteStride;
    delete copy.extensions;
    return copy;
  });
  semantic.accessors = (semantic.accessors ?? []).map((accessor) => {
    const copy = { ...accessor };
    delete copy.bufferView;
    delete copy.byteOffset;
    delete copy.sparse;
    return copy;
  });
  delete semantic.extensionsUsed;
  delete semantic.extensionsRequired;
  return sha256(Buffer.from(JSON.stringify({ semantic, accessorData })));
}

// Khronos warns whenever a skinned mesh node has a parent, because a viewer must
// ignore that parent's transform. Neva parents skinned surfaces to identity
// empties -- LOD switch roots, the motion root, the creature rig -- so nothing is
// actually being ignored. Prove that rather than assuming it: the warning stands
// the moment a real transform appears anywhere up the chain.
function skinnedMeshParentTransformsAreIdentity(json) {
  const nodes = json.nodes ?? [];
  const parents = new Map();
  nodes.forEach((node, index) => {
    for (const child of node.children ?? []) parents.set(child, index);
  });
  const isIdentity = (node) => {
    if (node.matrix) return node.matrix.every((value, index) => Math.abs(value - (index % 5 === 0 ? 1 : 0)) < 1e-6);
    const translation = node.translation ?? [0, 0, 0];
    const rotation = node.rotation ?? [0, 0, 0, 1];
    const scale = node.scale ?? [1, 1, 1];
    return (
      translation.every((value) => Math.abs(value) < 1e-6) &&
      Math.abs(rotation[0]) < 1e-6 && Math.abs(rotation[1]) < 1e-6 &&
      Math.abs(rotation[2]) < 1e-6 && Math.abs(Math.abs(rotation[3]) - 1) < 1e-6 &&
      scale.every((value) => Math.abs(value - 1) < 1e-6)
    );
  };
  const skinned = nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => typeof node.mesh === "number" && typeof node.skin === "number");
  if (!skinned.length) return false;
  return skinned.every(({ index }) => {
    for (let cursor = parents.get(index); cursor !== undefined; cursor = parents.get(cursor)) {
      if (!isIdentity(nodes[cursor])) return false;
    }
    return true;
  });
}

async function validateGlb(filename, spec, phase, repoRoot = ROOT) {
  const bytes = fs.readFileSync(filename);
  const animationClips = animationContractClips(spec);
  const inheritedWarnings = await inheritedStaticSourceWarnings(spec, repoRoot);
  const { json } = parseGlb(bytes);
  const inertSkinnedParents = skinnedMeshParentTransformsAreIdentity(json);
  const report = await validateBytes(new Uint8Array(bytes), {
    uri: spec.file,
    externalResourceFunction: async () => new Uint8Array(),
  });
  const errors = report.issues.messages.filter((issue) => issue.severity === 0);
  const warnings = report.issues.messages.filter((issue) => {
    if (issue.severity !== 1) return false;
    if (inheritedWarnings.has(issue.code)) return false;
    if (issue.code === "NODE_SKINNED_MESH_NON_ROOT" && animationClips.length && inertSkinnedParents) {
      return false;
    }
    return true;
  });
  if (errors.length || warnings.length) {
    const details = [...errors, ...warnings].map((issue) => `${issue.code}: ${issue.message}`).join("\n");
    throw new Error(`${spec.id}: Khronos ${phase} validation failed\n${details}`);
  }
  const nodes = json.nodes ?? [];
  const nodeNames = new Set(nodes.map((node) => node.name));
  const missing = spec.requiredNodes.filter((name) => !nodeNames.has(name));
  if (missing.length) throw new Error(`${spec.id}: optimized GLB lost required nodes: ${missing.join(", ")}`);
  const animationMetrics = [];
  if (animationClips.length) {
    if (spec.family === "character") {
      const rigMatches = nodes.filter((node) => node.name === spec.rigNode);
      if (rigMatches.length !== 1) {
        throw new Error(`${spec.id}: ${phase} GLB must contain exactly one rig node ${spec.rigNode}`);
      }
      for (const socket of spec.socketNodes) {
        if (nodes.filter((node) => node.name === socket).length !== 1) {
          throw new Error(`${spec.id}: ${phase} GLB must contain exactly one socket node ${socket}`);
        }
      }
      if (!(json.skins?.length > 0)) throw new Error(`${spec.id}: ${phase} GLB contains no skin`);
      const skinnedMeshNodes = nodes.filter(
        (node) => typeof node.mesh === "number" && typeof node.skin === "number",
      );
      if (!skinnedMeshNodes.length) {
        throw new Error(`${spec.id}: ${phase} GLB contains no skinned mesh nodes`);
      }
      for (const node of skinnedMeshNodes) {
        const mesh = json.meshes?.[node.mesh];
        for (const primitive of mesh?.primitives ?? []) {
          if (
            typeof primitive.attributes?.JOINTS_0 !== "number" ||
            typeof primitive.attributes?.WEIGHTS_0 !== "number"
          ) {
            throw new Error(`${spec.id}: ${phase} skinned primitive is missing JOINTS_0/WEIGHTS_0`);
          }
        }
      }
      if (spec.humanoidRig) {
        for (const [semantic, name] of Object.entries(spec.humanoidRig.bones)) {
          if (nodes.filter((node) => node.name === name).length !== 1) throw new Error(`${spec.id}: ${phase} missing unique semantic bone ${semantic} (${name})`);
        }
        for (const side of ["left", "right"]) {
          const wrist = nodes.find((node) => node.name === spec.humanoidRig.bones[`hand_${side}`]);
          const grip = nodes.findIndex((node) => node.name === spec.humanoidRig.grips[side]);
          if (grip < 0 || !wrist.children?.includes(grip)) throw new Error(`${spec.id}: ${phase} ${side} palm grip must be a direct wrist child`);
        }
      }
    }
    const animationsByName = new Map((json.animations ?? []).map((animation) => [animation.name, animation]));
    for (const clip of animationClips) {
      let animation = animationsByName.get(clip.name);
      let sourceClip = clip;
      if (!animation && clip.optional) {
        sourceClip = animationClips.find((candidate) => candidate.name === clip.fallbackClip);
        animation = animationsByName.get(clip.fallbackClip);
      }
      if (!animation || !sourceClip) {
        throw new Error(`${spec.id}: ${phase} GLB is missing required animation ${clip.name}`);
      }
      let durationSeconds = 0;
      for (const sampler of animation.samplers ?? []) {
        const accessor = json.accessors?.[sampler.input];
        const start = accessor?.min?.[0] ?? 0;
        const end = accessor?.max?.[0] ?? 0;
        durationSeconds = Math.max(durationSeconds, end - start);
      }
      if (Math.abs(durationSeconds - sourceClip.durationSeconds) > 1 / 60 + 0.002) {
        throw new Error(
          `${spec.id}: ${phase} animation ${clip.name} duration ${durationSeconds.toFixed(3)} does not match ${sourceClip.durationSeconds.toFixed(3)}`,
        );
      }
      animationMetrics.push({
        name: clip.name,
        durationSeconds,
        commitMarkerSeconds: clip.commitMarkerSeconds ?? null,
        loop: clip.loop,
        referenceSpeedMetersPerSecond: clip.referenceSpeedMetersPerSecond ?? null,
        optional: clip.optional ?? false,
        fallbackClip: clip.fallbackClip ?? null,
        events: clip.events ?? [],
      });
    }
  }
  let trianglePrimitives = 0;
  let vertexColorPrimitives = 0;
  let normalPrimitives = 0;
  const preservedTextureTokens = new Set(
    Object.values(spec.staticAuthoring?.materialMap ?? {})
      .filter((mapping) => mapping.texturePolicy === "preserve")
      .map((mapping) => mapping.token),
  );
  if (spec.staticAuthoring) {
    const expectedRegions = new Set(Object.keys(spec.staticAuthoring.materialMap));
    const actualRegions = new Set();
    for (const material of json.materials ?? []) {
      const sourceRegion = material.extras?.neva_source_material;
      const token = paletteTokenForMaterial(material);
      if (typeof sourceRegion !== "string" || !expectedRegions.has(sourceRegion)) {
        throw new Error(`${spec.id}: ${phase} material ${material.name ?? "<unnamed>"} lost its source-region identity`);
      }
      if (actualRegions.has(sourceRegion)) {
        throw new Error(`${spec.id}: ${phase} duplicates source material region ${sourceRegion}`);
      }
      if (material.name !== sourceRegion) {
        throw new Error(`${spec.id}: ${phase} source material ${sourceRegion} has unstable name ${material.name}`);
      }
      if (spec.staticAuthoring.materialMap[sourceRegion].token !== token) {
        throw new Error(`${spec.id}: ${phase} source material ${sourceRegion} maps to the wrong palette token`);
      }
      actualRegions.add(sourceRegion);
    }
    const missingRegions = [...expectedRegions].filter((region) => !actualRegions.has(region));
    if (missingRegions.length) {
      throw new Error(`${spec.id}: ${phase} lost source material regions: ${missingRegions.join(", ")}`);
    }
  }
  const meshTriangles = (json.meshes ?? []).map((mesh) => {
    let count = 0;
    for (const primitive of mesh.primitives ?? []) {
      // glTF permits both indexed and non-indexed triangle primitives. Use
      // POSITION for the latter instead of silently reporting zero triangles.
      const triangleAccessorIndex = primitive.indices ?? primitive.attributes?.POSITION;
      const accessor = json.accessors?.[triangleAccessorIndex];
      if (primitive.mode === undefined || primitive.mode === 4) {
        trianglePrimitives += 1;
        if (typeof primitive.attributes?.POSITION !== "number") {
          throw new Error(`${spec.id}: ${phase} triangle primitive is missing POSITION`);
        }
        if (typeof primitive.attributes?.NORMAL !== "number") {
          throw new Error(`${spec.id}: ${phase} triangle primitive is missing NORMAL`);
        }
        normalPrimitives += 1;
        const material = typeof primitive.material === "number"
          ? json.materials?.[primitive.material]
          : null;
        const materialToken = paletteTokenForMaterial(material);
        const preservesSourceTexture = preservedTextureTokens.has(materialToken);
        if (preservesSourceTexture && typeof primitive.attributes?.TEXCOORD_0 !== "number") {
          throw new Error(`${spec.id}: ${phase} textured material ${materialToken} is missing TEXCOORD_0`);
        }
        if (
          preservesSourceTexture &&
          typeof material?.pbrMetallicRoughness?.baseColorTexture?.index !== "number"
        ) {
          throw new Error(`${spec.id}: ${phase} textured material ${materialToken} lost its base-color map`);
        }
        if (typeof primitive.attributes?.COLOR_0 !== "number" && !preservesSourceTexture) {
          throw new Error(`${spec.id}: ${phase} triangle primitive is missing semantic COLOR_0`);
        }
        if (typeof primitive.attributes?.COLOR_0 === "number" && preservesSourceTexture) {
          throw new Error(
            `${spec.id}: ${phase} textured material ${materialToken} must not multiply source albedo by COLOR_0`,
          );
        }
        if (!preservesSourceTexture) {
          vertexColorPrimitives += 1;
        }
        if (typeof primitive.material !== "number") {
          throw new Error(`${spec.id}: ${phase} triangle primitive is missing its palette material`);
        }
        count += (accessor?.count ?? 0) / 3;
      }
    }
    return count;
  });
  const invalidDoubleSidedMaterials = (json.materials ?? []).filter(
    (material) => material.doubleSided === true && !preservedTextureTokens.has(paletteTokenForMaterial(material)),
  );
  if (invalidDoubleSidedMaterials.length) {
    throw new Error(
      `${spec.id}: ${phase} GLB contains ${invalidDoubleSidedMaterials.length} unnecessary double-sided materials`,
    );
  }
  // Deduplication may make many authored nodes share one mesh. Count each node
  // instance so the budget reflects actual visible geometry, not mesh storage.
  const nodeMeshRefs = nodes.flatMap((node) =>
    typeof node.mesh === "number" ? [node.mesh] : [],
  );
  const packagedTriangles = (nodeMeshRefs.length ? nodeMeshRefs : meshTriangles.map((_, index) => index))
    .reduce((sum, meshIndex) => sum + (meshTriangles[meshIndex] ?? 0), 0);
  let triangles = packagedTriangles;
  const lodLevels = [];
  if (spec.lodLevels) {
    const indicesByName = new Map();
    nodes.forEach((node, index) => {
      const matches = indicesByName.get(node.name) ?? [];
      matches.push(index);
      indicesByName.set(node.name, matches);
    });
    const collectDescendants = (start) => {
      const result = new Set();
      const pending = [start];
      while (pending.length) {
        const index = pending.pop();
        if (result.has(index)) continue;
        result.add(index);
        pending.push(...(nodes[index]?.children ?? []));
      }
      return result;
    };
    const ownership = new Map();
    for (const level of spec.lodLevels) {
      const matches = indicesByName.get(level.node) ?? [];
      if (matches.length !== 1) {
        throw new Error(`${spec.id}: ${phase} GLB must contain exactly one ${level.node} node`);
      }
      const descendants = collectDescendants(matches[0]);
      let levelTriangles = 0;
      for (const index of descendants) {
        const meshIndex = nodes[index]?.mesh;
        if (typeof meshIndex !== "number") continue;
        levelTriangles += meshTriangles[meshIndex] ?? 0;
        const owners = ownership.get(index) ?? [];
        owners.push(level.node);
        ownership.set(index, owners);
      }
      lodLevels.push({
        node: level.node,
        distanceMeters: level.distanceMeters,
        triangles: levelTriangles,
      });
    }
    const unowned = [];
    const multiplyOwned = [];
    nodes.forEach((node, index) => {
      if (typeof node.mesh !== "number") return;
      const owners = ownership.get(index) ?? [];
      if (owners.length === 0) unowned.push(node.name ?? `node_${index}`);
      else if (owners.length > 1) multiplyOwned.push(node.name ?? `node_${index}`);
    });
    if (unowned.length || multiplyOwned.length) {
      throw new Error(
        `${spec.id}: ${phase} LOD hierarchy has unowned meshes [${unowned.join(", ")}] ` +
        `and multiply-owned meshes [${multiplyOwned.join(", ")}]`,
      );
    }
    triangles = lodLevels[0].triangles;
    if (triangles <= 0) throw new Error(`${spec.id}: ${phase} LOD0 contains no triangles`);
    lodLevels.forEach((metric, index) => {
      const contract = spec.lodLevels[index];
      metric.ratio = metric.triangles / triangles;
      if (metric.ratio < contract.triangleRatioMin || metric.ratio > contract.triangleRatioMax) {
        throw new Error(
          `${spec.id}: ${phase} ${metric.node} triangle ratio ${metric.ratio.toFixed(3)} violates ` +
          `${contract.triangleRatioMin.toFixed(3)}..${contract.triangleRatioMax.toFixed(3)}`,
        );
      }
    });
  }
  const materials = json.materials?.length ?? 0;
  if (triangles < spec.budget.trianglesMin || triangles > spec.budget.trianglesMax) {
    throw new Error(`${spec.id}: ${triangles} exported triangles violate declared budget`);
  }
  if (materials > spec.budget.materialsMax) {
    throw new Error(`${spec.id}: ${materials} exported materials violate declared budget`);
  }
  const staticSourceContract = await validateStaticSourceContract(filename, spec, repoRoot);
  const surfaceContract = await validateSurfaceContract(bytes, spec);
  return {
    nodes: json.nodes?.length ?? 0,
    meshes: json.meshes?.length ?? 0,
    triangles,
    packagedTriangles,
    lodLevels,
    materials,
    trianglePrimitives,
    vertexColorPrimitives,
    normalPrimitives,
    doubleSidedMaterials: (json.materials ?? []).filter((material) => material.doubleSided === true).length,
    artContractStatus: "passed",
    extensions: json.extensionsUsed ?? [],
    bytes: bytes.length,
    fileHash: sha256(bytes),
    semanticHash: await semanticHash(bytes),
    vertexColorSpace: "linear-srgb",
    qualityStatus: triangles >= spec.budget.trianglesTarget ? "on_target" : "below_target",
    animationClips: animationMetrics,
    ...(inheritedWarnings.size ? { inheritedSourceWarnings: [...inheritedWarnings].sort() } : {}),
    ...(staticSourceContract ? { staticSourceContract } : {}),
    ...(surfaceContract ? { surfaceContract } : {}),
  };
}


async function readAssetCache(plan, spec) {
  return readAssetCacheModule(plan, spec, validateGlb);
}

async function validateAdmissionGlb(filename, spec, palette, repoRoot = ROOT) {
  const result = await validateGlb(filename, spec, "admission", repoRoot);
  const bytes = fs.readFileSync(filename);
  const { json } = parseGlb(bytes);
  for (const name of spec.requiredNodes) {
    if (json.nodes.filter((node) => node.name === name).length !== 1) {
      throw new Error(`${spec.id}: admission requires exactly one node ${name}`);
    }
  }
  const paletteTokensUsed = [...new Set((json.materials ?? []).map(paletteTokenForMaterial))];
  if (paletteTokensUsed.some((token) => !token || !spec.palette.includes(token) || !palette.tokens[token])) {
    throw new Error(`${spec.id}: admission contains an undeclared palette material`);
  }
  if ((json.buffers ?? []).some((buffer) => buffer.uri) || (json.images ?? []).some((image) => image.uri)) {
    throw new Error(`${spec.id}: admitted GLB must be self-contained`);
  }
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const document = await io.readBinary(new Uint8Array(bytes));
  const root = document.getRoot().listNodes().find((node) => node.getName() === spec.rootNode);
  const owned = new Set();
  root.traverse((node) => owned.add(node));
  if (document.getRoot().listNodes().some((node) => node.getMesh() && !owned.has(node))) {
    throw new Error(`${spec.id}: admission contains meshes outside the catalog root`);
  }
  // These are exported rest-geometry bounds, not proof of posed deformation.
  const bounds = getBounds(root);
  const dimensions = [bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2], bounds.max[1] - bounds.min[1]];
  const expected = [spec.dimensions.width, spec.dimensions.depth, spec.dimensions.height];
  for (let axis = 0; axis < 3; axis++) {
    if (!Number.isFinite(dimensions[axis]) || dimensions[axis] < expected[axis] * 0.25 || dimensions[axis] > expected[axis] * 1.35) {
      throw new Error(`${spec.id}: admission bounds are incompatible with catalog dimensions`);
    }
  }
  if (spec.pivot === "ground_center" && (bounds.min[1] < -0.12 || bounds.min[1] > 0.18)) {
    throw new Error(`${spec.id}: admission ground pivot is invalid`);
  }
  return { ...result, dimensions, bounds, boundsSpace: "gltf-y-up", paletteTokensUsed };
}

async function admitAsset(spec, sourcePath, catalog, palette, options = {}) {
  const repoRoot = options.repoRoot ?? ROOT;
  const publish = options.publish !== false;
  if (spec.generator !== "imported_blend") throw new Error("admit requires a catalog-declared imported_blend generator");
  validateGeneratorParameters(spec, repoRoot);
  const provenance = validateSourceProvenance(spec, repoRoot);
  if (!provenance) throw new Error(`${spec.id}: admission requires verified sourceProvenance`);
  const source = resolveAdmissionSource(sourcePath, ".glb", repoRoot);
  const sourceHash = sha256(fs.readFileSync(source));
  const inputs = readGenerationInputs(repoRoot);
  const manifestPaths = ["generated/reports/asset-manifest.json", "public/assets/models/asset-manifest.json"]
    .map((filename) => path.join(repoRoot, filename));
  const manifestHashes = manifestPaths.map((filename) => sha256(fs.readFileSync(filename)));
  if (manifestHashes[0] !== manifestHashes[1]) throw new Error("Cannot admit while generated/public manifests differ");
  const previous = readJson(manifestPaths[0]);
  if (!previous.assets?.some((entry) => entry.id === spec.id && entry.file === spec.file)) {
    throw new Error(`${spec.id}: admission requires an existing published catalog identity`);
  }
  const started = Date.now();
  const stagingRoot = path.join(repoRoot, "generated/.staging");
  fs.mkdirSync(stagingRoot, { recursive: true });
  const stage = fs.mkdtempSync(path.join(stagingRoot, "run-"));
  const raw = path.join(stage, "raw", spec.file);
  const optimizedDir = path.join(stage, "optimized");
  const admitted = path.join(optimizedDir, spec.file);
  copyAtomically(source, raw);
  const rawResult = await validateAdmissionGlb(raw, spec, palette, repoRoot);
  if (rawResult.fileHash !== sourceHash) throw new Error(`${spec.id}: source GLB changed while staging`);
  // The exporter owns compression. Never quantize, join, or transform a skin
  // during admission: keep its inverse binds, joint weights and clips exact.
  copyAtomically(raw, admitted);
  const result = await validateAdmissionGlb(admitted, spec, palette, repoRoot);
  if (result.fileHash !== sourceHash) throw new Error(`${spec.id}: admission changed source bytes`);
  const entry = {
    id: spec.id, file: spec.file, family: spec.family, generator: spec.generator,
    seed: spec.seed, requiredNodes: spec.requiredNodes, collision: spec.collision,
    lod: spec.lod, readDistanceMeters: spec.readDistanceMeters, budget: spec.budget,
    ...(spec.referenceAuthoring ? { referenceAuthoring: referenceAuthoringSummary(spec) } : {}),
    cacheHit: false,
    inputHash: sha256(stableStringify({ spec, sourceGlbSha256: sourceHash, sourceBlendSha256: provenance.sourceSha256, ...inputs })),
    durationMs: Date.now() - started,
    warnings: result.qualityStatus === "below_target" ? [`${result.triangles} triangles are below quality target ${spec.budget.trianglesTarget}`] : [],
    ...result,
    admission: {
      packaging: "preserve-bytes",
      sourceGlbSha256: sourceHash,
      sourceBlendSha256: provenance.sourceSha256,
      compression: result.extensions.filter((extension) => extension === "EXT_meshopt_compression" || extension === "KHR_draco_mesh_compression"),
      blenderSceneValidation: "not-run",
    },
  };
  const report = {
    version: 2, generatedAt: new Date().toISOString(), ...inputs,
    blenderVersion: "not-invoked (catalog source export)", vertexColorSpace: "linear-srgb",
    durationMs: Date.now() - started, aggregateBytes: result.bytes,
    summary: summarizeAssets([entry]), assets: [entry],
    publication: publish ? "pending-publication" : "staged-only",
  };
  fs.writeFileSync(path.join(stage, "asset-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(stage, "asset-report.md"), markdownReport(report));
  assertGenerationInputsUnchanged(inputs, "during admission", repoRoot);
  validateSourceProvenance(spec, repoRoot);
  if (sha256(fs.readFileSync(source)) !== sourceHash || manifestPaths.some((filename, index) => sha256(fs.readFileSync(filename)) !== manifestHashes[index])) {
    throw new Error(`${spec.id}: source or published manifest changed during admission; restage from stable inputs`);
  }
  if (publish) publishStage(report, optimizedDir, [spec], catalog, false, repoRoot);
  console.log(`[NEVA ART] ${publish ? "Admitted" : "Staged (public assets unchanged)"} ${spec.id}: ${admitted}`);
  // The stage viewer requires a complete catalog; single-asset admission is
  // a mechanical candidate until selected publication makes its review usable.
  if (publish) console.log(`[NEVA ART] Art Yard: ${artYardUrl(spec.id)}`);
  return { stage, report, published: publish };
}

function summarizeAssets(results) {
  return {
    assetCount: results.length,
    referenceReady: results.filter((asset) => asset.referenceAuthoring?.status === "ready").length,
    referenceDraft: results.filter((asset) => asset.referenceAuthoring?.status === "draft").length,
    onTarget: results.filter((asset) => asset.qualityStatus === "on_target").length,
    belowTarget: results.filter((asset) => asset.qualityStatus === "below_target").length,
    triangles: results.reduce((sum, asset) => sum + asset.triangles, 0),
    packagedTriangles: results.reduce((sum, asset) => sum + (asset.packagedTriangles ?? asset.triangles), 0),
    productionMinimumTriangles: results.reduce((sum, asset) => sum + asset.budget.trianglesMin, 0),
    qualityTargetTriangles: results.reduce((sum, asset) => sum + asset.budget.trianglesTarget, 0),
    hardMaximumTriangles: results.reduce((sum, asset) => sum + asset.budget.trianglesMax, 0),
    fileSizeBytes: results.reduce((sum, asset) => sum + (asset.bytes ?? 0), 0),
    trianglePrimitives: results.reduce((sum, asset) => sum + (asset.trianglePrimitives ?? 0), 0),
    nodes: results.reduce((sum, asset) => sum + (asset.nodes ?? 0), 0),
    cacheHits: results.filter((asset) => asset.cacheHit === true).length,
    cacheMisses: results.filter((asset) => asset.cacheHit !== true).length,
    artContractPassed: results.every((asset) => asset.artContractStatus === "passed"),
  };
}

async function buildStage(context, assets, blenderInfo) {
  const started = Date.now();
  const plans = new Map(assets.map((asset) => [asset.id, assetCachePlan(asset, context, blenderInfo)]));
  const cachedResults = new Map();
  const misses = [];
  for (const spec of assets) {
    const plan = plans.get(spec.id);
    const cached = context.useCache === false ? null : await readAssetCache(plan, spec);
    if (cached) cachedResults.set(spec.id, cached);
    else misses.push(spec);
  }
  const rawDir = path.join(context.stage, "raw");
  fs.mkdirSync(rawDir, { recursive: true });
  const { blenderReport } = misses.length
    ? await runDynamicBlenderPool({
        blenderPath: blenderInfo.blender,
        bootstrapScript: path.join(HERE, "bootstrap.py"),
        catalogPath: CATALOG_PATH,
        missAssets: misses,
        outputDir: rawDir,
        strict: context.strict,
        concurrency: context.concurrency,
        timeoutMs: context.timeoutMs,
        repoRoot: ROOT,
      })
    : { blenderReport: { assets: [] } };
  const optimizedDir = path.join(context.stage, "optimized");
  fs.mkdirSync(optimizedDir, { recursive: true });
  const results = [];
  for (const spec of assets) {
    const assetStarted = Date.now();
    const optimized = path.join(optimizedDir, spec.file);
    const plan = plans.get(spec.id);
    const cached = cachedResults.get(spec.id);
    if (cached) {
      copyAtomically(plan.artifact, optimized);
      const result = { ...cached, durationMs: Date.now() - assetStarted, cacheHit: true };
      results.push(result);
      continue;
    }
    const raw = path.join(rawDir, spec.file);
    const rawValidation = await validateGlb(raw, spec, "raw");
    // Imported sources already own their bind/animation data. Compress only:
    // generic quantization/joining can change an authored skin's transforms.
    if (spec.generator === "imported_blend") await compressImportedAsset(raw, optimized);
    else await optimizeAsset(raw, optimized, spec);
    const final = await validateGlb(optimized, spec, "optimized");
    if (spec.generator === "imported_blend" && final.semanticHash !== rawValidation.semanticHash) {
      throw new Error(`${spec.id}: imported source compression changed decoded semantics`);
    }
    const blenderAsset = blenderReport.assets.find((entry) => entry.id === spec.id);
    if (!blenderAsset || blenderAsset.artContractStatus !== "passed") {
      throw new Error(`${spec.id}: Blender did not report a passing semantic art contract`);
    }
    results.push({
      id: spec.id,
      file: spec.file,
      family: spec.family,
      generator: spec.generator,
      seed: spec.seed,
      dimensions: blenderAsset.dimensions,
      bounds: blenderAsset.bounds,
      paletteTokensUsed: blenderAsset.paletteTokensUsed,
      vertexColorLoops: blenderAsset.vertexColorLoops,
      vertexColorSpace: blenderAsset.vertexColorSpace,
      requiredNodes: spec.requiredNodes,
      collision: spec.collision,
      lod: spec.lod,
      readDistanceMeters: spec.readDistanceMeters,
      durationMs: Date.now() - assetStarted,
      inputHash: plan.inputHash,
      cacheHit: false,
      budget: spec.budget,
      ...(spec.referenceAuthoring
        ? { referenceAuthoring: referenceAuthoringSummary(spec) }
        : {}),
      warnings:
        final.qualityStatus === "below_target"
          ? [`${final.triangles} triangles are below quality target ${spec.budget.trianglesTarget}`]
          : [],
      ...final,
      semanticHash: rawValidation.semanticHash,
      ...(spec.generator === "imported_blend" ? {
        packaging: "lossless-compression-only",
        compression: final.extensions.filter((extension) => extension === "EXT_meshopt_compression" || extension === "KHR_draco_mesh_compression"),
      } : {}),
    });
    const result = results[results.length - 1];
    try {
      writeAssetCache(plan, result, optimized, blenderInfo.version);
    } catch (error) {
      console.warn(`[NEVA ART] Could not write cache for ${spec.id}: ${error.message}`);
    }
  }
  const summary = summarizeAssets(results);
  for (const spec of assets) validateSourceProvenance(spec);
  console.log(
    `[NEVA ART] Mechanical validation passed for ${summary.assetCount} selected assets (${summary.cacheHits} cache hits, ${summary.cacheMisses} generated)`,
  );
  return {
    report: {
      version: 2,
      generatedAt: new Date().toISOString(),
      specHash: context.specHash,
      paletteHash: context.paletteHash,
      toolchainHash: context.toolchainHash,
      blenderVersion: blenderInfo.version,
      vertexColorSpace: "linear-srgb",
      durationMs: Date.now() - started,
      aggregateBytes: results.reduce((sum, result) => sum + result.bytes, 0),
      summary,
      assets: results,
    },
    optimizedDir,
  };
}

function markdownReport(report) {
  const rows = report.assets.map((asset) =>
    `| ${asset.id} | ${asset.family} | ${asset.referenceAuthoring?.status ?? "catalog-only"} | ${asset.triangles} / ${asset.packagedTriangles ?? asset.triangles} / ${asset.budget.trianglesTarget} | ${asset.qualityStatus} | ${asset.materials} | ${asset.bytes} | ${asset.fileHash.slice(0, 12)} |`,
  );
  const publication = {
    published: "published atomically to generated/glb and public/assets/models",
    "pending-publication": "validated staging candidate; atomic publication pending",
    "staged-only": "validated staging candidate; public assets unchanged",
    determinism: "determinism-only staging candidates; public assets unchanged",
  }[report.publication] ?? "state unavailable; consult the invoking command output";
  return [
    "# Neva asset pipeline report", "",
    `- Blender: ${report.blenderVersion}`,
    `- Spec hash: \`${report.specHash}\``,
    `- Toolchain hash: \`${report.toolchainHash}\``,
    `- Assets: ${report.assets.length}`,
    `- Download bytes: ${report.aggregateBytes}`,
    `- Mechanical art contract: ${report.summary.artContractPassed ? "passed" : "failed"}`,
    `- Reference briefs: ${report.summary.referenceReady} ready, ${report.summary.referenceDraft} draft`,
    `- COLOR_0 space: ${report.vertexColorSpace}`,
    `- Geometry density: ${report.summary.onTarget} on target, ${report.summary.belowTarget} below target`,
    `- Incremental cache: ${report.summary.cacheHits} hits, ${report.summary.cacheMisses} misses`,
    `- Publication: ${publication}`, "",
    "| Asset | Family | Reference brief | LOD0 / packaged / target tris | Density status | Materials | Bytes | SHA-256 |",
    "| --- | --- | --- | ---: | --- | ---: | ---: | --- |", ...rows, "",
  ].join("\n");
}

function copyAtomically(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.next-${process.pid}`;
  fs.copyFileSync(source, temporary);
  fs.renameSync(temporary, destination);
}

function promoteFilesAtomically(copies, removals, backupRoot) {
  const destinations = [...new Set([...copies.map((entry) => entry.destination), ...removals])];
  const snapshots = destinations.map((filename, index) => {
    if (!fs.existsSync(filename)) return { filename, existed: false, backup: null };
    const backup = path.join(backupRoot, `${String(index).padStart(4, "0")}-${path.basename(filename)}`);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(filename, backup);
    return { filename, existed: true, backup };
  });
  try {
    for (const entry of copies) copyAtomically(entry.source, entry.destination);
    for (const filename of removals) if (fs.existsSync(filename)) fs.unlinkSync(filename);
  } catch (error) {
    for (const snapshot of snapshots.reverse()) {
      if (snapshot.existed) copyAtomically(snapshot.backup, snapshot.filename);
      else if (fs.existsSync(snapshot.filename)) fs.unlinkSync(snapshot.filename);
    }
    throw error;
  }
}

function publishStage(report, optimizedDir, selected, catalog, strict, repoRoot = ROOT) {
  const generatedDir = path.join(repoRoot, "generated/glb");
  const publicDir = path.join(repoRoot, "public/assets/models");
  const reportDir = path.join(repoRoot, "generated/reports");
  const manifestPath = path.join(reportDir, "asset-manifest.json");
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(reportDir, { recursive: true });
  const previous = fs.existsSync(manifestPath) ? readJson(manifestPath) : { assets: [] };
  const selectedFiles = new Set(selected.map((asset) => asset.file));
  const allSelected = selected.length === catalog.assets.length;
  const stale = allSelected
    ? previous.assets.filter((entry) => !catalog.assets.some((asset) => asset.file === entry.file))
    : [];
  const mergedEntries = allSelected
    ? report.assets
    : [
        ...previous.assets.filter((entry) => !selectedFiles.has(entry.file)),
        ...report.assets,
      ].sort((a, b) => a.id.localeCompare(b.id));
  const catalogById = new Map(catalog.assets.map((asset) => [asset.id, asset]));
  const merged = mergedEntries.map((entry) => {
    const spec = catalogById.get(entry.id);
    if (!spec) throw new Error(`Cannot publish unknown manifest asset ${entry.id}`);
    return {
      ...entry,
      family: entry.family ?? spec.family,
      generator: entry.generator ?? spec.generator,
      budget: entry.budget ?? spec.budget,
      ...(entry.referenceAuthoring || !spec.referenceAuthoring
        ? {}
        : { referenceAuthoring: referenceAuthoringSummary(spec) }),
    };
  });
  const manifest = {
    ...report,
    publication: "published",
    aggregateBytes: merged.reduce((sum, asset) => sum + asset.bytes, 0),
    summary: summarizeAssets(merged),
    assets: merged,
  };
  const promotionDir = path.join(path.dirname(optimizedDir), "promotion");
  fs.mkdirSync(promotionDir, { recursive: true });
  const stagedManifest = path.join(promotionDir, "asset-manifest.json");
  const stagedMarkdown = path.join(promotionDir, "asset-report.md");
  const stagedQualityReport = path.join(promotionDir, "asset_budget_report.json");
  fs.writeFileSync(stagedManifest, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(stagedMarkdown, markdownReport(manifest));
  fs.writeFileSync(stagedQualityReport, `${JSON.stringify({ ...manifest, strict }, null, 2)}\n`);
  const copies = [];
  for (const asset of selected) {
    const source = path.join(optimizedDir, asset.file);
    copies.push(
      { source, destination: path.join(generatedDir, asset.file) },
      { source, destination: path.join(publicDir, asset.file) },
    );
  }
  copies.push(
    { source: stagedManifest, destination: manifestPath },
    { source: stagedMarkdown, destination: path.join(reportDir, "asset-report.md") },
    { source: stagedQualityReport, destination: path.join(reportDir, "asset_budget_report.json") },
    { source: stagedManifest, destination: path.join(publicDir, "asset-manifest.json") },
  );
  const removals = stale.flatMap((entry) => [
    path.join(generatedDir, entry.file),
    path.join(publicDir, entry.file),
  ]);
  promoteFilesAtomically(copies, removals, path.join(path.dirname(optimizedDir), "backup"));
  for (const asset of report.assets) {
    const generated = fs.readFileSync(path.join(generatedDir, asset.file));
    const published = fs.readFileSync(path.join(publicDir, asset.file));
    if (sha256(generated) !== sha256(published)) throw new Error(`${asset.id}: public/generated hash mismatch`);
  }
}

async function validatePublished(assets, catalog, specHash) {
  const paletteHash = sha256(fs.readFileSync(PALETTE_PATH));
  const generatedManifest = readJson(MANIFEST_PATH);
  const publicManifest = readJson(PUBLIC_MANIFEST_PATH);
  validatePublishedManifest(generatedManifest, catalog, specHash, paletteHash, "generated", assets);
  validatePublishedManifest(publicManifest, catalog, specHash, paletteHash, "public", assets);
  if (JSON.stringify(generatedManifest) !== JSON.stringify(publicManifest)) {
    throw new Error("Generated and public asset manifests differ");
  }
  const reportAssets = [];
  for (const spec of assets) {
    const generated = path.join(GENERATED_DIR, spec.file);
    const published = path.join(PUBLIC_DIR, spec.file);
    if (!fs.existsSync(generated) || !fs.existsSync(published)) throw new Error(`${spec.id}: published file is missing`);
    const result = await validateGlb(generated, spec, "published");
    if (sha256(fs.readFileSync(generated)) !== sha256(fs.readFileSync(published))) {
      throw new Error(`${spec.id}: generated/public copies differ`);
    }
    const manifestAsset = generatedManifest.assets.find((asset) => asset.id === spec.id);
    if (
      !manifestAsset ||
      manifestAsset.file !== spec.file ||
      manifestAsset.fileHash !== result.fileHash ||
      manifestAsset.bytes !== result.bytes ||
      manifestAsset.triangles !== result.triangles ||
      manifestAsset.packagedTriangles !== result.packagedTriangles ||
      manifestAsset.materials !== result.materials ||
      JSON.stringify(manifestAsset.lodLevels ?? []) !== JSON.stringify(result.lodLevels ?? [])
    ) {
      throw new Error(`${spec.id}: published metrics do not match the manifest`);
    }
    reportAssets.push({ id: spec.id, ...result });
  }
  console.log(`[NEVA ART] Validated ${reportAssets.length} published assets (spec ${specHash.slice(0, 12)})`);
}

async function syncPublishedManifest(catalog, specHash) {
  const paletteHash = sha256(fs.readFileSync(PALETTE_PATH));
  const previous = fs.existsSync(MANIFEST_PATH) ? readJson(MANIFEST_PATH) : { assets: [] };
  const previousById = new Map((previous.assets ?? []).map((asset) => [asset.id, asset]));
  const assets = [];
  for (const spec of catalog.assets) {
    const generatedPath = path.join(GENERATED_DIR, spec.file);
    const publicPath = path.join(PUBLIC_DIR, spec.file);
    if (!fs.existsSync(generatedPath) || !fs.existsSync(publicPath)) {
      throw new Error(`${spec.id}: cannot sync a missing published artifact`);
    }
    const generatedBytes = fs.readFileSync(generatedPath);
    const publicBytes = fs.readFileSync(publicPath);
    if (sha256(generatedBytes) !== sha256(publicBytes)) {
      throw new Error(`${spec.id}: generated/public copies differ during manifest sync`);
    }
    const result = await validateGlb(generatedPath, spec, "published-sync");
    const previousAsset = previousById.get(spec.id);
    if (!previousAsset) throw new Error(`${spec.id}: existing manifest entry is missing`);
    assets.push({
      ...previousAsset,
      ...result,
      id: spec.id,
      file: spec.file,
      family: spec.family,
      generator: spec.generator,
      seed: spec.seed,
      budget: spec.budget,
      collision: spec.collision,
      lod: spec.lod,
      requiredNodes: spec.requiredNodes,
      readDistanceMeters: spec.readDistanceMeters,
      ...(spec.referenceAuthoring
        ? { referenceAuthoring: referenceAuthoringSummary(spec) }
        : {}),
      cacheHit: false,
    });
  }

  const manifest = {
    ...previous,
    version: 2,
    generatedAt: new Date().toISOString(),
    specHash,
    paletteHash,
    toolchainHash: computeToolchainHash(),
    vertexColorSpace: "linear-srgb",
    durationMs: 0,
    aggregateBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
    summary: summarizeAssets(assets),
    assets,
  };
  const stage = path.join(STAGING_ROOT, `sync-${process.pid}`);
  fs.mkdirSync(stage, { recursive: true });
  const stagedManifest = path.join(stage, "asset-manifest.json");
  const stagedQualityReport = path.join(stage, "asset_budget_report.json");
  fs.writeFileSync(stagedManifest, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(stagedQualityReport, `${JSON.stringify({ ...manifest, sync: true }, null, 2)}\n`);
  promoteFilesAtomically(
    [
      { source: stagedManifest, destination: MANIFEST_PATH },
      { source: stagedManifest, destination: PUBLIC_MANIFEST_PATH },
      { source: stagedQualityReport, destination: QUALITY_REPORT_PATH },
    ],
    [],
    path.join(stage, "backup"),
  );
  console.log(`[NEVA ART] Revalidated and synced ${assets.length} published manifest entries`);
}

export function validatePublishedManifest(
  manifest,
  catalog,
  specHash,
  paletteHash,
  label = "published",
  selectedAssets = catalog.assets,
) {
  if (
    !manifest ||
    typeof manifest !== "object" ||
    manifest.specHash !== specHash ||
    manifest.paletteHash !== paletteHash ||
    manifest.toolchainHash !== computeToolchainHash()
  ) {
    throw new Error(`${label} manifest does not match the current catalog, palette, or toolchain`);
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length !== catalog.assets.length) {
    throw new Error(`${label} manifest does not contain the complete catalog`);
  }
  if (
    manifest.vertexColorSpace !== "linear-srgb" ||
    typeof manifest.toolchainHash !== "string" ||
    manifest.toolchainHash.length !== 64
  ) {
    throw new Error(`${label} manifest is missing current art-pipeline provenance`);
  }
  const entries = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const selectedIds = new Set(selectedAssets.map((asset) => asset.id));
  for (const spec of catalog.assets) {
    const asset = entries.get(spec.id);
    if (
      !asset ||
      asset.file !== spec.file ||
      typeof asset.fileHash !== "string"
    ) {
      throw new Error(`${label} manifest is missing ${spec.id}`);
    }
    if (!selectedIds.has(spec.id)) continue;
    if (
      asset.artContractStatus !== "passed" ||
      asset.vertexColorSpace !== "linear-srgb"
    ) {
      throw new Error(`${label} manifest is missing current validation metadata for ${spec.id}`);
    }
    if (
      spec.lodLevels &&
      (!Array.isArray(asset.lodLevels) ||
        asset.lodLevels.length !== spec.lodLevels.length ||
        typeof asset.packagedTriangles !== "number")
    ) {
      throw new Error(`${label} manifest is missing generated LOD metrics for ${spec.id}`);
    }
  }
  return manifest;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "help") {
    console.log("Usage:\n  node tools/blender/cli.mjs [brief|generate|validate|sync|determinism|list] (--asset ID | --family NAME | --all) [--no-publish] [--strict]\n  node tools/blender/cli.mjs admit --asset ID --source PATH [--no-publish]\n  node tools/blender/cli.mjs test-builders");
    return;
  }
  if (args.strict && args.command !== "generate") {
    throw new Error("--strict is only supported by the generate command");
  }
  const offlineStaging = args.command === "determinism" || (args.command === "generate" && !args.publish);
  const { catalog, palette, specHash } = validateCatalog(offlineStaging ? args : null);
  if (args.command === "test-builders") {
    if (args.assets.length || args.families.length || args.all) throw new Error("test-builders does not accept asset selection");
    runBuilderTests(resolveBlender().blender);
    return;
  }
  if (args.command === "sync") {
    if (!args.all || args.assets.length || args.families.length || args.publish === false) {
      throw new Error("sync requires --all and writes only revalidated published manifest metadata");
    }
    await syncPublishedManifest(catalog, specHash);
    return;
  }
  if (args.command === "brief" && args.all) {
    throw new Error("brief requires --asset or --family; --all is not supported because only reference-guided assets have briefs");
  }
  const selected = selectAssets(catalog, args);
  if (args.command === "admit") {
    await admitAsset(selected[0], args.source, catalog, palette, { publish: args.publish });
    return;
  }
  if (args.command === "list") {
    for (const asset of selected) console.log(`${asset.id}\t${asset.family}\t${asset.file}`);
    return;
  }
  if (args.command === "brief") {
    const missingBriefs = selected.filter((asset) => !asset.referenceAuthoring).map((asset) => asset.id);
    if (missingBriefs.length) {
      throw new Error(`brief requires referenceAuthoring for every selected asset; missing contracts: ${missingBriefs.join(", ")}`);
    }
    for (const asset of selected) process.stdout.write(referenceBriefMarkdown(asset));
    return;
  }
  if (args.command === "validate") {
    await validatePublished(selected, catalog, specHash);
    return;
  }
  if (!new Set(["generate", "determinism"]).has(args.command)) throw new Error(`Unknown command: ${args.command}`);
  if (args.strict) {
    const draftBriefs = selected.filter((asset) => asset.referenceAuthoring?.status === "draft");
    if (draftBriefs.length) {
      throw new Error(`Strict generation rejected draft reference briefs: ${draftBriefs.map((asset) => asset.id).join(", ")}`);
    }
  }
  const blenderInfo = resolveBlender();
  const generationInputs = readGenerationInputs();
  if (generationInputs.specHash !== specHash) {
    throw new Error("Asset catalog changed while it was being validated; rerun from stable sources");
  }
  const stage = makeStage();
  const context = {
    stage,
    strict: args.strict,
    palette,
    useCache: args.useCache !== false && args.command !== "determinism",
    concurrency: args.concurrency,
    timeoutMs: args.timeoutMs,
    ...generationInputs,
  };
  const first = await buildStage(context, selected, blenderInfo);
  assertGenerationInputsUnchanged(generationInputs, "during the first build");
  first.report.publication = args.command === "determinism"
    ? "determinism"
    : args.publish ? "pending-publication" : "staged-only";
  fs.writeFileSync(path.join(stage, "asset-report.json"), `${JSON.stringify(first.report, null, 2)}\n`);
  fs.writeFileSync(path.join(stage, "asset-report.md"), markdownReport(first.report));
  if (args.strict && first.report.summary.belowTarget > 0) {
    throw new Error(
      `Strict density gate rejected ${first.report.summary.belowTarget} below-target assets; see ${path.join(stage, "asset-report.md")}`,
    );
  }
  if (args.command === "determinism") {
    const secondStage = makeStage();
    const second = await buildStage({
      stage: secondStage,
      strict: args.strict,
      palette,
      useCache: false,
      concurrency: args.concurrency,
      timeoutMs: args.timeoutMs,
      ...generationInputs,
    }, selected, blenderInfo);
    assertGenerationInputsUnchanged(generationInputs, "during the determinism build");
    for (const asset of first.report.assets) {
      const peer = second.report.assets.find((entry) => entry.id === asset.id);
      if (asset.semanticHash !== peer?.semanticHash) throw new Error(`${asset.id}: semantic determinism mismatch`);
    }
    console.log(`[NEVA ART] Semantic determinism passed for ${selected.length} assets`);
    const retention = pruneStagingRuns(STAGING_ROOT, STAGING_RUN_RETENTION, [stage, secondStage]);
    if (retention.removed.length) console.log(`[NEVA ART] Pruned ${retention.removed.length} older staging runs`);
    return;
  }
  if (args.publish) {
    publishStage(first.report, first.optimizedDir, selected, catalog, args.strict);
    console.log(`[NEVA ART] Published ${selected.length} validated assets`);
    const firstAsset = selected[0];
    const suffix = selected.length > 1 ? ` (+${selected.length - 1} more selected)` : "";
    console.log(`[NEVA ART] Art Yard: ${artYardUrl(firstAsset.id)}${suffix}`);
  } else {
    console.log(`[NEVA ART] Staged ${selected.length} assets at ${stage}; public assets unchanged`);
  }
  const retention = pruneStagingRuns(STAGING_ROOT, STAGING_RUN_RETENTION, [stage]);
  if (retention.removed.length) console.log(`[NEVA ART] Pruned ${retention.removed.length} older staging runs`);
}

export {
  computeAssetInputHash,
  computeAssetToolchainHash,
  computeToolchainHash,
  computeCommonToolchainHash,
  computeAssetHash,
  isAssetCurrent,
  isCached,
  recordCache,
  cleanCache,
  runDynamicBlenderPool,
  BlenderWorkerPool,
  optimizeAndGenerateLods,
  artYardUrl,
  parseArgs,
  pruneStagingRuns,
  promoteFilesAtomically,
  referenceAuthoringSummary,
  referenceBriefHash,
  referenceBriefMarkdown,
  safeFilename,
  selectAssets,
  validateCatalog,
  admitAsset,
  resolveAdmissionSource,
  validateSourceProvenance,
  validateStaticAuthoring,
  validateStaticSourceContract,
  validateAdmissionGlb,
  validateGlb,
  validateGeneratorParameters,
  validateAnimationContract,
  validateLodContract,
  validateReferenceAuthoring,
  optimizeAsset,
  mayJoinStaticNode,
};

if (process.argv[1] && path.resolve(process.argv[1]) === CLI_PATH) {
  main().catch((error) => {
    console.error(`[NEVA ART] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
