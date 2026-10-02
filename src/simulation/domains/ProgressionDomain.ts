import type { DomainEvents } from "../core/EventBus";
import { contractSlotsForRank, getNextRank, getRankForXp, PROFICIENCY_RANKS } from "../../content/progression";
import { ContentRegistry } from "../../content/ContentRegistry";
import { MINUTES_PER_DAY } from "../core/GameClock";
import type { GameMinute, SkillId, WorkActionId, WorkCapacityState } from "../core/types";
import type { SkillProgressDto, WorkCostQuote } from "../core/contracts";
import type { DomainContext } from "./DomainContext";
import { equipmentWorkMultiplier } from "../equipment/EquipmentEffects";

/** Work is a production budget with real-time recovery and bounded earned boosts. */
/** Canonical Work pool ceiling. Saves below this ceiling are raised without refilling current. */
export const WORK_CAPACITY_MAXIMUM = 750;
/** Maximum Work a player can earn from meals, labor and skill in one day. */
export const WORK_DAILY_EARN_CAP = 300;
/** A night's rest restores this share of the ceiling, plus a baseline floor. */
export const WORK_REST_FRACTION = 0.1;
/** Waking never leaves the pool below this share of the ceiling. */
export const WORK_REST_BASELINE_FRACTION = 0.4;
/** Meals that restore Work per calendar day. */
export const WORK_MEAL_DAILY_LIMIT = 3;
/** Online recovery, including pause/background time while the ready game remains open. */
export const WORK_PASSIVE_REGEN_AMOUNT = 10;
/** Closed-game recovery uses its own saved interval remainder. */
export const WORK_OFFLINE_REGEN_AMOUNT = 5;
export const WORK_PASSIVE_REGEN_INTERVAL_SECONDS = 300;

function discardRecoveryAtCeiling(workCapacity: WorkCapacityState): void {
  if (workCapacity.current < workCapacity.maximum) return;
  workCapacity.passiveRegenSeconds = 0;
  workCapacity.offlineRegenSeconds = 0;
}

export function workEarningsDayFor(minute: GameMinute): number {
  return Math.floor(minute / MINUTES_PER_DAY);
}

/** Resets the daily earning tallies when the calendar day rolls over. */
export function rollWorkEarnings(workCapacity: WorkCapacityState, day: number): void {
  if (workCapacity.earningsDay === day) return;
  workCapacity.earningsDay = day;
  workCapacity.earnedToday = 0;
  workCapacity.mealsToday = 0;
  workCapacity.laborUsedToday = [];
}

/** Preview an earned boost using the current calendar cap and pool room. */
export function quoteEarnWorkCapacity(
  workCapacity: WorkCapacityState,
  amount: number,
  currentMinute: GameMinute
): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const earned = workCapacity.earningsDay === workEarningsDayFor(currentMinute)
    ? workCapacity.earnedToday ?? 0 : 0;
  return Math.min(
    amount,
    Math.max(0, WORK_DAILY_EARN_CAP - earned),
    Math.max(0, workCapacity.maximum - workCapacity.current)
  );
}

/** Grants a capped earned boost and records only the amount actually received. */
export function earnWorkCapacity(
  workCapacity: WorkCapacityState,
  amount: number,
  currentMinute: GameMinute
): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const day = workEarningsDayFor(currentMinute);
  rollWorkEarnings(workCapacity, day);
  const earned = workCapacity.earnedToday ?? 0;
  const granted = quoteEarnWorkCapacity(workCapacity, amount, currentMinute);
  if (granted <= 0) return 0;
  workCapacity.current += granted;
  discardRecoveryAtCeiling(workCapacity);
  workCapacity.earnedToday = earned + granted;
  workCapacity.regeneratedAtMinute = currentMinute;
  return granted;
}

/**
 * A night's rest. Bypasses the daily earn cap (it is the baseline floor every
 * day is entitled to) but still cannot exceed the ceiling.
 */
export function restoreWorkOnRest(
  workCapacity: WorkCapacityState,
  currentMinute: GameMinute
): number {
  const fractionGain = Math.round(workCapacity.maximum * WORK_REST_FRACTION);
  const baseline = Math.round(workCapacity.maximum * WORK_REST_BASELINE_FRACTION);
  const target = Math.max(workCapacity.current + fractionGain, baseline);
  const granted = Math.min(workCapacity.maximum, target) - workCapacity.current;
  if (granted > 0) {
    workCapacity.current += granted;
    discardRecoveryAtCeiling(workCapacity);
    workCapacity.regeneratedAtMinute = currentMinute;
  }
  rollWorkEarnings(workCapacity, workEarningsDayFor(currentMinute));
  return granted;
}

export function getProficiencyWorkDiscount(rankIndex: number): number {
  return Math.round(Math.min(0.35, Math.max(0, rankIndex * 0.05)) * 100) / 100;
}

