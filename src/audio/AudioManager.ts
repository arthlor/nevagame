import manifestJson from "../../assets/audio/audio-manifest.json";
import { audioSettings, AudioSettings } from "./AudioSettings";
import { computePlaybackRate, finiteAudioValue, setAudioParam, setAudioParamNow } from "./audioParams";

export type AudioCueId = keyof typeof manifestJson.cues;
export type AudioBankId = string;
export type AudioBedId = "farm" | "village" | "coast" | "water" | "interior";

interface AudioPosition {
  x: number;
  y: number;
  z: number;
}

type AudioBusId = "sfx" | "ambience" | "ui" | "weather" | "boat" | "fishing" | "music";

interface AudioCueDefinition {
  sourceId: string;
  bus: AudioBusId;
  offset: number;
  duration: number;
  gain: number;
  spatial: boolean;
  poolSize: number;
  loop?: boolean;
  pitchMin?: number;
  pitchMax?: number;
}

interface AudioSourceDefinition {
  id: string;
  runtimeUrl: string;
}

interface Voice {
  source: AudioBufferSourceNode | null;
  gain: GainNode;
  panner: PannerNode | null;
  startedAt: number;
}

interface LoopVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  panner: PannerNode | null;
}

const cues = manifestJson.cues as Record<AudioCueId, AudioCueDefinition>;
const banks = ((manifestJson as { banks?: Record<string, AudioCueId[]> }).banks ?? {}) as Record<string, AudioCueId[]>;
const beds = ((manifestJson as { beds?: Record<AudioBedId, AudioCueId[]> }).beds ?? {
  farm: ["ambience-wind", "ambience-insects", "ambience-birds"],
  village: ["ambience-wind", "ambience-birds"],
  coast: ["ambience-wind"],
  water: ["ambience-wind"],
  interior: ["ambience-wind"]
}) as Record<AudioBedId, AudioCueId[]>;
const weatherLoops = ((manifestJson as { weatherLoops?: Record<string, AudioCueId[]> }).weatherLoops ?? {}) as Record<string, AudioCueId[]>;
const hasCue = (cueId: string): cueId is AudioCueId => cueId in cues;
const sources = new Map(
  (manifestJson.sources as AudioSourceDefinition[]).map((source) => [source.id, source])
);

const finitePosition = (position?: AudioPosition): AudioPosition | undefined => {
  if (!position) {
    return undefined;
  }
  if (![position.x, position.y, position.z].every(Number.isFinite)) {
    return undefined;
  }
  return position;
};

const connectBus = (
  node: AudioNode,
  bus: AudioBusId,
  gains: {
    sfx: GainNode;
    ui: GainNode;
    fishing: GainNode;
    boat: GainNode;
    ambience: GainNode;
    weather: GainNode;
    music: GainNode;
  }
): void => {
  if (bus === "ui") node.connect(gains.ui);
  else if (bus === "fishing") node.connect(gains.fishing);
  else if (bus === "boat") node.connect(gains.boat);
  else if (bus === "weather") node.connect(gains.weather);
  else if (bus === "ambience") node.connect(gains.ambience);
  else if (bus === "music") node.connect(gains.music);
  else node.connect(gains.sfx);
};

/**
 * Presentation-only audio. Canonical game state never waits on or reads this service.
 */
export class AudioManager {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private uiGain: GainNode | null = null;
  private fishingGain: GainNode | null = null;
  private boatGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private weatherGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private readonly bufferPromises = new Map<string, Promise<AudioBuffer>>();
  private readonly voicePools = new Map<AudioCueId, Voice[]>();
  private readonly loops = new Map<AudioCueId, LoopVoice>();
  private readonly actionLoops = new Map<AudioCueId, AudioPosition | true>();
  private readonly bankCursors = new Map<AudioBankId, number>();
  private unlockPromise: Promise<void> | null = null;
  private disposed = false;
  private ambienceRequested = true;
  private variationSeed = 1;
  private bedId: AudioBedId = "farm";
  private weatherId = "clear";
  private lastStormCueAt = 0;
  private readonly unsubscribeSettings: () => void;

  constructor() {
    this.unsubscribeSettings = audioSettings.subscribe((settings) => this.applySettings(settings));
    if (typeof window !== "undefined") {
      window.addEventListener("pointerdown", this.handleFirstInput, { capture: true, once: true });
      window.addEventListener("keydown", this.handleFirstInput, { capture: true, once: true });
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
    }
  }

  unlock(): Promise<void> {
    if (this.disposed || typeof window === "undefined") {
      return Promise.resolve();
    }
    if (this.unlockPromise) {
      return this.unlockPromise;
    }
    this.unlockPromise = this.createAndResumeContext().catch((error: unknown) => {
      this.unlockPromise = null;
      console.warn("Audio could not be started.", error);
    });
    return this.unlockPromise;
  }

