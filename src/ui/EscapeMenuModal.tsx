// src/ui/EscapeMenuModal.tsx
import React, { useEffect, useRef, useState } from "react";
import { GameState } from "../simulation/core/types";
import { audioSettings, AudioSettings } from "../audio/AudioSettings";
import { useModalAccessibility } from "./useModalAccessibility";
import { ChromeButton, ChromeClose, ChromeKeycap, ChromeMeter, ChromePanel } from "./chrome/Chrome";
import {
  IconBackpack,
  IconCoin,
  IconCompass,
  IconEnergy,
  IconExpedition,
  IconJournal,
  IconLedger
} from "./components/HudIcons";
import { playUiSound } from "./audio/uiAudio";

export interface EscapeMenuModalProps {
  state: GameState;
  onClose: () => void;
  onResetPlayerToSafePlace: () => void;
  onQuickSave: () => void;
  onOpenInventory: () => void;
  onOpenJournal: () => void;
  onOpenGuide?: () => void;
  onOpenMap: () => void;
  onOpenLedger: () => void;
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
  onOpenGuide,
  onOpenMap,
  onOpenLedger,
  onOpenExpedition,
  expeditionUnlocked = false
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(modalRef, onClose);

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
      <ChromePanel
        ref={modalRef}
        as="div"
        className="neva-panel modal-content pause-modal"
        tone="slate"
        flourish
        corners
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-title"
        tabIndex={-1}
      >
        <header className="modal-header">
          <span id="pause-title" className="modal-heading-with-mark">
            Pause
          </span>
          <ChromeClose onClick={onClose} label="Resume game" />
        </header>

        <div className="modal-body pause-body">
          <div className="pause-status-card">
            <div>
              <div className="pause-region-title">{currentRegion}</div>
              <div className="pause-date-sub">
                Day {dayInSeason} of {seasonName} · {hh}:{mm}
              </div>
            </div>
            <div className="pause-status-values">
              <div className="pause-gold-val">
                <IconCoin size={18} aria-hidden="true" /> {player.money.toLocaleString()} G
              </div>
              <ChromeMeter
                className="pause-labor-meter"
                label="Labor"
                icon={<IconEnergy size={16} aria-hidden="true" />}
                value={player.workCapacity.current}
                max={player.workCapacity.maximum}
                variant="gold"
              />
            </div>
          </div>

          <div className="pause-layout">
            <div className="pause-actions-column">
              <div className="pause-actions" aria-label="Pause menu actions">
                <ChromeButton variant="primary" soundCue="confirm" onClick={onClose}>
                  Resume <ChromeKeycap keyName="Esc" />
                </ChromeButton>
                <ChromeButton onClick={onOpenInventory}>
                  <IconBackpack size={22} aria-hidden="true" /> Inventory <ChromeKeycap keyName="I" />
                </ChromeButton>
                <ChromeButton onClick={onOpenJournal}>
                  <IconJournal size={22} aria-hidden="true" /> Journal <ChromeKeycap keyName="J" />
                </ChromeButton>
                {onOpenGuide && (
                  <ChromeButton onClick={onOpenGuide}>
                    <IconCompass size={22} aria-hidden="true" /> How to Play
                  </ChromeButton>
                )}
                <ChromeButton onClick={onOpenMap}>
                  <IconCompass size={22} aria-hidden="true" /> Map <ChromeKeycap keyName="M" />
                </ChromeButton>
                <ChromeButton onClick={onOpenLedger}>
                  <IconLedger size={22} aria-hidden="true" /> Ledger <ChromeKeycap keyName="L" />
                </ChromeButton>
                {expeditionUnlocked && (
                  <ChromeButton onClick={onOpenExpedition}>
                    <IconExpedition size={22} aria-hidden="true" /> Expedition <ChromeKeycap keyName="P" />
                  </ChromeButton>
                )}
                <ChromeButton onClick={onQuickSave}>Save game</ChromeButton>
                <ChromeButton onClick={onResetPlayerToSafePlace}>Return to garden</ChromeButton>
              </div>
            </div>

            <div className="pause-audio-column">
              <AudioControls />
            </div>
          </div>
        </div>
      </ChromePanel>
    </div>
  );
};

type AudioLevelKey = "master" | "music" | "sfx" | "ambience";
type AudioMuteKey = "masterMuted" | "musicMuted" | "sfxMuted" | "ambienceMuted";

const AUDIO_ROWS: Array<{ label: string; level: AudioLevelKey; muted: AudioMuteKey }> = [
  { label: "Master", level: "master", muted: "masterMuted" },
  { label: "Music", level: "music", muted: "musicMuted" },
  { label: "Effects", level: "sfx", muted: "sfxMuted" },
  { label: "Ambience", level: "ambience", muted: "ambienceMuted" }
];

export const AudioControls: React.FC = () => {
  const [settings, setSettings] = useState<AudioSettings>({ ...audioSettings.get() });

  useEffect(() => audioSettings.subscribe((next) => setSettings({ ...next })), []);

  return (
    <section className="audio-settings" aria-labelledby="audio-settings-title">
      <h5 id="audio-settings-title">Sound</h5>
      {AUDIO_ROWS.map((row) => {
        const percent = Math.round(settings[row.level] * 100);
        const muted = settings[row.muted];
        return (
          <div className="audio-settings-row" key={row.level}>
            <label htmlFor={`audio-${row.level}`}>{row.label}</label>
            <span className="audio-level-text">{muted ? "Muted" : `${percent}%`}</span>
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
              onPointerUp={() => playUiSound("click")}
            />
            <ChromeButton
              className="audio-mute-button"
              aria-label={muted ? `Unmute ${row.label}` : `Mute ${row.label}`}
              aria-pressed={muted}
              onClick={() => setSettings({ ...audioSettings.set({ [row.muted]: !muted }) })}
            >
              {muted ? "Off" : "On"}
            </ChromeButton>
          </div>
        );
      })}
    </section>
  );
};
