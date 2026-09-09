import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import {
  CharacterEquipmentAssembler,
  type CharacterVisualLoadout
} from "../../src/render/animation/CharacterEquipmentAssembler";
import { PALM_GRIP_FRAME } from "../../src/render/animation/CharacterEquipment";
import type { AssetId } from "../../src/render/assets/AssetCatalog";

interface CharacterFixture {
  root: THREE.Group;
  headMesh: THREE.Mesh;
  originalHeadMaterials: THREE.Material[];
}

function addLayer(
  root: THREE.Group,
  name: string,
  materialNames: readonly string[]
): THREE.Mesh {
  const node = new THREE.Group();
  node.name = name;
  const materials = materialNames.map((materialName) => {
    const material = new THREE.MeshBasicMaterial();
    material.name = materialName;
    return material;
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), materials);
  node.add(mesh);
  root.add(node);
  return mesh;
}

function makeCharacter(): CharacterFixture {
  const root = new THREE.Group();
  root.userData.humanoidRig = {
    bones: {
      head: "Head",
      chest: "Chest",
      foot_left: "FootLeft",
      foot_right: "FootRight"
    },
    legs: {},
    arms: {}
  };
  for (const name of ["Head", "Chest", "FootLeft", "FootRight", "char_player_tool_socket"]) {
    const node = new THREE.Object3D();
    node.name = name;
    root.add(node);
  }
  const headMesh = addLayer(root, "char_player_a_Farmer_Head_LOD0", [
    "skin_warm_01", "canvas_cream_01", "cloth_teal_01"
  ]);
  addLayer(root, "char_player_a_Farmer_Head_LOD1", [
    "skin_warm_01", "canvas_cream_01", "cloth_teal_01"
  ]);
  addLayer(root, "char_player_a_Farmer_Body_LOD0", ["skin_warm_01", "cloth_slate_01"]);
  addLayer(root, "char_player_a_Farmer_Body_LOD1", ["skin_warm_01", "cloth_slate_01"]);
  addLayer(root, "char_player_a_Farmer_Feet_LOD0", ["leather_harness_01"]);
  addLayer(root, "char_player_a_Farmer_Feet_LOD1", ["leather_harness_01"]);
  return {
    root,
    headMesh,
    originalHeadMaterials: [...headMesh.material as THREE.Material[]]
  };
}

function makeEquipmentAsset(assetId: string): THREE.Group {
  const root = new THREE.Group();
  if (assetId === "wearable_field_hat_a") {
    const wearable = new THREE.Object3D();
    wearable.name = "wearable_head_anchor";
    root.add(wearable);
    return root;
  }
  const grip = new THREE.Object3D();
  grip.name = assetId.includes("fishing_rod") ? "rod_primary_grip" : "tool_primary_grip";
  grip.userData.neva_grip_frame = PALM_GRIP_FRAME;
  root.add(grip);
  return root;
}

function materialNamed(mesh: THREE.Mesh, name: string): THREE.Material {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const material = materials.find((candidate) => candidate.name === name);
  if (!material) throw new Error(`Missing test material ${name}`);
  return material;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("CharacterEquipmentAssembler", () => {
  it("retries transient loads, replaces starter regions, restores them, and applies authored scale", async () => {
    vi.useFakeTimers();
    ContentRegistry.initializeAndValidate();
    const fixture = makeCharacter();
    const attempts = new Map<string, number>();
    const settledFailures: string[][] = [];
    const loadModel = async (assetId: AssetId): Promise<THREE.Group> => {
      const count = (attempts.get(assetId) ?? 0) + 1;
      attempts.set(assetId, count);
      if (assetId === "wearable_field_hat_a" && count === 1) {
        throw new Error("transient preview fetch");
      }
      return makeEquipmentAsset(assetId);
    };
    const assembler = new CharacterEquipmentAssembler(fixture.root, {
      loadModel,
      retryBaseDelayMs: 10,
      retryMaxDelayMs: 20,
      maxLoadAttempts: 3,
      onSyncSettled: (failed) => settledFailures.push([...failed])
    });
    const loadout: CharacterVisualLoadout = {
      head: { assetId: "wearable_field_hat_a" },
      outerwear: null,
      feet: null,
      wateringTool: { assetId: "tool_watering_can_copper_rose_a", scale: 0.72 },
      harvestTool: { assetId: "tool_sickle_balanced_a", scale: 0.82 },
      rod: { assetId: "tool_fishing_rod_a" }
    };

    try {
      await assembler.sync(loadout);
      expect(settledFailures.at(-1)).toEqual(["wearable_field_hat_a"]);
      expect(materialNamed(fixture.headMesh, "canvas_cream_01").visible).toBe(true);
      expect(fixture.root.getObjectByName("cosmetic_water")?.scale.x).toBeCloseTo(0.72);

      await vi.advanceTimersByTimeAsync(10);
      expect(attempts.get("wearable_field_hat_a")).toBe(2);
      expect(settledFailures.at(-1)).toEqual([]);
      expect(materialNamed(fixture.headMesh, "canvas_cream_01").visible).toBe(false);
      expect(fixture.root.getObjectByName("wearable_head_anchor")).toBeDefined();

      await assembler.sync({ ...loadout, head: null });
      expect(materialNamed(fixture.headMesh, "canvas_cream_01").visible).toBe(true);
      expect(fixture.root.getObjectByName("wearable_head_anchor")).toBeUndefined();
    } finally {
      assembler.dispose();
    }

    expect(fixture.headMesh.material).toEqual(fixture.originalHeadMaterials);
  });
});
