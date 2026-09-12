import { describe, it, expect } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { WorldLayout } from "../../src/world/WorldLayout";
import { farmLocalToWorld, STARTER_FARM_LAYOUT } from "../../src/world/FarmLayout";
import { npcAnchorAt } from "../../src/simulation/presentation/NpcPresentation";
import { mainQuestTrack, questEarlyActionCredits } from "../../src/simulation/core/QuestTypes";
import type { ResolvedPhysicsFrame } from "../../src/simulation/core/PhysicsAdapter";

function commitPlayerPose(simulation: Simulation, x: number, z: number, rotationY = 0): void {
  const { player, boats } = simulation.state;
  const frame: ResolvedPhysicsFrame = {
    player: {
      x,
      y: WorldLayout.isWater(x, z) ? 0.5 : WorldLayout.terrainHeight(x, z) + 0.5,
      z,
      rotationY,
      traversal: { ...player.traversal, isGrounded: true }
    },
    boats: Object.fromEntries(
      Object.values(boats).map((boat) => [boat.id, {
        x: boat.x, y: boat.y, z: boat.z, headingRadians: boat.headingRadians, speed: boat.speed
      }])
    )
  };
  expect(simulation.execute({ type: "physics.commit", frame })).toMatchObject({ success: true });
}

function talkTo(simulation: Simulation, npcId: string): void {
  const anchor = npcAnchorAt(npcId, simulation.state.clock, simulation.state.quests);
  commitPlayerPose(simulation, anchor.x, anchor.z, anchor.rotationY);
  const before = mainQuestTrack(simulation.state.quests).activeQuestId;
  expect(simulation.execute({ type: "quest.talk-npc", npcId })).toMatchObject({ success: true });
  if (mainQuestTrack(simulation.state.quests).activeQuestId === before) {
    expect(simulation.execute({ type: "quest.talk-npc", npcId })).toMatchObject({ success: true });
  }
}

function activeQuestId(simulation: Simulation): string | null {
  return mainQuestTrack(simulation.state.quests).activeQuestId;
}

/** Advances to the sow step and plants three wheat, returning their ids. */
function sowThreeWheat(simulation: Simulation): string[] {
  talkTo(simulation, "npc.elspeth");
  expect(activeQuestId(simulation)).toBe("quest.act1_sow_wheat");
  const cropIds: string[] = [];
  for (const x of [-3, 0, 3]) {
    const position = farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, { x, z: 0 });
    commitPlayerPose(simulation, position.x, position.z);
    const planted = simulation.execute({
      type: "crop.plant",
      request: { farmId: "farm.starter_garden", cropId: "crop.wheat", x: position.x, z: position.z }
    });
    expect(planted).toMatchObject({ success: true });
    cropIds.push((planted as { placedCropId: string }).placedCropId);
  }
  return cropIds;
}

function waterCrop(simulation: Simulation, cropId: string): void {
  const crop = simulation.state.crops[cropId];
  const position = farmLocalToWorld(crop.farmId, crop);
  commitPlayerPose(simulation, position.x, position.z);
  expect(simulation.execute({ type: "crop.water", placedCropId: cropId })).toMatchObject({ success: true });
}

