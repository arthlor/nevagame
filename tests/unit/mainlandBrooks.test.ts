import { describe, expect, it } from "vitest";
import { MAINLAND_BROOK_COURSES, MAINLAND_BROOK_FINGERPRINT } from "../../src/world/MainlandBrooks.generated";
import { mainlandBrookAt, mainlandBrookFloorHalfWidth } from "../../src/world/MainlandBrooks";
import { MAINLAND_ARCHITECTURE_PADS } from "../../src/world/MainlandSettlementLayout";
import { mainlandWorkSiteClearanceAt } from "../../src/world/MainlandWorkSites";
import {
  mainlandBrookRoadCrossings, mainlandGroundBeforeBrooksAt, mainlandRouteGroundAt, mainlandWaterSample
} from "../../src/world/NevaMainland";
import { createWorldStaticPlacements } from "../../src/world/WorldEnvironmentLayout";
import { signedDistanceToNevaCoast } from "../../src/world/WorldIslands";
import { WorldLayout } from "../../src/world/WorldLayout";
import { mainlandBrookFingerprint } from "../../tools/world/mainlandBrookTracer";

const course = (id: string) => MAINLAND_BROOK_COURSES.find(brook => brook.id === id)!;

describe("mainland brooks", () => {
  it("were traced over today's terrain and roads (run npm run world:trace-brooks after either changes)", () => {
    expect(mainlandBrookFingerprint()).toBe(MAINLAND_BROOK_FINGERPRINT);
  });

  it("rise in the mountains and reach the lake, the river, the sea or another brook", () => {
    const outlets = new Set<string>();
    for (const brook of MAINLAND_BROOK_COURSES) {
      outlets.add(brook.outlet);
      const mouth = brook.knots[brook.knots.length - 1];
      if (brook.outlet === "lake" || brook.outlet === "river") {
        expect(mainlandWaterSample(mouth[0], mouth[1]).signedDistance, brook.id).toBeGreaterThan(-2);
      } else if (brook.outlet === "sea") {
        expect(signedDistanceToNevaCoast(mouth[0], mouth[1]), brook.id).toBeGreaterThan(-2);
      } else {
        // A tributary ends on its trunk, at the trunk's bed.
        const trunk = course(brook.outlet);
        const nearest = trunk.knots.reduce((best, knot) =>
          Math.hypot(knot[0] - mouth[0], knot[1] - mouth[1]) < Math.hypot(best[0] - mouth[0], best[1] - mouth[1]) ? knot : best);
        expect(Math.hypot(nearest[0] - mouth[0], nearest[1] - mouth[1]), brook.id).toBeLessThan(0.2);
        expect(mouth[2], brook.id).toBeCloseTo(nearest[2], 2);
      }
    }
    // Every network rises in the mountains: its highest source is well up a range.
    const rootOf = (brook: (typeof MAINLAND_BROOK_COURSES)[number]) => {
      let root = brook;
      while (!["lake", "river", "sea"].includes(root.outlet)) root = course(root.outlet);
      return root.id;
    };
    const highest = new Map<string, number>();
    for (const brook of MAINLAND_BROOK_COURSES) {
      const root = rootOf(brook);
      highest.set(root, Math.max(highest.get(root) ?? 0, mainlandRouteGroundAt(brook.knots[0][0], brook.knots[0][1])));
    }
    for (const [root, height] of highest) expect(height, root).toBeGreaterThan(15.5);
    expect([...outlets]).toEqual(expect.arrayContaining(["lake", "river", "sea"]));
  });

  it("run downhill all the way, never through a building or a work site", () => {
    for (const brook of MAINLAND_BROOK_COURSES) {
      for (let i = 1; i < brook.knots.length; i++) {
        expect(brook.knots[i][2], `${brook.id} knot ${i}`).toBeLessThanOrEqual(brook.knots[i - 1][2]);
        expect(brook.knots[i][3], `${brook.id} catchment ${i}`).toBeGreaterThanOrEqual(brook.knots[i - 1][3] - 0.05);
      }
      for (const [x, z, , hectares] of brook.knots) {
        const floor = mainlandBrookFloorHalfWidth(hectares);
        expect(mainlandWorkSiteClearanceAt(x, z), `${brook.id} ${x},${z}`).toBeGreaterThan(floor);
        for (const pad of MAINLAND_ARCHITECTURE_PADS) {
          expect(Math.hypot(x - pad.center.x, z - pad.center.z), `${brook.id} ${pad.id}`).toBeGreaterThan(Math.hypot(...pad.envelope) + floor);
        }
      }
    }
  });

  it("cut a walkable channel onto their beds without terrain steps", () => {
    const roads = mainlandBrookRoadCrossings();
    for (const brook of MAINLAND_BROOK_COURSES) {
      for (let i = 1; i < brook.knots.length - 1; i++) {
        const [x, z, bed] = brook.knots[i];
        if (roads.some(crossing => Math.hypot(crossing.point.x - x, crossing.point.z - z) < 9)) continue;
        if (signedDistanceToNevaCoast(x, z) > -3 || mainlandWaterSample(x, z).signedDistance > -3) continue;
        expect(WorldLayout.isWater(x, z), `${brook.id} ${x},${z}`).toBe(false);
        expect(WorldLayout.isWalkable(x, z), `${brook.id} ${x},${z}`).toBe(true);
        expect(Math.abs(WorldLayout.naturalTerrainHeight(x, z) - bed), `${brook.id} ${x},${z}`).toBeLessThan(0.2);
        // Across the channel the ground rises smoothly from the floor to the banks.
        const next = brook.knots[i + 1];
        const length = Math.hypot(next[0] - x, next[1] - z);
        const nx = -(next[1] - z) / length, nz = (next[0] - x) / length;
        const h = (offset: number) => WorldLayout.naturalTerrainHeight(x + nx * offset, z + nz * offset);
        const natural = (offset: number) => mainlandGroundBeforeBrooksAt(x + nx * offset, z + nz * offset);
        for (let offset = -9; offset <= 9; offset += 0.5) {
          // A road deck stands behind its culvert headwall; that edge is the wall's to hide.
          const road = WorldLayout.nearestRouteDistance(x + nx * offset, z + nz * offset);
          if (road.distance < road.halfWidth + 2.5) continue;
          // The channel's banks may steepen the ground they cut, never by more than a bank's grade.
          const carved = Math.abs(h(offset + 0.25) - h(offset - 0.25));
          const ground = Math.abs(natural(offset + 0.25) - natural(offset - 0.25));
          expect(carved, `${brook.id} ${x},${z} at ${offset}`).toBeLessThan(ground + 0.34);
        }
      }
    }
  }, 120_000);

  it("pass under every road through a culvert with a headwall at each side", () => {
    const crossings = mainlandBrookRoadCrossings();
    expect(crossings.length).toBeGreaterThan(0);
    const placements = createWorldStaticPlacements(42).filter(placement => placement.assetId === "prop_culvert_headwall_a");
    for (const crossing of crossings) {
      const walls = placements.filter(placement => placement.id.includes(`culvert.${crossing.brookId}.${crossing.route.id}.`));
      expect(walls.length, `${crossing.brookId} ${crossing.route.id}`).toBe(2);
      for (const wall of walls) {
        const floor = mainlandBrookAt(wall.x, wall.z, 3)!;
        // The pipe and a skin of road fit between the floor and the road surface.
        expect(crossing.roadElevation - floor.bed, wall.id).toBeGreaterThan(1.15);
        const road = WorldLayout.nearestRouteDistance(wall.x, wall.z);
        expect(road.distance - road.halfWidth, wall.id).toBeGreaterThan(0.6);
        expect(road.distance - road.halfWidth, wall.id).toBeLessThan(1.6);
      }
      // A road crosses a brook; it never runs along one.
      const brook = course(crossing.brookId);
      let alongside = 0;
      for (let i = 1; i < brook.knots.length; i++) {
        const [ax, az] = brook.knots[i - 1], [bx, bz] = brook.knots[i];
        const length = Math.hypot(bx - ax, bz - az);
        for (let t = 0.5; t < length; t += 1) {
          const x = ax + (bx - ax) * t / length, z = az + (bz - az) * t / length;
          const road = WorldLayout.nearestRouteDistance(x, z);
          if (road.route.id === crossing.route.id && road.distance < road.halfWidth + 2) alongside += 1;
        }
      }
      expect(alongside, `${crossing.brookId} ${crossing.route.id}`).toBeLessThan(18);
    }
  }, 120_000);

  it("are traced on the natural ground they drain", () => {
    // The course follows the ground's drainage: its bed never stands far above the ground it crosses.
    for (const brook of MAINLAND_BROOK_COURSES) {
      for (const [x, z, bed] of brook.knots) {
        expect(bed - mainlandRouteGroundAt(x, z), `${brook.id} ${x},${z}`).toBeLessThan(0.6);
      }
    }
  });
});
