import * as THREE from "three";
import { SunLight } from "three/addons/lights/SunLight.js";
import { WebGLShadowMap } from "three/src/renderers/webgl/WebGLShadowMap.js";
import { describe, expect, it, vi } from "vitest";
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
    capabilities: { reversedDepthBuffer: false, maxTextureSize: 4096 },
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
      CANONICAL_RENDER_CONFIG.shadows.type = { low: THREE.VSMShadowMap, medium: THREE.VSMShadowMap, high: THREE.VSMShadowMap };
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


function renderHarness(reversedDepthBuffer = false) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const light = new THREE.DirectionalLight();
  light.castShadow = true;
  light.position.set(10, 20, 10);
  light.shadow.mapSize.set(32, 32);
  const staticMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const dynamicMesh = staticMesh.clone();
  staticMesh.castShadow = dynamicMesh.castShadow = true;
  dynamicMesh.userData.dynamicPresentation = true;
  scene.add(light, light.target, staticMesh, dynamicMesh);
  const state = {
    target: null as THREE.WebGLRenderTarget | null,
    face: 0,
    level: 0,
    failCombine: false
  };
  const draws: Array<{
    target: THREE.WebGLRenderTarget;
    staticDepth: THREE.DepthTexture;
    dynamicDepth: THREE.DepthTexture;
    material: THREE.ShaderMaterial;
  }> = [];
  const nativePasses: Array<{
    staticCaster: boolean;
    dynamicCaster: boolean;
    position: number[];
    targetPosition: number[];
    supplied: THREE.RenderTarget;
    result: THREE.WebGLRenderTarget;
  }> = [];
  const disposals = new Map<THREE.RenderTarget, number>();
  const watch = (target: THREE.RenderTarget) => {
    if (disposals.has(target)) return;
    disposals.set(target, 0);
    target.addEventListener("dispose", () => disposals.set(target, disposals.get(target)! + 1));
  };
  const renderer = {
    capabilities: { reversedDepthBuffer, maxTextureSize: 4096 },
    shadowMap: { enabled: true, autoUpdate: true, needsUpdate: true, type: THREE.PCFShadowMap },
    xr: { enabled: true },
    autoClear: true,
    getRenderTarget: () => state.target,
    getActiveCubeFace: () => state.face,
    getActiveMipmapLevel: () => state.level,
    setRenderTarget: (target: THREE.WebGLRenderTarget | null, face = 0, level = 0) => {
      state.target = target;
      state.face = face;
      state.level = level;
    },
    render: (quadScene: THREE.Scene) => {
      const material = (quadScene.children[0] as THREE.Mesh).material as THREE.ShaderMaterial;
      expect(renderer.autoClear).toBe(false);
      expect(renderer.xr.enabled).toBe(false);
      expect(renderer.shadowMap.enabled).toBe(false);
      watch(state.target!);
      draws.push({
        target: state.target!,
        staticDepth: material.uniforms.uStaticDepth.value as THREE.DepthTexture,
        dynamicDepth: material.uniforms.uDynamicDepth.value as THREE.DepthTexture,
        material
      });
      if (state.failCombine) throw new Error("combine failed");
    }
  } as unknown as THREE.WebGLRenderer;
  let previousType: THREE.ShadowMapType = THREE.PCFShadowMap;
  const original = (lights: THREE.Light[]) => {
    const owner = lights.find((candidate) => candidate.castShadow) as THREE.DirectionalLight;
    const supplied = owner.shadow.map!;
    watch(supplied);
    // Model the native replacement contract on a filter transition, including
    // disposing the caller's supplied target, rather than editing private state.
    if (previousType !== renderer.shadowMap.type) {
      supplied.depthTexture?.dispose();
      supplied.depthTexture = null;
      supplied.dispose();
      const replacement = new THREE.WebGLRenderTarget(32, 32);
      replacement.depthTexture = new THREE.DepthTexture(32, 32, THREE.UnsignedIntType);
      replacement.depthTexture.compareFunction = renderer.shadowMap.type === THREE.PCFShadowMap
        ? THREE.LessEqualCompare : null;
      replacement.depthTexture.minFilter = THREE.LinearFilter;
      replacement.depthTexture.magFilter = THREE.LinearFilter;
      watch(replacement);
      owner.shadow.map = replacement;
    }
    const result = owner.shadow.map!;
    if (!(result instanceof THREE.WebGLRenderTarget)) throw new Error("Expected a native WebGL shadow target");
    nativePasses.push({
      staticCaster: staticMesh.castShadow,
      dynamicCaster: dynamicMesh.castShadow,
      position: owner.position.toArray(),
      targetPosition: owner.target.position.toArray(),
      supplied,
      result
    });
    renderer.setRenderTarget(result, 2, 3);
    renderer.shadowMap.needsUpdate = false;
    previousType = renderer.shadowMap.type;
  };
  const compositor = new ShadowAtlasCompositor(renderer, CONFIG);
  const run = (owner = light) => compositor.render(original, [owner], scene, camera);
  return { scene, camera, light, staticMesh, dynamicMesh, renderer, state, draws, nativePasses, disposals, compositor, run };
}

