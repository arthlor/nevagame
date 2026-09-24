import React, { useEffect, useState } from "react";
import {
  BasicFishingState,
  CropQuality,
  EquipmentId,
  EquipmentPresetId,
  GameAction,
  GameMode,
  MarketId,
  RecipeId,
  RodId
} from "../simulation/core/types";
import { NauticalCompassAlmanac } from "./hud/NauticalCompassAlmanac";
import { NoticeStack } from "./components/NoticeStack";
import { HUD } from "./HUD";
import type { ContextualCropChoice } from "./hud/ContextualCropChoice";
import { FishingHUD } from "./FishingHUD";
import { BasicFishingMinigameWidget } from "./fishing/BasicFishingMinigameWidget";
import { LaborMinigameWidget } from "./labor/LaborMinigameWidget";
import { LaborShiftResult, type LaborShiftFeedbackDto } from "./labor/LaborShiftResult";
import { StormHelmWidget } from "./boats/StormHelmWidget";
import type { JournalFolio } from "./JournalModal";
import { CatchSummaryToast } from "./components/CatchSummaryToast";
import { CropInspection } from "./components/CropInspection";
import { PlantingSeedBar } from "./components/PlantingSeedBar";
import { FarmGISLegend } from "./components/FarmGISLegend";
import type { DebugGameSnapshot } from "../app/GameUiSnapshot";
import { GameUiModalLayer } from "./GameUiModalLayer";
import {
  DebugOverlay,
  type DebugCameraDiagnostics,
  type DebugCharacterDiagnostics,
  type RenderStats
} from "./DebugOverlay";
import type { DialogueTalkResult } from "./DialogueModal";
import { ContextualHintCard } from "./ContextualHintCard";
import type { ActiveQuestDto } from "../simulation/core/QuestTypes";
import type { ExpeditionBoardDto } from "../simulation/expeditions/buildExpeditionOpportunities";
import type { AssetCoverageSummary } from "../render/assets/AssetCoverage";
import type { ActiveModal } from "../app/ModeController";
import type { FarmingActionSnapshot } from "../app/FarmingActionController";
import { FarmingActionStatus } from "./components/FarmingActionStatus";
import type { StartupState } from "../app/StartupState";
import type {
  CharacterEquipmentDto,
  CommodityQuote,
  CompassMarkerDto,
  CropInspectionDto,
  EmergencyTowQuoteDto,
  FarmForecastDto,
  HoldStoresDto,
  InteractionResult,
  JournalPagesDto,
  MarketBoardDto,
  MarketDemandSignal,
  PauseSummaryDto,
  SatchelDto,
  ItemInspectionDto,
  MarketDemandTrendDto,
  ProcessingStationDto,
  SeedBeltDto,
  SkillProgressDto,
  SportFishingHudDto,
  LaborHudDto,
  StormHelmHudDto,
  TrophyCatchDto,
  WorldHudDto,
  WorldMapDto,
  AlmanacDto,
  PeoplePageDto} from "../simulation/core/contracts";
import type { ChronicleEntry, ChronicleFilter, Notice } from "./notifications";
import { StartScreen } from "./StartScreen";
import type { VillageNoticeDto } from "../content/villageBulletin";
import { PlacementEditorHud } from "./PlacementEditorHud";
import { MobileControls, MobileOrientationGate } from "./MobileControls";
import type { FishingInputState, VirtualMoveVector } from "../input/InputRouter";
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
  errorDetail: null,
  errorCode: null,
  errorPhase: null,
  saveStatus: "empty",
  saveSummary: null
};

