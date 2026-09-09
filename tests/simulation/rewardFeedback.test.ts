import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { RewardFeedbackPresentation } from "../../src/simulation/presentation/RewardFeedbackPresentation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";

describe("reward presentation", () => {
  it("suppresses loaded wealth and emits each successful state change once", () => {
    const sim = new Simulation();
    const feedback = new RewardFeedbackPresentation();
    expect(feedback.sample(sim.state)).toEqual([]);
    sim.state.player.money += 12;
    sim.state.player.proficiencies.fishing += 120;
    expect(InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [{ itemId: "produce.wheat", quantity: 3 }])).toBe(true);
    const rows = feedback.sample(sim.state, { x: 3, y: 1, z: 4 });
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "money", text: "+12 G", x: 3, z: 4 }),
      expect.objectContaining({ kind: "xp", text: "+120 Fishing" }),
      expect.objectContaining({ kind: "item", itemId: "produce.wheat", amount: 3 })
    ]));
    expect(feedback.sample(sim.state)).toEqual([]);
    feedback.reset();
    expect(feedback.sample(sim.state)).toEqual([]);
    sim.questDomain.dispose();
  });
});
