import React, { useEffect, useMemo, useState } from "react";
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
import { CelestialTimeDial, MedallionPurse } from "./HudDecorations";
import { FarmForecastPopover } from "./components/FarmForecastPopover";
import { formatWeatherLabel, WeatherIcon } from "./weatherPresentation";
import type { ActiveQuestDto } from "../simulation/core/QuestTypes";
import type { FarmForecastDto, WorldHudDto } from "../simulation/core/contracts";
import { QuestTrackerHUD } from "./QuestTrackerHUD";
import { ChromeQuality } from "./chrome/Chrome";
import { HudCluster, ItemSlot, KeyHint, Meter } from "./coastal/CoastalUI";
import { NoticeStack } from "./components/NoticeStack";
import type { Notice } from "./notifications";
import { TOOL_SLOT_NAMES } from "./keybindings";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForFish, atlasForRod, atlasForTime } from "./chrome/uiAtlas";
import { playUiSound } from "./audio/uiAudio";

export interface HUDProps {
  hud: WorldHudDto;
  promptText: string | null;
  toastMessage?: string | null;
  notices?: readonly Notice[];
  activeQuest?: ActiveQuestDto | null;
  activeToolSlot?: number;
  onSelectToolSlot?: (slot: number) => void;
  onOpenMenu?: () => void;
  onInspectFarmForecast: () => FarmForecastDto;
  isPlacementActive?: boolean;
  touchChrome?: boolean;
}

function parsePrompt(
  promptText: string | null,
  toastMessage: string | null | undefined,
  touchChrome: boolean
) {
  if (!promptText || (toastMessage && promptText.trim() === toastMessage.trim())) return null;
  if (promptText.startsWith("Equipped:") || promptText.startsWith("Saved")) {
    return null;
  }

  const match = promptText.match(/^\[(.*?)\]\s*(.*)$/);
  if (match) {
    const key = match[1].split("/")[0]?.trim() || match[1];
    return { key: touchChrome ? null : key, label: match[2] };
  }
  return { key: touchChrome ? null : "E", label: promptText };
}

const EMPTY_NOTICES: readonly Notice[] = [];

interface HotbarSlotModel {
  slot: 1 | 2 | 3 | 4 | 5;
  name: string;
  detail: string;
  quantity: number | null;
  ready: boolean;
}

