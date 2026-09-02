import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { buildExpeditionOpportunities } from "../../src/simulation/expeditions/buildExpeditionOpportunities";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";

describe("expedition opportunity query", () => {
  it("offers deterministic steady and bold choices with actionable blockers", () => {
    const sim = new Simulation();
    sim.state.contracts = [];
    sim.state.quests.unlockedFeatureIds.push("boat.player_rowboat");
    sim.state.player.equippedRodId = "rod.willow";
    sim.advanceGameMinutes(1);

    const marketSignals = {
      steady: sim.inspectMarketDemand("market.village"),
      bold: sim.inspectMarketDemand("market.harbor")
    };

    const first = buildExpeditionOpportunities(sim.state, marketSignals);
    const second = buildExpeditionOpportunities(sim.state, marketSignals);
    expect(second).toEqual(first);
    expect(first.map((choice) => choice.tone)).toEqual(["steady", "bold"]);
    expect(first[0].kind).toBe("contract");
    expect(first[1].kind).toBe("contract");
    expect(first[1].blockers).toContain("Pack a chum bucket");
    expect(first[1].blockers).toContain("No crushed ice is packed for the freshness target");

    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    expect(InventoryManager.addItemsAtomically(inventory, [
      { itemId: "item.chum_bucket", quantity: 1 },
      { itemId: "item.crushed_ice", quantity: 1 }
    ])).toBe(true);
    const prepared = buildExpeditionOpportunities(sim.state, {
      steady: sim.inspectMarketDemand("market.village"),
      bold: sim.inspectMarketDemand("market.harbor")
    });
    expect(prepared[1].blockers).not.toContain("Pack a chum bucket");
    expect(prepared[1].blockers).not.toContain("No crushed ice is packed for the freshness target");
  });
});
