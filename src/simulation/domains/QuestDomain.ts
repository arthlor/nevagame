// src/simulation/domains/QuestDomain.ts

import { ContentRegistry } from "../../content/ContentRegistry";
import { getRankForXp } from "../../content/progression";
import type { NpcDefinition } from "../../content/npcs";
import { InventoryManager } from "../inventory/InventoryManager";
import type { DomainContext } from "./DomainContext";
import type { ProgressionDomain } from "./ProgressionDomain";
import {
  MAIN_QUEST_TRACK_ID,
  MAX_EARLY_ACTION_CREDIT_QUANTITY,
  MAX_EARLY_ACTION_CREDIT_RECORDS,
  activeQuestTrackIds,
  questEarlyActionCredits,
  questTrackProgress,
  sameEarlyActionShape,
  type ActiveQuestDto,
  type NpcId,
  type QuestDefinition,
  type QuestEarlyActionCredit,
  type QuestId,
  type QuestLocationRequirement,
  type QuestObjectiveDefinition,
  type QuestObjectiveType,
  type QuestTrackId
} from "../core/QuestTypes";
import type { InteractionResult } from "../core/contracts";
import type { GameState } from "../core/types";
import { distance2d } from "./DomainContext";

import { npcAnchorAt, npcRecognitionLines, NPC_TALK_RADIUS } from "../presentation/NpcPresentation";

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
      reconcileQuestCursors(state, track.id);
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
        // Rods live in ownedRodIds, not unlockedFeatureIds, and MarketDomain
        // refuses to sell one twice — so a player who bought the offshore rod
        // before Act 9 asked for it could never fire RodPurchased again and
        // the spine stopped dead one quest short of Act 10.
        || state.player.ownedRodIds.includes(objective.targetId)
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

/**
 * Whether an objective's declared gates accept an action of this shape.
 *
 * This is deliberately the same asymmetry `applyObjectiveEventToTrack` uses:
 * an undeclared `targetId` or `location` on the objective accepts anything,
 * a declared one must match exactly. Sharing the predicate is the correctness
 * argument for the ledger — a shape the live path would have rejected is a
 * shape the ledger will not bank, and a credit the ledger banked is a credit
 * the live path would have accepted.
 */
function objectiveAcceptsAction(
  objective: QuestObjectiveDefinition,
  type: QuestObjectiveType,
  targetId?: string,
  location?: ObjectiveEventLocation
): boolean {
  if (objective.type !== type) return false;
  if (objective.targetId !== undefined && objective.targetId !== targetId) return false;
  if (objective.location && (
    !location ||
    objective.location.kind !== location.kind ||
    objective.location.id !== location.id
  )) {
    return false;
  }
  return true;
}

/**
 * The opt-in objective, if any, that is still ahead of the player and would
 * accept this action. Returning `undefined` is what bounds the ledger: only
 * shapes some future tutorial step is actually watching are ever banked.
 */
function pendingEarlyActionObjective(
  state: GameState,
  type: QuestObjectiveType,
  targetId?: string,
  location?: ObjectiveEventLocation
): QuestObjectiveDefinition | undefined {
  const completed = new Set(state.quests.completedQuestIds);
  for (const quest of ContentRegistry.quests.values()) {
    if (completed.has(quest.id)) continue;
    const progress = Object.values(state.quests.tracks).find((track) => track.activeQuestId === quest.id);
    for (let index = 0; index < quest.objectives.length; index += 1) {
      const objective = quest.objectives[index];
      if (!objective.creditsEarlyActions) continue;
      // Already passed on the running quest — banking it would be a replay.
      if (progress && index < progress.activeStepIndex) continue;
      if (objectiveAcceptsAction(objective, type, targetId, location)) return objective;
    }
  }
  return undefined;
}

/** Credits matching an objective's gates, most-specific ordering irrelevant. */
function matchingCredits(
  credits: readonly QuestEarlyActionCredit[],
  objective: QuestObjectiveDefinition
): QuestEarlyActionCredit[] {
  return credits.filter((credit) =>
    objectiveAcceptsAction(objective, credit.type, credit.targetId, credit.location)
  );
}

