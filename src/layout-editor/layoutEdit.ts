/**
 * DEV layout-editor contract. Presentation tags and the Vite patcher share
 * these kinds; they are not simulation state and must not ship as a GameplayMode.
 */

export const LAYOUT_EDITOR_COMMIT_PATH = "/__neva_layout_editor/commit";

export type LayoutEditKind =
  | "farmstead"
  | "farm-prop"
  | "farm-fence"
  | "farm-structure"
  | "architecture-pad"
  | "landmark"
  | "world-anchor"
  | "authored-detail"
  | "environment-override"
  | "interior-prop"
  | "npc";

export type LayoutEditWarning =
  | "gameplay-anchor"
  | "saved-structure"
  | "seeded-override"
  | "farmhouse-paths";

export type LayoutEditSpace = "world" | "farm-local";
export type LayoutEditRotationWrite = "direct" | "processing-station";

export interface LayoutEditTag {
  kind: LayoutEditKind;
  id: string;
  sourceFile: string;
  yOffset: number;
  /** Absolute height for water-surface and elevated display props. */
  fixedY?: number;
  indoor: boolean;
  space: LayoutEditSpace;
  rotationWriteMode: LayoutEditRotationWrite;
  warning: LayoutEditWarning | null;
  catalogAssetId?: string;
  /** Farm-prop `type` (`hay-bale`, `lamp-post`, …) so paste can survive deleting the original. */
  propType?: string;
  /** Unscaled grounding half-extents used to refuse unstable DEV drops. */
  grounding?: readonly [number, number];
  /** When true, spawn may attach a fallback PointLight if the GLB has no glow node. */
  practicalLight?: boolean;
}

export interface LayoutEditCommit {
  kind: LayoutEditKind;
  id: string;
  x: number;
  z: number;
  rotationY: number;
  y?: number;
  /** When set, insert a new object cloned from this id instead of moving it. */
  duplicateFrom?: string;
  /** When true, remove this object from the owning layout source. */
  remove?: boolean;
  /** Reinsert a previously removed duplicable object with the same stable ID. */
  restore?: boolean;
  assetId?: string;
  scale?: readonly [number, number, number];
  grounding?: readonly [number, number];
  practicalLight?: boolean;
  propType?: string;
}

export interface LayoutEditHudSelection {
  id: string;
  kind: LayoutEditKind;
  x: number;
  z: number;
  rotationY: number;
  sourceFile: string;
  warning: LayoutEditWarning | null;
}

export const LAYOUT_EDITOR_SOURCE_FILES = {
  farmLayout: "src/world/FarmLayout.ts",
  worldLayout: "src/world/WorldLayout.ts",
  worldAnchors: "src/world/WorldAnchors.ts",
  environment: "src/world/WorldEnvironmentLayout.ts",
  interior: "src/world/FarmhouseInterior.ts",
  npcs: "src/content/npcs.ts"
} as const;

export const ARCHITECTURE_PLACEMENT_TO_PAD: Readonly<Record<string, string>> = {
  "authored.village.approach-inn": "village.approach-inn",
  "authored.village.cooperative-hall": "village.cooperative-hall",
  "authored.orchard.barn": "orchard.barn",
  "authored.orchard.farmhouse": "orchard.farmhouse",
  "authored.orchard.tool-shed": "orchard.tool-shed",
  "authored.orchard.outhouse": "orchard.outhouse",
  "authored.village.roadside-stall": "village.roadside-stall",
  "authored.village.tool-shed": "village.tool-shed",
  "authored.village.outhouse": "village.outhouse",
  "authored.village.cottage-west": "village.cottage-west",
  "authored.village.cottage-southwest": "village.cottage-southwest",
  "authored.village.cottage-garden": "village.cottage-garden",
  "authored.village.cottage-south": "village.cottage-south",
  "authored.village.inn": "village.inn",
  "authored.village.market-hall": "village.market-hall",
  "authored.village.barn": "village.barn"
};

export const PROCESSING_STATION_LAYOUT_IDS = new Set([
  "struct.starter_mill",
  "struct.workbench",
  "struct.starter_compost",
  "struct.harbor_fish_table"
]);

export const HARBOR_NPC_ANCHOR_IDS: Readonly<Record<string, "HARBOR_SILAS_ANCHOR" | "HARBOR_MAEVE_ANCHOR">> = {
  "npc.silas": "HARBOR_SILAS_ANCHOR",
  "npc.maeve": "HARBOR_MAEVE_ANCHOR"
};

export const DUPLICABLE_LAYOUT_KINDS = new Set<LayoutEditKind>([
  "farm-prop",
  "farm-fence",
  "authored-detail",
  "environment-override",
  "interior-prop"
]);

