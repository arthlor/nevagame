import { VILLAGE_TRADE_STATIONS } from "../../src/world/VillageTradeLayout";
import { VILLAGE_TRADE_GOODS } from "../../src/content/villageTrade";
import { WorldLayout } from "../../src/world/WorldLayout";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";
import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { FARM_PACK_RECIPES } from "../../src/content/farmPacks";
import { getProcessingStationFrontPosition } from "../../src/world/ProcessingStationApproach";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { cargoPackAsset } from "../../src/render/scene/FishSchoolAssets";
import predecessor from "../fixtures/save_v63_farm_packs_predecessor.json";
import type { SaveEnvelope } from "../../src/persistence/SaveSchema";
import { CARRIAGE_TUNING, STARTER_CARRIAGE_ID, carriagePoint } from "../../src/simulation/mounts/Carriage";
import { HARBOR_DOCK } from "../../src/world/WorldAnchors";

function stand(sim: Simulation, point: { x: number; z: number }) {
  Object.assign(sim.state.player, point, { y: WorldLayout.traversalSurfaceHeight(point.x, point.z) + .5 });
}
function crate(sim: Simulation) { stand(sim, sim.state.world.structures["struct.kitchen"]); }
function packingYard(sim: Simulation) {
  const front = getProcessingStationFrontPosition("struct.trade_neva", sim.state.world.structures["struct.trade_neva"]);
  stand(sim, front!);
}
function market(sim: Simulation, id = "market.village") {
  stand(sim, ContentRegistry.markets.get(id)!.interactionPosition!);
}
function save(sim: Simulation): SaveEnvelope {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, savedAtUtcMs: 1, state: structuredClone(sim.state) };
}
function pack(sim: Simulation, recipeId = "recipe.pack_wheat") {
  const recipe = ContentRegistry.recipes.get(recipeId)!;
  const station = VILLAGE_TRADE_STATIONS.find(s => VILLAGE_TRADE_GOODS[s.marketId].includes(recipe.inputs[0].itemId))!;
  const front = getProcessingStationFrontPosition(station.id, sim.state.world.structures[station.id])!;
  Object.assign(sim.state.player, front, { y: WorldLayout.traversalSurfaceHeight(front.x, front.z) + .5 });
  expect(sim.startProcessingJob(recipeId, station.id).success).toBe(true);
  sim.advanceGameMinutes(5);
  const job = Object.values(sim.state.processingJobs)[0];
  expect(sim.collectProcessingJob(job.id).success).toBe(true);
  return sim.state.player.carriedFishCargoId!;
}

