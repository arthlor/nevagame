import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { contractSlotsForRank } from "../../src/content/progression";
import {
  canReachDeliveryMarket,
  contractTargetReferenceValue,
  feasibleContractTargets
} from "../../src/simulation/domains/ContractDomain";
import { buildExpeditionOpportunities } from "../../src/simulation/expeditions/buildExpeditionOpportunities";
import type { MarketDemandSignal } from "../../src/simulation/core/contracts";
import { isProduceContractType } from "../../src/simulation/domains/domainRules";
import { MarketDomain } from "../../src/simulation/domains/MarketDomain";
import { SEASONS } from "../../src/simulation/core/GameClock";
import { Simulation } from "../../src/simulation/Simulation";
import type { GameState } from "../../src/simulation/core/types";
import { getFishWeightMultiplier, getQualityMultiplier } from "../../src/simulation/economy/calculateFishValue";
import { getFreshnessPriceMultiplier } from "../../src/simulation/fishing/calculateFreshness";

/**
 * A player who has everything a template could ask for: every rod and boat,
 * ample proficiency, and the rowboat feature that gates fish contracts. If a
 * template cannot roll a target for this player in any season, nothing in the
 * game can ever generate it.
 */
function fullyEquippedState(): GameState {
  const sim = new Simulation();
  const state = sim.state;
  state.quests.unlockedFeatureIds.push("boat.player_rowboat");
  for (const skill of ["farming", "fishing", "processing", "trading"] as const) {
    state.player.proficiencies[skill] = 100_000;
  }
  state.player.equippedRodId = "rod.master";
  state.player.ownedRodIds = [...ContentRegistry.rods.keys()];
  sim.prepareDebugSkiffReview();
  return state;
}

