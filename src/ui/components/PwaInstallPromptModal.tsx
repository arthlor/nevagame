import React, { useRef } from "react";
import { ChromeButton, ChromeClose } from "../chrome/Chrome";
import { GameSheet } from "../coastal/CoastalUI";
import { AtlasImage } from "../chrome/AtlasImage";
import { UI_WORLD } from "../chrome/uiAtlas";
import { useModalAccessibility } from "../useModalAccessibility";
import { playUiSound } from "../audio/uiAudio";
import type { PwaPlatform } from "../pwa/usePwaInstall";

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

  const isIos = platform === "ios-safari" || platform === "ios-chrome";
  const isChromeIos = platform === "ios-chrome";

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
      className="modal-overlay pwa-install-overlay"
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
              <div className="pwa-header-pill">Mobile Fullscreen Experience</div>
              <h2 id="pwa-prompt-title" className="pwa-title">Add Nevaland to Home Screen</h2>
            </div>
          </div>
          <ChromeClose onClick={handleDismissClick} />
        </header>

        <div className="modal-body pwa-install-body">
          <p className="pwa-lead-text">
            Play Nevaland just like a native game on Chrome. Hides the browser address bar and controls for an immersive, edge-to-edge coastal horizon.
          </p>

          <div className="pwa-benefits-grid">
            <div className="pwa-benefit-card">
              <div className="pwa-benefit-icon-wrap" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              </div>
              <div className="pwa-benefit-text">
                <strong>True Fullscreen</strong>
                <span>Reclaims full height by removing browser URLs and top tabs.</span>
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
                <strong>Instant Launch</strong>
                <span>One-tap entry straight into your farm, boat, and ocean horizon.</span>
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
                <strong>Landscape Locked</strong>
                <span>Launches automatically in landscape without screen rotation popups.</span>
              </div>
            </div>
          </div>

          {isIos ? (
            <div className="pwa-ios-instructions">
              <h3 className="pwa-instructions-heading">How to Add to Home Screen on iOS:</h3>
              <ol className="pwa-steps-list">
                <li className="pwa-step-item">
                  <span className="pwa-step-num">1</span>
                  <span>
                    Tap the <strong>{isChromeIos ? "Menu (···)" : "Share"}</strong> button in your browser toolbar.
                  </span>
                </li>
                <li className="pwa-step-item">
                  <span className="pwa-step-num">2</span>
                  <span>
                    Scroll down and tap <strong>Add to Home Screen</strong>.
                  </span>
                </li>
                <li className="pwa-step-item">
                  <span className="pwa-step-num">3</span>
                  <span>
                    Tap <strong>Add</strong> in the top-right corner to finish.
                  </span>
                </li>
              </ol>
            </div>
          ) : (
            canPromptDirectly && (
              <div className="pwa-quick-notice">
                <svg className="pwa-notice-bullet" width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                  <path d="M6 1L7.5 4.5L11 6L7.5 7.5L6 11L4.5 7.5L1 6L4.5 4.5Z" />
                </svg>
                <span>Chrome will add a dedicated Nevaland app icon to your home screen.</span>
              </div>
            )
          )}
        </div>

        <footer className="modal-footer pwa-install-footer">
          <ChromeButton
            type="button"
            variant="ghost"
            onClick={handleDismissClick}
          >
            Maybe Later
          </ChromeButton>

          {canPromptDirectly ? (
            <ChromeButton
              type="button"
              variant="primary"
              onClick={handleInstallClick}
            >
              Add to Home Screen
            </ChromeButton>
          ) : (
            <ChromeButton
              type="button"
              variant="primary"
              onClick={handleDismissClick}
            >
              Got It
            </ChromeButton>
          )}
        </footer>
      </GameSheet>
    </div>
  );
};
