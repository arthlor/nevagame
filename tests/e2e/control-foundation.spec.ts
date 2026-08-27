import { expect, test, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { starterFarmsteadAnchor } from "../../src/world/FarmLayout";

const e2eBaseUrl = process.env.NEVA_E2E_BASE_URL ?? "http://127.0.0.1:3000";

interface PlayerPosition {
  x: number;
  y: number;
  z: number;
}

async function numericAttribute(locator: Locator, name: string): Promise<number> {
  const value = await locator.getAttribute(name);
  if (value === null || !Number.isFinite(Number(value))) {
    throw new Error(`Missing numeric diagnostic ${name}: ${value}`);
  }
  return Number(value);
}

async function readPosition(diagnostics: Locator): Promise<PlayerPosition> {
  return {
    x: await numericAttribute(diagnostics, "data-player-x"),
    y: await numericAttribute(diagnostics, "data-player-y"),
    z: await numericAttribute(diagnostics, "data-player-z")
  };
}

async function hold(page: Page, key: string, durationMs: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(durationMs);
  await page.keyboard.up(key);
}

async function loadScenario(
  page: Page,
  scenario: string,
  options: { debugActionTimeScale?: number } = {}
): Promise<Locator> {
  const actionTimeScale = options.debugActionTimeScale
    ? `&debugActionTimeScale=${options.debugActionTimeScale}`
    : "";
  await page.goto(`/?debug=1&debugStart=${scenario}${actionTimeScale}`);
  await expect(page.locator("#game-canvas")).toBeVisible();
  const diagnostics = page.getByTestId("diagnostics");
  await expect(diagnostics).toBeVisible({ timeout: 20_000 });
  await expect(diagnostics).toHaveAttribute("data-mode", /.+/);
  await expect(diagnostics).toHaveAttribute("data-boot-ready", "true", { timeout: 60_000 });
  return diagnostics;
}

async function loadUiScenario(page: Page, scenario: string): Promise<Locator> {
  await page.goto(`/?debug=1&debugStart=${scenario}`);
  await expect(page.locator("#game-canvas")).toBeVisible();
  const diagnostics = page.getByTestId("diagnostics");
  await expect(diagnostics).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("game-clock")).toBeVisible({ timeout: 20_000 });
  return diagnostics;
}

async function canvasPoint(page: Page, xRatio: number, yRatio: number) {
  const bounds = await page.locator("#game-canvas").boundingBox();
  if (!bounds) throw new Error("Game canvas has no bounding box");
  return {
    x: bounds.x + bounds.width * xRatio,
    y: bounds.y + bounds.height * yRatio
  };
}

async function enterWheatPlacement(page: Page): Promise<void> {
  await page.keyboard.press("KeyI");
  const inventory = page.locator(".modal-content");
  await expect(inventory).toContainText("Backpack Inventory");
  await inventory.locator(".inventory-slot", { hasText: "Wheat Seeds" }).first().click();
  await page.getByRole("button", { name: "Plant Wheat" }).click();
}

async function findValidPlacementPoint(page: Page, diagnostics: Locator) {
  const bounds = await page.locator("#game-canvas").boundingBox();
  if (!bounds) throw new Error("Game canvas has no bounding box");
  const samples = [0.5, 0.44, 0.56, 0.37, 0.63, 0.3, 0.7].flatMap((x) =>
    [0.5, 0.44, 0.56, 0.38, 0.62, 0.68, 0.74].map((y) => [x, y] as const)
  );
  for (const [x, y] of samples) {
    const point = {
      x: bounds.x + bounds.width * x,
      y: bounds.y + bounds.height * y
    };
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(80);
    if (await diagnostics.getAttribute("data-placement-valid") === "true") return point;
  }
  throw new Error("Could not find an on-screen valid starter-farm placement point");
}

