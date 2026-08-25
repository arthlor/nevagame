import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, join, meshopt, prune, weld } from "@gltf-transform/functions";
import { validateBytes } from "gltf-validator";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

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
const ART_CACHE_VERSION = 1;
const STAGING_RUN_RETENTION = 3;
const ART_YARD_URL = "http://localhost:3000/__neva_art_yard";
const STAGE_PATTERN = /^run-[A-Za-z0-9_-]+$/;
const BLENDER_LOG_BUFFER_BYTES = 16 * 1024 * 1024;
const FAILURE_EXCERPT_LINES = 30;

const readJson = (filename) => JSON.parse(fs.readFileSync(filename, "utf8"));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const safeFilename = (value) => path.basename(value) === value && value.endsWith(".glb");

function computeToolchainHash(directory = HERE) {
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "__pycache__") continue;
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile() && TOOLCHAIN_EXTENSIONS.has(path.extname(entry.name))) files.push(filename);
    }
  };
  visit(directory);
  const digest = crypto.createHash("sha256");
  for (const filename of files.sort()) {
    digest.update(path.relative(directory, filename));
    digest.update("\0");
    digest.update(fs.readFileSync(filename));
    digest.update("\0");
  }
  return digest.digest("hex");
}

function readGenerationInputs() {
  return {
    specHash: sha256(fs.readFileSync(CATALOG_PATH)),
    paletteHash: sha256(fs.readFileSync(PALETTE_PATH)),
    toolchainHash: computeToolchainHash(),
  };
}

