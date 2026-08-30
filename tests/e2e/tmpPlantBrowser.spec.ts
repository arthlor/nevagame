import { expect, test, type Page } from "@playwright/test";

async function boot(page: Page): Promise<void> {
  await page.goto("/?debug=1");
  await expect(page.getByTestId("diagnostics")).toHaveAttribute("data-boot-ready", "true", { timeout: 450_000 });
  await page.keyboard.press("KeyI");
  const inventory = page.locator(".modal-content");
  await expect(inventory).toContainText("Guild Satchel");
  await inventory.locator("[aria-label^='Wheat Seeds, count']").click();
  await page.getByRole("button", { name: "Plant Wheat" }).click();
  await expect(page.getByTestId("diagnostics")).toHaveAttribute("data-mode", "farm-placement");
}

async function findValid(page: Page): Promise<{ x: number; y: number }> {
  const bounds = await page.locator("#game-canvas").boundingBox();
  if (!bounds) throw new Error("Missing game canvas bounds");
  const diagnostics = page.getByTestId("diagnostics");
  for (const xRatio of [0.30, 0.37, 0.44, 0.50, 0.56, 0.63, 0.70]) {
    for (const yRatio of [0.35, 0.42, 0.50, 0.58, 0.66, 0.73]) {
      const point = {
        x: bounds.x + bounds.width * xRatio,
        y: bounds.y + bounds.height * yRatio
      };
      await page.mouse.move(point.x, point.y);
      await page.waitForTimeout(100);
      if (await diagnostics.getAttribute("data-placement-valid") === "true") return point;
    }
  }
  throw new Error("No valid point");
}

async function probe(page: Page, input: "e" | "click"): Promise<void> {
  await boot(page);
  await plantOnce(page, input);
}

async function plantOnce(page: Page, input: "e" | "click"): Promise<void> {
  const point = await findValid(page);
  const before = await page.evaluate((coords) => ({
    element: document.elementFromPoint(coords.x, coords.y)?.id ?? document.elementFromPoint(coords.x, coords.y)?.className ?? null,
    x: document.querySelector<HTMLElement>("[data-testid='diagnostics']")?.getAttribute("data-placement-target-x"),
    z: document.querySelector<HTMLElement>("[data-testid='diagnostics']")?.getAttribute("data-placement-target-z")
  }), point);
  console.log(`[plant ${input}] before ${JSON.stringify(before)}`);
  if (input === "e") await page.keyboard.press("KeyE");
  else await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(1_000);
  const after = await page.evaluate(() => {
    const diagnostics = document.querySelector<HTMLElement>("[data-testid='diagnostics']");
    return {
      mode: diagnostics?.getAttribute("data-mode"),
      crops: diagnostics?.getAttribute("data-crop-count"),
      actionX: diagnostics?.getAttribute("data-action-target-x"),
      placement: diagnostics?.getAttribute("data-placement-valid"),
      targetX: diagnostics?.getAttribute("data-placement-target-x"),
      targetZ: diagnostics?.getAttribute("data-placement-target-z")
    };
  });
  console.log(`[plant ${input}] after ${JSON.stringify(after)}`);
  expect(after.crops).toBe("1");
}

test("probe placement after the opening dialogue handoff", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/?debug=1");
  await expect(page.getByTestId("diagnostics")).toHaveAttribute("data-boot-ready", "true", { timeout: 450_000 });
  const moved = await page.evaluate(() => window.__NEVA_DEBUG?.moveToNpc("npc.elspeth") ?? false);
  expect(moved).toBe(true);
  await expect.poll(() => page.getByTestId("context-prompt").textContent()).toContain("Talk to Elspeth");
  await page.keyboard.press("KeyE");
  await expect(page.locator(".dialogue-card")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".dialogue-card")).not.toBeVisible();
  await expect.poll(() => page.getByTestId("context-prompt").textContent()).toContain("Talk to Elspeth");
  await page.keyboard.press("KeyE");
  await expect(page.locator(".dialogue-card")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".dialogue-card")).not.toBeVisible();
  await page.keyboard.press("KeyI");
  const inventory = page.locator(".modal-content");
  await expect(inventory).toContainText("Guild Satchel");
  await inventory.locator("[aria-label^='Wheat Seeds, count']").click();
  await page.getByRole("button", { name: "Plant Wheat" }).click();
  await expect(page.getByTestId("diagnostics")).toHaveAttribute("data-mode", "farm-placement");
  await plantOnce(page, "e");
});

test("probe placement through contextual E", async ({ page }) => {
  test.setTimeout(90_000);
  await probe(page, "e");
});

test("probe placement through canvas click", async ({ page }) => {
  test.setTimeout(90_000);
  await probe(page, "click");
});

