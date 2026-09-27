import { describe, expect, it } from "vitest";
import { MAINLAND_ROAD_NETWORK, MAINLAND_ROAD_NETWORK_FINGERPRINT } from "../../src/world/MainlandRoadNetwork.generated";
import { MAINLAND_ARCHITECTURE_PADS } from "../../src/world/MainlandSettlementLayout";
import { MAINLAND_LANDING_LANES, MAINLAND_ROAD_DESTINATIONS, MAINLAND_ROUTES } from "../../src/world/NevaMainland";
import { WORLD_ROUTE_JUNCTIONS, WORLD_ROUTE_NETWORK, WorldLayout } from "../../src/world/WorldLayout";
import { mainlandRoadNetworkFingerprint } from "../../tools/world/mainlandRoadNetwork";

const key = (knot: readonly (number | undefined)[]) => `${knot[0]}:${knot[1]}`;

describe("mainland road network", () => {
  it("was planned over today's terrain and destinations (run npm run world:plan-roads after either changes)", () => {
    expect(mainlandRoadNetworkFingerprint()).toBe(MAINLAND_ROAD_NETWORK_FINGERPRINT);
  });

  it("reaches every place it serves and keeps the retained gateways and landing lanes", () => {
    const knots = new Set(MAINLAND_ROAD_NETWORK.flatMap(road => road.knots.map(key)));
    for (const place of MAINLAND_ROAD_DESTINATIONS) {
      const served = knots.has(key(place.knot))
        || MAINLAND_ROUTES.some(road => road.points.some(point =>
          Math.hypot(point.x - place.knot[0], point.z - place.knot[1]) < road.widthMeters * 0.5 + 12));
      expect(served, place.id).toBe(true);
      for (const knot of place.approach ?? []) expect(knots.has(key(knot)), `${place.id} ${key(knot)}`).toBe(true);
    }
    for (const lane of MAINLAND_LANDING_LANES) {
      const road = MAINLAND_ROAD_NETWORK.find(candidate => candidate.id === lane.id);
      expect(road?.knots, lane.id).toEqual(expect.arrayContaining(lane.knots.map(knot => expect.arrayContaining([...knot]))));
    }
  });

  it("gives traffic its class: freight between villages, lanes to work sites, footpaths to fishing banks", () => {
    const kindAt = (placeId: string) => {
      const place = MAINLAND_ROAD_DESTINATIONS.find(candidate => candidate.id === placeId)!;
      return MAINLAND_ROAD_NETWORK.filter(road => road.knots.some(knot => key(knot) === key(place.knot))).map(road => road.kind);
    };
    for (const place of MAINLAND_ROAD_DESTINATIONS) {
      const kinds = kindAt(place.id);
      if (kinds.length === 0) continue;
      if (place.role === "village") expect(kinds, place.id).toContain("arterial");
      if (place.role === "work") expect(kinds.every(kind => kind === "lane"), place.id).toBe(true);
      if (place.role === "fishing") expect(kinds.every(kind => kind === "trail"), place.id).toBe(true);
    }
  });

  it("keeps knots dry and clear of village buildings", () => {
    for (const road of MAINLAND_ROAD_NETWORK) {
      for (const [x, z] of road.knots) {
        const landing = road.knots.length > 0 && MAINLAND_LANDING_LANES.some(lane => lane.id === road.id);
        if (!landing) expect(WorldLayout.waterSignedDistance(x, z), `${road.id} ${x},${z}`).toBeLessThan(0);
        for (const pad of MAINLAND_ARCHITECTURE_PADS) {
          expect(Math.hypot(x - pad.center.x, z - pad.center.z), `${road.id} ${pad.id}`).toBeGreaterThan(Math.hypot(...pad.envelope));
        }
      }
    }
  });

  it("joins roads at shared knots that turn into junctions, and branches leave at a proper angle", () => {
    const shared = new Map<string, string[]>();
    for (const road of MAINLAND_ROAD_NETWORK) {
      for (const knot of road.knots) shared.set(key(knot), [...(shared.get(key(knot)) ?? []), road.id]);
    }
    const junctionAt = new Map(WORLD_ROUTE_JUNCTIONS.map(junction => [`${junction.center.x}:${junction.center.z}`, junction]));
    for (const [position, roads] of shared) {
      if (roads.length < 2) continue;
      const junction = junctionAt.get(position);
      expect(junction, position).toBeDefined();
      expect([...junction!.routeIds].sort(), position).toEqual(expect.arrayContaining([...new Set(roads)].sort()));
      // Headings of every arm leaving this knot differ by at least 30 degrees.
      const [x, z] = position.split(":").map(Number);
      const headings: number[] = [];
      for (const road of MAINLAND_ROUTES.filter(candidate => roads.includes(candidate.id))) {
        const index = road.points.findIndex(point => point.x === x && point.z === z);
        for (const step of [-1, 1]) {
          let k = index + step;
          while (k >= 0 && k < road.points.length && Math.hypot(road.points[k].x - x, road.points[k].z - z) < 6) k += step;
          if (k < 0 || k >= road.points.length) continue;
          headings.push(Math.atan2(road.points[k].z - z, road.points[k].x - x));
        }
      }
      for (let i = 0; i < headings.length; i++) {
        for (let j = i + 1; j < headings.length; j++) {
          const difference = Math.abs(Math.atan2(Math.sin(headings[i] - headings[j]), Math.cos(headings[i] - headings[j])));
          expect(difference * 180 / Math.PI, position).toBeGreaterThan(30);
        }
      }
    }
  });

  it("keeps each class within its grade and links the whole network to the starter district", () => {
    // The grading clamp in `NevaMainland`'s road builder.
    const hard = { arterial: 0.22, lane: 0.25, trail: 0.36 } as const;
    for (const road of MAINLAND_ROUTES) {
      for (let i = 1; i < road.points.length; i++) {
        const run = Math.hypot(road.points[i].x - road.points[i - 1].x, road.points[i].z - road.points[i - 1].z);
        if (run < 0.5) continue;
        expect(Math.abs(road.elevations[i] - road.elevations[i - 1]) / run, `${road.id} ${i}`).toBeLessThanOrEqual(hard[road.kind] + 1e-9);
      }
    }
    const linked = new Map(WORLD_ROUTE_NETWORK.map(route => [route.id, new Set<string>()]));
    for (const junction of WORLD_ROUTE_JUNCTIONS) {
      for (const routeId of junction.routeIds) {
        for (const other of junction.routeIds) if (other !== routeId) linked.get(routeId)!.add(other);
      }
    }
    const reachable = new Set(["farm-village"]);
    const pending = ["farm-village"];
    while (pending.length > 0) {
      for (const next of linked.get(pending.pop()!) ?? []) {
        if (reachable.has(next)) continue;
        reachable.add(next);
        pending.push(next);
      }
    }
    for (const road of MAINLAND_ROUTES) expect(reachable.has(road.id), road.id).toBe(true);
  });
});
