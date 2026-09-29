import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import { createBrookSurface } from "../../src/render/water/BrookSurface";
import { mainlandBrookCourses } from "../../src/world/MainlandBrooks";

describe("brook sea mouths", () => {
  it("fades a sea outlet over a longer run than a lake outlet", () => {
    const config = CANONICAL_RENDER_CONFIG.waterSurface.brooks;
    expect(config.seaMouthFadeMeters).toBeGreaterThan(config.mouthFadeMeters);
    expect(config.seaMouthSpread).toBeGreaterThan(config.mouthSpread);

    const courses = mainlandBrookCourses();
    const sea = courses.find((course) => course.outlet === "sea");
    const lake = courses.find((course) => course.outlet === "lake");
    if (!sea || !lake) throw new Error("Missing a sea or lake brook");
    const mesh = createBrookSurface({ value: 0 });
    const position = mesh.geometry.getAttribute("position");
    const flow = mesh.geometry.getAttribute("brookFlow");
    const feature = mesh.geometry.getAttribute("brookFeature");
    expect(feature.itemSize).toBe(4);

    const alphaNear = (x: number, z: number): number => {
      let best = Number.POSITIVE_INFINITY;
      let alpha = 0;
      for (let index = 0; index < position.count; index++) {
        const distance = Math.hypot(position.getX(index) - x, position.getZ(index) - z);
        if (distance < best) {
          best = distance;
          alpha = flow.getW(index);
        }
      }
      return alpha;
    };
    const upstream = (
      knots: readonly (readonly [number, number, number, number])[],
      metres: number
    ): { x: number; z: number } => {
      let remaining = metres;
      for (let index = knots.length - 1; index > 0; index--) {
        const here = knots[index];
        const previous = knots[index - 1];
        const span = Math.hypot(here[0] - previous[0], here[1] - previous[1]);
        if (span >= remaining) {
          const t = remaining / Math.max(span, 1e-4);
          return { x: here[0] + (previous[0] - here[0]) * t, z: here[1] + (previous[1] - here[1]) * t };
        }
        remaining -= span;
      }
      return { x: knots[0][0], z: knots[0][1] };
    };

    const seaMouth = sea.knots[sea.knots.length - 1];
    const seaNear = upstream(sea.knots, 3);
    const seaFar = upstream(sea.knots, 24);
    const lakeFar = upstream(lake.knots, 10);
    expect(alphaNear(seaFar.x, seaFar.z)).toBeGreaterThan(alphaNear(seaMouth[0], seaMouth[1]));
    expect(alphaNear(lakeFar.x, lakeFar.z)).toBeGreaterThan(alphaNear(seaNear.x, seaNear.z));

    let seaTint = 0;
    const mouth = { x: seaMouth[0], z: seaMouth[1] };
    for (let index = 0; index < position.count; index++) {
      if (Math.hypot(position.getX(index) - mouth.x, position.getZ(index) - mouth.z) < 4) {
        seaTint = Math.max(seaTint, feature.getW(index));
      }
    }
    expect(seaTint).toBeGreaterThan(0.2);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }, 60000);
});
