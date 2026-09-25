/**
 * Neva art pipeline CLI (Node only).
 *
 * Every catalog asset has exactly one producer, decided by its `generator`:
 *
 * - **authored** — a registered Three.js generator in `tools/authored/generators/` (name listed in
 *   its `contracts.json`), built in Node by `tools/authored/pipeline/producer.mjs`;
 * - **authored_glb** — a committed source GLB under `art/` (`parameters.sourceGlb`): a Tripo or
 *   other provider download, a code-authored building exported by `tools/authored/export.mjs`, or an
 *   adapted derivative frozen when the Blender adapters were retired. `glb.mjs` repairs provider
 *   bounds/extensions and caps textures at `parameters.textureMaxSize`; geometry keeps its source
 *   compression, gets lossless Meshopt when skinned or animated, or the full static optimisation;
 * - **frozen** — a family whose Blender generator was retired (`legacy-generators.json`). Its
 *   published GLB is the record: it is validated and manifested but never rebuilt. Port the family
 *   to an authored generator (moving its name out of `legacy-generators.json`) to change it.
 *
 * Built assets share Khronos and contract validation, the per-asset cache, rollback-capable atomic
 * publication to `generated/glb/` and `public/assets/models/`, the published manifest and semantic
 * determinism. Nothing here invokes Blender or Python.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import { getBounds } from "@gltf-transform/functions";
import { validateBytes } from "gltf-validator";
import { MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";

import {
  ART_CACHE_VERSION,
  AUTHORED_GLB_GENERATOR,
  assetCachePlan,
  cleanCache,
  computeAssetInputHash,
  computeAssetToolchainHash,
  computeToolchainHash,
  readAssetCache as readAssetCacheModule,
  sha256,
  stableStringify,
  writeAssetCache,
} from "./cache.mjs";
import {
  authoredParameterContracts,
  authoredProducerVersion,
  authoredToolchainHash,
  isAuthoredGenerator,
  runAuthoredProducer,
} from "../authored/pipeline/producer.mjs";
import {
  compressImportedAsset,
  createNodeIO,
  ensureMeshoptReady,
  mayJoinStaticNode,
  optimizeAsset,
} from "./optimize.mjs";
import { largestEmbeddedImage, normalizeAuthoredGlb, parseGlb, TEXTURE_SIZES } from "./glb.mjs";
import { validateSurfaceContract } from "./surface_contract.mjs";

const CLI_PATH = fileURLToPath(import.meta.url);
const HERE = path.dirname(CLI_PATH);
const ROOT = path.resolve(HERE, "../..");
const CATALOG_PATH = path.join(ROOT, "assets/specs/asset-catalog.json");
const SCHEMA_PATH = path.join(ROOT, "assets/specs/asset-catalog.schema.json");
const PALETTE_PATH = path.join(ROOT, "art/palettes/neva.palette.json");
const SCENE_BUDGET_PATH = path.join(HERE, "asset_budgets.json");
const LEGACY_CONTRACTS_PATH = path.join(HERE, "legacy-generators.json");
const GENERATED_DIR = path.join(ROOT, "generated/glb");
const PUBLIC_DIR = path.join(ROOT, "public/assets/models");
const REPORT_DIR = path.join(ROOT, "generated/reports");
const STAGING_ROOT = path.join(ROOT, "generated/.staging");
const MANIFEST_PATH = path.join(REPORT_DIR, "asset-manifest.json");
const QUALITY_REPORT_PATH = path.join(REPORT_DIR, "asset_budget_report.json");
const PUBLIC_MANIFEST_PATH = path.join(PUBLIC_DIR, "asset-manifest.json");
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
/** Bumped when authored-GLB normalization or packaging changes what it emits. */
const AUTHORED_GLB_PRODUCER_VERSION = `authored-glb@1+sharp@${sharp.versions.sharp}+libwebp@${sharp.versions.webp}`;

const readJson = (filename) => JSON.parse(fs.readFileSync(filename, "utf8"));
const safeFilename = (value) => path.basename(value) === value && value.endsWith(".glb");

function paletteTokenForMaterial(material) {
  const token = material?.extras?.neva_palette_token ?? material?.name;
  return typeof token === "string" ? token : null;
}

function isTexturedMaterial(material) {
  return typeof material?.pbrMetallicRoughness?.baseColorTexture?.index === "number";
}