  playOneShot(cueId: AudioCueId, position?: AudioPosition): void {
    if (this.disposed) {
      return;
    }
    void this.unlock().then(() => this.playOneShotReady(cueId, position));
  }

  playBank(bankId: AudioBankId, position?: AudioPosition): void {
    const variants = banks[bankId];
    if (!variants || variants.length === 0) {
      return;
    }
    const cursor = this.bankCursors.get(bankId) ?? 0;
    this.bankCursors.set(bankId, cursor + 1);
    this.playOneShot(variants[cursor % variants.length], position);
  }

  setWorldContext(bedId: AudioBedId, weatherId: string): void {
    this.bedId = bedId;
    const weatherChanged = weatherId !== this.weatherId;
    this.weatherId = weatherId;
    if (weatherChanged && weatherId === "storm" && hasCue("thunder")) {
      const now = typeof performance !== "undefined" ? performance.now() : 0;
      if (now - this.lastStormCueAt > 8000) {
        this.lastStormCueAt = now;
        this.playOneShot("thunder");
      }
    }
    if (this.ambienceRequested) {
      this.syncBeds();
    }
  }

  setActionLoop(cueId: AudioCueId, enabled: boolean, position?: AudioPosition): void {
    if (enabled) {
      this.actionLoops.set(cueId, finitePosition(position) ?? true);
    } else {
      this.actionLoops.delete(cueId);
    }
    if (!this.context || this.context.state !== "running") {
      return;
    }
    if (enabled) {
      void this.startLoopCue(cueId, finitePosition(position));
      return;
    }
    this.stopLoopCue(cueId);
  }

  startAmbience(): void {
    this.ambienceRequested = true;
    this.syncBeds();
  }

  /** Loop the project theme on the music bus; survives bed/weather swaps. */
  private startTheme(): void {
    if (!hasCue("theme")) {
      return;
    }
    void this.startLoopCue("theme");
  }

  stopAmbience(): void {
    this.ambienceRequested = false;
    for (const cueId of [...this.loops.keys()]) {
      if (this.actionLoops.has(cueId) || cues[cueId]?.bus === "music") {
        continue;
      }
      this.stopLoopCue(cueId);
    }
  }