export const HUD: React.FC<HUDProps> = ({
  hud,
  promptText,
  toastMessage,
  notices,
  activeQuest = null,
  activeToolSlot = 1,
  onSelectToolSlot,
  onOpenMenu,
  onInspectFarmForecast,
  isPlacementActive = false,
  touchChrome = false
}) => {
  const [showForecast, setShowForecast] = useState(false);
  const [showToolReadout, setShowToolReadout] = useState(true);
  const { clock, weather, work, sprint, boat, carriedFish, basicFishingPhase } = hud;
  const latestNoticeText = notices?.at(-1)?.text ?? toastMessage ?? null;
  const parsedPrompt = useMemo(
    () => parsePrompt(promptText, latestNoticeText, touchChrome),
    [promptText, latestNoticeText, touchChrome]
  );
  const basicFishingResultOpen = basicFishingPhase === "caught" || basicFishingPhase === "escaped";
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
  const showQuest = Boolean(activeQuest);
  const hotbar = useMemo<HotbarSlotModel[]>(
    () => hud.hotbar.map((slot) => ({ ...slot, name: TOOL_SLOT_NAMES[slot.slot - 1] })),
    [hud.hotbar]
  );
  const activeHotbarSlot = hotbar[Math.min(Math.max(activeToolSlot, 1), hotbar.length) - 1];
  const equippedRodSprite = atlasForRod(hud.equippedRodId);

  useEffect(() => {
    setShowToolReadout(true);
    const timer = window.setTimeout(() => setShowToolReadout(false), 1700);
    return () => window.clearTimeout(timer);
  }, [activeToolSlot, activeHotbarSlot.detail]);

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
    <ItemSlot
      key={model.slot}
      className={`hud-hotbar-slot ${activeToolSlot === model.slot ? "is-active" : ""}${
        model.ready ? "" : " is-unavailable"
      }`}
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
    </ItemSlot>
  );

  return (
    <>
      <HudCluster edge="top-right" className="hud-top-left-container interactive" aria-label="Clock, weather, and purse">
        <div className="hud-top-left">
          <div className="hud-clock-widget hud-almanac-panel">
            <button
              type="button"
              className="hud-clock"
              onClick={handleToggleForecast}
              title={`${formatWeatherLabel(weather.type)}, ${weather.temperatureC}°C — Open forecast`}
              aria-expanded={showForecast}
              aria-controls="farm-forecast-popover"
              aria-label="Open current conditions and farm forecast"
            >
              <CelestialTimeDial
                size={44}
                rotation={clock.dialRotation}
                isNight={clock.isNight}
                className="hud-clock-dial"
              />
              <div className="hud-clock-copy">
                <div className="hud-clock-season">
                  <AtlasImage src={atlasForTime(clock.timeOfDay)} alt="" size={16} />
                  <span>{`${clock.timeOfDayLabel} · ${clock.seasonLabel} ${clock.dayInSeason}`}</span>
                </div>
                <div className="hud-clock-row">
                  <span className="hud-clock-time" data-testid="game-clock">
                    {clock.label}
                  </span>
                  <span className="hud-weather-badge">
                    <WeatherIcon type={weather.type} hour={clock.hour} size={16} />
                    <span className="hud-weather-label">{formatWeatherLabel(weather.type)}</span>
                    <span className="hud-weather-temp">{`${weather.temperatureC}°C`}</span>
                  </span>
                </div>
              </div>
            </button>
            <div className="hud-purse-note" aria-label={`Purse: ${hud.money.toLocaleString()} gold`}>
              <MedallionPurse size={22} className="hud-purse-medallion" />
              <span className="hud-gold-text">{`${hud.money.toLocaleString()} G`}</span>
            </div>
          </div>
          {showForecast && (
            <FarmForecastPopover forecast={onInspectFarmForecast()} onClose={() => setShowForecast(false)} />
          )}
        </div>
      </HudCluster>

      <NoticeStack notices={visibleNotices} />

      <HudCluster edge="top-left" className="hud-top-right-cluster interactive" aria-label="Hazard, objective, and game menu">
        <div className="hud-top-right">
          <div className="hud-top-right-main">
            {weather.hazard && (
              <div className={`hud-weather-chip hud-weather-chip--${weather.hazard.tone}`} role="status">
                <IconWarning size={14} aria-hidden="true" />
                <span>{weather.hazard.text}</span>
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
      </HudCluster>

      <HudCluster edge="bottom-left" className="hud-bottom-left-container">
        <div className="hud-bottom-left">
          {(work.showLowNotice || carriedFish) && (
            <aside className="hud-context-statuses interactive" aria-label="Current field notes">
              {work.showLowNotice && (
                <div className={`hud-context-note hud-labor-note${work.exhausted ? " hud-labor-exhausted" : ""}`} role="status">
                  <IconEnergy size={14} aria-hidden="true" />
                  <span>{work.exhausted ? "Exhausted" : "Low Work"}</span>
                  <strong>{`${work.current}/${work.maximum}`}</strong>
                </div>
              )}
              {carriedFish && (
                <div className="hud-context-note hud-cargo-note" role="status">
                  <AtlasImage src={atlasForFish(carriedFish.speciesId)} alt="" size={24} />
                  <span>{carriedFish.name}</span>
                  <strong>{`${carriedFish.weightKg.toFixed(1)} kg`}</strong>
                  <span className="hud-context-note-detail">
                    {`${carriedFish.freshnessPercent}% · ${carriedFish.quality}`}
                  </span>
                </div>
              )}
            </aside>
          )}

          {boat && (
            <section className="hud-boat-panel interactive" aria-label="Boat driving status">
              <header className="boat-panel-header">
                <div className="boat-panel-title-row">
                  <div className="boat-panel-name-group">
                    <IconBoat size={16} className="boat-header-icon" aria-hidden="true" />
                    <strong className="boat-panel-name">{boat.name}</strong>
                  </div>
                  {boat.showNightWarning && (
                    <span className="boat-night-chip" role="status">
                      Night waters
                    </span>
                  )}
                </div>
                <div className="boat-panel-sub-row">
                  <span className="boat-speed-label">
                    {`${boat.speedKnots} kn · ${boat.seaState}`}
                  </span>
                  {boat.seaWarning && (
                    <span className="boat-sea-warning" role="status">
                      <IconWarning size={13} aria-hidden="true" /> {boat.seaWarning}
                    </span>
                  )}
                </div>
              </header>

              <div className={`boat-running-status${boat.fuel ? " has-fuel" : ""}`}>
                <div className="boat-hull-section">
                  <div className="boat-hull-label-row">
                    <span className="boat-section-title">Hull</span>
                    <span className="boat-hull-value">{`${boat.hull.percent}%`}</span>
                  </div>
                  <Meter
                    className="hud-boat-hull"
                    label="Hull"
                    value={boat.hull.current}
                    max={boat.hull.maximum}
                    showLabel={false}
                    showValue={false}
                    fill={boat.hull.danger ? "danger" : "hull"}
                  />
                </div>
                {boat.fuel && (
                  <div className="boat-fuel-section">
                    <div className="boat-hull-label-row">
                      <span className="boat-section-title">Fuel</span>
                      <span className="boat-hull-value">
                        {`${boat.fuel.percent}%`}
                      </span>
                    </div>
                    <Meter
                      className="hud-boat-fuel"
                      label="Fuel"
                      value={boat.fuel.current}
                      max={boat.fuel.maximum}
                      showLabel={false}
                      showValue={false}
                      fill={boat.fuel.danger ? "danger" : "gold"}
                    />
                  </div>
                )}
              </div>

              <div className="boat-cargo-section">
                <div className="boat-cargo-label-row">
                  <span className="boat-section-title">Cargo Hold</span>
                  <span className="boat-cargo-count-badge">
                    {`${boat.occupiedCargoSlots}/${boat.cargoSlots.length}`}
                  </span>
                </div>
                <div className="boat-cargo-grid" aria-label="Hold">
                  {boat.cargoSlots.map((slot) => {
                    if (!slot.cargo) {
                      return (
                        <ItemSlot
                          key={`cargo-slot-${slot.slotNumber}`}
                          className="boat-cargo-slot"
                          slotNumber={slot.slotNumber}
                          label="Empty hold slot"
                        />
                      );
                    }
                    const cargo = slot.cargo;
                    return (
                      <ItemSlot
                        key={cargo.cargoId}
                        filled
                        slotNumber={slot.slotNumber}
                        className="boat-cargo-slot"
                        label={cargo.name}
                      >
                        <AtlasImage src={atlasForFish(cargo.speciesId)} alt="" size={28} />
                        {!atlasForFish(cargo.speciesId) && <IconFish size={14} aria-hidden="true" />}
                        <ChromeQuality quality={cargo.quality} />
                        <div
                          className="cargo-freshness-track"
                          title={`Freshness: ${cargo.freshnessPercent}%`}
                          aria-hidden="true"
                        >
                          <div
                            className={`cargo-freshness-fill freshness-${cargo.freshnessTone}`}
                            style={{ width: `${cargo.freshnessPercent}%` }}
                          />
                        </div>
                      </ItemSlot>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          <aside className="hud-vitals interactive" aria-label="Work and sprint">
            <div className="hud-vitals-readout" aria-hidden="true">
              <span className="hud-vitals-caption">Work</span>
              <span className={`hud-vitals-value${work.exhausted ? " is-exhausted" : ""}`}>
                {`${work.current}/${work.maximum}`}
              </span>
            </div>
            <div className="hud-vitals-tray">
              <Meter
                className="hud-labor-meter"
                label="Work"
                title={`Work ${work.current} of ${work.maximum}`}
                value={work.current}
                max={work.maximum}
                orientation="horizontal"
                showLabel={false}
                showValue={false}
                variant="labor"
                fill={work.exhausted ? "danger" : "gold"}
                icon={<IconEnergy size={16} aria-hidden="true" />}
              />
              {sprint && (
                <Meter
                  className={`hud-sprint-meter${sprint.exhausted ? " sprint-stamina-winded" : ""}`}
                  label="Sprint"
                  value={sprint.current}
                  max={sprint.maximum}
                  orientation="horizontal"
                  showLabel
                  showValue={false}
                  valueText={sprint.exhausted ? "Winded" : undefined}
                  title={sprint.exhausted ? "Winded — sprint is recovering" : "Sprint stamina"}
                  fill={sprint.exhausted ? "danger" : "sprint"}
                  data-testid="sprint-stamina"
                />
              )}
            </div>
          </aside>
        </div>
      </HudCluster>

      <HudCluster edge="bottom-center" className="hud-play-cluster">
        {!isPlacementActive && !basicFishingResultOpen && (basicFishingPhase || parsedPrompt) && (
          <footer className="hud-bottom-center" aria-label="Contextual interactions">
            {basicFishingPhase ? (
              <div
                className={`interaction-prompt fishing-phase-banner phase-${basicFishingPhase}`}
                role="status"
                data-testid="context-prompt"
              >
                {basicFishingPhase === "charging-cast" ? (
                  <span className="banner-text">{touchChrome ? "Release to cast" : "Release E or LMB to cast"}</span>
                ) : basicFishingPhase === "bite-reaction" || basicFishingPhase === "bite" ? (
                  <div className="banner-content-row">
                    {!touchChrome && <KeyHint keyName="Space" />}
                    <span className="banner-text is-bite-alert">Hook the fish</span>
                  </div>
                ) : basicFishingPhase === "minigame" ? (
                  <span className="banner-text">{touchChrome ? "Hold Reel to keep the fish in the bar" : "Hold Space to keep the fish in the bar"}</span>
                ) : (
                  <span className="banner-text">Waiting for a bite</span>
                )}
              </div>
            ) : parsedPrompt ? (
              <div className="interaction-prompt" role="status" data-testid="context-prompt">
                <div className="banner-content-row">
                  {parsedPrompt.key && <KeyHint keyName={parsedPrompt.key} />}
                  <span className="banner-text">{parsedPrompt.label}</span>
                </div>
              </div>
            ) : null}
          </footer>
        )}

        {!isPlacementActive && (
          <aside className="hud-hotbar interactive">
            <div className="hud-tool-belt" role="toolbar" aria-label="Tool belt">
              <div className="hud-tool-slots">
                {toolButton(hotbar[0], <IconHoe size={26} className="quickbar-slot-icon" aria-hidden="true" />)}
                {toolButton(hotbar[1], <IconSprout size={26} className="quickbar-slot-icon" aria-hidden="true" />)}
                {toolButton(hotbar[2], <IconWateringCan size={26} className="quickbar-slot-icon" aria-hidden="true" />)}
                {toolButton(hotbar[3], <IconBait size={26} className="quickbar-slot-icon" aria-hidden="true" />)}
                {toolButton(
                  hotbar[4],
                  equippedRodSprite ? (
                    <AtlasImage src={equippedRodSprite} size={26} className="quickbar-slot-icon" aria-hidden="true" />
                  ) : (
                    <IconRod size={26} className="quickbar-slot-icon" aria-hidden="true" />
                  )
                )}
              </div>
              <p className={`hud-tool-belt-readout${showToolReadout ? " is-visible" : ""}`} aria-live="polite">
                <span className="hud-tool-belt-name">{activeHotbarSlot.name}</span>
                <span className="hud-tool-belt-detail">{activeHotbarSlot.detail}</span>
              </p>
            </div>
          </aside>
        )}
      </HudCluster>
    </>
  );
};
