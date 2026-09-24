import type { AuthoredModel, CatalogAssetSpec } from "../kit/types";
import { AUTHORED_GENERATORS } from "../generators/registry";

/**
 * Builds the scene for one catalog asset from its authored generator. Browser-safe: the Node
 * producer (`node-entry.ts`) exports the result to a GLB, and the Art Yard's live preview renders it
 * directly, so both see exactly the same model.
 */
export function buildAuthoredModel(spec: CatalogAssetSpec): AuthoredModel {
  const generator = AUTHORED_GENERATORS[spec.generator];
  if (!generator) throw new Error(`${spec.id}: no authored generator named ${spec.generator}`);
  const model = generator({ spec, seed: spec.seed, parameters: spec.parameters ?? {} });
  if (model.root.name !== spec.rootNode) {
    throw new Error(`${spec.id}: root is named ${model.root.name}, the catalog expects ${spec.rootNode}`);
  }
  model.root.updateMatrixWorld(true);
  return model;
}

export function isAuthoredGeneratorName(generator: string): boolean {
  return Object.hasOwn(AUTHORED_GENERATORS, generator);
}
