/**
 * Generates the new-game world's environment layout and writes it as an exact bake
 * (`src/world/EnvironmentLayoutBake.ts`). The production build runs this through
 * `tools/vite/environmentLayoutBakePlugin.ts`; run it by hand to inspect a bake:
 *
 *   npx vite-node tools/world/bake-environment-layout.ts -- --out output/environment-layout.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { NEW_GAME_WORLD_SEED } from "../../src/simulation/core/createInitialState";
import { encodeEnvironmentLayoutBake } from "../../src/world/EnvironmentLayoutBake";
import { prepareWorldEnvironmentLayout } from "../../src/world/WorldEnvironmentLayout";
import { WORLD_LAYOUT_V5 } from "../../src/world/WorldLayout";

const outIndex = process.argv.indexOf("--out");
const out = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;
if (!out) {
  console.error("Usage: vite-node tools/world/bake-environment-layout.ts -- --out <file.json>");
  process.exit(2);
}
const started = performance.now();
const layout = await prepareWorldEnvironmentLayout(NEW_GAME_WORLD_SEED);
const text = encodeEnvironmentLayoutBake(layout, WORLD_LAYOUT_V5.revision);
mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
writeFileSync(out, text);
console.info(JSON.stringify({
  worldSeed: NEW_GAME_WORLD_SEED,
  layoutRevision: WORLD_LAYOUT_V5.revision,
  staticPlacements: layout.staticPlacements.length,
  groundCoverPlacements: layout.groundCoverPlacements.length,
  bytes: Buffer.byteLength(text),
  seconds: Number(((performance.now() - started) / 1000).toFixed(1))
}));
