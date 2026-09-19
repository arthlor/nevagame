import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  ShadowAtlasCompositor,
  shadowAtlasStaticRefreshReason,
  type ShadowAtlasConfig
} from "../../src/render/lighting/ShadowAtlasCompositor";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";

const CONFIG: ShadowAtlasConfig = {
  enabled: true,
  staticRefreshFrames: 8,
  recenterMeters: 24,
  directionEpsilonRadians: 0.006
};

function stubRenderer(): THREE.WebGLRenderer {
  return {
    shadowMap: { autoUpdate: false, needsUpdate: false },
    getRenderTarget: () => null,
    setRenderTarget: () => undefined,
    render: () => undefined
  } as unknown as THREE.WebGLRenderer;
}

describe("shadow atlas refresh policy", () => {
  it("refreshes on first frame, age, direction change and recenter", () => {
    const base = {
      hasFrame: true,
      age: 0,
      refreshFrames: 8,
      directionDot: 1,
      directionEpsilonRadians: 0.006,
      focusDistanceMeters: 0,
      recenterMeters: 24
    };
    expect(shadowAtlasStaticRefreshReason({ ...base, hasFrame: false })).toBe("first-frame");
    expect(shadowAtlasStaticRefreshReason({ ...base, age: 8 })).toBe("age");
    expect(shadowAtlasStaticRefreshReason({ ...base, directionDot: Math.cos(0.01) })).toBe("direction");
    expect(shadowAtlasStaticRefreshReason({ ...base, focusDistanceMeters: 25 })).toBe("recenter");
    expect(shadowAtlasStaticRefreshReason(base)).toBeNull();
  });

  it("holds the cache while age, direction and focus are inside their bounds", () => {
    expect(shadowAtlasStaticRefreshReason({
      hasFrame: true,
      age: 7,
      refreshFrames: 8,
      directionDot: Math.cos(0.001),
      directionEpsilonRadians: 0.006,
      focusDistanceMeters: 23.9,
      recenterMeters: 24
    })).toBeNull();
  });
});

describe("shadow atlas caster classification", () => {
  it("splits dynamic presentation subtrees from static casters", () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial();
    const staticMesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    staticMesh.castShadow = true;
    const dynamicMesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    dynamicMesh.castShadow = true;
    dynamicMesh.userData.dynamicPresentation = true;
    const rider = new THREE.Mesh(new THREE.BoxGeometry(), material);
    rider.castShadow = true;
    dynamicMesh.add(rider);
    const nonCaster = new THREE.Mesh(new THREE.BoxGeometry(), material);
    scene.add(staticMesh, dynamicMesh, nonCaster);
    const explicit = new THREE.Group();
    const explicitMesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    explicitMesh.castShadow = true;
    explicit.add(explicitMesh);
    scene.add(explicit);

    const compositor = new ShadowAtlasCompositor(stubRenderer(), CONFIG);
    compositor.registerScene(scene);
    compositor.registerDynamicRoot(explicit);

    expect(compositor.diagnostics()).toMatchObject({
      staticCasters: 1,
      dynamicCasters: 3
    });
  });

  it("falls back to the legacy shadow path on non-PCF shadow types", () => {
    const previous = CANONICAL_RENDER_CONFIG.shadows.type;
    try {
      CANONICAL_RENDER_CONFIG.shadows.type = THREE.VSMShadowMap;
      const compositor = new ShadowAtlasCompositor(stubRenderer(), CONFIG);
      expect(compositor.diagnostics().enabled).toBe(false);
    } finally {
      CANONICAL_RENDER_CONFIG.shadows.type = previous;
    }
  });

  it("reports refresh counters starting at zero", () => {
    const compositor = new ShadowAtlasCompositor(stubRenderer(), CONFIG);
    expect(compositor.diagnostics()).toMatchObject({
      staticRefreshes: 0,
      dynamicRefreshes: 0,
      combines: 0,
      committedFocus: null
    });
  });
});
