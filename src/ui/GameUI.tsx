// src/ui/GameUI.tsx
import React, { useState } from "react";
import { FishCargoState, FishingEncounterState, GameMode, GameState, MarketId } from "../simulation/core/types";
import { HUD } from "./HUD";
import { InventoryModal } from "./InventoryModal";
import { MarketModal } from "./MarketModal";
import { FishingHUD } from "./FishingHUD";
import { BasicFishingMinigameWidget } from "./fishing/BasicFishingMinigameWidget";
import { ExpeditionBoard } from "./ExpeditionBoard";
import { JournalFolio, JournalModal } from "./JournalModal";
import { EscapeMenuModal } from "./EscapeMenuModal";
import { WorldMapModal } from "./components/WorldMapModal";
import { LogisticsLedgerModal } from "./components/LogisticsLedgerModal";
import { CatchSummaryToast } from "./components/CatchInspectionModal";
import { PlantingSeedBar } from "./components/PlantingSeedBar";
import { FarmGISLegend } from "./components/FarmGISLegend";
import {
  DebugOverlay,
  type DebugCameraDiagnostics,
  type DebugCharacterDiagnostics,
  type RenderStats
} from "./DebugOverlay";
import { DialogueModal } from "./DialogueModal";
import { ContextualHintCard } from "./ContextualHintCard";
import type { ActiveQuestDto } from "../simulation/core/QuestTypes";
import type { AssetCoverageSummary } from "../render/assets/AssetCoverage";
import type { ActiveModal } from "../app/ModeController";
import type { FarmingActionSnapshot } from "../app/FarmingActionController";
import type { StartupState } from "../app/StartupState";
import type { CropInspectionDto } from "../simulation/core/contracts";
import { IconSprout } from "./components/HudIcons";
import { ChromeAlert, ChromeButton, ChromeClose, ChromeMeter, ChromePanel } from "./chrome/Chrome";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForAction, atlasForCrop, atlasForGrowth } from "./chrome/uiAtlas";
import { StartScreen } from "./StartScreen";
import { PlacementEditorHud } from "./PlacementEditorHud";
import type { LayoutEditHudSelection } from "../layout-editor/layoutEdit";
import type { GraphicsQualityPreference } from "../render/config/GraphicsQualitySettings";
import type { QualityTier } from "../render/config/VisualRenderConfig";

const READY_STARTUP_STATE: StartupState = {
  status: "ready",
  phase: "complete",
  loadedAssets: 0,
  totalAssets: 0,
  message: "",
  errorMessage: null,
  errorCode: null,
  errorPhase: null,
  saveStatus: "empty",
  saveSummary: null
};