  setListener(position: AudioPosition, forward: AudioPosition = { x: 0, y: 0, z: -1 }): void {
    if (!this.context) {
      return;
    }
    const resolvedPosition = finitePosition(position);
    const resolvedForward = finitePosition(forward) ?? { x: 0, y: 0, z: -1 };
    if (!resolvedPosition) {
      return;
    }
    const listener = this.context.listener;
    const now = this.context.currentTime;
    if (!Number.isFinite(now)) {
      return;
    }
    if (listener.positionX && listener.forwardX) {
      setAudioParamNow(listener.positionX, resolvedPosition.x, now, 0);
      setAudioParamNow(listener.positionY, resolvedPosition.y, now, 0);
      setAudioParamNow(listener.positionZ, resolvedPosition.z, now, 0);
      setAudioParamNow(listener.forwardX, resolvedForward.x, now, 0);
      setAudioParamNow(listener.forwardY, resolvedForward.y, now, 0);
      setAudioParamNow(listener.forwardZ, resolvedForward.z, now, -1);
      setAudioParamNow(listener.upX, 0, now, 0);
      setAudioParamNow(listener.upY, 1, now, 1);
      setAudioParamNow(listener.upZ, 0, now, 0);
    } else {
      listener.setPosition(resolvedPosition.x, resolvedPosition.y, resolvedPosition.z);
      listener.setOrientation(resolvedForward.x, resolvedForward.y, resolvedForward.z, 0, 1, 0);
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.stopAmbience();
    for (const cueId of [...this.actionLoops.keys()]) {
      this.stopLoopCue(cueId);
    }
    this.actionLoops.clear();
    this.unsubscribeSettings();
    if (typeof window !== "undefined") {
      window.removeEventListener("pointerdown", this.handleFirstInput, true);
      window.removeEventListener("keydown", this.handleFirstInput, true);
      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    }
    void this.context?.close();
    this.context = null;
  }

  private readonly handleFirstInput = (): void => {
    void this.unlock();
  };

  private readonly handleVisibilityChange = (): void => {
    if (!this.context) {
      return;
    }
    if (document.visibilityState === "hidden") {
      void this.context.suspend();
      return;
    }
    void this.context.resume().then(() => {
      this.startTheme();
      if (this.ambienceRequested) {
        this.startAmbience();
      }
      for (const [cueId, position] of this.actionLoops) {
        void this.startLoopCue(cueId, position === true ? undefined : position);
      }
    });
  };

  private async createAndResumeContext(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: "interactive" });
      this.masterGain = this.context.createGain();
      this.sfxGain = this.context.createGain();
      this.uiGain = this.context.createGain();
      this.fishingGain = this.context.createGain();
      this.boatGain = this.context.createGain();
      this.ambienceGain = this.context.createGain();
      this.weatherGain = this.context.createGain();
      this.musicGain = this.context.createGain();
      this.uiGain.connect(this.sfxGain);
      this.fishingGain.connect(this.sfxGain);
      this.boatGain.connect(this.sfxGain);
      this.weatherGain.connect(this.ambienceGain);
      this.sfxGain.connect(this.masterGain);
      this.ambienceGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.masterGain.connect(this.context.destination);
      this.uiGain.gain.value = 0.9;
      this.fishingGain.gain.value = 1;
      this.boatGain.gain.value = 1;
      this.weatherGain.gain.value = 1;
      this.musicGain.gain.value = 1;
      this.applySettings(audioSettings.get());
    }
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
    this.startTheme();
    if (this.ambienceRequested) {
      this.startAmbience();
    }
  }

  private applySettings(settings: Readonly<AudioSettings>): void {
    if (!this.context || !this.masterGain || !this.sfxGain || !this.ambienceGain || !this.musicGain) {
      return;
    }
    const now = this.context.currentTime;
    setAudioParam(this.masterGain.gain, settings.masterMuted ? 0 : settings.master, now);
    setAudioParam(this.sfxGain.gain, settings.sfxMuted ? 0 : settings.sfx, now);
    setAudioParam(this.ambienceGain.gain, settings.ambienceMuted ? 0 : settings.ambience, now);
    setAudioParam(this.musicGain.gain, settings.musicMuted ? 0 : settings.music, now);
  }

  private busGains(): {
    sfx: GainNode;
    ui: GainNode;
    fishing: GainNode;
    boat: GainNode;
    ambience: GainNode;
    weather: GainNode;
    music: GainNode;
  } | null {
    if (
      !this.sfxGain
      || !this.uiGain
      || !this.fishingGain
      || !this.boatGain
      || !this.ambienceGain
      || !this.weatherGain
      || !this.musicGain
    ) {
      return null;
    }
    return {
      sfx: this.sfxGain,
      ui: this.uiGain,
      fishing: this.fishingGain,
      boat: this.boatGain,
      ambience: this.ambienceGain,
      weather: this.weatherGain,
      music: this.musicGain
    };
  }

  private loadBuffer(sourceId: string): Promise<AudioBuffer> {
    const existing = this.bufferPromises.get(sourceId);
    if (existing) {
      return existing;
    }
    const context = this.context;
    const source = sources.get(sourceId);
    if (!context || !source) {
      return Promise.reject(new Error(`Unknown or unavailable audio source: ${sourceId}`));
    }
    const loading = fetch(source.runtimeUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Audio request failed (${response.status}): ${source.runtimeUrl}`);
        }
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data));
    this.bufferPromises.set(sourceId, loading);
    loading.catch(() => this.bufferPromises.delete(sourceId));
    return loading;
  }

  private desiredBedCues(): AudioCueId[] {
    const region = beds[this.bedId] ?? beds.farm;
    const weather = weatherLoops[this.weatherId] ?? [];
    return [...new Set([...region, ...weather])];
  }

  private syncBeds(): void {
    if (!this.context || this.context.state !== "running" || document.visibilityState === "hidden") {
      return;
    }
    const desired = new Set(this.desiredBedCues());
    for (const cueId of [...this.loops.keys()]) {
      if (this.actionLoops.has(cueId) || desired.has(cueId) || cues[cueId]?.bus === "music") {
        continue;
      }
      this.stopLoopCue(cueId);
    }
    for (const cueId of desired) {
      void this.startLoopCue(cueId);
    }
  }

  private applyPannerPosition(panner: PannerNode, position: AudioPosition, at: number): void {
    if (panner.positionX) {
      setAudioParamNow(panner.positionX, position.x, at, 0);
      setAudioParamNow(panner.positionY, position.y, at, 0);
      setAudioParamNow(panner.positionZ, position.z, at, 0);
    } else {
      panner.setPosition(position.x, position.y, position.z);
    }
  }

  private async playOneShotReady(cueId: AudioCueId, position?: AudioPosition): Promise<void> {
    const context = this.context;
    const cue = cues[cueId];
    if (!context || context.state !== "running" || !cue || cue.loop) {
      return;
    }
    try {
      const buffer = await this.loadBuffer(cue.sourceId);
      if (this.disposed || context.state !== "running" || !Number.isFinite(context.currentTime)) {
        return;
      }
      const voice = this.acquireVoice(cueId, cue);
      if (voice.source) {
        try {
          voice.source.stop();
        } catch {
          // Reusing an already-finished voice is expected.
        }
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = computePlaybackRate(
        this.variationSeed++,
        cue.pitchMin ?? 0.97,
        cue.pitchMax ?? 1.03
      );
      voice.source = source;
      voice.startedAt = finiteAudioValue(context.currentTime, 0);
      setAudioParamNow(voice.gain.gain, cue.gain, context.currentTime, cue.gain);
      const resolved = finitePosition(position);
      if (voice.panner && resolved) {
        this.applyPannerPosition(voice.panner, resolved, context.currentTime);
      }
      source.connect(voice.gain);
      source.onended = () => {
        source.disconnect();
        if (voice.source === source) {
          voice.source = null;
        }
      };
      const safeDuration = Math.max(0.01, Math.min(cue.duration, Math.max(0, buffer.duration - cue.offset)));
      source.start(0, Math.max(0, cue.offset), safeDuration);
    } catch (error) {
      console.warn(`Audio cue '${cueId}' could not be played.`, error);
    }
  }

  private acquireVoice(cueId: AudioCueId, cue: AudioCueDefinition): Voice {
    const context = this.context;
    const gains = this.busGains();
    if (!context || !gains) {
      throw new Error("Audio graph is not ready.");
    }
    let pool = this.voicePools.get(cueId);
    if (!pool) {
      pool = [];
      this.voicePools.set(cueId, pool);
    }
    const idle = pool.find((voice) => voice.source === null);
    if (idle) {
      return idle;
    }
    if (pool.length < cue.poolSize) {
      const gain = context.createGain();
      const panner = cue.spatial ? context.createPanner() : null;
      if (panner) {
        panner.panningModel = "HRTF";
        panner.distanceModel = "inverse";
        panner.refDistance = 2.2;
        panner.maxDistance = 28;
        panner.rolloffFactor = 1.15;
        gain.connect(panner);
        connectBus(panner, cue.bus, gains);
      } else {
        connectBus(gain, cue.bus, gains);
      }
      const voice: Voice = { source: null, gain, panner, startedAt: 0 };
      pool.push(voice);
      return voice;
    }
    return pool.reduce((oldest, voice) => voice.startedAt < oldest.startedAt ? voice : oldest);
  }

  private async startLoopCue(cueId: AudioCueId, position?: AudioPosition): Promise<void> {
    const context = this.context;
    const cue = cues[cueId];
    const gains = this.busGains();
    if (!context || !gains || !cue?.loop) {
      return;
    }
    const existing = this.loops.get(cueId);
    const resolved = finitePosition(position);
    if (existing) {
      if (existing.panner && resolved) {
        this.applyPannerPosition(existing.panner, resolved, context.currentTime);
      }
      return;
    }
    try {
      const buffer = await this.loadBuffer(cue.sourceId);
      if (this.loops.has(cueId) || context.state !== "running") {
        return;
      }
      const isMusic = cue.bus === "music";
      if (!this.ambienceRequested && !this.actionLoops.has(cueId) && !isMusic) {
        return;
      }
      const source = context.createBufferSource();
      const gain = context.createGain();
      const panner = cue.spatial ? context.createPanner() : null;
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = Math.max(0, cue.offset);
      source.loopEnd = Math.min(buffer.duration, cue.offset + cue.duration);
      setAudioParamNow(gain.gain, 0, context.currentTime, 0);
      const fadeSeconds = this.actionLoops.has(cueId) ? 0.12 : isMusic ? 2.6 : 1.2;
      gain.gain.linearRampToValueAtTime(cue.gain, context.currentTime + fadeSeconds);
      source.connect(gain);
      if (panner) {
        panner.panningModel = "HRTF";
        panner.distanceModel = "inverse";
        panner.refDistance = 3.4;
        panner.maxDistance = 42;
        panner.rolloffFactor = 1.05;
        gain.connect(panner);
        connectBus(panner, cue.bus, gains);
        if (resolved) {
          this.applyPannerPosition(panner, resolved, context.currentTime);
        }
      } else {
        connectBus(gain, cue.bus, gains);
      }
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        panner?.disconnect();
        if (this.loops.get(cueId)?.source === source) {
          this.loops.delete(cueId);
        }
      };
      this.loops.set(cueId, { source, gain, panner });
      source.start(0, Math.max(0, cue.offset));
    } catch (error) {
      console.warn(`Ambience cue '${cueId}' could not be started.`, error);
    }
  }

  private stopLoopCue(cueId: AudioCueId): void {
    const voice = this.loops.get(cueId);
    if (!voice || !this.context) {
      return;
    }
    this.loops.delete(cueId);
    try {
      const now = this.context.currentTime;
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.linearRampToValueAtTime(0, now + 0.35);
      voice.source.stop(now + 0.4);
    } catch {
      // A source may have already ended while the page was hidden.
    }
  }
}

export const gameAudio = new AudioManager();
