import { describe, expect, it } from "vitest";
import { ASSET_IDS } from "../../src/render/assets/AssetCatalog.generated";
import { WorldLayout } from "../../src/world/WorldLayout";
import { SUNREACH_ANCHORS } from "../../src/world/WorldIslands";
import { SUNREACH_FARM_LAYOUT, farmWellWorldAnchor } from "../../src/world/FarmLayout";
import { pointSegmentDistance } from "../../src/world/WorldGeometry";
import { SUNREACH_ROUTES } from "../../src/world/SunreachWorld";
import {
  SUNREACH_DRESSING, SUNREACH_NPC_STATIONS, clearsSunreachActivity, clearsSunreachDressing,
  sunreachDressingRadius, sunreachPlantingClearance, sunreachRoadEarthworkScale
} from "../../src/world/SunreachLivingLayout";
import { createSunreachDressingPlacements, sunreachCisternPlacement } from "../../src/world/SunreachDressing";
import {
  generateSunreachCausalCompositionPlacements, generateSunreachGroundCoverPlacements,
  isPlacementFootprintStable
} from "../../src/world/WorldEnvironmentLayout";
import { SUNREACH_TOWNSFOLK_ROUTES } from "../../src/render/scene/sunreachTownsfolk";
import { sampleAmbientTownsfolkPose, AMBIENT_TOWNSFOLK_ROUTES } from "../../src/render/scene/ambientTownsfolk";
import { SUNREACH_AMBIENT_BOAT_ROUTES } from "../../src/render/scene/sunreachBoatTraffic";
import { sampleAmbientBoatPose, AMBIENT_BOAT_ROUTES } from "../../src/render/scene/ambientBoats";
import { NPCS } from "../../src/content/npcs";

const phases = ["dawn", "day", "dusk", "night"] as const;

