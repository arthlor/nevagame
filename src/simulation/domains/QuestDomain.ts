// src/simulation/domains/QuestDomain.ts

import { ContentRegistry } from "../../content/ContentRegistry";
import { getRankForXp } from "../../content/progression";
import type { NpcDefinition } from "../../content/npcs";
import { InventoryManager } from "../inventory/InventoryManager";
import type { DomainContext } from "./DomainContext";
import type { ProgressionDomain } from "./ProgressionDomain";
import {
  MAIN_QUEST_TRACK_ID,
  activeQuestTrackIds,
  questTrackProgress,
  type ActiveQuestDto,
  type NpcId,
  type QuestDefinition,
  type QuestId,
  type QuestLocationRequirement,
  type QuestObjectiveType,
  type QuestTrackId
} from "../core/QuestTypes";
import type { InteractionResult } from "../core/contracts";
import type { GameState } from "../core/types";
import { distance2d } from "./DomainContext";

const NPC_TALK_RADIUS = 3.5;

type ObjectiveEventLocation = QuestLocationRequirement;

/**
 * Content-chain reconciliation for saves whose track ran out of authored
 * content. It activates newly appended quests without replaying any reward.
 *
 * Runs per track, so appending to one chain never disturbs another's cursor.
 */
export function reconcileInactiveQuestChain(state: GameState): boolean {
  const completed = new Set(state.quests.completedQuestIds);
  let activated = false;
  for (const track of ContentRegistry.questTracks.values()) {
    const progress = questTrackProgress(state.quests, track.id);
    if (progress.activeQuestId !== null) continue;
    for (let index = state.quests.completedQuestIds.length - 1; index >= 0; index -= 1) {
      const completedQuest = ContentRegistry.quests.get(state.quests.completedQuestIds[index]);
      if (completedQuest?.trackId !== track.id) continue;
      const nextQuest = completedQuest.nextQuestId
        ? ContentRegistry.quests.get(completedQuest.nextQuestId)
        : undefined;
      if (!nextQuest || completed.has(nextQuest.id)) continue;
      if (track.id === MAIN_QUEST_TRACK_ID) state.quests.activeActId = nextQuest.actId;
      progress.activeQuestId = nextQuest.id;
      progress.activeStepIndex = 0;
      progress.stepProgress = {};
      reconcileSatisfiedQuestObjectives(state, track.id);
      activated = true;
      break;
    }
  }
  return activated;
}

/**
 * Auto-satisfies objectives whose target the player already owns, so a save
 * that bought the skiff before the quest asked for it cannot softlock.
 * Reconciles every track when no track id is given.
 */
export function reconcileSatisfiedQuestObjectives(state: GameState, trackId?: QuestTrackId): boolean {
  if (trackId === undefined) {
    let changed = false;
    for (const id of Object.keys(state.quests.tracks)) {
      if (reconcileSatisfiedQuestObjectives(state, id)) changed = true;
    }
    return changed;
  }

  const progress = questTrackProgress(state.quests, trackId);
  const quest = progress.activeQuestId
    ? ContentRegistry.quests.get(progress.activeQuestId)
    : undefined;
  if (!quest) return false;
  let changed = false;
  while (progress.activeStepIndex < quest.objectives.length) {
    const objective = quest.objectives[progress.activeStepIndex];
    if (!objective?.targetId) break;
    const alreadySatisfied =
      (objective.type === "install-irrigation" && state.quests.unlockedFeatureIds.includes(objective.targetId))
      || (objective.type === "purchase-upgrade" && (
        state.quests.unlockedFeatureIds.includes(objective.targetId)
        || Object.values(state.boats).some((boat) => boat.id === objective.targetId || boat.boatTypeId === objective.targetId)
      ));
    if (!alreadySatisfied) break;
    progress.stepProgress[objective.id] = objective.targetQuantity;
    changed = true;
    if (progress.activeStepIndex >= quest.objectives.length - 1) break;
    progress.activeStepIndex += 1;
    progress.stepProgress = {};
  }
  return changed;
}

export class QuestDomain {
  private unsubscribeEvents: Array<() => void> = [];

