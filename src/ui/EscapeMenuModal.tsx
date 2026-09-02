import React, { useEffect, useRef, useState } from "react";
import type { PauseSummaryDto } from "../simulation/core/contracts";
import { audioSettings, AudioSettings } from "../audio/AudioSettings";
import { useModalAccessibility } from "./useModalAccessibility";
import { ChromeButton, ChromeClose } from "./chrome/Chrome";
import {
  IconCompass,
  IconEnergy,
  IconExpedition,
  IconJournal,
  IconLedger,
  IconSatchel
} from "./components/HudIcons";
import { playUiSound } from "./audio/uiAudio";
import { InterfaceSettings } from "./components/InterfaceSettings";
import type { GraphicsQualityPreference } from "../render/config/GraphicsQualitySettings";
import type { QualityTier } from "../render/config/VisualRenderConfig";
import { ControlsReference } from "./components/ControlsReference";
import { GameSheet, KeyHint, Meter } from "./coastal/CoastalUI";

export interface EscapeMenuModalProps {
  pause: PauseSummaryDto;
  onClose: () => void;
  onResetPlayerToSafePlace: () => void;
  onQuickSave: () => void;
  savingAvailable: boolean;
  onOpenInventory: () => void;
  onOpenJournal: () => void;
  onOpenGuide?: () => void;
  onOpenMap: () => void;
  onOpenLedger: () => void;
  onOpenExpedition: () => void;
  expeditionUnlocked?: boolean;
  graphicsQuality: GraphicsQualityPreference;
  effectiveGraphicsQuality: QualityTier;
  onGraphicsQualityChange: (quality: GraphicsQualityPreference) => void;
}

export const EscapeMenuModal: React.FC<EscapeMenuModalProps> = ({
  pause,
  onClose,
  onResetPlayerToSafePlace,
  onQuickSave,
  savingAvailable,
  onOpenInventory,
  onOpenJournal,
  onOpenGuide,
  onOpenMap,
  onOpenLedger,
  onOpenExpedition,
  expeditionUnlocked = false,
  graphicsQuality,
  effectiveGraphicsQuality,
  onGraphicsQualityChange
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const safeReturnCancelRef = useRef<HTMLButtonElement>(null);
  const [page, setPage] = useState<PausePage>("menu");
  useModalAccessibility(modalRef, onClose);

  useEffect(() => {
    if (page === "safe-return") safeReturnCancelRef.current?.focus();
  }, [page]);

  const lastSaved = savingAvailable
    ? formatLastSaved(pause.lastSavedUtcMs)
    : "This session is not being saved";
  const pageTitle = page === "menu"
    ? "Paused"
    : page === "safe-return"
      ? "Safe Return"
      : SETTINGS_PAGES.find((entry) => entry.id === page)?.label ?? "Settings";

  return (
    <div className="modal-overlay pause-overlay interactive" onClick={onClose}>
      <GameSheet
        ref={modalRef}
        as="div"
        className="neva-panel modal-content pause-modal"
        family="ink"
        tone="ghost"
        data-page={page}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-title"
        tabIndex={-1}
      >
        <header className="modal-header">
          <div className="pause-heading">
            {page !== "menu" && (
              <button type="button" className="pause-back" onClick={() => setPage("menu")}>
                ← Back
              </button>
            )}
            <span id="pause-title" className="modal-heading-with-mark">{pageTitle}</span>
          </div>
          <ChromeClose onClick={onClose} label="Resume game" />
        </header>

        <div className="modal-body pause-body">
          {page === "menu" ? (
            <>
              <div className="pause-vignette-status">
                <div>
                  <strong className="pause-region-title">{pause.regionLabel}</strong>
                  <span className="pause-date-sub">{pause.dateTimeLabel}</span>
                </div>
                <Meter
                  className="pause-labor-meter"
                  label="Work"
                  icon={<IconEnergy size={16} aria-hidden="true" />}
                  value={pause.work.current}
                  max={pause.work.maximum}
                  variant="gold"
                />
              </div>

              <nav className="pause-actions" aria-label="Pause menu actions">
                <ChromeButton variant="primary" soundCue="confirm" onClick={onClose}>
                  Resume <KeyHint keyName="Esc" />
                </ChromeButton>
                <ChromeButton onClick={onOpenInventory}>
                  <IconSatchel size={20} aria-hidden="true" /> Satchel <KeyHint keyName="I" />
                </ChromeButton>
                <ChromeButton onClick={onOpenJournal}>
                  <IconJournal size={20} aria-hidden="true" /> Field Journal <KeyHint keyName="J" />
                </ChromeButton>
                <ChromeButton onClick={onOpenMap}>
                  <IconCompass size={20} aria-hidden="true" /> Nautical Chart <KeyHint keyName="M" />
                </ChromeButton>
                <ChromeButton onClick={onOpenLedger}>
                  <IconLedger size={20} aria-hidden="true" /> Hold &amp; Stores <KeyHint keyName="L" />
                </ChromeButton>
                {expeditionUnlocked && (
                  <ChromeButton onClick={onOpenExpedition}>
                    <IconExpedition size={20} aria-hidden="true" /> Expedition Board <KeyHint keyName="P" />
                  </ChromeButton>
                )}
                {onOpenGuide && (
                  <ChromeButton onClick={onOpenGuide}>
                    <IconCompass size={20} aria-hidden="true" /> Guide
                  </ChromeButton>
                )}
                <ChromeButton onClick={() => setPage("graphics")}>Settings</ChromeButton>
              </nav>

              <div className="pause-save-line" aria-live="polite">
                <div>
                  <strong>Harbor log</strong>
                  <span>{lastSaved}</span>
                </div>
                <ChromeButton size="sm" onClick={onQuickSave} disabled={!savingAvailable}>
                  {savingAvailable ? "Save now" : "Saving unavailable"}
                </ChromeButton>
              </div>

              <button type="button" className="pause-safe-return-link" onClick={() => setPage("safe-return")}>
                Safe Return
              </button>
            </>
          ) : page === "safe-return" ? (
            <section
              className="pause-critical-sheet"
              aria-labelledby="pause-safe-return-title"
              aria-describedby="pause-safe-return-description"
            >
              <h2 id="pause-safe-return-title">Return to Starter Garden?</h2>
              <p id="pause-safe-return-description">
                This moves you to the Starter Garden immediately. Your cargo, money, and progress remain with you.
              </p>
              <div className="pause-critical-actions">
                <ChromeButton ref={safeReturnCancelRef} onClick={() => setPage("menu")}>
                  Stay here
                </ChromeButton>
                <ChromeButton
                  variant="danger"
                  soundCue="confirm"
                  data-testid="pause-confirm-return"
                  onClick={onResetPlayerToSafePlace}
                >
                  Use Safe Return
                </ChromeButton>
              </div>
            </section>
          ) : (
            <div className="pause-settings-layout">
              <nav className="pause-settings-pages" aria-label="Settings pages">
                {SETTINGS_PAGES.map((entry) => (
                  <button
                    type="button"
                    key={entry.id}
                    className={page === entry.id ? "is-active" : ""}
                    aria-current={page === entry.id ? "page" : undefined}
                    onClick={() => setPage(entry.id)}
                  >
                    {entry.label}
                  </button>
                ))}
              </nav>
              <div className="pause-settings-page">
                {page === "graphics" && (
                  <GraphicsControls
                    preference={graphicsQuality}
                    effectiveTier={effectiveGraphicsQuality}
                    onChange={onGraphicsQualityChange}
                  />
                )}
                {page === "audio" && <AudioControls />}
                {page === "interface" && <InterfaceSettings />}
                {page === "controls" && <ControlsReference />}
              </div>
            </div>
          )}
        </div>
      </GameSheet>
    </div>
  );
};

type SettingsPage = "graphics" | "audio" | "interface" | "controls";
type PausePage = "menu" | "safe-return" | SettingsPage;

const SETTINGS_PAGES: ReadonlyArray<{ id: SettingsPage; label: string }> = [
  { id: "graphics", label: "Graphics" },
  { id: "audio", label: "Audio" },
  { id: "interface", label: "Interface" },
  { id: "controls", label: "Controls" }
];

const formatLastSaved = (timestamp: number): string => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "Not saved yet";
  try {
    return `Last saved ${new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(timestamp))}`;
  } catch {
    return "Last save recorded";
  }
};

