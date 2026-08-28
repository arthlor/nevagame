import type { ContractState, FishCargoId, GameState, ItemId } from "../core/types";
import { InventoryManager } from "../inventory/InventoryManager";
import { ContentRegistry } from "../../content/ContentRegistry";
import type { ContractTemplateDefinition } from "../../content/types";
import type { CargoDomain } from "./CargoDomain";
import type { DomainContext } from "./DomainContext";
import type { MarketDomain } from "./MarketDomain";
import type { NavigationDomain } from "./NavigationDomain";
import type { ProgressionDomain } from "./ProgressionDomain";
import { qualityRank } from "./domainRules";

const CONTRACT_BOARD_LIMIT = 2;
const CONTRACT_SKILL_XP_PER_UNIT = 25;

const CONTRACT_REQUESTER_IDS: Readonly<Record<string, string>> = {
  "Village Baker": "npc.elspeth",
  "Harbor Tavern Master": "npc.maeve",
  "Harbor Innkeeper": "npc.silas",
  "Wholesale Fish Buyer": "npc.maeve",
  "Maritime Guild Officer": "npc.silas"
};

export function expireContracts(state: GameState): void {
  for (const contract of state.contracts) {
    if (contract.status === "active" && state.clock.currentMinute >= contract.expiresAtMinute) {
      refundAndExpireContract(state, contract);
    }
  }
}

function refundAndExpireContract(state: GameState, contract: GameState["contracts"][number]): void {
  contract.status = "expired";
  if (contract.type !== "produce" || contract.quantityFulfilled <= 0) return;
  const itemId = contract.targetItemIdOrSpecies;
  const quantity = contract.quantityFulfilled;
  const inventory = state.inventories[state.player.inventoryId];
  const stack = [{ itemId, quantity }];
  if (inventory && InventoryManager.canAddItems(inventory, stack)) {
    InventoryManager.addItemsAtomically(inventory, stack);
    contract.quantityFulfilled = 0;
    return;
  }
  const item = ContentRegistry.items.get(itemId);
  if (item) {
    state.player.money += item.baseValue * quantity;
    contract.quantityFulfilled = 0;
  }
}

export class ContractDomain {
  constructor(
    private readonly context: DomainContext,
    private readonly market: MarketDomain,
    private readonly navigation: NavigationDomain,
    private readonly cargo: CargoDomain,
    private readonly progression: ProgressionDomain
  ) {}

