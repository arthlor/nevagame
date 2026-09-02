import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { Simulation } from "../../src/simulation/Simulation";
import type { QuestDefinition } from "../../src/simulation/core/QuestTypes";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { STARTER_FARM_LAYOUT, farmWellWorldAnchor } from "../../src/world/FarmLayout";

describe("post-story quest expansion", () => {
  it("advances only the exact active contract and farm objective", () => {
    const sim = new Simulation();
    sim.state.quests.activeActId = "act6_stewardship";
    sim.state.quests.activeQuestId = "quest.act6_harbor_promise";
    sim.state.quests.activeStepIndex = 0;
    sim.state.quests.stepProgress = {};

    sim.events.emit("FarmIrrigated", { farmId: "farm.starter_garden", cropCount: 2, minute: 0 });
    expect(sim.state.quests.stepProgress).toEqual({});
    sim.events.emit("ContractCompleted", {
      contractId: "contract.test",
      templateId: "contract.wheat_supply",
      contractType: "produce",
      rewardMoney: 100,
      minute: 0
    });
    expect(sim.state.quests.stepProgress).toEqual({ "step.act6_complete_contract": 1 });

    sim.state.quests.activeQuestId = "quest.act6_field_pump";
    sim.state.quests.activeStepIndex = 1;
    sim.state.quests.stepProgress = {};
    sim.events.emit("FarmIrrigated", { farmId: "farm.player_homestead", cropCount: 2, minute: 0 });
    expect(sim.state.quests.stepProgress).toEqual({});
    sim.events.emit("FarmIrrigated", { farmId: "farm.starter_garden", cropCount: 2, minute: 0 });
    expect(sim.state.quests.stepProgress).toEqual({ "step.act6_irrigate_farm": 1 });
  });

  it("wires rod and boat purchases to purchase-upgrade without double progress", () => {
    const sim = new Simulation();
    const registry = ContentRegistry.quests as Map<string, QuestDefinition>;
    const quest: QuestDefinition = {
      id: "quest.test_purchase",
      actId: "act6_stewardship",
      actTitle: "Test",
      questTitle: "Test purchase",
      speakerId: "npc.maeve",
      introDialogue: ["Test"],
      completionDialogue: ["Test"],
      objectives: [{ id: "step.test_purchase", type: "purchase-upgrade", targetId: "boat.skiff", targetQuantity: 1, description: "Buy a skiff" }],
      rewards: {}
    };
    registry.set(quest.id, quest);
    try {
      sim.state.quests.activeQuestId = quest.id;
      sim.state.quests.activeStepIndex = 0;
      sim.state.quests.stepProgress = {};
      sim.events.emit("RodPurchased", { marketId: "market.harbor", rodId: "rod.river", cost: 120, minute: 0 });
      expect(sim.state.quests.stepProgress).toEqual({});
      sim.events.emit("BoatPurchased", { boatId: "boat.player_skiff", boatTypeId: "boat.skiff", cost: 850, minute: 0 });
      expect(sim.state.quests.stepProgress).toEqual({ "step.test_purchase": 1 });
    } finally {
      registry.delete(quest.id);
    }
  });

  it("progresses the installed pump and irrigation objectives from successful farm actions", () => {
    const sim = new Simulation();
    sim.state.player.money = 200;
    sim.state.player.x = STARTER_FARM_LAYOUT.origin.x;
    sim.state.player.z = STARTER_FARM_LAYOUT.origin.z;
    expect(sim.plantCrop("farm.starter_garden", "crop.wheat", STARTER_FARM_LAYOUT.origin.x, STARTER_FARM_LAYOUT.origin.z).success).toBe(true);
    const crop = sim.state.crops[Object.keys(sim.state.crops)[0]];
    crop.moisture = 20;
    sim.state.quests.activeActId = "act6_stewardship";
    sim.state.quests.activeQuestId = "quest.act6_field_pump";
    sim.state.quests.activeStepIndex = 0;
    sim.state.quests.stepProgress = {};
    const well = farmWellWorldAnchor("farm.starter_garden")!;
    sim.state.player.x = well.x;
    sim.state.player.z = well.z;

    expect(sim.execute({ type: "farm.buy-irrigation" })).toMatchObject({ success: true });
    expect(sim.state.quests.activeStepIndex).toBe(1);
    expect(sim.execute({ type: "farm.irrigate", farmId: "farm.starter_garden" })).toMatchObject({ success: true });
    expect(sim.state.quests.stepProgress).toEqual({ "step.act6_irrigate_farm": 1 });

    sim.state.quests.activeQuestId = "quest.act6_land_sea_cycle";
    sim.state.quests.activeStepIndex = 1;
    sim.state.quests.stepProgress = {};
    sim.state.farms["farm.starter_garden"].soil.fertility = 40;
    expect(InventoryManager.addItemsAtomically(
      sim.state.inventories[sim.state.player.inventoryId],
      [{ itemId: "item.basic_fertilizer", quantity: 1 }]
    )).toBe(true);
    sim.state.player.x = STARTER_FARM_LAYOUT.origin.x;
    sim.state.player.z = STARTER_FARM_LAYOUT.origin.z;
    expect(sim.execute({ type: "farm.apply-fertilizer", farmId: "farm.starter_garden" })).toMatchObject({ success: true });
    expect(sim.state.quests.stepProgress).toEqual({ "step.act6_fertilize_farm": 1 });
  });

  it("keeps failed quest turn-ins atomic", () => {
    const sim = new Simulation();
    const maeve = ContentRegistry.npcs.get("npc.maeve")!;
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    const wheatLimit = ContentRegistry.items.get("seed.wheat")!.stackLimit;
    inventory.slots = inventory.slots.map(() => ({ itemId: "seed.wheat", quantity: wheatLimit }));
    sim.state.quests.activeActId = "act6_stewardship";
    sim.state.quests.activeQuestId = "quest.act6_harbor_promise";
    sim.state.quests.activeStepIndex = 0;
    sim.state.quests.stepProgress = { "step.act6_complete_contract": 1 };
    sim.state.player.x = maeve.anchor.x;
    sim.state.player.z = maeve.anchor.z;
    const moneyBefore = sim.state.player.money;

    expect(sim.execute({ type: "quest.talk-npc", npcId: "npc.maeve" })).toMatchObject({ success: false });
    expect(sim.state.player.money).toBe(moneyBefore);
    expect(InventoryManager.getItemCount(inventory, "item.fish_scraps")).toBe(0);
    expect(sim.state.quests.completedQuestIds).not.toContain("quest.act6_harbor_promise");
  });

  it("activates Quest 11 once for an older completed-Act-5 save without replaying rewards", () => {
    const original = new Simulation();
    const firstTen = [...ContentRegistry.quests.values()].slice(0, 10).map((quest) => quest.id);
    original.state.quests.completedQuestIds = firstTen;
    original.state.quests.activeActId = "epilogue_open";
    original.state.quests.activeQuestId = null;
    original.state.quests.activeStepIndex = 0;
    original.state.quests.stepProgress = {};
    original.state.player.money = 777;

    const loaded = new Simulation(structuredClone(original.state));
    expect(loaded.state.quests.activeQuestId).toBe("quest.act6_harbor_promise");
    expect(loaded.state.player.money).toBe(777);
    expect(loaded.state.quests.completedQuestIds).toEqual(firstTen);

    const reloaded = new Simulation(structuredClone(loaded.state));
    expect(reloaded.state.quests.activeQuestId).toBe("quest.act6_harbor_promise");
    expect(reloaded.state.player.money).toBe(777);
  });

  it("preserves active stewardship progress and recognizes milestones across reload", () => {
    const sim = new Simulation();
    sim.state.quests.activeActId = "act6_stewardship";
    sim.state.quests.activeQuestId = "quest.act6_land_sea_cycle";
    sim.state.quests.activeStepIndex = 0;
    sim.state.quests.stepProgress = { "step.act6_craft_fertilizer": 0 };
    sim.state.quests.completedQuestIds.push("quest.act6_harbor_promise");
    const loaded = new Simulation(structuredClone(sim.state));
    expect(loaded.state.quests.activeQuestId).toBe("quest.act6_land_sea_cycle");
    expect(loaded.state.quests.stepProgress).toEqual({ "step.act6_craft_fertilizer": 0 });

    const maeve = ContentRegistry.npcs.get("npc.maeve")!;
    loaded.state.player.x = maeve.anchor.x;
    loaded.state.player.z = maeve.anchor.z;
    const first = loaded.execute({ type: "quest.talk-npc", npcId: "npc.maeve" }) as { dialogue?: string[] };
    const second = loaded.execute({ type: "quest.talk-npc", npcId: "npc.maeve" }) as { dialogue?: string[] };
    expect(first.dialogue?.[0]).toContain("finished the order");
    expect(second.dialogue).toEqual(first.dialogue);
  });

  it("publishes completion only after the final quest pointer reaches epilogue", () => {
    const sim = new Simulation();
    const barnaby = ContentRegistry.npcs.get("npc.barnaby")!;
    sim.state.quests.activeActId = "act6_stewardship";
    sim.state.quests.activeQuestId = "quest.act6_land_sea_cycle";
    sim.state.quests.activeStepIndex = 1;
    sim.state.quests.stepProgress = { "step.act6_fertilize_farm": 1 };
    sim.state.player.x = barnaby.anchor.x;
    sim.state.player.z = barnaby.anchor.z;
    let activeQuestSeenByListener: string | null | undefined;
    const unsubscribe = sim.events.on("QuestCompleted", () => {
      activeQuestSeenByListener = sim.state.quests.activeQuestId;
    });

    expect(sim.execute({ type: "quest.talk-npc", npcId: "npc.barnaby" })).toMatchObject({ success: true });
    unsubscribe();
    expect(activeQuestSeenByListener).toBeNull();
    expect(sim.state.quests.activeActId).toBe("epilogue_open");
  });
});