const GRAPHICS_QUALITY_CHOICES: ReadonlyArray<{
  value: GraphicsQualityPreference;
  label: string;
  description: string;
}> = [
  { value: "auto", label: "Auto", description: "Adapts while you play" },
  { value: "low", label: "Low", description: "Fastest" },
  { value: "medium", label: "Medium", description: "Balanced" },
  { value: "high", label: "High", description: "Richest detail" }
];

export const GraphicsControls: React.FC<{
  preference: GraphicsQualityPreference;
  effectiveTier: QualityTier;
  onChange: (quality: GraphicsQualityPreference) => void;
}> = ({ preference, effectiveTier, onChange }) => {
  const effectiveLabel = effectiveTier[0].toUpperCase() + effectiveTier.slice(1);
  return (
    <section className="graphics-settings" aria-labelledby="graphics-settings-title">
      <div className="graphics-settings__heading">
        <h5 id="graphics-settings-title">Graphics quality</h5>
        <span className="graphics-settings__active" aria-live="polite">
          <span aria-hidden="true" /> Active: {effectiveLabel}
        </span>
      </div>
      <p className="graphics-settings__hint">
        Auto adjusts detail gradually to keep movement smooth.
      </p>
      <div className="graphics-quality-options" role="radiogroup" aria-label="Graphics quality">
        {GRAPHICS_QUALITY_CHOICES.map((choice) => {
          const selected = preference === choice.value;
          return (
            <button
              key={choice.value}
              type="button"
              className={`graphics-quality-option${selected ? " is-selected" : ""}`}
              role="radio"
              aria-checked={selected}
              onClick={() => {
                if (!selected) {
                  onChange(choice.value);
                  playUiSound("click");
                }
              }}
            >
              <span className="graphics-quality-option__label">{choice.label}</span>
              <span className="graphics-quality-option__description">{choice.description}</span>
              {choice.value === "auto" && <span className="graphics-quality-option__mark">Recommended</span>}
            </button>
          );
        })}
      </div>
    </section>
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
