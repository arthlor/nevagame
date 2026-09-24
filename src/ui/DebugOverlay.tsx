// src/ui/DebugOverlay.tsx
import React from "react";
import type { GameMode } from "../simulation/core/types";
import type { AssetCoverageSummary } from "../render/assets/AssetCoverage";
import type { DebugGameSnapshot } from "../app/GameUiSnapshot";

export interface RenderStats {
  calls: number;
  triangles: number;
  points: number;
  lines: number;
  visibleMeshes: number;
  shadowCasters: number;
  batchedMeshes: number;
  instancedMeshes: number;
}

export interface DebugCameraDiagnostics {
  x: number;
  y: number;
  z: number;
  yawRadians: number;
  pitchRadians: number;
  distance: number;
  resolvedDistance: number;
  obstructionFraction: number;
  obstructed: boolean;
  fovDegrees: number;
}

export interface DebugCharacterDiagnostics {
  presentedX: number;
  presentedY: number;
  presentedZ: number;
  speedMetersPerSecond: number;
  accelerationMetersPerSecondSquared: number;
  collisionBlocked: boolean;
  requestedGait: string;
  animationClip: string;
  actionTargetX: number | null;
  actionTargetZ: number | null;
  /** Fixed movement steps delivered so far; the pacing signal for automated traversal. */
  physicsStepCount: number;
}

interface DebugOverlayProps {
  snapshot: DebugGameSnapshot;
  mode: GameMode;
  fps: number;
  renderStats: RenderStats;
  camera: DebugCameraDiagnostics;
  character: DebugCharacterDiagnostics;
  placementValid: boolean | null;
  placementTarget: { x: number; z: number } | null;
  onAdvanceHours: (hours: number) => void;
  onGrantMoney: (amount: number) => void;
  onToggleWeather: () => void;
  onSpawnSchool: () => void;
  assetCoverage: AssetCoverageSummary;
  bootReady: boolean;
}