const RANK_UNLOCK_KEY: Record<SkillId, "farmingUnlocks" | "fishingUnlocks" | "processingUnlocks" | "tradingUnlocks"> = {
  farming: "farmingUnlocks",
  fishing: "fishingUnlocks",
  processing: "processingUnlocks",
  trading: "tradingUnlocks"
};

function rankUnlockName(id: string): string {
  const content = ContentRegistry.crops.get(id)
    ?? ContentRegistry.rods.get(id)
    ?? ContentRegistry.markets.get(id)
    ?? ContentRegistry.recipes.get(id)
    ?? ContentRegistry.boats.get(id)
    ?? [...ContentRegistry.boats.values()].find((boat) => boat.id === id);
  return content?.name ?? id.replace(/^[a-z]+\./, "").replace(/[-_]/g, " ");
}

/** Derive rank copy from the same gates and slot formula used by the simulation. */
function rankBenefits(skill: SkillId, rankIndex: number, hasGuildCharter: boolean): string[] {
  const rank = PROFICIENCY_RANKS[rankIndex];
  if (!rank) return [];
  const benefits = rank[RANK_UNLOCK_KEY[skill]].map(rankUnlockName);
  if (skill === "trading") {
    const slots = contractSlotsForRank(rankIndex, hasGuildCharter);
    const previousSlots = rankIndex > 0 ? contractSlotsForRank(rankIndex - 1, hasGuildCharter) : 0;
    if (slots > previousSlots) benefits.push(`${slots} contract offers at once`);
  } else if (rankIndex > 0) {
    benefits.push(`${Math.round(getProficiencyWorkDiscount(rankIndex) * 100)}% less ${skill} Work`);
  }
  return benefits;
}

/**
 * Real-time recovery is exempt from the earned-boost cap. Online and offline
 * partial intervals persist separately, so switching modes cannot complete a
 * cheaper interval at the higher rate. Reaching the ceiling discards both
 * remainders: time spent full never banks recovery for a later spend.
 */
function applyTimedWorkRegen(
  workCapacity: WorkCapacityState,
  realSeconds: number,
  remainderKey: "passiveRegenSeconds" | "offlineRegenSeconds",
  amount: number
): number {
  if (!Number.isFinite(realSeconds) || realSeconds <= 0) return 0;
  if (workCapacity.current >= workCapacity.maximum) {
    discardRecoveryAtCeiling(workCapacity);
    return 0;
  }
  const accrued = (workCapacity[remainderKey] ?? 0) + realSeconds;
  const steps = Math.floor(accrued / WORK_PASSIVE_REGEN_INTERVAL_SECONDS);
  workCapacity[remainderKey] = accrued - steps * WORK_PASSIVE_REGEN_INTERVAL_SECONDS;
  if (steps <= 0) return 0;
  const requested = steps * amount;
  const room = Math.max(0, workCapacity.maximum - workCapacity.current);
  const granted = Math.min(requested, room);
  if (granted <= 0) return 0;
  workCapacity.current += granted;
  discardRecoveryAtCeiling(workCapacity);
  return granted;
}

export function applyPassiveWorkRegen(workCapacity: WorkCapacityState, realSeconds: number): number {
  return applyTimedWorkRegen(workCapacity, realSeconds, "passiveRegenSeconds", WORK_PASSIVE_REGEN_AMOUNT);
}

export function applyOfflineWorkRegen(workCapacity: WorkCapacityState, realSeconds: number): number {
  return applyTimedWorkRegen(workCapacity, realSeconds, "offlineRegenSeconds", WORK_OFFLINE_REGEN_AMOUNT);
}

export class ProgressionDomain {
  constructor(private readonly context: DomainContext) {}

  public inspectSkills(): SkillProgressDto[] {
    const hasGuildCharter = this.context.state.quests.unlockedFeatureIds.includes("feature.maritime_guild_charter");
    return (Object.entries(this.context.state.player.proficiencies) as Array<[SkillId, number]>).map(([skill, xp]) => {
      const current = getRankForXp(xp);
      const next = getNextRank(xp);
      const span = next ? Math.max(1, next.xpRequired - current.xpRequired) : 1;
      return {
        skill,
        label: skill.charAt(0).toUpperCase() + skill.slice(1),
        xp,
        rankName: current.rankName,
        progressPercent: next
          ? Math.max(0, Math.min(100, ((xp - current.xpRequired) / span) * 100))
          : 100,
        nextXp: next?.xpRequired ?? null,
        nextRankName: next?.rankName ?? null,
        currentRankBenefits: rankBenefits(skill, current.rankIndex, hasGuildCharter),
        nextRankBenefits: next ? rankBenefits(skill, next.rankIndex, hasGuildCharter) : []
      };
    });
  }

