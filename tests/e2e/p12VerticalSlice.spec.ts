import { expect, test, type Page } from "@playwright/test";
import type { NevaDebugSnapshot } from "../../src/app/GameApp";
import type { GameCommand, InteractionResult } from "../../src/simulation/core/contracts";
import { farmLocalToWorld, STARTER_FARM_LAYOUT } from "../../src/world/FarmLayout";
import { HARBOR_DOCK } from "../../src/world/WorldAnchors";
import { SPORT_FISHING_REVIEW_POINTS } from "../../src/simulation/domains/FishingDomain";
import { WorldLayout } from "../../src/world/WorldLayout";

async function waitForDebug(page: Page): Promise<void> {
  await expect(page.getByTestId("diagnostics")).toHaveAttribute("data-boot-ready", "true", { timeout: 450_000 });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__NEVA_DEBUG))).toBe(true);
}

async function snapshot(page: Page): Promise<NevaDebugSnapshot> {
  return page.evaluate(() => {
    const debug = window.__NEVA_DEBUG;
    if (!debug) throw new Error("Missing __NEVA_DEBUG");
    return debug.snapshot();
  });
}

async function execute(page: Page, command: GameCommand): Promise<InteractionResult> {
  return page.evaluate((nextCommand) => {
    const debug = window.__NEVA_DEBUG;
    if (!debug) throw new Error("Missing __NEVA_DEBUG");
    return debug.execute(nextCommand);
  }, command);
}

async function talkTo(page: Page, npcId: string): Promise<void> {
  expect(await page.evaluate((id) => window.__NEVA_DEBUG?.moveToNpc(id) ?? false, npcId)).toBe(true);
  expect(await execute(page, { type: "quest.talk-npc", npcId })).toMatchObject({ success: true });
}

async function collectProcessing(
  page: Page,
  recipeId: string,
  stationId: string,
  durationMinutes: number
): Promise<void> {
  expect(await page.evaluate((id) => window.__NEVA_DEBUG?.moveToStation(id) ?? false, stationId)).toBe(true);
  expect(await execute(page, { type: "processing.start", recipeId, stationId })).toMatchObject({ success: true });
  await page.evaluate((minutes) => window.__NEVA_DEBUG?.advanceGameMinutes(minutes), durationMinutes);
  const jobId = (await snapshot(page)).processingJobIds[0];
  expect(jobId).toBeDefined();
  expect(await execute(page, { type: "processing.collect", jobId })).toMatchObject({ success: true });
}

async function catchBasicFish(page: Page): Promise<void> {
  await page.evaluate(() => {
    const debug = window.__NEVA_DEBUG;
    if (!debug) throw new Error("Missing __NEVA_DEBUG");
    let caught = false;
    for (let attempt = 0; attempt < 5 && !caught; attempt += 1) {
      if (!debug.execute({ type: "fishing.start-charge-basic" }).success) continue;
      if (!debug.execute({ type: "fishing.release-cast-basic", castPower: 0.8 }).success) continue;
      let bite = false;
      for (let step = 0; step < 160; step += 1) {
        const fishing = debug.snapshot().basicFishing;
        if (!fishing) break;
        if (fishing.phase === "bite-reaction") {
          bite = true;
          break;
        }
        debug.tickRealSeconds(0.1);
      }
      if (!bite) continue;
      if (!debug.execute({ type: "fishing.hook-bite-basic" }).success) continue;
      for (let step = 0; step < 800 && debug.snapshot().basicFishing; step += 1) {
        const fishing = debug.snapshot().basicFishing;
        if (!fishing) break;
        const barY = fishing.barY ?? 0;
        const barHeight = fishing.barHeight ?? 0.2;
        const fishY = fishing.fishY ?? 0.25;
        const barCenter = barY + barHeight * 0.5;
        const hold = fishY > barCenter + 0.015
          || (fishY >= barY && fishY <= barY + barHeight && (fishing.barVy ?? 0) < -0.3);
        debug.execute({ type: "fishing.control-basic", isHolding: hold });
        debug.tickRealSeconds(0.05);
      }
      caught = !debug.snapshot().basicFishing;
    }
    if (!caught) throw new Error("Failed to land a river fish");
  });
}