  constructor(
    private readonly context: DomainContext,
    private readonly progressionDomain: ProgressionDomain
  ) {
    this.registerEventListeners();
  }

  private registerEventListeners(): void {
    const { events } = this.context;

    this.unsubscribeEvents.push(
      events.on("CropPlanted", (e) => this.onObjectiveEvent("plant-crop", e.cropId, 1, { kind: "farm", id: e.farmId })),
      events.on("CropWatered", (e) => this.onObjectiveEvent("water-crop", undefined, 1, { kind: "farm", id: e.farmId })),
      events.on("CropHarvested", (e) => this.onObjectiveEvent("harvest-crop", e.cropId, 1, { kind: "farm", id: e.farmId })),
      events.on("RecipeCompleted", (e) => this.onObjectiveEvent("craft-recipe", e.recipeId, 1, { kind: "station", id: e.stationId })),
      events.on("BasicFishingResolved", (e) => {
        if (e.catchItemId && e.reason !== "missed" && e.reason !== "escaped" && e.reason !== "cancelled") {
          this.onObjectiveEvent("catch-basic-fish", e.catchItemId, 1, { kind: "habitat", id: e.habitatId });
          this.onObjectiveEvent("catch-basic-fish", e.catchItemId, 1, { kind: "ecology", id: e.ecologyId });
          if (e.boatId) {
            this.onObjectiveEvent("catch-basic-fish", e.catchItemId, 1, { kind: "boat", id: e.boatId });
          }
        }
      }),
      events.on("FishSchoolChummed", (e) => {
        this.onObjectiveEvent("chum-school", undefined, 1, { kind: "habitat", id: e.habitatId });
        this.onObjectiveEvent("chum-school", undefined, 1, { kind: "ecology", id: e.ecologyId });
      }),
      events.on("FishHooked", (e) => {
        this.onObjectiveEvent("hook-sport-fish", e.speciesId, 1, { kind: "habitat", id: e.habitatId });
        this.onObjectiveEvent("hook-sport-fish", e.speciesId, 1, { kind: "ecology", id: e.ecologyId });
      }),
      events.on("FishLanded", (e) => {
        this.onObjectiveEvent("land-sport-fish", e.speciesId, 1, { kind: "ecology", id: e.ecologyId });
        this.onObjectiveEvent(
          "land-sport-fish",
          e.speciesId,
          1,
          e.boatId ? { kind: "boat", id: e.boatId } : undefined
        );
        // Shore / player-carry landings have no boatId. Treat carry as stowed so
        // Act 5 cannot softlock waiting for a boat-hold CargoLoaded that never comes.
        if (!e.boatId) {
          this.onObjectiveEvent("stow-cargo", undefined, 1);
        }
      }),
      events.on("CargoLoaded", (e) => this.onObjectiveEvent("stow-cargo", undefined, 1, { kind: "boat", id: e.boatId })),
      events.on("BoatBoarded", (e) => this.onObjectiveEvent("board-boat", e.boatId, 1, { kind: "boat", id: e.boatId })),
      events.on("BoatDocked", (e) => {
        this.onObjectiveEvent("dock-boat", e.boatId, 1, { kind: "boat", id: e.boatId });
        this.onObjectiveEvent("dock-boat", e.boatId, 1, { kind: "market", id: e.marketId });
      }),
      events.on("ItemSold", (e) => this.onObjectiveEvent("sell-item", e.itemId, e.quantity, { kind: "market", id: e.marketId })),
      events.on("FishSold", (e) => this.onObjectiveEvent("sell-fish", e.speciesId, 1, { kind: "market", id: e.marketId })),
      events.on("ContractCompleted", (e) => {
        this.onObjectiveEvent("complete-contract", e.templateId, 1);
        // Also by type, so a quest can ask for "any bulk order" rather than
        // one template the board may not roll for a long time.
        if (e.contractType !== e.templateId) this.onObjectiveEvent("complete-contract", e.contractType, 1);
      }),
      events.on("FarmFertilized", (e) => this.onObjectiveEvent("apply-fertilizer", e.farmId, 1, { kind: "farm", id: e.farmId })),
      events.on("IrrigationInstalled", (e) => this.onObjectiveEvent("install-irrigation", e.featureId, 1, { kind: "farm", id: e.farmId })),
      events.on("FarmIrrigated", (e) => this.onObjectiveEvent("irrigate-farm", e.farmId, 1, { kind: "farm", id: e.farmId })),
      events.on("RodPurchased", (e) => this.onPurchaseUpgrade([e.rodId])),
      events.on("BoatPurchased", (e) => this.onPurchaseUpgrade([e.boatTypeId, e.boatId])),
      events.on("NpcTalked", (e) => this.onObjectiveEvent("talk-npc", e.npcId, 1)),
      events.on("ProficiencyLeveledUp", () => this.evaluateTrackUnlocks())
    );
  }

