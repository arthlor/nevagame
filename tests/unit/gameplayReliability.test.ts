import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { Simulation } from "../../src/simulation/Simulation";
import { continuedPlantingCrop } from "../../src/simulation/farming/PlantingSelection";
import { nearestPointOnFootprint } from "../../src/simulation/domains/FarmingDomain";
import { formatQuestObjective } from "../../src/simulation/presentation/QuestObjectiveCopy";
import {
  distanceToPlantableSoil,
  farmLocalToWorld,
  farmPlantableWorldAreas,
  STARTER_FARM_LAYOUT
} from "../../src/world/FarmLayout";
import { CLOSE_INTERACTION_REACH_METERS } from "../../src/world/InteractionReach";

describe("gameplay reliability", () => {
  it("keeps the chosen crop and does not substitute another when that seed is gone", () => {
    expect(continuedPlantingCrop("crop.wheat", [
      { cropId: "crop.wheat", count: 0 },
      { cropId: "crop.wheat", count: 4 },
      { cropId: "crop.tomato", count: 6 }
    ])).toEqual({ cropId: "crop.wheat", exhausted: false });
    expect(continuedPlantingCrop("crop.wheat", [
      { cropId: "crop.tomato", count: 6 }
    ])).toEqual({ cropId: "crop.wheat", exhausted: true });
    expect(continuedPlantingCrop(null, [{ cropId: "crop.tomato", count: 2 }])).toEqual({
      cropId: null,
      exhausted: false
    });
  });

  it("measures crop reach to the footprint edge", () => {
    const nearest = nearestPointOnFootprint({ x: 2, z: 0 }, {
      center: { x: 0, z: 0 },
      width: 1,
      depth: 1,
      rotationRadians: 0
    });
    expect(nearest.x).toBeCloseTo(0.5);
    expect(nearest.z).toBeCloseTo(0);
    expect(Math.hypot(2 - nearest.x, 0 - nearest.z)).toBeCloseTo(1.5);
  });

  it("outlines only the starter farm's plantable soil", () => {
    const areas = farmPlantableWorldAreas("farm.starter_garden");
    expect(areas).toHaveLength(1);
    const [bed] = areas;
    expect(bed.maxX - bed.minX).toBe(12);
    expect(bed.maxZ - bed.minZ).toBe(10);
    const bounds = STARTER_FARM_LAYOUT.farmBounds;
    expect(bed.maxX - bed.minX).toBeLessThan(bounds.maxX - bounds.minX);
    const outside = farmLocalToWorld("farm.starter_garden", { x: 10, z: 0 });
    const soil = distanceToPlantableSoil("farm.starter_garden", outside)!;
    expect(soil.distance).toBeGreaterThan(CLOSE_INTERACTION_REACH_METERS);
  });

  it("names the first planting step with a live count and the starter farm", () => {
    const sim = new Simulation();
    const elspeth = ContentRegistry.npcs.get("npc.elspeth")!;
    sim.state.player.x = elspeth.anchor.x;
    sim.state.player.z = elspeth.anchor.z;
    sim.execute({ type: "quest.talk-npc", npcId: "npc.elspeth" });
    sim.execute({ type: "quest.talk-npc", npcId: "npc.elspeth" });
    const quest = sim.questDomain.getActiveQuestDto();
    expect(quest?.targetFarmId).toBe("farm.starter_garden");
    expect(quest?.objectiveDescription).toBe("Plant Wheat: 0/3 at Starter Farm Field");
    expect(quest?.objectiveFacts && formatQuestObjective(quest.objectiveFacts, "en")).toBe(quest?.objectiveDescription);
    expect(quest?.progressNote).toBeUndefined();
  });
});
