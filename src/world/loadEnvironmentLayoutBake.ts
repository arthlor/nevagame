import bakes from "virtual:neva-environment-layout-bakes";
import { decodeEnvironmentLayoutBake } from "./EnvironmentLayoutBake";
import { adoptPreparedEnvironmentLayout } from "./WorldEnvironmentLayout";
import { WORLD_LAYOUT_V5 } from "./WorldLayout";

/**
 * Adopts the production build's baked environment layout for `worldSeed` when one ships for the
 * current layout revision. Returns whether startup can skip generating the layout. Development
 * builds ship no bake (the layout editor rewrites placement sources live), and a seed without a
 * bake generates as before. A failed download or a rejected bake is reported and the layout is
 * generated live instead; both paths produce the same placements.
 */
export async function loadEnvironmentLayoutBake(worldSeed: number, signal?: AbortSignal): Promise<boolean> {
  const bake = bakes.find((entry) => entry.worldSeed === worldSeed && entry.layoutRevision === WORLD_LAYOUT_V5.revision);
  if (!bake) return false;
  try {
    const response = await fetch(bake.url, { signal });
    if (!response.ok) throw new Error(`request failed (${response.status})`);
    const decoded = decodeEnvironmentLayoutBake(await response.text(), {
      layoutRevision: WORLD_LAYOUT_V5.revision,
      worldSeed
    });
    signal?.throwIfAborted();
    return adoptPreparedEnvironmentLayout(worldSeed, decoded);
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    console.warn("[EnvironmentLayoutBake] Generating the environment layout live:", error);
    return false;
  }
}