export const DebugOverlay: React.FC<DebugOverlayProps> = ({
  snapshot,
  mode,
  fps,
  renderStats,
  camera,
  character,
  placementValid,
  placementTarget,
  onAdvanceHours,
  onGrantMoney,
  onToggleWeather,
  onSpawnSchool,
  assetCoverage,
  bootReady
}) => {
  const p = snapshot.player;
  const activeSchoolsCount = snapshot.activeSchoolsCount;
  const activeCropsCount = snapshot.activeCropsCount;
  const activeBoat = snapshot.activeBoat;
  const fishing = snapshot.fishing;

  return (
    <div
      className="debug-overlay interactive"
      data-testid="diagnostics"
      data-boot-ready={String(bootReady)}
      data-mode={mode}
      data-player-x={p.x.toFixed(4)}
      data-player-y={p.y.toFixed(4)}
      data-player-z={p.z.toFixed(4)}
      data-player-heading={p.rotationY.toFixed(4)}
      data-player-grounded={String(p.traversal.isGrounded)}
      data-presented-player-x={character.presentedX.toFixed(4)}
      data-presented-player-y={character.presentedY.toFixed(4)}
      data-presented-player-z={character.presentedZ.toFixed(4)}
      data-player-speed={character.speedMetersPerSecond.toFixed(4)}
      data-player-acceleration={character.accelerationMetersPerSecondSquared.toFixed(4)}
      data-player-collision-blocked={String(character.collisionBlocked)}
      data-physics-steps={String(character.physicsStepCount)}
      data-player-requested-gait={character.requestedGait}
      data-player-animation={character.animationClip}
      data-action-target-x={character.actionTargetX?.toFixed(4) ?? "none"}
      data-action-target-z={character.actionTargetZ?.toFixed(4) ?? "none"}
      data-sprint-stamina={p.traversal.sprintStamina.toFixed(4)}
      data-sprint-exhausted={String(p.traversal.sprintExhausted)}
      data-sprint-recovery-delay={p.traversal.sprintRecoveryDelaySeconds.toFixed(4)}
      data-camera-x={camera.x.toFixed(4)}
      data-camera-y={camera.y.toFixed(4)}
      data-camera-z={camera.z.toFixed(4)}
      data-camera-yaw={camera.yawRadians.toFixed(4)}
      data-camera-pitch={camera.pitchRadians.toFixed(4)}
      data-camera-distance={camera.distance.toFixed(4)}
      data-camera-resolved-distance={camera.resolvedDistance.toFixed(4)}
      data-camera-obstruction-fraction={camera.obstructionFraction.toFixed(4)}
      data-camera-obstructed={String(camera.obstructed)}
      data-camera-fov={camera.fovDegrees.toFixed(4)}
      data-crop-count={activeCropsCount}
      data-placement-valid={placementValid === null ? "none" : String(placementValid)}
      data-placement-target-x={placementTarget?.x.toFixed(4) ?? "none"}
      data-placement-target-z={placementTarget?.z.toFixed(4) ?? "none"}
      data-active-boat={activeBoat?.id ?? "none"}
      data-boat-speed={(activeBoat?.speed ?? 0).toFixed(4)}
      data-fishing-reeling={String(fishing?.isReeling ?? false)}
      data-fishing-slacking={String(fishing?.isSlacking ?? false)}
      data-fishing-bracing={String(fishing?.isBracing ?? false)}
      data-fishing-direction={(fishing?.rodDirectionAngle ?? 0).toFixed(4)}
    >
      <div><b>[NEVA DIAGNOSTICS]</b> FPS: {fps} | Mode: {mode}</div>
      <div data-testid="render-stats">
        Draws: {renderStats.calls} | Triangles: {renderStats.triangles.toLocaleString()} | Points: {renderStats.points.toLocaleString()} | Lines: {renderStats.lines.toLocaleString()}
        <br />Meshes: {renderStats.visibleMeshes} | Shadows: {renderStats.shadowCasters} | Batches: {renderStats.batchedMeshes} | Instances: {renderStats.instancedMeshes}
      </div>
      <div>
        Pos: ({p.x.toFixed(1)}, {p.y.toFixed(1)}, {p.z.toFixed(1)}) | Seed: {snapshot.worldSeed}
        <br />Grounded: {String(p.traversal.isGrounded)} | Sprint: {p.traversal.sprintStamina.toFixed(0)} | Motion: {character.requestedGait} {character.speedMetersPerSecond.toFixed(1)} m/s | Clip: {character.animationClip}
      </div>
      <div>Camera: ({camera.x.toFixed(1)}, {camera.y.toFixed(1)}, {camera.z.toFixed(1)}) | FOV: {camera.fovDegrees.toFixed(1)}° | Boom: {camera.resolvedDistance.toFixed(1)}m{camera.obstructed ? " blocked" : ""}</div>
      <div>Crops: {activeCropsCount} | Schools: {activeSchoolsCount} | Weather: {snapshot.weatherType}</div>
      <div
        data-testid="asset-coverage"
        data-total-assets={assetCoverage.total}
        data-fresh-save-visible={assetCoverage.freshSaveVisible}
        data-static-world={assetCoverage.byDisposition["static-world"]}
        data-dynamic-world={assetCoverage.byDisposition["dynamic-world"]}
        data-conditional-world={assetCoverage.byDisposition["conditional-world"]}
        data-progression-world={assetCoverage.byDisposition["progression-world"]}
      >
        Assets: {assetCoverage.total} | Fresh: {assetCoverage.freshSaveVisible} | Static: {assetCoverage.byDisposition["static-world"]} | Dynamic: {assetCoverage.byDisposition["dynamic-world"]} | Conditional: {assetCoverage.byDisposition["conditional-world"]} | Progression: {assetCoverage.byDisposition["progression-world"]}
      </div>
      <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
        <button
          style={{ background: "#222", color: "#00FF88", border: "1px solid #00FF88", padding: "2px 6px", cursor: "pointer", fontSize: "10px" }}
          onClick={() => onAdvanceHours(1)}
        >
          +1h Time
        </button>
        <button
          style={{ background: "#222", color: "#00FF88", border: "1px solid #00FF88", padding: "2px 6px", cursor: "pointer", fontSize: "10px" }}
          onClick={() => onAdvanceHours(24)}
        >
          +1 Day
        </button>
        <button
          style={{ background: "#222", color: "#00FF88", border: "1px solid #00FF88", padding: "2px 6px", cursor: "pointer", fontSize: "10px" }}
          onClick={() => onGrantMoney(100)}
        >
          +100 Gold
        </button>
        <button
          style={{ background: "#222", color: "#00FF88", border: "1px solid #00FF88", padding: "2px 6px", cursor: "pointer", fontSize: "10px" }}
          onClick={onSpawnSchool}
        >
          +School
        </button>
        <button
          style={{ background: "#222", color: "#00FF88", border: "1px solid #00FF88", padding: "2px 6px", cursor: "pointer", fontSize: "10px" }}
          onClick={onToggleWeather}
        >
          Weather
        </button>
      </div>
    </div>
  );
};
