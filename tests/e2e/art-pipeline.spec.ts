import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const scenes = ["bridge", "farm", "harbor", "coast"] as const;

test("captures fixed 1440x900 art-direction candidates", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const output = path.resolve(process.cwd(), "tests/visual/candidates");
  fs.mkdirSync(output, { recursive: true });

  for (const scene of scenes) {
    await page.goto(`/?debug=1&artView=${scene}`);
    await expect(page.locator("#game-canvas")).toBeVisible();
    await expect(page.getByTestId("render-stats")).toContainText("Draws:");
    await page.waitForTimeout(1_500);
    await page.screenshot({ path: path.join(output, `${scene}-candidate.png`) });
  }

  for (const scene of scenes) {
    expect(fs.existsSync(path.join(output, `${scene}-candidate.png`))).toBe(true);
  }
});
