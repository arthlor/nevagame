// src/simulation/core/GameClock.ts

import { ClockState, SeasonId } from "./types";

export const MINUTES_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;
export const MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR; // 1440
export const DAYS_PER_SEASON = 30;
export const SEASONS: SeasonId[] = ["spring", "summer", "autumn", "winter"];
/** Clock phase windows. Lighting ramps to these same boundaries. */
export const DAWN_START_HOUR = 4;
export const DAY_START_HOUR = 8;
export const DUSK_START_HOUR = 18;
export const NIGHT_START_HOUR = 22;
/** Live/offline cadence: 2.5 real seconds per game minute (~60 real minutes per day). */
export const DEFAULT_MINUTES_PER_REAL_SECOND = 0.4;
export const REST_WAKE_MINUTE_OF_DAY = 8 * MINUTES_PER_HOUR;

export function seasonAtMinute(currentMinute: number): SeasonId {
  const totalDays = Math.floor(Math.max(0, currentMinute) / MINUTES_PER_DAY);
  return SEASONS[Math.floor(totalDays / DAYS_PER_SEASON) % SEASONS.length];
}

export function minutesUntilNextMorning(currentMinute: number): number {
  const minuteOfDay = ((currentMinute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (minuteOfDay < REST_WAKE_MINUTE_OF_DAY) return REST_WAKE_MINUTE_OF_DAY - minuteOfDay;
  return MINUTES_PER_DAY - minuteOfDay + REST_WAKE_MINUTE_OF_DAY;
}

export function formatClockTime(currentMinute: number): string {
  const minuteOfDay = ((currentMinute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hh = String(Math.floor(minuteOfDay / MINUTES_PER_HOUR)).padStart(2, "0");
  const mm = String(minuteOfDay % MINUTES_PER_HOUR).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Compact remaining-wait label for HUD prompts. Exact stored minutes, not a growth estimate. */
export function formatGameDuration(minutes: number): string {
  const total = Math.max(0, Math.ceil(minutes));
  if (total <= 0) return "almost ready";
  const hours = Math.floor(total / MINUTES_PER_HOUR);
  const mins = total % MINUTES_PER_HOUR;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

export class GameClock {
  private state: ClockState;
  private accumulatorSeconds: number = 0;

  constructor(initialState?: Partial<ClockState>) {
    this.state = {
      currentMinute: 8 * MINUTES_PER_HOUR, // Start at 08:00 on Day 1
      minutesPerRealSecond: DEFAULT_MINUTES_PER_REAL_SECOND,
      dayCount: 1,
      season: "spring",
      year: 1,
      timeOfDay: "day",
      isPaused: false,
      ...initialState
    };
    if (
      !Number.isSafeInteger(this.state.currentMinute) ||
      this.state.currentMinute < 0 ||
      !Number.isFinite(this.state.minutesPerRealSecond) ||
      this.state.minutesPerRealSecond < 0
    ) {
      throw new Error("GameClock requires a non-negative integer minute and finite non-negative speed");
    }
    this.recalculateCalendar();
  }

  public getState(): Readonly<ClockState> {
    return this.state;
  }

  public setPaused(paused: boolean): void {
    this.state.isPaused = paused;
  }

  public isPaused(): boolean {
    return this.state.isPaused;
  }

  public setSpeed(minutesPerRealSecond: number): void {
    if (!Number.isFinite(minutesPerRealSecond) || minutesPerRealSecond < 0) return;
    this.state.minutesPerRealSecond = minutesPerRealSecond;
  }

  /** Deterministic development capture setup; gameplay advances time through tick(). */
  public setDebugMinute(currentMinute: number): boolean {
    if (!Number.isSafeInteger(currentMinute) || currentMinute < 0) return false;
    this.state.currentMinute = currentMinute;
    this.accumulatorSeconds = 0;
    this.recalculateCalendar();
    return true;
  }

  /**
   * Advances simulation time with real delta seconds.
   * Returns the integer number of game minutes advanced.
   */
  public tick(realDeltaSeconds: number): number {
    if (!Number.isFinite(realDeltaSeconds) || this.state.isPaused || realDeltaSeconds <= 0) {
      return 0;
    }
    if (this.state.minutesPerRealSecond === 0) {
      return 0;
    }

    this.accumulatorSeconds += realDeltaSeconds;
    const secondsPerGameMinute = 1 / this.state.minutesPerRealSecond;

    let minutesToAdvance = 0;
    while (this.accumulatorSeconds >= secondsPerGameMinute) {
      this.accumulatorSeconds -= secondsPerGameMinute;
      minutesToAdvance += 1;
    }

    if (minutesToAdvance > 0) {
      this.advanceMinutes(minutesToAdvance);
    }

    return minutesToAdvance;
  }

  /**
   * Directly advances the clock by N integer game minutes.
   */
  public advanceMinutes(minutes: number): void {
    if (!Number.isSafeInteger(minutes) || minutes <= 0) return;
    this.state.currentMinute += minutes;
    this.recalculateCalendar();
  }

  private recalculateCalendar(): void {
    const totalMinutes = this.state.currentMinute;
    const totalDays = Math.floor(totalMinutes / MINUTES_PER_DAY);
    this.state.dayCount = totalDays + 1;

    const seasonIndex = Math.floor(totalDays / DAYS_PER_SEASON) % SEASONS.length;
    this.state.season = SEASONS[seasonIndex];
    this.state.year = Math.floor(totalDays / (DAYS_PER_SEASON * SEASONS.length)) + 1;

    const minuteOfDay = totalMinutes % MINUTES_PER_DAY;
    const hourOfDay = Math.floor(minuteOfDay / MINUTES_PER_HOUR);

    if (hourOfDay >= DAWN_START_HOUR && hourOfDay < DAY_START_HOUR) {
      this.state.timeOfDay = "dawn";
    } else if (hourOfDay >= DAY_START_HOUR && hourOfDay < DUSK_START_HOUR) {
      this.state.timeOfDay = "day";
    } else if (hourOfDay >= DUSK_START_HOUR && hourOfDay < NIGHT_START_HOUR) {
      this.state.timeOfDay = "dusk";
    } else {
      this.state.timeOfDay = "night";
    }
  }

  public getMinuteOfDay(): number {
    return this.state.currentMinute % MINUTES_PER_DAY;
  }

  public getHourOfDay(): number {
    return Math.floor(this.getMinuteOfDay() / MINUTES_PER_HOUR);
  }

  public getMinuteOfHour(): number {
    return this.getMinuteOfDay() % MINUTES_PER_HOUR;
  }

  public getDayOfSeason(): number {
    return ((this.state.dayCount - 1) % DAYS_PER_SEASON) + 1;
  }

  public getFormattedTime(): string {
    return formatClockTime(this.state.currentMinute);
  }

  public getFormattedDate(): string {
    const day = this.getDayOfSeason();
    const season = this.state.season.charAt(0).toUpperCase() + this.state.season.slice(1);
    return `Day ${day} of ${season}, Year ${this.state.year}`;
  }
}