describe("contract board", () => {
  it("can actually generate every authored target", () => {
    ContentRegistry.initializeAndValidate();
    const state = fullyEquippedState();
    for (const template of ContentRegistry.contractTemplates.values()) {
      for (const targetId of template.itemOrSpeciesPool) {
        const seasonsWithTarget = SEASONS.filter((season) => {
          state.clock.season = season;
          return feasibleContractTargets(state, template).includes(targetId);
        });
        expect(
          seasonsWithTarget.length,
          `${template.id}:${targetId} can never be generated — its delivery market must price the target `
          + "and the fish must have a reachable catch path"
        ).toBeGreaterThan(0);
      }
    }
  });

  it("prices physical basic fish through the fish valuation lane", () => {
    ContentRegistry.initializeAndValidate();
    const state = fullyEquippedState();
    const template = ContentRegistry.contractTemplates.get("contract.sunreach_reef_fish_order")!;
    const fish = ContentRegistry.fishSpecies.get("fish.sea_bream")!;
    const reference = contractTargetReferenceValue(state, template, "fish.sea_bream");
    const expected = fish.baseMarketValue
      * getQualityMultiplier("common")
      * getFreshnessPriceMultiplier(template.minFreshness ?? 100)
      * getFishWeightMultiplier(fish, fish.weightKg.average);
    expect(reference).toBeCloseTo(expected, 10);
  });

  it("routes a physical basic-catch contract through the cargo lane, not its item marker", () => {
    ContentRegistry.initializeAndValidate();
    const sim = new Simulation();
    const state = sim.state;
    const market = ContentRegistry.markets.get("market.sunreach_cove")!;
    state.player.x = market.interactionPosition.x;
    state.player.z = market.interactionPosition.z;
    state.contracts.push({
      id: "contract.bream_lane",
      templateId: "contract.sunreach_reef_fish_order",
      requesterId: "npc.harbor_innkeeper",
      deliveryMarketId: "market.sunreach_cove",
      type: "fresh-fish",
      targetItemIdOrSpecies: "fish.sea_bream",
      quantityRequired: 1,
      quantityFulfilled: 0,
      minFreshness: 90,
      rewardMoney: 120,
      rewardSkillXp: { skill: "fishing", xp: 20 },
      expiresAtMinute: state.clock.currentMinute + 120,
      status: "active"
    } as GameState["contracts"][number]);
    state.fishCargo["cargo.bream_lane"] = {
      id: "cargo.bream_lane",
      speciesId: "fish.sea_bream",
      weightKg: 2,
      quality: "common",
      caughtAtMinute: state.clock.currentMinute,
      freshness: 40,
      cargoClass: "small",
      location: { type: "player", containerId: "player" }
    };
    state.player.carriedFishCargoId = "cargo.bream_lane";

    const board = sim.inspectMarketBoard("market.sunreach_cove")!;
    const row = board.contractRows.find((candidate) => candidate.contractId === "contract.bream_lane")!;
    expect(row.ready).toBe(false);
    // The item registration is an eligibility marker only; readiness must be
    // reported from physical cargo, not a satchel stack the player never has.
    expect(row.itemId).toBeUndefined();
    expect(row.blockerReasons.join(" ")).not.toContain("Bring");
    expect(row.blockerReasons.join(" ")).toContain("freshness");
    expect(MarketDomain.isBulkSellProduceItem("fish.sea_bream")).toBe(false);
  });

  it("keeps every template's delivery market able to price its own targets", () => {
    ContentRegistry.initializeAndValidate();
    for (const template of ContentRegistry.contractTemplates.values()) {
      const market = ContentRegistry.markets.get(template.deliveryMarketId);
      expect(market, `${template.id} delivers to unknown market`).toBeDefined();
      const priced = new Set(market!.commodities.map((commodity) => commodity.itemId));
      for (const targetId of template.itemOrSpeciesPool) {
        expect(
          priced.has(targetId),
          `${template.id} delivers '${targetId}' to ${template.deliveryMarketId}, which does not price it`
        ).toBe(true);
      }
    }
  });

  it("routes bulk orders through the item lane, not the fish lane", () => {
    const bulk = [...ContentRegistry.contractTemplates.values()].filter(
      (template) => template.type === "bulk-order"
    );
    // The type was declared in both unions and used by zero templates; the
    // feasibility and refund branches asked `type === "produce"` and so sent
    // it down the fish lane, where an item target can never match.
    expect(bulk.length).toBeGreaterThan(0);
    for (const template of bulk) {
      expect(isProduceContractType(template.type)).toBe(true);
      for (const targetId of template.itemOrSpeciesPool) {
        expect(ContentRegistry.fishSpecies.has(targetId)).toBe(false);
        expect(
          [...ContentRegistry.crops.values()].some((crop) => crop.harvestItemId === targetId),
          `${template.id} target '${targetId}' must be crop produce`
        ).toBe(true);
      }
    }
  });

  it("offers no Sunreach Cove order until the player owns a vessel that can cross to it", () => {
    ContentRegistry.initializeAndValidate();
    const sim = new Simulation();
    const state = sim.state;
    state.quests.unlockedFeatureIds.push("boat.player_rowboat");
    for (const skill of ["farming", "fishing", "processing", "trading"] as const) {
      state.player.proficiencies[skill] = 100_000;
    }
    state.player.equippedRodId = "rod.master";
    state.player.ownedRodIds = [...ContentRegistry.rods.keys()];
    const cove = [...ContentRegistry.contractTemplates.values()]
      .filter((template) => template.deliveryMarketId === "market.sunreach_cove");
    expect(cove.length).toBeGreaterThan(0);
    const offered = () => cove.filter((template) => SEASONS.some((season) => {
      state.clock.season = season;
      return feasibleContractTargets(state, template).length > 0;
    }));

    // The rowboat cannot cross the channel, so a cove order would expire unfulfillable.
    expect(canReachDeliveryMarket(state, "market.sunreach_cove")).toBe(false);
    expect(offered()).toEqual([]);

    sim.prepareDebugSkiffReview();
    expect(canReachDeliveryMarket(state, "market.sunreach_cove")).toBe(true);
    expect(offered()).toEqual(cove);
  });

  it("sends each expedition contract to its own delivery market", () => {
    ContentRegistry.initializeAndValidate();
    const state = fullyEquippedState();
    const template = ContentRegistry.contractTemplates.get("contract.sunreach_reef_fish_order")!;
    state.contracts = [{
      id: "contract.cove_test", templateId: template.id, requesterId: template.id,
      deliveryMarketId: template.deliveryMarketId, type: template.type, targetItemIdOrSpecies: "fish.sea_bream",
      quantityRequired: 1, quantityFulfilled: 0, minFreshness: template.minFreshness, rewardMoney: 90,
      rewardSkillXp: { skill: "fishing", xp: 50 }, expiresAtMinute: state.clock.currentMinute + 600, status: "active"
    }];
    const signal = { success: false } as MarketDemandSignal;
    const [bold] = buildExpeditionOpportunities(state, { steady: signal, bold: signal });
    expect(bold.destination).toBe("Sunreach Cove Market");
    // Sea bream is a physical basic catch: no school to chum, no sport hook to lure.
    expect(bold.blockers).not.toContain("Pack a chum bucket");
    expect(bold.blockers).not.toContain("Pack a Woven Lure");
    // Without a vessel there is nothing cold to stow it in; the skiff's built-in iced hold is.
    expect(bold.blockers).toContain("No crushed ice is packed for the freshness target");
    const [aboardSkiff] = buildExpeditionOpportunities(state, { steady: signal, bold: signal }, "boat.player_skiff");
    expect(aboardSkiff.blockers).not.toContain("No crushed ice is packed for the freshness target");

    delete state.boats["boat.player_skiff"];
    const [blocked] = buildExpeditionOpportunities(state, { steady: signal, bold: signal });
    expect(blocked.ready).toBe(false);
    expect(blocked.blockers).toContain("Coastal Fishing Skiff is required to reach Sunreach Cove Market");
  });

  it("widens the board with Trading rank instead of a tier flag", () => {
    expect(contractSlotsForRank(0)).toBe(3);
    expect(contractSlotsForRank(2)).toBe(3);
    expect(contractSlotsForRank(3)).toBe(3);
    expect(contractSlotsForRank(4)).toBe(3);
    expect(contractSlotsForRank(5)).toBe(4);
    expect(contractSlotsForRank(7)).toBe(4);
  });
});
