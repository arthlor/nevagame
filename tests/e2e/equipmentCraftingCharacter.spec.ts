import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { CURRENT_SCHEMA_VERSION } from "../../src/persistence/SaveSchema";

async function seedEquipmentSave(page: Page): Promise<void> {
  const state = createInitialGameState(62_407);
  state.metadata.lastSavedUtcMs = Date.now();
  state.player.proficiencies.processing = 1_000;
  state.player.equipment.ownedIds.push(
    "equipment.field_hat",
    "equipment.tidewatch_cap",
    "equipment.harvest_apron",
    "equipment.oilskin_coat",
    "equipment.furrow_boots",
    "equipment.deck_boots",
    "equipment.copper_rose_watering_can",
    "equipment.long_spout_watering_can",
    "equipment.broad_sickle",
    "equipment.balanced_sickle"
  );
  const inventory = state.inventories[state.player.inventoryId];
  if (!InventoryManager.addItemsAtomically(inventory, [{ itemId: "produce.flax", quantity: 12 }])) {
    throw new Error("Could not prepare the browser crafting fixture");
  }
  const envelope = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    savedAtUtcMs: state.metadata.lastSavedUtcMs,
    state
  };

  await page.goto("/");
  await page.evaluate(async (rawEnvelope) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("neva_save_db", 1);
      request.onerror = () => reject(request.error ?? new Error("Could not open save storage"));
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("game_saves")) {
          request.result.createObjectStore("game_saves");
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("game_saves", "readwrite");
        transaction.objectStore("game_saves").put(rawEnvelope, "primary_save");
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error ?? new Error("Could not seed save"));
      };
    });
  }, envelope);
  await page.reload();
  await expect(page.getByTestId("startup-start-button")).toContainText("Continue", { timeout: 30_000 });
  await page.getByTestId("startup-start-button").click();
  await expect(page.getByTestId("game-clock")).toBeVisible({ timeout: 450_000 });
  await expect.poll(() => page.evaluate(() => Boolean(window.__NEVA_DEBUG))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__NEVA_DEBUG?.snapshot().bootReady ?? false)).toBe(true);
  await expect(page.getByRole("heading", { name: "Neva Land", exact: true })).not.toBeVisible();
}

