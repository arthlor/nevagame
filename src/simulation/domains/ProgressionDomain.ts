import { getRankForXp } from "../../content/progression";
import type { GameMinute, SkillId, WorkCapacityState } from "../core/types";
import type { DomainContext } from "./DomainContext";

export const LIVE_WORK_CAPACITY_REGEN_PER_HOUR = 200;
export const OFFLINE_WORK_CAPACITY_REGEN_PER_HOUR = 100;

export function getProficiencyLaborDiscount(rankIndex: number): number {
  return Math.round(Math.min(0.35, Math.max(0, rankIndex * 0.05)) * 100) / 100;
}

export function regenerateWorkCapacity(
  workCapacity: WorkCapacityState,
  minutes: number,
  currentMinute: GameMinute,
  ratePerHour: number = LIVE_WORK_CAPACITY_REGEN_PER_HOUR
): void {
  if (minutes <= 0 || workCapacity.current >= workCapacity.maximum) return;
  const regen = (minutes / 60) * ratePerHour;
  workCapacity.current = Math.min(workCapacity.maximum, workCapacity.current + regen);
  workCapacity.regeneratedAtMinute = currentMinute;
}

export class ProgressionDomain {
  constructor(private readonly context: DomainContext) {}

  public getWorkOutcome(): { xpMultiplier: number; rareChanceMultiplier: number } {
    const available = this.context.state.player.workCapacity.current > 0;
    return {
      xpMultiplier: available ? 1 : 0.4,
      rareChanceMultiplier: available ? 1 : 0.4
    };
  }

  public getProficiencyLevel(skill: SkillId): number {
    const xp = this.context.state.player.proficiencies[skill] ?? 0;
    return getRankForXp(xp).rankIndex;
  }

  public getDiscountedActionCost(baseCost: number, skill?: SkillId): number {
    if (!Number.isFinite(baseCost) || baseCost <= 0) return 0;
    if (!skill) return Math.round(baseCost);
    const rankIndex = this.getProficiencyLevel(skill);
    const discount = getProficiencyLaborDiscount(rankIndex);
    return Math.max(1, Math.round(baseCost * (1 - discount)));
  }

  public canPerformWork(): boolean {
    return this.context.state.player.workCapacity.current > 0;
  }

  public consumeWorkCapacity(
    baseCost: number,
    skill?: SkillId
  ): { success: boolean; drained: number; remaining: number } {
    const { state } = this.context;
    if (state.player.workCapacity.current <= 0) {
      return { success: false, drained: 0, remaining: 0 };
    }
    const cost = this.getDiscountedActionCost(baseCost, skill);
    const drained = Math.min(state.player.workCapacity.current, cost);
    state.player.workCapacity.current = Math.max(0, state.player.workCapacity.current - drained);
    return { success: true, drained, remaining: state.player.workCapacity.current };
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

  public tickWorkCapacity(minutes: number): void {
    const { state } = this.context;
    regenerateWorkCapacity(state.player.workCapacity, minutes, state.clock.currentMinute, LIVE_WORK_CAPACITY_REGEN_PER_HOUR);
  }
}

