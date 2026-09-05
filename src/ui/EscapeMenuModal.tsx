import React, { useEffect, useRef, useState } from "react";
import type { PauseSummaryDto } from "../simulation/core/contracts";
import { audioSettings, AudioSettings } from "../audio/AudioSettings";
import { useModalAccessibility } from "./useModalAccessibility";
import { ChromeButton, ChromeClose } from "./chrome/Chrome";
import {
  IconBoat,
  IconCompass,
  IconEnergy,
  IconExpedition,
  IconJournal,
  IconLedger,
  IconSatchel
} from "./components/HudIcons";
import { playUiSound } from "./audio/uiAudio";
import { InterfaceSettings } from "./components/InterfaceSettings";
import { uiScale } from "./uiScale";
import type { GraphicsQualityPreference } from "../render/config/GraphicsQualitySettings";
import type { QualityTier } from "../render/config/VisualRenderConfig";
import { ControlsReference } from "./components/ControlsReference";
import { GameSheet, KeyHint, Meter } from "./coastal/CoastalUI";

export interface EscapeMenuModalProps {
  pause: PauseSummaryDto;
  onClose: () => void;
  onResetPlayerToSafePlace: () => void;
  /**
   * Recalls the vessel to its mooring. Reachable here because a stranded
   * player often cannot walk back to the boat to arrange it in the world.
   */
  onEmergencyTow?: () => { success: boolean; reason?: string };
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

/** Map-pin mark for Safe Return. HudIcons carries no pin, so it lives here. */
const IconPin: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M8 1.5a4 4 0 0 0-4 4c0 3-1.5 4.5-1.5 4.5h11S12 8.5 12 5.5a4 4 0 0 0-4-4Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <circle cx="8" cy="5.5" r="1.5" fill="currentColor" />
  </svg>
);

/**
 * Total play time is display-only. PauseSummaryDto does not carry it, so when
 * the field is absent the line is omitted rather than invented.
 */
const formatPlayTime = (totalMinutes: number): string => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.floor(totalMinutes % 60);
  return hours > 0 ? `${hours}h ${minutes}m at sea` : `${minutes}m at sea`;
};

export const EscapeMenuModal: React.FC<EscapeMenuModalProps> = ({
  pause,
  onClose,
  onResetPlayerToSafePlace,
  onEmergencyTow,
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
  const [towNotice, setTowNotice] = useState<string | null>(null);
  const [page, setPage] = useState<PausePage>("menu");
  useModalAccessibility(modalRef, onClose);

  useEffect(() => {
    if (page === "safe-return" || page === "emergency-tow") safeReturnCancelRef.current?.focus();
  }, [page]);

  const lastSaved = savingAvailable
    ? formatLastSaved(pause.lastSavedUtcMs)
    : "This session is not being saved";
  const rawPlayMinutes = (pause as Partial<{ totalPlayMinutes: unknown }>).totalPlayMinutes;
  const playTimeLabel =
    typeof rawPlayMinutes === "number" && Number.isFinite(rawPlayMinutes) && rawPlayMinutes >= 0
      ? formatPlayTime(rawPlayMinutes)
      : null;
  const pageTitle = page === "menu"
    ? "Paused"
    : page === "safe-return"
      ? "Safe Return"
      : page === "emergency-tow"
        ? "Emergency Tow"
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
                  {playTimeLabel && <span className="pause-playtime-line">{playTimeLabel}</span>}
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

              <ChromeButton
                variant="secondary"
                size="sm"
                className="pause-safe-return-btn"
                onClick={() => setPage("safe-return")}
              >
                <IconPin size={14} /> Safe Return
              </ChromeButton>

              {onEmergencyTow && (
                <ChromeButton
                  variant="secondary"
                  size="sm"
                  className="pause-emergency-tow-btn"
                  data-testid="pause-emergency-tow"
                  onClick={() => setPage("emergency-tow")}
                >
                  <IconBoat size={14} /> Emergency Tow
                </ChromeButton>
              )}
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
          ) : page === "emergency-tow" ? (
            <section
              className="pause-critical-sheet"
              aria-labelledby="pause-emergency-tow-title"
              aria-describedby="pause-emergency-tow-description"
            >
              <h2 id="pause-emergency-tow-title">Arrange a tow?</h2>
              <p id="pause-emergency-tow-description">
                A harbour crew brings your vessel back to its mooring for a flat fee.
                Your cargo and fuel are left untouched.
              </p>
              {towNotice && (
                <p className="pause-critical-notice" role="status" data-testid="pause-tow-notice">
                  {towNotice}
                </p>
              )}
              <div className="pause-critical-actions">
                <ChromeButton ref={safeReturnCancelRef} onClick={() => setPage("menu")}>
                  Not now
                </ChromeButton>
                <ChromeButton
                  variant="danger"
                  soundCue="confirm"
                  data-testid="pause-confirm-tow"
                  onClick={() => {
                    const result = onEmergencyTow?.();
                    if (!result) return;
                    // A refused tow keeps the sheet open with the reason, so the
                    // player is not dropped back to the menu without an answer.
                    if (result.success) setPage("menu");
                    else setTowNotice(result.reason ?? "That tow could not be arranged");
                  }}
                >
                  Call for a tow
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
                {page === "interface" && (
                  <>
                    <InterfaceSettings />
                    <div className="pause-settings-reset">
                      <ChromeButton
                        size="sm"
                        variant="secondary"
                        onClick={() => uiScale.set("auto")}
                      >
                        Reset to defaults
                      </ChromeButton>
                    </div>
                  </>
                )}
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
type PausePage = "menu" | "safe-return" | "emergency-tow" | SettingsPage;

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
      <div className="pause-settings-reset">
        <ChromeButton
          size="sm"
          variant="secondary"
          disabled={preference === "auto"}
          onClick={() => onChange("auto")}
        >
          Reset to defaults
        </ChromeButton>
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

/**
 * Factory sound levels. Mirrors DEFAULT_AUDIO_SETTINGS in
 * src/audio/AudioSettings.ts (which owns the values); kept local because this
 * slice may not touch files outside the Escape/Journal/Dialogue modals.
 */
const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  master: 0.8,
  music: 0.52,
  sfx: 0.8,
  ambience: 0.62,
  masterMuted: false,
  musicMuted: false,
  sfxMuted: false,
  ambienceMuted: false
};

export const AudioControls: React.FC = () => {
  const [settings, setSettings] = useState<AudioSettings>({ ...audioSettings.get() });

  useEffect(() => audioSettings.subscribe((next) => setSettings({ ...next })), []);

  const isDefault =
    settings.master === DEFAULT_AUDIO_SETTINGS.master &&
    settings.music === DEFAULT_AUDIO_SETTINGS.music &&
    settings.sfx === DEFAULT_AUDIO_SETTINGS.sfx &&
    settings.ambience === DEFAULT_AUDIO_SETTINGS.ambience &&
    !settings.masterMuted &&
    !settings.musicMuted &&
    !settings.sfxMuted &&
    !settings.ambienceMuted;

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
      <div className="pause-settings-reset">
        <ChromeButton
          size="sm"
          variant="secondary"
          disabled={isDefault}
          onClick={() => setSettings({ ...audioSettings.set({ ...DEFAULT_AUDIO_SETTINGS }) })}
        >
          Reset to defaults
        </ChromeButton>
      </div>
    </section>
  );
};
