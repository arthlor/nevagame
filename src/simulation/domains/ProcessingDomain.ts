import { ContentRegistry } from "../../content/ContentRegistry";
import { isProcessingRecipeUnlocked, PROFICIENCY_RANKS } from "../../content/progression";
import { LIVE_RECIPE_IDS } from "../../content/recipes";
import type { RecipeDefinition } from "../../content/types";
import type {
  InventoryState,
  ProcessingJobId,
  ProcessingJobState,
  ProcessingWorkTier,
  RecipeId,
  RecipeResult,
  StationType
} from "../core/types";
import type {
  InteractionResult,
  ProcessingJobInspectionDto,
  ProcessingRecipeRowDto,
  ProcessingStationDto
} from "../core/contracts";
import { formatClockTime, formatGameDuration } from "../core/GameClock";
import { InventoryManager } from "../inventory/InventoryManager";
import { PLAYER_SATCHEL_SLOT_COUNT } from "../inventory/InventoryLimits";
import { effectiveRecipeDurationMinutes } from "../core/OnboardingPace";
import type { DomainContext } from "./DomainContext";
import type { ProgressionDomain } from "./ProgressionDomain";
import type { EquipmentDomain } from "./EquipmentDomain";
import { freeHandsBlocker } from "./domainRules";
import { assessProcessingStationApproach } from "../../world/ProcessingStationApproach";

/** Standard station job cost, retained as the compatibility owner for existing recipes. */
export const PROCESSING_WORK_COST = 35;
export const MASTERWORK_PROCESSING_WORK_COST = 70;
export const PROCESSING_XP_BY_TIER: Record<ProcessingWorkTier, number> = {
  standard: 35,
  masterwork: 70
};
export const PROCESSING_WORK_BY_TIER: Record<ProcessingWorkTier, number> = {
  standard: PROCESSING_WORK_COST,
  masterwork: MASTERWORK_PROCESSING_WORK_COST
};
export const PROCESSING_JOB_SNAPSHOT_LIMITS = {
  maxDurationMinutes: 24 * 60,
  maxLabelCharacters: 160
} as const;

export { PROCESSING_STATION_INTERACTION_RADIUS } from "../../world/ProcessingStationApproach";

export function processingWorkForRecipe(recipe: RecipeDefinition): number {
  return PROCESSING_WORK_BY_TIER[recipe.workTier];
}

export function processingXpForRecipe(recipe: RecipeDefinition): number {
  return PROCESSING_XP_BY_TIER[recipe.workTier];
}

/** Defense-in-depth for persisted or externally supplied simulation state. */
export function isValidProcessingJobEconomicSnapshot(job: ProcessingJobState): boolean {
  const workTier = job.workTier as ProcessingWorkTier;
  if (
    !Object.hasOwn(PROCESSING_WORK_BY_TIER, workTier) ||
    !Number.isSafeInteger(job.baseWork) ||
    job.baseWork !== PROCESSING_WORK_BY_TIER[workTier] ||
    !Number.isSafeInteger(job.chargedWork) ||
    job.chargedWork < 1 ||
    job.chargedWork > job.baseWork ||
    !Number.isSafeInteger(job.xpReward) ||
    job.xpReward !== PROCESSING_XP_BY_TIER[workTier] ||
    !Number.isSafeInteger(job.startedAtMinute) ||
    !Number.isSafeInteger(job.completesAtMinute) ||
    !Number.isSafeInteger(job.effectiveDurationMinutes) ||
    job.effectiveDurationMinutes < 1 ||
    job.effectiveDurationMinutes > PROCESSING_JOB_SNAPSHOT_LIMITS.maxDurationMinutes ||
    job.completesAtMinute - job.startedAtMinute !== job.effectiveDurationMinutes
  ) return false;
  if (job.result.kind === "equipment") return ContentRegistry.equipment.has(job.result.equipmentId);
  if (
    job.result.kind !== "items" ||
    !Array.isArray(job.result.stacks) ||
    job.result.stacks.length === 0 ||
    job.result.stacks.length > PLAYER_SATCHEL_SLOT_COUNT
  ) return false;
  const itemIds = new Set<string>();
  for (const stack of job.result.stacks) {
    const item = ContentRegistry.items.get(stack.itemId);
    if (
      !item ||
      itemIds.has(stack.itemId) ||
      !Number.isSafeInteger(stack.quantity) ||
      stack.quantity < 1 ||
      stack.quantity > item.stackLimit
    ) return false;
    itemIds.add(stack.itemId);
  }
  return true;
}

