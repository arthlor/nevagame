import { ContentRegistry } from "../../content/ContentRegistry";
import { LIVE_RECIPE_IDS } from "../../content/recipes";
import type { RecipeDefinition } from "../../content/types";
import type { InventoryState, ProcessingJobId, RecipeId, StationType } from "../core/types";
import type { ProcessingJobInspectionDto } from "../core/contracts";
import { formatClockTime, formatGameDuration } from "../core/GameClock";
import { InventoryManager } from "../inventory/InventoryManager";
import type { DomainContext } from "./DomainContext";
import type { ProgressionDomain } from "./ProgressionDomain";
import { assessProcessingStationApproach } from "../../world/ProcessingStationApproach";

export { PROCESSING_STATION_INTERACTION_RADIUS } from "../../world/ProcessingStationApproach";

/** First unlocked recipe the backpack can actually start, else the first unlocked recipe. */
export function pickUnlockedStationRecipe(
  stationType: StationType,
  inventory: InventoryState,
  processingXp: number
): RecipeDefinition | undefined {
  const recipes = [...ContentRegistry.recipes.values()].filter(
    (recipe) => recipe.stationType === stationType && LIVE_RECIPE_IDS.has(recipe.id)
  );
  const unlocked = recipes.filter(
    (recipe) => !recipe.minimumSkill || processingXp >= recipe.minimumSkill.xp
  );
  return unlocked.find((recipe) => InventoryManager.hasItems(inventory, recipe.inputs)) ?? unlocked[0];
}

export class ProcessingDomain {
  constructor(
    private readonly context: DomainContext,
    private readonly progression: ProgressionDomain
  ) {}

  public start(recipeId: RecipeId, stationId: string): { success: boolean; reason?: string } {
    const { state, events } = this.context;
    if (state.player.activeMountId) return { success: false, reason: "Dismount before using a station" };
    const recipe = ContentRegistry.recipes.get(recipeId);
    if (!recipe) return { success: false, reason: "Unknown recipe" };
    if (!LIVE_RECIPE_IDS.has(recipe.id)) return { success: false, reason: "That recipe is not available yet" };
    const station = state.world.structures[stationId];
    if (!station) return { success: false, reason: "Station not found" };
    const approach = assessProcessingStationApproach(stationId, state.player, station);
    if (!approach.valid) {
      return { success: false, reason: this.approachFailureReason(approach.reason) };
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
    if (state.player.activeMountId) return { success: false, reason: "Dismount before using a station" };
    const job = state.processingJobs[jobId];
    if (!job || job.status !== "complete") return { success: false, reason: "Job not complete" };
    const station = state.world.structures[job.stationId];
    if (!station) return { success: false, reason: "Station not found" };
    const approach = assessProcessingStationApproach(job.stationId, state.player, station);
    if (!approach.valid) return { success: false, reason: this.approachFailureReason(approach.reason) };
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

  public inspect(stationId: string): ProcessingJobInspectionDto | null {
    const { state } = this.context;
    if (state.player.activeMountId) return null;
    const job = Object.values(state.processingJobs).find(
      (candidate) => candidate.stationId === stationId && candidate.status !== "collected"
    );
    if (!job) return null;
    const recipe = ContentRegistry.recipes.get(job.recipeId);
    if (!recipe) return null;
    const outputName = ContentRegistry.items.get(recipe.outputs[0]?.itemId)?.name ?? "Output";
    const remainingMinutes = Math.max(0, job.completesAtMinute - state.clock.currentMinute);
    const readyClockLabel = formatClockTime(job.completesAtMinute);
    const durationLabel = formatGameDuration(remainingMinutes);
    const waitBriefing =
      job.status === "complete"
        ? `${outputName} ready to collect`
        : remainingMinutes <= 0
          ? `${outputName} working · almost ready`
          : `${outputName} working · ${durationLabel} left · ready ${readyClockLabel}`;
    return {
      jobId: job.id,
      stationId: job.stationId,
      recipeId: job.recipeId,
      recipeName: recipe.name,
      outputName,
      status: job.status === "complete" ? "complete" : "active",
      remainingMinutes: job.status === "complete" ? 0 : remainingMinutes,
      readyClockLabel,
      waitBriefing,
      startBriefing: `${recipe.name} started · ${formatGameDuration(recipe.durationMinutes)} · ready ${readyClockLabel}`
    };
  }

  public tick(): void {
    const { state } = this.context;
    for (const job of Object.values(state.processingJobs)) {
      if (job.status === "active" && state.clock.currentMinute >= job.completesAtMinute) {
        job.status = "complete";
      }
    }
  }

  private approachFailureReason(reason: ReturnType<typeof assessProcessingStationApproach>["reason"]): string {
    switch (reason) {
      case "too-far":
        return "Move closer to the station";
      case "wrong-side":
        return "Stand in front of the station";
      default:
        return "Station is not interactable";
    }
  }
}
