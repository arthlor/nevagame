// src/simulation/domains/QuestDomain.ts

import { ContentRegistry } from "../../content/ContentRegistry";
import type { NpcDefinition } from "../../content/npcs";
import { InventoryManager } from "../inventory/InventoryManager";
import type { DomainContext } from "./DomainContext";
import type { ProgressionDomain } from "./ProgressionDomain";
import type {
  ActiveQuestDto,
  NpcId,
  QuestDefinition,
  QuestId,
  QuestLocationRequirement,
  QuestObjectiveType
} from "../core/QuestTypes";
import type { InteractionResult } from "../core/contracts";
import type { GameState } from "../core/types";
import { distance2d } from "./DomainContext";

const NPC_TALK_RADIUS = 3.5;

type ObjectiveEventLocation = QuestLocationRequirement;

/**
 * Content-chain reconciliation for saves that reached the former epilogue.
 * It activates newly appended authored content without replaying any reward.
 */
export function reconcileInactiveQuestChain(state: GameState): boolean {
  if (state.quests.activeQuestId !== null) return false;
  const completed = new Set(state.quests.completedQuestIds);
  for (let index = state.quests.completedQuestIds.length - 1; index >= 0; index -= 1) {
    const completedQuest = ContentRegistry.quests.get(state.quests.completedQuestIds[index]);
    const nextQuest = completedQuest?.nextQuestId
      ? ContentRegistry.quests.get(completedQuest.nextQuestId)
      : undefined;
    if (!nextQuest || completed.has(nextQuest.id)) continue;
    state.quests.activeActId = nextQuest.actId;
    state.quests.activeQuestId = nextQuest.id;
    state.quests.activeStepIndex = 0;
    state.quests.stepProgress = {};
    reconcileSatisfiedQuestObjectives(state);
    return true;
  }
  return false;
}

