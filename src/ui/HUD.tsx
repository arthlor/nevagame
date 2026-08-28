// src/ui/HUD.tsx
import React, { useEffect, useMemo, useState } from "react";
import { GameState, FishCargoState } from "../simulation/core/types";
import { PLAYER_TRAVERSAL_TUNING } from "../simulation/navigation/PlayerTraversal";
import { ContentRegistry } from "../content/ContentRegistry";
import {
  IconEnergy,
  IconHoe,
  IconWateringCan,
  IconBait,
  IconRod,
  IconSprout,
  IconFish,
  IconBoat,
  IconWarning,
  IconMenu
} from "./components/HudIcons";
import { CelestialTimeDial, MedallionPurse, KeycapBadge } from "./HudDecorations";
import { FarmForecastPopover } from "./components/FarmForecastPopover";
import { formatWeatherLabel, WeatherIcon } from "./weatherPresentation";
import type { ActiveQuestDto } from "../simulation/core/QuestTypes";
import { QuestTrackerHUD } from "./QuestTrackerHUD";
import { ChromeMeter, ChromeQuality, ChromeSlot } from "./chrome/Chrome";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForFish, atlasForTime } from "./chrome/uiAtlas";
import { playUiSound } from "./audio/uiAudio";

export interface HUDProps {
  state: GameState;
  promptText: string | null;
  toastMessage?: string | null;
  activeQuest?: ActiveQuestDto | null;
  activeToolSlot?: number;
  onSelectToolSlot?: (slot: number) => void;
  onOpenMenu?: () => void;
  isPlacementActive?: boolean;
}

function parsePrompt(promptText: string | null, toastMessage: string | null | undefined) {
  if (!promptText || (toastMessage && promptText.trim() === toastMessage.trim())) return null;
  if (promptText.startsWith("Equipped:") || promptText.startsWith("Saved")) {
    return null;
  }

  const match = promptText.match(/^\[(.*?)\]\s*(.*)$/);
  if (match) {
    const key = match[1].split("/")[0]?.trim() || match[1];
    return { key, label: match[2] };
  }
  return { key: "E", label: promptText };
}

function seaStateLabel(roughness: number): string {
  if (roughness < 0.35) return "Calm";
  if (roughness < 0.7) return "Swell";
  return "Rough";
}

