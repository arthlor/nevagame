import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { contractSlotsForRank } from "../../src/content/progression";
import { contractTargetReferenceValue, feasibleContractTargets } from "../../src/simulation/domains/ContractDomain";
import { isProduceContractType } from "../../src/simulation/domains/domainRules";
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

  it("widens the board with Trading rank instead of a tier flag", () => {
    expect(contractSlotsForRank(0)).toBe(3);
    expect(contractSlotsForRank(2)).toBe(3);
    expect(contractSlotsForRank(3)).toBe(3);
    expect(contractSlotsForRank(4)).toBe(3);
    expect(contractSlotsForRank(5)).toBe(4);
    expect(contractSlotsForRank(7)).toBe(4);
  });
});
