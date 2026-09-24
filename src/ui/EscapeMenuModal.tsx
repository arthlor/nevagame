import React, { useEffect, useRef, useState } from "react";
import type { EmergencyTowQuoteDto, PauseSummaryDto } from "../simulation/core/contracts";
import { useModalAccessibility } from "./useModalAccessibility";
import { ChromeButton, ChromeClose } from "./chrome/Chrome";
import {
  IconBoat,
  IconCompass,
  IconEnergy,
  IconExpedition,
  IconJournal,
  IconLedger,
  IconSatchel,
  IconSprout
} from "./components/HudIcons";
import { InterfaceSettings } from "./components/InterfaceSettings";
import { AudioControls, GraphicsControls } from "./components/SettingsControls";
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
  onInspectEmergencyTowQuote?: () => EmergencyTowQuoteDto;
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
  onPromptPwaInstall?: () => void;
  isStandalone?: boolean;
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
  onInspectEmergencyTowQuote,
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
  onGraphicsQualityChange,
  onPromptPwaInstall,
  isStandalone = false
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const safeReturnCancelRef = useRef<HTMLButtonElement>(null);
  const [towNotice, setTowNotice] = useState<string | null>(null);
  const [page, setPage] = useState<PausePage>("menu");
  const towQuote = onInspectEmergencyTowQuote?.();
  useModalAccessibility(modalRef, onClose);

  useEffect(() => {
    if (page === "safe-return" || page === "emergency-tow") safeReturnCancelRef.current?.focus();
  }, [page]);

  const lastSaved = savingAvailable
    ? formatLastSaved(pause.lastSavedUtcMs)
    : "This session is not being saved";
  const playTimeLabel =
    Number.isFinite(pause.totalPlayMinutes) && pause.totalPlayMinutes >= 0
      ? formatPlayTime(pause.totalPlayMinutes)
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
            <div className="pause-menu-grid">
              <div className="pause-menu-info">
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

                <div className="pause-save-line" aria-live="polite">
                  <div>
                    <strong>Harbor log</strong>
                    <span>{lastSaved}</span>
                  </div>
                  <ChromeButton size="sm" onClick={onQuickSave} disabled={!savingAvailable}>
                    {savingAvailable ? "Save now" : "Saving unavailable"}
                  </ChromeButton>
                </div>

                <details className="pause-recovery-disclosure">
                  <summary>Recovery options</summary>
                  <div className="pause-critical-actions-row">
                    <ChromeButton
                      variant="secondary"
                      size="sm"
                      className="pause-safe-return-btn"
                      onClick={() => setPage("safe-return")}
                    >
                      <IconPin size={14} /> Safe Return
                    </ChromeButton>

                    {onEmergencyTow && towQuote?.ok && (
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
                  </div>
                </details>
              </div>

              <nav className="pause-actions pause-menu-nav" aria-label="Pause menu actions">
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
                {onPromptPwaInstall && !isStandalone && (
                  <ChromeButton onClick={onPromptPwaInstall}>
                    <IconSprout size={20} aria-hidden="true" /> Add to Home Screen
                  </ChromeButton>
                )}
                <ChromeButton onClick={() => setPage("graphics")}>Settings</ChromeButton>
              </nav>
            </div>
          ) : page === "safe-return" ? (
            <section
              className="pause-critical-sheet"
              aria-labelledby="pause-safe-return-title"
              aria-describedby="pause-safe-return-description"
            >
              <h2 id="pause-safe-return-title">Return to safety?</h2>
              <p id="pause-safe-return-description">
                This moves you to the nearest safe landing immediately: the Starter Garden, or the Sunreach dock when sailing distant waters. Physical fish cargo must be landed first; money and progress remain with you.
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
                A harbor crew takes your vessel to {towQuote?.destinationLabel ?? "a serviced mooring"}.
                {towQuote?.cost === 0 ? " The fee is waived." : ` The fee is ${towQuote?.cost.toLocaleString() ?? "—"} G.`}
                {towQuote?.wrecked ? " Silas can repair the hull there." : ""}
                {` The trip advances ${towQuote?.travelMinutes ?? 0} in-game minutes, so fish lose freshness. Your cargo and fuel stay aboard.`}
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
