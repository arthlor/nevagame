export type NoticeTone = "info" | "success" | "warning" | "danger" | "reward";

export interface Notice {
  readonly id: number;
  readonly text: string;
  readonly tone: NoticeTone;
  readonly key?: string;
  readonly count: number;
  readonly createdMs: number;
  readonly expiresMs: number;
}

export interface NoticeOptions {
  tone?: NoticeTone;
  durationMs?: number;
  key?: string;
}

export const NOTICE_DEFAULT_DURATION_MS = 2500;

export const NOTICE_MAX_VISIBLE = 2;

export const NOTICE_TONE_PRIORITY: Record<NoticeTone, number> = {
  danger: 0,
  warning: 1,
  reward: 2,
  success: 3,
  info: 4
};

const TONE_DURATION_FLOOR_MS: Record<NoticeTone, number> = {
  info: 1200,
  success: 1600,
  warning: 2400,
  danger: 3000,
  reward: 2400
};

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
      this.entries = this.entries
        .sort((a, b) => NOTICE_TONE_PRIORITY[a.tone] - NOTICE_TONE_PRIORITY[b.tone] || b.createdMs - a.createdMs)
        .slice(0, this.maxVisible)
        .sort((a, b) => a.createdMs - b.createdMs);
    }
    return notice;
  }

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
