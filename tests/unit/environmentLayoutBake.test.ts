import { describe, expect, it } from "vitest";

import { NEW_GAME_WORLD_SEED } from "../../src/simulation/core/createInitialState";
import {
  decodeEnvironmentLayoutBake,
  encodeEnvironmentLayoutBake
} from "../../src/world/EnvironmentLayoutBake";
import {
  adoptPreparedEnvironmentLayout,
  createWorldEnvironmentLayout,
  createWorldStaticPlacements,
  prepareWorldEnvironmentLayout,
  type EnvironmentAssetPlacement
} from "../../src/world/WorldEnvironmentLayout";
import { WORLD_LAYOUT_V5 } from "../../src/world/WorldLayout";

const revision = WORLD_LAYOUT_V5.revision;

function placement(id: string, extra: Partial<EnvironmentAssetPlacement> = {}): EnvironmentAssetPlacement {
  return { id, origin: "authored", assetId: "rock_field_a", x: 1.25, z: -3.5, rotationY: 0.1, scale: [1, 1, 1], ...extra };
}

describe("environment layout bake", () => {
  it("reproduces the live new-game layout exactly, explicit undefined fields included", async () => {
    const live = await prepareWorldEnvironmentLayout(NEW_GAME_WORLD_SEED);
    const decoded = decodeEnvironmentLayoutBake(
      encodeEnvironmentLayoutBake(live, revision),
      { layoutRevision: revision, worldSeed: NEW_GAME_WORLD_SEED }
    );
    expect(decoded.staticPlacements.length).toBe(live.staticPlacements.length);
    expect(decoded.groundCoverPlacements.length).toBe(live.groundCoverPlacements.length);
    // toStrictEqual distinguishes a key set to undefined from a missing key.
    expect(decoded.staticPlacements).toStrictEqual(live.staticPlacements);
    expect(decoded.groundCoverPlacements).toStrictEqual(live.groundCoverPlacements);
  }, 240_000);

  it("rejects a bake for another format, layout revision or world seed", () => {
    const text = encodeEnvironmentLayoutBake(
      { worldSeed: 7, staticPlacements: [placement("a")], groundCoverPlacements: [] },
      revision
    );
    expect(() => decodeEnvironmentLayoutBake(text, { layoutRevision: revision, worldSeed: 8 })).toThrow("seed 7");
    expect(() => decodeEnvironmentLayoutBake(text, { layoutRevision: revision + 1, worldSeed: 7 })).toThrow("layout");
    const wrongFormat = JSON.stringify({ ...JSON.parse(text), format: 99 });
    expect(() => decodeEnvironmentLayoutBake(wrongFormat, { layoutRevision: revision, worldSeed: 7 })).toThrow("format");
  });

  it("restores top-level undefined fields and refuses data JSON cannot carry", () => {
    const withUndefined = placement("u", { grounding: undefined });
    const decoded = decodeEnvironmentLayoutBake(
      encodeEnvironmentLayoutBake({ worldSeed: 7, staticPlacements: [withUndefined], groundCoverPlacements: [] }, revision),
      { layoutRevision: revision, worldSeed: 7 }
    );
    expect(Object.hasOwn(decoded.staticPlacements[0], "grounding")).toBe(true);
    expect(decoded.staticPlacements).toStrictEqual([withUndefined]);
    expect(() => encodeEnvironmentLayoutBake(
      { worldSeed: 7, staticPlacements: [placement("n", { x: Number.NaN })], groundCoverPlacements: [] }, revision
    )).toThrow("finite");
    expect(() => encodeEnvironmentLayoutBake(
      { worldSeed: 7, staticPlacements: [placement("s", { scale: [1, undefined as unknown as number, 1] })], groundCoverPlacements: [] },
      revision
    )).toThrow("undefined below the placement level");
  });

  it("serves an adopted layout to every reader without generating, and never replaces a live one", () => {
    const seed = 424_242;
    const staticPlacements = [placement("adopted")];
    expect(adoptPreparedEnvironmentLayout(seed, { staticPlacements, groundCoverPlacements: [] })).toBe(true);
    expect(createWorldStaticPlacements(seed)).toBe(staticPlacements);
    expect(createWorldEnvironmentLayout(seed).staticPlacements).toBe(staticPlacements);
    expect(createWorldEnvironmentLayout(seed).groundCoverPlacements).toEqual([]);
    expect(adoptPreparedEnvironmentLayout(seed, { staticPlacements: [placement("late")], groundCoverPlacements: [] }))
      .toBe(false);
    expect(createWorldStaticPlacements(seed)).toBe(staticPlacements);
  });
});
