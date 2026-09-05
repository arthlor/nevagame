import fs from "node:fs";
import type { ServerResponse } from "node:http";
import path from "node:path";

import type { Plugin } from "vite";

const YARD_PATH = "/__neva_art_yard";
const DATA_PATH = `${YARD_PATH}/data`;
const STAGE_PATTERN = /^run-[A-Za-z0-9_-]+$/;

type CatalogAsset = {
  id: string;
  file: string;
  family: string;
  collision: string;
  collisionPrimitives?: unknown;
  lodLevels?: unknown;
  readDistanceMeters: number;
};

type AssetReportEntry = {
  id: string;
  inputHash?: string;
  cacheHit?: boolean;
  fileHash?: string;
  semanticHash?: string;
  triangles?: number;
  packagedTriangles?: number;
  bytes?: number;
  qualityStatus?: string;
  lodLevels?: unknown;
  budget?: unknown;
};

function readJson(filename: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filename, "utf8")) as Record<string, unknown>;
}

function reportEntries(value: Record<string, unknown> | null): AssetReportEntry[] {
  return Array.isArray(value?.assets) ? value.assets as AssetReportEntry[] : [];
}

function stageCandidates(rootDirectory: string): Array<{ name: string; directory: string; report: Record<string, unknown> }> {
  const stagingRoot = path.join(rootDirectory, "generated/.staging");
  if (!fs.existsSync(stagingRoot)) return [];
  return fs.readdirSync(stagingRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && STAGE_PATTERN.test(entry.name))
    .map((entry) => {
      const directory = path.join(stagingRoot, entry.name);
      const reportPath = path.join(directory, "asset-report.json");
      return fs.existsSync(reportPath)
        ? { name: entry.name, directory, report: readJson(reportPath) }
        : null;
    })
    .filter((entry): entry is { name: string; directory: string; report: Record<string, unknown> } => entry !== null)
    .sort((left, right) => fs.statSync(right.directory).mtimeMs - fs.statSync(left.directory).mtimeMs);
}

function resolveSource(rootDirectory: string, requestedStage: string | null, catalog: CatalogAsset[]): {
  name: string;
  report: Record<string, unknown> | null;
} {
  if (!requestedStage) {
    const manifestPath = path.join(rootDirectory, "public/assets/models/asset-manifest.json");
    return { name: "published", report: fs.existsSync(manifestPath) ? readJson(manifestPath) : null };
  }
  if (requestedStage !== "latest" && !STAGE_PATTERN.test(requestedStage)) {
    throw new Error(`Unsafe art yard stage: ${requestedStage}`);
  }
  const candidate = stageCandidates(rootDirectory).find((entry) =>
    (requestedStage === "latest" || requestedStage === entry.name) &&
    catalog.every((asset) => fs.existsSync(path.join(entry.directory, "optimized", asset.file))),
  );
  if (!candidate) {
    throw new Error(`${requestedStage === "latest" ? "No complete staged run" : `Staged run ${requestedStage} was not found`}`);
  }
  return { name: candidate.name, report: candidate.report };
}

function generateYardDataPayload(rootDirectory: string, catalogPath: string, stage: string | null): Record<string, unknown> {
  const catalog = readJson(catalogPath).assets as CatalogAsset[];
  const source = resolveSource(rootDirectory, stage, catalog);
  const reportById = new Map(reportEntries(source.report).map((asset) => [asset.id, asset]));
  return {
    version: 1,
    source: source.name,
    generatedAt: source.report?.generatedAt ?? null,
    assets: catalog.map((asset) => {
      const report = reportById.get(asset.id);
      return {
        id: asset.id,
        file: asset.file,
        family: asset.family,
        collision: asset.collision,
        collisionPrimitives: asset.collisionPrimitives ?? null,
        lodContract: asset.lodLevels ?? null,
        readDistanceMeters: asset.readDistanceMeters,
        inputHash: report?.inputHash ?? null,
        cacheHit: report?.cacheHit ?? null,
        fileHash: report?.fileHash ?? null,
        semanticHash: report?.semanticHash ?? null,
        triangles: report?.triangles ?? null,
        packagedTriangles: report?.packagedTriangles ?? null,
        bytes: report?.bytes ?? null,
        qualityStatus: report?.qualityStatus ?? null,
        lodLevels: report?.lodLevels ?? null,
        budget: report?.budget ?? null,
      };
    }),
  };
}

