import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import type { NevaDebugSnapshot } from "../../src/app/GameApp";
import { NPCS } from "../../src/content/npcs";
import { starterStructureAnchor } from "../../src/world/FarmLayout";
import {
  HARBOR_DOCK,
  HARBOR_MAEVE_ANCHOR,
  HARBOR_MARKET,
  VILLAGE_MARKET
} from "../../src/world/WorldAnchors";
import { SPORT_FISHING_REVIEW_POINTS } from "../../src/simulation/domains/FishingDomain";
import { getProcessingStationFrontPosition } from "../../src/world/ProcessingStationApproach";
import { WORLD_ROUTES, WorldLayout } from "../../src/world/WorldLayout";

interface WorldPoint {
  x: number;
  z: number;
}

interface CropTarget extends WorldPoint {
  id: string;
}

interface RuntimeDiagnostics extends WorldPoint {
  mode: string;
  yaw: number;
  heading: number;
  speed: number;
  boatSpeed: number;
  collisionBlocked: boolean;
}

const NPC_NAMES: Record<string, string> = Object.fromEntries(
  NPCS.map((npc) => [npc.id, npc.name])
);
const NPC_ANCHORS: Record<string, WorldPoint> = Object.fromEntries(
  NPCS.map((npc) => [npc.id, { x: npc.anchor.x, z: npc.anchor.z }])
);

const farmVillageRoute = WORLD_ROUTES.find((route) => route.id === "farm-village");
const villageHomesteadRoute = WORLD_ROUTES.find((route) => route.id === "village-homestead");
const villageHarborRoute = WORLD_ROUTES.find((route) => route.id === "village-harbor");
if (!farmVillageRoute || !villageHomesteadRoute || !villageHarborRoute) {
  throw new Error("P12 route anchors are missing from the canonical world layout");
}
const nonNullFarmVillageRoute = farmVillageRoute;

const bridge = WorldLayout.landmark("bridge");
const bridgeIndex = farmVillageRoute.points.findIndex((point) => Math.hypot(point.x - bridge.x, point.z - bridge.z) < 0.2);
if (bridgeIndex < 0) throw new Error("Bridge is not on the farm-village route");
const lakePoint = SPORT_FISHING_REVIEW_POINTS.trout;
const mill = starterStructureAnchor("struct.starter_mill");
const workbench = starterStructureAnchor("struct.workbench");
const compost = starterStructureAnchor("struct.starter_compost");
if (!mill || !workbench || !compost) throw new Error("P12 processing anchors are missing");

const SCREENSHOT_DIR = path.resolve(process.cwd(), "output/playwright/p12-chrome");

async function waitForDebug(page: Page): Promise<void> {
  await expect(page.getByTestId("diagnostics")).toHaveAttribute("data-boot-ready", "true", { timeout: 450_000 });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__NEVA_DEBUG))).toBe(true);
}

async function snapshot(page: Page): Promise<NevaDebugSnapshot> {
  return page.evaluate(() => {
    const debug = window.__NEVA_DEBUG;
    if (!debug) throw new Error("Missing __NEVA_DEBUG");
    return debug.snapshot();
  });
}

async function readDiagnostics(page: Page): Promise<RuntimeDiagnostics> {
  // React replaces the DEV overlay during mode/quest updates. Resolve it
  // through a Locator so Playwright retries across that short unmount instead
  // of turning a presentation refresh into a failed traversal assertion.
  return page.getByTestId("diagnostics").evaluate((element) => {
    const numberAttribute = (name: string): number => {
      const value = Number(element.getAttribute(name));
      if (!Number.isFinite(value)) throw new Error(`Invalid diagnostic ${name}`);
      return value;
    };
    return {
      x: numberAttribute("data-player-x"),
      z: numberAttribute("data-player-z"),
      mode: element.getAttribute("data-mode") ?? "unknown",
      yaw: numberAttribute("data-camera-yaw"),
      heading: numberAttribute("data-player-heading"),
      speed: numberAttribute("data-player-speed"),
      boatSpeed: numberAttribute("data-boat-speed"),
      collisionBlocked: element.getAttribute("data-player-collision-blocked") === "true"
    };
  });
}

