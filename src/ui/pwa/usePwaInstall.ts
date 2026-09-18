import { useEffect, useState, useCallback } from "react";

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

declare global {
  interface Window {
    __nevaDeferredInstallPrompt?: BeforeInstallPromptEvent | null;
    __nevaAppInstalled?: boolean;
  }
}

export type PwaPlatform = "chrome-android" | "ios-chrome" | "ios-safari" | "desktop" | "other-mobile";

const SNOOZE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DISMISSED_KEY = "neva_pwa_dismissed_until";
const INSTALLED_KEY = "neva_pwa_installed";

export function checkIsStandalone(
  win?: {
    matchMedia?: (query: string) => { matches: boolean } | MediaQueryList;
    navigator?: { standalone?: boolean };
  } | Window | null
): boolean {
  const targetWin = win !== undefined ? win : (typeof window !== "undefined" ? window : null);
  if (!targetWin) return false;
  try {
    const isStandaloneDisplay = Boolean(targetWin.matchMedia?.("(display-mode: standalone)")?.matches);
    const isNavigatorStandalone = Boolean((targetWin.navigator as { standalone?: boolean } | undefined)?.standalone);
    const isAndroidAppReferrer = Boolean(typeof document !== "undefined" && document.referrer?.includes("android-app://"));
    return isStandaloneDisplay || isNavigatorStandalone || isAndroidAppReferrer;
  } catch {
    return false;
  }
}

export function detectPwaPlatform(ua?: string, navPlatform?: string, maxTouchPoints?: number): PwaPlatform {
  const userAgent = ua ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  const platform = navPlatform ?? (typeof navigator !== "undefined" ? navigator.platform : "");
  const touchPoints = maxTouchPoints ?? (typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0);

  const isIOS = /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && touchPoints > 1);
  const isAndroid = /Android/i.test(userAgent);
  const isChrome = /Chrome|CriOS/i.test(userAgent);

  if (isAndroid && isChrome) return "chrome-android";
  if (isIOS && isChrome) return "ios-chrome";
  if (isIOS) return "ios-safari";
  if (isAndroid) return "other-mobile";
  return "desktop";
}

export function isDismissedRecently(storage?: Storage): boolean {
  try {
    const store = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    if (!store) return false;
    const raw = store.getItem(DISMISSED_KEY);
    if (!raw) return false;
    const until = Number.parseInt(raw, 10);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

export function setDismissedSnooze(durationMs: number = SNOOZE_DURATION_MS, storage?: Storage): void {
  try {
    const store = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    if (!store) return;
    store.setItem(DISMISSED_KEY, String(Date.now() + durationMs));
  } catch {
    // Ignore storage errors
  }
}

export function setInstalledFlag(storage?: Storage): void {
  try {
    const store = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    if (!store) return;
    store.setItem(INSTALLED_KEY, "true");
  } catch {
    // Ignore storage errors
  }
}

export function isInstalledFlagSet(storage?: Storage): boolean {
  try {
    const store = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    if (!store) return false;
    return store.getItem(INSTALLED_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Reads the `beforeinstallprompt` event stashed by the inline boot script in
 * index.html. Chrome can fire the event before React mounts, so the hook must
 * pick the captured event up instead of only listening for a new one.
 */
export function readStashedInstallPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === "undefined") return null;
  return window.__nevaDeferredInstallPrompt ?? null;
}

export interface UsePwaInstallResult {
  isStandalone: boolean;
  isInstalled: boolean;
  canPromptDirectly: boolean;
  platform: PwaPlatform;
  isDismissed: boolean;
  promptInstall: () => Promise<"accepted" | "dismissed" | "unsupported">;
  dismiss: (permanent?: boolean) => void;
  clearDismissal: () => void;
}

export function usePwaInstall(): UsePwaInstallResult {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => readStashedInstallPrompt()
  );
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => isInstalledFlagSet());
  const [isDismissed, setIsDismissed] = useState<boolean>(() => isDismissedRecently());
  const [platform, setPlatform] = useState<PwaPlatform>("desktop");

  useEffect(() => {
    const installed = isInstalledFlagSet() || window.__nevaAppInstalled === true;
    setIsStandalone(checkIsStandalone() || installed);
    setIsInstalled(installed);
    setIsDismissed(isDismissedRecently());
    setPlatform(detectPwaPlatform());
    setDeferredPrompt(readStashedInstallPrompt());

    const handleBeforeInstallPrompt = (e: Event) => {
      // Chrome/Edge/Android fires this event
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstalledFlag();
      setIsInstalled(true);
      setIsStandalone(true);
      setDeferredPrompt(null);
    };

    const handleStashedPrompt = () => {
      setDeferredPrompt(readStashedInstallPrompt());
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    // The inline capture script in index.html dispatches these after stashing,
    // covering events that arrive before this hook mounts.
    window.addEventListener("neva:installprompt", handleStashedPrompt);
    window.addEventListener("neva:appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.removeEventListener("neva:installprompt", handleStashedPrompt);
      window.removeEventListener("neva:appinstalled", handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<"accepted" | "dismissed" | "unsupported"> => {
    if (!deferredPrompt) {
      return "unsupported";
    }

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setInstalledFlag();
        setIsInstalled(true);
        setIsStandalone(true);
      }
      window.__nevaDeferredInstallPrompt = null;
      setDeferredPrompt(null);
      return choice.outcome;
    } catch {
      return "unsupported";
    }
  }, [deferredPrompt]);

  const dismiss = useCallback((permanent: boolean = false) => {
    const duration = permanent ? 365 * 24 * 60 * 60 * 1000 : SNOOZE_DURATION_MS;
    setDismissedSnooze(duration);
    setIsDismissed(true);
  }, []);

  const clearDismissal = useCallback(() => {
    try {
      window.localStorage.removeItem(DISMISSED_KEY);
      setIsDismissed(false);
    } catch {
      // Ignore
    }
  }, []);

  return {
    isStandalone,
    isInstalled,
    canPromptDirectly: Boolean(deferredPrompt),
    platform,
    isDismissed,
    promptInstall,
    dismiss,
    clearDismissal
  };
}
