import { test, expect } from "@playwright/test";

test.setTimeout(180_000);

test("DEV telemetry surface is wired and reports elapsed session time", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("startup-start-button").click();
  await page.waitForFunction(() => window.__NEVA_RENDER_READY === true, null, { timeout: 120_000 });

  const initial = await page.evaluate(() => window.__NEVA_TELEMETRY?.metrics());
  expect(initial).toBeTruthy();
  expect(initial!.eventCount).toBeGreaterThanOrEqual(0);

  // A player who does nothing must still show elapsed session time — that is
  // the "stalled player" signal, and it must not read as zero.
  await page.waitForTimeout(4000);
  const after = await page.evaluate(() => window.__NEVA_TELEMETRY?.metrics());
  console.info("[telemetry probe]", JSON.stringify(after, null, 2));
  expect(after!.sessionRealMs).toBeGreaterThan(3500);
  expect(after!.milestones).toEqual({});
});