export function recipeOutputLabel(result: RecipeResult): string {
  if (result.kind === "equipment") {
    return ContentRegistry.equipment.get(result.equipmentId)?.name ?? "Equipment";
  }
  return result.stacks.map((stack) => {
    const name = ContentRegistry.items.get(stack.itemId)?.name ?? stack.itemId;
    return stack.quantity > 1 ? `${stack.quantity} ${name}` : name;
  }).join(", ");
}

/** Existing station briefings name the thing being made, not its batch size. */
export function processingJobOutputName(result: RecipeResult): string {
  if (result.kind === "equipment") {
    return ContentRegistry.equipment.get(result.equipmentId)?.name ?? "Equipment";
  }
  return result.stacks.map((stack) => ContentRegistry.items.get(stack.itemId)?.name ?? stack.itemId).join(", ");
}

function cloneResult(result: RecipeResult): RecipeResult {
  return result.kind === "equipment"
    ? { ...result }
    : { kind: "items", stacks: result.stacks.map((stack) => ({ ...stack })) };
}

/** First unlocked recipe the satchel can actually start, else the first unlocked recipe. */
export function pickUnlockedStationRecipe(
  stationType: StationType,
  inventory: InventoryState,
  processingXp: number
): RecipeDefinition | undefined {
  const recipes = [...ContentRegistry.recipes.values()].filter(
    (recipe) => recipe.stationType === stationType && LIVE_RECIPE_IDS.has(recipe.id)
  );
  const unlocked = recipes.filter(
    (recipe) =>
      isProcessingRecipeUnlocked(processingXp, recipe.id)
      && (!recipe.minimumSkill || processingXp >= recipe.minimumSkill.xp)
  );
  return unlocked.find((recipe) => InventoryManager.hasItems(inventory, recipe.inputs)) ?? unlocked[0];
}

export class ProcessingDomain {
  constructor(
    private readonly context: DomainContext,
    private readonly progression: ProgressionDomain,
    private readonly equipment: EquipmentDomain
  ) {}

  public start(recipeId: RecipeId, stationId: string): InteractionResult {
    const { state, events } = this.context;
    if (state.player.activeMountId) return { success: false, reason: "Dismount before using a station" };
    if (state.player.activeBoatId) return { success: false, reason: "Disembark before using a station" };
    if (state.basicFishing || state.sportFishing) return { success: false, reason: "Finish fishing first" };
    const handsBlocker = freeHandsBlocker(state.player);
    if (handsBlocker) return { success: false, reason: handsBlocker };
    const recipe = ContentRegistry.recipes.get(recipeId);
    if (!recipe) return { success: false, reason: "Unknown recipe" };
    if (!LIVE_RECIPE_IDS.has(recipe.id)) return { success: false, reason: "That recipe is not available yet" };
    const lockReason = this.recipeLockReason(recipe);
    if (lockReason) return { success: false, reason: lockReason };
    const station = state.world.structures[stationId];
    if (!station) return { success: false, reason: "Station not found" };
    const approach = assessProcessingStationApproach(stationId, state.player, station);
    if (!approach.valid) return { success: false, reason: this.approachFailureReason(approach.reason) };
    if (station.type !== recipe.stationType) {
      return { success: false, reason: `This recipe requires a ${recipe.stationType}` };
    }
    if (Object.values(state.processingJobs).some((job) => job.stationId === stationId)) {
      return { success: false, reason: "Station is already in use" };
    }
    if (recipe.result.kind === "equipment") {
      const reservation = this.equipment.canReserve(recipe.result.equipmentId);
      if (!reservation.success) return reservation;
    }
    const inventory = state.inventories[state.player.inventoryId];
    if (!InventoryManager.hasItems(inventory, recipe.inputs)) {
      return { success: false, reason: "Missing required ingredients" };
    }
    // Item outputs remain at the station, so current satchel space is checked
    // only at collection. Equipment capacity is reserved above because it has
    // a separate permanent-storage contract.
    const baseWork = processingWorkForRecipe(recipe);
    const workQuote = this.progression.quoteWorkCost(baseWork, "processing", "processing.start");
    if (!workQuote.affordable) return this.progression.insufficientWorkResult(workQuote, "Processing");
    if (!InventoryManager.removeItemsAtomically(inventory, recipe.inputs)) {
      return { success: false, reason: "The ingredients changed before the job began" };
    }
    const work = this.progression.trySpendWork(baseWork, "processing", "Processing", "processing.start");
    if (!work.success) {
      InventoryManager.addItemsAtomically(inventory, recipe.inputs);
      return work;
    }
    const effectiveDuration = effectiveRecipeDurationMinutes(recipe, stationId, state.quests);
    const jobId = this.context.nextEntityId("job");
    state.processingJobs[jobId] = {
      id: jobId,
      recipeId,
      stationId,
      startedAtMinute: state.clock.currentMinute,
      completesAtMinute: state.clock.currentMinute + effectiveDuration,
      status: "active",
      recipeName: recipe.name,
      outputLabel: processingJobOutputName(recipe.result),
      result: cloneResult(recipe.result),
      workTier: recipe.workTier,
      presentationKind: recipe.presentationKind,
      baseWork,
      chargedWork: work.cost,
      xpReward: processingXpForRecipe(recipe),
      effectiveDurationMinutes: effectiveDuration
    };
    this.context.persistRng();
    events.emit("RecipeStarted", { jobId, recipeId, minute: state.clock.currentMinute });
    return { success: true, cost: work.cost };
  }