/** Exercises upstream culling, callbacks and traversal without a GPU. */
function nativeTraversalHarness(compareWholeScene = true) {
  const h = renderHarness();
  let issued: THREE.Object3D[] = [];
  const passes: Array<{ scene: THREE.Scene; roots: THREE.Object3D[]; drawn: THREE.Object3D[] }> = [];
  Object.assign(h.renderer, {
    state: {
      buffers: { depth: { getReversed: () => false, setTest: () => {} }, color: { setClear: () => {} } },
      setBlending: () => {}, setScissorTest: () => {}, viewport: () => {}
    },
    clear: () => {},
    renderBufferDirect: (_camera: unknown, _scene: unknown, _geometry: unknown, _material: unknown, object: THREE.Object3D) => {
      issued.push(object);
    }
  });
  const objects = { update: (object: THREE.Mesh) => object.geometry };
  const native = new WebGLShadowMap(
    h.renderer, objects as unknown as ConstructorParameters<typeof WebGLShadowMap>[1], h.renderer.capabilities
  );
  native.enabled = true;
  h.renderer.shadowMap = native;
  const original = (lights: THREE.Light[], scene: THREE.Scene, camera: THREE.Camera) => {
    let reference: THREE.Object3D[] = [];
    if (compareWholeScene) {
      issued = [];
      native.render(lights, h.scene, camera);
      reference = issued;
    }
    issued = [];
    native.render(lights, scene, camera);
    if (compareWholeScene) expect(issued).toEqual(reference);
    // The source module imports a second copy of Three's target constructor.
    // Align only that prototype with the bundled public constructor, matching
    // production identity while retaining the native replacement's fields.
    const target = (lights[0] as THREE.DirectionalLight | SunLight).shadow.map as THREE.WebGLRenderTarget | null;
    if (target?.isWebGLRenderTarget && !(target instanceof THREE.WebGLRenderTarget)) {
      Object.setPrototypeOf(target, THREE.WebGLRenderTarget.prototype);
    }
    passes.push({ scene, roots: [...scene.children], drawn: issued });
  };
  const run = (light: THREE.DirectionalLight | SunLight = h.light) => {
    h.scene.updateMatrixWorld(true);
    h.camera.updateMatrixWorld(true);
    h.compositor.render(original, [light], h.scene, h.camera);
  };
  return { ...h, passes, native, run, original };
}