  private onPurchaseUpgrade(targetIds: string[]): void {
    for (const trackId of activeQuestTrackIds(this.context.state.quests)) {
      const progress = questTrackProgress(this.context.state.quests, trackId);
      const objective = this.getActiveQuest(trackId)?.objectives[progress.activeStepIndex];
      if (!objective || objective.type !== "purchase-upgrade") continue;
      const targetId = objective.targetId
        ? targetIds.find((candidate) => candidate === objective.targetId)
        : targetIds[0];
      if (!targetId) continue;
      this.applyObjectiveEventToTrack(trackId, "purchase-upgrade", targetId, 1);
    }
  }

  public dispose(): void {
    for (const unsubscribe of this.unsubscribeEvents) {
      unsubscribe();
    }
    this.unsubscribeEvents = [];
  }

  /** The quest running on one track, or on the focused track by default. */
  public getActiveQuest(trackId: QuestTrackId = this.context.state.quests.focusedTrackId): QuestDefinition | null {
    const progress = questTrackProgress(this.context.state.quests, trackId);
    if (!progress.activeQuestId) return null;
    return ContentRegistry.quests.get(progress.activeQuestId) ?? null;
  }

  /** Every track with a quest in progress, focused track first. */
  public getActiveQuestDtos(): ActiveQuestDto[] {
    const { quests } = this.context.state;
    const trackIds = activeQuestTrackIds(quests)
      .sort((a, b) => (a === quests.focusedTrackId ? -1 : b === quests.focusedTrackId ? 1 : 0));
    return trackIds.flatMap((trackId) => this.getActiveQuestDto(trackId) ?? []);
  }

  public getActiveQuestDto(trackId: QuestTrackId = this.context.state.quests.focusedTrackId): ActiveQuestDto | null {
    const quest = this.getActiveQuest(trackId);
    if (!quest) return null;

    const progress = questTrackProgress(this.context.state.quests, trackId);
    const stepIndex = Math.min(progress.activeStepIndex, quest.objectives.length - 1);
    const objective = quest.objectives[stepIndex];
    if (!objective) return null;

    const currentProgress = progress.stepProgress[objective.id] ?? 0;
    const isStepComplete = currentProgress >= objective.targetQuantity;
    const isLastStep = stepIndex === quest.objectives.length - 1
      || progress.activeStepIndex >= quest.objectives.length;
    const awaitingTurnIn = isLastStep && isStepComplete;
    const turnIn = awaitingTurnIn ? this.canPayQuestTurnIn(quest) : null;
    const isQuestReadyToTurnIn = Boolean(awaitingTurnIn && turnIn?.success);

    const speaker = ContentRegistry.npcs.get(quest.speakerId);
    const speakerName = speaker?.name ?? "Townsperson";

    return {
      questId: quest.id,
      trackId,
      trackTitle: ContentRegistry.questTracks.get(trackId)?.title ?? quest.actTitle,
      actId: quest.actId,
      actTitle: quest.actTitle,
      questTitle: quest.questTitle,
      speakerId: quest.speakerId,
      speakerName,
      currentStepIndex: stepIndex + 1,
      totalSteps: quest.objectives.length,
      objectiveDescription: awaitingTurnIn
        ? turnIn?.success
          ? `Talk to ${speakerName} to continue`
          : turnIn?.reason ?? "Prepare what this errand still needs"
        : objective.description,
      currentProgress,
      targetQuantity: objective.targetQuantity,
      isStepComplete,
      isQuestReadyToTurnIn,
      turnInBlockerReason: awaitingTurnIn && !turnIn?.success ? turnIn?.reason : undefined,
      targetLocation: awaitingTurnIn && speaker
        ? turnIn?.success
          ? { x: speaker.anchor.x, z: speaker.anchor.z, name: speaker.anchor.locationName }
          : undefined
        : objective.locationAnchor,
      rewards: quest.rewards
    };
  }

