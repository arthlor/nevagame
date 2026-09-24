import type * as THREE from "three";

export type V3 = [number, number, number];
/** Bone name -> weight. Normalised per vertex at build time; the heaviest four are kept. */
export type Weights = Record<string, number>;

/** The catalog fields an authored generator may read. Mirrors `assets/specs/asset-catalog.json`. */
export interface CatalogAssetSpec {
  id: string;
  file: string;
  family: string;
  generator: string;
  seed: number;
  dimensions: { width: number; depth: number; height: number };
  palette: string[];
  budget: { trianglesMin: number; trianglesTarget: number; trianglesMax: number; materialsMax: number };
  pivot: string;
  collision: string;
  collisionPrimitives?: Array<{
    id: string;
    center: V3;
    halfExtents: V3;
    yawDegrees?: number;
  }>;
  lod: string;
  lodLevels?: Array<{ node: string; distanceMeters: number; triangleRatioMin: number; triangleRatioMax: number }>;
  rootNode: string;
  requiredNodes: string[];
  animationClips?: Array<{ name: string; durationSeconds: number; loop: boolean; referenceSpeedMetersPerSecond?: number }>;
  parameters: Record<string, unknown>;
}

export interface GeneratorContext {
  spec: CatalogAssetSpec;
  /** `spec.seed`, the only source of randomness a generator may use. */
  seed: number;
  parameters: Record<string, unknown>;
}

/** What a generator returns: the `<id>_root` scene and any authored clips. */
export interface AuthoredModel {
  root: THREE.Group;
  clips: THREE.AnimationClip[];
}

export type AuthoredGenerator = (context: GeneratorContext) => AuthoredModel;