/**
 * Applies banked early actions to whichever opt-in objective is now active,
 * advancing the cursor as each fills. Loops so one load can close a chain of
 * banked steps — a banked harvest set and a banked compost together carry the
 * cursor through both of Act 2's objectives.
 */
export function applyQuestEarlyActionCredits(
  state: GameState,
  trackId?: QuestTrackId,
  onProgress?: (progress: { questId: QuestId; stepId: string; current: number; total: number }) => void
): boolean {
  if (trackId === undefined) {
    let changed = false;
    for (const id of Object.keys(state.quests.tracks)) {
      if (applyQuestEarlyActionCredits(state, id, onProgress)) changed = true;
    }
    return changed;
  }

  const progress = questTrackProgress(state.quests, trackId);
  const quest = progress.activeQuestId ? ContentRegistry.quests.get(progress.activeQuestId) : undefined;
  if (!quest) return false;

  const credits = questEarlyActionCredits(state.quests);
  let changed = false;

  for (let guard = 0; guard <= quest.objectives.length; guard += 1) {
    const objective = quest.objectives[progress.activeStepIndex];
    if (!objective?.creditsEarlyActions) break;

    const need = objective.targetQuantity - (progress.stepProgress[objective.id] ?? 0);
    if (need <= 0) break;

    let spent = 0;
    for (const credit of matchingCredits(credits, objective)) {
      if (spent >= need) break;
      const take = Math.min(need - spent, credit.quantity);
      credit.quantity -= take;
      spent += take;
    }
    if (spent <= 0) break;

    for (let index = credits.length - 1; index >= 0; index -= 1) {
      if (credits[index].quantity <= 0) credits.splice(index, 1);
    }

    const current = Math.min(
      objective.targetQuantity,
      (progress.stepProgress[objective.id] ?? 0) + spent
    );
    progress.stepProgress[objective.id] = current;
    changed = true;
    onProgress?.({ questId: quest.id, stepId: objective.id, current, total: objective.targetQuantity });

    if (current < objective.targetQuantity) break;
    if (progress.activeStepIndex >= quest.objectives.length - 1) break;
    progress.activeStepIndex += 1;
    progress.stepProgress = {};
  }

  return changed;
}

/**
 * Drops credits no remaining objective is watching, so the ledger empties
 * after the tutorial rather than riding along in every later save.
 */
export function pruneQuestEarlyActionCredits(state: GameState): boolean {
  const credits = questEarlyActionCredits(state.quests);
  const kept = credits.filter((credit) =>
    pendingEarlyActionObjective(state, credit.type, credit.targetId, credit.location) !== undefined
  );
  if (kept.length === credits.length) return false;
  state.quests.earlyActionCredits = kept;
  return true;
}

/**
 * The full cursor repair: already-satisfied objectives, then banked early
 * actions, to a fixpoint, then prune. Safe to call at load, before the event
 * bus exists.
 */
export function reconcileQuestCursors(state: GameState, trackId?: QuestTrackId): boolean {
  let changed = false;
  for (let guard = 0; guard < 8; guard += 1) {
    let pass = false;
    if (reconcileSatisfiedQuestObjectives(state, trackId)) pass = true;
    if (applyQuestEarlyActionCredits(state, trackId)) pass = true;
    if (!pass) break;
    changed = true;
  }
  if (pruneQuestEarlyActionCredits(state)) changed = true;
  return changed;
}

