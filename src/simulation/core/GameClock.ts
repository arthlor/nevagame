// src/simulation/core/GameClock.ts

import { ClockState, SeasonId } from "./types";

export const MINUTES_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;
export const MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR; // 1440
export const DAYS_PER_SEASON = 30;
export const SEASONS: SeasonId[] = ["spring", "summer", "autumn", "winter"];

export function seasonAtMinute(currentMinute: number): SeasonId {
  const totalDays = Math.floor(Math.max(0, currentMinute) / MINUTES_PER_DAY);
  const seasonIndex = Math.floor(totalDays / DAYS_PER_SEASON) % SEASONS.length;
  return SEASONS[seasonIndex];
}

export class GameClock {
  private state: ClockState;
  private accumulatorSeconds: number = 0;

  constructor(initialState?: Partial<ClockState>) {
    this.state = {
      currentMinute: 8 * MINUTES_PER_HOUR, // Start at 08:00 on Day 1
      minutesPerRealSecond: 1, // 1 real second = 1 game minute (24 min = 1 day)
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

    if (hourOfDay >= 4 && hourOfDay < 8) {
      this.state.timeOfDay = "dawn";
    } else if (hourOfDay >= 8 && hourOfDay < 18) {
      this.state.timeOfDay = "day";
    } else if (hourOfDay >= 18 && hourOfDay < 22) {
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
    const hh = String(this.getHourOfDay()).padStart(2, "0");
    const mm = String(this.getMinuteOfHour()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  public getFormattedDate(): string {
    const day = this.getDayOfSeason();
    const season = this.state.season.charAt(0).toUpperCase() + this.state.season.slice(1);
    return `Day ${day} of ${season}, Year ${this.state.year}`;
  }
}
