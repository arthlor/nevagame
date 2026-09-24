import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { quoteCommoditySale, cropQualityPriceMultiplier } from "../../src/simulation/economy/marketPricing";
import { calculateFishPrice } from "../../src/simulation/economy/calculateFishValue";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { HARBOR_MARKET, VILLAGE_MARKET } from "../../src/world/WorldAnchors";
import predecessor from "../fixtures/save_v56_contract_settlement_predecessor.json";

describe("partial contract settlement", () => {
  it("pays at least the delivered spot value when that exceeds the posted completion reward", () => {
    const sim = new Simulation();
    const state = sim.state;
    state.player.x = VILLAGE_MARKET.position.x;
    state.player.z = VILLAGE_MARKET.position.z;
    const contract = state.contracts[0];
    contract.quantityRequired = 2;
    contract.rewardMoney = 1;
    const inventory = state.inventories[state.player.inventoryId];
    expect(InventoryManager.addItemsAtomically(inventory, [
      { itemId: "produce.wheat", quantity: 1, quality: "prize" }
    ])).toBe(true);
    const paidEvents: number[] = [];
    sim.events.on("ContractCompleted", ({ rewardMoney }) => paidEvents.push(rewardMoney));
    const purseBefore = state.player.money;

    expect(sim.deliverItemsToContract(contract.id, "produce.wheat", 1))
      .toMatchObject({ success: true, completed: false });
    const firstValue = contract.deliveredValueMoney;
    expect(firstValue).toBeGreaterThan(contract.rewardMoney);
    const boardRow = sim.inspectMarketBoard("market.village")!.contractRows
      .find((row) => row.contractId === contract.id)!;
    expect(boardRow.rewardMoney).toBe(1);
    expect(boardRow.currentCompletionFloorMoney).toBe(firstValue);
    expect(InventoryManager.addItemsAtomically(inventory, [
      { itemId: "produce.wheat", quantity: 1, quality: "common" }
    ])).toBe(true);

    const completed = sim.deliverItemsToContract(contract.id, "produce.wheat", 1);
    expect(completed).toMatchObject({ success: true, completed: true });
    expect(completed.rewardMoney).toBeGreaterThan(1);
    expect(state.player.money).toBe(purseBefore + completed.rewardMoney!);
    expect(paidEvents).toEqual([completed.rewardMoney]);
    expect(contract.deliveredValueMoney).toBe(0);
    expect(contract.legacyUnvaluedQuantity).toBe(0);
  });

  it("locks the actual removed produce grades at delivery and pays that value after a market swing", () => {
    const sim = new Simulation();
    const state = sim.state;
    state.player.x = VILLAGE_MARKET.position.x;
    state.player.z = VILLAGE_MARKET.position.z;
    const inventory = state.inventories[state.player.inventoryId];
    expect(InventoryManager.addItemsAtomically(inventory, [
      { itemId: "produce.wheat", quantity: 2, quality: "common" },
      { itemId: "produce.wheat", quantity: 2, quality: "prize" }
    ])).toBe(true);

    const commodity = state.markets["market.village"].commodities["produce.wheat"];
    const expected = quoteCommoditySale(commodity, 3, {
      absoluteHour: state.clock.currentMinute / 60,
      worldSeed: state.worldSeed,
      qualityMultipliers: [
        cropQualityPriceMultiplier("common"),
        cropQualityPriceMultiplier("common"),
        cropQualityPriceMultiplier("prize")
      ]
    }).total;
    const contract = state.contracts[0];
    const purseBefore = state.player.money;
    expect(sim.deliverItemsToContract(contract.id, "produce.wheat", 3)).toMatchObject({ success: true, completed: false });
    expect(contract.deliveredValueMoney).toBe(expected);
    expect(contract.legacyUnvaluedQuantity).toBe(0);
    expect(InventoryManager.getItemLotCount(inventory, "produce.wheat", "common")).toBe(0);
    expect(InventoryManager.getItemLotCount(inventory, "produce.wheat", "prize")).toBe(1);
    expect(state.player.money).toBe(purseBefore);
    expect(validateSaveEnvelope({ schemaVersion: CURRENT_SCHEMA_VERSION, savedAtUtcMs: 1, state })).toBe(true);

    commodity.localSupply = commodity.targetSupply * 2;
    commodity.seasonalModifier = 2;
    contract.expiresAtMinute = state.clock.currentMinute + 1;
    sim.advanceGameMinutes(2);
    expect(contract.status).toBe("expired");
    expect(contract.quantityFulfilled).toBe(0);
    expect(contract.deliveredValueMoney).toBe(0);
    expect(state.player.money).toBe(purseBefore + expected);
  });

  it("locks each delivered fish's real weight, grade and freshness value", () => {
    const sim = new Simulation();
    const state = sim.state;
    state.player.x = HARBOR_MARKET.position.x;
    state.player.z = HARBOR_MARKET.position.z;
    state.contracts.push({
      id: "contract.fish_value_test", templateId: "contract.fresh_trout_order",
      requesterId: "contract.fresh_trout_order", deliveryMarketId: "market.harbor",
      type: "fresh-fish", targetItemIdOrSpecies: "fish.trout", quantityRequired: 2,
      quantityFulfilled: 0, deliveredValueMoney: 0, legacyUnvaluedQuantity: 0,
      minFreshness: 80, rewardMoney: 152, rewardSkillXp: { skill: "fishing", xp: 50 },
      expiresAtMinute: state.clock.currentMinute + 120, status: "active"
    });
    const contract = state.contracts.at(-1)!;
    state.fishCargo["cargo.fish_value_test"] = {
      id: "cargo.fish_value_test", speciesId: "fish.trout", weightKg: 7,
      quality: "exceptional", caughtAtMinute: state.clock.currentMinute,
      freshness: 90, cargoClass: "small", location: { type: "player", containerId: "player" }
    };
    state.player.carriedFishCargoId = "cargo.fish_value_test";
    // A sport fish is a physical trade pack, so the Harbor has no spot-sale
    // counter for it; the contract values its exact cargo at Harbor's quote.
    const commodity = state.markets["market.harbor"].commodities["fish.trout"];
    const demand = quoteCommoditySale(commodity, 1, {
      absoluteHour: state.clock.currentMinute / 60,
      worldSeed: state.worldSeed
    }).averageDemandModifier;
    const expected = calculateFishPrice(
      ContentRegistry.fishSpecies.get("fish.trout")!, 7, "exceptional", 90,
      demand, commodity.seasonalModifier
    ).finalPrice;
    const purseBefore = state.player.money;
    expect(sim.deliverFishCargoToContract(contract.id, "cargo.fish_value_test"))
      .toMatchObject({ success: true, completed: false });
    expect(contract.deliveredValueMoney).toBe(expected);
    expect(state.fishCargo["cargo.fish_value_test"]).toBeUndefined();
    expect(state.player.carriedFishCargoId).toBeNull();

    state.markets["market.harbor"].commodities["fish.trout"].localSupply = 1000;
    contract.expiresAtMinute = state.clock.currentMinute + 1;
    sim.advanceGameMinutes(2);
    expect(contract.status).toBe("expired");
    expect(state.player.money).toBe(purseBefore + expected);
  });

  it("requires a physical fish pack to be carried into its commission counter", () => {
    const sim = new Simulation();
    const state = sim.state;
    state.player.x = HARBOR_MARKET.position.x;
    state.player.z = HARBOR_MARKET.position.z;
    const boat = state.boats["boat.player_rowboat"];
    boat.isDocked = true;
    boat.dockedMarketId = "market.harbor";
    state.contracts.push({
      id: "contract.hand_in_test", templateId: "contract.fresh_trout_order",
      requesterId: "contract.fresh_trout_order", deliveryMarketId: "market.harbor",
      type: "fresh-fish", targetItemIdOrSpecies: "fish.trout", quantityRequired: 1,
      quantityFulfilled: 0, deliveredValueMoney: 0, legacyUnvaluedQuantity: 0,
      minFreshness: 80, rewardMoney: 100, rewardSkillXp: { skill: "fishing", xp: 20 },
      expiresAtMinute: state.clock.currentMinute + 120, status: "active"
    });
    boat.fishCargoSlotIds[0] = "cargo.hand_in_test";
    state.fishCargo["cargo.hand_in_test"] = {
      id: "cargo.hand_in_test", speciesId: "fish.trout", weightKg: 3,
      quality: "common", caughtAtMinute: state.clock.currentMinute,
      freshness: 90, cargoClass: "small",
      location: { type: "boat-hold", containerId: boat.id, slotIndex: 0 }
    };
    const moneyBefore = state.player.money;
    expect(sim.deliverFishCargoToContract("contract.hand_in_test", "cargo.hand_in_test"))
      .toMatchObject({ success: false, reason: "Collect this fish trade pack and carry it to the contract counter" });
    expect(state.fishCargo["cargo.hand_in_test"]).toBeDefined();
    expect(boat.fishCargoSlotIds[0]).toBe("cargo.hand_in_test");
    expect(state.player.money).toBe(moneyBefore);
    expect(state.contracts.at(-1)!.quantityFulfilled).toBe(0);
    const heldRow = sim.inspectMarketBoard("market.harbor")!.contractRows
      .find((row) => row.contractId === "contract.hand_in_test")!;
    expect(heldRow.ready).toBe(false);
    expect(heldRow.blockerReasons).toContain("Collect this fish trade pack and carry it to the contract counter");

    boat.fishCargoSlotIds[0] = null;
    state.fishCargo["cargo.hand_in_test"].location = { type: "player", containerId: "player" };
    state.player.carriedFishCargoId = "cargo.hand_in_test";
    const carriedRow = sim.inspectMarketBoard("market.harbor")!.contractRows
      .find((row) => row.contractId === "contract.hand_in_test")!;
    expect(carriedRow.ready).toBe(true);
    expect(carriedRow.eligibleCargoIds).toContain("cargo.hand_in_test");
    expect(sim.deliverFishCargoToContract("contract.hand_in_test", "cargo.hand_in_test"))
      .toMatchObject({ success: true, completed: true, rewardMoney: 100 });
    expect(state.fishCargo["cargo.hand_in_test"]).toBeUndefined();
    expect(state.player.carriedFishCargoId).toBeNull();
  });

  it("migrates real v56 partials without inventing the grade or fish instance that was lost", () => {
    const legacy = structuredClone(predecessor) as unknown as SaveEnvelope;
    expect(validateSaveEnvelope(legacy)).toBe(true);
    const original = structuredClone(legacy);
    const migrated = migrateSaveData(legacy);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(validateSaveEnvelope(migrated)).toBe(true);
    expect(migrated.state.player.money).toBe(original.state.player.money);
    expect(migrated.state.inventories).toEqual(original.state.inventories);
    expect(migrated.state.contracts.map((contract) => ({
      quantityFulfilled: contract.quantityFulfilled,
      deliveredValueMoney: contract.deliveredValueMoney,
      legacyUnvaluedQuantity: contract.legacyUnvaluedQuantity
    }))).toEqual([
      { quantityFulfilled: 2, deliveredValueMoney: 0, legacyUnvaluedQuantity: 2 },
      { quantityFulfilled: 1, deliveredValueMoney: 0, legacyUnvaluedQuantity: 1 }
    ]);
    expect(legacy).toEqual(original);
    expect(migrateSaveData(migrated)).toEqual(migrated);
  });

  it("preserves an accepted Village flax order when new Sailmaker orders move to Reedhaven", () => {
    const legacy = structuredClone(predecessor) as unknown as SaveEnvelope;
    legacy.state.contracts.push({
      id: "contract.legacy_flax", templateId: "contract.flax_bolts",
      requesterId: "contract.flax_bolts", deliveryMarketId: "market.village",
      type: "produce", targetItemIdOrSpecies: "produce.flax",
      quantityRequired: 4, quantityFulfilled: 0, rewardMoney: 100,
      rewardSkillXp: { skill: "farming", xp: 20 },
      expiresAtMinute: legacy.state.clock.currentMinute + 120, status: "active"
    } as SaveEnvelope["state"]["contracts"][number]);
    expect(validateSaveEnvelope(legacy)).toBe(true);
    const migrated = migrateSaveData(legacy);
    expect(validateSaveEnvelope(migrated)).toBe(true);
    expect(migrated.state.contracts.at(-1)?.deliveryMarketId).toBe("market.village");
  });

  it("settles migrated and new units once each when a mixed contract expires", () => {
    const migrated = migrateSaveData(structuredClone(predecessor) as unknown as SaveEnvelope);
    const sim = new Simulation(migrated.state);
    const state = sim.state;
    state.player.x = VILLAGE_MARKET.position.x;
    state.player.z = VILLAGE_MARKET.position.z;
    const inventory = state.inventories[state.player.inventoryId];
    expect(InventoryManager.addItemsAtomically(inventory, [
      { itemId: "produce.wheat", quantity: 1, quality: "prize" }
    ])).toBe(true);
    const contract = state.contracts[0];
    const purseBefore = state.player.money;
    expect(sim.deliverItemsToContract(contract.id, "produce.wheat", 1))
      .toMatchObject({ success: true, completed: false });
    const exactNewValue = contract.deliveredValueMoney;
    expect(exactNewValue).toBeGreaterThan(0);
    expect(contract.legacyUnvaluedQuantity).toBe(2);
    contract.expiresAtMinute = state.clock.currentMinute + 1;
    sim.advanceGameMinutes(2);
    expect(contract.status).toBe("expired");
    expect(contract.quantityFulfilled).toBe(0);
    expect(contract.legacyUnvaluedQuantity).toBe(0);
    expect(state.player.money).toBe(purseBefore + exactNewValue);
    expect(InventoryManager.getItemLotCount(inventory, "produce.wheat", undefined)).toBe(2);
  });
});