export interface GameUIProps {
  playerPosition: { x: number; z: number };
  sessionRevision: number;
  debugSnapshot: DebugGameSnapshot | null;
  /** A detached presentation snapshot; the widget must never receive live sim state. */
  basicFishingState: Readonly<BasicFishingState> | null;
  mode: GameMode;
  canFishHere?: boolean;
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
  /** Authored town notices selected from earned state, shown in the journal board. */
  villageNotices?: readonly VillageNoticeDto[];
  /** The named cast and earned standing, shown in the journal People folio. */
  people?: PeoplePageDto;
  /** A one-shot request to open the journal already turned to a folio. */
  journalOpenRequest?: { folio: JournalFolio; token: number } | null;
  inspectedCrop: CropInspectionDto | null;
  inspectedCropPosition?: { x: number; y: number; visible: boolean } | null;
  onDismissCropInspection?: () => void;
  /** Dispatches the canonical crop.unroot command for the inspected planting. */
  onUnrootCrop?: (placedCropId: string) => void;
  farmingAction: FarmingActionSnapshot | null;
  activeModal: ActiveModal;
  onSetActiveModal: (modal: ActiveModal) => void;
  marketId: MarketId | null;
  activeQuest?: ActiveQuestDto | null;
  activeQuests?: readonly ActiveQuestDto[];
  onFocusTrack?: (trackId: string) => void;
  activeDialogueNpcId?: string | null;
  onTalkNpc?: (npcId: string) => DialogueTalkResult;
  activeHint?: { hintId: string; title: string; message: string; icon?: string } | null;
  onDismissHint?: (hintId: string) => void;
  onSelectPlantCrop: (cropId: string) => void;
  onInspectPlanting: (cropId: string) => { valid: boolean; reason?: string };
  onInspectItem?: (itemId: string) => ItemInspectionDto | null;
  onConsumeItem?: (itemId: string) => InteractionResult;
  onSortSatchel?: () => { success: boolean; reason?: string };
  onDiscardItem?: (itemId: string, quantity: number, quality: CropQuality | null) => InteractionResult;
  onTransferStores?: (
    itemId: string,
    quantity: number,
    boatId: string,
    direction: "to-hold" | "to-satchel"
  ) => { success: boolean; reason?: string };
  onInspectDemandTrend?: (marketId: MarketId, itemId: string) => MarketDemandTrendDto | null;
  onInspectSatchel: () => SatchelDto;
  onInspectSeedBelt: () => SeedBeltDto;
  selectedPlantCropId?: string | null;
  onCancelPlacement: () => void;
  isFarmGisHeld?: boolean;
  contextualCropChoices?: readonly ContextualCropChoice[];
  onChooseCropAction?: (choice: ContextualCropChoice) => void;
  canStartPlanting?: boolean;
  onStartPlanting?: () => void;
  landedCatch?: TrophyCatchDto | null;
  onDismissCatchSummary?: () => void;
  sportFishingHud: SportFishingHudDto | null;
  /** Active Work-shift timing readout; null when no shift is in progress. */
  laborHud: LaborHudDto | null;
  /** Active storm-helm stability readout; null when the sea is within range. */
  stormHelmHud: StormHelmHudDto | null;
  /** Last completed strike, held for its short result animation. */
  laborShiftFeedback?: LaborShiftFeedbackDto | null;
  onLaborStrike: () => void;
  onLaborCancel: () => void;
  onSetFishingInput: (input: {
    isReeling: boolean;
    isSlacking: boolean;
    isBracing: boolean;
    rodDirectionAngle: number;
  }) => void;
  onSetFishingDrag?: (notch: 0 | 1 | 2) => void;
  onKeepFishingCatch?: () => void;
  onReleaseFishingCatch?: () => void;
  onSetBasicFishingHold?: (holding: boolean) => void;
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
  /** Stows the carried catch aboard; `placement` picks hold or transom hook. */
  onStowCatch?: (boatId: string, placement: "hold" | "hook") => { success: boolean; reason?: string };
  /** Moves goods between the satchel and an authored storage facility. */
  onMoveStorageGoods?: (
    kind: string,
    itemId: string,
    quantity: number,
    direction: "deposit" | "withdraw"
  ) => { success: boolean; reason?: string };
  /** Moves the carried catch into or out of a storage facility. */
  onMoveStorageFish?: (
    kind: string,
    cargoId: string,
    direction: "store" | "take"
  ) => { success: boolean; reason?: string };
  /** Sets the carried catch down on walkable ground at the player's feet. */
  onDropCatch?: () => { success: boolean; reason?: string };
  onInspectJournalPages: () => JournalPagesDto;
  onInspectPauseSummary: () => PauseSummaryDto;
  onInspectSkillProgress: () => SkillProgressDto[];
  onInspectCharacter: () => CharacterEquipmentDto;
  onEquipEquipment: (equipmentId: EquipmentId) => InteractionResult;
  onEquipCharacterRod: (rodId: RodId) => InteractionResult;
  onSaveEquipmentPreset: (presetId: EquipmentPresetId) => InteractionResult;
  onApplyEquipmentPreset: (presetId: EquipmentPresetId) => InteractionResult;
  craftingStationId?: string | null;
  onInspectProcessingStation: (stationId: string) => ProcessingStationDto | null;
  onStartProcessing: (recipeId: RecipeId, stationId: string) => InteractionResult;
  onInspectAlmanac?: () => AlmanacDto;
  onBuySeed: (marketId: MarketId, itemId: string, quantity: number) => void;
  onBuyItem: (marketId: MarketId, itemId: string, quantity: number) => void;
  onBuyRod: (marketId: MarketId, rodId: string) => void;
  onEquipRod: (marketId: MarketId, rodId: string) => void;
  onSellFishCargo: (marketId: MarketId, cargoId: string) => void;
  onSellAllFishCargo: (marketId: MarketId) => void;
  onDiscardFishCargo: (marketId: MarketId, cargoId: string) => void;
  onReleaseFishCargo: (marketId: MarketId, cargoId: string) => void;
  onDeliverContractItems: (contractId: string, itemId: string, quantity: number) => void;
  onDeliverFishCargo: (contractId: string, cargoId: string) => void;
  onPassContract: (contractId: string) => void;
  onQuickSave: () => void;
  savingAvailable?: boolean;
  onResetPlayerToSafePlace: () => void;
  onEmergencyTow?: () => { success: boolean; reason?: string };
  onInspectEmergencyTowQuote?: () => EmergencyTowQuoteDto;
  chronicleEntries?: readonly ChronicleEntry[];
  chronicleFilter?: ChronicleFilter;
  onSelectChronicleFilter?: (filter: ChronicleFilter) => void;
  onAdvanceHours: (hours: number) => void;
  onGrantMoney: (amount: number) => void;
  onToggleWeather: () => void;
  onSpawnSchool: () => void;
  assetCoverage: AssetCoverageSummary;
  startup?: StartupState;
  onStart?: () => void;
  onSkipIntro?: () => void;
  onIntroFinished?: (played: boolean) => void;
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

export const GameUI: React.FC<GameUIProps> = (props) => {
  const {
  playerPosition,
  sessionRevision,
  debugSnapshot,
  basicFishingState,
  mode,
  canFishHere = false,
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
  journalOpenRequest = null,
  inspectedCrop,
  inspectedCropPosition = null,
  onDismissCropInspection,
  onUnrootCrop,
  farmingAction,
  activeModal,
  onSetActiveModal,
  activeQuest,
  activeQuests,
  onFocusTrack,
  activeHint,
  onDismissHint,
  onSelectPlantCrop,
  onInspectSeedBelt,
  selectedPlantCropId = null,
  onCancelPlacement,
  isFarmGisHeld = false,
  contextualCropChoices = [],
  onChooseCropAction,
  canStartPlanting = false,
  onStartPlanting,
  landedCatch = null,
  onDismissCatchSummary,
  sportFishingHud,
  laborHud,
  stormHelmHud,
  laborShiftFeedback = null,
  onLaborStrike,
  onLaborCancel,
  onSetFishingInput,
  onSetFishingDrag,
  onKeepFishingCatch,
  onReleaseFishingCatch,
  onSetBasicFishingHold,
  onHookBasicFishingBite,
  onDismissBasicFishingModal,
  onDiscardBasicCatch,
  onInspectFarmForecast,
  onInspectJournalPages,
  chronicleEntries,
  chronicleFilter,
  onSelectChronicleFilter,
  onAdvanceHours,
  onGrantMoney,
  onToggleWeather,
  onSpawnSchool,
  assetCoverage,
  startup = READY_STARTUP_STATE,
  onStart = () => {},
  onSkipIntro,
  onIntroFinished,
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
  } = props;
  const showDiagnostics =
    import.meta.env.DEV && typeof window !== "undefined"
    && new URLSearchParams(window.location.search).has("debug");
  const [journalInitialFolio, setJournalInitialFolio] = useState<JournalFolio>("story");
  // The world board asks for the notices folio by token, so a repeated read
  // still lands on Notices instead of the journal's last page.
  useEffect(() => {
    if (journalOpenRequest) setJournalInitialFolio(journalOpenRequest.folio);
  }, [journalOpenRequest]);
  const showTrophyModal = activeModal === "catch";

  const [customWaypoint, setCustomWaypoint] = useState<{ x: number; z: number } | null>(null);
  const [followingRecordId, setFollowingRecordId] = useState<string | null>(null);
  const hasEndgameRecordGuidance = Boolean(worldHud.recordTracker?.length);
  const canFollowRecords = !hasEndgameRecordGuidance;
  const recordSessionRevision = React.useRef(sessionRevision);
  useEffect(() => {
    if (recordSessionRevision.current !== sessionRevision) {
      recordSessionRevision.current = sessionRevision;
      setFollowingRecordId(null);
    }
  }, [sessionRevision]);
  const journalPages = activeModal === "journal" || followingRecordId
    ? onInspectJournalPages()
    : null;
  const followedRecord = followingRecordId
    ? journalPages?.records.find((record) => record.id === followingRecordId) ?? null
    : null;
  useEffect(() => {
    if (followingRecordId && (!followedRecord || followedRecord.achieved)) {
      setFollowingRecordId(null);
    }
  }, [followingRecordId, followedRecord]);
  useEffect(() => {
    if (hasEndgameRecordGuidance && followingRecordId) setFollowingRecordId(null);
  }, [hasEndgameRecordGuidance, followingRecordId]);

  const effectiveWorldHud = React.useMemo(() => {
    if (!customWaypoint) return worldHud;
    const dx = customWaypoint.x - playerPosition.x;
    const dz = customWaypoint.z - playerPosition.z;
    const distanceMeters = Math.round(Math.hypot(dx, dz));
    const targetAngleDeg = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
    const relativeBearingDeg = ((targetAngleDeg - worldHud.compass.headingDegrees + 540) % 360) - 180;

    const waypointMarker: CompassMarkerDto = {
      id: "custom-nav-waypoint",
      type: "waypoint",
      kind: "waypoint",
      x: customWaypoint.x,
      z: customWaypoint.z,
      label: "WAYPOINT",
      icon: "pin",
      distanceMeters,
      relativeBearingDeg
    };

    return {
      ...worldHud,
      compass: {
        ...worldHud.compass,
        nearbyMarkers: [waypointMarker, ...worldHud.compass.nearbyMarkers]
      }
    };
  }, [worldHud, customWaypoint, playerPosition.x, playerPosition.z]);

  const guidedWorldHud = React.useMemo(() => {
    if (!followedRecord || followedRecord.achieved || effectiveWorldHud.recordTracker?.length) return effectiveWorldHud;
    return { ...effectiveWorldHud, recordTracker: [followedRecord] };
  }, [effectiveWorldHud, followedRecord]);

  // Debug sessions need the diagnostic surface while the real runtime boots;
  // the boot-ready attribute is the synchronization point for browser checks.
  if (startup.status !== "ready" && !showDiagnostics) {
    return (
      <div
        id="ui-container"
      data-ui="guildcraft"
        data-mobile-device={mobileTouchDevice ? "true" : "false"}
        data-mobile-landscape={mobileLandscape ? "true" : "false"}
        style={{ width: "100%", height: "100%", position: "relative" }}
      >
        <StartScreen
          startup={startup}
          onStart={onStart}
          onSkipIntro={onSkipIntro}
          onIntroFinished={onIntroFinished}
          onStartNewGame={onStartNewGame}
          onStartWithoutSaving={onStartWithoutSaving}
          onRetry={onRetry}
          graphicsQuality={graphicsQuality}
          effectiveGraphicsQuality={effectiveGraphicsQuality}
          onGraphicsQualityChange={onGraphicsQualityChange}
          mobileTouchDevice={mobileTouchDevice}
          mobileOrientationBlocked={mobileOrientationBlocked}
        />
        <MobileOrientationGate
          touchDevice={mobileTouchDevice}
          orientationBlocked={mobileOrientationBlocked}
          onRequestLandscape={onRequestMobileLandscape}
        />
      </div>
    );
  }

  return (
    <div
      id="ui-container"
      data-ui="guildcraft"
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
          hud={guidedWorldHud}
          playerPosition={playerPosition}
          blocked={!!activeModal}
          promptText={promptText}
          toastMessage={toastMessage}
          notices={activeModal ? [] : notices}
          activeQuest={activeQuest}
          activeQuests={activeQuests}
          onFocusTrack={onFocusTrack}
          contextualCropChoices={contextualCropChoices}
          onChooseCropAction={onChooseCropAction}
          canStartPlanting={canStartPlanting}
          onStartPlanting={onStartPlanting}
          onOpenMenu={() => onSetActiveModal("pause")}
          onOpenModal={onSetActiveModal}
          onInspectFarmForecast={onInspectFarmForecast}
          isPlacementActive={mode === "farm-placement"}
          touchChrome={mobileTouchDevice}
          captureForecastEscape={!activeModal}
          forecastEnabled={(mode === "on-foot" || mode === "mounted" || mode === "boat-driving") && !layoutEditor?.active}
          chronicleEntries={chronicleEntries}
          chronicleFilter={chronicleFilter}
          onSelectChronicleFilter={onSelectChronicleFilter}
        />
      )}

