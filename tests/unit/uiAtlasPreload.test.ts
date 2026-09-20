import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  UI_ATLAS_PAGES,
  UI_ATLAS_PRELOAD_PAGES,
  getAtlasPageUrl,
  getAtlasSprite
} from "../../src/ui/atlas/AtlasManifest";

/** Families whose sprites the title screen and the normal HUD can present. */
const BOOT_FAMILIES = [
  "tidebook",
  "guildcraft",
  "status",
  "world",
  "menu",
  "supply",
  "tool",
  "action",
  "mapnode",
  "weather",
  "time"
] as const;

function sourceManifest(): {
  families: Record<string, { tier?: string }>;
  sheets: Array<{ family: string; sprites: Array<{ id: string; file: string }> }>;
} {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "assets/ui/ui-atlas.manifest.json"), "utf8"));
}

describe("UI atlas first-use tiers", () => {
  it("marks exactly the HUD families as core and keeps every core sprite on a preload page", () => {
    const manifest = sourceManifest();
    const coreFamilies = Object.entries(manifest.families)
      .filter(([, meta]) => meta.tier === "core")
      .map(([family]) => family)
      .sort();
    expect(coreFamilies).toEqual([...BOOT_FAMILIES].sort());

    const preloadPages = new Set(UI_ATLAS_PRELOAD_PAGES);
    expect(preloadPages.size).toBeGreaterThan(0);

    for (const sheet of manifest.sheets) {
      const core = manifest.families[sheet.family]?.tier === "core";
      for (const sprite of sheet.sprites) {
        const frame = getAtlasSprite(sprite.id) ?? getAtlasSprite(sprite.file);
        expect(frame, `missing atlas frame for ${sprite.id}`).toBeDefined();
        if (core) {
          expect(preloadPages.has(frame!.page), `${sprite.id} must preload (page ${frame!.page})`).toBe(true);
        }
      }
    }

    // Every preloaded page exists; no packed page is pulled into boot by index.
    for (const pageIndex of UI_ATLAS_PRELOAD_PAGES) {
      expect(UI_ATLAS_PAGES[pageIndex]).toBeDefined();
    }
  });
});

describe("UI atlas boot preload", () => {
  const requested: string[] = [];

  const stubEnvironment = () => {
    vi.stubGlobal("window", { setTimeout: (callback: () => void, delayMs?: number) => setTimeout(callback, delayMs) });
    vi.stubGlobal("fetch", (url: string) => {
      requested.push(url);
      return Promise.resolve({ ok: true, blob: async () => new Blob(["page"]) });
    });
  };

  beforeEach(() => {
    vi.resetModules();
    requested.length = 0;
    stubEnvironment();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("requests exactly the declared preload pages, once each", async () => {
    const { preloadCoreUiAtlasPages, uiAtlasPageHref } = await import("../../src/ui/atlas/preloadUiAtlas");
    await preloadCoreUiAtlasPages();
    await preloadCoreUiAtlasPages();

    const expected = UI_ATLAS_PRELOAD_PAGES.map((page) => getAtlasPageUrl(page, "webp"));
    expect(requested).toEqual(expected);

    // The HUD reuses the held bytes instead of hitting the network again.
    for (const page of UI_ATLAS_PRELOAD_PAGES) {
      expect(uiAtlasPageHref(page).startsWith("blob:")).toBe(true);
    }
  });

  it("prefetches the remaining pages only after idle, and skips save-data clients", async () => {
    vi.useFakeTimers();
    const { deferredUiAtlasPageIndexes, scheduleDeferredUiAtlasPrefetch, uiAtlasPageHref } =
      await import("../../src/ui/atlas/preloadUiAtlas");

    const deferred = deferredUiAtlasPageIndexes();
    expect(deferred.length).toBeGreaterThan(0);
    expect(deferred.every((page) => !UI_ATLAS_PRELOAD_PAGES.includes(page))).toBe(true);
    expect(uiAtlasPageHref(deferred[0]).startsWith("blob:")).toBe(false);

    scheduleDeferredUiAtlasPrefetch();
    expect(requested).toEqual([]);
    await vi.advanceTimersByTimeAsync(1500);
    const expected = deferred.map((page) => getAtlasPageUrl(page, "webp")).sort();
    expect([...requested].sort()).toEqual(expected);
    expect(uiAtlasPageHref(deferred[0]).startsWith("blob:")).toBe(true);

    vi.stubGlobal("navigator", { connection: { saveData: true } });
    vi.resetModules();
    requested.length = 0;
    const reloaded = await import("../../src/ui/atlas/preloadUiAtlas");
    reloaded.scheduleDeferredUiAtlasPrefetch();
    await vi.advanceTimersByTimeAsync(1500);
    expect(requested).toEqual([]);
  });

  it("ignores invalid page indices", async () => {
    const { preloadUiAtlasPage } = await import("../../src/ui/atlas/preloadUiAtlas");
    await preloadUiAtlasPage(-1);
    await preloadUiAtlasPage(UI_ATLAS_PAGES.length);
    await preloadUiAtlasPage(1.5);
    expect(requested).toEqual([]);
  });
});
