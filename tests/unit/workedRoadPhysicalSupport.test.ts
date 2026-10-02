import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TerrainSnappingSystem } from "../../src/layout-editor/TerrainSnapping";
import { PhysicsWorld } from "../../src/physics/PhysicsWorld";
import type { StaticCollisionProxy } from "../../src/physics/StaticCollision";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { collisionPolishProxies } from "../../src/persistence/migrateCollisionPolish76";
import { Simulation } from "../../src/simulation/Simulation";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { carriageFootprint, CARRIAGE_TUNING, STARTER_CARRIAGE_ID } from "../../src/simulation/mounts/Carriage";
import { playerPoseFromMount } from "../../src/simulation/mounts/Mounts";
import { PLAYER_TRAVERSAL_TUNING } from "../../src/simulation/navigation/PlayerTraversal";
import { BRIDGE_WORLD_PROFILE, WorldLayout, WORLD_LAYOUT_V5, type WorldPoint } from "../../src/world/WorldLayout";

const AGREEMENT_METERS = 0.02;
const WINDOW_METERS = 12;
const routes = WorldLayout.compiledRouteNetwork();
const route = (id: string) => routes.find(({ route }) => route.id === id)!;

function routeWindow(id: string, center: WorldPoint): WorldPoint[] {
  const compiled = route(id);
  const nearest = compiled.samples.reduce((a, b) => Math.hypot(a.point.x - center.x, a.point.z - center.z)
    < Math.hypot(b.point.x - center.x, b.point.z - center.z) ? a : b);
  return compiled.samples.filter(sample => Math.abs(sample.distanceAlongRoute - nearest.distanceAlongRoute) <= WINDOW_METERS)
    .map(({ point }) => point);
}

const sunreachJoin = route("route.sunreach.cove-terraces").samples.at(-1)!.point;
const joinedWindows = [
  { label: "starter compound fork", center: { x: 46, z: -44 }, path: routeWindow("farm-village", { x: 46, z: -44 }) },
  { label: "mainland adit fork", center: { x: -359.5, z: -321.8 },
    path: routeWindow("mainland-pinewatch-highridge", { x: -359.5, z: -321.8 }) },
  { label: "Sunreach terrace join", center: sunreachJoin,
    path: [...route("route.sunreach.cove-terraces").samples.filter(sample =>
      sample.distanceAlongRoute >= route("route.sunreach.cove-terraces").totalLength - WINDOW_METERS).map(({ point }) => point),
    ...route("route.sunreach.terraces-scrub").samples.filter(sample =>
      sample.distanceAlongRoute > 0 && sample.distanceAlongRoute <= WINDOW_METERS).map(({ point }) => point)] }
];

function staticCollision(): StaticCollisionProxy[] {
  return collisionPolishProxies(createInitialGameState(42));
}

