import { expect, test, type Page } from "@playwright/test";
import { QUESTS } from "../../src/content/quests";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { CURRENT_SCHEMA_VERSION } from "../../src/persistence/SaveSchema";
import { STARTER_FARM_LAYOUT, farmWellWorldAnchor } from "../../src/world/FarmLayout";
import { VILLAGE_MARKET } from "../../src/world/WorldAnchors";
import { mainQuestTrack } from "../../src/simulation/core/QuestTypes";

async function seedOldEpilogueSave(page: Page): Promise<void> {
  const simulation = new Simulation();
  simulation.state.player.x = STARTER_FARM_LAYOUT.origin.x;
  simulation.state.player.z = STARTER_FARM_LAYOUT.origin.z;
  expect(simulation.plantCrop(
    "farm.starter_garden",
    "crop.wheat",
    STARTER_FARM_LAYOUT.origin.x,
    STARTER_FARM_LAYOUT.origin.z
  ).success).toBe(true);
  const cropId = Object.keys(simulation.state.crops)[0];
  simulation.state.crops[cropId].moisture = 20;
  simulation.state.farms["farm.starter_garden"].soil.fertility = 45;
  simulation.state.player.money = 500;
  simulation.state.quests.completedQuestIds = QUESTS.slice(0, 10).map((quest) => quest.id);
  simulation.state.quests.activeActId = "epilogue_open";
  mainQuestTrack(simulation.state.quests).activeQuestId = null;
  mainQuestTrack(simulation.state.quests).activeStepIndex = 0;
  mainQuestTrack(simulation.state.quests).stepProgress = {};
  simulation.state.quests.unlockedFeatureIds = ["boat.player_rowboat", "feature.expedition_planner"];
  const inventory = simulation.state.inventories[simulation.state.player.inventoryId];
  expect(InventoryManager.addItemsAtomically(inventory, [{ itemId: "produce.wheat", quantity: 1 }])).toBe(true);
  simulation.state.contracts = [{
    id: "contract.p13_browser",
    templateId: "contract.wheat_supply",
    requesterId: "contract.wheat_supply",
    deliveryMarketId: "market.village",
    type: "produce",
    targetItemIdOrSpecies: "produce.wheat",
    quantityRequired: 1,
    quantityFulfilled: 0,
    rewardMoney: 20,
    rewardSkillXp: { skill: "farming", xp: 50 },
    expiresAtMinute: simulation.state.clock.currentMinute + 720,
    status: "active"
  }];
  const savedAtUtcMs = Date.now();
  simulation.state.metadata.lastSavedUtcMs = savedAtUtcMs;
  const envelope = { schemaVersion: CURRENT_SCHEMA_VERSION, savedAtUtcMs, state: simulation.state };

  await page.evaluate(async (rawEnvelope) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("neva_save_db", 1);
      request.onerror = () => reject(request.error ?? new Error("Could not open save database"));
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("game_saves")) request.result.createObjectStore("game_saves");
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("game_saves", "readwrite");
        tx.objectStore("game_saves").put(rawEnvelope, "primary_save");
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error ?? new Error("Could not seed save"));
      };
    });
  }, envelope);
}

async function enterSavedGame(page: Page, expectedQuestId: string | null): Promise<void> {
  await page.goto("/?debug=1", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("diagnostics")).toHaveAttribute("data-boot-ready", "true", { timeout: 450_000 });
  await expect.poll(() => page.evaluate(() => window.__NEVA_DEBUG?.snapshot().activeQuestId)).toBe(expectedQuestId);
}

async function savedCompletedQuestIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => new Promise<string[]>((resolve, reject) => {
    const request = indexedDB.open("neva_save_db", 1);
    request.onerror = () => reject(request.error ?? new Error("Could not open save database"));
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("game_saves", "readonly");
      const get = tx.objectStore("game_saves").get("primary_save");
      get.onsuccess = () => {
        const envelope = get.result as { state?: { quests?: { completedQuestIds?: string[] } } } | undefined;
        db.close();
        resolve(envelope?.state?.quests?.completedQuestIds ?? []);
      };
      get.onerror = () => {
        db.close();
        reject(get.error ?? new Error("Could not read primary save"));
      };
    };
  }));
}

async function moveToNpc(page: Page, npcId: string): Promise<void> {
  expect(await page.evaluate((id) => window.__NEVA_DEBUG?.moveToNpc(id) ?? false, npcId)).toBe(true);
  await page.waitForTimeout(250);
}

async function closeDialogue(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
}

async function waitForAction(page: Page): Promise<void> {
  await page.waitForTimeout(1_000);
}

