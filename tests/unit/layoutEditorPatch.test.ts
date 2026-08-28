import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, afterEach } from "vitest";

import {
  allocateCopyId,
  createFarmStructureTag,
  createLandmarkTag,
  formatWorldCoord,
  rotateOffsetY,
  transformPointWithPose
} from "../../src/layout-editor/layoutEdit";
import { applyLayoutEditLiveSession } from "../../src/layout-editor/layoutEditLiveSession";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { STARTER_FARM_LAYOUT, worldToFarmLocal } from "../../src/world/FarmLayout";
import { FARMHOUSE_OUTSIDE_DOOR } from "../../src/world/FarmhouseInterior";
import { applyPlacementOverrides } from "../../src/world/WorldEnvironmentLayout";
import {
  applyLayoutEditToSources,
  evalLayoutNumber,
  isLayoutEditCommit,
  LayoutEditPatchError,
  planLayoutEdit,
  readLayoutSources
} from "../../tools/layout-editor/patchPlacement";
import { Simulation } from "../../src/simulation/Simulation";
import { layoutEditorPlugin, isLocalLayoutEditorHost } from "../../tools/vite/layoutEditorPlugin";
import { VILLAGE_MARKET } from "../../src/world/WorldAnchors";
import {
  debugRelocateProcessingStationApproach,
  getProcessingStationApproach,
  getProcessingStationFrontPosition,
  PROCESSING_STATION_IDS
} from "../../src/world/ProcessingStationApproach";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("layout editor math", () => {
  it("round-trips the farmhouse porch door offset through a yaw change", () => {
    const farmhouse = {
      x: STARTER_FARM_LAYOUT.origin.x + 8,
      z: STARTER_FARM_LAYOUT.origin.z + 1.5,
      rotationY: Math.PI + 0.08
    };
    const moved = {
      x: farmhouse.x + 2,
      z: farmhouse.z - 1,
      rotationY: farmhouse.rotationY + 0.4
    };
    const nextDoor = transformPointWithPose({
      point: { x: FARMHOUSE_OUTSIDE_DOOR.x, z: FARMHOUSE_OUTSIDE_DOOR.z },
      from: farmhouse,
      to: moved
    });
    const local = rotateOffsetY(
      { x: FARMHOUSE_OUTSIDE_DOOR.x - farmhouse.x, z: FARMHOUSE_OUTSIDE_DOOR.z - farmhouse.z },
      -farmhouse.rotationY
    );
    const restored = rotateOffsetY(local, farmhouse.rotationY);
    expect(restored.x).toBeCloseTo(FARMHOUSE_OUTSIDE_DOOR.x - farmhouse.x, 8);
    expect(restored.z).toBeCloseTo(FARMHOUSE_OUTSIDE_DOOR.z - farmhouse.z, 8);
    expect(nextDoor.x).not.toBeCloseTo(FARMHOUSE_OUTSIDE_DOOR.x, 2);
  });

  it("converts farmstead world coordinates to farm-local", () => {
    const world = { x: -57, z: -53.5 };
    const local = worldToFarmLocal(STARTER_FARM_LAYOUT.farmId, world);
    expect(local.x).toBeCloseTo(8, 8);
    expect(local.z).toBeCloseTo(1.5, 8);
  });
});

