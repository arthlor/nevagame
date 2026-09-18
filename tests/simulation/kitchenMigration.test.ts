import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { starterStructureAnchor } from "../../src/world/FarmLayout";
import { WORLD_STATION_DEFINITIONS } from "../../src/world/WorldGameplayLocations";
import { WorldLayout } from "../../src/world/WorldLayout";
import shippedKitchenPose from "../fixtures/save_v47_layout21_kitchen_predecessor.json";

describe("Farm kitchen (v45)", () => {
  it("starts a new game with an authored kitchen beside the work trail", () => {
    const sim = new Simulation();
    const kitchen = sim.state.world.structures["struct.kitchen"];
    expect(kitchen).toBeDefined();
    expect(kitchen.type).toBe("kitchen");
    const anchor = starterStructureAnchor("struct.kitchen")!;
    expect(kitchen.x).toBe(anchor.x);
    expect(kitchen.z).toBe(anchor.z);
    expect(sim.state.farms["farm.starter_garden"].placedStructureIds).toContain("struct.kitchen");
    expect(WORLD_STATION_DEFINITIONS["struct.kitchen"].type).toBe("kitchen");
  });

  it("cooks a meal at the kitchen, not the workbench", () => {
    const sim = new Simulation();
    const mealRecipes = [...ContentRegistry.recipes.values()].filter((recipe) =>
      recipe.tags.includes("meal")
    );
    expect(mealRecipes.length).toBeGreaterThanOrEqual(3);
    for (const recipe of mealRecipes) {
      expect(recipe.stationType).toBe("kitchen");
    }
    expect(
      sim.startProcessingJob("recipe.cook_harvest_bowl", "struct.workbench").success
    ).toBe(false);
  });

  it("migrates a v44 save by adding the kitchen and moving its meal job", () => {
    const sim = new Simulation();
    const envelope = {
      schemaVersion: 44,
      savedAtUtcMs: 1,
      state: structuredClone(sim.state)
    } as unknown as Parameters<typeof migrateSaveData>[0];
    envelope.state.schemaVersion = 44;
    delete (envelope.state.world.structures as Record<string, unknown>)["struct.kitchen"];
    envelope.state.farms["farm.starter_garden"].placedStructureIds =
      envelope.state.farms["farm.starter_garden"].placedStructureIds.filter(
        (id) => id !== "struct.kitchen"
      );
    const jobId = "job.legacy_meal";
    (envelope.state.processingJobs as Record<string, unknown>)[jobId] = {
      id: jobId,
      recipeId: "recipe.cook_harvest_bowl",
      stationId: "struct.workbench",
      startedAtMinute: envelope.state.clock.currentMinute,
      completesAtMinute: envelope.state.clock.currentMinute + 20,
      status: "active",
      recipeName: "Cook Harvest Bowl",
      outputLabel: "Harvest Bowl",
      result: { kind: "items", stacks: [{ itemId: "item.meal_harvest_bowl", quantity: 1 }] },
      workTier: "standard",
      presentationKind: "existing",
      baseWork: 35,
      chargedWork: 35,
      xpReward: 35,
      effectiveDurationMinutes: 20
    };
    const migrated = migrateSaveData(envelope);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.world.structures["struct.kitchen"]).toBeDefined();
    expect(migrated.state.world.structures["struct.kitchen"].type).toBe("kitchen");
    expect(migrated.state.farms["farm.starter_garden"].placedStructureIds).toContain(
      "struct.kitchen"
    );
    expect(migrated.state.processingJobs[jobId].stationId).toBe("struct.kitchen");
    expect(validateSaveEnvelope(migrated)).toBe(true);
    expect(migrateSaveData(structuredClone(migrated)).schemaVersion).toBe(
      CURRENT_SCHEMA_VERSION
    );
  });

  it("re-anchors the shipped v45-v47 kitchen pose onto the current layout (v48)", () => {
    const envelope = structuredClone(shippedKitchenPose) as unknown as Parameters<
      typeof migrateSaveData
    >[0];
    const anchor = starterStructureAnchor("struct.kitchen")!;
    const previousKitchen = envelope.state.world.structures["struct.kitchen"];
    // The retained v47 save stores the pre-move home-lane pose.
    expect(Math.hypot(previousKitchen.x - anchor.x, previousKitchen.z - anchor.z)).toBeGreaterThan(1);

    const migrated = migrateSaveData(envelope);
    expect(migrated.schemaVersion).toBe(48);
    const kitchen = migrated.state.world.structures["struct.kitchen"];
    expect(kitchen.x).toBe(anchor.x);
    expect(kitchen.z).toBe(anchor.z);
    expect(kitchen.y).toBeCloseTo(WorldLayout.terrainHeight(anchor.x, anchor.z), 6);
    // Facing is preserved, matching the earlier layout migrations' convention.
    expect(kitchen.rotationY).toBe(previousKitchen.rotationY);
    expect(validateSaveEnvelope(migrated)).toBe(true);

    const again = migrateSaveData(structuredClone(migrated));
    expect(again.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(again.state.world.structures["struct.kitchen"]).toEqual(kitchen);
  });
});
