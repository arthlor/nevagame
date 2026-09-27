import { readFileSync, writeFileSync } from "node:fs";
import {
  MAINLAND_ROAD_NETWORK_GENERATED_PATH,
  lastPlannedLinks,
  mainlandRoadNetworkFingerprint,
  planMainlandRoadNetwork,
  renderMainlandRoadNetwork
} from "./mainlandRoadNetwork";

const check = process.argv.includes("--check");
const started = performance.now();
const fingerprint = mainlandRoadNetworkFingerprint();
const roads = planMainlandRoadNetwork();
const text = renderMainlandRoadNetwork(roads, fingerprint);
if (check) {
  if (readFileSync(MAINLAND_ROAD_NETWORK_GENERATED_PATH, "utf8") !== text) {
    console.error("src/world/MainlandRoadNetwork.generated.ts is stale; run npm run world:plan-roads");
    process.exit(1);
  }
  console.info("Mainland road network is current.");
} else {
  writeFileSync(MAINLAND_ROAD_NETWORK_GENERATED_PATH, text);
  const summary = roads.map(road => `${road.id} (${road.kind}, ${road.knots.length} knots)`).join("\n  ");
  const links = lastPlannedLinks.map(link =>
    `${link.a} – ${link.b || "network"}: ${link.kind}, traffic ${link.traffic.toFixed(1)}, cost ${link.cost.toFixed(0)}`).join("\n  ");
  console.info(`Links:\n  ${links}`);
  console.info(`Planned ${roads.length} roads in ${((performance.now() - started) / 1000).toFixed(1)}s (fingerprint ${fingerprint}):\n  ${summary}`);
}
