import { expect, test } from "@playwright/test";

test("a live sport fight keeps the mandatory lure snapshot locked", async ({ page }) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/?debug=1&debugStart=sport-fishing&worldAcceptance=1");
  const diagnostics = page.getByTestId("diagnostics");
  await expect(diagnostics).toHaveAttribute("data-boot-ready", "true", { timeout: 150_000 });
  await expect(diagnostics).toHaveAttribute("data-mode", "sport-fishing");
  await expect(page.getByTestId("sport-fishing-hud")).toBeVisible();

  const rejection = await page.evaluate(() => window.__NEVA_DEBUG?.execute({ type: "fishing.toggle-lure" }));
  expect(rejection).toMatchObject({
    success: false,
    reason: "Finish fishing before changing tackle"
  });

  // The physical shortcut is mode-safe as well: it cannot swap the persisted
  // tackle snapshot or leave the fight while W/A/S/D/Space own the encounter.
  await page.keyboard.press("KeyR");
  await expect(diagnostics).toHaveAttribute("data-mode", "sport-fishing");
  await expect(page.getByTestId("sport-fishing-hud")).toBeVisible();
  expect(pageErrors).toEqual([]);
});