function jsonResponse(response: ServerResponse, value: unknown): void {
  response.statusCode = 200;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(`${JSON.stringify(value)}\n`);
}

export function artYardPlugin(rootDirectory: string): Plugin {
  const viewerPath = path.resolve(rootDirectory, "tools/art-yard/viewer.html");
  const catalogPath = path.resolve(rootDirectory, "assets/specs/asset-catalog.json");
  let outputDirectory = path.resolve(rootDirectory, "dist");

  return {
    name: "neva-dev-art-yard",
    configResolved(config) {
      outputDirectory = path.resolve(config.root, config.build.outDir);
    },
    writeBundle() {
      const bundledViewer = path.join(outputDirectory, "tools/art-yard/viewer.html");
      if (fs.existsSync(bundledViewer)) {
        const viewerHtml = fs.readFileSync(bundledViewer, "utf8");

        const targetHtmlFiles = [
          path.join(outputDirectory, "art-yard/index.html"),
          path.join(outputDirectory, "__neva_art_yard/index.html"),
          path.join(outputDirectory, "art-yard.html")
        ];

        for (const target of targetHtmlFiles) {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, viewerHtml, "utf8");
        }

        try {
          const payload = generateYardDataPayload(rootDirectory, catalogPath, null);
          const dataJson = `${JSON.stringify(payload)}\n`;
          const targetDataFiles = [
            path.join(outputDirectory, "__neva_art_yard/data"),
            path.join(outputDirectory, "__neva_art_yard/data.json"),
            path.join(outputDirectory, "art-yard/data"),
            path.join(outputDirectory, "art-yard/data.json")
          ];
          for (const dataFile of targetDataFiles) {
            fs.mkdirSync(path.dirname(dataFile), { recursive: true });
            fs.writeFileSync(dataFile, dataJson, "utf8");
          }
        } catch (error) {
          console.warn("[Art Yard] Could not pre-render static yard data:", error);
        }
      }
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.method !== "GET" || !request.url) {
          next();
          return;
        }
        const url = new URL(request.url, "http://neva.local");
        if (
          url.pathname === YARD_PATH ||
          url.pathname === `${YARD_PATH}/` ||
          url.pathname === "/art-yard" ||
          url.pathname === "/art-yard/" ||
          url.pathname === "/tools/art-yard/viewer.html" ||
          url.pathname === "/tools/art-yard" ||
          url.pathname === "/tools/art-yard/"
        ) {
          try {
            const rawHtml = fs.readFileSync(viewerPath, "utf8");
            const transformedHtml = await server.transformIndexHtml(request.url, rawHtml);
            response.statusCode = 200;
            response.setHeader("Content-Type", "text/html; charset=utf-8");
            response.setHeader("Cache-Control", "no-store");
            response.end(transformedHtml);
          } catch (error) {
            next(error);
          }
          return;
        }
        if (url.pathname !== DATA_PATH && url.pathname !== "/art-yard/data") {
          next();
          return;
        }
        try {
          const payload = generateYardDataPayload(rootDirectory, catalogPath, url.searchParams.get("artStage"));
          jsonResponse(response, payload);
        } catch (error) {
          response.statusCode = 404;
          response.setHeader("Content-Type", "text/plain; charset=utf-8");
          response.end(error instanceof Error ? error.message : "Art yard data is unavailable");
        }
      });
    },
  };
}