  public collect(jobId: ProcessingJobId): InteractionResult {
    const { state, events } = this.context;
    if (state.player.activeMountId) return { success: false, reason: "Dismount before using a station" };
    if (state.player.activeBoatId) return { success: false, reason: "Disembark before using a station" };
    if (state.basicFishing || state.sportFishing) return { success: false, reason: "Finish fishing first" };
    const handsBlocker = freeHandsBlocker(state.player);
    if (handsBlocker) return { success: false, reason: handsBlocker };
    const job = state.processingJobs[jobId];
    if (!job || job.status !== "complete") return { success: false, reason: "Job not complete" };
    if (!isValidProcessingJobEconomicSnapshot(job) || state.clock.currentMinute < job.completesAtMinute) {
      return { success: false, reason: "The saved job data is invalid" };
    }
    const station = state.world.structures[job.stationId];
    if (!station) return { success: false, reason: "Station not found" };
    const approach = assessProcessingStationApproach(job.stationId, state.player, station);
    if (!approach.valid) return { success: false, reason: this.approachFailureReason(approach.reason) };

    if (job.result.kind === "items") {
      const inventory = state.inventories[state.player.inventoryId];
      if (!InventoryManager.canAddItems(inventory, job.result.stacks)) {
        return { success: false, reason: "The satchel is full", reasonCode: "inventory-full" };
      }
      if (!InventoryManager.addItemsAtomically(inventory, job.result.stacks)) {
        return { success: false, reason: "The satchel changed before collection" };
      }
    } else {
      const grant = this.equipment.grantCrafted(job.result.equipmentId);
      if (!grant.success) return grant;
    }

    // Remove the job before publishing completion. A listener that validates or
    // persists during `EquipmentCrafted` must not observe an owned equipment id
    // alongside its still-pending job, which `SaveSchema` rejects.
    delete state.processingJobs[jobId];
    if (job.result.kind === "equipment") {
      events.emit("EquipmentCrafted", {
        equipmentId: job.result.equipmentId,
        recipeId: job.recipeId,
        minute: state.clock.currentMinute
      });
    }
    this.progression.addProficiencyXp("processing", job.xpReward);
    // RecipeCompleted remains the collection event so existing quest targets
    // advance only when the player actually receives the result.
    events.emit("RecipeCompleted", {
      jobId,
      recipeId: job.recipeId,
      stationId: job.stationId,
      minute: state.clock.currentMinute
    });
    return { success: true, xpGained: job.xpReward };
  }

  public inspect(stationId: string): ProcessingJobInspectionDto | null {
    const { state } = this.context;
    if (state.player.activeMountId) return null;
    const job = Object.values(state.processingJobs).find((candidate) => candidate.stationId === stationId);
    if (!job) return null;
    const remainingMinutes = Math.max(0, job.completesAtMinute - state.clock.currentMinute);
    const readyClockLabel = formatClockTime(job.completesAtMinute);
    const durationLabel = formatGameDuration(remainingMinutes);
    const waitBriefing = job.status === "complete"
      ? `${job.outputLabel} ready to collect`
      : remainingMinutes <= 0
        ? `${job.outputLabel} working · almost ready`
        : `${job.outputLabel} working · ${durationLabel} left · ready ${readyClockLabel}`;
    return {
      jobId: job.id,
      stationId: job.stationId,
      recipeId: job.recipeId,
      recipeName: job.recipeName,
      outputName: job.outputLabel,
      status: job.status,
      remainingMinutes: job.status === "complete" ? 0 : remainingMinutes,
      readyClockLabel,
      waitBriefing,
      startBriefing: `${job.recipeName} started · ${formatGameDuration(job.effectiveDurationMinutes)} · ready ${readyClockLabel}`
    };
  }

