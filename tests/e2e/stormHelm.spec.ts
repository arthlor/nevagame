import { expect, test, type Page } from "@playwright/test";
import type { NevaDebugApi, NevaDebugSnapshot } from "../../src/app/GameApp";
import type { GameCommand } from "../../src/simulation/core/contracts";
import { HARBOR_SILAS_ANCHOR } from "../../src/world/WorldAnchors";

async function snapshot(page: Page): Promise<NevaDebugSnapshot> {
  return page.evaluate(() => {
    const debug = window.__NEVA_DEBUG;
    if (!debug) throw new Error("Missing __NEVA_DEBUG");
    return debug.snapshot();
  });
}

async function boot(page: Page, start: string): Promise<void> {
  await page.goto(`/?debug=1&debugStart=${start}`);
  await expect(page.getByTestId("diagnostics"))
    .toHaveAttribute("data-boot-ready", "true", { timeout: 450_000 });
}

async function execute(page: Page, command: GameCommand): Promise<{ success: boolean; reason?: string }> {
  return page.evaluate((cmd) => {
    const api = (window as unknown as { __NEVA_DEBUG: NevaDebugApi }).__NEVA_DEBUG;
    return api.execute(cmd as GameCommand);
  }, command);
}

test.describe("storm helm", () => {
  test("shows the stability instrument under way in an open-water storm", async ({ page }) => {
    test.setTimeout(480_000);
    await boot(page, "storm-skiff");
    await page.keyboard.down("KeyW");
    const widget = page.locator('[data-testid="storm-helm"]');
    await expect(widget).toBeVisible({ timeout: 90_000 });
    await expect(widget).toContainText("Storm helm");
    await expect(page.locator('[data-testid="storm-helm-lives"]')).toContainText("5/5");
    // The gust timer exists only while a gust window is running.
    await expect(page.locator('[data-testid="storm-helm-timer"]')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('[data-testid="storm-helm-readout"]'))
      .toContainText(/Hold her head to the wind|Bring her bow into the gust/);
    await page.keyboard.up("KeyW");
  });

  test("tows a wrecked skiff to Neva Harbor and has Silas repair it", async ({ page }) => {
    test.setTimeout(480_000);
    await boot(page, "storm-skiff");
    expect(await execute(page, { type: "debug.damage-boat", boatId: "boat.player_skiff", steps: 5 }))
      .toMatchObject({ success: true });

    await expect(page.locator('[data-testid="maritime-vessel-console"]')).toContainText("Wrecked");
    const prompt = page.locator('[data-testid="context-prompt"]');
    await expect(prompt).toContainText("Tow to Neva Harbor", { timeout: 20_000 });
    await page.keyboard.press("KeyE");
    await expect.poll(async () => (await snapshot(page)).money).toBe(325);

    // The tow lands the captain at the harbor mooring; walk the pier to Silas.
    await page.evaluate(({ x, z }) => {
      (window as unknown as { __NEVA_DEBUG: NevaDebugApi }).__NEVA_DEBUG.teleport(x, z);
    }, { x: HARBOR_SILAS_ANCHOR.x, z: HARBOR_SILAS_ANCHOR.z });
    await expect(prompt).toContainText("Repair Coastal Fishing Skiff", { timeout: 20_000 });
    await page.keyboard.press("KeyE");
    await expect.poll(async () => (await snapshot(page)).money).toBe(175);
    await expect(prompt).not.toContainText("Repair Coastal Fishing Skiff");
  });
});
