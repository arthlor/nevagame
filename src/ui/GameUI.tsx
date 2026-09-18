import React, { useEffect, useState } from "react";
import {
  BasicFishingState,
  EquipmentId,
  EquipmentPresetId,
  FishCargoState,
  GameAction,
  GameMode,
  GameState,
  MarketId,
  RecipeId,
  RodId
} from "../simulation/core/types";
import { NauticalCompassAlmanac } from "./hud/NauticalCompassAlmanac";
import { NoticeStack } from "./components/NoticeStack";
import { HUD } from "./HUD";
import { InventoryModal } from "./InventoryModal";
import { MarketModal } from "./MarketModal";
import { FishingHUD } from "./FishingHUD";
import { BasicFishingMinigameWidget } from "./fishing/BasicFishingMinigameWidget";
import { LaborMinigameWidget } from "./labor/LaborMinigameWidget";
import { ExpeditionBoard } from "./ExpeditionBoard";
import { JournalFolio, JournalModal } from "./JournalModal";
import { EscapeMenuModal } from "./EscapeMenuModal";
import { WorldMapModal } from "./components/WorldMapModal";
import { LogisticsLedgerModal } from "./components/LogisticsLedgerModal";
import { CatchInspectionModal, CatchSummaryToast } from "./components/CatchInspectionModal";
import { CropInspection } from "./components/CropInspection";
import { PlantingSeedBar } from "./components/PlantingSeedBar";
import { FarmGISLegend } from "./components/FarmGISLegend";
import { buildTrophyCatchDto } from "../simulation/fishing/trophyCatch";
import { calculateFreshnessLoss, resolveCargoHasIce, resolveCargoTemperatureC } from "../simulation/fishing/calculateFreshness";
import { ContentRegistry } from "../content/ContentRegistry";
import {
  DebugOverlay,
  type DebugCameraDiagnostics,
  type DebugCharacterDiagnostics,
  type RenderStats
} from "./DebugOverlay";
import { DialogueModal, type DialogueTalkResult } from "./DialogueModal";
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
  TrophyCatchDto,
  WorldHudDto,
  WorldMapDto,
  AlmanacDto,
  PeoplePageDto} from "../simulation/core/contracts";
