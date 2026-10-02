import { describe, expect, it } from "vitest";
import predecessor from "../fixtures/save_v75_collision_polish_predecessor.json";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { migrateSatchelSlots77 } from "../../src/persistence/migrateSatchelSlots77";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { PLAYER_SATCHEL_SLOT_COUNT } from "../../src/simulation/inventory/InventoryLimits";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";

const legacy = () => structuredClone(predecessor) as unknown as SaveEnvelope;

describe("player satchel schema 77", () => {
  it("appends empty slots on the player satchel and leaves every other inventory", () => {
    const saved = legacy();
    expect(validateSaveEnvelope(saved)).toBe(true);
    const id = saved.state.player.inventoryId;
    const before = structuredClone(saved.state.inventories);
    expect(before[id].slotCount).toBeLessThan(PLAYER_SATCHEL_SLOT_COUNT);

    const after = migrateSaveData(saved);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(after.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(after.state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);

    const satchel = after.state.inventories[id];
    expect(satchel.slotCount).toBe(PLAYER_SATCHEL_SLOT_COUNT);
    expect(satchel.slots).toHaveLength(PLAYER_SATCHEL_SLOT_COUNT);
    expect(satchel.slots.slice(0, before[id].slots.length)).toEqual(before[id].slots);
    expect(satchel.slots.slice(before[id].slots.length).every((slot) => !slot.itemId)).toBe(true);

    for (const [inventoryId, inventory] of Object.entries(before)) {
      if (inventoryId === id) continue;
      expect(after.state.inventories[inventoryId], inventoryId).toEqual(inventory);
    }
    expect(saved.state.inventories).toEqual(before);
    expect(migrateSaveData(after)).toEqual(after);
  });

  it("does not grow a satchel that is already at the new count", () => {
    const state = legacy().state;
    const inventory = state.inventories[state.player.inventoryId];
    while (inventory.slots.length < PLAYER_SATCHEL_SLOT_COUNT) inventory.slots.push({});
    inventory.slotCount = inventory.slots.length;
    inventory.slots[0] = { itemId: "produce.wheat", quantity: 3, quality: "fine" };
    const before = structuredClone(inventory);

    migrateSatchelSlots77(state);
    expect(state.inventories[state.player.inventoryId]).toEqual(before);
    expect(state.schemaVersion).toBe(77);
    expect(state.world.layoutRevision).toBe(40);
  });
});
