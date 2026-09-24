import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer";
import { describe, expect, it } from "vitest";

import { ASSET_BY_ID, ASSET_IDS, type AssetId } from "../../src/render/assets/AssetCatalog";
import {
  AMBIENT_ANIMAL_ROUTES,
  AMBIENT_TOWNSFOLK_ROUTES,
  sampleAmbientTownsfolkPose
} from "../../src/render/scene/ambientTownsfolk";
import { PIGEON_ORBITS, GULL_ORBITS, sampleAmbientFlyerPose } from "../../src/render/scene/ambientFlyers";
import { createWorldStaticPlacements, isPlacementFootprintStable } from "../../src/world/WorldEnvironmentLayout";
import { VILLAGE_CROSSING, VILLAGE_MARKET } from "../../src/world/WorldAnchors";
import { WorldLayout, WORLD_ARCHITECTURE_PADS } from "../../src/world/WorldLayout";

const PHASES = ["dawn", "day", "dusk", "night"] as const;
const VILLAGE_LIFE_ASSETS: readonly AssetId[] = [
  ASSET_IDS.FAUNA_DOG_A,
  ASSET_IDS.FAUNA_CAT_A,
  ASSET_IDS.FAUNA_PIGEON_A,
  ASSET_IDS.FAUNA_SHEEP_A,
  ASSET_IDS.FAUNA_DUCK_A,
  ASSET_IDS.BUILDING_DOVECOTE_A,
  ASSET_IDS.PROP_LAUNDRY_LINE_A,
  ASSET_IDS.PROP_BANNER_CLOTH_A
];

const ROOT = path.resolve(import.meta.dirname, "../..");
/** Built by the authored (Three.js) generators in tools/authored/generators. */
const AUTHORED_VILLAGE_LIFE: readonly AssetId[] = VILLAGE_LIFE_ASSETS.filter(
  (id) => id !== ASSET_IDS.BUILDING_DOVECOTE_A
);

async function loadPublished(id: AssetId): Promise<GLTF> {
  // Published through the art pipeline, so meshopt-compressed like every other catalog GLB.
  await MeshoptDecoder.ready;
  const bytes = fs.readFileSync(path.join(ROOT, "public/assets/models", `${id}.glb`));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((resolve, reject) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(buffer, "", resolve, reject));
}

/** Rest-pose bounds, with skinned vertices placed by their skeleton rather than the bind shape. */
function restBounds(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const vertex = new THREE.Vector3();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const skinned = object as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh) skinned.skeleton.update();
    const position = mesh.geometry.getAttribute("position");
    for (let index = 0; index < position.count; index += 1) {
      if (skinned.isSkinnedMesh) skinned.getVertexPosition(index, vertex);
      else vertex.fromBufferAttribute(position, index);
      box.expandByPoint(vertex.applyMatrix4(mesh.matrixWorld));
    }
  });
  return box;
}

