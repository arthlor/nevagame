import React, { useRef, useState } from "react";
import { FishCargoState, GameAction, GameMode, GameState, MarketId } from "../simulation/core/types";
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
import type { ExpeditionBoardDto } from "../simulation/expeditions/buildExpeditionOpportunities";
import type { AssetCoverageSummary } from "../render/assets/AssetCoverage";
import type { ActiveModal } from "../app/ModeController";
import type { FarmingActionSnapshot } from "../app/FarmingActionController";
import type { StartupState } from "../app/StartupState";
import type {
  CommodityQuote,
  CropInspectionDto,
  FarmForecastDto,
  HoldStoresDto,
  JournalPagesDto,
  MarketBoardDto,
  MarketDemandSignal,
  PauseSummaryDto,
  SatchelDto,
  SeedBeltDto,
  SkillProgressDto,
  SportFishingHudDto,
  WorldHudDto,
  WorldMapDto
} from "../simulation/core/contracts";
import type { Notice } from "./notifications";
import { IconSprout } from "./components/HudIcons";
import { ChromeButton, ChromeClose } from "./chrome/Chrome";
import { GameSheet, Meter } from "./coastal/CoastalUI";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForAction, atlasForCrop, atlasForGrowth } from "./chrome/uiAtlas";
import { StartScreen } from "./StartScreen";
import { PlacementEditorHud } from "./PlacementEditorHud";
import { MobileControls, MobileOrientationGate } from "./MobileControls";
import type { FishingInputState, VirtualMoveVector } from "../input/InputRouter";
import type { LayoutEditHudSelection } from "../layout-editor/layoutEdit";
import type { GraphicsQualityPreference } from "../render/config/GraphicsQualitySettings";
import type { QualityTier } from "../render/config/VisualRenderConfig";
import { useModalAccessibility } from "./useModalAccessibility";

