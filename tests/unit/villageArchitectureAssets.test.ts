import * as THREE from "three";
import { describe, expect, it } from "vitest";
import catalog from "../../assets/specs/asset-catalog.json";
import { buildAuthoredModel } from "../../tools/authored/pipeline/build";
import {
  STONE_BRIDGE_CHANNEL_ARCH,
  STONE_BRIDGE_PIERS,
  STONE_BRIDGE_SPRING,
  STONE_BRIDGE_WEST_ARCH
} from "../../tools/authored/generators/buildings/createStoneBridgeModel";
import type { CatalogAssetSpec } from "../../tools/authored/kit";

// Committed GLB architecture goes through the producer coverage in authoredGlb.test.ts.
const ids = ["house_farmhouse_a", "building_lighthouse_a", "building_windmill_a", "bridge_stone_a", "prop_tool_shed_a",
  "building_coastal_store_a", "building_coastal_shelter_a", "building_ice_house_a"];
const models = ids.map(id => {
  const spec = catalog.assets.find(a => a.id === id)! as CatalogAssetSpec;
  const { root } = buildAuthoredModel(spec);
  return { spec, root, levels: spec.lodLevels!.map(l => root.getObjectByName(l.node)!) };
});
const get = (id: string) => models.find(model => model.spec.id === id)!;
const ray = (origin: THREE.Vector3, direction: THREE.Vector3, distance: number, node: THREE.Object3D) =>
  new THREE.Raycaster(origin, direction, 0, distance).intersectObject(node, true);