async function syncHeldKeys(page: Page, held: Set<string>, next: Iterable<string>): Promise<void> {
  const desired = new Set(next);
  for (const key of held) {
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

async function releaseHeldKeys(page: Page, held: Set<string>): Promise<void> {
  for (const key of [...held]) await page.keyboard.up(key);
  held.clear();
}

function wrappedAngleDelta(target: number, current: number): number {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

/**
 * Drives the real WASD camera-relative traversal input until the canonical
 * player pose reaches a world-space point. This deliberately observes DOM
 * diagnostics only; it never teleports or commits a physics frame.
 */
async function walkTo(
  page: Page,
  target: WorldPoint,
  options: { tolerance?: number; maxMs?: number; sprint?: boolean; precision?: boolean } = {}
): Promise<RuntimeDiagnostics> {
  const tolerance = options.tolerance ?? 1.25;
  const maxMs = options.maxMs ?? 55_000;
  const precision = options.precision ?? false;
  const sprint = (options.sprint ?? true) && !precision;
  const startedAt = Date.now();
  const held = new Set<string>();
  let previousDistance = Number.POSITIVE_INFINITY;
  let stagnantTicks = 0;

  try {
    while (Date.now() - startedAt < maxMs) {
      const state = await readDiagnostics(page);
      if (state.mode !== "on-foot") throw new Error(`Walk requested in ${state.mode} mode`);
      const dx = target.x - state.x;
      const dz = target.z - state.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= tolerance) {
        await releaseHeldKeys(page, held);
        await page.waitForTimeout(280);
        const settled = await readDiagnostics(page);
        if (!precision || Math.hypot(target.x - settled.x, target.z - settled.z) <= tolerance) return settled;
        previousDistance = Number.POSITIVE_INFINITY;
        stagnantTicks = 0;
        continue;
      }
      if (precision && distance < 1.5 && state.speed > 0.65) {
        await releaseHeldKeys(page, held);
        await page.waitForTimeout(90);
        previousDistance = Number.POSITIVE_INFINITY;
        stagnantTicks = 0;
        continue;
      }

      // GameCamera's forward/right basis is the same basis used by the
      // runtime movement path. Convert the desired world vector into W/A/S/D.
      const forwardX = -Math.sin(state.yaw);
      const forwardZ = -Math.cos(state.yaw);
      const rightX = -forwardZ;
      const rightZ = forwardX;
      const localX = dx * rightX + dz * rightZ;
      const localZ = -(dx * forwardX + dz * forwardZ);
      const steerLocalX = precision && Math.abs(localX) < Math.abs(localZ) ? 0 : localX;
      const steerLocalZ = precision && Math.abs(localX) >= Math.abs(localZ) ? 0 : localZ;
      const localLength = Math.hypot(steerLocalX, steerLocalZ) || 1;
      const lateral = steerLocalX / localLength;
      const longitudinal = steerLocalZ / localLength;
      const nextKeys: string[] = [];
      if (lateral > 0.16) nextKeys.push("KeyD");
      if (lateral < -0.16) nextKeys.push("KeyA");
      if (longitudinal < -0.16) nextKeys.push("KeyW");
      if (longitudinal > 0.16) nextKeys.push("KeyS");
      if (sprint && distance > 5) nextKeys.push("ShiftLeft");
      await syncHeldKeys(page, held, nextKeys);
      if (target.x > -25 && target.x < -18 && Math.abs(target.z + 6) < 2 && stagnantTicks % 4 === 0) {
        console.info(
          `[p12] bridge nav current=(${state.x.toFixed(2)},${state.z.toFixed(2)}) ` +
          `target=(${target.x.toFixed(2)},${target.z.toFixed(2)}) yaw=${state.yaw.toFixed(3)} ` +
          `local=(${localX.toFixed(3)},${localZ.toFixed(3)}) keys=${nextKeys.join("+")} ` +
          `blocked=${state.collisionBlocked}`
        );
      }
      if (precision && distance < 1.5) {
        // Near a tight authored waypoint, short taps let the canonical
        // acceleration/deceleration model settle instead of oscillating past
        // a sub-metre target under a continuously held digital key.
        await page.waitForTimeout(40);
        await releaseHeldKeys(page, held);
        await page.waitForTimeout(70);
      } else {
        await page.waitForTimeout(130);
      }

      const progressed = distance < previousDistance - 0.018;
      stagnantTicks = progressed ? 0 : stagnantTicks + 1;
      previousDistance = distance;
      if (stagnantTicks >= 18) {
        throw new Error(
          `Player route stalled at (${state.x.toFixed(2)}, ${state.z.toFixed(2)}) ` +
          `toward (${target.x.toFixed(2)}, ${target.z.toFixed(2)}); ` +
          `blocked=${state.collisionBlocked}`
        );
      }
    }
  } finally {
    await releaseHeldKeys(page, held);
  }
  const state = await readDiagnostics(page);
  throw new Error(
    `Player route timed out at (${state.x.toFixed(2)}, ${state.z.toFixed(2)}) ` +
    `toward (${target.x.toFixed(2)}, ${target.z.toFixed(2)})`
  );
}

async function walkRoute(
  page: Page,
  points: readonly WorldPoint[],
  finalTarget?: WorldPoint,
  tolerance: number = 1.25
): Promise<void> {
  for (const point of points) await walkTo(page, point, { tolerance });
  if (finalTarget) await walkTo(page, finalTarget, { tolerance });
}

async function walkAcrossBridge(
  page: Page,
  route: readonly WorldPoint[],
  bridgeIndex: number
): Promise<void> {
  const westEdge = route[bridgeIndex - 1];
  const center = route[bridgeIndex];
  const eastEdge = route[bridgeIndex + 1];
  if (!westEdge || !center || !eastEdge) throw new Error("Bridge route corridor is incomplete");

  // Keep the real player on the bridge centerline before traversing the
  // crowned deck. A diagonal approach can graze the authored rail while still
  // being visually on the deck, which is not a valid player-led crossing.
  await walkTo(page, { x: westEdge.x - 3, z: center.z }, { tolerance: 0.02, precision: true });

  // The crowned deck has discrete rising/falling collision boxes. A sequence
  // of short digital taps can lose the vertical transition even though the
  // same physical route is traversable under a held key. Keep the crossing a
  // genuine player input, but hold the single centerline axis continuously so
  // the runtime controller performs its normal step-up/step-down behavior.
  await holdBridgeAxis(page, eastEdge.x + 1, 1);
}

async function walkAcrossBridgeToWest(
  page: Page,
  route: readonly WorldPoint[],
  bridgeIndex: number
): Promise<void> {
  const westEdge = route[bridgeIndex - 1];
  const center = route[bridgeIndex];
  const eastEdge = route[bridgeIndex + 1];
  if (!westEdge || !center || !eastEdge) throw new Error("Bridge route corridor is incomplete");

  // Step onto the east deck before reversing across it. The near deck face has
  // a narrow collision seam; a near-deck staging point lets the capsule settle
  // onto the authored surface before sustained westward input begins.
  const staging = await walkTo(page, { x: eastEdge.x + 1.0, z: center.z }, { tolerance: 0.12, precision: true });
  console.info(`[p12] reverse bridge staging ${JSON.stringify(staging)}`);
  await holdBridgeAxis(page, westEdge.x - 1, -1);
}

async function holdBridgeAxis(page: Page, targetX: number, direction: -1 | 1): Promise<void> {
  const initial = await readDiagnostics(page);
  console.info(`[p12] bridge crossing start ${JSON.stringify(initial)} targetX=${targetX.toFixed(2)}`);
  if (direction * (targetX - initial.x) <= 0) return;

  const held = new Set<string>();
  const startedAt = Date.now();

  try {
    while (Date.now() - startedAt < 8_000) {
      const state = await readDiagnostics(page);
      if (state.mode !== "on-foot") throw new Error(`Bridge crossing requested in ${state.mode} mode`);
      if (direction * (state.x - targetX) >= 0) return;

      // Resolve the world-X direction through the live camera basis instead
      // of assuming the current camera yaw. Preserve both local components:
      // when the camera is oblique, selecting only the dominant key would
      // introduce lateral drift into the narrow bridge corridor.
      const forwardX = -Math.sin(state.yaw);
      const forwardZ = -Math.cos(state.yaw);
      const rightX = -forwardZ;
      const localX = direction * rightX;
      const localZ = direction * -forwardX;
      const nextKeys: string[] = [];
      if (localX > 0.16) nextKeys.push("KeyD");
      if (localX < -0.16) nextKeys.push("KeyA");
      if (localZ < -0.16) nextKeys.push("KeyW");
      if (localZ > 0.16) nextKeys.push("KeyS");
      await syncHeldKeys(page, held, nextKeys);
      await page.waitForTimeout(100);
    }
  } finally {
    await releaseHeldKeys(page, held);
  }

  const state = await readDiagnostics(page);
  throw new Error(
    `Bridge crossing timed out at (${state.x.toFixed(2)}, ${state.z.toFixed(2)}) ` +
    `toward x=${targetX.toFixed(2)}`
  );
}

async function walkToVillageMarketGateway(page: Page): Promise<void> {
  // The market anchor is the stall's interaction center, not a walkable point
  // inside its collision shell. The player only needs to enter its authored
  // six-metre interaction radius.
  await walkTo(page, VILLAGE_MARKET.position, { tolerance: 4.2 });
}

async function walkVillageMarketToHomestead(page: Page): Promise<void> {
  // The authored homestead route's intermediate point is inside the physical
  // market-stall envelope after the stall was given catalog collision. Leave
  // the market through the southwest apron, then rejoin the homestead lane.
  await walkTo(page, { x: 47, z: -48 });
  await walkTo(page, { x: 47, z: -55 });
  await walkTo(page, { x: 52, z: -61 });
  await walkTo(page, { x: 60, z: -60 });
}

async function walkHomesteadToVillageMarket(page: Page): Promise<void> {
  await walkTo(page, { x: 52, z: -61 });
  await walkTo(page, { x: 47, z: -55 });
  await walkTo(page, { x: 47, z: -48 });
  await walkToVillageMarketGateway(page);
}

async function walkToStarterWorkbench(page: Page): Promise<void> {
  // Rejoin the authored farm entry and work trail through the south-west field
  // opening; the final point keeps the player on the workbench's south apron
  // before processAtStation resolves the exact working face.
  const localTrailTolerance = 0.35;
  await walkTo(page, { x: -60.8, z: -62.2 }, { tolerance: localTrailTolerance });
  await walkTo(page, { x: -65, z: -63.2 }, { tolerance: localTrailTolerance });
  await walkTo(page, { x: -72.8, z: -63.2 }, { tolerance: localTrailTolerance });
  // Cross the west fence line before turning north. A diagonal approach can
  // carry the player over the corner post and leave the workbench apron
  // unreachable even though both axes are individually open.
  await walkTo(page, { x: -75.4, z: -63.2 }, { tolerance: localTrailTolerance, precision: true });
  await walkTo(page, { x: -75.4, z: -59.8 }, { tolerance: localTrailTolerance, precision: true });
  // The catalog workbench collider occupies its visual footprint through
  // z=-57.5. Stop on the south apron; processAtStation then resolves the
  // exact working-face contract with its 1.25 m endpoint tolerance.
  await walkTo(page, { x: -75.1, z: -58.25 }, { tolerance: localTrailTolerance });
}

async function walkToHarborSilas(page: Page): Promise<void> {
  // Silas's authored anchor sits on the north side of the fish-market shell.
  // Reach his walkable line-of-sight apron from the open north approach rather
  // than cutting through the market and dock collision volumes.
  await walkTo(page, { x: 60, z: 50 });
  await walkTo(page, { x: 76, z: 50 });
  await walkTo(page, { x: 82, z: 50 });
  await walkTo(page, { x: 84, z: 54 });
  await walkTo(page, { x: 84, z: 58 }, { tolerance: 0.35 });
  await walkTo(page, { x: 83, z: 58.5 }, { tolerance: 0.35 });
}

async function walkToHarborDock(page: Page): Promise<void> {
  // Enter the pier through its authored south stair run. The direct diagonal
  // from Silas's north-east apron intersects the dock deck and piling proxies
  // before it can reach the boarding anchor.
  await walkTo(page, { x: 77.4, z: 62.4 }, { tolerance: 0.45 });
  await walkTo(page, { x: 75.5, z: 62.4 }, { tolerance: 0.45 });
  await walkTo(page, { x: 75.5, z: 64.3 }, { tolerance: 0.45 });
  await walkTo(page, HARBOR_DOCK.playerPosition, { tolerance: 1.2 });
}

async function walkToHarborMarketTradeApproach(page: Page): Promise<void> {
  // The fish-market anchor is the stall's collision center. Leave the dock
  // through the south stairs, go around the east/north apron, and stop at the
  // authored counter-facing trade point instead of walking into the shell.
  await walkTo(page, { x: 75.5, z: 64.3 }, { tolerance: 0.45 });
  await walkTo(page, { x: 77.4, z: 62.4 }, { tolerance: 0.45 });
  await walkTo(page, { x: 82, z: 60 }, { tolerance: 0.8 });
  await walkTo(page, { x: 82, z: 54 }, { tolerance: 0.8 });
  await walkTo(page, { x: 76, z: 50 }, { tolerance: 0.8 });
  await walkTo(page, { x: 70, z: 50 }, { tolerance: 0.8 });
  // The north-facing counter edge is shared with Maeve's talk radius. Use the
  // east-side trade point, which stays inside the market radius without
  // allowing the NPC dialogue target to outrank the fish trade action.
  await walkTo(page, { x: 70, z: 57 }, { tolerance: 0.85 });
}

async function walkToMaeveDialogueApproach(page: Page): Promise<void> {
  // Maeve's NPC talk radius overlaps the fish-market trade radius at the
  // front anchor. Stand just beyond the market's seven-metre envelope while
  // staying within the NPC's 3.5-metre talk radius so the contextual action is
  // unambiguously dialogue; the same market remains available from its stall.
  const dx = HARBOR_MAEVE_ANCHOR.x - HARBOR_MARKET.position.x;
  const dz = HARBOR_MAEVE_ANCHOR.z - HARBOR_MARKET.position.z;
  const length = Math.hypot(dx, dz) || 1;
  const distanceFromMarket = HARBOR_MARKET.radiusMeters + 0.65;
  await walkTo(page, {
    x: HARBOR_MARKET.position.x + (dx / length) * distanceFromMarket,
    z: HARBOR_MARKET.position.z + (dz / length) * distanceFromMarket
  }, { tolerance: 0.45 });
}

async function walkToElspeth(page: Page): Promise<void> {
  const state = await readDiagnostics(page);
  const isNearStarterFarm = state.x < -50 && state.z < -52;
  if (!isNearStarterFarm) {
    // Elspeth is reached from the village side through the authored arterial;
    // a direct cross-world diagonal cuts through market and farm collision.
    await walkToVillageMarketGateway(page);
    await walkRoute(page, [...nonNullFarmVillageRoute.points].reverse().slice(1, 6), undefined, 0.45);
    await walkAcrossBridgeToWest(page, nonNullFarmVillageRoute.points, bridgeIndex);
    await walkRoute(page, nonNullFarmVillageRoute.points.slice(0, 5).reverse(), undefined, 0.45);
  }
  // The final approach still uses the starter field's south opening so the
  // fence never becomes a line-of-sight or locomotion shortcut.
  await walkTo(page, { x: -65, z: -62.4 }, { tolerance: 0.9 });
}

async function walkFromStarterWorkbenchToVillageRoute(page: Page): Promise<void> {
  // Return to the regional arterial through the same local work-trail
  // junction instead of cutting across the starter-field collision.
  const localTrailTolerance = 0.35;
  await walkTo(page, { x: -75.4, z: -59.8 }, { tolerance: localTrailTolerance });
  // Clear the southwest fence corner before turning east onto the shared
  // south trail; the direct diagonal can catch the corner post's collider.
  await walkTo(page, { x: -74, z: -62.25 }, { tolerance: localTrailTolerance });
  await walkTo(page, { x: -65, z: -62.25 }, { tolerance: localTrailTolerance });
  await walkTo(page, { x: -60.8, z: -62.2 }, { tolerance: localTrailTolerance });
  await walkTo(page, nonNullFarmVillageRoute.points[0], { tolerance: localTrailTolerance });
}

async function walkFromStarterFarmToVillageRoute(page: Page): Promise<void> {
  // Elspeth's field-side conversation ends inside the starter farm. Rejoin
  // the shared arterial through the field's south opening before continuing
  // to harbor; a direct cross-world diagonal would cut through the fence.
  await walkTo(page, { x: -65, z: -62.25 }, { tolerance: 0.35 });
  await walkTo(page, { x: -60.8, z: -62.2 }, { tolerance: 0.35 });
  await walkTo(page, nonNullFarmVillageRoute.points[0], { tolerance: 0.45 });
}

/** Same player-led control loop, using W/S throttle and A/D steering aboard the rowboat. */
async function boatTo(
  page: Page,
  target: WorldPoint,
  options: { tolerance?: number; maxMs?: number } = {}
): Promise<RuntimeDiagnostics> {
  const tolerance = options.tolerance ?? 5;
  const maxMs = options.maxMs ?? 70_000;
  const startedAt = Date.now();
  const held = new Set<string>();
  let previousDistance = Number.POSITIVE_INFINITY;
  let stagnantTicks = 0;

  try {
    while (Date.now() - startedAt < maxMs) {
      const state = await readDiagnostics(page);
      if (state.mode !== "boat-driving") throw new Error(`Boat route requested in ${state.mode} mode`);
      const dx = target.x - state.x;
      const dz = target.z - state.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= tolerance) {
        await releaseHeldKeys(page, held);
        await page.waitForTimeout(240);
        return await readDiagnostics(page);
      }

      const desiredHeading = Math.atan2(dx, dz);
      const headingError = wrappedAngleDelta(desiredHeading, state.heading);
      const nextKeys: string[] = [];
      // Coast early enough for the rowboat to settle inside an interaction
      // radius; docking itself remains an actual E interaction.
      if (distance > 10 || state.boatSpeed < 0.65) nextKeys.push("KeyW");
      if (Math.abs(headingError) > 0.10) nextKeys.push(headingError > 0 ? "KeyD" : "KeyA");
      await syncHeldKeys(page, held, nextKeys);
      await page.waitForTimeout(160);

      const progressed = distance < previousDistance - 0.025;
      stagnantTicks = progressed ? 0 : stagnantTicks + 1;
      previousDistance = distance;
      if (stagnantTicks >= 24) {
        throw new Error(
          `Boat route stalled at (${state.x.toFixed(2)}, ${state.z.toFixed(2)}) ` +
          `toward (${target.x.toFixed(2)}, ${target.z.toFixed(2)}); ` +
          `blocked=${state.collisionBlocked}`
        );
      }
    }
  } finally {
    await releaseHeldKeys(page, held);
  }
  const state = await readDiagnostics(page);
  throw new Error(
    `Boat route timed out at (${state.x.toFixed(2)}, ${state.z.toFixed(2)}) ` +
    `toward (${target.x.toFixed(2)}, ${target.z.toFixed(2)})`
  );
}

async function waitForPrompt(page: Page, pattern: RegExp, timeout = 10_000): Promise<string> {
  const prompt = page.getByTestId("context-prompt");
  await expect.poll(
    async () => (await prompt.textContent().catch(() => "")) ?? "",
    { timeout }
  ).toMatch(pattern);
  return (await prompt.textContent()) ?? "";
}

async function waitForActionSettled(page: Page): Promise<void> {
  await expect.poll(
    () => page.getByTestId("diagnostics").getAttribute("data-action-target-x"),
    { timeout: 12_000 }
  ).toBe("none");
}

async function waitForActionStartedAndSettled(page: Page): Promise<void> {
  // Use this immediately after the input edge when the caller needs to avoid
  // racing the initial `none` state. Callers that first await a simulation
  // result may already be past the authored recovery window and should use
  // waitForActionSettled instead.
  await expect.poll(
    () => page.getByTestId("diagnostics").getAttribute("data-action-target-x"),
    { timeout: 2_000 }
  ).not.toBe("none");
  await waitForActionSettled(page);
}

async function dismissCropInspection(page: Page): Promise<void> {
  const inspection = page.getByTestId("crop-inspection");
  // The drawer is assigned at the simulation commit marker and can be one UI
  // render behind the action-target attribute clearing.
  await page.waitForTimeout(140);
  if (await inspection.isVisible().catch(() => false)) {
    await inspection.getByRole("button", { name: "Close crop inspection" }).click();
    await expect(inspection).not.toBeVisible({ timeout: 3_000 });
  }
}

async function talkAtCurrentPosition(page: Page, npcId: string, expectedLine?: string): Promise<void> {
  const npcName = NPC_NAMES[npcId] ?? npcId;
  await waitForPrompt(page, new RegExp(`Talk to ${npcName}`));
  await page.keyboard.press("KeyE");
  const dialogue = page.locator(".dialogue-card");
  await expect(dialogue).toBeVisible({ timeout: 8_000 });
  await expect(dialogue).toContainText(npcName);
  if (expectedLine) {
    await expect(dialogue.getByTestId("dialogue-text")).toContainText(expectedLine, { timeout: 10_000 });
  }
  await page.keyboard.press("Escape");
  await expect(dialogue).not.toBeVisible({ timeout: 5_000 });
}

async function talkTo(page: Page, npcId: string, expectedLine?: string): Promise<void> {
  // Elspeth's authored gate interaction is shared with the fresh-save spawn.
  // Approaching her body from inside the field can put the south fence between
  // the camera ray and the NPC. Use the canonical gate approach instead.
  const anchor = NPC_ANCHORS[npcId];
  if (!anchor) throw new Error(`Missing canonical anchor for ${npcId}`);
  if (npcId === "npc.elspeth") await walkToElspeth(page);
  else if (npcId === "npc.silas") await walkToHarborSilas(page);
  else if (npcId === "npc.barnaby") {
    const state = await readDiagnostics(page);
    // After workbench crafting the player stands on the bench's south apron;
    // leave that collider southward before turning east toward Barnaby.
    if (state.x < -74 && state.z > -58.6) {
      await walkTo(page, { x: -74.7, z: -58.8 }, { tolerance: 0.35 });
      await walkTo(page, { x: -73.3, z: -58.8 }, { tolerance: 0.35 });
    }
    await walkTo(page, anchor, { tolerance: 1.45 });
  } else await walkTo(page, anchor, { tolerance: 1.45 });
  await dismissCropInspection(page);
  await talkAtCurrentPosition(page, npcId, expectedLine);
}

async function enterWheatPlacement(page: Page): Promise<void> {
  await page.keyboard.press("KeyI");
  const inventory = page.locator(".modal-content");
  await expect(inventory).toContainText("Guild Satchel");
  // ChromeSlot carries role="gridcell" for the inventory grid, so target its
  // explicit accessible label rather than relying on the rendered icon text.
  await inventory.locator("[aria-label^='Wheat Seeds, count']").click();
  await page.getByRole("button", { name: "Plant Wheat" }).click();
  await expect(page.getByTestId("diagnostics")).toHaveAttribute("data-mode", "farm-placement");
}

async function findValidPlacementPoint(
  page: Page,
  previousTargets: readonly WorldPoint[]
): Promise<{ screen: { x: number; y: number }; world: WorldPoint }> {
  const bounds = await page.locator("#game-canvas").boundingBox();
  if (!bounds) throw new Error("Game canvas has no bounding box");
  const samples = [0.30, 0.37, 0.44, 0.50, 0.56, 0.63, 0.70].flatMap((x) =>
    [0.42, 0.35, 0.50, 0.58, 0.66, 0.73].map((y) => [x, y] as const)
  );
  const diagnostics = page.getByTestId("diagnostics");
  for (const [xRatio, yRatio] of samples) {
    const screen = {
      x: bounds.x + bounds.width * xRatio,
      y: bounds.y + bounds.height * yRatio
    };
    await page.mouse.move(screen.x, screen.y);
    // Debug attributes are published on the same 100 ms UI cadence as the
    // player-facing placement prompt; wait past that cadence before accepting
    // a preview so a previous sample cannot be mistaken for this pointer.
    await page.waitForTimeout(160);
    if (await diagnostics.getAttribute("data-placement-valid") !== "true") continue;
    const world = {
      x: Number(await diagnostics.getAttribute("data-placement-target-x")),
      z: Number(await diagnostics.getAttribute("data-placement-target-z"))
    };
    if (!Number.isFinite(world.x) || !Number.isFinite(world.z)) continue;
    // Keep authored interaction circles from overlapping at the point where
    // the player-led route stops. This also makes the crop handoff readable
    // when the camera is centered between adjacent furrows.
    if (previousTargets.some((target) => Math.hypot(target.x - world.x, target.z - world.z) < 2.75)) continue;
    return { screen, world };
  }
  throw new Error("Could not find a separated valid starter-farm placement point in Chrome");
}

async function plantThreeWheat(page: Page): Promise<CropTarget[]> {
  const targets: CropTarget[] = [];
  for (let index = 0; index < 3; index += 1) {
    await enterWheatPlacement(page);
    const placement = await findValidPlacementPoint(page, targets);
    // The placement HUD's authored primary action is left-click. Keep the
    // pointer on the selected soil point and commit through that real input
    // edge; the preview has already been held for a rendered frame above.
    await page.mouse.move(placement.screen.x, placement.screen.y);
    await page.waitForTimeout(120);
    console.info(`[p12] plant ${index} input ${JSON.stringify(await page.evaluate((point) => {
      const diagnostics = document.querySelector<HTMLElement>("[data-testid='diagnostics']");
      const element = document.elementFromPoint(point.x, point.y);
      return {
        point,
        element: element instanceof HTMLElement ? element.id || element.className : element?.nodeName,
        mode: diagnostics?.getAttribute("data-mode"),
        valid: diagnostics?.getAttribute("data-placement-valid"),
        targetX: diagnostics?.getAttribute("data-placement-target-x"),
        targetZ: diagnostics?.getAttribute("data-placement-target-z"),
        crops: diagnostics?.getAttribute("data-crop-count")
      };
    }, placement.screen))}`);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.up();
    await page.waitForTimeout(250);
    console.info(`[p12] plant ${index} after input ${JSON.stringify(await page.evaluate(() => {
      const diagnostics = document.querySelector<HTMLElement>("[data-testid='diagnostics']");
      return {
        mode: diagnostics?.getAttribute("data-mode"),
        actionX: diagnostics?.getAttribute("data-action-target-x"),
        crops: diagnostics?.getAttribute("data-crop-count"),
        valid: diagnostics?.getAttribute("data-placement-valid")
      };
    }))}`);
    await expect.poll(async () => {
      const state = await snapshot(page);
      return state.cropIds.find((cropId) => !targets.some((target) => target.id === cropId)) ?? null;
    }, { timeout: 12_000 }).toBeTruthy();
    await waitForActionSettled(page);
    const plantedId = (await snapshot(page)).cropIds.find((cropId) => !targets.some((target) => target.id === cropId));
    if (!plantedId) throw new Error("Planting did not expose a stable crop ID in Chrome");
    targets.push({ ...placement.world, id: plantedId });
  }
  return targets;
}

async function useCrop(
  page: Page,
  target: CropTarget,
  action: "Water" | "Harvest",
  enterField = false
): Promise<void> {
  console.info(`[p12] ${action.toLowerCase()} target ${target.id} (${target.x.toFixed(2)}, ${target.z.toFixed(2)})`);
  // Crop actions are tool-gated: watering can is slot 3, while hand tools own
  // harvest. Use the same contextual E action the player sees in the prompt.
  await page.keyboard.press(action === "Water" ? "Digit3" : "Digit1");
  if (enterField) {
    // The starter field's south fence has one authored pedestrian opening at
    // local x=0. Enter through that gap instead of pressing a crop-facing
    // diagonal into the fence rail.
    await walkTo(page, { x: -65, z: -62.4 }, { tolerance: 0.9 });
    await walkTo(page, { x: -65, z: -58.8 }, { tolerance: 1.0 });
  }
  // Resolve close to the authored crop point. The live resolver supports a
  // 2.5 m interaction radius, so the wider travel tolerance can legitimately
  // leave two neighboring crops in range and make the nearer one ambiguous.
  await walkTo(page, target, { tolerance: 0.5 });
  await waitForPrompt(page, new RegExp(action));
  await expect.poll(() => snapshot(page).then((state) => state.interactionTarget), { timeout: 2_000 })
    .toMatchObject({ entityId: target.id, action: action.toLowerCase() });
  await page.keyboard.press("KeyE");
  await waitForActionStartedAndSettled(page);
  // A successful water action opens the live crop inspection drawer as
  // feedback. Dismiss that presentation layer before the next traversal or
  // NPC interaction; Escape clears it without opening the pause menu.
  if (action === "Water") await dismissCropInspection(page);
}

async function processAtStation(
  page: Page,
  stationId: string,
  recipeId: string,
  durationMinutes: number,
  promptPattern: RegExp
): Promise<void> {
  const station: WorldPoint = stationId === "struct.harbor_fish_table"
    ? HARBOR_MARKET.position
    : stationId === "struct.starter_mill"
      ? { x: mill!.x, z: mill!.z }
      : stationId === "struct.workbench"
        ? { x: workbench!.x, z: workbench!.z }
        : { x: compost!.x, z: compost!.z };
  const front = getProcessingStationFrontPosition(stationId, station);
  if (!front) throw new Error(`Missing processing approach for ${stationId}`);
  // The declared station interaction radius is 1.5 m; catalog collision can
  // stop the player slightly short of the visual working-face point.
  await walkTo(page, front, { tolerance: 1.25 });
  await waitForPrompt(page, promptPattern);
  await page.keyboard.press("KeyE");
  await expect.poll(() => snapshot(page).then((state) => state.processingJobIds.length), { timeout: 12_000 })
    .toBeGreaterThan(0);
  await waitForActionSettled(page);
  const startedJobIds = await snapshot(page);
  const jobId = startedJobIds.processingJobIds.at(-1);
  if (!jobId) throw new Error(`Processing did not create ${recipeId} at ${stationId}`);

  // Long crop/processing waits are the only accelerated part of this route.
  // The action itself, approach, prompt and collection remain player-led.
  await page.evaluate((minutes) => window.__NEVA_DEBUG?.advanceGameMinutes(minutes), durationMinutes);
  await expect.poll(() => snapshot(page).then((state) => state.processingJobIds.includes(jobId)), { timeout: 12_000 }).toBe(true);
  await waitForPrompt(page, /Collect/);
  await page.keyboard.press("KeyE");
  await waitForActionSettled(page);
  await expect.poll(() => snapshot(page).then((state) => state.processingJobIds.includes(jobId)), { timeout: 12_000 }).toBe(false);
}

async function castAndResolveBasicFishing(page: Page): Promise<void> {
  await waitForPrompt(page, /Cast line/);
  await page.keyboard.press("KeyE");
  await expect(page.getByTestId("diagnostics")).toHaveAttribute("data-mode", "basic-fishing");

  await page.keyboard.down("Space");
  await page.waitForTimeout(700);
  await page.keyboard.up("Space");

  const startedAt = Date.now();
  let held = false;
  let lastFishing: Awaited<ReturnType<typeof snapshot>>["basicFishing"] = null;
  try {
    while (Date.now() - startedAt < 20_000) {
      const fishing = (await snapshot(page)).basicFishing;
      lastFishing = fishing;
      if (!fishing) {
        await expect(page.getByTestId("diagnostics")).toHaveAttribute("data-mode", "on-foot", { timeout: 3_000 });
        return;
      }
      if (fishing.phase === "caught" || fishing.phase === "escaped") {
        await page.keyboard.press("Space");
        await expect(page.getByTestId("diagnostics")).toHaveAttribute("data-mode", "on-foot", { timeout: 3_000 });
        continue;
      }
      if (fishing.phase === "bite-reaction") {
        if (held) {
          await page.keyboard.up("Space");
          held = false;
        }
        await page.keyboard.press("Space");
      } else if (fishing.phase === "minigame") {
        const barY = fishing.barY ?? 0;
        const barHeight = fishing.barHeight ?? 0.2;
        const fishY = fishing.fishY ?? 0.25;
        // Account for the bar's momentum. A center-only rule releases too
        // late, then coasts past the fish before gravity can reverse it.
        const targetBarY = Math.max(0, Math.min(1 - barHeight, fishY - barHeight * 0.5));
        const projectedBarY = barY + (fishing.barVy ?? 0) * 0.45;
        let shouldHold = held;
        if (projectedBarY < targetBarY - 0.03) shouldHold = true;
        else if (projectedBarY > targetBarY + 0.03) shouldHold = false;
        if (shouldHold && !held) {
          await page.keyboard.down("Space");
          held = true;
        } else if (!shouldHold && held) {
          await page.keyboard.up("Space");
          held = false;
        }
      }
      // Match the simulation proof's 50 ms controller cadence closely enough
      // to avoid sampling through a narrow overlap window in a busy browser.
      await page.waitForTimeout(50);
    }
  } finally {
    if (held) await page.keyboard.up("Space");
  }
  throw new Error(`Basic fishing attempt did not resolve in Chrome: ${JSON.stringify(lastFishing)}`);
}

async function catchTwoRiverFish(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const state = await snapshot(page);
    if ((state.activeQuestStepProgress["step.act3_catch_2_river_fish"] ?? 0) >= 2) return;
    await castAndResolveBasicFishing(page);
  }
  const state = await snapshot(page);
  expect(state.activeQuestId).toBe("quest.act3_river_angler");
  expect(state.activeQuestStepProgress["step.act3_catch_2_river_fish"]).toBe(2);
}

