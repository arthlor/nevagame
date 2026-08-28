import { expect, test } from "@playwright/test";

test("probe the Silas dialogue approach", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/?debug=1");
  await expect(page.getByTestId("diagnostics")).toHaveAttribute("data-boot-ready", "true", { timeout: 450_000 });
  await expect.poll(() => page.evaluate(() => Boolean(window.__NEVA_DEBUG))).toBe(true);
  await page.evaluate(() => window.__NEVA_DEBUG?.teleport(83, 58.5));
  await page.waitForTimeout(700);
  console.info(`[maeve probe] ${await page.getByTestId("context-prompt").textContent()}`);
});