describe("authored village architecture replacement contracts", () => {
  it("closes the farmhouse end gables up to the authored roof pitch", () => {
    const { spec, levels } = get("house_farmhouse_a");
    const eave = 0.84 + Number(spec.parameters.wallHeight), halfWidth = Number(spec.parameters.width) / 2;
    for (const level of levels) for (const side of [-1, 1]) for (const z of [-0.65, 0.65]) {
      const hit = ray(new THREE.Vector3(side * (halfWidth + 0.45), eave + 2.12, z), new THREE.Vector3(-side, 0, 0), 0.65, level);
      expect(hit.length, `${level.name}: closed upper gable`).toBeGreaterThan(0);
    }
  });

  it("keeps the coastal entrances open above the same grounded floor in every LOD", () => {
    for (const id of ["building_coastal_store_a", "building_coastal_shelter_a"]) {
      const { levels, spec } = get(id), front = Number(spec.parameters.depth) / 2;
      for (const level of levels) {
        for (const x of [-0.42, 0, 0.42]) for (const y of [0.28, 0.75, 1.45, 2.0]) {
          expect(ray(new THREE.Vector3(x, y, front + 1), new THREE.Vector3(0, 0, -1), 2.0, level), `${id} ${level.name}: entry ${x},${y}`).toHaveLength(0);
        }
        for (const x of [-0.38, 0.14, 0.38]) {
          const hit = ray(new THREE.Vector3(x, 0.6, 0), new THREE.Vector3(0, -1, 0), 0.5, level)[0];
          expect(hit?.point.y, `${level.name}: floor`).toBeCloseTo(0.24, 2);
        }
        for (const z of [-0.32, 0.32]) {
          const start = Number(spec.parameters.width) / 2 + 0.75;
          expect(ray(new THREE.Vector3(start, 1.68, z), new THREE.Vector3(-1, 0, 0), 1.3, level), `${level.name}: side window`).toHaveLength(0);
        }
      }
    }
  });

  it("places the bridge road on all eleven existing collider tops and keeps both vaults open", () => {
    const { spec, levels } = get("bridge_stone_a");
    const decks = spec.collisionPrimitives!.filter(p => p.id.startsWith("deck") || p.id === "main");
    expect(decks).toHaveLength(11);
    for (const level of levels) {
      for (const deck of decks) for (const dx of [-0.29, 0, 0.29]) for (const z of [-1.31, 0.13, 1.31]) {
        const top = deck.center[1] + deck.halfExtents[1];
        const hit = ray(new THREE.Vector3(deck.center[0] + dx, top + 0.5, z), new THREE.Vector3(0, -1, 0), 0.75, level)[0];
        expect(hit, `${level.name}: ${deck.id} roadway`).toBeDefined();
        expect(Math.abs(hit.point.y - top)).toBeLessThan(0.032);
      }
      for (const arch of [STONE_BRIDGE_WEST_ARCH, STONE_BRIDGE_CHANNEL_ARCH]) {
        for (const dx of [-0.6, 0, 0.6]) for (const y of [0.5, 1.5]) {
          expect(ray(new THREE.Vector3(arch.center + dx, y, 4), new THREE.Vector3(0, 0, -1), 8, level), `${level.name}: open vault`).toHaveLength(0);
        }
        for (const offset of [-1.2, -0.7, 0.7, 1.2]) {
          const outerRx = arch.rx + 0.22;
          const outerRise = STONE_BRIDGE_SPRING + (arch.ry + 0.18) * Math.sqrt(1 - (offset / outerRx) ** 2);
          expect(ray(new THREE.Vector3(arch.center + offset, outerRise + 0.06, 2.8), new THREE.Vector3(0, 0, -1), 1, level).length,
            `${level.name}: continuous spandrel`).toBeGreaterThan(0);
        }
      }
      expect(spec.collisionPrimitives!.filter(primitive => primitive.id.startsWith("pier_")).map(primitive => primitive.center[0]))
        .toEqual(STONE_BRIDGE_PIERS.map(pier => pier.x));
      for (const side of [-1, 1]) expect(ray(new THREE.Vector3(side * 8, 1.8, 0), new THREE.Vector3(-side, 0, 0), 2, level).length,
        `${level.name}: closed abutment`).toBeGreaterThan(0);
    }
  });

  it("retains every windmill rotor pivot and keeps the rotating sails clear of the body", () => {
    const { root, spec, levels } = get("building_windmill_a");
    levels.forEach((level, index) => {
      const rotor = root.getObjectByName(index ? `${spec.id}_LOD${index}_rotor` : "windmill_rotor")!;
      expect(rotor).toBeDefined();
      expect(level.getObjectById(rotor.id)).toBe(rotor);
      const mesh = rotor.children.find(node => node instanceof THREE.Mesh) as THREE.Mesh;
      const body = level.getObjectByName(`${spec.id}_LOD${index}_mill`)!;
      const positions = mesh.geometry.getAttribute("position");
      for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI * 0.75]) {
        rotor.rotation.z = angle; root.updateMatrixWorld(true);
        for (let i = 0; i < positions.count; i += 47) {
          const local = new THREE.Vector3().fromBufferAttribute(positions, i);
          if (Math.hypot(local.x, local.y) < 0.75) continue;
          const world = mesh.localToWorld(local);
          expect(ray(world, new THREE.Vector3(0, 0, -1), 0.12, body), `${level.name}: sail clearance`).toHaveLength(0);
        }
      }
      rotor.rotation.z = 0;
    });
    root.updateMatrixWorld(true);
  });

  it("keeps the generated farmhouse flue under its smoke socket at every distance", () => {
    for (const [id, x, y, z] of [["house_farmhouse_a", 3.35, 8.9, -0.35]] as const) {
      for (const level of get(id).levels) {
        const hit = ray(new THREE.Vector3(x, y + 0.3, z), new THREE.Vector3(0, -1, 0), 0.5, level)[0];
        expect(hit, `${level.name}: flue`).toBeDefined();
        expect(Math.abs(hit.point.y - y)).toBeLessThan(0.10);
      }
    }
  });

  it("packages the generated architecture as bounded palette surfaces with useful LOD reductions", () => {
    for (const { spec, root, levels } of models) {
      expect(spec.generator).not.toBe("imported_blend");
      for (const name of spec.requiredNodes) expect(root.getObjectByName(name), name).toBeDefined();
      const triangles = levels.map(level => {
        let faces = 0, draws = 0, meshes = 0;
        level.traverse(node => {
          expect((node as THREE.Light).isLight).toBeFalsy();
          if (!(node instanceof THREE.Mesh)) return;
          faces += node.geometry.index!.count / 3; draws += node.geometry.groups.length; meshes++;
          for (const material of node.material as THREE.MeshStandardMaterial[]) {
            expect(material.map).toBeNull(); expect(material.side).toBe(THREE.FrontSide);
          }
        });
        expect(meshes, spec.id).toBeLessThanOrEqual(2);
        expect(draws, spec.id).toBeLessThanOrEqual(9);
        return faces;
      });
      expect(triangles[0], spec.id).toBeLessThanOrEqual(spec.budget.trianglesMax);
      expect(triangles[1], spec.id).toBeLessThan(triangles[0] * 0.55);
      expect(triangles[2], spec.id).toBeLessThan(triangles[0] * 0.32);
    }
  });
});
