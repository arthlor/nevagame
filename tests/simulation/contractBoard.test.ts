import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { contractSlotsForRank } from "../../src/content/progression";
import { feasibleContractTargets } from "../../src/simulation/domains/ContractDomain";
import { isProduceContractType } from "../../src/simulation/domains/domainRules";
import { SEASONS } from "../../src/simulation/core/GameClock";
import { Simulation } from "../../src/simulation/Simulation";
import type { GameState } from "../../src/simulation/core/types";

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
  it("can actually generate every authored template", () => {
    ContentRegistry.initializeAndValidate();
    const state = fullyEquippedState();
    for (const template of ContentRegistry.contractTemplates.values()) {
      const seasonsWithTargets = SEASONS.filter((season) => {
        state.clock.season = season;
        return feasibleContractTargets(state, template).length > 0;
      });
      expect(
        seasonsWithTargets.length,
        `${template.id} can never be generated — its delivery market must price the target, `
        + "and fish targets must be sport species with a reachable school"
      ).toBeGreaterThan(0);
    }
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
    expect(contractSlotsForRank(0)).toBe(2);
    expect(contractSlotsForRank(2)).toBe(2);
    expect(contractSlotsForRank(3)).toBe(3);
    expect(contractSlotsForRank(4)).toBe(3);
    expect(contractSlotsForRank(5)).toBe(4);
    expect(contractSlotsForRank(7)).toBe(4);
  });
});
