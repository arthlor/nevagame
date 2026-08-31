import path from "node:path";
import fs from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  weld,
  dedup,
  prune,
  quantize,
  reorder,
  meshopt,
  simplify,
  join,
} from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";

export const DEFAULT_OPTIMIZE_CONFIG = Object.freeze({
  weldTolerance: 0.0005,
  quantizePosition: 14,
  quantizeNormal: 10,
  quantizeTexcoord: 12,
  quantizeColor: 8,
  meshoptLevel: "medium",
});

let readyPromise = null;
export async function ensureMeshoptReady() {
  if (!readyPromise) {
    readyPromise = Promise.all([
      MeshoptDecoder.ready,
      MeshoptEncoder.ready,
    ]);
  }
  return readyPromise;
}

export function createNodeIO() {
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "meshopt.decoder": MeshoptDecoder,
      "meshopt.encoder": MeshoptEncoder,
    });
}

export function mayJoinStaticNode(node, spec = {}) {
  const name = node.getName ? node.getName() : "";
  // LOD generators already consolidate each level by material. Joining here
  // could cross switch boundaries and invalidate runtime distance selection.
  if (spec.lodLevels && spec.lodLevels.length > 0) return false;
  const requiredNodes = spec.requiredNodes || [];
  if (requiredNodes.includes(name) || name.startsWith("COL_")) return false;
  // Preserve authored character hierarchy, rig, sockets, and skinned parts.
  if (spec.generator === "coastal_worker" || spec.generator === "npc_character") return false;

  // Rowboat oars are presentation-rigged at runtime.
  if (spec.generator === "rowboat" && name.startsWith("rowboat_oar_")) return false;
  // Windmill hub/spars/sails are rotated dynamically at runtime.
  if (
    spec.generator === "windmill" &&
    (name === "windmill_hub" || name.startsWith("windmill_spar_") || name.startsWith("windmill_sail_"))
  ) {
    return false;
  }
  return true;
}

/**
 * Optimizes a single GLB asset using gltf-transform and meshoptimizer.
 */
export async function optimizeAsset(source, destination, spec = {}, options = {}) {
  await ensureMeshoptReady();
  const io = createNodeIO();

  let document;
  if (typeof source === "string") {
    document = await io.read(source);
  } else if (source instanceof Uint8Array || Buffer.isBuffer(source)) {
    document = await io.readBinary(source);
  } else {
    document = source;
  }

  const weldTol = options.weldTolerance ?? DEFAULT_OPTIMIZE_CONFIG.weldTolerance;
  const quantPos = options.quantizePosition ?? DEFAULT_OPTIMIZE_CONFIG.quantizePosition;
  const quantNorm = options.quantizeNormal ?? DEFAULT_OPTIMIZE_CONFIG.quantizeNormal;
  const quantTex = options.quantizeTexcoord ?? DEFAULT_OPTIMIZE_CONFIG.quantizeTexcoord;
  const quantCol = options.quantizeColor ?? DEFAULT_OPTIMIZE_CONFIG.quantizeColor;
  const meshLevel = options.meshoptLevel ?? DEFAULT_OPTIMIZE_CONFIG.meshoptLevel;

  const transforms = [
    dedup(),
    join({ cleanup: false, filter: (node) => mayJoinStaticNode(node, spec) }),
    prune({ keepLeaves: true, keepAttributes: true, keepExtras: true }),
    weld({ tolerance: weldTol }),
    quantize({
      quantizePosition: quantPos,
      quantizeNormal: quantNorm,
      quantizeTexcoord: quantTex,
      quantizeColor: quantCol,
    }),
    reorder({ encoder: MeshoptEncoder }),
    meshopt({ encoder: MeshoptEncoder, level: meshLevel }),
  ];

  await document.transform(...transforms);

  if (typeof destination === "string") {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    await io.write(destination, document);
    return destination;
  }
  return io.writeBinary(document);
}

/**
 * Optimizes LOD0 and generates simplified derived LODs (LOD1, LOD2, etc.) if configured.
 */
export async function optimizeAndGenerateLods(sourceGlbPath, outputBaseDir, assetSpec = {}, options = {}) {
  await ensureMeshoptReady();
  const io = createNodeIO();

  fs.mkdirSync(outputBaseDir, { recursive: true });
  const fileName = assetSpec.file || `${assetSpec.id}.glb`;
  const lod0Path = path.join(outputBaseDir, fileName);

  // 1. Optimize Base LOD0
  await optimizeAsset(sourceGlbPath, lod0Path, assetSpec, options);
  const generatedFiles = [lod0Path];

  // 2. Generate Derived LODs if spec defines lodLevels
  if (assetSpec.lodLevels && assetSpec.lodLevels.length > 1) {
    for (let i = 1; i < assetSpec.lodLevels.length; i++) {
      const level = assetSpec.lodLevels[i];
      const lodDoc = await io.read(sourceGlbPath); // read fresh unquantized copy

      const targetRatio = level.triangleRatioTarget ?? level.triangleRatioMax ?? (1.0 / (i + 1));
      const lodTransforms = [
        weld({ tolerance: 0.001 }),
        simplify({
          simplifier: MeshoptSimplifier,
          ratio: targetRatio,
          error: 0.02,
        }),
        dedup(),
        prune({ keepLeaves: true, keepAttributes: true, keepExtras: true }),
        quantize({
          quantizePosition: 12,
          quantizeNormal: 8,
          quantizeColor: 8,
        }),
        reorder({ encoder: MeshoptEncoder }),
        meshopt({ encoder: MeshoptEncoder, level: "medium" }),
      ];

      await lodDoc.transform(...lodTransforms);

      const baseName = fileName.replace(/\.glb$/, "");
      const lodFileName = `${baseName}.lod${i}.glb`;
      const lodPath = path.join(outputBaseDir, lodFileName);
      await io.write(lodPath, lodDoc);
      generatedFiles.push(lodPath);
    }
  }

  return {
    lod0Path,
    generatedFiles,
  };
}
