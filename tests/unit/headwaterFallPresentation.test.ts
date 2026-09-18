import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  HEADWATER_FALL_FRAGMENT_GLSL,
  HEADWATER_FALL_VERTEX_GLSL,
  HeadwaterFall,
  createHeadwaterFallGeometry,
  headwaterFallSheetPoint
} from "../../src/render/water/HeadwaterFall";
import {
  HEADWATER_MIST_FRAGMENT_GLSL,
  HEADWATER_MIST_VERTEX_GLSL,
  HeadwaterFallMist,
  createHeadwaterMistGeometry
} from "../../src/render/water/HeadwaterFallMist";
import { createHeadwaterUniforms } from "../../src/render/water/waveGlsl";
import { WATER_SURFACE_SHADING_GLSL } from "../../src/render/water/waterShadingGlsl";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import { NEVA_HEADWATERS, headwaterElevationAt, isInHeadwaterFallBand } from "../../src/world/NevaHeadwaters";
import { WorldLayout } from "../../src/world/WorldLayout";

const FALL = NEVA_HEADWATERS.fall;
const FALL_CONFIG = CANONICAL_RENDER_CONFIG.waterSurface.headwaters.fall;

function attributes(geometry: THREE.BufferGeometry) {
  return {
    position: geometry.getAttribute("position"),
    uv: geometry.getAttribute("uv"),
    normal: geometry.getAttribute("normal")
  };
}

