// tests/e2e/gameplay.spec.ts
import { test, expect, type Page } from "@playwright/test";
import path from "path";
import fs from "fs";
import { CURRENT_SCHEMA_VERSION } from "../../src/persistence/SaveSchema";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";

const highSceneBudget = (
  JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "tools/blender/asset_budgets.json"), "utf8")
  ) as {
    sceneProfiles: {
      high: {
        visibleTriangles: { targetMax: number };
        drawCalls: { preferredMax: number };
      };
    };
  }
).sceneProfiles.high;

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
    await expect(page.getByRole("heading", { name: "Neva", exact: true })).toBeVisible();
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
    await expect(page.getByRole("progressbar", { name: "Preparing the Neva world" })).toBeVisible();
    const totalAssets = Number(await progress.getAttribute("max"));
    expect(totalAssets).toBeGreaterThan(0);
    await expect.poll(async () => Number(await progress.getAttribute("value")), {
      timeout: 450_000
    }).toBe(totalAssets);
    expect(new Set(modelRequests).size).toBe(totalAssets);

    // 4. Verify HUD components (clock text depends on leftover save / offline progression)
    const clockTime = page.getByTestId("game-clock");
    await expect(clockTime).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "Neva", exact: true })).not.toBeVisible();

    const goldBox = page.locator(".hud-top-right");
    await expect(goldBox).toBeVisible();
    await expect(goldBox).toContainText("100 G");

    // 5. Test opening Backpack Inventory through the player-facing hotkey.
    await page.keyboard.press("KeyI");
    const invModal = page.locator(".modal-content");
    await expect(invModal).toBeVisible();
    await expect(invModal).toContainText("Backpack Inventory");
    await expect(invModal).toContainText("Wheat Seeds");

    // Close Inventory
    const closeBtn = page.getByRole("button", { name: "Close" });
    await closeBtn.click();
    await expect(invModal).not.toBeVisible();

    // 6. Test opening Journal with its hotkey. Market access remains a
    // proximity-gated world interaction and is covered by simulation tests.
    await page.keyboard.press("KeyJ");
    const journalModal = page.locator(".modal-content");
    await expect(journalModal).toBeVisible();
    await expect(journalModal).toContainText("Captain & Farm Journal");
    await expect(journalModal).toContainText("Skill Proficiencies");

    const closeJournalBtn = page.getByRole("button", { name: /Close Journal/i });
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
    await expect(invModal).toContainText("Backpack Inventory");
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
    await expect(continueButton).toContainText("Continue Neva", { timeout: 30_000 });
    await expect(page.getByLabel("Existing save summary")).toContainText(`Day ${rawSaveEnvelope.state.clock.dayCount}`);
    await expect(page.getByTestId("startup-new-game-button")).toBeVisible();

    await page.getByTestId("startup-new-game-button").click();
    await expect(page.getByRole("dialog", { name: "Start a new game?" })).toBeVisible();
    await expect(page.getByTestId("startup-new-game-confirm")).toBeVisible();
    await page.getByTestId("startup-new-game-cancel").click();
    await expect(page.getByRole("dialog", { name: "Start a new game?" })).not.toBeVisible();
    await expect(continueButton).toContainText("Continue Neva");

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
    await expect(page.getByRole("heading", { name: "Neva", exact: true })).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "Neva", exact: true })).toBeVisible();
    await expect(page.getByTestId("startup-start-button")).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(390);
    await page.screenshot({ path: path.join(screenshotsDir, "start-screen-narrow.png") });
  });

  test("shows an in-screen retry state when a catalog asset fails", async ({ page }) => {
    let blocked = false;
    await page.route("**/assets/models/*.glb", async (route) => {
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
    await expect(page.getByRole("alert")).toContainText("couldn’t prepare the world");
  });

  test("debug diagnostics stay within the representative render budget", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "The representative render budget is measured once in Chromium");
    test.setTimeout(480_000);
    await page.goto("/?debug=1");

    const diagnostics = page.getByTestId("diagnostics");
    await expect(diagnostics).toHaveAttribute("data-boot-ready", "true", { timeout: 450_000 });
    const stats = page.getByTestId("render-stats");
    await expect(stats).toBeVisible();
    await expect.poll(async () => stats.textContent()).toMatch(/Draws: [1-9]\d* \| Triangles: [1-9][\d,]*/);

    const text = (await stats.textContent()) ?? "";
    const match = text.match(/Draws: (\d+) \| Triangles: ([\d,]+)/);
    expect(match).not.toBeNull();

    const drawCalls = Number(match?.[1]);
    const triangles = Number(match?.[2].replaceAll(",", ""));
    expect(drawCalls).toBeLessThanOrEqual(highSceneBudget.drawCalls.preferredMax);
    expect(triangles).toBeLessThanOrEqual(highSceneBudget.visibleTriangles.targetMax);

    const objectStats = text.match(/Meshes: (\d+) \| Shadows: (\d+) \| Batches: (\d+) \| Instances: (\d+)/);
    console.info(
      `[E2E] Representative render budget: ${drawCalls} draw calls, ${triangles} triangles` +
      (objectStats
        ? `, ${objectStats[1]} meshes, ${objectStats[2]} shadow casters, ${objectStats[3]} batches, ${objectStats[4]} instanced meshes`
        : "")
    );
  });
});

async function startFromTitle(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Neva", exact: true })).toBeVisible();
  await page.getByTestId("startup-start-button").click();
  await expect(page.getByTestId("game-clock")).toBeVisible({ timeout: 450_000 });
}
