import { auditSunreachCompositionSeed } from "../../src/world/WorldCompositionAudit";

const seedArgumentIndex = process.argv.indexOf("--seeds");
const seeds = (seedArgumentIndex >= 0 ? process.argv[seedArgumentIndex + 1] : "")
  .split(",")
  .map((entry) => Number(entry.trim()))
  .filter(Number.isSafeInteger);
if (seeds.length === 0) throw new Error("[sunreach-composition-audit-shard] No valid seeds supplied");
const repeatedSeed42Hash = process.argv.includes("--repeat42")
  ? [auditSunreachCompositionSeed(42).placementHash, auditSunreachCompositionSeed(42).placementHash]
  : undefined;
process.stdout.write(`${JSON.stringify({
  seeds: seeds.map(auditSunreachCompositionSeed),
  repeatedSeed42Hash
})}\n`);
