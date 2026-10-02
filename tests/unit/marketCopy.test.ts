import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { localizeMarketText } from "../../src/i18n/marketText";
import { localeStore } from "../../src/i18n/localeStore";
import { getLocalizedFish, getLocalizedItem } from "../../src/i18n/i18n";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { MarketModal } from "../../src/ui/MarketModal";
import type { MarketId } from "../../src/simulation/core/types";

function renderMarket(sim: Simulation, marketId: MarketId, initialSection: "deliveries" | "sell" = "deliveries") {
  return renderToString(React.createElement(MarketModal, {
    board: sim.inspectMarketBoard(marketId), initialSection,
    onInspectCommodity: (id, item, intent, count) => sim.inspectCommodityAtMarket(id, item, intent, count),
    onSellItem: () => {}, onSellAllProduce: () => {}, onBuySeed: () => {}, onBuyItem: () => {},
    onBuyRod: () => {}, onEquipRod: () => {}, onSellFishCargo: () => {}, onSellAllFishCargo: () => {},
    onDiscardFishCargo: () => {}, onReleaseFishCargo: () => {}, onDeliverContractItems: () => {},
    onDeliverFishCargo: () => {}, onPassContract: () => {}, onClose: () => {}
  }));
}

function atMarket(sim: Simulation, id: MarketId) {
  const point = ContentRegistry.markets.get(id)!.interactionPosition;
  sim.state.player.x = point.x;
  sim.state.player.z = point.z;
}

afterEach(() => localeStore.set("en"));

describe("market copy uses the live delivery and quote data", () => {
  it("renders partial satchel delivery and removes the settled order without a claim step", () => {
    const sim = new Simulation();
    atMarket(sim, "market.village");
    const contract = sim.state.contracts[0];
    contract.quantityRequired = 3;
    contract.expiresAtMinute = sim.state.clock.currentMinute + 61;
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inventory, [{ itemId: "produce.wheat", quantity: 2 }]);
    localeStore.set("tr");
    const html = renderMarket(sim, "market.village");
    expect(html).toContain(getLocalizedItem("produce.wheat", "tr").name);
    expect(html).toContain("1 sa 1 dk kaldı · oyun süresi");
    expect(html).toContain("Çantadan 2 adet teslim et");
    expect(html).not.toContain("Due in");
    const purse = sim.state.player.money;
    expect(sim.deliverItemsToContract(contract.id, "produce.wheat", 2)).toMatchObject({ success: true, completed: false });
    expect(sim.state.player.money).toBe(purse);
    expect(sim.inspectMarketBoard("market.village")!.contractRows[0]).toMatchObject({ quantityFulfilled: 2, ready: false });
    InventoryManager.addItemsAtomically(inventory, [{ itemId: "produce.wheat", quantity: 1 }]);
    expect(sim.deliverItemsToContract(contract.id, "produce.wheat", 1)).toMatchObject({ success: true, completed: true });
    expect(sim.state.player.money).toBeGreaterThan(purse);
    expect(sim.inspectMarketBoard("market.village")!.contractRows.some((row) => row.contractId === contract.id)).toBe(false);
  });

  it("localizes physical catch requirements and respects actual quality eligibility", () => {
    const sim = new Simulation();
    atMarket(sim, "market.harbor");
    sim.state.contracts = [{
      id: "contract.copy", templateId: "contract.fresh_trout_order", requesterId: "contract.fresh_trout_order",
      deliveryMarketId: "market.harbor", type: "fresh-fish", targetItemIdOrSpecies: "fish.trout",
      quantityRequired: 1, quantityFulfilled: 0, deliveredValueMoney: 0, legacyUnvaluedQuantity: 0, rewardMoney: 152, rewardSkillXp: { skill: "fishing", xp: 50 },
      minQuality: "fine", minFreshness: 80, minWeightKg: 2.5, expiresAtMinute: sim.state.clock.currentMinute + 23, status: "active"
    }];
    sim.state.fishCargo["cargo.copy"] = {
      id: "cargo.copy", speciesId: "fish.trout", weightKg: 3, quality: "common", freshness: 90,
      caughtAtMinute: sim.state.clock.currentMinute, cargoClass: "small", location: { type: "player", containerId: "player" }
    };
    sim.state.player.carriedFishCargoId = "cargo.copy";
    localeStore.set("tr");
    const html = renderMarket(sim, "market.harbor");
    expect(html).toContain(getLocalizedFish("fish.trout", "tr").name);
    expect(html).toContain("En az iyi kalite");
    expect(html).toContain("En az %80 tazelik");
    expect(html).toContain("En az 2.5 kg");
    expect(html).toContain("23 dk kaldı · oyun süresi");
    expect(html).not.toContain("Balığı teslim et");
    sim.state.fishCargo["cargo.copy"].quality = "fine";
    expect(renderMarket(sim, "market.harbor")).toContain("Balığı teslim et");
    expect(sim.inspectMarketBoard("market.harbor")!.contractRows[0].eligibleCargoIds).toEqual(["cargo.copy"]);
  });

  it("keeps all demand states distinct and preserves quoted time and values", () => {
    expect(["Wanted", "Steady", "Plentiful"].map((label) => localizeMarketText(label, "tr"))).toEqual(["Aranıyor", "Dengeli", "Bol"]);
    expect(localizeMarketText("Due in 2h (game time)", "tr")).toBe("2 sa kaldı · oyun süresi");
    expect(localizeMarketText("Due now", "tr")).toBe("Süre doldu");
    expect(localizeMarketText("prize", "tr")).toBe("Ödüllük");
    expect(localizeMarketText("1,200 Fishing XP required", "tr")).toBe("1,200 Balıkçılık TP gerekiyor");
    expect(localizeMarketText("Requires 450 Farming XP", "tr")).toBe("450 Çiftçilik TP gerekiyor");
    expect(localizeMarketText("Only 3 in stock", "tr")).toBe("Stokta yalnızca 3 var");
    expect(localizeMarketText("Due in 23m (game time)", "en")).toBe("Due in 23m (game time)");
  });
});
