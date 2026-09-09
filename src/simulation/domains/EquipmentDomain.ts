import { ContentRegistry } from "../../content/ContentRegistry";
import { CLOTHING_SLOT_ORDER, EQUIPMENT_SLOT_ORDER, presetLabel } from "../../content/equipment";
import type {
  CharacterEquipmentDto,
  CharacterEquipmentItemDto,
  InteractionResult
} from "../core/contracts";
import type {
  EquipmentId,
  EquipmentPresetId,
  EquipmentSlot,
  RodId
} from "../core/types";
import type { EquipmentEffectDefinition } from "../../content/types";
import type { DomainContext } from "./DomainContext";

const EQUIPMENT_SLOT_LABEL: Record<EquipmentSlot | "rod", string> = {
  head: "Head",
  outerwear: "Outerwear",
  feet: "Feet",
  "watering-tool": "Watering Tool",
  "harvest-tool": "Harvest Tool",
  rod: "Fishing Rod"
};

function percent(multiplier: number): number {
  return Math.round(Math.abs(1 - multiplier) * 100);
}

function effectLine(effect: EquipmentEffectDefinition): string {
  switch (effect.kind) {
    case "work-multiplier": {
      const names = effect.actions.map((action) => action.split(".")[1]!.replace("basic-cast", "casting").replace("sport-hook", "sport hooking"));
      return `${percent(effect.multiplier)}% less Work for ${names.join(" and ")}; integer rounding may limit small costs`;
    }
    case "crop-quality-chance":
      return `${percent(effect.multiplier)}% more chance for exceptional or prize crops; uses the same harvest roll`;
    case "crop-reach":
      return `+${effect.bonusMeters.toFixed(2)} m ${effect.actions.join("/")} reach`;
    case "annual-plant-matter-bonus":
      return `+${effect.quantity} Plant Matter from mature annual harvests when space allows`;
    case "sport-line-damage-multiplier":
      return `${percent(effect.multiplier)}% less sport line damage from overload and shake`;
    case "sport-brace-extra-multiplier":
      return `${percent(effect.multiplier)}% stronger extra resistance while bracing`;
  }
}

export class EquipmentDomain {
  constructor(private readonly context: DomainContext) {}

  public equipBlocker(): string | null {
    const { state } = this.context;
    if (this.context.isActionTimelineActive()) return "Finish or cancel the current action before changing gear";
    if (state.basicFishing || state.sportFishing) return "Finish fishing before changing gear";
    if (state.player.activeMountId) return "Dismount before changing gear";
    if (state.player.carriedFishCargoId) return "Put down the catch before changing gear";
    if (!state.player.activeBoatId) return null;
    const boat = state.boats[state.player.activeBoatId];
    if (!boat?.isDocked || Math.abs(boat.speed) > 0.15) {
      return "Moor the boat and come to a stop before changing gear";
    }
    return null;
  }

  public canReserve(equipmentId: EquipmentId): InteractionResult {
    const definition = ContentRegistry.equipment.get(equipmentId);
    if (!definition) return { success: false, reason: "Unknown equipment" };
    const equipment = this.context.state.player.equipment;
    if (equipment.ownedIds.includes(equipmentId)) {
      return { success: false, reason: "That equipment is already owned" };
    }
    const alreadyPending = Object.values(this.context.state.processingJobs).some(
      (job) => job.result.kind === "equipment" && job.result.equipmentId === equipmentId
    );
    if (alreadyPending) return { success: false, reason: "That equipment is already being made" };
    const reserved = this.pendingEquipmentCount();
    if (equipment.ownedIds.length + reserved >= equipment.wardrobeCapacity) {
      return { success: false, reason: "The wardrobe is full" };
    }
    return { success: true };
  }

  public grantCrafted(equipmentId: EquipmentId): InteractionResult {
    const definition = ContentRegistry.equipment.get(equipmentId);
    if (!definition) return { success: false, reason: "Unknown equipment" };
    const equipment = this.context.state.player.equipment;
    if (equipment.ownedIds.includes(equipmentId)) {
      return { success: false, reason: "That equipment is already owned" };
    }
    if (equipment.ownedIds.length >= equipment.wardrobeCapacity) {
      return { success: false, reason: "The wardrobe is full" };
    }
    equipment.ownedIds.push(equipmentId);
    return { success: true };
  }

  public equip(equipmentId: EquipmentId): InteractionResult {
    const blocker = this.equipBlocker();
    if (blocker) return { success: false, reason: blocker };
    const definition = ContentRegistry.equipment.get(equipmentId);
    if (!definition) return { success: false, reason: "Unknown equipment" };
    if (!this.context.state.player.equipment.ownedIds.includes(equipmentId)) {
      return { success: false, reason: "Craft this equipment before wearing it" };
    }
    this.context.state.player.equipment.equipped[definition.slot] = equipmentId;
    this.context.events.emit("EquipmentEquipped", {
      equipmentId,
      minute: this.context.state.clock.currentMinute
    });
    return { success: true };
  }

