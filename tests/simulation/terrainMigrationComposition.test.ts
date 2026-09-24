import { describe, expect, it, vi } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { createWorldEnvironmentLayout, createWorldStaticPlacements } from "../../src/world/WorldEnvironmentLayout";
import fixture from "../fixtures/save_v32_layout12.json";

vi.mock("../../src/world/WorldEnvironmentLayout", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/world/WorldEnvironmentLayout")>();
  return {
    ...original,
    createWorldStaticPlacements: vi.fn(original.createWorldStaticPlacements),
    createWorldEnvironmentLayout: vi.fn(() => {
      throw new Error("Save migration must not request presentation ground cover");
    })
  };
});

describe("terrain migration composition boundary", () => {
  it("recovers the retained save through real seeded static placements without requesting the renderer layout", () => {
    ContentRegistry.initializeAndValidate();
    const before = structuredClone(fixture) as unknown as SaveEnvelope;
    const untouched = structuredClone(before);
    const after = migrateSaveData(before);

    expect(createWorldStaticPlacements).toHaveBeenNthCalledWith(1, before.state.worldSeed);
    expect(createWorldEnvironmentLayout).not.toHaveBeenCalled();
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(before).toEqual(untouched);
    // One cached request per consuming step: layouts 13–16, the shared mainland
    // recovery at v50–v54, the Sunreach layout-28 step, v59 and v60. The cache
    // keeps generation shared; there is no extra request per actor.
    expect(createWorldStaticPlacements).toHaveBeenCalledTimes(12);
    // The no-op repeat load requests nothing.
    expect(migrateSaveData(after)).toEqual(after);
    expect(createWorldStaticPlacements).toHaveBeenCalledTimes(12);
  });

  it("shares cached static placements with the renderer without reading its deferred cover", async () => {
    const original = await vi.importActual<typeof import("../../src/world/WorldEnvironmentLayout")>("../../src/world/WorldEnvironmentLayout");
    const seed = fixture.state.worldSeed;
    const placements = original.createWorldStaticPlacements(seed);
    const layout = original.createWorldEnvironmentLayout(seed);
    expect(placements.length).toBeGreaterThan(0);
    expect(original.createWorldStaticPlacements(seed)).toBe(placements);
    expect(layout.staticPlacements).toBe(placements);
    expect(original.createWorldEnvironmentLayout(seed)).toBe(layout);
  });
});
