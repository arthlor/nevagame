import { describe, expect, it } from "vitest";
import { WorldLayout, BRIDGE_WORLD_PROFILE, WORLD_LAYOUT_V5, RIVER_FISHING_ACCESS_RESERVES } from "../../src/world/WorldLayout";
import { NEVA_HEADWATERS } from "../../src/world/NevaHeadwaters";

describe("connected coastal valley", () => {
  it("holds a low meadow behind the depositional bank before the valley side rises", () => {
    for (const z of [-100, -60, 38]) {
      const s = WorldLayout.riverSectionAt(z);
      const right = s.rightDeposition > s.leftDeposition;
      const direction = right ? 1 : -1;
      const width = right ? s.rightWaterWidth : s.leftWaterWidth;
      const run = right ? s.rightBankRun : s.leftBankRun;
      const shelf = right ? s.rightFloodplainWidth : s.leftFloodplainWidth;
      const heights = [0.15, 0.3, 0.5].map(t => WorldLayout.terrainHeight(s.centerX + direction * (width + run + shelf * t), z));
      expect(Math.max(...heights) - Math.min(...heights), `meadow at ${z}`).toBeLessThan(0.18);
      expect(Math.max(...heights)).toBeLessThan(1.3);
      expect(shelf).toBeGreaterThan(15);
    }
  });

  it("widens the plunge basin then drains through a confined, uninterrupted step-pool outlet", () => {
    // The basin is judged against the channel that leaves it: the rock-confined
    // step-pool staircase, which is narrower than the meadow river below.
    const pool = WorldLayout.riverSectionAt(NEVA_HEADWATERS.pool.centerZ);
    const outlet = WorldLayout.riverSectionAt(-121);
    const meadow = WorldLayout.riverSectionAt(-106);
    expect(pool.leftWaterWidth + pool.rightWaterWidth).toBeGreaterThan((outlet.leftWaterWidth + outlet.rightWaterWidth) * 1.5);
    expect(meadow.leftWaterWidth + meadow.rightWaterWidth).toBeGreaterThan(outlet.leftWaterWidth + outlet.rightWaterWidth + 3);
    for (let z = -130; z <= -110; z += 0.5) {
      const s = WorldLayout.riverSectionAt(z);
      expect(WorldLayout.terrainHeight(s.centerX, z), `outlet at ${z}`).toBeLessThan(s.surfaceElevation);
    }
    expect(WorldLayout.isSailable(pool.centerX, pool.z)).toBe(false);
    expect(WorldLayout.fishingHabitatAt(pool.centerX, pool.z)).toBeNull();
  });

  it("opens the mouth on the low eastern shore and keeps a submerged outlet to sea", () => {
    const mouth = WorldLayout.riverSectionAt(82);
    const upriver = WorldLayout.riverSectionAt(52);
    expect(mouth.rightWaterWidth).toBeGreaterThan(upriver.rightWaterWidth + 3);
    expect(mouth.rightFloodplainWidth).toBeGreaterThan(mouth.leftFloodplainWidth);
    for (let z = 60; z <= 104; z += 2) {
      const x = WorldLayout.riverCenterX(z);
      expect(WorldLayout.isSailable(x, z), `outlet navigation at ${z}`).toBe(true);
      expect(WorldLayout.terrainHeight(x, z)).toBeLessThan(-1);
    }
  });

  it("retains the bridge entries and all three bank fishing clearings", () => {
    const bridge = WORLD_LAYOUT_V5.anchors.bridge;
    for (const direction of [-1, 1]) {
      const x = bridge.x + direction * (BRIDGE_WORLD_PROFILE.spanLength / 2 + 0.08);
      expect(WorldLayout.isWalkable(x, bridge.z)).toBe(true);
      expect(WorldLayout.terrainHeight(x, bridge.z)).toBeCloseTo(BRIDGE_WORLD_PROFILE.entrySurfaceY, 1);
    }
    for (const reserve of RIVER_FISHING_ACCESS_RESERVES) {
      const s = WorldLayout.riverSectionAt(reserve.z);
      const left = reserve.side === "left";
      const x = s.centerX + (left ? -1 : 1) * ((left ? s.leftWaterWidth : s.rightWaterWidth) + 2);
      expect(WorldLayout.fishingAccessAt(x, reserve.z)).toMatchObject({accessible: true, habitat: "river"});
    }
  });
});