/** Retain source positions and filter only indices, so this ray tests the rendered plane independently. */
function localRoadMesh(source: THREE.BufferGeometry, center: WorldPoint, reach = 16): THREE.Mesh {
  const positions = source.getAttribute("position"), indices = source.getIndex()!, selected: number[] = [];
  for (let offset = 0; offset < indices.count; offset += 3) {
    const triangle = [indices.getX(offset), indices.getX(offset + 1), indices.getX(offset + 2)];
    const xs = triangle.map(index => positions.getX(index)), zs = triangle.map(index => positions.getZ(index));
    if (Math.min(...xs) > center.x + reach || Math.max(...xs) < center.x - reach
      || Math.min(...zs) > center.z + reach || Math.max(...zs) < center.z - reach) continue;
    selected.push(...triangle);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", positions);
  geometry.setIndex(selected);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld(true);
  return mesh;
}

/** The same stitched grid and cell diagonal as the terrain mesh and Rapier heightfield. */
function localBaseMesh(center: WorldPoint, reach = 16): THREE.Mesh {
  const patch = WorldLayout.terrainPatchAt(center.x, center.z)!;
  const field = WorldLayout.terrainBaseHeightfieldForPatch(patch.id), step = patch.sizeMeters / patch.resolution;
  const firstX = Math.max(0, Math.floor((center.x - reach - patch.bounds.minX) / step));
  const lastX = Math.min(patch.resolution, Math.ceil((center.x + reach - patch.bounds.minX) / step));
  const firstZ = Math.max(0, Math.floor((center.z - reach - patch.bounds.minZ) / step));
  const lastZ = Math.min(patch.resolution, Math.ceil((center.z + reach - patch.bounds.minZ) / step));
  const width = lastZ - firstZ + 1, positions: number[] = [], indices: number[] = [];
  for (let x = firstX; x <= lastX; x++) for (let z = firstZ; z <= lastZ; z++) {
    positions.push(patch.bounds.minX + x * step, field[x * (patch.resolution + 1) + z], patch.bounds.minZ + z * step);
    if (x < lastX && z < lastZ) {
      const a = (x - firstX) * width + z - firstZ, b = a + 1, d = a + width, c = d + 1;
      indices.push(a, b, d, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe("worked roads physical support", () => {
  let physics: PhysicsWorld;
  let rapier: typeof RAPIER;
  let boxes: StaticCollisionProxy[];
  let render: THREE.BufferGeometry;

  beforeAll(async () => {
    boxes = staticCollision();
    render = WorldLayout.buildPathGeometry();
    physics = await PhysicsWorld.create(boxes);
    rapier = await PhysicsWorld.loadRuntime();
  }, 60_000);
  afterAll(() => { physics?.dispose(); render?.dispose(); });

  function contact(x: number, z: number, world = physics): number {
    const internal = world as unknown as { world: RAPIER.World; playerBody: RAPIER.RigidBody };
    const ray = new rapier.Ray({ x, y: 180, z }, { x: 0, y: -1, z: 0 });
    const hit = internal.world.castRay(ray, 300, true, undefined, undefined, undefined, internal.playerBody);
    expect(hit, `missing physical support at ${x}, ${z}`).not.toBeNull();
    return 180 - hit!.timeOfImpact;
  }

  it("keeps rendered joined planes, Rapier contact, traversal and placement anchors together", () => {
    const raycaster = new THREE.Raycaster();
    const fallback = new TerrainSnappingSystem();
    for (const window of joinedWindows) {
      const mesh = localRoadMesh(render, window.center);
      const base = localBaseMesh(window.center);
      const registered = new TerrainSnappingSystem();
      registered.registerTerrains([base, mesh]);
      try {
        let compared = 0;
        for (const point of window.path.concat(window.center)) {
          raycaster.set(new THREE.Vector3(point.x, 180, point.z), new THREE.Vector3(0, -1, 0));
          const hit = raycaster.intersectObject(mesh, false)[0];
          expect(hit, `${window.label} lacks a rendered road plane`).toBeDefined();
          const support = WorldLayout.traversalSurfaceSample(point.x, point.z);
          const physical = contact(point.x, point.z);
          expect(support.source, window.label).toBe("road");
          expect(Math.abs(hit.point.y - physical), window.label).toBeLessThanOrEqual(AGREEMENT_METERS);
          expect(Math.abs(support.height - physical), window.label).toBeLessThanOrEqual(AGREEMENT_METERS);
          const fallbackSnap = fallback.snapToSurface(point.x, point.z, { yOffset: .15 });
          const meshSnap = registered.snapToSurface(point.x, point.z, { yOffset: .15 });
          expect(fallbackSnap.source).toBe("analytical-grid");
          expect(meshSnap.source).toBe("bvh");
          expect(fallbackSnap.isSlopeAcceptable, `${window.label} placement fallback slope`).toBe(true);
          expect(meshSnap.isSlopeAcceptable, `${window.label} registered placement slope`).toBe(true);
          expect(Math.abs(fallbackSnap.point.y - .15 - physical),
            `${window.label} placement fallback`).toBeLessThanOrEqual(AGREEMENT_METERS);
          expect(Math.abs(meshSnap.point.y - .15 - physical),
            `${window.label} registered placement surface`).toBeLessThanOrEqual(AGREEMENT_METERS);
          compared++;
        }
        expect(compared).toBeGreaterThan(4);
      } finally {
        for (const surface of [base, mesh]) {
          surface.geometry.dispose(); (surface.material as THREE.Material).dispose();
        }
      }
    }
  });

  it("preserves road support where fine and coarse terrain patches meet", () => {
    const heights = [-0.01, -0.001, 0, 0.001, 0.01].map(offset => {
      const x = -300 + offset, z = -5;
      const height = contact(x, z);
      const support = WorldLayout.traversalSurfaceSample(x, z);
      expect(support.source, "the seam probe must exercise the road trimesh").toBe("road");
      expect(Math.abs(height - support.height)).toBeLessThanOrEqual(AGREEMENT_METERS);
      return height;
    });
    expect(WorldLayout.terrainPatchAt(-300.01, -5)?.id).not.toBe(WorldLayout.terrainPatchAt(-299.99, -5)?.id);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.01);
  });

  it("retains exact support at both bridge entries and walks across in both directions", () => {
    const bridge = WORLD_LAYOUT_V5.anchors.bridge, halfSpan = BRIDGE_WORLD_PROFILE.spanLength / 2;
    for (const side of [-1, 1]) for (const offset of [-1.13, -.53, .13, .53, 1.13]) {
      const x = bridge.x + side * (halfSpan + offset), z = bridge.z + .013;
      expect(Math.abs(contact(x, z) - WorldLayout.traversalSurfaceHeight(x, z))).toBeLessThanOrEqual(AGREEMENT_METERS);
    }
    for (const direction of [1, -1]) {
      const sim = new Simulation(createInitialGameState(42));
      const x = bridge.x - direction * (halfSpan + 2);
      Object.assign(sim.state.player, { x, z: bridge.z, y: WorldLayout.traversalSurfaceHeight(x, bridge.z) + .5 });
      const frames = Math.ceil((BRIDGE_WORLD_PROFILE.spanLength + 4.5) / PLAYER_TRAVERSAL_TUNING.walkSpeedMetersPerSecond * 60 * 1.3);
      let bridgeFrames = 0, airborneFrames = 0, maximumAirborne = 0;
      for (let tick = 0; tick < frames; tick++) {
        const result = physics.step(sim.state, { x: direction, z: 0, sprint: false }, "on-foot", 1 / 60, tick / 60);
        const commit = sim.commitPhysicsFrame(result.frame);
        physics.onCommitResult(commit.success);
        expect(commit.success, commit.reason).toBe(true);
        const player = sim.state.player;
        if (WorldLayout.traversalSurfaceSample(player.x, player.z).source === "bridge") bridgeFrames++;
        airborneFrames = result.playerMotion.isGrounded ? 0 : airborneFrames + 1;
        maximumAirborne = Math.max(maximumAirborne, airborneFrames);
      }
      expect(bridgeFrames).toBeGreaterThan(10);
      expect(maximumAirborne).toBeLessThanOrEqual(Math.ceil(PLAYER_TRAVERSAL_TUNING.coyoteTimeSeconds * 60));
      expect((sim.state.player.x - bridge.x) * direction).toBeGreaterThan(halfSpan + .5);
      expect(sim.state.player.traversal.isGrounded).toBe(true);
      expect(Math.abs(sim.state.player.y - .5 - contact(sim.state.player.x, sim.state.player.z)))
        .toBeLessThanOrEqual(AGREEMENT_METERS);
    }
  });

  it.each(joinedWindows)("drives two loaded slots forward and reverses through $label", async window => {
    const sim = new Simulation(createInitialGameState(42));
    const cart = sim.state.mounts[STARTER_CARRIAGE_ID];
    const first = window.path[0], next = window.path[1];
    Object.assign(cart, first, { y: WorldLayout.traversalSurfaceHeight(first.x, first.z),
      rotationY: Math.atan2(next.x - first.x, next.z - first.z) });
    cart.fishCargoSlotIds = ["cargo.support.a", "cargo.support.b"];
    cart.fishCargoSlotIds.forEach((id, slotIndex) => {
      sim.state.fishCargo[id!] = { id: id!, speciesId: "fish.trout", weightKg: 3, quality: "fine",
        caughtAtMinute: sim.state.clock.currentMinute, freshness: 81, cargoClass: "small",
        location: { type: "carriage", containerId: cart.id, slotIndex } };
    });
    Object.assign(sim.state.player, playerPoseFromMount(cart), { activeMountId: cart.id,
      currentRegionId: WorldLayout.regionAt(cart.x, cart.z), traversal: { ...sim.state.player.traversal, isGrounded: true } });
    const preserved = { cargo: structuredClone(sim.state.fishCargo), clock: structuredClone(sim.state.clock),
      work: structuredClone(sim.state.player.workCapacity), rng: sim.rng.getState() };
    expect(validateSaveEnvelope({ schemaVersion: CURRENT_SCHEMA_VERSION, savedAtUtcMs: 1, state: sim.state })).toBe(true);
    const drive = await PhysicsWorld.create(boxes);
    let tick = 0;
    try {
      for (const sign of [1, -1]) {
        const path = sign === 1 ? window.path : [...window.path].reverse();
        let targetIndex = 1, joinedFrames = 0, peakSpeed = 0;
        for (let frame = 0; frame < 1000; frame++, tick++) {
          while (targetIndex < path.length - 1 && Math.hypot(path[targetIndex].x - cart.x, path[targetIndex].z - cart.z) < 3) targetIndex++;
          const target = path[targetIndex], distance = Math.hypot(target.x - cart.x, target.z - cart.z);
          if (targetIndex === path.length - 1 && distance < .9) break;
          const desired = Math.atan2(target.x - cart.x, target.z - cart.z) + (sign < 0 ? Math.PI : 0);
          const error = Math.atan2(Math.sin(desired - cart.rotationY), Math.cos(desired - cart.rotationY));
          const steer = THREE.MathUtils.clamp(Math.atan2(2 * CARRIAGE_TUNING.wheelbase * Math.sin(error) * sign,
            Math.max(2.5, distance)), -CARRIAGE_TUNING.maximumSteerAngle, CARRIAGE_TUNING.maximumSteerAngle);
          const result = drive.step(sim.state, { x: -steer / CARRIAGE_TUNING.maximumSteerAngle, z: -sign, sprint: false },
            "mounted", .05, tick * .05);
          const commit = sim.commitPhysicsFrame(result.frame);
          drive.onCommitResult(commit.success);
          expect(commit.success, `${window.label} ${sign} tick ${tick}: ${commit.reason}`).toBe(true);
          expect(result.playerMotion.isCollisionBlocked, `${window.label} ${sign} tick ${tick}`).toBe(false);
          expect(sim.state.player).toMatchObject(playerPoseFromMount(cart));
          if (WorldLayout.roadFootprintSample(cart.x, cart.z).junctionTraffic > .1) joinedFrames++;
          peakSpeed = Math.max(peakSpeed, result.playerMotion.speedMetersPerSecond);
          const steering = (drive as unknown as { carriageSteering: number }).carriageSteering;
          if (frame % 20 === 0) for (const point of carriageFootprint(cart, steering)) {
            expect(Math.abs(contact(point.x, point.z, drive) - WorldLayout.traversalSurfaceHeight(point.x, point.z)))
              .toBeLessThanOrEqual(AGREEMENT_METERS);
          }
        }
        const end = path.at(-1)!;
        expect(Math.hypot(cart.x - end.x, cart.z - end.z), `${window.label} direction ${sign} never crossed`).toBeLessThan(.95);
        expect(joinedFrames).toBeGreaterThan(5);
        expect(peakSpeed).toBeGreaterThan(1);
        for (let frame = 0; frame < 20; frame++, tick++) {
          const result = drive.step(sim.state, { x: 0, z: 0, sprint: false }, "mounted", .05, tick * .05);
          const commit = sim.commitPhysicsFrame(result.frame);
          drive.onCommitResult(commit.success);
          expect(commit.success, commit.reason).toBe(true);
        }
      }
    } finally { drive.dispose(); }
    expect(sim.state.fishCargo).toEqual(preserved.cargo);
    expect(sim.state.clock).toEqual(preserved.clock);
    expect(sim.state.player.workCapacity).toEqual(preserved.work);
    expect(sim.rng.getState()).toEqual(preserved.rng);
    expect(validateSaveEnvelope({ schemaVersion: CURRENT_SCHEMA_VERSION, savedAtUtcMs: 1, state: sim.state })).toBe(true);
  }, 90_000);
});
