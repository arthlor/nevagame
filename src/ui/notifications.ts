// src/ui/notifications.ts

/**
 * Tone drives colour, icon, and the audio cue a notice plays. Failures used to
 * be indistinguishable from successes because every message went through one
 * overwritten toast slot, so the tone is part of the contract rather than a
 * styling afterthought.
 */
export type NoticeTone = "info" | "success" | "warning" | "danger" | "reward";

export interface Notice {
  readonly id: number;
  readonly text: string;
  readonly tone: NoticeTone;
  /** Groups successive updates of one ongoing event into a single entry. */
  readonly key?: string;
  /** Repeat count for coalesced identical messages. Rendered as "xN". */
  readonly count: number;
  readonly createdMs: number;
  readonly expiresMs: number;
}

export interface NoticeOptions {
  tone?: NoticeTone;
  durationMs?: number;
  /**
   * When set, a later notice with the same key rewrites the existing entry in
   * place instead of stacking. Used for running totals such as "sell all",
   * which would otherwise emit one line per item.
   */
  key?: string;
}

export const NOTICE_DEFAULT_DURATION_MS = 2500;

/** Beyond this the stack becomes noise rather than feedback. */
export const NOTICE_MAX_VISIBLE = 3;

const TONE_DURATION_FLOOR_MS: Record<NoticeTone, number> = {
  info: 1200,
  success: 1600,
  warning: 2400,
  danger: 3000,
  reward: 2400
};

/**
 * An append-only queue of transient player-facing messages.
 *
 * The previous implementation held a single string plus an expiry, so two
 * events in the same frame silently dropped one of them. This keeps a short
 * ordered stack, coalesces repeats, and expires entries by wall clock so the
 * caller can stay a plain render-every-frame consumer.
 */
export class NoticeQueue {
  private entries: Notice[] = [];
  private nextId = 1;
  private readonly maxVisible: number;

  constructor(maxVisible: number = NOTICE_MAX_VISIBLE) {
    this.maxVisible = Math.max(1, maxVisible);
  }

  public push(text: string, nowMs: number, options: NoticeOptions = {}): Notice | null {
    const trimmed = text?.trim();
    if (!trimmed) return null;

    const tone = options.tone ?? "info";
    const durationMs = Math.max(
      TONE_DURATION_FLOOR_MS[tone],
      options.durationMs ?? NOTICE_DEFAULT_DURATION_MS
    );

    this.prune(nowMs);

    // A keyed update rewrites its own line wherever it sits in the stack.
    if (options.key) {
      const index = this.entries.findIndex((entry) => entry.key === options.key);
      if (index >= 0) {
        const updated: Notice = {
          ...this.entries[index],
          text: trimmed,
          tone,
          expiresMs: nowMs + durationMs
        };
        this.entries[index] = updated;
        return updated;
      }
    }

    // Repeats of the same message read as one event that happened N times,
    // not as N separate lines pushing the rest of the stack off screen.
    const newest = this.entries.at(-1);
    if (!options.key && newest && newest.text === trimmed && newest.tone === tone) {
      const coalesced: Notice = {
        ...newest,
        count: newest.count + 1,
        expiresMs: nowMs + durationMs
      };
      this.entries[this.entries.length - 1] = coalesced;
      return coalesced;
    }

    const notice: Notice = {
      id: this.nextId++,
      text: trimmed,
      tone,
      key: options.key,
      count: 1,
      createdMs: nowMs,
      expiresMs: nowMs + durationMs
    };
    this.entries.push(notice);
    if (this.entries.length > this.maxVisible) {
      this.entries.splice(0, this.entries.length - this.maxVisible);
    }
    return notice;
  }

  /** Oldest first, so the newest notice sits closest to the play area. */
  public list(nowMs: number): Notice[] {
    this.prune(nowMs);
    return this.entries;
  }

  public get latest(): Notice | null {
    return this.entries.at(-1) ?? null;
  }

  public clear(): void {
    this.entries = [];
  }

  private prune(nowMs: number): void {
    if (this.entries.length === 0) return;
    const live = this.entries.filter((entry) => entry.expiresMs > nowMs);
    if (live.length !== this.entries.length) this.entries = live;
  }
}

/**
 * Failure text arrives from simulation results as free-form prose, so the tone
 * is inferred once here instead of at every one of the call sites.
 */
export function inferNoticeTone(text: string, fallback: NoticeTone = "info"): NoticeTone {
  const lowered = text.toLowerCase();
  if (/\b(could not|cannot|can't|failed|not enough|no room|full|too far|blocked|denied|unavailable|first\b)/.test(lowered)) {
    return "danger";
  }
  if (/\b(warning|storm|exhausted|low|careful|slipped|got away|escaped)\b/.test(lowered)) {
    return "warning";
  }
  return fallback;
}