      <MobileControls
        touchDevice={mobileTouchDevice}
        landscape={mobileLandscape}
        canFishHere={canFishHere}
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
        sportResponse={sportFishingHud && !sportFishingHud.awaitingLandingChoice ? { action: sportFishingHud.decision.action } : null}
        sportSteeringMagnitude={sportFishingHud?.steeringMagnitude}
        dragNotch={sportFishingHud && !sportFishingHud.awaitingLandingChoice ? sportFishingHud.dragNotch : null}
        onSetFishingDrag={onSetFishingDrag}
      />

      {mode !== "sport-fishing" && mode !== "farm-placement" && mode !== "basic-fishing" && !activeModal && !showTrophyModal && inspectedCrop && (
        <CropInspection
          inspection={inspectedCrop}
          projectedPosition={inspectedCropPosition}
          onClose={onDismissCropInspection}
          onUnroot={onUnrootCrop}
        />
      )}
      {mode !== "sport-fishing" && farmingAction && farmingAction.action !== "cast" && (
        <FarmingActionStatus action={farmingAction} />
      )}

      <FarmGISLegend visible={mode !== "sport-fishing" && !activeModal && !showTrophyModal && isFarmGisHeld} />

      {mode === "farm-placement" && !activeModal && (
        <PlantingSeedBar
          seedBelt={onInspectSeedBelt()}
          selectedCropId={selectedPlantCropId}
          onSelectCrop={onSelectPlantCrop}
          onCancel={onCancelPlacement}
          currentSeason={worldHud.clock.seasonLabel}
        />
      )}

