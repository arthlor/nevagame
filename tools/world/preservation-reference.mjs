/** Frozen references are revision-specific; a missing field must never silently pass. */
export function preservationDifferences(current, reference) {
  return ["layoutRevision", "terrainWaterHash", "routeHash", "landmarkHash", "sampleCount"]
    .filter((key) => current[key] === undefined || reference[key] === undefined || current[key] !== reference[key])
    .map((key) => `${key}: ${current[key]} != ${reference[key]}`);
}

export function placementDifferences(seeds, reference) {
  return seeds.flatMap((seed) => {
    const frozen = reference.compositionPlacementHashes?.[String(seed.seed)];
    return frozen && seed.placementHash === frozen ? []
      : [`seed ${seed.seed}: Neva placement ${seed.placementHash} != ${frozen}`];
  });
}
