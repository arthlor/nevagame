import { afterEach, describe, expect, it, vi } from "vitest";
import { WorldLayout, type LandmarkId } from "../../src/world/WorldLayout";
import { HARBOR_MAIN_PIER } from "../../src/world/WorldAnchors";
import { INTERACTION_PLACEMENT_OVERRIDES } from "../../src/world/InteractionPlacements";

const LANDMARKS: readonly LandmarkId[] = [
  "farmhouse", "well", "bridge", "fish-market", "lighthouse", "windmill", "produce-stall", "dock"
];

describe("WorldLayout landmarks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete INTERACTION_PLACEMENT_OVERRIDES.dock;
  });

  it("resolves every landmark to a finite authored pose", () => {
    for (const id of LANDMARKS) {
      const landmark = WorldLayout.landmark(id);
      expect(landmark.id).toBe(id);
      for (const value of [landmark.x, landmark.z, landmark.yOffset, landmark.rotationY, landmark.scale]) {
        expect(Number.isFinite(value), `${id}`).toBe(true);
      }
    }
  });

  it("keeps the dock's deck datum on the dock landmark", () => {
    const dock = WorldLayout.landmark("dock");
    expect(dock.yOffset).toBe(
      WorldLayout.terrainHeight(HARBOR_MAIN_PIER.supportDatum.x, HARBOR_MAIN_PIER.supportDatum.z)
        - WorldLayout.terrainHeight(HARBOR_MAIN_PIER.x, HARBOR_MAIN_PIER.z)
    );
  });

  // Per-sample ground, water and rain queries reach `landmark()` and the pier
  // footprint tests many times per physics step and per raindrop. Building every
  // landmark per call evaluated the dock datum's two terrain heights each time;
  // the loaded wagon spent most of its physics step there.
  it("answers pose-only queries without evaluating terrain height", () => {
    const dock = WorldLayout.landmark("dock");
    const terrainHeight = vi.spyOn(WorldLayout, "terrainHeight");
    for (const id of LANDMARKS.filter((candidate) => candidate !== "dock")) WorldLayout.landmark(id);
    WorldLayout.isPierDeck(dock.x, dock.z);
    WorldLayout.isPierStairs(dock.x, dock.z);
    WorldLayout.isPierDeck(dock.x + 200, dock.z + 200);
    WorldLayout.isPierStairs(dock.x + 200, dock.z + 200);
    expect(terrainHeight).not.toHaveBeenCalled();
    WorldLayout.landmark("dock");
    expect(terrainHeight).toHaveBeenCalledTimes(2);
  });

  it("moves the pier footprint with a live Place-mode dock override", () => {
    const dock = WorldLayout.landmark("dock");
    const moved = { x: dock.x + 60, z: dock.z - 60, rotationY: 0.4 };
    expect(WorldLayout.isPierDeck(moved.x, moved.z)).toBe(false);
    INTERACTION_PLACEMENT_OVERRIDES.dock = moved;
    expect(WorldLayout.isPierDeck(moved.x, moved.z)).toBe(true);
    expect(WorldLayout.landmark("dock")).toMatchObject(moved);
    // A reference taken before the edit follows it too.
    expect(dock.x).toBe(moved.x);
  });
});