      {mode !== "sport-fishing" && mode !== "farm-placement" && mode !== "basic-fishing" && !activeModal && !showTrophyModal && activeHint && onDismissHint && (
        <ContextualHintCard
          hintId={activeHint.hintId}
          title={activeHint.title}
          message={activeHint.message}
          icon={activeHint.icon}
          onDismiss={onDismissHint}
          captureEscape={!activeModal}
        />
      )}

      {basicFishingState && !activeModal && (
        <BasicFishingMinigameWidget
          fishingState={basicFishingState}
          onHoldChange={onSetBasicFishingHold}
          onHookBite={onHookBasicFishingBite}
          onDismissModal={onDismissBasicFishingModal}
          onOpenSatchel={() => onSetActiveModal("inventory")}
          onDiscardCatch={onDiscardBasicCatch}
        />
      )}

      {laborHud && !activeModal && mode !== "sport-fishing" && mode !== "basic-fishing" && (
        <LaborMinigameWidget hud={laborHud} onStrike={onLaborStrike} onCancel={onLaborCancel} />
      )}

      {!laborHud && laborShiftFeedback && !activeModal && mode !== "sport-fishing" && mode !== "basic-fishing" && (
        <LaborShiftResult key={laborShiftFeedback.token} feedback={laborShiftFeedback} />
      )}

