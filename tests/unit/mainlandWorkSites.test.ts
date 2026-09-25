import { describe, expect, it } from "vitest";
import { MARKETS } from "../../src/content/markets";
import { ASSET_BY_ID } from "../../src/render/assets/AssetCatalog";
import { MAINLAND_ARCHITECTURE_PADS } from "../../src/world/MainlandSettlementLayout";
import { MAINLAND_WORK_SITES, mainlandWorkSitePoint, type MainlandWorkSite } from "../../src/world/MainlandWorkSites";
import {
  MAINLAND_LAKE, MAINLAND_VILLAGES, mainlandBiomeAt, mainlandMountainExposureAt, mainlandWaterSample
} from "../../src/world/NevaMainland";
import { createWorldStaticPlacements } from "../../src/world/WorldEnvironmentLayout";
import { signedDistanceToNevaCoast } from "../../src/world/WorldIslands";
import { WorldLayout } from "../../src/world/WorldLayout";

const site = (id: string): MainlandWorkSite => MAINLAND_WORK_SITES.find(entry => entry.id === id)!;
const at = (entry: MainlandWorkSite, x: number, z: number) => mainlandWorkSitePoint(entry, x, z);
const height = (point: { x: number; z: number }) => WorldLayout.terrainHeight(point.x, point.z);
const roadGap = (point: { x: number; z: number }) => {
  const road = WorldLayout.nearestRouteDistance(point.x, point.z);
  return road.distance - road.halfWidth - road.shoulderWidthMeters;
};

function footprintSamples(entry: MainlandWorkSite) {
  const [minX, maxX, minZ, maxZ] = entry.footprint;
  const samples = [];
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
    samples.push(at(entry, minX + (maxX - minX) * i / 4, minZ + (maxZ - minZ) * j / 4));
  }
  return samples;
}

