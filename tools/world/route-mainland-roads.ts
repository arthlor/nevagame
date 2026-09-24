import { readFileSync, writeFileSync } from "node:fs";
import {
  MAINLAND_ROUTES_GENERATED_PATH,
  mainlandRouteFingerprint,
  renderMainlandRoutes,
  routeMainlandRoads
} from "./mainlandRoadRouter";

const check = process.argv.includes("--check");
const started = performance.now();
const fingerprint = mainlandRouteFingerprint();
const legs = routeMainlandRoads();
const text = renderMainlandRoutes(legs, fingerprint);
if (check) {
  if (readFileSync(MAINLAND_ROUTES_GENERATED_PATH, "utf8") !== text) {
    console.error("src/world/MainlandRoutes.generated.ts is stale; run npm run world:route-roads");
    process.exit(1);
  }
  console.info("Mainland routes are current.");
} else {
  writeFileSync(MAINLAND_ROUTES_GENERATED_PATH, text);
  const count = Object.values(legs).reduce((total, routeLegs) => total + routeLegs.length, 0);
  console.info(`Routed ${count} legs in ${((performance.now() - started) / 1000).toFixed(1)}s (fingerprint ${fingerprint}).`);
}
