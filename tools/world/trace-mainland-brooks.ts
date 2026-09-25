import { readFileSync, writeFileSync } from "node:fs";
import {
  MAINLAND_BROOKS_GENERATED_PATH,
  mainlandBrookFingerprint,
  renderMainlandBrooks,
  traceMainlandBrooks
} from "./mainlandBrookTracer";

const check = process.argv.includes("--check");
const started = performance.now();
const fingerprint = mainlandBrookFingerprint();
const brooks = traceMainlandBrooks();
const text = renderMainlandBrooks(brooks, fingerprint);
if (check) {
  if (readFileSync(MAINLAND_BROOKS_GENERATED_PATH, "utf8") !== text) {
    console.error("src/world/MainlandBrooks.generated.ts is stale; run npm run world:trace-brooks");
    process.exit(1);
  }
  console.info("Mainland brooks are current.");
} else {
  writeFileSync(MAINLAND_BROOKS_GENERATED_PATH, text);
  console.info(`Traced ${brooks.length} brooks in ${((performance.now() - started) / 1000).toFixed(1)}s (fingerprint ${fingerprint}).`);
}