  public onObjectiveEvent(
    type: QuestObjectiveType,
    targetId?: string,
    amount: number = 1,
    location?: ObjectiveEventLocation
  ): void {
    // One world event may legitimately satisfy an objective on more than one
    // track at once — harvesting a crop can advance the spine and a side
    // chain in the same tick — so every active track is offered the event.
    for (const trackId of activeQuestTrackIds(this.context.state.quests)) {
      this.applyObjectiveEventToTrack(trackId, type, targetId, amount, location);
    }
  }

  private applyObjectiveEventToTrack(
    trackId: QuestTrackId,
    type: QuestObjectiveType,
    targetId?: string,
    amount: number = 1,
    location?: ObjectiveEventLocation
  ): void {
    const quest = this.getActiveQuest(trackId);
    if (!quest) return;

    const quests = questTrackProgress(this.context.state.quests, trackId);

    const currentStep = quest.objectives[quests.activeStepIndex];
    if (!currentStep) return;

    if (currentStep.type !== type) return;

    // Check target ID if specified (e.g. specific crop or recipe)
    if (currentStep.targetId !== undefined && currentStep.targetId !== targetId) {
      return;
    }
    if (currentStep.location && (
      !location ||
      currentStep.location.kind !== location.kind ||
      currentStep.location.id !== location.id
    )) {
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) return;

    const previous = quests.stepProgress[currentStep.id] ?? 0;
    if (previous >= currentStep.targetQuantity) return;

    const current = Math.min(currentStep.targetQuantity, previous + amount);
    quests.stepProgress[currentStep.id] = current;

    this.context.events.emit("QuestProgressed", {
      questId: quest.id,
      stepId: currentStep.id,
      current: Math.min(current, currentStep.targetQuantity),
      total: currentStep.targetQuantity,
      minute: this.context.state.clock.currentMinute
    });

    // Check if current step is completed
    if (current >= currentStep.targetQuantity) {
      if (quests.activeStepIndex < quest.objectives.length - 1) {
        quests.activeStepIndex += 1;
        quests.stepProgress = {};
      }
      // Last step completed; player turns in to quest.speakerId
    }
  }


  public talkToNpc(npcId: NpcId): {
    success: boolean;
    dialogue?: string[];
    isCompletion?: boolean;
    questCompleted?: boolean;
    rewardsGiven?: boolean;
    reason?: string;
  } {
    const { state, events } = this.context;
    if (state.player.activeMountId) {
      return { success: false, reason: "Dismount before talking to people" };
    }
    const npc = ContentRegistry.npcs.get(npcId);
    if (!npc) {
      return { success: false, reason: `Unknown NPC: '${npcId}'` };
    }

    if (distance2d(state.player, npc.anchor) > NPC_TALK_RADIUS) {
      return { success: false, reason: `Move closer to ${npc.name} to talk` };
    }

    // Resolution order across tracks: a thread this NPC can actually close
    // wins, then any thread they are currently speaking for, then their own
    // idle or milestone lines. Without the first pass a side track waiting on
    // the same NPC could hide a finished main-track turn-in behind its intro.
    const speakingTracks = activeQuestTrackIds(state.quests)
      .filter((trackId) => this.getActiveQuest(trackId)?.speakerId === npcId);
    const turnInTrackId = speakingTracks.find((trackId) => this.isQuestReadyToTurnIn(trackId));
    const activeQuest = this.getActiveQuest(turnInTrackId ?? speakingTracks[0] ?? state.quests.focusedTrackId);

    const intro = (): {
      success: true;
      dialogue: string[];
      isCompletion: false;
    } => ({
      success: true,
      dialogue: speakingTracks.length > 0 && activeQuest
        ? activeQuest.introDialogue
        : npc.idleDialogue,
      isCompletion: false
    });

    if (turnInTrackId && activeQuest) {
      events.emit("NpcTalked", { npcId, minute: state.clock.currentMinute });
      const completionDialogue = activeQuest.completionDialogue.length > 0
        ? activeQuest.completionDialogue
        : ["Thank you! Here is your reward."];
      const completion = this.completeQuest(activeQuest.id, npcId);
      if (!completion.success) return completion;
      return {
        success: true,
        dialogue: completionDialogue,
        isCompletion: true,
        questCompleted: true,
        rewardsGiven: true
      };
    }

    if (speakingTracks.length > 0) {
      events.emit("NpcTalked", { npcId, minute: state.clock.currentMinute });
      return intro();
    }

    events.emit("NpcTalked", { npcId, minute: state.clock.currentMinute });

    // 2. Idle dialogue when not on an active quest with this NPC
    return {
      success: true,
      dialogue: this.getMilestoneDialogue(npc),
      isCompletion: false
    };
  }