  public deliverItems(
    contractId: string,
    itemId: ItemId,
    quantity: number
  ): { success: boolean; delivered?: number; completed?: boolean; rewardMoney?: number; reason?: string } {
    const { state } = this.context;
    if (!this.market.getNearbyMarketId()) return { success: false, reason: "Deliver contracts at a market" };
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { success: false, reason: "Delivery quantity must be a positive whole number" };
    }
    const contract = this.getActive(contractId);
    if (!contract) return { success: false, reason: "Contract is not active" };
    if (contract.targetItemIdOrSpecies !== itemId) {
      return { success: false, reason: "This contract does not accept that item" };
    }
    if (contract.type === "fresh-fish" || contract.type === "quality-target") {
      return { success: false, reason: "This contract requires physical fish cargo" };
    }
    const remaining = contract.quantityRequired - contract.quantityFulfilled;
    if (quantity > remaining) return { success: false, reason: `Only ${remaining} more needed for this contract` };
    const inventory = state.inventories[state.player.inventoryId];
    if (!InventoryManager.hasItems(inventory, [{ itemId, quantity }])) {
      return { success: false, reason: "You do not have enough items to deliver" };
    }
    InventoryManager.removeItemsAtomically(inventory, [{ itemId, quantity }]);
    contract.quantityFulfilled += quantity;
    const completion = this.completeIfFulfilled(contract);
    return { success: true, delivered: quantity, completed: completion.completed, rewardMoney: completion.rewardMoney };
  }

  public deliverFish(
    contractId: string,
    cargoId: FishCargoId
  ): { success: boolean; delivered?: number; completed?: boolean; rewardMoney?: number; reason?: string } {
    const { state } = this.context;
    const nearbyMarketId = this.market.getNearbyMarketId();
    if (!nearbyMarketId) return { success: false, reason: "Deliver contracts at a market" };
    const contract = this.getActive(contractId);
    if (!contract) return { success: false, reason: "Contract is not active" };
    const fishCargo = state.fishCargo[cargoId];
    if (!fishCargo) return { success: false, reason: "Fish cargo not found" };
    if (!this.navigation.canAccessFishCargo(fishCargo, nearbyMarketId)) {
      return { success: false, reason: "Bring this fish cargo to the market dock" };
    }
    if (contract.targetItemIdOrSpecies !== fishCargo.speciesId) {
      return { success: false, reason: "This contract requires a different species" };
    }
    if (contract.quantityFulfilled >= contract.quantityRequired) {
      return { success: false, reason: "Contract is already fully delivered" };
    }
    if (contract.minQuality && qualityRank(fishCargo.quality) < qualityRank(contract.minQuality)) {
      return { success: false, reason: `Contract requires ${contract.minQuality} quality or better` };
    }
    if (contract.minFreshness !== undefined && fishCargo.freshness < contract.minFreshness) {
      return { success: false, reason: `Contract requires at least ${contract.minFreshness}% freshness` };
    }
    if (contract.minWeightKg !== undefined && fishCargo.weightKg < contract.minWeightKg) {
      return { success: false, reason: `Contract requires at least ${contract.minWeightKg} kg` };
    }

    this.cargo.clearPointers(fishCargo);
    delete state.fishCargo[cargoId];
    contract.quantityFulfilled += 1;
    const completion = this.completeIfFulfilled(contract);
    return { success: true, delivered: 1, completed: completion.completed, rewardMoney: completion.rewardMoney };
  }

  public tick(): void {
    expireContracts(this.context.state);
    this.refillContracts();
  }

  /** Deterministic board refill from catalog templates. Max two active; honor requiredXp. */
  private refillContracts(): void {
    const { state, rng } = this.context;
    const active = state.contracts.filter((contract) => contract.status === "active");
    const occupiedTemplates = new Set(active.map((contract) => contract.templateId));
    let slots = CONTRACT_BOARD_LIMIT - active.length;
    if (slots <= 0) return;

    for (const template of ContentRegistry.contractTemplates.values()) {
      if (slots <= 0) break;
      if (occupiedTemplates.has(template.id)) continue;
      const requiredXp = template.requiredXp ?? 0;
      if (state.player.proficiencies[template.rewardSkill] < requiredXp) continue;
      const listing = this.instantiateFromTemplate(template);
      if (!listing) continue;
      state.contracts.push(listing);
      occupiedTemplates.add(template.id);
      slots -= 1;
    }
    if (rng.getState() !== state.metadata.rngState) this.context.persistRng();
  }

  private instantiateFromTemplate(template: ContractTemplateDefinition): ContractState | null {
    const { state, rng } = this.context;
    if (template.itemOrSpeciesPool.length === 0) return null;
    const poolIndex = template.itemOrSpeciesPool.length === 1
      ? 0
      : rng.intInclusive(0, template.itemOrSpeciesPool.length - 1);
    const targetItemIdOrSpecies = template.itemOrSpeciesPool[poolIndex];
    const quantityRequired = rng.intInclusive(template.quantityRange[0], template.quantityRange[1]);
    const item = ContentRegistry.items.get(targetItemIdOrSpecies);
    const fish = ContentRegistry.fishSpecies.get(targetItemIdOrSpecies);
    const baseValue = item?.baseValue ?? fish?.baseMarketValue;
    if (baseValue === undefined) return null;
    const minWeightKg = template.minWeightKgRange
      ? rng.intInclusive(template.minWeightKgRange[0], template.minWeightKgRange[1])
      : undefined;
    return {
      id: this.context.nextEntityId("contract"),
      templateId: template.id,
      requesterId: CONTRACT_REQUESTER_IDS[template.requesterName] ?? `npc.${template.requesterName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      type: template.type,
      targetItemIdOrSpecies,
      quantityRequired,
      quantityFulfilled: 0,
      minQuality: template.minQuality,
      minFreshness: template.minFreshness,
      minWeightKg,
      rewardMoney: Math.round(baseValue * quantityRequired * template.rewardBaseMultiplier),
      rewardSkillXp: {
        skill: template.rewardSkill,
        xp: quantityRequired * CONTRACT_SKILL_XP_PER_UNIT
      },
      expiresAtMinute: state.clock.currentMinute + template.durationMinutes,
      status: "active"
    };
  }

  private getActive(contractId: string): GameState["contracts"][number] | null {
    const { state } = this.context;
    const contract = state.contracts.find((candidate) => candidate.id === contractId);
    if (!contract || contract.status !== "active") return null;
    if (state.clock.currentMinute >= contract.expiresAtMinute) {
      refundAndExpireContract(state, contract);
      return null;
    }
    return contract;
  }

  private completeIfFulfilled(
    contract: GameState["contracts"][number]
  ): { completed: boolean; rewardMoney?: number } {
    const { state, events } = this.context;
    if (contract.quantityFulfilled < contract.quantityRequired) return { completed: false };
    contract.quantityFulfilled = contract.quantityRequired;
    contract.status = "completed";
    state.player.money += contract.rewardMoney;
    this.progression.addProficiencyXp(contract.rewardSkillXp.skill, contract.rewardSkillXp.xp);
    events.emit("ContractCompleted", {
      contractId: contract.id,
      rewardMoney: contract.rewardMoney,
      minute: state.clock.currentMinute
    });
    return { completed: true, rewardMoney: contract.rewardMoney };
  }
}
