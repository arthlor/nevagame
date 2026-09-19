import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { marketAcceptsFishTradePacks } from "../../src/content/markets";
import { TRADELANES_QUEST_TRACK_ID } from "../../src/content/questTracks";
import { Simulation } from "../../src/simulation/Simulation";
import { questTrackProgress } from "../../src/simulation/core/QuestTypes";
import { reconcileInactiveQuestChain } from "../../src/simulation/domains/QuestDomain";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { WorldLayout } from "../../src/world/WorldLayout";
import { FISHING_ECOLOGY_DEFINITIONS } from "../../src/world/WorldIslands";
import { STARTER_CARRIAGE_ID, CARRIAGE_TUNING, carriagePoint } from "../../src/simulation/mounts/Carriage";
import { MAINLAND_VILLAGES } from "../../src/world/NevaMainland";

function atMarket(sim: Simulation, marketId: string): void {
  const { x, z } = ContentRegistry.markets.get(marketId)!.interactionPosition;
  Object.assign(sim.state.player, { x, z, y: WorldLayout.traversalSurfaceHeight(x, z) + 0.5 });
}

function carriedTrout(sim: Simulation, id = "cargo.mainland_test"): string {
  sim.state.fishCargo[id] = {
    id, speciesId: "fish.trout", weightKg: 3, quality: "fine", freshness: 100,
    caughtAtMinute: sim.state.clock.currentMinute, cargoClass: "small",
    location: { type: "player", containerId: "player" }
  };
  sim.state.player.carriedFishCargoId = id;
  return id;
}

