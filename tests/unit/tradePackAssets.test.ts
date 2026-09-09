import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer";
import { FISH_SPECIES } from "../../src/content/fish";
import { CROPS } from "../../src/content/crops";
import { CONTRACT_TEMPLATES } from "../../src/content/contracts";
import { ASSET_CATALOG } from "../../src/render/assets/AssetCatalog";
import { fishCargoPackAsset, fishSpeciesAsset, FISH_CARGO_PACK_ASSETS } from "../../src/render/scene/FishSchoolAssets";
import { createCarryCradle } from "../../src/render/animation/CharacterEquipment";

describe("trade pack asset integration", () => {
  it("covers exactly physical sport fish and keeps the live fish binding separate", () => {
    const sport = Object.values(FISH_SPECIES).filter(fish => fish.isSportFish).map(fish => fish.id).sort();
    expect(Object.keys(FISH_CARGO_PACK_ASSETS).sort()).toEqual(sport);
    for (const id of sport) expect(fishCargoPackAsset(id)).not.toBe(fishSpeciesAsset(id));
    expect(fishCargoPackAsset("fish.sea_bream")).toBeNull();
    expect(fishCargoPackAsset("fish.sardine")).toBeNull();
  });

  it("limits future crop packs to harvested products in authored contracts", async () => {
    const catalog = JSON.parse(await fs.readFile("assets/specs/asset-catalog.json", "utf8"));
    const contractProducts = new Set(CONTRACT_TEMPLATES.flatMap(contract => contract.itemOrSpeciesPool));
    const expected = Object.values(CROPS).map(crop => crop.harvestItemId)
      .filter(id => contractProducts.has(id)).map(id => id.replace("produce.", "")).sort();
    const actual = catalog.assets.filter((asset: { generator: string }) => asset.generator === "crop_trade_pack")
      .map((asset: { parameters: { commodity: string } }) => asset.parameters.commodity).sort();
    expect(actual).toEqual(expected);
  });

  it("loads every published pack with both LODs and finite upright carry geometry", async () => {
    await MeshoptDecoder.ready;
    const packs = ASSET_CATALOG.filter(asset => asset.id.startsWith("prop_trade_pack_"));
    expect(packs).toHaveLength(19);
    for (const spec of packs) {
      const bytes = await fs.readFile(path.resolve("public/assets/models", spec.file));
      const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
        .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
      expect(gltf.animations, spec.id).toHaveLength(0);
      for (const level of spec.lodLevels!) expect(gltf.scene.getObjectByName(level.node), spec.id).toBeDefined();
      const cradle = createCarryCradle(gltf.scene);
      cradle.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(gltf.scene);
      expect(bounds.getCenter(new THREE.Vector3()).length(), spec.id).toBeLessThan(1e-5);
      const size = bounds.getSize(new THREE.Vector3());
      expect(size.y, spec.id).toBeGreaterThan(.9);
      expect(size.z, spec.id).toBeLessThan(.9);
      expect(size.toArray().every(Number.isFinite), spec.id).toBe(true);
      expect(cradle.getObjectByName("carry_grip_left")).toBeDefined();
      expect(cradle.getObjectByName("carry_grip_right")).toBeDefined();
      gltf.scene.traverse(object => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
    }
  });
});
