// src/ui/HUD.tsx
import React from "react";
import { GameState } from "../simulation/core/types";

interface HUDProps {
  state: GameState;
  promptText: string | null;
  onOpenInventory: () => void;
  onOpenMarket: () => void;
  onOpenJournal: () => void;
  onOpenExpedition: () => void;
  onQuickSave: () => void;
  onCastFishing: () => void;
  onOpenMenu?: () => void;
}

function formatWeatherType(type: string): string {
  switch (type.toLowerCase()) {
    case "clear":
      return "Clear";
    case "overcast":
      return "Overcast";
    case "light-rain":
    case "light_rain":
      return "Light Rain";
    case "rain":
      return "Rain";
    case "storm":
      return "Storm";
    case "fog":
      return "Fog";
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

export const HUD: React.FC<HUDProps> = ({
  state,
  promptText
}) => {
  const clock = state.clock;
  const player = state.player;

  // Format time & date cleanly
  const hh = String(Math.floor((clock.currentMinute % 1440) / 60)).padStart(2, "0");
  const mm = String(clock.currentMinute % 60).padStart(2, "0");
  const seasonName = clock.season.charAt(0).toUpperCase() + clock.season.slice(1);
  const dayInSeason = ((clock.dayCount - 1) % 30) + 1;

  const energyPercent = Math.round((player.workCapacity.current / player.workCapacity.maximum) * 100);

  return (
    <>
      {/* Top Left: Clock & Weather Badge */}
      <div className="hud-badge hud-top-left interactive">
        <div className="hud-badge-primary">
          <span className="hud-date-text">{`${seasonName} ${dayInSeason}`}</span>
          <span className="hud-dot">·</span>
          <span className="hud-time-text">{`${hh}:${mm}`}</span>
        </div>
        <div className="hud-badge-secondary">
          <span>{`${formatWeatherType(state.weather.type)} · ${Math.round(state.weather.temperatureC)}°C`}</span>
        </div>
      </div>

      {/* Top Right: Gold & Work Capacity */}
      <div className="hud-top-right interactive">
        <div className="hud-badge hud-gold-badge">
          <span className="gold-icon">🪙</span>
          <span className="hud-gold-amount">{player.money.toLocaleString()} G</span>
        </div>
        <div
          className="hud-badge hud-work-badge"
          title={`Work Capacity: ${Math.round(player.workCapacity.current)} / ${player.workCapacity.maximum}`}
        >
          <span className="hud-work-label">WORK</span>
          <div className="energy-bar-container">
            <div className="energy-bar-fill" style={{ width: `${energyPercent}%` }} />
          </div>
        </div>
      </div>

      {/* Bottom Center: Contextual Action Prompt & Hotkey Hints */}
      <div className="hud-bottom-center">
        {state.basicFishing && (
          <div className="interaction-prompt" role="status">
            {state.basicFishing.phase === "casting"
              ? "Casting…"
              : state.basicFishing.phase === "bite"
                ? "A fish is biting…"
                : "Waiting for a bite…"}
          </div>
        )}
        {promptText && (
          <div className="interaction-prompt">
            {promptText}
          </div>
        )}
        <div className="hud-hotkey-hints interactive">
          <span className="hotkey-chip"><kbd>I</kbd> Inventory</span>
          <span className="hotkey-chip"><kbd>J</kbd> Journal</span>
          <span className="hotkey-chip"><kbd>ESC</kbd> Menu</span>
        </div>
      </div>
    </>
  );
};

