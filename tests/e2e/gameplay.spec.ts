// tests/e2e/gameplay.spec.ts
import { test, expect, type Page } from "@playwright/test";
import path from "path";
import fs from "fs";
import { CURRENT_SCHEMA_VERSION } from "../../src/persistence/SaveSchema";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { dayOfSeason } from "../../src/simulation/core/GameClock";


test.describe("Neva End-to-End Gameplay & Visual Verification", () => {
  test.beforeEach(({ page }) => {
    // A fresh browser preloads the complete catalog after the player chooses
    // to enter, so keep cold-start timing separate from interaction time.
    test.setTimeout(480_000);
    page.on("pageerror", (error) => console.error(`[browser pageerror] ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") console.error(`[browser console] ${message.text()}`);
    });
  });

  test("boots 3D world, renders HUD, and handles hotkey modals", async ({ page, browserName }) => {
    const modelRequests: string[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.startsWith("/assets/models/") && pathname.endsWith(".glb")) {
        modelRequests.push(pathname);
      }
    });

    // 1. Navigate to the title screen without starting the world loader.
    await page.goto("/");

    // 2. Ensure the canvas and welcoming title are mounted while the HUD and
    // gameplay catalog remain untouched.
    const canvas = page.locator("#game-canvas");
    await expect(canvas).toBeVisible();
    await expect(page.getByRole("heading", { name: "Neva Land", exact: true })).toBeVisible();
    const startButton = page.getByTestId("startup-start-button");
    await expect(startButton).toBeEnabled();
    await expect(page.getByTestId("game-clock")).not.toBeVisible();
    expect(modelRequests).toHaveLength(0);

    // 3. Start the real catalog-backed load and prove progress reaches its
    // dynamically derived catalog total before the title fades away.
    await startButton.click();
    await expect(startButton).toBeDisabled();
    const progress = page.getByTestId("startup-progress");
    await expect(progress).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Preparing the Neva Land world" })).toBeVisible();
    const totalAssets = Number(await progress.getAttribute("max"));
    expect(totalAssets).toBeGreaterThan(0);
    await expect.poll(async () => Number(await progress.getAttribute("value")), {
      timeout: 450_000
    }).toBe(totalAssets);
    expect(new Set(modelRequests).size).toBe(totalAssets);

    // 4. Verify HUD components (clock text depends on leftover save / offline progression)
    const clockTime = page.getByTestId("game-clock");
    await expect(clockTime).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "Neva Land", exact: true })).not.toBeVisible();

    const purse = page.getByLabel("Purse: 100 gold");
    await expect(purse).toBeVisible();
    await expect(purse).toContainText("100 G");
    await expect(page.locator(".hud-hotkey-ribbon-wood")).toHaveCount(0);
    await expect(page.getByTestId("tool-slot-5")).toHaveAttribute("aria-label", /Fishing rod/);

    // 5. Test opening Backpack Inventory through the player-facing hotkey.
    await page.keyboard.press("KeyI");
    const invModal = page.locator(".modal-content");
    await expect(invModal).toBeVisible();
    await expect(invModal).toContainText("Guild Satchel");
    await expect(invModal).toContainText("Wheat Seeds");

    // Close Inventory
    const closeBtn = invModal.getByRole("button").filter({ hasText: "Close Satchel" });
    await closeBtn.click();
    await expect(invModal).not.toBeVisible();

    // 6. Test opening Journal with its hotkey. Market access remains a
    // proximity-gated world interaction and is covered by simulation tests.
    await page.keyboard.press("KeyJ");
    const journalModal = page.locator(".modal-content");
    await expect(journalModal).toBeVisible();
    await expect(journalModal).toContainText("Cove Chronicle & Bestiary");
    await expect(journalModal).toContainText("Cove Masteries");

    const closeJournalBtn = journalModal.getByRole("button").filter({ hasText: "Close Chronicle" });
    await closeJournalBtn.click();

    // 7. Wait 2 seconds for 3D world render stability and capture benchmark screenshot
    await page.waitForTimeout(2000);

    const screenshotsDir = path.resolve(process.cwd(), "output/playwright/gameplay");
    fs.mkdirSync(screenshotsDir, { recursive: true });
    const screenshotPath = path.join(screenshotsDir, `gameplay-${browserName}.png`);
    await page.screenshot({ path: screenshotPath });

    expect(fs.existsSync(screenshotPath)).toBe(true);
    console.info(`[E2E] Captured gameplay benchmark screenshot at: ${screenshotPath}`);
  });

  test("pressing I opens inventory", async ({ page }) => {
    await startFromTitle(page);

    await page.keyboard.press("KeyI");

    const invModal = page.locator(".modal-content");
    await expect(invModal).toBeVisible();
    await expect(invModal).toContainText("Guild Satchel");
  });

  test("offers Continue and guarded New Game actions for an existing save", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("startup-start-button")).toBeEnabled({ timeout: 30_000 });

    const state = createInitialGameState(12345);
    state.clock.dayCount = 12;
    state.clock.currentMinute = 540;
    state.player.money = 777;
    state.metadata.lastSavedUtcMs = 1_725_000_000_000;
    const rawSaveEnvelope = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAtUtcMs: state.metadata.lastSavedUtcMs,
      state
    };
    await page.evaluate(async (rawEnvelope) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("neva_save_db", 1);
        request.onerror = () => reject(request.error ?? new Error("Could not open save storage"));
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains("game_saves")) {
            request.result.createObjectStore("game_saves");
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("game_saves", "readwrite");
          transaction.objectStore("game_saves").put(rawEnvelope, "primary_save");
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error ?? new Error("Could not seed save"));
        };
      });
    }, rawSaveEnvelope);

    await page.reload();
    const continueButton = page.getByTestId("startup-start-button");
    await expect(continueButton).toContainText("Continue Neva Land", { timeout: 30_000 });
    // The summary shows the day within the season, not the absolute day count.
    await expect(page.getByLabel("Existing save summary")).toContainText(
      `Day ${dayOfSeason(rawSaveEnvelope.state.clock.dayCount)}`
    );
    await expect(page.getByTestId("startup-new-game-button")).toBeVisible();

    await page.getByTestId("startup-new-game-button").click();
    await expect(page.getByRole("dialog", { name: "Start a new game?" })).toBeVisible();
    await expect(page.getByTestId("startup-new-game-confirm")).toBeVisible();
    await page.getByTestId("startup-new-game-cancel").click();
    await expect(page.getByRole("dialog", { name: "Start a new game?" })).not.toBeVisible();
    await expect(continueButton).toContainText("Continue Neva Land");

    await page.getByTestId("startup-options-button").click();
    await expect(page.getByRole("dialog", { name: "Options" })).toBeVisible();
    await expect(page.getByTestId("startup-fullscreen-button")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Controls" })).toBeVisible();
    await page.getByTestId("startup-options-close").click();
    await expect(page.getByRole("dialog", { name: "Options" })).not.toBeVisible();

    await continueButton.click();
    await expect(page.getByTestId("startup-progress")).toBeVisible();
    await expect(continueButton).toBeDisabled();
  });

  test("keeps the title layout readable at desktop and narrow sizes", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Neva Land", exact: true })).toBeVisible();
    await expect(page.getByTestId("startup-start-button")).toBeVisible();
    await page.keyboard.press("Tab");
    const focusedUtility = page.getByTestId("startup-options-button");
    await expect(focusedUtility).toBeFocused();
    await expect(focusedUtility).toHaveCSS("outline-style", "solid");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(1440);

    const screenshotsDir = path.resolve(process.cwd(), "output/playwright/start-screen");
    fs.mkdirSync(screenshotsDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotsDir, "start-screen-desktop.png") });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "Neva Land", exact: true })).toBeVisible();
    await expect(page.getByTestId("startup-start-button")).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(390);
    await page.screenshot({ path: path.join(screenshotsDir, "start-screen-narrow.png") });
  });

  test("shows an in-screen retry state when a catalog asset fails", async ({ page }) => {
    let blocked = false;
    await page.route("**/assets/models/*.glb*", async (route) => {
      if (!blocked) {
        blocked = true;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await page.goto("/");
    await page.getByTestId("startup-start-button").click();
    await expect(page.getByTestId("startup-retry-button")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole("alert")).toContainText("couldn’t finish loading the shoreline");
    await expect(page.locator("[data-startup-error-phase='assets']")).toBeVisible();
    await expect(page.locator("[data-startup-error-code='assets-failed']")).toBeVisible();
  });

  test("keeps loading past 30 seconds while cold model requests make progress", async ({ page }) => {
    test.setTimeout(240_000);
    await page.route("**/assets/models/*.glb*", async (route) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 1_250));
      await route.continue();
    });

    await page.goto("/");
    await page.getByTestId("startup-start-button").click();
    const progress = page.getByTestId("startup-progress");
    await expect(progress).toBeVisible();

    await page.waitForTimeout(31_000);
    await expect(page.getByTestId("startup-retry-button")).not.toBeVisible();
    await expect.poll(async () => Number(await progress.getAttribute("value")))
      .toBeGreaterThan(0);

    await expect(page.getByTestId("game-clock")).toBeVisible({ timeout: 180_000 });
  });

});

async function startFromTitle(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Neva Land", exact: true })).toBeVisible();
  await page.getByTestId("startup-start-button").click();
  await expect(page.getByTestId("game-clock")).toBeVisible({ timeout: 450_000 });
}
