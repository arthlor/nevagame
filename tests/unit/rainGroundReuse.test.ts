import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRainDrop,
  rainPhysicsConfig,
  respawnRainDrop,
  sampleRainHitSurface,
  sampleRainSurfaceUnderDrop,
  stepRainDrop,
  type RainDropState
} from "../../src/render/weather/rainPhysics";
import { WORLD_ARCHITECTURE_PADS, WorldLayout } from "../../src/world/WorldLayout";

const config = rainPhysicsConfig();
const stillWater = { seaRoughness: 0.2, windDirectionDeg: 0, windSpeed: 0 };
const FARM = { x: -65, z: -55 };

function dropAt(x: number, z: number, heightAboveGround: number): RainDropState {
  const drop = createRainDrop();
  drop.active = true;
  drop.x = x;
  drop.z = z;
  drop.y = WorldLayout.terrainHeight(x, z) + heightAboveGround;
  return drop;
}

describe("rain ground-sample reuse", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reuses a dry-land sample only while the drop is high above it and has barely drifted", () => {
    const drop = dropAt(FARM.x, FARM.z, 8);
    expect(sampleRainSurfaceUnderDrop(drop.x, drop.z, drop, 0, stillWater, config)?.kind).toBe("terrain");
    expect(drop.groundValid).toBe(true);
    const terrain = vi.spyOn(WorldLayout, "terrainHeight");

    drop.x += config.groundRecheckDrift * 0.5;
    expect(sampleRainSurfaceUnderDrop(drop.x, drop.z, drop, 0, stillWater, config)).toBeNull();
    expect(terrain).not.toHaveBeenCalled();

    drop.x += config.groundRecheckDrift;
    expect(sampleRainSurfaceUnderDrop(drop.x, drop.z, drop, 0, stillWater, config)?.kind).toBe("terrain");
    expect(terrain).toHaveBeenCalledTimes(1);

    drop.y = drop.groundHeight + config.groundRecheckHeight * 0.5;
    expect(sampleRainSurfaceUnderDrop(drop.x, drop.z, drop, 0, stillWater, config)?.kind).toBe("terrain");
    expect(terrain).toHaveBeenCalledTimes(2);
  });

  it("forgets the sample when the drop respawns", () => {
    const drop = dropAt(FARM.x, FARM.z, 8);
    sampleRainSurfaceUnderDrop(drop.x, drop.z, drop, 0, stillWater, config);
    respawnRainDrop(drop, 3, { x: FARM.x, y: drop.y, z: FARM.z }, { directionX: 1, directionZ: 0, effectiveWindSpeed: 4 }, config);
    expect(drop.groundValid).toBe(false);
  });

  it("never reuses open water or wet terrain under the pier deck", () => {
    const water = createRainDrop();
    Object.assign(water, { active: true, x: 0, z: 180, y: 12 });
    expect(sampleRainSurfaceUnderDrop(water.x, water.z, water, 0, stillWater, config)?.kind).toBe("water");
    expect(water.groundValid).toBe(false);

    const dock = WorldLayout.landmark("dock");
    expect(WorldLayout.isPierDeck(dock.x, dock.z)).toBe(true);
    expect(WorldLayout.waterSignedDistance(dock.x, dock.z)).toBeGreaterThan(0);
    const decked = createRainDrop();
    Object.assign(decked, { active: true, x: dock.x, z: dock.z, y: 12 });
    expect(sampleRainSurfaceUnderDrop(decked.x, decked.z, decked, 0, stillWater, config)?.kind).toBe("terrain");
    expect(decked.groundValid).toBe(false);
  });

  it("tests roofs on every frame", () => {
    const inn = WORLD_ARCHITECTURE_PADS.find((pad) => pad.id === "village.inn")!;
    const drop = dropAt(inn.center.x, inn.center.z, 30);
    for (let frame = 0; frame < 3; frame += 1) {
      expect(sampleRainSurfaceUnderDrop(drop.x, drop.z, drop, 0, stillWater, config)?.kind).toBe("interior");
    }
    expect(drop.groundValid).toBe(false);
  });

  it("lands on the same frame at the same place as sampling every frame", () => {
    const wind = { directionX: 0.8, directionZ: 0.6, effectiveWindSpeed: 14 };
    const focus = { x: FARM.x, y: WorldLayout.terrainHeight(FARM.x, FARM.z), z: FARM.z };
    for (let index = 0; index < 40; index += 1) {
      const exact = createRainDrop();
      respawnRainDrop(exact, index, focus, wind, config);
      const reused = { ...exact };
      for (let frame = 0; frame < 120; frame += 1) {
        const exactResult = stepRainDrop(exact, 1 / 60, focus, wind, config,
          (x, z) => sampleRainHitSurface(x, z, frame / 60, stillWater));
        const reusedResult = stepRainDrop(reused, 1 / 60, focus, wind, config,
          (x, z, drop) => sampleRainSurfaceUnderDrop(x, z, drop, frame / 60, stillWater, config));
        expect(reusedResult).toBe(exactResult);
        expect([reused.x, reused.y, reused.z]).toEqual([exact.x, exact.y, exact.z]);
        if (exactResult !== "falling") break;
      }
    }
  });
});
