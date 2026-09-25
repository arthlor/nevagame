import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FC, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { StartupState } from "../app/StartupState";
import type { GraphicsQualityPreference } from "../render/config/GraphicsQualitySettings";
import type { QualityTier } from "../render/config/VisualRenderConfig";
import { AudioControls, GraphicsControls } from "./components/SettingsControls";
import { ChromeButton, ChromeClose } from "./chrome/Chrome";
import { ControlsReference } from "./components/ControlsReference";
import { InterfaceSettings } from "./components/InterfaceSettings";
import { usePwaInstall } from "./pwa/usePwaInstall";
import { GameSheet } from "./coastal/CoastalUI";
import { dayOfSeason } from "../simulation/core/GameClock";
import { IntroVideo } from "./IntroVideo";
import type { IntroVideoHandle } from "./IntroVideo";

import { AtlasImage } from "./chrome/AtlasImage";
import { UI_MENU, UI_STATUS, UI_WORLD } from "./chrome/uiAtlas";
import { playUiSound } from "./audio/uiAudio";

const PwaInstallPromptModal = React.lazy(async () => ({ default: (await import("./components/PwaInstallPromptModal")).PwaInstallPromptModal }));

export interface StartScreenProps {
  startup: StartupState;
  onStart: () => void;
  onSkipIntro?: () => void;
  onIntroFinished?: (played: boolean) => void;
  onStartNewGame: () => void;
  onStartWithoutSaving: () => void;
  onRetry: () => void;
  graphicsQuality: GraphicsQualityPreference;
  effectiveGraphicsQuality: QualityTier;
  onGraphicsQualityChange: (quality: GraphicsQualityPreference) => void;
  mobileTouchDevice?: boolean;
  mobileOrientationBlocked?: boolean;
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
  "region.farm": "Family Farm & Commons",
  "region.village": "Neva Village",
  "region.coast": "Rocky Coast & Lighthouse",
  "region.offshore": "Open Waters"
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const titleCase = (value: string): string =>
  value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;

type StartOptionsPage = "graphics" | "audio" | "interface" | "controls";

const START_OPTIONS_PAGES: ReadonlyArray<{ id: StartOptionsPage; label: string }> = [
  { id: "graphics", label: "Graphics" },
  { id: "audio", label: "Audio" },
  { id: "interface", label: "Interface" },
  { id: "controls", label: "Controls" }
];

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

const PREPARATION_STEP: Record<StartupState["phase"], number> = {
  waiting: 1, save: 1, layout: 1, assets: 2, world: 3,
  physics: 4, presentation: 5, commit: 6, complete: 6
};

/** Wall-clock feedback, not a prediction of remaining work. */
const LoadingElapsed: FC = () => {
  const [startedAt] = useState(() => performance.now());
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds(Math.floor((performance.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return <span aria-live="off">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")} elapsed</span>;
};

export const StartScreen: FC<StartScreenProps> = ({
  startup,
  onStart,
  onSkipIntro,
  onIntroFinished,
  onStartNewGame,
  onStartWithoutSaving,
  onRetry,
  graphicsQuality,
  effectiveGraphicsQuality,
  onGraphicsQualityChange,
  mobileTouchDevice = false,
  mobileOrientationBlocked = false
}) => {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [optionsPage, setOptionsPage] = useState<StartOptionsPage>("graphics");
  const [newGameConfirmationOpen, setNewGameConfirmationOpen] = useState(false);
  const [withoutSavingConfirmationOpen, setWithoutSavingConfirmationOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenMessage, setFullscreenMessage] = useState<string | null>(null);
  const [pwaPromptManualOpen, setPwaPromptManualOpen] = useState(false);
  const introVideoRef = useRef<IntroVideoHandle>(null);
  const optionsCloseRef = useRef<HTMLButtonElement>(null);
  const newGameCancelRef = useRef<HTMLButtonElement>(null);
  const withoutSavingCancelRef = useRef<HTMLButtonElement>(null);
  const lastFocusedElement = useRef<HTMLElement | null>(null);
  const pwa = usePwaInstall();
  const introSkipRef = useRef<HTMLButtonElement>(null);

  const dialogOpen = optionsOpen || newGameConfirmationOpen || withoutSavingConfirmationOpen;
  const isLoading = startup.status === "loading" || startup.status === "revealing";
  const isTitle = startup.status === "title";
  const isCheckingSave = isTitle && startup.saveStatus === "checking";
  const hasMeasuredProgress = startup.phase === "assets" && startup.totalAssets > 0;
  const loadedAssets = clamp(startup.loadedAssets, 0, Math.max(1, startup.totalAssets));
  const progressMax = Math.max(1, startup.totalAssets);
  const progressPercent = Math.max(0, Math.min(100, (loadedAssets / progressMax) * 100));
  const savedDate = startup.saveSummary ? formatSavedDate(startup.saveSummary.savedAtUtcMs) : null;

  // Keep the first-paint shell until the menu (or a recovery state) is committed.
  // Removing it before paint avoids two translucent title screens overlapping.
  useLayoutEffect(() => {
    if (!isCheckingSave) document.getElementById("neva-boot-shell")?.remove();
  }, [isCheckingSave]);

  useEffect(() => {
    if (startup.status === "intro") introSkipRef.current?.focus();
  }, [startup.status]);

  // The install invitation belongs to the lobby: it greets handheld players
  // once on the title screen and never interrupts a dialog or gameplay. The
  // in-game Escape menu can reopen the guide on demand.
  const showPwaPrompt =
    pwaPromptManualOpen ||
    (isTitle &&
      mobileTouchDevice &&
      !pwa.isStandalone &&
      !pwa.isInstalled &&
      !pwa.isDismissed &&
      !mobileOrientationBlocked &&
      !dialogOpen);

  // Desktop gets no automatic popup; a small title utility opens the same guide
  // only when the browser has a real install prompt ready, and stays hidden
  // once the player has installed or dismissed it.
  const showPwaInstallUtility =
    (startup.status === "title" || startup.status === "error") &&
    !mobileTouchDevice &&
    pwa.canPromptDirectly &&
    !pwa.isStandalone &&
    !pwa.isInstalled &&
    !pwa.isDismissed;

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
    if (withoutSavingConfirmationOpen) withoutSavingCancelRef.current?.focus();
  }, [withoutSavingConfirmationOpen]);

  useEffect(() => {
    if (startup.status !== "title") {
      setOptionsOpen(false);
      setNewGameConfirmationOpen(false);
      setWithoutSavingConfirmationOpen(false);
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
    window.requestAnimationFrame(() => { if (element?.isConnected) element.focus(); });
  };

  const closeOptions = (): void => {
    setOptionsOpen(false);
    restoreFocus();
  };

  const closeNewGameConfirmation = (): void => {
    setNewGameConfirmationOpen(false);
    restoreFocus();
  };

  const closeWithoutSavingConfirmation = (): void => {
    setWithoutSavingConfirmationOpen(false);
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
        setFullscreenMessage("Fullscreen is not available on this device.");
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
      rememberFocus();
      setWithoutSavingConfirmationOpen(true);
    } else if (startup.saveStatus === "corrupt" || startup.saveStatus === "incompatible") {
      requestNewGame();
    } else {
      onStart();
    }
  };

  const primaryLabel = startup.status !== "title"
    ? startup.status === "revealing" ? "Entering the coast…" : "Preparing the coast…"
    : startup.saveStatus === "checking"
      ? "Reading harbor log…"
      : startup.saveStatus === "available"
        ? "Continue"
        : startup.saveStatus === "corrupt" || startup.saveStatus === "incompatible"
          ? "Start a new game"
          : startup.saveStatus === "unavailable"
            ? "Continue without saving"
            : "Begin";

  const primaryDisabled = isLoading || isCheckingSave;
  const showUtilities = showPwaInstallUtility || startup.status === "error";

  return (
    <main
      className={`start-screen neva-opening start-screen--${startup.status} interactive`}
      aria-labelledby="start-screen-title"
      aria-describedby="start-screen-description"
      aria-busy={isLoading || isCheckingSave}
      {...((mobileOrientationBlocked || isCheckingSave) ? { inert: "" } : {})}
      aria-hidden={mobileOrientationBlocked || isCheckingSave || undefined}
    >
      <div className="start-screen__backdrop" aria-hidden="true" />
      <div className="start-screen__shade" aria-hidden="true" />

      {startup.introKind === "new" && ["world", "physics", "presentation", "commit", "complete"].includes(startup.phase)
        && startup.status !== "error" && (
        <IntroVideo
          ref={introVideoRef}
          active={startup.status === "intro"}
          onFinished={played => onIntroFinished?.(played)}
        />
      )}

      {showUtilities && (
        <div className="start-screen__utilities" {...(dialogOpen ? { inert: "" } : {})} aria-hidden={dialogOpen || undefined}>
          {showPwaInstallUtility && (
            <button
              type="button"
              className="start-screen__utility-button"
              data-testid="startup-pwa-install-button"
              aria-label="Install app"
              aria-haspopup="dialog"
              onClick={() => {
                rememberFocus();
                playUiSound("open");
                setPwaPromptManualOpen(true);
              }}
            >
              <AtlasImage src={UI_WORLD.sprout} alt="" size={22} aria-hidden="true" />
              <span className="start-screen__utility-label">Install app</span>
            </button>
          )}
          {startup.status === "error" && (
            <button
              type="button"
              className="start-screen__utility-button"
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
          )}
        </div>
      )}

      <div className="start-screen__content" {...(dialogOpen ? { inert: "" } : {})} aria-hidden={dialogOpen || undefined}>
        <div className="start-screen__brand-lockup">
          <span className="start-screen__brand-rule" aria-hidden="true" />
          <h1 id="start-screen-title">Neva Land</h1>
          <p id="start-screen-description" className="start-screen__tagline">Grow a home. Follow the tide.</p>
        </div>


        {startup.status === "intro" ? (
          <button
            type="button"
            ref={introSkipRef}
            className="start-screen__intro-skip"
            data-testid="startup-intro-skip"
            onClick={() => {
              if (!introVideoRef.current?.skip()) onSkipIntro?.();
            }}
          >
            Skip intro · Esc
          </button>
        ) : startup.status === "error" ? (
          <div
            className="start-screen__state start-screen__state--error"
            data-startup-error-code={startup.errorCode ?? undefined}
            data-startup-error-phase={startup.errorPhase ?? undefined}
          >
            <GameSheet className="start-screen__tray start-screen__recovery" tone="ghost">
              <h2>{startup.recovery === "save" ? "Your world is ready" : "The coast did not open"}</h2>
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
                <span>{startup.recovery === "save" ? "Retry save" : "Reload game"}</span>
              </ChromeButton>
              {startup.recovery === "save" && <ChromeButton className="start-screen__button" onClick={() => setWithoutSavingConfirmationOpen(true)}>Play without saving</ChromeButton>}
              {(startup.errorCode || startup.errorPhase) && (
                <details className="start-screen__diagnostics">
                  <summary>Diagnostics</summary>
                  <span>Phase: {startup.errorPhase ?? "unknown"}</span>
                  <span>Code: {startup.errorCode ?? "startup-failed"}</span>
                  {startup.errorDetail && (
                    <span className="start-screen__diagnostic-detail">{startup.errorDetail}</span>
                  )}
                </details>
              )}
            </GameSheet>
          </div>
        ) : (
          <div className="start-screen__state">
            <GameSheet className="start-screen__tray" tone="ghost">
              {isLoading ? (
                <div className="start-screen__loading">
                  <div className="start-screen__progress-heading">
                    <span className="start-screen__progress-label" role="status">
                      {startup.phase === "world" ? startup.subMessage ?? startup.message : startup.message}
                    </span>
                    {hasMeasuredProgress && (
                      <span className="start-screen__progress-count">
                        {startup.loadedAssets} / {startup.totalAssets}
                      </span>
                    )}
                  </div>

                  {startup.slow && (
                    <p className="start-screen__slow-notice">
                      Still preparing…
                    </p>
                  )}

                  <div className={`start-screen__meter${hasMeasuredProgress ? "" : " is-indeterminate"}`}>
                    <span
                      className="start-screen__meter-fill"
                      style={hasMeasuredProgress ? { width: `${progressPercent}%` } : undefined}
                      aria-hidden="true"
                    />
                    <progress
                      className="start-screen__progress"
                      data-testid="startup-progress"
                      value={hasMeasuredProgress ? loadedAssets : undefined}
                      max={progressMax}
                      aria-label="Preparing the Neva Land world"
                      aria-valuetext={hasMeasuredProgress ? `${startup.loadedAssets} of ${startup.totalAssets} scenery assets` : startup.message}
                    />
                  </div>
                  <div className="start-screen__loading-detail">
                    <span>Step {PREPARATION_STEP[startup.phase]} of 6</span>
                    <LoadingElapsed />
                  </div>
                </div>
              ) : isTitle && startup.saveStatus === "corrupt" ? (
                <p className="start-screen__save-warning" role="status">
                  Your harbor log could not be read. Start a new game to begin again.
                </p>
              ) : isTitle && startup.saveStatus === "incompatible" ? (
                <p className="start-screen__save-warning" role="status">
                  This harbor log cannot open on the present coast. Start a new game to begin again.
                </p>
              ) : isTitle && startup.saveStatus === "unavailable" ? (
                <p className="start-screen__save-warning" role="status">
                  Save storage is unavailable. You can play, but this session won’t be saved.
                </p>
              ) : null}

              {isCheckingSave && (
                <div className="start-screen__loading" role="status">
                  <span className="start-screen__progress-label">Opening the coast…</span>
                  <div className="start-screen__meter is-indeterminate" aria-hidden="true">
                    <span className="start-screen__meter-fill" />
                  </div>
                </div>
              )}

              {isTitle && startup.saveStatus === "available" && startup.saveSummary && (
                <div className="start-screen__save-scroll-card" aria-label="Saved game summary">
                  <div className="save-scroll-details">
                    {/* dayCount is the absolute day since the save began; the day *within*
                        the season is what "Day N of Spring" claims to show. */}
                    <span className="save-scroll-tag">Day {dayOfSeason(startup.saveSummary.dayCount)} of {titleCase(startup.saveSummary.season)}</span>
                    <span className="save-scroll-sep">·</span>
                    <span className="save-scroll-location">{REGION_LABELS[startup.saveSummary.regionId] ?? "The coast"}</span>
                    {savedDate && <span className="save-scroll-date">Recorded {savedDate}</span>}
                  </div>
                </div>
              )}

              {isTitle && !isCheckingSave && (
                <div className="start-screen__actions start-screen__menu">
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

                  {startup.saveStatus === "available" && (
                    <ChromeButton
                      variant="secondary"
                      className="start-screen__secondary-button"
                      data-testid="startup-new-game-button"
                      onClick={requestNewGame}
                    >
                      Start a new game
                    </ChromeButton>
                  )}
                  <button
                    type="button"
                    className="start-screen__options-action"
                    data-testid="startup-options-button"
                    aria-controls="start-screen-options"
                    aria-expanded={optionsOpen}
                    onClick={() => {
                      rememberFocus();
                      playUiSound("open");
                      setOptionsOpen(true);
                    }}
                  >
                    <AtlasImage src={UI_MENU.compass} alt="" size={18} aria-hidden="true" />
                    <span>Options</span>
                  </button>
                </div>
              )}
            </GameSheet>
          </div>
        )}
      </div>

      {optionsOpen && (
        <div
          className="start-screen__dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeOptions();
          }}
        >
          <GameSheet
            as="section"
            id="start-screen-options"
            className="start-screen__dialog start-screen__options"
            family="physical"
            tone="scroll"
            role="dialog"
            aria-modal="true"
            aria-labelledby="start-screen-options-title"
            onKeyDown={(event) => trapDialogFocus(event, closeOptions)}
          >
            <div className="start-screen__dialog-header">
              <h2 id="start-screen-options-title">Settings</h2>
              <ChromeClose
                ref={optionsCloseRef}
                className="start-screen__dialog-close"
                data-testid="startup-options-close"
                label="Close options"
                onClick={closeOptions}
              />
            </div>

            <div className="start-screen__options-layout">
              <nav className="start-screen__options-pages" aria-label="Settings pages">
                {START_OPTIONS_PAGES.map((entry) => (
                  <button
                    type="button"
                    key={entry.id}
                    className={optionsPage === entry.id ? "is-active" : ""}
                    aria-current={optionsPage === entry.id ? "page" : undefined}
                    onClick={() => setOptionsPage(entry.id)}
                  >
                    {entry.label}
                  </button>
                ))}
              </nav>
              <div className="start-screen__options-body">
                {optionsPage === "graphics" && (
                  <div className="start-screen__options-section">
                    <GraphicsControls
                      preference={graphicsQuality}
                      effectiveTier={effectiveGraphicsQuality}
                      onChange={onGraphicsQualityChange}
                    />
                    <ChromeButton
                      className="start-screen__option-button"
                      data-testid="startup-fullscreen-button"
                      onClick={() => void toggleFullscreen()}
                    >
                      {isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                    </ChromeButton>
                    <p className="start-screen__option-note">Reduced motion follows your device setting.</p>
                    {fullscreenMessage && <p className="start-screen__option-message" role="status">{fullscreenMessage}</p>}
                  </div>
                )}
                {optionsPage === "audio" && <AudioControls />}
                {optionsPage === "interface" && <InterfaceSettings />}
                {optionsPage === "controls" && (
                  <section className="start-screen__options-section" aria-labelledby="start-screen-controls-title">
                    <h3 id="start-screen-controls-title">Controls</h3>
                    <ControlsReference className="start-screen__controls" />
                  </section>
                )}
              </div>
            </div>
          </GameSheet>
        </div>
      )}

      {newGameConfirmationOpen && (
        <div
          className="start-screen__dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeNewGameConfirmation();
          }}
        >
          <GameSheet
            as="section"
            className="start-screen__dialog start-screen__new-game-dialog"
            family="physical"
            tone="scroll"
            role="dialog"
            aria-modal="true"
            aria-labelledby="start-screen-new-game-title"
            aria-describedby="start-screen-new-game-description"
            onKeyDown={(event) => trapDialogFocus(event, closeNewGameConfirmation)}
          >
            <div className="start-screen__dialog-header">
              <h2 id="start-screen-new-game-title">Replace this harbor log?</h2>
              <ChromeClose
                className="start-screen__dialog-close"
                label="Keep current game"
                onClick={closeNewGameConfirmation}
              />
            </div>
            <p id="start-screen-new-game-description" className="start-screen__dialog-copy">
              {startup.saveStatus === "available"
                ? `Day ${startup.saveSummary?.dayCount ?? "—"} at ${REGION_LABELS[startup.saveSummary?.regionId ?? ""] ?? "the coast"} will be replaced once the new world is ready.`
                : startup.saveStatus === "incompatible" || startup.saveStatus === "corrupt"
                  ? "The unreadable harbor log will remain untouched until you confirm. A new game will replace it once the coast is ready."
                  : "The existing harbor log remains untouched until you confirm. A new game will replace it once the coast is ready."}
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
          </GameSheet>
        </div>
      )}

      {withoutSavingConfirmationOpen && (
        <div
          className="start-screen__dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeWithoutSavingConfirmation();
          }}
        >
          <GameSheet
            as="section"
            className="start-screen__dialog start-screen__new-game-dialog"
            family="physical"
            tone="scroll"
            role="dialog"
            aria-modal="true"
            aria-labelledby="start-screen-no-save-title"
            aria-describedby="start-screen-no-save-description"
            onKeyDown={(event) => trapDialogFocus(event, closeWithoutSavingConfirmation)}
          >
            <div className="start-screen__dialog-header">
              <h2 id="start-screen-no-save-title">Continue without saving?</h2>
              <ChromeClose label="Cancel" onClick={closeWithoutSavingConfirmation} />
            </div>
            <p id="start-screen-no-save-description" className="start-screen__dialog-copy">
              Save storage is unavailable. Progress from this session will be lost when you leave or reload.
            </p>
            <div className="start-screen__dialog-actions">
              <ChromeButton
                ref={withoutSavingCancelRef}
                className="start-screen__secondary-button start-screen__secondary-button--dialog"
                onClick={closeWithoutSavingConfirmation}
              >
                Cancel
              </ChromeButton>
              <ChromeButton
                variant="danger"
                className="start-screen__button start-screen__button--dialog"
                soundCue="confirm"
                onClick={() => {
                  setWithoutSavingConfirmationOpen(false);
                  onStartWithoutSaving();
                }}
              >
                Continue without saving
              </ChromeButton>
            </div>
          </GameSheet>
        </div>
      )}

      {showPwaPrompt && (
        <React.Suspense fallback={null}>
          <PwaInstallPromptModal
            platform={pwa.platform}
            canPromptDirectly={pwa.canPromptDirectly}
            onInstall={async () => {
              const outcome = await pwa.promptInstall();
              if (outcome === "accepted" || outcome === "dismissed") {
                setPwaPromptManualOpen(false);
                pwa.dismiss();
              }
            }}
            onDismiss={() => {
              setPwaPromptManualOpen(false);
              pwa.dismiss();
            }}
          />
        </React.Suspense>
      )}
    </main>
  );
};
