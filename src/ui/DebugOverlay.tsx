// src/ui/DebugOverlay.tsx
import React, { useState } from "react";
import type { GameMode, WeatherTag } from "../simulation/core/types";
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

export interface DebugOverlayProps {
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
  onSetWeather?: (type: WeatherTag) => void;
  onSetTimePreset?: (minute: number) => void;
  onRefillWork?: () => void;
  onTeleport?: (x: number, z: number, yaw?: number) => void;
  onPrepareWheatReview?: () => void;
  onPrepareTrioReview?: () => void;
  onSpawnTunaSchool?: () => void;
  layoutEditorActive?: boolean;
  onToggleLayoutEditor?: () => void;
}

type DebugTab = "telemetry" | "world" | "player" | "teleport" | "review";

export interface TeleportPoint {
  readonly label: string;
  readonly x: number;
  readonly z: number;
  readonly yaw?: number;
}

export interface TeleportGroup {
  readonly title: string;
  readonly points: readonly TeleportPoint[];
}

export const TELEPORT_GROUPS: readonly TeleportGroup[] = [
  {
    title: "Mainland: Farm & Village",
    points: [
      { label: "Family Farm", x: -65, z: -60.5, yaw: 0 },
      { label: "Village Commons", x: 74, z: -75, yaw: 0 },
      { label: "Village Market", x: 39.7, z: -65.9, yaw: 0 },
      { label: "Village Mill", x: 63.3, z: -69.6, yaw: 1.73 },
      { label: "River Bridge", x: 0, z: -5, yaw: -Math.PI / 2 },
      { label: "Silverwater River", x: -28, z: -40, yaw: Math.PI / 2 }
    ]
  },
  {
    title: "Mainland: Harbor & Coast",
    points: [
      { label: "Harbor Market", x: 64.5, z: 54.5, yaw: 0 },
      { label: "Harbor Pier", x: 76, z: 66, yaw: Math.PI / 2 },
      { label: "Lighthouse Cliffs", x: -92, z: 66, yaw: 0 }
    ]
  },
  {
    title: "Mainland: Foothills & Trails",
    points: [
      { label: "Mountain Spring", x: -48, z: -155, yaw: -0.8 },
      { label: "Western Overlook", x: -126, z: -88, yaw: 1.2 },
      { label: "Western Beach", x: -175, z: -68, yaw: -Math.PI / 2 },
      { label: "Northern Bluff", x: -52, z: -218, yaw: 0 }
    ]
  },
  {
    title: "Mainland: Outlying Settlements",
    points: [
      { label: "Pinewatch Village", x: -395, z: 55, yaw: 0.5 },
      { label: "Pinewatch Lake", x: -618, z: -180, yaw: Math.PI / 2 },
      { label: "Reedhaven Village", x: -565, z: 340, yaw: 0.2 },
      { label: "Reedhaven Landing", x: -489, z: 333, yaw: -Math.PI / 2 },
      { label: "Highridge Uplands", x: -340, z: -365, yaw: 0 }
    ]
  },
  {
    title: "Sunreach Isle",
    points: [
      { label: "Sunreach Cove", x: 1173, z: 56, yaw: -0.2 },
      { label: "Sunreach Pier", x: 1155, z: 58, yaw: Math.PI / 2 },
      { label: "Sunreach Terraces", x: 1255, z: 5, yaw: 0 },
      { label: "Sunreach Ridge", x: 1390, z: 25, yaw: -0.5 },
      { label: "Sunreach Reef", x: 1320, z: 180, yaw: Math.PI }
    ]
  },
  {
    title: "Ocean Islets",
    points: [
      { label: "Gull's Rest", x: 420, z: 234, yaw: -Math.PI / 2 },
      { label: "Driftwood Cay", x: 735, z: -41, yaw: -Math.PI / 2 },
      { label: "Lantern Shoal", x: 960, z: 325, yaw: -Math.PI / 2 }
    ]
  }
];

export const TELEPORT_POINTS: readonly TeleportPoint[] = TELEPORT_GROUPS.flatMap((group) => group.points);

