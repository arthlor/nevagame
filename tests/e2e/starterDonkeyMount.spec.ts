import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import type { NevaDebugSnapshot } from "../../src/app/GameApp";
import { STARTER_DONKEY_ANCHOR } from "../../src/world/FarmLayout";

const DONKEY = {
  x: STARTER_DONKEY_ANCHOR.x,
  z: STARTER_DONKEY_ANCHOR.z
};

async function snapshot(page: Page): Promise<NevaDebugSnapshot> {
  return page.evaluate(() => {
    const debug = window.__NEVA_DEBUG;
    if (!debug) throw new Error("Missing __NEVA_DEBUG");
    return debug.snapshot();
  });
}

async function waitForRuntime(page: Page): Promise<void> {
  await expect(page.getByTestId("game-clock")).toBeVisible({ timeout: 450_000 });
  await expect.poll(async () => (await snapshot(page)).bootReady, { timeout: 60_000 }).toBe(true);
}

async function releaseMovement(page: Page, held: Set<string>): Promise<void> {
  for (const key of held) await page.keyboard.up(key);
  held.clear();
}

/** Uses the same camera basis as GameApp, with real keyboard input only. */
async function walkToDonkey(page: Page): Promise<void> {
  const held = new Set<string>();
  const startedAt = Date.now();
  try {
    while (Date.now() - startedAt < 20_000) {
      const state = await snapshot(page);
      if (state.mode !== "on-foot") throw new Error(`Expected on-foot mode, got ${state.mode}`);
      const dx = DONKEY.x - state.playerPosition.x;
      const dz = DONKEY.z - state.playerPosition.z;
      if (Math.hypot(dx, dz) <= 2.35) {
        await releaseMovement(page, held);
        return;
      }

      const forward = {
        x: -Math.sin(state.cameraYaw),
        z: -Math.cos(state.cameraYaw)
      };
      const right = { x: -forward.z, z: forward.x };
      const localX = dx * right.x + dz * right.z;
      const localZ = -(dx * forward.x + dz * forward.z);
      const desired = new Set<string>();
      if (Math.abs(localX) > 0.28) desired.add(localX < 0 ? "KeyA" : "KeyD");
      if (Math.abs(localZ) > 0.28) desired.add(localZ < 0 ? "KeyW" : "KeyS");
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
      await page.waitForTimeout(120);
    }
  } finally {
    await releaseMovement(page, held);
  }
  const state = await snapshot(page);
  throw new Error(`Could not reach the starter donkey: ${JSON.stringify(state.playerPosition)}`);
}

async function clearSave(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("neva_save_db");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not clear save storage"));
    request.onblocked = () => resolve();
  }));
}

test.describe("starter-farm donkey mount", () => {
  test("rides with real input, dismounts, saves, and reloads the donkey pose", async ({ page }) => {
    test.setTimeout(180_000);
    page.on("pageerror", (error) => console.error(`[browser pageerror] ${error.stack ?? error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") console.error(`[browser console] ${message.text()}`);
    });

    await page.goto("/");
    await expect(page.getByTestId("startup-start-button")).toBeVisible({ timeout: 30_000 });
    await clearSave(page);
    await page.reload();
    const startButton = page.getByTestId("startup-start-button");
    await expect(startButton).toContainText("Enter Neva Land", { timeout: 30_000 });
    await startButton.click();
    await waitForRuntime(page);

    const fresh = await snapshot(page);
    expect(fresh.activeMountId).toBeNull();
    expect(fresh.starterDonkeyPosition).toMatchObject({ x: DONKEY.x, z: DONKEY.z });

    await walkToDonkey(page);
    await expect.poll(async () => (await snapshot(page)).interactionTarget?.prompt, { timeout: 5_000 })
      .toBe("[E] Ride donkey");
    await page.keyboard.press("KeyE");
    await expect.poll(async () => (await snapshot(page)).activeMountId, { timeout: 5_000 })
      .toBe("mount.donkey_starter");
    await expect.poll(async () => (await snapshot(page)).mode, { timeout: 5_000 }).toBe("mounted");

    const mountedStart = await snapshot(page);
    const staminaBefore = mountedStart.playerSprintStamina;
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(380);
    await page.keyboard.up("KeyW");
    await page.keyboard.down("ShiftLeft");
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(620);
    await page.keyboard.up("KeyW");
    await page.keyboard.up("ShiftLeft");
    await expect.poll(async () => (await snapshot(page)).mode, { timeout: 5_000 }).toBe("mounted");
    const mountedEnd = await snapshot(page);
    expect(Math.hypot(
      mountedEnd.playerPosition.x - mountedStart.playerPosition.x,
      mountedEnd.playerPosition.z - mountedStart.playerPosition.z
    )).toBeGreaterThan(0.35);
    expect(mountedEnd.playerSprintStamina).toBe(staminaBefore);
    expect(mountedEnd.starterDonkeyPosition?.x).toBeCloseTo(mountedEnd.playerPosition.x, 3);
    expect(mountedEnd.starterDonkeyPosition?.z).toBeCloseTo(mountedEnd.playerPosition.z, 3);
    await expect.poll(async () => (await snapshot(page)).interactionTarget?.prompt, { timeout: 5_000 })
      .toBe("[E] Dismount");

    const screenshotDirectory = path.resolve(process.cwd(), "output/playwright/starter-donkey");
    fs.mkdirSync(screenshotDirectory, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDirectory, "mounted-gameplay.png") });
    const dismountSource = await snapshot(page);
    expect(dismountSource.activeMountId).toBe("mount.donkey_starter");
    await page.keyboard.press("KeyE");
    await expect.poll(async () => (await snapshot(page)).activeMountId, { timeout: 5_000 }).toBeNull();
    const dismounted = await snapshot(page);
    expect(dismounted.mode).toBe("on-foot");
    expect(dismounted.interactionTarget).toBeNull();
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(180);
    const blockedReboard = await snapshot(page);
    expect(blockedReboard.activeMountId).toBeNull();
    expect(blockedReboard.mode).toBe("on-foot");
    expect(blockedReboard.interactionTarget).toBeNull();
    await expect.poll(async () => (await snapshot(page)).interactionTarget?.prompt, { timeout: 5_000 })
      .toBe("[E] Ride donkey");
    expect(dismounted.starterDonkeyPosition?.x).toBeCloseTo(dismountSource.starterDonkeyPosition?.x ?? 0, 3);
    expect(dismounted.starterDonkeyPosition?.z).toBeCloseTo(dismountSource.starterDonkeyPosition?.z ?? 0, 3);

    expect(await page.evaluate(() => window.__NEVA_DEBUG?.saveNow() ?? false)).toBe(true);
    const savedDonkey = dismounted.starterDonkeyPosition;
    await page.reload();
    await expect(page.getByTestId("startup-start-button")).toContainText("Continue Neva Land", { timeout: 30_000 });
    await page.getByTestId("startup-start-button").click();
    await waitForRuntime(page);
    const restored = await snapshot(page);
    expect(restored.activeMountId).toBeNull();
    expect(restored.mode).toBe("on-foot");
    expect(restored.starterDonkeyPosition?.x).toBeCloseTo(savedDonkey?.x ?? 0, 3);
    expect(restored.starterDonkeyPosition?.z).toBeCloseTo(savedDonkey?.z ?? 0, 3);
  });
});
