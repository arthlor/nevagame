import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const ROOT = process.cwd();
const VITE = path.join(ROOT, "node_modules/.bin/vite");
const VITE_NODE = path.join(ROOT, "node_modules/.bin/vite-node");
const TSC = path.join(ROOT, "node_modules/.bin/tsc");
const NEVA_PRESERVATION = JSON.parse(
  fs.readFileSync(path.join(ROOT, "tools/world/neva-layout9-preservation.json"), "utf8")
);
const SCENES = [
  "bridge_river",
  "starter_farm",
  "harbor_market",
  "lighthouse_coast",
  "sunreach_departure",
  "sunreach_cove",
  "sunreach_terraces",
  "sunreach_ridge",
  "sunreach_reef"
];
const OVERLAYS = {
  bridge_river: ["river-profile", "wetness", "erosion-deposition", "fishing-access"],
  starter_farm: ["district", "habitat", "route", "density", "opening"],
  harbor_market: ["district", "route", "density"],
  lighthouse_coast: ["habitat", "density", "opening"],
  sunreach_departure: ["island", "marine", "climate"],
  sunreach_cove: ["island", "marine", "route", "habitat"],
  sunreach_terraces: ["climate", "drainage", "route", "density"],
  sunreach_ridge: ["climate", "drainage", "island"],
  sunreach_reef: ["marine", "habitat", "island"]
};
const args = new Set(process.argv.slice(2));
const laneArgIndex = process.argv.indexOf("--lane");
const requestedLane = laneArgIndex >= 0 ? process.argv[laneArgIndex + 1] : "both";
if (!["software", "hardware", "both"].includes(requestedLane)) {
  throw new Error(`[world:acceptance] Invalid --lane ${requestedLane}`);
}

function filesBelow(relativeRoot) {
  const absoluteRoot = path.join(ROOT, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];
  const stat = fs.statSync(absoluteRoot);
  if (stat.isFile()) return [relativeRoot];
  const files = [];
  for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const child = path.posix.join(relativeRoot.replaceAll(path.sep, "/"), entry.name);
    if (entry.isDirectory()) files.push(...filesBelow(child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

function inputManifest() {
  const roots = [
    "src",
    "public",
    "assets/specs",
    "art/palettes",
    "tools/world",
    "tools/blender/asset_budgets.json",
    "index.html",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "vite.config.ts",
    "playwright.config.ts"
  ];
  const files = [...new Set(roots.flatMap(filesBelow))].sort();
  return files.map((relativePath) => {
    const content = fs.readFileSync(path.join(ROOT, relativePath));
    return {
      path: relativePath,
      bytes: content.byteLength,
      sha256: createHash("sha256").update(content).digest("hex")
    };
  });
}

function manifestDigest(manifest) {
  const hash = createHash("sha256");
  for (const entry of manifest) hash.update(`${entry.path}\0${entry.bytes}\0${entry.sha256}\n`);
  return hash.digest("hex");
}

function writeJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filename);
}

function checked(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit"
  });
  if (result.status !== 0) {
    const detail = options.capture ? `\n${result.stdout ?? ""}\n${result.stderr ?? ""}` : "";
    throw new Error(`[world:acceptance] Failed: ${command} ${commandArgs.join(" ")}${detail}`);
  }
  return options.capture ? String(result.stdout).trim() : "";
}

function captured(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`[world:acceptance] Failed: ${command} ${commandArgs.join(" ")}\n${stdout}\n${stderr}`));
    });
  });
}

async function runCompositionAudit() {
  const shardSize = 8;
  const groups = [];
  for (let first = 0; first < 64; first += shardSize) {
    groups.push(Array.from({ length: shardSize }, (_, offset) => first + offset));
  }
  const shards = new Array(groups.length);
  let nextGroup = 0;
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (nextGroup < groups.length) {
      const groupIndex = nextGroup++;
      const seeds = groups[groupIndex];
      shards[groupIndex] = JSON.parse(await captured(
        VITE_NODE,
        [
          "--script",
          "tools/world/run-composition-audit-shard.ts",
          "--seeds",
          seeds.join(","),
          ...(seeds.includes(42) ? ["--repeat42"] : [])
        ]
      ));
    }
  }));
  const audits = shards.flatMap((shard) => shard.seeds).sort((left, right) => left.seed - right.seed);
  const strongest = audits.reduce((current, candidate) =>
    Math.max(candidate.periodic22Ratio, candidate.periodic555Ratio)
      > Math.max(current.periodic22Ratio, current.periodic555Ratio)
      ? candidate
      : current);
  const weakest = audits.reduce((current, candidate) =>
    candidate.districtDensityCv < current.districtDensityCv ? candidate : current);
  const repeatedSeed42Hash = shards.find((shard) => shard.repeatedSeed42Hash)?.repeatedSeed42Hash;
  if (!repeatedSeed42Hash) throw new Error("[world:acceptance] Missing repeated seed-42 evidence");
  return {
    seeds: audits,
    strongestPeriodicSeed: strongest.seed,
    weakestDistrictContrastSeed: weakest.seed,
    repeatedSeed42Hash
  };
}

