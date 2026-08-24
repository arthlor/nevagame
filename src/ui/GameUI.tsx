// src/ui/GameUI.tsx
import React from "react";
import { FishingEncounterState, GameMode, GameState, MarketId } from "../simulation/core/types";
import { HUD } from "./HUD";
import { InventoryModal } from "./InventoryModal";
import { MarketModal } from "./MarketModal";
import { FishingHUD } from "./FishingHUD";
import { ExpeditionBoard } from "./ExpeditionBoard";
import { JournalModal } from "./JournalModal";
import { EscapeMenuModal } from "./EscapeMenuModal";
import { DebugOverlay, RenderStats } from "./DebugOverlay";

export type ActiveModal = "inventory" | "market" | "journal" | "expedition" | "pause" | null;

export interface GameUIProps {
  state: GameState;
  mode: GameMode;
  fps: number;
  renderStats: RenderStats;
  promptText: string | null;
  activeModal: ActiveModal;
  onSetActiveModal: (modal: ActiveModal) => void;
  onOpenMarket: () => void;
  marketId: MarketId | null;
  onSelectPlantCrop: (cropId: string) => void;
  fishingEncounter: FishingEncounterState | null;
  onSetFishingInput: (input: {
    isReeling: boolean;
    isSlacking: boolean;
    isBracing: boolean;
    rodDirectionAngle: number;
  }) => void;
  onSellItem: (marketId: MarketId, itemId: string, quantity: number) => void;
  onSellFishCargo: (marketId: MarketId, cargoId: string) => void;
  onDiscardFishCargo: (cargoId: string) => void;
  onDeliverContractItems: (contractId: string, itemId: string, quantity: number) => void;
  onDeliverFishCargo: (contractId: string, cargoId: string) => void;
  onQuickSave: () => void;
  onCastFishing: () => void;
  onResetPlayerToSafePlace: () => void;
  onAdvanceHours: (hours: number) => void;
  onGrantMoney: (amount: number) => void;
  onToggleWeather: () => void;
  onSpawnSchool: () => void;
}

export const GameUI: React.FC<GameUIProps> = ({
  state,
  mode,
  fps,
  renderStats,
  promptText,
  activeModal,
  onSetActiveModal,
  onOpenMarket,
  marketId,
  onSelectPlantCrop,
  fishingEncounter,
  onSetFishingInput,
  onSellItem,
  onSellFishCargo,
  onDiscardFishCargo,
  onDeliverContractItems,
  onDeliverFishCargo,
  onQuickSave,
  onCastFishing,
  onResetPlayerToSafePlace,
  onAdvanceHours,
  onGrantMoney,
  onToggleWeather,
  onSpawnSchool
}) => {
  const isDev = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
  const showDiagnostics = isDev && new URLSearchParams(window.location.search).has("debug");

  return (
    <div id="ui-container" style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* 1. Normal HUD */}
      <HUD
        state={state}
        promptText={promptText}
        onOpenInventory={() => onSetActiveModal("inventory")}
        onOpenMarket={onOpenMarket}
        onOpenJournal={() => onSetActiveModal("journal")}
        onOpenExpedition={() => onSetActiveModal("expedition")}
        onQuickSave={onQuickSave}
        onCastFishing={onCastFishing}
        onOpenMenu={() => onSetActiveModal("pause")}
      />

      {/* 2. Sport Fishing Minigame HUD */}
      {mode === "sport-fishing" && fishingEncounter && (
        <FishingHUD encounter={fishingEncounter} onSetInput={onSetFishingInput} />
      )}

      {/* 3. Modal Overlays */}
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
          onSellFishCargo={onSellFishCargo}
          onDiscardFishCargo={onDiscardFishCargo}
          onDeliverContractItems={onDeliverContractItems}
          onDeliverFishCargo={onDeliverFishCargo}
          onClose={() => onSetActiveModal(null)}
        />
      )}

      {activeModal === "expedition" && (
        <ExpeditionBoard state={state} onClose={() => onSetActiveModal(null)} />
      )}

      {activeModal === "journal" && (
        <JournalModal state={state} onClose={() => onSetActiveModal(null)} />
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
        />
      )}

      {/* 4. Diagnostics Overlay — DEV only */}
      {showDiagnostics && (
        <DebugOverlay
          state={state}
          mode={mode}
          fps={fps}
          renderStats={renderStats}
          onAdvanceHours={onAdvanceHours}
          onGrantMoney={onGrantMoney}
          onToggleWeather={onToggleWeather}
          onSpawnSchool={onSpawnSchool}
        />
      )}
    </div>
  );
};
