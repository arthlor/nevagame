import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");

interface ManifestAsset {
  id: string;
  file: string;
  family: string;
  generator: string;
  seed: number;
  triangles: number;
  packagedTriangles: number;
  materials: number;
  nodes: number;
  meshes: number;
  paletteTokensUsed: string[];
  vertexColorLoops: number;
  vertexColorSpace: string;
  vertexColorPrimitives: number;
  trianglePrimitives: number;
  qualityStatus: string;
  artContractStatus: string;
  warnings: string[];
  budget: {
    trianglesMin: number;
    trianglesTarget: number;
    trianglesMax: number;
    materialsMax: number;
  };
  lodLevels: Array<{
    node: string;
    distanceMeters: number;
    triangles: number;
    ratio: number;
  }>;
  requiredNodes: string[];
  animationClips?: Array<{
    name: string;
    durationSeconds: number;
    loop: boolean;
  }>;
  bytes: number;
  fileHash: string;
  semanticHash: string;
}

interface Manifest {
  version: number;
  specHash: string;
  paletteHash: string;
  toolchainHash: string;
  blenderVersion: string;
  vertexColorSpace: string;
  assets: ManifestAsset[];
}

const CHARACTER_ASSET_IDS = [
  "char_player_a",
  "char_npc_elspeth_a",
  "char_npc_barnaby_a",
  "char_npc_silas_a",
  "char_npc_maeve_a"
] as const;

