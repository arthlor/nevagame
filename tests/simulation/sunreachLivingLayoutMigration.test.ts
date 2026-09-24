import { describe, expect, it } from "vitest";
import predecessor from "../fixtures/save_v56_contract_settlement_predecessor.json";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { migrateSunreachLayout28 } from "../../src/persistence/migrateSunreachLayout28";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { playerPoseFromMount, isMountableTraversalPoint } from "../../src/simulation/mounts/Mounts";
import { SUNREACH_ANCHORS } from "../../src/world/WorldIslands";
import { WorldLayout } from "../../src/world/WorldLayout";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { SUNREACH_DRESSING, SUNREACH_LIVING_ROUTES } from "../../src/world/SunreachLivingLayout";

const legacy = () => structuredClone(predecessor) as unknown as SaveEnvelope;
const terracePose = SUNREACH_ANCHORS.terraceFarm;

function findTerraceMountPoint(): { x: number; z: number } {
  const route = SUNREACH_LIVING_ROUTES.find((candidate) => candidate.id === "route.sunreach.terrace-service-loop");
  if (!route) throw new Error("Missing Sunreach terrace service loop");
  for (let index = 1; index < route.points.length; index += 1) {
    const start = route.points[index - 1];
    const end = route.points[index];
    const samples = Math.ceil(Math.hypot(end.x - start.x, end.z - start.z) * 2);
    for (let sample = 0; sample <= samples; sample += 1) {
      const t = sample / samples;
      const point = { x: start.x + (end.x - start.x) * t, z: start.z + (end.z - start.z) * t };
      if (isMountableTraversalPoint(point.x, point.z)) return point;
    }
  }
  throw new Error("The Sunreach terrace service loop has no mountable support");
}

describe("Sunreach living-settlement layout28 recovery", () => {
  it("accepts the retained schema56/layout27 predecessor", () => {
    const saved = legacy();
    expect(saved.schemaVersion).toBe(56);
    expect(saved.state.schemaVersion).toBe(56);
    expect(saved.state.world.layoutRevision).toBe(27);
    expect(validateSaveEnvelope(saved)).toBe(true);
  });

  it.each([false, true])("re-grounds a retained terrace pose, mounted=%s, without replacing crop or economy truth", (mounted) => {
    const saved = legacy();
    const state = saved.state;
    const initialPose = mounted ? findTerraceMountPoint() : terracePose;
    const initialY = WorldLayout.traversalSurfaceHeight(initialPose.x, initialPose.z);
    Object.assign(state.player, {
      ...initialPose,
      y: mounted ? initialY + 0.5 : 99,
      currentRegionId: WorldLayout.regionAt(initialPose.x, initialPose.z)
    });

    let mountId: string | null = null;
    if (mounted) {
      const mount = state.mounts["mount.donkey_starter"]!;
      mountId = mount.id;
      Object.assign(mount, { ...initialPose, y: initialY });
      state.player.activeMountId = mountId;
      Object.assign(state.player, playerPoseFromMount(mount));
    }

    const untouched = structuredClone(saved);
    expect(validateSaveEnvelope(saved)).toBe(true);
    expect(WorldLayout.isWalkable(terracePose.x, terracePose.z)).toBe(true);
    expect(WorldLayout.isWater(terracePose.x, terracePose.z)).toBe(false);

    const after = migrateSaveData(saved);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(after.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(saved).toEqual(untouched);

    const expectedX = initialPose.x;
    const expectedZ = initialPose.z;
    expect(after.state.player.x).toBe(expectedX);
    expect(after.state.player.z).toBe(expectedZ);
    if (mounted) {
      const mount = after.state.mounts[mountId!]!;
      expect(isMountableTraversalPoint(mount.x, mount.z)).toBe(true);
      expect(mount.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(mount.x, mount.z), 6);
      expect(after.state.player).toMatchObject(playerPoseFromMount(mount));
    } else {
      expect(after.state.player.y).toBeCloseTo(initialY + 0.5, 6);
      expect(after.state.player.currentRegionId).toBe(WorldLayout.regionAt(terracePose.x, terracePose.z));
    }

    for (const key of ["farms", "crops", "inventories", "processingJobs", "fishCargo", "quests", "journal", "clock", "weather", "markets", "boats", "metadata"] as const) {
      expect(after.state[key], key).toEqual(untouched.state[key]);
    }
    for (const [id, before] of Object.entries(untouched.state.world.structures)) {
      const structure = after.state.world.structures[id]!;
      expect({ ...structure, y: before.y }, id).toEqual(before);
      if (WorldLayout.terrainPatchAt(before.x, before.z)?.islandId === "island.sunreach") {
        expect(structure.y).toBeCloseTo(WorldLayout.terrainHeight(before.x, before.z), 6);
      }
    }
    if (!mounted) expect(after.state.mounts).toEqual(untouched.state.mounts);
    expect(migrateSaveData(after)).toEqual(after);
  });

  it("moves a player out of a newly authored rock while keeping the pose on Sunreach", () => {
    const saved = legacy();
    const state = saved.state;
    const rock = SUNREACH_DRESSING.find((placement) => placement.assetId === "rock_field_a")!;
    Object.assign(state.player, { x: rock.x, y: 99, z: rock.z, activeMountId: null, activeBoatId: null });
    state.world.layoutRevision = 27;

    const untouched = structuredClone(state);
    const recovered = migrateSunreachLayout28(state);
    expect(recovered.world.layoutRevision).toBe(28);
    expect(Math.hypot(recovered.player.x - rock.x, recovered.player.z - rock.z)).toBeGreaterThan(0.5);
    expect(WorldLayout.terrainPatchAt(recovered.player.x, recovered.player.z)?.islandId).toBe("island.sunreach");
    expect(WorldLayout.isWalkable(recovered.player.x, recovered.player.z)).toBe(true);
    expect(WorldLayout.isWater(recovered.player.x, recovered.player.z)).toBe(false);
    expect(recovered.player.y).toBeCloseTo(
      WorldLayout.traversalSurfaceHeight(recovered.player.x, recovered.player.z) + 0.5,
      6
    );
    expect(state).toEqual(untouched);
    for (const key of ["farms", "crops", "inventories", "processingJobs", "fishCargo", "contracts", "quests", "journal", "clock", "weather", "markets", "boats", "metadata"] as const) {
      expect(recovered[key], key).toEqual(state[key]);
    }
  });
});
