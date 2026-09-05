import type { CargoClass, PlayerState, RodClass } from "../core/types";
import type { SeededRng } from "../core/Rng";

const CARGO_CLASS_RANK: Record<CargoClass, number> = {
  small: 0,
  medium: 1,
  large: 2,
  gargantuan: 3
};

const ROD_CLASS_RANK: Record<RodClass, number> = {
  willow: 0,
  river: 1,
  "heavy-sport": 2,
  offshore: 3,
  master: 4
};

const QUALITY_RANK: Record<string, number> = {
  common: 0,
  fine: 1,
  exceptional: 2,
  trophy: 3
};

/** Physical carry occupies both hands until a cargo transaction releases it. */
export function freeHandsBlocker(player: Pick<PlayerState, "carriedFishCargoId">): string | null {
  return player.carriedFishCargoId ? "Sell or release the carried fish before using tools" : null;
}

export function cargoClassFits(fishClass: CargoClass, slotMax: CargoClass): boolean {
  return CARGO_CLASS_RANK[fishClass] <= CARGO_CLASS_RANK[slotMax];
}

export function rodMeetsMinimum(equipped: RodClass, minimum: RodClass): boolean {
  return ROD_CLASS_RANK[equipped] >= ROD_CLASS_RANK[minimum];
}

export function qualityRank(quality: string | undefined): number {
  if (!quality) return -1;
  return QUALITY_RANK[quality] ?? -1;
}

export function scrapsForCargoClass(cargoClass: CargoClass): number {
  switch (cargoClass) {
    case "small":
      return 1;
    case "medium":
      return 2;
    case "large":
    case "gargantuan":
      return 3;
  }
}

function nextGaussian(rng: SeededRng): number {
  const u1 = Math.max(1e-12, rng.nextFloat());
  const u2 = rng.nextFloat();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function rollSpeciesWeightKg(
  weightKg: { min: number; average?: number; max: number },
  rng: SeededRng
): number {
  const min = weightKg.min;
  const max = weightKg.max;
  const average = typeof weightKg.average === "number" ? weightKg.average : (min + max) / 2;
  const sigma = Math.max(0.01, (max - min) / 6);
  return Number(Math.min(max, Math.max(min, average + nextGaussian(rng) * sigma)).toFixed(1));
}

/**
 * Contracts run in two lanes: item delivery and physical fish cargo.
 * `bulk-order` is an item lane order — `ContractDomain.deliverItems` already
 * accepts it, and only the feasibility and refund branches were still asking
 * `type === "produce"`, which routed it into the fish lane and made every
 * bulk-order template silently ungeneratable.
 */
export function isProduceContractType(type: string): boolean {
  return type === "produce" || type === "bulk-order";
}
