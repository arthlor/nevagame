import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { Simulation } from "../../src/simulation/Simulation";
import { questTrackProgress, mainQuestTrack } from "../../src/simulation/core/QuestTypes";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { CARRIAGE_TUNING, carriagePoint } from "../../src/simulation/mounts/Carriage";
import { npcAnchorAt, npcHasPendingConversation } from "../../src/simulation/presentation/NpcPresentation";
import { getProcessingStationFrontPosition } from "../../src/world/ProcessingStationApproach";
import { WorldLayout } from "../../src/world/WorldLayout";
import { CART_WORKSHOP } from "../../src/world/VillageTradeLayout";

function stand(sim: Simulation, point: { x: number; z: number }): void {
  Object.assign(sim.state.player, point, { y: WorldLayout.traversalSurfaceHeight(point.x, point.z) + .5 });
}

function talk(sim: Simulation, npcId: string) {
  stand(sim, npcAnchorAt(npcId, sim.state.clock, sim.state.quests));
  return sim.questDomain.talkToNpc(npcId);
}

function craftPack(sim: Simulation, recipeId: string): string {
  const station = sim.state.world.structures["struct.trade_neva"];
  stand(sim, getProcessingStationFrontPosition(station.id, station)!);
  expect(sim.startProcessingJob(recipeId, station.id)).toMatchObject({ success: true });
  const job = Object.values(sim.state.processingJobs)[0];
  sim.advanceGameMinutes(job.effectiveDurationMinutes);
  expect(sim.collectProcessingJob(job.id)).toMatchObject({ success: true });
  return sim.state.player.carriedFishCargoId!;
}

function save(sim: Simulation): SaveEnvelope {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, savedAtUtcMs: 1, state: structuredClone(sim.state) };
}