describe("bounded native shadow traversal", () => {
  it("refreshes added and replaced root-owned meshes without requiring a model-load callback", () => {
    const h = nativeTraversalHarness();
    const root = new THREE.Group();
    h.scene.add(root);
    h.run();
    const original = h.staticMesh.clone();
    root.add(original);
    h.run();
    expect(h.passes.at(-2)!.drawn).toContain(original);
    const replacement = original.clone();
    root.remove(original);
    root.add(replacement);
    h.run();
    expect(h.passes.at(-2)!.drawn).toContain(replacement);
    expect(h.passes.at(-2)!.drawn).not.toContain(original);
    const added = original.clone();
    h.scene.add(added);
    h.run();
    expect(h.passes.at(-2)!.drawn).toContain(added);
    h.compositor.dispose();
  });

  it("releases root observers after removal, scene replacement and disposal", () => {
    const h = nativeTraversalHarness();
    const root = new THREE.Group();
    h.scene.add(root);
    h.run();
    h.scene.remove(root);
    const dirty = vi.spyOn(h.compositor, "markCastersDirty");
    root.add(h.staticMesh.clone());
    expect(dirty).not.toHaveBeenCalled();
    h.compositor.registerScene(new THREE.Scene());
    h.scene.add(h.staticMesh.clone());
    expect(dirty).not.toHaveBeenCalled();
    const current = new THREE.Scene();
    const currentRoot = new THREE.Group();
    current.add(currentRoot);
    h.compositor.registerScene(current);
    h.compositor.dispose();
    currentRoot.add(h.staticMesh.clone());
    current.add(h.staticMesh.clone());
    expect(dirty).not.toHaveBeenCalled();
  });

  it("matches native whole-scene draws while omitting non-caster branches and keeping parent links", () => {
    const h = nativeTraversalHarness();
    const decoration = new THREE.Group();
    for (let index = 0; index < 40; index++) decoration.add(new THREE.Object3D());
    h.scene.add(decoration);
    const child = h.staticMesh.clone();
    h.staticMesh.add(child);
    h.run();
    expect(h.passes.map(pass => pass.roots)).toEqual([[h.staticMesh], [h.dynamicMesh]]);
    expect(h.passes.map(pass => pass.drawn)).toEqual([[h.staticMesh, child], [h.dynamicMesh]]);
    expect(child.parent).toBe(h.staticMesh);
    expect(h.staticMesh.parent).toBe(h.scene);
    expect(h.scene.children).toContain(decoration);
    expect(h.passes.every(pass => pass.scene.children.length === 0)).toBe(true);
    h.compositor.dispose();
  });

  it("retains native cascade culling, mesh layers and material visibility", () => {
    const h = nativeTraversalHarness();
    const sun = new SunLight();
    sun.castShadow = true;
    sun.position.set(0.5, 1, 0.3).normalize();
    sun.shadow.mapSize.set(32, 32);
    h.scene.add(sun);
    h.camera.position.set(0, 4, 15);
    h.camera.lookAt(0, 0, 0);
    const excluded = h.staticMesh.clone();
    excluded.layers.set(1);
    const hiddenMaterial = h.staticMesh.clone();
    hiddenMaterial.material = new THREE.MeshStandardMaterial({ visible: false });
    const distant = h.staticMesh.clone();
    distant.position.set(10000, 0, 10000);
    h.scene.add(excluded, hiddenMaterial, distant);
    h.run(sun);
    expect(h.passes.some(pass => pass.drawn.includes(h.staticMesh))).toBe(true);
    expect(h.passes.some(pass => pass.drawn.includes(h.dynamicMesh))).toBe(true);
    for (const pass of h.passes) {
      expect(pass.drawn).not.toContain(excluded);
      expect(pass.drawn).not.toContain(hiddenMaterial);
      expect(pass.drawn).not.toContain(distant);
    }
    h.compositor.dispose();
  });

  it("honours hidden ancestors, removals, scene visibility and live reparenting without stale or duplicate roots", () => {
    const h = nativeTraversalHarness();
    const group = new THREE.Group();
    group.add(h.dynamicMesh);
    h.scene.add(group);
    h.run();
    group.visible = false;
    h.run();
    expect(h.passes.at(-1)!.drawn).toEqual([]);
    group.visible = true;
    const child = h.dynamicMesh.clone();
    h.scene.add(child);
    h.compositor.markCastersDirty();
    h.run();
    h.dynamicMesh.add(child);
    h.run();
    expect(h.passes.at(-1)!.roots).toEqual([h.dynamicMesh]);
    expect(h.passes.at(-1)!.drawn).toEqual([h.dynamicMesh, child]);
    group.remove(h.dynamicMesh);
    h.run();
    expect(h.passes.at(-1)!.drawn).toEqual([]);
    group.add(h.dynamicMesh);
    h.scene.visible = false;
    h.run();
    expect(h.passes.at(-1)!.drawn).toEqual([]);
    h.scene.visible = true;
    h.run();
    expect(h.passes.at(-1)!.drawn).toEqual([h.dynamicMesh, child]);
    h.compositor.dispose();
  });

  it("keeps native Line and Points casters in the correct pass", () => {
    const h = nativeTraversalHarness();
    const geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0], 3));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial());
    const points = new THREE.Points(geometry, new THREE.PointsMaterial());
    line.castShadow = points.castShadow = true;
    points.userData.dynamicPresentation = true;
    h.scene.add(line, points);
    h.run();
    expect(h.passes[0].drawn).toContain(line);
    expect(h.passes[0].drawn).not.toContain(points);
    expect(h.passes[1].drawn).toContain(points);
    expect(h.passes[1].drawn).not.toContain(line);
    h.compositor.dispose();
  });

  it("invalidates receiver-only materials through the complete source scene on native filter changes", () => {
    const h = nativeTraversalHarness(false);
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    receiver.receiveShadow = true;
    h.scene.add(receiver);
    h.run();
    for (const type of [THREE.BasicShadowMap, THREE.PCFShadowMap]) {
      const version = receiver.material.version;
      h.native.type = type;
      h.run();
      expect(receiver.material.version).toBe(version + 1);
      expect(h.passes.slice(-2).every(pass => !pass.roots.includes(receiver))).toBe(true);
    }
    h.compositor.dispose();
  });

  it("drops borrowed references and restores live state when a native pass fails", () => {
    const h = nativeTraversalHarness(false);
    const roots = [...h.scene.children];
    let borrowed: THREE.Scene | null = null;
    expect(() => h.compositor.render((_lights, scene) => {
      borrowed = scene;
      throw new Error("native shadow failed");
    }, [h.light], h.scene, h.camera)).toThrow("native shadow failed");
    expect(borrowed!.children).toEqual([]);
    expect(h.scene.children).toEqual(roots);
    expect(roots.every(root => root.parent === h.scene)).toBe(true);
    expect(h.staticMesh.castShadow && h.dynamicMesh.castShadow).toBe(true);
    h.run();
    expect(h.passes.map(pass => pass.drawn)).toEqual([[h.staticMesh], [h.dynamicMesh]]);
    h.compositor.dispose();
    expect(borrowed!.children).toEqual([]);
  });
});