async function runSunreachCompositionAudit() {
  const shardSize = 8;
  const groups = [];
  for (let first = 0; first < 64; first += shardSize) {
    groups.push(Array.from({ length: shardSize }, (_, offset) => first + offset));
  }
  const shards = new Array(groups.length);
  let nextGroup = 0;
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (nextGroup < groups.length) {
      const groupIndex = nextGroup++;
      const seeds = groups[groupIndex];
      shards[groupIndex] = JSON.parse(await captured(
        VITE_NODE,
        [
          "--script",
          "tools/world/run-sunreach-composition-audit-shard.ts",
          "--seeds",
          seeds.join(","),
          ...(seeds.includes(42) ? ["--repeat42"] : [])
        ]
      ));
    }
  }));
  const audits = shards.flatMap((shard) => shard.seeds).sort((left, right) => left.seed - right.seed);
  const strongest = audits.reduce((current, candidate) =>
    candidate.periodic22Ratio > current.periodic22Ratio ? candidate : current);
  const weakest = audits.reduce((current, candidate) =>
    candidate.districtDensityCv < current.districtDensityCv ? candidate : current);
  const repeatedSeed42Hash = shards.find((shard) => shard.repeatedSeed42Hash)?.repeatedSeed42Hash;
  if (!repeatedSeed42Hash) throw new Error("[world:acceptance] Missing repeated Sunreach seed-42 evidence");
  return {
    seeds: audits,
    strongestPeriodicSeed: strongest.seed,
    weakestDistrictContrastSeed: weakest.seed,
    repeatedSeed42Hash
  };
}

function validateCompositionAudit(audit) {
  const failures = [];
  for (const seed of audit.seeds) {
    const frozenHash = NEVA_PRESERVATION.compositionPlacementHashes[String(seed.seed)];
    if (seed.placementHash !== frozenHash) {
      failures.push(`seed ${seed.seed}: Neva placement ${seed.placementHash} != ${frozenHash}`);
    }
    if (seed.periodic22Ratio >= 1.35) failures.push(`seed ${seed.seed}: 22m ratio ${seed.periodic22Ratio}`);
    if (seed.periodic555Ratio >= 1.35) failures.push(`seed ${seed.seed}: 5.55m ratio ${seed.periodic555Ratio}`);
    if (seed.districtDensityCv < 0.12 || !seed.districtOrderingPass) failures.push(`seed ${seed.seed}: district rhythm`);
    if (!seed.largeOpenings.some((opening) => opening.containsFarm && opening.areaSquareMeters >= 900)) {
      failures.push(`seed ${seed.seed}: farm opening`);
    }
    if (!seed.largeOpenings.some((opening) => opening.containsHeadland && opening.areaSquareMeters >= 900)) {
      failures.push(`seed ${seed.seed}: headland opening`);
    }
    if (seed.isolateRatio < 0.03 || seed.isolateRatio > 0.12) failures.push(`seed ${seed.seed}: isolate ratio`);
    if (seed.fishingAccessComponentCount < 3) failures.push(`seed ${seed.seed}: fishing access components`);
    if (!seed.fishingAccessClearancePass) failures.push(`seed ${seed.seed}: fishing access vegetation clearance`);
    if (!seed.routePass) failures.push(`seed ${seed.seed}: ${seed.routeFailures.join(",")}`);
    for (const role of ["core", "edge", "isolate", "landmark"]) {
      if ((seed.roles[role] ?? 0) === 0) failures.push(`seed ${seed.seed}: missing ${role}`);
    }
  }
  if (audit.repeatedSeed42Hash[0] !== audit.repeatedSeed42Hash[1]) failures.push("seed 42 is not deterministic");
  if (failures.length > 0) throw new Error(`[world:acceptance] Composition gate failed:\n${failures.join("\n")}`);
}

