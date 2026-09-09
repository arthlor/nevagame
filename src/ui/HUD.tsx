import React, { useEffect, useMemo, useState } from "react";
import { IconEnergy, IconPack } from "./components/HudIcons";
import { FarmForecastPopover } from "./components/FarmForecastPopover";
import type { ActiveQuestDto } from "../simulation/core/QuestTypes";
import type { FarmForecastDto, WorldHudDto } from "../simulation/core/contracts";
import { QuestTrackerHUD } from "./QuestTrackerHUD";
import { HudCluster, KeyHint } from "./coastal/CoastalUI";
import { NoticeStack } from "./components/NoticeStack";
import { CoastalChronicle } from "./components/CoastalChronicle";
import type { ChronicleEntry, ChronicleFilter, Notice } from "./notifications";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForFish } from "./chrome/uiAtlas";
import { playUiSound } from "./audio/uiAudio";

// M1 Component Imports
import { PlayerUnitFrame } from "./hud/PlayerUnitFrame";
import { NauticalCompassAlmanac, TidebookNavigation } from "./hud/NauticalCompassAlmanac";
import { MicroMenuPurseBar, TidebookPurse, type ActiveModal } from "./hud/MicroMenuPurseBar";
import { SmartContextualToolbar } from "./hud/SmartContextualToolbar";
import { SmartActionPrompt } from "./hud/SmartActionPrompt";

// M2 Component Imports
import { MaritimeVesselConsole } from "./components/MaritimeVesselConsole";
import { WeatherHazardBanner } from "./components/WeatherHazardBanner";

export interface HUDProps {
  hud: WorldHudDto;
  playerPosition?: { x: number; z: number };
  blocked?: boolean;
  promptText: string | null;
  toastMessage?: string | null;
  notices?: readonly Notice[];
  activeQuest?: ActiveQuestDto | null;
  activeQuests?: readonly ActiveQuestDto[];
  onFocusTrack?: (trackId: string) => void;
  activeToolSlot?: number;
  onSelectToolSlot?: (slot: number) => void;
  /** Bumped when the world swapped a tool in, so the belt shows itself. */
  toolRevealToken?: number;
  onOpenMenu?: () => void;
  onOpenModal?: (modal: ActiveModal) => void;
  onInspectFarmForecast: () => FarmForecastDto;
  isPlacementActive?: boolean;
  touchChrome?: boolean;
  /** When false, Escape is left for an open modal instead of closing the forecast. */
  captureForecastEscape?: boolean;
  /** Retained activity log for the bottom-left Coastal Chronicle. */
  chronicleEntries?: readonly ChronicleEntry[];
  chronicleFilter?: ChronicleFilter;
  onSelectChronicleFilter?: (filter: ChronicleFilter) => void;
}

const EMPTY_NOTICES: readonly Notice[] = [];