async function landSportFishWithKeyboard(page: Page): Promise<void> {
  const held = new Set<string>();
  const startedAt = Date.now();
  // The authored trout encounter needs roughly 95 real seconds for the
  // keyboard-equivalent policy to tire the fish. Keep this acceptance window
  // above that deterministic floor without changing the fishing balance.
  const maxDurationMs = 120_000;
  let lastEncounter: NevaDebugSnapshot["sportFishing"] = null;
  try {
    while (Date.now() - startedAt < maxDurationMs) {
      const encounter = (await snapshot(page)).sportFishing;
      if (!encounter) {
        expect((await snapshot(page)).cargoCount).toBeGreaterThan(0);
        await expect(page.getByTestId("diagnostics")).toHaveAttribute("data-mode", "boat-driving", { timeout: 3_000 });
        return;
      }
      lastEncounter = encounter;
      const nextKeys: string[] = [];
      if (encounter.lineTension > 82) nextKeys.push("KeyS");
      else if (encounter.lineTension < 70) nextKeys.push("KeyW");
      if (encounter.behavior === "dive" || encounter.behavior === "burst") nextKeys.push("Space");
      if (encounter.behavior === "run-left") nextKeys.push("KeyD");
      if (encounter.behavior === "run-right") nextKeys.push("KeyA");
      await syncHeldKeys(page, held, nextKeys);
      await page.waitForTimeout(90);
    }
  } finally {
    await releaseHeldKeys(page, held);
  }
  throw new Error(`Sport fish was not landed through real keyboard controls: ${JSON.stringify(lastEncounter)}`);
}

