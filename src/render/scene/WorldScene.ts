// src/render/scene/WorldScene.ts

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import { FacetedWater } from "../water/FacetedWater";
import { AssetLoader } from "../loaders/AssetLoader";
import { Simulation } from "../../simulation/Simulation";
import { PaletteMaterials } from "../materials/PaletteMaterials";
import { PALETTE_HEX } from "../materials/PaletteTokens";
import { ASSET_IDS, type AssetId } from "../assets/AssetCatalog";
import type { CropStage } from "../../simulation/core/types";
import type { GameState } from "../../simulation/core/types";
import { WorldLayout } from "../../world/WorldLayout";
import { AnimationController, type PlayerAnimation } from "../animation/AnimationController";
import { LightingRig } from "../lighting/LightingRig";

const WHEAT_STAGE_ASSET: Record<CropStage, AssetId> = {
  seeded: ASSET_IDS.CROP_WHEAT_SEEDED,
  sprout: ASSET_IDS.CROP_WHEAT_SPROUT,
  growing: ASSET_IDS.CROP_WHEAT_GROWING,
  mature: ASSET_IDS.CROP_WHEAT_MATURE,
  overripe: ASSET_IDS.CROP_WHEAT_OVERRIPE,
  withered: ASSET_IDS.CROP_WHEAT_WITHERED
};

export class WorldScene {
  public scene: THREE.Scene;
  public renderer: THREE.WebGLRenderer;
  public water: FacetedWater;
  public sunLight: THREE.DirectionalLight;
  public hemiLight: THREE.HemisphereLight;
  private readonly lightingRig: LightingRig;

