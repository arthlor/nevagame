import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import "./styles.css";
import { CANONICAL_RENDER_CONFIG } from "../render/config/VisualRenderConfig";
import {
  ASSET_BY_ID,
  ASSET_CATALOG,
  type AssetId,
  type RuntimeAssetSpec
} from "../render/assets/AssetCatalog";
import { AssetLoader } from "../render/loaders/AssetLoader";
import { LightingRig } from "../render/lighting/LightingRig";
import { PaletteMaterials } from "../render/materials/PaletteMaterials";
import { PALETTE_HEX } from "../render/materials/PaletteTokens";
import { HumanoidAnimator, type PlayerAnimation } from "../render/animation/AnimationController";
import { resolveHumanoidRig } from "../render/animation/HumanoidRig";
import { alignEquipmentHands, alignMarkerHand, alignSupportFeet, applyEquipmentSocketPose, createCarryCradle, fishingClipUsesRod, rowboatOarRotation } from "../render/animation/CharacterEquipment";
import { sampleAttachmentCurve } from "../render/animation/PlayerAttachmentTransition";
import { characterPreviewContext, clipLoops, displayedClipTime } from "./characterPreview";
import { FishingRodBend } from "../render/fishing/FishingRodBend";
import type { GameState, WeatherState, WeatherTag } from "../simulation/core/types";
import { resolveArtYardAssetId, syncArtYardAssetUrl } from "./urlState";

interface YardAssetMetrics {
  id: string;
  file: string;
  family: string;
  inputHash: string | null;
  cacheHit: boolean | null;
  fileHash: string | null;
  semanticHash: string | null;
  triangles: number | null;
  packagedTriangles: number | null;
  bytes: number | null;
  qualityStatus: string | null;
  lodLevels: Array<{ node: string; distanceMeters: number; triangles?: number; ratio?: number }> | null;
}

interface YardData {
  version: number;
  source: string;
  generatedAt: string | null;
  assets: YardAssetMetrics[];
}

interface MaterialSnapshot {
  original: THREE.Material | THREE.Material[];
  replacement: THREE.Material | THREE.Material[];
}

interface FloatingActor {
  object: THREE.Object3D;
  baseY: number;
  phase: number;
  rollAmplitude: number;
  pitchAmplitude: number;
}

interface AnimationContextPreviewSpec {
  assetId: AssetId | null;
  anchorName: string | null;
  companionClip: string | null;
  baseClip: string | null;
  pelvisContact: boolean;
  transition: "enter" | "exit" | null;
  side: -1 | 1;
}

interface DetectedSocket {
  name: string;
  object: THREE.Object3D;
  parentName: string;
}

// Elements - Core Stage
const yardApp = requiredElement<HTMLElement>("yard-app");
const canvas = requiredElement<HTMLCanvasElement>("yard-canvas");
const status = requiredElement<HTMLDivElement>("yard-status");
const toast = requiredElement<HTMLDivElement>("yard-toast");
const hudAssetBadge = requiredElement<HTMLElement>("hud-asset-badge");
const hudViewBadge = requiredElement<HTMLElement>("hud-view-badge");
const hudDimsBadge = requiredElement<HTMLElement>("hud-dims-badge");
const hudTrisBadge = requiredElement<HTMLElement>("hud-tris-badge");

// Elements - Viewport Toolbar
const camFitBtn = requiredElement<HTMLButtonElement>("cam-fit-btn");
const camEyeBtn = requiredElement<HTMLButtonElement>("cam-eye-btn");
const originAxesBtn = requiredElement<HTMLButtonElement>("origin-axes-btn");
const helpBtn = requiredElement<HTMLButtonElement>("help-btn");
const togglePanelBtn = requiredElement<HTMLButtonElement>("toggle-panel-btn");

// Elements - Panel Header & Navigation
const copyLinkBtn = requiredElement<HTMLButtonElement>("copy-link-btn");
const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".panel-tab-nav .tab-btn"));
const tabPanes = Array.from(document.querySelectorAll<HTMLElement>(".tab-pane"));

// Elements - Catalog Tab
const assetSearch = requiredElement<HTMLInputElement>("asset-search");
const familyFilter = requiredElement<HTMLSelectElement>("family-filter");
const assetSelect = requiredElement<HTMLSelectElement>("asset-select");
const assetCountBadge = requiredElement<HTMLSpanElement>("asset-count-badge");
const prevAssetBtn = requiredElement<HTMLButtonElement>("prev-asset-btn");
const nextAssetBtn = requiredElement<HTMLButtonElement>("next-asset-btn");
const copyAssetIdBtn = requiredElement<HTMLButtonElement>("copy-asset-id-btn");
const categoryChips = Array.from(document.querySelectorAll<HTMLButtonElement>("#category-chips .chip"));

// Elements - Inspect Tab
const dimWhdVal = requiredElement<HTMLElement>("dim-whd-val");
const dimClearanceVal = requiredElement<HTMLElement>("dim-clearance-val");
const dimFootprintVal = requiredElement<HTMLElement>("dim-footprint-val");
const shadingSelect = requiredElement<HTMLSelectElement>("shading-select");
const boundsToggle = requiredElement<HTMLInputElement>("bounds-toggle");
const socketsToggle = requiredElement<HTMLInputElement>("sockets-toggle");
const skeletonToggle = requiredElement<HTMLInputElement>("skeleton-toggle");
const originToggle = requiredElement<HTMLInputElement>("origin-toggle");
const collisionToggle = requiredElement<HTMLInputElement>("collision-toggle");
const shadowsToggle = requiredElement<HTMLInputElement>("shadows-toggle");
const socketsList = requiredElement<HTMLElement>("sockets-list");
const socketsCountBadge = requiredElement<HTMLElement>("sockets-count-badge");
const socketsEmptyMsg = requiredElement<HTMLElement>("sockets-empty-msg");

// Elements - Animation Tab
const noAnimMsg = requiredElement<HTMLElement>("no-anim-msg");
const animationSection = requiredElement<HTMLElement>("animation-section");
const clipSelect = requiredElement<HTMLSelectElement>("clip-select");
const animationModeSelect = requiredElement<HTMLSelectElement>("animation-mode-select");
const animationContextSelect = requiredElement<HTMLSelectElement>("animation-context-select");
const animPlayToggle = requiredElement<HTMLButtonElement>("anim-play-toggle");
const animStepFrameBackBtn = requiredElement<HTMLButtonElement>("anim-step-frame-back-btn");
const animStepBackBtn = requiredElement<HTMLButtonElement>("anim-step-back-btn");
const animStepFwdBtn = requiredElement<HTMLButtonElement>("anim-step-fwd-btn");
const animStepFrameFwdBtn = requiredElement<HTMLButtonElement>("anim-step-frame-fwd-btn");
const animSpeed = requiredElement<HTMLSelectElement>("anim-speed");
const animLoopToggle = requiredElement<HTMLInputElement>("anim-loop-toggle");
const animScrubber = requiredElement<HTMLInputElement>("anim-scrubber");
const animTimeOutput = requiredElement<HTMLOutputElement>("anim-time-output");
const socketPropSelect = requiredElement<HTMLSelectElement>("socket-prop-select");

// Elements - Environment Tab
const timeRange = requiredElement<HTMLInputElement>("time-range");
const timeOutput = requiredElement<HTMLOutputElement>("time-output");
const azimuthRange = requiredElement<HTMLInputElement>("azimuth-range");
const azimuthOutput = requiredElement<HTMLOutputElement>("azimuth-output");
const weatherSelect = requiredElement<HTMLSelectElement>("weather-select");
const groundSelect = requiredElement<HTMLSelectElement>("ground-select");
const waterToggle = requiredElement<HTMLInputElement>("water-toggle");
const distanceRange = requiredElement<HTMLInputElement>("distance-range");
const distanceOutput = requiredElement<HTMLOutputElement>("distance-output");
const turntableToggle = requiredElement<HTMLInputElement>("turntable-toggle");
const turntableSpeed = requiredElement<HTMLInputElement>("turntable-speed");

// Elements - Metrics Tab
const stageInput = requiredElement<HTMLInputElement>("stage-input");
const stageApply = requiredElement<HTMLButtonElement>("stage-apply");
const sourceBadge = requiredElement<HTMLSpanElement>("source-badge");
const metricsList = requiredElement<HTMLDListElement>("metrics-list");

// Elements - Shortcuts Modal
const shortcutsModal = requiredElement<HTMLDialogElement>("shortcuts-modal");
const closeShortcutsBtn = requiredElement<HTMLButtonElement>("close-shortcuts-btn");

// Three.js Core Setup
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance"
});
renderer.outputColorSpace = CANONICAL_RENDER_CONFIG.outputColorSpace;
renderer.toneMapping = CANONICAL_RENDER_CONFIG.toneMapping;
renderer.toneMappingExposure = CANONICAL_RENDER_CONFIG.exposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = CANONICAL_RENDER_CONFIG.shadows.type;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(
  new THREE.Color(CANONICAL_RENDER_CONFIG.fog.colorHex),
  CANONICAL_RENDER_CONFIG.fog.near,
  CANONICAL_RENDER_CONFIG.fog.far
);

const camera = new THREE.PerspectiveCamera(36, 1, 0.02, 500);
camera.position.set(22, 14, 26);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.25;
controls.maxDistance = 240;
controls.target.set(0, 1, 0);

const lightingRig = new LightingRig(scene, renderer);

// Ground Bed
const groundGeometry = new THREE.PlaneGeometry(240, 240, 32, 32);
const groundMaterials = {
  grass: PaletteMaterials.standard("grass_yellow_01", { roughness: 0.92, flatShading: true }),
  sand: PaletteMaterials.standard("sand_warm_01", { roughness: 0.94, flatShading: true }),
  rock: PaletteMaterials.standard("rock_coastal_dark_01", { roughness: 0.85, flatShading: true }),
  grid: new THREE.MeshStandardMaterial({
    color: 0x1c282e,
    roughness: 0.9,
    metalness: 0.05,
    wireframe: true
  })
};

const ground = new THREE.Mesh(groundGeometry, groundMaterials.grass);
ground.name = "art_yard_ground";
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const groundRing = new THREE.Mesh(
  new THREE.RingGeometry(0.25, 0.28, 32),
  new THREE.MeshBasicMaterial({
    color: PALETTE_HEX.accent_teal_01,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide
  })
);
groundRing.rotation.x = -Math.PI / 2;
groundRing.position.y = 0.006;
scene.add(groundRing);

// Coastal Faceted Water Plane
const waterGeometry = new THREE.PlaneGeometry(240, 240, 48, 48);
const waterMaterial = PaletteMaterials.standard("water_shallow_01", {
  roughness: 0.28,
  metalness: 0.12,
  flatShading: true,
  transparent: true,
  opacity: 0.88
});
const waterPlane = new THREE.Mesh(waterGeometry, waterMaterial);
waterPlane.name = "art_yard_water";
waterPlane.rotation.x = -Math.PI / 2;
waterPlane.position.y = 0.02;
waterPlane.visible = false;
scene.add(waterPlane);

// Origin XYZ Axes Tripod
let originAxes: THREE.AxesHelper | null = null;

// Sockets Visualizer & Skeleton Helper State
let socketsOverlay: THREE.Group | null = null;
let skeletonHelper: THREE.SkeletonHelper | null = null;
const tempWorldVec = new THREE.Vector3();
const tempWorldQuat = new THREE.Quaternion();

