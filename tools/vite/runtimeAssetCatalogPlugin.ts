import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { Plugin } from "vite";

export const RUNTIME_ASSET_CATALOG_ID = "virtual:neva-runtime-asset-catalog";
const RESOLVED_RUNTIME_ASSET_CATALOG_ID = `\0${RUNTIME_ASSET_CATALOG_ID}`;
const REQUIRED_RUNTIME_ASSET_FIELDS = [
  "id",
  "file",
  "family",
  "collision",
  "instancing",
  "lod",
  "rootNode",
  "requiredNodes",
  "readDistanceMeters"
] as const;
const OPTIONAL_RUNTIME_ASSET_FIELDS = [
  "lodLevels",
  "collisionPrimitives",
  "rigNode",
  "socketNodes",
  "animationClips",
  "additionalAnimationClips",
  "humanoidRig"
] as const;

const RUNTIME_CLIP_FIELDS = [
  "name", "durationSeconds", "commitMarkerSeconds", "loop",
  "referenceSpeedMetersPerSecond", "optional", "fallbackClip", "events", "contacts"
] as const;

function runtimeField(asset: Record<string, unknown>, field: string): unknown {
  const value = asset[field] ?? null;
  if ((field === "animationClips" || field === "additionalAnimationClips") && Array.isArray(value)) {
    // Source clip identity and recipe evidence belong to authoring reports.
    return value.map((clip: Record<string, unknown>) => Object.fromEntries(
      RUNTIME_CLIP_FIELDS.filter((key) => clip[key] !== undefined).map((key) => [key, clip[key]])
    ));
  }
  return value;
}

function readCatalog(catalogPath: string): { assets?: Array<Record<string, unknown>> } {
  return JSON.parse(fs.readFileSync(catalogPath, "utf8")) as {
    assets?: Array<Record<string, unknown>>;
  };
}

export function runtimeAssetCatalogPlugin(rootDirectory: string): Plugin {
  const catalogPath = path.resolve(rootDirectory, "assets/specs/asset-catalog.json");
  const generatedCatalogPath = path.resolve(rootDirectory, "src/render/assets/AssetCatalog.generated.ts");
  const codegenPath = path.resolve(rootDirectory, "tools/art/codegen.mjs");

  function refreshGeneratedCatalog(): void {
    const result = spawnSync(process.execPath, [codegenPath], {
      cwd: rootDirectory,
      encoding: "utf8"
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(result.stderr.trim() || "Asset catalog codegen failed during Vite hot update");
    }
  }

  return {
    name: "neva-runtime-asset-catalog",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const stageMatch = request.url?.match(
          /^\/__neva_art_stage\/(run-[A-Za-z0-9_-]+)\/([a-z][a-z0-9_]*\.glb)(?:\?.*)?$/
        );
        const publicMatch = request.url?.match(
          /^\/assets\/models\/([a-z][a-z0-9_]*\.glb)(?:\?.*)?$/
        );
        if (!stageMatch && !publicMatch) {
          next();
          return;
        }
        const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8")) as {
          assets?: Array<{ file?: string }>;
        };
        const allowed = new Set(
          catalog.assets?.flatMap((asset) => typeof asset.file === "string" ? [asset.file] : [])
        );
        const filename = (stageMatch?.[2] ?? publicMatch?.[1])!;
        if (!allowed.has(filename)) {
          response.statusCode = 404;
          response.end("Unknown catalog asset");
          return;
        }
        const staged = stageMatch
          ? path.resolve(rootDirectory, "generated/.staging", stageMatch[1]!, "optimized", filename)
          : null;
        const published = path.resolve(rootDirectory, "public/assets/models", filename);
        const source = staged && fs.existsSync(staged) ? staged : published;
        if (!fs.existsSync(source)) {
          response.statusCode = 404;
          response.end("Asset is not available in the selected stage or public fallback");
          return;
        }
        response.statusCode = 200;
        response.setHeader("Content-Type", "model/gltf-binary");
        response.setHeader("Content-Length", fs.statSync(source).size);
        response.setHeader("Cache-Control", "no-store");
        fs.createReadStream(source).pipe(response);
      });
    },
    resolveId(id) {
      if (id === RUNTIME_ASSET_CATALOG_ID) return RESOLVED_RUNTIME_ASSET_CATALOG_ID;
    },
    handleHotUpdate({ file, server }) {
      if (path.resolve(file) !== catalogPath) return;
      refreshGeneratedCatalog();
      const modules = [
        server.moduleGraph.getModuleById(RESOLVED_RUNTIME_ASSET_CATALOG_ID),
        server.moduleGraph.getModuleById(generatedCatalogPath)
      ].filter((module): module is NonNullable<typeof module> => Boolean(module));
      for (const module of modules) server.moduleGraph.invalidateModule(module);
      return modules;
    },
    load(id) {
      if (id !== RESOLVED_RUNTIME_ASSET_CATALOG_ID) return;
      this.addWatchFile(catalogPath);
      const catalog = readCatalog(catalogPath);
      if (!Array.isArray(catalog.assets)) throw new Error("Asset catalog is missing its assets array");
      const runtimeAssets = catalog.assets.map((asset, index) => {
        const missing = REQUIRED_RUNTIME_ASSET_FIELDS.filter((field) => asset[field] === undefined);
        if (missing.length) {
          throw new Error(`Asset catalog entry ${index} is missing runtime fields: ${missing.join(", ")}`);
        }
        const file = asset.file;
        if (typeof file !== "string") {
          throw new Error(`Asset catalog entry ${index} has an invalid runtime file`);
        }
        const publishedPath = path.resolve(rootDirectory, "public/assets/models", file);
        if (!fs.existsSync(publishedPath)) {
          throw new Error(`Published runtime asset is missing: ${publishedPath}`);
        }
        this.addWatchFile(publishedPath);
        // Published GLB filenames are stable, so the byte hash versions their
        // browser URL without creating a second asset-catalog authority.
        const contentHash = crypto
          .createHash("sha256")
          .update(fs.readFileSync(publishedPath))
          .digest("hex");
        return Object.fromEntries([
          ...REQUIRED_RUNTIME_ASSET_FIELDS.map((field) => [field, asset[field]]),
          ...OPTIONAL_RUNTIME_ASSET_FIELDS.map((field) => [field, runtimeField(asset, field)]),
          ["contentHash", contentHash]
        ]);
      });
      return `export default ${JSON.stringify(runtimeAssets)};`;
    }
  };
}
