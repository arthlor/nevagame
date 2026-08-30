/// <reference types="vite/client" />

declare module "virtual:neva-runtime-asset-catalog" {
  const assets: ReadonlyArray<{
    id: string;
    file: string;
    contentHash: string;
    family: import("./render/assets/AssetCatalog.generated").AssetFamily;
    collision: "none" | "box" | "compound";
    instancing: boolean;
    lod: "none" | "small" | "medium" | "hero";
    rootNode: string;
    requiredNodes: string[];
    readDistanceMeters: number;
    lodLevels: ReadonlyArray<{
      node: string;
      distanceMeters: number;
      triangleRatioMin: number;
      triangleRatioMax: number;
    }> | null;
    collisionPrimitives: ReadonlyArray<{
      id: string;
      center: readonly [number, number, number];
      halfExtents: readonly [number, number, number];
      yawDegrees?: number;
    }> | null;
    rigNode: string | null;
    socketNodes: ReadonlyArray<string> | null;
    animationClips: ReadonlyArray<{
      name: string;
      durationSeconds: number;
      commitMarkerSeconds?: number;
      loop: boolean;
      referenceSpeedMetersPerSecond?: number;
      optional?: boolean;
      fallbackClip?: string;
      events?: ReadonlyArray<{
        name: string;
        timeSeconds: number;
      }>;
    }> | null;
    additionalAnimationClips: ReadonlyArray<{
      name: string;
      durationSeconds: number;
      commitMarkerSeconds?: number;
      loop: boolean;
      referenceSpeedMetersPerSecond?: number;
      optional?: boolean;
      fallbackClip?: string;
      events?: ReadonlyArray<{
        name: string;
        timeSeconds: number;
      }>;
    }> | null;
  }>;
  export default assets;
}