export interface GameUIProps {
  state: GameState;
  mode: GameMode;
  fps: number;
  renderStats: RenderStats;
  cameraDiagnostics: DebugCameraDiagnostics;
  characterDiagnostics: DebugCharacterDiagnostics;
  placementValid: boolean | null;
  placementTarget: { x: number; z: number } | null;
  promptText: string | null;
  toastMessage?: string | null;
  inspectedCrop: CropInspectionDto | null;
  onDismissCropInspection?: () => void;
  farmingAction: FarmingActionSnapshot | null;
  activeModal: ActiveModal;
  onSetActiveModal: (modal: ActiveModal) => void;
  marketId: MarketId | null;
  activeQuest?: ActiveQuestDto | null;
  activeDialogueNpcId?: string | null;
  onTalkNpc?: (npcId: string) => {
    success: boolean;
    dialogue?: string[];
    isCompletion?: boolean;
    questCompleted?: boolean;
    rewardsGiven?: boolean;
    reason?: string;
  };
  activeHint?: { hintId: string; title: string; message: string; icon?: string } | null;
  onDismissHint?: (hintId: string) => void;
  onSelectPlantCrop: (cropId: string) => void;
  selectedPlantCropId?: string | null;
  onCancelPlacement?: () => void;
  isFarmGisHeld?: boolean;
  activeToolSlot?: number;
  onSelectToolSlot?: (slot: number) => void;
  landedCatch?: FishCargoState | null;
  onDismissCatchSummary?: () => void;
  fishingEncounter: FishingEncounterState | null;
  onSetFishingInput: (input: {
    isReeling: boolean;
    isSlacking: boolean;
    isBracing: boolean;
    rodDirectionAngle: number;
  }) => void;
  onHookBasicFishingBite?: () => void;
  onDismissBasicFishingModal?: () => void;
  onSellItem: (marketId: MarketId, itemId: string, quantity: number) => void;
  onBuySeed: (marketId: MarketId, itemId: string, quantity: number) => void;
  onBuyItem?: (marketId: MarketId, itemId: string, quantity: number) => void;
  onSellFishCargo: (marketId: MarketId, cargoId: string) => void;
  onDiscardFishCargo: (cargoId: string) => void;
  onDeliverContractItems: (contractId: string, itemId: string, quantity: number) => void;
  onDeliverFishCargo: (contractId: string, cargoId: string) => void;
  onQuickSave: () => void;
  saveRecoveryReason?: "corrupt" | "incompatible" | "unavailable" | null;
  onConfirmNewGame?: () => void;
  onDismissNewGameConfirm?: () => void;
  onResetPlayerToSafePlace: () => void;
  onAdvanceHours: (hours: number) => void;
  onGrantMoney: (amount: number) => void;
  onToggleWeather: () => void;
  onSpawnSchool: () => void;
  assetCoverage: AssetCoverageSummary;
  startup?: StartupState;
  onStart?: () => void;
  onStartNewGame?: () => void;
  onStartWithoutSaving?: () => void;
  onRetry?: () => void;
  graphicsQuality: GraphicsQualityPreference;
  effectiveGraphicsQuality: QualityTier;
  onGraphicsQualityChange: (quality: GraphicsQualityPreference) => void;
  bootReady?: boolean;
  screenFade?: boolean;
  layoutEditor?: {
    active: boolean;
    selected: LayoutEditHudSelection | null;
    status: string | null;
    onToggle: () => void;
  } | null;
}

