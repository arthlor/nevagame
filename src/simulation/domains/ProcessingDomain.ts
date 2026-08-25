import { ContentRegistry } from "../../content/ContentRegistry";
import type { ProcessingJobId, RecipeId } from "../core/types";
import { InventoryManager } from "../inventory/InventoryManager";
import type { DomainContext } from "./DomainContext";
import { distance2d } from "./DomainContext";
import type { ProgressionDomain } from "./ProgressionDomain";

const STATION_INTERACTION_RADIUS = 4;

export class ProcessingDomain {
  constructor(
    private readonly context: DomainContext,
    private readonly progression: ProgressionDomain
  ) {}

  public start(recipeId: RecipeId, stationId: string): { success: boolean; reason?: string } {
    const { state, events } = this.context;
    const recipe = ContentRegistry.recipes.get(recipeId);
    if (!recipe) return { success: false, reason: "Unknown recipe" };
    const station = state.world.structures[stationId];
    if (!station) return { success: false, reason: "Station not found" };
    if (distance2d(state.player, station) > STATION_INTERACTION_RADIUS) {
      return { success: false, reason: "Move closer to the station" };
    }
    if (station.type !== recipe.stationType) {
      return { success: false, reason: `This recipe requires a ${recipe.stationType}` };
    }
    if (recipe.minimumSkill && state.player.proficiencies[recipe.minimumSkill.skill] < recipe.minimumSkill.xp) {
      return { success: false, reason: `Requires ${recipe.minimumSkill.xp} ${recipe.minimumSkill.skill} XP` };
    }
    if (Object.values(state.processingJobs).some((job) => job.stationId === stationId && job.status !== "collected")) {
      return { success: false, reason: "Station is already in use" };
    }

    const inventory = state.inventories[state.player.inventoryId];
    if (!InventoryManager.hasItems(inventory, recipe.inputs)) {
      return { success: false, reason: "Missing required ingredients" };
    }
    if (!InventoryManager.canAddItemsAfterRemoving(inventory, recipe.inputs, recipe.outputs)) {
      return { success: false, reason: "inventory-full" };
    }
    InventoryManager.removeItemsAtomically(inventory, recipe.inputs);
    const jobId = this.context.nextEntityId("job");
    state.processingJobs[jobId] = {
      id: jobId,
      recipeId,
      stationId,
      startedAtMinute: state.clock.currentMinute,
      completesAtMinute: state.clock.currentMinute + recipe.durationMinutes,
      status: "active"
    };
    this.context.persistRng();
    events.emit("RecipeStarted", { jobId, recipeId, minute: state.clock.currentMinute });
    return { success: true };
  }

  public collect(jobId: ProcessingJobId): { success: boolean; reason?: string } {
    const { state, events } = this.context;
    const job = state.processingJobs[jobId];
    if (!job || job.status !== "complete") return { success: false, reason: "Job not complete" };
    const station = state.world.structures[job.stationId];
    if (!station || distance2d(state.player, station) > STATION_INTERACTION_RADIUS) {
      return { success: false, reason: "Move closer to the station" };
    }
    const recipe = ContentRegistry.recipes.get(job.recipeId)!;
    const inventory = state.inventories[state.player.inventoryId];
    if (!InventoryManager.canAddItems(inventory, recipe.outputs)) {
      return { success: false, reason: "Inventory is full!" };
    }
    InventoryManager.addItemsAtomically(inventory, recipe.outputs);
    job.status = "collected";
    delete state.processingJobs[jobId];
    this.progression.addProficiencyXp("processing", 35);
    events.emit("RecipeCompleted", { jobId, recipeId: recipe.id, stationId: job.stationId, minute: state.clock.currentMinute });
    return { success: true };
  }

  public tick(): void {
    const { state } = this.context;
    for (const job of Object.values(state.processingJobs)) {
      if (job.status === "active" && state.clock.currentMinute >= job.completesAtMinute) {
        job.status = "complete";
      }
    }
  }
}
