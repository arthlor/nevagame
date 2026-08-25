// src/ui/HUD.tsx
import React, { useMemo, useState } from "react";
import { GameState, FishCargoState } from "../simulation/core/types";
import { PLAYER_TRAVERSAL_TUNING } from "../simulation/navigation/PlayerTraversal";
import { ContentRegistry } from "../content/ContentRegistry";
import {
  IconCoin,
  IconEnergy,
  IconMoon,
  IconDawn,
  IconDusk,
  IconWeatherClear,
  IconWeatherOvercast,
  IconWeatherLightRain,
  IconWeatherRain,
  IconWeatherStorm,
  IconWeatherFog,
  IconWind,
  IconFish,
  IconBoat,
  IconWarning
} from "./components/HudIcons";
import { FarmForecastPopover } from "./components/FarmForecastPopover";
import type { ActiveQuestDto } from "../simulation/core/QuestTypes";
import { QuestTrackerHUD } from "./QuestTrackerHUD";

export interface HUDProps {
  state: GameState;
  activeQuest?: ActiveQuestDto | null;
  promptText: string | null;
  toastMessage?: string | null;
  activeToolSlot?: number;
  onSelectToolSlot?: (slot: number) => void;
  onOpenInventory: () => void;
  onOpenMarket: () => void;
  onOpenJournal: () => void;
  onOpenMap: () => void;
  onOpenLedger: () => void;
  onOpenExpedition: () => void;
  onQuickSave: () => void;
  onCastFishing: () => void;
  onOpenMenu?: () => void;
}