function assertGenerationInputsUnchanged(expected, phase) {
  const current = readGenerationInputs();
  const changed = Object.keys(expected).filter((key) => expected[key] !== current[key]);
  if (changed.length) {
    throw new Error(
      `Generation inputs changed ${phase}: ${changed.join(", ")}; discard this stage and rerun from stable sources`,
    );
  }
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function hashFiles(files, relativeRoot = ROOT) {
  const digest = crypto.createHash("sha256");
  for (const filename of [...new Set(files)].sort()) {
    if (!fs.existsSync(filename)) throw new Error(`Cannot hash missing art input: ${filename}`);
    digest.update(path.relative(relativeRoot, filename));
    digest.update("\0");
    digest.update(fs.readFileSync(filename));
    digest.update("\0");
  }
  return digest.digest("hex");
}

function generatorModuleFor(generator) {
  const registryPath = path.join(HERE, "generators/registry.py");
  const registry = fs.readFileSync(registryPath, "utf8");
  for (const match of registry.matchAll(/^from \.([a-z0-9_]+) import ([^\n]+)$/gm)) {
    const importedNames = match[2].split(",").map((name) => name.trim());
    if (importedNames.includes(generator)) return `${match[1]}.py`;
  }
  throw new Error(`${generator}: no registered generator module was found`);
}

function computeAssetToolchainHash(asset) {
  const generatorModule = generatorModuleFor(asset.generator);
  const commonDirectory = path.join(HERE, "common");
  const commonFiles = fs.readdirSync(commonDirectory)
    .filter((filename) => TOOLCHAIN_EXTENSIONS.has(path.extname(filename)))
    .map((filename) => path.join(commonDirectory, filename));
  const packageFiles = ["package.json", "package-lock.json", "npm-shrinkwrap.json"]
    .map((filename) => path.join(ROOT, filename))
    .filter((filename) => fs.existsSync(filename));
  return hashFiles([
    CLI_PATH,
    path.join(HERE, "bootstrap.py"),
    path.join(HERE, "generators/registry.py"),
    path.join(HERE, "generators", generatorModule),
    ...commonFiles,
    SCHEMA_PATH,
    SCENE_BUDGET_PATH,
    ...packageFiles,
  ]);
}

function computeAssetInputHash(asset, palette, blenderVersion) {
  const paletteTokens = Object.fromEntries(
    [...asset.palette].sort().map((token) => [token, palette.tokens[token]]),
  );
  return sha256(stableStringify({
    cacheVersion: ART_CACHE_VERSION,
    blenderVersion,
    asset,
    paletteVersion: palette.version,
    paletteTokens,
    toolchainHash: computeAssetToolchainHash(asset),
  }));
}

const number = (min, max) => ({ kind: "number", min, max });
const integer = (min, max) => ({ kind: "integer", min, max });
const choice = (...values) => ({ kind: "choice", values });
const tuple3 = (min, max) => ({ kind: "tuple3", min, max });
const boolean = () => ({ kind: "boolean" });

const PARAMETER_CONTRACTS = Object.freeze({
  oak_tree: { height: number(3, 10), spread: number(1, 5), canopyClusters: integer(6, 18), lean: number(-0.4, 0.4), branchCount: integer(4, 10), rootCount: integer(4, 10) },
  pine_tree: { height: number(4, 12), spread: number(1, 4), tiers: integer(5, 12), lean: number(-0.4, 0.4), branchesPerTier: integer(3, 8), rootCount: integer(3, 8) },
  apple_tree: { height: number(2.5, 7), spread: number(1, 4), canopyClusters: integer(6, 16), fruitCount: integer(6, 30), branchCount: integer(3, 8), rootCount: integer(3, 8) },
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
  farmhouse: { width: number(3, 14), depth: number(3, 12), wallHeight: number(2, 7), roofPitchDeg: number(20, 55) },
  lighthouse: { height: number(6, 24), baseRadius: number(1, 5), sides: integer(8, 16) },
  windmill: { height: number(4, 16), baseRadius: number(1, 5), sides: integer(8, 16) },
  stone_bridge: { length: number(5, 30), width: number(2, 8), archCount: integer(1, 4) },
  working_dock: { length: number(3, 20), width: number(2, 10), canopy: boolean() },
  fish_market: { width: number(3, 16), depth: number(3, 12), wallHeight: number(2, 7), roofPitchDeg: number(20, 55) },
  water_well: { radius: number(0.4, 2) },
  pumpkin_patch: { pumpkins: integer(3, 12), vineSegments: integer(3, 20), lobes: integer(3, 7), blossomCount: integer(2, 12) },
  lobster_trap: { ribs: integer(4, 14), length: number(0.5, 3), netColumns: integer(2, 8), netRows: integer(2, 8) },
  fishing_net_rack: { width: number(1.2, 5), depth: number(0.4, 2), height: number(1, 4), netColumns: integer(3, 12), netRows: integer(2, 10), buoys: integer(2, 8) },
  wood_crate: { size: number(0.3, 2), slats: integer(3, 9) },
  wood_barrel: { height: number(0.4, 2), radius: number(0.2, 1), staves: integer(8, 20) },
  wood_fence: { length: number(1, 8), posts: integer(2, 8), rails: integer(1, 4), railSegments: integer(3, 12) },
  hay_bale: { length: number(0.5, 3), radius: number(0.2, 1.5), bands: integer(1, 4), fiberBands: integer(6, 20) },
  lamp_post: { height: number(1.5, 8), armLength: number(0.2, 2) },
  worm_compost_bin: { width: number(0.5, 3), depth: number(0.5, 3), height: number(0.4, 2), slatCount: integer(2, 8), lidAngleDeg: number(0, 75), soilFillRatio: number(0.1, 0.95) },
  rowboat: { length: number(2, 8), beam: number(1, 4), ribCount: integer(5, 16), innerPlanks: integer(5, 16), gunwaleSegments: integer(5, 16) },
  fishing_skiff: { length: number(4, 16), beam: number(1.5, 6), ribCount: integer(6, 20), mastHeight: number(3, 14), outerStrakes: integer(2, 7), hullSegments: integer(7, 18), deckBoards: integer(12, 50), sailRows: integer(4, 14) },
  wheat_crop: { stage: choice("seeded", "sprout", "growing", "mature", "overripe", "withered"), stalks: integer(0, 24) },
  tomato_crop: { stage: choice("seeded", "sprout", "growing", "mature", "overripe", "withered"), plants: integer(0, 12) },
  potato_crop: { stage: choice("seeded", "sprout", "growing", "mature", "overripe", "withered") },
  stylized_fish: {
    species: choice("trout", "tuna"),
    length: number(0.4, 5),
    girth: number(0.1, 1.5),
    finScale: number(0.3, 2),
    bodyDepth: number(0.6, 1.8),
    bodySegments: integer(8, 24),
    radialSegments: integer(8, 18),
    tailPeduncle: number(0.10, 0.42),
  },
  faceted_cloud: { clusters: integer(3, 12), width: number(2, 14) },
  coastal_worker: { height: number(1.5, 2.4), headRatio: number(4.0, 7.0), handScale: number(0.8, 1.4) },
  npc_character: { role: choice("gardener", "handyman", "dockmaster", "merchant"), height: number(1.5, 2.4), headRatio: number(4.0, 7.0), handScale: number(0.8, 1.4) },


  grass_clump: { bladeCount: integer(4, 50), height: number(0.1, 3), spread: number(0.1, 3), bladeWidth: number(0.01, 0.5) },
  wildflower_clump: { stemCount: integer(2, 30), height: number(0.1, 3), spread: number(0.1, 3), petals: integer(3, 12) },
  pebble_cluster: { count: integer(2, 50), spread: number(0.1, 4), size: number(0.02, 2) },
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
  fauna_cow: { scale: number(0.5, 2) },
  fauna_chicken: { scale: number(0.3, 1.5) },
  interior_farmhouse_shell: { width: number(3, 14), depth: number(3, 12), wallHeight: number(2, 7), floorPlanks: integer(6, 30), ceilingBeams: integer(2, 10) },
  cozy_bed: { scale: number(0.5, 2) },
  fireplace_hearth: { width: number(1, 5), depth: number(0.5, 3), height: number(1.5, 5) },
  dining_table: { width: number(1, 4), depth: number(0.5, 3) },
  rustic_chair: { scale: number(0.5, 2) },
  woven_rug: { width: number(1, 6), depth: number(1, 5) },
  cupboard_shelves: { width: number(0.8, 4), depth: number(0.3, 2), height: number(1, 4) },
  cozy_armchair: { scale: number(0.5, 2) },
});

function validateGeneratorParameters(asset) {
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
    if (!valid) throw new Error(`${asset.id}: invalid generator parameter ${key}`);
  }
  return true;
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
];