function validateSunreachCompositionAudit(audit) {
  const failures = [];
  for (const seed of audit.seeds) {
    if (seed.placementCount !== 148) failures.push(`seed ${seed.seed}: ${seed.placementCount}/148 placements`);
    if (seed.categoryCounts.tree !== 48 || seed.categoryCounts.bush !== 62 || seed.categoryCounts.rock !== 38) {
      failures.push(`seed ${seed.seed}: category counts ${JSON.stringify(seed.categoryCounts)}`);
    }
    if (seed.periodic22Ratio >= 1.35) failures.push(`seed ${seed.seed}: 22m ratio ${seed.periodic22Ratio}`);
    if (seed.districtDensityCv < 0.6) failures.push(`seed ${seed.seed}: district rhythm ${seed.districtDensityCv}`);
    if (!seed.openingPass) failures.push(`seed ${seed.seed}: required openings`);
    if (!seed.islandQualificationPass) failures.push(`seed ${seed.seed}: island-qualified identity`);
    if (!seed.routeClearancePass) failures.push(`seed ${seed.seed}: route clearance`);
    if (!seed.drainageCouplingPass) failures.push(`seed ${seed.seed}: drainage coupling`);
    for (const role of ["core", "edge", "isolate", "route-frame"]) {
      if ((seed.roles[role] ?? 0) === 0) failures.push(`seed ${seed.seed}: missing ${role}`);
    }
  }
  if (audit.repeatedSeed42Hash[0] !== audit.repeatedSeed42Hash[1]) {
    failures.push("Sunreach seed 42 is not deterministic");
  }
  if (failures.length > 0) {
    throw new Error(`[world:acceptance] Sunreach composition gate failed:\n${failures.join("\n")}`);
  }
}

async function runNevaPreservationAudit() {
  const current = JSON.parse(await captured(
    VITE_NODE,
    ["--script", "tools/world/run-neva-preservation-audit.ts"]
  ));
  const failures = ["terrainWaterHash", "routeHash", "landmarkHash", "sampleCount"]
    .filter((key) => current[key] !== NEVA_PRESERVATION[key])
    .map((key) => `${key}: ${current[key]} != ${NEVA_PRESERVATION[key]}`);
  if (failures.length > 0) {
    throw new Error(`[world:acceptance] Neva preservation gate failed:\n${failures.join("\n")}`);
  }
  return { frozen: NEVA_PRESERVATION, current };
}

async function reservePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForPreview(url, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`[world:acceptance] Preview exited with ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("[world:acceptance] Timed out waiting for static preview");
}

function captureContentSignature(diagnostics) {
  return {
    meshes: diagnostics.world.meshes,
    batched: diagnostics.world.batched,
    instances: diagnostics.world.instances,
    casters: diagnostics.world.casters,
    qualityTier: diagnostics.world.qualityTier,
    worldAssetCount: diagnostics.sceneIdentity.worldAssetCount
  };
}

async function settleFrames(page, count = 24) {
  const timeoutMilliseconds = Math.max(30_000, count * 2_500);
  let timeout;
  try {
    await Promise.race([
      page.evaluate(async (frames) => {
        for (let index = 0; index < frames; index++) {
          await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
        }
      }, count),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`[world:acceptance] Timed out while settling ${count} render frames`)),
          timeoutMilliseconds
        );
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function screenshot(page, filename) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  await page.screenshot({ path: filename, animations: "disabled" });
}

async function captureScene(page, baseUrl, output, seed, scene) {
  process.stdout.write(`[world:acceptance] capture ${seed}/${scene}\n`);
  const query = new URLSearchParams({
    worldAcceptance: "1",
    goldTest: scene,
    seed: String(seed),
    artMinute: "720",
    artWeather: "clear",
    artTimeSeconds: "0"
  });
  await page.goto(`${baseUrl}/?${query}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(
    () => window.__NEVA_RENDER_READY === true && Boolean(window.__NEVA_DEBUG),
    undefined,
    { timeout: 180_000 }
  );
  await settleFrames(page, 24);
  const sceneOutput = path.join(output, `seed-${seed}`, scene);
  await screenshot(page, path.join(sceneOutput, "gameplay-final.png"));
  const normal = await page.evaluate(() => window.__NEVA_DEBUG.renderDiagnostics());

  await page.evaluate(() => window.__NEVA_DEBUG.setWorldOnly(true));
  await settleFrames(page, 8);
  await screenshot(page, path.join(sceneOutput, "world-final.png"));
  const final = await page.evaluate(() => window.__NEVA_DEBUG.renderDiagnostics());

  await page.evaluate(() => window.__NEVA_DEBUG.setCaptureRenderMode("no-post"));
  await settleFrames(page, 12);
  await screenshot(page, path.join(sceneOutput, "world-no-post.png"));
  const noPost = await page.evaluate(() => window.__NEVA_DEBUG.renderDiagnostics());
  if (JSON.stringify(captureContentSignature(final)) !== JSON.stringify(captureContentSignature(noPost))) {
    throw new Error(`[world:acceptance] ${seed}/${scene} changed content between final and no-post`);
  }

  const overlays = {};
  for (const mode of OVERLAYS[scene]) {
    await page.evaluate((overlay) => window.__NEVA_DEBUG.setFieldOverlay(overlay), mode);
    await settleFrames(page, 4);
    await screenshot(page, path.join(sceneOutput, `field-${mode}.png`));
    overlays[mode] = await page.evaluate(() => window.__NEVA_DEBUG.renderDiagnostics());
  }
  await page.evaluate(() => {
    window.__NEVA_DEBUG.setFieldOverlay(null);
    window.__NEVA_DEBUG.setCaptureRenderMode("final");
  });
  process.stdout.write(`[world:acceptance] captured ${seed}/${scene}\n`);
  return { normal, final, noPost, overlays };
}