describe("layout editor patcher", () => {
  it("rejects unknown ids", () => {
    const sources = readLayoutSources(ROOT);
    expect(() =>
      applyLayoutEditToSources(sources, {
        kind: "authored-detail",
        id: "authored.missing.never",
        x: 1,
        z: 2,
        rotationY: 0
      })
    ).toThrow(LayoutEditPatchError);
  });

  it("rejects invalid commit payloads", () => {
    expect(isLayoutEditCommit({ kind: "authored-detail", id: "x", x: 1, z: 2 })).toBe(false);
    expect(isLayoutEditCommit({
      kind: "authored-detail",
      id: "authored.prop.wagon.farm-road",
      x: -48,
      z: -58,
      rotationY: 0.2
    })).toBe(true);
    expect(isLayoutEditCommit({
      kind: "farm-prop",
      id: "farm_hay_a",
      x: 0,
      z: 0,
      rotationY: 0,
      remove: true
    })).toBe(true);
    expect(isLayoutEditCommit({
      kind: "farm-prop",
      id: "farm_hay_a",
      x: 0,
      z: 0,
      rotationY: 0,
      duplicateFrom: "farm_hay_a"
    })).toBe(true);
  });

  it("patches farm-local farmhouse numbers and follows the outside door", () => {
    const sources = readLayoutSources(ROOT);
    const commit = {
      kind: "farmstead" as const,
      id: "farmhouse",
      x: -55,
      z: -52,
      rotationY: Math.PI
    };
    const next = applyLayoutEditToSources(sources, commit);
    expect(next.farmLayout).toContain('id: "farmhouse"');
    expect(next.farmLayout).toMatch(/x:\s*10\b/);
    expect(next.farmLayout).toMatch(/z:\s*3\b/);
    expect(next.interior).not.toBe(sources.interior);
    expect(next.interior).toContain("FARMHOUSE_OUTSIDE_DOOR");
    const doorX = next.interior.match(/export const FARMHOUSE_OUTSIDE_DOOR[\s\S]*?\bx:\s*([^,\n]+)/);
    expect(doorX?.[1]).toBeDefined();
    expect(evalLayoutNumber(doorX![1]!)).not.toBe(FARMHOUSE_OUTSIDE_DOOR.x);
    const planned = planLayoutEdit(ROOT, commit);
    expect(planned.files.some((file) => file.endsWith("src/world/FarmLayout.ts"))).toBe(true);
    expect(planned.files.some((file) => file.endsWith("src/world/FarmhouseInterior.ts"))).toBe(true);
  });

  it("patches an authored wagon placement", () => {
    const sources = readLayoutSources(ROOT);
    const next = applyLayoutEditToSources(sources, {
      kind: "authored-detail",
      id: "authored.prop.wagon.farm-road",
      x: -46.25,
      z: -57.5,
      rotationY: 0.4
    });
    expect(next.environment).toContain('authoredPlacement("authored.prop.wagon.farm-road"');
    expect(next.environment).toContain("x: -46.25");
    expect(next.environment).toContain("z: -57.5");
    expect(next.environment).toContain("rotationY: 0.4");
  });

  it("writes numeric architecture pad center and rotation", () => {
    const sources = readLayoutSources(ROOT);
    const next = applyLayoutEditToSources(sources, {
      kind: "architecture-pad",
      id: "village.cottage-west",
      x: 40.5,
      z: -49.25,
      rotationY: 1.25
    });
    expect(next.worldLayout).toContain('id: "village.cottage-west"');
    expect(next.worldLayout).toContain("x: 40.5");
    expect(next.worldLayout).toContain("z: -49.25");
    expect(next.worldLayout).toContain("rotationY: 1.25");
    expect(next.worldLayout).not.toMatch(/id: "village\.cottage-west"[\s\S]{0,180}villageArchitectureRotation/);
  });

  it("upserts a seeded placement override", () => {
    const sources = readLayoutSources(ROOT);
    const next = applyLayoutEditToSources(sources, {
      kind: "environment-override",
      id: "seeded-fill.trees.northwest-farm.000",
      x: -90.5,
      z: -60.25,
      rotationY: 0.33
    });
    expect(next.environment).toContain('"seeded-fill.trees.northwest-farm.000":');
    expect(next.environment).toContain("x: -90.5");
    const applied = applyPlacementOverrides([
      {
        id: "seeded-fill.trees.northwest-farm.000",
        origin: "seeded-fill",
        assetId: "tree_oak_a",
        x: 0,
        z: 0,
        rotationY: 0,
        scale: [1, 1, 1]
      }
    ]);
    expect(applied[0]?.x).toBe(0);
    const withOverride = applyLayoutEditToSources(next, {
      kind: "environment-override",
      id: "seeded-fill.trees.northwest-farm.000",
      x: -88,
      z: -61,
      rotationY: 1.1
    });
    expect(withOverride.environment).toContain("x: -88");
    expect(withOverride.environment.match(/seeded-fill\.trees\.northwest-farm\.000/g)?.length).toBe(1);
  });

  it("upserts multiple farm fence overrides without double commas", () => {
    const sources = readLayoutSources(ROOT);
    const first = applyLayoutEditToSources(sources, {
      kind: "farm-fence",
      id: "fence_layout_editor_test_a",
      x: -49.1,
      z: -56.6,
      rotationY: Math.PI / 2
    });
    const second = applyLayoutEditToSources(first, {
      kind: "farm-fence",
      id: "fence_layout_editor_test_b",
      x: -49.1,
      z: -52.4,
      rotationY: Math.PI / 2
    });
    expect(second.farmLayout).toContain('"fence_layout_editor_test_a":');
    expect(second.farmLayout).toContain('"fence_layout_editor_test_b":');
    expect(second.farmLayout).not.toMatch(/,\s*,/);
  });

  it("duplicates an authored wagon as a new placement id", () => {
    const sources = readLayoutSources(ROOT);
    const next = applyLayoutEditToSources(sources, {
      kind: "authored-detail",
      id: "authored.prop.wagon.farm-road",
      duplicateFrom: "authored.prop.wagon.farm-road",
      x: -48,
      z: -58,
      rotationY: 0.2
    });
    expect(next.environment).toContain('authoredPlacement("authored.prop.wagon.farm-road.copy.1"');
    expect(next.environment).toContain("x: -48");
    expect(next.environment).toMatch(/authoredPlacement\("authored\.prop\.wagon\.farm-road"/);
    expect(next.environment).not.toMatch(/\}\)\s*\n\s+authoredPlacement\(/);
  });

  it("keeps commas on both the original and copy when duplicating twice", () => {
    const sources = readLayoutSources(ROOT);
    const first = applyLayoutEditToSources(sources, {
      kind: "authored-detail",
      id: "authored.prop.wagon.farm-road",
      duplicateFrom: "authored.prop.wagon.farm-road",
      x: -48,
      z: -58,
      rotationY: 0.2
    });
    const second = applyLayoutEditToSources(first, {
      kind: "authored-detail",
      id: "authored.prop.wagon.farm-road.copy.1",
      duplicateFrom: "authored.prop.wagon.farm-road.copy.1",
      x: -47,
      z: -57,
      rotationY: 0.3
    });
    expect(second.environment).toContain('authoredPlacement("authored.prop.wagon.farm-road.copy.2"');
    expect(second.environment).toMatch(
      /authoredPlacement\("authored\.prop\.wagon\.farm-road", \{[^}]+\}\),/
    );
    expect(second.environment).toMatch(
      /authoredPlacement\("authored\.prop\.wagon\.farm-road\.copy\.1", \{[^}]+\}\),/
    );
    expect(second.environment).toMatch(
      /authoredPlacement\("authored\.prop\.wagon\.farm-road\.copy\.2", \{[^}]+\}\),/
    );
    expect(second.environment).not.toMatch(/\}\)\s*\n\s+authoredPlacement\(/);
  });

  it("inserts a comma after a source call that currently has none", () => {
    const sources = readLayoutSources(ROOT);
    const withoutComma = {
      ...sources,
      environment: sources.environment.replace(
        /authoredPlacement\("authored\.prop\.wagon\.farm-road", \{[^}]+\}\),/,
        (call) => call.slice(0, -1)
      )
    };
    expect(withoutComma.environment).toMatch(
      /authoredPlacement\("authored\.prop\.wagon\.farm-road", \{[^}]+\}\)\s*\n/
    );
    const next = applyLayoutEditToSources(withoutComma, {
      kind: "authored-detail",
      id: "authored.prop.wagon.farm-road",
      duplicateFrom: "authored.prop.wagon.farm-road",
      x: -48,
      z: -58,
      rotationY: 0.2
    });
    expect(next.environment).toMatch(
      /authoredPlacement\("authored\.prop\.wagon\.farm-road", \{[^}]+\}\),/
    );
    expect(next.environment).toMatch(
      /authoredPlacement\("authored\.prop\.wagon\.farm-road\.copy\.1", \{[^}]+\}\),/
    );
    expect(next.environment).not.toMatch(/\}\)\s*\n\s+authoredPlacement\(/);
  });

  it("returns the allocated copy id rather than another newly noticed string", () => {
    const planned = planLayoutEdit(ROOT, {
      kind: "authored-detail",
      id: "authored.prop.wagon.farm-road",
      duplicateFrom: "authored.prop.wagon.farm-road",
      x: -48,
      z: -58,
      rotationY: 0.2
    });
    expect(planned.id).toBe("authored.prop.wagon.farm-road.copy.1");
  });

  it("moves authored copy.1 without rewriting copy.10", () => {
    const sources = readLayoutSources(ROOT);
    const withTen = {
      ...sources,
      environment: sources.environment.replace(
        /authoredPlacement\("authored\.fauna\.chicken\.farm-b", \{[^}]+\}\),/,
        (call) => `${call}\n  authoredPlacement("authored.fauna.chicken.farm-b.copy.1", { assetId: "fauna_chicken_a", x: -60.2, z: -69.6, rotationY: 0.8, scale: [1.1, 1.1, 1.1] }),\n  authoredPlacement("authored.fauna.chicken.farm-b.copy.10", { assetId: "fauna_chicken_a", x: 999, z: 888, rotationY: 0, scale: [1, 1, 1] }),`
      )
    };
    const next = applyLayoutEditToSources(withTen, {
      kind: "authored-detail",
      id: "authored.fauna.chicken.farm-b.copy.1",
      x: -60,
      z: -70,
      rotationY: 0.5
    });
    expect(next.environment).toMatch(
      /authoredPlacement\("authored\.fauna\.chicken\.farm-b\.copy\.1", \{[^}]*x: -60/
    );
    expect(next.environment).toMatch(
      /authoredPlacement\("authored\.fauna\.chicken\.farm-b\.copy\.10", \{[^}]*x: 999/
    );
  });

  it("duplicates a village lamp including practicalLight", () => {
    const sources = readLayoutSources(ROOT);
    const next = applyLayoutEditToSources(sources, {
      kind: "authored-detail",
      id: "authored.prop.lamp.village-west",
      duplicateFrom: "authored.prop.lamp.village-west",
      x: 45,
      z: -47,
      rotationY: 0.2
    });
    expect(next.environment).toContain('authoredPlacement("authored.prop.lamp.village-west.copy.1"');
    const copy = next.environment.match(
      /authoredPlacement\("authored\.prop\.lamp\.village-west\.copy\.1",\s*\{[^}]+\}/
    );
    expect(copy?.[0]).toContain("practicalLight: true");
    expect(copy?.[0]).toContain("x: 45");
  });

  it("duplicates a grounded tree including grounding extents", () => {
    const sources = readLayoutSources(ROOT);
    const next = applyLayoutEditToSources(sources, {
      kind: "authored-detail",
      id: "authored.tree.apple.orchard-a",
      duplicateFrom: "authored.tree.apple.orchard-a",
      x: 84,
      z: -44,
      rotationY: 0.4
    });
    const copy = next.environment.match(
      /authoredPlacement\("authored\.tree\.apple\.orchard-a\.copy\.1",\s*\{[^}]+\}/
    );
    expect(copy?.[0]).toContain("grounding: [1.05, 0.74]");
    expect(copy?.[0]).toContain("x: 84");
  });

  it("writes grounding and practicalLight when pasting a seeded instance as authored", () => {
    const sources = readLayoutSources(ROOT);
    const next = applyLayoutEditToSources(sources, {
      kind: "environment-override",
      id: "seeded-fill.trees.northwest-farm.023",
      duplicateFrom: "seeded-fill.trees.northwest-farm.023",
      assetId: "tree_oak_a",
      x: -70,
      z: -60,
      rotationY: 0.5,
      scale: [1, 1, 1],
      grounding: [1.2, 0.8],
      practicalLight: true
    });
    expect(next.environment).toContain('authoredPlacement("authored.copy.tree_oak_a.1"');
    const copy = next.environment.match(
      /authoredPlacement\("authored\.copy\.tree_oak_a\.1",\s*\{[^}]+\}/
    );
    expect(copy?.[0]).toContain('assetId: "tree_oak_a"');
    expect(copy?.[0]).toContain("grounding: [1.2, 0.8]");
    expect(copy?.[0]).toContain("practicalLight: true");
    expect(copy?.[0]).toContain("x: -70");
  });

  it("duplicates an interior prop including y and assetId", () => {
    const sources = readLayoutSources(ROOT);
    const next = applyLayoutEditToSources(sources, {
      kind: "interior-prop",
      id: "interior_bed",
      duplicateFrom: "interior_bed",
      x: 241.2,
      y: 0.17,
      z: -238.1,
      rotationY: 0.3
    });
    expect(next.interior).toContain('id: "interior_bed_copy_1"');
    const copy = next.interior.match(/\{[^{}]*id:\s*"interior_bed_copy_1"[^{}]*\}/);
    expect(copy?.[0]).toContain("assetId:");
    expect(copy?.[0]).toContain("y: 0.17");
    expect(copy?.[0]).toContain("x: 241.2");
  });

  it("accepts optional duplicate feature fields on a commit", () => {
    expect(isLayoutEditCommit({
      kind: "authored-detail",
      id: "authored.prop.lamp.village-west",
      duplicateFrom: "authored.prop.lamp.village-west",
      x: 45,
      z: -47,
      rotationY: 0.2,
      grounding: [1.05, 0.74],
      practicalLight: true
    })).toBe(true);
    expect(isLayoutEditCommit({
      kind: "authored-detail",
      id: "authored.prop.lamp.village-west",
      x: 45,
      z: -47,
      rotationY: 0.2,
      grounding: [1.05]
    })).toBe(false);
    expect(isLayoutEditCommit({
      kind: "farm-prop",
      id: "farm_hay_a",
      duplicateFrom: "farm_hay_a",
      x: -78,
      z: -63,
      rotationY: 0.2,
      propType: "hay-bale",
      scale: [1, 1, 1]
    })).toBe(true);
  });

  it("duplicates a farm prop and a fence extra without double commas", () => {
    const sources = readLayoutSources(ROOT);
    const hay = applyLayoutEditToSources(sources, {
      kind: "farm-prop",
      id: "farm_hay_a",
      duplicateFrom: "farm_hay_a",
      x: -78,
      z: -63,
      rotationY: 0.2
    });
    expect(hay.farmLayout).toContain('id: "farm_hay_a_copy_1"');
    const fence = applyLayoutEditToSources(hay, {
      kind: "farm-fence",
      id: "fence_east_0",
      duplicateFrom: "fence_east_0",
      x: -49,
      z: -55,
      rotationY: Math.PI / 2
    });
    expect(fence.farmLayout).toContain("FARM_FENCE_EXTRAS");
    expect(fence.farmLayout).toMatch(/id: "fence_east_0_copy_1"/);
    expect(fence.farmLayout).not.toMatch(/,\s*,/);
  });

  it("pastes a farm prop and interior prop after the original source object was removed", () => {
    const sources = readLayoutSources(ROOT);
    const withoutHay = applyLayoutEditToSources(sources, {
      kind: "farm-prop",
      id: "farm_hay_a",
      x: 0,
      z: 0,
      rotationY: 0,
      remove: true
    });
    const hayPaste = applyLayoutEditToSources(withoutHay, {
      kind: "farm-prop",
      id: "farm_hay_a",
      duplicateFrom: "farm_hay_a",
      propType: "hay-bale",
      assetId: "prop_hay_bale_a",
      scale: [1, 1, 1],
      x: -78,
      z: -63,
      rotationY: 0.2
    });
    expect(hayPaste.farmLayout).toContain('id: "farm_hay_a_copy_1"');
    expect(hayPaste.farmLayout).toContain('type: "hay-bale"');
    const withoutBed = applyLayoutEditToSources(sources, {
      kind: "interior-prop",
      id: "interior_bed",
      x: 0,
      y: 0.17,
      z: 0,
      rotationY: 0,
      remove: true
    });
    const bedPaste = applyLayoutEditToSources(withoutBed, {
      kind: "interior-prop",
      id: "interior_bed",
      duplicateFrom: "interior_bed",
      assetId: "prop_bed_cozy_a",
      scale: [1, 1, 1],
      x: 241.2,
      y: 0.17,
      z: -238.1,
      rotationY: 0.3
    });
    expect(bedPaste.interior).toContain('id: "interior_bed_copy_1"');
    expect(bedPaste.interior).toContain('assetId: "prop_bed_cozy_a"');
  });

  it("inserts a fence extra after a trailing comment without commenting out the comma", () => {
    const sources = readLayoutSources(ROOT);
    const withComment = {
      ...sources,
      farmLayout: sources.farmLayout.replace(
        "export const FARM_FENCE_EXTRAS: readonly FarmFenceAnchor[] = [\n];",
        "export const FARM_FENCE_EXTRAS: readonly FarmFenceAnchor[] = [\n  // pasted extras\n];"
      )
    };
    const next = applyLayoutEditToSources(withComment, {
      kind: "farm-fence",
      id: "fence_east_0",
      duplicateFrom: "fence_east_0",
      x: -49,
      z: -55,
      rotationY: Math.PI / 2
    });
    expect(next.farmLayout).toContain('id: "fence_east_0_copy_1"');
    expect(next.farmLayout).toContain("// pasted extras");
    expect(next.farmLayout).not.toMatch(/pasted extras,/);
  });

  it("refuses to copy a unique farmhouse", () => {
    const sources = readLayoutSources(ROOT);
    expect(() =>
      applyLayoutEditToSources(sources, {
        kind: "farmstead",
        id: "farmhouse",
        duplicateFrom: "farmhouse",
        x: -57,
        z: -53.5,
        rotationY: Math.PI
      })
    ).toThrow(/Cannot copy/);
  });

  it("deletes an authored placement, farm prop, generated fence, and seeded pin", () => {
    const sources = readLayoutSources(ROOT);
    const withoutWagon = applyLayoutEditToSources(sources, {
      kind: "authored-detail",
      id: "authored.prop.wagon.farm-road",
      x: -49,
      z: -59,
      rotationY: 0,
      remove: true
    });
    expect(withoutWagon.environment).not.toContain('authoredPlacement("authored.prop.wagon.farm-road"');
    const withoutHay = applyLayoutEditToSources(sources, {
      kind: "farm-prop",
      id: "farm_hay_a",
      x: 0,
      z: 0,
      rotationY: 0,
      remove: true
    });
    expect(withoutHay.farmLayout).not.toContain('id: "farm_hay_a"');
    expect(withoutHay.farmLayout).toContain('id: "farm_hay_b"');
    const withoutFence = applyLayoutEditToSources(sources, {
      kind: "farm-fence",
      id: "fence_east_0",
      x: 0,
      z: 0,
      rotationY: 0,
      remove: true
    });
    expect(withoutFence.farmLayout).toContain('"fence_east_0"');
    expect(withoutFence.farmLayout).toContain("FARM_FENCE_REMOVED");
    expect(withoutFence.farmLayout).not.toMatch(/"fence_east_0": \{/);
    const withoutSeeded = applyLayoutEditToSources(sources, {
      kind: "environment-override",
      id: "seeded-fill.trees.northwest-farm.023",
      x: 0,
      z: 0,
      rotationY: 0,
      remove: true
    });
    expect(withoutSeeded.environment).toContain("PLACEMENT_REMOVED");
    expect(withoutSeeded.environment).toContain('"seeded-fill.trees.northwest-farm.023"');
    expect(withoutSeeded.environment).not.toMatch(/"seeded-fill\.trees\.northwest-farm\.023": \{/);
    const withoutBed = applyLayoutEditToSources(sources, {
      kind: "interior-prop",
      id: "interior_bed",
      x: 0,
      z: 0,
      rotationY: 0,
      remove: true
    });
    expect(withoutBed.interior).not.toContain('id: "interior_bed"');
    const withExtra = applyLayoutEditToSources(sources, {
      kind: "farm-fence",
      id: "fence_east_0",
      duplicateFrom: "fence_east_0",
      x: -49,
      z: -55,
      rotationY: Math.PI / 2
    });
    const withoutExtra = applyLayoutEditToSources(withExtra, {
      kind: "farm-fence",
      id: "fence_east_0_copy_1",
      x: -49,
      z: -55,
      rotationY: Math.PI / 2,
      remove: true
    });
    expect(withoutExtra.farmLayout).not.toMatch(/id: "fence_east_0_copy_1"/);
    expect(withoutExtra.farmLayout).not.toContain('"fence_east_0_copy_1"');
    const movedExtra = applyLayoutEditToSources(withExtra, {
      kind: "farm-fence",
      id: "fence_east_0_copy_1",
      x: -40,
      z: -50,
      rotationY: 1
    });
    expect(movedExtra.farmLayout).toContain('"fence_east_0_copy_1":');
    const deletedMovedExtra = applyLayoutEditToSources(movedExtra, {
      kind: "farm-fence",
      id: "fence_east_0_copy_1",
      x: -40,
      z: -50,
      rotationY: 1,
      remove: true
    });
    expect(deletedMovedExtra.farmLayout).not.toContain('"fence_east_0_copy_1"');
  });

  it("refuses to delete a unique farmhouse", () => {
    const sources = readLayoutSources(ROOT);
    expect(() =>
      applyLayoutEditToSources(sources, {
        kind: "farmstead",
        id: "farmhouse",
        x: -57,
        z: -53.5,
        rotationY: Math.PI,
        remove: true
      })
    ).toThrow(/Cannot delete/);
  });

  it("allocates copy ids without colliding", () => {
    expect(allocateCopyId(["farm_hay_a"], "farm_hay_a")).toBe("farm_hay_a_copy_1");
    expect(allocateCopyId(["farm_hay_a", "farm_hay_a_copy_1"], "farm_hay_a")).toBe("farm_hay_a_copy_2");
    expect(allocateCopyId([], "seeded-fill.trees.northwest-farm.003", "tree_oak_a")).toBe(
      "authored.copy.tree_oak_a.1"
    );
    expect(allocateCopyId(
      ["authored.copy.tree_oak_a.1"],
      "authored.copy.tree_oak_a.1",
      "tree_oak_a"
    )).toBe("authored.copy.tree_oak_a.2");
    expect(allocateCopyId(
      ["authored.fauna.chicken.farm-a", "authored.fauna.chicken.farm-a.copy.1", "authored.fauna.chicken.farm-a.copy.2"],
      "authored.fauna.chicken.farm-a.copy.1"
    )).toBe("authored.fauna.chicken.farm-a.copy.3");
  });

  it("patches Elspeth's npc anchor and a harbor NPC world anchor", () => {
    const sources = readLayoutSources(ROOT);
    const elspeth = applyLayoutEditToSources(sources, {
      kind: "npc",
      id: "npc.elspeth",
      x: -61.2,
      z: -63.4,
      rotationY: 0.5
    });
    expect(elspeth.npcs).toContain("x: -61.2");
    expect(elspeth.npcs).toContain("z: -63.4");
    const silas = applyLayoutEditToSources(sources, {
      kind: "npc",
      id: "npc.silas",
      x: 84.5,
      z: 62.25,
      rotationY: -1.2
    });
    expect(silas.worldAnchors).toContain("export const HARBOR_SILAS_ANCHOR");
    expect(silas.worldAnchors).toContain("x: 84.5");
    expect(silas.npcs).toContain("rotationY: -1.2");
  });

  it("patches interior furniture including y", () => {
    const sources = readLayoutSources(ROOT);
    const next = applyLayoutEditToSources(sources, {
      kind: "interior-prop",
      id: "interior_chair_south",
      x: 242.1,
      y: 0.17,
      z: -241.5,
      rotationY: 0.2
    });
    expect(next.interior).toContain('id: "interior_chair_south"');
    expect(next.interior).toContain("x: 242.1");
    expect(next.interior).toContain("z: -241.5");
  });

  it("writes mill farm-local pose after subtracting processing visual yaw", () => {
    const sources = readLayoutSources(ROOT);
    const visualYaw = Math.PI + 0.25;
    const next = applyLayoutEditToSources(sources, {
      kind: "farm-structure",
      id: "struct.starter_mill",
      x: 36,
      z: -76,
      rotationY: visualYaw
    });
    expect(next.farmLayout).toContain('id: "struct.starter_mill"');
    expect(next.farmLayout).toMatch(/rotationY:\s*0\.25/);
  });

  it("formats coords without negative zero", () => {
    expect(formatWorldCoord(-0.0001)).toBe("0");
  });
});

describe("layout editor live sim sync", () => {
  it("relocates a saved structure in this session without a schema bump", () => {
    const sim = new Simulation();
    const before = sim.state.world.layoutRevision;
    expect(sim.debugRelocateStructure("struct.workbench", -70, -58)).toBe(true);
    expect(sim.state.world.structures["struct.workbench"]?.x).toBe(-70);
    expect(sim.state.world.structures["struct.workbench"]?.z).toBe(-58);
    expect(sim.state.world.layoutRevision).toBe(before);
    expect(sim.debugRelocateStructure("struct.missing", 0, 0)).toBe(false);
  });
});

describe("layout editor live interact session", () => {
  const villageMarket = ContentRegistry.markets.get("market.village")!;
  const originalVillage = {
    x: VILLAGE_MARKET.position.x,
    z: VILLAGE_MARKET.position.z,
    rotationY: VILLAGE_MARKET.rotationY,
    interactX: villageMarket.interactionPosition.x,
    interactZ: villageMarket.interactionPosition.z
  };
  const originalApproaches = Object.fromEntries(
    PROCESSING_STATION_IDS.map((stationId) => [stationId, getProcessingStationApproach(stationId)!.rotationY])
  );

  afterEach(() => {
    applyLayoutEditLiveSession(new Simulation(), createLandmarkTag("produce-stall", 0), {
      kind: "landmark",
      id: "produce-stall",
      x: originalVillage.x,
      z: originalVillage.z,
      rotationY: originalVillage.rotationY
    });
    villageMarket.interactionPosition.x = originalVillage.interactX;
    villageMarket.interactionPosition.z = originalVillage.interactZ;
    for (const stationId of PROCESSING_STATION_IDS) {
      debugRelocateProcessingStationApproach(stationId, originalApproaches[stationId]!);
    }
  });

  it("moves the produce stall interact anchor with the visual", () => {
    const sim = new Simulation();
    applyLayoutEditLiveSession(sim, createLandmarkTag("produce-stall", 0), {
      kind: "landmark",
      id: "produce-stall",
      x: 40,
      z: -40,
      rotationY: 1.2
    });
    expect(VILLAGE_MARKET.position.x).toBe(40);
    expect(VILLAGE_MARKET.position.z).toBe(-40);
    expect(VILLAGE_MARKET.rotationY).toBe(1.2);
    expect(villageMarket.interactionPosition.x).toBe(40);
    expect(villageMarket.interactionPosition.z).toBe(-40);
  });

  it("moves a workstation front with translation and facing", () => {
    const sim = new Simulation();
    const visualRotationY = Math.PI + 0.4;
    applyLayoutEditLiveSession(sim, createFarmStructureTag("struct.workbench"), {
      kind: "farm-structure",
      id: "struct.workbench",
      x: -70,
      z: -58,
      rotationY: visualRotationY
    });
    expect(sim.state.world.structures["struct.workbench"]?.x).toBe(-70);
    expect(sim.state.world.structures["struct.workbench"]?.z).toBe(-58);
    expect(getProcessingStationApproach("struct.workbench")?.rotationY).toBeCloseTo(0.4, 8);
    const front = getProcessingStationFrontPosition("struct.workbench", { x: -70, z: -58 });
    expect(front).toMatchObject({
      x: expect.closeTo(-70 - Math.sin(0.4) * getProcessingStationApproach("struct.workbench")!.frontApproachDistanceMeters, 8),
      z: expect.closeTo(-58 - Math.cos(0.4) * getProcessingStationApproach("struct.workbench")!.frontApproachDistanceMeters, 8)
    });
  });
});

describe("layout editor vite plugin", () => {
  it("registers a commit middleware", () => {
    const plugin = layoutEditorPlugin(ROOT);
    expect(plugin.name).toBe("neva-dev-layout-editor");
    expect(plugin.apply).toBe("serve");
    expect(typeof plugin.configureServer).toBe("function");
    expect(typeof plugin.handleHotUpdate).toBe("function");
  });

  it("does not statically import world modules that restart the Vite server", () => {
    const patcher = fs.readFileSync(path.join(ROOT, "tools/layout-editor/patchPlacement.ts"), "utf8");
    const plugin = fs.readFileSync(path.join(ROOT, "tools/vite/layoutEditorPlugin.ts"), "utf8");
    expect(patcher).not.toMatch(/from ["'][^"']*src\/world\//);
    expect(plugin).not.toMatch(/from ["'][^"']*src\//);
  });

  it("rejects layout writes that are not from localhost", () => {
    expect(isLocalLayoutEditorHost("localhost:3000")).toBe(true);
    expect(isLocalLayoutEditorHost("127.0.0.1:3000")).toBe(true);
    expect(isLocalLayoutEditorHost("[::1]:3000")).toBe(true);
    expect(isLocalLayoutEditorHost("192.168.1.20:3000")).toBe(false);
  });
});