async function sellVillageProduce(page: Page): Promise<void> {
  await waitForPrompt(page, /Browse the produce stall/);
  await page.keyboard.press("KeyE");
  const market = page.locator(".market-trading-modal");
  await expect(market).toBeVisible({ timeout: 8_000 });
  await market.getByRole("tab", { name: "Sell", exact: true }).click();
  const sellAllProduce = market.getByRole("button", { name: /Sell all produce/ });
  if (await sellAllProduce.count() > 0) {
    await sellAllProduce.click();
  } else {
    const sellAllItem = market.getByRole("button", { name: "Sell all of this item", exact: true });
    await expect(sellAllItem).toBeVisible();
    await sellAllItem.click();
  }
  await expect.poll(() => snapshot(page).then((state) => state.activeQuestStepProgress["step.act3_sell_item_village"]), { timeout: 12_000 })
    .toBe(1);
  expect((await snapshot(page)).activeQuestId).toBe("quest.act3_market_intro");
  await page.keyboard.press("Escape");
  await expect(market).not.toBeVisible({ timeout: 5_000 });
}

async function sellDockedFish(page: Page): Promise<void> {
  await waitForPrompt(page, /Trade with Maeve/);
  await page.keyboard.press("KeyE");
  const market = page.locator(".market-trading-modal");
  await expect(market).toBeVisible({ timeout: 8_000 });
  await market.getByRole("tab", { name: "Docked Fish", exact: true }).click();
  await expect(market.getByRole("button", { name: /Sell All Fish/ })).toBeVisible();
  await market.getByRole("button", { name: /Sell All Fish/ }).click();
  await expect.poll(() => snapshot(page).then((state) => state.cargoCount), { timeout: 12_000 }).toBe(0);
  await page.keyboard.press("Escape");
  await expect(market).not.toBeVisible({ timeout: 5_000 });
}