function formatWeatherLabel(type: string): string {
  switch (type.toLowerCase()) {
    case "clear":
      return "Clear Sky";
    case "overcast":
      return "Overcast";
    case "light-rain":
    case "light_rain":
      return "Light Rain";
    case "rain":
      return "Steady Rain";
    case "storm":
      return "Gale Storm";
    case "fog":
      return "Dense Fog";
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

function getWeatherIcon(type: string, hour: number) {
  switch (type.toLowerCase()) {
    case "clear":
      return hour >= 5 && hour < 8 ? <IconDawn size={16} /> : hour >= 8 && hour < 18 ? <IconWeatherClear size={16} /> : hour >= 18 && hour < 21 ? <IconDusk size={16} /> : <IconMoon size={16} />;
    case "overcast":
      return <IconWeatherOvercast size={16} />;
    case "light-rain":
    case "light_rain":
      return <IconWeatherLightRain size={16} />;
    case "rain":
      return <IconWeatherRain size={16} />;
    case "storm":
      return <IconWeatherStorm size={16} />;
    case "fog":
      return <IconWeatherFog size={16} />;
    default:
      return <IconWeatherClear size={16} />;
  }
}

function getSeasonIcon(season: string) {
  switch (season.toLowerCase()) {
    case "spring":
      return "🌱";
    case "summer":
      return "☀️";
    case "autumn":
      return "🍂";
    case "winter":
      return "❄️";
    default:
      return "🌱";
  }
}

export const HUD: React.FC<HUDProps> = ({
  state,
  promptText,
  toastMessage,
  activeToolSlot = 1,
  onSelectToolSlot,
  onOpenInventory,
  onOpenJournal,
  onOpenMap,
  onOpenLedger,
  onOpenExpedition,
  activeQuest,
  onOpenMenu
}) => {
  const [showForecast, setShowForecast] = useState(false);
  const { clock, player, weather } = state;

  const sprintStamina = player.traversal.sprintStamina;
  const sprintMaximum = PLAYER_TRAVERSAL_TUNING.maximumSprintStamina;
  const sprintPercent = Math.max(0, Math.min(100, (sprintStamina / sprintMaximum) * 100));
  const showSprintStamina =
    !player.activeBoatId &&
    !state.basicFishing &&
    !state.sportFishing &&
    (sprintStamina < sprintMaximum - 0.01 || player.traversal.sprintExhausted);

  // Time & Calendar
  const hour = Math.floor((clock.currentMinute % 1440) / 60);
  const minute = clock.currentMinute % 60;
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  const seasonName = clock.season.charAt(0).toUpperCase() + clock.season.slice(1);
  const dayInSeason = ((clock.dayCount - 1) % 30) + 1;

  // Severe weather alert
  const severeAlert = useMemo(() => {
    if (weather.type === "storm") return { text: "Gale Storm Alert", tone: "danger" };
    if (weather.type === "fog" && weather.visibility < 0.5) return { text: "Low Visibility Fog", tone: "caution" };
    if (weather.windSpeed >= 11) return { text: "High Winds", tone: "caution" };
    if (weather.seaRoughness >= 0.7) return { text: "Rough Swell", tone: "caution" };
    return null;
  }, [weather]);

  // Work Capacity (Labor resource)
  const workCurrent = Math.round(player.workCapacity.current);
  const workMax = player.workCapacity.maximum;
  const workPercent = Math.max(0, Math.min(100, (workCurrent / workMax) * 100));
  const showWorkAlert = workCurrent < 20;

  // Active Boat & Physical Cargo
  const activeBoat = player.activeBoatId ? state.boats[player.activeBoatId] : null;
  const boatDef = activeBoat ? ContentRegistry.boats.get(activeBoat.boatTypeId) : null;
  const boatCargoSlots = activeBoat
    ? activeBoat.fishCargoSlotIds.map((cargoId) => (cargoId ? state.fishCargo[cargoId] ?? null : null))
    : [];

  // Player carried cargo
  const carriedFish = player.carriedFishCargoId ? state.fishCargo[player.carriedFishCargoId] : null;
  const carriedDef = carriedFish ? ContentRegistry.fishSpecies.get(carriedFish.speciesId) : null;

  return (
    <>
      {/* 1. Top-Left: Low-Chrome Weather & Time Header */}
      <header className="hud-badge hud-top-left interactive" aria-label="Game clock and weather">
        <div className="hud-calendar-row" onClick={() => setShowForecast((prev) => !prev)} style={{ cursor: "pointer" }} title="Click for 3-Day Farm Forecast">
          <span className={`season-tag season-${clock.season.toLowerCase()}`}>
            <span className="season-icon" aria-hidden="true">{getSeasonIcon(clock.season)}</span>
            <span className="hud-date-text">{seasonName} {dayInSeason}</span>
          </span>
          <span className="hud-dot" aria-hidden="true">·</span>
          <div className="hud-time-badge">
            <span className="hud-time-icon" aria-hidden="true">{getWeatherIcon(weather.type, hour)}</span>
            <span className="hud-time-text">{hh}:{mm}</span>
          </div>
        </div>

        <div className="hud-weather-row" onClick={() => setShowForecast((prev) => !prev)} style={{ cursor: "pointer" }} title="Click for 3-Day Farm Forecast">
          <span className="hud-weather-text">{formatWeatherLabel(weather.type)}</span>
          <span className="hud-dot" aria-hidden="true">·</span>
          <span className="hud-temp-text">{Math.round(weather.temperatureC)}°C</span>
          <span className="hud-dot" aria-hidden="true">·</span>
          <span className="hud-wind-text">
            <IconWind size={12} className="hud-inline-icon" />
            {Math.round(weather.windSpeed)} m/s
          </span>
        </div>

        {severeAlert && (
          <div className={`hud-weather-alert alert-${severeAlert.tone}`} role="status">
            <IconWarning size={12} className="hud-alert-icon" />
            <span>{severeAlert.text}</span>
          </div>
        )}

        {/* 3-Day Forecast Dropdown */}
        {showForecast && (
          <FarmForecastPopover
            weather={weather}
            clock={clock}
            farmingProficiency={player.proficiencies.farming ?? 0}
            onClose={() => setShowForecast(false)}
          />
        )}
      </header>

      {(activeQuest || state.quests.unlockedFeatureIds.includes("feature.expedition_planner")) && (
        <QuestTrackerHUD activeQuest={activeQuest ?? null} />
      )}

      {/* 2. Top-Center: Discreet Event Toasts */}
      {toastMessage && (
        <aside className="hud-toast-container" role="status" aria-live="polite">
          <div className="hud-toast-pill">
            <span className="toast-sparkle" aria-hidden="true">✨</span>
            <span className="toast-message-text">{toastMessage}</span>
          </div>
        </aside>
      )}

      {/* 3. Top-Right: Gold Currency & Compact Navigation Pill Bar */}
      <nav className="hud-top-right interactive" aria-label="Player wealth and quick navigation">
        <div className="hud-vitals-group">
          {/* Gold Badge */}
          <div className="hud-badge hud-gold-badge" title="Liquid Gold balance">
            <IconCoin size={16} className="gold-icon" />
            <span className="hud-gold-amount">{player.money.toLocaleString()} G</span>
          </div>
        </div>

        {/* Minimalist Hotkey Navigation Bar */}
        <div className="hud-quick-actions">
          <button
            type="button"
            className="hud-action-btn"
            onClick={onOpenMap}
            title="Regional Map (M)"
            aria-label="Regional Map"
          >
            <span>Map</span>
            <kbd>M</kbd>
          </button>

          <button
            type="button"
            className="hud-action-btn"
            onClick={onOpenLedger}
            title="Logistics & P&L Ledger (L)"
            aria-label="Merchant Ledger"
          >
            <span>Ledger</span>
            <kbd>L</kbd>
          </button>

          <button
            type="button"
            className="hud-action-btn"
            onClick={onOpenJournal}
            title="Captain's Logbook & Quests (J)"
            aria-label="Captain's Journal"
          >
            <span>Journal</span>
            <kbd>J</kbd>
          </button>

          <button
            type="button"
            className="hud-action-btn"
            onClick={onOpenInventory}
            title="Backpack Inventory (I)"
            aria-label="Backpack Inventory"
          >
            <span>Pack</span>
            <kbd>I</kbd>
          </button>

          {state.quests.unlockedFeatureIds.includes("feature.expedition_planner") && (
            <button
              type="button"
              className="hud-action-btn"
              onClick={onOpenExpedition}
              title="Expedition Planner (P)"
              aria-label="Expedition Planner"
            >
              <span>Plan</span>
              <kbd>P</kbd>
            </button>
          )}

          {onOpenMenu && (
            <button
              type="button"
              className="hud-action-btn hud-action-btn-menu"
              onClick={onOpenMenu}
              title="Pause Menu (ESC)"
              aria-label="Pause Menu"
            >
              <kbd>ESC</kbd>
            </button>
          )}
        </div>
      </nav>

      {/* 4. Active Boat Driving HUD */}
      {activeBoat && boatDef && (
        <section className="hud-boat-panel interactive" aria-label="Boat driving status">
          <header className="boat-panel-header">
            <IconBoat size={16} className="boat-header-icon" />
            <div className="boat-header-meta">
              <strong>{boatDef.name}</strong>
              <span>{Math.round(activeBoat.speed * 1.944)} kn · {weather.seaRoughness < 0.35 ? "Calm Waters" : weather.seaRoughness < 0.7 ? "Moderate Swell" : "Rough Sea"}</span>
            </div>
          </header>

          <div className="boat-status-bars">
            <div className="boat-meter-row">
              <span className="boat-meter-label">Hull Condition</span>
              <span className="boat-meter-val">{Math.round(activeBoat.durability)}%</span>
            </div>
            <div className="boat-bar-track">
              <div
                className={`boat-bar-fill ${activeBoat.durability < 30 ? "is-low" : ""}`}
                style={{ width: `${Math.max(0, Math.min(100, activeBoat.durability))}%` }}
              />
            </div>
          </div>

          {/* Physical Cargo Bay Grid */}
          <div className="boat-cargo-bay">
            <div className="boat-cargo-title">
              <span>Hold Cargo</span>
              <span className="boat-cargo-count">
                {boatCargoSlots.filter(Boolean).length}/{boatCargoSlots.length}
              </span>
            </div>
            <div className="boat-cargo-grid">
              {boatCargoSlots.map((cargo: FishCargoState | null, index: number) => {
                if (!cargo) {
                  return (
                    <div key={`cargo-slot-${index}`} className="boat-cargo-slot is-empty">
                      <span className="cargo-empty-label">Slot 0{index + 1} Empty</span>
                    </div>
                  );
                }
                const fishDef = ContentRegistry.fishSpecies.get(cargo.speciesId);
                const freshnessColor = cargo.freshness > 65 ? "fresh" : cargo.freshness > 35 ? "medium" : "stale";
                return (
                  <div key={cargo.id || `cargo-${index}`} className="boat-cargo-slot is-filled">
                    <div className="cargo-slot-icon">
                      <IconFish size={14} />
                    </div>
                    <div className="cargo-slot-details">
                      <strong>{fishDef?.name ?? "Sport Fish"}</strong>
                      <div className="cargo-slot-sub">
                        <span>{cargo.weightKg.toFixed(1)} kg</span>
                        <span className={`cargo-quality-tag quality-${cargo.quality}`}>{cargo.quality}</span>
                      </div>
                      <div className="cargo-freshness-track" title={`Freshness: ${Math.round(cargo.freshness)}%`}>
                        <div
                          className={`cargo-freshness-fill freshness-${freshnessColor}`}
                          style={{ width: `${Math.round(cargo.freshness)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* 5. Bottom-Left: Tool Quickbar & Contextual Work Capacity */}
      <aside className="hud-bottom-left interactive" aria-label="Tool Quickbar and Labor Vitals">
        {/* Sprint Stamina — stacks above the quickbar */}
        {showSprintStamina && (
          <div
            className={`sprint-stamina${player.traversal.sprintExhausted ? " sprint-stamina-winded" : ""}`}
            data-testid="sprint-stamina"
            role="progressbar"
            aria-label="Sprint stamina"
            aria-valuemin={0}
            aria-valuemax={sprintMaximum}
            aria-valuenow={Math.round(sprintStamina)}
          >
            <div className="sprint-stamina-label">
              <span>Sprint Stamina</span>
              {player.traversal.sprintExhausted ? (
                <span className="winded-tag">Winded</span>
              ) : (
                <span>{Math.round(sprintPercent)}%</span>
              )}
            </div>
            <div className="sprint-stamina-track">
              <span style={{ width: `${sprintPercent}%` }} />
            </div>
          </div>
        )}

        <div className="hud-quickbar-dock" role="toolbar" aria-label="Tool Belt">
          <button
            type="button"
            className={`quickbar-slot ${activeToolSlot === 1 ? "is-active" : ""}`}
            onClick={() => onSelectToolSlot?.(1)}
            title="Primary Tool / Hoe (1)"
          >
            <kbd className="slot-num">1</kbd>
            <span className="slot-label">Tool</span>
          </button>
          <button
            type="button"
            className={`quickbar-slot ${activeToolSlot === 2 ? "is-active" : ""}`}
            onClick={() => onSelectToolSlot?.(2)}
            title="Seeds & Planting (2)"
          >
            <kbd className="slot-num">2</kbd>
            <span className="slot-label">Seed</span>
          </button>
          <button
            type="button"
            className={`quickbar-slot ${activeToolSlot === 3 ? "is-active" : ""}`}
            onClick={() => onSelectToolSlot?.(3)}
            title="Watering Can (3)"
          >
            <kbd className="slot-num">3</kbd>
            <span className="slot-label">Water</span>
          </button>
          <button
            type="button"
            className={`quickbar-slot ${activeToolSlot === 4 ? "is-active" : ""}`}
            onClick={() => onSelectToolSlot?.(4)}
            title="Fishing Bait (4)"
          >
            <kbd className="slot-num">4</kbd>
            <span className="slot-label">Bait</span>
          </button>
          <button
            type="button"
            className={`quickbar-slot ${activeToolSlot === 5 ? "is-active" : ""}`}
            onClick={() => onSelectToolSlot?.(5)}
            title="Fishing Rod (5)"
          >
            <kbd className="slot-num">5</kbd>
            <span className="slot-label">Rod</span>
          </button>
        </div>

        {/* Contextual Work Capacity Bar */}
        <div
          className={`hud-work-pill ${showWorkAlert ? "is-depleted" : ""}`}
          title={`Work Capacity: ${workCurrent} / ${workMax} (Labor resource)`}
        >
          <div className="work-pill-meta">
            <IconEnergy size={12} className="work-icon" />
            <span className="work-text">Labor {workCurrent}/{workMax}</span>
          </div>
          <div className="work-bar-track">
            <div className="work-bar-fill" style={{ width: `${workPercent}%` }} />
          </div>
        </div>
      </aside>

      {/* 6. Bottom-Right: Contextual Carry Weight / Physical Cargo Pill */}
      {carriedFish && carriedDef && (
        <aside className="hud-bottom-right interactive" aria-label="Carried physical cargo">
          <div className="cargo-carried-pill">
            <div className="cargo-carried-icon">
              <IconFish size={18} />
            </div>
            <div className="cargo-carried-meta">
              <span className="cargo-carried-kicker">CARRYING CARGO</span>
              <strong className="cargo-carried-title">{carriedDef.name}</strong>
              <div className="cargo-carried-sub">
                <span>{carriedFish.weightKg.toFixed(1)} kg</span>
                <span className="dot-sep">·</span>
                <span className="fresh-val">{Math.round(carriedFish.freshness)}% Fresh</span>
              </div>
            </div>
          </div>
        </aside>
      )}



      {/* 8. Bottom-Center: Contextual Action Prompt */}
      <footer className="hud-bottom-center" aria-label="Contextual interactions">
        {state.basicFishing && (
          <div className={`interaction-prompt fishing-phase-prompt phase-${state.basicFishing.phase}`} role="status">
            {state.basicFishing.phase === "charging-cast" ? (
              <span className="fishing-prompt-text">🎣 Charging cast power… Release to throw</span>
            ) : state.basicFishing.phase === "bite-reaction" || (state.basicFishing.phase as string) === "bite" ? (
              <span className="fishing-prompt-text is-bite-alert">✨ ! BITE ! Hook the fish [Space] / [Click]!</span>
            ) : state.basicFishing.phase === "minigame" ? (
              <span className="fishing-prompt-text">🐟 Reeling: Hold [Space / LMB] to keep bar on fish!</span>
            ) : state.basicFishing.phase === "caught" ? (
              <span className="fishing-prompt-text">🎉 Catch Landed! Press [Space] to collect.</span>
            ) : state.basicFishing.phase === "escaped" ? (
              <span className="fishing-prompt-text">💨 The fish got away…</span>
            ) : (
              <span className="fishing-prompt-text">🌊 Bobber in water… Waiting for a bite</span>
            )}
          </div>
        )}

        {promptText && (
          <div className="interaction-prompt">
            <span className="prompt-text-content">{promptText}</span>
          </div>
        )}

        <div className="hud-hotkey-hints interactive">
          {activeBoat ? (
            <>
              <span className="hotkey-chip"><kbd>W</kbd><kbd>S</kbd> Throttle</span>
              <span className="hotkey-chip"><kbd>A</kbd><kbd>D</kbd> Steer</span>
              <span className="hotkey-chip"><kbd>E</kbd> Dock</span>
              <span className="hotkey-chip"><kbd>M</kbd> Map</span>
              <span className="hotkey-chip"><kbd>L</kbd> Ledger</span>
            </>
          ) : (
            <>
              <span className="hotkey-chip"><kbd>WASD</kbd> Move</span>
              <span className="hotkey-chip"><kbd>Shift</kbd> Sprint</span>
              <span className="hotkey-chip"><kbd>E</kbd> Interact</span>
              <span className="hotkey-chip"><kbd>Alt</kbd> Soil GIS</span>
              <span className="hotkey-chip"><kbd>M</kbd> Map</span>
              <span className="hotkey-chip"><kbd>L</kbd> Ledger</span>
            </>
          )}
        </div>
      </footer>
    </>
  );
};