describe("authored village-life GLBs", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/specs/asset-catalog.json"), "utf8")) as {
    assets: Array<{ id: string; generator: string; palette: string[]; budget: { materialsMax: number; trianglesMax: number } }>;
  };
  const source = new Map(catalog.assets.map((asset) => [asset.id, asset]));
  const authoredContracts = JSON.parse(
    fs.readFileSync(path.join(ROOT, "tools/authored/generators/contracts.json"), "utf8")
  ) as Record<string, unknown>;

  it("publishes the nodes, clips and palette materials the runtime resolves", async () => {
    for (const id of AUTHORED_VILLAGE_LIFE) {
      const spec = ASSET_BY_ID.get(id)!;
      const authoring = source.get(id)!;
      expect(authoredContracts, id).toHaveProperty(authoring.generator);
      const gltf = await loadPublished(id);
      const names = new Set<string>();
      const materials = new Set<string>();
      let triangles = 0;
      gltf.scene.traverse((object) => {
        names.add(object.name);
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        triangles += (mesh.geometry.getIndex()?.count ?? 0) / 3;
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          materials.add(material.name);
        }
      });
      for (const node of spec.requiredNodes) expect(names.has(node), `${id} is missing ${node}`).toBe(true);
      for (const clip of spec.animationClips ?? []) {
        const loaded = gltf.animations.find((candidate) => candidate.name === clip.name);
        expect(loaded, `${id} clip ${clip.name}`).toBeDefined();
        expect(loaded!.duration, `${id} clip ${clip.name}`).toBeCloseTo(clip.durationSeconds, 2);
      }
      // Every material is a real palette token the catalog declares for this asset.
      for (const material of materials) expect(authoring.palette, `${id} material ${material}`).toContain(material);
      expect(materials.size, id).toBeLessThanOrEqual(authoring.budget.materialsMax);
      expect(triangles, id).toBeLessThanOrEqual(authoring.budget.trianglesMax);
    }
  });

  it("keeps the dove's glide and flap clips on disjoint transforms", async () => {
    // `loadAmbientFlyers` plays both at once and blends their weights; a shared
    // transform would average the two into a permanent half-flap.
    const gltf = await loadPublished(ASSET_IDS.FAUNA_PIGEON_A);
    const targets = (name: string): Set<string> => new Set(
      gltf.animations.find((clip) => clip.name === name)!.tracks.map((track) => track.name.split(".")[0])
    );
    const glide = targets("glide");
    for (const node of targets("flap")) expect(glide.has(node), node).toBe(false);
  });

  it("stands the animals on the ground and floats the duck on its waterline", async () => {
    for (const id of [ASSET_IDS.FAUNA_DOG_A, ASSET_IDS.FAUNA_CAT_A, ASSET_IDS.FAUNA_SHEEP_A]) {
      const bounds = restBounds((await loadPublished(id)).scene);
      expect(bounds.min.y, id).toBeGreaterThanOrEqual(-0.005);
      expect(bounds.min.y, id).toBeLessThan(0.01);
    }
    // Placements sit the duck 6 cm into the water, so its keel has to reach just below that.
    const duck = restBounds((await loadPublished(ASSET_IDS.FAUNA_DUCK_A)).scene);
    expect(duck.min.y).toBeGreaterThan(0.03);
    expect(duck.min.y).toBeLessThan(0.06);
  });
});

describe("village life assets", () => {
  it("publishes every new asset with the runtime contract its owner resolves by name", () => {
    for (const id of VILLAGE_LIFE_ASSETS) {
      const spec = ASSET_BY_ID.get(id);
      expect(spec, id).toBeDefined();
      expect(spec!.requiredNodes, id).toContain(`${id}_root`);
    }

    // The ambient-animal mixer looks up clips by the names the route declares.
    for (const route of AMBIENT_ANIMAL_ROUTES) {
      const spec = ASSET_BY_ID.get(route.assetId as AssetId);
      expect(spec, route.id).toBeDefined();
      const clips = (spec!.animationClips ?? []).map((clip) => clip.name);
      for (const name of [route.idleClip, route.walkClip, route.restClip]) {
        expect(clips, `${route.id} clip ${name}`).toContain(name);
      }
      expect(spec!.collision, route.id).toBe("none");
    }

    // `loadAmbientFlyers` plays `glide` and `flap` at once, so a flyer that is
    // missing either clip silently stops animating.
    const dove = ASSET_BY_ID.get(ASSET_IDS.FAUNA_PIGEON_A)!;
    const doveClips = (dove.animationClips ?? []).map((clip) => clip.name);
    expect(doveClips).toEqual(expect.arrayContaining(["glide", "flap"]));
    expect(dove.requiredNodes).toEqual(expect.arrayContaining([
      "fauna_pigeon_a_motion_root",
      "fauna_pigeon_a_wing_left_pivot",
      "fauna_pigeon_a_wing_right_pivot"
    ]));

    // `configureClothSway` finds its pivots by the `_sway_<n>` suffix, so the
    // cloth props have to publish at least one.
    for (const id of [ASSET_IDS.PROP_LAUNDRY_LINE_A, ASSET_IDS.PROP_BANNER_CLOTH_A]) {
      const spec = ASSET_BY_ID.get(id)!;
      expect(spec.requiredNodes.filter((node) => /_sway_\d+$/.test(node)).length, id).toBeGreaterThan(0);
    }
  });

  it("keeps the dove flock inland, below the gulls and clear of the ground", () => {
    expect(PIGEON_ORBITS.length).toBeGreaterThan(0);
    const highestDove = Math.max(...PIGEON_ORBITS.map((orbit) => orbit.originY + orbit.altitude));
    const lowestGull = Math.min(...GULL_ORBITS.map((orbit) => orbit.originY + orbit.altitude));
    expect(highestDove).toBeLessThan(lowestGull);
    for (const orbit of PIGEON_ORBITS) {
      // Inland: a dove orbiting the harbour would just read as a small gull.
      expect(orbit.originZ).toBeLessThan(40);
      for (const timeSeconds of [0, 3.7, 26, 140.5]) {
        const pose = sampleAmbientFlyerPose(orbit, timeSeconds, 1);
        expect(Number.isFinite(pose.x) && Number.isFinite(pose.y) && Number.isFinite(pose.z)).toBe(true);
        expect(pose.y).toBeGreaterThan(WorldLayout.terrainHeight(pose.x, pose.z) + 0.2);
      }
    }
  });
});

