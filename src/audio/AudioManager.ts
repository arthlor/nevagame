import manifestJson from "../../assets/audio/audio-manifest.json";
import { audioSettings, AudioSettings } from "./AudioSettings";

export type AudioCueId = keyof typeof manifestJson.cues;

interface AudioPosition {
  x: number;
  y: number;
  z: number;
}

interface AudioCueDefinition {
  sourceId: string;
  bus: "sfx" | "ambience";
  offset: number;
  duration: number;
  gain: number;
  spatial: boolean;
  poolSize: number;
  loop?: boolean;
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

const cues = manifestJson.cues as Record<AudioCueId, AudioCueDefinition>;
const sources = new Map(
  (manifestJson.sources as AudioSourceDefinition[]).map((source) => [source.id, source])
);

const setAudioParam = (param: AudioParam, value: number, at: number): void => {
  param.cancelScheduledValues(at);
  param.setTargetAtTime(value, at, 0.025);
};

/**
 * Presentation-only audio. Canonical game state never waits on or reads this service.
 */
export class AudioManager {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private readonly bufferPromises = new Map<string, Promise<AudioBuffer>>();
  private readonly voicePools = new Map<AudioCueId, Voice[]>();
  private readonly ambienceSources = new Map<AudioCueId, AudioBufferSourceNode>();
  private unlockPromise: Promise<void> | null = null;
  private disposed = false;
  private ambienceRequested = true;
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

  startAmbience(): void {
    this.ambienceRequested = true;
    if (!this.context || this.context.state !== "running" || document.visibilityState === "hidden") {
      return;
    }
    for (const cueId of ["ambience-wind", "ambience-insects", "ambience-birds"] as AudioCueId[]) {
      void this.startAmbienceCue(cueId);
    }
  }

  stopAmbience(): void {
    this.ambienceRequested = false;
    for (const source of this.ambienceSources.values()) {
      try {
        source.stop();
      } catch {
        // A source may have already ended while the page was hidden.
      }
    }
    this.ambienceSources.clear();
  }

  setListener(position: AudioPosition, forward: AudioPosition = { x: 0, y: 0, z: -1 }): void {
    if (!this.context) {
      return;
    }
    const listener = this.context.listener;
    const now = this.context.currentTime;
    if (listener.positionX && listener.forwardX) {
      listener.positionX.setValueAtTime(position.x, now);
      listener.positionY.setValueAtTime(position.y, now);
      listener.positionZ.setValueAtTime(position.z, now);
      listener.forwardX.setValueAtTime(forward.x, now);
      listener.forwardY.setValueAtTime(forward.y, now);
      listener.forwardZ.setValueAtTime(forward.z, now);
      listener.upX.setValueAtTime(0, now);
      listener.upY.setValueAtTime(1, now);
      listener.upZ.setValueAtTime(0, now);
    } else {
      // Firefox still exposes the legacy Web Audio spatial-listener API.
      listener.setPosition(position.x, position.y, position.z);
      listener.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.stopAmbience();
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
      if (this.ambienceRequested) {
        this.startAmbience();
      }
    });
  };

  private async createAndResumeContext(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: "interactive" });
      this.masterGain = this.context.createGain();
      this.sfxGain = this.context.createGain();
      this.ambienceGain = this.context.createGain();
      this.sfxGain.connect(this.masterGain);
      this.ambienceGain.connect(this.masterGain);
      this.masterGain.connect(this.context.destination);
      this.applySettings(audioSettings.get());
    }
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
    if (this.ambienceRequested) {
      this.startAmbience();
    }
  }

  private applySettings(settings: Readonly<AudioSettings>): void {
    if (!this.context || !this.masterGain || !this.sfxGain || !this.ambienceGain) {
      return;
    }
    const now = this.context.currentTime;
    setAudioParam(this.masterGain.gain, settings.masterMuted ? 0 : settings.master, now);
    setAudioParam(this.sfxGain.gain, settings.sfxMuted ? 0 : settings.sfx, now);
    setAudioParam(this.ambienceGain.gain, settings.ambienceMuted ? 0 : settings.ambience, now);
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

  private async playOneShotReady(cueId: AudioCueId, position?: AudioPosition): Promise<void> {
    const context = this.context;
    const cue = cues[cueId];
    if (!context || context.state !== "running" || !cue || cue.loop) {
      return;
    }
    try {
      const buffer = await this.loadBuffer(cue.sourceId);
      if (this.disposed || context.state !== "running") {
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
      source.playbackRate.value = 0.97 + ((voice.startedAt * 997) % 0.06);
      voice.source = source;
      voice.startedAt = context.currentTime;
      voice.gain.gain.setValueAtTime(cue.gain, context.currentTime);
      if (voice.panner && position) {
        if (voice.panner.positionX) {
          voice.panner.positionX.setValueAtTime(position.x, context.currentTime);
          voice.panner.positionY.setValueAtTime(position.y, context.currentTime);
          voice.panner.positionZ.setValueAtTime(position.z, context.currentTime);
        } else {
          voice.panner.setPosition(position.x, position.y, position.z);
        }
      }
      source.connect(voice.gain);
      source.onended = () => {
        source.disconnect();
        if (voice.source === source) {
          voice.source = null;
        }
      };
      const safeDuration = Math.max(0.01, Math.min(cue.duration, buffer.duration - cue.offset));
      source.start(0, cue.offset, safeDuration);
    } catch (error) {
      console.warn(`Audio cue '${cueId}' could not be played.`, error);
    }
  }

  private acquireVoice(cueId: AudioCueId, cue: AudioCueDefinition): Voice {
    const context = this.context;
    const bus = cue.bus === "ambience" ? this.ambienceGain : this.sfxGain;
    if (!context || !bus) {
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
        panner.connect(bus);
      } else {
        gain.connect(bus);
      }
      const voice: Voice = { source: null, gain, panner, startedAt: -Infinity };
      pool.push(voice);
      return voice;
    }
    return pool.reduce((oldest, voice) => voice.startedAt < oldest.startedAt ? voice : oldest);
  }

  private async startAmbienceCue(cueId: AudioCueId): Promise<void> {
    const context = this.context;
    const cue = cues[cueId];
    if (!context || !this.ambienceGain || !this.ambienceRequested || this.ambienceSources.has(cueId) || !cue.loop) {
      return;
    }
    try {
      const buffer = await this.loadBuffer(cue.sourceId);
      if (!this.ambienceRequested || context.state !== "running" || this.ambienceSources.has(cueId)) {
        return;
      }
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = cue.offset;
      source.loopEnd = Math.min(buffer.duration, cue.offset + cue.duration);
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(cue.gain, context.currentTime + 1.2);
      source.connect(gain);
      gain.connect(this.ambienceGain);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        if (this.ambienceSources.get(cueId) === source) {
          this.ambienceSources.delete(cueId);
        }
      };
      this.ambienceSources.set(cueId, source);
      source.start(0, cue.offset);
    } catch (error) {
      console.warn(`Ambience cue '${cueId}' could not be started.`, error);
    }
  }
}

export const gameAudio = new AudioManager();