export const HUD: React.FC<HUDProps> = ({
  state,
  promptText,
  toastMessage,
  activeQuest = null,
  activeToolSlot = 1,
  onSelectToolSlot,
  onOpenMenu,
  isPlacementActive = false
}) => {
  const [showForecast, setShowForecast] = useState(false);
  const { clock, player, weather } = state;

  useEffect(() => {
    if (toastMessage) playUiSound("open");
  }, [toastMessage]);

  const sprintStamina = player.traversal.sprintStamina;
  const sprintMaximum = PLAYER_TRAVERSAL_TUNING.maximumSprintStamina;
  const showSprintStamina =
    !player.activeBoatId &&
    !player.activeMountId &&
    !state.basicFishing &&
    !state.sportFishing &&
    (sprintStamina < sprintMaximum - 0.01 || player.traversal.sprintExhausted);

  const hour = Math.floor((clock.currentMinute % 1440) / 60);
  const minute = clock.currentMinute % 60;
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  const seasonName = clock.season.charAt(0).toUpperCase() + clock.season.slice(1);
  const dayInSeason = ((clock.dayCount - 1) % 30) + 1;
  const timeOfDayLabel = clock.timeOfDay.charAt(0).toUpperCase() + clock.timeOfDay.slice(1);
  const currentTemp = Math.round(weather.temperatureC);

  // Dynamic celestial sun/moon rotation: 12:00 = 0° (Sun zenith), 00:00 = 180° (Moon zenith)
  const dialRotation = ((clock.currentMinute - 720) / 1440) * 360;
  const isNightTime = clock.timeOfDay === "night" || clock.timeOfDay === "dusk" || hour < 6 || hour >= 20;

  const severeAlert = useMemo(() => {
    if (weather.type === "storm") return { text: "Storm Warning", tone: "danger" as const };
    if (weather.type === "fog" && weather.visibility < 0.5) return { text: "Dense Fog", tone: "caution" as const };
    if (weather.windSpeed >= 11) return { text: "Gale Winds", tone: "caution" as const };
    if (weather.seaRoughness >= 0.7) return { text: "Rough Swell", tone: "caution" as const };
    return null;
  }, [weather]);

  const laborCurrent = Math.round(player.workCapacity.current);
  const laborMaximum = player.workCapacity.maximum;
  const showLaborNote = laborCurrent < 20;

  const activeBoat = player.activeBoatId ? state.boats[player.activeBoatId] : null;
  const boatDef = activeBoat ? ContentRegistry.boats.get(activeBoat.boatTypeId) : null;
  const boatCargoSlots = activeBoat
    ? activeBoat.fishCargoSlotIds.map((cargoId) => (cargoId ? state.fishCargo[cargoId] ?? null : null))
    : [];

  const carriedFish = player.carriedFishCargoId ? state.fishCargo[player.carriedFishCargoId] : null;
  const carriedDef = carriedFish ? ContentRegistry.fishSpecies.get(carriedFish.speciesId) : null;
  const parsedPrompt = useMemo(() => parsePrompt(promptText, toastMessage), [promptText, toastMessage]);
  const showQuest =
    Boolean(activeQuest) || state.quests.unlockedFeatureIds.includes("feature.expedition_planner");

  const handleToolClick = (slot: number) => {
    playUiSound("click");
    onSelectToolSlot?.(slot);
  };

  const handleToggleForecast = () => {
    playUiSound("open");
    setShowForecast((prev) => !prev);
  };

  const handleMenuClick = () => {
    playUiSound("open");
    onOpenMenu?.();
  };

  const toolButton = (slot: number, label: string, icon: React.ReactNode) => (
    <ChromeSlot
      className={`hud-hotbar-slot ${activeToolSlot === slot ? "is-active" : ""}`}
      selected={activeToolSlot === slot}
      onClick={() => handleToolClick(slot)}
      label={`${label}, tool slot ${slot}`}
      data-testid={`tool-slot-${slot}`}
    >
      <span className="slot-num-badge" aria-hidden="true">
        {slot}
      </span>
      {icon}
    </ChromeSlot>
  );

  return (
    <>
      {/* =========================================================================
          1. TOP-LEFT HUD CLUSTER: Celestial Dial, Time, Weather, Almanac & Purse
          ========================================================================= */}
      <aside className="hud-top-left-container interactive" aria-label="Almanac, clock, and purse">
        <div className="hud-top-left">
          <div className="hud-clock-widget hud-almanac-panel">
            <button
              type="button"
              className="hud-clock"
              onClick={handleToggleForecast}
              title={`${formatWeatherLabel(weather.type)}, ${currentTemp}°C — Click for Forecast`}
              aria-expanded={showForecast}
              aria-controls="farm-forecast-popover"
              aria-label="Open current conditions and farm forecast"
            >
              <CelestialTimeDial
                size={44}
                rotation={dialRotation}
                isNight={isNightTime}
                className="hud-clock-dial"
              />
              <div className="hud-clock-copy">
                <div className="hud-clock-season">
                  <AtlasImage src={atlasForTime(clock.timeOfDay)} alt="" size={16} />
                  <span>{`${timeOfDayLabel} · ${seasonName} ${dayInSeason}`}</span>
                </div>
                <div className="hud-clock-row">
                  <span className="hud-clock-time" data-testid="game-clock">
                    {`${hh}:${mm}`}
                  </span>
                  <span className="hud-weather-badge">
                    <WeatherIcon type={weather.type} hour={hour} size={16} />
                    <span className="hud-weather-label">{formatWeatherLabel(weather.type)}</span>
                    <span className="hud-weather-temp">{`${currentTemp}°C`}</span>
                  </span>
                </div>
              </div>
            </button>
            <div className="hud-purse-note" aria-label={`Purse: ${player.money.toLocaleString()} gold`}>
              <MedallionPurse size={22} className="hud-purse-medallion" />
              <span className="hud-gold-text">{`${player.money.toLocaleString()} G`}</span>
            </div>
          </div>
          {showForecast && (
            <FarmForecastPopover weather={weather} clock={clock} onClose={() => setShowForecast(false)} />
          )}
        </div>
      </aside>

      {/* =========================================================================
          2. TOAST NOTIFICATIONS (Centered Top)
          ========================================================================= */}
      {toastMessage && (
        <aside className="hud-toast-container" role="status" aria-live="polite">
          <div className="hud-toast-pill">
            <span className="toast-message-text">{toastMessage}</span>
          </div>
        </aside>
      )}

      {/* =========================================================================
          3. TOP-RIGHT HUD CLUSTER: Weather Alerts, Quest Tracker & Menu Button
          ========================================================================= */}
      <aside className="hud-top-right-cluster interactive" aria-label="Active quest and game menu">
        <div className="hud-top-right">
          <div className="hud-top-right-main">
            {severeAlert && (
              <div className={`hud-weather-chip hud-weather-chip--${severeAlert.tone}`} role="status">
                <IconWarning size={14} aria-hidden="true" />
                <span>{severeAlert.text}</span>
              </div>
            )}
            {showQuest && <QuestTrackerHUD activeQuest={activeQuest} />}
          </div>
          {onOpenMenu && (
            <button
              type="button"
              className="hud-menu-button"
              onClick={handleMenuClick}
              aria-label="Open game menu"
              title="Open game menu (Esc)"
            >
              <IconMenu size={22} aria-hidden="true" />
            </button>
          )}
        </div>
      </aside>

      {/* =========================================================================
          4. BOTTOM-LEFT HUD CLUSTER: Vitals (Labor/Sprint), Statuses & Boat Panel
          ========================================================================= */}
      <div className="hud-bottom-left-container">
        <div className="hud-bottom-left">
          {(showLaborNote || carriedFish) && (
            <aside className="hud-context-statuses interactive" aria-label="Current field notes">
              {showLaborNote && (
                <div className="hud-context-note hud-labor-note" role="status">
                  <IconEnergy size={14} aria-hidden="true" />
                  <span>Low Labor</span>
                  <strong>{`${laborCurrent}/${laborMaximum}`}</strong>
                </div>
              )}
              {carriedFish && carriedDef && (
                <div className="hud-context-note hud-cargo-note" role="status">
                  <AtlasImage src={atlasForFish(carriedFish.speciesId)} alt="" size={28} />
                  <span>{carriedDef.name}</span>
                  <strong>{`${carriedFish.weightKg.toFixed(1)} kg`}</strong>
                  <span className="hud-context-note-detail">
                    {`${Math.round(carriedFish.freshness)}% · ${carriedFish.quality}`}
                  </span>
                </div>
              )}
            </aside>
          )}

          {activeBoat && boatDef && (
            <section className="hud-boat-panel interactive" aria-label="Boat driving status">
              <header className="boat-panel-header">
                <IconBoat size={18} className="boat-header-icon" aria-hidden="true" />
                <strong>{boatDef.name}</strong>
                <span>{`${Math.round(activeBoat.speed * 1.944)} kn · ${seaStateLabel(weather.seaRoughness)}`}</span>
                {(clock.timeOfDay === "night" || clock.timeOfDay === "dusk") && (
                  <span className="hud-weather-chip hud-weather-chip--caution" role="status">
                    Night waters
                  </span>
                )}
              </header>
              <ChromeMeter
                className="hud-boat-hull"
                label="Hull"
                value={activeBoat.durability}
                max={100}
                showLabel={false}
                valueText={`${Math.round(activeBoat.durability)}%`}
                fill={activeBoat.durability < 30 ? "danger" : "hull"}
              />
              <div className="boat-cargo-grid" aria-label="Hold">
                {boatCargoSlots.map((cargo: FishCargoState | null, index: number) => {
                  if (!cargo) {
                    return <ChromeSlot key={`cargo-slot-${index}`} className="boat-cargo-slot" slotNumber={index + 1} label="Empty hold slot" />;
                  }
                  const fishDef = ContentRegistry.fishSpecies.get(cargo.speciesId);
                  const freshnessTone = cargo.freshness > 65 ? "fresh" : cargo.freshness > 35 ? "medium" : "stale";
                  return (
                    <ChromeSlot
                      key={cargo.id || `cargo-${index}`}
                      filled
                      slotNumber={index + 1}
                      className="boat-cargo-slot"
                      label={fishDef?.name ?? "Sport fish"}
                    >
                      <AtlasImage src={atlasForFish(cargo.speciesId)} alt="" size={28} />
                      {!atlasForFish(cargo.speciesId) && <IconFish size={14} aria-hidden="true" />}
                      <ChromeQuality quality={cargo.quality} />
                      <div
                        className="cargo-freshness-track"
                        title={`Freshness: ${Math.round(cargo.freshness)}%`}
                        aria-hidden="true"
                      >
                        <div
                          className={`cargo-freshness-fill freshness-${freshnessTone}`}
                          style={{ width: `${Math.round(cargo.freshness)}%` }}
                        />
                      </div>
                    </ChromeSlot>
                  );
                })}
              </div>
            </section>
          )}

          <aside className="hud-vitals interactive" aria-label="Labor and sprint">
            <div className="hud-vitals-tray">
              <ChromeMeter
                className="hud-labor-meter"
                label="Labor"
                value={laborCurrent}
                max={laborMaximum}
                orientation="vertical"
                showLabel={false}
                showValue={false}
                variant="labor"
                fill="gold"
                icon={<IconEnergy size={16} aria-hidden="true" />}
              />
              {showSprintStamina && (
                <ChromeMeter
                  className={`hud-sprint-meter${player.traversal.sprintExhausted ? " sprint-stamina-winded" : ""}`}
                  label="Sprint"
                  value={sprintStamina}
                  max={sprintMaximum}
                  orientation="vertical"
                  showLabel={false}
                  showValue={false}
                  valueText={player.traversal.sprintExhausted ? "Winded" : undefined}
                  fill={player.traversal.sprintExhausted ? "danger" : "sprint"}
                  data-testid="sprint-stamina"
                />
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* =========================================================================
          5. BOTTOM-CENTER HUD CLUSTER: Interaction Prompt & 5-Slot Tool Hotbar
          ========================================================================= */}
      <div className="hud-play-cluster">
        {!isPlacementActive && (state.basicFishing || parsedPrompt) && (
          <footer className="hud-bottom-center" aria-label="Contextual interactions">
            {state.basicFishing ? (
              <div
                className={`interaction-prompt fishing-phase-banner phase-${state.basicFishing.phase}`}
                role="status"
                data-testid="context-prompt"
              >
                {state.basicFishing.phase === "charging-cast" ? (
                  <span className="banner-text">Release to cast</span>
                ) : state.basicFishing.phase === "bite-reaction" || (state.basicFishing.phase as string) === "bite" ? (
                  <div className="banner-content-row">
                    <KeycapBadge keyName="Space" />
                    <span className="banner-text is-bite-alert">Hook the fish</span>
                  </div>
                ) : state.basicFishing.phase === "minigame" ? (
                  <span className="banner-text">Hold Space to keep the fish in the bar</span>
                ) : state.basicFishing.phase === "caught" ? (
                  <div className="banner-content-row">
                    <KeycapBadge keyName="Space" />
                    <span className="banner-text">Collect catch</span>
                  </div>
                ) : state.basicFishing.phase === "escaped" ? (
                  <span className="banner-text">The fish got away</span>
                ) : (
                  <span className="banner-text">Waiting for a bite</span>
                )}
              </div>
            ) : parsedPrompt ? (
              <div className="interaction-prompt" role="status" data-testid="context-prompt">
                <div className="banner-content-row">
                  <KeycapBadge keyName={parsedPrompt.key} />
                  <span className="banner-text">{parsedPrompt.label}</span>
                </div>
              </div>
            ) : null}
          </footer>
        )}

        {!isPlacementActive && !state.sportFishing && (
          <aside className="hud-hotbar interactive">
            <div className="hud-tool-belt" role="toolbar" aria-label="Tool belt">
              <div className="hud-tool-slots">
                {toolButton(1, "Hand tools and hoe", <IconHoe size={26} className="quickbar-slot-icon" aria-hidden="true" />)}
                {toolButton(2, "Seeds", <IconSprout size={26} className="quickbar-slot-icon" aria-hidden="true" />)}
                {toolButton(3, "Watering can", <IconWateringCan size={26} className="quickbar-slot-icon" aria-hidden="true" />)}
                {toolButton(4, "Fishing bait", <IconBait size={26} className="quickbar-slot-icon" aria-hidden="true" />)}
                {toolButton(5, "Fishing rod", <IconRod size={26} className="quickbar-slot-icon" aria-hidden="true" />)}
              </div>
            </div>
          </aside>
        )}
      </div>
    </>
  );
};
