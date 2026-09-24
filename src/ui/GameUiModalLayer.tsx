import React, { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { GameUIProps } from "./GameUI";
import type { JournalFolio } from "./JournalModal";
import type { JournalPagesDto } from "../simulation/core/contracts";
import { usePwaInstall } from "./pwa/usePwaInstall";
import { GameSheet } from "./coastal/CoastalUI";

const CatchInspectionModal = React.lazy(async () => ({ default: (await import("./components/CatchInspectionModal")).CatchInspectionModal }));
const DialogueModal = React.lazy(async () => ({ default: (await import("./DialogueModal")).DialogueModal }));
const InventoryModal = React.lazy(async () => ({ default: (await import("./InventoryModal")).InventoryModal }));
const CharacterScreen = React.lazy(async () => ({ default: (await import("./CharacterScreen")).CharacterScreen }));
const CraftingModal = React.lazy(async () => ({ default: (await import("./CraftingModal")).CraftingModal }));
const MarketModal = React.lazy(async () => ({ default: (await import("./MarketModal")).MarketModal }));
const WorldMapModal = React.lazy(async () => ({ default: (await import("./components/WorldMapModal")).WorldMapModal }));
const LogisticsLedgerModal = React.lazy(async () => ({ default: (await import("./components/LogisticsLedgerModal")).LogisticsLedgerModal }));
const ExpeditionBoard = React.lazy(async () => ({ default: (await import("./ExpeditionBoard")).ExpeditionBoard }));
const JournalModal = React.lazy(async () => ({ default: (await import("./JournalModal")).JournalModal }));
const EscapeMenuModal = React.lazy(async () => ({ default: (await import("./EscapeMenuModal")).EscapeMenuModal }));
const PwaInstallPromptModal = React.lazy(async () => ({ default: (await import("./components/PwaInstallPromptModal")).PwaInstallPromptModal }));

interface GameUiModalLayerProps {
  ui: GameUIProps;
  journalPages: JournalPagesDto | null;
  journalInitialFolio: JournalFolio;
  setJournalInitialFolio: Dispatch<SetStateAction<JournalFolio>>;
  followingRecordId: string | null;
  setFollowingRecordId: Dispatch<SetStateAction<string | null>>;
  canFollowRecords: boolean;
  customWaypoint: { x: number; z: number } | null;
  setCustomWaypoint: Dispatch<SetStateAction<{ x: number; z: number } | null>>;
}

/** Owns modal interactions and their on-demand chunks; ordinary HUD frames stay lean. */
export const GameUiModalLayer: React.FC<GameUiModalLayerProps> = ({
  ui,
  journalPages,
  journalInitialFolio,
  setJournalInitialFolio,
  followingRecordId,
  setFollowingRecordId,
  canFollowRecords,
  customWaypoint,
  setCustomWaypoint
}) => {
  const {
    activeModal,
    onSetActiveModal,
    activeDialogueNpcId,
    onTalkNpc,
    onInspectSatchel,
    onSelectPlantCrop,
    onInspectPlanting,
    onInspectItem,
    onSortSatchel,
    onConsumeItem,
    onDiscardItem,
    onInspectCharacter,
    onEquipEquipment,
    onEquipCharacterRod,
    onSaveEquipmentPreset,
    onApplyEquipmentPreset,
    craftingStationId,
    onInspectProcessingStation,
    onStartProcessing,
    marketId,
    onInspectMarketBoard,
    onSellItem,
    onSellAllProduce,
    onInspectCommodity,
    onInspectDemandTrend,
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
    onInspectWorldMap,
    onInspectMarketDemand,
    worldHud,
    onInspectHoldStores,
    onTransferStores,
    onStowCatch,
    onMoveStorageGoods,
    onMoveStorageFish,
    onDropCatch,
    onInspectExpeditionBoard,
    onInspectSkillProgress,
    onInspectAlmanac,
    villageNotices = [],
    people,
    activeQuest,
    activeQuests,
    onInspectPauseSummary,
    onResetPlayerToSafePlace,
    onEmergencyTow,
    onInspectEmergencyTowQuote,
    onQuickSave,
    savingAvailable = true,
    graphicsQuality,
    effectiveGraphicsQuality,
    onGraphicsQualityChange,
    landedCatch,
    onDismissCatchSummary,
    startup,
    mobileOrientationBlocked
  } = ui;
  const plannerUnlocked = worldHud.expeditionUnlocked;
  const showTrophyModal = activeModal === "catch";
  const [pwaPromptManualOpen, setPwaPromptManualOpen] = useState(false);
  const pwa = usePwaInstall();
  const showPwaPromptInGame = pwaPromptManualOpen && startup?.status === "ready"
    && (activeModal === null || activeModal === "pause") && !mobileOrientationBlocked;

  return <React.Suspense fallback={
    <div className="modal-overlay interactive" aria-busy="true">
      <GameSheet className="modal-content neva-panel" tone="ghost" role="status" aria-live="polite">
        Opening…
      </GameSheet>
    </div>
  }>
      {showTrophyModal && landedCatch && (
        <CatchInspectionModal
          catchData={landedCatch}
          onDismiss={() => {
            onDismissCatchSummary?.();
          }}
          onOpenHoldOrSatchel={() => {
            onDismissCatchSummary?.();
            onSetActiveModal("inventory");
          }}
        />
      )}

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
          onDiscardItem={onDiscardItem}
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
          onStowCatch={onStowCatch}
          onMoveStorageGoods={onMoveStorageGoods}
          onMoveStorageFish={onMoveStorageFish}
          onDropCatch={onDropCatch}
        />
      )}

      {activeModal === "expedition" && plannerUnlocked && (
        <ExpeditionBoard board={onInspectExpeditionBoard()} onClose={() => onSetActiveModal(null)} />
      )}

      {activeModal === "journal" && (
        <JournalModal
          pages={journalPages!}
          activeQuest={activeQuest ?? null}
          activeQuests={activeQuests}
          skills={onInspectSkillProgress()}
          almanac={onInspectAlmanac?.()}
          // Omit the prop entirely when empty so the Notices folio is hidden;
          // an empty array is truthy and would always show the tab.
          notices={villageNotices.length > 0 ? villageNotices : undefined}
          people={people}
          initialFolio={journalInitialFolio}
          followingRecordId={followingRecordId}
          canFollowRecords={canFollowRecords}
          onFollowRecord={setFollowingRecordId}
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
          onInspectEmergencyTowQuote={onInspectEmergencyTowQuote}
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
          onPromptPwaInstall={() => {
            // Keep Pause in the stack: the sheet inherits its time freeze,
            // world-input suspension and return-to-Pause behavior.
            setPwaPromptManualOpen(true);
          }}
          isStandalone={pwa.isStandalone || pwa.isInstalled}
        />
      )}

      {showPwaPromptInGame && (
        <PwaInstallPromptModal
          platform={pwa.platform}
          canPromptDirectly={pwa.canPromptDirectly}
          onInstall={async () => {
            const outcome = await pwa.promptInstall();
            if (outcome === "accepted" || outcome === "dismissed") {
              setPwaPromptManualOpen(false);
              pwa.dismiss();
            }
          }}
          onDismiss={() => {
            setPwaPromptManualOpen(false);
            pwa.dismiss();
          }}
        />
      )}

  </React.Suspense>;
};
