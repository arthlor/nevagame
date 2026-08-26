// src/ui/GameUI.tsx
import React from "react";
import { FishCargoState, FishingEncounterState, GameMode, GameState, MarketId } from "../simulation/core/types";
import { HUD } from "./HUD";
import { InventoryModal } from "./InventoryModal";
import { MarketModal } from "./MarketModal";
import { FishingHUD } from "./FishingHUD";
import { BasicFishingMinigameWidget } from "./fishing/BasicFishingMinigameWidget";
import { ExpeditionBoard } from "./ExpeditionBoard";
import { JournalModal } from "./JournalModal";
import { EscapeMenuModal } from "./EscapeMenuModal";
import { WorldMapModal } from "./components/WorldMapModal";
import { LogisticsLedgerModal } from "./components/LogisticsLedgerModal";
import { CatchInspectionModal } from "./components/CatchInspectionModal";
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
import { StartScreen } from "./StartScreen";

const READY_STARTUP_STATE: StartupState = {
  status: "ready",
  phase: "complete",
  loadedAssets: 0,
  totalAssets: 0,
  message: "",
  errorMessage: null,
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
  onOpenMarket: () => void;
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
  onKeepCatch?: () => void;
  onReleaseCatch?: () => void;
  fishingEncounter: FishingEncounterState | null;
  onSetFishingInput: (input: {
    isReeling: boolean;
    isSlacking: boolean;
    isBracing: boolean;
    rodDirectionAngle: number;
  }) => void;
  onHookBasicFishingBite?: () => void;
  onSetBasicFishingInput?: (isHolding: boolean) => void;
  onReleaseBasicFishingCast?: (power?: number) => void;
  onDismissBasicFishingModal?: () => void;
  onSellItem: (marketId: MarketId, itemId: string, quantity: number) => void;
  onBuySeed: (marketId: MarketId, itemId: string, quantity: number) => void;
  onSellFishCargo: (marketId: MarketId, cargoId: string) => void;
  onDiscardFishCargo: (cargoId: string) => void;
  onDeliverContractItems: (contractId: string, itemId: string, quantity: number) => void;
  onDeliverFishCargo: (contractId: string, cargoId: string) => void;
  onQuickSave: () => void;
  saveRecoveryReason?: "corrupt" | "unavailable" | null;
  onConfirmNewGame?: () => void;
  onCastFishing: () => void;
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
  bootReady?: boolean;
  screenFade?: boolean;
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
  onOpenMarket,
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
  onKeepCatch,
  onReleaseCatch,
  fishingEncounter,
  onSetFishingInput,
  onHookBasicFishingBite,
  onSetBasicFishingInput,
  onReleaseBasicFishingCast,
  onDismissBasicFishingModal,
  onSellItem,
  onBuySeed,
  onSellFishCargo,
  onDiscardFishCargo,
  onDeliverContractItems,
  onDeliverFishCargo,
  onQuickSave,
  saveRecoveryReason = null,
  onConfirmNewGame,
  onCastFishing,
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
  bootReady = false,
  screenFade = false
}) => {
  const showDiagnostics =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");

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
    <div id="ui-container" style={{ width: "100%", height: "100%", position: "relative" }}>
      <div className={`screen-transition-overlay ${screenFade ? "active" : ""}`} />

      {/* 1. Main Head-Up Display */}
      <HUD
        state={state}
        activeQuest={activeQuest}
        promptText={promptText}
        toastMessage={toastMessage}
        activeToolSlot={activeToolSlot}
        onSelectToolSlot={onSelectToolSlot}
        onOpenInventory={() => onSetActiveModal("inventory")}
        onOpenMarket={onOpenMarket}
        onOpenJournal={() => onSetActiveModal("journal")}
        onOpenMap={() => onSetActiveModal("map")}
        onOpenLedger={() => onSetActiveModal("ledger")}
        onOpenExpedition={() => onSetActiveModal("expedition")}
        onQuickSave={onQuickSave}
        onCastFishing={onCastFishing}
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
      {mode === "farm-placement" && (
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
        />
      )}

      {/* 3. Basic Fishing Minigame Widget */}
      {state.basicFishing && (
        <BasicFishingMinigameWidget
          fishingState={state.basicFishing}
          onHookBite={onHookBasicFishingBite}
          onSetInput={onSetBasicFishingInput}
          onReleaseCast={onReleaseBasicFishingCast}
          onDismissModal={onDismissBasicFishingModal}
        />
      )}

      {/* 4. Sport Fishing Minigame HUD — hidden under pause so it cannot steal input */}
      {mode === "sport-fishing" && fishingEncounter && !activeModal && (
        <FishingHUD encounter={fishingEncounter} onSetInput={onSetFishingInput} />
      )}

      {/* 5. Landed Sport Fish Catch Record Inspection Plaque */}
      {landedCatch && onKeepCatch && onReleaseCatch && (
        <CatchInspectionModal
          cargo={landedCatch}
          onKeep={onKeepCatch}
          onRelease={onReleaseCatch}
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
        <JournalModal state={state} onClose={() => onSetActiveModal(null)} />
      )}

      {activeModal === "new-game-confirm" && (
        <div className="modal-overlay interactive">
          <div
            className="neva-panel modal-content"
            style={{ width: "min(480px, 94vw)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <span>{saveRecoveryReason === "unavailable" ? "Save storage unavailable" : "Save could not be read"}</span>
            </div>
            <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <p style={{ margin: 0, color: "var(--color-text-secondary)", lineHeight: 1.45 }}>
                {saveRecoveryReason === "unavailable"
                  ? "IndexedDB could not be opened. Your existing save has not been overwritten. This session will not be saved until storage is available again."
                  : "The primary and backup saves could not be migrated and validated. Start a new game? Nothing will be written until you confirm."}
              </p>
            </div>
            <div className="modal-footer" style={{ justifyContent: "center" }}>
              <button
                type="button"
                className="neva-button neva-button-primary"
                style={{ minWidth: "160px" }}
                onClick={() => onConfirmNewGame?.()}
              >
                {saveRecoveryReason === "unavailable" ? "Continue without saving" : "Start new game"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeModal === "pause" && (
        <EscapeMenuModal
          state={state}
          onClose={() => onSetActiveModal(null)}
          onResetPlayerToSafePlace={onResetPlayerToSafePlace}
          onQuickSave={onQuickSave}
          onOpenInventory={() => onSetActiveModal("inventory")}
          onOpenJournal={() => onSetActiveModal("journal")}
          onOpenExpedition={() => onSetActiveModal("expedition")}
          expeditionUnlocked={plannerUnlocked}
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

const CropInspection: React.FC<{
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
    <section
      className="crop-inspection interactive"
      role="region"
      aria-label={`${inspection.name} crop inspection`}
      tabIndex={0}
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
          {onClose && (
            <button
              type="button"
              className="crop-inspection-close-btn"
              onClick={onClose}
              aria-label="Close crop inspection"
            >
              ✕
            </button>
          )}
        </div>
      </header>

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
          <dt>Work Capacity</dt>
          <dd>{Math.round(inspection.work.current)} · Action costs {inspection.work.actionCost}</dd>
        </div>
      </dl>

      {inspection.work.current <= 0 && (
        <p className="crop-inspection-warning">⚠️ Work Capacity depleted: Reduced XP and rare drop chance</p>
      )}
    </section>
  );
};

const ACTION_LABELS: Record<FarmingActionSnapshot["action"], { title: string; icon: string }> = {
  plant: { title: "Planting Seeds…", icon: "🌱" },
  water: { title: "Watering Soil…", icon: "💧" },
  harvest: { title: "Harvesting Crop…", icon: "🌾" },
  "processing-start": { title: "Starting Processing…", icon: "⚙️" },
  "processing-collect": { title: "Collecting Yield…", icon: "📦" },
  pickup: { title: "Picking Up…", icon: "📦" },
  place: { title: "Placing…", icon: "📦" },
  workstation: { title: "Working…", icon: "⚙️" },
  cast: { title: "Casting…", icon: "🎣" },
  board: { title: "Boarding…", icon: "⛵" },
  dock: { title: "Docking…", icon: "⚓" }
};

const FarmingActionStatus: React.FC<{ action: FarmingActionSnapshot }> = ({ action }) => {
  const meta = ACTION_LABELS[action.action] ?? { title: "Working…", icon: "✨" };
  const percent = Math.round(action.progress * 100);

  return (
    <div className="farming-action-status" role="status" aria-live="polite">
      <div className="farming-action-header">
        <span className="farming-action-icon" aria-hidden="true">{meta.icon}</span>
        <span className="farming-action-title">{meta.title}</span>
        <span className="farming-action-pct">{percent}%</span>
      </div>
      <div className="farming-action-track" aria-hidden="true">
        <div className="farming-action-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
};