// State
let floatingActors: FloatingActor[] = [];
let currentModel: THREE.Group | null = null;
let currentSpec: RuntimeAssetSpec | null = null;
let currentMetrics: YardAssetMetrics | null = null;
let currentLod: THREE.LOD | null = null;
let collisionOverlay: THREE.Group | null = null;
let boundsHelper: THREE.Box3Helper | null = null;
let diagnosticSnapshots = new Map<THREE.Mesh, MaterialSnapshot>();
let collisionSnapshots = new Map<THREE.Mesh, MaterialSnapshot>();
let loadSerial = 0;
let elapsedSeconds = 0;
let yardData: YardData | null = null;
let activeShowcaseTitle: string | null = null;
let activeFamilyFilter = "all";
let toastTimeout: ReturnType<typeof setTimeout> | null = null;

// Animation State
let animationMixer: THREE.AnimationMixer | null = null;
let runtimeAnimator: HumanoidAnimator | null = null;
let activeAction: THREE.AnimationAction | null = null;
let currentClipDuration = 0;
let isAnimationPlaying = true;
let isScrubbing = false;
let attachedSocketProp: THREE.Object3D | null = null;
let previewRod: FishingRodBend | null = null;
let previewEquipmentElapsed = 0;
let socketPropSerial = 0;
let contextPreviewRoot: THREE.Group | null = null;
let contextPreviewMixer: THREE.AnimationMixer | null = null;
let contextPreviewAction: THREE.AnimationAction | null = null;
let contextPreviewAnchor: THREE.Object3D | null = null;
let activeContextPreviewSpec: AnimationContextPreviewSpec | null = null;
let contextOars: Array<{ side: "left" | "right"; pivot: THREE.Group; grip: THREE.Object3D }> = [];
let contextPlayerPelvis: THREE.Object3D | null = null;
let contextPreviewSerial = 0;
const contextLeftFootTarget = new THREE.Vector3();
const contextOarEuler = new THREE.Euler();
let previousFrameMilliseconds: number | null = null;
let previousAnimationMilliseconds: number | null = null;
let animationPlaybackSpeed = Number(animSpeed.value);

function usesRuntimePreview(): boolean {
  return animationModeSelect.value === "runtime" && runtimeAnimator !== null;
}

function selectedAnimationTime(): number {
  return usesRuntimePreview() ? runtimeAnimator!.previewPhase() * currentClipDuration : activeAction?.time ?? 0;
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Art yard is missing #${id}`);
  return element as T;
}

function setStatus(message = ""): void {
  status.textContent = message;
  status.hidden = !message;
}

