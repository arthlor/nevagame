import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import {
  buildCompassMarkers,
  buildWorldHudDto,
  compassHeadingDegrees,
  getHeadingCardinal
} from "../../src/simulation/presentation/WorldHudPresentation";

/** The facing convention `NavigationDomain` writes: forward is (sin θ, cos θ). */
const yawToward = (dx: number, dz: number) => Math.atan2(dx, dz);

describe("compass heading", () => {
  // North is −Z (the northern ridge sits at z ≈ −175, the southern reef view at
  // z ≈ +180) and east is +X, matching the bearings the markers already use.
  it.each([
    ["N", 0, -1, 0],
    ["NE", 1, -1, 45],
    ["E", 1, 0, 90],
    ["S", 0, 1, 180],
    ["SW", -1, 1, 225],
    ["W", -1, 0, 270]
  ] as const)("reads %s when the player faces that way on the world axes", (cardinal, dx, dz, degrees) => {
    const heading = compassHeadingDegrees(yawToward(dx, dz));
    expect(heading).toBe(degrees);
    expect(getHeadingCardinal(heading)).toBe(cardinal);
  });

  it("stays within [0, 360) for any yaw", () => {
    for (let yaw = -4 * Math.PI; yaw <= 4 * Math.PI; yaw += 0.01) {
      const heading = compassHeadingDegrees(yaw);
      expect(heading).toBeGreaterThanOrEqual(0);
      expect(heading).toBeLessThan(360);
    }
  });

  it("puts a school the player walks toward dead ahead on the HUD ribbon", () => {
    const state = createInitialGameState();
    Object.assign(state.player, { x: 0, z: 0, rotationY: yawToward(50, -50) });
    state.world.activeSchools["school.ahead"] = {
      id: "school.ahead", ecologyId: "ecology.neva", habitatId: "coast", x: 50, z: -50, radius: 12,
      spawnedAtMinute: 0, expiresAtMinute: 180, remainingCatchPotential: 10,
      speciesWeights: [{ speciesId: "fish.trout", weight: 80 }]
    };
    const hud = buildWorldHudDto(state);
    expect(hud.compass.headingCardinal).toBe("NE");
    const school = buildCompassMarkers(state, hud.compass.headingDegrees).find((marker) => marker.type === "fish-school");
    expect(school?.relativeBearingDeg).toBe(0);
  });
});