  private playerMesh: THREE.Group | null = null;
  private boatMeshes: Map<string, THREE.Group> = new Map();
  private cropMeshes: Map<string, THREE.Group> = new Map();
  private schoolEffects: Map<string, THREE.Group> = new Map();
  private environmentGroup: THREE.Group = new THREE.Group();
  private staticPrefabGroup: THREE.Group = new THREE.Group();
  private lastPlayerPosition: THREE.Vector2 | null = null;
  private playerAnimation: AnimationController | null = null;
  private lastPresentationTime = 0;
  private prefersReducedMotion: boolean = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private skyMaterial: THREE.ShaderMaterial | null = null;
  private sunDisc: THREE.Sprite | null = null;
  private playerContactShadow: THREE.Mesh | null = null;
  private windmillRotor: THREE.Group | null = null;
  private cloudMeshes: Array<{ object: THREE.Group; origin: THREE.Vector3 }> = [];
  private syncInFlight: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CANONICAL_RENDER_CONFIG.skyFill.skyColorHex);
    this.scene.fog = new THREE.Fog(
      new THREE.Color(CANONICAL_RENDER_CONFIG.fog.colorHex),
      CANONICAL_RENDER_CONFIG.fog.near,
      CANONICAL_RENDER_CONFIG.fog.far
    );

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.outputColorSpace = CANONICAL_RENDER_CONFIG.outputColorSpace;
    this.renderer.toneMapping = CANONICAL_RENDER_CONFIG.toneMapping;
    this.renderer.toneMappingExposure = CANONICAL_RENDER_CONFIG.exposure;
    this.lightingRig = new LightingRig(this.scene, this.renderer);
    this.sunLight = this.lightingRig.sun;
    this.hemiLight = this.lightingRig.skyFill;

    // 2. Sky and faceted animated water
    this.buildSky();
    this.water = new FacetedWater({ width: 350, depth: 350, segmentsX: 64, segmentsZ: 64 });
    this.water.mesh.position.set(0, -0.2, 80);
    this.scene.add(this.water.mesh);

    // 3. Build World Geometry
    this.scene.add(this.environmentGroup);
    this.environmentGroup.add(this.staticPrefabGroup);
    this.buildWorldTerrain();
    this.buildPlayerContactShadow();
    this.buildStarterFarmDetails();
    this.buildRouteDetails();
    this.populateStaticPrefabs();
  }

  private buildSky(): void {
    const skyGeometry = new THREE.SphereGeometry(245, 24, 12);
    this.skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(PALETTE_HEX.sky_pale_01) },
        horizonColor: { value: new THREE.Color(PALETTE_HEX.horizon_warm_01) }
      },
      vertexShader: `
        varying vec3 vWorldDirection;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        varying vec3 vWorldDirection;
        void main() {
          // The gameplay camera looks slightly down, so the visible sky occupies
          // a narrow band around the geometric horizon rather than the dome apex.
          float height = smoothstep(-0.16, 0.10, vWorldDirection.y);
          vec3 color = mix(horizonColor, topColor, height);
          gl_FragColor = vec4(color, 1.0);
        }
      `
    });
    this.scene.add(new THREE.Mesh(skyGeometry, this.skyMaterial));
    const sunMaterial = new THREE.SpriteMaterial({
      color: PALETTE_HEX.emissive_window_01,
      transparent: true,
      opacity: 0.56,
      depthWrite: false,
      fog: false
    });
    this.sunDisc = new THREE.Sprite(sunMaterial);
    this.sunDisc.scale.set(15, 15, 1);
    this.sunDisc.renderOrder = -1;
    this.scene.add(this.sunDisc);
  }

  private buildPlayerContactShadow(): void {
    if (!this.lightingRig.contactShadowsEnabled()) return;
    const geometry = new THREE.CircleGeometry(1, 20);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: PALETTE_HEX.foliage_shadow_01,
      transparent: true,
      opacity: CANONICAL_RENDER_CONFIG.contact.opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1
    });
    this.playerContactShadow = new THREE.Mesh(geometry, material);
    this.playerContactShadow.scale.set(
      CANONICAL_RENDER_CONFIG.contact.playerRadius,
      1,
      CANONICAL_RENDER_CONFIG.contact.playerRadius * 0.68
    );
    this.playerContactShadow.renderOrder = 1;
    this.scene.add(this.playerContactShadow);
  }

  /**
   * Generates continuous faceted low-poly terrain mesh with village, farmstead, riverbed, and coast.
   */
  private buildWorldTerrain(): void {
    const layoutGeometry = WorldLayout.buildTerrainGeometry();
    const layoutTerrain = new THREE.Mesh(
      layoutGeometry,
      PaletteMaterials.standard("grass_yellow_01", { vertexColors: true, flatShading: true, roughness: 0.92 })
    );
    layoutTerrain.receiveShadow = true;
    this.environmentGroup.add(layoutTerrain);
  }

  private buildStarterFarmDetails(): void {
    const soilMaterial = PaletteMaterials.standard("soil_warm_01", {
      roughness: 0.96,
      flatShading: true
    });
    for (let index = 0; index < 6; index++) {
      const x = -4.0 + index * 1.6;
      const groundHeight = this.sampleTerrainHeight(x, 0) ?? 0.2;
      const furrow = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 7.4), soilMaterial);
      furrow.name = `starter_farm_furrow_${index}`;
      furrow.position.set(x, groundHeight + 0.05, 0);
      furrow.rotation.y = index % 2 === 0 ? 0.012 : -0.012;
      furrow.castShadow = true;
      furrow.receiveShadow = true;
      this.environmentGroup.add(furrow);
    }
  }

  private buildRouteDetails(): void {
    const stoneGeometries: THREE.BufferGeometry[] = [];
    const routeSegments = [
      { start: new THREE.Vector2(7.0, -3.0), end: new THREE.Vector2(-9.0, 3.2), count: 15 },
      { start: new THREE.Vector2(-8.0, 7.0), end: new THREE.Vector2(18.0, 34.0), count: 22 }
    ];

    for (const route of routeSegments) {
      const direction = route.end.clone().sub(route.start);
      const routeAngle = Math.atan2(direction.x, direction.y);
      for (let index = 0; index < route.count; index++) {
        const progress = index / Math.max(1, route.count - 1);
        const lateral = Math.sin(index * 2.17) * 0.38;
        const x = THREE.MathUtils.lerp(route.start.x, route.end.x, progress) + Math.cos(routeAngle) * lateral;
        const z = THREE.MathUtils.lerp(route.start.y, route.end.y, progress) - Math.sin(routeAngle) * lateral;
        const groundHeight = this.sampleTerrainHeight(x, z) ?? 0.2;
        const width = 0.82 + ((index * 7) % 5) * 0.09;
        const depth = 0.50 + ((index * 11) % 4) * 0.08;
        const stone = new THREE.BoxGeometry(width, 0.07, depth);
        stone.rotateY(routeAngle + Math.sin(index * 1.31) * 0.16);
        stone.translate(x, groundHeight + 0.045, z);
        stoneGeometries.push(stone);
      }
    }

    const mergedStones = mergeGeometries(stoneGeometries, false);
    for (const geometry of stoneGeometries) geometry.dispose();
    if (!mergedStones) return;

    const path = new THREE.Mesh(
      mergedStones,
      PaletteMaterials.standard("stone_golden_01", { roughness: 0.96, flatShading: true })
    );
    path.name = "farm_harbor_stepping_path";
    path.receiveShadow = true;
    this.environmentGroup.add(path);
  }

  private placeLandmark(object: THREE.Object3D, id: Parameters<typeof WorldLayout.landmark>[0]): void {
    const layout = WorldLayout.landmark(id);
    object.position.set(
      layout.x,
      WorldLayout.terrainHeight(layout.x, layout.z) + layout.yOffset,
      layout.z
    );
    object.rotation.y = layout.rotationY;
    object.scale.setScalar(layout.scale);
  }

  private setShadowPolicy(root: THREE.Object3D, castShadow: boolean): void {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = castShadow;
      object.receiveShadow = true;
    });
  }

  private configureWindmillRotor(windmill: THREE.Group): void {
    windmill.updateMatrixWorld(true);
    const hub = windmill.getObjectByName("windmill_hub");
    if (!hub) return;
    const pivot = new THREE.Group();
    pivot.name = "windmill_runtime_rotor";
    pivot.position.copy(windmill.worldToLocal(hub.getWorldPosition(new THREE.Vector3())));
    windmill.add(pivot);
    pivot.updateMatrixWorld(true);
    const movingParts: THREE.Object3D[] = [];
    windmill.traverse((object) => {
      if (
        object !== pivot &&
        (object.name === "windmill_hub" ||
          object.name.startsWith("windmill_spar_") ||
          object.name.startsWith("windmill_sail_"))
      ) {
        movingParts.push(object);
      }
    });
    for (const part of movingParts) pivot.attach(part);
    this.windmillRotor = pivot;
  }

  /**
   * Places prefabs (Farmhouse, Stone Bridge, Dock, Trees, Rocks, Props)
   */
  private async populateStaticPrefabs(): Promise<void> {
    const preexistingEnvironmentChildren = new Set(this.environmentGroup.children);
    // 1. Farmhouse at starter homestead
    const farmhouse = await AssetLoader.loadModel(ASSET_IDS.HOUSE_FARMHOUSE_A);
    this.placeLandmark(farmhouse, "farmhouse");
    this.environmentGroup.add(farmhouse);

    const well = await AssetLoader.loadModel(ASSET_IDS.PROP_WATER_WELL_A);
    this.placeLandmark(well, "well");
    this.environmentGroup.add(well);

    const pumpkinPatch = await AssetLoader.loadModel(ASSET_IDS.PROP_PUMPKIN_PATCH_A);
    pumpkinPatch.position.set(13.0, this.sampleTerrainHeight(13.0, -2.5) ?? 0.8, -2.5);
    pumpkinPatch.rotation.y = -0.18;
    this.environmentGroup.add(pumpkinPatch);

    // 2. Stone Bridge crossing river
    const bridge = await AssetLoader.loadModel(ASSET_IDS.BRIDGE_STONE_A);
    this.placeLandmark(bridge, "bridge");
    this.environmentGroup.add(bridge);

    // 3. Harbor Dock extending into water
    const dock = await AssetLoader.loadModel(ASSET_IDS.DOCK_STRAIGHT_A);
    this.placeLandmark(dock, "dock");
    this.environmentGroup.add(dock);

    const fishMarket = await AssetLoader.loadModel(ASSET_IDS.BUILDING_FISH_MARKET_A);
    this.placeLandmark(fishMarket, "fish-market");
    this.environmentGroup.add(fishMarket);

    // Distant working landmarks establish the same farm-to-coast depth hierarchy
    // as the reference without copying its exact diorama layout.
    const lighthouse = await AssetLoader.loadModel(ASSET_IDS.BUILDING_LIGHTHOUSE_A);
    this.placeLandmark(lighthouse, "lighthouse");
    this.environmentGroup.add(lighthouse);

    const windmill = await AssetLoader.loadModel(ASSET_IDS.BUILDING_WINDMILL_A);
    this.placeLandmark(windmill, "windmill");
    this.environmentGroup.add(windmill);
    this.configureWindmillRotor(windmill);

    // 4. Orchard Trees & Deciduous Oaks
    const treePositions = [
      { assetId: ASSET_IDS.TREE_APPLE_A, pos: [-16, 1.0, -5] },
      { assetId: ASSET_IDS.TREE_APPLE_A, pos: [-18, 1.1, -12] },
      { assetId: ASSET_IDS.TREE_OAK_A, pos: [10, 1.2, -14] },
      { assetId: ASSET_IDS.TREE_OAK_B, pos: [16, 1.5, -8] },
      { assetId: ASSET_IDS.TREE_PINE_A, pos: [40, 8.5, 12] },
      { assetId: ASSET_IDS.TREE_PINE_A, pos: [46, 9.5, 22] },
      { assetId: ASSET_IDS.TREE_OAK_A, pos: [-24, 0.8, 18] },
      { assetId: ASSET_IDS.TREE_OAK_B, pos: [8, 0.9, 12] },
      { assetId: ASSET_IDS.TREE_APPLE_A, pos: [17, 1.0, -16] },
      { assetId: ASSET_IDS.TREE_OAK_B, pos: [25, 1.0, -11] },
      { assetId: ASSET_IDS.TREE_OAK_A, pos: [-34, 1.0, 10] },
      { assetId: ASSET_IDS.TREE_OAK_B, pos: [-38, 1.0, 20] },
      { assetId: ASSET_IDS.TREE_PINE_A, pos: [34, 4.5, 28] }
    ];
    for (const tp of treePositions) {
      const tree = await AssetLoader.loadModel(tp.assetId);
      tree.position.set(tp.pos[0], WorldLayout.terrainHeight(tp.pos[0], tp.pos[2]), tp.pos[2]);
      this.environmentGroup.add(tree);
    }

    const foliagePlacements = [
      { assetId: ASSET_IDS.FOLIAGE_BUSH_A, pos: [-7.5, -7.0], rotation: 0.2 },
      { assetId: ASSET_IDS.FOLIAGE_BUSH_A, pos: [-12.5, -7.5], rotation: -0.45 },
      { assetId: ASSET_IDS.FOLIAGE_BUSH_A, pos: [6.5, 7.0], rotation: 0.8 },
      { assetId: ASSET_IDS.FOLIAGE_REEDS_A, pos: [-9.0, 2.0], rotation: 0.15 },
      { assetId: ASSET_IDS.FOLIAGE_REEDS_A, pos: [-21.0, 10.0], rotation: -0.25 },
      { assetId: ASSET_IDS.FOLIAGE_REEDS_A, pos: [17.0, 40.0], rotation: 0.4 },
      { assetId: ASSET_IDS.FOLIAGE_BUSH_A, pos: [9.0, -6.5], rotation: -0.4 },
      { assetId: ASSET_IDS.FOLIAGE_BUSH_A, pos: [14.5, 2.5], rotation: 0.55 },
      { assetId: ASSET_IDS.FOLIAGE_BUSH_A, pos: [-4.0, 8.5], rotation: 0.25 },
      { assetId: ASSET_IDS.FOLIAGE_REEDS_A, pos: [-22.0, -1.0], rotation: 0.1 },
      { assetId: ASSET_IDS.FOLIAGE_REEDS_A, pos: [-8.5, 27.0], rotation: -0.35 }
    ];
    for (const placement of foliagePlacements) {
      const foliage = await AssetLoader.loadModel(placement.assetId);
      const height = this.sampleTerrainHeight(placement.pos[0], placement.pos[1]) ?? 0;
      foliage.position.set(placement.pos[0], height, placement.pos[1]);
      foliage.rotation.y = placement.rotation;
      this.setShadowPolicy(foliage, false);
      this.environmentGroup.add(foliage);
    }

    // 5. Angular Rocks & Coastal Boulders
    const rockPositions = [
      { assetId: ASSET_IDS.ROCK_COASTAL_A, pos: [34, 0.6, 41], scale: [1.8, 1.4, 1.5] },
      { assetId: ASSET_IDS.ROCK_COASTAL_A, pos: [14, 0.1, 41], scale: [1.4, 1.2, 1.3] },
      { assetId: ASSET_IDS.ROCK_BOULDER_A, pos: [-6, 0.9, -16], scale: [1.2, 1.0, 1.1] },
      { assetId: ASSET_IDS.ROCK_FIELD_A, pos: [7, 0.9, -3], scale: [1.0, 0.8, 0.9] },
      { assetId: ASSET_IDS.ROCK_FIELD_A, pos: [-10, 0.5, 9], scale: [0.8, 0.65, 0.75] },
      { assetId: ASSET_IDS.ROCK_BOULDER_A, pos: [20, 0.6, 28], scale: [1.1, 0.9, 1.0] }
    ];
    for (const rp of rockPositions) {
      const rock = await AssetLoader.loadModel(rp.assetId);
      rock.position.set(rp.pos[0], WorldLayout.terrainHeight(rp.pos[0], rp.pos[2]), rp.pos[2]);
      rock.scale.set(rp.scale[0], rp.scale[1], rp.scale[2]);
      this.environmentGroup.add(rock);
    }

    // 6. Farm & Harbor Props (Hay bales, Crates, Barrels, Lanterns)
    const hay1 = await AssetLoader.loadModel(ASSET_IDS.PROP_HAY_BALE_A);
    hay1.position.set(-6, WorldLayout.terrainHeight(-6, -8), -8);
    this.environmentGroup.add(hay1);

    const hay2 = await AssetLoader.loadModel(ASSET_IDS.PROP_HAY_BALE_A);
    hay2.position.set(-4.8, WorldLayout.terrainHeight(-4.8, -8.2), -8.2);
    hay2.rotation.y = 0.5;
    this.environmentGroup.add(hay2);

    const lamp1 = await AssetLoader.loadModel(ASSET_IDS.PROP_LAMP_POST_A);
    lamp1.position.set(-2, WorldLayout.terrainHeight(-2, 3), 3);
    this.environmentGroup.add(lamp1);

    const lamp2 = await AssetLoader.loadModel(ASSET_IDS.PROP_LAMP_POST_A);
    lamp2.position.set(22, WorldLayout.terrainHeight(22, 38), 38);
    this.environmentGroup.add(lamp2);

    const crate1 = await AssetLoader.loadModel(ASSET_IDS.PROP_CRATE_WOOD_A);
    crate1.position.set(23, WorldLayout.terrainHeight(23, 39), 39);
    this.environmentGroup.add(crate1);

    const barrel1 = await AssetLoader.loadModel(ASSET_IDS.PROP_BARREL_WOOD_A);
    barrel1.position.set(25, WorldLayout.terrainHeight(25, 41), 41);
    this.environmentGroup.add(barrel1);

    const trap = await AssetLoader.loadModel(ASSET_IDS.PROP_LOBSTER_TRAP_A);
    trap.position.set(26.2, WorldLayout.terrainHeight(26.2, 40.2), 40.2);
    trap.rotation.y = 0.6;
    this.environmentGroup.add(trap);

    const cloudPlacements = [
      { pos: [-28, 35, 72], scale: 1.8 },
      { pos: [18, 42, 92], scale: 2.3 },
      { pos: [62, 31, 58], scale: 1.5 }
    ];
    for (const placement of cloudPlacements) {
      const cloud = await AssetLoader.loadModel(ASSET_IDS.CLOUD_LOWPOLY_A);
      cloud.position.set(placement.pos[0], placement.pos[1], placement.pos[2]);
      cloud.scale.setScalar(placement.scale);
      cloud.userData.dynamicPresentation = true;
      this.setShadowPolicy(cloud, false);
      this.environmentGroup.add(cloud);
      this.cloudMeshes.push({ object: cloud, origin: cloud.position.clone() });
    }

    // 7. Fences framing farmstead
    for (let fx = -5; fx <= 5; fx += 2) {
      const fence = await AssetLoader.loadModel(ASSET_IDS.PROP_FENCE_WOOD_A);
      const height = this.sampleTerrainHeight(fx, 5.2) ?? 0.8;
      fence.position.set(fx, height, 5.2);
      this.environmentGroup.add(fence);
    }

    for (let fx = -5; fx <= 1; fx += 2) {
      const fence = await AssetLoader.loadModel(ASSET_IDS.PROP_FENCE_WOOD_A);
      const height = this.sampleTerrainHeight(fx, -5.2) ?? 0.8;
      fence.position.set(fx, height, -5.2);
      this.environmentGroup.add(fence);
    }

    for (let fz = -3; fz <= 3; fz += 2) {
      const fence = await AssetLoader.loadModel(ASSET_IDS.PROP_FENCE_WOOD_A);
      const height = this.sampleTerrainHeight(-5.2, fz) ?? 0.8;
      fence.position.set(-5.2, height, fz);
      fence.rotation.y = Math.PI / 2;
      this.environmentGroup.add(fence);
    }

    for (const child of [...this.environmentGroup.children]) {
      if (child !== this.staticPrefabGroup && !preexistingEnvironmentChildren.has(child)) {
        this.environmentGroup.remove(child);
        this.staticPrefabGroup.add(child);
      }
    }
    this.mergeStaticPrefabMeshes();
  }

  /**
   * Static GLB clones share materials but otherwise render as hundreds of
   * independent meshes. Merge compatible meshes after placement so the scene
   * keeps the authored assets while staying inside the browser draw-call budget.
   */
  private mergeStaticPrefabMeshes(): void {
    this.staticPrefabGroup.updateMatrixWorld(true);
    const compatibleGroups = new Map<string, { material: THREE.Material; meshes: THREE.Mesh[] }>();
    this.staticPrefabGroup.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
      if ((object as THREE.SkinnedMesh).isSkinnedMesh || object.morphTargetInfluences) return;
      let ancestor: THREE.Object3D | null = object.parent;
      while (ancestor) {
        if (ancestor.name === "windmill_runtime_rotor" || ancestor.userData.dynamicPresentation) return;
        ancestor = ancestor.parent;
      }
      const attributes = (Object.entries(object.geometry.attributes) as Array<
        [string, THREE.BufferAttribute]
      >)
        .map(([name, attribute]) =>
          `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`
        )
        .sort()
        .join("|");
      const signature = `${object.material.uuid}|cast:${object.castShadow}|receive:${object.receiveShadow}|indexed:${Boolean(object.geometry.index)}|${attributes}`;
      const group = compatibleGroups.get(signature) ?? {
        material: object.material,
        meshes: [] as THREE.Mesh[]
      };
      group.meshes.push(object);
      compatibleGroups.set(signature, group);
    });

    for (const { material, meshes } of compatibleGroups.values()) {
      if (meshes.length < 2) continue;
      const uniqueGeometries = new Map<string, THREE.BufferGeometry>();
      for (const mesh of meshes) uniqueGeometries.set(mesh.geometry.uuid, mesh.geometry);
      const maxVertexCount = [...uniqueGeometries.values()].reduce(
        (sum, geometry) => sum + geometry.getAttribute("position").count,
        0
      );
      const maxIndexCount = [...uniqueGeometries.values()].reduce(
        (sum, geometry) => sum + (geometry.index?.count ?? 0),
        0
      );
      const batched = new THREE.BatchedMesh(
        meshes.length,
        maxVertexCount,
        maxIndexCount || undefined,
        material
      );
      const geometryIds = new Map<string, number>();
      for (const geometry of uniqueGeometries.values()) {
        geometryIds.set(geometry.uuid, batched.addGeometry(geometry));
      }
      for (const mesh of meshes) {
        const geometryId = geometryIds.get(mesh.geometry.uuid);
        if (geometryId === undefined) continue;
        const instanceId = batched.addInstance(geometryId);
        batched.setMatrixAt(instanceId, mesh.matrixWorld);
        mesh.parent?.remove(mesh);
      }
      batched.computeBoundingBox();
      batched.computeBoundingSphere();
      batched.castShadow = meshes[0]?.castShadow ?? true;
      batched.receiveShadow = meshes[0]?.receiveShadow ?? true;
      this.staticPrefabGroup.add(batched);
    }
  }


  /**
   * Raycast downward from (x, 50, z) against the terrain mesh.
   */
  public sampleTerrainHeight(x: number, z: number): number | null {
    return WorldLayout.terrainHeight(x, z);
  }

  /** Applies only semantic clock/weather inputs to the shared renderer baseline. */
  public updateEnvironment(
    state: Readonly<GameState>,
    timeSeconds: number,
    focus: THREE.Vector3
  ): void {
    const frame = this.lightingRig.update(state, timeSeconds, focus);
    const uniforms = this.skyMaterial?.uniforms;
    (uniforms?.topColor?.value as THREE.Color | undefined)?.copy(frame.skyTopColor);
    (uniforms?.horizonColor?.value as THREE.Color | undefined)?.copy(frame.skyHorizonColor);
    this.scene.background = frame.skyTopColor;
    if (this.sunDisc) {
      this.sunDisc.position.copy(focus).addScaledVector(frame.sunDirection, 205);
      this.sunDisc.material.opacity = THREE.MathUtils.lerp(0.28, 0.62, frame.sunIntensity / CANONICAL_RENDER_CONFIG.sun.intensity);
      this.sunDisc.material.color.copy(frame.sunColor);
    }
    this.water.updateLighting(frame);
    this.updateAmbientMotion(state, timeSeconds);
  }

  public playPlayerAction(action: PlayerAnimation): void {
    this.playerAnimation?.play(action);
  }

  private updateAmbientMotion(state: Readonly<GameState>, timeSeconds: number): void {
    const motionScale = this.prefersReducedMotion
      ? CANONICAL_RENDER_CONFIG.motion.reducedMotionScale
      : CANONICAL_RENDER_CONFIG.motion.ambientScale;
    if (this.windmillRotor) {
      const rotorSpeed = (0.18 + state.weather.windSpeed * 0.035) * motionScale;
      this.windmillRotor.rotation.z = -timeSeconds * rotorSpeed;
    }
    const windRadians = THREE.MathUtils.degToRad(state.weather.windDirectionDeg);
    const travel = ((timeSeconds * (0.12 + state.weather.windSpeed * 0.018)) % 150) - 75;
    for (const cloud of this.cloudMeshes) {
      cloud.object.position.set(
        cloud.origin.x + Math.sin(windRadians) * travel * motionScale,
        cloud.origin.y + Math.sin(timeSeconds * 0.08 + cloud.origin.x) * 0.32 * motionScale,
        cloud.origin.z + Math.cos(windRadians) * travel * motionScale
      );
    }
  }

  /**
   * Update already-loaded meshes without awaiting loads.
   */
  private applyImmediateSync(sim: Simulation, timeSeconds: number): void {
    const state = sim.getState();

    this.water.update(timeSeconds, state.weather.seaRoughness);

    if (this.playerMesh) {
      const currentPosition = new THREE.Vector2(state.player.x, state.player.z);
      const movedDistance = this.lastPlayerPosition?.distanceTo(currentPosition) ?? 0;
      const delta = this.lastPresentationTime > 0
        ? THREE.MathUtils.clamp(timeSeconds - this.lastPresentationTime, 0.001, 0.1)
        : 1 / 60;
      const speed = movedDistance / delta;
      const presentationMode = state.sportFishing
        ? "sport-fishing"
        : state.basicFishing
          ? "basic-fishing"
          : state.player.activeBoatId
            ? "boat-driving"
            : "on-foot";
      const motion = this.playerAnimation?.update(delta, presentationMode, speed, this.prefersReducedMotion) ?? {
        bobY: 0,
        leanX: 0,
        leanZ: 0
      };
      const activeBoat = state.player.activeBoatId
        ? state.boats[state.player.activeBoatId]
        : undefined;
      const boatPresentation = activeBoat
        ? this.sampleBoatPresentation(activeBoat, state, timeSeconds)
        : null;
      this.playerMesh.position.set(
        state.player.x,
        state.player.y - 0.5 + (boatPresentation?.waveHeight ?? 0) + motion.bobY,
        state.player.z
      );
      this.playerMesh.rotation.set(
        motion.leanX + (boatPresentation?.pitch ?? 0),
        state.player.rotationY,
        motion.leanZ + (boatPresentation?.roll ?? 0),
        "YXZ"
      );
      this.lastPlayerPosition = currentPosition;
      this.lastPresentationTime = timeSeconds;
      if (this.playerContactShadow) {
        this.playerContactShadow.visible = !state.player.activeBoatId;
        this.playerContactShadow.position.set(
          state.player.x,
          WorldLayout.terrainHeight(state.player.x, state.player.z) + 0.025,
          state.player.z
        );
      }
    }

    for (const [boatId, boatState] of Object.entries(state.boats)) {
      const bMesh = this.boatMeshes.get(boatId);
      if (!bMesh) continue;
      const presentation = this.sampleBoatPresentation(boatState, state, timeSeconds);
      bMesh.position.set(boatState.x, boatState.y + presentation.waveHeight, boatState.z);
      bMesh.rotation.set(presentation.pitch, boatState.headingRadians, presentation.roll, "YXZ");
    }

    // Remove harvested crops
    for (const [id, cMesh] of this.cropMeshes.entries()) {
      if (!state.crops[id]) {
        this.scene.remove(cMesh);
        this.cropMeshes.delete(id);
      }
    }
    for (const [cropId, cropState] of Object.entries(state.crops)) {
      const cMesh = this.cropMeshes.get(cropId);
      if (!cMesh) continue;
      const farm = state.farms[cropState.farmId];
      if (!farm) continue;
      const farmOriginX = farm.id === "farm.starter_garden" ? 0 : -8;
      const farmOriginZ = farm.id === "farm.starter_garden" ? 0 : -10;
      const worldX = farmOriginX + cropState.x;
      const worldZ = farmOriginZ + cropState.z;
      cMesh.position.set(worldX, WorldLayout.terrainHeight(worldX, worldZ), worldZ);
      cMesh.rotation.y = cropState.rotationRadians;
    }

    // Despawn school VFX whose school is gone
    for (const [schoolId, sGroup] of this.schoolEffects.entries()) {
      if (!state.world.activeSchools[schoolId]) {
        this.scene.remove(sGroup);
        this.schoolEffects.delete(schoolId);
      }
    }
    for (const [schoolId, school] of Object.entries(state.world.activeSchools)) {
      const sGroup = this.schoolEffects.get(schoolId);
      if (!sGroup) continue;
      sGroup.position.set(school.x, 0.05, school.z);
      sGroup.rotation.y = timeSeconds * 0.8;
      const pulseScale = 1.0 + Math.sin(timeSeconds * 3.0) * 0.15;
      sGroup.scale.set(pulseScale, 1.0, pulseScale);
    }
  }

  private sampleBoatPresentation(
    boat: GameState["boats"][string],
    state: Readonly<GameState>,
    timeSeconds: number
  ): { waveHeight: number; pitch: number; roll: number } {
    const water = this.water.sample(boat.x, boat.z, timeSeconds, state.weather.seaRoughness);
    const localNormal = water.normal
      .clone()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), -boat.headingRadians);
    return {
      waveHeight: water.height,
      pitch: Math.atan2(localNormal.z, localNormal.y),
      roll: -Math.atan2(localNormal.x, localNormal.y)
    };
  }

  private async loadMissingMeshes(sim: Simulation, timeSeconds: number): Promise<void> {
    const state = sim.getState();

    if (!this.playerMesh) {
      const mesh = await AssetLoader.loadModel(ASSET_IDS.CHAR_PLAYER_A);
      if (!this.playerMesh) {
        this.playerMesh = mesh;
        this.playerAnimation = new AnimationController(mesh);
        this.scene.add(this.playerMesh);
      }
    }

    for (const [boatId, boatState] of Object.entries(state.boats)) {
      let bMesh = this.boatMeshes.get(boatId);
      if (!bMesh) {
        const assetId =
          boatState.boatTypeId === "boat.skiff"
            ? ASSET_IDS.BOAT_SKIFF_A
            : ASSET_IDS.BOAT_ROWBOAT_A;
        bMesh = await AssetLoader.loadModel(assetId);
        if (!this.boatMeshes.has(boatId)) {
          this.scene.add(bMesh);
          this.boatMeshes.set(boatId, bMesh);
        }
      }
    }

    for (const [cropId, cropState] of Object.entries(state.crops)) {
      const assetId = WHEAT_STAGE_ASSET[cropState.stage];

      let cMesh = this.cropMeshes.get(cropId);
      if (cMesh && cMesh.userData.assetId !== assetId) {
        this.scene.remove(cMesh);
        this.cropMeshes.delete(cropId);
        cMesh = undefined;
      }

      if (!cMesh) {
        cMesh = await AssetLoader.loadModel(assetId);
        if (!this.cropMeshes.has(cropId) && state.crops[cropId]) {
          cMesh.userData.assetId = assetId;
          this.scene.add(cMesh);
          this.cropMeshes.set(cropId, cMesh);
        } else {
          continue;
        }
      }

      const farm = state.farms[cropState.farmId];
      if (!farm) continue;
      const farmOriginX = farm.id === "farm.starter_garden" ? 0 : -8;
      const farmOriginZ = farm.id === "farm.starter_garden" ? 0 : -10;
      const worldX = farmOriginX + cropState.x;
      const worldZ = farmOriginZ + cropState.z;
      cMesh.position.set(worldX, WorldLayout.terrainHeight(worldX, worldZ), worldZ);
      cMesh.rotation.y = cropState.rotationRadians;
    }

    for (const [schoolId, school] of Object.entries(state.world.activeSchools)) {
      if (this.schoolEffects.has(schoolId)) continue;
      const sGroup = new THREE.Group();
      const ringGeo = new THREE.RingGeometry(1.5, 3.5, 8);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = PaletteMaterials.standard("foam_warm_01", { transparent: true, opacity: 0.65 });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      sGroup.add(ringMesh);
      this.scene.add(sGroup);
      this.schoolEffects.set(schoolId, sGroup);
      sGroup.position.set(school.x, 0.05, school.z);
    }

    // Newly loaded meshes use the same presentation path as every later frame.
    this.applyImmediateSync(sim, timeSeconds);
  }

  /**
   * Synchronizes visual scene with authoritative Simulation state.
   */
  public async syncWithSimulation(sim: Simulation, timeSeconds: number): Promise<void> {
    this.applyImmediateSync(sim, timeSeconds);

    if (this.syncInFlight) return;
    this.syncInFlight = true;
    try {
      await this.loadMissingMeshes(sim, timeSeconds);
    } finally {
      this.syncInFlight = false;
    }
  }

  public render(camera: THREE.Camera): void {
    this.renderer.render(this.scene, camera);
  }

  public handleResize(width: number, height: number): void {
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.lightingRig.pixelRatioCap()));
  }
}
