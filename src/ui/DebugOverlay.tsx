// src/ui/DebugOverlay.tsx
import React from "react";
import { GameMode, GameState } from "../simulation/core/types";

export interface RenderStats {
  calls: number;
  triangles: number;
  points: number;
  lines: number;
}

interface DebugOverlayProps {
  state: GameState;
  mode: GameMode;
  fps: number;
  renderStats: RenderStats;
  onAdvanceHours: (hours: number) => void;
  onGrantMoney: (amount: number) => void;
  onToggleWeather: () => void;
  onSpawnSchool: () => void;
}

export const DebugOverlay: React.FC<DebugOverlayProps> = ({
  state,
  mode,
  fps,
  renderStats,
  onAdvanceHours,
  onGrantMoney,
  onToggleWeather,
  onSpawnSchool
}) => {
  const p = state.player;
  const activeSchoolsCount = Object.keys(state.world.activeSchools).length;
  const activeCropsCount = Object.keys(state.crops).length;

  return (
    <div className="debug-overlay interactive">
      <div><b>[NEVA DIAGNOSTICS]</b> FPS: {fps} | Mode: {mode}</div>
      <div data-testid="render-stats">
        Draws: {renderStats.calls} | Triangles: {renderStats.triangles.toLocaleString()} | Points: {renderStats.points.toLocaleString()} | Lines: {renderStats.lines.toLocaleString()}
      </div>
      <div>Pos: ({p.x.toFixed(1)}, {p.y.toFixed(1)}, {p.z.toFixed(1)}) | Seed: {state.worldSeed}</div>
      <div>Crops: {activeCropsCount} | Schools: {activeSchoolsCount} | Weather: {state.weather.type}</div>
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