async function capture(page: Page, filename: string): Promise<void> {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename), fullPage: false });
}

test.describe("P12 Chrome continuous player route", () => {
  test.beforeEach(({ page }) => {
    // The route intentionally repeats long, real-input regional traversals;
    // keep the acceptance budget above the authored travel time without
    // accelerating player movement or skipping interactions.
    test.setTimeout(900_000);
    page.on("pageerror", (error) => console.error(`[browser pageerror] ${error.stack ?? error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") console.error(`[browser console] ${message.text()}`);
    });
    page.on("response", (response) => {
      if (response.status() === 404) console.error(`[browser 404] ${response.url()}`);
    });
  });

  test("completes the fresh-save farm → processing → river → village → harbor → lake → market route", async ({ page }) => {
    await page.goto("/?debug=1");
    await waitForDebug(page);
    await capture(page, "01-farm-start.png");

    expect((await snapshot(page)).activeQuestId).toBe("quest.act1_welcome");
    // The canonical spawn is already at the authored gate interaction point.
    await talkAtCurrentPosition(page, "npc.elspeth", "You have your grandfather's steady hands");
    expect((await snapshot(page)).activeQuestId).toBe("quest.act1_sow_wheat");

    // Reopening the same speaker is still an actual contextual interaction,
    // proving the prompt/dialogue handoff without replaying the reward.
    await talkAtCurrentPosition(page, "npc.elspeth", "Walk onto the prepared field soil");
    const cropPositions = await plantThreeWheat(page);
    console.info(`[p12] planted ${JSON.stringify(cropPositions)}`);
    await capture(page, "02-farm-planted.png");
    await talkAtCurrentPosition(page, "npc.elspeth", "Wonderful");
    expect((await snapshot(page)).activeQuestId).toBe("quest.act1_water_crops");

    for (const [index, crop] of cropPositions.entries()) await useCrop(page, crop, "Water", index === 0);
    await talkTo(page, "npc.elspeth", "Look how rich and dark");
    expect((await snapshot(page)).activeQuestId).toBe("quest.act2_harvest_and_compost");

    // Real traversal time has already advanced the game clock since planting.
    // Add only enough accelerated time to enter wheat's mature window; a flat
    // 200-minute jump can push the crop past the annual-crop wither threshold
    // before the player-led harvest interaction begins.
    await page.evaluate(() => window.__NEVA_DEBUG?.advanceGameMinutes(140));
    for (const [index, crop] of cropPositions.entries()) await useCrop(page, crop, "Harvest", index === 0);
    await processAtStation(page, "struct.starter_compost", "recipe.compost_worms", 360, /Cultivate Bait Worms/);
    console.info(`[p12] after compost ${JSON.stringify(await snapshot(page))}`);
    console.info(`[p12] quest hud ${await page.getByRole("complementary", { name: "Active Quest Objective" }).textContent().catch(() => "missing")}`);
    await talkTo(page, "npc.barnaby", "That's prime grain");
    expect((await snapshot(page)).activeQuestId).toBe("quest.act2_mill_and_craft_chum");

    await walkRoute(page, farmVillageRoute.points.slice(0, bridgeIndex - 1), undefined, 0.45);
    await walkAcrossBridge(page, farmVillageRoute.points, bridgeIndex);
    await walkRoute(page, farmVillageRoute.points.slice(bridgeIndex + 2, -1), undefined, 0.45);
    await walkToVillageMarketGateway(page);
    await walkVillageMarketToHomestead(page);
    await processAtStation(page, "struct.starter_mill", "recipe.wheat_to_grain", 5, /Mill.*Ground Grain/);
    await processAtStation(page, "struct.starter_mill", "recipe.wheat_to_grain", 5, /Mill.*Ground Grain/);

    await walkHomesteadToVillageMarket(page);
    await walkRoute(page, [...farmVillageRoute.points].reverse().slice(1, 6), undefined, 0.45);
    await walkAcrossBridgeToWest(page, farmVillageRoute.points, bridgeIndex);
    await walkRoute(page, farmVillageRoute.points.slice(0, 5).reverse(), undefined, 0.45);
    await walkToStarterWorkbench(page);
    await processAtStation(page, "struct.workbench", "recipe.craft_chum", 10, /Mix Chum/);
    await talkTo(page, "npc.barnaby", "Look at that chum bucket");
    expect((await snapshot(page)).activeQuestId).toBe("quest.act3_river_angler");

    await walkFromStarterWorkbenchToVillageRoute(page);
    await walkRoute(page, farmVillageRoute.points.slice(0, bridgeIndex - 1), undefined, 0.45);
    await walkAcrossBridge(page, farmVillageRoute.points, bridgeIndex);
    await capture(page, "03-bridge-river.png");
    await page.keyboard.press("Digit5");
    await catchTwoRiverFish(page);
    // Silas is stationed at the harbor pier. The completed river objective is
    // reported there before the player returns to the village market.
    await walkRoute(page, farmVillageRoute.points.slice(bridgeIndex + 2, -1), undefined, 0.45);
    await walkToVillageMarketGateway(page);
    await walkRoute(page, villageHarborRoute.points.slice(1, -1));
    await talkTo(page, "npc.silas", "Good strike");
    expect((await snapshot(page)).activeQuestId).toBe("quest.act3_market_intro");

    await walkTo(page, { x: 84, z: 54 });
    await walkTo(page, { x: 82, z: 50 });
    await walkTo(page, { x: 60, z: 50 });
    await walkRoute(page, [...villageHarborRoute.points].reverse().slice(1, -1));
    await walkToVillageMarketGateway(page);
    await sellVillageProduce(page);
    await talkTo(page, "npc.elspeth", "Look at that purse");
    expect((await snapshot(page)).activeQuestId).toBe("quest.act4_harbor_journey");

    await walkFromStarterFarmToVillageRoute(page);
    await walkRoute(page, farmVillageRoute.points.slice(1, bridgeIndex - 1), undefined, 0.45);
    await walkAcrossBridge(page, farmVillageRoute.points, bridgeIndex);
    await walkRoute(page, farmVillageRoute.points.slice(bridgeIndex + 2, -1), undefined, 0.45);
    await walkToVillageMarketGateway(page);
    await walkRoute(page, villageHarborRoute.points.slice(1, -1));
    await walkToMaeveDialogueApproach(page);
    await capture(page, "04-harbor-maeve.png");
    await talkAtCurrentPosition(page, "npc.maeve", "Now you understand");
    expect((await snapshot(page)).activeQuestId).toBe("quest.act4_restore_rowboat");

    await talkTo(page, "npc.silas", "She's cleared for sea");
    expect((await snapshot(page)).unlocked).toContain("boat.player_rowboat");
    expect((await snapshot(page)).activeQuestId).toBe("quest.act5_maiden_voyage");

    await walkToHarborDock(page);
    await waitForPrompt(page, /Board Wooden Rowboat/);
    await page.keyboard.press("KeyE");
    await expect(page.getByTestId("diagnostics")).toHaveAttribute("data-mode", "boat-driving");
    await capture(page, "05-rowboat-departure.png");

    // The lake route stays on the authored sailable water corridor. School
    // spawning is simulation-owned and is observed after arriving there.
    // The rowboat starts east of the dock, but the dock deck and pilings fill
    // the direct line to the first lake waypoint. Leave the mooring northward
    // and clear the dock's water-side footprint before turning west.
    await boatTo(page, { x: 82.4, z: 84 }, { tolerance: 1.2 });
    await boatTo(page, { x: 74, z: 84 }, { tolerance: 1.2 });
    await boatTo(page, { x: 70, z: 76 });
    await boatTo(page, { x: 48, z: 83 });
    await boatTo(page, { x: 28, z: 88 });
    await boatTo(page, lakePoint, { tolerance: 7 });
    await expect.poll(() => snapshot(page).then((state) => state.schoolIds.length), { timeout: 12_000 }).toBeGreaterThan(0);
    await capture(page, "06-lake-school.png");

    await waitForPrompt(page, /Chum School/);
    await page.keyboard.press("KeyE");
    await expect.poll(() => page.getByTestId("context-prompt").textContent().catch(() => ""), { timeout: 8_000 })
      .toContain("Hook Sport Fish");
    await page.keyboard.press("KeyE");
    await expect(page.getByTestId("diagnostics")).toHaveAttribute("data-mode", "sport-fishing");
    await capture(page, "07-sport-fishing.png");
    await landSportFishWithKeyboard(page);
    expect((await snapshot(page)).cargoCount).toBeGreaterThan(0);

    await boatTo(page, { x: 50, z: 82 });
    await boatTo(page, { x: 72, z: 76 });
    await boatTo(page, HARBOR_DOCK.boatPosition, { tolerance: 4.8 });
    await waitForPrompt(page, /Dock & Disembark/);
    await page.keyboard.press("KeyE");
    await expect(page.getByTestId("diagnostics")).toHaveAttribute("data-mode", "on-foot");
    await capture(page, "08-docked-cargo.png");

    await walkToHarborMarketTradeApproach(page);
    await sellDockedFish(page);
    await talkTo(page, "npc.silas", "Magnificent");
    expect((await snapshot(page)).activeQuestId).toBeNull();
    expect((await snapshot(page)).activeActId).toBe("epilogue_open");
    expect((await snapshot(page)).completedQuestIds).toHaveLength(10);

    expect(await page.evaluate(() => window.__NEVA_DEBUG?.saveNow() ?? false)).toBe(true);
    await page.reload();
    await waitForDebug(page);
    expect((await snapshot(page)).activeQuestId).toBeNull();
    expect((await snapshot(page)).activeActId).toBe("epilogue_open");
    expect((await snapshot(page)).completedQuestIds).toHaveLength(10);
    await capture(page, "09-reloaded-epilogue.png");

    await page.keyboard.press("KeyJ");
    const journal = page.getByRole("dialog", { name: /Guild Chronicle/i });
    await expect(journal).toBeVisible();
    await expect(journal).toContainText("Completed Chronicles");
    await expect(journal).toContainText("The Call of the Deep");
    await page.keyboard.press("Escape");
    await expect(journal).not.toBeVisible();
  });
});