function showToast(message: string): void {
  if (toastTimeout) clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

function formatTime(minute: number): string {
  const hour = Math.floor(minute / 60) % 24;
  const minutes = minute % 60;
  return `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function currentMinute(): number {
  return Number(timeRange.value);
}

function currentWeather(): WeatherTag {
  return weatherSelect.value as WeatherTag;
}

function previewState(): Pick<GameState, "clock" | "weather" | "worldSeed"> {
  const weather = currentWeather();
  const isStorm = weather === "storm";
  const isFog = weather === "fog";
  const azimuth = Number(azimuthRange.value);
  const weatherState: WeatherState = {
    type: weather,
    windDirectionDeg: azimuth,
    windSpeed: isStorm ? 12 : 3,
    precipitation: isStorm ? 0.65 : 0,
    cloudCover: isStorm ? 0.88 : isFog ? 0.42 : 0.12,
    seaRoughness: isStorm ? 0.82 : 0.12,
    visibility: isStorm ? 0.58 : isFog ? 0.34 : 1,
    temperatureC: 20,
    nextWeatherMinute: currentMinute() + 60,
    nextWeatherType: "cloudy"
  };
  return {
    worldSeed: 42891,
    clock: {
      currentMinute: currentMinute(),
      minutesPerRealSecond: 1,
      dayCount: 12,
      season: "summer",
      year: 1,
      timeOfDay: currentMinute() < 300 || currentMinute() > 1200 ? "night" : "day",
      isPaused: false
    },
    weather: weatherState
  };
}

function meshTriangleCount(root: THREE.Object3D): number {
  let triangles = 0;
  root.traverse((object) => {
    if (!object.visible || !object.userData || object.name.startsWith("COL_")) return;
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry.getAttribute("position");
    const index = mesh.geometry.getIndex();
    triangles += Math.floor((index?.count ?? position?.count ?? 0) / 3);
  });
  return triangles;
}

function findRuntimeLod(root: THREE.Object3D): THREE.LOD | null {
  let found: THREE.LOD | null = null;
  root.traverse((object) => {
    if (!found && (object as THREE.LOD).isLOD) found = object as THREE.LOD;
  });
  return found;
}

function visibleBounds(root: THREE.Object3D): THREE.Box3 {
  const bounds = new THREE.Box3();
  root.traverse((object) => {
    if (!object.visible || object.name.startsWith("COL_") || object.name.startsWith("socket_marker_")) return;
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    bounds.expandByObject(mesh, true);
  });
  return bounds;
}

function inspectionRoot(): THREE.Group | null {
  return contextPreviewRoot ?? currentModel;
}

function fitModel(root: THREE.Group): void {
  root.updateMatrixWorld(true);
  const bounds = visibleBounds(root);
  if (bounds.isEmpty()) return;
  const center = bounds.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= bounds.min.y;
  root.updateMatrixWorld(true);

  const fittedBounds = visibleBounds(root);
  const size = fittedBounds.getSize(new THREE.Vector3());
  const target = fittedBounds.getCenter(new THREE.Vector3());
  controls.target.set(0, Math.max(0.35, target.y), 0);
  const direction = new THREE.Vector3(0.72, 0.42, 0.9).normalize();
  const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * camera.aspect);
  const distance = Math.max(1.8, size.length() * 0.55 / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov)));
  camera.position.copy(controls.target).addScaledVector(direction, distance);
  distanceRange.value = String(Math.round(Math.min(80, Math.max(1, distance))));
  updateDistanceLabel();
  document.querySelectorAll("[data-cam]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-cam") === "three-quarter");
  });
  camEyeBtn.classList.remove("active");
  hudViewBadge.textContent = `${cameraAngleLabel("three-quarter")} · ${distanceRange.value}m`;
  controls.update();
  updateBoundingBoxOverlay();
  updateDimensions();
}

function focusContextActor(actor: THREE.Group, minimumDistance: number): void {
  actor.updateMatrixWorld(true);
  const bounds = visibleBounds(actor);
  if (bounds.isEmpty()) return;
  const size = bounds.getSize(new THREE.Vector3());
  controls.target.copy(bounds.getCenter(new THREE.Vector3()));
  const distance = Math.max(minimumDistance, Math.max(size.x, size.y, size.z) * 1.8);
  const direction = new THREE.Vector3(0.72, 0.42, 0.9).normalize();
  camera.position.copy(controls.target).addScaledVector(direction, distance);
  distanceRange.value = String(Math.round(Math.min(80, Math.max(1, distance))));
  updateDistanceLabel();
  camEyeBtn.classList.remove("active");
  hudViewBadge.textContent = `${cameraAngleLabel("three-quarter")} · ${distanceRange.value}m`;
  controls.update();
}

function setCameraAngle(angle: string): void {
  if (!currentModel) return;
  const distance = Number(distanceRange.value);
  let direction = new THREE.Vector3(0, 0, 1);
  switch (angle) {
    case "front":
      direction.set(0, 0.15, 1).normalize();
      break;
    case "rear":
      direction.set(0, 0.15, -1).normalize();
      break;
    case "side":
      direction.set(1, 0.15, 0).normalize();
      break;
    case "three-quarter":
      direction.set(0.72, 0.42, 0.9).normalize();
      break;
    case "top":
      direction.set(0.001, 1, 0.001).normalize();
      break;
  }
  camera.position.copy(controls.target).addScaledVector(direction, distance);
  controls.update();

  document.querySelectorAll("[data-cam]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-cam") === angle);
  });
  camEyeBtn.classList.remove("active");
  hudViewBadge.textContent = `${cameraAngleLabel(angle)} · ${distance}m`;
}

function setEyeLevelCamera(): void {
  if (!currentModel) return;
  controls.target.set(0, 1.3, 0);
  camera.position.set(0, 1.6, 3.2);
  controls.update();

  distanceRange.value = "3";
  updateDistanceLabel();
  document.querySelectorAll("[data-cam]").forEach((btn) => btn.classList.remove("active"));
  camEyeBtn.classList.add("active");
  hudViewBadge.textContent = "Eye · 1.6m";
}

function cameraAngleLabel(angle: string): string {
  switch (angle) {
    case "three-quarter":
      return "3/4";
    case "front":
      return "Front";
    case "side":
      return "Side";
    case "rear":
      return "Rear";
    case "top":
      return "Top";
    case "eye":
      return "Eye";
    default:
      return angle;
  }
}

function updateCameraDistance(): void {
  if (!currentModel) return;
  const distance = Number(distanceRange.value);
  const direction = camera.position.clone().sub(controls.target).normalize();
  camera.position.copy(controls.target).addScaledVector(direction, distance);
  controls.update();
  hudViewBadge.textContent = `${distance}m`;
}

function updateDistanceLabel(): void {
  distanceOutput.value = `${Number(distanceRange.value)} m`;
  distanceOutput.textContent = distanceOutput.value;
}

function updateTimeLabel(): void {
  timeOutput.value = formatTime(currentMinute());
  timeOutput.textContent = timeOutput.value;
}

function updateAzimuthLabel(): void {
  azimuthOutput.value = `${Number(azimuthRange.value)}°`;
  azimuthOutput.textContent = azimuthOutput.value;
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  for (const entry of Array.isArray(material) ? material : [material]) entry.dispose();
}

function restoreDiagnosticSnapshots(): void {
  for (const [mesh, snapshot] of diagnosticSnapshots) {
    mesh.material = snapshot.original;
    disposeMaterial(snapshot.replacement);
  }
  diagnosticSnapshots.clear();
}

function cloneWireframeMaterial(material: THREE.Material): THREE.Material {
  const replacement = material.clone() as THREE.Material & { wireframe?: boolean };
  if ("wireframe" in replacement) replacement.wireframe = true;
  replacement.needsUpdate = true;
  return replacement;
}

function updateShadingMode(mode: string): void {
  if (!currentModel) return;
  restoreDiagnosticSnapshots();

  if (mode === "lod0" && currentLod) {
    currentLod.levels.forEach((l, idx) => (l.object.visible = idx === 0));
    return;
  }
  if (mode === "lod1" && currentLod) {
    currentLod.levels.forEach((l, idx) => (l.object.visible = idx === Math.min(1, currentLod!.levels.length - 1)));
    return;
  }
  if (currentLod) {
    currentLod.update(camera);
  }

  if (mode === "lit") return;

  currentModel.traverse((object) => {
    if (object.name.startsWith("COL_") || object.name.startsWith("socket_marker_")) return;
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const original = mesh.material;
    let replacement: THREE.Material | THREE.Material[];

    if (mode === "unlit") {
      const firstMat = Array.isArray(original) ? original[0] : original;
      const stdMat = firstMat as THREE.MeshStandardMaterial;
      replacement = new THREE.MeshBasicMaterial({
        color: stdMat.color ? stdMat.color.clone() : new THREE.Color(0xffffff),
        map: stdMat.map ?? null,
        vertexColors: mesh.geometry.hasAttribute("color")
      });
    } else if (mode === "wireframe_overlay") {
      replacement = Array.isArray(original)
        ? original.map((mat) => cloneWireframeMaterial(mat))
        : cloneWireframeMaterial(original);
    } else if (mode === "wireframe_pure") {
      replacement = new THREE.MeshBasicMaterial({ color: 0x72c5cd, wireframe: true });
    } else if (mode === "vertex_colors") {
      replacement = new THREE.MeshBasicMaterial({ vertexColors: true });
    } else if (mode === "normals") {
      replacement = new THREE.MeshNormalMaterial({ flatShading: false });
    } else {
      return;
    }

    mesh.material = replacement;
    diagnosticSnapshots.set(mesh, { original, replacement });
  });
}

function restoreCollisionSnapshots(): void {
  for (const [mesh, snapshot] of collisionSnapshots) {
    mesh.material = snapshot.original;
    mesh.visible = false;
    disposeMaterial(snapshot.replacement);
  }
  collisionSnapshots.clear();
}

function showExportedCollision(enabled: boolean): void {
  if (!currentModel) return;
  if (!enabled) {
    restoreCollisionSnapshots();
    return;
  }
  currentModel.traverse((object) => {
    if (!object.name.startsWith("COL_")) return;
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || collisionSnapshots.has(mesh)) return;
    const original = mesh.material;
    const replacement = new THREE.MeshBasicMaterial({
      color: 0xe46d58,
      wireframe: true,
      transparent: true,
      opacity: 0.82,
      depthTest: false,
      depthWrite: false
    });
    mesh.material = replacement;
    mesh.visible = true;
    mesh.renderOrder = 20;
    collisionSnapshots.set(mesh, { original, replacement });
  });
}

function disposeCollisionOverlay(): void {
  if (!collisionOverlay) return;
  collisionOverlay.traverse((object) => {
    const line = object as THREE.LineSegments;
    if (line.isLineSegments) {
      line.geometry.dispose();
      disposeMaterial(line.material);
    }
  });
  collisionOverlay.removeFromParent();
  collisionOverlay = null;
}

function showCatalogCollision(enabled: boolean): void {
  if (!currentModel || !currentSpec) return;
  if (!enabled) {
    disposeCollisionOverlay();
    return;
  }
  if (collisionOverlay) return;
  collisionOverlay = new THREE.Group();
  collisionOverlay.name = "catalog_collision_primitives";
  for (const primitive of currentSpec.collisionPrimitives ?? []) {
    const geometry = new THREE.BoxGeometry(
      primitive.halfExtents[0] * 2,
      primitive.halfExtents[1] * 2,
      primitive.halfExtents[2] * 2
    );
    const line = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({
        color: 0xf0c46e,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false
      })
    );
    geometry.dispose();
    line.name = `COL_CATALOG_${primitive.id}`;
    line.position.set(...primitive.center);
    line.rotation.y = THREE.MathUtils.degToRad(primitive.yawDegrees ?? 0);
    line.renderOrder = 21;
    collisionOverlay.add(line);
  }
  currentModel.add(collisionOverlay);
}

function setCollision(enabled: boolean): void {
  showExportedCollision(enabled);
  showCatalogCollision(enabled);
}

function updateBoundingBoxOverlay(): void {
  if (boundsHelper) {
    boundsHelper.removeFromParent();
    boundsHelper.dispose();
    boundsHelper = null;
  }
  const root = inspectionRoot();
  if (!boundsToggle.checked || !root) return;
  const box = visibleBounds(root);
  if (box.isEmpty()) return;
  boundsHelper = new THREE.Box3Helper(box, new THREE.Color(0xd59b45));
  boundsHelper.renderOrder = 30;
  scene.add(boundsHelper);
}

function updateDimensions(): void {
  const root = inspectionRoot();
  if (!root) {
    dimWhdVal.textContent = "—";
    dimClearanceVal.textContent = "—";
    dimFootprintVal.textContent = "—";
    hudDimsBadge.textContent = "—";
    return;
  }
  const box = visibleBounds(root);
  if (box.isEmpty()) {
    dimWhdVal.textContent = "—";
    dimClearanceVal.textContent = "—";
    dimFootprintVal.textContent = "—";
    hudDimsBadge.textContent = "—";
    return;
  }
  const size = box.getSize(new THREE.Vector3());
  const clearance = box.min.y;
  const footprint = size.x * size.z;

  const whdStr = `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m`;
  dimWhdVal.textContent = whdStr;
  dimClearanceVal.textContent = `${clearance >= 0 ? "+" : ""}${clearance.toFixed(2)} m`;
  dimFootprintVal.textContent = `${footprint.toFixed(2)} m²`;
  hudDimsBadge.textContent = whdStr;
}

// Sockets Detection & Visualization
function detectSockets(root: THREE.Object3D): DetectedSocket[] {
  const sockets: DetectedSocket[] = [];
  const visited = new Set<string>();
  root.traverse((obj) => {
    if (obj.name.startsWith("COL_") || obj.name.startsWith("socket_marker_") || obj.name.startsWith("yard_context_")) return;
    const lower = obj.name.toLowerCase();
    const isSocket =
      lower.includes("socket") ||
      lower.includes("oarlock") ||
      lower.includes("grip") ||
      lower.includes("station") ||
      lower.includes("seat") ||
      lower.includes("anchor");
    if (isSocket && !visited.has(obj.name)) {
      visited.add(obj.name);
      sockets.push({
        name: obj.name,
        object: obj,
        parentName: obj.parent?.name || "root"
      });
    }
  });
  return sockets.sort((a, b) => a.name.localeCompare(b.name));
}

function disposeSocketsOverlay(): void {
  if (!socketsOverlay) return;
  socketsOverlay.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry.dispose();
      disposeMaterial(mesh.material);
    }
  });
  socketsOverlay.removeFromParent();
  socketsOverlay = null;
}

function updateSocketsOverlay(): void {
  disposeSocketsOverlay();
  const root = inspectionRoot();
  if (!socketsToggle.checked || !root) return;

  const sockets = detectSockets(root);
  socketsOverlay = new THREE.Group();
  socketsOverlay.name = "sockets_overlay_group";

  for (const socket of sockets) {
    const marker = new THREE.Group();
    marker.name = `socket_marker_${socket.name}`;

    const axes = new THREE.AxesHelper(0.18);
    (axes.material as THREE.Material).depthTest = false;
    axes.renderOrder = 35;
    marker.add(axes);

    const dotGeo = new THREE.SphereGeometry(0.024, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x72c5cd, depthTest: false });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.renderOrder = 36;
    marker.add(dot);

    marker.userData = { targetSocket: socket.object };
    socketsOverlay.add(marker);
  }

  scene.add(socketsOverlay);
}

function updateSocketsList(): void {
  socketsList.replaceChildren();
  const root = inspectionRoot();
  if (!root) {
    socketsCountBadge.textContent = "0";
    socketsEmptyMsg.style.display = "block";
    return;
  }
  const sockets = detectSockets(root);
  socketsCountBadge.textContent = String(sockets.length);
  socketsEmptyMsg.style.display = sockets.length === 0 ? "block" : "none";

  for (const socket of sockets) {
    const item = document.createElement("div");
    item.className = "socket-item";
    item.title = `Click to focus camera on ${socket.name} (${socket.parentName})`;

    const nameSpan = document.createElement("span");
    nameSpan.className = "socket-item-name";
    nameSpan.textContent = socket.name;

    const posSpan = document.createElement("span");
    posSpan.className = "socket-item-pos";
    const p = socket.object.position;
    posSpan.textContent = `${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`;

    item.append(nameSpan, posSpan);
    item.addEventListener("click", () => {
      const worldPos = new THREE.Vector3();
      socket.object.getWorldPosition(worldPos);
      controls.target.copy(worldPos);
      controls.update();
      showToast(`Focused: ${socket.name}`);
    });
    socketsList.append(item);
  }
}

// Skeleton Helper
function hasSkinnedMesh(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((obj) => {
    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) found = true;
  });
  return found;
}

function disposeSkeletonHelper(): void {
  if (skeletonHelper) {
    skeletonHelper.removeFromParent();
    skeletonHelper.dispose();
    skeletonHelper = null;
  }
}

function updateSkeletonHelper(): void {
  disposeSkeletonHelper();
  const root = currentModel;
  if (!skeletonToggle.checked || !root) return;

  if (!hasSkinnedMesh(root)) {
    skeletonToggle.checked = false;
    showToast("No skeletal rig on this asset");
    return;
  }

  skeletonHelper = new THREE.SkeletonHelper(root);
  skeletonHelper.renderOrder = 32;
  scene.add(skeletonHelper);
}

// Origin Axes
function setOriginAxes(enabled: boolean): void {
  if (!originAxes) {
    originAxes = new THREE.AxesHelper(1.6);
    originAxes.renderOrder = 15;
    scene.add(originAxes);
  }
  originAxes.visible = enabled;
  originToggle.checked = enabled;
  originAxesBtn.classList.toggle("active", enabled);
}

function updateShadowPolicies(enabled: boolean): void {
  const root = inspectionRoot();
  if (!root) return;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && !object.name.startsWith("COL_") && !object.name.startsWith("socket_marker_")) {
      mesh.castShadow = enabled;
      mesh.receiveShadow = enabled;
    }
  });
}

function updateGroundBed(kind: string): void {
  if (kind === "none") {
    ground.visible = false;
    groundRing.visible = false;
  } else {
    ground.visible = true;
    groundRing.visible = true;
    if (kind in groundMaterials) {
      ground.material = groundMaterials[kind as keyof typeof groundMaterials];
    }
  }
}

function clearModel(): void {
  socketPropSerial += 1;
  clearContextPreview(false);
  restoreDiagnosticSnapshots();
  restoreCollisionSnapshots();
  disposeCollisionOverlay();
  disposeSocketsOverlay();
  disposeSkeletonHelper();
  if (boundsHelper) {
    boundsHelper.removeFromParent();
    boundsHelper.dispose();
    boundsHelper = null;
  }
  if (animationMixer) {
    animationMixer.stopAllAction();
    animationMixer.uncacheRoot(animationMixer.getRoot());
    animationMixer = null;
  }
  activeAction = null;
  runtimeAnimator?.dispose();
  runtimeAnimator = null;
  previewRod?.dispose();
  previewRod = null;
  contextPlayerPelvis = null;
  attachedSocketProp = null;
  floatingActors = [];
  activeShowcaseTitle = null;
  if (currentModel) currentModel.removeFromParent();
  currentModel = null;
  currentSpec = null;
  currentMetrics = null;
  currentLod = null;

  updateDimensions();
  updateSocketsList();
}

function clearContextPreview(refit = true): void {
  contextPreviewSerial += 1;
  if (contextPreviewMixer) {
    contextPreviewMixer.stopAllAction();
    contextPreviewMixer.uncacheRoot(contextPreviewMixer.getRoot());
  }
  contextPreviewMixer = null;
  contextPreviewAction = null;
  contextPreviewAnchor = null;
  activeContextPreviewSpec = null;
  contextOars = [];
  if (currentModel && contextPreviewRoot) {
    currentModel.removeFromParent();
    scene.add(currentModel);
    currentModel.position.set(0, 0, 0);
    currentModel.rotation.set(0, 0, 0);
    currentModel.scale.set(1, 1, 1);
  }
  contextPreviewRoot?.removeFromParent();
  contextPreviewRoot = null;
  if (refit && currentModel) fitModel(currentModel);
}

function metricValue(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function updateMetrics(): void {
  if (!currentModel) {
    metricsList.replaceChildren();
    hudTrisBadge.textContent = "—";
    return;
  }
  const tris = meshTriangleCount(currentModel);
  hudTrisBadge.textContent = `${tris.toLocaleString("en-US")} tris`;

  if (activeShowcaseTitle) {
    const rows: Array<[string, string]> = [
      ["Showcase", activeShowcaseTitle],
      ["Total tris", tris.toLocaleString()],
      ["Lighting", formatTime(currentMinute())],
      ["Water", waterPlane.visible ? "On" : "Off"],
      ["Render Mode", shadingSelect.value]
    ];
    metricsList.replaceChildren(
      ...rows.flatMap(([label, value]) => {
        const term = document.createElement("dt");
        term.textContent = label;
        const description = document.createElement("dd");
        description.textContent = value;
        return [term, description];
      })
    );
    return;
  }
  if (!currentSpec) {
    metricsList.replaceChildren();
    return;
  }
  const level = currentLod?.getCurrentLevel() ?? 0;
  const reportLevel = currentMetrics?.lodLevels?.[level];
  const rows: Array<[string, string]> = [
    ["Family", currentSpec.family],
    ["LOD", currentLod ? `LOD${level}${reportLevel?.node ? ` · ${reportLevel.node}` : ""}` : "None"],
    ["Visible tris", tris.toLocaleString()],
    ["LOD0 tris", metricValue(currentMetrics?.triangles?.toLocaleString())],
    ["Packaged tris", metricValue(currentMetrics?.packagedTriangles?.toLocaleString())],
    ["Bytes", metricValue(currentMetrics?.bytes?.toLocaleString())],
    ["Quality Status", metricValue(currentMetrics?.qualityStatus)],
    ["Cache", currentMetrics?.cacheHit === null || currentMetrics?.cacheHit === undefined ? "Not in report" : currentMetrics.cacheHit ? "Hit" : "Miss"],
    ["Input hash", currentMetrics?.inputHash ? currentMetrics.inputHash.slice(0, 16) : "—"],
    ["File hash", currentMetrics?.fileHash ? currentMetrics.fileHash.slice(0, 16) : "—"]
  ];
  metricsList.replaceChildren(
    ...rows.flatMap(([label, value]) => {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      return [term, description];
    })
  );
}

// Tab Switching
function switchTab(tabId: string): void {
  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  tabPanes.forEach((pane) => {
    pane.classList.toggle("active", pane.id === `tab-content-${tabId}`);
  });
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tabId = btn.dataset.tab;
    if (tabId) switchTab(tabId);
  });
});

// Category Filter Chips & Asset Select
function setCategoryFilter(family: string): void {
  activeFamilyFilter = family;
  if (Array.from(familyFilter.options).some((o) => o.value === family)) {
    familyFilter.value = family;
  }
  categoryChips.forEach((chip) => {
    chip.classList.toggle("active", (chip.dataset.family ?? "all") === family);
  });
  populateAssetSelect();
}

function populateAssetSelect(): void {
  const currentVal = assetSelect.value;
  const searchTerm = assetSearch.value.trim().toLowerCase();
  const filteredAssets = ASSET_CATALOG.filter((asset) => {
    const matchesFamily = activeFamilyFilter === "all" || asset.family === activeFamilyFilter;
    const matchesSearch =
      !searchTerm ||
      asset.id.toLowerCase().includes(searchTerm) ||
      asset.family.toLowerCase().includes(searchTerm) ||
      asset.file.toLowerCase().includes(searchTerm);
    return matchesFamily && matchesSearch;
  });

  assetCountBadge.textContent = String(filteredAssets.length);

  const showcaseOptions = [
    { value: "__showcase_village", text: "Village & farmstead" },
    { value: "__showcase_architecture", text: "Architecture lineup" },
    { value: "__showcase_farm", text: "Starter homestead" },
    { value: "__showcase_harbor", text: "Fishing harbor" },
    { value: "__showcase_riverside", text: "Riverside bend" },
    { value: "__showcase_interior", text: "Farmhouse interior" }
  ];

  const showcaseGroup = document.createElement("optgroup");
  showcaseGroup.label = "Showcases";
  for (const item of showcaseOptions) {
    if (!searchTerm || item.text.toLowerCase().includes(searchTerm)) {
      const opt = document.createElement("option");
      opt.value = item.value;
      opt.textContent = item.text;
      showcaseGroup.append(opt);
    }
  }

  const families = new Map<string, RuntimeAssetSpec[]>();
  for (const asset of filteredAssets) {
    const list = families.get(asset.family) ?? [];
    list.push(asset);
    families.set(asset.family, list);
  }

  const familyGroups = [...families.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([family, assets]) => {
      const group = document.createElement("optgroup");
      group.label = `${family.charAt(0).toUpperCase()}${family.slice(1)} (${assets.length})`;
      group.append(
        ...assets.map((asset) => {
          const option = document.createElement("option");
          option.value = asset.id;
          option.textContent = asset.id;
          return option;
        })
      );
      return group;
    });

  assetSelect.replaceChildren(
    activeFamilyFilter === "all" || activeFamilyFilter === "showcase" ? showcaseGroup : document.createDocumentFragment(),
    ...familyGroups
  );

  if (currentVal && Array.from(assetSelect.options).some((o) => o.value === currentVal)) {
    assetSelect.value = currentVal;
  }
}

function navigateAsset(offset: number): void {
  const options = Array.from(assetSelect.options);
  if (!options.length) return;
  const currentIndex = options.findIndex((o) => o.value === assetSelect.value);
  let nextIndex = currentIndex + offset;
  if (nextIndex < 0) nextIndex = options.length - 1;
  if (nextIndex >= options.length) nextIndex = 0;
  assetSelect.selectedIndex = nextIndex;
  void loadAsset(assetSelect.value);
}

// Animation Studio Controller
function setupAnimationStudio(model: THREE.Group): void {
  const clips = (model.userData.animationClips as THREE.AnimationClip[] | undefined) ?? [];
  if (!clips.length) {
    animationSection.style.display = "none";
    noAnimMsg.style.display = "block";
    if (animationMixer) {
      animationMixer.stopAllAction();
      animationMixer = null;
    }
    return;
  }

  animationSection.style.display = "block";
  noAnimMsg.style.display = "none";
  animationMixer = new THREE.AnimationMixer(model);
  animationModeSelect.disabled = currentSpec?.family !== "character";
  contextPlayerPelvis = currentSpec?.family === "character" ? resolveHumanoidRig(model).bones.pelvis ?? null : null;
  runtimeAnimator = currentSpec?.family === "character" ? new HumanoidAnimator(model) : null;

  clipSelect.replaceChildren(
    ...clips.map((clip) => {
      const option = document.createElement("option");
      option.value = clip.name;
      option.textContent = `${clip.name} (${clip.duration.toFixed(2)}s)`;
      return option;
    })
  );

  const initialClip = clips.find((clip) => clip.name === "idle") ?? clips[0];
  clipSelect.value = initialClip.name;
  playAnimationClip(initialClip.name);
}

function animationContextPreviewSpec(name: string): AnimationContextPreviewSpec | null {
  const mountedClip = name === "mounted_idle"
    ? "idle"
    : name === "mounted_walk"
      ? "walk"
      : name === "mounted_trot"
        ? "trot"
        : name === "mounted_gallop"
          ? "gallop"
          : name.startsWith("mount")
            ? "mount"
            : name.startsWith("dismount")
              ? "dismount"
              : null;
  if (mountedClip) {
    return {
      assetId: "fauna_donkey_a" as AssetId,
      anchorName: "fauna_donkey_a_rider_socket",
      companionClip: mountedClip,
      baseClip: null,
      pelvisContact: true,
      transition: ["mount", "mount_right"].includes(name) ? "enter"
        : ["dismount", "dismount_right"].includes(name) ? "exit" : null,
      side: name.endsWith("_right") ? -1 : 1
    };
  }
  if (["reel", "slack", "brace", "hookset", "cast", "fishing_idle"].includes(name)) {
    const selected = animationContextSelect.value === "auto" ? "rowboat" : animationContextSelect.value;
    if (selected === "on-foot") {
      return { assetId: null, anchorName: null, companionClip: null, baseClip: "idle", pelvisContact: false, transition: null, side: 1 };
    }
    if (selected === "skiff") {
      return {
        assetId: "boat_skiff_a" as AssetId,
        anchorName: "boat_skiff_fishing_station",
        companionClip: null,
        baseClip: "skiff_fishing",
        pelvisContact: false,
        transition: null,
        side: 1
      };
    }
    return {
      assetId: "boat_rowboat_a" as AssetId,
      anchorName: "boat_rowboat_rower_seat",
      companionClip: null,
      baseClip: "rowboat_idle",
      pelvisContact: true,
      transition: null,
      side: 1
    };
  }
  if (["board", "dock", "rowboat_idle", "row"].includes(name)) {
    return {
      assetId: "boat_rowboat_a" as AssetId,
      anchorName: "boat_rowboat_rower_seat",
      companionClip: null,
      baseClip: null,
      pelvisContact: true,
      transition: name === "board" ? "enter" : name === "dock" ? "exit" : null,
      side: 1
    };
  }
  if (["board_skiff", "dock_skiff", "skiff_idle", "skiff_drive", "skiff_fishing"].includes(name)) {
    return {
      assetId: "boat_skiff_a" as AssetId,
      anchorName: name === "skiff_fishing" ? "boat_skiff_fishing_station" : "boat_skiff_driver_station",
      companionClip: null,
      baseClip: null,
      pelvisContact: false,
      transition: name === "board_skiff" ? "enter" : name === "dock_skiff" ? "exit" : null,
      side: 1
    };
  }
  return null;
}

function positionContextTransition(normalizedTime: number): void {
  const spec = activeContextPreviewSpec;
  const player = currentModel;
  const root = contextPreviewRoot;
  const anchor = contextPreviewAnchor;
  if (!spec?.transition || !player || !root || !anchor) return;
  const target = anchor.getWorldPosition(new THREE.Vector3());
  root.worldToLocal(target);
  const source = target.clone().add(new THREE.Vector3(spec.side * 0.95, 0, 0.08));
  source.y = 0;
  if (spec.pelvisContact && contextPlayerPelvis) {
    player.updateWorldMatrix(true, true);
    const pelvisLocal = player.worldToLocal(contextPlayerPelvis.getWorldPosition(new THREE.Vector3()));
    const anchorLocal = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(anchor.matrixWorld);
    target.copy(pelvisLocal).negate().applyMatrix4(anchorLocal);
  }
  const progress = THREE.MathUtils.clamp(normalizedTime, 0, 1);
  const travel = spec.transition === "enter" ? progress : 1 - progress;
  const curve = sampleAttachmentCurve(travel, 0.12);
  player.position.lerpVectors(source, target, curve.weight);
  player.position.y += curve.arcY;
  const targetRotation = root.getWorldQuaternion(new THREE.Quaternion()).invert()
    .multiply(anchor.getWorldQuaternion(new THREE.Quaternion()));
  player.quaternion.identity().slerp(targetRotation, curve.weight);
}

function applyContextSupports(): void {
  const spec = activeContextPreviewSpec;
  const root = contextPreviewRoot;
  const solver = usesRuntimePreview() ? runtimeAnimator : null;
  if (!spec || !root || !solver || spec.transition) return;

  const clip = clipSelect.value;
  const mounted = spec.assetId === "fauna_donkey_a"
    && ["mounted_idle", "mounted_walk", "mounted_trot", "mounted_gallop"].includes(clip);
  const rowboat = spec.assetId === "boat_rowboat_a"
    && (["rowboat_idle", "row"].includes(clip) || fishingClipUsesRod(clip));
  if (!mounted && !rowboat) return;

  const leftName = mounted
    ? "fauna_donkey_a_stirrup_left_socket"
    : "boat_rowboat_foot_left_socket";
  const rightName = mounted
    ? "fauna_donkey_a_stirrup_right_socket"
    : "boat_rowboat_foot_right_socket";
  const left = root.getObjectByName(leftName);
  const right = root.getObjectByName(rightName);
  if (!left || !right) throw new Error(`Companion ${spec.assetId} has no foot support sockets`);
  alignSupportFeet(solver, left, right);
  if (mounted) {
    for (const side of ["left", "right"] as const) {
      const grip = root.getObjectByName(`fauna_donkey_a_rein_grip_${side}`);
      if (!grip) throw new Error(`Donkey has no ${side} rein grip`);
      alignMarkerHand(solver, side, grip);
    }
  }
}

function updateRuntimePreview(deltaSeconds: number): void {
  if (!usesRuntimePreview() || !currentModel || !currentSpec || !runtimeAnimator) return;
  const context = characterPreviewContext(clipSelect.value, currentSpec, activeContextPreviewSpec?.assetId ?? null);
  const motion = runtimeAnimator.update(deltaSeconds, context, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (contextPreviewAction && contextPreviewMixer) {
    const phase = activeContextPreviewSpec?.transition ? runtimeAnimator.previewPhase() : runtimeAnimator.normalizedBasePhase();
    contextPreviewAction.time = phase * contextPreviewAction.getClip().duration;
    contextPreviewMixer.update(0);
  }
  if (!activeContextPreviewSpec?.assetId) {
    const travel = context.motion.speedMetersPerSecond * deltaSeconds;
    currentModel.position.z += travel;
    currentModel.position.y = motion.bobY;
    currentModel.rotation.set(motion.leanX + motion.groundPitch, 0, motion.leanZ + motion.groundRoll, "YXZ");
    camera.position.z += travel;
    controls.target.z += travel;
    ground.position.z = currentModel.position.z;
    groundRing.position.z = currentModel.position.z;
  }
  positionContextTransition(runtimeAnimator.previewPhase());
  currentModel.updateMatrixWorld(true);
  if (activeContextPreviewSpec?.pelvisContact && !activeContextPreviewSpec.transition && contextPreviewAnchor) {
    runtimeAnimator.alignPelvisSupport(contextPreviewAnchor.getWorldPosition(contextLeftFootTarget));
  }
  runtimeAnimator.resolveGroundContacts(context, () => ({ height: 0, normal: { x: 0, y: 1, z: 0 } }));
  applyContextSupports();
  if (contextOars.length && ["row", "rowboat_idle"].includes(clipSelect.value)) {
    for (const oar of contextOars) {
      oar.pivot.rotation.copy(rowboatOarRotation(runtimeAnimator.normalizedBasePhase(), clipSelect.value === "row", oar.side, contextOarEuler));
      oar.pivot.updateWorldMatrix(true, true);
      alignMarkerHand(runtimeAnimator, oar.side, oar.grip);
    }
  }
  if (activeContextPreviewSpec?.assetId === "boat_skiff_a" && ["skiff_idle", "skiff_drive"].includes(clipSelect.value)) {
    const helm = contextPreviewRoot?.getObjectByName("boat_skiff_helm_grip");
    if (!helm) throw new Error("Skiff is missing its helm grip");
    alignMarkerHand(runtimeAnimator, "right", helm);
  }
  if (attachedSocketProp) {
    applyEquipmentSocketPose(attachedSocketProp, socketPropSelect.value);
    if (previewRod && context.fishingInput) {
      previewEquipmentElapsed += deltaSeconds;
      const endpoint = currentModel.localToWorld(new THREE.Vector3(0, 0.25, 6));
      previewRod.update(0, endpoint, context.fishingInput.retrievalMetersPerSecond ?? 0, previewEquipmentElapsed);
    }
    alignEquipmentHands(runtimeAnimator, attachedSocketProp);
  }
}

function syncContextPreviewTime(normalizedTime: number): void {
  const normalized = THREE.MathUtils.clamp(normalizedTime, 0, 1);
  if (contextPreviewAction && contextPreviewMixer) {
    contextPreviewAction.time = normalized * contextPreviewAction.getClip().duration;
    contextPreviewMixer.update(0);
  }
  if (usesRuntimePreview()) {
    runtimeAnimator!.setPreviewPhase(normalized);
    updateRuntimePreview(0);
  } else {
    if (activeAction) activeAction.time = normalized * currentClipDuration;
    animationMixer?.update(0);
  }
}

async function updateContextPreview(name: string): Promise<void> {
  const spec = animationContextPreviewSpec(name);
  const player = currentModel;
  animationContextSelect.disabled = !usesRuntimePreview() || !fishingClipUsesRod(name);
  if (!usesRuntimePreview() || !spec || !player || currentSpec?.family !== "character") {
    if (contextPreviewRoot) clearContextPreview();
    return;
  }
  if (!spec.assetId) {
    if (contextPreviewRoot) clearContextPreview();
    activeContextPreviewSpec = spec;
    return;
  }

  clearContextPreview(false);
  const requestSerial = ++contextPreviewSerial;
  const companion = await AssetLoader.loadModel(spec.assetId);
  if (
    requestSerial !== contextPreviewSerial ||
    currentModel !== player ||
    animationContextPreviewSpec(clipSelect.value)?.assetId !== spec.assetId
  ) {
    companion.removeFromParent();
    return;
  }
  const anchor = spec.anchorName ? companion.getObjectByName(spec.anchorName) : null;
  if (!anchor) {
    companion.removeFromParent();
    throw new Error(`Companion ${spec.assetId} is missing ${spec.anchorName}`);
  }

  companion.name = `yard_context_${spec.assetId}`;
  companion.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || object.name.startsWith("COL_") || object.name.startsWith("socket_marker_")) return;
    mesh.castShadow = shadowsToggle.checked;
    mesh.receiveShadow = shadowsToggle.checked;
  });
  const root = new THREE.Group();
  root.name = "yard_animation_context";
  root.add(companion);
  root.add(player);
  scene.add(root);
  contextPreviewRoot = root;
  contextPreviewAnchor = anchor;
  activeContextPreviewSpec = spec;
  runtimeAnimator?.resetSpatialState();
  if (spec.assetId === "boat_rowboat_a") {
    companion.updateMatrixWorld(true);
    contextOars = (["left", "right"] as const).map(side => {
      const oar = companion.getObjectByName(`boat_rowboat_oar_${side}_root`);
      const oarlock = companion.getObjectByName(`boat_rowboat_oarlock_${side}`);
      const grip = companion.getObjectByName(`boat_rowboat_oar_${side}_grip`);
      if (!oar || !oarlock || !grip) throw new Error(`Rowboat is missing its ${side} oar contract`);
      const pivot = new THREE.Group();
      companion.add(pivot);
      pivot.position.copy(companion.worldToLocal(oarlock.getWorldPosition(new THREE.Vector3())));
      pivot.updateMatrixWorld(true);
      pivot.attach(oar);
      return { side, pivot, grip };
    });
  }

  if (!spec.transition) {
    anchor.add(player);
    player.position.set(0, 0, 0);
    player.rotation.set(0, 0, 0);
  }

  const clips = (companion.userData.animationClips as THREE.AnimationClip[] | undefined) ?? [];
  const companionClip = spec.companionClip
    ? clips.find((candidate) => candidate.name === spec.companionClip)
    : undefined;
  if (companionClip) {
    contextPreviewMixer = new THREE.AnimationMixer(companion);
    contextPreviewAction = contextPreviewMixer.clipAction(companionClip);
    const loop = clipLoops(ASSET_BY_ID.get(spec.assetId) ?? null, companionClip.name);
    contextPreviewAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    contextPreviewAction.clampWhenFinished = !loop;
    contextPreviewAction.reset().play();
    contextPreviewAction.paused = !isAnimationPlaying;
  }
  syncContextPreviewTime(currentClipDuration > 0 ? selectedAnimationTime() / currentClipDuration : 0);
  fitModel(root);
  focusContextActor(player, spec.assetId === "boat_rowboat_a" ? 5 : 4);
}

function playAnimationClip(name: string): void {
  previousAnimationMilliseconds = performance.now();
  if (!animationMixer || !currentModel) return;
  const clips = (currentModel.userData.animationClips as THREE.AnimationClip[] | undefined) ?? [];
  const clip = clips.find((c) => c.name === name);
  if (!clip) return;

  animationMixer.stopAllAction();
  currentClipDuration = clip.duration;
  activeAction = null;
  clearContextPreview(false);
  currentModel.position.set(0, 0, 0);
  currentModel.rotation.set(0, 0, 0);
  ground.position.z = 0;
  groundRing.position.z = 0;
  if (usesRuntimePreview()) {
    runtimeAnimator!.setPreviewClip(name as PlayerAnimation);
    runtimeAnimator!.setPreviewPhase(0);
    updateRuntimePreview(0);
  } else {
    runtimeAnimator?.setPreviewClip(null);
    activeAction = animationMixer.clipAction(clip);
    const loop = animLoopToggle.checked && clipLoops(currentSpec, name);
    activeAction.reset().setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    activeAction.clampWhenFinished = !loop;
    activeAction.play();
    animationMixer.update(0);
  }
  fitModel(currentModel);
  isAnimationPlaying = true;
  animPlayToggle.textContent = "Pause";
  animPlayToggle.classList.add("primary");
  void updateContextPreview(name).catch((error: unknown) => {
    console.error("Failed to assemble animation context", error);
    setStatus(error instanceof Error ? error.message : "Animation context could not be loaded");
  });

  if (fishingClipUsesRod(name)) {
    socketPropSelect.value = "tool_fishing_rod_a";
    void attachSocketProp("tool_fishing_rod_a");
  } else if (name === "water") {
    socketPropSelect.value = "tool_watering_can_a";
    void attachSocketProp("tool_watering_can_a");
  } else if (name === "harvest") {
    socketPropSelect.value = "tool_sickle_a";
    void attachSocketProp("tool_sickle_a");
  } else if (name === "plant") {
    socketPropSelect.value = "tool_seed_pouch_a";
    void attachSocketProp("tool_seed_pouch_a");
  } else if (name === "workstation") {
    socketPropSelect.value = "tool_workstation_scoop_a";
    void attachSocketProp("tool_workstation_scoop_a");
  } else if (name === "pickup" || name === "place") {
    socketPropSelect.value = "prop_harvest_basket_a";
    void attachSocketProp("prop_harvest_basket_a");
  } else if (name.startsWith("carry_")) {
    socketPropSelect.value = "prop_crop_bundle_a";
    void attachSocketProp("prop_crop_bundle_a");
  } else {
    socketPropSelect.value = "none";
    void attachSocketProp("none");
  }
}

function findCharacterSocket(model: THREE.Object3D, suffixes: readonly string[]): THREE.Object3D | null {
  for (const suffix of suffixes) {
    let found: THREE.Object3D | undefined;
    model.traverse((obj) => {
      if (found) return;
      if (obj.name === suffix || obj.name.endsWith(`_${suffix}`)) {
        found = obj;
      }
    });
    if (found) return found;
  }
  return null;
}

async function attachSocketProp(assetId: string): Promise<void> {
  const requestSerial = ++socketPropSerial;
  const modelAtStart = currentModel;
  const assetSerialAtStart = loadSerial;
  if (attachedSocketProp) {
    previewRod?.dispose();
    previewRod = null;
    attachedSocketProp.removeFromParent();
    attachedSocketProp = null;
  }
  if (!modelAtStart || assetId === "none") return;

  try {
    const payload = await AssetLoader.loadModel(assetId as AssetId);
    const carried = assetId.startsWith("prop_crop_bundle") || assetId.startsWith("prop_harvest_basket") || assetId.startsWith("fish_");
    const propModel = carried ? createCarryCradle(payload, assetId.startsWith("fish_")) : payload;
    if (
      requestSerial !== socketPropSerial ||
      assetSerialAtStart !== loadSerial ||
      currentModel !== modelAtStart
    ) {
      propModel.removeFromParent();
      return;
    }
    const socketKind =
      assetId === "tool_seed_pouch_a"
        ? (["hip_socket"] as const)
        : carried
          ? (["carry_socket"] as const)
          : (["tool_socket", "hand_socket_right"] as const);
    const socket = findCharacterSocket(modelAtStart, socketKind);
    if (!socket) throw new Error(`Character has no compatible socket for ${assetId}`);

    propModel.name = `socket_${assetId}`;
    applyEquipmentSocketPose(propModel, assetId);

    socket.add(propModel);
    attachedSocketProp = propModel;
    updateShadowPolicies(shadowsToggle.checked);
    previewEquipmentElapsed = 0;
    if (assetId === "tool_fishing_rod_a") previewRod = new FishingRodBend(propModel);
  } catch (error) {
    console.error("Failed to attach socket prop", error);
    setStatus(error instanceof Error ? error.message : "Hand prop could not be loaded");
  }
}

// Diorama Builders
async function assembleDiorama(
  title: string,
  placements: Array<{ id: AssetId; pos: [number, number, number]; rotY?: number; scale?: number; floating?: boolean }>,
  options: { water?: boolean; time?: string; camPos?: [number, number, number]; camTarget?: [number, number, number]; distance?: string } = {}
): Promise<void> {
  const serial = ++loadSerial;
  setStatus(`Assembling ${title}…`);
  clearModel();
  activeShowcaseTitle = title;
  hudAssetBadge.textContent = title;

  const dioramaRoot = new THREE.Group();
  dioramaRoot.name = "showcase_diorama_root";

  try {
    for (const p of placements) {
      if (!ASSET_BY_ID.has(p.id)) continue;
      const model = await AssetLoader.loadModel(p.id);
      if (serial !== loadSerial) return;
      model.name = `diorama_${p.id}`;
      model.position.set(p.pos[0], p.pos[1], p.pos[2]);
      if (p.rotY !== undefined) model.rotation.y = THREE.MathUtils.degToRad(p.rotY);
      if (p.scale !== undefined) model.scale.setScalar(p.scale);
      model.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || object.name.startsWith("COL_") || object.name.startsWith("socket_marker_")) return;
        mesh.castShadow = shadowsToggle.checked;
        mesh.receiveShadow = shadowsToggle.checked;
      });
      dioramaRoot.add(model);

      if (p.floating) {
        floatingActors.push({
          object: model,
          baseY: p.pos[1],
          phase: p.pos[0] * 0.4 + p.pos[2] * 0.2,
          rollAmplitude: 0.035,
          pitchAmplitude: 0.025
        });
      }
    }

    if (serial !== loadSerial) return;
    currentModel = dioramaRoot;
    scene.add(dioramaRoot);

    waterPlane.visible = options.water ?? true;
    waterToggle.checked = waterPlane.visible;
    timeRange.value = options.time ?? "1020";
    updateTimeLabel();

    const target = options.camTarget ?? [0, 1.2, 2];
    controls.target.set(target[0], target[1], target[2]);
    const cam = options.camPos ?? [24, 15, 28];
    camera.position.set(cam[0], cam[1], cam[2]);
    distanceRange.value = options.distance ?? "38";
    updateDistanceLabel();
    controls.update();

    updateShadingMode(shadingSelect.value);
    setCollision(collisionToggle.checked);
    updateMetrics();
    updateDimensions();
    updateSocketsOverlay();
    updateSocketsList();
    setStatus();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Showcase could not be assembled");
  }
}

async function loadShowcase(showcaseId: string): Promise<void> {
  if (showcaseId === "__showcase_village") {
    await assembleDiorama(
      "Complete Village & Farmstead",
      [
        { id: "house_farmhouse_a", pos: [2.5, 0.35, -1.5], rotY: -15 },
        { id: "building_windmill_a", pos: [16, 0.95, -14], rotY: 35 },
        { id: "building_lighthouse_a", pos: [22, 1.8, 12], rotY: -20 },
        { id: "building_fish_market_a", pos: [-14, 0.15, -8], rotY: 75 },
        { id: "bridge_stone_a", pos: [-8, 0.05, 6], rotY: 45 },
        { id: "dock_straight_a", pos: [-20, 0.0, 10], rotY: -10 },
        { id: "boat_skiff_a", pos: [-24.5, -0.05, 12.5], rotY: -15, floating: true },
        { id: "boat_rowboat_a", pos: [-18.5, -0.02, 16], rotY: 65, floating: true },
        { id: "prop_wagon_cart_a", pos: [6.8, 0.35, 3.8], rotY: -30 },
        { id: "prop_produce_crate_a", pos: [3.8, 0.35, 4.2], rotY: 15 },
        { id: "prop_farm_workbench_a", pos: [-2.2, 0.35, -4.5], rotY: 105 },
        { id: "prop_produce_stall_a", pos: [-6.5, 0.35, -5.2], rotY: 80 },
        { id: "prop_water_well_a", pos: [-3.2, 0.35, 1.8], rotY: 0 },
        { id: "prop_hay_bale_a", pos: [11.5, 0.35, -3.5], rotY: 25 },
        { id: "prop_hay_bale_a", pos: [12.8, 0.35, -2.4], rotY: -55 },
        { id: "prop_fence_wood_a", pos: [10, 0.35, 1.5], rotY: 10 },
        { id: "prop_worm_compost_a", pos: [0.5, 0.35, -6.2], rotY: 0 },
        { id: "prop_pumpkin_patch_a", pos: [8.5, 0.35, -8.5], rotY: 15 },
        { id: "fauna_cow_a", pos: [9.5, 0.35, 6.2], rotY: -65 },
        { id: "fauna_chicken_a", pos: [5.2, 0.35, 2.4], rotY: 40 },
        { id: "rock_coastal_a", pos: [20, 0.1, 8], rotY: 45 },
        { id: "rock_coastal_b", pos: [25, 0.0, 16], rotY: -110 },
        { id: "rock_coastal_c", pos: [-26, -0.1, 4], rotY: 85 },
        { id: "tree_oak_a", pos: [-1.5, 0.35, -12], rotY: 25 },
        { id: "tree_oak_b", pos: [12, 0.5, -18], rotY: -45 },
        { id: "tree_pine_a", pos: [20, 1.0, -8], rotY: 10 },
        { id: "tree_apple_a", pos: [6.5, 0.35, -5.5], rotY: 55 },
        { id: "foliage_bush_a", pos: [3.5, 0.35, -8.2], rotY: 30 },
        { id: "foliage_wildflower_a", pos: [7.2, 0.35, 0.8], rotY: 15 },
        { id: "char_player_a", pos: [1.2, 0.35, 3.2], rotY: -20 },
        { id: "tool_fishing_rod_a", pos: [-19.5, 0.35, 9.8], rotY: 25, scale: 1.1 }
      ],
      { water: true, time: "1020", camPos: [24, 15, 28], distance: "38" }
    );
  } else if (showcaseId === "__showcase_architecture") {
    await assembleDiorama(
      "Architecture Lineup · Farmhouse-Derived Roles",
      [
        { id: "house_farmhouse_a", pos: [-30, 0.05, -14], rotY: 0 },
        { id: "house_farmhouse_b", pos: [-18, 0.05, -14], rotY: 0 },
        { id: "house_cottage_a", pos: [-6, 0.05, -14], rotY: 0 },
        { id: "house_cottage_b", pos: [6, 0.05, -14], rotY: 0 },
        { id: "house_cottage_c", pos: [18, 0.05, -14], rotY: 0 },
        { id: "prop_tool_shed_a", pos: [30, 0.05, -14], rotY: 0 },
        { id: "building_inn_a", pos: [-30, 0.05, 0], rotY: 0 },
        { id: "building_inn_b", pos: [-18, 0.05, 0], rotY: 0 },
        { id: "building_village_market_hall_a", pos: [-6, 0.05, 0], rotY: 0 },
        { id: "building_village_market_hall_b", pos: [6, 0.05, 0], rotY: 0 },
        { id: "building_barn_a", pos: [18, 0.05, 0], rotY: 0 },
        { id: "building_barn_b", pos: [30, 0.05, 0], rotY: 0 },
        { id: "building_lighthouse_a", pos: [-30, 0.05, 14], rotY: 0 },
        { id: "building_windmill_a", pos: [-18, 0.05, 14], rotY: 0 },
        { id: "building_fish_market_a", pos: [-6, 0.05, 14], rotY: 0 },
        { id: "interior_farmhouse_shell", pos: [6, 0.05, 14], rotY: 0 },
        { id: "building_market_stall_a", pos: [18, 0.05, 14], rotY: 0 },
        { id: "building_outhouse_a", pos: [30, 0.05, 14], rotY: 0 },
        { id: "building_outhouse_b", pos: [-30, 0.05, 28], rotY: 0 },
        { id: "prop_tool_shed_b", pos: [-18, 0.05, 28], rotY: 0 },
        { id: "bridge_stone_a", pos: [-6, 0.05, 28], rotY: 0 },
        { id: "bridge_log_plank_a", pos: [6, 0.05, 28], rotY: 0 },
        { id: "dock_straight_a", pos: [18, 0.05, 28], rotY: 0 }
      ],
      { water: false, time: "720", camPos: [42, 34, 58], camTarget: [0, 2, 7], distance: "72" }
    );
  } else if (showcaseId === "__showcase_farm") {
    await assembleDiorama(
      "Cozy Starter Homestead",
      [
        { id: "house_farmhouse_a", pos: [0, 0.0, -2], rotY: 0 },
        { id: "prop_farm_workbench_a", pos: [-4.2, 0.0, -1.8], rotY: 90 },
        { id: "prop_water_well_a", pos: [4.5, 0.0, 0], rotY: 25 },
        { id: "prop_produce_stall_a", pos: [-4.8, 0.0, 2.5], rotY: 45 },
        { id: "prop_worm_compost_a", pos: [-3.8, 0.0, -4.2], rotY: 15 },
        { id: "prop_wagon_cart_a", pos: [3.5, 0.0, 3.8], rotY: -45 },
        { id: "prop_hay_bale_a", pos: [5.8, 0.0, 2.2], rotY: 15 },
        { id: "prop_hay_bale_a", pos: [6.5, 0.0, 3.1], rotY: -35 },
        { id: "crop_wheat_mature", pos: [0, 0.0, 5], rotY: 0 },
        { id: "crop_wheat_growing", pos: [1.5, 0.0, 5], rotY: 15 },
        { id: "crop_tomato_mature", pos: [-1.5, 0.0, 5], rotY: -10 },
        { id: "crop_potato_mature", pos: [0, 0.0, 6.8], rotY: 5 },
        { id: "fauna_cow_a", pos: [7.2, 0.0, -1.5], rotY: -75 },
        { id: "fauna_chicken_a", pos: [2.2, 0.0, 1.8], rotY: 30 },
        { id: "fauna_chicken_a", pos: [1.5, 0.0, 1.2], rotY: -60 },
        { id: "tree_apple_a", pos: [-6.5, 0.0, 5.5], rotY: 45 },
        { id: "tree_oak_a", pos: [7.5, 0.0, -5.5], rotY: 15 },
        { id: "char_player_a", pos: [-1.2, 0.0, 2.2], rotY: 15 }
      ],
      { water: false, time: "720", camPos: [14, 10, 16], distance: "22" }
    );
  } else if (showcaseId === "__showcase_harbor") {
    await assembleDiorama(
      "Working Fishing Harbor",
      [
        { id: "dock_straight_a", pos: [0, 0.0, 0], rotY: 0 },
        { id: "building_fish_market_a", pos: [0, 0.15, -9], rotY: 0 },
        { id: "boat_skiff_a", pos: [-4.2, -0.05, 2.5], rotY: -10, floating: true },
        { id: "boat_rowboat_a", pos: [4.2, -0.02, 3.5], rotY: 20, floating: true },
        { id: "tool_fishing_rod_a", pos: [-1.4, 0.35, 1.2], rotY: -25, scale: 1.1 },
        { id: "prop_lobster_trap_a", pos: [-1.8, 0.05, -1.5], rotY: 30 },
        { id: "prop_crate_wood_a", pos: [1.5, 0.05, -2.5], rotY: 15 },
        { id: "prop_barrel_wood_a", pos: [1.8, 0.05, -1.2], rotY: -45 },
        { id: "prop_lamp_post_a", pos: [-1.5, 0.05, -4.5], rotY: 0 },
        { id: "rock_coastal_a", pos: [-12, -0.1, -4], rotY: 45 },
        { id: "rock_coastal_b", pos: [12, -0.1, -2], rotY: -80 },
        { id: "foliage_reeds_a", pos: [-8.5, 0.0, 4.5], rotY: 15 }
      ],
      { water: true, time: "1110", camPos: [16, 11, 18], distance: "24" }
    );
  } else if (showcaseId === "__showcase_riverside") {
    await assembleDiorama(
      "Riverside Angler's Bend",
      [
        { id: "bridge_stone_a", pos: [0, 0.0, 0], rotY: 0 },
        { id: "prop_driftwood_a", pos: [-4.5, 0.05, 4.2], rotY: 35 },
        { id: "prop_driftwood_b", pos: [5.2, 0.05, -3.8], rotY: -65 },
        { id: "foliage_reeds_a", pos: [-3.2, 0.0, 2.5], rotY: 15 },
        { id: "foliage_reeds_a", pos: [4.5, 0.0, 3.2], rotY: -45 },
        { id: "fish_trout_a", pos: [0.5, -0.4, 3.5], rotY: 45 },
        { id: "tool_fishing_rod_a", pos: [-1.5, 0.35, 4.2], rotY: -30, scale: 1.1 },
        { id: "prop_harvest_basket_a", pos: [-1.2, 0.05, 3.5], rotY: 15 },
        { id: "rock_boulder_a", pos: [-6.5, 0.2, -2.5], rotY: 20 },
        { id: "tree_oak_a", pos: [-8.5, 0.4, 2.5], rotY: 15 }
      ],
      { water: true, time: "480", camPos: [11, 7, 13], distance: "18" }
    );
  } else if (showcaseId === "__showcase_interior") {
    await assembleDiorama(
      "Farmhouse Interior Shell",
      [
        { id: "interior_farmhouse_shell", pos: [0, 0, 0], rotY: 0 },
        { id: "prop_fireplace_hearth_a", pos: [0, 0, 3.1], rotY: 180 },
        { id: "prop_bed_cozy_a", pos: [-3.0, 0, -1.8], rotY: 90 },
        { id: "prop_table_dining_a", pos: [1.8, 0, 0.2], rotY: 0 },
        { id: "prop_chair_rustic_a", pos: [1.8, 0, 1.0], rotY: 180 },
        { id: "prop_chair_rustic_a", pos: [1.8, 0, -0.6], rotY: 0 },
        { id: "prop_cupboard_shelves_a", pos: [3.4, 0, -2.2], rotY: -90 },
        { id: "prop_armchair_cozy_a", pos: [-1.6, 0, 1.8], rotY: -45 },
        { id: "prop_rug_woven_a", pos: [0, 0.01, 1.2], rotY: 0 }
      ],
      { water: false, time: "1320", camPos: [0, 6, -8], camTarget: [0, 1.2, 0], distance: "11" }
    );
  }
}

async function loadAsset(assetId: string): Promise<void> {
  window.history.replaceState({}, "", syncArtYardAssetUrl(new URL(window.location.href), assetId));
  if (assetId.startsWith("__showcase_")) {
    await loadShowcase(assetId);
    return;
  }

  const serial = ++loadSerial;
  setStatus(`Loading ${assetId}…`);
  clearModel();
  hudAssetBadge.textContent = assetId;

  try {
    const spec = ASSET_BY_ID.get(assetId as AssetId);
    if (!spec) throw new Error(`Unknown catalog asset ${assetId}`);
    const model = await AssetLoader.loadModel(assetId as AssetId);
    if (serial !== loadSerial) return;
    model.name = `yard_${assetId}`;
    model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || object.name.startsWith("COL_") || object.name.startsWith("socket_marker_")) return;
      mesh.castShadow = shadowsToggle.checked;
      mesh.receiveShadow = shadowsToggle.checked;
    });

    currentModel = model;
    currentSpec = spec;
    currentMetrics = yardData?.assets.find((asset) => asset.id === assetId) ?? null;
    currentLod = findRuntimeLod(model);
    scene.add(model);
    fitModel(model);

    setupAnimationStudio(model);
    updateShadingMode(shadingSelect.value);
    setCollision(collisionToggle.checked);
    updateDimensions();
    updateSocketsOverlay();
    updateSocketsList();
    updateSkeletonHelper();

    if (spec.family === "boat") {
      floatingActors.push({
        object: model,
        baseY: model.position.y,
        phase: 0,
        rollAmplitude: 0.045,
        pitchAmplitude: 0.03
      });
      waterPlane.visible = true;
      waterToggle.checked = true;
    } else {
      waterPlane.visible = waterToggle.checked;
    }

    updateMetrics();
    setStatus();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Asset could not be loaded");
    updateMetrics();
  }
}

function syncStageUrl(source: string): void {
  const current = new URL(window.location.href);
  if (source === "published") current.searchParams.delete("artStage");
  else current.searchParams.set("artStage", source);
  window.history.replaceState({}, "", current);
  stageInput.value = source;
  sourceBadge.textContent = source;
}

async function loadYardData(): Promise<void> {
  try {
    const response = await fetch(`/__neva_art_yard/data${window.location.search}`, { cache: "no-store" });
    if (!response.ok) {
      const fallback = await fetch(`/__neva_art_yard/data.json${window.location.search}`, { cache: "no-store" });
      if (!fallback.ok) throw new Error(await response.text());
      yardData = (await fallback.json()) as YardData;
    } else {
      const contentType = response.headers.get("content-type");
      if (contentType && !contentType.includes("json")) {
        throw new Error("Received non-JSON response");
      }
      yardData = (await response.json()) as YardData;
    }
    syncStageUrl(yardData.source);
  } catch (error) {
    console.warn("Art yard data endpoint unavailable, synthesizing from catalog:", error);
    yardData = {
      version: 1,
      source: "published",
      generatedAt: null,
      assets: ASSET_CATALOG.map((spec) => ({
        id: spec.id,
        file: spec.file,
        family: spec.family,
        inputHash: null,
        cacheHit: null,
        fileHash: null,
        semanticHash: null,
        triangles: null,
        packagedTriangles: null,
        bytes: null,
        qualityStatus: null,
        lodLevels: null
      }))
    };
    syncStageUrl("published");
  }
}

function applyStage(): void {
  const requested = stageInput.value.trim();
  const next = new URL(window.location.href);
  if (!requested || requested === "published") next.searchParams.delete("artStage");
  else next.searchParams.set("artStage", requested);
  window.location.assign(next.toString());
}

function resize(): void {
  const width = canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth;
  const height = canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight;
  const pixelRatio = Math.min(window.devicePixelRatio, lightingRig.pixelRatioCap());
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
}

function advanceAnimationTo(milliseconds: number): void {
  const timestamp = Math.max(milliseconds, previousAnimationMilliseconds ?? milliseconds);
  const elapsed = previousAnimationMilliseconds === null ? 0
    : (timestamp - previousAnimationMilliseconds) / 1000;
  previousAnimationMilliseconds = timestamp;
  if (!animationMixer) return;
  const delta = isAnimationPlaying && !isScrubbing ? elapsed * animationPlaybackSpeed : 0;
  if (usesRuntimePreview()) updateRuntimePreview(delta);
  else animationMixer.update(delta);
}

function animate(frameMilliseconds: number): void {
  requestAnimationFrame(animate);
  const delta = previousFrameMilliseconds === null ? 0 : Math.max(0, (frameMilliseconds - previousFrameMilliseconds) / 1000);
  previousFrameMilliseconds = frameMilliseconds;
  elapsedSeconds += delta;

  // Turntable Auto-Rotation
  controls.autoRotate = turntableToggle.checked;
  controls.autoRotateSpeed = parseFloat(turntableSpeed.value) * 2.5;
  controls.update(delta);

  if (currentLod && shadingSelect.value !== "lod0" && shadingSelect.value !== "lod1") {
    currentLod.update(camera);
  }

  // Animation playback
  if (animationMixer) {
    advanceAnimationTo(frameMilliseconds);
    if (currentClipDuration > 0) {
      const loop = animLoopToggle.checked && clipLoops(currentSpec, clipSelect.value);
      const time = displayedClipTime(selectedAnimationTime(), currentClipDuration, loop);
      animScrubber.value = (time / currentClipDuration).toFixed(3);
      animTimeOutput.value = `${time.toFixed(2)}s / ${currentClipDuration.toFixed(2)}s`;
      if (!loop && time >= currentClipDuration - 1e-6) {
        isAnimationPlaying = false;
      }
      animPlayToggle.textContent = isAnimationPlaying ? "Pause"
        : !loop && time >= currentClipDuration - 1e-6 ? "Replay" : "Play";
      animPlayToggle.classList.toggle("primary", isAnimationPlaying);
    }
  }

  // Dynamic Bounding Box update
  const boundsRoot = inspectionRoot();
  if (boundsToggle.checked && boundsHelper && boundsRoot) {
    const box = visibleBounds(boundsRoot);
    if (!box.isEmpty()) boundsHelper.box.copy(box);
  }

  // Sockets visualizer tracking
  if (socketsOverlay && socketsToggle.checked) {
    for (const child of socketsOverlay.children) {
      const target = child.userData?.targetSocket as THREE.Object3D | undefined;
      if (target) {
        target.getWorldPosition(tempWorldVec);
        target.getWorldQuaternion(tempWorldQuat);
        child.position.copy(tempWorldVec);
        child.quaternion.copy(tempWorldQuat);
      }
    }
  }

  // Buoyant floating simulation
  for (const actor of floatingActors) {
    const wave = Math.sin(elapsedSeconds * 1.8 + actor.phase) * 0.04;
    actor.object.position.y = actor.baseY + wave;
    actor.object.rotation.z = Math.sin(elapsedSeconds * 1.4 + actor.phase) * actor.rollAmplitude;
    actor.object.rotation.x = Math.cos(elapsedSeconds * 1.1 + actor.phase) * actor.pitchAmplitude;
  }

  // Windmill sails animation in showcase
  if (currentModel) {
    const rotor = currentModel.getObjectByName("windmill_rotor");
    if (rotor) {
      rotor.rotation.z += delta * 0.6;
    }
  }

  const frame = lightingRig.update(previewState(), elapsedSeconds, controls.target);
  scene.background = frame.skyTopColor;
  groundRing.material.color.copy(frame.groundFillColor).lerp(new THREE.Color(PALETTE_HEX.accent_teal_01), 0.55);
  renderer.render(scene, camera);
}

// Shortcuts Dialog
function toggleShortcutsModal(show?: boolean): void {
  const willShow = show ?? !shortcutsModal.open;
  if (willShow) {
    shortcutsModal.showModal();
  } else {
    shortcutsModal.close();
  }
}

helpBtn.addEventListener("click", () => toggleShortcutsModal(true));
closeShortcutsBtn.addEventListener("click", () => toggleShortcutsModal(false));
shortcutsModal.addEventListener("click", (event) => {
  if (event.target === shortcutsModal) toggleShortcutsModal(false);
});

// Copy Shareable Link
copyLinkBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(window.location.href).then(
    () => showToast("Copied yard link"),
    () => showToast("Copy failed")
  );
});

// Category Filter Chips
categoryChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    const family = chip.dataset.family ?? "all";
    setCategoryFilter(family);
  });
});

// Event Listeners - Search & Filter
populateAssetSelect();
stageInput.value = new URLSearchParams(window.location.search).get("artStage") ?? "published";
updateDistanceLabel();
updateTimeLabel();
updateAzimuthLabel();

assetSearch.addEventListener("input", populateAssetSelect);

familyFilter.addEventListener("change", () => {
  setCategoryFilter(familyFilter.value);
});

prevAssetBtn.addEventListener("click", () => navigateAsset(-1));
nextAssetBtn.addEventListener("click", () => navigateAsset(1));

copyAssetIdBtn.addEventListener("click", () => {
  const textToCopy = currentSpec?.id ?? activeShowcaseTitle ?? assetSelect.value;
  navigator.clipboard.writeText(textToCopy).then(
    () => showToast(`Copied ${textToCopy}`),
    () => showToast("Copy failed")
  );
});

togglePanelBtn.addEventListener("click", () => {
  yardApp.classList.toggle("panel-collapsed");
  const isCollapsed = yardApp.classList.contains("panel-collapsed");
  togglePanelBtn.textContent = isCollapsed ? "Show" : "Hide";
  setTimeout(resize, 100);
});

// Event Listeners - Animation Controls
clipSelect.addEventListener("change", () => playAnimationClip(clipSelect.value));
animationModeSelect.addEventListener("change", () => playAnimationClip(clipSelect.value));
animationContextSelect.addEventListener("change", () => {
  playAnimationClip(clipSelect.value);
});

animPlayToggle.addEventListener("click", () => {
  advanceAnimationTo(performance.now());
  if (!activeAction && !usesRuntimePreview()) return;
  const loop = animLoopToggle.checked && clipLoops(currentSpec, clipSelect.value);
  if (!loop && selectedAnimationTime() >= currentClipDuration - 1e-6) {
    playAnimationClip(clipSelect.value);
    return;
  }
  isAnimationPlaying = !isAnimationPlaying;
  if (activeAction) activeAction.paused = !isAnimationPlaying;
  if (contextPreviewAction) contextPreviewAction.paused = !isAnimationPlaying;
  animPlayToggle.textContent = isAnimationPlaying ? "Pause" : "Play";
  animPlayToggle.classList.toggle("primary", isAnimationPlaying);
});

function pauseForAnimationStep(): void {
  advanceAnimationTo(performance.now());
  isAnimationPlaying = false;
  if (activeAction) activeAction.paused = true;
  if (contextPreviewAction) contextPreviewAction.paused = true;
  animPlayToggle.textContent = "Play";
  animPlayToggle.classList.remove("primary");
}

function stepAnimationTime(deltaSeconds: number): void {
  if ((!activeAction && !usesRuntimePreview()) || currentClipDuration <= 0) return;
  pauseForAnimationStep();
  const current = selectedAnimationTime();
  const newTime = THREE.MathUtils.clamp(current + deltaSeconds, 0, currentClipDuration);
  syncContextPreviewTime(newTime / currentClipDuration);
  animScrubber.value = (newTime / currentClipDuration).toFixed(3);
  animTimeOutput.value = `${newTime.toFixed(2)}s / ${currentClipDuration.toFixed(2)}s`;
}

animStepFrameBackBtn.addEventListener("click", () => stepAnimationTime(-1 / 30));
animStepFrameFwdBtn.addEventListener("click", () => stepAnimationTime(1 / 30));
animStepBackBtn.addEventListener("click", () => stepAnimationTime(-0.1));
animStepFwdBtn.addEventListener("click", () => stepAnimationTime(0.1));

animSpeed.addEventListener("change", () => {
  advanceAnimationTo(performance.now());
  animationPlaybackSpeed = Number(animSpeed.value);
});

animLoopToggle.addEventListener("change", () => {
  if (activeAction) {
    const loop = animLoopToggle.checked;
    activeAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    activeAction.clampWhenFinished = !loop;
  }
});

function setScrubbing(scrubbing: boolean): void {
  if (isScrubbing === scrubbing) return;
  advanceAnimationTo(performance.now());
  isScrubbing = scrubbing;
}
animScrubber.addEventListener("mousedown", () => setScrubbing(true));
animScrubber.addEventListener("touchstart", () => setScrubbing(true));
window.addEventListener("mouseup", () => setScrubbing(false));
window.addEventListener("touchend", () => setScrubbing(false));

animScrubber.addEventListener("input", () => {
  if ((!activeAction && !usesRuntimePreview()) || currentClipDuration <= 0) return;
  const time = parseFloat(animScrubber.value) * currentClipDuration;
  syncContextPreviewTime(time / currentClipDuration);
  animTimeOutput.value = `${time.toFixed(2)}s / ${currentClipDuration.toFixed(2)}s`;
});

socketPropSelect.addEventListener("change", () => void attachSocketProp(socketPropSelect.value));

// Event Listeners - Camera Presets
document.querySelectorAll<HTMLButtonElement>("[data-cam]").forEach((button) => {
  button.addEventListener("click", () => {
    const angle = button.dataset.cam;
    if (angle) setCameraAngle(angle);
  });
});

camEyeBtn.addEventListener("click", setEyeLevelCamera);

document.querySelectorAll<HTMLButtonElement>("[data-dist]").forEach((button) => {
  button.addEventListener("click", () => {
    distanceRange.value = button.dataset.dist ?? "8";
    updateDistanceLabel();
    updateCameraDistance();
  });
});

camFitBtn.addEventListener("click", () => {
  const root = inspectionRoot();
  if (root) fitModel(root);
});

distanceRange.addEventListener("input", () => {
  updateDistanceLabel();
  updateCameraDistance();
});

function toggleTurntable(): void {
  turntableToggle.checked = !turntableToggle.checked;
}

// Event Listeners - Diagnostics & Inspection
shadingSelect.addEventListener("change", () => updateShadingMode(shadingSelect.value));
boundsToggle.addEventListener("change", updateBoundingBoxOverlay);
socketsToggle.addEventListener("change", updateSocketsOverlay);
skeletonToggle.addEventListener("change", updateSkeletonHelper);
originToggle.addEventListener("change", () => setOriginAxes(originToggle.checked));
originAxesBtn.addEventListener("click", () => setOriginAxes(!originToggle.checked));
collisionToggle.addEventListener("change", () => setCollision(collisionToggle.checked));
shadowsToggle.addEventListener("change", () => updateShadowPolicies(shadowsToggle.checked));

// Event Listeners - Environment
timeRange.addEventListener("input", updateTimeLabel);
azimuthRange.addEventListener("input", updateAzimuthLabel);
groundSelect.addEventListener("change", () => updateGroundBed(groundSelect.value));
waterToggle.addEventListener("change", () => {
  waterPlane.visible = waterToggle.checked;
});

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-time]")) {
  button.addEventListener("click", () => {
    timeRange.value = button.dataset.time ?? "720";
    updateTimeLabel();
  });
}

// Staging
stageApply.addEventListener("click", applyStage);
stageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") applyStage();
});

assetSelect.addEventListener("change", () => void loadAsset(assetSelect.value));
window.addEventListener("resize", resize);

// Global Keyboard Shortcuts
window.addEventListener("keydown", (event) => {
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLSelectElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLButtonElement ||
    (event.target instanceof HTMLElement && event.target.closest("summary"))
  ) {
    return;
  }

  if (event.code === "Space") {
    event.preventDefault();
    if (activeAction || usesRuntimePreview()) {
      animPlayToggle.click();
    } else {
      toggleTurntable();
    }
  } else if (event.key === "1") {
    setCameraAngle("front");
  } else if (event.key === "2") {
    setCameraAngle("three-quarter");
  } else if (event.key === "3") {
    setCameraAngle("side");
  } else if (event.key === "4") {
    setCameraAngle("rear");
  } else if (event.key === "5") {
    setCameraAngle("top");
  } else if (event.key === "6") {
    setEyeLevelCamera();
  } else if (event.key === "[" || event.key === "ArrowLeft") {
    navigateAsset(-1);
  } else if (event.key === "]" || event.key === "ArrowRight") {
    navigateAsset(1);
  } else if (event.key === "Tab") {
    event.preventDefault();
    togglePanelBtn.click();
  } else if (event.key.toLowerCase() === "t") {
    toggleTurntable();
  } else if (event.key.toLowerCase() === "f") {
    const root = inspectionRoot();
    if (root) fitModel(root);
  } else if (event.key.toLowerCase() === "w") {
    shadingSelect.value = shadingSelect.value === "lit" ? "wireframe_overlay" : "lit";
    updateShadingMode(shadingSelect.value);
  } else if (event.key.toLowerCase() === "c") {
    collisionToggle.checked = !collisionToggle.checked;
    setCollision(collisionToggle.checked);
  } else if (event.key.toLowerCase() === "b") {
    boundsToggle.checked = !boundsToggle.checked;
    updateBoundingBoxOverlay();
  } else if (event.key.toLowerCase() === "s") {
    socketsToggle.checked = !socketsToggle.checked;
    updateSocketsOverlay();
  } else if (event.key.toLowerCase() === "k") {
    skeletonToggle.checked = !skeletonToggle.checked;
    updateSkeletonHelper();
  } else if (event.key.toLowerCase() === "o") {
    setOriginAxes(!originToggle.checked);
  } else if (event.key === "?" || (event.shiftKey && event.key === "/")) {
    event.preventDefault();
    toggleShortcutsModal();
  }
});

// Initialization
resize();
const requestedAssetId = new URLSearchParams(window.location.search).get("asset");
void loadYardData()
  .catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : "Art yard data is unavailable");
  })
  .finally(() => {
    const initialAssetId = resolveArtYardAssetId(
      requestedAssetId,
      new Set(ASSET_CATALOG.map((asset) => asset.id)),
      "__showcase_village"
    );
    assetSelect.value = initialAssetId;
    void loadAsset(initialAssetId);
  });

requestAnimationFrame(animate);
document.addEventListener("visibilitychange", () => {
  previousFrameMilliseconds = null;
  previousAnimationMilliseconds = null;
  runtimeAnimator?.resetSpatialState();
});

function disposeAfterUnload(): void {
  clearModel();
  originAxes?.dispose();
  groundGeometry.dispose();
  waterGeometry.dispose();
  waterMaterial.dispose();
  renderer.dispose();
}

window.addEventListener("pagehide", disposeAfterUnload, { once: true });
