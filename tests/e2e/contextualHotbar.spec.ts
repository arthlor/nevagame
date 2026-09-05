import { expect, test, type Page } from "@playwright/test";
import type { NevaDebugApi } from "../../src/app/GameApp";
import { WorldLayout } from "../../src/world/WorldLayout";
import { FARMHOUSE_OUTSIDE_DOOR } from "../../src/world/FarmhouseInterior";

async function snapshot(page: Page) {
  return page.evaluate(() => (window as unknown as { __NEVA_DEBUG: NevaDebugApi }).__NEVA_DEBUG.snapshot());
}

async function teleport(page: Page, x: number, z: number): Promise<void> {
  await page.evaluate(({ x, z }) => {
    (window as unknown as { __NEVA_DEBUG: NevaDebugApi }).__NEVA_DEBUG.teleport(x, z);
  }, { x, z });
}

async function pointAtWorld(page: Page): Promise<void> {
  const bounds = await page.locator("#game-canvas").boundingBox();
  if (!bounds) throw new Error("Missing game canvas bounds");
  await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.42);
}

test("contextual clicks and number keys execute their displayed actions, and the farmhouse remains walkable", async ({ page }) => {
  test.setTimeout(480_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?debug=1&debugStart=farm");
  const diagnostics = page.getByTestId("diagnostics");
  await expect(diagnostics).toHaveAttribute("data-boot-ready", "true", { timeout: 450_000 });
  const toolbar = page.getByTestId("smart-contextual-toolbar");
  await expect(toolbar).toHaveAttribute("aria-label", "Agronomy Stance quickbar");
  await page.getByTestId("tool-slot-5").click();
  await expect(page.getByTestId("tool-slot-5")).toHaveAttribute("aria-pressed", "true");
  const river = WorldLayout.riverSectionAt(38);
  await teleport(page, river.centerX - river.leftWaterWidth - 2, 38);
  await expect(toolbar).toHaveAttribute("aria-label", "Angling Stance quickbar");
  await expect(toolbar.locator('[aria-pressed="true"]')).toHaveCount(0);
  await page.getByTestId("tool-slot-5").click();
  await pointAtWorld(page);
  await page.mouse.down();
  await page.mouse.up();
  await expect(diagnostics).toHaveAttribute("data-mode", "on-foot");
  await page.getByTestId("tool-slot-1").click();
  await expect(page.getByTestId("tool-slot-1")).toHaveAttribute("aria-pressed", "true");
  await pointAtWorld(page);
  await page.mouse.down();
  await expect(diagnostics).toHaveAttribute("data-mode", "basic-fishing");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(diagnostics).toHaveAttribute("data-mode", "on-foot");

  await teleport(page, 40, -100);
  await expect(toolbar).toHaveAttribute("aria-label", "Explorer Stance quickbar");
  for (const [slot, label] of [
    [1, "Satchel"],
    [2, "Nautical Chart"],
    [4, "Hold & Stores"],
    [5, "Field Journal"]
  ] as const) {
    if (slot === 2) await page.keyboard.press("Digit2");
    else await page.getByTestId(`tool-slot-${slot}`).click();
    await expect(page.getByRole("dialog")).toContainText(label);
    expect(errors).toEqual([]);
    await expect.poll(() => page.getByRole("dialog").evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }

  await teleport(page, FARMHOUSE_OUTSIDE_DOOR.exitSpawn.x, FARMHOUSE_OUTSIDE_DOOR.exitSpawn.z);
  await expect(page.getByTestId("context-prompt")).toHaveAttribute("aria-label", "Enter Home");
  await page.keyboard.press("KeyE");
  await expect.poll(async () => (await snapshot(page)).playerPosition.x).toBeGreaterThan(235);
  let maximumMovement = 0;
  for (const key of ["KeyW", "KeyD", "KeyS", "KeyA"]) {
    const before = (await snapshot(page)).playerPosition;
    await page.keyboard.down(key);
    await page.waitForTimeout(700);
    await page.keyboard.up(key);
    const after = (await snapshot(page)).playerPosition;
    maximumMovement = Math.max(maximumMovement, Math.hypot(after.x - before.x, after.z - before.z));
    expect(WorldLayout.isInterior(after.x, after.z)).toBe(true);
    expect(WorldLayout.isWater(after.x, after.z)).toBe(false);
  }
  expect(maximumMovement).toBeGreaterThan(0.25);
  expect(errors).toEqual([]);
});

test("skiff cargo shows its iced bays and maritime controls arm fishing or open stores", async ({ page }) => {
  test.setTimeout(480_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?debug=1&debugStart=harbor-skiff");
  const diagnostics = page.getByTestId("diagnostics");
  await expect(diagnostics).toHaveAttribute("data-boot-ready", "true", { timeout: 450_000 });
  await expect(page.getByTestId("context-prompt")).toContainText("Board");
  await page.keyboard.press("KeyE");
  await expect(diagnostics).toHaveAttribute("data-mode", "boat-driving");
  await expect(page.getByTestId("maritime-vessel-console").locator(".cargo-ice-indicator")).toHaveCount(2);
  await expect(page.getByTestId("tool-slot-2")).toHaveAttribute("aria-label", /Fishing Rod/);
  await page.keyboard.press("Digit2");
  await pointAtWorld(page);
  await page.mouse.down();
  await expect(diagnostics).toHaveAttribute("data-mode", "basic-fishing");
  await page.keyboard.press("Digit5");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(diagnostics).toHaveAttribute("data-mode", "boat-driving");
  await page.getByTestId("tool-slot-5").click();
  await expect(page.getByRole("dialog")).toContainText("Hold & Stores");
  expect((await snapshot(page)).basicFishing).toBeNull();
  expect(errors).toEqual([]);
});
