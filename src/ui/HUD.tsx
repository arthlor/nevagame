// src/ui/HUD.tsx
import React, { useMemo, useState } from "react";
import { GameState, FishCargoState } from "../simulation/core/types";
import { PLAYER_TRAVERSAL_TUNING } from "../simulation/navigation/PlayerTraversal";
import { ContentRegistry } from "../content/ContentRegistry";
import {
  IconCoin,
  IconEnergy,
  IconBackpack,
  IconJournal,
  IconLedger,
  IconExpedition,
  IconCompass,
  IconMenu,
  IconHoe,
  IconWateringCan,
  IconPickaxe,
  IconBait,
  IconBasket,
  IconSprout,
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
  IconThermometer,
  IconWave,
  IconFish,
  IconBoat,
  IconWarning
} from "./components/HudIcons";
import {
  CornerLeafSprout,
  CornerRopeKnot,
  OrnateDivider,
  KeycapBadge
} from "./components/HudDecorations";
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
  isPlacementActive?: boolean;
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
      return hour >= 5 && hour < 8 ? (
        <IconDawn size={18} />
      ) : hour >= 8 && hour < 18 ? (
        <IconWeatherClear size={18} />
      ) : hour >= 18 && hour < 21 ? (
        <IconDusk size={18} />
      ) : (
        <IconMoon size={18} />
      );
    case "overcast":
      return <IconWeatherOvercast size={18} />;
    case "light-rain":
    case "light_rain":
      return <IconWeatherLightRain size={18} />;
    case "rain":
      return <IconWeatherRain size={18} />;
    case "storm":
      return <IconWeatherStorm size={18} />;
    case "fog":
      return <IconWeatherFog size={18} />;
    default:
      return <IconWeatherClear size={18} />;
  }
}

function getWeatherConditionIcon(type: string, size = 15) {
  switch (type.toLowerCase()) {
    case "clear":
      return <IconWeatherClear size={size} className="hud-weather-icon" />;
    case "overcast":
      return <IconWeatherOvercast size={size} className="hud-weather-icon" />;
    case "light-rain":
    case "light_rain":
      return <IconWeatherLightRain size={size} className="hud-weather-icon" />;
    case "rain":
      return <IconWeatherRain size={size} className="hud-weather-icon" />;
    case "storm":
      return <IconWeatherStorm size={size} className="hud-weather-icon" />;
    case "fog":
      return <IconWeatherFog size={size} className="hud-weather-icon" />;
    default:
      return <IconWeatherClear size={size} className="hud-weather-icon" />;
  }
}

