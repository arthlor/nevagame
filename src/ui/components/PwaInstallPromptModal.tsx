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
    >
      <GameSheet ref={containerRef} as="div" className="modal-content pwa-install-sheet" tone="slate" corners flourish
        role="dialog" aria-modal="true" aria-labelledby="pwa-prompt-title" tabIndex={-1}>
        <header className="modal-header pwa-install-header">
          <div className="pwa-install-title-group">
            <div className="pwa-install-emblem" aria-hidden="true">
              <AtlasImage src={UI_WORLD.sprout} size={32} />
            </div>
            <div>
              <h2 id="pwa-prompt-title" className="pwa-title">{isTr ? "Ana ekrana ekle" : "Add to home screen"}</h2>
            </div>
          </div>
          <ChromeClose onClick={handleDismissClick} label={isTr ? "Rehberi kapat" : "Close install guide"} />
        </header>

        <div className="modal-body pwa-install-body">
          <p className="pwa-lead-text">
            {isTr ? "Neva Diyarı'nı ana ekranından aç." : "Open Nevaland from your home screen."}
          </p>

          {isIos ? (
            <div className="pwa-ios-instructions">
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
              <span>{isTr ? "Tarayıcındaki yükleme isteğini onayla." : "Confirm the install prompt in your browser."}</span>
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
            {isTr ? "Sonra" : "Later"}
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
