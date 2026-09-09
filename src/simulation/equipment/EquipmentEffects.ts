import { ContentRegistry } from "../../content/ContentRegistry";
import type { EquipmentEffectDefinition } from "../../content/types";
import type {
  EquipmentId,
  GameState,
  PlayerState,
  WorkActionId
} from "../core/types";

export type CropInteractionAction = "water" | "harvest" | "inspect";

export const BASE_CROP_INTERACTION_REACH_METERS = 2.5;

function equippedEffects(player: Readonly<PlayerState>): EquipmentEffectDefinition[] {
  const effects: EquipmentEffectDefinition[] = [];
  for (const equipmentId of Object.values(player.equipment.equipped)) {
    const definition = ContentRegistry.equipment.get(equipmentId);
    if (definition) effects.push(...definition.effects);
  }
  return effects;
}

export function equippedEquipmentIds(player: Readonly<PlayerState>): EquipmentId[] {
  return Object.values(player.equipment.equipped);
}

export function equipmentWorkMultiplier(
  state: Readonly<GameState>,
  action: WorkActionId | undefined
): number {
  if (!action) return 1;
  return equippedEffects(state.player).reduce((product, effect) =>
    effect.kind === "work-multiplier" && effect.actions.includes(action)
      ? product * effect.multiplier
      : product,
  1);
}

export function cropInteractionReachMeters(
  state: Readonly<GameState>,
  action: CropInteractionAction
): number {
  const bonus = equippedEffects(state.player).reduce((sum, effect) =>
    effect.kind === "crop-reach" && effect.actions.includes(action)
      ? sum + effect.bonusMeters
      : sum,
  0);
  return BASE_CROP_INTERACTION_REACH_METERS + bonus;
}

export function cropQualityChanceMultiplier(state: Readonly<GameState>): number {
  return equippedEffects(state.player).reduce((product, effect) =>
    effect.kind === "crop-quality-chance" ? product * effect.multiplier : product,
  1);
}

export function annualPlantMatterBonus(state: Readonly<GameState>): number {
  return equippedEffects(state.player).reduce((quantity, effect) =>
    effect.kind === "annual-plant-matter-bonus" ? quantity + effect.quantity : quantity,
  0);
}

export interface FishingEquipmentEffectSnapshot {
  lineIntegrityDamageMultiplier: number;
  braceResistanceMultiplier: number;
}

export const NEUTRAL_FISHING_EQUIPMENT_EFFECTS: FishingEquipmentEffectSnapshot = {
  lineIntegrityDamageMultiplier: 1,
  braceResistanceMultiplier: 1
};

export function snapshotFishingEquipmentEffects(
  state: Readonly<GameState>
): FishingEquipmentEffectSnapshot {
  return equippedEffects(state.player).reduce<FishingEquipmentEffectSnapshot>(
    (snapshot, effect) => {
      if (effect.kind === "sport-line-damage-multiplier") {
        snapshot.lineIntegrityDamageMultiplier *= effect.multiplier;
      } else if (effect.kind === "sport-brace-extra-multiplier") {
        snapshot.braceResistanceMultiplier *= effect.multiplier;
      }
      return snapshot;
    },
    { ...NEUTRAL_FISHING_EQUIPMENT_EFFECTS }
  );
}