import type { ChronicleEntry, ChronicleFilter, Notice } from "./notifications";
import { StartScreen } from "./StartScreen";
import type { VillageNoticeDto } from "../content/villageBulletin";
import { PlacementEditorHud } from "./PlacementEditorHud";
import { CharacterScreen } from "./CharacterScreen";
import { CraftingModal } from "./CraftingModal";
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
  state: GameState;
  /** A detached presentation snapshot; the widget must never receive live sim state. */
  basicFishingState: Readonly<BasicFishingState> | null;
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
  /** Authored town notices selected from earned state, shown in the journal board. */
  villageNotices?: readonly VillageNoticeDto[];
  /** The named cast and earned standing, shown in the journal People folio. */
  people?: PeoplePageDto;
  /** A one-shot request to open the journal already turned to a folio. */
  journalOpenRequest?: { folio: JournalFolio; token: number } | null;
  inspectedCrop: CropInspectionDto | null;
  inspectedCropPosition?: { x: number; y: number; visible: boolean } | null;
  onDismissCropInspection?: () => void;
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
  activeToolSlot?: number;
  onSelectToolSlot?: (slot: number) => void;
  toolRevealToken?: number;
  landedCatch?: FishCargoState | TrophyCatchDto | null;
  landedCatchRecord?: "first" | "weight" | "quality" | null;
  onDismissCatchSummary?: () => void;
  sportFishingHud: SportFishingHudDto | null;
  /** Active Work-shift timing readout; null when no shift is in progress. */
  laborHud: LaborHudDto | null;
  onLaborStrike: () => void;
  onLaborCancel: () => void;
  onSetFishingInput: (input: {
    isReeling: boolean;
    isSlacking: boolean;
    isBracing: boolean;
    rodDirectionAngle: number;
  }) => void;
  onSetFishingDrag?: (notch: 0 | 1 | 2) => void;
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
  basicFishingState,
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
  villageNotices = [],
  people,
  journalOpenRequest = null,
  inspectedCrop,
  inspectedCropPosition = null,
  onDismissCropInspection,
  farmingAction,
  activeModal,
  onSetActiveModal,
  marketId,
  activeQuest,
  activeQuests,
  onFocusTrack,
  onTalkNpc,
  activeDialogueNpcId,
  activeHint,
  onDismissHint,
  onSelectPlantCrop,
  onInspectPlanting,
  onInspectItem,
  onConsumeItem,
  onSortSatchel,
  onTransferStores,
  onInspectDemandTrend,
  onInspectSatchel,
  onInspectSeedBelt,
  selectedPlantCropId = null,
  onCancelPlacement,
  isFarmGisHeld = false,
  activeToolSlot = 1,
  onSelectToolSlot,
  toolRevealToken = 0,
  landedCatch = null,
  landedCatchRecord = null,
  onDismissCatchSummary,
  sportFishingHud,
  laborHud,
  onLaborStrike,
  onLaborCancel,
  onSetFishingInput,
  onSetFishingDrag,
  onSetBasicFishingHold,
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
  onInspectCharacter,
  onEquipEquipment,
  onEquipCharacterRod,
  onSaveEquipmentPreset,
  onApplyEquipmentPreset,
  craftingStationId = null,
  onInspectProcessingStation,
  onStartProcessing,
  onInspectAlmanac,
  onBuySeed,
  onBuyItem,
  onBuyRod,
  onEquipRod,
  onSellFishCargo,
  onSellAllFishCargo,
  onDiscardFishCargo,
  onReleaseFishCargo,
  onDeliverContractItems,
  onDeliverFishCargo,
  onPassContract,
  onQuickSave,
  savingAvailable = true,
  onResetPlayerToSafePlace,
  onEmergencyTow,
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
  // The world board asks for the notices folio by token, so a repeated read
  // still lands on Notices instead of the journal's last page.
  useEffect(() => {
    if (journalOpenRequest) setJournalInitialFolio(journalOpenRequest.folio);
  }, [journalOpenRequest]);
  const showTrophyModal = activeModal === "catch";

  const [customWaypoint, setCustomWaypoint] = useState<{ x: number; z: number } | null>(null);

  const effectiveWorldHud = React.useMemo(() => {
    if (!customWaypoint) return worldHud;
    const dx = customWaypoint.x - state.player.x;
    const dz = customWaypoint.z - state.player.z;
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
  }, [worldHud, customWaypoint, state.player.x, state.player.z]);

  const trophyCatchDto = ((): TrophyCatchDto | null => {
    if (!landedCatch) return null;
    if ("qualityStars" in landedCatch) return landedCatch;
    // Shelf life must use the cargo's real decay: an iced hold or cold room
    // keeps a catch far longer than the species' open-air base rate.
    const species = ContentRegistry.fishSpecies.get(landedCatch.speciesId);
    const effectiveDecay = species
      ? calculateFreshnessLoss(
          1,
          species.baseDecayRatePerMinute,
          landedCatch.location.type,
          resolveCargoHasIce(state, landedCatch),
          resolveCargoTemperatureC(state, landedCatch)
        )
      : undefined;
    return buildTrophyCatchDto(landedCatch, landedCatchRecord, 1, 1, effectiveDecay);
  })();

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
          hud={effectiveWorldHud}
          playerPosition={state.player}
          blocked={!!activeModal}
          promptText={promptText}
          toastMessage={toastMessage}
          notices={activeModal ? [] : notices}
          activeQuest={activeQuest}
          activeQuests={activeQuests}
          onFocusTrack={onFocusTrack}
          activeToolSlot={activeToolSlot}
          onSelectToolSlot={onSelectToolSlot}
          toolRevealToken={toolRevealToken}
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

      {mode !== "sport-fishing" && mode !== "farm-placement" && mode !== "basic-fishing" && !activeModal && !showTrophyModal && inspectedCrop && (
        <CropInspection
          inspection={inspectedCrop}
          projectedPosition={inspectedCropPosition}
          onClose={onDismissCropInspection}
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

      {mode === "sport-fishing" && !activeModal && <div className="guild-fishing-map interactive">
        <NauticalCompassAlmanac clock={worldHud.clock} weather={worldHud.weather} compass={worldHud.compass}
          playerPosition={state.player} onToggleForecast={() => onSetActiveModal("pause")} passive />
      </div>}

      {mode === "sport-fishing" && sportFishingHud && !activeModal && (
        <FishingHUD
          hud={sportFishingHud}
          onSetInput={onSetFishingInput}
          onSetDrag={onSetFishingDrag}
        />
      )}

      {mode !== "sport-fishing" && landedCatch && onDismissCatchSummary && !showTrophyModal && (
        <CatchSummaryToast
          cargo={"qualityStars" in landedCatch ? undefined : landedCatch}
          catchData={trophyCatchDto}
          onDismiss={onDismissCatchSummary}
          onClick={() => onSetActiveModal("catch")}
        />
      )}

      {showTrophyModal && trophyCatchDto && (
        <CatchInspectionModal
          catchData={trophyCatchDto}
          onDismiss={() => {
            onDismissCatchSummary?.();
          }}
          onOpenHoldOrSatchel={() => {
            onDismissCatchSummary?.();
            onSetActiveModal("inventory");
          }}
        />
      )}

      {/* The HUD owns the world notice stack but is hidden during a fight, which
          must still hear about a snapped line, an escape or a full hold. */}
      {mode === "sport-fishing" && !activeModal && notices && <NoticeStack notices={notices} />}

      {activeModal === "dialogue" && activeDialogueNpcId && onTalkNpc && (
        <DialogueModal
          npcId={activeDialogueNpcId}
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
          onInspectItem={onInspectItem}
          onSortSatchel={onSortSatchel}
          onConsumeItem={onConsumeItem}
        />
      )}

      {activeModal === "character" && (
        <CharacterScreen
          character={onInspectCharacter()}
          onClose={() => onSetActiveModal(null)}
          onEquipEquipment={onEquipEquipment}
          onEquipRod={onEquipCharacterRod}
          onSavePreset={onSaveEquipmentPreset}
          onApplyPreset={onApplyEquipmentPreset}
          onOpenSatchel={() => onSetActiveModal("inventory")}
          onOpenPause={() => onSetActiveModal("pause")}
        />
      )}

      {activeModal === "crafting" && craftingStationId && (() => {
        const station = onInspectProcessingStation(craftingStationId);
        return station ? (
          <CraftingModal
            station={station}
            onClose={() => onSetActiveModal(null)}
            onStart={onStartProcessing}
          />
        ) : null;
      })()}

      {activeModal === "market" && (
        <MarketModal
          board={marketId ? onInspectMarketBoard(marketId) : null}
          onSellItem={onSellItem}
          onSellAllProduce={onSellAllProduce}
          onInspectCommodity={onInspectCommodity}
          onInspectDemandTrend={onInspectDemandTrend}
          onBuySeed={onBuySeed}
          onBuyItem={onBuyItem}
          onBuyRod={onBuyRod}
          onEquipRod={onEquipRod}
          onSellFishCargo={onSellFishCargo}
          onSellAllFishCargo={onSellAllFishCargo}
          onDiscardFishCargo={onDiscardFishCargo}
          onReleaseFishCargo={onReleaseFishCargo}
          onDeliverContractItems={onDeliverContractItems}
          onDeliverFishCargo={onDeliverFishCargo}
          onPassContract={onPassContract}
          onClose={() => onSetActiveModal(null)}
        />
      )}

      {activeModal === "map" && (
        <WorldMapModal
          map={onInspectWorldMap()}
          questMarkers={worldHud.compass.nearbyMarkers.filter(
            (marker) => marker.kind === "quest" || marker.kind === "quest-secondary"
          )}
          customWaypoint={customWaypoint}
          onSetCustomWaypoint={setCustomWaypoint}
          onInspectMarketDemand={onInspectMarketDemand}
          onClose={() => onSetActiveModal(null)}
        />
      )}

      {activeModal === "ledger" && (
        <LogisticsLedgerModal
          stores={onInspectHoldStores()}
          onClose={() => onSetActiveModal(null)}
          onTransfer={onTransferStores}
        />
      )}

      {activeModal === "expedition" && plannerUnlocked && (
        <ExpeditionBoard board={onInspectExpeditionBoard()} onClose={() => onSetActiveModal(null)} />
      )}

      {activeModal === "journal" && (
        <JournalModal
          pages={onInspectJournalPages()}
          activeQuest={activeQuest ?? null}
          activeQuests={activeQuests}
          skills={onInspectSkillProgress()}
          almanac={onInspectAlmanac?.()}
          // Omit the prop entirely when empty so the Notices folio is hidden;
          // an empty array is truthy and would always show the tab.
          notices={villageNotices.length > 0 ? villageNotices : undefined}
          people={people}
          initialFolio={journalInitialFolio}
          onClose={() => {
            setJournalInitialFolio("story");
            onSetActiveModal(null);
          }}
        />
      )}

      {activeModal === "pause" && (
        <EscapeMenuModal
          pause={onInspectPauseSummary()}
          onClose={() => onSetActiveModal(null)}
          onResetPlayerToSafePlace={onResetPlayerToSafePlace}
          onEmergencyTow={onEmergencyTow}
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

export { CropInspection, type CropInspectionProps } from "./components/CropInspection";