function readGenerationInputs(repoRoot = ROOT) {
  return {
    specHash: sha256(fs.readFileSync(path.join(repoRoot, "assets/specs/asset-catalog.json"))),
    paletteHash: sha256(fs.readFileSync(path.join(repoRoot, "art/palettes/neva.palette.json"))),
    toolchainHash: computeToolchainHash(repoRoot),
    authoredToolchainHash: authoredToolchainHash(repoRoot),
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

/**
 * Parameter contracts of the retired Blender families. Their assets are frozen: the recorded
 * parameters stay validated so a port can start from them, but nothing rebuilds these assets.
 */
const LEGACY_PARAMETER_CONTRACTS = Object.freeze(readJson(LEGACY_CONTRACTS_PATH));
const AUTHORED_GLB_PARAMETER_CONTRACT = Object.freeze({
  sourceGlb: { kind: "repositoryFile", extension: ".glb" },
  textureMaxSize: { kind: "choice", values: [...TEXTURE_SIZES] },
});
const AUTHORED_PARAMETER_CONTRACTS = Object.freeze(authoredParameterContracts(ROOT));

/** A generator name belongs to exactly one producer. */
function assertSingleProducerRegistration() {
  const owners = new Map();
  const register = (names, producer) => {
    for (const name of names) {
      const previous = owners.get(name);
      if (previous) throw new Error(`Generator ${name} is registered for both ${previous} and ${producer}`);
      owners.set(name, producer);
    }
  };
  register(Object.keys(LEGACY_PARAMETER_CONTRACTS), "frozen legacy");
  register(Object.keys(AUTHORED_PARAMETER_CONTRACTS), "authored");
  register([AUTHORED_GLB_GENERATOR], "authored GLB");
}
assertSingleProducerRegistration();

const PARAMETER_CONTRACTS = Object.freeze({
  ...LEGACY_PARAMETER_CONTRACTS,
  ...AUTHORED_PARAMETER_CONTRACTS,
  [AUTHORED_GLB_GENERATOR]: AUTHORED_GLB_PARAMETER_CONTRACT,
});

const PRIMARY_BINDING_GENERATORS = Object.freeze(
  new Set(["farmhouse", "lighthouse", "stone_bridge", "working_dock", "fish_market"]),
);

/** Which producer builds an asset: "authored", "authored_glb" or "frozen". */
function producerKind(asset, repoRoot = ROOT) {
  if (asset.generator === AUTHORED_GLB_GENERATOR) return "authored_glb";
  if (isAuthoredGenerator(asset.generator, repoRoot)) return "authored";
  if (Object.hasOwn(LEGACY_PARAMETER_CONTRACTS, asset.generator)) return "frozen";
  throw new Error(`${asset.id}: generator ${asset.generator} has no registered producer`);
}

function isFrozen(asset, repoRoot = ROOT) {
  return producerKind(asset, repoRoot) === "frozen";
}

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
        validateRepositorySourcePath(value, rule.extension, repoRoot);
        if (verifySourceFiles) resolveRepositorySource(value, rule.extension, repoRoot);
      }
    }
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

function productionRoute(asset) {
  const kind = producerKind(asset);
  if (kind === "authored") return `catalog -> ${asset.generator} (authored Three.js generator) -> validated GLB -> atomic runtime publication`;
  if (kind === "authored_glb") return `catalog -> ${asset.parameters.sourceGlb} (authored GLB source) -> validated GLB -> atomic runtime publication`;
  return `catalog -> frozen published GLB (retired ${asset.generator} generator; port it to tools/authored/generators to change the asset)`;
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
    `- Production route: ${productionRoute(asset)}`,
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
    "Direct runtime factories, local palettes, local lights, and direct public export are outside this contract.",
    "",
  ].join("\n");
}

/** A committed source path: repository-local, of the declared type, never a published destination. */
function validateRepositorySourcePath(source, extension, repoRoot = ROOT) {
  if (typeof source !== "string" || !source) throw new Error("A repository source path is required");
  const resolved = path.resolve(repoRoot, source);
  if (!resolved.startsWith(`${path.resolve(repoRoot)}${path.sep}`)) throw new Error("A source must remain inside the repository (including symlinks)");
  if (path.extname(resolved) !== extension) throw new Error(`A source must be a ${extension} file`);
  if (["public", "generated"].some((relative) => resolved.startsWith(`${path.resolve(repoRoot, relative)}${path.sep}`))) {
    throw new Error("A source cannot be a published, generated or runtime destination");
  }
  return resolved;
}

function resolveRepositorySource(source, extension, repoRoot = ROOT) {
  const resolved = validateRepositorySourcePath(source, extension, repoRoot);
  const root = fs.realpathSync(repoRoot);
  const real = fs.realpathSync(resolved);
  const inside = (filename, directory) => filename.startsWith(`${directory}${path.sep}`);
  if (!inside(resolved, path.resolve(repoRoot)) || !inside(real, root)) {
    throw new Error("A source must remain inside the repository (including symlinks)");
  }
  if (path.extname(real) !== extension || !fs.statSync(real).isFile()) {
    throw new Error(`A source must be a ${extension} file`);
  }
  for (const relative of ["public", "generated"]) {
    const directory = path.join(root, relative);
    const actualDirectory = fs.existsSync(directory) ? fs.realpathSync(directory) : directory;
    if (inside(resolved, path.join(path.resolve(repoRoot), relative)) || inside(real, actualDirectory)) {
      throw new Error("A source cannot be a published, generated or runtime destination");
    }
  }
  return real;
}

