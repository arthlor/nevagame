import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodeEnvironmentLayoutBake } from "../../src/world/EnvironmentLayoutBake";
import type { EnvironmentAssetPlacement } from "../../src/world/WorldEnvironmentLayout";
import { WORLD_LAYOUT_V5 } from "../../src/world/WorldLayout";

const BAKE_URL = "/assets/environment-layout-test.json";
let nextSeed = 910_000;

const bakeEntries = vi.hoisted((): Array<{ worldSeed: number; layoutRevision: number; url: string }> => []);
vi.mock("virtual:neva-environment-layout-bakes", () => ({ default: bakeEntries }));

function placement(id: string): EnvironmentAssetPlacement {
  return { id, origin: "authored", assetId: "rock_field_a", x: 2, z: 3, rotationY: 0, scale: [1, 1, 1] };
}

/** Registers a bake for a fresh seed, so each test adopts into an empty layout cache. */
function shipBake(): { worldSeed: number; text: string } {
  const worldSeed = nextSeed++;
  bakeEntries.splice(0, bakeEntries.length, { worldSeed, layoutRevision: WORLD_LAYOUT_V5.revision, url: BAKE_URL });
  const text = encodeEnvironmentLayoutBake(
    { worldSeed, staticPlacements: [placement(`baked-${worldSeed}`)], groundCoverPlacements: [] },
    WORLD_LAYOUT_V5.revision
  );
  return { worldSeed, text };
}

describe("environment layout bake loading", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("joins the prefetched download at high priority and adopts the bake", async () => {
    const { prefetchEnvironmentLayoutBake, loadEnvironmentLayoutBake } =
      await import("../../src/world/loadEnvironmentLayoutBake");
    const { createWorldStaticPlacements } = await import("../../src/world/WorldEnvironmentLayout");
    const { worldSeed, text } = shipBake();
    fetchMock.mockResolvedValue(new Response(text));

    prefetchEnvironmentLayoutBake(worldSeed);
    await expect(loadEnvironmentLayoutBake(worldSeed)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ priority: "high" });
    expect(createWorldStaticPlacements(worldSeed).map((entry) => entry.id)).toEqual([`baked-${worldSeed}`]);
  });

  it("refetches after an aborted prefetch instead of reusing it", async () => {
    const { prefetchEnvironmentLayoutBake, loadEnvironmentLayoutBake } =
      await import("../../src/world/loadEnvironmentLayoutBake");
    const { worldSeed, text } = shipBake();
    fetchMock.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    }));
    fetchMock.mockResolvedValueOnce(new Response(text));
    const aborted = new AbortController();

    prefetchEnvironmentLayoutBake(worldSeed, aborted.signal);
    aborted.abort();
    await expect(loadEnvironmentLayoutBake(worldSeed, new AbortController().signal)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to live generation when the download fails or the bake is rejected", async () => {
    const { loadEnvironmentLayoutBake } = await import("../../src/world/loadEnvironmentLayoutBake");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failed = shipBake();
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));
    await expect(loadEnvironmentLayoutBake(failed.worldSeed)).resolves.toBe(false);

    const rejected = shipBake();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ...JSON.parse(rejected.text), format: 99 })));
    await expect(loadEnvironmentLayoutBake(rejected.worldSeed)).resolves.toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("rethrows when startup itself is aborted", async () => {
    const { loadEnvironmentLayoutBake } = await import("../../src/world/loadEnvironmentLayoutBake");
    const { worldSeed } = shipBake();
    const controller = new AbortController();
    fetchMock.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    }));
    const load = loadEnvironmentLayoutBake(worldSeed, controller.signal);
    controller.abort(new Error("startup cancelled"));
    await expect(load).rejects.toThrow("startup cancelled");
  });

  it("does nothing for a seed without a bake", async () => {
    const { prefetchEnvironmentLayoutBake, loadEnvironmentLayoutBake } =
      await import("../../src/world/loadEnvironmentLayoutBake");
    shipBake();
    prefetchEnvironmentLayoutBake(1);
    await expect(loadEnvironmentLayoutBake(1)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
