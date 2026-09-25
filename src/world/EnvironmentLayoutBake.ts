import type { EnvironmentAssetPlacement, GroundCoverPlacement } from "./WorldEnvironmentLayout";

/**
 * Serialized form of a generated environment layout.
 *
 * The production build generates the layout for the new-game world seed once and ships it as a
 * hashed asset, so startup reads it instead of regenerating ~30k placements on the main thread.
 * The encoding is exact: every number round-trips through JSON, and the placement fields a
 * generator sets explicitly to `undefined` (which JSON would drop) are listed and restored, so a
 * decoded layout is deep-equal to the live one, own keys included.
 */
export const ENVIRONMENT_LAYOUT_BAKE_FORMAT = 1;

type PlacementList = "static" | "groundCover";

export interface EnvironmentLayoutBake {
  format: typeof ENVIRONMENT_LAYOUT_BAKE_FORMAT;
  layoutRevision: number;
  worldSeed: number;
  staticPlacements: EnvironmentAssetPlacement[];
  groundCoverPlacements: GroundCoverPlacement[];
  /** `[list, placement index, key]` for each top-level field set to `undefined`. */
  undefinedFields: Array<[PlacementList, number, string]>;
}

export interface DecodedEnvironmentLayout {
  staticPlacements: readonly EnvironmentAssetPlacement[];
  groundCoverPlacements: readonly GroundCoverPlacement[];
}

function assertPlain(value: unknown, path: string): void {
  if (value === undefined) throw new Error(`[EnvironmentLayoutBake] ${path} is undefined below the placement level`);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`[EnvironmentLayoutBake] ${path} is not a finite number`);
    return;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value !== "object") throw new Error(`[EnvironmentLayoutBake] ${path} is not JSON data`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== Array.prototype) {
    throw new Error(`[EnvironmentLayoutBake] ${path} is not a plain object or array`);
  }
  for (const [key, child] of Object.entries(value)) assertPlain(child, `${path}.${key}`);
}

function collectUndefinedFields(
  list: PlacementList,
  placements: readonly object[],
  into: Array<[PlacementList, number, string]>
): void {
  placements.forEach((placement, index) => {
    for (const [key, value] of Object.entries(placement)) {
      if (value === undefined) into.push([list, index, key]);
      else assertPlain(value, `${list}[${index}].${key}`);
    }
  });
}

export function encodeEnvironmentLayoutBake(
  layout: DecodedEnvironmentLayout & { worldSeed: number },
  layoutRevision: number
): string {
  const undefinedFields: Array<[PlacementList, number, string]> = [];
  collectUndefinedFields("static", layout.staticPlacements, undefinedFields);
  collectUndefinedFields("groundCover", layout.groundCoverPlacements, undefinedFields);
  const bake: EnvironmentLayoutBake = {
    format: ENVIRONMENT_LAYOUT_BAKE_FORMAT,
    layoutRevision,
    worldSeed: layout.worldSeed,
    staticPlacements: [...layout.staticPlacements],
    groundCoverPlacements: [...layout.groundCoverPlacements],
    undefinedFields
  };
  return JSON.stringify(bake);
}

/** Decodes a bake and rejects one made for another format, layout revision or world seed. */
export function decodeEnvironmentLayoutBake(
  text: string,
  expected: { layoutRevision: number; worldSeed: number }
): DecodedEnvironmentLayout {
  const bake = JSON.parse(text) as Partial<EnvironmentLayoutBake>;
  if (bake.format !== ENVIRONMENT_LAYOUT_BAKE_FORMAT) {
    throw new Error(`[EnvironmentLayoutBake] Unsupported bake format ${String(bake.format)}`);
  }
  if (bake.layoutRevision !== expected.layoutRevision || bake.worldSeed !== expected.worldSeed) {
    throw new Error(
      `[EnvironmentLayoutBake] Bake is for layout ${String(bake.layoutRevision)} seed ${String(bake.worldSeed)}, ` +
      `not layout ${expected.layoutRevision} seed ${expected.worldSeed}`
    );
  }
  if (!Array.isArray(bake.staticPlacements) || !Array.isArray(bake.groundCoverPlacements)
    || !Array.isArray(bake.undefinedFields)) {
    throw new Error("[EnvironmentLayoutBake] Bake is missing its placement lists");
  }
  const lists: Record<PlacementList, object[]> = {
    static: bake.staticPlacements,
    groundCover: bake.groundCoverPlacements
  };
  for (const [list, index, key] of bake.undefinedFields) {
    const placement = lists[list]?.[index] as Record<string, unknown> | undefined;
    if (!placement || Object.hasOwn(placement, key)) {
      throw new Error(`[EnvironmentLayoutBake] Invalid undefined-field entry ${list}[${index}].${key}`);
    }
    placement[key] = undefined;
  }
  return { staticPlacements: bake.staticPlacements, groundCoverPlacements: bake.groundCoverPlacements };
}