export const GameUI: React.FC<GameUIProps> = ({
  state,
  mode,
  fps,
  renderStats,
  cameraDiagnostics,
  characterDiagnostics,
  placementValid,
  placementTarget,
  promptText,
  toastMessage,
  inspectedCrop,
  onDismissCropInspection,
  farmingAction,
  activeModal,
  onSetActiveModal,
  marketId,
  activeQuest,
  onTalkNpc,
  activeDialogueNpcId,
  activeHint,
  onDismissHint,
  onSelectPlantCrop,
  selectedPlantCropId = null,
  onCancelPlacement,
  isFarmGisHeld = false,
  activeToolSlot = 1,
  onSelectToolSlot,
  landedCatch = null,
  onDismissCatchSummary,
  fishingEncounter,
  onSetFishingInput,
  onHookBasicFishingBite,
  onDismissBasicFishingModal,
  onSellItem,
  onBuySeed,
  onBuyItem,
  onSellFishCargo,
  onDiscardFishCargo,
  onDeliverContractItems,
  onDeliverFishCargo,
  onQuickSave,
  saveRecoveryReason = null,
  onConfirmNewGame,
  onDismissNewGameConfirm,
  onResetPlayerToSafePlace,
  onAdvanceHours,
  onGrantMoney,
  onToggleWeather,
  onSpawnSchool,
  assetCoverage,
  startup = READY_STARTUP_STATE,
  onStart = () => {},
  onStartNewGame = () => {},
  onStartWithoutSaving = onStart,
  onRetry = () => {},
  graphicsQuality,
  effectiveGraphicsQuality,
  onGraphicsQualityChange,
  bootReady = false,
  screenFade = false,
  layoutEditor = null
}) => {
  const showDiagnostics =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");
  const [journalInitialFolio, setJournalInitialFolio] = useState<JournalFolio>("quests");

  // Debug sessions need the diagnostic surface while the real runtime boots;
  // the boot-ready attribute is the synchronization point for browser checks.
  if (startup.status !== "ready" && !showDiagnostics) {
    return (
      <div id="ui-container" style={{ width: "100%", height: "100%", position: "relative" }}>
        <StartScreen
          startup={startup}
          onStart={onStart}
          onStartNewGame={onStartNewGame}
          onStartWithoutSaving={onStartWithoutSaving}
          onRetry={onRetry}
        />
      </div>
    );
  }

  const plannerUnlocked = state.quests.unlockedFeatureIds.includes("feature.expedition_planner");

  return (
    <div id="ui-container" tabIndex={-1} style={{ width: "100%", height: "100%", position: "relative" }}>
      <div className={`screen-transition-overlay ${screenFade ? "active" : ""}`} />

      {/* 1. Main Head-Up Display */}
      <HUD
        state={state}
        promptText={promptText}
        toastMessage={toastMessage}
        activeQuest={activeQuest}
        activeToolSlot={activeToolSlot}
        onSelectToolSlot={onSelectToolSlot}
        onOpenMenu={() => onSetActiveModal("pause")}
        isPlacementActive={mode === "farm-placement"}
      />

      {/* 2. Contextual Overlays */}
      {inspectedCrop && (
        <CropInspection
          inspection={inspectedCrop}
          onClose={onDismissCropInspection}
        />
      )}
      {farmingAction && <FarmingActionStatus action={farmingAction} />}

      {/* Diegetic Farm Soil GIS Legend (when Alt is held) */}
      <FarmGISLegend visible={isFarmGisHeld} />

      {/* Farm Planting Seed Selector Bar (when in farm-placement mode) */}
      {mode === "farm-placement" && !activeModal && (
        <PlantingSeedBar
          state={state}
          selectedCropId={selectedPlantCropId}
          onSelectCrop={onSelectPlantCrop}
          onCancel={onCancelPlacement || (() => {})}
        />
      )}

      {/* Contextual Mechanics Tutorial Hint Card */}
      {activeHint && onDismissHint && (
        <ContextualHintCard
          hintId={activeHint.hintId}
          title={activeHint.title}
          message={activeHint.message}
          icon={activeHint.icon}
          onDismiss={onDismissHint}
          captureEscape={!activeModal && mode !== "basic-fishing" && mode !== "sport-fishing"}
        />
      )}

      {/* 3. Basic Fishing Minigame Widget */}
      {state.basicFishing && !activeModal && (
        <BasicFishingMinigameWidget
          fishingState={state.basicFishing}
          onHookBite={onHookBasicFishingBite}
          onDismissModal={onDismissBasicFishingModal}
        />
      )}

      {/* 4. Sport Fishing Minigame HUD — hidden under pause so it cannot steal input */}
      {mode === "sport-fishing" && fishingEncounter && !activeModal && (
        <FishingHUD encounter={fishingEncounter} onSetInput={onSetFishingInput} />
      )}

      {/* 5. Landed Sport Fish Catch Record Inspection Plaque */}
      {landedCatch && onDismissCatchSummary && (
        <CatchSummaryToast
          cargo={landedCatch}
          harborMarket={state.markets["market.harbor"]}
          onDismiss={onDismissCatchSummary}
        />
      )}

      {/* 6. Modal Overlays */}
      {activeModal === "dialogue" && activeDialogueNpcId && onTalkNpc && (
        <DialogueModal
          npcId={activeDialogueNpcId}
          state={state}
          activeQuest={activeQuest ?? null}
          onClose={() => onSetActiveModal(null)}
          onTalkNpc={onTalkNpc}
        />
      )}

      {activeModal === "inventory" && (
        <InventoryModal
          state={state}
          onClose={() => onSetActiveModal(null)}
          onSelectPlantCrop={onSelectPlantCrop}
        />
      )}

      {activeModal === "market" && (
        <MarketModal
          state={state}
          marketId={marketId}
          onSellItem={onSellItem}
          onBuySeed={onBuySeed}
          onBuyItem={onBuyItem}
          onSellFishCargo={onSellFishCargo}
          onDiscardFishCargo={onDiscardFishCargo}
          onDeliverContractItems={onDeliverContractItems}
          onDeliverFishCargo={onDeliverFishCargo}
          onClose={() => onSetActiveModal(null)}
        />
      )}

      {activeModal === "map" && (
        <WorldMapModal state={state} onClose={() => onSetActiveModal(null)} />
      )}

      {activeModal === "ledger" && (
        <LogisticsLedgerModal state={state} onClose={() => onSetActiveModal(null)} />
      )}

      {activeModal === "expedition" && plannerUnlocked && (
        <ExpeditionBoard state={state} onClose={() => onSetActiveModal(null)} />
      )}

      {activeModal === "journal" && (
        <JournalModal
          state={state}
          initialFolio={journalInitialFolio}
          onClose={() => {
            setJournalInitialFolio("quests");
            onSetActiveModal(null);
          }}
        />
      )}

      {activeModal === "new-game-confirm" && (
        <div className="modal-overlay interactive">
          <ChromePanel
            as="div"
            className="neva-panel modal-content"
            tone="plaque"
            flourish
            style={{ width: "min(480px, 94vw)" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-header">
              <span>
                {saveRecoveryReason === "unavailable"
                  ? "Save storage unavailable"
                  : saveRecoveryReason === "incompatible"
                    ? "Older development world"
                    : "Save could not be read"}
              </span>
            </div>
            <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <p style={{ margin: 0, color: "var(--color-text-secondary)", lineHeight: 1.45 }}>
                {saveRecoveryReason === "unavailable"
                  ? "IndexedDB could not be opened. Your existing save has not been overwritten. This session will not be saved until storage is available again."
                  : saveRecoveryReason === "incompatible"
                    ? "This harbor log belongs to an older development world layout. It will remain untouched until you confirm a fresh game."
                  : "The primary and backup saves could not be migrated and validated. Start a new game? Nothing will be written until you confirm."}
              </p>
            </div>
            <div className="modal-footer" style={{ justifyContent: "center", gap: "10px" }}>
              <ChromeButton
                variant="secondary"
                style={{ minWidth: "120px" }}
                onClick={() => onDismissNewGameConfirm?.()}
              >
                Cancel
              </ChromeButton>
              <ChromeButton
                variant="primary"
                style={{ minWidth: "160px" }}
                onClick={() => onConfirmNewGame?.()}
              >
                {saveRecoveryReason === "unavailable" ? "Continue without saving" : "Start new game"}
              </ChromeButton>
            </div>
          </ChromePanel>
        </div>
      )}

      {activeModal === "pause" && (
        <EscapeMenuModal
          state={state}
          onClose={() => onSetActiveModal(null)}
          onResetPlayerToSafePlace={onResetPlayerToSafePlace}
          onQuickSave={onQuickSave}
          onOpenInventory={() => onSetActiveModal("inventory")}
          onOpenJournal={() => {
            setJournalInitialFolio("quests");
            onSetActiveModal("journal");
          }}
          onOpenGuide={() => {
            setJournalInitialFolio("guide");
            onSetActiveModal("journal");
          }}
          onOpenMap={() => onSetActiveModal("map")}
          onOpenLedger={() => onSetActiveModal("ledger")}
          onOpenExpedition={() => onSetActiveModal("expedition")}
          expeditionUnlocked={plannerUnlocked}
          graphicsQuality={graphicsQuality}
          effectiveGraphicsQuality={effectiveGraphicsQuality}
          onGraphicsQualityChange={onGraphicsQualityChange}
        />
      )}

      {layoutEditor && (
        <PlacementEditorHud
          active={layoutEditor.active}
          selected={layoutEditor.selected}
          status={layoutEditor.status}
          onToggle={layoutEditor.onToggle}
        />
      )}

      {/* 7. Diagnostics Overlay — DEV only */}
      {showDiagnostics && (
        <DebugOverlay
          state={state}
          mode={mode}
          fps={fps}
          renderStats={renderStats}
          camera={cameraDiagnostics}
          character={characterDiagnostics}
          placementValid={placementValid}
          placementTarget={placementTarget}
          onAdvanceHours={onAdvanceHours}
          onGrantMoney={onGrantMoney}
          onToggleWeather={onToggleWeather}
          onSpawnSchool={onSpawnSchool}
          assetCoverage={assetCoverage}
          bootReady={bootReady}
        />
      )}
    </div>
  );
};

const titleCase = (value: string): string =>
  value.replace(/(^|[-_])\w/g, (match) => match.replace(/[-_]/, "").toUpperCase());

export const CropInspection: React.FC<{
  inspection: CropInspectionDto;
  onClose?: () => void;
}> = ({ inspection, onClose }) => {
  const remaining =
    inspection.approximateMinutesRemaining == null
      ? inspection.stage === "withered"
        ? "Withered"
        : "Ready to Harvest"
      : `About ${inspection.approximateMinutesRemaining} min remaining`;

  const moistureTone =
    inspection.moisture.band === "wet"
      ? "wet"
      : inspection.moisture.band === "normal"
        ? "ideal"
        : "dry";

  return (
    <ChromePanel
      as="section"
      className="crop-inspection interactive"
      tone="slate"
      flourish={false}
      corners={false}
      rivets={false}
      role="region"
      aria-label={`${inspection.name} crop inspection`}
      tabIndex={0}
      data-testid="crop-inspection"
      onKeyDown={(e) => {
        if (e.key === "Escape" && onClose) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <header className="crop-inspection-title">
        <div className="crop-title-group">
          <IconSprout size={18} className="crop-title-icon" />
          <strong>{inspection.name}</strong>
        </div>
        <div className="crop-header-right">
          <span className={`crop-stage-chip stage-${inspection.stage}`}>{titleCase(inspection.stage)}</span>
          {onClose && <ChromeClose onClick={onClose} label="Close crop inspection" className="crop-inspection-close-btn" />}
        </div>
      </header>

      <div className="crop-inspect-layout">
        <div className="crop-inspect-plate">
          <AtlasImage src={atlasForCrop(inspection.cropId) ?? atlasForGrowth(inspection.stage)} alt="" />
        </div>
        <dl className="crop-inspection-grid">
        <div className="crop-meta-item">
          <dt>Growth Status</dt>
          <dd className="crop-growth-status">{remaining}</dd>
        </div>
        <div className="crop-meta-item">
          <dt>Soil Moisture</dt>
          <dd className={`moisture-badge moisture-${moistureTone}`}>{titleCase(inspection.moisture.band)}</dd>
        </div>
        <div className="crop-meta-item">
          <dt>Climate Fit</dt>
          <dd className={inspection.climate.status === "preferred" ? "climate-optimal" : "climate-suboptimal"}>
            {inspection.climate.status === "preferred" ? "Optimal (Fast Growth)" : "Challenging (Slower)"}
          </dd>
        </div>
        <div className="crop-meta-item">
          <dt>Soil Fertility</dt>
          <dd>{titleCase(inspection.soil.band)}</dd>
        </div>
        <div className="crop-meta-item">
          <dt>Expected Yield</dt>
          <dd className="crop-yield-text">{inspection.expectedYield.min}–{inspection.expectedYield.max} units</dd>
        </div>
        <div className="crop-meta-item">
          <dt>Labor</dt>
          <dd>{Math.round(inspection.work.current)} · Action costs {inspection.work.actionCost}</dd>
        </div>
      </dl>
      </div>

      {inspection.work.current <= 0 && (
        <ChromeAlert tone="caution" className="crop-inspection-warning">
          Labor depleted: work is paused until it recovers
        </ChromeAlert>
      )}
    </ChromePanel>
  );
};

const ACTION_LABELS: Record<FarmingActionSnapshot["action"], { title: string }> = {
  plant: { title: "Planting seeds…" },
  water: { title: "Watering soil…" },
  fertilize: { title: "Fertilizing soil…" },
  harvest: { title: "Harvesting crop…" },
  "processing-start": { title: "Starting processing…" },
  "processing-collect": { title: "Collecting yield…" },
  pickup: { title: "Picking up…" },
  place: { title: "Placing…" },
  workstation: { title: "Working…" },
  cast: { title: "Casting…" },
  board: { title: "Boarding…" },
  dock: { title: "Docking…" }
};

const FarmingActionStatus: React.FC<{ action: FarmingActionSnapshot }> = ({ action }) => {
  const meta = ACTION_LABELS[action.action] ?? { title: "Working…" };
  const percent = Math.round(action.progress * 100);

  return (
    <ChromePanel tone="slate" flourish corners className={`farming-action-status action-${action.action}`} role="status" aria-live="polite" data-testid="farming-action-status">
      <ChromeMeter
        className="farming-action-meter"
        label={meta.title}
        icon={<AtlasImage src={atlasForAction(action.action)} className="farming-action-icon" size={22} aria-hidden="true" />}
        value={percent}
        max={100}
        valueText={`${percent}%`}
        variant="gold"
      />
    </ChromePanel>
  );
};