async function syncHeldKeys(page, held, desiredKeys) {
  const desired = new Set(desiredKeys);
  for (const key of [...held]) {
    if (desired.has(key)) continue;
    await page.keyboard.up(key);
    held.delete(key);
  }
  for (const key of desired) {
    if (held.has(key)) continue;
    await page.keyboard.down(key);
    held.add(key);
  }
}

async function walkTo(page, target, telemetry, maxMs = 55_000) {
  const held = new Set();
  const started = Date.now();
  let previousDistance = Number.POSITIVE_INFINITY;
  let stagnant = 0;
  try {
    while (Date.now() - started < maxMs) {
      const state = await page.evaluate(() => window.__NEVA_DEBUG.snapshot());
      const dx = target.x - state.playerPosition.x;
      const dz = target.z - state.playerPosition.z;
      const distance = Math.hypot(dx, dz);
      const arrivalRadius = state.mode === "boat-driving" ? 3.5 : 1.4;
      if (distance <= arrivalRadius) {
        await syncHeldKeys(page, held, []);
        const render = await page.evaluate(() => window.__NEVA_DEBUG.renderDiagnostics());
        telemetry.push({
          x: state.playerPosition.x,
          z: state.playerPosition.z,
          mode: state.mode,
          grounded: state.playerGrounded,
          fps: render.presentation.fps,
          instances: render.world.instances,
          draws: render.world.render.calls,
          triangles: render.world.render.triangles,
          gpu: render.world.pipeline.gpuTiming
        });
        return;
      }
      const keys = [];
      if (state.mode === "boat-driving") {
        const targetHeading = Math.atan2(dx, dz);
        const headingDelta = Math.atan2(
          Math.sin(targetHeading - state.playerRotationY),
          Math.cos(targetHeading - state.playerRotationY)
        );
        if (headingDelta > 0.06) keys.push("KeyD");
        if (headingDelta < -0.06) keys.push("KeyA");
        if (Math.abs(headingDelta) < (distance < 8 ? 0.55 : 1.2)) keys.push("KeyW");
      } else {
        const forwardX = -Math.sin(state.cameraYaw);
        const forwardZ = -Math.cos(state.cameraYaw);
        const rightX = -forwardZ;
        const rightZ = forwardX;
        const localX = dx * rightX + dz * rightZ;
        const localZ = -(dx * forwardX + dz * forwardZ);
        const length = Math.hypot(localX, localZ) || 1;
        const lateral = localX / length;
        const longitudinal = localZ / length;
        if (lateral > 0.16) keys.push("KeyD");
        if (lateral < -0.16) keys.push("KeyA");
        if (longitudinal < -0.16) keys.push("KeyW");
        if (longitudinal > 0.16) keys.push("KeyS");
        if (distance > 5) keys.push("ShiftLeft");
      }
      await syncHeldKeys(page, held, keys);
      await page.waitForTimeout(120);
      stagnant = distance < previousDistance - 0.018 ? 0 : stagnant + 1;
      previousDistance = distance;
      const stagnantLimit = state.mode === "boat-driving" ? 100 : 24;
      if (stagnant >= stagnantLimit) {
        throw new Error(
          `movement stalled at ${state.playerPosition.x.toFixed(2)},${state.playerPosition.z.toFixed(2)} `
          + `heading ${state.playerRotationY.toFixed(3)} in ${state.mode} toward ${target.x},${target.z}`
        );
      }
    }
    const state = await page.evaluate(() => window.__NEVA_DEBUG.snapshot());
    throw new Error(
      `movement timed out at ${state.playerPosition.x.toFixed(2)},${state.playerPosition.z.toFixed(2)} `
      + `toward ${target.x},${target.z}`
    );
  } finally {
    await syncHeldKeys(page, held, []);
  }
}