export const LAYOUT_EDIT_USERDATA_KEY = "layoutEdit";

export function layoutEditCanDuplicate(kind: LayoutEditKind): boolean {
  return DUPLICABLE_LAYOUT_KINDS.has(kind);
}

export function layoutEditCanDelete(kind: LayoutEditKind): boolean {
  return layoutEditCanDuplicate(kind);
}

export function allocateCopyId(
  existing: Iterable<string>,
  sourceId: string,
  assetId?: string
): string {
  const ids = existing instanceof Set ? existing : new Set(existing);
  let base: string;
  let token: string;
  if (sourceId.startsWith("seeded-fill.") || sourceId.startsWith("layout-derived.")) {
    const slug = (assetId ?? "asset").replace(/[^a-z0-9_]+/gi, "_");
    base = `authored.copy.${slug}`;
    token = ".";
  } else if (/^authored\.copy\.[^.]+\.\d+$/.test(sourceId)) {
    base = sourceId.replace(/\.\d+$/, "");
    token = ".";
  } else if (sourceId.includes(".")) {
    base = sourceId.replace(/\.copy\.\d+$/, "");
    token = ".copy.";
  } else {
    base = sourceId.replace(/_copy_\d+$/, "");
    token = "_copy_";
  }
  let n = 1;
  let candidate = `${base}${token}${n}`;
  while (ids.has(candidate)) {
    n += 1;
    candidate = `${base}${token}${n}`;
  }
  return candidate;
}

export function layoutEditWarningMessage(warning: LayoutEditWarning | null): string | null {
  if (warning === "gameplay-anchor") {
    return "Gameplay anchor — interact/spawn/paths may need a follow-up.";
  }
  if (warning === "saved-structure") {
    return "Saved structure — this session updates; other saves keep old coords until moved.";
  }
  if (warning === "seeded-override") {
    return "Seeded instance is now pinned in PLACEMENT_OVERRIDES.";
  }
  if (warning === "farmhouse-paths") {
    return "Farmhouse door will follow in source. Farm paths are not auto-rerouted.";
  }
  return null;
}

export function snapWorldCoord(value: number, fine: boolean): number {
  const step = fine ? 0.01 : 0.1;
  return Math.round(value / step) * step;
}

export function snapRadians(value: number, fine: boolean): number {
  const step = ((fine ? 5 : 15) * Math.PI) / 180;
  return Math.round(value / step) * step;
}

export function formatWorldCoord(value: number): string {
  return formatNumber(value, 2);
}

export function formatRadians(value: number): string {
  return formatNumber(value, 4);
}

export function formatNumber(value: number, digits: number): string {
  const rounded = Number(value.toFixed(digits));
  if (Object.is(rounded, -0)) return "0";
  return String(rounded);
}

/** Rotate an XZ offset by yaw around Y using the same convention as THREE.Object3D. */
export function rotateOffsetY(
  offset: { x: number; z: number },
  yawRadians: number
): { x: number; z: number } {
  const cos = Math.cos(yawRadians);
  const sin = Math.sin(yawRadians);
  return {
    x: offset.x * cos + offset.z * sin,
    z: -offset.x * sin + offset.z * cos
  };
}

export function transformPointWithPose(args: {
  point: { x: number; z: number };
  from: { x: number; z: number; rotationY: number };
  to: { x: number; z: number; rotationY: number };
}): { x: number; z: number } {
  const local = rotateOffsetY(
    { x: args.point.x - args.from.x, z: args.point.z - args.from.z },
    -args.from.rotationY
  );
  const world = rotateOffsetY(local, args.to.rotationY);
  return { x: args.to.x + world.x, z: args.to.z + world.z };
}

export function processingLayoutRotationFromVisual(visualRotationY: number): number {
  return visualRotationY - Math.PI;
}

export function createFarmsteadTag(id: "farmhouse" | "well"): LayoutEditTag {
  return {
    kind: "farmstead",
    id,
    sourceFile: LAYOUT_EDITOR_SOURCE_FILES.farmLayout,
    yOffset: 0,
    indoor: false,
    space: "farm-local",
    rotationWriteMode: "direct",
    warning: id === "farmhouse" ? "farmhouse-paths" : null
  };
}

export function createFarmPropTag(
  id: string,
  catalogAssetId?: string,
  extras?: Pick<LayoutEditTag, "propType" | "grounding" | "practicalLight">
): LayoutEditTag {
  return {
    kind: "farm-prop",
    id,
    sourceFile: LAYOUT_EDITOR_SOURCE_FILES.farmLayout,
    yOffset: 0,
    indoor: false,
    space: "farm-local",
    rotationWriteMode: "direct",
    warning: null,
    catalogAssetId,
    ...extras
  };
}