export function reconcileSatisfiedQuestObjectives(state: GameState): boolean {
  const quest = state.quests.activeQuestId
    ? ContentRegistry.quests.get(state.quests.activeQuestId)
    : undefined;
  if (!quest) return false;
  let changed = false;
  while (state.quests.activeStepIndex < quest.objectives.length) {
    const objective = quest.objectives[state.quests.activeStepIndex];
    if (!objective?.targetId) break;
    const alreadySatisfied =
      (objective.type === "install-irrigation" && state.quests.unlockedFeatureIds.includes(objective.targetId))
      || (objective.type === "purchase-upgrade" && (
        state.quests.unlockedFeatureIds.includes(objective.targetId)
        || Object.values(state.boats).some((boat) => boat.id === objective.targetId || boat.boatTypeId === objective.targetId)
      ));
    if (!alreadySatisfied) break;
    state.quests.stepProgress[objective.id] = objective.targetQuantity;
    changed = true;
    if (state.quests.activeStepIndex >= quest.objectives.length - 1) break;
    state.quests.activeStepIndex += 1;
    state.quests.stepProgress = {};
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
      events.on("ContractCompleted", (e) => this.onObjectiveEvent("complete-contract", e.templateId, 1)),
      events.on("FarmFertilized", (e) => this.onObjectiveEvent("apply-fertilizer", e.farmId, 1, { kind: "farm", id: e.farmId })),
      events.on("IrrigationInstalled", (e) => this.onObjectiveEvent("install-irrigation", e.featureId, 1, { kind: "farm", id: e.farmId })),
      events.on("FarmIrrigated", (e) => this.onObjectiveEvent("irrigate-farm", e.farmId, 1, { kind: "farm", id: e.farmId })),
      events.on("RodPurchased", (e) => this.onPurchaseUpgrade([e.rodId])),
      events.on("BoatPurchased", (e) => this.onPurchaseUpgrade([e.boatTypeId, e.boatId])),
      events.on("NpcTalked", (e) => this.onObjectiveEvent("talk-npc", e.npcId, 1))
    );
  }

  private onPurchaseUpgrade(targetIds: string[]): void {
    const objective = this.getActiveQuest()?.objectives[this.context.state.quests.activeStepIndex];
    if (!objective || objective.type !== "purchase-upgrade") return;
    const targetId = objective.targetId
      ? targetIds.find((candidate) => candidate === objective.targetId)
      : targetIds[0];
    if (!targetId) return;
    this.onObjectiveEvent("purchase-upgrade", targetId, 1);
  }

  public dispose(): void {
    for (const unsubscribe of this.unsubscribeEvents) {
      unsubscribe();
    }
    this.unsubscribeEvents = [];
  }

  public getActiveQuest(): QuestDefinition | null {
    const { quests } = this.context.state;
    if (!quests.activeQuestId) return null;
    return ContentRegistry.quests.get(quests.activeQuestId) ?? null;
  }

  public getActiveQuestDto(): ActiveQuestDto | null {
    const quest = this.getActiveQuest();
    if (!quest) return null;

    const { quests } = this.context.state;
    const stepIndex = Math.min(quests.activeStepIndex, quest.objectives.length - 1);
    const objective = quest.objectives[stepIndex];
    if (!objective) return null;

    const currentProgress = quests.stepProgress[objective.id] ?? 0;
    const isStepComplete = currentProgress >= objective.targetQuantity;
    const isLastStep = stepIndex === quest.objectives.length - 1
      || quests.activeStepIndex >= quest.objectives.length;
    const awaitingTurnIn = isLastStep && isStepComplete;
    const turnIn = awaitingTurnIn ? this.canPayQuestTurnIn(quest) : null;
    const isQuestReadyToTurnIn = Boolean(awaitingTurnIn && turnIn?.success);

    const speaker = ContentRegistry.npcs.get(quest.speakerId);
    const speakerName = speaker?.name ?? "Townsperson";

    return {
      questId: quest.id,
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
    const quest = this.getActiveQuest();
    if (!quest) return;

    const { quests } = this.context.state;

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

    const activeQuest = this.getActiveQuest();

    if (distance2d(state.player, npc.anchor) > NPC_TALK_RADIUS) {
      return { success: false, reason: `Move closer to ${npc.name} to talk` };
    }

    const intro = (): {
      success: true;
      dialogue: string[];
      isCompletion: false;
    } => ({
      success: true,
      dialogue: activeQuest?.introDialogue ?? npc.idleDialogue,
      isCompletion: false
    });

    // 1. Is active quest ready to complete and talking to the speaker?
    if (activeQuest && activeQuest.speakerId === npcId) {
      const currentStep = activeQuest.objectives[state.quests.activeStepIndex];
      const isLastStep = state.quests.activeStepIndex === activeQuest.objectives.length - 1;
      const progress = currentStep ? (state.quests.stepProgress[currentStep.id] ?? 0) : 0;
      const wasStepDone = currentStep ? progress >= currentStep.targetQuantity : true;

      if (isLastStep && wasStepDone) {
        const turnIn = this.canPayQuestTurnIn(activeQuest);
        if (!turnIn.success) return intro();

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

  private getMilestoneDialogue(npc: NpcDefinition): string[] {
    const { state } = this.context;
    const matching = npc.recognitionDialogue?.filter((entry) =>
      (entry.requiresCompletedQuestIds ?? []).every((id) => state.quests.completedQuestIds.includes(id)) &&
      (entry.requiresFeatureIds ?? []).every((id) => state.quests.unlockedFeatureIds.includes(id)) &&
      (entry.requiresKnowledgeIds ?? []).every((id) => state.journal.unlockedKnowledge.includes(id))
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

    if (state.quests.activeQuestId !== questId) {
      return { success: false, reason: "This quest is not active" };
    }

    const finalStep = quest.objectives[quest.objectives.length - 1];
    if (
      state.quests.activeStepIndex !== quest.objectives.length - 1 ||
      !finalStep ||
      (state.quests.stepProgress[finalStep.id] ?? 0) < finalStep.targetQuantity
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

    if (nextQuest) {
      const isNewAct = nextQuest.actId !== completedQuest.actId;

      state.quests.activeActId = nextQuest.actId;
      state.quests.activeQuestId = nextQuest.id;
      state.quests.activeStepIndex = 0;
      state.quests.stepProgress = {};
      reconcileSatisfiedQuestObjectives(state);

      return {
        completedActId: isNewAct ? completedQuest.actId : undefined,
        nextQuest
      };
    }

    // All story quests completed -> Epilogue
    state.quests.activeActId = "epilogue_open";
    state.quests.activeQuestId = null;
    state.quests.activeStepIndex = 0;
    state.quests.stepProgress = {};
    return { completedActId: completedQuest.actId };
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