describe("W07 headwater fall sheet", () => {
  it("connects exactly to the lip crest and the pool landing", () => {
    const rows = FALL_CONFIG.rows.high;
    const across = FALL_CONFIG.acrossSegments;
    const geometry = createHeadwaterFallGeometry("high");
    try {
      const { position, uv } = attributes(geometry);
      // First row: the lip station at the live lip elevation, spanning the channel.
      // Positions are float32 attributes, so compare at 4 decimals.
      expect(position.getZ(0)).toBeCloseTo(FALL.lipZ, 4);
      expect(position.getY(0)).toBeCloseTo(headwaterElevationAt(FALL.lipZ), 4);
      // Last row: the landing station at the pool's own surface.
      const lastIndex = position.count - 1;
      expect(position.getZ(lastIndex)).toBeCloseTo(FALL.landingZ, 4);
      expect(position.getY(lastIndex)).toBeCloseTo(headwaterElevationAt(FALL.landingZ), 4);
      expect(WorldLayout.riverSectionAt(FALL.landingZ).surfaceElevation)
        .toBeCloseTo(headwaterElevationAt(FALL.landingZ), 6);
      // Arc coordinates run lip -> landing so streaks can follow the sheet.
      expect(uv.getY(0)).toBe(0);
      expect(uv.getY(lastIndex)).toBe(1);
      expect(position.count).toBe((rows + 1) * (across + 1));
      // Width tracks the live channel it hands off to.
      const section = WorldLayout.riverSectionAt(FALL.lipZ);
      expect(position.getX(0)).toBeCloseTo(section.centerX - section.leftWaterWidth, 5);
      expect(position.getX(across)).toBeCloseTo(section.centerX + section.rightWaterWidth, 5);
    } finally {
      geometry.dispose();
    }
  });

  it("follows the authored ballistic nappe and lands on the live profile", () => {
    const rows = FALL_CONFIG.rows.high;
    const heights: number[] = [];
    let maximumDetach = 0;
    for (let row = 0; row <= rows; row += 1) {
      const point = headwaterFallSheetPoint(row, 0, rows, FALL_CONFIG.acrossSegments);
      heights.push(point.y);
      const profileY = headwaterElevationAt(point.z);
      const detach = point.y - profileY;
      // The sheet never sinks into the carved face; it leaves it for the
      // ballistic arc by a bounded, physically readable margin.
      expect(detach).toBeGreaterThanOrEqual(-1e-9);
      expect(detach).toBeLessThan(2.5);
      maximumDetach = Math.max(maximumDetach, detach);
    }
    // A real nappe: the middle of the drop is off the rock, not a decal.
    expect(maximumDetach).toBeGreaterThan(0.4);
    for (let index = 1; index < heights.length; index += 1) {
      expect(heights[index]).toBeLessThanOrEqual(heights[index - 1] + 1e-9);
    }
    // A near-vertical face: the drop is concentrated, not spread into a ramp.
    const drop = heights[0] - heights.at(-1)!;
    const run = FALL.landingZ - FALL.lipZ;
    expect(drop / run, "fall face grade").toBeGreaterThan(2.5);
    expect(heights[0]).toBeCloseTo(FALL.lipElevation, 6);
    expect(heights.at(-1)).toBeCloseTo(FALL.landingElevation, 6);
  });

  it("gives the falling curtain a convex cross-section that vanishes at both ends", () => {
    const rows = FALL_CONFIG.rows.high;
    const across = FALL_CONFIG.acrossSegments;
    const midRow = Math.round(rows / 2);
    const center = headwaterFallSheetPoint(midRow, across / 2, rows, across);
    const leftEdge = headwaterFallSheetPoint(midRow, 0, rows, across);
    const rightEdge = headwaterFallSheetPoint(midRow, across, rows, across);
    // The centre of the sheet pushes out past both edges along the flow.
    expect(center.z).toBeGreaterThan(leftEdge.z);
    expect(center.z).toBeGreaterThan(rightEdge.z);
    for (const row of [0, rows]) {
      const edgePoint = headwaterFallSheetPoint(row, 0, rows, across);
      const centerPoint = headwaterFallSheetPoint(row, across / 2, rows, across);
      // No bulge at the pins: the lip join and the landing stay exact.
      expect(centerPoint.z).toBeCloseTo(edgePoint.z, 8);
      expect(centerPoint.y).toBeCloseTo(edgePoint.y, 8);
    }
  });

  it("spreads toward the pool with a mid-fall waist", () => {
    const rows = FALL_CONFIG.rows.high;
    const across = FALL_CONFIG.acrossSegments;
    const halfWidth = (row: number): number => {
      const left = headwaterFallSheetPoint(row, 0, rows, across);
      const right = headwaterFallSheetPoint(row, across, rows, across);
      return (right.x - left.x) * 0.5;
    };
    const lip = halfWidth(0);
    const waist = halfWidth(Math.round(rows / 2));
    const landing = halfWidth(rows);
    expect(landing).toBeGreaterThan(lip);
    expect(waist).toBeLessThan(lip);
  });

  it("covers the authored band exactly, with no gap or overlap", () => {
    // The base water discards inside the band and the sheet spans the band, so
    // the two surfaces must share the same two boundary stations.
    const band = createHeadwaterUniforms().uHeadwaterFallBand.value as Float32Array;
    expect(band[0]).toBeCloseTo(FALL.lipZ, 4);
    expect(band[1]).toBeCloseTo(FALL.landingZ, 4);
    expect(isInHeadwaterFallBand(FALL.lipZ + 0.01)).toBe(true);
    expect(isInHeadwaterFallBand(FALL.landingZ - 0.01)).toBe(true);
    expect(isInHeadwaterFallBand(FALL.lipZ - 0.01)).toBe(false);
    expect(isInHeadwaterFallBand(FALL.landingZ + 0.01)).toBe(false);
    const geometry = createHeadwaterFallGeometry("high");
    try {
      const { position } = attributes(geometry);
      expect(position.getZ(0)).toBeCloseTo(FALL.lipZ, 4);
      expect(position.getZ(position.count - 1)).toBeCloseTo(FALL.landingZ, 4);
    } finally {
      geometry.dispose();
    }
  });

  it("excludes horizontal water inside the fall band behind a feathered edge", () => {
    expect(WATER_SURFACE_SHADING_GLSL).toContain("nevaInsideHeadwaterFallBand(worldPosition.xz)");
    expect(WATER_SURFACE_SHADING_GLSL).toContain("uHeadwaterFallBand");
    expect(WATER_SURFACE_SHADING_GLSL).toContain("discard");
  });

  it("foams the horizontal water past the landing so the plunge reads through", () => {
    // The sheet ends at the landing; without foam on the rapids below, bright
    // sheet over black rapids reads as a cutoff. The apron below shares the
    // fall's landing identity (stable XZ, downstream-stretched reach).
    expect(WATER_SURFACE_SHADING_GLSL).toContain("uHeadwaterLandingXZ");
    expect(WATER_SURFACE_SHADING_GLSL).toContain("landingReach");
    const uniforms = createHeadwaterUniforms();
    expect(uniforms.uHeadwaterLandingXZ.value[0])
      .toBeCloseTo(WorldLayout.riverCenterX(NEVA_HEADWATERS.fall.landingZ), 6);
    expect(uniforms.uHeadwaterLandingXZ.value[1])
      .toBeCloseTo(NEVA_HEADWATERS.fall.landingZ, 6);
  });

  it("advects and stretches streaks along the sheet arc instead of world Z", () => {
    // Linkage evidence: the fragment phase is driven by vArc, stretched as the
    // water accelerates, and the vertex stage derives vArc from the sheet uv.
    expect(HEADWATER_FALL_FRAGMENT_GLSL).toContain("vArc * uFallStreakScale * stretch - time * uFallStreakSpeed");
    expect(HEADWATER_FALL_VERTEX_GLSL).toContain("vArc = uv.y;");
    expect(HEADWATER_FALL_FRAGMENT_GLSL).not.toContain("rapidUv");
    expect(HEADWATER_FALL_FRAGMENT_GLSL).not.toContain("worldPosition.z - time");
  });

  it("never samples the opaque capture, so refraction cannot feed back", () => {
    for (const source of [HEADWATER_FALL_VERTEX_GLSL, HEADWATER_FALL_FRAGMENT_GLSL]) {
      // The shared declaration block names the capture uniforms, but the sheet
      // must never read them: no refraction march, no SSR, no view-space
      // reconstruction of the frame it is being drawn into.
      expect(source).not.toMatch(/texture(2D)?\(\s*uOpaque/);
      expect(source).not.toContain("oceanRaymarchSSR");
      expect(source).not.toContain("nevaViewPosition");
    }
    // The atmosphere and tone-map path still comes from the shared owner.
    expect(HEADWATER_FALL_FRAGMENT_GLSL).toContain("nevaAerialSegment");
    expect(HEADWATER_FALL_FRAGMENT_GLSL).toContain("linearToOutputTexel");
  });

  it("keeps per-tier sheets distinct and deterministic", () => {
    const low = createHeadwaterFallGeometry("low");
    const high = createHeadwaterFallGeometry("high");
    try {
      expect(low.getAttribute("position").count)
        .toBe((FALL_CONFIG.rows.low + 1) * (FALL_CONFIG.acrossSegments + 1));
      expect(high.getAttribute("position").count)
        .toBe((FALL_CONFIG.rows.high + 1) * (FALL_CONFIG.acrossSegments + 1));
      expect(FALL_CONFIG.rows.low).toBeLessThan(FALL_CONFIG.rows.medium);
      expect(FALL_CONFIG.rows.medium).toBeLessThan(FALL_CONFIG.rows.high);
      const repeat = createHeadwaterFallGeometry("high");
      try {
        expect(Array.from(repeat.getAttribute("position").array))
          .toEqual(Array.from(high.getAttribute("position").array));
      } finally {
        repeat.dispose();
      }
    } finally {
      low.dispose();
      high.dispose();
    }
  });

  it("bounds the displaced sheet for culling", () => {
    const geometry = createHeadwaterFallGeometry("medium");
    try {
      const { position } = attributes(geometry);
      const points: THREE.Vector3[] = [];
      for (let index = 0; index < position.count; index += 1) {
        points.push(new THREE.Vector3().fromBufferAttribute(position, index));
      }
      const sphere = geometry.boundingSphere!;
      const farthest = Math.max(...points.map((point) => point.distanceTo(sphere.center)));
      expect(sphere.radius).toBeGreaterThanOrEqual(farthest + FALL_CONFIG.rippleMeters - 1e-6);
    } finally {
      geometry.dispose();
    }
  });

  it("uses per-vertex sheet normals rather than a horizontal water normal", () => {
    const geometry = createHeadwaterFallGeometry("high");
    try {
      const { normal } = attributes(geometry);
      let min = 1;
      let max = -1;
      for (let index = 0; index < normal.count; index += 1) {
        const value = new THREE.Vector3().fromBufferAttribute(normal, index);
        expect(value.length()).toBeCloseTo(1, 5);
        min = Math.min(min, value.y);
        max = Math.max(max, value.y);
      }
      // A vertical sheet leans across the frame; a horizontal water normal
      // would keep every vertex at y = 1.
      expect(min).toBeLessThan(0.9);
      expect(max).toBeGreaterThan(min);
    } finally {
      geometry.dispose();
    }
  });

  it("shares the water material's uniforms and disposes its own resources", () => {
    const shared = {
      uTime: { value: 0 },
      uReducedMotion: { value: 0 }
    } as unknown as Record<string, THREE.IUniform>;
    const fall = new HeadwaterFall({ sharedUniforms: shared });
    try {
      expect(fall.mesh.material.uniforms.uTime).toBe(shared.uTime);
      expect(fall.mesh.material.uniforms.uReducedMotion).toBe(shared.uReducedMotion);
      expect(fall.mist.mesh.material.uniforms.uTime).toBe(shared.uTime);
      expect(fall.mist.mesh.material.uniforms.uReducedMotion).toBe(shared.uReducedMotion);
      expect(fall.group.name).toBe("headwater_fall");
      expect(fall.group.children).toContain(fall.mesh);
      expect(fall.group.children).toContain(fall.mist.group);
      expect(fall.mesh.renderOrder).toBeGreaterThan(CANONICAL_RENDER_CONFIG.waterSurface.quality.high.nearPatch ? -100 : -101);
      fall.setQuality("low");
      expect(fall.segments.rows).toBe(FALL_CONFIG.rows.low);
      expect(fall.mist.count).toBe(FALL_CONFIG.mist.count.low);
      fall.setQuality("high");
      expect(fall.segments.rows).toBe(FALL_CONFIG.rows.high);
      expect(fall.mist.count).toBe(FALL_CONFIG.mist.count.high);
    } finally {
      fall.dispose();
    }
    expect(fall.group.children).toHaveLength(0);
  });
});

describe("W07 plunge-pool spray", () => {
  it("places every puff deterministically from the tier count", () => {
    for (const tier of ["low", "medium", "high"] as const) {
      const geometry = createHeadwaterMistGeometry(tier);
      try {
        const expected = FALL_CONFIG.mist.count[tier] * 6;
        expect(geometry.getAttribute("position").count).toBe(expected);
        expect(geometry.getAttribute("aCorner").count).toBe(expected);
        expect(geometry.getAttribute("aSeed").count).toBe(expected);
        const repeat = createHeadwaterMistGeometry(tier);
        try {
          expect(Array.from(repeat.getAttribute("position").array))
            .toEqual(Array.from(geometry.getAttribute("position").array));
        } finally {
          repeat.dispose();
        }
      } finally {
        geometry.dispose();
      }
    }
    expect(HEADWATER_MIST_VERTEX_GLSL).not.toContain("Math.random");
    expect(HEADWATER_MIST_FRAGMENT_GLSL).not.toContain("Math.random");
  });

  it("boils up around the authored landing and never samples the capture", () => {
    const landingX = WorldLayout.riverCenterX(NEVA_HEADWATERS.fall.landingZ);
    const landingZ = NEVA_HEADWATERS.fall.landingZ;
    const geometry = createHeadwaterMistGeometry("high");
    try {
      const position = geometry.getAttribute("position");
      for (let index = 0; index < position.count; index += 1) {
        const x = position.getX(index);
        const y = position.getY(index);
        const z = position.getZ(index);
        expect(Math.hypot(x - landingX, z - landingZ))
          .toBeLessThanOrEqual(FALL_CONFIG.mist.spreadMeters + 1.4);
        expect(y).toBeGreaterThanOrEqual(headwaterElevationAt(landingZ) - 1e-6);
      }
    } finally {
      geometry.dispose();
    }
    for (const source of [HEADWATER_MIST_VERTEX_GLSL, HEADWATER_MIST_FRAGMENT_GLSL]) {
      expect(source).not.toMatch(/texture(2D)?\(\s*uOpaque/);
      expect(source).not.toContain("oceanRaymarchSSR");
    }
    expect(HEADWATER_MIST_FRAGMENT_GLSL).toContain("nevaAerialSegment");
    expect(HEADWATER_MIST_FRAGMENT_GLSL).toContain("linearToOutputTexel");
  });

  it("owns its geometry and material and clears its group on dispose", () => {
    const shared = { uTime: { value: 0 } } as unknown as Record<string, THREE.IUniform>;
    const mist = new HeadwaterFallMist({ sharedUniforms: shared, tier: "high" });
    expect(mist.mesh.material.uniforms.uTime).toBe(shared.uTime);
    expect(mist.mesh.renderOrder).toBeGreaterThan(-100);
    expect(mist.mesh.material.depthWrite).toBe(false);
    const geometry = mist.mesh.geometry;
    mist.setQuality("low");
    expect(mist.count).toBe(FALL_CONFIG.mist.count.low);
    expect(mist.mesh.geometry).not.toBe(geometry);
    mist.dispose();
    expect(mist.group.children).toHaveLength(0);
  });
});