describe("ambient village animals", () => {
  it("keeps every station and drift pose on walkable ground clear of the square's working space", () => {
    expect(AMBIENT_ANIMAL_ROUTES.length).toBeGreaterThan(0);
    for (const route of AMBIENT_ANIMAL_ROUTES) {
      // The authored radius must actually bound the ring, because every
      // keep-out below is solved against it rather than against each waypoint.
      const reach = Math.max(...route.waypoints.map((point) => Math.hypot(point.dx, point.dz)));
      expect(reach, route.id).toBeLessThanOrEqual(route.radiusMeters + 1e-6);

      for (const phase of PHASES) {
        const station = route.stations[phase];
        for (const waypoint of [...route.waypoints, { dx: 0, dz: 0 }]) {
          const x = station.x + waypoint.dx;
          const z = station.z + waypoint.dz;
          expect(WorldLayout.isWalkable(x, z), `${route.id}/${phase}`).toBe(true);
          expect(WorldLayout.isWater(x, z), `${route.id}/${phase}`).toBe(false);
          expect(WorldLayout.terrainNormalY(x, z), `${route.id}/${phase}`).toBeGreaterThan(0.79);
          // An animal standing on the stall counter is the failure this pins.
          expect(
            Math.hypot(x - VILLAGE_MARKET.position.x, z - VILLAGE_MARKET.position.z),
            `${route.id}/${phase} market ring`
          ).toBeGreaterThan(VILLAGE_MARKET.radiusMeters);
          for (const pad of WORLD_ARCHITECTURE_PADS) {
            expect(
              Math.hypot(x - pad.center.x, z - pad.center.z),
              `${route.id}/${phase} inside ${pad.id}`
            ).toBeGreaterThan(Math.max(pad.envelope[0], pad.envelope[1]) + 0.6);
          }
          for (const person of AMBIENT_TOWNSFOLK_ROUTES) {
            const other = person.stations[phase];
            expect(
              Math.hypot(x - other.x, z - other.z),
              `${route.id}/${phase} overlaps ${person.id}`
            ).toBeGreaterThan(person.radiusMeters + 0.9);
          }
        }
      }
    }
  });

  it("solves the drift with the townsfolk sampler and holds still under reduced motion", () => {
    for (const route of AMBIENT_ANIMAL_ROUTES) {
      const clock = { timeOfDay: "day" } as const;
      const still = sampleAmbientTownsfolkPose(route, clock, 12, 0);
      expect(still.walking).toBe(false);
      expect(still.x).toBeCloseTo(route.stations.day.x, 6);
      expect(still.z).toBeCloseTo(route.stations.day.z, 6);

      let walked = false;
      for (let seconds = 0; seconds < route.loopSeconds; seconds += 0.5) {
        const pose = sampleAmbientTownsfolkPose(route, clock, seconds, 1);
        walked ||= pose.walking;
        expect(Math.hypot(pose.x - route.stations.day.x, pose.z - route.stations.day.z))
          .toBeLessThanOrEqual(route.radiusMeters + 1e-6);
      }
      // A route that never walks would never leave its idle clip.
      expect(walked, route.id).toBe(true);
    }
  });
});