export const HUD: React.FC<HUDProps> = ({
  hud,
  playerPosition,
  blocked = false,
  promptText,
  toastMessage,
  notices,
  activeQuest = null,
  activeQuests,
  onFocusTrack,
  activeToolSlot = 1,
  onSelectToolSlot,
  toolRevealToken = 0,
  onOpenMenu,
  onOpenModal,
  onInspectFarmForecast,
  isPlacementActive = false,
  touchChrome = false,
  captureForecastEscape = true,
  chronicleEntries,
  chronicleFilter = "all",
  onSelectChronicleFilter
}) => {
  const [showForecast, setShowForecast] = useState(false);
  const { work, boat, carriedFish, basicFishingPhase } = hud;
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
        expiresMs: Number.POSITIVE_INFINITY,
        category: "general"
      }
    ];
  }, [notices, toastMessage]);

  const latestNoticeText = notices?.at(-1)?.text ?? toastMessage ?? null;

  // F toggles the farm forecast
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (blocked || event.code !== "KeyF" || event.repeat || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select") || target?.isContentEditable) return;
      event.preventDefault();
      playUiSound("open");
      setShowForecast((prev) => !prev);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [blocked]);

  useEffect(() => { if (blocked) setShowForecast(false); }, [blocked]);

  const handleToolClick = (slot: number) => {
    onSelectToolSlot?.(slot);
  };

  const handleToggleForecast = () => {
    playUiSound("open");
    setShowForecast((prev) => !prev);
  };

  const handleModalOpen = (modal: ActiveModal) => {
    if (modal === "pause" && onOpenMenu) {
      onOpenMenu();
    } else if (onOpenModal) {
      onOpenModal(modal);
    } else if (modal === "pause") {
      onOpenMenu?.();
    }
  };

  return (
    <div className="guildcraft-hud" aria-hidden={blocked || undefined} {...(blocked ? { inert: "" } : {})}>
      <HudCluster edge="top-left" className="guild-status-anchor interactive" aria-label="Player resources">
        <PlayerUnitFrame work={hud.work} sprint={hud.sprint} statusEffects={hud.statusEffects}
          onOpenCharacterSheet={() => handleModalOpen("character")} />
      </HudCluster>
      <HudCluster className="guild-objectives interactive" aria-label="Active objectives">
        <QuestTrackerHUD
          activeQuest={activeQuest}
          activeQuests={activeQuests}
          onFocusTrack={onFocusTrack}
          activeContracts={hud.activeContracts}
          records={hud.recordTracker}
        />
      </HudCluster>

      <TidebookNavigation compass={hud.compass} onOpenMap={() => handleModalOpen("map")} />

      {/* Floating Notices & Notifications */}
      <NoticeStack notices={visibleNotices} />

      {/* Clock, weather and currency share the upper-right instrument. */}
      <HudCluster
        edge="top-right"
        className="guild-almanac-anchor interactive"
        aria-label="Navigation, weather, and active objectives"
      >
        <div className="hud-top-right">
          <div className="hud-top-right-main">
            {/* Nautical Compass & Celestial Almanac */}
            <NauticalCompassAlmanac
              playerPosition={playerPosition}
              onOpenMap={() => handleModalOpen("map")}
              clock={hud.clock}
              weather={hud.weather}
              compass={hud.compass}
              onToggleForecast={handleToggleForecast}
              showForecast={showForecast}
            />
            <TidebookPurse money={hud.money} />

            {/* Maritime Weather Hazard Banner */}
            {hud.weather.hazard && (
              <WeatherHazardBanner hazard={hud.weather.hazard} />
            )}

            {/* Farm Forecast Popover Modal */}
            {showForecast && (
              <FarmForecastPopover
                forecast={onInspectFarmForecast()}
                onClose={() => setShowForecast(false)}
                captureEscape={captureForecastEscape}
              />
            )}

          </div>
        </div>
      </HudCluster>

      {/* Bottom-Left Cluster: Contextual Field Notes & Boat Driving Console */}
      <HudCluster edge="bottom-left" className="guild-notes-anchor">
        <div className="guild-field-notes">
          {(work.showLowNotice || carriedFish) && (
            <aside className="hud-context-statuses interactive" aria-label="Current field notes">
              {work.showLowNotice && (
                <div
                  className={`hud-context-note hud-labor-note${
                    work.exhausted ? " hud-labor-exhausted" : ""
                  }`}
                  role="status"
                >
                  <IconEnergy size={14} aria-hidden="true" />
                  <span>{work.exhausted ? "Exhausted" : "Low Work"}</span>
                  <strong>{`${work.current}/${work.maximum}`}</strong>
                </div>
              )}
              {carriedFish && (
                /* A physical pack reads differently from stackable satchel
                   goods: it is on the player's back, and it costs speed. */
                <div
                  className={`hud-context-note hud-cargo-note is-physical-pack pack-${carriedFish.cargoClass}`}
                  role="status"
                  data-testid="carried-trade-pack"
                  data-cargo-class={carriedFish.cargoClass}
                >
                  <div className="pack-info-row">
                    <span className="pack-shoulder-mark" aria-hidden="true"><IconPack size={13} /></span>
                    <AtlasImage src={atlasForFish(carriedFish.speciesId)} alt="" size={24} />
                    <span className="pack-species-name">{carriedFish.name}</span>
                    <strong className="pack-weight">{`${carriedFish.weightKg.toFixed(1)} kg`}</strong>
                  </div>
                  <div className="pack-detail-row">
                    <span className="hud-context-note-detail">
                      {`${carriedFish.freshnessPercent}%`}
                    </span>
                    <span className="pack-quality-label">{carriedFish.quality}</span>
                    {carriedFish.carrySpeedPenaltyPercent > 0 && (
                      <span
                        className="pack-speed-penalty"
                        data-testid="carried-pack-penalty"
                        title="Carrying this on your back slows you down"
                      >
                        {`▼ ${carriedFish.carrySpeedPenaltyPercent}% speed`}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </aside>
          )}

          {chronicleEntries && chronicleEntries.length > 0 && onSelectChronicleFilter && (
            <CoastalChronicle
              entries={chronicleEntries}
              activeFilter={chronicleFilter}
              onSelectFilter={onSelectChronicleFilter}
            />
          )}

          {boat && (
            <MaritimeVesselConsole
              boat={boat}
              headingDegrees={hud.compass.headingDegrees}
              headingCardinal={hud.compass.headingCardinal}
            />
          )}

        </div>
      </HudCluster>

      {/* Bottom-Center Cluster: Smart Labor Action Prompts & Contextual Hotbar */}
      <HudCluster edge="bottom-center" className="hud-play-cluster guild-play-anchor">
        {!isPlacementActive && !basicFishingResultOpen && (basicFishingPhase || promptText) && (
          <footer className="guild-interaction-anchor" aria-label="Contextual interactions">
            {basicFishingPhase ? (
              <div
                className={`interaction-prompt fishing-phase-banner phase-${basicFishingPhase}`}
                role="status"
                data-testid="context-prompt"
              >
                {basicFishingPhase === "charging-cast" ? (
                  <span className="banner-text">
                    {touchChrome ? "Release to cast" : "Release E or LMB to cast"}
                  </span>
                ) : basicFishingPhase === "bite-reaction" || basicFishingPhase === "bite" ? (
                  <div className="banner-content-row">
                    {!touchChrome && <KeyHint keyName="Space" />}
                    <span className="banner-text is-bite-alert">Hook the fish</span>
                  </div>
                ) : basicFishingPhase === "minigame" ? (
                  <span className="banner-text">
                    {touchChrome
                      ? "Hold Reel to keep the fish in the bar"
                      : "Hold Space to keep the fish in the bar"}
                  </span>
                ) : (
                  <span className="banner-text">Waiting for a bite</span>
                )}
              </div>
            ) : (
              <SmartActionPrompt
                promptText={promptText}
                toastMessage={latestNoticeText}
                touchChrome={touchChrome}
                currentWork={hud.work.current}
              />
            )}
          </footer>
        )}

        {/* Smart Contextual Stance Toolbar — renders nothing when the stance
            has no tool worth swapping, which is most of the time on foot. */}
        {!isPlacementActive && (
          <SmartContextualToolbar
            stance={hud.stance}
            hotbar={hud.contextualHotbar}
            activeSlot={activeToolSlot}
            onSelectSlot={handleToolClick}
            revealToken={toolRevealToken}
            alwaysExpanded={touchChrome}
          />
        )}
      </HudCluster>

      {/* Bottom-Right Cluster: Micro-Menu & Gold Purse Bar */}
      {!isPlacementActive && (
        <HudCluster
          edge="bottom-right"
          className="guild-utilities-anchor interactive"
          aria-label="Micro-menu and purse"
        >
          <MicroMenuPurseBar
            money={hud.money}
            capacity={hud.capacity}
            expeditionUnlocked={hud.expeditionUnlocked}
            onOpenModal={handleModalOpen}
          />
        </HudCluster>
      )}
    </div>
  );
};