describe("mainland work sites", () => {
  it("publish every site asset and account only for goods a mainland market trades", () => {
    const traded = new Set(Object.values(MARKETS).flatMap(market => [
      ...market.commodities.map(entry => entry.itemId), ...(market.retail?.itemIds ?? [])
    ]));
    for (const entry of MAINLAND_WORK_SITES) {
      expect(ASSET_BY_ID.has(entry.assetId as never), entry.id).toBe(true);
      for (const companion of entry.companions) expect(ASSET_BY_ID.has(companion.assetId as never), companion.assetId).toBe(true);
      for (const item of entry.supplies) expect(traded.has(item), `${entry.id} ${item}`).toBe(true);
    }
  });

  it("keep every working footprint dry, off the roads and clear of village buildings", () => {
    for (const entry of MAINLAND_WORK_SITES) {
      const heights: number[] = [];
      for (const point of footprintSamples(entry)) {
        expect(WorldLayout.isWater(point.x, point.z), `${entry.id} ${point.x},${point.z}`).toBe(false);
        expect(roadGap(point), `${entry.id} road`).toBeGreaterThan(1);
        for (const pad of MAINLAND_ARCHITECTURE_PADS) {
          expect(Math.hypot(point.x - pad.center.x, point.z - pad.center.z), `${entry.id} ${pad.id}`)
            .toBeGreaterThan(Math.hypot(...pad.envelope) + 3);
        }
        heights.push(height(point));
        if (entry.level) expect(WorldLayout.terrainNormalY(point.x, point.z), `${entry.id} level`).toBeGreaterThanOrEqual(0.93);
      }
      if (entry.level) expect(Math.max(...heights) - Math.min(...heights), entry.id).toBeLessThanOrEqual(0.7);
    }
  });

  it("cut the Highridge adit into a rock face above the village, at the end of its track", () => {
    const adit = site("highridge-adit");
    const market = MAINLAND_VILLAGES.highridge.market;
    expect(Math.hypot(adit.center.x - market.x, adit.center.z - market.z)).toBeLessThan(260);
    // A level apron in front, a steep rise behind.
    for (const z of [1.5, 3]) expect(WorldLayout.terrainNormalY(at(adit, 0, z).x, at(adit, 0, z).z)).toBeGreaterThanOrEqual(0.86);
    expect(height(at(adit, 0, -5)) - height(adit.center)).toBeGreaterThan(2);
    expect(height(at(adit, 0, -9)) - height(adit.center)).toBeGreaterThan(3.5);
    expect(Math.max(mainlandMountainExposureAt(at(adit, 0, -8).x, at(adit, 0, -8).z),
      mainlandMountainExposureAt(at(adit, 0, -14).x, at(adit, 0, -14).z))).toBeGreaterThan(0.15);
    expect(roadGap(adit.center)).toBeLessThan(12);
    expect(WorldLayout.nearestRouteDistance(adit.center.x, adit.center.z).route.id).toBe("mainland-highridge-overlook");
  });

  it("dig the ice house into a bank above the forest lake, door toward the water, beside the road", () => {
    const house = site("lake-ice-house");
    const shore = -mainlandWaterSample(house.center.x, house.center.z).signedDistance;
    expect(shore).toBeGreaterThan(9);
    expect(shore).toBeLessThan(45);
    expect(height(at(house, 0, -4)) - height(house.center)).toBeGreaterThan(0.9);
    const front = at(house, 0, 1);
    const toLake = { x: MAINLAND_LAKE.center.x - house.center.x, z: MAINLAND_LAKE.center.z - house.center.z };
    const facing = ((front.x - house.center.x) * toLake.x + (front.z - house.center.z) * toLake.z) / Math.hypot(toLake.x, toLake.z);
    expect(facing).toBeGreaterThan(0.3);
    expect(roadGap(house.center)).toBeLessThan(45);
  });

  it("lay the salt pans on low flats beside the cove with their brine row toward the sea", () => {
    const pans = site("reedhaven-salt-pans");
    const sea = -signedDistanceToNevaCoast(pans.center.x, pans.center.z);
    expect(sea).toBeGreaterThan(6);
    expect(sea).toBeLessThan(40);
    for (const point of footprintSamples(pans)) {
      expect(height(point)).toBeGreaterThan(0.3);
      expect(height(point)).toBeLessThan(2.8);
      expect(mainlandWaterSample(point.x, point.z).signedDistance).toBeLessThan(-8);
    }
    const seaward = at(pans, 0, -2.1), inland = at(pans, 0, 2.1);
    expect(signedDistanceToNevaCoast(seaward.x, seaward.z)).toBeGreaterThan(signedDistanceToNevaCoast(inland.x, inland.z));
    const landing = MAINLAND_VILLAGES.reedhaven.landing;
    expect(Math.hypot(pans.center.x - landing.x, pans.center.z - landing.z)).toBeLessThan(40);
  });

  it("stack Pinewatch timber on level pine ground facing the village road", () => {
    const yard = site("pinewatch-timber-yard");
    expect(mainlandBiomeAt(yard.center.x, yard.center.z)).toBe("biome.pine_forest");
    const market = MAINLAND_VILLAGES.pinewatch.market;
    expect(Math.hypot(yard.center.x - market.x, yard.center.z - market.z)).toBeLessThan(170);
    const road = WorldLayout.nearestRouteDistance(yard.center.x, yard.center.z);
    const front = at(yard, 0, 1);
    const toRoad = { x: road.point.x - yard.center.x, z: road.point.z - yard.center.z };
    const facing = ((front.x - yard.center.x) * toRoad.x + (front.z - yard.center.z) * toRoad.z) / Math.hypot(toRoad.x, toRoad.z);
    expect(facing).toBeGreaterThan(Math.cos(Math.PI / 4));
    expect(roadGap(yard.center)).toBeGreaterThan(3);
    expect(roadGap(yard.center)).toBeLessThan(14);
  });

  it("places every site and companion in the world layout", () => {
    const ids = new Set(createWorldStaticPlacements(42).map(placement => placement.id));
    for (const entry of MAINLAND_WORK_SITES) {
      expect(ids.has(`authored.mainland.worksite.${entry.id}`), entry.id).toBe(true);
      for (const companion of entry.companions) {
        expect(ids.has(`authored.mainland.worksite.${entry.id}.${companion.key}`), `${entry.id}.${companion.key}`).toBe(true);
      }
    }
  }, 120_000);
});
