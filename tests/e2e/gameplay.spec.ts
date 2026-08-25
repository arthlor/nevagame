// tests/e2e/gameplay.spec.ts
import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

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
    page.on("pageerror", (error) => console.error(`[browser pageerror] ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") console.error(`[browser console] ${message.text()}`);
    });
  });

  test("boots 3D world, renders HUD, and handles hotkey modals", async ({ page, browserName }) => {
    // 1. Navigate to local dev server
    await page.goto("/");

    // 2. Ensure WebGL canvas is mounted
    const canvas = page.locator("#game-canvas");
    await expect(canvas).toBeVisible();

    // 3. Verify HUD components (clock text depends on leftover save / offline progression)
    const clockTime = page.getByText(/\b\d{2}:\d{2}\b/);
    await expect(clockTime).toBeVisible();

    const goldBox = page.locator(".hud-top-right");
    await expect(goldBox).toBeVisible();
    await expect(goldBox).toContainText("100 G");

    // 4. Test opening Backpack Inventory through the player-facing hotkey.
    await page.keyboard.press("KeyI");
    const invModal = page.locator(".modal-content");
    await expect(invModal).toBeVisible();
    await expect(invModal).toContainText("Backpack Inventory");
    await expect(invModal).toContainText("Wheat Seeds");

    // Close Inventory
    const closeBtn = page.getByRole("button", { name: "Close" });
    await closeBtn.click();
    await expect(invModal).not.toBeVisible();

    // 5. Test opening Journal with its hotkey. Market access remains a
    // proximity-gated world interaction and is covered by simulation tests.
    await page.keyboard.press("KeyJ");
    const journalModal = page.locator(".modal-content");
    await expect(journalModal).toBeVisible();
    await expect(journalModal).toContainText("Captain & Farm Journal");
    await expect(journalModal).toContainText("Skill Proficiencies");

    const closeJournalBtn = page.getByRole("button", { name: /Close Journal/i });
    await closeJournalBtn.click();

    // 6. Wait 2 seconds for 3D world render stability and capture benchmark screenshot
    await page.waitForTimeout(2000);

    const screenshotsDir = path.resolve(process.cwd(), "output/playwright/gameplay");
    fs.mkdirSync(screenshotsDir, { recursive: true });
    const screenshotPath = path.join(screenshotsDir, `gameplay-${browserName}.png`);
    await page.screenshot({ path: screenshotPath });

    expect(fs.existsSync(screenshotPath)).toBe(true);
    console.info(`[E2E] Captured gameplay benchmark screenshot at: ${screenshotPath}`);
  });

  test("pressing I opens inventory", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/\b\d{2}:\d{2}\b/)).toBeVisible();

    await page.keyboard.press("KeyI");

    const invModal = page.locator(".modal-content");
    await expect(invModal).toBeVisible();
    await expect(invModal).toContainText("Backpack Inventory");
  });

  test("debug diagnostics stay within the representative render budget", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "The representative render budget is measured once in Chromium");
    await page.goto("/?debug=1");

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