async function interactUntilMode(page, expectedMode) {
  await page.keyboard.press("KeyE");
  await page.waitForFunction(
    (mode) => window.__NEVA_DEBUG?.snapshot().mode === mode,
    expectedMode,
    { timeout: 15_000 }
  );
}

function waypointsAtSpacing(points, fromIndex = 0, toIndex = points.length - 1, spacingMeters = 12) {
  const waypoints = [];
  let nextDistance = points[fromIndex]?.distance ?? 0;
  for (let index = fromIndex; index <= toIndex; index++) {
    if (points[index].distance + 0.001 < nextDistance) continue;
    waypoints.push(points[index]);
    nextDistance = points[index].distance + spacingMeters;
  }
  if (points[toIndex] && waypoints.at(-1) !== points[toIndex]) waypoints.push(points[toIndex]);
  return waypoints;
}

async function movementSamples(page, baseUrl) {
  const movementStarted = Date.now();
  const movementDeadlineMs = 60 * 60_000;
  const farmToBridge = [];
  const riverToHarbor = [];
  const assertMovementDeadline = () => {
    if (Date.now() - movementStarted > movementDeadlineMs) {
      throw new Error("movement samples exceeded the 60-minute acceptance deadline");
    }
  };
  if (!args.has("--transition-only")) {
    await page.goto(`${baseUrl}/?worldAcceptance=1&debug=1&debugStart=farm`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000
    });
    await page.waitForFunction(
      () => window.__NEVA_RENDER_READY === true && Boolean(window.__NEVA_DEBUG),
      undefined,
      { timeout: 180_000 }
    );
    const routeData = await page.evaluate(() => ({
      farmVillage: window.__NEVA_DEBUG.acceptanceRoute("farm-village"),
      villageHarbor: window.__NEVA_DEBUG.acceptanceRoute("village-harbor"),
      bridge: window.__NEVA_DEBUG.acceptanceBridgePosition()
    }));
    const bridgeIndex = routeData.farmVillage.reduce((best, point, index, points) =>
      Math.hypot(point.x - routeData.bridge.x, point.z - routeData.bridge.z)
        < Math.hypot(points[best].x - routeData.bridge.x, points[best].z - routeData.bridge.z)
        ? index
        : best, 0);
    const farmToBridgeWaypoints = waypointsAtSpacing(routeData.farmVillage, 0, bridgeIndex);
    for (let index = 0; index < farmToBridgeWaypoints.length; index++) {
      assertMovementDeadline();
      const waypoint = farmToBridgeWaypoints[index];
      process.stdout.write(`[world:acceptance] movement farm-bridge ${index + 1}/${farmToBridgeWaypoints.length}\n`);
      await walkTo(page, waypoint, farmToBridge);
    }
    const riverExitWaypoints = waypointsAtSpacing(routeData.farmVillage, bridgeIndex, routeData.farmVillage.length - 1);
    for (let index = 0; index < riverExitWaypoints.length; index++) {
      assertMovementDeadline();
      const waypoint = riverExitWaypoints[index];
      process.stdout.write(`[world:acceptance] movement river-exit ${index + 1}/${riverExitWaypoints.length}\n`);
      await walkTo(page, waypoint, riverToHarbor);
    }
    const harborWaypoints = waypointsAtSpacing(routeData.villageHarbor);
    for (let index = 0; index < harborWaypoints.length; index++) {
      assertMovementDeadline();
      const waypoint = harborWaypoints[index];
      process.stdout.write(`[world:acceptance] movement village-harbor ${index + 1}/${harborWaypoints.length}\n`);
      await walkTo(page, waypoint, riverToHarbor);
    }
  }


  await page.goto(`${baseUrl}/?worldAcceptance=1&debug=1&debugStart=harbor-skiff`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000
  });
  await page.waitForFunction(
    () => window.__NEVA_RENDER_READY === true && Boolean(window.__NEVA_DEBUG),
    undefined,
    { timeout: 180_000 }
  );
  const sunreachRouteData = await page.evaluate(() => ({
    sailing: window.__NEVA_DEBUG.acceptanceRoute("sailing.neva-sunreach"),
    coveTerraces: window.__NEVA_DEBUG.acceptanceRoute("route.sunreach.cove-terraces"),
    terracesScrub: window.__NEVA_DEBUG.acceptanceRoute("route.sunreach.terraces-scrub"),
    scrubRidge: window.__NEVA_DEBUG.acceptanceRoute("route.sunreach.scrub-ridge"),
    scrubReef: window.__NEVA_DEBUG.acceptanceRoute("route.sunreach.scrub-reef")
  }));
  const outbound = [];
  const islandWalk = [];
  const inbound = [];
  await interactUntilMode(page, "boat-driving");
  const outboundWaypoints = waypointsAtSpacing(sunreachRouteData.sailing, 0, sunreachRouteData.sailing.length - 1, 28);
  for (let index = 1; index < outboundWaypoints.length; index++) {
    assertMovementDeadline();
    process.stdout.write(`[world:acceptance] movement channel-out ${index}/${outboundWaypoints.length - 1}\n`);
    await walkTo(page, outboundWaypoints[index], outbound, 90_000);
  }
  await interactUntilMode(page, "on-foot");
  await walkTo(page, { x: 373, z: 61.5 }, islandWalk);
  const walkRoute = async (label, points, reverse = false) => {
    const waypoints = waypointsAtSpacing(points);
    const indices = reverse
      ? Array.from({ length: waypoints.length - 1 }, (_, offset) => waypoints.length - 2 - offset)
      : Array.from({ length: waypoints.length - 1 }, (_, offset) => offset + 1);
    for (const [step, index] of indices.entries()) {
      assertMovementDeadline();
      process.stdout.write(`[world:acceptance] movement ${label} ${step + 1}/${indices.length}\n`);
      await walkTo(page, waypoints[index], islandWalk);
    }
  };
  await walkRoute("cove-terraces", sunreachRouteData.coveTerraces);
  await walkRoute("terraces-scrub", sunreachRouteData.terracesScrub);
  await walkRoute("scrub-ridge", sunreachRouteData.scrubRidge);
  await walkRoute("ridge-scrub", sunreachRouteData.scrubRidge, true);
  await walkRoute("scrub-reef", sunreachRouteData.scrubReef);
  await walkRoute("reef-scrub", sunreachRouteData.scrubReef, true);
  await walkRoute("scrub-terraces", sunreachRouteData.terracesScrub, true);
  await walkRoute("terraces-cove", sunreachRouteData.coveTerraces, true);
  await interactUntilMode(page, "boat-driving");
  for (let index = outboundWaypoints.length - 2; index >= 0; index--) {
    assertMovementDeadline();
    process.stdout.write(`[world:acceptance] movement channel-return ${outboundWaypoints.length - 1 - index}/${outboundWaypoints.length - 1}\n`);
    await walkTo(page, outboundWaypoints[index], inbound, 90_000);
  }
  await interactUntilMode(page, "on-foot");

  const sunreachExpansion = {
    outbound,
    islandWalk,
    inbound,
    continuousRealInput: true,
    departedNeva: outbound.length > 0,
    reachedSunreachMarket: islandWalk.some((sample) => Math.hypot(sample.x - 373, sample.z - 56) <= 7),
    reachedSunreachFarm: islandWalk.some((sample) => Math.hypot(sample.x - 455, sample.z - 5) <= 3),
    reachedSunreachRidge: islandWalk.some((sample) => Math.hypot(sample.x - 590, sample.z - 25) <= 3),
    reachedSunreachReef: islandWalk.some((sample) => Math.hypot(sample.x - 520, sample.z - 180) <= 3),
    returnedToNeva: inbound.length > 0,
    landCollisionContinuous: islandWalk.every((sample) => sample.grounded)
  };
  if (!sunreachExpansion.reachedSunreachMarket || !sunreachExpansion.reachedSunreachFarm
    || !sunreachExpansion.reachedSunreachRidge || !sunreachExpansion.reachedSunreachReef
    || !sunreachExpansion.returnedToNeva || !sunreachExpansion.landCollisionContinuous) {
    throw new Error(`Sunreach movement acceptance failed: ${JSON.stringify(sunreachExpansion)}`);
  }
  const allTelemetry = [...farmToBridge, ...riverToHarbor, ...outbound, ...islandWalk, ...inbound];
  return {
    farmToBridge,
    riverToHarbor,
    sunreachExpansion,
    transitionOnly: args.has("--transition-only"),
    collisionContinuous: [...farmToBridge, ...riverToHarbor, ...islandWalk].every((sample) => sample.grounded),
    instanceRange: {
      min: Math.min(...allTelemetry.map((sample) => sample.instances)),
      max: Math.max(...allTelemetry.map((sample) => sample.instances))
    }
  };
}