const READY_STARTUP_STATE: StartupState = {
  status: "ready",
  phase: "complete",
  loadedAssets: 0,
  totalAssets: 0,
  message: "",
  errorMessage: null,
  errorDetail: null,
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
  worldHud: WorldHudDto;
  toastMessage?: string | null;
  notices?: readonly Notice[];
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
  onInspectPlanting: (cropId: string) => { valid: boolean; reason?: string };
  onInspectSatchel: () => SatchelDto;
  onInspectSeedBelt: () => SeedBeltDto;
  selectedPlantCropId?: string | null;
  onCancelPlacement: () => void;
  isFarmGisHeld?: boolean;
  activeToolSlot?: number;
  onSelectToolSlot?: (slot: number) => void;
  landedCatch?: FishCargoState | null;
  onDismissCatchSummary?: () => void;
  sportFishingHud: SportFishingHudDto | null;
  onSetFishingInput: (input: {
    isReeling: boolean;
    isSlacking: boolean;
    isBracing: boolean;
    rodDirectionAngle: number;
  }) => void;
  onHookBasicFishingBite?: () => void;
  onDismissBasicFishingModal?: () => { success: boolean; reason?: string; reasonCode?: string };
  onDiscardBasicCatch?: () => void;
  onSellItem: (marketId: MarketId, itemId: string, quantity: number) => void;
  onSellAllProduce: (marketId: MarketId) => void;
  onInspectCommodity: (
    marketId: MarketId,
    itemId: string,
    intent?: "buy" | "sell",
    quantity?: number
  ) => CommodityQuote;
  onInspectMarketBoard: (marketId: MarketId) => MarketBoardDto | null;
  onInspectMarketDemand: (marketId: MarketId) => MarketDemandSignal;
  onInspectWorldMap: () => WorldMapDto;
  onInspectFarmForecast: () => FarmForecastDto;
  onInspectExpeditionBoard: () => ExpeditionBoardDto;
  onInspectHoldStores: () => HoldStoresDto;
  onInspectJournalPages: () => JournalPagesDto;
  onInspectPauseSummary: () => PauseSummaryDto;
  onInspectSkillProgress: () => SkillProgressDto[];
  onBuySeed: (marketId: MarketId, itemId: string, quantity: number) => void;
  onBuyItem: (marketId: MarketId, itemId: string, quantity: number) => void;
  onBuyRod: (marketId: MarketId, rodId: string) => void;
  onEquipRod: (marketId: MarketId, rodId: string) => void;
  onSellFishCargo: (marketId: MarketId, cargoId: string) => void;
  onSellAllFishCargo: (marketId: MarketId) => void;
  onDiscardFishCargo: (marketId: MarketId, cargoId: string) => void;
  onDeliverContractItems: (contractId: string, itemId: string, quantity: number) => void;
  onDeliverFishCargo: (contractId: string, cargoId: string) => void;
  onQuickSave: () => void;
  savingAvailable?: boolean;
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
  mobileTouchDevice?: boolean;
  mobileLandscape?: boolean;
  mobileOrientationBlocked?: boolean;
  onRequestMobileLandscape?: () => void;
  onSetVirtualMoveVector?: (vector: VirtualMoveVector) => void;
  onSetVirtualSprint?: (held: boolean) => void;
  onQueueVirtualJump?: () => void;
  onDispatchVirtualAction?: (action: GameAction) => void;
  onSetVirtualFishingInput?: (input: Partial<FishingInputState>) => void;
  onReleaseBasicFishingCast?: () => void;
  onClearVirtualInput?: () => void;
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
  worldHud,
  toastMessage,
  notices,
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
  onInspectPlanting,
  onInspectSatchel,
  onInspectSeedBelt,
  selectedPlantCropId = null,
  onCancelPlacement,
  isFarmGisHeld = false,
  activeToolSlot = 1,
  onSelectToolSlot,
  landedCatch = null,
  onDismissCatchSummary,
  sportFishingHud,
  onSetFishingInput,
  onHookBasicFishingBite,
  onDismissBasicFishingModal,
  onDiscardBasicCatch,
  onSellItem,
  onSellAllProduce,
  onInspectCommodity,
  onInspectMarketBoard,
  onInspectMarketDemand,
  onInspectWorldMap,
  onInspectFarmForecast,
  onInspectExpeditionBoard,
  onInspectHoldStores,
  onInspectJournalPages,
  onInspectPauseSummary,
  onInspectSkillProgress,
  onBuySeed,
  onBuyItem,
  onBuyRod,
  onEquipRod,
  onSellFishCargo,
  onSellAllFishCargo,
  onDiscardFishCargo,
  onDeliverContractItems,
  onDeliverFishCargo,
  onQuickSave,
  savingAvailable = true,
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
  mobileTouchDevice = false,
  mobileLandscape = true,
  mobileOrientationBlocked = false,
  onRequestMobileLandscape = () => {},
  onSetVirtualMoveVector = () => {},
  onSetVirtualSprint = () => {},
  onQueueVirtualJump = () => {},
  onDispatchVirtualAction = () => {},
  onSetVirtualFishingInput = () => {},
  onReleaseBasicFishingCast = () => {},
  onClearVirtualInput = () => {},
  layoutEditor = null
}) => {
  const showDiagnostics =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");
  const [journalInitialFolio, setJournalInitialFolio] = useState<JournalFolio>("story");

  // Debug sessions need the diagnostic surface while the real runtime boots;
  // the boot-ready attribute is the synchronization point for browser checks.
  if (startup.status !== "ready" && !showDiagnostics) {
    return (
      <div
        id="ui-container"
        data-mobile-device={mobileTouchDevice ? "true" : "false"}
        data-mobile-landscape={mobileLandscape ? "true" : "false"}
        style={{ width: "100%", height: "100%", position: "relative" }}
      >
        <StartScreen
          startup={startup}
          onStart={onStart}
          onStartNewGame={onStartNewGame}
          onStartWithoutSaving={onStartWithoutSaving}
          onRetry={onRetry}
          graphicsQuality={graphicsQuality}
          effectiveGraphicsQuality={effectiveGraphicsQuality}
          onGraphicsQualityChange={onGraphicsQualityChange}
        />
      </div>
    );
  }

  const plannerUnlocked = worldHud.expeditionUnlocked;

  return (
    <div
      id="ui-container"
      tabIndex={-1}
      data-mobile-device={mobileTouchDevice ? "true" : "false"}
      data-mobile-landscape={mobileLandscape ? "true" : "false"}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      <div className={`screen-transition-overlay ${screenFade ? "active" : ""}`} />

      <MobileOrientationGate
        touchDevice={mobileTouchDevice}
        orientationBlocked={mobileOrientationBlocked}
        onRequestLandscape={onRequestMobileLandscape}
      />

      {mode !== "sport-fishing" && (
        <HUD
          hud={worldHud}
          promptText={promptText}
          toastMessage={toastMessage}
          notices={notices}
          activeQuest={activeQuest}
          activeToolSlot={activeToolSlot}
          onSelectToolSlot={onSelectToolSlot}
          onOpenMenu={() => onSetActiveModal("pause")}
          onInspectFarmForecast={onInspectFarmForecast}
          isPlacementActive={mode === "farm-placement"}
        />
      )}

      <MobileControls
        touchDevice={mobileTouchDevice}
        landscape={mobileLandscape}
        orientationBlocked={mobileOrientationBlocked}
        bootReady={bootReady}
        mode={mode}
        activeModal={activeModal}
        basicFishingPhase={worldHud.basicFishingPhase}
        onSetMoveVector={onSetVirtualMoveVector}
        onSetSprint={onSetVirtualSprint}
        onQueueJump={onQueueVirtualJump}
        onVirtualAction={onDispatchVirtualAction}
        onSetFishingInput={onSetVirtualFishingInput}
        onReleaseBasicCast={onReleaseBasicFishingCast}
        onClearVirtualInput={onClearVirtualInput}
      />

      {mode !== "sport-fishing" && inspectedCrop && (
        <CropInspection
          inspection={inspectedCrop}
          onClose={onDismissCropInspection}
        />
      )}
      {mode !== "sport-fishing" && farmingAction && farmingAction.action !== "cast" && (
        <FarmingActionStatus action={farmingAction} />
      )}

      <FarmGISLegend visible={mode !== "sport-fishing" && isFarmGisHeld} />

      {mode === "farm-placement" && !activeModal && (
        <PlantingSeedBar
          seedBelt={onInspectSeedBelt()}
          selectedCropId={selectedPlantCropId}
          onSelectCrop={onSelectPlantCrop}
          onCancel={onCancelPlacement}
        />
      )}

      {mode !== "sport-fishing" && activeHint && onDismissHint && (
        <ContextualHintCard
          hintId={activeHint.hintId}
          title={activeHint.title}
          message={activeHint.message}
          icon={activeHint.icon}
          onDismiss={onDismissHint}
          captureEscape={!activeModal && mode !== "basic-fishing"}
        />
      )}

      {state.basicFishing && !activeModal && (
        <BasicFishingMinigameWidget
          fishingState={state.basicFishing}
          onHookBite={onHookBasicFishingBite}
          onDismissModal={onDismissBasicFishingModal}
          onOpenSatchel={() => onSetActiveModal("inventory")}
          onDiscardCatch={onDiscardBasicCatch}
        />
      )}

      {mode === "sport-fishing" && sportFishingHud && !activeModal && (
        <FishingHUD hud={sportFishingHud} onSetInput={onSetFishingInput} />
      )}

      {mode !== "sport-fishing" && landedCatch && onDismissCatchSummary && (
        <CatchSummaryToast
          cargo={landedCatch}
          onDismiss={onDismissCatchSummary}
        />
      )}

      {activeModal === "dialogue" && activeDialogueNpcId && onTalkNpc && (
        <DialogueModal
          npcId={activeDialogueNpcId}
          activeQuest={activeQuest ?? null}
          onClose={() => onSetActiveModal(null)}
          onTalkNpc={onTalkNpc}
        />
      )}

      {activeModal === "inventory" && (
        <InventoryModal
          satchel={onInspectSatchel()}
          onClose={() => onSetActiveModal(null)}
          onSelectPlantCrop={onSelectPlantCrop}
          onInspectPlanting={onInspectPlanting}
        />
      )}

      {activeModal === "market" && (
        <MarketModal
          board={marketId ? onInspectMarketBoard(marketId) : null}
          onSellItem={onSellItem}
          onSellAllProduce={onSellAllProduce}
          onInspectCommodity={onInspectCommodity}
          onBuySeed={onBuySeed}
          onBuyItem={onBuyItem}
          onBuyRod={onBuyRod}
          onEquipRod={onEquipRod}
          onSellFishCargo={onSellFishCargo}
          onSellAllFishCargo={onSellAllFishCargo}
          onDiscardFishCargo={onDiscardFishCargo}
          onDeliverContractItems={onDeliverContractItems}
          onDeliverFishCargo={onDeliverFishCargo}
          onClose={() => onSetActiveModal(null)}
        />
      )}

      {activeModal === "map" && (
        <WorldMapModal
          map={onInspectWorldMap()}
          onInspectMarketDemand={onInspectMarketDemand}
          onClose={() => onSetActiveModal(null)}
        />
      )}

      {activeModal === "ledger" && (
        <LogisticsLedgerModal stores={onInspectHoldStores()} onClose={() => onSetActiveModal(null)} />
      )}

      {activeModal === "expedition" && plannerUnlocked && (
        <ExpeditionBoard board={onInspectExpeditionBoard()} onClose={() => onSetActiveModal(null)} />
      )}

      {activeModal === "journal" && (
        <JournalModal
          pages={onInspectJournalPages()}
          activeQuest={activeQuest ?? null}
          skills={onInspectSkillProgress()}
          initialFolio={journalInitialFolio}
          onClose={() => {
            setJournalInitialFolio("story");
            onSetActiveModal(null);
          }}
        />
      )}

      {activeModal === "new-game-confirm" && (
        <SaveRecoverySheet
          reason={saveRecoveryReason}
          onCancel={() => onDismissNewGameConfirm?.()}
          onConfirm={() => onConfirmNewGame?.()}
        />
      )}

      {activeModal === "pause" && (
        <EscapeMenuModal
          pause={onInspectPauseSummary()}
          onClose={() => onSetActiveModal(null)}
          onResetPlayerToSafePlace={onResetPlayerToSafePlace}
          onQuickSave={onQuickSave}
          savingAvailable={savingAvailable}
          onOpenInventory={() => onSetActiveModal("inventory")}
          onOpenJournal={() => {
            setJournalInitialFolio("story");
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

const SaveRecoverySheet: React.FC<{
  reason: "corrupt" | "incompatible" | "unavailable" | null;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ reason, onCancel, onConfirm }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(modalRef, onCancel);
  const unavailable = reason === "unavailable";
  const title = unavailable
    ? "Continue without saving?"
    : reason === "incompatible"
      ? "Replace the older harbor log?"
      : "Replace the unreadable harbor log?";
  const consequence = unavailable
    ? "Save storage is unavailable. This session will be lost when you leave or reload; the existing harbor log remains untouched."
    : reason === "incompatible"
      ? "This harbor log was written for an older coast. Starting fresh replaces it once the new world is ready."
      : "Neither the harbor log nor its backup could be read. Starting fresh replaces both once the new world is ready.";

  return (
    <div className="modal-overlay interactive">
      <GameSheet
        ref={modalRef}
        as="section"
        className="critical-save-sheet"
        tone="scroll"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="save-recovery-title"
        aria-describedby="save-recovery-consequence"
        tabIndex={-1}
      >
        <header className="modal-header">
          <h2 id="save-recovery-title">{title}</h2>
          <ChromeClose onClick={onCancel} label="Keep harbor log" />
        </header>
        <div className="modal-body">
          <p id="save-recovery-consequence">{consequence}</p>
          <strong className="critical-save-indicator">
            {unavailable ? "Saving will remain off" : "Current save will be replaced"}
          </strong>
        </div>
        <footer className="modal-footer">
          <ChromeButton onClick={onCancel}>{unavailable ? "Return" : "Keep harbor log"}</ChromeButton>
          <ChromeButton variant="danger" soundCue="confirm" onClick={onConfirm}>
            {unavailable ? "Continue without saving" : "Start a new game"}
          </ChromeButton>
        </footer>
      </GameSheet>
    </div>
  );
};

const titleCase = (value: string): string =>
  value.replace(/(^|[-_])\w/g, (match) => match.replace(/[-_]/, "").toUpperCase());

export const CropInspection: React.FC<{
  inspection: CropInspectionDto;
  onClose?: () => void;
}> = ({ inspection, onClose }) => {
  const moistureTone =
    inspection.moisture.band === "wet"
      ? "wet"
      : inspection.moisture.band === "normal"
        ? "ideal"
        : "dry";
  return (
    <GameSheet
      family="ink"
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
            <dt>Stage</dt>
            <dd className="crop-growth-status">{inspection.stageTimingLabel}</dd>
          </div>
          <div className="crop-meta-item">
            <dt>Moisture</dt>
            <dd className={`moisture-badge moisture-${moistureTone}`}>{titleCase(inspection.moisture.band)}</dd>
          </div>
          <div className="crop-meta-item crop-next-action">
            <dt>Next</dt>
            <dd>
              <strong>{inspection.immediateAction.label}</strong>
              {inspection.immediateAction.cost != null && <span>{inspection.immediateAction.cost} Work</span>}
              {inspection.immediateAction.blockerReason && <span>{inspection.immediateAction.blockerReason}</span>}
            </dd>
          </div>
        </dl>
      </div>

    </GameSheet>
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
    <GameSheet family="ink" tone="slate" corners className={`farming-action-status action-${action.action}`} role="status" aria-live="polite" data-testid="farming-action-status">
      <Meter
        className="farming-action-meter"
        label={meta.title}
        icon={<AtlasImage src={atlasForAction(action.action)} className="farming-action-icon" size={22} aria-hidden="true" />}
        value={percent}
        max={100}
        valueText={`${percent}%`}
        variant="gold"
      />
    </GameSheet>
  );
};