describe("native-depth shadow atlas", () => {
  it("holds fitted receiver bounds with cached static depth and refreshes when a moving receiver extends them", () => {
    const h = renderHarness();
    h.staticMesh.receiveShadow = h.dynamicMesh.receiveShadow = true;
    h.dynamicMesh.position.y = 6;
    const light = new SunLight();
    light.castShadow = true;
    light.position.set(0.5, 1, 0.3).normalize();
    light.shadow.mapSize.set(32, 32);
    h.scene.add(light);
    const camera = new THREE.PerspectiveCamera(50, 1.5, 0.1, 200);
    camera.position.set(0, 8, 15);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const passMatrices: THREE.Matrix4[] = [];
    const original = () => {
      light.shadow.updateMatrices(light, camera);
      passMatrices.push(light.shadow.getMatrix(0).clone());
    };
    const run = () => {
      h.scene.updateMatrixWorld(true);
      h.compositor.render(original, [light], h.scene, camera);
    };
    run();
    const range = h.compositor.diagnostics().receiverHeightRange;
    expect(range!.max).toBeGreaterThan(6);
    h.dynamicMesh.position.y = 2;
    run();
    expect(h.compositor.diagnostics().staticRefreshes).toBe(1);
    expect(h.compositor.diagnostics().receiverHeightRange).toEqual(range);
    expect(passMatrices[2].equals(passMatrices[0])).toBe(true);
    h.dynamicMesh.position.y = 12;
    run();
    expect(h.compositor.diagnostics()).toMatchObject({ staticRefreshes: 2, lastStaticRefreshReason: "receiver-height" });
    expect(passMatrices[3].equals(passMatrices[4])).toBe(true);
    h.compositor.dispose();
  });

  it("keeps both SunLight atlas passes in the committed camera and refreshes cuts, turns and projections", () => {
    const h = renderHarness();
    const light = new SunLight();
    light.castShadow = true;
    light.position.set(0.5, 1, 0.3).normalize();
    light.shadow.mapSize.set(32, 32);
    h.scene.add(light);
    const camera = new THREE.PerspectiveCamera(50, 1.5, 0.1, 200);
    camera.position.set(0, 8, 15);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const native = light.shadow.updateMatrices;
    const matrices: number[][] = [];
    const original = () => {
      light.shadow.updateMatrices(light, camera);
      matrices.push(light.shadow.getMatrix(0).toArray());
      expect(light.shadow.map!.width).toBe(64);
      expect(light.shadow.map!.height).toBe(32);
    };
    const run = () => h.compositor.render(original, [light], h.scene, camera);
    run();
    expect(matrices[0]).toEqual(matrices[1]);
    expect(light.shadow.updateMatrices).toBe(native);
    const committed = light.shadow.getMatrix(0).clone();
    camera.position.x += 0.2;
    camera.updateMatrixWorld(true);
    run();
    expect(light.shadow.getMatrix(0).equals(committed)).toBe(true);
    expect(h.compositor.diagnostics().staticRefreshes).toBe(1);
    camera.position.x += 3;
    camera.updateMatrixWorld(true);
    run();
    expect(h.compositor.diagnostics().lastStaticRefreshReason).toBe("view-position");
    camera.rotateY(0.1);
    camera.updateMatrixWorld(true);
    run();
    expect(h.compositor.diagnostics().lastStaticRefreshReason).toBe("view-rotation");
    camera.fov = 55;
    camera.updateProjectionMatrix();
    run();
    expect(h.compositor.diagnostics()).toMatchObject({ width: 64, height: 32, cascades: 2, lastStaticRefreshReason: "view-projection" });
    h.compositor.dispose();
    expect(light.shadow.map).toBeNull();
  });

  it("renders distinct caster sets and writes raw input depths into the sampled PCF depth target", () => {
    const h = renderHarness();
    h.run();
    expect(h.nativePasses.map((pass) => [pass.staticCaster, pass.dynamicCaster])).toEqual([[true, false], [false, true]]);
    const draw = h.draws[0];
    expect(draw.staticDepth).toBe(h.nativePasses[0].result.depthTexture);
    expect(draw.dynamicDepth).toBe(h.nativePasses[1].result.depthTexture);
    for (const depth of [draw.staticDepth, draw.dynamicDepth]) {
      expect(depth.compareFunction).toBeNull();
      expect(depth.minFilter).toBe(THREE.NearestFilter);
    }
    expect(h.light.shadow.map).toBe(draw.target);
    expect(draw.target.depthTexture!.compareFunction).toBe(THREE.LessEqualCompare);
    expect(draw.target.depthTexture!.minFilter).toBe(THREE.LinearFilter);
    expect(draw.material).toMatchObject({ depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth, colorWrite: false });
    expect(draw.material.fragmentShader).toContain("gl_FragDepth = min(staticDepth, dynamicDepth)");
    expect(draw.material.uniforms.uStaticDepth.value).toBeNull();
    expect(draw.material.uniforms.uDynamicDepth.value).toBeNull();
    expect(h.renderer.autoClear).toBe(true);
    expect(h.renderer.xr.enabled).toBe(true);
    expect(h.renderer.shadowMap.enabled).toBe(true);
    expect(h.state).toMatchObject({ target: h.nativePasses[1].result, face: 2, level: 3 });
    expect(h.staticMesh.castShadow && h.dynamicMesh.castShadow).toBe(true);
    h.compositor.dispose();
  });

  it("holds the committed light frame while refreshing moving casters every frame", () => {
    const h = renderHarness();
    h.run();
    h.light.position.x += 10;
    h.light.target.position.x += 10;
    h.run();
    expect(h.nativePasses).toHaveLength(3);
    expect(h.nativePasses[2]).toMatchObject({ staticCaster: false, dynamicCaster: true, position: [10, 20, 10], targetPosition: [0, 0, 0] });
    expect(h.light.position.x).toBe(20);
    expect(h.light.target.position.x).toBe(10);
    expect(h.compositor.diagnostics()).toMatchObject({ staticRefreshes: 1, dynamicRefreshes: 2, combines: 2, committedFocus: { x: 0, y: 0, z: 0 } });
    h.compositor.dispose();
  });

  it("adopts native replacement maps on Basic/PCF transitions without sampling comparisons as raw depth", () => {
    const h = renderHarness();
    h.run();
    for (const type of [THREE.BasicShadowMap, THREE.PCFShadowMap]) {
      h.renderer.shadowMap.type = type;
      h.run();
      const [staticPass, dynamicPass] = h.nativePasses.slice(-2);
      expect(staticPass.result).not.toBe(staticPass.supplied);
      expect(h.disposals.get(staticPass.supplied)).toBe(1);
      expect(staticPass.result.depthTexture!.compareFunction).toBeNull();
      expect(staticPass.result.depthTexture!.minFilter).toBe(THREE.NearestFilter);
      expect(h.draws.at(-1)!.staticDepth).toBe(staticPass.result.depthTexture);
      expect(h.draws.at(-1)!.dynamicDepth).toBe(dynamicPass.result.depthTexture);
      expect(h.light.shadow.map!.depthTexture!.compareFunction).toBe(type === THREE.PCFShadowMap ? THREE.LessEqualCompare : null);
      expect(h.light.shadow.map!.depthTexture!.minFilter).toBe(type === THREE.PCFShadowMap ? THREE.LinearFilter : THREE.NearestFilter);
    }
    h.compositor.dispose();
    expect([...h.disposals.values()]).toEqual([...h.disposals.values()].map(() => 1));
  });

  it("invalidates and detaches maps across a sun/moon ownership change", () => {
    const h = renderHarness();
    h.run();
    const oldTargets = [...h.disposals.keys()];
    const moon = new THREE.DirectionalLight();
    moon.castShadow = true;
    moon.position.set(-10, 20, -10);
    moon.shadow.mapSize.set(32, 32);
    h.scene.add(moon, moon.target);
    h.run(moon);
    expect(h.light.shadow.map).toBeNull();
    expect(oldTargets.map((target) => h.disposals.get(target))).toEqual([1, 1, 1]);
    expect(h.compositor.diagnostics()).toMatchObject({ staticRefreshes: 2, lastStaticRefreshReason: "first-frame" });
    expect(moon.shadow.map).toBe(h.draws.at(-1)!.target);
    h.compositor.dispose();
    expect(moon.shadow.map).toBeNull();
  });

  it("releases quality-invalidated maps once and rebuilds a complete first frame", () => {
    const h = renderHarness();
    h.run();
    const targets = [...h.disposals.keys()];
    h.compositor.invalidate();
    expect(h.light.shadow.map).toBeNull();
    expect(targets.map((target) => h.disposals.get(target))).toEqual([1, 1, 1]);
    h.run();
    expect(h.compositor.diagnostics().staticRefreshes).toBe(2);
    h.compositor.dispose();
    expect([...h.disposals.values()].every((count) => count === 1)).toBe(true);
  });

  it("restores renderer, caster and live-light state after a combine failure and retries static depth", () => {
    const h = renderHarness();
    h.state.failCombine = true;
    expect(() => h.run()).toThrow("combine failed");
    expect(h.staticMesh.castShadow && h.dynamicMesh.castShadow).toBe(true);
    expect(h.light.position.toArray()).toEqual([10, 20, 10]);
    expect(h.renderer).toMatchObject({ autoClear: true, xr: { enabled: true }, shadowMap: { enabled: true, needsUpdate: true } });
    expect(h.state).toMatchObject({ target: h.nativePasses[1].result, face: 2, level: 3 });
    expect(h.draws[0].material.uniforms.uStaticDepth.value).toBeNull();
    expect(h.compositor.diagnostics().committedFocus).toBeNull();
    h.state.failCombine = false;
    h.run();
    expect(h.compositor.diagnostics()).toMatchObject({ staticRefreshes: 2, dynamicRefreshes: 2, combines: 1 });
    h.compositor.dispose();
  });

  it("uses the nearer maximum and reversed comparison when reversed depth is active", () => {
    const h = renderHarness(true);
    h.run();
    expect(h.draws[0].material.defines.USE_REVERSED_DEPTH).toBe(1);
    expect(h.draws[0].material.fragmentShader).toContain("gl_FragDepth = max(staticDepth, dynamicDepth)");
    expect(h.light.shadow.map!.depthTexture!.compareFunction).toBe(THREE.GreaterEqualCompare);
    h.compositor.dispose();
  });
});
