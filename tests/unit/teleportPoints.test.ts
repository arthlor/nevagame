import { describe, expect, it } from "vitest";
import { TELEPORT_GROUPS, TELEPORT_POINTS } from "../../src/ui/DebugOverlay";
import { WorldLayout } from "../../src/world/WorldLayout";

describe("teleport points contract", () => {
  it("defines comprehensive teleport groups across all world regions", () => {
    const titles = TELEPORT_GROUPS.map((g) => g.title);
    expect(titles).toContain("Mainland: Farm & Village");
    expect(titles).toContain("Mainland: Harbor & Coast");
    expect(titles).toContain("Mainland: Foothills & Trails");
    expect(titles).toContain("Mainland: Outlying Settlements");
    expect(titles).toContain("Sunreach Isle");
    expect(titles).toContain("Ocean Islets");
    expect(TELEPORT_POINTS.length).toBeGreaterThanOrEqual(20);
  });

  it.each(TELEPORT_POINTS.map((pt) => [pt.label, pt]))(
    "guarantees %s at (%d, %d) is on walkable dry land",
    (_label, pt) => {
      // Must be walkable ground
      expect(WorldLayout.isWalkable(pt.x, pt.z)).toBe(true);

      // Must NOT be in water (rivers, lakes, ocean)
      expect(WorldLayout.isWater(pt.x, pt.z)).toBe(false);

      // Must be within a valid island / mainland definition
      expect(WorldLayout.islandAt(pt.x, pt.z)).not.toBeNull();

      // Traversal surface height must be above water level
      const surfaceHeight = WorldLayout.traversalSurfaceHeight(pt.x, pt.z);
      expect(surfaceHeight).toBeGreaterThan(0);
    }
  );
});
