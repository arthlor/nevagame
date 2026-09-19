import { WorldLayout } from "../../world/WorldLayout";
import { buildRecordMilestones } from "./buildRecordMilestones";
import { ContentRegistry } from "../../content/ContentRegistry";
import { InventoryManager } from "../inventory/InventoryManager";
import type { GameState } from "../core/types";

export interface RewardFeedbackDto {
  kind: "money" | "item" | "xp" | "record" | "work";
  text: string;
  amount: number;
  itemId?: string;
  x: number;
  y: number;
  z: number;
}

interface RewardSnapshot {
  money: number;
  work: number;
  xp: Record<string, number>;
  items: Map<string, number>;
}

/** All successful transaction paths share state; failures produce no gain. */
export class RewardFeedbackPresentation {
  private previous: RewardSnapshot | null = null;
  private achieved = new Set<string>();

  reset(): void { this.previous = null; }

  sample(state: GameState, origin: { x: number; y: number; z: number } = state.player, marketId?: string | null): RewardFeedbackDto[] {
    const items = new Map<string, number>();
    for (const slot of state.inventories[state.player.inventoryId].slots) {
      if (slot.itemId) items.set(slot.itemId, (items.get(slot.itemId) ?? 0) + InventoryManager.getSlotQuantity(slot));
    }
    const next = { money: state.player.money, work: state.player.workCapacity.current, xp: { ...state.player.proficiencies }, items };
    const before = this.previous;
    this.previous = next;
    if (!before) {
      this.achieved = new Set(buildRecordMilestones(state).filter((record) => record.achieved).map((record) => record.id));
      return [];
    }
    const feedback: RewardFeedbackDto[] = [];
    const market = marketId ? ContentRegistry.markets.get(marketId)?.interactionPosition : undefined;
    const point = market ? { x: market.x, y: WorldLayout.terrainHeight(market.x, market.z) + 1.2, z: market.z }
      : { x: origin.x, y: origin.y + 1.2, z: origin.z };
    const money = next.money - before.money;
    if (money !== 0) feedback.push({ ...point, kind: "money", amount: money, text: `${money > 0 ? "+" : "−"}${Math.abs(money)} G` });
    // Work is an economy resource, so earned shifts and paid actions read in
    // the same place as money and items. Fractional pool arithmetic rounds to
    // whole Work; a sub-unit drift is not a reward.
    const work = Math.round(next.work - before.work);
    if (work !== 0) feedback.push({ ...point, kind: "work", amount: work, text: `${work > 0 ? "+" : "−"}${Math.abs(work)} Work` });
    for (const [id, quantity] of next.items) {
      const gain = quantity - (before.items.get(id) ?? 0);
      if (gain > 0) feedback.push({ ...point, kind: "item", itemId: id, amount: gain,
        text: `+${gain} ${ContentRegistry.items.get(id)?.name ?? id}` });
    }
    for (const [skill, xp] of Object.entries(next.xp)) {
      const gain = xp - (before.xp[skill] ?? 0);
      if (gain > 0) feedback.push({ ...point, kind: "xp", amount: gain,
        text: `+${gain} ${skill[0].toUpperCase()}${skill.slice(1)}` });
    }
    // Records are compared every frame, not only when a tracked gain happened:
    // a milestone that flips on a zero-delta frame must still be announced once.
    for (const record of buildRecordMilestones(state)) {
      if (record.achieved && !this.achieved.has(record.id)) {
        this.achieved.add(record.id);
        feedback.push({ ...point, kind: "record", text: record.title, amount: 1 });
      }
    }
    return feedback;
  }
}