test("probe harbor fish-market approaches", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/?debug=1&debugStart=harbor");
  await expect(page.getByTestId("diagnostics")).toHaveAttribute("data-boot-ready", "true", { timeout: 450_000 });
  const candidates = [
    { x: 65.2, z: 53.8 },
    { x: 64.0, z: 53.0 },
    { x: 67.0, z: 53.2 },
    { x: 70.0, z: 54.0 },
    { x: 70.0, z: 57.0 },
    { x: 71.0, z: 60.0 }
  ];
  for (const point of candidates) {
    await page.evaluate((next) => window.__NEVA_DEBUG?.teleport(next.x, next.z), point);
    await page.waitForTimeout(500);
    const result = await page.evaluate(() => {
      const diagnostics = document.querySelector<HTMLElement>("[data-testid='diagnostics']");
      return {
        x: diagnostics?.getAttribute("data-player-x"),
        z: diagnostics?.getAttribute("data-player-z"),
        prompt: document.querySelector<HTMLElement>("[data-testid='context-prompt']")?.textContent ?? ""
      };
    });
    console.log(`[harbor approach] ${JSON.stringify(point)} => ${JSON.stringify(result)}`);
  }
});

test("probe three sequential placement commits", async ({ page }) => {
  test.setTimeout(180_000);
  await boot(page);
  const targets: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < 3; index += 1) {
    if (index > 0) {
      await page.keyboard.press("KeyI");
      const inventory = page.locator(".modal-content");
      await expect(inventory).toContainText("Guild Satchel");
      await inventory.locator("[aria-label^='Wheat Seeds, count']").click();
      await page.getByRole("button", { name: "Plant Wheat" }).click();
      await expect(page.getByTestId("diagnostics")).toHaveAttribute("data-mode", "farm-placement");
    }
    const point = await findValid(page);
    targets.push(point);
    const before = await page.evaluate(() => {
      const diagnostics = document.querySelector<HTMLElement>("[data-testid='diagnostics']");
      return {
        mode: diagnostics?.getAttribute("data-mode"),
        valid: diagnostics?.getAttribute("data-placement-valid"),
        targetX: diagnostics?.getAttribute("data-placement-target-x"),
        targetZ: diagnostics?.getAttribute("data-placement-target-z"),
        crops: diagnostics?.getAttribute("data-crop-count")
      };
    });
    console.log(`[plant sequence ${index}] before ${JSON.stringify(before)}`);
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(250);
    const afterInput = await page.evaluate(() => {
      const diagnostics = document.querySelector<HTMLElement>("[data-testid='diagnostics']");
      return {
        mode: diagnostics?.getAttribute("data-mode"),
        actionX: diagnostics?.getAttribute("data-action-target-x"),
        crops: diagnostics?.getAttribute("data-crop-count"),
        toast: document.querySelector<HTMLElement>("[data-testid='toast']")?.textContent ?? ""
      };
    });
    console.log(`[plant sequence ${index}] after input ${JSON.stringify(afterInput)}`);
    await expect.poll(() => page.getByTestId("diagnostics").getAttribute("data-crop-count"), { timeout: 12_000 })
      .toBe(String(index + 1));
    await expect.poll(() => page.getByTestId("diagnostics").getAttribute("data-action-target-x"), { timeout: 12_000 })
      .toBe("none");
  }
});

test("map stable placement samples", async ({ page }) => {
  test.setTimeout(120_000);
  await boot(page);
  const bounds = await page.locator("#game-canvas").boundingBox();
  if (!bounds) throw new Error("Missing game canvas bounds");
  const diagnostics = page.getByTestId("diagnostics");
  for (const xRatio of [0.30, 0.37, 0.44, 0.50, 0.56, 0.63, 0.70]) {
    for (const yRatio of [0.35, 0.42, 0.50, 0.58, 0.66, 0.73]) {
      const point = {
        x: bounds.x + bounds.width * xRatio,
        y: bounds.y + bounds.height * yRatio
      };
      await page.mouse.move(point.x, point.y);
      await page.waitForTimeout(160);
      const valid = await diagnostics.getAttribute("data-placement-valid");
      if (valid !== "true") continue;
      console.log(`[placement sample] ${xRatio},${yRatio} => ${await diagnostics.getAttribute("data-placement-target-x")},${await diagnostics.getAttribute("data-placement-target-z")}`);
    }
  }
});

test("probe river cast mode handoff", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/?debug=1");
  await expect(page.getByTestId("diagnostics")).toHaveAttribute("data-boot-ready", "true", { timeout: 450_000 });
  await page.evaluate(() => window.__NEVA_DEBUG?.teleport(-6.222, -5.963));
  await page.keyboard.press("Digit5");
  await expect.poll(() => page.getByTestId("context-prompt").textContent().catch(() => ""), { timeout: 8_000 })
    .toContain("Cast line");
  const before = await page.evaluate(() => window.__NEVA_DEBUG?.snapshot());
  console.log(`[river cast] before ${JSON.stringify(before)}`);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => ({
    snapshot: window.__NEVA_DEBUG?.snapshot(),
    mode: document.querySelector<HTMLElement>("[data-testid='diagnostics']")?.getAttribute("data-mode"),
    actionX: document.querySelector<HTMLElement>("[data-testid='diagnostics']")?.getAttribute("data-action-target-x")
  }));
  console.log(`[river cast] after ${JSON.stringify(after)}`);
  expect(after.mode).toBe("basic-fishing");
  expect(after.snapshot?.basicFishing).not.toBeNull();
});
