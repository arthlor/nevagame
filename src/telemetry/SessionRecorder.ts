// src/telemetry/SessionRecorder.ts

import type { DomainEvents } from "../simulation/core/EventBus";

/**
 * Local-only playtest instrumentation.
 *
 * `LLM/03` §32 specifies the balance metrics to capture and the UX failure
 * signals to watch for, but nothing ever captured them, so every balance
 * decision has been a guess.
 *
 * Two rules this module will not break:
 *
 *  1. Nothing leaves the machine. §32's anti-manipulation stance is correct
 *     and is not traded away for analytics. There is no network path here.
 *  2. Both clocks are recorded. The season defect existed because the design
 *     reasoned exclusively in game-minutes and never asked how long anything
 *     took in real time. A metric that cannot answer "how long was the player
 *     actually sitting there" is the metric that let that happen.
 */

/** Bounded so a long session cannot grow memory without limit. */
export const DEFAULT_EVENT_CAPACITY = 2000;

export type TelemetryEventName = keyof DomainEvents;

export interface TelemetryEvent {
  name: TelemetryEventName;
  /** In-game minute the event occurred at. */
  gameMinute: number;
  /** Real milliseconds since the session started. */
  realElapsedMs: number;
  /** Quest in progress when it happened, for funnel attribution. */
  activeQuestId: string | null;
}

/** A first-time milestone: the pair of clocks it took to reach it. */
export interface Milestone {
  gameMinute: number;
  realElapsedMs: number;
}

export interface SessionMetrics {
  /** Real ms elapsed in this session, whether or not anything happened. */
  sessionRealMs: number;
  sessionGameMinutes: number;
  eventCount: number;
  /** True once the ring buffer has begun discarding its oldest events. */
  truncated: boolean;
  milestones: Partial<Record<MilestoneId, Milestone>>;
  /** Gross gold in, from produce sales and fish sales combined. */
  revenue: number;
  /** Revenue per real hour played. 0 before any time has passed. */
  revenuePerRealHour: number;
  /** §32 failure signal: a high escape rate means the fight is miscalibrated. */
  sportFishHooked: number;
  sportFishLanded: number;
  sportFishEscaped: number;
  questsStarted: number;
  questsCompleted: number;
  /**
   * §32: "time from dialogue to next intended action". Median real ms between
   * an NpcTalked and the next event that is not itself dialogue. A rising
   * number means players leave a conversation not knowing what to do.
   */
  medianRealMsFromDialogueToAction: number | null;
}

export const MILESTONE_IDS = [
  "firstCropPlanted",
  "firstHarvest",
  "firstBasicCatch",
  "firstSportLanding",
  "firstSale",
  "firstBoatBoarded",
  "firstContractCompleted",
  "firstSeasonTurn"
] as const;

export type MilestoneId = (typeof MILESTONE_IDS)[number];

/** Events that count as "still in dialogue" for the dialogue-to-action metric. */
const DIALOGUE_EVENTS = new Set<TelemetryEventName>(["NpcTalked", "QuestStarted", "QuestCompleted"]);

export class SessionRecorder {
  private readonly capacity: number;
  private events: TelemetryEvent[] = [];
  private truncated = false;

  private readonly milestones = new Map<MilestoneId, Milestone>();
  private revenue = 0;
  private hooked = 0;
  private landed = 0;
  private escaped = 0;
  private questsStarted = 0;
  private questsCompleted = 0;

  private lastGameMinute = 0;
  private lastRealElapsedMs = 0;
  private pendingDialogueAt: number | null = null;
  private dialogueToActionSamples: number[] = [];

  constructor(capacity: number = DEFAULT_EVENT_CAPACITY) {
    this.capacity = Math.max(1, capacity);
  }

  /**
   * Records one event. `realElapsedMs` is supplied by the caller rather than
   * read from a clock here so this class stays pure and testable.
   */
  public record(
    name: TelemetryEventName,
    gameMinute: number,
    realElapsedMs: number,
    activeQuestId: string | null
  ): void {
    this.events.push({ name, gameMinute, realElapsedMs, activeQuestId });
    if (this.events.length > this.capacity) {
      this.events.shift();
      this.truncated = true;
    }

    this.lastGameMinute = Math.max(this.lastGameMinute, gameMinute);
    this.lastRealElapsedMs = Math.max(this.lastRealElapsedMs, realElapsedMs);

    if (this.pendingDialogueAt !== null && !DIALOGUE_EVENTS.has(name)) {
      this.dialogueToActionSamples.push(Math.max(0, realElapsedMs - this.pendingDialogueAt));
      this.pendingDialogueAt = null;
    }
    if (name === "NpcTalked") this.pendingDialogueAt = realElapsedMs;
  }

  /** Marks a milestone the first time only; later calls are ignored. */
  public markMilestone(id: MilestoneId, gameMinute: number, realElapsedMs: number): void {
    if (this.milestones.has(id)) return;
    this.milestones.set(id, { gameMinute, realElapsedMs });
  }

  public addRevenue(amount: number): void {
    if (Number.isFinite(amount) && amount > 0) this.revenue += amount;
  }

  public countHooked(): void {
    this.hooked += 1;
  }

  public countLanded(): void {
    this.landed += 1;
  }

  public countEscaped(): void {
    this.escaped += 1;
  }

  public countQuestStarted(): void {
    this.questsStarted += 1;
  }

  public countQuestCompleted(): void {
    this.questsCompleted += 1;
  }

  public getEvents(): readonly TelemetryEvent[] {
    return this.events;
  }

  /**
   * `nowRealElapsedMs` is the caller's current elapsed time. Without it,
   * session length would be "time of the last recorded event", which reads 0
   * for a player who has done nothing — inverting the single most useful
   * failure signal there is. A confused player standing still must show a
   * LARGE session time with no milestones, not a small one.
   */
  public getMetrics(nowRealElapsedMs?: number): SessionMetrics {
    const sessionRealMs = Math.max(this.lastRealElapsedMs, nowRealElapsedMs ?? 0);
    const realHours = sessionRealMs / 3_600_000;
    return {
      sessionRealMs,
      sessionGameMinutes: this.lastGameMinute,
      eventCount: this.events.length,
      truncated: this.truncated,
      milestones: Object.fromEntries(this.milestones) as Partial<Record<MilestoneId, Milestone>>,
      revenue: this.revenue,
      revenuePerRealHour: realHours > 0 ? this.revenue / realHours : 0,
      sportFishHooked: this.hooked,
      sportFishLanded: this.landed,
      sportFishEscaped: this.escaped,
      questsStarted: this.questsStarted,
      questsCompleted: this.questsCompleted,
      medianRealMsFromDialogueToAction: median(this.dialogueToActionSamples)
    };
  }

  public reset(): void {
    this.events = [];
    this.truncated = false;
    this.milestones.clear();
    this.revenue = 0;
    this.hooked = 0;
    this.landed = 0;
    this.escaped = 0;
    this.questsStarted = 0;
    this.questsCompleted = 0;
    this.lastGameMinute = 0;
    this.lastRealElapsedMs = 0;
    this.pendingDialogueAt = null;
    this.dialogueToActionSamples = [];
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}
