import { expect, test, type Page } from "@playwright/test";

interface State {
  x: number;
  z: number;
  yaw: number;
  mode: string;
  blocked: boolean;
}

async function state(page: Page): Promise<State> {
  return page.evaluate(() => {
    const element = document.querySelector<HTMLElement>("[data-testid='diagnostics']");
    if (!element) throw new Error("Missing diagnostics");
    const numberAttribute = (name: string): number => Number(element.getAttribute(name));
    return {
      x: numberAttribute("data-player-x"),
      z: numberAttribute("data-player-z"),
      yaw: numberAttribute("data-camera-yaw"),
      mode: element.getAttribute("data-mode") ?? "unknown",
      blocked: element.getAttribute("data-player-collision-blocked") === "true"
    };
  });
}

async function sync(page: Page, held: Set<string>, keys: Iterable<string>): Promise<void> {
  const next = new Set(keys);
  for (const key of held) {
    if (next.has(key)) continue;
    await page.keyboard.up(key);
    held.delete(key);
  }
  for (const key of next) {
    if (held.has(key)) continue;
    await page.keyboard.down(key);
    held.add(key);
  }
}

async function release(page: Page, held: Set<string>): Promise<void> {
  for (const key of held) await page.keyboard.up(key);
  held.clear();
}

async function approach(page: Page, targetX: number, targetZ: number, tolerance: number): Promise<State> {
  const held = new Set<string>();
  try {
    for (let tick = 0; tick < 500; tick += 1) {
      const current = await state(page);
      const dx = targetX - current.x;
      const dz = targetZ - current.z;
      if (Math.hypot(dx, dz) <= tolerance) {
        await release(page, held);
        await page.waitForTimeout(300);
        return await state(page);
      }
      const forwardX = -Math.sin(current.yaw);
      const forwardZ = -Math.cos(current.yaw);
      const rightX = -forwardZ;
      const rightZ = forwardX;
      const localX = dx * rightX + dz * rightZ;
      const localZ = -(dx * forwardX + dz * forwardZ);
      const length = Math.hypot(localX, localZ) || 1;
      const lateral = localX / length;
      const longitudinal = localZ / length;
      const keys: string[] = [];
      if (lateral > 0.16) keys.push("KeyD");
      if (lateral < -0.16) keys.push("KeyA");
      if (longitudinal < -0.16) keys.push("KeyW");
      if (longitudinal > 0.16) keys.push("KeyS");
      await sync(page, held, keys);
      await page.waitForTimeout(100);
    }
  } finally {
    await release(page, held);
  }
  throw new Error(`Approach timed out toward (${targetX}, ${targetZ})`);
}

async function holdWorldX(page: Page, targetX: number, direction: -1 | 1): Promise<State> {
  const held = new Set<string>();
  try {
    for (let tick = 0; tick < 100; tick += 1) {
      const current = await state(page);
      if (direction * (current.x - targetX) >= 0) {
        await release(page, held);
        return current;
      }
      const forwardX = -Math.sin(current.yaw);
      const forwardZ = -Math.cos(current.yaw);
      const rightX = -forwardZ;
      const localX = direction * rightX;
      const localZ = direction * -forwardX;
      const keys: string[] = [];
      if (localX > 0.16) keys.push("KeyD");
      if (localX < -0.16) keys.push("KeyA");
      if (localZ < -0.16) keys.push("KeyW");
      if (localZ > 0.16) keys.push("KeyS");
      await sync(page, held, keys);
      await page.waitForTimeout(100);
    }
  } finally {
    await release(page, held);
  }
  throw new Error(`Bridge crossing timed out toward x=${targetX}`);
}

test("probe east bridge deck staging", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/?debug=1");
  await expect(page.getByTestId("diagnostics")).toHaveAttribute("data-boot-ready", "true", { timeout: 450_000 });
  await page.evaluate(() => window.__NEVA_DEBUG?.teleport(0, -5));
  const staged = await approach(page, -7.2, -6, 0.15);
  console.log(`[deck staging] ${JSON.stringify(staged)}`);
  const crossed = await holdWorldX(page, -23.4, -1);
  console.log(`[deck final] ${JSON.stringify(crossed)}`);
});