describe("harvest trade packs", () => {
  it("preserves old saves without mutation and is idempotent", () => {
    const old = structuredClone(predecessor) as unknown as SaveEnvelope;
    expect(validateSaveEnvelope(old)).toBe(true);
    const before = structuredClone(old);
    const migrated = migrateSaveData(old);
    expect(old).toEqual(before);
    for (const key of Object.keys(before.state) as (keyof typeof before.state)[]) {
      if (key !== "schemaVersion" && key !== "markets" && key !== "world" && key !== "quests" && key !== "player" && key !== "boats") expect(migrated.state[key]).toEqual(before.state[key]);
    }
    expect(migrated.state.player).toMatchObject({
      x: before.state.player.x, z: before.state.player.z,
      money: before.state.player.money, proficiencies: before.state.player.proficiencies
    });
    expect(Math.abs(migrated.state.player.y - before.state.player.y)).toBeLessThan(.01);
    expect(migrated.state.boats["boat.player_rowboat"]).toMatchObject({
      ...HARBOR_DOCK.boatPosition,
      fishCargoSlotIds: before.state.boats["boat.player_rowboat"].fishCargoSlotIds,
      isDocked: true
    });
    for (const [id, oldMarket] of Object.entries(before.state.markets)) {
      for (const [itemId, commodity] of Object.entries(oldMarket.commodities)) expect(migrated.state.markets[id].commodities[itemId]).toEqual(commodity);
    }
    expect(validateSaveEnvelope(migrated)).toBe(true);
    expect(migrateSaveData(migrated)).toEqual(migrated);
  });

  it("freezes mixed grades, survives reload, requires collection and sells once", () => {
    let sim = new Simulation();
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    expect(InventoryManager.addItemsAtomically(inventory, [
      { itemId: "produce.wheat", quantity: 4, quality: "common" },
      { itemId: "produce.wheat", quantity: 6, quality: "prize" }
    ])).toBe(true);
    packingYard(sim);
    const work = sim.state.player.workCapacity.current;
    expect(sim.startProcessingJob("recipe.pack_wheat", "struct.trade_neva")).toMatchObject({ success: true });
    const job = Object.values(sim.state.processingJobs)[0];
    expect(job.result).toMatchObject({ kind: "farm-pack", lots: [
      { itemId: "produce.wheat", quantity: 4, quality: "common" },
      { itemId: "produce.wheat", quantity: 6, quality: "prize" }
    ] });
    expect(sim.state.player.workCapacity.current).toBe(work - job.chargedWork);
    expect(sim.collectProcessingJob(job.id).success).toBe(false);
    expect(validateSaveEnvelope(save(sim))).toBe(true);
    sim = new Simulation(migrateSaveData(save(sim)).state);
    sim.advanceGameMinutes(5);
    expect(sim.collectProcessingJob(job.id).success).toBe(true);
    const id = sim.state.player.carriedFishCargoId!;
    expect(sim.state.fishCargo[id]).toMatchObject({ kind: "farm", quality: "common", cargoClass: "medium" });
    expect(validateSaveEnvelope(save(sim))).toBe(true);
    expect(sim.releaseFishCargo(id).success).toBe(false);
    expect(sim.sellFishCargoAtMarket("market.village", id).success).toBe(false);
    expect(sim.sellFishTradePackAtMarket("market.village", id).success).toBe(false);
    market(sim);
    const quote = sim.inspectMarketBoard("market.village")!.tradePackRows.find((row) => row.cargoId === id)!;
    expect(quote.breakdown).toBeDefined();
    const before = sim.state.player.money;
    const supply = sim.state.markets["market.village"].commodities["produce.wheat"].localSupply;
    expect(sim.sellFishTradePackAtMarket("market.village", id)).toMatchObject({ success: true, revenue: quote.breakdown!.finalPrice });
    expect(sim.state.player.money).toBe(before + quote.breakdown!.finalPrice);
    expect(sim.state.markets["market.village"].commodities["produce.wheat"].localSupply).toBe(supply + 10);
    expect(sim.state.player.carriedFishCargoId).toBeNull();
    expect(sim.sellFishTradePackAtMarket("market.village", id).success).toBe(false);
    expect(validateSaveEnvelope(save(sim))).toBe(true);
  });

  it("supports every harvested crop with a published pack binding", () => {
    for (const recipe of FARM_PACK_RECIPES) {
      const sim = new Simulation();
      expect(InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], recipe.inputs)).toBe(true);
      const id = pack(sim, recipe.id);
      expect(cargoPackAsset(sim.state.fishCargo[id]), recipe.id).toBeTruthy();
      expect(validateSaveEnvelope(save(sim)), recipe.id).toBe(true);
      market(sim);
      expect(sim.sellFishTradePackAtMarket("market.village", id).success, recipe.id).toBe(true);
    }
  });

  it("does not grant a second pack or refresh a spoiled pack", () => {
    const sim = new Simulation();
    InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [{ itemId: "produce.wheat", quantity: 20 }]);
    const id = pack(sim);
    packingYard(sim);
    const before = structuredClone(sim.state);
    expect(sim.startProcessingJob("recipe.pack_wheat", "struct.trade_neva").success).toBe(false);
    expect(sim.state).toEqual(before);
    sim.advanceGameMinutes(60);
    expect(sim.state.fishCargo[id].freshness).toBeLessThan(100);
    sim.state.fishCargo[id].freshness = 0;
    market(sim);
    expect(sim.sellFishTradePackAtMarket("market.village", id).success).toBe(false);
    expect(sim.discardFishCargo(id).success).toBe(true);
    expect(sim.state.fishCargo[id]).toBeUndefined();
  });

  it("rejects forged contents and grades in saves", () => {
    const sim = new Simulation();
    InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [{ itemId: "produce.wheat", quantity: 10 }]);
    const id = pack(sim);
    const envelope = save(sim);
    const cargo = envelope.state.fishCargo[id];
    if (cargo.kind !== "farm") throw new Error("expected farm pack");
    cargo.lots[0].quantity = 100;
    expect(validateSaveEnvelope(envelope)).toBe(false);
    cargo.lots[0].quantity = 10;
    cargo.quality = "prize";
    expect(validateSaveEnvelope(envelope)).toBe(false);
  });
  it("delivers whole packs to produce orders without overfilling or losing expiry value", () => {
    const sim = new Simulation();
    InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [{ itemId: "produce.wheat", quantity: 20 }]);
    const id = pack(sim);
    market(sim);
    const contract = sim.state.contracts.find((entry) => entry.type === "produce" && entry.targetItemIdOrSpecies === "produce.wheat")!;
    expect(contract).toBeDefined();
    contract.quantityRequired = 9;
    const before = structuredClone(sim.state);
    expect(sim.deliverFishCargoToContract(contract.id, id).success).toBe(false);
    expect(sim.state).toEqual(before);
    contract.quantityRequired = 20;
    const row = sim.inspectMarketBoard("market.village")!.contractRows.find((entry) => entry.contractId === contract.id)!;
    expect(row.eligibleCargoIds).toContain(id);
    const expected = sim.inspectMarketBoard("market.village")!.tradePackRows[0].breakdown!.finalPrice;
    expect(sim.deliverFishCargoToContract(contract.id, id)).toMatchObject({ success: true, delivered: 10, completed: false });
    expect(contract.deliveredValueMoney).toBe(expected);
    expect(sim.state.fishCargo[id]).toBeUndefined();
    expect(validateSaveEnvelope(save(sim))).toBe(true);
    const purse = sim.state.player.money;
    sim.advanceGameMinutes(contract.expiresAtMinute - sim.state.clock.currentMinute);
    expect(sim.state.player.money).toBe(purse + expected);
    expect(contract.status).toBe("expired");
    sim.advanceGameMinutes(1);
    expect(sim.state.player.money).toBe(purse + expected);
  });

  it("prices a local bought-flax pack without a distance premium and charges production Work", () => {
    const sim = new Simulation();
    sim.state.player.money = 10000;
    market(sim, "market.pinewatch");
    const purchase = sim.buyItemAtMarket("market.pinewatch", "produce.flax", 10);
    expect(purchase.success).toBe(true);
    const work = sim.state.player.workCapacity.current;
    const id = pack(sim, "recipe.pack_flax");
    expect(sim.state.player.workCapacity.current).toBeLessThan(work);
    market(sim, "market.pinewatch");
    const sale = sim.sellFishTradePackAtMarket("market.pinewatch", id);
    expect(sale.success).toBe(true);
    expect(sale.revenue!).toBeLessThanOrEqual(Math.floor(purchase.cost! * 1.15));
  });

  it("moves through finite crate storage without duplicating contents or freshness", () => {
    const sim = new Simulation();
    InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [{ itemId: "produce.wheat", quantity: 30 }]);
    const first = pack(sim);
    crate(sim);
    expect(sim.execute({ type: "storage.store-fish", kind: "crate", cargoId: first }).success).toBe(true);
    const second = pack(sim);
    crate(sim);
    expect(sim.execute({ type: "storage.store-fish", kind: "crate", cargoId: second }).success).toBe(true);
    const third = pack(sim);
    crate(sim);
    const before = structuredClone(sim.state);
    expect(sim.execute({ type: "storage.store-fish", kind: "crate", cargoId: third }).success).toBe(false);
    expect(sim.state).toEqual(before);
    expect(sim.discardFishCargo(third).success).toBe(true);
    const freshness = sim.state.fishCargo[first].freshness;
    expect(sim.execute({ type: "storage.take-fish", kind: "crate", cargoId: first }).success).toBe(true);
    expect(sim.state.fishCargo[first].freshness).toBe(freshness);
    expect(sim.state.player.carriedFishCargoId).toBe(first);
    expect(validateSaveEnvelope(save(sim))).toBe(true);
  });

  it("retains packed grades and slot ownership through carriage transport and reload", () => {
    let sim = new Simulation();
    InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [
      { itemId: "produce.wheat", quantity: 3, quality: "fine" },
      { itemId: "produce.wheat", quantity: 7, quality: "exceptional" }
    ]);
    const id = pack(sim);
    const packed = structuredClone(sim.state.fishCargo[id]);
    stand(sim, carriagePoint(sim.state.mounts[STARTER_CARRIAGE_ID], 0, CARRIAGE_TUNING.rearOffset));
    const work = sim.state.player.workCapacity.current;
    expect(sim.execute({ type: "cargo.load-carriage", mountId: STARTER_CARRIAGE_ID }).success).toBe(true);
    expect(sim.state.player.carriedFishCargoId).toBeNull();
    expect(validateSaveEnvelope(save(sim))).toBe(true);
    sim = new Simulation(migrateSaveData(save(sim)).state);
    expect(sim.state.mounts[STARTER_CARRIAGE_ID].fishCargoSlotIds).toContain(id);
    expect(sim.pickupFishCargo(id).success).toBe(true);
    expect(sim.state.mounts[STARTER_CARRIAGE_ID].fishCargoSlotIds).not.toContain(id);
    expect(sim.state.fishCargo[id]).toEqual(packed);
    expect(sim.state.player.workCapacity.current).toBe(work);
    market(sim);
    expect(sim.sellFishTradePackAtMarket("market.village", id).success).toBe(true);
    expect(sim.state.player.carriedFishCargoId).toBeNull();
    expect(sim.state.fishCargo[id]).toBeUndefined();
    expect(validateSaveEnvelope(save(sim))).toBe(true);
  });

  it("uses a fitting vessel hold and preserves farm contents through an afloat reload", () => {
    let sim = new Simulation();
    InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [
      { itemId: "produce.wheat", quantity: 10, quality: "fine" }
    ]);
    const id = pack(sim);
    const packed = structuredClone(sim.state.fishCargo[id]);
    const journal = structuredClone(sim.state.journal.fishRecords);
    sim.prepareDebugHarborBoarding();
    expect(sim.boardBoat("boat.player_rowboat").success).toBe(true);
    const work = sim.state.player.workCapacity.current;
    expect(sim.execute({ type: "cargo.stow-aboard", boatId: "boat.player_rowboat", placement: "hold" }).success).toBe(true);
    expect(sim.state.boats["boat.player_rowboat"].fishCargoSlotIds).toEqual([null, id]);
    expect(sim.state.player.carriedFishCargoId).toBeNull();
    expect(validateSaveEnvelope(save(sim))).toBe(true);
    sim = new Simulation(migrateSaveData(save(sim)).state);
    expect(sim.state.player.activeBoatId).toBe("boat.player_rowboat");
    expect(sim.pickupFishCargo(id).success).toBe(true);
    expect(sim.state.boats["boat.player_rowboat"].fishCargoSlotIds).toEqual([null, null]);
    expect(sim.state.fishCargo[id]).toEqual(packed);
    expect(sim.state.player.workCapacity.current).toBe(work);
    expect(sim.state.journal.fishRecords).toEqual(journal);
    expect(validateSaveEnvelope(save(sim))).toBe(true);
  });

  it("keeps the previous durable save as backup when committing packed cargo", async () => {
    const restore = installMemoryIndexedDB();
    let db: IDBDatabase | undefined;
    try {
      db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("neva_save_db", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("game_saves");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = db!.transaction("game_saves", "readwrite");
        transaction.objectStore("game_saves").put(structuredClone(predecessor), "primary_save");
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      const repository = new IndexedDbSaveRepository();
      const loaded = await repository.loadGameResult();
      expect(loaded.status).toBe("loaded");
      if (loaded.status !== "loaded") throw new Error("predecessor did not load");
      const previous = structuredClone(loaded.envelope);
      const sim = new Simulation(loaded.envelope.state);
      InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [{ itemId: "produce.wheat", quantity: 10 }]);
      pack(sim);
      expect(await repository.saveGame(sim.state)).toBe(true);
      const backup = await new Promise<unknown>((resolve, reject) => {
        const request = db!.transaction("game_saves", "readonly").objectStore("game_saves").get("backup_save");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      expect(backup).toEqual(previous);
      expect(validateSaveEnvelope(backup)).toBe(true);
      const reloaded = await repository.loadGameResult();
      expect(reloaded.status).toBe("loaded");
      if (reloaded.status === "loaded") {
        const id = reloaded.envelope.state.player.carriedFishCargoId!;
        expect(reloaded.envelope.state.fishCargo[id]).toMatchObject({ kind: "farm", itemId: "produce.wheat" });
      }
    } finally {
      db?.close();
      restore();
    }
  });

});