test("plays the stewardship arc through UI actions and reloads its journal result", async ({ page }) => {
  test.setTimeout(600_000);
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      const sourceUrl = message.location().url;
      if (sourceUrl.endsWith("/favicon.ico")) return;
      browserErrors.push(sourceUrl ? `${message.text()} (${sourceUrl})` : message.text());
    }
  });

  await page.goto("/");
  await expect(page.getByTestId("startup-start-button")).toBeEnabled({ timeout: 30_000 });
  await seedOldEpilogueSave(page);
  await enterSavedGame(page, "quest.act6_harbor_promise");

  await page.keyboard.press("KeyP");
  const opportunities = page.getByTestId("expedition-opportunities");
  await expect(opportunities).toContainText(/Steady: .*Wheat delivery/);
  await expect(opportunities).toContainText("Bold:");
  await expect(opportunities).toContainText("Pack a chum bucket");
  await page.getByRole("button", { name: "Close expedition notes" }).click();

  await page.evaluate(({ x, z }) => window.__NEVA_DEBUG?.teleport(x, z), VILLAGE_MARKET.position);
  await page.waitForTimeout(250);
  await page.keyboard.press("KeyE");
  await expect(page.getByRole("dialog")).toContainText("Harbor Contracts");
  await page.getByRole("button", { name: /Deliver 1/ }).click();
  await page.getByRole("button", { name: "Close trading post" }).click();
  await expect.poll(() => page.evaluate(() => window.__NEVA_DEBUG?.snapshot().activeQuestStepProgress)).toEqual({ "step.act6_complete_contract": 1 });

  await moveToNpc(page, "npc.maeve");
  await page.keyboard.press("KeyE");
  await expect(page.getByTestId("dialogue-rewards")).toContainText("Fish Scraps");
  await closeDialogue(page);
  await expect.poll(() => page.evaluate(() => window.__NEVA_DEBUG?.snapshot().activeQuestId)).toBe("quest.act6_field_pump");

  await moveToNpc(page, "npc.barnaby");
  await page.keyboard.press("KeyE");
  await expect(page.getByTestId("dialogue-text")).toContainText("field-pump parts");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__NEVA_DEBUG?.snapshot().activeQuestStepIndex)).toBe(0);
  await page.keyboard.press("KeyE");
  await expect(page.getByTestId("dialogue-text")).toContainText("field-pump parts");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const well = farmWellWorldAnchor("farm.starter_garden")!;
  await page.evaluate(({ x, z }) => window.__NEVA_DEBUG?.teleport(x, z), well);
  await page.waitForTimeout(250);
  await page.keyboard.press("KeyE");
  await waitForAction(page);
  await expect.poll(() => page.evaluate(() => window.__NEVA_DEBUG?.snapshot().activeQuestStepIndex)).toBe(1);
  await page.keyboard.press("KeyE");
  await waitForAction(page);
  await expect.poll(() => page.evaluate(() => window.__NEVA_DEBUG?.snapshot().activeQuestStepProgress)).toEqual({ "step.act6_irrigate_farm": 1 });

  await moveToNpc(page, "npc.barnaby");
  await page.keyboard.press("KeyE");
  await expect(page.getByTestId("dialogue-text")).toContainText("steady rhythm");
  await closeDialogue(page);
  await expect.poll(() => page.evaluate(() => window.__NEVA_DEBUG?.snapshot().activeQuestId)).toBe("quest.act6_land_sea_cycle");

  expect(await page.evaluate(() => window.__NEVA_DEBUG?.moveToStation("struct.harbor_fish_table") ?? false)).toBe(true);
  await page.waitForTimeout(250);
  await page.keyboard.press("KeyE");
  await expect.poll(
    () => page.evaluate(() => window.__NEVA_DEBUG?.snapshot().processingJobs.length ?? 0),
    { timeout: 10_000 }
  ).toBe(1);
  await waitForAction(page);
  await page.evaluate(() => window.__NEVA_DEBUG?.advanceGameMinutes(10));
  await expect.poll(
    () => page.evaluate(() => window.__NEVA_DEBUG?.snapshot().processingJobs[0]?.status),
    { timeout: 10_000 }
  ).toBe("complete");
  await page.keyboard.press("KeyE");
  await waitForAction(page);
  await expect.poll(() => page.evaluate(() => window.__NEVA_DEBUG?.snapshot().activeQuestStepIndex)).toBe(1);

  await page.evaluate(({ x, z }) => window.__NEVA_DEBUG?.teleport(x + 3, z + 3), STARTER_FARM_LAYOUT.origin);
  await page.waitForTimeout(250);
  await page.keyboard.press("KeyE");
  await waitForAction(page);
  await expect.poll(() => page.evaluate(() => window.__NEVA_DEBUG?.snapshot().activeQuestStepProgress)).toEqual({ "step.act6_fertilize_farm": 1 });

  await moveToNpc(page, "npc.barnaby");
  await page.keyboard.press("KeyE");
  await expect(page.getByTestId("dialogue-text")).toContainText("field to bait");
  await expect(page.getByTestId("dialogue-rewards")).toContainText("land sea cycle");
  await closeDialogue(page);
  await expect.poll(() => page.evaluate(() => window.__NEVA_DEBUG?.snapshot().activeQuestId)).toBeNull();

  await page.keyboard.press("KeyJ");
  await expect(page.getByTestId("journal-knowledge-entries")).toContainText("The Land-Sea Cycle");
  await page.getByRole("button", { name: "Close chronicle", exact: true }).click();
  await expect.poll(() => savedCompletedQuestIds(page), { timeout: 10_000 })
    .toContain("quest.act6_land_sea_cycle");

  await enterSavedGame(page, null);
  await expect.poll(() => page.evaluate(() => window.__NEVA_DEBUG?.snapshot().completedQuestIds)).toContain("quest.act6_land_sea_cycle");
  await page.keyboard.press("KeyJ");
  await expect(page.getByTestId("journal-knowledge-entries")).toContainText("The Land-Sea Cycle");
  expect(browserErrors).toEqual([]);
});