  public getProficiencyLevel(skill: SkillId): number {
    const xp = this.context.state.player.proficiencies[skill] ?? 0;
    return getRankForXp(xp).rankIndex;
  }

  public getDiscountedActionCost(baseCost: number, skill?: SkillId): number {
    if (!Number.isFinite(baseCost) || baseCost <= 0) return 0;
    if (!skill) return Math.round(baseCost);
    const rankIndex = this.getProficiencyLevel(skill);
    const discount = getProficiencyWorkDiscount(rankIndex);
    return Math.max(1, Math.round(baseCost * (1 - discount)));
  }

  public quoteWorkCost(baseCost: number, skill?: SkillId, action?: WorkActionId): WorkCostQuote {
    const { state } = this.context;
    const neutralCost = this.getDiscountedActionCost(baseCost, skill);
    const equipmentMultiplier = equipmentWorkMultiplier(state, action);
    const candidateCost = neutralCost === 0 ? 0 : Math.max(1, Math.round(neutralCost * equipmentMultiplier));
    const throughputFloor = neutralCost === 0 ? 0 : Math.max(1, Math.ceil((neutralCost * 4) / 5));
    const cost = Math.max(candidateCost, throughputFloor);
    const throughputCapLimited = candidateCost < throughputFloor;
    const current = state.player.workCapacity.current;
    const affordable = current >= cost;
    const shortage = Math.max(0, cost - current);
    return {
      baseCost,
      neutralCost,
      cost,
      action: action ?? null,
      equipmentMultiplier,
      throughputFloor,
      equipmentApplied: equipmentMultiplier < 1,
      roundingLimited: equipmentMultiplier < 1 && candidateCost === neutralCost && !throughputCapLimited,
      throughputCapLimited,
      availableWork: Math.max(0, Math.floor(current)),
      affordable,
      shortage
    };
  }

  public trySpendWork(
    baseCost: number,
    skill: SkillId,
    actionLabel: string,
    action?: WorkActionId
  ): WorkCostQuote & {
    success: boolean;
    remaining: number;
    reason?: string;
    reasonCode?: "insufficient-work";
    requiredWork?: number;
  } {
    const quote = this.quoteWorkCost(baseCost, skill, action);
    const { state } = this.context;
    if (!quote.affordable) {
      return this.insufficientWorkResult(quote, actionLabel);
    }
    state.player.workCapacity.current = Math.max(0, state.player.workCapacity.current - quote.cost);
    return {
      ...quote,
      success: true,
      remaining: state.player.workCapacity.current,
      requiredWork: quote.cost
    };
  }

  public insufficientWorkResult(
    quote: WorkCostQuote,
    actionLabel: string
  ): WorkCostQuote & {
    success: false;
    remaining: number;
    reason: string;
    reasonCode: "insufficient-work";
    requiredWork: number;
  } {
    return {
      ...quote,
      success: false,
      remaining: this.context.state.player.workCapacity.current,
      reasonCode: "insufficient-work",
      requiredWork: quote.cost,
      reason: `${actionLabel} needs ${quote.cost} Work · ${quote.availableWork} available · rest, eat, or work to recover`
    };
  }

  public addProficiencyXp(skill: SkillId, xpAmount: number, publish = true): DomainEvents["ProficiencyLeveledUp"] | null {
    if (!Number.isSafeInteger(xpAmount) || xpAmount <= 0) return null;
    const { state, events } = this.context;

    const currentXp = state.player.proficiencies[skill] ?? 0;
    const newXp = currentXp + xpAmount;
    const oldRank = getRankForXp(currentXp);
    const newRank = getRankForXp(newXp);
    state.player.proficiencies[skill] = newXp;

    if (newRank.rankIndex > oldRank.rankIndex) {
      const event = {
        skill,
        newRank: newRank.rankName,
        totalXp: newXp,
        minute: state.clock.currentMinute
      };
      if (publish) events.emit("ProficiencyLeveledUp", event);
      return event;
    }
    return null;
  }

  /**
   * Returns Work to the pool for a refund. Refunds are not earnings: they give
   * back Work already charged, so they bypass the daily earn cap but still
   * respect the ceiling. Capture sources use `earnWork`/`eatMeal` instead.
   */
  public creditWork(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const capacity = this.context.state.player.workCapacity;
    capacity.current = Math.min(capacity.maximum, capacity.current + amount);
    discardRecoveryAtCeiling(capacity);
  }

  /** Rolls the daily earning tallies. Called on every elapsed-time step. */
  public tickWorkCapacity(_minutes: number): void {
    rollWorkEarnings(
      this.context.state.player.workCapacity,
      workEarningsDayFor(this.context.state.clock.currentMinute)
    );
  }

