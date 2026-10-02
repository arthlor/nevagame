import { placementDifferences } from "./preservation-reference.mjs";

function determinismFailures(hashes, label) {
  return Array.isArray(hashes) && hashes.length === 2
    && hashes.every((hash) => typeof hash === "string" && hash.length > 0)
    && hashes[0] === hashes[1]
    ? [] : [`${label} seed 42 is not deterministic or its repeat evidence is missing`];
}

/** Composition measurements describe the scene; only world compatibility and access can reject it. */
export function compositionFailures(audit, preservationReference) {
  const failures = placementDifferences(audit.seeds, preservationReference);
  for (const seed of audit.seeds) {
    if (seed.fishingAccessComponentCount < 3) failures.push(`seed ${seed.seed}: fishing access components`);
    if (!seed.fishingAccessClearancePass) failures.push(`seed ${seed.seed}: fishing access vegetation clearance`);
    for (const failure of seed.routeClearanceFailures) failures.push(`seed ${seed.seed}: ${failure}`);
  }
  return [...failures, ...determinismFailures(audit.repeatedSeed42Hash, "Neva")];
}

export function sunreachCompositionFailures(audit) {
  const failures = [];
  for (const seed of audit.seeds) {
    if (!seed.islandQualificationPass) failures.push(`seed ${seed.seed}: island-qualified identity`);
    if (!seed.routeClearancePass) failures.push(`seed ${seed.seed}: route clearance`);
    if (!seed.drainageCouplingPass) failures.push(`seed ${seed.seed}: drainage coupling`);
  }
  return [...failures, ...determinismFailures(audit.repeatedSeed42Hash, "Sunreach")];
}
