import { getNextRank, getRankForXp } from "../../content/progression";
import { MINUTES_PER_DAY } from "../core/GameClock";
import type { GameMinute, SkillId, WorkActionId, WorkCapacityState } from "../core/types";
import type { SkillProgressDto, WorkCostQuote } from "../core/contracts";
import type { DomainContext } from "./DomainContext";
import { equipmentWorkMultiplier } from "../equipment/EquipmentEffects";

/**
 * Work Capacity is a daily labor budget, not a passive bar. Waking time
 * regenerates nothing: the pool is earned by resting, eating provisions and
 * working skill minigames, bounded by a daily earn cap.
 */
/** Canonical Work pool ceiling — one day's labor. Legacy saves are rescaled on load. */
export const WORK_CAPACITY_MAXIMUM = 500;
/** Maximum Work a player can earn from meals, labor and skill in one day. */
export const WORK_DAILY_EARN_CAP = 300;
/** A night's rest restores this share of the ceiling, plus a baseline floor. */
export const WORK_REST_FRACTION = 0.1;
/** Waking never leaves the pool below this share of the ceiling. */
export const WORK_REST_BASELINE_FRACTION = 0.25;
/** Meals that restore Work per calendar day. */
export const WORK_MEAL_DAILY_LIMIT = 3;
/** Slow idle trickle: this much Work every real-time interval, clamped by the ceiling. */
export const WORK_PASSIVE_REGEN_AMOUNT = 8;
export const WORK_PASSIVE_REGEN_INTERVAL_SECONDS = 300;

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

/**
 * Grants Work from a capped capture source and returns the amount actually
 * granted. `earnedToday` tracks the daily cap; the pool ceiling is a second
 * bound, so a near-full pool cannot be topped up for free.
 */
export function earnWorkCapacity(
  workCapacity: WorkCapacityState,
  amount: number,
  currentMinute: GameMinute
): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const day = workEarningsDayFor(currentMinute);
  rollWorkEarnings(workCapacity, day);
  const earned = workCapacity.earnedToday ?? 0;
  const roomInCap = Math.max(0, WORK_DAILY_EARN_CAP - earned);
  const roomInPool = Math.max(0, workCapacity.maximum - workCapacity.current);
  const granted = Math.min(amount, roomInCap, roomInPool);
  if (granted <= 0) return 0;
  workCapacity.current += granted;
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
    workCapacity.regeneratedAtMinute = currentMinute;
  }
  rollWorkEarnings(workCapacity, workEarningsDayFor(currentMinute));
  return granted;
}

export function getProficiencyWorkDiscount(rankIndex: number): number {
  return Math.round(Math.min(0.35, Math.max(0, rankIndex * 0.05)) * 100) / 100;
}

/**
 * Slow real-time idle trickle. A running, unpaused game grants
 * `WORK_PASSIVE_REGEN_AMOUNT` every `WORK_PASSIVE_REGEN_INTERVAL_SECONDS` real
 * seconds, clamped by the ceiling and deliberately exempt from the daily earn
 * cap (it is a floor, not a source of burst). The accumulator resets while the
 * pool is full so a spent pool cannot bank a burst from idle time.
 */
export function applyPassiveWorkRegen(
  workCapacity: WorkCapacityState,
  realSeconds: number
): number {
  if (!Number.isFinite(realSeconds) || realSeconds <= 0) return 0;
  if (workCapacity.current >= workCapacity.maximum) {
    workCapacity.passiveRegenSeconds = 0;
    return 0;
  }
  const accrued = (workCapacity.passiveRegenSeconds ?? 0) + realSeconds;
  const steps = Math.floor(accrued / WORK_PASSIVE_REGEN_INTERVAL_SECONDS);
  workCapacity.passiveRegenSeconds = accrued - steps * WORK_PASSIVE_REGEN_INTERVAL_SECONDS;
  if (steps <= 0) return 0;
  const requested = steps * WORK_PASSIVE_REGEN_AMOUNT;
  const room = Math.max(0, workCapacity.maximum - workCapacity.current);
  const granted = Math.min(requested, room);
  if (granted <= 0) return 0;
  workCapacity.current += granted;
  if (granted < requested) workCapacity.passiveRegenSeconds = 0;
  return granted;
}

export class ProgressionDomain {
  constructor(private readonly context: DomainContext) {}

  public inspectSkills(): SkillProgressDto[] {
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
        nextXp: next?.xpRequired ?? null
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
    const candidateCost = Math.max(1, Math.round(neutralCost * equipmentMultiplier));
    const throughputFloor = Math.max(1, Math.ceil((neutralCost * 4) / 5));
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

  public addProficiencyXp(skill: SkillId, xpAmount: number): void {
    if (!Number.isSafeInteger(xpAmount) || xpAmount <= 0) return;
    const { state, events } = this.context;

    const currentXp = state.player.proficiencies[skill] ?? 0;
    const newXp = currentXp + xpAmount;
    const oldRank = getRankForXp(currentXp);
    const newRank = getRankForXp(newXp);
    state.player.proficiencies[skill] = newXp;

    if (newRank.rankIndex > oldRank.rankIndex) {
      events.emit("ProficiencyLeveledUp", {
        skill,
        newRank: newRank.rankName,
        totalXp: newXp,
        minute: state.clock.currentMinute
      });
    }
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
  }

  /** Rolls the daily earning tallies. Called on every elapsed-time step. */
  public tickWorkCapacity(_minutes: number): void {
    rollWorkEarnings(
      this.context.state.player.workCapacity,
      workEarningsDayFor(this.context.state.clock.currentMinute)
    );
  }

  /** Slow real-time idle trickle, applied on every unpaused frame. */
  public tickPassiveWorkRegen(realSeconds: number): number {
    return applyPassiveWorkRegen(this.context.state.player.workCapacity, realSeconds);
  }

  /** A night's rest: a small fraction plus a floor, exempt from the daily cap. */
  public restoreWorkOnRest(): number {
    return restoreWorkOnRest(
      this.context.state.player.workCapacity,
      this.context.state.clock.currentMinute
    );
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
    const workCapacity = this.context.state.player.workCapacity;
    const minute = this.context.state.clock.currentMinute;
    rollWorkEarnings(workCapacity, workEarningsDayFor(minute));
    const requested = Number.isFinite(amount) && amount > 0 ? amount : 1;
    const roomInCap = Math.max(0, WORK_DAILY_EARN_CAP - (workCapacity.earnedToday ?? 0));
    const roomInPool = Math.max(0, workCapacity.maximum - workCapacity.current);
    return Math.min(roomInCap, roomInPool) >= requested;
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