describe("mainland village economy", () => {
  it.each(Object.values(MAINLAND_VILLAGES))("settles carried packs once at $label using the shown quote", (village) => {
    const sim = new Simulation();
    const id = carriedTrout(sim);
    atMarket(sim, village.marketId);
    expect(sim.getNearbyMarketId()).toBe(village.marketId);
    expect(marketAcceptsFishTradePacks(village.marketId)).toBe(true);
    const board = sim.inspectMarketBoard(village.marketId)!;
    expect(board.tradePackRows).toHaveLength(1);
    const quoted = board.tradePackRows[0].breakdown!.finalPrice;
    expect(quoted).toBeGreaterThan(0);
    const before = sim.state.player.money;
    const supplyBefore = sim.state.markets[village.marketId].commodities["fish.trout"].localSupply;
    expect(sim.execute({ type: "market.sell-trade-pack", marketId: village.marketId, cargoId: id }))
      .toMatchObject({ success: true, revenue: quoted });
    expect(sim.state.player.money).toBe(before + quoted);
    expect(sim.state.markets[village.marketId].commodities["fish.trout"].localSupply).toBe(supplyBefore + 1);
    expect(sim.state.player.carriedFishCargoId).toBeNull();
    expect(sim.state.fishCargo[id]).toBeUndefined();
    expect(sim.execute({ type: "market.sell-trade-pack", marketId: village.marketId, cargoId: id }).success).toBe(false);
    expect(sim.state.player.money).toBe(before + quoted);
  });

  it("keeps distant, stored, spoiled and bulk packs out of the village sale path", () => {
    const sim = new Simulation();
    const id = carriedTrout(sim);
    const before = JSON.stringify(sim.state.fishCargo);
    expect(sim.execute({ type: "market.sell-trade-pack", marketId: "market.highridge", cargoId: id }).success).toBe(false);
    expect(JSON.stringify(sim.state.fishCargo)).toBe(before);
    atMarket(sim, "market.highridge");
    const money = sim.state.player.money;
    expect(sim.execute({ type: "market.sell-fish-bulk", marketId: "market.highridge" }).success).toBe(false);
    const carriage = sim.state.mounts[STARTER_CARRIAGE_ID];
    sim.state.player.carriedFishCargoId = null;
    sim.state.fishCargo[id].location = { type: "carriage", containerId: carriage.id, slotIndex: 0 };
    carriage.fishCargoSlotIds![0] = id;
    expect(sim.execute({ type: "market.sell-trade-pack", marketId: "market.highridge", cargoId: id }).success).toBe(false);
    carriage.fishCargoSlotIds![0] = null;
    sim.state.player.carriedFishCargoId = id;
    sim.state.fishCargo[id].location = { type: "player", containerId: "player" };
    sim.state.fishCargo[id].freshness = 0;
    expect(sim.execute({ type: "market.sell-trade-pack", marketId: "market.highridge", cargoId: id }).success).toBe(false);
    expect(sim.state.player.money).toBe(money);
    expect(sim.state.fishCargo[id]).toBeDefined();
  });

  it("rewards the mountain delivery while preserving the harbor carry boundary", () => {
    const sim = new Simulation();
    carriedTrout(sim);
    const prices = ["market.village", "market.highridge"].map((marketId) => {
      atMarket(sim, marketId);
      return sim.inspectMarketBoard(marketId)!.tradePackRows[0].breakdown!.finalPrice;
    });
    expect(prices[1]).toBeGreaterThan(prices[0]);
    atMarket(sim, "market.harbor");
    expect(marketAcceptsFishTradePacks("market.harbor")).toBe(false);
    expect(sim.inspectMarketBoard("market.harbor")!.tradePackRows).toEqual([]);
  });

  it("does not turn regional retail supplies into immediate resale profit", () => {
    const sim = new Simulation();
    for (const village of Object.values(MAINLAND_VILLAGES)) {
      const definition = ContentRegistry.markets.get(village.marketId)!;
      for (const itemId of definition.retail.itemIds) {
        atMarket(sim, village.marketId);
        const purchase = sim.inspectCommodityAtMarket(village.marketId, itemId, "buy", 1).totalPrice!;
        for (const market of ContentRegistry.markets.values()) {
          if (!sim.state.markets[market.id].commodities[itemId]) continue;
          atMarket(sim, market.id);
          const resale = sim.inspectCommodityAtMarket(market.id, itemId, "sell", 1).totalPrice!;
          expect(resale, `${village.marketId} → ${market.id}: ${itemId}`).toBeLessThan(purchase);
        }
      }
    }
  });

  it("resumes the extended freight track without replaying its old completion reward", () => {
    const sim = new Simulation();
    const progress = questTrackProgress(sim.state.quests, TRADELANES_QUEST_TRACK_ID);
    let quest = ContentRegistry.quests.get("quest.tradelanes_volume")!;
    while (quest.id !== "quest.tradelanes_pinewatch") {
      sim.state.quests.completedQuestIds.push(quest.id);
      quest = ContentRegistry.quests.get(quest.nextQuestId!)!;
    }
    progress.activeQuestId = null;
    const money = sim.state.player.money;
    expect(reconcileInactiveQuestChain(sim.state)).toBe(true);
    expect(progress.activeQuestId).toBe("quest.tradelanes_pinewatch");
    expect(sim.state.player.money).toBe(money);
    expect(reconcileInactiveQuestChain(sim.state)).toBe(false);
  });

  it("credits the woodland commission only for an actual sale at Pinewatch", () => {
    const sim = new Simulation();
    const progress = questTrackProgress(sim.state.quests, TRADELANES_QUEST_TRACK_ID);
    Object.assign(progress, { activeQuestId: "quest.tradelanes_pinewatch", activeStepIndex: 1, stepProgress: {} });
    InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [{ itemId: "produce.wheat", quantity: 16 }]);
    atMarket(sim, "market.village");
    expect(sim.sellItemAtMarket("market.village", "produce.wheat", 8).success).toBe(true);
    expect(progress.stepProgress).toEqual({});
    atMarket(sim, "market.pinewatch");
    expect(sim.sellItemAtMarket("market.pinewatch", "produce.wheat", 8).success).toBe(true);
    expect(progress.stepProgress["step.tradelanes_pinewatch_wheat"]).toBe(8);
    Object.assign(sim.state.player, MAINLAND_VILLAGES.pinewatch.npc);
    expect(sim.execute({ type: "quest.talk-npc", npcId: "npc.rowan" })).toMatchObject({ success: true, questCompleted: true });
    expect(progress.activeQuestId).toBe("quest.tradelanes_reedhaven");
  });
  it("keeps the two-pack carriage delivery, return supplies and commission coherent across reload", () => {
    let sim = new Simulation();
    const cart = sim.state.mounts[STARTER_CARRIAGE_ID];
    const rear = () => {
      const current = sim.state.mounts[STARTER_CARRIAGE_ID];
      const point = carriagePoint(current, 0, CARRIAGE_TUNING.rearOffset);
      Object.assign(sim.state.player, point, { y: current.y + 0.5 });
    };
    for (const id of ["cargo.highridge_a", "cargo.highridge_b"]) {
      rear();
      carriedTrout(sim, id);
      expect(sim.execute({ type: "cargo.load-carriage", mountId: cart.id }).success).toBe(true);
    }
    const loadedWork = sim.state.player.workCapacity.current;
    sim.advanceGameMinutes(12);
    expect(sim.state.fishCargo["cargo.highridge_a"].freshness).toBeLessThan(100);

    // Arrival is a domain fixture. Route support and vehicle collision have
    // their own physics tests; this case exercises the actual cargo commands.
    Object.assign(cart, { ...MAINLAND_VILLAGES.highridge.market, rotationY: Math.PI / 2,
      y: WorldLayout.traversalSurfaceHeight(MAINLAND_VILLAGES.highridge.market.x, MAINLAND_VILLAGES.highridge.market.z) });
    rear();
    const saved = { schemaVersion: CURRENT_SCHEMA_VERSION, savedAtUtcMs: 1, state: structuredClone(sim.state) };
    expect(validateSaveEnvelope(saved)).toBe(true);
    sim = new Simulation(migrateSaveData(saved).state);
    expect(sim.state.mounts[cart.id].fishCargoSlotIds).toEqual(["cargo.highridge_a", "cargo.highridge_b"]);
    const progress = questTrackProgress(sim.state.quests, TRADELANES_QUEST_TRACK_ID);
    Object.assign(progress, { activeQuestId: "quest.tradelanes_highridge", activeStepIndex: 0, stepProgress: {} });
    Object.assign(sim.state.player, MAINLAND_VILLAGES.highridge.npc);
    expect(sim.execute({ type: "quest.talk-npc", npcId: "npc.ada" }).success).toBe(true);
    expect(progress.activeStepIndex).toBe(1);
    for (const cargoId of ["cargo.highridge_a", "cargo.highridge_b"]) {
      rear();
      expect(sim.execute({ type: "cargo.pickup", cargoId }).success).toBe(true);
      atMarket(sim, "market.highridge");
      expect(sim.execute({ type: "market.sell-trade-pack", marketId: "market.highridge", cargoId }).success).toBe(true);
    }
    expect(sim.state.mounts[cart.id].fishCargoSlotIds).toEqual([null, null]);
    expect(progress.stepProgress["step.tradelanes_highridge_packs"]).toBe(2);
    const suppliesBefore = InventoryManager.getItemCount(sim.state.inventories[sim.state.player.inventoryId], "item.tool_steel");
    expect(sim.buyItemAtMarket("market.highridge", "item.tool_steel", 1).success).toBe(true);
    expect(InventoryManager.getItemCount(sim.state.inventories[sim.state.player.inventoryId], "item.tool_steel")).toBe(suppliesBefore + 1);
    Object.assign(sim.state.player, MAINLAND_VILLAGES.highridge.npc);
    expect(sim.execute({ type: "quest.talk-npc", npcId: "npc.ada" })).toMatchObject({ questCompleted: true });
    expect(sim.state.quests.completedQuestIds).toContain("quest.tradelanes_highridge");
    expect(sim.state.player.workCapacity.current).toBe(loadedWork);
    const delivered = { schemaVersion: CURRENT_SCHEMA_VERSION, savedAtUtcMs: 2, state: structuredClone(sim.state) };
    expect(validateSaveEnvelope(delivered)).toBe(true);
    const restored = new Simulation(migrateSaveData(delivered).state);
    expect(restored.state.player.money).toBe(sim.state.player.money);
    expect(restored.state.quests.completedQuestIds).toContain("quest.tradelanes_highridge");
  });

  it("keeps mainland schools in their authored freshwater and coastal habitats", () => {
    const sim = new Simulation();
    const points = FISHING_ECOLOGY_DEFINITIONS["ecology.neva"].schoolSpawnPoints.filter((point) => point.x < -300);
    expect(points.map((point) => point.habitatId).sort()).toEqual(["coast", "lake", "river"]);
    for (const point of points) {
      expect(WorldLayout.fishingHabitatAt(point.x, point.z)).toBe(point.habitatId);
      expect(WorldLayout.fishingEcologyAt(point.x, point.z).id).toBe("ecology.neva");
      const speciesId = point.habitatId === "coast" ? "fish.tuna" : "fish.trout";
      const schoolId = sim.spawnFishSchool(point.habitatId, point.x, point.z, [speciesId]);
      const school = sim.state.world.activeSchools[schoolId];
      expect(school).toBeDefined();
      expect(school.speciesWeights.map((entry) => entry.speciesId)).toEqual([speciesId]);
      expect(() => sim.spawnFishSchool(point.habitatId, point.x, point.z, ["fish.amberjack"])).toThrow(/eligible sport-fish/);
    }
  });

  it("names the chosen village and actual road or water options on the expedition board", () => {
    const sim = new Simulation();
    sim.state.contracts = [];
    for (const market of Object.values(sim.state.markets)) {
      for (const commodity of Object.values(market.commodities)) commodity.localSupply = commodity.targetSupply * 3;
    }
    sim.state.markets["market.highridge"].commodities["fish.trout"].localSupply = 0;
    const opportunity = sim.inspectExpeditionBoard().opportunities.find((entry) => entry.tone === "bold");
    expect(opportunity?.destination).toBe("Highridge Provisions");
    expect(opportunity?.journeyLabel).toMatch(/\d+ m away · Mountain road; no boat landing/);
  });

});