describe("quest early-action credits", () => {
  it("banks watering done during the sow step and settles the water step on activation", () => {
    const simulation = new Simulation();
    const cropIds = sowThreeWheat(simulation);

    // Still on the sow quest — watering now has no active objective to feed.
    expect(activeQuestId(simulation)).toBe("quest.act1_sow_wheat");
    for (const cropId of cropIds) waterCrop(simulation, cropId);

    expect(questEarlyActionCredits(simulation.state.quests)).toEqual([
      { type: "water-crop", targetId: undefined, location: { kind: "farm", id: "farm.starter_garden" }, quantity: 3 }
    ]);

    // Turning in the sow quest activates the water step, which is already paid for.
    talkTo(simulation, "npc.elspeth");
    expect(activeQuestId(simulation)).toBe("quest.act1_water_crops");
    expect(mainQuestTrack(simulation.state.quests).stepProgress).toEqual({ "step.act1_water_3_crops": 3 });
    expect(questEarlyActionCredits(simulation.state.quests)).toEqual([]);

    // And the quest is turn-in-ready without watering an already-wet crop again.
    talkTo(simulation, "npc.elspeth");
    expect(activeQuestId(simulation)).toBe("quest.act2_harvest_and_compost");
  });

  it("caps a banked credit at the objective's target quantity", () => {
    const simulation = new Simulation();
    const cropIds = sowThreeWheat(simulation);
    for (const cropId of cropIds) waterCrop(simulation, cropId);
    // Let moisture decay, then water the same crops a second time.
    simulation.advanceGameMinutes(600);
    let extra = 0;
    for (const cropId of cropIds) {
      const crop = simulation.state.crops[cropId];
      if (!crop) continue;
      const position = farmLocalToWorld(crop.farmId, crop);
      commitPlayerPose(simulation, position.x, position.z);
      if ((simulation.execute({ type: "crop.water", placedCropId: cropId }) as { success: boolean }).success) extra += 1;
    }
    expect(extra).toBeGreaterThan(0);

    const credits = questEarlyActionCredits(simulation.state.quests);
    expect(credits).toHaveLength(1);
    expect(credits[0].quantity).toBe(3);
  });

  it("never banks a wrong crop, wrong farm, wrong recipe or wrong station", () => {
    const simulation = new Simulation();
    talkTo(simulation, "npc.elspeth");
    expect(activeQuestId(simulation)).toBe("quest.act1_sow_wheat");

    // A crop the sow objective does not name, in the farm it does name.
    const position = farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, { x: -3, z: 0 });
    commitPlayerPose(simulation, position.x, position.z);
    expect(simulation.execute({
      type: "crop.plant",
      request: { farmId: "farm.starter_garden", cropId: "crop.tomato", x: position.x, z: position.z }
    })).toMatchObject({ success: true });
    expect(questEarlyActionCredits(simulation.state.quests)).toEqual([]);

    // Every other way of missing an opted-in objective's gates, at the seam
    // the ledger actually reads. None of these may produce spendable credit.
    const domain = simulation.questDomain;
    domain.onObjectiveEvent("water-crop", undefined, 1, { kind: "farm", id: "farm.player_homestead" });
    domain.onObjectiveEvent("water-crop", undefined, 1);
    domain.onObjectiveEvent("craft-recipe", "recipe.compost_worms", 1, { kind: "station", id: "struct.starter_workbench" });
    domain.onObjectiveEvent("craft-recipe", "recipe.wheat_to_grain", 1, { kind: "station", id: "struct.starter_compost" });
    domain.onObjectiveEvent("harvest-crop", "crop.tomato", 1, { kind: "farm", id: "farm.starter_garden" });
    expect(questEarlyActionCredits(simulation.state.quests)).toEqual([]);

    // ...while the exact shape of a pending opted-in objective does.
    domain.onObjectiveEvent("craft-recipe", "recipe.compost_worms", 1, { kind: "station", id: "struct.starter_compost" });
    expect(questEarlyActionCredits(simulation.state.quests)).toEqual([
      {
        type: "craft-recipe",
        targetId: "recipe.compost_worms",
        location: { kind: "station", id: "struct.starter_compost" },
        quantity: 1
      }
    ]);
  });

  it("does not bank for objectives that have not opted in", () => {
    const simulation = new Simulation();
    // Sell an item before any selling objective exists. `sell-item` is not a
    // creditable type and no opted-in objective watches it.
    simulation.questDomain.onObjectiveEvent("sell-item", "item.wheat_grain", 1, { kind: "market", id: "market.village" });
    expect(questEarlyActionCredits(simulation.state.quests)).toEqual([]);
  });

  it("carries banked credits through a save/load round trip", () => {
    const simulation = new Simulation();
    const cropIds = sowThreeWheat(simulation);
    for (const cropId of cropIds) waterCrop(simulation, cropId);
    expect(questEarlyActionCredits(simulation.state.quests)).toHaveLength(1);

    const reloaded = new Simulation(structuredClone(simulation.state));
    // Still on the sow step, so the credit survives rather than being spent.
    expect(activeQuestId(reloaded)).toBe("quest.act1_sow_wheat");
    expect(questEarlyActionCredits(reloaded.state.quests)).toEqual([
      { type: "water-crop", targetId: undefined, location: { kind: "farm", id: "farm.starter_garden" }, quantity: 3 }
    ]);

    talkTo(reloaded, "npc.elspeth");
    expect(mainQuestTrack(reloaded.state.quests).stepProgress).toEqual({ "step.act1_water_3_crops": 3 });
  });

  it("leaves the ordinary path untouched — nothing is banked when the player follows the tutorial", () => {
    const simulation = new Simulation();
    const cropIds = sowThreeWheat(simulation);
    talkTo(simulation, "npc.elspeth");
    expect(activeQuestId(simulation)).toBe("quest.act1_water_crops");
    for (const cropId of cropIds) waterCrop(simulation, cropId);

    expect(mainQuestTrack(simulation.state.quests).stepProgress).toEqual({ "step.act1_water_3_crops": 3 });
    expect(questEarlyActionCredits(simulation.state.quests)).toEqual([]);
  });

  it("starts a new game without bait worms", () => {
    const simulation = new Simulation();
    const inventory = simulation.state.inventories[simulation.state.player.inventoryId];
    const worms = inventory.slots.filter((slot) => slot.itemId === "item.bait_worms");
    expect(worms).toEqual([]);
  });

  it("only lets a creditable objective be authored where banking is safe", () => {
    for (const quest of ContentRegistry.quests.values()) {
      for (const objective of quest.objectives) {
        if (!objective.creditsEarlyActions) continue;
        expect(["plant-crop", "water-crop", "harvest-crop", "craft-recipe"]).toContain(objective.type);
        expect(objective.location, `${objective.id} must declare a location`).toBeDefined();
        expect(quest.trackId).toBe("track.main");
      }
    }
  });
});