  public inspectStation(stationId: string): ProcessingStationDto | null {
    const { state } = this.context;
    const station = state.world.structures[stationId];
    if (!station) return null;
    const inventory = state.inventories[state.player.inventoryId];
    const questTargets = this.activeCraftRecipeTargets();
    const rows = [...ContentRegistry.recipes.values()]
      .filter((recipe) => recipe.stationType === station.type && LIVE_RECIPE_IDS.has(recipe.id))
      .map((recipe, contentOrder) => {
        const lockedReason = this.recipeLockReason(recipe);
        const inputs = recipe.inputs.map((input) => {
          const owned = InventoryManager.getItemCount(inventory, input.itemId);
          return {
            itemId: input.itemId,
            name: ContentRegistry.items.get(input.itemId)?.name ?? input.itemId,
            required: input.quantity,
            owned,
            enough: owned >= input.quantity
          };
        });
        const blockers: string[] = [];
        if (lockedReason) blockers.push(lockedReason);
        else {
          if (Object.values(state.processingJobs).some((job) => job.stationId === stationId)) {
            blockers.push("Station is already in use");
          }
          for (const input of inputs) if (!input.enough) blockers.push(`Need ${input.required} ${input.name}`);
          if (recipe.result.kind === "equipment") {
            const reservation = this.equipment.canReserve(recipe.result.equipmentId);
            if (!reservation.success && reservation.reason) blockers.push(reservation.reason);
          }
        }
        const work = this.progression.quoteWorkCost(processingWorkForRecipe(recipe), "processing", "processing.start");
        if (!lockedReason && !work.affordable) blockers.push(`Need ${work.cost} Work`);
        const questTarget = questTargets.has(recipe.id);
        const stateLabel: ProcessingRecipeRowDto["state"] = lockedReason
          ? "locked"
          : questTarget
            ? "quest-target"
            : blockers.length === 0
              ? "craftable"
              : "blocked";
        return {
          contentOrder,
          row: {
            recipeId: recipe.id,
            name: recipe.name,
            result: cloneResult(recipe.result),
            outputLabel: recipeOutputLabel(recipe.result),
            inputs,
            work,
            durationMinutes: effectiveRecipeDurationMinutes(recipe, stationId, state.quests),
            durationLabel: formatGameDuration(effectiveRecipeDurationMinutes(recipe, stationId, state.quests)),
            workTier: recipe.workTier,
            presentationKind: recipe.presentationKind,
            state: stateLabel,
            blockers
          } satisfies ProcessingRecipeRowDto
        };
      })
      .sort((a, b) => this.recipeStateOrder(a.row.state) - this.recipeStateOrder(b.row.state) || a.contentOrder - b.contentOrder)
      .map(({ row }) => row);
    return {
      stationId,
      stationType: station.type,
      job: this.inspect(stationId),
      recipes: rows
    };
  }

  public tick(): void {
    const { state, events } = this.context;
    for (const job of Object.values(state.processingJobs)) {
      if (job.status !== "active" || state.clock.currentMinute < job.completesAtMinute) continue;
      job.status = "complete";
      events.emit("ProcessingJobReady", {
        jobId: job.id,
        recipeId: job.recipeId,
        stationId: job.stationId,
        minute: state.clock.currentMinute
      });
    }
  }

  private recipeLockReason(recipe: RecipeDefinition): string | null {
    const processingXp = this.context.state.player.proficiencies.processing;
    if (!isProcessingRecipeUnlocked(processingXp, recipe.id)) {
      const rank = PROFICIENCY_RANKS.find((candidate) => candidate.processingUnlocks.includes(recipe.id));
      return rank ? `Requires ${rank.xpRequired} Processing XP` : "That recipe is not unlocked yet";
    }
    if (recipe.minimumSkill && processingXp < recipe.minimumSkill.xp) {
      return `Requires ${recipe.minimumSkill.xp} Processing XP`;
    }
    return null;
  }

  private activeCraftRecipeTargets(): Set<string> {
    const targets = new Set<string>();
    for (const progress of Object.values(this.context.state.quests.tracks)) {
      if (!progress.activeQuestId) continue;
      const quest = ContentRegistry.quests.get(progress.activeQuestId);
      const objective = quest?.objectives[progress.activeStepIndex];
      if (objective?.type === "craft-recipe" && objective.targetId) targets.add(objective.targetId);
    }
    return targets;
  }

  private recipeStateOrder(state: ProcessingRecipeRowDto["state"]): number {
    return { "quest-target": 0, craftable: 1, blocked: 2, locked: 3 }[state];
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
