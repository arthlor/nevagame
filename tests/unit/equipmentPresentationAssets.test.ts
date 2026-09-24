import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MeshoptDecoder } from "meshoptimizer";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { SIMULATION_ACTION_TIMINGS } from "../../src/simulation/actions/ActionTimeline";
import { ASSET_BY_ID, type AssetId } from "../../src/render/assets/AssetCatalog";
import { UI_EQUIPMENT, UI_RODS, UI_SUPPLIES } from "../../src/ui/chrome/uiAtlas.generated";
import { createNodeGltfLoader } from "../helpers/nodeGltfLoader";

const SYSTEM_ASSET_IDS = [
  "wearable_field_hat_a",
  "wearable_tidewatch_cap_a",
  "wearable_harvest_apron_a",
  "wearable_oilskin_coat_a",
  "wearable_furrow_boots_a",
  "wearable_deck_boots_a",
  "tool_watering_can_copper_rose_a",
  "tool_watering_can_long_spout_a",
  "tool_sickle_broad_a",
  "tool_sickle_balanced_a",
  "tool_fishing_rod_river_a",
  "tool_fishing_rod_heavy_sport_a",
  "tool_fishing_rod_offshore_a",
  "tool_fishing_rod_master_a",
  "prop_crafting_tailor_a",
  "prop_crafting_toolmaking_a",
  "prop_crafting_ready_a"
] as const satisfies readonly AssetId[];

const MATERIAL_ITEM_IDS = [
  "item.hardwood_blank",
  "item.tanned_leather",
  "item.tool_steel",
  "item.linen_roll",
  "item.copper_sheet",
  "item.brass_fittings",
  "item.oiled_canvas"
] as const;

describe("equipment presentation asset contracts", () => {
  it("maps every equipment and rod presentation to a catalogued, published GLB", async () => {
    ContentRegistry.initializeAndValidate();
    for (const definition of ContentRegistry.equipment.values()) {
      const assetId = definition.presentation.assetId;
      if (assetId) expect(ASSET_BY_ID.has(assetId as AssetId), definition.id).toBe(true);
    }
    for (const rod of ContentRegistry.rods.values()) {
      expect(ASSET_BY_ID.has(rod.assetId as AssetId), rod.id).toBe(true);
    }
    for (const assetId of SYSTEM_ASSET_IDS) {
      expect(ASSET_BY_ID.has(assetId), assetId).toBe(true);
      await expect(fs.access(path.resolve("public/assets/models", `${assetId}.glb`))).resolves.toBeUndefined();
    }
  });

  it("resolves every starter clothing material region on both published character LODs", async () => {
    ContentRegistry.initializeAndValidate();
    const bytes = await fs.readFile(path.resolve("public/assets/models/char_player_a.glb"));
    await MeshoptDecoder.ready;
    const gltf = await createNodeGltfLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      ""
    );

    for (const definition of ContentRegistry.equipment.values()) {
      const binding = definition.presentation.characterBaseLayer;
      if (!binding) continue;
      for (const nodeName of binding.nodeNames) {
        const node = gltf.scene.getObjectByName(nodeName);
        expect(node, `${definition.id}: ${nodeName}`).toBeDefined();
        const materialNames = new Set<string>();
        node!.traverse((object) => {
          const mesh = object as import("three").Mesh;
          if (!mesh.isMesh) return;
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of materials) materialNames.add(material.name);
        });
        for (const materialName of binding.materialNames) {
          expect(materialNames.has(materialName), `${definition.id}: ${nodeName}/${materialName}`).toBe(true);
        }
      }
    }
  });

  it("publishes all 27 equipment, rod, and material icon mappings", () => {
    expect(Object.keys(UI_EQUIPMENT)).toHaveLength(15);
    expect(Object.keys(UI_RODS)).toHaveLength(5);
    for (const id of MATERIAL_ITEM_IDS) expect(UI_SUPPLIES[id], id).toBeDefined();
    expect(Object.keys(UI_EQUIPMENT).length + Object.keys(UI_RODS).length + MATERIAL_ITEM_IDS.length).toBe(27);
  });

  it("exports the three crafting actions with catalog and simulation commit timing aligned", async () => {
    const bytes = await fs.readFile(path.resolve("public/assets/models/char_player_a.glb"));
    await MeshoptDecoder.ready;
    const gltf = await createNodeGltfLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      ""
    );
    const runtimeClips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
    const spec = ASSET_BY_ID.get("char_player_a");
    const catalogClips = new Map(spec?.animationClips?.map((clip) => [clip.name, clip]) ?? []);
    const expected = [
      ["craft_tailor", "processing-start"],
      ["craft_tool", "processing-start"],
      ["gear_check", "processing-collect"]
    ] as const;

    for (const [clipName, action] of expected) {
      const runtime = runtimeClips.get(clipName);
      const catalog = catalogClips.get(clipName);
      expect(runtime, `${clipName} runtime clip`).toBeDefined();
      expect(catalog, `${clipName} catalog clip`).toBeDefined();
      expect(runtime!.duration).toBeCloseTo(SIMULATION_ACTION_TIMINGS[action].durationMs / 1000, 3);
      expect(catalog!.commitMarkerSeconds).toBeCloseTo(SIMULATION_ACTION_TIMINGS[action].commitMs / 1000, 3);
    }
  });
});
