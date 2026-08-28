import { expect, test } from "@playwright/test";

test("probe runtime bridge deck with direct browser input", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/?debug=1");
  await expect(page.getByTestId("diagnostics")).toHaveAttribute("data-boot-ready", "true", { timeout: 450_000 });
  await expect.poll(() => page.evaluate(() => Boolean(window.__NEVA_DEBUG))).toBe(true);
  for (const x of [-7.24, -7.26, -7.28, -7.3, -7.32, -7.34]) {
    await page.evaluate((point) => window.__NEVA_DEBUG?.teleport(point.x, point.z), { x, z: -6.03 });
    await page.waitForTimeout(700);
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(3_500);
    await page.keyboard.up("KeyD");
    await page.waitForTimeout(200);
    const diagnostics = await page.getByTestId("diagnostics").getAttribute("data-player-x");
    const z = await page.getByTestId("diagnostics").getAttribute("data-player-z");
    console.info(`[bridge probe] start=(${x},-6.03) final=(${diagnostics},${z})`);
  }
});
