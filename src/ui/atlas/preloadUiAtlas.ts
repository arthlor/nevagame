/**
 * Warms the packed UI atlas pages and holds their bytes for the session.
 *
 * The normal HUD and the title screen draw from the same numbered pages, and a
 * cold page is several hundred kilobytes. Waiting for the first `AtlasImage`
 * mount means entry art appears after the world already finished loading, so
 * boot preloads exactly the pages the atlas packer declared as the HUD set
 * (`UI_ATLAS_PRELOAD_PAGES`) and leaves the remaining pages for an idle
 * prefetch. Loaded pages are handed to `AtlasImage` as object URLs, so a host
 * that revalidates instead of caching immutably cannot force a second fetch.
 * Nothing here gates entry: failures resolve quietly and `AtlasImage` still
 * fetches the page URL on demand.
 */

import { UI_ATLAS_PAGES, UI_ATLAS_PRELOAD_PAGES, getAtlasPageUrl } from "./AtlasManifest";

const pageLoads = new Map<number, Promise<void>>();
const pageObjectUrls = new Map<number, string>();

function isValidPageIndex(pageIndex: number): boolean {
  return Number.isInteger(pageIndex) && pageIndex >= 0 && pageIndex < UI_ATLAS_PAGES.length;
}

async function fetchPage(pageIndex: number): Promise<void> {
  const response = await fetch(getAtlasPageUrl(pageIndex, "webp"), { priority: "low" });
  if (!response.ok) return;
  const blob = await response.blob();
  if (blob.size === 0) return;
  pageObjectUrls.set(pageIndex, URL.createObjectURL(blob));
}

/** Resolves when the page's bytes are held locally, error or not. */
export function preloadUiAtlasPage(pageIndex: number): Promise<void> {
  if (!isValidPageIndex(pageIndex)) return Promise.resolve();
  const existing = pageLoads.get(pageIndex);
  if (existing) return existing;

  const promise = typeof fetch === "undefined"
    ? Promise.resolve()
    : fetchPage(pageIndex).catch(() => undefined);

  pageLoads.set(pageIndex, promise);
  return promise;
}

export function preloadUiAtlasPages(pageIndexes: readonly number[]): Promise<void> {
  return Promise.all(pageIndexes.map(preloadUiAtlasPage)).then(() => undefined);
}

export function preloadCoreUiAtlasPages(): Promise<void> {
  return preloadUiAtlasPages(UI_ATLAS_PRELOAD_PAGES);
}

/**
 * The page URL `AtlasImage` should render: the session-held object URL once the
 * preload has the bytes, otherwise the content-hashed static page.
 */
export function uiAtlasPageHref(pageIndex: number): string {
  return pageObjectUrls.get(pageIndex) ?? getAtlasPageUrl(pageIndex, "webp");
}

/** Page indices the boot preload deliberately leaves behind. */
export function deferredUiAtlasPageIndexes(): number[] {
  const preloaded = new Set(UI_ATLAS_PRELOAD_PAGES);
  return UI_ATLAS_PAGES.map((page) => page.index).filter((index) => !preloaded.has(index));
}

function connectionAllowsPrefetch(): boolean {
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (!connection) return true;
  if (connection.saveData) return false;
  return connection.effectiveType !== "slow-2g" && connection.effectiveType !== "2g";
}

/** Fetches the content pages once idle bandwidth is available. */
export function scheduleDeferredUiAtlasPrefetch(): void {
  if (typeof window === "undefined") return;
  const deferred = deferredUiAtlasPageIndexes();
  if (deferred.length === 0 || !connectionAllowsPrefetch()) return;

  const run = () => {
    for (const pageIndex of deferred) void preloadUiAtlasPage(pageIndex);
  };
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  };
  if (typeof idleWindow.requestIdleCallback === "function") {
    idleWindow.requestIdleCallback(run, { timeout: 4000 });
  } else {
    window.setTimeout(run, 1200);
  }
}

/** Boot entry point: core pages now, the rest on idle. Call once per session. */
export function startUiAtlasPrefetch(): void {
  void preloadCoreUiAtlasPages().then(() => scheduleDeferredUiAtlasPrefetch());
}
