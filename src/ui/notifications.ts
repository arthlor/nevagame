export type NoticeTone = "info" | "success" | "warning" | "danger" | "reward";

/**
 * Which strand of the coastal life a notice belongs to. The Chronicle filters
 * on this rather than on the notice text, so a reworded message never silently
 * drops out of its tab.
 */
export type NoticeCategory = "trade" | "field" | "story" | "general";

export interface NoticeDelta {
  readonly kind: "item" | "labor" | "money";
  readonly amount: number; // positive = gain (+), negative = loss (-)
  readonly label: string;
  readonly itemId?: string;
  readonly icon?: string;
}

export interface Notice {
  readonly id: number;
  readonly text: string;
  readonly tone: NoticeTone;
  readonly key?: string;
  readonly count: number;
  readonly createdMs: number;
  readonly expiresMs: number;
  readonly delta?: NoticeDelta;
  readonly category: NoticeCategory;
}

export interface NoticeOptions {
  tone?: NoticeTone;
  durationMs?: number;
  key?: string;
  delta?: NoticeDelta;
  /** Overrides the category derived from the delta. */
  category?: NoticeCategory;
}

/**
 * Money moves are trade; goods and labour are the working day. Anything without
 * a structured delta is left general rather than guessed at from its wording.
 */
export function deriveNoticeCategory(delta: NoticeDelta | undefined): NoticeCategory {
  if (!delta) return "general";
  if (delta.kind === "money") return "trade";
  return "field";
}

export const NOTICE_DEFAULT_DURATION_MS = 2500;

export const NOTICE_MAX_VISIBLE = 3;

/** Fade-out lead-out applied via `.is-exiting` before a notice leaves the DOM. */
export const NOTICE_EXIT_MS = 200;

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
          expiresMs: nowMs + durationMs,
          category: options.category ?? this.entries[index].category
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
      expiresMs: nowMs + durationMs,
      delta: options.delta,
      category: options.category ?? deriveNoticeCategory(options.delta)
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


/** Filter tabs offered by the Coastal Chronicle. */
export const CHRONICLE_FILTERS = ["all", "trade", "field", "story"] as const;
export type ChronicleFilter = (typeof CHRONICLE_FILTERS)[number];

export const CHRONICLE_FILTER_LABEL: Record<ChronicleFilter, string> = {
  all: "All",
  trade: "Trade",
  field: "Field & Water",
  story: "Story"
};

export interface ChronicleEntry {
  readonly id: number;
  readonly text: string;
  readonly tone: NoticeTone;
  readonly category: NoticeCategory;
  /** Game-clock minute the entry was logged at, for a readable in-world time. */
  readonly gameMinute: number;
  readonly count: number;
}

/** How much of the day's log the Chronicle keeps in memory. */
export const CHRONICLE_MAX_ENTRIES = 50;

/**
 * A retained view of the notice stream. Notices themselves expire so the toast
 * stack stays quiet, but the Chronicle is the log you scroll back through, so
 * it keeps entries until it runs out of room. It is session memory only: the
 * save file is not involved.
 */
export class ChronicleLog {
  private entries: ChronicleEntry[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries: number = CHRONICLE_MAX_ENTRIES) {
    this.maxEntries = Math.max(1, maxEntries);
  }

  /**
   * Whether a notice describes something that happened to the world, as opposed
   * to guidance about the player's last input. "Move closer to plant here" and
   * "Planting cancelled" are answers to a click, not events worth a line in the
   * day's log. A real event either moves goods, labour or money (it carries a
   * delta) or was explicitly filed under a strand by the caller.
   */
  public static isWorthLogging(notice: Notice): boolean {
    return Boolean(notice.delta) || notice.category !== "general";
  }

  public record(notice: Notice, gameMinute: number): void {
    if (!ChronicleLog.isWorthLogging(notice)) return;
    const newest = this.entries.at(-1);
    // A notice that coalesced in the queue must not become two log lines.
    if (newest && newest.id === notice.id) {
      this.entries[this.entries.length - 1] = {
        ...newest,
        text: notice.text,
        count: notice.count,
        tone: notice.tone
      };
      return;
    }
    this.entries.push({
      id: notice.id,
      text: notice.text,
      tone: notice.tone,
      category: notice.category,
      gameMinute,
      count: notice.count
    });
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(this.entries.length - this.maxEntries);
    }
  }

  /** Newest first, optionally narrowed to one strand. */
  public list(filter: ChronicleFilter = "all"): readonly ChronicleEntry[] {
    const ordered = [...this.entries].reverse();
    return filter === "all" ? ordered : ordered.filter((entry) => entry.category === filter);
  }

  public get size(): number {
    return this.entries.length;
  }

  public clear(): void {
    this.entries = [];
  }
}
