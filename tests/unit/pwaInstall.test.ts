import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  checkIsStandalone,
  detectPwaPlatform,
  isDismissedRecently,
  isInstalledFlagSet,
  readStashedInstallPrompt,
  setDismissedSnooze,
  setInstalledFlag
} from "../../src/ui/pwa/usePwaInstall";
import { PwaInstallPromptModal } from "../../src/ui/components/PwaInstallPromptModal";
import { StartScreen } from "../../src/ui/StartScreen";
import { createStartupState } from "../../src/app/StartupState";

describe("PWA Install Utilities", () => {
  let mockStorage: Storage;
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    mockStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const key of Object.keys(store)) delete store[key];
      },
      key: () => null,
      length: 0
    };
  });

  describe("checkIsStandalone", () => {
    it("returns false when not standalone", () => {
      const mockWin = {
        matchMedia: () => ({ matches: false }),
        navigator: {}
      } as unknown as Window;
      expect(checkIsStandalone(mockWin)).toBe(false);
    });

    it("returns true when display-mode is standalone", () => {
      const mockWin = {
        matchMedia: (query: string) => ({ matches: query === "(display-mode: standalone)" }),
        navigator: {}
      } as unknown as Window;
      expect(checkIsStandalone(mockWin)).toBe(true);
    });

    it("returns true when navigator.standalone is true (iOS Safari)", () => {
      const mockWin = {
        matchMedia: () => ({ matches: false }),
        navigator: { standalone: true }
      } as unknown as Window;
      expect(checkIsStandalone(mockWin)).toBe(true);
    });
  });

  describe("detectPwaPlatform", () => {
    it("detects Chrome on Android", () => {
      const ua = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
      expect(detectPwaPlatform(ua, "Linux armv81", 5)).toBe("chrome-android");
    });

    it("detects Chrome on iOS (CriOS)", () => {
      const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.0.0 Mobile/15E148 Safari/604.1";
      expect(detectPwaPlatform(ua, "iPhone", 5)).toBe("ios-chrome");
    });

    it("detects Safari on iOS", () => {
      const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
      expect(detectPwaPlatform(ua, "iPhone", 5)).toBe("ios-safari");
    });

    it("detects Desktop browser", () => {
      const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
      expect(detectPwaPlatform(ua, "MacIntel", 0)).toBe("desktop");
    });
  });

  describe("Snooze and Dismissal persistence", () => {
    it("reports not dismissed by default", () => {
      expect(isDismissedRecently(mockStorage)).toBe(false);
    });

    it("correctly records snooze in localStorage", () => {
      setDismissedSnooze(60_000, mockStorage);
      expect(isDismissedRecently(mockStorage)).toBe(true);
    });

    it("marks installed flag in localStorage", () => {
      setInstalledFlag(mockStorage);
      expect(mockStorage.getItem("neva_pwa_installed")).toBe("true");
      expect(isInstalledFlagSet(mockStorage)).toBe(true);
    });

    it("reports not installed before the flag is written", () => {
      expect(isInstalledFlagSet(mockStorage)).toBe(false);
    });
  });

  describe("boot-stashed install prompt", () => {
    it("returns null when no prompt was captured", () => {
      vi.stubGlobal("window", {});
      expect(readStashedInstallPrompt()).toBeNull();
      vi.unstubAllGlobals();
    });

    it("returns the event captured before React mounted", () => {
      const stashed = { prompt: async () => {}, userChoice: Promise.resolve({ outcome: "accepted" }) };
      vi.stubGlobal("window", { __nevaDeferredInstallPrompt: stashed });
      expect(readStashedInstallPrompt()).toBe(stashed);
      vi.unstubAllGlobals();
    });
  });
});

describe("PwaInstallPromptModal component", () => {
  it("renders Chrome Android 1-tap install prompt when canPromptDirectly is true", () => {
    const html = renderToString(
      React.createElement(PwaInstallPromptModal, {
        platform: "chrome-android",
        canPromptDirectly: true,
        onInstall: () => {},
        onDismiss: () => {}
      })
    );

    expect(html).toContain("Add Nevaland to Home Screen");
    expect(html).toContain("True Fullscreen");
    expect(html).toContain("Instant Launch");
    expect(html).toContain("Landscape Locked");
    expect(html).toContain("Add to Home Screen");
    // Without `interactive` the ui-root's pointer-events: none lets the game
    // canvas swallow every press on the prompt.
    expect(html).toContain("modal-overlay interactive pwa-install-overlay");
  });

  it("renders Android manual steps when Chrome has no native prompt ready", () => {
    const html = renderToString(
      React.createElement(PwaInstallPromptModal, {
        platform: "chrome-android",
        canPromptDirectly: false,
        onInstall: () => {},
        onDismiss: () => {}
      })
    );

    expect(html).toContain("How to Add to Home Screen on Android:");
    expect(html).toContain("Install app");
    expect(html).toContain("Got It");
  });

  it("renders iOS step-by-step visual instructions on iOS Safari", () => {
    const html = renderToString(
      React.createElement(PwaInstallPromptModal, {
        platform: "ios-safari",
        canPromptDirectly: false,
        onInstall: () => {},
        onDismiss: () => {}
      })
    );

    expect(html).toContain("How to Add to Home Screen on iOS:");
    expect(html).toContain("Share");
    expect(html).toContain("Add to Home Screen");
    expect(html).toContain("Maybe Later");
    expect(html).toContain("Got It");
  });

  it("renders iOS Chrome instructions mentioning Menu button", () => {
    const html = renderToString(
      React.createElement(PwaInstallPromptModal, {
        platform: "ios-chrome",
        canPromptDirectly: false,
        onInstall: () => {},
        onDismiss: () => {}
      })
    );

    expect(html).toContain("Menu (···)");
  });
});

describe("StartScreen desktop install utility", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubWindow = (stashedPrompt: boolean, dismissedUntil?: number): void => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) =>
          key === "neva_pwa_dismissed_until" && dismissedUntil !== undefined
            ? String(dismissedUntil)
            : null,
        setItem: () => {},
        removeItem: () => {}
      },
      __nevaDeferredInstallPrompt: stashedPrompt
        ? { prompt: async () => {}, userChoice: Promise.resolve({ outcome: "accepted" }) }
        : null,
      __nevaAppInstalled: false
    });
  };

  const renderTitle = (): string =>
    renderToString(
      React.createElement(StartScreen, {
        startup: {
          ...createStartupState(12),
          status: "title",
          saveStatus: "empty"
        },
        onStart: () => {},
        onStartNewGame: () => {},
        onStartWithoutSaving: () => {},
        onRetry: () => {},
        graphicsQuality: "high",
        effectiveGraphicsQuality: "high",
        onGraphicsQualityChange: () => {}
      })
    );

  it("offers a manual Install app utility when the browser prompt is stashed", () => {
    stubWindow(true);
    const html = renderTitle();

    expect(html).toContain('data-testid="startup-pwa-install-button"');
    expect(html).toContain("Install app");
  });

  it("hides the Install app utility without a native browser prompt", () => {
    stubWindow(false);
    expect(renderTitle()).not.toContain('data-testid="startup-pwa-install-button"');
  });

  it("keeps the utility hidden once the player dismissed the invitation", () => {
    stubWindow(true, Date.now() + 60_000);
    expect(renderTitle()).not.toContain('data-testid="startup-pwa-install-button"');
  });
});
