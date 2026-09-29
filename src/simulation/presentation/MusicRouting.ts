import type { WorldMusicCue } from "./WorldAudioPresentation";

/** Presentation-time dwell prevents border crossings from restarting music. */
export class WorldMusicRouting {
  private current: WorldMusicCue = "theme";
  private pending: WorldMusicCue = "theme";
  private pendingSince = 0;
  sample(requested: WorldMusicCue, nowMs: number): WorldMusicCue {
    if (requested === "theme-line-tension" || this.current === "theme-line-tension") {
      this.pending = requested;
      this.pendingSince = nowMs;
      this.current = requested;
      return this.current;
    }
    if (requested !== this.pending) {
      this.pending = requested;
      this.pendingSince = nowMs;
    }
    if (nowMs - this.pendingSince >= 8000) this.current = this.pending;
    return this.current;
  }
}

