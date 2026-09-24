import { expect, test, type Page } from "@playwright/test";
import type { NevaDebugApi } from "../../src/app/GameApp";
import { WorldLayout } from "../../src/world/WorldLayout";
import { STARTER_FARM_LAYOUT } from "../../src/world/FarmLayout";

async function teleport(page: Page, x: number, z: number): Promise<void> {
  await page.evaluate(({ x, z }) => {
    (window as unknown as { __NEVA_DEBUG: NevaDebugApi }).__NEVA_DEBUG.teleport(x, z);
  }, { x, z });
}

test("the farm offers Plant without a standing action bar", async ({ page }) => {
  test.setTimeout(480_000);
  await page.goto("/?debug=1&debugStart=farm");
  const diagnostics = page.getByTestId("diagnostics");
  await expect(diagnostics).toHaveAttribute("data-boot-ready", "true", { timeout: 450_000 });
  await expect(page.getByTestId("smart-contextual-toolbar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Plant", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Plant", exact: true }).click();
  await expect(diagnostics).toHaveAttribute("data-mode", "farm-placement");
  await expect(page.getByTestId("planting-seed-dock")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(diagnostics).toHaveAttribute("data-mode", "on-foot");
});

test("a dry harvestable crop offers Water as a second action", async ({ page }) => {
  test.setTimeout(480_000);
  await page.goto("/?debug=1&debugStart=farm");
  await expect(page.getByTestId("diagnostics"))
    .toHaveAttribute("data-boot-ready", "true", { timeout: 450_000 });
  await teleport(page, STARTER_FARM_LAYOUT.origin.x, STARTER_FARM_LAYOUT.origin.z);
  const planted = await page.evaluate(() =>
    (window as unknown as { __NEVA_DEBUG: NevaDebugApi }).__NEVA_DEBUG.execute({
      type: "crop.plant-near", farmId: "farm.starter_garden", cropId: "crop.wheat"
    })
  );
  expect(planted.success).toBe(true);

  const otherActions = page.locator(".guild-context-more");
  for (let step = 0; step < 12 && await otherActions.count() === 0; step += 1) {
    await page.evaluate(() =>
      (window as unknown as { __NEVA_DEBUG: NevaDebugApi }).__NEVA_DEBUG.advanceGameMinutes(30)
    );
    await page.waitForTimeout(400);
  }
  await expect(page.getByTestId("context-prompt")).toContainText("Harvest Wheat");
  await expect(otherActions).toBeVisible();
  await otherActions.locator("summary").click();
  const water = page.getByRole("button", { name: /Water Wheat.*5 Work/ });
  await expect(water).toBeVisible();
  await water.click();
  await expect(page.getByTestId("farming-action-status")).toContainText("Watering soil");
});

test("fishable water takes out the rod through the contextual cast", async ({ page }) => {
  test.setTimeout(480_000);
  await page.goto("/?debug=1&debugStart=farm");
  const diagnostics = page.getByTestId("diagnostics");
  await expect(diagnostics).toHaveAttribute("data-boot-ready", "true", { timeout: 450_000 });
  const river = WorldLayout.riverSectionAt(38);
  await teleport(page, river.centerX - river.leftWaterWidth - 2, 38);
  await expect(page.getByTestId("smart-contextual-toolbar")).toHaveCount(0);
  await expect(page.getByTestId("context-prompt")).toContainText("Cast line");
  await page.keyboard.press("KeyE");
  await expect(diagnostics).toHaveAttribute("data-mode", "basic-fishing");
  await page.keyboard.press("Escape");
  await expect(diagnostics).toHaveAttribute("data-mode", "on-foot");
});

test("touch shows only contextual farm actions with a usable Plant target", async ({ browser }) => {
  test.setTimeout(300_000);
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1
  });
  try {
    const page = await context.newPage();
    await page.goto("/?debug=1&debugStart=farm");
    await expect(page.getByTestId("diagnostics"))
      .toHaveAttribute("data-boot-ready", "true", { timeout: 280_000 });
    await expect(page.getByTestId("smart-contextual-toolbar")).toHaveCount(0);
    const plant = page.getByRole("button", { name: "Plant", exact: true });
    await expect(plant).toBeVisible();
    const size = await plant.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole("button", { name: "Lure", exact: true })).toHaveCount(0);
    await plant.tap();
    await expect(page.getByTestId("planting-seed-dock")).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).tap();
    const river = WorldLayout.riverSectionAt(38);
    await teleport(page, river.centerX - river.leftWaterWidth - 2, 38);
    await expect(page.getByRole("button", { name: "Cast", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Lure", exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("vessel cargo and stores remain on the existing utility route", async ({ page }) => {
  test.setTimeout(480_000);
  await page.goto("/?debug=1&debugStart=harbor-skiff");
  const diagnostics = page.getByTestId("diagnostics");
  await expect(diagnostics).toHaveAttribute("data-boot-ready", "true", { timeout: 450_000 });
  await page.keyboard.press("KeyE");
  await expect(diagnostics).toHaveAttribute("data-mode", "boat-driving");
  await expect(page.getByTestId("maritime-vessel-console").locator(".cargo-ice-indicator")).toHaveCount(2);
  await expect(page.getByTestId("smart-contextual-toolbar")).toHaveCount(0);
  await page.getByTestId("micro-btn-ledger").click();
  await expect(page.getByRole("dialog")).toContainText("Hold & Stores");
});