  /** Final objective met and any turn-in cost affordable. */
  private isQuestReadyToTurnIn(trackId: QuestTrackId): boolean {
    const quest = this.getActiveQuest(trackId);
    if (!quest) return false;
    const progress = questTrackProgress(this.context.state.quests, trackId);
    const finalIndex = quest.objectives.length - 1;
    if (progress.activeStepIndex !== finalIndex) return false;
    const finalStep = quest.objectives[finalIndex];
    if (!finalStep) return false;
    if ((progress.stepProgress[finalStep.id] ?? 0) < finalStep.targetQuantity) return false;
    return this.canPayQuestTurnIn(quest).success;
  }

  private getMilestoneDialogue(npc: NpcDefinition): string[] {
    const { state } = this.context;
    const matching = npc.recognitionDialogue?.filter((entry) =>
      (entry.requiresCompletedQuestIds ?? []).every((id) => state.quests.completedQuestIds.includes(id)) &&
      (entry.requiresFeatureIds ?? []).every((id) => state.quests.unlockedFeatureIds.includes(id)) &&
      (entry.requiresKnowledgeIds ?? []).every((id) => state.journal.unlockedKnowledge.includes(id)) &&
      (entry.requiresRankIndex === undefined
        || getRankForXp(state.player.proficiencies[entry.requiresRankIndex.skill] ?? 0).rankIndex
          >= entry.requiresRankIndex.rankIndex)
    );
    return matching?.at(-1)?.lines ?? npc.idleDialogue;
  }