describe("village trade quest and lore route", () => {
  it("introduces a local pack beside the main story, then settles its real sale once", () => {
    const sim = new Simulation();
    sim.state.quests.completedQuestIds.push("quest.act2_harvest_and_compost");
    sim.questDomain.evaluateTrackUnlocks();
    const route = questTrackProgress(sim.state.quests, "track.caravans");
    expect(route.activeQuestId).toBe("quest.caravan_first_stamp");

    mainQuestTrack(sim.state.quests).activeQuestId = "quest.act4_harbor_journey";
    mainQuestTrack(sim.state.quests).activeStepIndex = 0;
    mainQuestTrack(sim.state.quests).stepProgress = {};
    const introduction = talk(sim, "npc.maeve");
    expect(introduction.segments.some((segment) => segment.kind === "intro" && segment.questId === "quest.caravan_first_stamp")).toBe(true);
    expect(introduction.segments.some((segment) => segment.questId === "quest.act4_harbor_journey")).toBe(true);

    expect(InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [
      { itemId: "produce.wheat", quantity: 10 }
    ])).toBe(true);
    const cargoId = craftPack(sim, "recipe.pack_wheat");
    expect(route.activeStepIndex).toBe(1);
    stand(sim, ContentRegistry.markets.get("market.village")!.interactionPosition!);
    expect(sim.sellFishTradePackAtMarket("market.village", cargoId).success).toBe(true);
    expect(sim.questDomain.getActiveQuestDto("track.caravans")).toMatchObject({
      isQuestReadyToTurnIn: true,
      objectiveDescription: "Talk to Maeve to continue"
    });
    const purse = sim.state.player.money;
    const completion = talk(sim, "npc.maeve");
    expect(completion.segments.map((segment) => [segment.kind, segment.questId])).toContainEqual(["completion", "quest.caravan_first_stamp"]);
    expect(completion.segments.map((segment) => [segment.kind, segment.questId])).toContainEqual(["intro", "quest.caravan_first_load"]);
    expect(route.activeQuestId).toBe("quest.caravan_first_load");
    expect(sim.state.journal.unlockedKnowledge).toContain("knowledge.packing_stamp");
    expect(sim.state.player.money).toBe(purse + 40);
    talk(sim, "npc.maeve");
    expect(sim.state.player.money).toBe(purse + 40);
    expect(validateSaveEnvelope(save(sim))).toBe(true);
    const reloaded = new Simulation(structuredClone(sim.state));
    expect(reloaded.state.quests.completedQuestIds.filter(id => id === "quest.caravan_first_stamp")).toHaveLength(1);
    expect(reloaded.state.journal.unlockedKnowledge.filter(id => id === "knowledge.packing_stamp")).toHaveLength(1);
  });

  it("hands an accepted delivery to its destination steward and begins the next local errand", () => {
    const sim = new Simulation();
    const route = questTrackProgress(sim.state.quests, "track.caravans");
    route.activeQuestId = "quest.caravan_first_load";
    route.activeStepIndex = 0;
    route.stepProgress = {};
    sim.events.emit("RecipeCompleted", { recipeId: "recipe.pack_wheat", stationId: "struct.trade_neva", jobId: "job.test", minute: 0 });
    expect(route.activeStepIndex).toBe(1);
    sim.events.emit("TradePackSold", { marketId: "market.village", cargoId: "cargo.wrong", itemId: "produce.wheat", sourceMarketId: "market.village", revenue: 50, minute: 0 });
    expect(route.stepProgress).toEqual({});
    sim.events.emit("TradePackSold", { marketId: "market.pinewatch", cargoId: "cargo.delivered", itemId: "produce.wheat", sourceMarketId: "market.village", revenue: 150, minute: 0 });
    expect(sim.questDomain.getActiveQuestDto("track.caravans")).toMatchObject({
      isQuestReadyToTurnIn: true,
      objectiveDescription: "Talk to Rowan to continue"
    });
    expect(npcHasPendingConversation("npc.rowan", sim.state.quests)).toBe(true);
    expect(npcHasPendingConversation("npc.maeve", sim.state.quests)).toBe(false);

    const money = sim.state.player.money;
    const wrongPerson = talk(sim, "npc.maeve");
    expect(wrongPerson.questCompleted).toBe(false);
    expect(sim.state.player.money).toBe(money);
    expect(sim.state.quests.completedQuestIds).not.toContain("quest.caravan_first_load");

    const reloaded = new Simulation(structuredClone(sim.state));
    expect(reloaded.questDomain.getActiveQuestDto("track.caravans")?.objectiveDescription).toBe("Talk to Rowan to continue");
    const received = talk(reloaded, "npc.rowan");
    expect(received.segments.map((segment) => [segment.kind, segment.questId])).toContainEqual(["completion", "quest.caravan_first_load"]);
    expect(received.segments.map((segment) => [segment.kind, segment.questId])).toContainEqual(["intro", "quest.caravan_woodland_return"]);
    expect(questTrackProgress(reloaded.state.quests, "track.caravans").activeQuestId).toBe("quest.caravan_woodland_return");
  });

  it("requires real six-pack carriage loading and two distinct destination sales", () => {
    const sim = new Simulation();
    const route = questTrackProgress(sim.state.quests, "track.caravans");
    route.activeQuestId = "quest.caravan_shared_load";
    route.activeStepIndex = 0;
    route.stepProgress = {};
    sim.state.player.money = 100000;
    sim.state.player.proficiencies.trading = 15000;
    stand(sim, CART_WORKSHOP.displays[1]);
    expect(sim.execute({ type: "vehicle.purchase", vehicleTypeId: "mount.carriage_6" }).success).toBe(true);
    expect(InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [
      { itemId: "produce.wheat", quantity: 10 }, { itemId: "produce.tomato", quantity: 10 }
    ])).toBe(true);

    const wheatId = craftPack(sim, "recipe.pack_wheat");
    expect(route.activeStepIndex).toBe(1);
    sim.events.emit("CarriageCargoLoaded", { cargoId: "cargo.wrong", mountId: "mount.carriage_4",
      mountTypeId: "mount.carriage_4", slotIndex: 0, minute: 0 });
    expect(route.stepProgress).toEqual({});
    const carriage = sim.state.mounts["mount.carriage_6"];
    stand(sim, carriagePoint(carriage, 0, CARRIAGE_TUNING.rearOffset));
    expect(sim.execute({ type: "cargo.load-carriage", mountId: carriage.id })).toMatchObject({ success: true });
    expect(route.activeStepIndex).toBe(2);

    const tomatoId = craftPack(sim, "recipe.pack_tomato");
    expect(route.activeStepIndex).toBe(3);
    stand(sim, carriagePoint(carriage, 0, CARRIAGE_TUNING.rearOffset));
    expect(sim.execute({ type: "cargo.load-carriage", mountId: carriage.id })).toMatchObject({ success: true });
    expect(route.activeStepIndex).toBe(4);
    expect(carriage.fishCargoSlotIds.filter(Boolean)).toHaveLength(2);
    expect(validateSaveEnvelope(save(sim))).toBe(true);
    const reloaded = new Simulation(structuredClone(sim.state));
    const reloadedCarriage = reloaded.state.mounts["mount.carriage_6"];
    stand(reloaded, carriagePoint(reloadedCarriage, 0, CARRIAGE_TUNING.rearOffset));
    expect(reloaded.pickupFishCargo(wheatId).success).toBe(true);
    stand(reloaded, ContentRegistry.markets.get("market.pinewatch")!.interactionPosition!);
    expect(reloaded.sellFishTradePackAtMarket("market.pinewatch", wheatId).success).toBe(true);
    expect(questTrackProgress(reloaded.state.quests, "track.caravans").activeStepIndex).toBe(5);
    stand(reloaded, carriagePoint(reloadedCarriage, 0, CARRIAGE_TUNING.rearOffset));
    expect(reloaded.pickupFishCargo(tomatoId).success).toBe(true);
    stand(reloaded, ContentRegistry.markets.get("market.reedhaven")!.interactionPosition!);
    expect(reloaded.sellFishTradePackAtMarket("market.reedhaven", tomatoId).success).toBe(true);
    expect(reloaded.questDomain.getActiveQuestDto("track.caravans")?.objectiveDescription).toBe("Talk to Mara to continue");
    const handoff = talk(reloaded, "npc.mara");
    expect(handoff.segments.some((segment) => segment.kind === "completion" && segment.questId === "quest.caravan_shared_load")).toBe(true);
    expect(reloaded.state.journal.unlockedKnowledge).toContain("knowledge.shared_load");
  });

  it("backfills newly authored field notes from completed quests without replaying coin", () => {
    const sim = new Simulation();
    sim.state.quests.completedQuestIds.push("quest.caravan_first_stamp", "quest.caravan_upland_round", "quest.caravan_sunreach_freight");
    const purse = sim.state.player.money;
    const loaded = new Simulation(structuredClone(sim.state));
    expect(loaded.state.player.money).toBe(purse);
    for (const id of ["knowledge.packing_stamp", "knowledge.village_roads", "knowledge.channel_manifest"]) {
      expect(loaded.state.journal.unlockedKnowledge).toContain(id);
    }
    const again = new Simulation(structuredClone(loaded.state));
    expect(again.state.journal.unlockedKnowledge).toEqual(loaded.state.journal.unlockedKnowledge);
  });
});
