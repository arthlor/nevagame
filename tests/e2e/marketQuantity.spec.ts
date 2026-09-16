import { expect, test } from "@playwright/test";
import { WORLD_MARKET_LOCATIONS } from "../../src/world/WorldGameplayLocations";

test("market quantity drafts remain editable and only whole amounts can trade", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/?debug=1&debugStart=farm");
  await expect(page.getByTestId("diagnostics")).toHaveAttribute("data-boot-ready", "true", { timeout: 150_000 });
  const market = WORLD_MARKET_LOCATIONS["market.village"];
  await page.evaluate(({ x, z }) => window.__NEVA_DEBUG!.teleport(x, z), market.position);
  await expect(page.getByTestId("context-prompt")).toContainText("Market");
  await page.keyboard.press("KeyE");
  await page.getByRole("button", { name: "Select Compost Starter", exact: true }).click();

  const buyInput = page.getByRole("spinbutton", { name: "Quantity to buy" });
  const buy = page.getByTestId("market-buy-confirm");
  const purse = () => page.evaluate(() => window.__NEVA_DEBUG!.snapshot().money);
  const before = await purse();
  for (const draft of ["", "1.5", "0"]) {
    await buyInput.fill(draft);
    await expect(buyInput).toHaveValue(draft);
    await expect(buy).toBeDisabled();
  }
  expect(await purse()).toBe(before);
  await buyInput.fill("2");
  await expect(buy).toBeEnabled();
  await buy.click();
  await expect.poll(purse).toBeLessThan(before);

  await page.locator("#market-section-sell").click();
  const ticket = page.getByTestId("market-sell-ticket");
  const sellInput = ticket.getByRole("spinbutton");
  const sell = ticket.getByRole("button", { name: "Sell", exact: true });
  const beforeSale = await purse();
  // A fractional quote used to unmount the ticket, leaving no input to repair.
  for (const draft of ["", "1.5", "0", "999999"]) {
    await sellInput.fill(draft);
    await expect(ticket).toBeVisible();
    await expect(sellInput).toHaveValue(draft);
    await expect(sell).toBeDisabled();
  }
  expect(await purse()).toBe(beforeSale);
  await sellInput.fill("1");
  await expect(sell).toBeEnabled();
  await sell.click();
  await expect.poll(purse).toBeGreaterThan(beforeSale);
  await expect(page.getByTestId("toast").filter({ hasText: "Sold" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByTestId("chronicle-toggle").click();
  await expect(page.getByTestId("chronicle-feed")).toContainText("Sold");
  await page.getByTestId("chronicle-filter-field").click();
  await expect(page.getByTestId("coastal-chronicle")).toBeVisible();
  await expect(page.getByTestId("chronicle-feed")).toContainText("Nothing under");
  await page.getByTestId("chronicle-filter-all").focus();
  await page.keyboard.press("End");
  await expect(page.getByTestId("chronicle-filter-story")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByTestId("chronicle-filter-all")).toBeFocused();
  await expect(page.getByTestId("chronicle-feed")).toContainText("Sold");
});
