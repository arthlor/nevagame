// src/ui/EscapeMenuModal.tsx
import React, { useEffect, useState } from "react";
import { GameState } from "../simulation/core/types";
import { audioSettings, AudioSettings } from "../audio/AudioSettings";

export interface EscapeMenuModalProps {
  state: GameState;
  onClose: () => void;
  onResetPlayerToSafePlace: () => void;
  onQuickSave: () => void;
  onOpenInventory: () => void;
  onOpenJournal: () => void;
  onOpenExpedition: () => void;
  expeditionUnlocked?: boolean;
}

export const EscapeMenuModal: React.FC<EscapeMenuModalProps> = ({
  state,
  onClose,
  onResetPlayerToSafePlace,
  onQuickSave,
  onOpenInventory,
  onOpenJournal,
  onOpenExpedition,
  expeditionUnlocked = false
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
        style={{ width: "min(580px, 94vw)" }}
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
          <div className="pause-status-card">
            <div>
              <div className="pause-region-title">
                📍 {currentRegion}
              </div>
              <div className="pause-date-sub">
                Day {dayInSeason} of {seasonName}, Year {clock.year} ({hh}:{mm})
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="pause-gold-val">
                💰 {player.money} G
              </div>
              <div className="pause-work-val">
                ⚡ {Math.round(player.workCapacity.current)} / {player.workCapacity.maximum} Work
              </div>
            </div>
          </div>

          <AudioControls />

          {/* Quick Menu Actions */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <button
              type="button"
              className="neva-button neva-button-primary"
              style={{ padding: "10px 14px", fontSize: "14px", fontWeight: 700 }}
              onClick={onClose}
            >
              ▶ Resume Game <kbd style={{ opacity: 0.8, fontSize: "11px" }}>[ESC]</kbd>
            </button>
            <button
              type="button"
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
          <div className="pause-unstuck-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, color: "var(--color-accent-terracotta)", fontSize: "13px" }}>
                🧭 Stuck or Glitched?
              </span>
              <button
                type="button"
                className="neva-button"
                style={{
                  background: "var(--color-accent-terracotta)",
                  borderColor: "rgba(200, 106, 88, 0.6)",
                  color: "#FFF",
                  padding: "5px 12px",
                  fontSize: "12px",
                  fontWeight: 700
                }}
                onClick={onResetPlayerToSafePlace}
              >
                🔄 Reset to Safe Place
              </button>
            </div>
            <p style={{ fontSize: "11.5px", color: "var(--color-text-secondary)", lineHeight: 1.4, margin: 0 }}>
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
              type="button"
              className="neva-button neva-button-secondary"
              style={{ flex: 1, padding: "7px 8px", fontSize: "12px" }}
              onClick={onOpenInventory}
            >
              🎒 Inventory <kbd>[I]</kbd>
            </button>
            <button
              type="button"
              className="neva-button neva-button-secondary"
              style={{ flex: 1, padding: "7px 8px", fontSize: "12px" }}
              onClick={onOpenJournal}
            >
              📖 Journal <kbd>[J]</kbd>
            </button>
            {expeditionUnlocked && (
              <button
                type="button"
                className="neva-button neva-button-secondary"
                style={{ flex: 1, padding: "7px 8px", fontSize: "12px" }}
                onClick={onOpenExpedition}
              >
                🗺️ Expedition
              </button>
            )}
          </div>

          {/* Controls Reference */}
          <div className="pause-controls-card">
            <h5 style={{ fontWeight: 700, color: "var(--color-accent-ochre)", marginBottom: "8px", fontSize: "12px" }}>
              🎮 Controls Quick Reference
            </h5>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", color: "var(--color-text-secondary)" }}>
              <div><strong>[W / A / S / D]</strong> Move / Steer Boat</div>
              <div><strong>[Shift]</strong> Sprint (On foot)</div>
              <div><strong>[E]</strong> Interact / Harvest</div>
              <div><strong>[1 – 5]</strong> Tool Quickbar (Hoe, Seed, Water, Bait, Rod)</div>
              <div><strong>[I]</strong> Open Inventory / Seeds</div>
              <div><strong>[M]</strong> Multi-Lens World Map</div>
              <div><strong>[L]</strong> Logistics Ledger</div>
              <div><strong>[J]</strong> Captain & Farm Journal</div>
              <div><strong>[Alt]</strong> Soil Moisture & Crop GIS</div>
              <div><strong>[Esc]</strong> Menu & Safe Reset</div>
            </div>
          </div>
        </div>

        <div className="modal-footer" style={{ justifyContent: "center" }}>
          <button type="button" className="neva-button" style={{ minWidth: "120px" }} onClick={onClose}>
            Back to Game
          </button>
        </div>
      </div>
    </div>
  );
};

type AudioLevelKey = "master" | "sfx" | "ambience";
type AudioMuteKey = "masterMuted" | "sfxMuted" | "ambienceMuted";

const AUDIO_ROWS: Array<{ label: string; level: AudioLevelKey; muted: AudioMuteKey }> = [
  { label: "Master", level: "master", muted: "masterMuted" },
  { label: "Effects", level: "sfx", muted: "sfxMuted" },
  { label: "Ambience", level: "ambience", muted: "ambienceMuted" }
];

const AudioControls: React.FC = () => {
  const [settings, setSettings] = useState<AudioSettings>({ ...audioSettings.get() });

  useEffect(() => audioSettings.subscribe((next) => setSettings({ ...next })), []);

  return (
    <section className="audio-settings" aria-labelledby="audio-settings-title">
      <h5 id="audio-settings-title" style={{ fontSize: "12px", color: "var(--color-text-muted)", textTransform: "uppercase", marginBottom: "6px" }}>Audio</h5>
      {AUDIO_ROWS.map((row) => {
        const percent = Math.round(settings[row.level] * 100);
        const muted = settings[row.muted];
        return (
          <div className="audio-settings-row" key={row.level}>
            <label htmlFor={`audio-${row.level}`}>
              <span>{row.label}</span>
              <span className="audio-level-text">{muted ? "Muted" : `${percent}%`}</span>
            </label>
            <input
              id={`audio-${row.level}`}
              type="range"
              min="0"
              max="100"
              step="1"
              value={percent}
              aria-valuetext={muted ? "Muted" : `${percent} percent`}
              onChange={(event) => {
                const level = Number(event.currentTarget.value) / 100;
                setSettings({ ...audioSettings.set({ [row.level]: level, [row.muted]: false }) });
              }}
            />
            <button
              type="button"
              className="neva-button neva-button-secondary audio-mute-button"
              aria-pressed={muted}
              onClick={() => setSettings({ ...audioSettings.set({ [row.muted]: !muted }) })}
            >
              {muted ? "Unmute" : "Mute"}
            </button>
          </div>
        );
      })}
    </section>
  );
};
