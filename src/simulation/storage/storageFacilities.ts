import type { CargoClass, CarryLocationType, StorageKind, StructureId } from "../core/types";

/**
 * Authored storage facilities. Each is anchored to a structure that already
 * exists in `state.world.structures`, so a save never needs a new layout to
 * reach one: the facility's capacity and preservation live here, and anything
 * stored in it is ordinary fish cargo or inventory state.
 *
 * `fishLocation` must be a `CarryLocationType` whose freshness rule already
 * exists in `FRESHNESS_STORAGE_MODIFIERS`; the crate packs at the open-air
 * rate (and accepts loose ice), while the cold room is refrigerated and needs
 * none.
 */
export interface StorageFacilityDefinition {
  kind: StorageKind;
  structureId: StructureId;
  name: string;
  /** Stackable-goods capacity, held in its own `state.inventories` record. */
  goodsSlots: number;
  /** Physical fish-cargo capacity; 0 means the facility stores no fish. */
  fishSlots: number;
  /** Location written on stored cargo; `null` when no fish may be stored. */
  fishLocation: CarryLocationType | null;
  maximumCargoClass: CargoClass;
  interactionRadiusMeters: number;
  /** Feature that must be earned before the facility accepts anything. */
  requiredFeatureId?: string;
  /** Player-facing gate copy shown while `requiredFeatureId` is missing. */
  lockedReason?: string;
}

export const STORAGE_FACILITIES: ReadonlyArray<StorageFacilityDefinition> = [
  {
    kind: "crate",
    structureId: "struct.kitchen",
    name: "Farm Crate",
    goodsSlots: 8,
    fishSlots: 2,
    fishLocation: "crate",
    maximumCargoClass: "medium",
    interactionRadiusMeters: 2.6
  },
  {
    kind: "cold-storage",
    structureId: "struct.harbor_fish_table",
    name: "Harbor Cold Room",
    goodsSlots: 8,
    fishSlots: 6,
    fishLocation: "cold-storage",
    maximumCargoClass: "gargantuan",
    interactionRadiusMeters: 3,
    // The cold room is the top storage stage: the harbor charter earns it.
    requiredFeatureId: "feature.maritime_guild_charter",
    lockedReason: "Requires the maritime guild charter"
  }
];

/** Barn and warehouse stages are not authored yet, so lookups are partial. */
export const STORAGE_FACILITY_BY_KIND: Readonly<Partial<Record<StorageKind, StorageFacilityDefinition>>> =
  Object.freeze(
    Object.fromEntries(STORAGE_FACILITIES.map((facility) => [facility.kind, facility]))
  );

export function storageInventoryId(kind: StorageKind): string {
  return `inv.storage.${kind}`;
}

export function storageFacilityForStructure(structureId: StructureId): StorageFacilityDefinition | null {
  return STORAGE_FACILITIES.find((facility) => facility.structureId === structureId) ?? null;
}
