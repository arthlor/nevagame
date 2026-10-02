import { beforeAll, describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import type { ContractState, GameState } from "../../src/simulation/core/types";
import { buildHudContracts } from "../../src/simulation/presentation/WorldHudPresentation";
import { translateExpeditionText } from "../../src/i18n/expeditionTr";

beforeAll(() => ContentRegistry.initializeAndValidate());
const order = (changes: Partial<ContractState> = {}): ContractState => ({
  id: "contract.test", templateId: "contract.test", requesterId: "requester.test",
  deliveryMarketId: "market.village", type: "produce", targetItemIdOrSpecies: "produce.wheat",
  quantityRequired: 10, quantityFulfilled: 3, deliveredValueMoney: 450, legacyUnvaluedQuantity: 0,
  rewardMoney: 300, rewardSkillXp: { skill: "trading", xp: 100 }, expiresAtMinute: 541,
  status: "active", ...changes
});
const clock: GameState["clock"] = {
  currentMinute: 480, minutesPerRealSecond: 0.4, dayCount: 1,
  season: "spring", year: 1, timeOfDay: "day", isPaused: false
};

describe("contract tracker presentation", () => {
  it("shows delivered progress and the same payment floor as the delivery board", () => {
    const [row] = buildHudContracts({ clock, contracts: [order()] });
    expect(row.current).toBe(3);
    expect(row.target).toBe(10);
    expect(row.completed).toBe(false);
    expect(row.rewardMoney).toBe(450);
    expect(row.deliveryMarketName).toBe(ContentRegistry.markets.get("market.village")!.name);
    expect(buildHudContracts({ clock, contracts: [order({ deliveredValueMoney: 100 })] })[0].rewardMoney).toBe(300);
  });

  it("uses game time and preserves minutes when localizing the deadline", () => {
    const [row] = buildHudContracts({ clock, contracts: [order()] });
    expect(row.deadlineLabel).toBe("1h 1m left");
    expect(translateExpeditionText(row.deadlineLabel, "tr")).toBe("1 sa 1 dk kaldı");
    expect(buildHudContracts({ clock, contracts: [order({ expiresAtMinute: 481 })] })[0].deadlineLabel).toBe("1m left");
  });

  it("omits paid and expired orders even before the next expiry tick", () => {
    const contracts = [order({ status: "completed" }), order({ status: "expired" }), order({ expiresAtMinute: 480 })];
    expect(buildHudContracts({ clock, contracts })).toEqual([]);
    expect(contracts[2].status).toBe("active"); // A presentation read never settles an order.
  });
});