const WEATHER_OPTIONS: readonly { tag: WeatherTag; label: string }[] = [
  { tag: "clear", label: "Clear" },
  { tag: "cloudy", label: "Cloudy" },
  { tag: "light-rain", label: "Light Rain" },
  { tag: "heavy-rain", label: "Heavy Rain" },
  { tag: "windy", label: "Windy" },
  { tag: "fog", label: "Fog" },
  { tag: "storm", label: "Storm" },
  { tag: "drought", label: "Drought" }
];

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
  bootReady,
  onSetWeather,
  onSetTimePreset,
  onRefillWork,
  onTeleport,
  onPrepareWheatReview,
  onPrepareTrioReview,
  onSpawnTunaSchool,
  layoutEditorActive = false,
  onToggleLayoutEditor
}) => {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("neva_debug_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const [activeTab, setActiveTab] = useState<DebugTab>("telemetry");
  const [customX, setCustomX] = useState("");
  const [customZ, setCustomZ] = useState("");

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("neva_debug_collapsed", String(next));
      } catch {
        // Ignore local storage error
      }
      return next;
    });
  };

  const handleCustomTeleport = (e: React.FormEvent) => {
    e.preventDefault();
    const x = parseFloat(customX);
    const z = parseFloat(customZ);
    if (Number.isFinite(x) && Number.isFinite(z)) {
      onTeleport?.(x, z);
    }
  };

  const p = snapshot.player;
  const activeSchoolsCount = snapshot.activeSchoolsCount;
  const activeCropsCount = snapshot.activeCropsCount;
  const activeBoat = snapshot.activeBoat;
  const fishing = snapshot.fishing;

  const fpsClass = fps >= 55 ? "fps-good" : fps >= 28 ? "fps-warn" : "fps-poor";

  return (
    <div
      className={`debug-overlay interactive ${collapsed ? "is-collapsed" : "is-expanded"}`}
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
      {collapsed ? (
        <div className="debug-overlay--collapsed" onClick={toggleCollapsed} role="button" tabIndex={0}>
          <span className="debug-pill-tag">DEBUG</span>
          <span className={`debug-fps-badge ${fpsClass}`}>{fps} FPS</span>
          <span className="debug-mode-badge">{mode}</span>
          <span className="debug-mode-badge">{snapshot.weatherType}</span>
          <button
            type="button"
            className="debug-pill-btn"
            onClick={(e) => {
              e.stopPropagation();
              onAdvanceHours(1);
            }}
          >
            +1h Time
          </button>
          <button
            type="button"
            className="debug-pill-btn"
            onClick={(e) => {
              e.stopPropagation();
              onToggleWeather();
            }}
          >
            Weather
          </button>
          <button
            type="button"
            className="debug-pill-btn"
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapsed();
            }}
            title="Expand Diagnostics"
          >
            Expand [+]
          </button>
        </div>
      ) : (
        <div className="debug-overlay--expanded">
          {/* Header */}
          <div className="debug-header">
            <div className="debug-header-title">
              <span className="debug-header-badge">NEVA DIAGNOSTICS</span>
              <span className={`debug-fps-badge ${fpsClass}`}>{fps} FPS</span>
              <span className="debug-mode-badge">{mode}</span>
            </div>
            <div className="debug-header-actions">
              <button
                type="button"
                className="debug-btn debug-btn--sm"
                onClick={toggleCollapsed}
                title="Collapse Debug Overlay"
              >
                Collapse [-]
              </button>
            </div>
          </div>

          {/* Quick Action Strip - Preserves existing test/shortcut buttons */}
          <div className="debug-quick-bar">
            <button
              type="button"
              className="debug-btn debug-btn--primary debug-btn--sm"
              onClick={() => onAdvanceHours(1)}
            >
              +1h Time
            </button>
            <button
              type="button"
              className="debug-btn debug-btn--sm"
              onClick={() => onAdvanceHours(24)}
            >
              +1 Day
            </button>
            <button
              type="button"
              className="debug-btn debug-btn--sm"
              onClick={() => onGrantMoney(100)}
            >
              +100 Gold
            </button>
            {onRefillWork && (
              <button
                type="button"
                className="debug-btn debug-btn--primary debug-btn--sm"
                onClick={onRefillWork}
                title="Refill Work Capacity to 300 Max"
              >
                Refill Work
              </button>
            )}
            <button
              type="button"
              className="debug-btn debug-btn--sm"
              onClick={onSpawnSchool}
            >
              +School
            </button>
            <button
              type="button"
              className="debug-btn debug-btn--sm"
              onClick={onToggleWeather}
            >
              Weather
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="debug-tabs">
            <button
              type="button"
              className={`debug-tab ${activeTab === "telemetry" ? "is-active" : ""}`}
              onClick={() => setActiveTab("telemetry")}
            >
              Telemetry
            </button>
            <button
              type="button"
              className={`debug-tab ${activeTab === "world" ? "is-active" : ""}`}
              onClick={() => setActiveTab("world")}
            >
              Time & Weather
            </button>
            <button
              type="button"
              className={`debug-tab ${activeTab === "player" ? "is-active" : ""}`}
              onClick={() => setActiveTab("player")}
            >
              Player & Cheats
            </button>
            <button
              type="button"
              className={`debug-tab ${activeTab === "teleport" ? "is-active" : ""}`}
              onClick={() => setActiveTab("teleport")}
            >
              Teleport
            </button>
            <button
              type="button"
              className={`debug-tab ${activeTab === "review" ? "is-active" : ""}`}
              onClick={() => setActiveTab("review")}
            >
              Spawns & Review
            </button>
          </div>

          {/* Tab Body */}
          <div className="debug-body">
            {activeTab === "telemetry" && (
              <>
                {/* Render Stats */}
                <div className="debug-section">
                  <div className="debug-section-title">
                    <span>Render Engine</span>
                    <span>{renderStats.calls} draws</span>
                  </div>
                  <div className="debug-grid">
                    <div className="debug-grid-item">
                      <span className="debug-grid-label">Draw Calls:</span>
                      <span className="debug-grid-value">{renderStats.calls}</span>
                    </div>
                    <div className="debug-grid-item">
                      <span className="debug-grid-label">Triangles:</span>
                      <span className="debug-grid-value">{renderStats.triangles.toLocaleString()}</span>
                    </div>
                    <div className="debug-grid-item">
                      <span className="debug-grid-label">Visible Meshes:</span>
                      <span className="debug-grid-value">{renderStats.visibleMeshes}</span>
                    </div>
                    <div className="debug-grid-item">
                      <span className="debug-grid-label">Shadow Casters:</span>
                      <span className="debug-grid-value">{renderStats.shadowCasters}</span>
                    </div>
                    <div className="debug-grid-item">
                      <span className="debug-grid-label">Batches / Instances:</span>
                      <span className="debug-grid-value">{renderStats.batchedMeshes} / {renderStats.instancedMeshes}</span>
                    </div>
                    <div className="debug-grid-item">
                      <span className="debug-grid-label">Points / Lines:</span>
                      <span className="debug-grid-value">{renderStats.points.toLocaleString()} / {renderStats.lines.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Player Motion */}
                <div className="debug-section">
                  <div className="debug-section-title">
                    <span>Player & Motion</span>
                    <span>{character.speedMetersPerSecond.toFixed(1)} m/s</span>
                  </div>
                  <div className="debug-grid">
                    <div className="debug-grid-item">
                      <span className="debug-grid-label">Sim Pos:</span>
                      <span className="debug-grid-value">({p.x.toFixed(1)}, {p.y.toFixed(1)}, {p.z.toFixed(1)})</span>
                    </div>
                    <div className="debug-grid-item">
                      <span className="debug-grid-label">Presented:</span>
                      <span className="debug-grid-value">({character.presentedX.toFixed(1)}, {character.presentedY.toFixed(1)}, {character.presentedZ.toFixed(1)})</span>
                    </div>
                    <div className="debug-grid-item">
                      <span className="debug-grid-label">Gait / Clip:</span>
                      <span className="debug-grid-value">{character.requestedGait} / {character.animationClip}</span>
                    </div>
                    <div className="debug-grid-item">
                      <span className="debug-grid-label">Grounded / Blocked:</span>
                      <span className="debug-grid-value">{String(p.traversal.isGrounded)} / {String(character.collisionBlocked)}</span>
                    </div>
                    <div className="debug-grid-item">
                      <span className="debug-grid-label">Sprint Stamina:</span>
                      <span className="debug-grid-value">{p.traversal.sprintStamina.toFixed(0)} / 100</span>
                    </div>
                    <div className="debug-grid-item">
                      <span className="debug-grid-label">Physics Steps:</span>
                      <span className="debug-grid-value">{character.physicsStepCount}</span>
                    </div>
                  </div>
                </div>

                {/* Camera Diagnostics */}
                <div className="debug-section">
                  <div className="debug-section-title">
                    <span>Camera</span>
                    <span>Boom {camera.resolvedDistance.toFixed(1)}m</span>
                  </div>
                  <div className="debug-grid">
                    <div className="debug-grid-item">
                      <span className="debug-grid-label">Position:</span>
                      <span className="debug-grid-value">({camera.x.toFixed(1)}, {camera.y.toFixed(1)}, {camera.z.toFixed(1)})</span>
                    </div>
                    <div className="debug-grid-item">
                      <span className="debug-grid-label">FOV / Boom:</span>
                      <span className="debug-grid-value">{camera.fovDegrees.toFixed(1)}° / {camera.resolvedDistance.toFixed(1)}m</span>
                    </div>
                    <div className="debug-grid-item">
                      <span className="debug-grid-label">Yaw / Pitch:</span>
                      <span className="debug-grid-value">{((camera.yawRadians * 180) / Math.PI).toFixed(0)}° / {((camera.pitchRadians * 180) / Math.PI).toFixed(0)}°</span>
                    </div>
                    <div className="debug-grid-item">
                      <span className="debug-grid-label">Obstructed:</span>
                      <span className="debug-grid-value">{camera.obstructed ? `YES (${(camera.obstructionFraction * 100).toFixed(0)}%)` : "No"}</span>
                    </div>
                  </div>
                </div>

                {/* World & Assets */}
                <div className="debug-section">
                  <div className="debug-section-title">
                    <span>World State</span>
                    <span>Seed {snapshot.worldSeed}</span>
                  </div>
                  <div className="debug-grid">
                    <div className="debug-grid-item">
                      <span className="debug-grid-label">Active Crops:</span>
                      <span className="debug-grid-value">{activeCropsCount}</span>
                    </div>
                    <div className="debug-grid-item">
                      <span className="debug-grid-label">Fish Schools:</span>
                      <span className="debug-grid-value">{activeSchoolsCount}</span>
                    </div>
                    <div className="debug-grid-item">
                      <span className="debug-grid-label">Weather:</span>
                      <span className="debug-grid-value">{snapshot.weatherType}</span>
                    </div>
                    <div className="debug-grid-item">
                      <span className="debug-grid-label">Active Boat:</span>
                      <span className="debug-grid-value">{activeBoat?.id ?? "None"}</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === "world" && (
              <>
                <div className="debug-section">
                  <div className="debug-section-title">Time Controls</div>
                  <div className="debug-button-group">
                    <button type="button" className="debug-btn" onClick={() => onAdvanceHours(1)}>
                      +1h Time
                    </button>
                    <button type="button" className="debug-btn" onClick={() => onAdvanceHours(6)}>
                      +6h Time
                    </button>
                    <button type="button" className="debug-btn" onClick={() => onAdvanceHours(24)}>
                      +1 Day (24h)
                    </button>
                  </div>
                  {onSetTimePreset && (
                    <>
                      <div className="debug-section-title" style={{ marginTop: "10px" }}>Time Presets</div>
                      <div className="debug-button-group">
                        <button type="button" className="debug-btn debug-btn--sm" onClick={() => onSetTimePreset(360)}>
                          Dawn (06:00)
                        </button>
                        <button type="button" className="debug-btn debug-btn--sm" onClick={() => onSetTimePreset(720)}>
                          Midday (12:00)
                        </button>
                        <button type="button" className="debug-btn debug-btn--sm" onClick={() => onSetTimePreset(1080)}>
                          Dusk (18:00)
                        </button>
                        <button type="button" className="debug-btn debug-btn--sm" onClick={() => onSetTimePreset(0)}>
                          Midnight (00:00)
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <div className="debug-section">
                  <div className="debug-section-title">
                    <span>Weather System</span>
                    <span className="debug-grid-value">{snapshot.weatherType}</span>
                  </div>
                  <div className="debug-button-group" style={{ marginBottom: "8px" }}>
                    <button type="button" className="debug-btn debug-btn--primary" onClick={onToggleWeather}>
                      Toggle Weather Cycle
                    </button>
                  </div>
                  <div className="debug-button-group">
                    {WEATHER_OPTIONS.map((w) => (
                      <button
                        key={w.tag}
                        type="button"
                        className={`debug-btn debug-btn--sm ${snapshot.weatherType === w.tag ? "is-active" : ""}`}
                        onClick={() => {
                          if (onSetWeather) onSetWeather(w.tag);
                          else onToggleWeather();
                        }}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {activeTab === "player" && (
              <>
                <div className="debug-section">
                  <div className="debug-section-title">Work Capacity & Stamina</div>
                  <div className="debug-button-group">
                    {onRefillWork && (
                      <button type="button" className="debug-btn debug-btn--primary" onClick={onRefillWork}>
                        Refill Work (Max 300)
                      </button>
                    )}
                  </div>
                </div>

                <div className="debug-section">
                  <div className="debug-section-title">Economy & Wealth</div>
                  <div className="debug-button-group">
                    <button type="button" className="debug-btn" onClick={() => onGrantMoney(100)}>
                      +100 Gold
                    </button>
                    <button type="button" className="debug-btn" onClick={() => onGrantMoney(500)}>
                      +500 Gold
                    </button>
                    <button type="button" className="debug-btn debug-btn--primary" onClick={() => onGrantMoney(1000)}>
                      +1,000 Gold
                    </button>
                  </div>
                </div>
              </>
            )}

            {activeTab === "teleport" && (
              <>
                {TELEPORT_GROUPS.map((group) => (
                  <div key={group.title} className="debug-section">
                    <div className="debug-section-title">{group.title}</div>
                    <div className="debug-button-group">
                      {group.points.map((pt) => (
                        <button
                          key={pt.label}
                          type="button"
                          className="debug-btn debug-btn--sm"
                          onClick={() => onTeleport?.(pt.x, pt.z, pt.yaw)}
                        >
                          {pt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                {onTeleport && (
                  <div className="debug-section">
                    <div className="debug-section-title">Custom Coordinates</div>
                    <form className="debug-input-row" onSubmit={handleCustomTeleport}>
                      <input
                        type="number"
                        className="debug-input"
                        placeholder="X coordinate"
                        value={customX}
                        onChange={(e) => setCustomX(e.target.value)}
                        step="any"
                      />
                      <input
                        type="number"
                        className="debug-input"
                        placeholder="Z coordinate"
                        value={customZ}
                        onChange={(e) => setCustomZ(e.target.value)}
                        step="any"
                      />
                      <button type="submit" className="debug-btn debug-btn--primary debug-btn--sm">
                        Go
                      </button>
                    </form>
                  </div>
                )}
              </>
            )}

            {activeTab === "review" && (
              <>
                <div className="debug-section">
                  <div className="debug-section-title">Fish Spawns</div>
                  <div className="debug-button-group">
                    <button type="button" className="debug-btn debug-btn--primary" onClick={onSpawnSchool}>
                      +School (River Trout)
                    </button>
                    {onSpawnTunaSchool && (
                      <button type="button" className="debug-btn" onClick={onSpawnTunaSchool}>
                        +School (Offshore Tuna)
                      </button>
                    )}
                  </div>
                </div>

                <div className="debug-section">
                  <div className="debug-section-title">Crop Art Review Fixtures</div>
                  <div className="debug-button-group">
                    {onPrepareWheatReview && (
                      <button type="button" className="debug-btn" onClick={onPrepareWheatReview}>
                        Setup Wheat 6-Stage Grid
                      </button>
                    )}
                    {onPrepareTrioReview && (
                      <button type="button" className="debug-btn" onClick={onPrepareTrioReview}>
                        Setup Starter Trio (Wheat, Tomato, Potato)
                      </button>
                    )}
                  </div>
                </div>

                {onToggleLayoutEditor && (
                  <div className="debug-section">
                    <div className="debug-section-title">Layout Editor</div>
                    <button
                      type="button"
                      className={`debug-btn ${layoutEditorActive ? "is-active" : ""}`}
                      onClick={onToggleLayoutEditor}
                    >
                      {layoutEditorActive ? "Exit Layout Editor (F2)" : "Open Layout Editor (F2)"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Retained exact test markup and data contracts required by automated E2E tests */}
      <div data-testid="render-stats" style={{ display: "none" }}>
        Draws: {renderStats.calls} | Triangles: {renderStats.triangles.toLocaleString()} | Points: {renderStats.points.toLocaleString()} | Lines: {renderStats.lines.toLocaleString()}
        <br />Meshes: {renderStats.visibleMeshes} | Shadows: {renderStats.shadowCasters} | Batches: {renderStats.batchedMeshes} | Instances: {renderStats.instancedMeshes}
      </div>
      <div
        data-testid="asset-coverage"
        data-total-assets={assetCoverage.total}
        data-fresh-save-visible={assetCoverage.freshSaveVisible}
        data-static-world={assetCoverage.byDisposition["static-world"]}
        data-dynamic-world={assetCoverage.byDisposition["dynamic-world"]}
        data-conditional-world={assetCoverage.byDisposition["conditional-world"]}
        data-progression-world={assetCoverage.byDisposition["progression-world"]}
        style={{ display: "none" }}
      >
        Assets: {assetCoverage.total} | Fresh: {assetCoverage.freshSaveVisible} | Static: {assetCoverage.byDisposition["static-world"]} | Dynamic: {assetCoverage.byDisposition["dynamic-world"]} | Conditional: {assetCoverage.byDisposition["conditional-world"]} | Progression: {assetCoverage.byDisposition["progression-world"]}
      </div>
    </div>
  );
};
