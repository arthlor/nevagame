// src/ui/EscapeMenuModal.tsx
import React from "react";
import { GameState } from "../simulation/core/types";

export interface EscapeMenuModalProps {
  state: GameState;
  onClose: () => void;
  onResetPlayerToSafePlace: () => void;
  onQuickSave: () => void;
  onOpenInventory: () => void;
  onOpenJournal: () => void;
  onOpenExpedition: () => void;
}

export const EscapeMenuModal: React.FC<EscapeMenuModalProps> = ({
  state,
  onClose,
  onResetPlayerToSafePlace,
  onQuickSave,
  onOpenInventory,
  onOpenJournal,
  onOpenExpedition
}) => {
  const clock = state.clock;
  const player = state.player;
  const hh = String(Math.floor((clock.currentMinute % 1440) / 60)).padStart(2, "0");
  const mm = String(clock.currentMinute % 60).padStart(2, "0");
  const seasonName = clock.season.charAt(0).toUpperCase() + clock.season.slice(1);
  const dayInSeason = ((clock.dayCount - 1) % 30) + 1;

  const currentRegion =
    player.currentRegionId === "region.village"
      ? "Neva Village"
      : player.currentRegionId === "region.farm"
        ? "Homestead Farm"
        : player.currentRegionId === "region.coast"
          ? "Rocky Coast & Lighthouse"
          : "Open Waters";

  return (
    <div className="modal-overlay interactive" onClick={onClose}>
      <div
        className="neva-panel modal-content"
        style={{ width: "560px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>⛵</span> Neva — Paused
          </span>
          <button
            className="neva-button neva-button-secondary"
            style={{ padding: "2px 8px" }}
            onClick={onClose}
            title="Resume Game (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Status summary banner */}
          <div
            style={{
              background: "#FFF",
              padding: "10px 14px",
              borderRadius: "6px",
              border: "2px solid #C4B5A2",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "13px"
            }}
          >
            <div>
              <div style={{ fontWeight: 700, color: "var(--color-wood-dark)" }}>
                📍 {currentRegion}
              </div>
              <div style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>
                Day {dayInSeason} of {seasonName}, Year {clock.year} ({hh}:{mm})
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 700, color: "var(--color-wood-dark)" }}>
                💰 {player.money} G
              </div>
              <div style={{ color: "var(--color-energy-green)", fontSize: "11px", fontWeight: 600 }}>
                ⚡ {Math.round(player.workCapacity.current)} / {player.workCapacity.maximum} Work
              </div>
            </div>
          </div>

          {/* Quick Menu Actions */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <button
              className="neva-button neva-button-teal"
              style={{ padding: "10px 14px", fontSize: "14px", fontWeight: 700 }}
              onClick={onClose}
            >
              ▶ Resume Game <kbd style={{ opacity: 0.8, fontSize: "11px" }}>[ESC]</kbd>
            </button>
            <button
              className="neva-button"
              style={{ padding: "10px 14px", fontSize: "14px" }}
              onClick={() => {
                onQuickSave();
              }}
            >
              💾 Save Game
            </button>
          </div>

          {/* Unstuck / Reset Character to Safe Place */}
          <div
            style={{
              background: "#FDF4EB",
              border: "2px dashed var(--color-terracotta)",
              borderRadius: "6px",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: "8px"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, color: "var(--color-terracotta)", fontSize: "13px" }}>
                🧭 Stuck or Glitched?
              </span>
              <button
                className="neva-button"
                style={{
                  background: "var(--color-terracotta)",
                  borderColor: "#88281A",
                  padding: "6px 12px",
                  fontSize: "12px",
                  fontWeight: 700
                }}
                onClick={onResetPlayerToSafePlace}
              >
                🔄 Reset to Safe Place
              </button>
            </div>
            <p style={{ fontSize: "11px", color: "var(--color-text-dark)", lineHeight: 1.4, margin: 0 }}>
              Teleports your character back to the Starter Garden in the Village and safely returns any active boat to the harbor dock.
            </p>
          </div>

          {/* Navigation Shortcuts */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              justifyContent: "space-between"
            }}
          >
            <button
              className="neva-button neva-button-secondary"
              style={{ flex: 1, padding: "6px 8px", fontSize: "12px" }}
              onClick={onOpenInventory}
            >
              🎒 Inventory <kbd>[I]</kbd>
            </button>
            <button
              className="neva-button neva-button-secondary"
              style={{ flex: 1, padding: "6px 8px", fontSize: "12px" }}
              onClick={onOpenJournal}
            >
              📖 Journal <kbd>[J]</kbd>
            </button>
            <button
              className="neva-button neva-button-secondary"
              style={{ flex: 1, padding: "6px 8px", fontSize: "12px" }}
              onClick={onOpenExpedition}
            >
              🗺️ Expedition
            </button>
          </div>

          {/* Controls Reference */}
          <div
            style={{
              background: "#FFF",
              padding: "10px 14px",
              borderRadius: "6px",
              border: "2px solid #C4B5A2",
              fontSize: "11px"
            }}
          >
            <h5 style={{ fontWeight: 700, color: "var(--color-wood-dark)", marginBottom: "6px" }}>
              🎮 Controls Quick Reference
            </h5>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", color: "#444" }}>
              <div><strong>[W / A / S / D]</strong> Move / Steer Boat</div>
              <div><strong>[Shift]</strong> Sprint (On foot)</div>
              <div><strong>[E]</strong> Interact / Plant / Harvest</div>
              <div><strong>[I]</strong> Open Inventory / Seeds</div>
              <div><strong>[J]</strong> Captain & Farm Journal</div>
              <div><strong>[Esc]</strong> Menu & Safe Reset</div>
              <div><strong>[W / S / Space]</strong> Reel / Slack / Brace Fish</div>
              <div><strong>[A / D]</strong> Steer Fishing Rod</div>
            </div>
          </div>
        </div>

        <div className="modal-footer" style={{ justifyContent: "center" }}>
          <button className="neva-button" style={{ minWidth: "120px" }} onClick={onClose}>
            Back to Game
          </button>
        </div>
      </div>
    </div>
  );
};
