import React, { useRef } from "react";
import { ChromeButton, ChromeClose } from "../chrome/Chrome";
import { GameSheet } from "../coastal/CoastalUI";
import { AtlasImage } from "../chrome/AtlasImage";
import { UI_WORLD } from "../chrome/uiAtlas";
import { playUiSound } from "../audio/uiAudio";
import type { PwaPlatform } from "../pwa/usePwaInstall";
import { useTranslation } from "../../i18n/useTranslation";
import { useModalAccessibility } from "../useModalAccessibility";

export interface PwaInstallPromptModalProps {
  platform: PwaPlatform;
  canPromptDirectly: boolean;
  onInstall: () => void;
  onDismiss: () => void;
}

export const PwaInstallPromptModal: React.FC<PwaInstallPromptModalProps> = ({
  platform,
  canPromptDirectly,
  onInstall,
  onDismiss
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(containerRef, onDismiss);
  const { locale } = useTranslation();
  const isTr = locale === "tr";

  const isIos = platform === "ios-safari" || platform === "ios-chrome";
  const isChromeIos = platform === "ios-chrome";
  const isAndroid = platform === "chrome-android" || platform === "other-mobile";
  const isAndroidChrome = platform === "chrome-android";
  const showAndroidGuide = isAndroid && !canPromptDirectly;
  const showDesktopGuide = platform === "desktop" && !canPromptDirectly;

  const handleInstallClick = () => {
    playUiSound("click");
    onInstall();
  };

  const handleDismissClick = () => {
    playUiSound("click");
    onDismiss();
  };

  return (
    <div
      className="modal-overlay interactive pwa-install-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-prompt-title"
      ref={containerRef}
    >
      <GameSheet className="modal-content pwa-install-sheet" tone="slate" corners flourish>
        <header className="modal-header pwa-install-header">
          <div className="pwa-install-title-group">
            <div className="pwa-install-emblem" aria-hidden="true">
              <AtlasImage src={UI_WORLD.sprout} size={32} />
            </div>
            <div>
              <div className="pwa-header-pill">{isTr ? "Mobil Tam Ekran Deneyimi" : "Mobile Fullscreen Experience"}</div>
              <h2 id="pwa-prompt-title" className="pwa-title">{isTr ? "Neva Diyarı'nı Ana Ekrana Ekle" : "Add Nevaland to Home Screen"}</h2>
            </div>
          </div>
          <ChromeClose onClick={handleDismissClick} label={isTr ? "Rehberi kapat" : "Close install guide"} />
        </header>

        <div className="modal-body pwa-install-body">
          <p className="pwa-lead-text">
            {isTr
              ? (isIos
                  ? `${isChromeIos ? "Chrome" : "Safari"} üzerinde Neva Diyarı'nı tıpkı yerel bir oyun gibi tam ekran oyna. Kesintisiz bir kıyı manzarası için adres çubuğunu ve tarayıcı kontrollerini gizler.`
                  : "Neva Diyarı'nı tıpkı yerel bir oyun gibi tam ekran oyna. Kesintisiz bir kıyı manzarası için adres çubuğunu ve tarayıcı kontrollerini gizler.")
              : (isIos
                  ? `Play Nevaland just like a native app on ${isChromeIos ? "Chrome" : "Safari"}. Hides the browser address bar and controls for an immersive, edge-to-edge coastal horizon.`
                  : "Play Nevaland just like a native game. Hides the browser address bar and controls for an immersive, edge-to-edge coastal horizon.")}
          </p>

          <div className="pwa-benefits-grid">
            <div className="pwa-benefit-card">
              <div className="pwa-benefit-icon-wrap" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              </div>
              <div className="pwa-benefit-text">
                <strong>{isTr ? "Gerçek Tam Ekran" : "True Fullscreen"}</strong>
                <span>{isTr ? "Tarayıcı çubuklarını kaldırarak ekranı uçtan uca genişletir." : "Reclaims full height by removing browser URLs and top tabs."}</span>
              </div>
            </div>

            <div className="pwa-benefit-card">
              <div className="pwa-benefit-icon-wrap" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </div>
              <div className="pwa-benefit-text">
                <strong>{isTr ? "Anında Başlat" : "Instant Launch"}</strong>
                <span>{isTr ? "Çiftliğine, teknene ve deniz ufkuna doğrudan tek dokunuşla ulaş." : "One-tap entry straight into your farm, boat, and ocean horizon."}</span>
              </div>
            </div>

            <div className="pwa-benefit-card">
              <div className="pwa-benefit-icon-wrap" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="m4.93 4.93 4.24 4.24M14.83 9.17l4.24-4.24M14.83 14.83l4.24 4.24M9.17 14.83l-4.24 4.24" />
                </svg>
              </div>
              <div className="pwa-benefit-text">
                <strong>{isTr ? "Yatay Ekran" : "Landscape Locked"}</strong>
                <span>{isTr ? "Döndürme uyarıları olmadan kendiliğinden yatay açılır." : "Launches automatically in landscape without screen rotation popups."}</span>
              </div>
            </div>
          </div>

          {isIos ? (
            <div className="pwa-ios-instructions">
              <h3 className="pwa-instructions-heading">{isTr ? "iOS'ta Ana Ekrana Nasıl Eklenir:" : "How to Add to Home Screen on iOS:"}</h3>
              <ol className="pwa-steps-list">
                <li className="pwa-step-item">
                  <span className="pwa-step-num">1</span>
                  <span>
                    {isTr ? (
                      <>Tarayıcı araç çubuğundaki <strong>{isChromeIos ? "Menü (···)" : "Paylaş"}</strong> düğmesine dokun.</>
                    ) : (
                      <>Tap the <strong>{isChromeIos ? "Menu (···)" : "Share"}</strong> button in your browser toolbar.</>
                    )}
                  </span>
                </li>
                <li className="pwa-step-item">
                  <span className="pwa-step-num">2</span>
                  <span>
                    {isTr ? (
                      <>Aşağı kaydır ve <strong>Ana Ekrana Ekle</strong> seçeneğine dokun.</>
                    ) : (
                      <>Scroll down and tap <strong>Add to Home Screen</strong>.</>
                    )}
                  </span>
                </li>
                <li className="pwa-step-item">
                  <span className="pwa-step-num">3</span>
                  <span>
                    {isTr ? (
                      <>Tamamlamak için sağ üstteki <strong>Ekle</strong> düğmesine dokun.</>
                    ) : (
                      <>Tap <strong>Add</strong> in the top-right corner to finish.</>
                    )}
                  </span>
                </li>
              </ol>
            </div>
          ) : showAndroidGuide ? (
            <div className="pwa-ios-instructions">
              <h3 className="pwa-instructions-heading">{isTr ? "Android'de Ana Ekrana Nasıl Eklenir:" : "How to Add to Home Screen on Android:"}</h3>
              <ol className="pwa-steps-list">
                <li className="pwa-step-item">
                  <span className="pwa-step-num">1</span>
                  <span>
                    {isAndroidChrome ? (
                      isTr ? <>Chrome araç çubuğundaki <strong>Menü (···)</strong> simgesine dokun.</> : <>Tap the <strong>Menu (···)</strong> button in Chrome's toolbar.</>
                    ) : (
                      isTr ? <>Tarayıcının <strong>menü</strong> simgesine dokun.</> : <>Open your browser's <strong>menu</strong>.</>
                    )}
                  </span>
                </li>
                <li className="pwa-step-item">
                  <span className="pwa-step-num">2</span>
                  <span>
                    {isTr ? (
                      <><strong>Ana ekrana ekle</strong> veya <strong>Uygulamayı yükle</strong> seçeneğine dokun.</>
                    ) : (
                      <>Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>.</>
                    )}
                  </span>
                </li>
                <li className="pwa-step-item">
                  <span className="pwa-step-num">3</span>
                  <span>
                    {isTr ? (
                      <>Neva simgesini yerleştirmek için <strong>Yükle</strong> ile onayla.</>
                    ) : (
                      <>Confirm with <strong>Install</strong> to place the Nevaland icon.</>
                    )}
                  </span>
                </li>
              </ol>
            </div>
          ) : canPromptDirectly ? (
            <div className="pwa-quick-notice">
              <svg className="pwa-notice-bullet" width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                <path d="M6 1L7.5 4.5L11 6L7.5 7.5L6 11L4.5 7.5L1 6L4.5 4.5Z" />
              </svg>
              <span>{isTr
                ? (platform === "desktop"
                    ? "Tarayıcınız masaüstüne özel bir Neva Diyarı simgesi ekleyecek."
                    : "Chrome ana ekranınıza özel bir Neva Diyarı simgesi ekleyecek.")
                : (platform === "desktop"
                    ? "Your browser will add a dedicated Nevaland app icon."
                    : "Chrome will add a dedicated Nevaland app icon to your home screen.")}</span>
            </div>
          ) : showDesktopGuide ? (
            <div className="pwa-quick-notice">
              <svg className="pwa-notice-bullet" width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                <path d="M6 1L7.5 4.5L11 6L7.5 7.5L6 11L4.5 7.5L1 6L4.5 4.5Z" />
              </svg>
              <span>{isTr
                ? "Neva Diyarı'nı yüklemek için adres çubuğundaki veya menüdeki yükleme simgesini kullanın."
                : "Use your browser's install icon in the address bar or menu to add Nevaland."}</span>
            </div>
          ) : null}
        </div>

        <footer className="modal-footer pwa-install-footer">
          <ChromeButton
            type="button"
            variant="ghost"
            onClick={handleDismissClick}
          >
            {isTr ? "Belki Sonra" : "Maybe Later"}
          </ChromeButton>

          {canPromptDirectly ? (
            <ChromeButton
              type="button"
              variant="primary"
              onClick={handleInstallClick}
            >
              {isTr ? "Ana Ekrana Ekle" : "Add to Home Screen"}
            </ChromeButton>
          ) : (
            <ChromeButton
              type="button"
              variant="primary"
              onClick={handleDismissClick}
            >
              {isTr ? "Anladım" : "Got It"}
            </ChromeButton>
          )}
        </footer>
      </GameSheet>
    </div>
  );
};