async function landSportFish(page: Page): Promise<void> {
  await page.evaluate(() => {
    const debug = window.__NEVA_DEBUG;
    if (!debug) throw new Error("Missing __NEVA_DEBUG");
    for (let step = 0; step < 800 && debug.snapshot().sportFishing; step += 1) {
      const encounter = debug.snapshot().sportFishing;
      if (!encounter) break;
      const isSlacking = encounter.lineTension > 82;
      const isReeling = encounter.lineTension < 70 && !isSlacking;
      const isBracing = encounter.behavior === "dive" || encounter.behavior === "burst";
      debug.execute({
        type: "fishing.control",
        input: {
          isReeling,
          isSlacking,
          isBracing,
          rodDirectionAngle: -encounter.fishDirection
        }
      });
      debug.tickRealSeconds(0.5);
    }
    if (debug.snapshot().sportFishing) throw new Error("Sport fish was not landed");
    if (debug.snapshot().cargoIds.length < 1) throw new Error("Landing did not create cargo");
  });
}

test.describe("P12 new-save vertical slice", () => {
  test.beforeEach(({ page }) => {
    test.setTimeout(480_000);
    page.on("pageerror", (error) => console.error(`[browser pageerror] ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") console.error(`[browser console] ${message.text()}`);
    });
  });

  test("completes Act 1–5 through debug commands, save, and reload", async ({ page }) => {
    await page.goto("/?debug=1");
    await waitForDebug(page);

    expect((await snapshot(page)).activeQuestId).toBe("quest.act1_welcome");
    await talkTo(page, "npc.elspeth");
    expect((await snapshot(page)).activeQuestId).toBe("quest.act1_sow_wheat");

    const cropPositions = [-3, 0, 3].map((x) => farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, { x, z: 0 }));
    const cropIds: string[] = [];
    for (const position of cropPositions) {
      await page.evaluate(({ x, z }) => window.__NEVA_DEBUG?.teleport(x, z), position);
      const planted = await execute(page, {
        type: "crop.plant",
        request: {
          farmId: "farm.starter_garden",
          cropId: "crop.wheat",
          x: position.x,
          z: position.z
        }
      });
      expect(planted).toMatchObject({ success: true });
      expect(planted.placedCropId).toBeDefined();
      cropIds.push(planted.placedCropId!);
    }
    await talkTo(page, "npc.elspeth");
    expect((await snapshot(page)).activeQuestId).toBe("quest.act1_water_crops");

    for (let index = 0; index < cropIds.length; index += 1) {
      await page.evaluate(({ x, z }) => window.__NEVA_DEBUG?.teleport(x, z), cropPositions[index]);
      expect(await execute(page, { type: "crop.water", placedCropId: cropIds[index] })).toMatchObject({ success: true });
    }
    await talkTo(page, "npc.elspeth");
    expect((await snapshot(page)).activeQuestId).toBe("quest.act2_harvest_and_compost");

    await page.evaluate(() => window.__NEVA_DEBUG?.advanceGameMinutes(200));
    for (let index = 0; index < cropIds.length; index += 1) {
      await page.evaluate(({ x, z }) => window.__NEVA_DEBUG?.teleport(x, z), cropPositions[index]);
      expect(await execute(page, { type: "crop.harvest", placedCropId: cropIds[index] })).toMatchObject({ success: true });
    }

    await collectProcessing(page, "recipe.compost_worms", "struct.starter_compost", 360);
    await talkTo(page, "npc.barnaby");
    expect((await snapshot(page)).activeQuestId).toBe("quest.act2_mill_and_craft_chum");

    await collectProcessing(page, "recipe.wheat_to_grain", "struct.starter_mill", 5);
    await collectProcessing(page, "recipe.wheat_to_grain", "struct.starter_mill", 5);
    await collectProcessing(page, "recipe.craft_chum", "struct.workbench", 10);
    await talkTo(page, "npc.barnaby");
    expect((await snapshot(page)).activeQuestId).toBe("quest.act3_river_angler");

    const bridge = WorldLayout.landmark("bridge");
    await page.evaluate(({ x, z }) => window.__NEVA_DEBUG?.teleport(x, z), { x: bridge.x, z: bridge.z });
    await catchBasicFish(page);
    await catchBasicFish(page);
    await talkTo(page, "npc.silas");
    expect((await snapshot(page)).activeQuestId).toBe("quest.act3_market_intro");

    await page.evaluate(() => window.__NEVA_DEBUG?.teleport(54, -52));
    expect(await execute(page, {
      type: "market.sell-item",
      marketId: "market.village",
      itemId: "produce.wheat",
      quantity: 1
    })).toMatchObject({ success: true });
    await talkTo(page, "npc.elspeth");
    expect((await snapshot(page)).activeQuestId).toBe("quest.act4_harbor_journey");

    await talkTo(page, "npc.maeve");
    expect((await snapshot(page)).activeQuestId).toBe("quest.act4_restore_rowboat");
    await talkTo(page, "npc.silas");
    expect((await snapshot(page)).unlocked).toContain("boat.player_rowboat");
    expect((await snapshot(page)).activeQuestId).toBe("quest.act5_maiden_voyage");

    await page.evaluate(
      ({ x, z }) => window.__NEVA_DEBUG?.teleport(x, z),
      { x: HARBOR_DOCK.playerPosition.x, z: HARBOR_DOCK.playerPosition.z }
    );
    expect(await execute(page, { type: "boat.board", boatId: "boat.player_rowboat" })).toMatchObject({ success: true });

    const lakePoint = SPORT_FISHING_REVIEW_POINTS.trout;
    await page.evaluate(({ x, z }) => window.__NEVA_DEBUG?.teleportActiveBoat(x, z), lakePoint);
    await page.evaluate(() => window.__NEVA_DEBUG?.advanceGameMinutes(1));
    const schoolId = (await snapshot(page)).schoolIds[0];
    expect(schoolId).toBeDefined();
    expect(await execute(page, { type: "fishing.chum-school", schoolId })).toMatchObject({ success: true });
    expect(await execute(page, { type: "fishing.hook-school", schoolId })).toMatchObject({ success: true });
    await landSportFish(page);

    await page.evaluate(() => window.__NEVA_DEBUG?.advanceGameMinutes(10));
    await page.evaluate(
      ({ x, z }) => window.__NEVA_DEBUG?.teleportActiveBoat(x, z),
      { x: HARBOR_DOCK.boatPosition.x, z: HARBOR_DOCK.boatPosition.z }
    );
    expect(await execute(page, { type: "boat.dock" })).toMatchObject({ success: true });

    const fishMarket = WorldLayout.landmark("fish-market");
    await page.evaluate(({ x, z }) => window.__NEVA_DEBUG?.teleport(x, z), { x: fishMarket.x, z: fishMarket.z });
    const cargoId = (await snapshot(page)).cargoIds[0];
    expect(cargoId).toBeDefined();
    expect(await execute(page, { type: "market.sell-fish", marketId: "market.harbor", cargoId })).toMatchObject({
      success: true
    });
    await talkTo(page, "npc.silas");
    expect((await snapshot(page)).activeQuestId).toBeNull();
    expect((await snapshot(page)).activeActId).toBe("epilogue_open");

    expect(await page.evaluate(() => window.__NEVA_DEBUG?.saveNow() ?? false)).toBe(true);
    await page.reload();
    await waitForDebug(page);
    expect((await snapshot(page)).activeQuestId).toBeNull();
    expect((await snapshot(page)).activeActId).toBe("epilogue_open");
  });
});