      {stormHelmHud && !activeModal && mode === "boat-driving" && (
        <StormHelmWidget hud={stormHelmHud} />
      )}

      {mode === "sport-fishing" && !activeModal && <div className="guild-fishing-map interactive">
        <NauticalCompassAlmanac clock={worldHud.clock} weather={worldHud.weather} compass={worldHud.compass}
          playerPosition={playerPosition} onToggleForecast={() => onSetActiveModal("pause")} passive />
      </div>}

      {mode === "sport-fishing" && sportFishingHud && !activeModal && (
        <FishingHUD
          hud={sportFishingHud}
          onSetInput={onSetFishingInput}
          onSetDrag={onSetFishingDrag}
          onKeepCatch={onKeepFishingCatch}
          onReleaseCatch={onReleaseFishingCatch}
        />
      )}

      {mode !== "sport-fishing" && landedCatch && onDismissCatchSummary && !showTrophyModal && (
        <CatchSummaryToast
          catchData={landedCatch}
          onDismiss={onDismissCatchSummary}
          onClick={() => onSetActiveModal("catch")}
        />
      )}

      {/* The HUD owns the world notice stack but is hidden during a fight, which
          must still hear about a snapped line, an escape or a full hold. */}
      {mode === "sport-fishing" && !activeModal && notices && <NoticeStack notices={notices} />}

      <GameUiModalLayer
        ui={props}
        journalPages={journalPages}
        journalInitialFolio={journalInitialFolio}
        setJournalInitialFolio={setJournalInitialFolio}
        followingRecordId={followingRecordId}
        setFollowingRecordId={setFollowingRecordId}
        canFollowRecords={canFollowRecords}
        customWaypoint={customWaypoint}
        setCustomWaypoint={setCustomWaypoint}
      />

      {/* Modal notices are deliberately last so the status layer paints over
          the modal scrim/card instead of disappearing behind it. */}
      {activeModal && notices && <NoticeStack notices={notices} className="guild-modal-notices" />}

      {layoutEditor && (
        <PlacementEditorHud
          active={layoutEditor.active}
          selected={layoutEditor.selected}
          status={layoutEditor.status}
          onToggle={layoutEditor.onToggle}
        />
      )}

      {showDiagnostics && debugSnapshot && (
        <DebugOverlay
          snapshot={debugSnapshot}
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

export { CropInspection, type CropInspectionProps } from "./components/CropInspection";
