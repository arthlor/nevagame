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
import { formatPauseDate, placeLabel } from "../i18n/placesTr";
import { useTranslation } from "../i18n/useTranslation";

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
const formatPlayTime = (totalMinutes: number, locale?: string): string => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.floor(totalMinutes % 60);
  if (locale === "tr") {
    return hours > 0 ? `Denizde ${hours} sa ${minutes} dk` : `Denizde ${minutes} dk`;
  }
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
  const { locale } = useTranslation();
  useModalAccessibility(modalRef, onClose);

  useEffect(() => {
    if (page === "safe-return" || page === "emergency-tow") safeReturnCancelRef.current?.focus();
  }, [page]);

  const lastSaved = savingAvailable
    ? formatLastSaved(pause.lastSavedUtcMs, locale)
    : (locale === "tr" ? "Bu oturum kaydedilmiyor" : "This session is not being saved");
  const playTimeLabel =
    Number.isFinite(pause.totalPlayMinutes) && pause.totalPlayMinutes >= 0
      ? formatPlayTime(pause.totalPlayMinutes, locale)
      : null;
  const pageTitle = page === "menu"
    ? (locale === "tr" ? "Duraklatıldı" : "Paused")
    : page === "safe-return"
      ? (locale === "tr" ? "Güvenli Dönüş" : "Safe Return")
      : page === "emergency-tow"
        ? (locale === "tr" ? "Acil Çekici" : "Emergency Tow")
      : (locale === "tr"
          ? (page === "graphics" ? "Grafik Ayarları" : page === "audio" ? "Ses Ayarları" : page === "interface" ? "Arayüz Ayarları" : "Kontroller")
          : SETTINGS_PAGES.find((entry) => entry.id === page)?.label ?? "Settings");

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
                {locale === "tr" ? "← Geri" : "← Back"}
              </button>
            )}
            <span id="pause-title" className="modal-heading-with-mark">{pageTitle}</span>
          </div>
          <ChromeClose onClick={onClose} label={locale === "tr" ? "Oyuna Devam Et" : "Resume game"} />
        </header>

        <div className="modal-body pause-body">
          {page === "menu" ? (
            <div className="pause-menu-grid">
              <div className="pause-menu-info">
                <div className="pause-vignette-status">
                  <div>
                    <strong className="pause-region-title">{placeLabel(pause.regionLabel, locale)}</strong>
                    <span className="pause-date-sub">{formatPauseDate(pause.dateTimeLabel, locale)}</span>
                    {playTimeLabel && <span className="pause-playtime-line">{playTimeLabel}</span>}
                  </div>
                  <Meter
                    className="pause-labor-meter"
                    label={locale === "tr" ? "İş Gücü" : "Work"}
                    icon={<IconEnergy size={16} aria-hidden="true" />}
                    value={pause.work.current}
                    max={pause.work.maximum}
                    variant="gold"
                  />
                </div>

                <div className="pause-save-line" aria-live="polite">
                  <div>
                    <strong>{locale === "tr" ? "Kayıt" : "Save"}</strong>
                    <span>{lastSaved}</span>
                  </div>
                  <ChromeButton size="sm" onClick={onQuickSave} disabled={!savingAvailable}>
                    {savingAvailable ? (locale === "tr" ? "Şimdi kaydet" : "Save now") : (locale === "tr" ? "Kayıt Kullanılamaz" : "Saving unavailable")}
                  </ChromeButton>
                </div>

                <details className="pause-recovery-disclosure">
                  <summary>{locale === "tr" ? "Kurtarma seçenekleri" : "Recovery options"}</summary>
                  <div className="pause-critical-actions-row">
                    <ChromeButton
                      variant="secondary"
                      size="sm"
                      className="pause-safe-return-btn"
                      onClick={() => setPage("safe-return")}
                    >
                      <IconPin size={14} /> {locale === "tr" ? "Güvenli Dönüş" : "Safe Return"}
                    </ChromeButton>

                    {onEmergencyTow && towQuote?.ok && (
                      <ChromeButton
                        variant="secondary"
                        size="sm"
                        className="pause-emergency-tow-btn"
                        data-testid="pause-emergency-tow"
                        onClick={() => setPage("emergency-tow")}
                      >
                        <IconBoat size={14} /> {locale === "tr" ? "Acil Çekici" : "Emergency Tow"}
                      </ChromeButton>
                    )}
                  </div>
                </details>
              </div>

              <nav className="pause-actions pause-menu-nav" aria-label={locale === "tr" ? "Duraklatma menüsü eylemleri" : "Pause menu actions"}>
                <ChromeButton variant="primary" soundCue="confirm" onClick={onClose}>
                  {locale === "tr" ? "Devam Et" : "Resume"} <KeyHint keyName="Esc" />
                </ChromeButton>
                <ChromeButton onClick={onOpenInventory}>
                  <IconSatchel size={20} aria-hidden="true" /> {locale === "tr" ? "Heybe" : "Satchel"} <KeyHint keyName="I" />
                </ChromeButton>
                <ChromeButton onClick={onOpenJournal}>
                  <IconJournal size={20} aria-hidden="true" /> {locale === "tr" ? "Günlük" : "Journal"} <KeyHint keyName="J" />
                </ChromeButton>
                <ChromeButton onClick={onOpenMap}>
                  <IconCompass size={20} aria-hidden="true" /> {locale === "tr" ? "Harita" : "Chart"} <KeyHint keyName="M" />
                </ChromeButton>
                <ChromeButton onClick={onOpenLedger}>
                  <IconLedger size={20} aria-hidden="true" /> {locale === "tr" ? "Ambar ve Depo" : <>Hold &amp; Stores</>} <KeyHint keyName="L" />
                </ChromeButton>
                {expeditionUnlocked && (
                  <ChromeButton onClick={onOpenExpedition}>
                    <IconExpedition size={20} aria-hidden="true" /> {locale === "tr" ? "Sefer Masası" : "Expedition Board"} <KeyHint keyName="P" />
                  </ChromeButton>
                )}
                {onOpenGuide && (
                  <ChromeButton onClick={onOpenGuide}>
                    <IconCompass size={20} aria-hidden="true" /> {locale === "tr" ? "Rehber" : "Guide"}
                  </ChromeButton>
                )}
                {onPromptPwaInstall && !isStandalone && (
                  <ChromeButton onClick={onPromptPwaInstall}>
                    <IconSprout size={20} aria-hidden="true" /> {locale === "tr" ? "Ana Ekrana Ekle" : "Add to Home Screen"}
                  </ChromeButton>
                )}
                <ChromeButton onClick={() => setPage("graphics")}>{locale === "tr" ? "Ayarlar" : "Settings"}</ChromeButton>
              </nav>
            </div>
          ) : page === "safe-return" ? (
            <section
              className="pause-critical-sheet"
              aria-labelledby="pause-safe-return-title"
              aria-describedby="pause-safe-return-description"
            >
              <h2 id="pause-safe-return-title">{locale === "tr" ? "Güvenli limana dön?" : "Return to safety?"}</h2>
              <p id="pause-safe-return-description">
                {locale === "tr"
                  ? "Başlangıç Bahçesi'ne veya açık sulardaysan Günışığı iskelesine dönersin. Önce taşıdığın balığı yere bırak. Paran ve ilerlemen korunur."
                  : "Return to the Starter Garden, or Sunreach dock in distant waters. Set down carried fish first. Keep your money and progress."}
              </p>
              <div className="pause-critical-actions">
                <ChromeButton ref={safeReturnCancelRef} onClick={() => setPage("menu")}>
                  {locale === "tr" ? "Burada Kal" : "Stay here"}
                </ChromeButton>
                <ChromeButton
                  variant="danger"
                  soundCue="confirm"
                  data-testid="pause-confirm-return"
                  onClick={onResetPlayerToSafePlace}
                >
                  {locale === "tr" ? "Geri dön" : "Return"}
                </ChromeButton>
              </div>
            </section>
          ) : page === "emergency-tow" ? (
            <section
              className="pause-critical-sheet"
              aria-labelledby="pause-emergency-tow-title"
              aria-describedby="pause-emergency-tow-description"
            >
              <h2 id="pause-emergency-tow-title">{locale === "tr" ? "Yedek çekici çağrılsın mı?" : "Arrange a tow?"}</h2>
              <p id="pause-emergency-tow-description">
                {locale === "tr"
                  ? `Liman mürettebatı teknenizi ${towQuote?.destinationLabel ?? "hizmetli bir iskeleye"} çeker.${
                      towQuote?.cost === 0 ? " Ücret alınmaz." : ` Çekici ücreti ${towQuote?.cost.toLocaleString() ?? "—"} akçedir.`
                    }${
                      towQuote?.wrecked ? " Silas gövdeyi orada tamir edebilir." : ""
                    } Sefer ${towQuote?.travelMinutes ?? 0} oyun dakikası sürer, bu yüzden balıklar tazeliğini kaybedebilir. Kargonuz ve yakıtınız teknede kalır.`
                  : `A harbor crew takes your vessel to ${towQuote?.destinationLabel ?? "a serviced mooring"}.${
                      towQuote?.cost === 0 ? " The fee is waived." : ` The fee is ${towQuote?.cost.toLocaleString() ?? "—"} G.`
                    }${
                      towQuote?.wrecked ? " Silas can repair the hull there." : ""
                    } The trip advances ${towQuote?.travelMinutes ?? 0} in-game minutes, so fish lose freshness. Your cargo and fuel stay aboard.`}
              </p>
              {towNotice && (
                <p className="pause-critical-notice" role="status" data-testid="pause-tow-notice">
                  {towNotice}
                </p>
              )}
              <div className="pause-critical-actions">
                <ChromeButton ref={safeReturnCancelRef} onClick={() => setPage("menu")}>
                  {locale === "tr" ? "Şimdi Değil" : "Not now"}
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
                    else setTowNotice(result.reason ?? (locale === "tr" ? "Çekici ayarlanamadı" : "That tow could not be arranged"));
                  }}
                >
                  {locale === "tr" ? "Çekici Çağır" : "Call for a tow"}
                </ChromeButton>
              </div>
            </section>
          ) : (
            <div className="pause-settings-layout">
              <nav className="pause-settings-pages" aria-label={locale === "tr" ? "Ayar sayfaları" : "Settings pages"}>
                {SETTINGS_PAGES.map((entry) => (
                  <button
                    type="button"
                    key={entry.id}
                    className={page === entry.id ? "is-active" : ""}
                    aria-current={page === entry.id ? "page" : undefined}
                    onClick={() => setPage(entry.id)}
                  >
                    {locale === "tr" ? (entry.id === "graphics" ? "Grafik" : entry.id === "audio" ? "Ses" : entry.id === "interface" ? "Arayüz" : "Kontroller") : entry.label}
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
                        {locale === "tr" ? "Boyutu sıfırla" : "Reset size"}
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

const formatLastSaved = (timestamp: number, locale?: string): string => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return locale === "tr" ? "Henüz kaydedilmedi" : "Not saved yet";
  }
  try {
    const formatted = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(timestamp));
    return locale === "tr" ? `Son kayıt: ${formatted}` : `Last saved ${formatted}`;
  } catch {
    return locale === "tr" ? "Son kayıt alındı" : "Last save recorded";
  }
};
