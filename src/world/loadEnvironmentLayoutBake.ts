import bakes from "virtual:neva-environment-layout-bakes";
import { decodeEnvironmentLayoutBake } from "./EnvironmentLayoutBake";
import { adoptPreparedEnvironmentLayout } from "./WorldEnvironmentLayout";
import { WORLD_LAYOUT_V5 } from "./WorldLayout";

interface BakeRequest {
  signal: AbortSignal | undefined;
  text: Promise<string>;
}

/** Bake downloads by URL, from the first request until the layout stage consumes them. */
const requests = new Map<string, BakeRequest>();

function bakeUrl(worldSeed: number): string | undefined {
  return bakes.find((entry) => entry.worldSeed === worldSeed && entry.layoutRevision === WORLD_LAYOUT_V5.revision)?.url;
}

/** Joins the download of `url` in flight, or starts one; an aborted or failed one is never reused. */
function requestBake(url: string, signal?: AbortSignal): Promise<string> {
  const existing = requests.get(url);
  if (existing && !existing.signal?.aborted) return existing.text;
  const text = fetch(url, { signal, priority: "high" }).then(async (response) => {
    if (!response.ok) throw new Error(`request failed (${response.status})`);
    return response.text();
  });
  const request = { signal, text };
  requests.set(url, request);
  text.catch(() => {
    if (requests.get(url) === request) requests.delete(url);
  });
  return text;
}

/**
 * Starts downloading the bake for `worldSeed`, if one ships, ahead of the startup model transfers
 * so they do not delay it; `loadEnvironmentLayoutBake` joins the same request.
 */
export function prefetchEnvironmentLayoutBake(worldSeed: number, signal?: AbortSignal): void {
  const url = bakeUrl(worldSeed);
  if (url) requestBake(url, signal).catch(() => undefined);
}

/**
 * Adopts the production build's baked environment layout for `worldSeed` when one ships for the
 * current layout revision. Returns whether startup can skip generating the layout. Development
 * builds ship no bake (the layout editor rewrites placement sources live), and a seed without a
 * bake generates as before. A failed download or a rejected bake is reported and the layout is
 * generated live instead; both paths produce the same placements.
 */
export async function loadEnvironmentLayoutBake(worldSeed: number, signal?: AbortSignal): Promise<boolean> {
  const url = bakeUrl(worldSeed);
  if (!url) return false;
  try {
    const text = await requestBake(url, signal);
    requests.delete(url);
    const decoded = decodeEnvironmentLayoutBake(text, { layoutRevision: WORLD_LAYOUT_V5.revision, worldSeed });
    signal?.throwIfAborted();
    return adoptPreparedEnvironmentLayout(worldSeed, decoded);
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    console.warn("[EnvironmentLayoutBake] Generating the environment layout live:", error);
    return false;
  }
}
