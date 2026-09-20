// Manual probe: run explicitly with
//   npx playwright test tests/e2e/tmpDiscardBrowser.spec.ts --project=chromium
// The normal e2e config ignores tmp*.spec.ts; that prefix is required.
import { test, expect } from "@playwright/test";

test.use({ contextOptions: { reducedMotion: "reduce" } });

test.setTimeout(480_000);

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => console.error(`[browser pageerror] ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(`[browser console] ${message.text()}`);
  });
  await page.goto("/?debugStart=farm");
  await expect(page.getByTestId("game-clock")).toBeVisible({ timeout: 240_000 });
  await page.keyboard.press("KeyI");
  await expect(page.locator(".inventory-satchel-modal")).toBeVisible();
});

test("armed confirm discards the selected stack across UI frames", async ({ page }) => {
  const modal = page.locator(".inventory-satchel-modal");
  await expect(modal.getByTestId("inventory-capacity")).toContainText("5 / 16");

  await modal.getByTestId("inventory-discard-action").click();
  await expect(modal.getByTestId("inventory-discard-confirm")).toBeVisible();
  // GameApp rebuilds the satchel DTO on every UI frame (~100 ms); the arm must survive it.
  await page.waitForTimeout(600);
  await expect(modal.getByTestId("inventory-discard-confirm")).toBeVisible();
  await modal.getByTestId("inventory-discard-confirm").click();

  await expect(modal.getByTestId("inventory-discard-notice")).toContainText("Discarded 10 Wheat Seed");
  await expect(modal.getByTestId("inventory-capacity")).toContainText("4 / 16");
});

test("two-phase drag routes through the discard zone", async ({ page }) => {
  const modal = page.locator(".inventory-satchel-modal");

  await page.evaluate(() => {
    const slot = document.getElementById("inventory-slot-1");
    if (!slot) throw new Error("slot-missing");
    const dataTransfer = new DataTransfer();
    (window as unknown as { __probeDt: DataTransfer }).__probeDt = dataTransfer;
    slot.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer }));
  });

  const zone = modal.getByTestId("inventory-discard-zone");
  await expect(zone).toBeVisible();

  await page.evaluate(() => {
    const dataTransfer = (window as unknown as { __probeDt: DataTransfer }).__probeDt;
    const zoneEl = document.querySelector('[data-testid="inventory-discard-zone"]');
    if (!zoneEl) throw new Error("zone-missing");
    zoneEl.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }));
    zoneEl.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
  });

  await expect(modal.getByTestId("inventory-discard-notice")).toContainText("Discarded 6 Tomato Seed");
  await expect(modal.getByTestId("inventory-capacity")).toContainText("4 / 16");
});
