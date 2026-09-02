import { auditWorldCompositionSeed } from "../../src/world/WorldCompositionAudit";

const seedArgumentIndex = process.argv.indexOf("--seeds");
const seeds = (seedArgumentIndex >= 0 ? process.argv[seedArgumentIndex + 1] : "")
  .split(",")
  .map((entry) => Number(entry.trim()))
  .filter(Number.isSafeInteger);
if (seeds.length === 0) throw new Error("[world-composition-audit-shard] No valid seeds supplied");
const repeatedSeed42Hash = process.argv.includes("--repeat42")
  ? [auditWorldCompositionSeed(42).placementHash, auditWorldCompositionSeed(42).placementHash]
  : undefined;
process.stdout.write(`${JSON.stringify({
  seeds: seeds.map(auditWorldCompositionSeed),
  repeatedSeed42Hash
})}\n`);
