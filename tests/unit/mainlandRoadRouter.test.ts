import { describe, expect, it } from "vitest";
import { MAINLAND_ROUTE_FINGERPRINT, MAINLAND_ROUTED_LEGS } from "../../src/world/MainlandRoutes.generated";
import { MAINLAND_ARCHITECTURE_PADS } from "../../src/world/MainlandSettlementLayout";
import { MAINLAND_ROUTE_PLANS, MAINLAND_ROUTES, mainlandRouteKnots } from "../../src/world/NevaMainland";
import { WorldLayout } from "../../src/world/WorldLayout";
import { mainlandRouteFingerprint } from "../../tools/world/mainlandRoadRouter";

describe("routed mainland roads", () => {
  it("were routed over today's terrain (run npm run world:route-roads after a landform change)", () => {
    expect(mainlandRouteFingerprint()).toBe(MAINLAND_ROUTE_FINGERPRINT);
  });

  it("route every planned leg and keep the authored endpoints, junctions and datums", () => {
    for (const plan of MAINLAND_ROUTE_PLANS) {
      const legs = plan.steps.filter(step => step === "route").length;
      expect(MAINLAND_ROUTED_LEGS[plan.id]?.length ?? 0, plan.id).toBe(legs);
      const knots = mainlandRouteKnots(plan);
      for (const step of plan.steps) if (step !== "route") expect(knots, plan.id).toContainEqual(step);
      const route = MAINLAND_ROUTES.find(candidate => candidate.id === plan.id)!;
      const first = plan.steps[0] as readonly number[], last = plan.steps[plan.steps.length - 1] as readonly number[];
      expect(route.points[0]).toEqual({ x: first[0], z: first[1] });
      expect(route.points[route.points.length - 1]).toEqual({ x: last[0], z: last[1] });
    }
  });

  it("keep routed knots dry and clear of village buildings", () => {
    for (const [id, legs] of Object.entries(MAINLAND_ROUTED_LEGS)) {
      for (const [x, z] of legs.flat()) {
        expect(WorldLayout.isWater(x, z), `${id} ${x},${z}`).toBe(false);
        for (const pad of MAINLAND_ARCHITECTURE_PADS) {
          expect(Math.hypot(x - pad.center.x, z - pad.center.z), `${id} ${pad.id}`)
            .toBeGreaterThan(Math.hypot(...pad.envelope));
        }
      }
    }
  });
});
