// src/ui/StartScreen.tsx
import { useEffect, useRef, useState } from "react";
import type { FC, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { StartupState } from "../app/StartupState";
import { AudioControls } from "./EscapeMenuModal";
import { ChromeButton, ChromeClose, ChromePanel } from "./chrome/Chrome";
import { ControlsReference } from "./components/ControlsReference";
import { InterfaceSettings } from "./components/InterfaceSettings";

import { AtlasImage } from "./chrome/AtlasImage";
import { UI_MENU, UI_STATUS, UI_WORLD } from "./chrome/uiAtlas";
import { playUiSound } from "./audio/uiAudio";

export interface StartScreenProps {
  startup: StartupState;
  onStart: () => void;
  onStartNewGame: () => void;
  onStartWithoutSaving: () => void;
  onRetry: () => void;
}

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

const REGION_LABELS: Record<string, string> = {
  "region.farm": "Homestead Farm",
  "region.village": "Neva Village",
  "region.coast": "Rocky Coast & Lighthouse",
  "region.offshore": "Open Waters"
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const titleCase = (value: string): string =>
  value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;

/**
 * A bare medium date could not tell two saves from the same day apart, which
 * is the case that matters most when deciding whether to continue. Recent
 * saves get a relative day plus the clock time.
 */
const formatSavedDate = (savedAtUtcMs: number, now: number = Date.now()): string | null => {
  if (!Number.isFinite(savedAtUtcMs) || savedAtUtcMs <= 0) return null;
  try {
    const saved = new Date(savedAtUtcMs);
    const time = new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(saved);

    const startOfDay = (value: Date): number =>
      new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
    const dayGap = Math.round((startOfDay(new Date(now)) - startOfDay(saved)) / 86_400_000);

    if (dayGap === 0) return `today at ${time}`;
    if (dayGap === 1) return `yesterday at ${time}`;
    if (dayGap > 1 && dayGap < 7) return `${dayGap} days ago at ${time}`;

    const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(saved);
    return `${date} at ${time}`;
  } catch {
    return null;
  }
};

export const StartScreen: FC<StartScreenProps> = ({
  startup,
  onStart,
  onStartNewGame,
  onStartWithoutSaving,
  onRetry
}) => {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [newGameConfirmationOpen, setNewGameConfirmationOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenMessage, setFullscreenMessage] = useState<string | null>(null);
  const optionsCloseRef = useRef<HTMLButtonElement>(null);
  const newGameCancelRef = useRef<HTMLButtonElement>(null);
  const lastFocusedElement = useRef<HTMLElement | null>(null);

  const isLoading = startup.status === "loading" || startup.status === "revealing";
  const isTitle = startup.status === "title";
  const isCheckingSave = isTitle && startup.saveStatus === "checking";
  const loadedAssets = clamp(startup.loadedAssets, 0, Math.max(1, startup.totalAssets));
  const progressMax = Math.max(1, startup.totalAssets);
  const progressPercent = Math.max(0, Math.min(100, (loadedAssets / progressMax) * 100));
  const savedDate = startup.saveSummary ? formatSavedDate(startup.saveSummary.savedAtUtcMs) : null;

  useEffect(() => {
    const syncFullscreen = (): void => {
      setIsFullscreen(document.fullscreenElement !== null);
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    syncFullscreen();
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    if (optionsOpen) optionsCloseRef.current?.focus();
  }, [optionsOpen]);

  useEffect(() => {
    if (newGameConfirmationOpen) newGameCancelRef.current?.focus();
  }, [newGameConfirmationOpen]);

  useEffect(() => {
    if (startup.status !== "title") {
      setOptionsOpen(false);
      setNewGameConfirmationOpen(false);
    }
  }, [startup.status]);

  const rememberFocus = (): void => {
    lastFocusedElement.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  };

  const restoreFocus = (): void => {
    const element = lastFocusedElement.current;
    lastFocusedElement.current = null;
    if (element?.isConnected) element.focus();
  };

  const closeOptions = (): void => {
    setOptionsOpen(false);
    restoreFocus();
  };

  const closeNewGameConfirmation = (): void => {
    setNewGameConfirmationOpen(false);
    restoreFocus();
  };

  const trapDialogFocus = (event: ReactKeyboardEvent<HTMLElement>, close: () => void): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const toggleFullscreen = async (): Promise<void> => {
    setFullscreenMessage(null);
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (typeof document.documentElement.requestFullscreen !== "function") {
        setFullscreenMessage("Fullscreen is not available in this browser.");
        return;
      }
      await document.documentElement.requestFullscreen();
    } catch {
      setFullscreenMessage("Fullscreen could not be enabled here.");
    }
  };

  const requestNewGame = (): void => {
    rememberFocus();
    setOptionsOpen(false);
    setNewGameConfirmationOpen(true);
  };

  const primaryAction = (): void => {
    if (!isTitle || isCheckingSave) return;
    if (startup.saveStatus === "available") {
      onStart();
    } else if (startup.saveStatus === "unavailable") {
      onStartWithoutSaving();
    } else if (startup.saveStatus === "corrupt" || startup.saveStatus === "incompatible") {
      requestNewGame();
    } else {
      onStart();
    }
  };

  const primaryLabel = startup.status !== "title"
    ? startup.status === "revealing" ? "Entering Neva Land…" : "Preparing Neva Land…"
    : startup.saveStatus === "checking"
      ? "Checking your harbor log…"
      : startup.saveStatus === "available"
        ? "Continue Neva Land"
        : startup.saveStatus === "corrupt" || startup.saveStatus === "incompatible"
          ? "Start a new game"
          : startup.saveStatus === "unavailable"
            ? "Continue without saving"
            : "Enter Neva Land";

  const primaryDisabled = isLoading || isCheckingSave;
  const showUtilities = startup.status === "title" || startup.status === "error";

  return (
    <main
      className={`start-screen start-screen--${startup.status} interactive`}
      aria-labelledby="start-screen-title"
      aria-describedby="start-screen-description"
      aria-busy={isLoading || isCheckingSave}
    >
      <div className="start-screen__backdrop" aria-hidden="true" />
      <div className="start-screen__shade" aria-hidden="true" />

      {showUtilities && (
        <div className="start-screen__utilities">
          <button
            type="button"
            className="start-screen__utility-button"
            data-testid="startup-options-button"
            aria-label="Options"
            aria-controls="start-screen-options"
            aria-expanded={optionsOpen}
            onClick={() => {
              rememberFocus();
              playUiSound("open");
              setOptionsOpen(true);
            }}
          >
            <AtlasImage src={UI_MENU.compass} alt="" size={22} aria-hidden="true" />
            <span className="start-screen__utility-label">Options</span>
          </button>
        </div>
      )}

      <div className="start-screen__content">
        <div className="start-screen__brand-lockup">
          <span className="start-screen__brand-rule" aria-hidden="true" />
          <h1 id="start-screen-title">Neva Land</h1>
          <p className="start-screen__tagline">Grow a home. Follow the tide.</p>
          <p id="start-screen-description" className="start-screen__description">
            A coastal life of soil, craft, and open water.
          </p>
        </div>


        {startup.status === "error" ? (
          <div
            className="start-screen__state start-screen__state--error"
            data-startup-error-code={startup.errorCode ?? undefined}
            data-startup-error-phase={startup.errorPhase ?? undefined}
          >
            <ChromePanel className="start-screen__tray" tone="plaque" flourish corners>
              <p className="start-screen__error" role="alert">
                <span className="start-screen__icon-well" aria-hidden="true">
                  <AtlasImage src={UI_STATUS.warning} size={18} />
                </span>
                <span>{startup.errorMessage ?? "We couldn’t prepare the world. Try again."}</span>
              </p>
              <ChromeButton
                variant="gold"
                className="start-screen__button"
                data-testid="startup-retry-button"
                onClick={onRetry}
              >
                <span>Try again</span>
              </ChromeButton>
            </ChromePanel>
          </div>
        ) : (
          <div className="start-screen__state">
            <ChromePanel className="start-screen__tray" tone="plaque" flourish corners>
              {isLoading ? (
                <div className="start-screen__loading" aria-live="polite">
                  <div className="start-screen__progress-heading">
                    <span className="start-screen__progress-label">
                      <span className="start-screen__icon-well" aria-hidden="true">
                        <AtlasImage src={UI_WORLD.boat} size={18} />
                      </span>
                      {startup.message}
                    </span>
                    <span className="start-screen__progress-count">
                      {startup.loadedAssets} / {startup.totalAssets}
                    </span>
                  </div>
                  <div className="start-screen__meter">
                    <span
                      className="start-screen__meter-fill"
                      style={{ width: `${progressPercent}%` }}
                      aria-hidden="true"
                    />
                    <progress
                      className="start-screen__progress"
                      data-testid="startup-progress"
                      value={loadedAssets}
                      max={progressMax}
                      aria-label="Preparing the Neva Land world"
                    />
                  </div>
                </div>
              ) : isTitle && startup.saveStatus === "corrupt" ? (
                <p className="start-screen__save-warning" role="status">
                  Your harbor log could not be read. Start a new game to begin again.
                </p>
              ) : isTitle && startup.saveStatus === "incompatible" ? (
                <p className="start-screen__save-warning" role="status">
                  This harbor log belongs to an older development world layout. Start a new game to enter the current world.
                </p>
              ) : isTitle && startup.saveStatus === "unavailable" ? (
                <p className="start-screen__save-warning" role="status">
                  Save storage is unavailable. You can play, but this session won’t be saved.
                </p>
              ) : isCheckingSave ? (
                <p className="start-screen__ready-note" aria-live="polite">
                  Reading your harbor log…
                </p>
              ) : null}

              {/* Harbor Log Save Summary Card */}
              {isTitle && startup.saveStatus === "available" && startup.saveSummary && (
                <div className="start-screen__save-scroll-card" aria-label="Existing save summary">
                  <div className="save-scroll-header">
                    <AtlasImage src={UI_MENU.journal} size={20} alt="" />
                    <strong>Harbor Log Record</strong>
                  </div>
                  <div className="save-scroll-details">
                    <span>Day {startup.saveSummary.dayCount} of {titleCase(startup.saveSummary.season)}</span>
                    <span className="save-scroll-sep">·</span>
                    <span>{REGION_LABELS[startup.saveSummary.regionId] ?? "The coast"}</span>
                    {/* Own row: the inline separator dangled at the end of the
                        first line once the summary wrapped. */}
                    {savedDate && <span className="save-scroll-date">Saved {savedDate}</span>}
                  </div>
                </div>
              )}

              <div
                className={`start-screen__actions start-screen__menu${isLoading ? " start-screen__actions--busy" : ""}`}
              >
                <ChromeButton
                  variant="gold"
                  className="start-screen__button"
                  data-testid="startup-start-button"
                  soundCue="confirm"
                  onClick={primaryAction}
                  disabled={primaryDisabled}
                >
                  <span>{primaryLabel}</span>
                </ChromeButton>

                {isTitle && startup.saveStatus === "available" && (
                  <ChromeButton
                    variant="secondary"
                    className="start-screen__secondary-button"
                    data-testid="startup-new-game-button"
                    onClick={requestNewGame}
                  >
                    Start a new game
                  </ChromeButton>
                )}
              </div>
            </ChromePanel>
          </div>
        )}
      </div>

      {/* Options Dialog */}
      {optionsOpen && (
        <div
          className="start-screen__dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeOptions();
          }}
        >
          <ChromePanel
            as="section"
            id="start-screen-options"
            className="start-screen__dialog start-screen__options"
            tone="plaque"
            flourish
            corners
            role="dialog"
            aria-modal="true"
            aria-labelledby="start-screen-options-title"
            onKeyDown={(event) => trapDialogFocus(event, closeOptions)}
          >
            <div className="start-screen__dialog-header">
              <div>
                <span className="start-screen__dialog-kicker">Neva Land</span>
                <h2 id="start-screen-options-title">Options</h2>
              </div>
              <ChromeClose
                ref={optionsCloseRef}
                className="start-screen__dialog-close"
                data-testid="startup-options-close"
                label="Close options"
                onClick={closeOptions}
              />
            </div>

            <div className="start-screen__options-body">
              <AudioControls />

              <section className="start-screen__options-section" aria-labelledby="start-screen-display-title">
                <h3 id="start-screen-display-title">Display</h3>
                <ChromeButton
                  className="start-screen__option-button"
                  data-testid="startup-fullscreen-button"
                  onClick={() => void toggleFullscreen()}
                >
                  {isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                </ChromeButton>
                <p className="start-screen__option-note">
                  Reduced motion follows your device preference.
                </p>
                {fullscreenMessage && (
                  <p className="start-screen__option-message" role="status">
                    {fullscreenMessage}
                  </p>
                )}
              </section>

              <InterfaceSettings />

              <section className="start-screen__options-section" aria-labelledby="start-screen-controls-title">
                <h3 id="start-screen-controls-title">Controls</h3>
                <ControlsReference className="start-screen__controls" />
              </section>
            </div>
          </ChromePanel>
        </div>
      )}

      {/* New Game Confirmation Dialog */}
      {newGameConfirmationOpen && (
        <div
          className="start-screen__dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeNewGameConfirmation();
          }}
        >
          <ChromePanel
            as="section"
            className="start-screen__dialog start-screen__new-game-dialog"
            tone="plaque"
            flourish
            corners
            role="dialog"
            aria-modal="true"
            aria-labelledby="start-screen-new-game-title"
            aria-describedby="start-screen-new-game-description"
            onKeyDown={(event) => trapDialogFocus(event, closeNewGameConfirmation)}
          >
            <div className="start-screen__dialog-header">
              <div>
                <span className="start-screen__dialog-kicker">A fresh beginning</span>
                <h2 id="start-screen-new-game-title">Start a new game?</h2>
              </div>
              <ChromeClose
                className="start-screen__dialog-close"
                label="Keep current game"
                onClick={closeNewGameConfirmation}
              />
            </div>
            <p id="start-screen-new-game-description" className="start-screen__dialog-copy">
              {startup.saveStatus === "available"
                ? "Your current harbor log will be replaced by the new game. Nothing changes until you confirm."
                : startup.saveStatus === "incompatible"
                  ? "This harbor log belongs to an older development world layout and will stay untouched until you confirm a fresh game."
                : "The old harbor log will remain untouched until the new world is ready. Start fresh?"}
            </p>
            <div className="start-screen__dialog-actions">
              <ChromeButton
                ref={newGameCancelRef}
                className="start-screen__secondary-button start-screen__secondary-button--dialog"
                data-testid="startup-new-game-cancel"
                onClick={closeNewGameConfirmation}
              >
                Keep current game
              </ChromeButton>
              <ChromeButton
                variant="gold"
                className="start-screen__button start-screen__button--dialog"
                data-testid="startup-new-game-confirm"
                soundCue="confirm"
                onClick={() => {
                  setNewGameConfirmationOpen(false);
                  onStartNewGame();
                }}
              >
                Start a new game
              </ChromeButton>
            </div>
          </ChromePanel>
        </div>
      )}

      <p className="start-screen__footer">A slower kind of adventure</p>
    </main>
  );
};