  /** Online real-time recovery; independent of pause and accelerated game minutes. */
  public tickPassiveWorkRegen(realSeconds: number): number {
    return applyPassiveWorkRegen(this.context.state.player.workCapacity, realSeconds);
  }

  /** A night's rest: a small fraction plus a playable floor, exempt from the daily cap. */
  public restoreWorkOnRest(): number {
    return restoreWorkOnRest(
      this.context.state.player.workCapacity,
      this.context.state.clock.currentMinute
    );
  }

  /** Development-only Work capacity refill to maximum pool ceiling. */
  public refillDebugWork(): void {
    const workCapacity = this.context.state.player.workCapacity;
    workCapacity.current = workCapacity.maximum;
  }

  public getWorkDailyStatus(): {
    earnedToday: number;
    earnCap: number;
    mealsToday: number;
    mealLimit: number;
    laborUsedToday: readonly string[];
  } {
    const workCapacity = this.context.state.player.workCapacity;
    rollWorkEarnings(workCapacity, workEarningsDayFor(this.context.state.clock.currentMinute));
    return {
      earnedToday: Math.floor(workCapacity.earnedToday ?? 0),
      earnCap: WORK_DAILY_EARN_CAP,
      mealsToday: workCapacity.mealsToday ?? 0,
      mealLimit: WORK_MEAL_DAILY_LIMIT,
      laborUsedToday: workCapacity.laborUsedToday ?? []
    };
  }

  public canEatMeal(): boolean {
    const workCapacity = this.context.state.player.workCapacity;
    rollWorkEarnings(workCapacity, workEarningsDayFor(this.context.state.clock.currentMinute));
    return (workCapacity.mealsToday ?? 0) < WORK_MEAL_DAILY_LIMIT;
  }

  /**
   * Eats one meal. The item is removed by the caller; this only owns the
   * daily-limit tally and the capped Work grant. Returns Work granted, or 0
   * when the day's meal limit or earning room is exhausted.
   */
  public consumeMeal(workRestore: number): number {
    const workCapacity = this.context.state.player.workCapacity;
    const minute = this.context.state.clock.currentMinute;
    rollWorkEarnings(workCapacity, workEarningsDayFor(minute));
    if ((workCapacity.mealsToday ?? 0) >= WORK_MEAL_DAILY_LIMIT) return 0;
    if (!this.hasWorkRoom(workRestore)) return 0;
    const granted = earnWorkCapacity(workCapacity, workRestore, minute);
    if (granted > 0) workCapacity.mealsToday = (workCapacity.mealsToday ?? 0) + 1;
    return granted;
  }

  /**
   * True while the daily cap and the pool ceiling both leave room for the full
   * requested grant. Discrete sources (a meal, a labor shift) check the full
   * amount so a limited resource is never spent for a trivial partial grant.
   */
  public hasWorkRoom(amount = 1): boolean {
    return this.workRoomBlocker(amount) === null;
  }

  /** Explain the actual recovery limit before a meal or one-use labor shift is consumed. */
  public workRoomBlocker(amount = 1): string | null {
    const workCapacity = this.context.state.player.workCapacity;
    const minute = this.context.state.clock.currentMinute;
    rollWorkEarnings(workCapacity, workEarningsDayFor(minute));
    const requested = Number.isFinite(amount) && amount > 0 ? amount : 1;
    const roomInCap = Math.max(0, WORK_DAILY_EARN_CAP - (workCapacity.earnedToday ?? 0));
    const roomInPool = Math.max(0, workCapacity.maximum - workCapacity.current);
    if (roomInCap < requested) return "Today's Work earning limit is too close; rest until tomorrow";
    if (roomInPool < requested) return "Spend some Work before taking more energy";
    return null;
  }

  /**
   * Credits Work earned by active play (labor shifts and skill rebates). Bounded
   * by the daily cap so an activity cannot be ground into unlimited production.
   */
  public earnWork(amount: number, stationId?: string): number {
    const workCapacity = this.context.state.player.workCapacity;
    const minute = this.context.state.clock.currentMinute;
    const day = workEarningsDayFor(minute);
    rollWorkEarnings(workCapacity, day);
    const used = workCapacity.laborUsedToday ?? [];
    if (stationId && used.includes(stationId)) return 0;
    const granted = earnWorkCapacity(workCapacity, amount, minute);
    if (granted > 0 && stationId) {
      workCapacity.laborUsedToday = [...used, stationId];
    }
    return granted;
  }

  public hasWorkedLaborStation(stationId: string): boolean {
    const workCapacity = this.context.state.player.workCapacity;
    rollWorkEarnings(workCapacity, workEarningsDayFor(this.context.state.clock.currentMinute));
    return (workCapacity.laborUsedToday ?? []).includes(stationId);
  }
}
