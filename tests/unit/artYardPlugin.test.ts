import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ViteDevServer } from "vite";

import { artYardPlugin } from "../../tools/vite/artYardPlugin";

const ROOT = path.resolve(import.meta.dirname, "../..");
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

async function stagedData(options: { stage?: string; ids?: string[]; missing?: string } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "neva-yard-stage-"));
  temporaryRoots.push(root);
  const catalog = ["prop_first_a", "prop_second_a"].map((id) => ({
    id, file: `${id}.glb`, family: "prop", collision: "none", readDistanceMeters: 20
  }));
  const writeJson = (filename: string, value: unknown) => {
    const target = path.join(root, filename);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(value));
  };
  writeJson("assets/specs/asset-catalog.json", { assets: catalog });
  writeJson("public/assets/models/asset-manifest.json", { assets: catalog });
  const ids = options.ids ?? ["prop_first_a"];
  writeJson("generated/.staging/run-selected/asset-report.json", { assets: ids.map((id) => ({ id, qualityStatus: "passed" })) });
  for (const id of ids) {
    if (id === options.missing) continue;
    const filename = path.join(root, `generated/.staging/run-selected/optimized/${id}.glb`);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, "fixture payload; this test checks source routing only");
  }
  type Middleware = (request: { method: string; url: string }, response: {
    statusCode: number; setHeader: () => void; end: (body: string) => void;
  }, next: () => void) => Promise<void>;
  let middleware: Middleware | undefined;
  const server = {
    middlewares: { use: (handler: Middleware) => { middleware = handler; } }
  } as unknown as ViteDevServer;
  const configure = artYardPlugin(root).configureServer;
  if (typeof configure !== "function") throw new Error("Missing configureServer hook");
  configure.call({} as ThisParameterType<typeof configure>, server);
  let body = "";
  const response = { statusCode: 0, setHeader: () => {}, end: (value: string) => { body = value; } };
  const query = options.stage === undefined ? "?artStage=run-selected" : options.stage ? `?artStage=${encodeURIComponent(options.stage)}` : "";
  await middleware!({ method: "GET", url: `/__neva_art_yard/data${query}` }, response, () => { throw new Error("Unmatched data endpoint"); });
  return { status: response.statusCode, body };
}

describe("Neva art yard plugin and viewer", () => {
  it("includes the stylesheet link and entry script in tools/art-yard/viewer.html", () => {
    const viewerHtml = fs.readFileSync(path.join(ROOT, "tools/art-yard/viewer.html"), "utf8");
    expect(viewerHtml).toContain('<link rel="stylesheet" href="/src/art-yard/styles.css" />');
    expect(viewerHtml).toContain('<script type="module" src="/src/art-yard/main.ts"></script>');
    expect(viewerHtml).toContain('id="yard-canvas"');
    expect(viewerHtml).toContain('id="asset-select"');
  });

  it("registers configureServer middleware that handles yard endpoints", () => {
    const plugin = artYardPlugin(ROOT);
    expect(plugin.name).toBe("neva-dev-art-yard");
    expect(typeof plugin.configureServer).toBe("function");
  });

  it("serves only reported candidates from a selected partial run", async () => {
    const response = await stagedData();
    expect(response.status).toBe(200);
    const data = JSON.parse(response.body);
    expect(data.source).toBe("run-selected");
    expect(data.assets.map((asset: { id: string }) => asset.id)).toEqual(["prop_first_a"]);
    expect(data.assets[0].qualityStatus).toBe("passed");
  });

  it("resolves latest to a valid partial run", async () => {
    const response = await stagedData({ stage: "latest" });
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body).source).toBe("run-selected");
  });

  it.each([
    { ids: ["prop_first_a", "prop_second_a"], missing: "prop_second_a" },
    { ids: ["unknown_asset"] },
    { ids: [] },
    { stage: "../run-selected" }
  ])("rejects unavailable, unknown, empty or unsafe candidates without a published response: %j", async (options) => {
    const response = await stagedData(options);
    expect(response.status).toBe(404);
    expect(response.body).not.toContain('"source":"published"');
  });

  it("retains the full published roster when no stage is requested", async () => {
    const response = await stagedData({ stage: "" });
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ source: "published", assets: [{ id: "prop_first_a" }, { id: "prop_second_a" }] });
  });
});