/** Licence and origin evidence for provider-derived assets; build-time only. */
function validateSourceProvenance(asset, repoRoot = ROOT, verifySourceFiles = true) {
  const provenance = asset.sourceProvenance;
  if (!provenance) return null;
  const schema = readJson(SCHEMA_PATH);
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema.$defs.sourceProvenance);
  if (!validate(provenance)) throw new Error(`${asset.id}: invalid sourceProvenance`);
  if (provenance.provider === "poly-pizza" && provenance.sourceUrl !== `https://poly.pizza/m/${provenance.modelId}`) {
    throw new Error(`${asset.id}: sourceProvenance modelId does not match sourceUrl`);
  }
  if (provenance.provider === "quaternius" && !/^https:\/\/quaternius\.com\/packs\/[a-z0-9]+\.html$/.test(provenance.sourceUrl)) {
    throw new Error(`${asset.id}: Quaternius provenance must identify the original pack page`);
  }
  // Tripo generations are private to the generating account, so there is no
  // public model page: the model ID is the provider's generation UUID and the
  // rights follow that account's plan under the provider terms.
  if ((provenance.provider === "tripo") !== (provenance.license === "Tripo-Terms")) {
    throw new Error(`${asset.id}: Tripo provenance and the Tripo-Terms license must be declared together`);
  }
  if (provenance.provider === "tripo" && (
    provenance.sourceUrl !== "https://www.tripo3d.ai/"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(provenance.modelId)
  )) {
    throw new Error(`${asset.id}: Tripo provenance must name the provider site and the generation UUID`);
  }
  const licenseUrl = {
    "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
    "CC-BY-3.0": "https://creativecommons.org/licenses/by/3.0/",
    "Tripo-Terms": "https://www.tripo3d.ai/terms",
  }[provenance.license];
  if (provenance.licenseUrl !== licenseUrl) throw new Error(`${asset.id}: sourceProvenance license URL mismatch`);
  const extension = path.extname(provenance.sourceFile);
  validateRepositorySourcePath(provenance.sourceFile, extension, repoRoot);
  if (!verifySourceFiles) return provenance;
  const source = resolveRepositorySource(provenance.sourceFile, extension, repoRoot);
  if (sha256(fs.readFileSync(source)) !== provenance.sourceSha256) {
    throw new Error(`${asset.id}: sourceProvenance sourceFile SHA-256 mismatch; update provenance only after verifying the source`);
  }
  if (provenance.sourceCapture) {
    const capture = resolveRepositorySource(provenance.sourceCapture, path.extname(provenance.sourceCapture), repoRoot);
    if (sha256(fs.readFileSync(capture)) !== provenance.sourceCaptureSha256) {
      throw new Error(`${asset.id}: sourceCapture SHA-256 mismatch`);
    }
    const captureReportPath = resolveRepositorySource(provenance.sourceCaptureReport, ".json", repoRoot);
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
    const licensePath = resolveRepositorySource(provenance.licenseEvidence, ".txt", repoRoot);
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
  // A selected, nonpublishing build does not read other assets' source files. Their schemas and
  // contracts still validate; publication and the default catalog check verify every source.
  const sourceIds = stagingSelection ? new Set(selectAssets(catalog, stagingSelection).map((asset) => asset.id)) : null;
  const textureCeiling = sceneBudgets.texturePolicy.rareSharedAtlasMax;

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
    producerKind(asset);
    const verifySources = !sourceIds || sourceIds.has(asset.id);
    validateGeneratorParameters(asset, ROOT, verifySources);
    if (asset.generator === AUTHORED_GLB_GENERATOR) {
      if (asset.surfaceAuthoring) {
        throw new Error(`${asset.id}: surfaceAuthoring is procedural-only; an authored GLB keeps its source normals and colors`);
      }
      if (asset.parameters.textureMaxSize > textureCeiling) {
        throw new Error(`${asset.id}: textureMaxSize exceeds the texture policy ceiling ${textureCeiling}`);
      }
    }
    validateLodContract(asset);
    validateAnimationContract(asset);
    validateReferenceAuthoring(asset);
    validateSourceProvenance(asset, ROOT, verifySources);
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
    useCache: true,
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
    else if (flag === "--all") args.all = true;
    else if (flag === "--no-publish") args.publish = false;
    else if (flag === "--strict") args.strict = true;
    else if (flag === "--no-cache" || flag === "--force") args.useCache = false;
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

async function semanticHash(bytes) {
  const { json, bin } = parseGlb(bytes);
  const binary = bin ?? Buffer.alloc(0);
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

/**
 * The published-file contract. Procedural assets (authored generators and frozen legacy families)
 * carry palette materials and semantic `COLOR_0` on every primitive. An authored GLB may instead
 * keep its source textures: a textured primitive needs `TEXCOORD_0` rather than `COLOR_0`, its
 * images must fit `textureMaxSize`, and double-sided materials are the source's decision.
 */
async function validateGlb(filename, spec, phase, repoRoot = ROOT) {
  const bytes = fs.readFileSync(filename);
  const authoredGlb = spec.generator === AUTHORED_GLB_GENERATOR;
  const animationClips = animationContractClips(spec);
  const { json, bin } = parseGlb(bytes);
  const inertSkinnedParents = skinnedMeshParentTransformsAreIdentity(json);
  const report = await validateBytes(new Uint8Array(bytes), {
    uri: spec.file,
    externalResourceFunction: async () => new Uint8Array(),
  });
  const errors = report.issues.messages.filter((issue) => issue.severity === 0);
  const warnings = report.issues.messages.filter((issue) => {
    if (issue.severity !== 1) return false;
    if (issue.code === "NODE_SKINNED_MESH_NON_ROOT" && inertSkinnedParents) return false;
    return true;
  });
  if (errors.length || warnings.length) {
    const details = [...errors, ...warnings].map((issue) => `${issue.code}: ${issue.message}`).join("\n");
    throw new Error(`${spec.id}: Khronos ${phase} validation failed\n${details}`);
  }
  const nodes = json.nodes ?? [];
  const nodeNames = new Set(nodes.map((node) => node.name));
  const missing = spec.requiredNodes.filter((name) => !nodeNames.has(name));
  if (missing.length) throw new Error(`${spec.id}: ${phase} GLB lost required nodes: ${missing.join(", ")}`);
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
  let texturedPrimitives = 0;
  let normalPrimitives = 0;
  // `COL_*` nodes are collision proxies: AssetLoader hides them and only the Art Yard draws them as a
  // wireframe. A mesh referenced only by such nodes never renders, so it is exempt from the colour
  // and material contract and from LOD ownership.
  const isCollisionNode = (node) => typeof node?.name === "string" && node.name.startsWith("COL_");
  const meshReferences = new Map();
  for (const node of nodes) {
    if (typeof node.mesh !== "number") continue;
    const references = meshReferences.get(node.mesh) ?? [];
    references.push(node);
    meshReferences.set(node.mesh, references);
  }
  const collisionOnlyMeshes = new Set(
    [...meshReferences].filter(([, references]) => references.every(isCollisionNode)).map(([mesh]) => mesh),
  );
  const meshTriangles = (json.meshes ?? []).map((mesh, meshIndex) => {
    let count = 0;
    for (const primitive of mesh.primitives ?? []) {
      if (collisionOnlyMeshes.has(meshIndex)) {
        if (typeof primitive.attributes?.POSITION !== "number") {
          throw new Error(`${spec.id}: ${phase} collision proxy primitive is missing POSITION`);
        }
        continue;
      }
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
        if (typeof primitive.material !== "number") {
          throw new Error(`${spec.id}: ${phase} triangle primitive is missing its palette material`);
        }
        const material = json.materials?.[primitive.material];
        if (authoredGlb && isTexturedMaterial(material)) {
          if (typeof primitive.attributes?.TEXCOORD_0 !== "number") {
            throw new Error(`${spec.id}: ${phase} textured material ${material.name ?? primitive.material} is missing TEXCOORD_0`);
          }
          texturedPrimitives += 1;
        } else {
          if (typeof primitive.attributes?.COLOR_0 !== "number") {
            throw new Error(`${spec.id}: ${phase} triangle primitive is missing semantic COLOR_0`);
          }
          if (authoredGlb && !spec.palette.includes(paletteTokenForMaterial(material))) {
            throw new Error(`${spec.id}: ${phase} untextured material ${material?.name ?? primitive.material} is not a declared palette token`);
          }
          vertexColorPrimitives += 1;
        }
        count += (accessor?.count ?? 0) / 3;
      }
    }
    return count;
  });
  if (!authoredGlb) {
    const doubleSided = (json.materials ?? []).filter((material) => material.doubleSided === true);
    if (doubleSided.length) {
      throw new Error(`${spec.id}: ${phase} GLB contains ${doubleSided.length} unnecessary double-sided materials`);
    }
  }
  if (authoredGlb) {
    const largest = await largestEmbeddedImage(json, bin, sharp);
    if (largest > spec.parameters.textureMaxSize) {
      throw new Error(`${spec.id}: ${phase} embeds a ${largest}px texture above its ${spec.parameters.textureMaxSize}px cap`);
    }
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
      if (typeof node.mesh !== "number" || isCollisionNode(node)) return;
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
    ...(authoredGlb ? { texturedPrimitives } : {}),
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
    ...(surfaceContract ? { surfaceContract } : {}),
  };
}

async function readAssetCache(plan, spec) {
  return readAssetCacheModule(plan, spec, validateGlb);
}

/** Rest-pose bounds in the producer report convention: X right, Y back (-glTF Z), Z up. */
function reportBounds(bounds) {
  return {
    min: [bounds.min[0], -bounds.max[2], bounds.min[1]],
    max: [bounds.max[0], -bounds.min[2], bounds.max[1]],
  };
}

/**
 * The authored-GLB producer: normalizes the committed source and writes the raw candidate. It
 * enforces the same structural admission rules the retired importer did (unique required nodes,
 * every mesh under the catalog root, catalog-compatible rest bounds and ground pivot).
 */
async function produceAuthoredGlb(spec, outputDir, repoRoot = ROOT) {
  const started = Date.now();
  const sourcePath = resolveRepositorySource(spec.parameters.sourceGlb, ".glb", repoRoot);
  const sourceBytes = fs.readFileSync(sourcePath);
  const { bytes, report } = await normalizeAuthoredGlb(sourceBytes, {
    textureMaxSize: spec.parameters.textureMaxSize,
    sharp,
    label: spec.id,
  });
  const { json } = parseGlb(bytes);
  for (const name of spec.requiredNodes) {
    if ((json.nodes ?? []).filter((node) => node.name === name).length !== 1) {
      throw new Error(`${spec.id}: authored GLB requires exactly one node ${name}`);
    }
  }
  await ensureMeshoptReady();
  const document = await createNodeIO().readBinary(new Uint8Array(bytes));
  const root = document.getRoot().listNodes().find((node) => node.getName() === spec.rootNode);
  const owned = new Set();
  root.traverse((node) => owned.add(node));
  if (document.getRoot().listNodes().some((node) => node.getMesh() && !owned.has(node))) {
    throw new Error(`${spec.id}: authored GLB contains meshes outside the catalog root ${spec.rootNode}`);
  }
  // These are exported rest-geometry bounds, not proof of posed deformation.
  const bounds = getBounds(root);
  const dimensions = [bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2], bounds.max[1] - bounds.min[1]];
  const expected = [spec.dimensions.width, spec.dimensions.depth, spec.dimensions.height];
  for (let axis = 0; axis < 3; axis++) {
    if (!Number.isFinite(dimensions[axis]) || dimensions[axis] < expected[axis] * 0.25 || dimensions[axis] > expected[axis] * 1.35) {
      throw new Error(
        `${spec.id}: authored GLB rest bounds ${dimensions.map((value) => value.toFixed(3)).join(" x ")} m ` +
        "are incompatible with the catalog dimensions",
      );
    }
  }
  // A ground pivot puts the ground plane at y = 0. Authored foundations may sink below it to seat a
  // building on uneven terrain (at most a tenth of the asset's height), and a model whose ground
  // sheet was deliberately removed may start slightly above it (at most a twentieth); a centred or
  // top-origin pivot fails either bound.
  const allowedSink = Math.max(0.12, spec.dimensions.height * 0.1);
  const allowedLift = Math.max(0.18, spec.dimensions.height * 0.05);
  if (spec.pivot === "ground_center" && (bounds.min[1] < -allowedSink || bounds.min[1] > allowedLift)) {
    throw new Error(`${spec.id}: authored GLB ground pivot is invalid (lowest point ${bounds.min[1].toFixed(3)} m)`);
  }
  const paletteTokensUsed = [...new Set((json.materials ?? [])
    .map(paletteTokenForMaterial)
    .filter((token) => spec.palette.includes(token)))].sort();
  fs.writeFileSync(path.join(outputDir, spec.file), bytes);
  console.info(
    `[NEVA ART] Authored GLB ${spec.id} from ${spec.parameters.sourceGlb} ` +
    `(${report.preservedSourceBytes ? "source bytes preserved" : "normalized"}, ${bytes.length} bytes)`,
  );
  return {
    id: spec.id,
    file: spec.file,
    producer: "authored_glb",
    artContractStatus: "passed",
    dimensions,
    bounds: reportBounds(bounds),
    paletteTokensUsed,
    vertexColorLoops: null,
    vertexColorSpace: "linear-srgb",
    source: {
      file: spec.parameters.sourceGlb,
      sha256: sha256(sourceBytes),
      bytes: sourceBytes.length,
      preservedSourceBytes: report.preservedSourceBytes,
      repairedBounds: report.repairedBounds.length,
      removedMaterialExtensions: report.removedMaterialExtensions,
      textures: report.textures,
    },
    durationMs: Date.now() - started,
  };
}

