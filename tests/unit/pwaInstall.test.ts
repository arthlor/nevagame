import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  checkIsStandalone,
  detectPwaPlatform,
  isDismissedRecently,
  setDismissedSnooze,
  setInstalledFlag
} from "../../src/ui/pwa/usePwaInstall";
import { PwaInstallPromptModal } from "../../src/ui/components/PwaInstallPromptModal";

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
