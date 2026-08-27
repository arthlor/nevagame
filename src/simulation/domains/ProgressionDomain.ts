import { getRankForXp } from "../../content/progression";
import type { GameMinute, SkillId, WorkCapacityState } from "../core/types";
import type { DomainContext } from "./DomainContext";

export function regenerateWorkCapacity(
  workCapacity: WorkCapacityState,
  minutes: number,
  currentMinute: GameMinute
): void {
  if (minutes <= 0 || workCapacity.current >= workCapacity.maximum) return;
  const regen = (minutes / 60) * 100;
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

  public addProficiencyXp(skill: SkillId, xpAmount: number): void {
    if (!Number.isSafeInteger(xpAmount) || xpAmount <= 0) return;
    const { state, events } = this.context;
    const isEnergized = state.player.workCapacity.current > 0;
    const earned = Math.round(xpAmount * this.getWorkOutcome().xpMultiplier);

    if (isEnergized) {
      state.player.workCapacity.current = Math.max(0, state.player.workCapacity.current - xpAmount);
    }

    const currentXp = state.player.proficiencies[skill];
    const newXp = currentXp + earned;
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
    regenerateWorkCapacity(state.player.workCapacity, minutes, state.clock.currentMinute);
  }
}
