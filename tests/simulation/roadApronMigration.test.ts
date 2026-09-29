import { describe, expect, it } from "vitest";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { ROAD_APRON_LAYOUT_REVISION } from "../../src/persistence/migrateRoadApron74";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { WorldLayout, WORLD_ROUTE_JUNCTIONS } from "../../src/world/WorldLayout";
import { headSchemaDevelopmentSave } from "../helpers/headSchemaDevelopmentSave";
import predecessor from "../fixtures/save_v69_layout37_road_network_predecessor.json";

const legacy = () => structuredClone(predecessor) as unknown as SaveEnvelope;
const PRESERVED = ["farms", "crops", "inventories", "processingJobs", "fishCargo", "contracts",
  "quests", "journal", "clock", "weather", "boats", "markets"] as const;

function openFork(): { x: number; z: number } {
  const fork = WORLD_ROUTE_JUNCTIONS.find((junction) => junction.id.startsWith("mainland-junction:")
    && WorldLayout.isWalkable(junction.center.x, junction.center.z)
    && !WorldLayout.isWater(junction.center.x, junction.center.z));
  if (!fork) throw new Error("No walkable mainland junction");
  return { x: fork.center.x, z: fork.center.z };
}

describe("road apron layout 39 recovery", () => {
  it("re-grounds an actor standing on a joined fork", () => {
    const saved = headSchemaDevelopmentSave(legacy());
    saved.state.world.layoutRevision = 38;
    const fork = openFork();
    Object.assign(saved.state.player, { ...fork, y: 99, activeBoatId: null, activeMountId: null });
    const before = structuredClone(saved);
    const after = migrateSaveData(saved);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(ROAD_APRON_LAYOUT_REVISION).toBe(39);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect({ x: after.state.player.x, z: after.state.player.z }).toEqual(fork);
    expect(after.state.player.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(fork.x, fork.z) + 0.5, 6);
    for (const key of PRESERVED) expect(after.state[key], key).toEqual(before.state[key]);
    expect(saved).toEqual(before);
    expect(migrateSaveData(after)).toEqual(after);
  });
});
