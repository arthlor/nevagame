import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, weld } from "@gltf-transform/functions";
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
const PREVIEW_ROOT = path.join(ROOT, "generated/previews");
const MANIFEST_PATH = path.join(REPORT_DIR, "asset-manifest.json");
const QUALITY_REPORT_PATH = path.join(REPORT_DIR, "asset_budget_report.json");
const PUBLIC_MANIFEST_PATH = path.join(PUBLIC_DIR, "asset-manifest.json");

const readJson = (filename) => JSON.parse(fs.readFileSync(filename, "utf8"));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const safeFilename = (value) => path.basename(value) === value && value.endsWith(".glb");

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
  faceted_rock: { scale: tuple3(0.1, 8), profile: choice("inland", "coastal", "field"), clusterCount: integer(2, 3), fractureCount: integer(1, 8) },
  farmhouse: { width: number(3, 14), depth: number(3, 12), wallHeight: number(2, 7), roofPitchDeg: number(20, 55), foundationCourses: integer(2, 6), foundationBlocks: integer(6, 20), roofRows: integer(3, 10), roofColumns: integer(4, 12), porchPlanks: integer(6, 20), chimneyCourses: integer(3, 10) },
  lighthouse: { height: number(6, 24), baseRadius: number(1, 5), sides: integer(8, 16), masonryCourses: integer(8, 28), blocksPerCourse: integer(8, 16) },
  windmill: { height: number(4, 16), baseRadius: number(1, 5), sides: integer(8, 16), masonryCourses: integer(6, 18), blocksPerCourse: integer(8, 16), sailBattens: integer(3, 10) },
  stone_bridge: { length: number(5, 30), width: number(2, 8), archCount: integer(1, 4), deckSegments: integer(7, 30), cobbleLanes: integer(2, 8), abutmentCourses: integer(2, 8), voussoirBlocks: integer(7, 17), voussoirStartDeg: number(20, 45), voussoirEndDeg: number(135, 160) },
  working_dock: { length: number(3, 20), width: number(2, 10), planks: integer(8, 40), canopy: boolean(), surfaceBoards: integer(20, 100), underBeams: integer(4, 24), counterSlats: integer(6, 30) },
  fish_market: { width: number(3, 16), depth: number(3, 12), wallHeight: number(2, 7), roofPitchDeg: number(20, 55), foundationCourses: integer(2, 6), foundationBlocks: integer(6, 20), roofRows: integer(3, 10), roofColumns: integer(4, 12), counterSlats: integer(6, 30) },
  water_well: { radius: number(0.4, 2), height: number(1.5, 5), masonryCourses: integer(2, 8), blocksPerCourse: integer(8, 18), roofRows: integer(2, 8), roofColumns: integer(3, 10) },
  pumpkin_patch: { pumpkins: integer(3, 12), vineSegments: integer(3, 20), lobes: integer(3, 7), blossomCount: integer(2, 12) },
  lobster_trap: { ribs: integer(4, 14), length: number(0.5, 3), netColumns: integer(2, 8), netRows: integer(2, 8) },
  wood_crate: { size: number(0.3, 2), slats: integer(3, 9) },
  wood_barrel: { height: number(0.4, 2), radius: number(0.2, 1), staves: integer(8, 20) },
  wood_fence: { length: number(1, 8), posts: integer(2, 8), rails: integer(1, 4), railSegments: integer(3, 12) },
  hay_bale: { length: number(0.5, 3), radius: number(0.2, 1.5), bands: integer(1, 4), fiberBands: integer(6, 20) },
  lamp_post: { height: number(1.5, 8), armLength: number(0.2, 2) },
  rowboat: { length: number(2, 8), beam: number(1, 4), ribCount: integer(5, 16), innerPlanks: integer(5, 16), gunwaleSegments: integer(5, 16) },
  fishing_skiff: { length: number(4, 16), beam: number(1.5, 6), ribCount: integer(6, 20), mastHeight: number(3, 14), outerStrakes: integer(2, 7), hullSegments: integer(7, 18), deckBoards: integer(12, 50), sailRows: integer(4, 14) },
  wheat_crop: { stage: choice("seeded", "sprout", "growing", "mature", "overripe", "withered"), stalks: integer(0, 24) },
  stylized_fish: { species: choice("trout", "tuna"), length: number(0.4, 5), girth: number(0.1, 1.5), finScale: number(0.3, 2) },
  faceted_cloud: { clusters: integer(3, 12), width: number(2, 14) },
  coastal_worker: { height: number(1.5, 2.4), headRatio: number(5.5, 7), handScale: number(1, 1.3) },
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
  const args = { command: "generate", assets: [], families: [], all: false, publish: true, strict: false, stage: null };
  let index = 0;
  if (argv[0] && !argv[0].startsWith("-")) args.command = argv[index++];
  while (index < argv.length) {
    const flag = argv[index++];
    if (flag === "--asset") args.assets.push(argv[index++]);
    else if (flag === "--family") args.families.push(argv[index++]);
    else if (flag === "--all") args.all = true;
    else if (flag === "--no-publish") args.publish = false;
    else if (flag === "--strict") args.strict = true;
    else if (flag === "--stage") args.stage = argv[index++];
    else if (flag === "--help" || flag === "-h") args.command = "help";
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return args;
}

