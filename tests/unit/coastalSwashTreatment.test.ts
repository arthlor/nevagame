import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { WorldLayout, SHORE_TREATMENT_TABLE } from "../../src/world/WorldLayout";
import { harborCoastInfluence } from "../../src/world/HarborCoast";
import { COASTAL_FIELD_GLSL, createWaterDepthMap } from "../../src/render/water/CoastalOptics";
import { buildShoreFoamPatches } from "../../src/render/water/ShoreFoam";
import { createWorldDiagnosticOverlay } from "../../src/render/scene/WorldDiagnosticOverlay";
import { SUNREACH_OFFSET_X } from "../../src/world/WorldIslands";

describe("W04 All-Coast Coastal Swash and Contact Treatment", () => {
  describe("SHORE_TREATMENT_TABLE", () => {
    it("defines treatments for all canonical shore kinds", () => {
      const kinds = ["sand", "rock-shelf", "cliff", "sheltered"] as const;
      for (const kind of kinds) {
        const treatment = SHORE_TREATMENT_TABLE[kind];
        expect(treatment).toBeDefined();
        expect(treatment.waterContactStrength).toBeGreaterThan(0);
        expect(treatment.landContactStrength).toBeGreaterThan(0);
        expect(treatment.waterReachMeters).toBeGreaterThan(0);
        expect(treatment.landReachMeters).toBeGreaterThan(0);
      }

      expect(SHORE_TREATMENT_TABLE.sand.landReachMeters)
        .toBeGreaterThan(SHORE_TREATMENT_TABLE.cliff.landReachMeters);
      expect(SHORE_TREATMENT_TABLE.cliff.landContactStrength)
        .toBeLessThan(SHORE_TREATMENT_TABLE.sand.landContactStrength);
      expect(SHORE_TREATMENT_TABLE["rock-shelf"].waterContactStrength)
        .toBeGreaterThan(SHORE_TREATMENT_TABLE.sand.waterContactStrength);
    });
  });

  describe("WorldLayout.coastalContactWeightAt", () => {
    it("preserves the reference harbor profile bit-exact as protected comparison region", () => {
      const harborPoints = [
        { x: 106, z: 65 },
        { x: 116, z: 75 },
        { x: 132, z: 80 },
        { x: 143, z: 90 }
      ];

      for (const { x, z } of harborPoints) {
        const expected = harborCoastInfluence(x, z);
        if (expected > 0.001) {
          expect(WorldLayout.coastalContactWeightAt(x, z)).toBe(expected);
        }
      }
    });

    it("suppresses swash along freshwater riverbanks to keep them foam-free", () => {
      // Middle river
      expect(WorldLayout.coastalContactWeightAt(-14, -7)).toBe(0);
      // Upper river
      expect(WorldLayout.coastalContactWeightAt(-26, -96)).toBe(0);
      // Headwaters
      expect(WorldLayout.coastalContactWeightAt(-30, -140)).toBe(0);
    });

    it("provides continuous swash coverage across all non-harbor ocean shorelines", () => {
      // Neva southern beach (outside harbor)
      const southBeach = WorldLayout.coastalContactWeightAt(-130, 96);
      expect(southBeach).toBeGreaterThan(0.3);

      // Neva lighthouse headland (cliff)
      // Neva western beach
      const westBeach = WorldLayout.coastalContactWeightAt(-188, -60);
      expect(westBeach).toBeGreaterThan(0.3);

      // Neva northern sea cliff
      const northCliff = WorldLayout.coastalContactWeightAt(0, -234);
      expect(northCliff).toBeGreaterThan(0.05);
      // Cliffs have reduced swash compared to beaches
      expect(northCliff).toBeLessThan(westBeach);

      // Sunreach cove
      const sunreachCove = WorldLayout.coastalContactWeightAt(350 + SUNREACH_OFFSET_X, 58);
      expect(sunreachCove).toBeGreaterThan(0.2);

      // Gull's Rest islet
      const gullsRest = WorldLayout.coastalContactWeightAt(420, 240);
      expect(gullsRest).toBeGreaterThan(0.2);
    });

    it("falls off cleanly deep inland and far offshore", () => {
      // Deep inland on Neva farm
      expect(WorldLayout.coastalContactWeightAt(-60, -60)).toBe(0);
      // Far offshore in the channel
      expect(WorldLayout.coastalContactWeightAt(250, 0)).toBe(0);
    });
  });

  describe("waterDepthMapSteps and CoastalOptics channel A", () => {
    it("bakes coastalContactWeightAt into channel A of uWaterDepthMap", () => {
      // Sample a small bounds around western beach (-190, -60)
      const bounds = new THREE.Vector4(-200, -70, 20, 20);
      const texture = createWaterDepthMap(bounds, 5, 5);
      const data = texture.image.data as Uint16Array;

      // Sample center texel (-190, -60)
      const centerIndex = (2 * 5 + 2) * 4;
      const channelA = THREE.DataUtils.fromHalfFloat(data[centerIndex + 3]);
      const expectedWeight = WorldLayout.coastalContactWeightAt(-190, -60);

      expect(channelA).toBeCloseTo(expectedWeight, 2);
      expect(channelA).toBeGreaterThan(0.2);

      texture.dispose();
    });
  });

  describe("local shore coordinates and legacy coordination", () => {
    it("derives swash direction from the local signed-distance gradient", () => {
      expect(COASTAL_FIELD_GLSL).toContain("nevaShoreTangent");
      expect(COASTAL_FIELD_GLSL).toContain("alongShore");
      expect(COASTAL_FIELD_GLSL).not.toContain("(xz.x + xz.y");
    });

    it("attenuates overlapping broken patches instead of globally dimming their material", () => {
      const patches = buildShoreFoamPatches();
      let overlapping = 0;
      for (const patch of patches) {
        const contact = WorldLayout.coastalContactWeightAt(patch.center.x, patch.center.z);
        if (contact <= 0.05) continue;
        overlapping += 1;
        expect(patch.exposure).toBeLessThanOrEqual(1 - contact * 0.82 + 0.000001);
      }
      expect(overlapping).toBeGreaterThan(0);
    });
  });

  describe("W04.2 local-shore placement and all-side coverage overlay", () => {
    it("derives every patch from local shore coordinates instead of a southern sweep", () => {
      const patches = buildShoreFoamPatches();
      expect(patches.length).toBeGreaterThan(40);
      for (const patch of patches) {
        const normalLength = Math.hypot(patch.waterNormal.x, patch.waterNormal.z);
        const tangentLength = Math.hypot(patch.tangent.x, patch.tangent.z);
        expect(normalLength).toBeCloseTo(1, 5);
        expect(tangentLength).toBeCloseTo(1, 5);
        expect(Math.abs(
          patch.tangent.x * patch.waterNormal.x + patch.tangent.z * patch.waterNormal.z
        )).toBeLessThan(0.00001);
        // No dry-ground spill: the whole quad footprint stays water-side.
        expect(WorldLayout.waterSignedDistance(patch.center.x, patch.center.z))
          .toBeGreaterThan(patch.width * 0.5);
      }
    });

    it("covers every island and side, with the harbor protected and river banks clear", () => {
      const patches = buildShoreFoamPatches();
      const near = (x: number, z: number, cx: number, cz: number, radius: number) =>
        Math.hypot(x - cx, z - cz) < radius;
      const sides: Record<string, boolean> = {
        west: patches.some((p) => p.center.x < -150 && p.center.z > -200 && p.center.z < 100),
        north: patches.some((p) => p.center.z < -180),
        east: patches.some((p) => p.center.x > 150 && p.center.x < 300 && p.center.z > 60),
        south: patches.some((p) => p.center.z > 60 && p.center.x > -183 && p.center.x < 180),
        sunreach: patches.some((p) => p.center.x > 700),
        gullsRest: patches.some((p) => near(p.center.x, p.center.z, 420, 215, 60)),
        driftwood: patches.some((p) => near(p.center.x, p.center.z, 735, -65, 70)),
        lantern: patches.some((p) => near(p.center.x, p.center.z, 960, 295, 70))
      };
      for (const [side, covered] of Object.entries(sides)) {
        expect(covered, side).toBe(true);
      }
      expect(patches.every((p) => harborCoastInfluence(p.center.x, p.center.z) === 0)).toBe(true);
      expect(patches.every((p) => WorldLayout.estuaryInfluence(p.center.x, p.center.z) <= 0.06)).toBe(true);
    });

    it("draws the all-side coverage overlay from the same shared contact field", () => {
      const group = createWorldDiagnosticOverlay("shore-contact", 42891);
      const coverage = group.getObjectByName("shore-contact:coverage") as THREE.Points;
      const accents = group.getObjectByName("shore-contact:broken-patches") as THREE.Points;
      expect(coverage).toBeDefined();
      expect(accents).toBeDefined();
      const positions = coverage.geometry.getAttribute("position");
      expect(positions.count).toBeGreaterThan(200);
      let west = false;
      let north = false;
      let sunreach = false;
      let islet = false;
      for (let index = 0; index < positions.count; index += 1) {
        const x = positions.getX(index);
        const z = positions.getZ(index);
        west ||= x < -150 && z > -200 && z < 100;
        north ||= z < -180;
        sunreach ||= x > 700;
        islet ||= Math.hypot(x - 420, z - 215) < 60;
      }
      expect(west && north && sunreach && islet).toBe(true);
    });
  });
});