describe("village life placements", () => {
  const placements = createWorldStaticPlacements(42);
  const byId = new Map(placements.map((placement) => [placement.id, placement]));

  it("floats the river ducks on water without a land footprint", () => {
    const ducks = placements.filter((placement) => placement.assetId === ASSET_IDS.FAUNA_DUCK_A);
    expect(ducks.length).toBeGreaterThanOrEqual(4);
    for (const duck of ducks) {
      expect(WorldLayout.isWater(duck.x, duck.z), duck.id).toBe(true);
      expect(WorldLayout.waterColumnDepth(duck.x, duck.z), duck.id).toBeGreaterThan(0.35);
      // The stability guard is a land contract; a duck carrying a grounding
      // footprint would fail it and take the whole layout down at load.
      expect(duck.grounding, duck.id).toBeUndefined();
      expect(duck.y, duck.id).toBeDefined();
      expect(duck.y!).toBeLessThan(WorldLayout.waterSurfaceElevation(duck.x, duck.z) + 0.1);
    }
  });

  it("grazes the flock inside the paddock on stable ground", () => {
    const sheep = placements.filter((placement) => placement.assetId === ASSET_IDS.FAUNA_SHEEP_A);
    expect(sheep.length).toBeGreaterThanOrEqual(3);
    for (const ewe of sheep) {
      expect(isPlacementFootprintStable(ewe, 0.72, 0.78), ewe.id).toBe(true);
      expect(ewe.x, ewe.id).toBeGreaterThan(47);
      expect(ewe.x, ewe.id).toBeLessThan(59);
      expect(ewe.z, ewe.id).toBeLessThan(-86);
      expect(ewe.z, ewe.id).toBeGreaterThan(-97);
    }
    for (const [index, ewe] of sheep.entries()) {
      for (const other of sheep.slice(index + 1)) {
        expect(Math.hypot(ewe.x - other.x, ewe.z - other.z), `${ewe.id}/${other.id}`).toBeGreaterThan(1.5);
      }
    }
  });

  it("stands the cloth props and the dovecote clear of the roads and the crossing", () => {
    const cloth = placements.filter((placement) =>
      placement.assetId === ASSET_IDS.PROP_LAUNDRY_LINE_A
      || placement.assetId === ASSET_IDS.PROP_BANNER_CLOTH_A);
    expect(cloth.length).toBeGreaterThanOrEqual(3);
    const dovecote = byId.get("authored.village.dovecote");
    expect(dovecote?.assetId).toBe(ASSET_IDS.BUILDING_DOVECOTE_A);

    for (const placement of [...cloth, dovecote!]) {
      expect(WorldLayout.isWalkable(placement.x, placement.z), placement.id).toBe(true);
      expect(WorldLayout.pathInfluence(placement.x, placement.z), placement.id).toBeLessThan(0.05);
      expect(
        Math.hypot(placement.x - VILLAGE_CROSSING.x, placement.z - VILLAGE_CROSSING.z),
        `${placement.id} crossing`
      ).toBeGreaterThan(6.6);
    }
    // The cote has to sit under the dove orbits, or the flock has no reason to
    // be where it is.
    const nearestOrbit = Math.min(...PIGEON_ORBITS.map((orbit) =>
      Math.hypot(orbit.originX - dovecote!.x, orbit.originZ - dovecote!.z)));
    expect(nearestOrbit).toBeLessThan(25);
  });
});