function selectAssets(catalog, args) {
  if (args.all || (!args.assets.length && !args.families.length)) return [...catalog.assets];
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
  const candidates = [];
  if (process.env.BLENDER_BIN) candidates.push(process.env.BLENDER_BIN);
  const which = spawnSync("which", ["blender"], { encoding: "utf8" });
  if (which.status === 0 && which.stdout.trim()) candidates.push(which.stdout.trim());
  candidates.push("/Applications/Blender.app/Contents/MacOS/Blender");
  const blender = candidates.find((candidate) => fs.existsSync(candidate));
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

function runBlender(blender, assets, stage) {
  const rawDir = path.join(stage, "raw");
  const report = path.join(stage, "blender-report.json");
  fs.mkdirSync(rawDir, { recursive: true });
  const command = [
    "--background", "--python", path.join(HERE, "bootstrap.py"), "--",
    "--catalog", CATALOG_PATH, "--output", rawDir, "--report", report,
  ];
  for (const asset of assets) command.push("--asset", asset.id);
  const result = spawnSync(blender, command, { cwd: ROOT, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Blender exited with status ${result.status}`);
  if (!fs.existsSync(report)) throw new Error("Blender did not emit its run report");
  return { rawDir, blenderReport: readJson(report) };
}

function runBuilderTests(blender) {
  const result = spawnSync(blender, ["--background", "--python-exit-code", "1", "--python", path.join(HERE, "test_authored_builders.py")], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Authored builder tests exited with status ${result.status}`);
}

function resolvePreviewSource(stageValue, assets) {
  if (!stageValue) return { name: "published", assetDir: PUBLIC_DIR, report: null };
  if (stageValue !== "latest" && (!/^run-[A-Za-z0-9_-]+$/.test(stageValue) || path.basename(stageValue) !== stageValue)) {
    throw new Error(`Unsafe preview stage: ${stageValue}`);
  }
  if (!fs.existsSync(STAGING_ROOT)) throw new Error("No staged asset runs are available for preview");
  const candidates = fs.readdirSync(STAGING_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^run-[A-Za-z0-9_-]+$/.test(entry.name))
    .map((entry) => ({ name: entry.name, directory: path.join(STAGING_ROOT, entry.name) }))
    .filter((entry) => stageValue === "latest" || entry.name === stageValue)
    .sort((left, right) => fs.statSync(right.directory).mtimeMs - fs.statSync(left.directory).mtimeMs);
  for (const candidate of candidates) {
    const assetDir = path.join(candidate.directory, "optimized");
    const reportPath = path.join(candidate.directory, "asset-report.json");
    if (!fs.existsSync(reportPath)) continue;
    if (!assets.every((asset) => fs.existsSync(path.join(assetDir, asset.file)))) continue;
    return { name: candidate.name, assetDir, report: readJson(reportPath) };
  }
  throw new Error(`${stageValue === "latest" ? "No staged run" : stageValue} contains the complete selected preview set`);
}

function renderPreview(blender, assets, stageValue, specHash) {
  const source = resolvePreviewSource(stageValue, assets);
  const outputDir = path.join(PREVIEW_ROOT, "candidates", source.name);
  const command = [
    "--background", "--python", path.join(HERE, "preview.py"), "--", "--output-dir", outputDir,
  ];
  for (const asset of assets) {
    const filename = path.join(source.assetDir, asset.file);
    if (!fs.existsSync(filename)) throw new Error(`${asset.id}: selected preview source is missing ${asset.file}`);
    command.push("--asset", filename, "--asset-id", asset.id, "--read-distance", String(asset.readDistanceMeters));
  }
  const result = spawnSync(blender, command, { cwd: ROOT, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Blender preview exited with status ${result.status}`);
  const reportAssets = source.report?.assets ?? [];
  const manifest = {
    version: 1,
    candidate: source.name,
    generatedAt: new Date().toISOString(),
    specHash: source.report?.specHash ?? specHash,
    staged: Boolean(stageValue),
    assets: assets.map((asset) => {
      const generated = reportAssets.find((entry) => entry.id === asset.id);
      return {
        id: asset.id,
        file: asset.file,
        readDistanceMeters: asset.readDistanceMeters,
        semanticHash: generated?.semanticHash ?? null,
        fileHash: generated?.fileHash ?? sha256(fs.readFileSync(path.join(source.assetDir, asset.file))),
      };
    }),
  };
  fs.writeFileSync(path.join(outputDir, "candidate-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[NEVA ART] Review package: ${outputDir}`);
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
  const nodeNames = new Set((json.nodes ?? []).map((node) => node.name));
  const missing = spec.requiredNodes.filter((name) => !nodeNames.has(name));
  if (missing.length) throw new Error(`${spec.id}: optimized GLB lost required nodes: ${missing.join(", ")}`);
  const meshTriangles = (json.meshes ?? []).map((mesh) => {
    let count = 0;
    for (const primitive of mesh.primitives ?? []) {
      const accessor = json.accessors?.[primitive.indices];
      if (primitive.mode === undefined || primitive.mode === 4) count += (accessor?.count ?? 0) / 3;
    }
    return count;
  });
  // Deduplication may make many authored nodes share one mesh. Count each node
  // instance so the budget reflects actual visible geometry, not mesh storage.
  const nodeMeshRefs = (json.nodes ?? []).flatMap((node) =>
    typeof node.mesh === "number" ? [node.mesh] : [],
  );
  const triangles = (nodeMeshRefs.length ? nodeMeshRefs : meshTriangles.map((_, index) => index))
    .reduce((sum, meshIndex) => sum + (meshTriangles[meshIndex] ?? 0), 0);
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
    materials,
    extensions: json.extensionsUsed ?? [],
    bytes: bytes.length,
    fileHash: sha256(bytes),
    semanticHash: semanticHash(bytes),
    qualityStatus: triangles >= spec.budget.trianglesTarget ? "on_target" : "below_target",
  };
}

async function optimizeAsset(source, destination) {
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
  const document = await io.read(source);
  await document.transform(
    dedup(),
    prune({ keepLeaves: true, keepAttributes: true, keepExtras: true }),
    weld(),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
  await io.write(destination, document);
}

async function buildStage(context, assets, blenderInfo) {
  const started = Date.now();
  const { rawDir, blenderReport } = runBlender(blenderInfo.blender, assets, context.stage);
  const optimizedDir = path.join(context.stage, "optimized");
  fs.mkdirSync(optimizedDir, { recursive: true });
  const results = [];
  for (const spec of assets) {
    const assetStarted = Date.now();
    const raw = path.join(rawDir, spec.file);
    const optimized = path.join(optimizedDir, spec.file);
    const rawValidation = await validateGlb(raw, spec, "raw");
    await optimizeAsset(raw, optimized);
    const final = await validateGlb(optimized, spec, "optimized");
    const blenderAsset = blenderReport.assets.find((entry) => entry.id === spec.id);
    results.push({
      id: spec.id,
      file: spec.file,
      family: spec.family,
      generator: spec.generator,
      seed: spec.seed,
      dimensions: blenderAsset?.dimensions,
      bounds: blenderAsset?.bounds,
      requiredNodes: spec.requiredNodes,
      collision: spec.collision,
      lod: spec.lod,
      readDistanceMeters: spec.readDistanceMeters,
      durationMs: Date.now() - assetStarted,
      budget: spec.budget,
      warnings:
        final.qualityStatus === "below_target"
          ? [`${final.triangles} triangles are below quality target ${spec.budget.trianglesTarget}`]
          : [],
      ...final,
      semanticHash: rawValidation.semanticHash,
    });
    console.log(`[NEVA ART] Validated ${spec.id}: ${final.triangles} tris, ${final.bytes} bytes`);
  }
  const summary = {
    assetCount: results.length,
    onTarget: results.filter((asset) => asset.qualityStatus === "on_target").length,
    belowTarget: results.filter((asset) => asset.qualityStatus === "below_target").length,
    triangles: results.reduce((sum, asset) => sum + asset.triangles, 0),
    productionMinimumTriangles: results.reduce((sum, asset) => sum + asset.budget.trianglesMin, 0),
    qualityTargetTriangles: results.reduce((sum, asset) => sum + asset.budget.trianglesTarget, 0),
    hardMaximumTriangles: results.reduce((sum, asset) => sum + asset.budget.trianglesMax, 0),
    fileSizeBytes: results.reduce((sum, asset) => sum + asset.bytes, 0),
  };
  return {
    report: {
      version: 1,
      generatedAt: new Date().toISOString(),
      specHash: context.specHash,
      paletteHash: sha256(fs.readFileSync(PALETTE_PATH)),
      blenderVersion: blenderInfo.version,
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
    `| ${asset.id} | ${asset.family} | ${asset.triangles} / ${asset.budget.trianglesTarget} | ${asset.qualityStatus} | ${asset.materials} | ${asset.bytes} | ${asset.fileHash.slice(0, 12)} |`,
  );
  return [
    "# Neva asset pipeline report", "",
    `- Blender: ${report.blenderVersion}`,
    `- Spec hash: \`${report.specHash}\``,
    `- Assets: ${report.assets.length}`,
    `- Download bytes: ${report.aggregateBytes}`,
    `- Quality: ${report.summary.onTarget} on target, ${report.summary.belowTarget} below target`, "",
    "| Asset | Family | Triangles / target | Status | Materials | Bytes | SHA-256 |",
    "| --- | --- | ---: | --- | ---: | ---: | --- |", ...rows, "",
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

function publishStage(report, optimizedDir, selected, catalog) {
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
  const manifest = { ...report, aggregateBytes: merged.reduce((sum, asset) => sum + asset.bytes, 0), assets: merged };
  const promotionDir = path.join(path.dirname(optimizedDir), "promotion");
  fs.mkdirSync(promotionDir, { recursive: true });
  const stagedManifest = path.join(promotionDir, "asset-manifest.json");
  const stagedMarkdown = path.join(promotionDir, "asset-report.md");
  fs.writeFileSync(stagedManifest, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(stagedMarkdown, markdownReport(manifest));
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
    if (!manifestAsset || manifestAsset.file !== spec.file || manifestAsset.fileHash !== result.fileHash || manifestAsset.bytes !== result.bytes || manifestAsset.triangles !== result.triangles || manifestAsset.materials !== result.materials) {
      throw new Error(`${spec.id}: published metrics do not match the manifest`);
    }
    reportAssets.push({ id: spec.id, ...result });
  }
  if (assets.length === catalog.assets.length && assets.length !== 35) {
    throw new Error(`Full manifest must contain 35 assets, found ${assets.length}`);
  }
  console.log(`[NEVA ART] Validated ${reportAssets.length} published assets (spec ${specHash.slice(0, 12)})`);
}

export function validatePublishedManifest(manifest, catalog, specHash, paletteHash, label = "published") {
  if (!manifest || typeof manifest !== "object" || manifest.specHash !== specHash || manifest.paletteHash !== paletteHash) {
    throw new Error(`${label} manifest does not match the current catalog or palette`);
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length !== catalog.assets.length) {
    throw new Error(`${label} manifest does not contain the complete catalog`);
  }
  const entries = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  for (const spec of catalog.assets) {
    const asset = entries.get(spec.id);
    if (!asset || asset.file !== spec.file || typeof asset.fileHash !== "string") {
      throw new Error(`${label} manifest is missing ${spec.id}`);
    }
  }
  return manifest;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "help") {
    console.log("Usage: node tools/blender/cli.mjs [generate|validate|determinism|preview|test-builders|list] [--asset ID] [--family NAME] [--all] [--no-publish] [--strict] [--stage latest|run-ID]");
    return;
  }
  if (args.strict && args.command !== "generate") {
    throw new Error("--strict is only supported by the generate command");
  }
  if (args.stage && args.command !== "preview") throw new Error("--stage is only supported by the preview command");
  const { catalog, specHash } = validateCatalog();
  const selected = selectAssets(catalog, args);
  if (args.command === "list") {
    for (const asset of selected) console.log(`${asset.id}\t${asset.family}\t${asset.file}`);
    return;
  }
  if (args.command === "validate") {
    await validatePublished(selected, catalog, specHash);
    return;
  }
  if (args.command === "preview") {
    renderPreview(resolveBlender().blender, selected, args.stage, specHash);
    return;
  }
  if (args.command === "test-builders") {
    if (args.assets.length || args.families.length || args.all) throw new Error("test-builders does not accept asset selection");
    runBuilderTests(resolveBlender().blender);
    return;
  }
  if (!new Set(["generate", "determinism"]).has(args.command)) throw new Error(`Unknown command: ${args.command}`);
  const blenderInfo = resolveBlender();
  const stage = makeStage();
  const context = { stage, specHash };
  const first = await buildStage(context, selected, blenderInfo);
  fs.writeFileSync(path.join(stage, "asset-report.json"), `${JSON.stringify(first.report, null, 2)}\n`);
  fs.writeFileSync(path.join(stage, "asset-report.md"), markdownReport(first.report));
  if (args.command === "generate") {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(QUALITY_REPORT_PATH, `${JSON.stringify({ ...first.report, strict: args.strict }, null, 2)}\n`);
  }
  if (args.strict && first.report.summary.belowTarget > 0) {
    throw new Error(
      `Strict quality gate rejected ${first.report.summary.belowTarget} below-target assets; see ${QUALITY_REPORT_PATH}`,
    );
  }
  if (args.command === "determinism") {
    const secondStage = makeStage();
    const second = await buildStage({ stage: secondStage, specHash }, selected, blenderInfo);
    for (const asset of first.report.assets) {
      const peer = second.report.assets.find((entry) => entry.id === asset.id);
      if (asset.semanticHash !== peer?.semanticHash) throw new Error(`${asset.id}: semantic determinism mismatch`);
    }
    console.log(`[NEVA ART] Semantic determinism passed for ${selected.length} assets`);
    return;
  }
  if (args.publish) {
    publishStage(first.report, first.optimizedDir, selected, catalog);
    console.log(`[NEVA ART] Published ${selected.length} validated assets`);
  } else {
    console.log(`[NEVA ART] Staged ${selected.length} assets at ${stage}; public assets unchanged`);
  }
}

export { parseArgs, promoteFilesAtomically, resolvePreviewSource, safeFilename, selectAssets, validateCatalog, validateGeneratorParameters };

if (process.argv[1] && path.resolve(process.argv[1]) === CLI_PATH) {
  main().catch((error) => {
    console.error(`[NEVA ART] ${error.stack ?? error.message}`);
    process.exitCode = 1;
  });
}