const REQUIRED_NPC_CLIPS = [
  "idle",
  "talk_gesture",
  "walk",
  "turn_left",
  "turn_right",
];

function validateAnimationContract(asset) {
  if (asset.family !== "character") return true;
  if (!asset.requiredNodes.includes(asset.rigNode)) {
    throw new Error(`${asset.id}: requiredNodes must include rigNode ${asset.rigNode}`);
  }
  for (const socket of asset.socketNodes) {
    if (!asset.requiredNodes.includes(socket)) {
      throw new Error(`${asset.id}: requiredNodes must include socket ${socket}`);
    }
  }
  const clips = new Map();
  for (const clip of asset.animationClips ?? []) {
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
  const requiredClips = asset.generator === "npc_character" ? REQUIRED_NPC_CLIPS : REQUIRED_CHARACTER_CLIPS;
  const missing = requiredClips.filter((name) => !clips.has(name));
  if (missing.length) throw new Error(`${asset.id}: missing required animation clips: ${missing.join(", ")}`);
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

function validateCatalog() {
  const catalog = readJson(CATALOG_PATH);
  const schema = readJson(SCHEMA_PATH);
  const palette = readJson(PALETTE_PATH);
  const sceneBudgets = readJson(SCENE_BUDGET_PATH);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  if (!validate(catalog)) {
    throw new Error(`Asset catalog schema errors:\n${ajv.errorsText(validate.errors, { separator: "\n" })}`);
  }

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
    validateGeneratorParameters(asset);
    validateLodContract(asset);
    validateAnimationContract(asset);
    validateReferenceAuthoring(asset);
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
  const args = { command: "generate", assets: [], families: [], all: false, publish: true, strict: false };
  let index = 0;
  if (argv[0] && !argv[0].startsWith("-")) args.command = argv[index++];
  while (index < argv.length) {
    const flag = argv[index++];
    if (flag === "--asset") args.assets.push(argv[index++]);
    else if (flag === "--family") args.families.push(argv[index++]);
    else if (flag === "--all") args.all = true;
    else if (flag === "--no-publish") args.publish = false;
    else if (flag === "--strict") args.strict = true;
    else if (flag === "--help" || flag === "-h") args.command = "help";
    else throw new Error(`Unknown argument: ${flag}`);
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

function semanticHash(bytes) {
  const { json, binary } = parseGlb(bytes);
  const semantic = structuredClone(json);
  if (semantic.asset) delete semantic.asset.generator;
  const componentCounts = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
  const componentSizes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const accessorData = [];
  const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const readComponent = (offset, type) => {
    if (type === 5120) return view.getInt8(offset);
    if (type === 5121) return view.getUint8(offset);
    if (type === 5122) return view.getInt16(offset, true);
    if (type === 5123) return view.getUint16(offset, true);
    if (type === 5125) return view.getUint32(offset, true);
    return Math.round(view.getFloat32(offset, true) * 100000) / 100000;
  };
  for (const accessor of json.accessors ?? []) {
    const bufferView = json.bufferViews?.[accessor.bufferView];
    if (!bufferView || bufferView.extensions?.EXT_meshopt_compression || accessor.sparse) {
      accessorData.push(null);
      continue;
    }
    const components = componentCounts[accessor.type];
    const componentSize = componentSizes[accessor.componentType];
    const stride = bufferView.byteStride ?? components * componentSize;
    const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const values = [];
    for (let element = 0; element < accessor.count; element++) {
      for (let component = 0; component < components; component++) {
        values.push(readComponent(start + element * stride + component * componentSize, accessor.componentType));
      }
    }
    accessorData.push(values);
  }
  return sha256(Buffer.from(JSON.stringify({ semantic, accessorData })));
}

async function validateGlb(filename, spec, phase) {
  const bytes = fs.readFileSync(filename);
  const report = await validateBytes(new Uint8Array(bytes), {
    uri: spec.file,
    externalResourceFunction: async () => new Uint8Array(),
  });
  const errors = report.issues.messages.filter((issue) => issue.severity === 0);
  const warnings = report.issues.messages.filter((issue) => issue.severity === 1);
  if (errors.length || warnings.length) {
    const details = [...errors, ...warnings].map((issue) => `${issue.code}: ${issue.message}`).join("\n");
    throw new Error(`${spec.id}: Khronos ${phase} validation failed\n${details}`);
  }
  const { json } = parseGlb(bytes);
  const nodes = json.nodes ?? [];
  const nodeNames = new Set(nodes.map((node) => node.name));
  const missing = spec.requiredNodes.filter((name) => !nodeNames.has(name));
  if (missing.length) throw new Error(`${spec.id}: optimized GLB lost required nodes: ${missing.join(", ")}`);
  const animationMetrics = [];
  if (spec.animationClips) {
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
    const animationsByName = new Map((json.animations ?? []).map((animation) => [animation.name, animation]));
    for (const clip of spec.animationClips) {
      const animation = animationsByName.get(clip.name);
      if (!animation) throw new Error(`${spec.id}: ${phase} GLB is missing animation ${clip.name}`);
      let durationSeconds = 0;
      for (const sampler of animation.samplers ?? []) {
        const accessor = json.accessors?.[sampler.input];
        const start = accessor?.min?.[0] ?? 0;
        const end = accessor?.max?.[0] ?? 0;
        durationSeconds = Math.max(durationSeconds, end - start);
      }
      if (Math.abs(durationSeconds - clip.durationSeconds) > 1 / 60 + 0.002) {
        throw new Error(
          `${spec.id}: ${phase} animation ${clip.name} duration ${durationSeconds.toFixed(3)} does not match ${clip.durationSeconds.toFixed(3)}`,
        );
      }
      animationMetrics.push({
        name: clip.name,
        durationSeconds,
        commitMarkerSeconds: clip.commitMarkerSeconds ?? null,
        loop: clip.loop,
        referenceSpeedMetersPerSecond: clip.referenceSpeedMetersPerSecond ?? null,
        events: clip.events ?? [],
      });
    }
  }
  let trianglePrimitives = 0;
  let vertexColorPrimitives = 0;
  let normalPrimitives = 0;
  const meshTriangles = (json.meshes ?? []).map((mesh) => {
    let count = 0;
    for (const primitive of mesh.primitives ?? []) {
      const accessor = json.accessors?.[primitive.indices];
      if (primitive.mode === undefined || primitive.mode === 4) {
        trianglePrimitives += 1;
        if (typeof primitive.attributes?.POSITION !== "number") {
          throw new Error(`${spec.id}: ${phase} triangle primitive is missing POSITION`);
        }
        if (typeof primitive.attributes?.NORMAL !== "number") {
          throw new Error(`${spec.id}: ${phase} triangle primitive is missing NORMAL`);
        }
        normalPrimitives += 1;
        if (typeof primitive.attributes?.COLOR_0 !== "number") {
          throw new Error(`${spec.id}: ${phase} triangle primitive is missing semantic COLOR_0`);
        }
        vertexColorPrimitives += 1;
        if (typeof primitive.material !== "number") {
          throw new Error(`${spec.id}: ${phase} triangle primitive is missing its palette material`);
        }
        count += (accessor?.count ?? 0) / 3;
      }
    }
    return count;
  });
  const doubleSidedMaterials = (json.materials ?? []).filter((material) => material.doubleSided === true);
  if (doubleSidedMaterials.length) {
    throw new Error(
      `${spec.id}: ${phase} GLB contains ${doubleSidedMaterials.length} unnecessary double-sided materials`,
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
    doubleSidedMaterials: 0,
    artContractStatus: "passed",
    extensions: json.extensionsUsed ?? [],
    bytes: bytes.length,
    fileHash: sha256(bytes),
    semanticHash: semanticHash(bytes),
    qualityStatus: triangles >= spec.budget.trianglesTarget ? "on_target" : "below_target",
    animationClips: animationMetrics,
  };
}

function mayJoinStaticNode(node, spec) {
  const name = node.getName();
  // LOD generators already consolidate each level by material. Joining here
  // could cross switch boundaries and invalidate runtime distance selection.
  if (spec.lodLevels) return false;
  if (spec.requiredNodes.includes(name) || name.startsWith("COL_")) return false;
  // Preserve the authored character hierarchy, rig, sockets, and skinned parts.
  if (spec.generator === "coastal_worker" || spec.generator === "npc_character") return false;

  // Rowboat oars are presentation-rigged at runtime. Preserve their authored
  // roots and mesh children instead of joining them into the static hull.
  if (spec.generator === "rowboat" && name.startsWith("rowboat_oar_")) return false;
  // Runtime reparents these meshes under a presentation-only rotor pivot.
  if (
    spec.generator === "windmill" &&
    (name === "windmill_hub" || name.startsWith("windmill_spar_") || name.startsWith("windmill_sail_"))
  ) {
    return false;
  }
  return true;
}

async function optimizeAsset(source, destination, spec) {
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
  const document = await io.read(source);
  await document.transform(
    dedup(),
    join({ cleanup: false, filter: (node) => mayJoinStaticNode(node, spec) }),
    prune({ keepLeaves: true, keepAttributes: true, keepExtras: true }),
    weld(),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
  await io.write(destination, document);
}

function assetCachePlan(asset, context, blenderInfo) {
  if (!context.palette) throw new Error("Asset cache planning requires the validated palette");
  const inputHash = computeAssetInputHash(asset, context.palette, blenderInfo.version);
  const directory = path.join(ART_CACHE_ROOT, inputHash);
  return {
    inputHash,
    artifact: path.join(directory, asset.file),
    metadata: path.join(directory, `${asset.file}.json`),
  };
}

async function readAssetCache(plan, spec) {
  if (!fs.existsSync(plan.artifact) || !fs.existsSync(plan.metadata)) return null;
  try {
    const record = readJson(plan.metadata);
    if (
      record.version !== ART_CACHE_VERSION ||
      record.inputHash !== plan.inputHash ||
      record.id !== spec.id ||
      record.file !== spec.file ||
      !record.result ||
      record.result.artContractStatus !== "passed" ||
      (record.result.fileHash !== undefined && typeof record.result.fileHash !== "string")
    ) {
      return null;
    }
    const validation = await validateGlb(plan.artifact, spec, "cache");
    if (record.result.fileHash && record.result.fileHash !== validation.fileHash) return null;
    return {
      ...record.result,
      ...validation,
      semanticHash: record.result.semanticHash ?? validation.semanticHash,
      inputHash: plan.inputHash,
      cacheHit: true,
    };
  } catch (error) {
    console.warn(`[NEVA ART] Ignoring invalid cache for ${spec.id}: ${error.message}`);
    return null;
  }
}

function writeAssetCache(plan, result, optimized, blenderVersion) {
  fs.mkdirSync(path.dirname(plan.artifact), { recursive: true });
  copyAtomically(optimized, plan.artifact);
  const metadataTemporary = `${plan.metadata}.next-${process.pid}`;
  fs.writeFileSync(metadataTemporary, `${JSON.stringify({
    version: ART_CACHE_VERSION,
    inputHash: plan.inputHash,
    id: result.id,
    file: result.file,
    blenderVersion,
    result: { ...result, cacheHit: false },
  }, null, 2)}\n`);
  fs.renameSync(metadataTemporary, plan.metadata);
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
    fileSizeBytes: results.reduce((sum, asset) => sum + asset.bytes, 0),
    trianglePrimitives: results.reduce((sum, asset) => sum + asset.trianglePrimitives, 0),
    nodes: results.reduce((sum, asset) => sum + asset.nodes, 0),
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
  const { rawDir, blenderReport } = misses.length
    ? runBlender(blenderInfo.blender, misses, context.stage, context.strict)
    : { rawDir: null, blenderReport: { assets: [] } };
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
    await optimizeAsset(raw, optimized, spec);
    const final = await validateGlb(optimized, spec, "optimized");
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
    });
    const result = results[results.length - 1];
    try {
      writeAssetCache(plan, result, optimized, blenderInfo.version);
    } catch (error) {
      console.warn(`[NEVA ART] Could not write cache for ${spec.id}: ${error.message}`);
    }
  }
  const summary = summarizeAssets(results);
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
    "- Publication: direct atomic copy to generated/glb and public/assets/models", "",
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

function publishStage(report, optimizedDir, selected, catalog, strict) {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const previous = fs.existsSync(MANIFEST_PATH) ? readJson(MANIFEST_PATH) : { assets: [] };
  const selectedFiles = new Set(selected.map((asset) => asset.file));
  const allSelected = selected.length === catalog.assets.length;
  const stale = allSelected
    ? previous.assets.filter((entry) => !catalog.assets.some((asset) => asset.file === entry.file))
    : [];
  const merged = allSelected
    ? report.assets
    : [
        ...previous.assets.filter((entry) => !selectedFiles.has(entry.file)),
        ...report.assets,
      ].sort((a, b) => a.id.localeCompare(b.id));
  const manifest = {
    ...report,
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
      { source, destination: path.join(GENERATED_DIR, asset.file) },
      { source, destination: path.join(PUBLIC_DIR, asset.file) },
    );
  }
  copies.push(
    { source: stagedManifest, destination: MANIFEST_PATH },
    { source: stagedMarkdown, destination: path.join(REPORT_DIR, "asset-report.md") },
    { source: stagedQualityReport, destination: QUALITY_REPORT_PATH },
    { source: stagedManifest, destination: PUBLIC_MANIFEST_PATH },
  );
  const removals = stale.flatMap((entry) => [
    path.join(GENERATED_DIR, entry.file),
    path.join(PUBLIC_DIR, entry.file),
  ]);
  promoteFilesAtomically(copies, removals, path.join(path.dirname(optimizedDir), "backup"));
  for (const asset of report.assets) {
    const generated = fs.readFileSync(path.join(GENERATED_DIR, asset.file));
    const published = fs.readFileSync(path.join(PUBLIC_DIR, asset.file));
    if (sha256(generated) !== sha256(published)) throw new Error(`${asset.id}: public/generated hash mismatch`);
  }
}

async function validatePublished(assets, catalog, specHash) {
  const paletteHash = sha256(fs.readFileSync(PALETTE_PATH));
  const generatedManifest = readJson(MANIFEST_PATH);
  const publicManifest = readJson(PUBLIC_MANIFEST_PATH);
  validatePublishedManifest(generatedManifest, catalog, specHash, paletteHash, "generated");
  validatePublishedManifest(publicManifest, catalog, specHash, paletteHash, "public");
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

export function validatePublishedManifest(manifest, catalog, specHash, paletteHash, label = "published") {
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
  for (const spec of catalog.assets) {
    const asset = entries.get(spec.id);
    if (
      !asset ||
      asset.file !== spec.file ||
      typeof asset.fileHash !== "string" ||
      asset.artContractStatus !== "passed" ||
      asset.vertexColorSpace !== "linear-srgb"
    ) {
      throw new Error(`${label} manifest is missing ${spec.id}`);
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
    console.log("Usage:\n  node tools/blender/cli.mjs [brief|generate|validate|determinism|list] (--asset ID | --family NAME | --all) [--no-publish] [--strict]\n  node tools/blender/cli.mjs test-builders");
    return;
  }
  if (args.strict && args.command !== "generate") {
    throw new Error("--strict is only supported by the generate command");
  }
  const { catalog, palette, specHash } = validateCatalog();
  if (args.command === "test-builders") {
    if (args.assets.length || args.families.length || args.all) throw new Error("test-builders does not accept asset selection");
    runBuilderTests(resolveBlender().blender);
    return;
  }
  const selected = selectAssets(catalog, args);
  if (args.command === "list") {
    for (const asset of selected) console.log(`${asset.id}\t${asset.family}\t${asset.file}`);
    return;
  }
  if (args.command === "brief") {
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
    useCache: args.command !== "determinism",
    ...generationInputs,
  };
  const first = await buildStage(context, selected, blenderInfo);
  assertGenerationInputsUnchanged(generationInputs, "during the first build");
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
  validateGeneratorParameters,
  validateAnimationContract,
  validateLodContract,
  validateReferenceAuthoring,
};

if (process.argv[1] && path.resolve(process.argv[1]) === CLI_PATH) {
  main().catch((error) => {
    console.error(`[NEVA ART] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