  public completeQuest(questId: QuestId, turnInNpcId?: NpcId): InteractionResult {
    const { state, events } = this.context;
    const quest = ContentRegistry.quests.get(questId);
    if (!quest) {
      return { success: false, reason: "Quest definition not found" };
    }

    if (state.quests.completedQuestIds.includes(questId)) {
      return { success: false, reason: "Quest already completed" };
    }

    const progress = questTrackProgress(state.quests, quest.trackId);
    if (progress.activeQuestId !== questId) {
      return { success: false, reason: "This quest is not active" };
    }

    const finalStep = quest.objectives[quest.objectives.length - 1];
    if (
      progress.activeStepIndex !== quest.objectives.length - 1 ||
      !finalStep ||
      (progress.stepProgress[finalStep.id] ?? 0) < finalStep.targetQuantity
    ) {
      return { success: false, reason: "Complete the final objective first" };
    }

    const speaker = ContentRegistry.npcs.get(quest.speakerId);
    if (!turnInNpcId || turnInNpcId !== quest.speakerId || !speaker || distance2d(state.player, speaker.anchor) > NPC_TALK_RADIUS) {
      return { success: false, reason: `Return to ${speaker?.name ?? "the quest giver"} to turn this in` };
    }

    const turnIn = this.canPayQuestTurnIn(quest);
    if (!turnIn.success) return turnIn;

    const inventory = state.inventories[state.player.inventoryId];
    const costItems = quest.turnInCost?.items ?? [];
    const rewardItems = quest.rewards.items ?? [];
    const canFitRewards = rewardItems.length === 0 || (
      costItems.length > 0
        ? InventoryManager.canAddItemsAfterRemoving(inventory, costItems, rewardItems)
        : InventoryManager.canAddItems(inventory, rewardItems)
    );
    if (!canFitRewards) {
      return { success: false, reason: "The satchel has no room for this reward" };
    }

    this.consumeQuestTurnIn(quest);

    // Award Rewards
    this.distributeRewards(quest);

    state.quests.completedQuestIds.push(questId);

    // Commit the entire quest-state transition before publishing events so
    // persistence and presentation listeners can only observe a coherent
    // completed/current-quest pair.
    const transition = this.advanceToNextQuest(quest);

    events.emit("QuestCompleted", {
      questId: quest.id,
      actId: quest.actId,
      rewardMoney: quest.rewards.money,
      minute: state.clock.currentMinute
    });

    if (transition.completedActId) {
      events.emit("ActCompleted", {
        actId: transition.completedActId,
        minute: state.clock.currentMinute
      });
    }
    this.evaluateTrackUnlocks();

    if (transition.nextQuest) {
      events.emit("QuestStarted", {
        questId: transition.nextQuest.id,
        actId: transition.nextQuest.actId,
        minute: state.clock.currentMinute
      });
    }

    return {
      success: true,
      rewardMoney: quest.rewards.money
    };
  }

  private distributeRewards(quest: QuestDefinition): void {
    const { state } = this.context;

    // Coins
    if (quest.rewards.money && quest.rewards.money > 0) {
      state.player.money += quest.rewards.money;
    }

    // Items
    if (quest.rewards.items && quest.rewards.items.length > 0) {
      const playerInventory = state.inventories[state.player.inventoryId];
      InventoryManager.addItemsAtomically(playerInventory, quest.rewards.items);
    }

    // Skill XP
    if (quest.rewards.skillXp) {
      for (const { skill, xp } of quest.rewards.skillXp) {
        this.progressionDomain.addProficiencyXp(skill, xp);
      }
    }

    for (const featureId of quest.rewards.unlocksFeatureIds ?? []) {
      if (!state.quests.unlockedFeatureIds.includes(featureId)) {
        state.quests.unlockedFeatureIds.push(featureId);
      }
    }
    for (const knowledgeId of quest.rewards.unlocksKnowledgeIds ?? []) {
      const resolved = ContentRegistry.knowledge.has(knowledgeId)
        ? knowledgeId
        : ContentRegistry.knowledge.has(`knowledge.${knowledgeId}`)
          ? `knowledge.${knowledgeId}`
          : null;
      if (!resolved || state.journal.unlockedKnowledge.includes(resolved)) continue;
      state.journal.unlockedKnowledge.push(resolved);
    }
  }

  private advanceToNextQuest(completedQuest: QuestDefinition): {
    completedActId?: string;
    nextQuest?: QuestDefinition;
  } {
    const { state } = this.context;
    const nextQuest = completedQuest.nextQuestId
      ? ContentRegistry.quests.get(completedQuest.nextQuestId)
      : undefined;

    const trackId = completedQuest.trackId;
    const progress = questTrackProgress(state.quests, trackId);
    const isMainTrack = trackId === MAIN_QUEST_TRACK_ID;

    if (nextQuest) {
      const isNewAct = nextQuest.actId !== completedQuest.actId;

      if (isMainTrack) state.quests.activeActId = nextQuest.actId;
      progress.activeQuestId = nextQuest.id;
      progress.activeStepIndex = 0;
      progress.stepProgress = {};
      reconcileSatisfiedQuestObjectives(state, trackId);

      return {
        completedActId: isNewAct ? completedQuest.actId : undefined,
        nextQuest
      };
    }

    // This track is out of authored content. Only the spine running dry moves
    // the act to the epilogue; a finished side chain leaves it alone.
    progress.activeQuestId = null;
    progress.activeStepIndex = 0;
    progress.stepProgress = {};
    if (isMainTrack) state.quests.activeActId = "epilogue_open";
    this.refocusAfterTrackEnded(trackId);
    return { completedActId: completedQuest.actId };
  }

