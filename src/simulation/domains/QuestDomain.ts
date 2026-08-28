// src/simulation/domains/QuestDomain.ts

import { ContentRegistry } from "../../content/ContentRegistry";
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
import { distance2d } from "./DomainContext";

const NPC_TALK_RADIUS = 3.5;

type ObjectiveEventLocation = QuestLocationRequirement;

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
        }
      }),
      events.on("FishSchoolChummed", (e) => this.onObjectiveEvent("chum-school", undefined, 1, { kind: "habitat", id: e.habitatId })),
      events.on("FishHooked", (e) => this.onObjectiveEvent("hook-sport-fish", e.speciesId, 1, { kind: "habitat", id: e.habitatId })),
      events.on("FishLanded", (e) => {
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
      events.on("BoatDocked", (e) => this.onObjectiveEvent("dock-boat", e.boatId, 1, { kind: "boat", id: e.boatId })),
      events.on("ItemSold", (e) => this.onObjectiveEvent("sell-item", e.itemId, e.quantity, { kind: "market", id: e.marketId })),
      events.on("FishSold", (e) => this.onObjectiveEvent("sell-fish", e.speciesId, 1, { kind: "market", id: e.marketId })),
      events.on("NpcTalked", (e) => this.onObjectiveEvent("talk-npc", e.npcId, 1))
    );
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
    const isQuestReadyToTurnIn = awaitingTurnIn && this.canPayQuestTurnIn(quest).success;

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
        ? `Talk to ${speakerName} to continue`
        : objective.description,
      currentProgress,
      targetQuantity: objective.targetQuantity,
      isStepComplete,
      isQuestReadyToTurnIn,
      targetLocation: awaitingTurnIn && speaker
        ? { x: speaker.anchor.x, z: speaker.anchor.z, name: speaker.anchor.locationName }
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

    if (activeQuest?.id === "quest.act4_restore_rowboat" && activeQuest.speakerId === npcId) {
      const turnIn = this.canPayQuestTurnIn(activeQuest);
      if (!turnIn.success) return turnIn;
    }

    events.emit("NpcTalked", { npcId, minute: state.clock.currentMinute });

    // 1. Is active quest ready to complete and talking to the speaker?
    if (activeQuest && activeQuest.speakerId === npcId) {
      const currentStep = activeQuest.objectives[state.quests.activeStepIndex];
      const isLastStep = state.quests.activeStepIndex === activeQuest.objectives.length - 1;
      const progress = currentStep ? (state.quests.stepProgress[currentStep.id] ?? 0) : 0;
      const isCurrentStepDone = currentStep ? progress >= currentStep.targetQuantity : true;

      if (isLastStep && isCurrentStepDone) {
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

      // Initial greeting / active instruction
      return {
        success: true,
        dialogue: activeQuest.introDialogue,
        isCompletion: false
      };
    }

    // 2. Idle dialogue when not on an active quest with this NPC
    return {
      success: true,
      dialogue: npc.idleDialogue,
      isCompletion: false
    };
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
    if (quest.rewards.items && !InventoryManager.canAddItems(inventory, quest.rewards.items)) {
      return { success: false, reason: "Your backpack is full for this reward" };
    }

    this.consumeQuestTurnIn(quest);

    // Award Rewards
    this.distributeRewards(quest);

    state.quests.completedQuestIds.push(questId);

    events.emit("QuestCompleted", {
      questId: quest.id,
      actId: quest.actId,
      rewardMoney: quest.rewards.money,
      minute: state.clock.currentMinute
    });

    // Advance to next quest
    this.advanceToNextQuest(quest);

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

    // Feature / Journal Unlocks
    if (quest.rewards.unlocksFeature) {
      if (!state.quests.unlockedFeatureIds.includes(quest.rewards.unlocksFeature)) {
        state.quests.unlockedFeatureIds.push(quest.rewards.unlocksFeature);
      }
      if (!state.journal.unlockedKnowledge.includes(quest.rewards.unlocksFeature)) {
        state.journal.unlockedKnowledge.push(quest.rewards.unlocksFeature);
      }
    }
  }

  private advanceToNextQuest(completedQuest: QuestDefinition): void {
    const { state, events } = this.context;
    const nextQuest = completedQuest.nextQuestId
      ? ContentRegistry.quests.get(completedQuest.nextQuestId)
      : undefined;

    if (nextQuest) {
      const isNewAct = nextQuest.actId !== completedQuest.actId;

      state.quests.activeActId = nextQuest.actId;
      state.quests.activeQuestId = nextQuest.id;
      state.quests.activeStepIndex = 0;
      state.quests.stepProgress = {};

      if (isNewAct) {
        events.emit("ActCompleted", { actId: completedQuest.actId, minute: state.clock.currentMinute });
      }

      events.emit("QuestStarted", {
        questId: nextQuest.id,
        actId: nextQuest.actId,
        minute: state.clock.currentMinute
      });
    } else {
      // All story quests completed -> Epilogue
      state.quests.activeActId = "epilogue_open";
      state.quests.activeQuestId = null;
      state.quests.activeStepIndex = 0;
      state.quests.stepProgress = {};
      events.emit("ActCompleted", { actId: completedQuest.actId, minute: state.clock.currentMinute });
    }
  }

  private canPayQuestTurnIn(quest: QuestDefinition): { success: boolean; reason?: string } {
    if (quest.id !== "quest.act4_restore_rowboat") return { success: true };
    const { state } = this.context;
    if (state.player.money < 30) return { success: false, reason: "You need 30 G for the harbor permit" };
    const inventory = state.inventories[state.player.inventoryId];
    if (!InventoryManager.hasItems(inventory, [{ itemId: "item.ground_grain", quantity: 1 }])) {
      return { success: false, reason: "Bring 1 Ground Grain for the rowboat grease" };
    }
    return { success: true };
  }

  private consumeQuestTurnIn(quest: QuestDefinition): void {
    if (quest.id !== "quest.act4_restore_rowboat") return;
    const { state } = this.context;
    const inventory = state.inventories[state.player.inventoryId];
    InventoryManager.removeItemsAtomically(inventory, [{ itemId: "item.ground_grain", quantity: 1 }]);
    state.player.money -= 30;
  }


  public recordHintShown(hintId: string): void {
    this.context.state.quests.hintsShown[hintId] = true;
  }

  public isHintShown(hintId: string): boolean {
    return Boolean(this.context.state.quests.hintsShown[hintId]);
  }
}
