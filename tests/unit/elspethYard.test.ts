import { describe, expect, it } from "vitest";
import { ELSPETH_HOME_ANCHOR, ELSPETH_TRAPPED_ANCHOR, NPCS } from "../../src/content/npcs";
import { migrateElspethYard71 } from "../../src/persistence/migrateElspethYard71";
import { NPC_STATION_BEATS } from "../../src/render/scene/npcStationBeat";
import type { GameState } from "../../src/simulation/core/types";
import { farmLocalToWorld, STARTER_FARM_LAYOUT } from "../../src/world/FarmLayout";
import { FARMHOUSE_OUTSIDE_DOOR, FARMHOUSE_WAKE_POSE, FARMHOUSE_INTERIOR_BOUNDS } from "../../src/world/FarmhouseInterior";
import { WorldLayout } from "../../src/world/WorldLayout";

describe("Elspeth's farmhouse yard", () => {
  it("stands clear of the fence, the doorway and the house, on walkable ground", () => {
    const home = NPCS.find((npc) => npc.id === "npc.elspeth")!.anchor;
    expect(home).toMatchObject(ELSPETH_HOME_ANCHOR);
    expect(WorldLayout.isWalkable(home.x, home.z)).toBe(true);
    expect(WorldLayout.isWater(home.x, home.z)).toBe(false);

    const origin = STARTER_FARM_LAYOUT.origin;
    const local = { x: home.x - origin.x, z: home.z - origin.z };
    const house = STARTER_FARM_LAYOUT.farmsteadAnchors.find((anchor) => anchor.id === "farmhouse")!;
    const well = STARTER_FARM_LAYOUT.farmsteadAnchors.find((anchor) => anchor.id === "well")!;
    expect(Math.hypot(local.x - house.x, local.z - house.z)).toBeGreaterThan(house.clearanceRadius + 0.8);
    expect(Math.hypot(local.x - well.x, local.z - well.z)).toBeGreaterThan(well.clearanceRadius + 0.6);
    expect(Math.hypot(home.x - FARMHOUSE_OUTSIDE_DOOR.x, home.z - FARMHOUSE_OUTSIDE_DOOR.z))
      .toBeGreaterThan(FARMHOUSE_OUTSIDE_DOOR.radiusMeters + 1.5);

    const beat = NPC_STATION_BEATS["npc.elspeth"].waypoints;
    for (const step of beat) {
      const x = home.x + step.dx;
      const z = home.z + step.dz;
      expect(WorldLayout.isWalkable(x, z), `${step.dx},${step.dz}`).toBe(true);
      for (const fence of STARTER_FARM_LAYOUT.fenceAnchors) {
        const world = farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, fence);
        expect(Math.hypot(x - world.x, z - world.z)).toBeGreaterThan(1.8);
      }
    }

    const dusk = NPCS.find((npc) => npc.id === "npc.elspeth")!.schedule![0].position;
    expect(dusk.locationName).toBe("Village Inn Porch");
    expect(WorldLayout.isWalkable(dusk.x, dusk.z)).toBe(true);
    expect(Math.hypot(home.x - dusk.x, home.z - dusk.z)).toBeGreaterThan(20);
  });

  it("lifts a player out of the old fence pocket and leaves everyone else", () => {
    const trapped = {
      schemaVersion: 70,
      player: { x: ELSPETH_TRAPPED_ANCHOR.x, y: 1, z: ELSPETH_TRAPPED_ANCHOR.z }
    } as GameState;
    const moved = migrateElspethYard71(trapped);
    expect(moved.schemaVersion).toBe(71);
    expect(Math.hypot(moved.player.x - ELSPETH_TRAPPED_ANCHOR.x, moved.player.z - ELSPETH_TRAPPED_ANCHOR.z)).toBeGreaterThan(2);
    expect(WorldLayout.isWalkable(moved.player.x, moved.player.z)).toBe(true);

    const elsewhere = { schemaVersion: 70, player: { x: 10, y: 2, z: 10 } } as GameState;
    migrateElspethYard71(elsewhere);
    expect(elsewhere.player).toMatchObject({ x: 10, y: 2, z: 10 });
  });

  it("wakes inside the farmhouse, off the doorway", () => {
    expect(FARMHOUSE_WAKE_POSE.x).toBeGreaterThan(FARMHOUSE_INTERIOR_BOUNDS.minX);
    expect(FARMHOUSE_WAKE_POSE.x).toBeLessThan(FARMHOUSE_INTERIOR_BOUNDS.maxX);
    expect(FARMHOUSE_WAKE_POSE.z).toBeGreaterThan(FARMHOUSE_INTERIOR_BOUNDS.minZ);
    expect(FARMHOUSE_WAKE_POSE.z).toBeLessThan(FARMHOUSE_INTERIOR_BOUNDS.maxZ);
    expect(WorldLayout.isInterior(FARMHOUSE_WAKE_POSE.x, FARMHOUSE_WAKE_POSE.z)).toBe(true);
  });
});