describe("Sunreach living harbor and terraces", () => {
  it("uses registered assets, unique stable IDs and deterministic placement data", () => {
    const ids = new Set<string>(Object.values(ASSET_IDS));
    expect(SUNREACH_DRESSING).toHaveLength(50);
    expect(new Set(SUNREACH_DRESSING.map(spec => spec.id)).size).toBe(50);
    for (const spec of SUNREACH_DRESSING) {
      expect(ids.has(spec.assetId), spec.assetId).toBe(true);
      expect([spec.x, spec.z, spec.rotationY, spec.scale, ...spec.footprint].every(Number.isFinite)).toBe(true);
      expect(spec.scale).toBeGreaterThan(0);
      expect(clearsSunreachActivity(spec.x, spec.z, sunreachDressingRadius(spec)), spec.id).toBe(true);
    }
    expect(createSunreachDressingPlacements()).toEqual(createSunreachDressingPlacements());
  });

  it("grounds every new prop against the actual canonical world, not just its center", () => {
    for (const placement of createSunreachDressingPlacements()) {
      expect(isPlacementFootprintStable(placement), placement.id).toBe(true);
    }
    expect(isPlacementFootprintStable(sunreachCisternPlacement())).toBe(true);
  });

  it("keeps full visual envelopes apart and outside compiled road cores", () => {
    const routes = WorldLayout.compiledRouteNetwork().filter(route => route.route.id.startsWith("route.sunreach."));
    for (let index = 0; index < SUNREACH_DRESSING.length; index += 1) {
      const spec = SUNREACH_DRESSING[index];
      const radius = sunreachDressingRadius(spec);
      for (const other of SUNREACH_DRESSING.slice(index + 1)) {
        expect(Math.hypot(spec.x - other.x, spec.z - other.z), `${spec.id} / ${other.id}`)
          .toBeGreaterThan(radius + sunreachDressingRadius(other) + 0.3);
      }
      for (const route of routes) {
        for (const segment of route.segments) {
          expect(pointSegmentDistance(spec.x, spec.z, segment.start, segment.end), `${spec.id} / ${route.route.id}`)
            .toBeGreaterThanOrEqual(radius + route.halfWidth + 0.25);
        }
      }
    }
  });

  it("keeps planted beds level and visually distinct from their service paths", () => {
    expect(SUNREACH_FARM_LAYOUT.plantableAreas).toEqual([
      { minX: -23, maxX: 23, minZ: -29, maxZ: -16 },
      { minX: -26, maxX: 26, minZ: -12, maxZ: 2 },
      { minX: -21, maxX: 21, minZ: 7, maxZ: 22 }
    ]);
    const elevations = [4.15, 4.75, 5.35];
    SUNREACH_FARM_LAYOUT.plantableAreas.forEach((bed, index) => {
      for (const localX of [bed.minX, (bed.minX + bed.maxX) / 2, bed.maxX]) {
        for (const localZ of [bed.minZ, (bed.minZ + bed.maxZ) / 2, bed.maxZ]) {
          const x = SUNREACH_FARM_LAYOUT.origin.x + localX, z = SUNREACH_FARM_LAYOUT.origin.z + localZ;
          expect(sunreachRoadEarthworkScale(x, z)).toBe(0);
          expect(WorldLayout.terrainHeight(x, z)).toBeCloseTo(elevations[index], 7);
          expect(WorldLayout.farmSoilInfluence(x, z)).toBe(1);
          expect(clearsSunreachDressing(x, z, 0)).toBe(false);
        }
      }
    });
    expect(sunreachRoadEarthworkScale(0, 0)).toBe(1);
  });

  it("connects the shore return and farm perimeter without a route through a bed", () => {
    expect(new Set(SUNREACH_ROUTES.map(route => route.id)).size).toBe(9);
    for (const route of SUNREACH_ROUTES) {
      for (let index = 1; index < route.points.length; index += 1) {
        const a = route.points[index - 1], b = route.points[index];
        const samples = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 4));
        for (let step = 0; step <= samples; step += 1) {
          const x = a.x + (b.x - a.x) * step / samples, z = a.z + (b.z - a.z) * step / samples;
          expect(sunreachPlantingClearance(x, z), route.id).toBeGreaterThanOrEqual(route.widthMeters / 2 + 0.2);
          expect(WorldLayout.isWalkable(x, z), route.id).toBe(true);
        }
      }
    }
  });

  it("aligns the visible cistern with irrigation and keeps boarding anchors unchanged", () => {
    const well = farmWellWorldAnchor("farm.sunreach_terraces")!;
    const visual = sunreachCisternPlacement();
    expect({ x: visual.x, z: visual.z, rotationY: visual.rotationY })
      .toEqual({ x: well.x, z: well.z, rotationY: well.rotationY });
    expect(visual.id).toBe("authored.sunreach.terrace-cistern");
    expect(SUNREACH_ANCHORS.dockBoat).toEqual({ x: 1143, z: 58 });
    expect(SUNREACH_ANCHORS.dockPlayer).toEqual({ x: 1155, z: 58 });
    expect(clearsSunreachDressing(1155, 58, 0)).toBe(false);
    expect(clearsSunreachDressing(NaN, 58, 0)).toBe(false);
    expect(clearsSunreachDressing(1155, 58, -1)).toBe(false);
  });

  it("registers background residents without inventing interactive NPCs", () => {
    expect(SUNREACH_TOWNSFOLK_ROUTES).toHaveLength(6);
    for (const route of SUNREACH_TOWNSFOLK_ROUTES) {
      expect(AMBIENT_TOWNSFOLK_ROUTES).toContain(route);
      expect(NPCS.some(npc => String(npc.id) === route.id)).toBe(false);
      for (const phase of phases) {
        expect(sampleAmbientTownsfolkPose(route, { timeOfDay: phase }, 123, 0))
          .toEqual({ ...route.stations[phase], heading: 0, walking: false });
        for (let step = 0; step < 96; step += 1) {
          const pose = sampleAmbientTownsfolkPose(route, { timeOfDay: phase }, route.loopSeconds * step / 96);
          expect(Math.hypot(pose.x - route.stations[phase].x, pose.z - route.stations[phase].z)).toBeLessThanOrEqual(route.radiusMeters);
          expect(WorldLayout.isWalkable(pose.x, pose.z), route.id).toBe(true);
          expect(WorldLayout.isWater(pose.x, pose.z), route.id).toBe(false);
          expect(WorldLayout.terrainNormalY(pose.x, pose.z), route.id).toBeGreaterThanOrEqual(Math.cos(38 * Math.PI / 180));
          expect(sunreachPlantingClearance(pose.x, pose.z), route.id).toBeGreaterThan(0.35);
          for (const spec of SUNREACH_DRESSING) {
            expect(Math.hypot(pose.x - spec.x, pose.z - spec.z), `${route.id} / ${spec.id}`)
              .toBeGreaterThan(sunreachDressingRadius(spec) + 0.35);
          }
        }
      }
    }
    expect(NPCS.find(npc => npc.id === "npc.tomas")?.anchor).toEqual(SUNREACH_NPC_STATIONS.tomas);
    expect(NPCS.find(npc => npc.id === "npc.ines")?.anchor).toEqual(SUNREACH_NPC_STATIONS.ines);
  });

  it("keeps the scenic boats at sea and clear of the player's mooring", () => {
    for (const route of SUNREACH_AMBIENT_BOAT_ROUTES) {
      expect(AMBIENT_BOAT_ROUTES).toContain(route);
      for (let step = 0; step < 720; step += 1) {
        const pose = sampleAmbientBoatPose(route, 2 * Math.PI * step / (720 * route.speed));
        expect(WorldLayout.isSailable(pose.x, pose.z)).toBe(true);
        expect(Math.hypot(pose.x - SUNREACH_ANCHORS.dockBoat.x, pose.z - SUNREACH_ANCHORS.dockBoat.z)).toBeGreaterThan(24);
      }
    }
  });

  it.each([1, 42, 20260921])("retains deterministic fill budgets and reserves at seed %s", seed => {
    const structure = generateSunreachCausalCompositionPlacements(seed);
    const cover = generateSunreachGroundCoverPlacements(seed);
    expect(structure).toHaveLength(148);
    expect(cover).toHaveLength(528);
    expect(structure).toEqual(generateSunreachCausalCompositionPlacements(seed));
    expect(cover).toEqual(generateSunreachGroundCoverPlacements(seed));
    for (const placement of structure) {
      const radius = placement.assetId.startsWith("tree_") ? 3.6 : placement.assetId.startsWith("foliage_") ? 1.8 : 1.75;
      expect(clearsSunreachDressing(placement.x, placement.z, radius), placement.id).toBe(true);
    }
    for (const placement of cover) {
      const radius = placement.category === "flowers" ? 3.6 : placement.category === "grass" ? 1.6 : 1.3;
      expect(clearsSunreachDressing(placement.x, placement.z, radius), placement.id).toBe(true);
      expect(WorldLayout.isWater(placement.x, placement.z)).toBe(false);
    }
  }, 60000);
});