export const HUD: React.FC<HUDProps> = ({
  state,
  promptText,
  toastMessage,
  activeToolSlot = 1,
  onSelectToolSlot,
  onOpenInventory,
  onOpenMarket,
  onOpenJournal,
  onOpenMap,
  onOpenLedger,
  onOpenExpedition,
  activeQuest,
  onOpenMenu,
  isPlacementActive = false
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

  // Backpack capacity (slots used / total slots)
  const playerInv = state.inventories[player.inventoryId];
  const filledSlots = playerInv
    ? playerInv.slots.filter((s) => s.itemId !== null && (s.quantity ?? 0) > 0).length
    : 0;
  const totalSlots = playerInv ? playerInv.slots.length : 16;

  // Active Boat & Physical Cargo
  const activeBoat = player.activeBoatId ? state.boats[player.activeBoatId] : null;
  const boatDef = activeBoat ? ContentRegistry.boats.get(activeBoat.boatTypeId) : null;
  const boatCargoSlots = activeBoat
    ? activeBoat.fishCargoSlotIds.map((cargoId) => (cargoId ? state.fishCargo[cargoId] ?? null : null))
    : [];

  // Player carried cargo
  const carriedFish = player.carriedFishCargoId ? state.fishCargo[player.carriedFishCargoId] : null;
  const carriedDef = carriedFish ? ContentRegistry.fishSpecies.get(carriedFish.speciesId) : null;

  // Parse prompt text for keycaps (e.g. "[E] Interact" or "[E / Click] Plant Wheat")
  const parsedPrompt = useMemo(() => {
    if (!promptText) return null;
    if (toastMessage && promptText.trim() === toastMessage.trim()) return null;
    const match = promptText.match(/^\[(.*?)\]\s*(.*)$/);
    if (match) {
      return { key: match[1], label: match[2] };
    }
    if (promptText.startsWith("Equipped:") || promptText.startsWith("Saved") || promptText.startsWith("✨")) {
      return null;
    }
    return { key: "E", label: promptText };
  }, [promptText, toastMessage]);

  return (
    <>
      {/* =========================================================================
          1. TOP-LEFT: ATMOSPHERE, CALENDAR & QUEST TRACKER CONTAINER (Reference Top-Left)
          ========================================================================= */}
      <div className="hud-top-left-container interactive">
        <header
          className="hud-diegetic-panel hud-top-left"
          aria-label="Game clock, calendar, and weather"
        >
          <CornerLeafSprout className="panel-corner-tl" size={28} />
          <CornerRopeKnot className="panel-corner-br" size={28} />

          <div
            className="hud-weather-card-inner"
            onClick={() => setShowForecast((prev) => !prev)}
            title="Click to open 3-Day Farm Forecast"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setShowForecast((prev) => !prev);
              }
            }}
          >
            {/* Top Row: Season & Time */}
            <div className="hud-header-row hud-calendar-row">
              <div className="hud-season-group">
                <IconSprout size={18} className="hud-sprout-icon" />
                <span className="hud-season-text">{seasonName} {dayInSeason}</span>
              </div>

              <div className="hud-time-group">
                <span className="hud-time-icon">{getWeatherIcon(weather.type, hour)}</span>
                <span className="hud-time-text">{hh}:{mm}</span>
              </div>
            </div>

            <OrnateDivider />

            {/* Bottom Row: Weather, Temperature & Wind */}
            <div className="hud-header-row hud-weather-row">
              <div className="hud-weather-condition">
                {getWeatherConditionIcon(weather.type, 15)}
                <span className="hud-weather-name">{formatWeatherLabel(weather.type)}</span>
              </div>

              <div className="hud-weather-metrics">
                <span className="hud-metric-item" title="Temperature">
                  <IconThermometer size={14} className="hud-metric-icon" />
                  <span>{Math.round(weather.temperatureC)}°C</span>
                </span>

                <span className="hud-metric-item" title="Wind speed">
                  <IconWind size={14} className="hud-metric-icon" />
                  <span>{Math.round(weather.windSpeed)} m/s</span>
                </span>

                {weather.seaRoughness > 0.4 && (
                  <span className="hud-metric-item" title="Sea Swell">
                    <IconWave size={14} className="hud-metric-icon" />
                  </span>
                )}
              </div>
            </div>
          </div>

          {severeAlert && (
            <div className={`hud-weather-alert alert-${severeAlert.tone}`} role="status">
              <IconWarning size={14} className="hud-alert-icon" />
              <span>{severeAlert.text}</span>
            </div>
          )}
        </header>

        {/* Quest Tracker underneath Top-Left Header */}
        {(activeQuest || state.quests.unlockedFeatureIds.includes("feature.expedition_planner")) && (
          <QuestTrackerHUD activeQuest={activeQuest ?? null} />
        )}

        {/* 3-Day Forecast Popover anchored beside Top-Left Column */}
        {showForecast && (
          <FarmForecastPopover
            weather={weather}
            clock={clock}
            onClose={() => setShowForecast(false)}
          />
        )}
      </div>

      {/* 2. Top-Center: Discreet Event Toasts */}
      {toastMessage && (
        <aside className="hud-toast-container" role="status" aria-live="polite">
          <div className="hud-toast-pill">
            <span className="toast-sparkle" aria-hidden="true">✨</span>
            <span className="toast-message-text">{toastMessage}</span>
          </div>
        </aside>
      )}

      {/* =========================================================================
          3. TOP-RIGHT: STATUS BADGES & WOODEN NAVIGATION ROW (Reference Top-Right)
          ========================================================================= */}
      <nav className="hud-top-right interactive" aria-label="Player wealth and quick navigation">
        {/* Top Badges Row */}
        <div className="hud-vitals-plaques">
          {/* Purse Plaque */}
          <div
            className="hud-plaque hud-plaque-purse"
            title="Purse Balance"
            onClick={onOpenMarket}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenMarket();
              }
            }}
          >
            <CornerLeafSprout className="plaque-corner-tl" size={16} />
            <CornerRopeKnot className="plaque-corner-br" size={16} />
            <div className="hud-plaque-content">
              <IconCoin size={22} className="hud-plaque-icon" />
              <strong className="hud-gold-text">{player.money.toLocaleString()} G</strong>
            </div>
          </div>

          {/* Work Capacity Plaque */}
          <div
            className={`hud-plaque hud-plaque-work ${showWorkAlert ? "is-depleted" : ""}`}
            title={`Work Capacity: ${workCurrent} / ${workMax}`}
          >
            <CornerLeafSprout className="plaque-corner-tl" size={16} />
            <CornerRopeKnot className="plaque-corner-br" size={16} />
            <div className="hud-plaque-content">
              <div className="hud-work-top-row">
                <IconEnergy size={18} className="hud-work-icon" />
                <span className="hud-work-label">Work {workCurrent}/{workMax}</span>
              </div>
              <div className="hud-work-progress-track">
                <div
                  className="hud-work-progress-fill"
                  style={{ width: `${workPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Backpack Plaque */}
          <div
            className="hud-plaque hud-plaque-pack"
            title="Backpack Inventory (I)"
            onClick={onOpenInventory}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenInventory();
              }
            }}
          >
            <CornerLeafSprout className="plaque-corner-tl" size={16} />
            <CornerRopeKnot className="plaque-corner-br" size={16} />
            <div className="hud-plaque-content">
              <IconBackpack size={20} className="hud-pack-icon" />
              <strong className="hud-pack-count">{filledSlots}/{totalSlots}</strong>
            </div>
          </div>

          {/* Carried Physical Cargo Plaque (if carrying fish) */}
          {carriedFish && carriedDef && (
            <div
              className="hud-plaque hud-plaque-cargo"
              title={`Carrying ${carriedDef.name} (${Math.round(carriedFish.freshness)}% fresh)`}
            >
              <CornerLeafSprout className="plaque-corner-tl" size={16} />
              <CornerRopeKnot className="plaque-corner-br" size={16} />
              <div className="hud-plaque-content">
                <IconFish size={18} className="hud-cargo-icon" />
                <div className="hud-cargo-copy">
                  <span className="hud-cargo-title">{carriedFish.weightKg.toFixed(1)}kg {carriedDef.name}</span>
                  <div className="hud-cargo-bar">
                    <div
                      className="hud-cargo-fill"
                      style={{ width: `${Math.round(carriedFish.freshness)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Action Buttons Row */}
        <div className="hud-navigation-bar" role="toolbar" aria-label="Field navigation tabs">
          <button
            type="button"
            className="hud-wood-btn"
            onClick={onOpenJournal}
            aria-label="Captain's Journal"
          >
            <IconJournal size={15} className="btn-icon" />
            <span className="btn-text">Journal</span>
            <KeycapBadge keyName="J" />
          </button>

          <button
            type="button"
            className="hud-wood-btn"
            onClick={onOpenMap}
            aria-label="World Map"
          >
            <IconCompass size={15} className="btn-icon" />
            <span className="btn-text">Map</span>
            <KeycapBadge keyName="M" />
          </button>

          <button
            type="button"
            className="hud-wood-btn"
            onClick={onOpenLedger}
            aria-label="Merchant Ledger"
          >
            <IconLedger size={15} className="btn-icon" />
            <span className="btn-text">Ledger</span>
            <KeycapBadge keyName="L" />
          </button>

          {state.quests.unlockedFeatureIds.includes("feature.expedition_planner") && (
            <button
              type="button"
              className="hud-wood-btn"
              onClick={onOpenExpedition}
              aria-label="Expedition Planner"
            >
              <IconExpedition size={15} className="btn-icon" />
              <span className="btn-text">Board</span>
              <KeycapBadge keyName="P" />
            </button>
          )}

          {onOpenMenu && (
            <button
              type="button"
              className="hud-wood-btn hud-wood-btn-menu"
              onClick={onOpenMenu}
              aria-label="Game Menu"
            >
              <IconMenu size={16} className="btn-icon" />
              <KeycapBadge keyName="ESC" />
            </button>
          )}
        </div>
      </nav>

      {/* =========================================================================
          4. BOAT DRIVING HUD (Offshore Navigation)
          ========================================================================= */}
      {activeBoat && boatDef && (
        <section className="hud-diegetic-panel hud-boat-panel interactive" aria-label="Boat driving status">
          <CornerLeafSprout className="panel-corner-tl" size={24} />
          <CornerRopeKnot className="panel-corner-br" size={24} />

          <header className="boat-panel-header">
            <IconBoat size={18} className="boat-header-icon" />
            <div className="boat-header-meta">
              <strong>{boatDef.name}</strong>
              <span>
                {Math.round(activeBoat.speed * 1.944)} kn ·{" "}
                {weather.seaRoughness < 0.35 ? "Calm Waters" : weather.seaRoughness < 0.7 ? "Moderate Swell" : "Rough Sea"}
              </span>
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

      {/* =========================================================================
          5. BOTTOM-LEFT: WOODEN QUICKBAR & SPRINT STAMINA (Reference Bottom-Left)
          ========================================================================= */}
      <aside className="hud-bottom-left interactive" aria-label="Tool Quickbar">
        {/* Sprint Stamina floating above quickbar */}
        {showSprintStamina && (
          <div
            className={`sprint-stamina-wood${player.traversal.sprintExhausted ? " sprint-stamina-winded" : ""}`}
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

        {/* Quickbar Dock with Wood Frame & Corner Ornaments */}
        <div className="hud-quickbar-wood-dock" role="toolbar" aria-label="Tool Belt">
          <CornerLeafSprout className="quickbar-corner-tl" size={26} />
          <CornerRopeKnot className="quickbar-corner-br" size={26} />

          {/* Slot 1: Tool / Hoe / Axe */}
          <button
            type="button"
            className={`quickbar-wood-slot ${activeToolSlot === 1 ? "is-active" : ""}`}
            onClick={() => onSelectToolSlot?.(1)}
            title="Primary Tool (1)"
          >
            <span className="slot-num-badge">1</span>
            <IconHoe size={26} className="quickbar-slot-icon" aria-hidden="true" />
          </button>

          {/* Slot 2: Watering Can */}
          <button
            type="button"
            className={`quickbar-wood-slot ${activeToolSlot === 2 ? "is-active" : ""}`}
            onClick={() => onSelectToolSlot?.(2)}
            title="Watering Can (2)"
          >
            <span className="slot-num-badge">2</span>
            <IconWateringCan size={26} className="quickbar-slot-icon" aria-hidden="true" />
          </button>

          {/* Slot 3: Mattock / Pickaxe */}
          <button
            type="button"
            className={`quickbar-wood-slot ${activeToolSlot === 3 ? "is-active" : ""}`}
            onClick={() => onSelectToolSlot?.(3)}
            title="Mattock / Pick (3)"
          >
            <span className="slot-num-badge">3</span>
            <IconPickaxe size={26} className="quickbar-slot-icon" aria-hidden="true" />
          </button>

          {/* Slot 4: Fishing Bait / Net */}
          <button
            type="button"
            className={`quickbar-wood-slot ${activeToolSlot === 4 ? "is-active" : ""}`}
            onClick={() => onSelectToolSlot?.(4)}
            title="Fishing Bait (4)"
          >
            <span className="slot-num-badge">4</span>
            <IconBait size={26} className="quickbar-slot-icon" aria-hidden="true" />
          </button>

          {/* Slot 5: Harvest Basket / Foraging (Reference Slot 5) */}
          <button
            type="button"
            className={`quickbar-wood-slot ${activeToolSlot === 5 ? "is-active" : ""}`}
            onClick={() => onSelectToolSlot?.(5)}
            title="Harvest Basket / Rod (5)"
          >
            <span className="slot-num-badge">5</span>
            <IconBasket size={26} className="quickbar-slot-icon" aria-hidden="true" />
          </button>
        </div>
      </aside>

      {/* =========================================================================
          6. BOTTOM-CENTER: INTERACTION BANNER & HOTKEY RIBBON (Reference Bottom-Center)
          ========================================================================= */}
      {!isPlacementActive && (
        <footer className="hud-bottom-center" aria-label="Contextual interactions">
          {/* Fishing Minigame Cues */}
          {state.basicFishing && (
            <div className={`interaction-wood-banner fishing-phase-banner phase-${state.basicFishing.phase}`} role="status">
              <CornerLeafSprout className="banner-corner-tl" size={22} />
              <CornerRopeKnot className="banner-corner-br" size={22} />
              {state.basicFishing.phase === "charging-cast" ? (
                <span className="banner-text">🎣 Charging cast power… Release to throw</span>
              ) : state.basicFishing.phase === "bite-reaction" || (state.basicFishing.phase as string) === "bite" ? (
                <div className="banner-content-row">
                  <KeycapBadge keyName="Space" />
                  <span className="banner-text is-bite-alert">Hook the fish!</span>
                </div>
              ) : state.basicFishing.phase === "minigame" ? (
                <span className="banner-text">🐟 Reeling: Hold [Space] to keep bar on fish!</span>
              ) : state.basicFishing.phase === "caught" ? (
                <div className="banner-content-row">
                  <KeycapBadge keyName="Space" />
                  <span className="banner-text">Collect Catch</span>
                </div>
              ) : state.basicFishing.phase === "escaped" ? (
                <span className="banner-text">💨 The fish got away…</span>
              ) : (
                <span className="banner-text">🌊 Bobber in water… Waiting for a bite</span>
              )}
            </div>
          )}

          {/* Diegetic Interaction Banner (e.g. [E] Interact / Talk to Elspeth) */}
          {!state.basicFishing && parsedPrompt && (
            <div className="interaction-wood-banner" role="status">
              <CornerLeafSprout className="banner-corner-tl" size={22} />
              <CornerRopeKnot className="banner-corner-br" size={22} />
              <div className="banner-content-row">
                <KeycapBadge keyName={parsedPrompt.key} />
                <span className="banner-text">{parsedPrompt.label}</span>
              </div>
            </div>
          )}

          {/* Subtle Hotkey Ribbon */}
          <div className="hud-hotkey-ribbon-wood interactive">
            {activeBoat ? (
              <>
                <span className="control-note"><KeycapBadge keyName="W/S" /> Throttle</span>
                <span className="control-note"><KeycapBadge keyName="A/D" /> Steer</span>
                <span className="control-note"><KeycapBadge keyName="E" /> Dock</span>
                <span className="control-note"><KeycapBadge keyName="M" /> Map</span>
                <span className="control-note"><KeycapBadge keyName="L" /> Ledger</span>
              </>
            ) : (
              <>
                <span className="control-note"><KeycapBadge keyName="WASD" /> Move</span>
                <span className="control-note"><KeycapBadge keyName="Shift" /> Sprint</span>
                <span className="control-note"><KeycapBadge keyName="E" /> Interact</span>
                <span className="control-note"><KeycapBadge keyName="Alt" /> Soil GIS</span>
                <span className="control-note"><KeycapBadge keyName="M" /> Map</span>
                <span className="control-note"><KeycapBadge keyName="L" /> Ledger</span>
              </>
            )}
          </div>
        </footer>
      )}
    </>
  );
};
