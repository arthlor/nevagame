export interface AudioSettings {
  master: number;
  sfx: number;
  ambience: number;
  masterMuted: boolean;
  sfxMuted: boolean;
  ambienceMuted: boolean;
}

const STORAGE_KEY = "neva.audio.v1";
const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  master: 0.8,
  sfx: 0.8,
  ambience: 0.62,
  masterMuted: false,
  sfxMuted: false,
  ambienceMuted: false
};

const clampLevel = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;

const parseSettings = (value: unknown): AudioSettings => {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
  const candidate = value as Partial<AudioSettings>;
  return {
    master: clampLevel(candidate.master, DEFAULT_AUDIO_SETTINGS.master),
    sfx: clampLevel(candidate.sfx, DEFAULT_AUDIO_SETTINGS.sfx),
    ambience: clampLevel(candidate.ambience, DEFAULT_AUDIO_SETTINGS.ambience),
    masterMuted: candidate.masterMuted === true,
    sfxMuted: candidate.sfxMuted === true,
    ambienceMuted: candidate.ambienceMuted === true
  };
};

const readStoredSettings = (): AudioSettings => {
  if (typeof window === "undefined") {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? parseSettings(JSON.parse(stored) as unknown) : { ...DEFAULT_AUDIO_SETTINGS };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
};

type AudioSettingsListener = (settings: Readonly<AudioSettings>) => void;

class AudioSettingsStore {
  private settings = readStoredSettings();
  private readonly listeners = new Set<AudioSettingsListener>();

  get(): Readonly<AudioSettings> {
    return this.settings;
  }

  set(patch: Partial<AudioSettings>): Readonly<AudioSettings> {
    this.settings = parseSettings({ ...this.settings, ...patch });
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
      } catch {
        // Audio preferences are optional presentation state; storage failures do not affect play.
      }
    }
    for (const listener of this.listeners) {
      listener(this.settings);
    }
    return this.settings;
  }

  subscribe(listener: AudioSettingsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const audioSettings = new AudioSettingsStore();