  public equipRod(rodId: RodId): InteractionResult {
    const blocker = this.equipBlocker();
    if (blocker) return { success: false, reason: blocker };
    if (!ContentRegistry.rods.has(rodId)) return { success: false, reason: "Unknown rod" };
    if (!this.context.state.player.ownedRodIds.includes(rodId)) {
      return { success: false, reason: "Own this rod before equipping it" };
    }
    this.context.state.player.equippedRodId = rodId;
    this.context.events.emit("EquipmentEquipped", {
      rodId,
      minute: this.context.state.clock.currentMinute
    });
    return { success: true };
  }

  public savePreset(presetId: EquipmentPresetId): InteractionResult {
    const preset = this.context.state.player.equipment.presets[presetId];
    if (!preset) return { success: false, reason: "Unknown outfit preset" };
    const equipped = this.context.state.player.equipment.equipped;
    for (const slot of CLOTHING_SLOT_ORDER) preset[slot] = equipped[slot];
    this.context.events.emit("EquipmentPresetSaved", {
      presetId,
      minute: this.context.state.clock.currentMinute
    });
    return { success: true };
  }

  public applyPreset(presetId: EquipmentPresetId): InteractionResult {
    const blocker = this.equipBlocker();
    if (blocker) return { success: false, reason: blocker };
    const equipment = this.context.state.player.equipment;
    const preset = equipment.presets[presetId];
    if (!preset) return { success: false, reason: "Unknown outfit preset" };
    for (const slot of CLOTHING_SLOT_ORDER) {
      const equipmentId = preset[slot];
      const definition = ContentRegistry.equipment.get(equipmentId);
      if (!definition || definition.slot !== slot || !equipment.ownedIds.includes(equipmentId)) {
        return { success: false, reason: `${presetLabel(presetId)} outfit contains unavailable gear` };
      }
    }
    // Validate the full preset before mutating any slot: applying an outfit is atomic.
    for (const slot of CLOTHING_SLOT_ORDER) equipment.equipped[slot] = preset[slot];
    this.context.events.emit("EquipmentPresetApplied", {
      presetId,
      minute: this.context.state.clock.currentMinute
    });
    return { success: true };
  }

  public inspectCharacter(): CharacterEquipmentDto {
    const { player } = this.context.state;
    const equippedIds = new Set(Object.values(player.equipment.equipped));
    const ownedEquipment: CharacterEquipmentItemDto[] = player.equipment.ownedIds
      .map((id) => ContentRegistry.equipment.get(id))
      .filter((definition): definition is NonNullable<typeof definition> => Boolean(definition))
      .map((definition) => ({
        id: definition.id,
        name: definition.name,
        description: definition.description,
        slot: definition.slot,
        equipped: equippedIds.has(definition.id),
        effectLines: definition.effects.length > 0 ? definition.effects.map(effectLine) : ["No specialist bonus"],
        icon: definition.icon,
        assetId: definition.presentation.assetId ?? null,
        scale: definition.presentation.scale
      }));
    const ownedRods = player.ownedRodIds.flatMap((id) => {
      const rod = ContentRegistry.rods.get(id);
      if (!rod) return [];
      return [{
        id,
        name: rod.name,
        equipped: id === player.equippedRodId,
        effectLines: [
          `${rod.reelPower} reel power · ${rod.maxSafeTension} safe tension`,
          `Handles ${rod.maximumCargoClass} catch · ${rod.allowedHabitats.join(", ")}`
        ],
        assetId: rod.assetId
      }];
    });
    const slots: CharacterEquipmentDto["slots"] = [
      ...EQUIPMENT_SLOT_ORDER.map((slot) => {
        const equippedId = player.equipment.equipped[slot];
        return {
          slot,
          label: EQUIPMENT_SLOT_LABEL[slot],
          equippedId,
          equippedName: ContentRegistry.equipment.get(equippedId)?.name ?? equippedId
        };
      }),
      {
        slot: "rod" as const,
        label: EQUIPMENT_SLOT_LABEL.rod,
        equippedId: player.equippedRodId,
        equippedName: ContentRegistry.rods.get(player.equippedRodId)?.name ?? player.equippedRodId
      }
    ];
    const blocker = this.equipBlocker();
    return {
      slots,
      ownedEquipment,
      ownedRods,
      presets: (["field", "sea"] as const).map((id) => ({
        id,
        label: presetLabel(id),
        items: { ...player.equipment.presets[id] }
      })),
      wardrobe: {
        used: player.equipment.ownedIds.length,
        reserved: this.pendingEquipmentCount(),
        capacity: player.equipment.wardrobeCapacity
      },
      canEquip: blocker === null,
      equipBlocker: blocker ?? undefined
    };
  }

  private pendingEquipmentCount(): number {
    return Object.values(this.context.state.processingJobs).filter(
      (job) => job.result.kind === "equipment"
    ).length;
  }
}