test.describe("Neva control, physics, camera, and interaction foundation", () => {
  test.beforeEach(({ page }) => {
    test.setTimeout(120_000);
    page.on("pageerror", (error) => console.error(`[browser pageerror] ${error.stack ?? error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") console.error(`[browser console] ${message.text()}`);
    });
  });

  test("view-aligned movement never rotates the mouse camera, with zoom, overlays, and resize cross-browser", async ({ page, browserName }) => {
    test.setTimeout(120_000);
    const diagnostics = await loadScenario(page, "farm");
    const canvas = page.locator("#game-canvas");
    const orbitStart = await canvasPoint(page, 0.52, 0.42);
    const initialYaw = await numericAttribute(diagnostics, "data-camera-yaw");

    await page.mouse.move(orbitStart.x, orbitStart.y);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(orbitStart.x - 190, orbitStart.y + 15, { steps: 8 });
    await page.mouse.up({ button: "right" });
    await expect.poll(() => numericAttribute(diagnostics, "data-camera-yaw"))
      .not.toBeCloseTo(initialYaw, 1);
    const yawAfterLeftDrag = await numericAttribute(diagnostics, "data-camera-yaw");
    const leftTurnRadians = Math.atan2(
      Math.sin(yawAfterLeftDrag - initialYaw),
      Math.cos(yawAfterLeftDrag - initialYaw)
    );
    expect(leftTurnRadians).toBeGreaterThan(0.25);

    // Let the last mouse delta finish its authored smoothing before proving
    // that subsequent keyboard movement cannot change camera orientation.
    await page.waitForTimeout(700);
    const yawBeforeMove = await numericAttribute(diagnostics, "data-camera-yaw");
    const beforeMove = await readPosition(diagnostics);
    await hold(page, "KeyW", 560);
    const afterMove = await readPosition(diagnostics);
    const yawAfterMove = await numericAttribute(diagnostics, "data-camera-yaw");
    const dx = afterMove.x - beforeMove.x;
    const dz = afterMove.z - beforeMove.z;
    const distance = Math.hypot(dx, dz);
    const expectedForward = { x: -Math.sin(yawBeforeMove), z: -Math.cos(yawBeforeMove) };
    const alignment = (dx * expectedForward.x + dz * expectedForward.z) / Math.max(0.0001, distance);
    expect(distance).toBeGreaterThan(0.8);
    expect(alignment).toBeGreaterThan(0.72);
    expect(yawAfterMove).toBeCloseTo(yawBeforeMove, 3);

    const beforeStrafe = await readPosition(diagnostics);
    await hold(page, "KeyD", 420);
    const afterStrafe = await readPosition(diagnostics);
    const strafeX = afterStrafe.x - beforeStrafe.x;
    const strafeZ = afterStrafe.z - beforeStrafe.z;
    const strafeDistance = Math.hypot(strafeX, strafeZ);
    const expectedRight = { x: Math.cos(yawBeforeMove), z: -Math.sin(yawBeforeMove) };
    const strafeAlignment =
      (strafeX * expectedRight.x + strafeZ * expectedRight.z) / Math.max(0.0001, strafeDistance);
    // This deterministic farm start is close to authored fencing; the
    // direction contract only needs enough travel to sample D before contact.
    expect(strafeDistance).toBeGreaterThan(0.15);
    expect(strafeAlignment).toBeGreaterThan(0.72);
    expect(await numericAttribute(diagnostics, "data-camera-yaw")).toBeCloseTo(yawBeforeMove, 3);

    const screenshotsDir = path.resolve(process.cwd(), "output/playwright/control-foundation");
    fs.mkdirSync(screenshotsDir, { recursive: true });
    await page.screenshot({
      path: path.join(screenshotsDir, `camera-orbit-view-aligned-${browserName}.png`)
    });

    const distanceBeforeZoom = await numericAttribute(diagnostics, "data-camera-distance");
    const zoomPoint = await canvasPoint(page, 0.7, 0.45);
    await page.mouse.move(zoomPoint.x, zoomPoint.y);
    await page.mouse.wheel(0, 520);
    await expect.poll(() => numericAttribute(diagnostics, "data-camera-distance"))
      .toBeGreaterThan(distanceBeforeZoom + 0.2);
    expect(await numericAttribute(diagnostics, "data-camera-distance")).toBeLessThanOrEqual(16.51);

    await page.waitForTimeout(450);
    const beforeOverlay = await readPosition(diagnostics);
    await page.keyboard.press("KeyI");
    await expect(page.locator(".modal-content")).toContainText("Backpack Inventory");
    await hold(page, "KeyW", 500);
    const duringOverlay = await readPosition(diagnostics);
    expect(Math.hypot(duringOverlay.x - beforeOverlay.x, duringOverlay.z - beforeOverlay.z)).toBeLessThan(0.12);
    await page.locator(".inventory-slot").first().click();
    expect(await diagnostics.getAttribute("data-mode")).toBe("on-foot");
    const closeInventory = page.getByRole("button", { name: "Close" });
    if (await closeInventory.isVisible()) await closeInventory.click();
    await expect(page.locator(".modal-content")).not.toBeVisible();

    await page.setViewportSize({ width: 1050, height: 720 });
    await expect(canvas).toBeVisible();
    await expect.poll(async () => (await canvas.boundingBox())?.width).toBeCloseTo(1050, 0);
    await expect.poll(async () => (await canvas.boundingBox())?.height).toBeCloseTo(720, 0);
  });

  test("field-journal HUD stays compact and pause exposes contextual records", async ({ page }) => {
    const diagnostics = await loadUiScenario(page, "farm");
    const topLeft = page.locator(".hud-top-left");
    const topRight = page.locator(".hud-top-right");
    const toolBelt = page.getByRole("toolbar", { name: "Tool belt" }).last();
    const vitals = page.locator(".hud-vitals");
    const contextPrompt = page.locator("[data-testid=context-prompt]");
    const screenshotsDir = path.resolve(process.cwd(), "output/playwright/ui-audit");
    fs.mkdirSync(screenshotsDir, { recursive: true });

    await expect(page.locator(".hud-hotkey-ribbon-wood")).toHaveCount(0);
    await expect(page.getByTestId("tool-slot-5")).toHaveAttribute("aria-label", /Fishing rod/);
    await expect(page.locator(".hud-navigation-bar")).toHaveCount(0);
    await expect(page.locator(".quest-tracker-hud-wood")).toHaveCount(1);
    await expect(page.locator(".quest-tracker-hud-wood")).toContainText("The Inherited Soil");
    await page.screenshot({ path: path.join(screenshotsDir, "hud-desktop.png") });

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1050, height: 720 },
      { width: 390, height: 844 }
    ]) {
      await page.setViewportSize(viewport);
      const boxes = await Promise.all([
        topLeft.boundingBox(),
        topRight.boundingBox(),
        toolBelt.boundingBox(),
        vitals.boundingBox()
      ]);
      if (!boxes[0] || !boxes[1] || !boxes[2] || !boxes[3]) throw new Error("HUD surface has no layout box");
      const leftBox = boxes[0];
      const rightBox = boxes[1];
      const beltBox = boxes[2];
      const vitalsBox = boxes[3];
      const leftRight = leftBox.x + leftBox.width;
      const leftBottom = leftBox.y + leftBox.height;
      const rightLeft = rightBox.x;
      const beltTop = beltBox.y;
      const beltBottom = beltBox.y + beltBox.height;
      const promptBox = await contextPrompt.boundingBox();
      const overlap = (
        a: { x: number; y: number; width: number; height: number },
        b: { x: number; y: number; width: number; height: number }
      ) =>
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y;
      if (viewport.width > 760) {
        expect(leftRight).toBeLessThanOrEqual(rightLeft + 1);
      } else {
        expect(overlap(leftBox, rightBox)).toBe(false);
      }
      expect(beltTop).toBeGreaterThan(leftBottom);
      expect(beltBottom).toBeLessThanOrEqual(viewport.height + 1);
      expect(vitalsBox.y).toBeGreaterThan(leftBottom);
      expect(overlap(vitalsBox, beltBox)).toBe(false);
      expect(overlap(vitalsBox, leftBox)).toBe(false);
      expect(overlap(vitalsBox, rightBox)).toBe(false);
      if (promptBox) {
        expect(promptBox.y + promptBox.height).toBeLessThanOrEqual(beltTop + 1);
        expect(overlap(vitalsBox, promptBox)).toBe(false);
      }
      if (viewport.width === 390) {
        await page.screenshot({ path: path.join(screenshotsDir, "hud-mobile-390.png") });
      }
    }

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByRole("button", { name: "Open game menu" }).click();
    const pause = page.getByRole("dialog", { name: "Pause" });
    await expect(pause).toBeVisible();
    await expect(pause.getByRole("button", { name: /^Inventory/ })).toBeVisible();
    await expect(pause.getByRole("button", { name: /^Journal/ })).toBeVisible();
    await expect(pause.getByRole("button", { name: /^Map/ })).toBeVisible();
    await expect(pause.getByRole("button", { name: /^Ledger/ })).toBeVisible();
    await page.screenshot({ path: path.join(screenshotsDir, "pause-menu.png") });

    await pause.getByRole("button", { name: /^Journal/ }).click();
    await expect(page.getByRole("dialog", { name: /Captain's journal/i })).toBeVisible();
    await page.screenshot({ path: path.join(screenshotsDir, "journal.png") });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: /Captain's journal/i })).not.toBeVisible();
    await expect(pause).toBeVisible();

    await pause.getByRole("button", { name: /^Map/ }).click();
    await expect(page.getByRole("dialog", { name: "Coastal map" })).toBeVisible();
    await page.screenshot({ path: path.join(screenshotsDir, "map.png") });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Coastal map" })).not.toBeVisible();
    await expect(pause).toBeVisible();
    expect(await pause.evaluate((element) => element.contains(document.activeElement))).toBe(true);

    await pause.getByRole("button", { name: /^Ledger/ }).click();
    await expect(page.getByRole("dialog", { name: /Captain's ledger/i })).toBeVisible();
    await page.screenshot({ path: path.join(screenshotsDir, "ledger.png") });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: /Captain's ledger/i })).not.toBeVisible();
    await expect(pause).toBeVisible();
    expect(await pause.evaluate((element) => element.contains(document.activeElement))).toBe(true);

    await pause.getByRole("button", { name: /^Inventory/ }).click();
    const inventory = page.getByRole("dialog", { name: "Backpack Inventory" });
    await expect(inventory).toBeVisible();
    await expect(inventory.locator(".inventory-slot").first()).toHaveAttribute("aria-pressed");
    await page.screenshot({ path: path.join(screenshotsDir, "inventory.png") });
    await page.keyboard.press("Escape");
    await expect(inventory).not.toBeVisible();
    await expect(pause).toBeVisible();
    expect(await pause.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(pause).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Open game menu" })).toBeFocused();
    await expect(diagnostics).toHaveAttribute("data-mode", "on-foot");
  });

  test("grounded jump and sprint stamina work through real keyboard input", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "The deep traversal flow is covered once in Chromium");
    const diagnostics = await loadScenario(page, "farm");
    const start = await readPosition(diagnostics);

    await page.keyboard.press("Space");
    // Observe the jump arc before waiting on the short-lived airborne flag;
    // on software rendering the flag can transition again between assertions.
    await expect.poll(() => numericAttribute(diagnostics, "data-player-y"), { timeout: 2_000 })
      .toBeGreaterThan(start.y + 0.2);
    await expect(diagnostics).toHaveAttribute("data-player-grounded", "false");
    await expect(diagnostics).toHaveAttribute("data-player-grounded", "true", { timeout: 4_000 });

    const staminaBefore = await numericAttribute(diagnostics, "data-sprint-stamina");
    await page.keyboard.down("Shift");
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(1_100);
    await page.keyboard.up("KeyW");
    await page.keyboard.up("Shift");

    const staminaAfter = await numericAttribute(diagnostics, "data-sprint-stamina");
    // The authored farm gate can end forward motion early; the fixed-step
    // unit suite owns exact drain math while this browser gate proves that
    // held sprint input consumes a meaningful amount of canonical stamina.
    expect(staminaAfter).toBeLessThan(staminaBefore - 6);
    const staminaHud = page.getByTestId("sprint-stamina");
    await expect(staminaHud).toBeVisible();
    await expect(staminaHud).toHaveAttribute("aria-valuenow", /\d+/);

    const screenshotsDir = path.resolve(process.cwd(), "output/playwright/control-foundation");
    fs.mkdirSync(screenshotsDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotsDir, "jump-sprint-stamina.png") });

    await expect.poll(() => numericAttribute(diagnostics, "data-sprint-stamina"), { timeout: 5_000 })
      .toBeGreaterThan(99.9);
    await expect(staminaHud).not.toBeVisible();
  });

  test("walk, sprint, reversal, and stop keep resolved gait and presentation stable", async ({ page }) => {
    const diagnostics = await loadScenario(page, "farm");
    await page.keyboard.down("KeyW");
    await expect.poll(() => numericAttribute(diagnostics, "data-player-speed")).toBeGreaterThan(2.8);
    await expect(diagnostics).toHaveAttribute("data-player-requested-gait", "walk");
    await expect(diagnostics).toHaveAttribute("data-player-animation", /walk/);

    await page.keyboard.down("Shift");
    await expect.poll(() => numericAttribute(diagnostics, "data-player-speed")).toBeGreaterThan(5.0);
    await expect(diagnostics).toHaveAttribute("data-player-requested-gait", "run");
    await expect(diagnostics).toHaveAttribute("data-player-animation", /run/);
    await page.keyboard.up("Shift");
    await page.keyboard.up("KeyW");

    const headingBeforeReverse = await numericAttribute(diagnostics, "data-player-heading");
    await page.keyboard.down("KeyS");
    await expect.poll(async () => {
      const headingAfterReverse = await numericAttribute(diagnostics, "data-player-heading");
      return Math.abs(Math.atan2(
        Math.sin(headingAfterReverse - headingBeforeReverse),
        Math.cos(headingAfterReverse - headingBeforeReverse)
      ));
    }).toBeGreaterThan(2.2);
    await expect.poll(() => numericAttribute(diagnostics, "data-player-speed")).toBeGreaterThan(2.8);

    await expect.poll(() => diagnostics.evaluate((element) => {
      const numeric = (name: string): number => Number(element.getAttribute(name));
      return Math.hypot(
        numeric("data-player-x") - numeric("data-presented-player-x"),
        numeric("data-player-z") - numeric("data-presented-player-z")
      );
    })).toBeLessThan(0.15);
    await page.keyboard.up("KeyS");
    await expect.poll(() => numericAttribute(diagnostics, "data-player-speed")).toBeLessThan(0.05);
    await expect(diagnostics).toHaveAttribute("data-player-animation", /stop|idle/);
  });

  test("reduced motion retains essential locomotion clips", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const diagnostics = await loadScenario(page, "farm");
    await page.keyboard.down("KeyW");
    await expect.poll(() => numericAttribute(diagnostics, "data-player-speed")).toBeGreaterThan(2.8);
    await expect(diagnostics).toHaveAttribute("data-player-animation", /walk/);
    await page.keyboard.up("KeyW");
  });

  test("repeatable walk-turn-sprint-stop-interact motion capture", async ({ browser, browserName }) => {
    test.setTimeout(90_000);
    test.skip(browserName !== "chromium", "The reference motion capture is recorded once in Chromium");
    const outputDirectory = path.resolve(process.cwd(), "output/playwright/control-foundation");
    const shouldRecord = process.env.NEVA_MOTION_RECORD === "1";
    if (shouldRecord) fs.mkdirSync(outputDirectory, { recursive: true });
    const context = await browser.newContext({
      baseURL: e2eBaseUrl,
      viewport: { width: 1280, height: 720 },
      recordVideo: shouldRecord
        ? { dir: outputDirectory, size: { width: 1280, height: 720 } }
        : undefined
    });
    const page = await context.newPage();
    const diagnostics = await loadScenario(page, "motion-capture");
    await expect(diagnostics).toHaveAttribute("data-crop-count", "1");

    await hold(page, "KeyW", 620);
    await hold(page, "KeyS", 700);
    await hold(page, "KeyD", 520);
    await hold(page, "KeyA", 600);
    await page.keyboard.down("Shift");
    await hold(page, "KeyW", 560);
    await hold(page, "KeyS", 650);
    await page.keyboard.up("Shift");
    await expect.poll(() => numericAttribute(diagnostics, "data-player-speed")).toBeLessThan(0.05);

    await page.keyboard.press("KeyE");
    await expect(diagnostics).toHaveAttribute("data-player-animation", "harvest");
    await expect.poll(() => diagnostics.getAttribute("data-crop-count"), { timeout: 5_000 }).toBe("0");

    const video = page.video();
    await context.close();
    if (shouldRecord) {
      if (!video) throw new Error("NEVA_MOTION_RECORD requires Playwright video capture");
      await video.saveAs(path.join(outputDirectory, "motion-acceptance.webm"));
    }
  });

  test("player and camera stay outside authored farmhouse collision", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Deep collision flow is covered once; control smoke runs in every engine");
    const diagnostics = await loadScenario(page, "farmhouse-south");
    const start = await readPosition(diagnostics);
    await hold(page, "KeyA", 2400);
    const blocked = await readPosition(diagnostics);
    const farmhouse = starterFarmsteadAnchor("farmhouse")!;
    const toFarmhouseLocal = (position: PlayerPosition) => {
      const deltaX = position.x - farmhouse.x;
      const deltaZ = position.z - farmhouse.z;
      return {
        x: deltaX * Math.cos(farmhouse.rotationY) - deltaZ * Math.sin(farmhouse.rotationY),
        z: deltaX * Math.sin(farmhouse.rotationY) + deltaZ * Math.cos(farmhouse.rotationY)
      };
    };
    const startLocal = toFarmhouseLocal(start);
    const blockedLocal = toFarmhouseLocal(blocked);
    expect(startLocal.x - blockedLocal.x).toBeGreaterThan(0.8);
    expect(startLocal.x - blockedLocal.x).toBeLessThan(2.2);
    // The scaled 3.3 m facade half-extent plus the player capsule is just over 4 m.
    expect(blockedLocal.x).toBeGreaterThan(4);
    expect(Math.abs(blockedLocal.z)).toBeLessThan(3.1);

    const cameraDiagnostics = await loadScenario(page, "farmhouse-north");
    const cameraPlayer = await readPosition(cameraDiagnostics);
    const orbitStart = await canvasPoint(page, 0.5, 0.42);
    await page.mouse.move(orbitStart.x, orbitStart.y);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(orbitStart.x + 350, orbitStart.y, { steps: 10 });
    await page.mouse.up({ button: "right" });
    await page.waitForTimeout(700);
    const cameraX = await numericAttribute(cameraDiagnostics, "data-camera-x");
    const cameraY = await numericAttribute(cameraDiagnostics, "data-camera-y");
    const cameraZ = await numericAttribute(cameraDiagnostics, "data-camera-z");
    expect(cameraX).toBeGreaterThanOrEqual(cameraPlayer.x - 0.05);
    expect(cameraX).toBeLessThan(cameraPlayer.x + 2.4);
    expect(cameraY).toBeGreaterThan(cameraPlayer.y + 0.5);
    expect(Math.hypot(cameraX - cameraPlayer.x, cameraZ - cameraPlayer.z)).toBeGreaterThan(0.5);
  });

  test("E and LMB share the harbor target, and boat input returns cleanly to on-foot mode", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Deep boat flow is covered once; control smoke runs in every engine");
    const prompt = page.locator(".interaction-wood-banner");
    let diagnostics = await loadScenario(page, "harbor");
    await expect(prompt).toContainText("Board Wooden Rowboat");

    await page.keyboard.press("KeyI");
    await expect(page.locator(".modal-content")).toBeVisible();
    const coveredCanvasPoint = await canvasPoint(page, 0.5, 0.5);
    await page.mouse.click(coveredCanvasPoint.x, coveredCanvasPoint.y);
    await expect(diagnostics).toHaveAttribute("data-mode", "on-foot");
    await expect(diagnostics).toHaveAttribute("data-active-boat", "none");
    await page.getByRole("button", { name: "Close" }).click();
    await expect(prompt).toContainText("Board Wooden Rowboat");

    await page.keyboard.press("KeyE");
    await expect(diagnostics).toHaveAttribute("data-mode", "boat-driving");
    await page.waitForTimeout(350);
    await page.keyboard.press("KeyE");
    await expect(diagnostics).toHaveAttribute("data-mode", "on-foot");
    await expect(diagnostics).toHaveAttribute("data-active-boat", "none");

    diagnostics = await loadScenario(page, "harbor");
    await expect(prompt).toContainText("Board Wooden Rowboat");
    const clickPoint = await canvasPoint(page, 0.52, 0.46);
    await page.mouse.click(clickPoint.x, clickPoint.y);
    await expect(diagnostics).toHaveAttribute("data-mode", "boat-driving");
    await page.waitForTimeout(350);
    await page.keyboard.press("KeyE");
    await expect(diagnostics).toHaveAttribute("data-mode", "on-foot");

    diagnostics = await loadScenario(page, "boat-driving");
    await expect(diagnostics).toHaveAttribute("data-mode", "boat-driving");

    const start = await readPosition(diagnostics);
    const initialHeading = await numericAttribute(diagnostics, "data-player-heading");
    await page.keyboard.down("KeyW");
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(250);
    await expect(diagnostics).toHaveAttribute("data-player-animation", "row");
    await page.keyboard.up("KeyD");
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(250);
    const steered = await readPosition(diagnostics);
    const heading = await numericAttribute(diagnostics, "data-player-heading");
    expect(Math.hypot(steered.x - start.x, steered.z - start.z)).toBeGreaterThan(0.25);
    expect(Math.abs(heading - initialHeading)).toBeGreaterThan(0.015);
    await expect(diagnostics).toHaveAttribute("data-player-animation", "rowboat_idle");
  });

  test("mouse crop placement previews, cancels before commit, and commits exactly once after resize", async ({ page, browserName }) => {
    test.setTimeout(90_000);
    test.skip(browserName !== "chromium", "Deep placement flow is covered once; resize smoke runs in every engine");
    const diagnostics = await loadScenario(page, "farm", { debugActionTimeScale: 10 });
    await page.setViewportSize({ width: 1180, height: 760 });

    await enterWheatPlacement(page);
    const screenshotsDir = path.resolve(process.cwd(), "output/playwright/ui-audit");
    fs.mkdirSync(screenshotsDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotsDir, "farm-placement.png") });
    await expect(diagnostics).toHaveAttribute("data-mode", "farm-placement");
    let point = await findValidPlacementPoint(page, diagnostics);
    await expect(diagnostics).toHaveAttribute("data-placement-valid", "true");
    await page.mouse.click(point.x, point.y);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(450);
    await expect(diagnostics).toHaveAttribute("data-crop-count", "0");

    await enterWheatPlacement(page);
    point = await findValidPlacementPoint(page, diagnostics);
    await page.mouse.click(point.x, point.y);
    await page.mouse.move(point.x + 180, point.y - 120);
    const actionSnapshot = await page.waitForFunction(() => {
      const element = document.querySelector<HTMLElement>("[data-testid='diagnostics']");
      if (!element || element.getAttribute("data-action-target-x") === "none") return null;
      const numeric = (name: string): number => Number(element.getAttribute(name));
      return {
        targetX: numeric("data-action-target-x"),
        targetZ: numeric("data-action-target-z"),
        placementX: numeric("data-placement-target-x"),
        placementZ: numeric("data-placement-target-z"),
        playerX: numeric("data-player-x"),
        playerZ: numeric("data-player-z"),
        heading: numeric("data-player-heading")
      };
    }).then((handle) => handle.jsonValue()) as {
      targetX: number;
      targetZ: number;
      placementX: number;
      placementZ: number;
      playerX: number;
      playerZ: number;
      heading: number;
    };
    const { targetX, targetZ, heading } = actionSnapshot;
    expect({ x: targetX, z: targetZ }).toEqual({
      x: actionSnapshot.placementX,
      z: actionSnapshot.placementZ
    });
    const targetHeading = Math.atan2(
      targetX - actionSnapshot.playerX,
      targetZ - actionSnapshot.playerZ
    );
    expect(Math.abs(Math.atan2(Math.sin(heading - targetHeading), Math.cos(heading - targetHeading))))
      .toBeLessThan(0.02);
    await expect.poll(() => diagnostics.getAttribute("data-crop-count"), { timeout: 5_000 }).toBe("1");
    await page.waitForTimeout(750);
    await expect(diagnostics).toHaveAttribute("data-crop-count", "1");
    await expect(diagnostics).toHaveAttribute("data-mode", "on-foot");
  });

  test("sport fishing supports held keyboard and mouse controls without camera-orbit conflict", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Deep fishing flow is covered once; control smoke runs in every engine");
    const diagnostics = await loadScenario(page, "sport-fishing");
    await expect(diagnostics).toHaveAttribute("data-mode", "sport-fishing");
    await expect(page.getByRole("region", { name: "Fishing encounter" })).toBeVisible();
    const screenshotsDir = path.resolve(process.cwd(), "output/playwright/ui-audit");
    fs.mkdirSync(screenshotsDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotsDir, "fishing-hud.png") });

    await page.keyboard.down("KeyW");
    await expect(diagnostics).toHaveAttribute("data-fishing-reeling", "true");
    await expect(diagnostics).toHaveAttribute("data-player-animation", "reel");
    await page.keyboard.up("KeyW");
    await expect(diagnostics).toHaveAttribute("data-fishing-reeling", "false");

    await page.keyboard.down("KeyS");
    await expect(diagnostics).toHaveAttribute("data-fishing-slacking", "true");
    await expect(diagnostics).toHaveAttribute("data-player-animation", "slack");
    await page.keyboard.up("KeyS");
    await expect(diagnostics).toHaveAttribute("data-fishing-slacking", "false");

    await page.keyboard.down("Space");
    await expect(diagnostics).toHaveAttribute("data-fishing-bracing", "true");
    await expect(diagnostics).toHaveAttribute("data-player-animation", "brace");
    await page.keyboard.up("Space");
    await expect(diagnostics).toHaveAttribute("data-fishing-bracing", "false");

    await page.keyboard.down("KeyA");
    await expect.poll(() => numericAttribute(diagnostics, "data-fishing-direction")).toBeLessThan(-0.2);
    await page.keyboard.up("KeyA");
    await page.keyboard.down("KeyD");
    await expect.poll(() => numericAttribute(diagnostics, "data-fishing-direction")).toBeGreaterThan(0.2);
    await page.keyboard.up("KeyD");

    const point = await canvasPoint(page, 0.56, 0.45);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down({ button: "left" });
    await expect(diagnostics).toHaveAttribute("data-fishing-reeling", "true");
    await page.mouse.up({ button: "left" });
    await expect(diagnostics).toHaveAttribute("data-fishing-reeling", "false");

    const yawBeforeRightDrag = await numericAttribute(diagnostics, "data-camera-yaw");
    await page.mouse.down({ button: "right" });
    await expect(diagnostics).toHaveAttribute("data-fishing-slacking", "true");
    await page.mouse.move(point.x + 150, point.y + 20, { steps: 6 });
    await page.mouse.up({ button: "right" });
    await expect(diagnostics).toHaveAttribute("data-fishing-slacking", "false");
    expect(await numericAttribute(diagnostics, "data-camera-yaw")).toBeCloseTo(yawBeforeRightDrag, 1);
  });
});