export class QuestDomain {
  private unsubscribeEvents: Array<() => void> = [];
  /**
   * Objectives already credited by the world event being dispatched, keyed
   * `trackId:objectiveId`. See `worldEvent`.
   */
  private creditedThisWorldEvent: Set<string> | null = null;

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
      events.on("BasicFishingResolved", (e) => this.worldEvent(() => {
        if (e.catchItemId && e.reason !== "missed" && e.reason !== "escaped" && e.reason !== "cancelled") {
          this.onObjectiveEvent("catch-basic-fish", e.catchItemId, 1, { kind: "habitat", id: e.habitatId });
          this.onObjectiveEvent("catch-basic-fish", e.catchItemId, 1, { kind: "ecology", id: e.ecologyId });
          if (e.boatId) {
            this.onObjectiveEvent("catch-basic-fish", e.catchItemId, 1, { kind: "boat", id: e.boatId });
          }
        }
      })),
      events.on("FishSchoolChummed", (e) => this.worldEvent(() => {
        this.onObjectiveEvent("chum-school", undefined, 1, { kind: "habitat", id: e.habitatId });
        this.onObjectiveEvent("chum-school", undefined, 1, { kind: "ecology", id: e.ecologyId });
      })),
      events.on("FishHooked", (e) => this.worldEvent(() => {
        this.onObjectiveEvent("hook-sport-fish", e.speciesId, 1, { kind: "habitat", id: e.habitatId });
        this.onObjectiveEvent("hook-sport-fish", e.speciesId, 1, { kind: "ecology", id: e.ecologyId });
      })),
      events.on("FishLanded", (e) => this.worldEvent(() => {
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
      })),
      events.on("CargoLoaded", (e) => this.onObjectiveEvent("stow-cargo", undefined, 1, { kind: "boat", id: e.boatId })),
      events.on("BoatBoarded", (e) => this.onObjectiveEvent("board-boat", e.boatId, 1, { kind: "boat", id: e.boatId })),
      events.on("BoatDocked", (e) => this.worldEvent(() => {
        this.onObjectiveEvent("dock-boat", e.boatId, 1, { kind: "boat", id: e.boatId });
        this.onObjectiveEvent("dock-boat", e.boatId, 1, { kind: "market", id: e.marketId });
      })),
      events.on("ItemSold", (e) => this.onObjectiveEvent("sell-item", e.itemId, e.quantity, { kind: "market", id: e.marketId })),
      events.on("FishSold", (e) => this.onObjectiveEvent("sell-fish", e.speciesId, 1, { kind: "market", id: e.marketId })),
      events.on("ContractCompleted", (e) => this.worldEvent(() => {
        this.onObjectiveEvent("complete-contract", e.templateId, 1);
        // Also by type, so a quest can ask for "any bulk order" rather than
        // one template the board may not roll for a long time.
        if (e.contractType !== e.templateId) this.onObjectiveEvent("complete-contract", e.contractType, 1);
      })),
      events.on("FarmFertilized", (e) => this.onObjectiveEvent("apply-fertilizer", e.farmId, 1, { kind: "farm", id: e.farmId })),
      events.on("IrrigationInstalled", (e) => this.onObjectiveEvent("install-irrigation", e.featureId, 1, { kind: "farm", id: e.farmId })),
      events.on("FarmIrrigated", (e) => this.onObjectiveEvent("irrigate-farm", e.farmId, 1, { kind: "farm", id: e.farmId })),
      events.on("RodPurchased", (e) => this.onPurchaseUpgrade([e.rodId])),
      events.on("BoatPurchased", (e) => this.onPurchaseUpgrade([e.boatTypeId, e.boatId])),
      events.on("NpcTalked", (e) => this.onObjectiveEvent("talk-npc", e.npcId, 1)),
      events.on("ProficiencyLeveledUp", () => this.evaluateTrackUnlocks())
    );
  }

  /**
   * Scopes one world event's whole fan-out. Several of the events below offer
   * the same happening under more than one candidate location — a basic catch
   * arrives as habitat, ecology and boat; a contract as its template id and its
   * type — so that an objective can pin down *where* it must happen. An
   * objective that declares no location matched every one of those and counted
   * a single catch two or three times, which silently halved any such step
   * whose `targetQuantity` was above 1.
   *
   * Crediting each objective at most once per world event fixes that while
   * keeping the authored cascade: a fan-out whose later candidate lands on the
   * *next* step still advances it, which is how one skiff-side catch closes
   * both Act 7 bream steps and a shore landing closes Act 5's land and stow.
   */
  private worldEvent(dispatch: () => void): void {
    const outer = this.creditedThisWorldEvent;
    this.creditedThisWorldEvent = new Set<string>();
    try {
      dispatch();
    } finally {
      this.creditedThisWorldEvent = outer;
    }
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
    const turnIn = awaitingTurnIn ? this.canSettleQuestTurnIn(quest) : null;
    const isQuestReadyToTurnIn = Boolean(awaitingTurnIn && turnIn?.success);

    const speaker = ContentRegistry.npcs.get(quest.speakerId);
    const speakerName = speaker?.name ?? "Townsperson";

    const targetNpcId = awaitingTurnIn ? speaker?.id
      : objective.type === "talk-npc" ? objective.targetId : undefined;
    const targetAnchor = targetNpcId ? npcAnchorAt(targetNpcId, this.context.state.clock, this.context.state.quests) : undefined;

    // Once the errand is ready to hand in, the target becomes the speaker; while
    // it is still blocked there is nowhere useful to point.
    const targetLocation = awaitingTurnIn && speaker
      ? turnIn?.success
        ? { x: targetAnchor!.x, z: targetAnchor!.z, name: targetAnchor!.locationName }
        : undefined
      : targetAnchor
        ? { x: targetAnchor.x, z: targetAnchor.z, name: targetAnchor.locationName }
        : objective.locationAnchor;

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
        : objective.type === "talk-npc" && targetAnchor && targetNpcId
          ? `Speak with ${ContentRegistry.npcs.get(targetNpcId)!.name} at the ${targetAnchor.locationName}`
          : objective.description,
      objectiveType: objective.type,
      objectiveTargetId: objective.targetId,
      currentProgress,
      targetQuantity: objective.targetQuantity,
      isStepComplete,
      isQuestReadyToTurnIn,
      turnInBlockerReason: awaitingTurnIn && !turnIn?.success ? turnIn?.reason : undefined,
      targetLocation,
      targetDistanceMeters: targetLocation
        ? Math.hypot(
            targetLocation.x - this.context.state.player.x,
            targetLocation.z - this.context.state.player.z
          )
        : undefined,
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
    let credited = false;
    for (const trackId of activeQuestTrackIds(this.context.state.quests)) {
      if (this.applyObjectiveEventToTrack(trackId, type, targetId, amount, location)) credited = true;
    }
    // Nothing wanted it now, but a tutorial step ahead of the player might.
    if (!credited) this.bankEarlyActionCredit(type, targetId, amount, location);
  }

  /**
   * Banks an action no active objective accepted, so a player who works ahead
   * of the tutorial is credited when the step finally activates rather than
   * being asked to repeat an action the world may no longer allow.
   */
  private bankEarlyActionCredit(
    type: QuestObjectiveType,
    targetId?: string,
    amount: number = 1,
    location?: ObjectiveEventLocation
  ): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const watched = pendingEarlyActionObjective(this.context.state, type, targetId, location);
    if (!watched) return;

    const bankKey = `credit:${type}:${targetId ?? ""}:${location?.kind ?? ""}:${location?.id ?? ""}`;
    if (this.creditedThisWorldEvent?.has(bankKey)) return;
    this.creditedThisWorldEvent?.add(bankKey);

    const credits = questEarlyActionCredits(this.context.state.quests);
    const shape: QuestEarlyActionCredit = { type, targetId, location, quantity: 0 };
    const cap = Math.min(MAX_EARLY_ACTION_CREDIT_QUANTITY, watched.targetQuantity);
    const existing = credits.find((credit) => sameEarlyActionShape(credit, shape));
    if (existing) {
      existing.quantity = Math.min(cap, existing.quantity + amount);
      return;
    }
    if (credits.length >= MAX_EARLY_ACTION_CREDIT_RECORDS) return;
    credits.push({ type, targetId, location, quantity: Math.min(cap, amount) });
  }

  /**
   * Redeems banked actions against the step that just became active. Must run
   * *after* `stepProgress` is cleared on advance, or the credit is written into
   * a map that is about to be discarded.
   */
  private creditNewlyActiveStep(trackId: QuestTrackId): void {
    applyQuestEarlyActionCredits(this.context.state, trackId, (progress) => {
      this.context.events.emit("QuestProgressed", {
        ...progress,
        minute: this.context.state.clock.currentMinute
      });
    });
  }

  /** @returns whether this event was written into the track's progress. */
  private applyObjectiveEventToTrack(
    trackId: QuestTrackId,
    type: QuestObjectiveType,
    targetId?: string,
    amount: number = 1,
    location?: ObjectiveEventLocation
  ): boolean {
    const quest = this.getActiveQuest(trackId);
    if (!quest) return false;

    const quests = questTrackProgress(this.context.state.quests, trackId);

    const currentStep = quest.objectives[quests.activeStepIndex];
    if (!currentStep) return false;

    if (!objectiveAcceptsAction(currentStep, type, targetId, location)) return false;
    if (!Number.isFinite(amount) || amount <= 0) return false;

    const previous = quests.stepProgress[currentStep.id] ?? 0;
    if (previous >= currentStep.targetQuantity) return false;

    const creditKey = `${trackId}:${currentStep.id}`;
    if (this.creditedThisWorldEvent?.has(creditKey)) return false;
    this.creditedThisWorldEvent?.add(creditKey);

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
        // Strictly after the clear: the new step may already be paid for.
        this.creditNewlyActiveStep(trackId);
      }
      // Last step completed; player turns in to quest.speakerId
    }
    return true;
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

    if (distance2d(state.player, npcAnchorAt(npcId, state.clock, state.quests)) > NPC_TALK_RADIUS) {
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
    return npcRecognitionLines(npc, this.context.state);
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
    if (!turnInNpcId || turnInNpcId !== quest.speakerId || !speaker || distance2d(state.player, npcAnchorAt(speaker.id, state.clock, state.quests)) > NPC_TALK_RADIUS) {
      return { success: false, reason: `Return to ${speaker?.name ?? "the quest giver"} to turn this in` };
    }

    const turnIn = this.canSettleQuestTurnIn(quest);
    if (!turnIn.success) return turnIn;

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
      reconcileQuestCursors(state, trackId);

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
      reconcileQuestCursors(state, track.id);
      events.emit("QuestStarted", {
        questId: entry.id,
        actId: entry.actId,
        minute: state.clock.currentMinute
      });
    }
  }

  /** Whether the turn-in *cost* is payable. Does not consider reward room. */
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

  /**
   * Everything that has to hold for a hand-in to actually settle: the cost is
   * payable *and* the reward fits. The tracker reads this rather than the cost
   * alone, so it can no longer show "Ready" for a turn-in that `completeQuest`
   * will refuse for want of satchel room. `talkToNpc` still routes on the cost
   * alone, so a player who walks up with a full satchel is told why instead of
   * being handed the intro line a second time.
   */
  private canSettleQuestTurnIn(quest: QuestDefinition): { success: boolean; reason?: string } {
    const payable = this.canPayQuestTurnIn(quest);
    if (!payable.success) return payable;
    const rewardItems = quest.rewards.items ?? [];
    if (rewardItems.length === 0) return { success: true };
    const inventory = this.context.state.inventories[this.context.state.player.inventoryId];
    const costItems = quest.turnInCost?.items ?? [];
    const rewardFits = costItems.length > 0
      ? InventoryManager.canAddItemsAfterRemoving(inventory, costItems, rewardItems)
      : InventoryManager.canAddItems(inventory, rewardItems);
    return rewardFits
      ? { success: true }
      : { success: false, reason: "The satchel has no room for this reward" };
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
