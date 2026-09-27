// src/i18n/localeStore.ts

import { SUPPORTED_LOCALES, type SupportedLocale } from "./types";

const STORAGE_KEY = "neva.locale";

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function detectBrowserLocale(): SupportedLocale {
  if (typeof navigator !== "undefined" && typeof navigator.language === "string") {
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith("tr")) {
      return "tr";
    }
  }
  return "en";
}

type Listener = (locale: SupportedLocale) => void;

class LocaleController {
  private locale: SupportedLocale = "en";
  private readonly listeners = new Set<Listener>();
  private started = false;

  public start(): void {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    this.locale = this.readStoredLocale();
    this.apply();
  }

  public get current(): SupportedLocale {
    if (!this.started && typeof window !== "undefined") {
      this.locale = this.readStoredLocale();
      this.started = true;
      this.apply();
    }
    return this.locale;
  }

  public set(locale: SupportedLocale): void {
    if (this.locale === locale) return;
    this.locale = locale;
    try {
      window.localStorage?.setItem(STORAGE_KEY, locale);
    } catch {
      // Storage unavailable or blocked; in-memory state persists for the session.
    }
    this.apply();
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }

  private readStoredLocale(): SupportedLocale {
    try {
      const stored = window.localStorage?.getItem(STORAGE_KEY);
      if (isSupportedLocale(stored)) {
        return stored;
      }
    } catch {
      // Fall through to browser detection.
    }
    return detectBrowserLocale();
  }

  private apply(): void {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("lang", this.locale);
    }
    for (const listener of this.listeners) {
      listener(this.locale);
    }
  }
}

export const localeStore = new LocaleController();