/**
 * Packages a normalized authored GLB. A source that already carries Meshopt compression keeps its
 * geometry bytes; a skinned or animated source gets lossless Meshopt with decoded parity; a static
 * source gets the full dedupe/prune/weld/quantize/Meshopt optimisation.
 */
async function packageAuthoredGlb(raw, optimized, spec) {
  const { json } = parseGlb(fs.readFileSync(raw));
  if ((json.extensionsUsed ?? []).includes("EXT_meshopt_compression")) {
    copyAtomically(raw, optimized);
    return "source-compression";
  }
  if (json.skins?.length || json.animations?.length) {
    await compressImportedAsset(raw, optimized);
    return "lossless-compression";
  }
  await optimizeAsset(raw, optimized, spec);
  return "static-optimization";
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

function producerVersionFor(asset, authoredVersion) {
  const kind = producerKind(asset);
  if (kind === "authored") return authoredVersion;
  if (kind === "authored_glb") return AUTHORED_GLB_PRODUCER_VERSION;
  throw new Error(`${asset.id}: frozen legacy assets are validated, never built`);
}

/**
 * Builds the selected buildable assets into a staging run. Cache misses are produced by the
 * authored generator producer or the authored-GLB producer into the same raw/ directory;
 * everything after that point is shared.
 */
async function buildStage(context, assets) {
  const started = Date.now();
  const authoredVersion = authoredProducerVersion(ROOT);
  const producerVersion = (asset) => producerVersionFor(asset, authoredVersion);
  const plans = new Map(assets.map((asset) => [asset.id, assetCachePlan(asset, context, { version: producerVersion(asset) })]));
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
  const authoredMisses = misses.filter((spec) => producerKind(spec) === "authored");
  const authoredGlbMisses = misses.filter((spec) => producerKind(spec) === "authored_glb");
  const producedAssets = [];
  if (authoredMisses.length) {
    const authoredReport = await runAuthoredProducer({ specs: authoredMisses, outputDir: rawDir, repoRoot: ROOT });
    producedAssets.push(...authoredReport.assets);
  }
  for (const spec of authoredGlbMisses) producedAssets.push(await produceAuthoredGlb(spec, rawDir, ROOT));
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
    const packaging = spec.generator === AUTHORED_GLB_GENERATOR
      ? await packageAuthoredGlb(raw, optimized, spec)
      : (await optimizeAsset(raw, optimized, spec), "static-optimization");
    const final = await validateGlb(optimized, spec, "optimized");
    if (packaging !== "static-optimization" && final.semanticHash !== rawValidation.semanticHash) {
      throw new Error(`${spec.id}: ${packaging} changed decoded semantics`);
    }
    const producedAsset = producedAssets.find((entry) => entry.id === spec.id);
    if (!producedAsset || producedAsset.artContractStatus !== "passed") {
      throw new Error(`${spec.id}: its producer did not report a passing semantic art contract`);
    }
    results.push({
      id: spec.id,
      file: spec.file,
      family: spec.family,
      generator: spec.generator,
      producer: producerKind(spec),
      seed: spec.seed,
      dimensions: producedAsset.dimensions,
      bounds: producedAsset.bounds,
      paletteTokensUsed: producedAsset.paletteTokensUsed,
      vertexColorLoops: producedAsset.vertexColorLoops,
      vertexColorSpace: producedAsset.vertexColorSpace,
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
      packaging,
      ...(producedAsset.source ? { source: producedAsset.source } : {}),
      compression: final.extensions.filter((extension) => extension === "EXT_meshopt_compression" || extension === "KHR_draco_mesh_compression"),
    });
    const result = results[results.length - 1];
    try {
      writeAssetCache(plan, result, optimized, producerVersion(spec));
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
      version: 3,
      generatedAt: new Date().toISOString(),
      specHash: context.specHash,
      paletteHash: context.paletteHash,
      toolchainHash: context.toolchainHash,
      authoredProducerVersion: authoredVersion,
      authoredGlbProducerVersion: AUTHORED_GLB_PRODUCER_VERSION,
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
    `| ${asset.id} | ${asset.family} | ${asset.producer ?? "-"} | ${asset.referenceAuthoring?.status ?? "catalog-only"} | ${asset.triangles} / ${asset.packagedTriangles ?? asset.triangles} / ${asset.budget.trianglesTarget} | ${asset.qualityStatus} | ${asset.materials} | ${asset.bytes} | ${asset.fileHash.slice(0, 12)} |`,
  );
  const publication = {
    published: "published atomically to generated/glb and public/assets/models",
    "pending-publication": "validated staging candidate; atomic publication pending",
    "staged-only": "validated staging candidate; public assets unchanged",
    determinism: "determinism-only staging candidates; public assets unchanged",
  }[report.publication] ?? "state unavailable; consult the invoking command output";
  return [
    "# Neva asset pipeline report", "",
    `- Producers: ${report.authoredProducerVersion ?? "n/a"}; ${report.authoredGlbProducerVersion ?? "n/a"}`,
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
    "| Asset | Family | Producer | Reference brief | LOD0 / packaged / target tris | Density status | Materials | Bytes | SHA-256 |",
    "| --- | --- | --- | --- | ---: | --- | ---: | ---: | --- |", ...rows, "",
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
  // The tracked public manifest is the merge base: `generated/` is absent from a fresh checkout, and
  // merging a selected publish into an empty base would drop every unselected asset.
  const publicManifestPath = path.join(publicDir, "asset-manifest.json");
  const previousPath = [publicManifestPath, manifestPath].find((candidate) => fs.existsSync(candidate));
  const previous = previousPath ? readJson(previousPath) : { assets: [] };
  if (!previousPath && selected.length !== catalog.assets.length) {
    throw new Error("No published manifest exists; publish the complete catalog before a selected publish");
  }
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

/**
 * The runtime copy under `public/assets/models/` is authoritative and tracked; `generated/glb/` is
 * an untracked mirror. When the mirror exists it must match. Validation never writes either copy.
 */
function publishedFile(spec) {
  const published = path.join(PUBLIC_DIR, spec.file);
  const generated = path.join(GENERATED_DIR, spec.file);
  if (!fs.existsSync(published)) throw new Error(`${spec.id}: published file is missing`);
  if (fs.existsSync(generated) && sha256(fs.readFileSync(generated)) !== sha256(fs.readFileSync(published))) {
    throw new Error(`${spec.id}: generated/public copies differ`);
  }
  return published;
}

async function validatePublished(assets, catalog, specHash) {
  const paletteHash = sha256(fs.readFileSync(PALETTE_PATH));
  const generatedManifest = fs.existsSync(MANIFEST_PATH) ? readJson(MANIFEST_PATH) : readJson(PUBLIC_MANIFEST_PATH);
  const publicManifest = readJson(PUBLIC_MANIFEST_PATH);
  validatePublishedManifest(generatedManifest, catalog, specHash, paletteHash, "generated", assets);
  validatePublishedManifest(publicManifest, catalog, specHash, paletteHash, "public", assets);
  if (JSON.stringify(generatedManifest) !== JSON.stringify(publicManifest)) {
    throw new Error("Generated and public asset manifests differ");
  }
  let validated = 0;
  for (const spec of assets) {
    const published = publishedFile(spec);
    const result = await validateGlb(published, spec, "published");
    const manifestAsset = publicManifest.assets.find((asset) => asset.id === spec.id);
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
    validated += 1;
  }
  console.log(`[NEVA ART] Validated ${validated} published assets (spec ${specHash.slice(0, 12)})`);
}

async function syncPublishedManifest(catalog, specHash) {
  const paletteHash = sha256(fs.readFileSync(PALETTE_PATH));
  const previous = fs.existsSync(PUBLIC_MANIFEST_PATH) ? readJson(PUBLIC_MANIFEST_PATH) : { assets: [] };
  const previousById = new Map((previous.assets ?? []).map((asset) => [asset.id, asset]));
  const assets = [];
  for (const spec of catalog.assets) {
    const published = publishedFile(spec);
    const result = await validateGlb(published, spec, "published-sync");
    const previousAsset = previousById.get(spec.id);
    if (!previousAsset) {
      throw new Error(`${spec.id}: no manifest entry to sync; publish it with art:generate first`);
    }
    assets.push({
      ...previousAsset,
      ...result,
      id: spec.id,
      file: spec.file,
      family: spec.family,
      generator: spec.generator,
      producer: producerKind(spec),
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
    version: 3,
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
  delete manifest.blenderVersion;
  // Sync only revalidates what is published. When that changes nothing, keep
  // the published timestamp so a no-op run leaves the tracked manifests alone.
  const undated = (value) => JSON.stringify({ ...value, generatedAt: null });
  if (previous.generatedAt && undated(manifest) === undated(previous)) {
    manifest.generatedAt = previous.generatedAt;
  }
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
    throw new Error(`${label} manifest does not match the current catalog, palette, or toolchain; run art:sync -- --all after an intended change`);
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

/** Splits a build selection into buildable assets and frozen legacy assets. */
function buildableSelection(selected, args) {
  const frozen = selected.filter((asset) => isFrozen(asset));
  const named = frozen.filter((asset) => args.assets.includes(asset.id));
  if (named.length) {
    throw new Error(
      `Frozen legacy asset(s) cannot be rebuilt: ${named.map((asset) => `${asset.id} (${asset.generator})`).join(", ")}. ` +
      "Their Blender generators were retired; port the family to tools/authored/generators, or replace the asset " +
      "with an authored_glb source, then generate it.",
    );
  }
  if (frozen.length) {
    console.log(`[NEVA ART] Skipping ${frozen.length} frozen legacy asset(s); art:validate still checks them`);
  }
  return selected.filter((asset) => !isFrozen(asset));
}

const HELP = `Usage:
  node tools/art/cli.mjs <command> (--asset ID | --family NAME | --all) [options]

Commands:
  generate      build, validate, optimise and atomically publish (default)
  determinism   build twice without publishing and compare semantic hashes
  validate      revalidate published GLBs against the catalog and manifest
  sync          revalidate every published GLB and refresh the manifest (--all)
  brief         print the selected reference-authoring briefs
  list          print id, family, producer and file for the selection

Options:
  --no-publish  stage and validate without changing public assets
  --strict      reject below-target triangle density (generate only)
  --no-cache    rebuild cache hits (alias --force)`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "help") {
    console.log(HELP);
    return;
  }
  if (args.strict && args.command !== "generate") {
    throw new Error("--strict is only supported by the generate command");
  }
  const offlineStaging = args.command === "determinism" || (args.command === "generate" && !args.publish);
  const { catalog, palette, specHash } = validateCatalog(offlineStaging ? args : null);
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
  if (args.command === "list") {
    for (const asset of selected) console.log(`${asset.id}\t${asset.family}\t${producerKind(asset)}\t${asset.file}`);
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
  const buildable = buildableSelection(selected, args);
  if (!buildable.length) {
    console.log("[NEVA ART] Nothing to build in this selection");
    return;
  }
  if (args.strict) {
    const draftBriefs = buildable.filter((asset) => asset.referenceAuthoring?.status === "draft");
    if (draftBriefs.length) {
      throw new Error(`Strict generation rejected draft reference briefs: ${draftBriefs.map((asset) => asset.id).join(", ")}`);
    }
  }
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
    ...generationInputs,
  };
  const first = await buildStage(context, buildable);
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
      ...generationInputs,
    }, buildable);
    assertGenerationInputsUnchanged(generationInputs, "during the determinism build");
    for (const asset of first.report.assets) {
      const peer = second.report.assets.find((entry) => entry.id === asset.id);
      if (asset.semanticHash !== peer?.semanticHash) throw new Error(`${asset.id}: semantic determinism mismatch`);
    }
    console.log(`[NEVA ART] Semantic determinism passed for ${buildable.length} assets`);
    const retention = pruneStagingRuns(STAGING_ROOT, STAGING_RUN_RETENTION, [stage, secondStage]);
    if (retention.removed.length) console.log(`[NEVA ART] Pruned ${retention.removed.length} older staging runs`);
    return;
  }
  if (args.publish) {
    publishStage(first.report, first.optimizedDir, buildable, catalog, args.strict);
    console.log(`[NEVA ART] Published ${buildable.length} validated assets`);
    const firstAsset = buildable[0];
    const suffix = buildable.length > 1 ? ` (+${buildable.length - 1} more selected)` : "";
    console.log(`[NEVA ART] Art Yard: ${artYardUrl(firstAsset.id)}${suffix}`);
  } else {
    console.log(`[NEVA ART] Staged ${buildable.length} assets at ${stage}; public assets unchanged`);
  }
  const retention = pruneStagingRuns(STAGING_ROOT, STAGING_RUN_RETENTION, [stage]);
  if (retention.removed.length) console.log(`[NEVA ART] Pruned ${retention.removed.length} older staging runs`);
}

export {
  ART_CACHE_VERSION,
  AUTHORED_GLB_GENERATOR,
  artYardUrl,
  cleanCache,
  computeAssetInputHash,
  computeAssetToolchainHash,
  computeToolchainHash,
  mayJoinStaticNode,
  optimizeAsset,
  packageAuthoredGlb,
  parseArgs,
  produceAuthoredGlb,
  producerKind,
  promoteFilesAtomically,
  pruneStagingRuns,
  referenceAuthoringSummary,
  referenceBriefHash,
  referenceBriefMarkdown,
  resolveRepositorySource,
  safeFilename,
  selectAssets,
  semanticHash,
  stableStringify,
  validateAnimationContract,
  validateCatalog,
  validateGeneratorParameters,
  validateGlb,
  validateLodContract,
  validateReferenceAuthoring,
  validateSourceProvenance,
};

if (process.argv[1] && path.resolve(process.argv[1]) === CLI_PATH) {
  main().catch((error) => {
    console.error(`[NEVA ART] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
