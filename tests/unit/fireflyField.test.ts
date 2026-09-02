import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import {
  buildFireflyInstances,
  fireflyCountAtQuality,
  fireflyNightVisibility,
  FireflyField
} from "../../src/render/effects/FireflyField";
import { WorldLayout } from "../../src/world/WorldLayout";

describe("FireflyField", () => {
  it("builds a deterministic dry-land field with a stable point prefix", () => {
    const first = buildFireflyInstances(24);
    const second = buildFireflyInstances(24);

    expect(first).toEqual(second);
    expect(first).toHaveLength(24);
    expect(first.every((instance) =>
      WorldLayout.isWalkable(instance.x, instance.z)
      && !WorldLayout.isWater(instance.x, instance.z)
      && !WorldLayout.isInterior(instance.x, instance.z)
    )).toBe(true);
  });

  it("smoothly gates fireflies toward night", () => {
    expect(fireflyNightVisibility(1)).toBe(0);
    expect(fireflyNightVisibility(0)).toBe(1);
    expect(fireflyNightVisibility(CANONICAL_RENDER_CONFIG.fireflies.nightStartAmbient)).toBeCloseTo(0, 6);
    expect(fireflyNightVisibility(CANONICAL_RENDER_CONFIG.fireflies.nightFullAmbient)).toBeCloseTo(1, 6);
  });

  it("uses the quality prefix and hides during the day", () => {
    expect(buildFireflyInstances()).toHaveLength(CANONICAL_RENDER_CONFIG.quality.high.fireflyCount);
    const field = new FireflyField("high");
    const points = field.group.getObjectByName("ambient_firefly_points") as THREE.Points;

    field.update({
      focus: new THREE.Vector3(-65, 0, -60),
      timeSeconds: 10,
      nightVisibility: 1,
      reducedMotion: false
    });
    expect(field.group.visible).toBe(true);
    expect(points.geometry.drawRange.count).toBe(fireflyCountAtQuality(2));

    field.setQualityLevel(0);
    field.update({
      focus: new THREE.Vector3(-65, 0, -60),
      timeSeconds: 10,
      nightVisibility: 0,
      reducedMotion: false
    });
    expect(field.group.visible).toBe(false);
    expect(points.geometry.drawRange.count).toBe(fireflyCountAtQuality(0));
    field.dispose();
  });
});
