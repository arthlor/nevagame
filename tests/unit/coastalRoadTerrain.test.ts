import { describe, expect, it } from "vitest";
import { MAINLAND_ROUTES } from "../../src/world/NevaMainland";
import { WorldLayout } from "../../src/world/WorldLayout";
import previous from "../fixtures/neva_layout25_coastal_road.json";

const road = MAINLAND_ROUTES.find(route => route.id === "mainland-village-highridge")!;

describe("village coastal contour road", () => {
  it("retains both village connections and the freight lane width", () => {
    expect(road.points[0]).toEqual(previous.points[0]);
    expect(road.points.at(-1)).toEqual(previous.points.at(-1));
    expect(road.widthMeters).toBe(previous.widthMeters);
  });

  it("settles into the foothills instead of lifting an embankment above both sides", () => {
    let sections = 0;
    for (let i = 1; i < road.points.length; i++) {
      const p = road.points[i], a = road.points[i - 1];
      if (p.z > -150 || p.z < -280) continue;
      const length = Math.hypot(p.x - a.x, p.z - a.z);
      const nx = -(p.z - a.z) / length, nz = (p.x - a.x) / length;
      const sides = [-16, 16].map(offset => WorldLayout.terrainHeight(p.x + nx * offset, p.z + nz * offset));
      expect(WorldLayout.terrainHeight(p.x, p.z) - Math.max(...sides), JSON.stringify(p)).toBeLessThan(0.65);
      sections++;
    }
    expect(sections).toBeGreaterThan(40);
    // The former crest must disappear too: moving the ribbon alone leaves a berm.
    expect(WorldLayout.terrainHeight(111, -193)).toBeLessThan(3);
    expect(WorldLayout.terrainHeight(98, -225)).toBeLessThan(3);
  });

  it("keeps the whole freight tread dry with gentle grades and shared traversal support", () => {
    for (let i = 1; i < road.points.length; i++) {
      const p = road.points[i], a = road.points[i - 1];
      const length = Math.hypot(p.x - a.x, p.z - a.z);
      expect(Math.abs(road.elevations[i] - road.elevations[i - 1]) / length).toBeLessThanOrEqual(0.220001);
      for (const offset of [-2.3, 0, 2.3]) {
        const x = p.x - (p.z - a.z) / length * offset, z = p.z + (p.x - a.x) / length * offset;
        expect(WorldLayout.isWater(x, z)).toBe(false);
        expect(WorldLayout.traversalSurfaceSample(x, z).normal.y).toBeGreaterThan(Math.cos(Math.PI / 6));
      }
    }
  });
});