export function createFarmFenceTag(id: string, catalogAssetId?: string): LayoutEditTag {
  return {
    kind: "farm-fence",
    id,
    sourceFile: LAYOUT_EDITOR_SOURCE_FILES.farmLayout,
    yOffset: 0,
    indoor: false,
    space: "farm-local",
    rotationWriteMode: "direct",
    warning: null,
    catalogAssetId
  };
}

export function createFarmStructureTag(id: string): LayoutEditTag {
  return {
    kind: "farm-structure",
    id,
    sourceFile: LAYOUT_EDITOR_SOURCE_FILES.farmLayout,
    yOffset: 0,
    indoor: false,
    space: "farm-local",
    rotationWriteMode: "processing-station",
    warning: "saved-structure"
  };
}

export function createArchitecturePadTag(padId: string): LayoutEditTag {
  return {
    kind: "architecture-pad",
    id: padId,
    sourceFile: LAYOUT_EDITOR_SOURCE_FILES.worldLayout,
    yOffset: 0,
    indoor: false,
    space: "world",
    rotationWriteMode: "direct",
    warning: null
  };
}

export function createLandmarkTag(
  id: "bridge" | "dock" | "lighthouse" | "fish-market" | "produce-stall",
  yOffset: number
): LayoutEditTag {
  const sourceFile = id === "lighthouse" || id === "dock" || id === "bridge"
    ? LAYOUT_EDITOR_SOURCE_FILES.worldLayout
    : LAYOUT_EDITOR_SOURCE_FILES.worldAnchors;
  return {
    kind: "landmark",
    id,
    sourceFile,
    yOffset,
    indoor: false,
    space: "world",
    rotationWriteMode: "direct",
    warning: "gameplay-anchor"
  };
}

export function createWorldAnchorTag(
  id: string,
  rotationWriteMode: LayoutEditRotationWrite = "direct"
): LayoutEditTag {
  return {
    kind: "world-anchor",
    id,
    sourceFile: LAYOUT_EDITOR_SOURCE_FILES.worldAnchors,
    yOffset: 0,
    indoor: false,
    space: "world",
    rotationWriteMode,
    warning: "saved-structure"
  };
}

export function createAuthoredDetailTag(
  id: string,
  catalogAssetId?: string,
  features?: Pick<LayoutEditTag, "grounding" | "practicalLight" | "fixedY">
): LayoutEditTag {
  return {
    kind: "authored-detail",
    id,
    sourceFile: LAYOUT_EDITOR_SOURCE_FILES.environment,
    yOffset: 0,
    indoor: false,
    space: "world",
    rotationWriteMode: "direct",
    warning: null,
    catalogAssetId,
    ...features
  };
}

export function createEnvironmentOverrideTag(
  id: string,
  catalogAssetId?: string,
  features?: Pick<LayoutEditTag, "grounding" | "practicalLight">
): LayoutEditTag {
  return {
    kind: "environment-override",
    id,
    sourceFile: LAYOUT_EDITOR_SOURCE_FILES.environment,
    yOffset: 0,
    indoor: false,
    space: "world",
    rotationWriteMode: "direct",
    warning: "seeded-override",
    catalogAssetId,
    ...features
  };
}

export function createInteriorPropTag(id: string, catalogAssetId?: string): LayoutEditTag {
  return {
    kind: "interior-prop",
    id,
    sourceFile: LAYOUT_EDITOR_SOURCE_FILES.interior,
    yOffset: 0,
    indoor: true,
    space: "world",
    rotationWriteMode: "direct",
    warning: null,
    catalogAssetId
  };
}

export function createNpcTag(id: string): LayoutEditTag {
  const harbor = id in HARBOR_NPC_ANCHOR_IDS;
  return {
    kind: "npc",
    id,
    sourceFile: harbor ? LAYOUT_EDITOR_SOURCE_FILES.worldAnchors : LAYOUT_EDITOR_SOURCE_FILES.npcs,
    yOffset: 0,
    indoor: false,
    space: "world",
    rotationWriteMode: "direct",
    warning: "gameplay-anchor"
  };
}

export function readLayoutEditTag(object: { userData: Record<string, unknown> }): LayoutEditTag | null {
  const tag = object.userData[LAYOUT_EDIT_USERDATA_KEY];
  if (!tag || typeof tag !== "object") return null;
  return tag as LayoutEditTag;
}
