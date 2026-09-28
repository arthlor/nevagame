import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { createFarmStructureTag, type LayoutEditTag } from "../../src/layout-editor/layoutEdit";
import { AssetLoader } from "../../src/render/loaders/AssetLoader";
import { EditableStaticSources } from "../../src/render/scene/EditableStaticSources";
import { WorldScene } from "../../src/render/scene/WorldScene";
import { Simulation } from "../../src/simulation/Simulation";
import type { WorkshopStatusDto } from "../../src/simulation/core/contracts";
import type { GameState } from "../../src/simulation/core/types";
import { getProcessingStationFrontPosition } from "../../src/world/ProcessingStationApproach";
import { WorldLayout } from "../../src/world/WorldLayout";

interface OutputView {
  group: THREE.Group;
  model: THREE.Group;
  marker: THREE.Mesh;
  jobId: string;
}

interface WorkshopHarness {
  scene: THREE.Scene;
  workshopOutputs: Map<string, OutputView>;
  workshopOutputSurfaces: Map<string, THREE.Object3D>;
  tagLayoutEdit: (object: THREE.Object3D, tag: LayoutEditTag) => void;
  updateStationActivity: (state: Readonly<GameState>, seconds: number, focus: THREE.Vector3,
    status: (id: string) => WorkshopStatusDto) => void;
}

function outputModel(): THREE.Group {
  const root = new THREE.Group();
  // The production parcel is authored for a hand grip rather than a ground pivot.
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.2), new THREE.MeshStandardMaterial());
  mesh.position.set(0.1, 0.4, 0.06);
  root.add(mesh);
  return root;
}

function harness(sim: Simulation, loadModel: () => Promise<THREE.Group>): WorkshopHarness {
  return Object.assign(Object.create(WorldScene.prototype), {
    scene: new THREE.Scene(), stationPlacements: sim.state.world.structures, layoutEditRoots: [],
    workshopOutputs: new Map(), workshopOutputSurfaces: new Map(), workshopOutputRequests: new Map(),
    desiredWorkshopOutputs: new Map(), announcedCompleteJobs: new Set(), stationActivityEmitSeconds: new Map(),
    tempWorkshopSurfacePosition: new THREE.Vector3(), tempWorkshopSurfaceQuaternion: new THREE.Quaternion(),
    tempWorkshopSurfaceRotation: new THREE.Euler(), farmVfx: { spawn: vi.fn() }, loadModel,
    workshopReadyMarkerGeometry: new THREE.DodecahedronGeometry(0.075),
    workshopBlockedMarkerGeometry: new THREE.ConeGeometry(0.075, 0.15, 4),
    workshopReadyMarkerMaterial: new THREE.MeshStandardMaterial(),
    workshopBlockedMarkerMaterial: new THREE.MeshStandardMaterial()
  }) as WorkshopHarness;
}

function readyCompost(): Simulation {
  const sim = new Simulation();
  const station = sim.state.world.structures["struct.starter_compost"];
  const front = getProcessingStationFrontPosition(station.id, station)!;
  Object.assign(sim.state.player, front, { y: WorldLayout.traversalSurfaceHeight(front.x, front.z) + 0.5 });
  expect(sim.execute({ type: "processing.start", stationId: station.id, recipeId: "recipe.compost_worms" }).success).toBe(true);
  sim.advanceGameMinutes(Object.values(sim.state.processingJobs)[0].effectiveDurationMinutes);
  return new Simulation(structuredClone(sim.getState()));
}

afterEach(() => vi.restoreAllMocks());

describe("persistent workshop outputs", () => {
  it("reconstructs a saved output on its socket after static sources detach and follows collection capacity", async () => {
    const sim = readyCompost();
    const loaded = Promise.resolve(outputModel());
    const world = harness(sim, () => loaded);
    const bin = new THREE.Group();
    bin.userData.assetId = "prop_worm_compost_a";
    const socket = new THREE.Object3D();
    socket.name = "prop_worm_compost_a_output_surface";
    socket.position.y = 0.78;
    bin.add(socket);
    world.scene.add(bin);
    world.tagLayoutEdit(bin, createFarmStructureTag("struct.starter_compost"));
    bin.rotation.y = Math.PI;
    new EditableStaticSources().detachDormantRoots([bin]);
    expect(world.scene.getObjectByName(socket.name)).toBeUndefined();
    const focus = new THREE.Vector3(sim.state.player.x, sim.state.player.y, sim.state.player.z);
    const update = () => world.updateStationActivity(sim.state, 0, focus, id => sim.inspectWorkshopStatus(id));
    update();
    await loaded;
    const output = world.workshopOutputs.get("struct.starter_compost")!;
    expect(output.group.parent).toBe(world.scene);
    expect(output.group.position.y).toBeCloseTo(bin.position.y + socket.position.y);
    expect(output.group.quaternion.angleTo(socket.getWorldQuaternion(new THREE.Quaternion()))).toBeCloseTo(0);
    output.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(output.model);
    expect(bounds.min.y).toBeCloseTo(output.group.position.y);
    expect(bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(output.group.position.x);
    expect(output.marker.geometry.type).toBe("DodecahedronGeometry");

    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    const slots = structuredClone(inventory.slots);
    inventory.slots = inventory.slots.map(() => ({ itemId: "seed.wheat", quantity: ContentRegistry.items.get("seed.wheat")!.stackLimit }));
    update();
    expect(output.marker.geometry.type).toBe("ConeGeometry");
    inventory.slots = slots;
    update();
    expect(output.marker.geometry.type).toBe("DodecahedronGeometry");
    const jobId = Object.keys(sim.state.processingJobs)[0];
    expect(sim.execute({ type: "processing.collect", jobId }).success).toBe(true);
    update();
    expect(world.workshopOutputs.size).toBe(0);
    expect(output.group.parent).toBeNull();
  });

  it("releases an output loaded after its saved job was collected", async () => {
    const sim = readyCompost();
    let resolve!: (model: THREE.Group) => void;
    const pending = new Promise<THREE.Group>(done => { resolve = done; });
    const world = harness(sim, () => pending);
    const release = vi.spyOn(AssetLoader, "releaseModel");
    const focus = new THREE.Vector3(sim.state.player.x, sim.state.player.y, sim.state.player.z);
    const update = () => world.updateStationActivity(sim.state, 0, focus, id => sim.inspectWorkshopStatus(id));
    update();
    const jobId = Object.keys(sim.state.processingJobs)[0];
    expect(sim.execute({ type: "processing.collect", jobId }).success).toBe(true);
    update();
    const model = outputModel();
    resolve(model);
    await pending;
    expect(world.workshopOutputs.size).toBe(0);
    expect(release).toHaveBeenCalledWith(model);
    expect(model.parent).toBeNull();
  });
});
