import { getNextRank, getRankForXp } from "../../content/progression";
import type { GameMinute, SkillId, WorkCapacityState } from "../core/types";
import type { SkillProgressDto, WorkCostQuote } from "../core/contracts";
import { formatClockTime } from "../core/GameClock";
import type { DomainContext } from "./DomainContext";

export const LIVE_WORK_CAPACITY_REGEN_PER_HOUR = 200;
export const OFFLINE_WORK_CAPACITY_REGEN_PER_HOUR = 100;
/** Canonical Work pool ceiling. Legacy saves with a smaller pool are rescaled to this on load. */
export const WORK_CAPACITY_MAXIMUM = 1000;

export function getProficiencyWorkDiscount(rankIndex: number): number {
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

  public quoteWorkCost(baseCost: number, skill?: SkillId): WorkCostQuote {
    const { state } = this.context;
    const cost = this.getDiscountedActionCost(baseCost, skill);
    const current = state.player.workCapacity.current;
    const affordable = current >= cost;
    const shortage = Math.max(0, cost - current);
    const recoveryMinutes = affordable
      ? 0
      : Math.max(1, Math.ceil((shortage / LIVE_WORK_CAPACITY_REGEN_PER_HOUR) * 60));
    return {
      baseCost,
      cost,
      availableWork: Math.max(0, Math.floor(current)),
      affordable,
      shortage,
      readyAtMinute: affordable ? null : state.clock.currentMinute + recoveryMinutes
    };
  }

  public trySpendWork(
    baseCost: number,
    skill: SkillId,
    actionLabel: string
  ): WorkCostQuote & {
    success: boolean;
    remaining: number;
    reason?: string;
    reasonCode?: "insufficient-work";
    requiredWork?: number;
  } {
    const quote = this.quoteWorkCost(baseCost, skill);
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
    const ready = quote.readyAtMinute == null ? "later" : formatClockTime(quote.readyAtMinute);
    return {
      ...quote,
      success: false,
      remaining: this.context.state.player.workCapacity.current,
      reasonCode: "insufficient-work",
      requiredWork: quote.cost,
      reason: `${actionLabel} needs ${quote.cost} Work · ${quote.availableWork} available · ready ${ready}`
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

  public tickWorkCapacity(minutes: number): void {
    const { state } = this.context;
    regenerateWorkCapacity(state.player.workCapacity, minutes, state.clock.currentMinute, LIVE_WORK_CAPACITY_REGEN_PER_HOUR);
  }
}