test.describe("character equipment and station crafting", () => {
  test("uses the real loadout preview and completes a station job through the UI", async ({ page }) => {
    test.setTimeout(480_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    await seedEquipmentSave(page);

    await page.evaluate(() => {
      delete document.body.dataset.equipmentKeyEvent;
      window.addEventListener("keydown", (event) => {
        document.body.dataset.equipmentKeyEvent = JSON.stringify({
          code: event.code,
          key: event.key,
          target: event.target instanceof HTMLElement ? event.target.tagName : "unknown",
          defaultPrevented: event.defaultPrevented
        });
      }, { once: true });
    });
    await page.keyboard.press("c");
    const character = page.getByRole("dialog", { name: "Character & Gear" });
    await expect.poll(() => page.evaluate(() => document.body.dataset.equipmentKeyEvent ?? "")).not.toBe("");
    const observed = JSON.parse(await page.evaluate(() => document.body.dataset.equipmentKeyEvent ?? "{}"));
    expect(observed).toEqual({ code: "KeyC", key: "c", target: "BODY", defaultPrevented: true });
    await expect(character).toBeVisible();
    await expect(character.getByRole("button", { name: "Close character screen" })).toBeFocused();
    expect((await character.boundingBox())?.width ?? 0).toBeGreaterThan(1_050);
    await expect(character.locator(".character-slot")).toHaveCount(6);
    await expect(character.locator(".character-preview-canvas")).toBeVisible({ timeout: 30_000 });
    await expect(character.locator(".character-preview-fallback")).toHaveCount(0);
    await expect(character.locator("#character-preview-description")).toHaveCSS("clip-path", "inset(50%)");
    expect(await character.locator(".character-screen__loadout").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await character.locator(".atlas-image").count()).toBeGreaterThanOrEqual(16);

    // Browsers cap concurrent WebGL contexts. Repeatedly mounting this modal
    // must explicitly release each preview context instead of evicting the
    // canonical world renderer.
    for (let cycle = 0; cycle < 20; cycle += 1) {
      await page.keyboard.press("Escape");
      await expect(character).not.toBeVisible();
      await page.keyboard.press("KeyC");
      await expect(character).toBeVisible();
      await expect(character.locator(".character-preview-canvas")).toBeVisible();
    }
    expect(await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
      if (!canvas) return false;
      const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      return Boolean(context && !context.isContextLost());
    })).toBe(true);

    await character.locator(".character-owned-item").filter({ hasText: "Field Hat" }).click();
    await character.getByRole("button", { name: "Try On", exact: true }).click();
    await expect(character.getByText("Trying on", { exact: true })).toBeVisible();
    await expect(character.getByRole("button", { name: /Head: Field Hat, preview only/ })).toBeVisible();
    await character.getByRole("button", { name: "Equip", exact: true }).click();
    await expect(character.getByRole("status")).toContainText("Field Hat equipped");
    await expect(character.getByRole("button", { name: "Head: Field Hat", exact: true })).toBeVisible();
    await expect(character.getByText("Current gear", { exact: true })).toBeVisible();
    await expect(character.getByRole("button", { name: "Reset Try On" })).toHaveCount(0);

    const output = path.resolve(process.cwd(), "output/playwright/equipment-system");
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, "character-screen.png") });

    await page.setViewportSize({ width: 844, height: 390 });
    const compactBounds = await character.boundingBox();
    expect(compactBounds).not.toBeNull();
    expect(compactBounds!.x).toBeGreaterThanOrEqual(0);
    expect(compactBounds!.y).toBeGreaterThanOrEqual(0);
    expect(compactBounds!.x + compactBounds!.width).toBeLessThanOrEqual(844);
    expect(compactBounds!.y + compactBounds!.height).toBeLessThanOrEqual(390);
    await expect(character.getByRole("button", { name: "Close character screen" })).toBeVisible();
    await page.screenshot({ path: path.join(output, "character-screen-short-landscape.png") });
    const compactOwnedList = character.locator(".character-owned-list");
    expect(await compactOwnedList.evaluate((element) => ({
      height: element.clientHeight,
      overflowY: getComputedStyle(element).overflowY,
      scrollable: element.scrollHeight > element.clientHeight
    }))).toEqual({ height: expect.any(Number), overflowY: "auto", scrollable: true });
    expect(await compactOwnedList.evaluate((element) => element.clientHeight)).toBeGreaterThanOrEqual(44);
    const lastOwnedItem = compactOwnedList.locator(".character-owned-item").last();
    await lastOwnedItem.scrollIntoViewIfNeeded();
    await expect(lastOwnedItem).toBeInViewport();
    const compactCurrentButton = character.getByRole("button", { name: "Current", exact: true });
    await compactCurrentButton.scrollIntoViewIfNeeded();
    await expect(compactCurrentButton).toBeInViewport();
    const seaPreset = character.locator(".character-preset").filter({ hasText: "Sea" });
    await seaPreset.scrollIntoViewIfNeeded();
    await expect(seaPreset).toBeInViewport();
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.keyboard.press("Escape");
    await expect(character).not.toBeVisible();
    expect(await page.evaluate(() => window.__NEVA_DEBUG?.moveToStation("struct.workbench") ?? false)).toBe(true);
    await page.waitForTimeout(300);
    await page.keyboard.press("KeyE");

    const crafting = page.getByRole("dialog", { name: "Workbench" });
    await expect(crafting).toBeVisible();
    await expect(crafting.getByRole("button", { name: "Close crafting" })).toBeFocused();
    expect((await crafting.boundingBox())?.width ?? 0).toBeGreaterThan(900);
    await crafting.locator(".crafting-recipe-row").filter({ hasText: "Weave Linen Roll" }).click();
    await expect(crafting.getByText("12 / 3", { exact: true })).toBeVisible();
    await expect(crafting.getByText("Collect here when ready. Make room in your storage before collecting.", { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(output, "workbench-crafting.png") });

    await crafting.getByRole("button", { name: "Start Weave Linen Roll" }).click();
    await expect(crafting).not.toBeVisible();
    await expect.poll(
      () => page.evaluate(() => window.__NEVA_DEBUG?.snapshot().processingJobs.length ?? 0),
      { timeout: 10_000 }
    ).toBe(1);
    await page.waitForTimeout(1_000);
    await page.evaluate(() => window.__NEVA_DEBUG?.advanceGameMinutes(20));
    await expect.poll(
      () => page.evaluate(() => window.__NEVA_DEBUG?.snapshot().processingJobs[0]?.status),
      { timeout: 10_000 }
    ).toBe("complete");

    await page.keyboard.press("KeyE");
    await expect.poll(
      () => page.evaluate(() => window.__NEVA_DEBUG?.snapshot().processingJobs.length ?? 0),
      { timeout: 10_000 }
    ).toBe(0);
    expect(pageErrors).toEqual([]);
  });
});
