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

/**
 * The belt rests as a single socket, so a slot has to be brought out before it
 * can be clicked — exactly as a player does by reaching for it.
 */
async function openBelt(page: Page): Promise<void> {
  await page.getByTestId("smart-contextual-toolbar").hover();
  await expect(page.getByTestId("smart-contextual-toolbar")).toHaveAttribute("data-expanded", "true");
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
  await openBelt(page);
  await page.getByTestId("tool-slot-5").click();
  await expect(page.getByTestId("tool-slot-5")).toHaveAttribute("aria-pressed", "true");

  const river = WorldLayout.riverSectionAt(38);
  await teleport(page, river.centerX - river.leftWaterWidth - 2, 38);
  await expect(toolbar).toHaveAttribute("aria-label", "Angling Stance quickbar");
  // Angling keeps three sockets: rod, tackle, stow. The three that all opened
  // the ledger are gone.
  await expect(toolbar.locator("button[data-testid^=tool-slot-]")).toHaveCount(3);
  await expect(toolbar.locator('[aria-pressed="true"]')).toHaveCount(0);
  await openBelt(page);
  await page.getByTestId("tool-slot-3").click();
  await pointAtWorld(page);
  await page.mouse.down();
  await page.mouse.up();
  await expect(diagnostics).toHaveAttribute("data-mode", "on-foot");
  await openBelt(page);
  await page.getByTestId("tool-slot-1").click();
  await expect(page.getByTestId("tool-slot-1")).toHaveAttribute("aria-pressed", "true");
  await pointAtWorld(page);
  await page.mouse.down();
  await expect(diagnostics).toHaveAttribute("data-mode", "basic-fishing");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(diagnostics).toHaveAttribute("data-mode", "on-foot");

  // Walking around carries no belt at all: the bottom-right micro-menu already
  // is Satchel, Chart, Ledger and Journal, and the belt was a second copy.
  await teleport(page, 40, -100);
  await expect(toolbar).toHaveCount(0);
  for (const [key, testId, label] of [
    ["KeyI", "micro-btn-satchel", "Satchel"],
    ["KeyM", "micro-btn-map", "Nautical Chart"],
    ["KeyL", "micro-btn-ledger", "Hold & Stores"],
    ["KeyJ", "micro-btn-journal", "Field Journal"]
  ] as const) {
    if (key === "KeyM") await page.getByTestId(testId).click();
    else await page.keyboard.press(key);
    await expect(page.getByRole("dialog")).toContainText(label);
    expect(errors).toEqual([]);
    await expect.poll(() => page.getByRole("dialog").evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  // The number keys are inert here rather than opening a panel a second way.
  await page.keyboard.press("Digit1");
  await expect(page.getByRole("dialog")).toHaveCount(0);

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

test("the belt rests as one socket and the action prompt sits directly above it", async ({ page }) => {
  test.setTimeout(480_000);
  await page.goto("/?debug=1&debugStart=farm");
  const diagnostics = page.getByTestId("diagnostics");
  await expect(diagnostics).toHaveAttribute("data-boot-ready", "true", { timeout: 450_000 });
  const toolbar = page.getByTestId("smart-contextual-toolbar");

  // Bounding boxes lag the state class while the rank slides, so settle on a
  // stable measurement rather than reading one mid-transition.
  const settledBox = async () => {
    let previous = -1;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const box = await toolbar.boundingBox();
      if (!box) throw new Error("Missing toolbar bounds");
      if (Math.abs(box.width - previous) < 0.5) return box;
      previous = box.width;
      await page.waitForTimeout(80);
    }
    throw new Error("Toolbar width never settled");
  };

  // The belt shows itself on arrival, then folds away on its own.
  await expect(toolbar).toHaveAttribute("data-expanded", "false", { timeout: 5_000 });
  const collapsed = await settledBox();
  await toolbar.hover();
  await expect(toolbar).toHaveAttribute("data-expanded", "true");
  const expanded = await settledBox();

  // Resting, the belt is one socket wide rather than a five-socket plate.
  expect(collapsed.width).toBeLessThan(expanded.width * 0.45);
  // Fanning out must not shift the column, or the prompt above it would jump.
  expect(Math.abs(collapsed.height - expanded.height)).toBeLessThan(2);
  expect(Math.abs(collapsed.y - expanded.y)).toBeLessThan(2);

  // The prompt is a flex sibling now, not a fixed element chasing the belt
  // with a hardcoded offset per breakpoint.
  await page.mouse.move(0, 0);
  const promptPosition = await page.getByTestId("context-prompt")
    .evaluate((node) => getComputedStyle(node.closest(".guild-interaction-anchor")!).position);
  expect(promptPosition).toBe("static");
});

test("interacting takes out the tool the work needs instead of refusing", async ({ page }) => {
  test.setTimeout(480_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?debug=1&debugStart=farm");
  const diagnostics = page.getByTestId("diagnostics");
  await expect(diagnostics).toHaveAttribute("data-boot-ready", "true", { timeout: 450_000 });

  // Fishable water offers the cast with bare hands. It used to show nothing at
  // all until the player guessed that slot 1 held the rod.
  const river = WorldLayout.riverSectionAt(38);
  await teleport(page, river.centerX - river.leftWaterWidth - 2, 38);
  const toolbar = page.getByTestId("smart-contextual-toolbar");
  await expect(toolbar).toHaveAttribute("aria-label", "Angling Stance quickbar");
  // Bare hands: the belt shows Stow Gear, not the rod.
  await expect(page.getByTestId("tool-slot-1")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("tool-slot-3")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("context-prompt")).toContainText("Cast line");

  // E casts, and the rod appears on the belt as a consequence.
  await page.keyboard.press("KeyE");
  await expect(diagnostics).toHaveAttribute("data-mode", "basic-fishing");
  await page.keyboard.press("Escape");
  await expect(diagnostics).toHaveAttribute("data-mode", "on-foot");
  await expect(page.getByTestId("tool-slot-1")).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("touch keeps the belt open and every socket tappable", async ({ browser }) => {
  test.setTimeout(300_000);
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1
  });
  try {
    const page = await context.newPage();
    await page.goto("/?debug=1&debugStart=farm");
    await expect(page.getByTestId("diagnostics"))
      .toHaveAttribute("data-boot-ready", "true", { timeout: 280_000 });
    const toolbar = page.getByTestId("smart-contextual-toolbar");

    // There is no hover on touch and no keyboard to reach a folded socket, so
    // the rank stays out rather than resting as a single medallion.
    await expect(toolbar).toHaveAttribute("data-expanded", "true");
    await page.waitForTimeout(2_500);
    await expect(toolbar).toHaveAttribute("data-expanded", "true");

    const slots = toolbar.locator("button[data-testid^=tool-slot-]");
    await expect(slots).toHaveCount(5);
    const boxes = await slots.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect()).map((rect) => ({ w: rect.width, h: rect.height })));
    expect(boxes.every((box) => box.w >= 44 && box.h >= 44)).toBe(true);

    const beltBounds = await toolbar.boundingBox();
    const actionBounds = await page.locator(".mobile-action-cluster").boundingBox();
    const stickBounds = await page.locator(".mobile-joystick").boundingBox();
    if (!beltBounds || !actionBounds || !stickBounds) throw new Error("Missing touch bounds");
    expect(beltBounds.x).toBeGreaterThan(stickBounds.x + stickBounds.width);
    expect(beltBounds.x + beltBounds.width).toBeLessThan(actionBounds.x);

    await page.getByTestId("tool-slot-3").tap();
    await expect(page.getByTestId("tool-slot-3")).toHaveAttribute("aria-pressed", "true");
  } finally {
    await context.close();
  }
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
  const toolbar = page.getByTestId("smart-contextual-toolbar");
  // Helm, rod, tackle and one hold — Vessel Supplies and Cargo Hold both
  // dispatched open-ledger, so only the hold remains.
  await expect(toolbar.locator("button[data-testid^=tool-slot-]")).toHaveCount(4);
  await expect(page.getByTestId("tool-slot-2")).toHaveAttribute("aria-label", /Fishing Rod/);
  await page.keyboard.press("Digit2");
  await pointAtWorld(page);
  await page.mouse.down();
  await expect(diagnostics).toHaveAttribute("data-mode", "basic-fishing");
  await page.keyboard.press("Digit4");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(diagnostics).toHaveAttribute("data-mode", "boat-driving");
  await openBelt(page);
  await page.getByTestId("tool-slot-4").click();
  await expect(page.getByRole("dialog")).toContainText("Hold & Stores");
  expect((await snapshot(page)).basicFishing).toBeNull();
  expect(errors).toEqual([]);
});
