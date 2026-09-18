import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  attachSurfaceFieldAttributes,
  withExposedRock,
  terrainDryClimateWeight,
  SURFACE_FIELD_ATTRIBUTE_NAMES
} from "../../src/render/materials/SurfaceFieldAttributes";
import {
  WORLD_LAYOUT_V5,
  WorldLayout
} from "../../src/world/WorldLayout";

const WEIGHT_KEYS = [
  "grass",
  "meadow",
  "drySoil",
  "dampSoil",
  "path",
  "shoulder",
  "beach",
  "riverbed",
  "wetShoreline",
  "cliff"
] as const;

describe("shared world surface field", () => {
  it("derives dry-island color from canonical drainage without changing surface truth", () => {
    const neva = WorldLayout.terrainSurfaceSample(-65, -55);
    expect(terrainDryClimateWeight(neva)).toBe(0);
    const sunreach = WorldLayout.terrainSurfaceSample(570 + 800, 80);
    const original = structuredClone(sunreach);
    expect(sunreach.drainage?.islandId).toBe("island.sunreach");
    expect(terrainDryClimateWeight(sunreach)).toBeCloseTo(1 - sunreach.drainage!.moisturePotential);
    const damp = { ...sunreach, drainage: { ...sunreach.drainage!, moisturePotential: 0.8 } };
    expect(terrainDryClimateWeight(damp)).toBeCloseTo(0.2);
    expect(terrainDryClimateWeight(damp)).toBeLessThan(terrainDryClimateWeight(sunreach));
    expect(sunreach).toEqual(original);
  });
  it("keeps normalized weights and causal fields finite through the connected slice", () => {
    const riverZ = 0;
    const coastSamples = [
      { name: "farm", x: -65, z: -55 },
      { name: "farm-edge", x: -57, z: -55 },
      { name: "road", x: WORLD_LAYOUT_V5.routes[0]!.points[0]!.x, z: WORLD_LAYOUT_V5.routes[0]!.points[0]!.z },
      { name: "bridge", x: WORLD_LAYOUT_V5.anchors.bridge.x, z: WORLD_LAYOUT_V5.anchors.bridge.z },
      {
        name: "riverbank",
        x: WorldLayout.riverCenterX(riverZ) + WorldLayout.riverHalfWidth(riverZ) + 1.2,
        z: riverZ
      },
      {
        name: "beach",
        x: 72,
        z: WorldLayout.coastlineZ(72) - 3
      },
      {
        name: "cliff",
        x: -92,
        z: WorldLayout.coastlineZ(-92) - 12
      }
    ];

    for (const point of coastSamples) {
      const sample = WorldLayout.terrainSurfaceSample(point.x, point.z);
      const values = WEIGHT_KEYS.map((key) => sample.weights[key]);
      expect(values.every(Number.isFinite), point.name).toBe(true);
      expect(values.every((value) => value >= -0.000001), point.name).toBe(true);
      expect(values.reduce((sum, value) => sum + value, 0), point.name).toBeCloseTo(1, 6);
      expect(sample.farmInfluence, point.name).toBeGreaterThanOrEqual(0);
      expect(sample.farmInfluence, point.name).toBeLessThanOrEqual(1);
      expect(sample.shorelineWetness, point.name).toBeGreaterThanOrEqual(0);
      expect(sample.shorelineWetness, point.name).toBeLessThanOrEqual(1);
      expect(WorldLayout.terrainSurfaceWeights(point.x, point.z)).toEqual(sample.weights);

      const left = WorldLayout.terrainSurfaceSample(point.x - 0.05, point.z).weights;
      const right = WorldLayout.terrainSurfaceSample(point.x + 0.05, point.z).weights;
      for (const key of WEIGHT_KEYS) {
        expect(Math.abs(right[key] - left[key]), `${point.name}:${key}`).toBeLessThan(0.35);
      }
      expect(WorldLayout.terrainHeight(point.x, point.z)).toBe(
        WorldLayout.terrainBaseHeight(point.x, point.z)
          + WorldLayout.roadSurfaceSample(point.x, point.z).surfaceOffsetMeters
      );
    }
  });

  it("exposes rock without mutating canonical weights or repainting farm and road cores", () => {
    const canonical = WorldLayout.terrainSurfaceSample(-92, WorldLayout.coastlineZ(-92) - 12);
    const sample = { ...canonical, farmInfluence: 0, weights: {
      ...Object.fromEntries(WEIGHT_KEYS.map(key => [key, 0])),
      grass: 0.6, meadow: 0.2, cliff: 0.2
    } } as typeof canonical;
    const original = structuredClone(sample);
    const exposed = withExposedRock(sample, 0.75);
    expect(exposed.weights.cliff).toBeCloseTo(0.8);
    expect(Object.values(exposed.weights).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(sample).toEqual(original);
    expect(withExposedRock({ ...sample, farmInfluence: 1 }, 1).weights).toEqual(sample.weights);
    const road = { ...sample, weights: { ...sample.weights, grass: 0, path: 0.6 } };
    expect(withExposedRock(road, 1).weights).toEqual(road.weights);
  });

  it("packs finite, clamped vec4 attributes at the exact geometry vertex count", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([
        0, 0, 0,
        1, 0, 1,
        2, 0, 2
      ], 3)
    );
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute([
        0, 1, 0,
        0, 0.8, 0,
        0, 0.6, 0
      ], 3)
    );

    attachSurfaceFieldAttributes(geometry, (_x, _z, sampledNormalY) => ({
      weights: {
        grass: sampledNormalY === 1 ? 2 : 0.25,
        meadow: 0.2,
        drySoil: -1,
        dampSoil: 0.75,
        path: 0.4,
        shoulder: 0.5,
        beach: 0.6,
        riverbed: 0.7,
        wetShoreline: 0.8,
        cliff: 0.9
      },
      farmInfluence: Number.NaN,
      shorelineWetness: 1.4,
      river: WorldLayout.riverBankSample(_x, _z)
    }));

    for (const name of Object.values(SURFACE_FIELD_ATTRIBUTE_NAMES)) {
      const attribute = geometry.getAttribute(name);
      expect(attribute).toBeDefined();
      expect(attribute.itemSize).toBe(4);
      expect(attribute.count).toBe(geometry.getAttribute("position").count);
      expect(attribute.normalized).toBe(true);
      expect(attribute.array).toBeInstanceOf(Uint8Array);
      expect(Array.from(attribute.array as Uint8Array).every((value) => value >= 0 && value <= 255)).toBe(true);
    }
    const weights0 = geometry.getAttribute(SURFACE_FIELD_ATTRIBUTE_NAMES.weights0);
    expect(weights0.getX(0)).toBeCloseTo(1);
    expect(weights0.getY(0)).toBeCloseTo(0.2);
    expect(weights0.getZ(0)).toBe(0);
    expect(weights0.getW(0)).toBeCloseTo(0.75);
    const causes = geometry.getAttribute(SURFACE_FIELD_ATTRIBUTE_NAMES.causes);
    expect(causes.getX(0)).toBeCloseTo(0.8);
    expect(causes.getY(0)).toBeCloseTo(0.9);
    expect(causes.getZ(0)).toBe(0);
    expect(causes.getW(0)).toBeCloseTo(1);
    geometry.dispose();
  });
});
