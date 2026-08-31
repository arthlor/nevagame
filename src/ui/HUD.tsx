// src/ui/HUD.tsx
import React, { useMemo, useState } from "react";
import { GameState, FishCargoState } from "../simulation/core/types";
import { PLAYER_TRAVERSAL_TUNING } from "../simulation/navigation/PlayerTraversal";
import { ContentRegistry } from "../content/ContentRegistry";
import { InventoryManager } from "../simulation/inventory/InventoryManager";
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
import { NoticeStack } from "./components/NoticeStack";
import type { Notice } from "./notifications";
import { TOOL_SLOT_NAMES } from "./keybindings";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForFish, atlasForTime } from "./chrome/uiAtlas";
import { playUiSound } from "./audio/uiAudio";

export interface HUDProps {
  state: GameState;
  promptText: string | null;
  /** Legacy single-message form. `notices` supersedes it when supplied. */
  toastMessage?: string | null;
  notices?: readonly Notice[];
  activeQuest?: ActiveQuestDto | null;
  activeToolSlot?: number;
  onSelectToolSlot?: (slot: number) => void;
  onOpenMenu?: () => void;
  isPlacementActive?: boolean;
  /** Crop currently armed for planting, so slot 2 can name it. */
  selectedCropId?: string | null;
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

const EMPTY_NOTICES: readonly Notice[] = [];

const BAIT_ITEM_ID = "item.bait_worms";

interface HotbarSlotModel {
  slot: number;
  name: string;
  /** Secondary line: what is actually loaded in the slot right now. */
  detail: string;
  quantity: number | null;
  /** False when using the slot cannot currently do anything. */
  ready: boolean;
}

/**
 * The tool belt used to be five identical icons with no state, so a player
 * could not tell which seed was armed, whether any bait was left, or which rod
 * was equipped without opening the satchel. Each slot now reports its own
 * contents and readiness.
 */
function describeHotbar(state: GameState, selectedCropId: string | null): HotbarSlotModel[] {
  const inventory = state.inventories[state.player.inventoryId] ?? null;
  const countOf = (itemId: string): number =>
    inventory ? InventoryManager.getItemCount(inventory, itemId) : 0;

  const armedCrop = selectedCropId ? ContentRegistry.crops.get(selectedCropId) : undefined;
  const armedSeeds = armedCrop ? countOf(armedCrop.seedItemId) : 0;
  let seedTotal = 0;
  let fallbackCropName: string | null = null;
  for (const crop of ContentRegistry.crops.values()) {
    const held = countOf(crop.seedItemId);
    seedTotal += held;
    if (held > 0 && !fallbackCropName) fallbackCropName = crop.name;
  }
  const seedName = armedCrop && armedSeeds > 0 ? armedCrop.name : fallbackCropName;

  const bait = countOf(BAIT_ITEM_ID);
  const rod = ContentRegistry.rods.get(state.player.equippedRodId);

  return [
    { slot: 1, name: TOOL_SLOT_NAMES[0], detail: "Till and harvest", quantity: null, ready: true },
    {
      slot: 2,
      name: TOOL_SLOT_NAMES[1],
      detail: seedName ?? "No seeds",
      quantity: seedTotal > 0 ? seedTotal : null,
      ready: seedTotal > 0
    },
    { slot: 3, name: TOOL_SLOT_NAMES[2], detail: "Water crops", quantity: null, ready: true },
    {
      slot: 4,
      name: TOOL_SLOT_NAMES[3],
      detail: bait > 0 ? "Earthworms" : "Empty",
      quantity: bait > 0 ? bait : null,
      ready: bait > 0
    },
    {
      slot: 5,
      name: TOOL_SLOT_NAMES[4],
      detail: rod?.name ?? "No rod",
      quantity: null,
      ready: Boolean(rod)
    }
  ];
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
  notices,
  activeQuest = null,
  activeToolSlot = 1,
  onSelectToolSlot,
  onOpenMenu,
  isPlacementActive = false,
  selectedCropId = null
}) => {
  const [showForecast, setShowForecast] = useState(false);
  const { clock, player, weather } = state;

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

  const workRaw = player.workCapacity.current;
  const workExhausted = workRaw < 1;
  const workCurrent = Math.max(0, Math.floor(workRaw));
  const workMaximum = player.workCapacity.maximum;
  const showWorkNote = workExhausted || workCurrent < 20;

  const activeBoat = player.activeBoatId ? state.boats[player.activeBoatId] : null;
  const boatDef = activeBoat ? ContentRegistry.boats.get(activeBoat.boatTypeId) : null;
  const boatCargoSlots = activeBoat
    ? activeBoat.fishCargoSlotIds.map((cargoId) => (cargoId ? state.fishCargo[cargoId] ?? null : null))
    : [];

  const carriedFish = player.carriedFishCargoId ? state.fishCargo[player.carriedFishCargoId] : null;
  const carriedDef = carriedFish ? ContentRegistry.fishSpecies.get(carriedFish.speciesId) : null;
  const latestNoticeText = notices?.at(-1)?.text ?? toastMessage ?? null;
  const parsedPrompt = useMemo(
    () => parsePrompt(promptText, latestNoticeText),
    [promptText, latestNoticeText]
  );
  // Callers that still pass a bare string get one synthesised info notice so
  // both entry points render through the same stack.
  const visibleNotices = useMemo<readonly Notice[]>(() => {
    if (notices) return notices;
    if (!toastMessage) return EMPTY_NOTICES;
    return [
      {
        id: 0,
        text: toastMessage,
        tone: "info",
        count: 1,
        createdMs: 0,
        expiresMs: Number.POSITIVE_INFINITY
      }
    ];
  }, [notices, toastMessage]);
  const showQuest =
    Boolean(activeQuest) || state.quests.unlockedFeatureIds.includes("feature.expedition_planner");
  const hotbar = useMemo(() => describeHotbar(state, selectedCropId), [state, selectedCropId]);
  const activeHotbarSlot = hotbar[Math.min(Math.max(activeToolSlot, 1), hotbar.length) - 1];

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

  const toolButton = (model: HotbarSlotModel, icon: React.ReactNode) => (
    <ChromeSlot
      key={model.slot}
      className={`hud-hotbar-slot ${activeToolSlot === model.slot ? "is-active" : ""}${
        model.ready ? "" : " is-unavailable"
      }`}
      // Tool slots always hold a tool; leaving them "empty" made every icon
      // render with the dimmed empty-well treatment.
      filled
      selected={activeToolSlot === model.slot}
      onClick={() => handleToolClick(model.slot)}
      label={`${model.name}, ${model.detail}, tool slot ${model.slot}`}
      title={`${model.name} — ${model.detail}  (${model.slot})`}
      data-testid={`tool-slot-${model.slot}`}
      data-ready={model.ready ? "true" : "false"}
    >
      <span className="slot-num-badge" aria-hidden="true">
        {model.slot}
      </span>
      {icon}
      {model.quantity != null && (
        <span className="hud-hotbar-count" aria-hidden="true">
          {model.quantity > 99 ? "99+" : model.quantity}
        </span>
      )}
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
          2. NOTIFICATIONS (Centered Top)
          ========================================================================= */}
      <NoticeStack notices={visibleNotices} />

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
          4. BOTTOM-LEFT HUD CLUSTER: Vitals (Work/Sprint), Statuses & Boat Panel
          ========================================================================= */}
      <div className="hud-bottom-left-container">
        <div className="hud-bottom-left">
          {!state.sportFishing && (showWorkNote || carriedFish) && (
            <aside className="hud-context-statuses interactive" aria-label="Current field notes">
              {showWorkNote && (
                <div className={`hud-context-note hud-labor-note${workExhausted ? " hud-labor-exhausted" : ""}`} role="status">
                  <IconEnergy size={14} aria-hidden="true" />
                  <span>{workExhausted ? "Exhausted" : "Low Work"}</span>
                  <strong>{`${workCurrent}/${workMaximum}`}</strong>
                </div>
              )}
              {carriedFish && carriedDef && (
                <div className="hud-context-note hud-cargo-note" role="status">
                  <AtlasImage src={atlasForFish(carriedFish.speciesId)} alt="" size={24} />
                  <span>{carriedDef.name}</span>
                  <strong>{`${carriedFish.weightKg.toFixed(1)} kg`}</strong>
                  <span className="hud-context-note-detail">
                    {`${Math.round(carriedFish.freshness)}% · ${carriedFish.quality}`}
                  </span>
                </div>
              )}
            </aside>
          )}

          {!state.sportFishing && activeBoat && boatDef && (
            <section className="hud-boat-panel interactive" aria-label="Boat driving status">
              <header className="boat-panel-header">
                <div className="boat-panel-title-row">
                  <div className="boat-panel-name-group">
                    <IconBoat size={16} className="boat-header-icon" aria-hidden="true" />
                    <strong className="boat-panel-name">{boatDef.name}</strong>
                  </div>
                  {(clock.timeOfDay === "night" || clock.timeOfDay === "dusk") && (
                    <span className="boat-night-chip" role="status">
                      Night waters
                    </span>
                  )}
                </div>
                <div className="boat-panel-sub-row">
                  <span className="boat-speed-label">
                    {`${Math.round(activeBoat.speed * 1.944)} kn · ${seaStateLabel(weather.seaRoughness)}`}
                  </span>
                </div>
              </header>

              <div className="boat-hull-section">
                <div className="boat-hull-label-row">
                  <span className="boat-section-title">Hull Durability</span>
                  <span className="boat-hull-value">{`${Math.round(activeBoat.durability)}%`}</span>
                </div>
                <ChromeMeter
                  className="hud-boat-hull"
                  label="Hull"
                  value={activeBoat.durability}
                  max={100}
                  showLabel={false}
                  showValue={false}
                  fill={activeBoat.durability < 30 ? "danger" : "hull"}
                />
              </div>

              <div className="boat-cargo-section">
                <div className="boat-cargo-label-row">
                  <span className="boat-section-title">Cargo Hold</span>
                  <span className="boat-cargo-count-badge">
                    {`${boatCargoSlots.filter(Boolean).length}/${boatCargoSlots.length}`}
                  </span>
                </div>
                <div className="boat-cargo-grid" aria-label="Hold">
                  {boatCargoSlots.map((cargo: FishCargoState | null, index: number) => {
                    if (!cargo) {
                      return (
                        <ChromeSlot
                          key={`cargo-slot-${index}`}
                          className="boat-cargo-slot"
                          slotNumber={index + 1}
                          label="Empty hold slot"
                        />
                      );
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
              </div>
            </section>
          )}

          {!state.sportFishing && <aside className="hud-vitals interactive" aria-label="Work and sprint">
            {/* An unlabelled gold bar told the player nothing. The tray now
                names the resource and shows the number it is counting down. */}
            <div className="hud-vitals-readout" aria-hidden="true">
              <span className="hud-vitals-caption">Work</span>
              <span className={`hud-vitals-value${workExhausted ? " is-exhausted" : ""}`}>
                {`${workCurrent}/${workMaximum}`}
              </span>
            </div>
            <div className="hud-vitals-tray">
              <ChromeMeter
                className="hud-labor-meter"
                label="Work"
                title={`Work ${workCurrent} of ${workMaximum} — spent by planting, watering, harvesting and fishing`}
                value={workCurrent}
                max={workMaximum}
                orientation="vertical"
                showLabel={false}
                showValue={false}
                variant="labor"
                fill={workExhausted ? "danger" : "gold"}
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
                  title={player.traversal.sprintExhausted ? "Winded — sprint is recovering" : "Sprint stamina"}
                  fill={player.traversal.sprintExhausted ? "danger" : "sprint"}
                  data-testid="sprint-stamina"
                />
              )}
            </div>
          </aside>}
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
                  <span className="banner-text">Release E or LMB to cast</span>
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
                {toolButton(hotbar[0], <IconHoe size={26} className="quickbar-slot-icon" aria-hidden="true" />)}
                {toolButton(hotbar[1], <IconSprout size={26} className="quickbar-slot-icon" aria-hidden="true" />)}
                {toolButton(hotbar[2], <IconWateringCan size={26} className="quickbar-slot-icon" aria-hidden="true" />)}
                {toolButton(hotbar[3], <IconBait size={26} className="quickbar-slot-icon" aria-hidden="true" />)}
                {toolButton(hotbar[4], <IconRod size={26} className="quickbar-slot-icon" aria-hidden="true" />)}
              </div>
              {/* Naming the armed slot removes the guesswork about which seed
                  or rod a click is about to use. */}
              <p className="hud-tool-belt-readout" aria-live="polite">
                <span className="hud-tool-belt-name">{activeHotbarSlot.name}</span>
                <span className="hud-tool-belt-detail">{activeHotbarSlot.detail}</span>
              </p>
            </div>
          </aside>
        )}
      </div>
    </>
  );
};
