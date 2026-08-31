import { expect, test } from "@playwright/test";

const GOLD_SCENES = [
  { id: "bridge_river", maxDiffPixels: 250 },
  { id: "starter_farm", maxDiffPixels: 350 },
  { id: "harbor_market", maxDiffPixels: 400 },
  { id: "lighthouse_coast", maxDiffPixels: 300 }
] as const;

test.describe("deterministic visual-gold regression", () => {
  for (const scene of GOLD_SCENES) {
    test(`${scene.id} matches its approved game baseline`, async ({ page }) => {
      const browserErrors: string[] = [];
      page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
      });

      await page.goto(`/?goldTest=${scene.id}&seed=42`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.__NEVA_RENDER_READY === true);
      await page.evaluate(() => document.fonts.ready);

      expect(await page.evaluate(() => window.devicePixelRatio)).toBe(1);
      const canvas = page.locator("#game-canvas");
      await expect(canvas).toBeVisible();
      await expect(canvas).toHaveScreenshot(`${scene.id}-baseline.png`, {
        animations: "disabled",
        caret: "hide",
        maxDiffPixels: scene.maxDiffPixels,
        threshold: 0.2
      });
      expect(browserErrors).toEqual([]);
    });
  }
});