  /** Keep the tracker pointed at something the player can act on. */
  private refocusAfterTrackEnded(endedTrackId: QuestTrackId): void {
    const { quests } = this.context.state;
    if (quests.focusedTrackId !== endedTrackId) return;
    quests.focusedTrackId = activeQuestTrackIds(quests)[0] ?? MAIN_QUEST_TRACK_ID;
  }

  /** Point the tracker at a track the player is actually carrying. */
  public focusTrack(trackId: QuestTrackId): InteractionResult {
    const { quests } = this.context.state;
    if (!ContentRegistry.questTracks.has(trackId)) {
      return { success: false, reason: "Unknown quest track" };
    }
    if (!questTrackProgress(quests, trackId).activeQuestId) {
      return { success: false, reason: "That thread has nothing waiting" };
    }
    quests.focusedTrackId = trackId;
    return { success: true };
  }

  /**
   * Starts any track whose unlock predicate now holds. Called after the state
   * changes that can satisfy one, so a track opens the moment it is earned
   * rather than on the next save load.
   */
  public evaluateTrackUnlocks(): void {
    const { state, events } = this.context;
    const completed = new Set(state.quests.completedQuestIds);
    for (const track of ContentRegistry.questTracks.values()) {
      const progress = questTrackProgress(state.quests, track.id);
      if (progress.activeQuestId || completed.has(track.entryQuestId)) continue;
      const unlock = track.unlock;
      if (!unlock) continue;
      const satisfied =
        (unlock.requiresCompletedQuestIds ?? []).every((id) => completed.has(id))
        && (unlock.requiresFeatureIds ?? []).every((id) => state.quests.unlockedFeatureIds.includes(id))
        && (unlock.requiresKnowledgeIds ?? []).every((id) => state.journal.unlockedKnowledge.includes(id))
        && (unlock.requiresRank === undefined
          || getRankForXp(state.player.proficiencies[unlock.requiresRank.skill] ?? 0).rankIndex
            >= unlock.requiresRank.rankIndex);
      if (!satisfied) continue;
      const entry = ContentRegistry.quests.get(track.entryQuestId);
      if (!entry) continue;
      progress.activeQuestId = entry.id;
      progress.activeStepIndex = 0;
      progress.stepProgress = {};
      reconcileSatisfiedQuestObjectives(state, track.id);
      events.emit("QuestStarted", {
        questId: entry.id,
        actId: entry.actId,
        minute: state.clock.currentMinute
      });
    }
  }

  private canPayQuestTurnIn(quest: QuestDefinition): { success: boolean; reason?: string } {
    const { state } = this.context;
    const money = quest.turnInCost?.money ?? 0;
    if (state.player.money < money) return { success: false, reason: `You need ${money} G to finish this quest` };
    const items = quest.turnInCost?.items ?? [];
    if (items.length === 0) return { success: true };
    const inventory = state.inventories[state.player.inventoryId];
    if (!InventoryManager.hasItems(inventory, items)) {
      const requirement = items.map(({ itemId, quantity }) => {
        const name = ContentRegistry.items.get(itemId)?.name ?? itemId;
        return `${quantity} ${name}`;
      }).join(", ");
      return { success: false, reason: `Bring ${requirement} to finish this quest` };
    }
    return { success: true };
  }

  private consumeQuestTurnIn(quest: QuestDefinition): void {
    const { state } = this.context;
    const items = quest.turnInCost?.items ?? [];
    if (items.length > 0) {
      InventoryManager.removeItemsAtomically(state.inventories[state.player.inventoryId], items);
    }
    state.player.money -= quest.turnInCost?.money ?? 0;
  }


  public recordHintShown(hintId: string): void {
    this.context.state.quests.hintsShown[hintId] = true;
  }

  public isHintShown(hintId: string): boolean {
    return Boolean(this.context.state.quests.hintsShown[hintId]);
  }
}
