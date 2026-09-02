import { auditWorldCompositionSeeds } from "../../src/world/WorldCompositionAudit";

function parseSeeds(value: string | undefined): number[] {
  if (!value || value === "0-63") return Array.from({ length: 64 }, (_, index) => index);
  return value.split(",").map((entry) => Number(entry.trim())).filter(Number.isSafeInteger);
}

const seedArgumentIndex = process.argv.indexOf("--seeds");
const seeds = parseSeeds(seedArgumentIndex >= 0 ? process.argv[seedArgumentIndex + 1] : undefined);
if (seeds.length === 0) throw new Error("[world-composition-audit] No valid seeds supplied");
process.stdout.write(`${JSON.stringify(auditWorldCompositionSeeds(seeds))}\n`);