describe("Milestone 1 Empirical Challenger — Character Asset Verification", () => {
  const manifestPath = path.join(ROOT, "public/assets/models/asset-manifest.json");
  const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const palettePath = path.join(ROOT, "art/palettes/neva.palette.json");
  const palette = JSON.parse(fs.readFileSync(palettePath, "utf8"));

  it("Manifest contains all 5 character assets with zero warnings and valid contract statuses", () => {
    expect(manifest.assets).toBeDefined();
    expect(manifest.vertexColorSpace).toBe("linear-srgb");

    for (const charId of CHARACTER_ASSET_IDS) {
      const asset = manifest.assets.find((a) => a.id === charId);
      expect(asset, `Missing asset ${charId} in manifest`).toBeDefined();
      expect(asset!.family).toBe("character");
      expect(asset!.qualityStatus).toBe("on_target");
      expect(asset!.artContractStatus).toBe("passed");
      expect(asset!.warnings).toEqual([]);
      expect(asset!.vertexColorSpace).toBe("linear-srgb");
    }
  });

  it("All 5 character assets satisfy triangle budgets, LOD ratios, node counts, and material constraints", () => {
    for (const charId of CHARACTER_ASSET_IDS) {
      const asset = manifest.assets.find((a) => a.id === charId)!;

      // Triangle counts (LOD0)
      expect(asset.triangles).toBeGreaterThanOrEqual(asset.budget.trianglesMin);
      expect(asset.triangles).toBeGreaterThanOrEqual(asset.budget.trianglesTarget);
      expect(asset.triangles).toBeLessThanOrEqual(asset.budget.trianglesMax);

      // Material constraints (<= 6 materials)
      expect(asset.materials).toBeLessThanOrEqual(6);
      expect(asset.materials).toBeLessThanOrEqual(asset.budget.materialsMax);

      // Node count sanity
      expect(asset.nodes).toBeGreaterThanOrEqual(35);

      // LOD Levels and ratio contracts
      expect(asset.lodLevels).toHaveLength(2);
      const [lod0, lod1] = asset.lodLevels;

      expect(lod0.distanceMeters).toBe(0);
      expect(lod0.triangles).toBe(asset.triangles);
      expect(lod0.ratio).toBe(1.0);

      expect(lod1.distanceMeters).toBeGreaterThan(0);
      expect(lod1.triangles).toBeLessThan(lod0.triangles);
      expect(lod1.ratio).toBeGreaterThanOrEqual(0.08);
      expect(lod1.ratio).toBeLessThanOrEqual(0.52);

      // Required socket nodes
      const prefix = charId === "char_player_a" ? "char_player" : charId;
      const expectedSockets = [
        `${prefix}_hand_socket_left`,
        `${prefix}_hand_socket_right`,
        `${prefix}_tool_socket`,
        `${prefix}_carry_socket`,
        `${prefix}_hip_socket`
      ];
      for (const socket of expectedSockets) {
        expect(asset.requiredNodes).toContain(socket);
      }

      // Palette tokens exist in neva.palette.json
      for (const token of asset.paletteTokensUsed) {
        expect(palette.tokens[token], `Unknown token ${token} used in ${charId}`).toBeDefined();
      }
    }
  });

  it("Direct GLB inspection: COLOR_0 vertex color channels exist, are non-empty, and normalize into [0, 1]", async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({
        "meshopt.decoder": MeshoptDecoder,
        "meshopt.encoder": MeshoptEncoder
      });

    for (const charId of CHARACTER_ASSET_IDS) {
      const asset = manifest.assets.find((a) => a.id === charId)!;
      const glbPath = path.join(ROOT, "public/assets/models", asset.file);

      expect(fs.existsSync(glbPath), `GLB file not found: ${glbPath}`).toBe(true);

      // Verify SHA256 file hash matches manifest
      const fileBuffer = fs.readFileSync(glbPath);
      const computedHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
      expect(computedHash).toBe(asset.fileHash);

      // Read document with gltf-transform
      const doc = await io.read(glbPath);
      const root = doc.getRoot();

      const meshes = root.listMeshes();
      expect(meshes.length).toBeGreaterThan(0);

      let totalColor0Accessors = 0;
      let totalVerticesChecked = 0;

      for (const mesh of meshes) {
        for (const prim of mesh.listPrimitives()) {
          const colorAttr = prim.getAttribute("COLOR_0");
          expect(colorAttr, `Primitive in mesh ${mesh.getName()} missing COLOR_0`).not.toBeNull();

          if (colorAttr) {
            totalColor0Accessors++;
            const elementSize = colorAttr.getElementSize();
            expect(elementSize).toBeGreaterThanOrEqual(3); // RGB or RGBA

            const array = colorAttr.getArray();
            expect(array, `COLOR_0 array empty in mesh ${mesh.getName()}`).not.toBeNull();
            expect(array!.length).toBeGreaterThan(0);

            const count = colorAttr.getCount();
            totalVerticesChecked += count;

            const normalized = colorAttr.getNormalized();
            const componentType = colorAttr.getComponentType();

            // Component type 5121 is UNSIGNED_BYTE (normalized to 0..1 via /255)
            // Component type 5123 is UNSIGNED_SHORT (normalized to 0..1 via /65535)
            // Component type 5126 is FLOAT
            const maxInt = componentType === 5121 ? 255 : componentType === 5123 ? 65535 : 1;

            for (let i = 0; i < array!.length; i++) {
              const rawVal = array![i];
              expect(Number.isFinite(rawVal), `COLOR_0 raw value at index ${i} is not finite: ${rawVal}`).toBe(true);

              const normalizedVal = normalized || componentType !== 5126 ? rawVal / maxInt : rawVal;

              expect(normalizedVal, `COLOR_0 normalized value out of range [0, 1]: ${normalizedVal}`).toBeGreaterThanOrEqual(0.0);
              expect(normalizedVal, `COLOR_0 normalized value out of range [0, 1]: ${normalizedVal}`).toBeLessThanOrEqual(1.0 + 1e-5);
            }
          }
        }
      }

      expect(totalColor0Accessors).toBe(asset.vertexColorPrimitives);
      expect(totalVerticesChecked).toBeGreaterThan(1000);

      // Verify Nodes in GLB
      const nodeNames = root.listNodes().map((n) => n.getName());
      const prefix = charId === "char_player_a" ? "char_player" : charId;
      const expectedNodes = [
        `${charId}_root`,
        `${charId}_LOD0`,
        `${charId}_LOD1`,
        `${prefix}_hand_socket_left`,
        `${prefix}_hand_socket_right`,
        `${prefix}_tool_socket`,
        `${prefix}_carry_socket`,
        `${prefix}_hip_socket`
      ];

      for (const expectedNode of expectedNodes) {
        expect(nodeNames, `Missing node ${expectedNode} in ${charId}.glb`).toContain(expectedNode);
      }

      // Verify materials count
      const materials = root.listMaterials();
      expect(materials.length).toBeLessThanOrEqual(6);
      expect(materials.length).toBe(asset.materials);
    }
  });

  it("Verifies semantic determinism between generated/glb and public/assets/models", () => {
    const generatedManifestPath = path.join(ROOT, "generated/reports/asset-manifest.json");
    if (fs.existsSync(generatedManifestPath)) {
      const genManifest: Manifest = JSON.parse(fs.readFileSync(generatedManifestPath, "utf8"));
      for (const charId of CHARACTER_ASSET_IDS) {
        const pubAsset = manifest.assets.find((a) => a.id === charId)!;
        const genAsset = genManifest.assets.find((a) => a.id === charId);
        expect(genAsset).toBeDefined();
        expect(pubAsset.fileHash).toBe(genAsset!.fileHash);
        expect(pubAsset.semanticHash).toBe(genAsset!.semanticHash);
        expect(pubAsset.triangles).toBe(genAsset!.triangles);
        expect(pubAsset.packagedTriangles).toBe(genAsset!.packagedTriangles);
      }
    }
  });
});