async function runLane(lane, baseUrl, output, seeds) {
  const launchOptions = lane === "software"
    ? { headless: true, args: ["--use-angle=swiftshader"] }
    : { channel: "chrome", headless: true, args: ["--enable-gpu", "--use-angle=metal"] };
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  const requests = [];
  const sceneResults = [];
  const cameraIdentitiesBySeed = new Map();
  try {
    if (args.has("--movement-only")) {
      const movementPage = await context.newPage();
      movementPage.on("pageerror", (error) => errors.push(`movement pageerror: ${error.message}`));
      movementPage.on("console", (message) => {
        if (message.type() === "error") errors.push(`movement console: ${message.text()}`);
      });
      movementPage.on("requestfailed", (request) => requests.push(`failed ${request.url()}: ${request.failure()?.errorText}`));
      movementPage.on("response", (response) => {
        if (response.status() >= 400) requests.push(`http ${response.status()} ${response.url()}`);
        if (response.url().includes("/@vite/client")) requests.push(`HMR request ${response.url()}`);
      });
      const movement = await movementSamples(movementPage, baseUrl);
      await movementPage.close();
      if (!movement.collisionContinuous) errors.push("movement sample lost grounded collision continuity");
      const result = { lane, errors, requestErrors: requests, scenes: [], movement };
      writeJson(path.join(output, "movement-report.json"), result);
      if (errors.length > 0 || requests.length > 0) {
        throw new Error(
          `[world:acceptance] ${lane} movement lane failed:\n${[...errors, ...requests].join("\n")}`
        );
      }
      return result;
    }
    for (const seed of seeds) {
      for (const scene of SCENES) {
        const sceneReport = path.join(output, `seed-${seed}`, scene, "scene-report.json");
        if (args.has("--resume") && fs.existsSync(sceneReport)) {
          const result = JSON.parse(fs.readFileSync(sceneReport, "utf8"));
          const cameraIdentities = cameraIdentitiesBySeed.get(seed) ?? new Set();
          cameraIdentities.add(JSON.stringify(result.final.camera));
          cameraIdentitiesBySeed.set(seed, cameraIdentities);
          sceneResults.push({ seed, scene, ...result });
          process.stdout.write(`[world:acceptance] resumed ${seed}/${scene}\n`);
          continue;
        }
        const page = await context.newPage();
        page.on("pageerror", (error) => errors.push(`pageerror ${seed}/${scene}: ${error.message}`));
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(`console ${seed}/${scene}: ${message.text()}`);
        });
        page.on("requestfailed", (request) => requests.push(`failed ${request.url()}: ${request.failure()?.errorText}`));
        page.on("response", (response) => {
          if (response.status() >= 400) requests.push(`http ${response.status()} ${response.url()}`);
          if (response.url().includes("/@vite/client")) requests.push(`HMR request ${response.url()}`);
        });
        const result = await captureScene(page, baseUrl, output, seed, scene);
        writeJson(sceneReport, result);
        const identity = result.final.sceneIdentity;
        if (identity.goldTestId !== scene || identity.worldSeed !== seed || !identity.bootReady || identity.worldAssetCount <= 0) {
          errors.push(`invalid scene identity ${seed}/${scene}: ${JSON.stringify(identity)}`);
        }
        const cameraIdentities = cameraIdentitiesBySeed.get(seed) ?? new Set();
        cameraIdentities.add(JSON.stringify(result.final.camera));
        cameraIdentitiesBySeed.set(seed, cameraIdentities);
        sceneResults.push({ seed, scene, ...result });
        await page.close();
      }
    }
    for (const seed of seeds) {
      const cameraIdentityCount = cameraIdentitiesBySeed.get(seed)?.size ?? 0;
      if (cameraIdentityCount !== SCENES.length) {
        errors.push(`repeated scene camera identity for seed ${seed}: ${cameraIdentityCount}/${SCENES.length}`);
      }
    }
    const movementPage = await context.newPage();
    movementPage.on("pageerror", (error) => errors.push(`movement pageerror: ${error.message}`));
    movementPage.on("console", (message) => {
      if (message.type() === "error") errors.push(`movement console: ${message.text()}`);
    });
    movementPage.on("requestfailed", (request) => requests.push(`failed ${request.url()}: ${request.failure()?.errorText}`));
    movementPage.on("response", (response) => {
      if (response.status() >= 400) requests.push(`http ${response.status()} ${response.url()}`);
      if (response.url().includes("/@vite/client")) requests.push(`HMR request ${response.url()}`);
    });
    const movement = await movementSamples(movementPage, baseUrl);
    await movementPage.close();
    if (!movement.collisionContinuous) errors.push("movement sample lost grounded collision continuity");

    const gpu = sceneResults.at(-1)?.final.world.pipeline.gpuTiming;
    const hardwareBlocked = lane === "hardware" && (
      !gpu || gpu.softwareRenderer || gpu.blockedReason !== null || gpu.sampleCount === 0
    );
    if (hardwareBlocked) errors.push(`hardware GPU evidence blocked: ${JSON.stringify(gpu)}`);
    const result = { lane, gpu, errors, requestErrors: requests, scenes: sceneResults, movement };
    writeJson(path.join(output, "lane-report.json"), result);
    if (errors.length > 0 || requests.length > 0) {
      throw new Error(`[world:acceptance] ${lane} lane failed with ${errors.length + requests.length} errors`);
    }
    return result;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  const beforeManifest = inputManifest();
  const digest = manifestDigest(beforeManifest);
  const output = path.join(ROOT, "output/world-alignment", digest);
  fs.mkdirSync(output, { recursive: true });
  writeJson(path.join(output, "input-manifest.json"), { digest, files: beforeManifest });

  if (!args.has("--skip-checks")) {
    checked("node", ["tools/art/codegen.mjs", "--check"]);
    checked("node", ["tools/ui/codegen.mjs", "--check"]);
    checked("node", ["tools/ui/publish-atlas.mjs", "--check"]);
    checked("node", ["tools/ui/extrudeAndPack.mjs", "--check"]);
    checked(TSC, ["--noEmit"]);
  }

  const nevaPreservation = await runNevaPreservationAudit();
  writeJson(path.join(output, "neva-preservation.json"), nevaPreservation);
  const [audit, sunreachAudit] = await Promise.all([
    runCompositionAudit(),
    runSunreachCompositionAudit()
  ]);
  validateCompositionAudit(audit);
  validateSunreachCompositionAudit(sunreachAudit);
  writeJson(path.join(output, "composition-audit.json"), audit);
  writeJson(path.join(output, "sunreach-composition-audit.json"), sunreachAudit);
  const combinedStrongest = Math.max(
    ...audit.seeds.map((seed) => Math.max(seed.periodic22Ratio, seed.periodic555Ratio)),
    ...sunreachAudit.seeds.map((seed) => seed.periodic22Ratio)
  );
  const combinedWeakest = Math.min(
    ...audit.seeds.map((seed) => seed.districtDensityCv),
    ...sunreachAudit.seeds.map((seed) => seed.districtDensityCv)
  );
  const strongestSeed = audit.seeds.find((seed) =>
    Math.max(seed.periodic22Ratio, seed.periodic555Ratio) === combinedStrongest)?.seed
    ?? sunreachAudit.seeds.find((seed) => seed.periodic22Ratio === combinedStrongest)?.seed
    ?? 42;
  const weakestSeed = audit.seeds.find((seed) => seed.districtDensityCv === combinedWeakest)?.seed
    ?? sunreachAudit.seeds.find((seed) => seed.districtDensityCv === combinedWeakest)?.seed
    ?? 42;
  const seeds = [...new Set([42, strongestSeed, weakestSeed])];

  const bundle = path.join(output, "bundle");
  if (!args.has("--skip-build")) checked(VITE, ["build", "--outDir", bundle]);
  const afterBuildManifest = inputManifest();
  const afterBuildDigest = manifestDigest(afterBuildManifest);
  if (afterBuildDigest !== digest) throw new Error(`[world:acceptance] Input digest drifted ${digest} -> ${afterBuildDigest}`);
  if (args.has("--skip-captures")) {
    writeJson(path.join(output, "acceptance-report.json"), { digest, seeds, lanes: [], captureStatus: "skipped" });
    return;
  }

  const port = await reservePort();
  const preview = spawn(VITE, ["preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort", "--outDir", bundle], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let previewLog = "";
  preview.stdout.on("data", (chunk) => { previewLog += String(chunk); });
  preview.stderr.on("data", (chunk) => { previewLog += String(chunk); });
  const baseUrl = `http://127.0.0.1:${port}`;
  const lanes = requestedLane === "both" ? ["software", "hardware"] : [requestedLane];
  const laneResults = [];
  try {
    await waitForPreview(baseUrl, preview);
    for (const lane of lanes) {
      laneResults.push(await runLane(lane, baseUrl, path.join(output, lane), seeds));
    }
  } finally {
    preview.kill("SIGTERM");
    fs.writeFileSync(path.join(output, "preview.log"), previewLog);
  }
  const finalManifest = inputManifest();
  const finalDigest = manifestDigest(finalManifest);
  if (finalDigest !== digest) throw new Error(`[world:acceptance] Capture input digest drifted ${digest} -> ${finalDigest}`);
  writeJson(path.join(output, "acceptance-report.json"), {
    digest,
    seeds,
    viewport: [1920, 1080],
    devicePixelRatio: 1,
    quality: "high",
    minute: 720,
    weather: "clear",
    humanGameplayCameraApproval: "required",
    lanes: laneResults
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
