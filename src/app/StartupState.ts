import type { SaveSummary } from "../persistence/IndexedDbSaveRepository";

export type StartupStatus = "title" | "loading" | "error" | "intro" | "revealing" | "ready";

export type StartupPhase = "waiting" | "save" | "layout" | "assets" | "world" | "physics" | "presentation" | "commit" | "complete";
export type StartupSaveStatus = "checking" | "available" | "empty" | "corrupt" | "incompatible" | "unavailable";
export type StartupErrorCode =
  | "save-failed"
  | "asset-loading-stalled"
  | "assets-failed"
  | "world-startup-timeout"
  | "world-failed"
  | "physics-startup-timeout"
  | "physics-failed"
  | "presentation-startup-timeout"
  | "startup-failed";

export interface StartupState {
  status: StartupStatus;
  phase: StartupPhase;
  loadedAssets: number;
  totalAssets: number;
  message: string;
  subMessage?: string;
  errorMessage: string | null;
  errorDetail: string | null;
  errorCode: StartupErrorCode | null;
  errorPhase: StartupPhase | null;
  saveStatus: StartupSaveStatus;
  saveSummary: SaveSummary | null;
  progress?: { kind: "indeterminate" } | { kind: "measured"; completed: number; total: number };
  slow?: boolean;
  /** Which entry the intro belongs to, so its hint can address the player. */
  introKind?: "new" | "continue";
  /** Entry intent is independent of whether reduced motion omits the film. */
  arrivalKind?: "new" | "returning";
  degradedResources?: readonly string[];
  recovery?: "reload" | "save";
}

export const createStartupState = (totalAssets: number): StartupState => ({
  status: "title",
  phase: "waiting",
  loadedAssets: 0,
  totalAssets,
  message: "A quiet coast is waiting.",
  subMessage: "Surveying coastal charts & headlands",
  errorMessage: null,
  errorDetail: null,
  errorCode: null,
  errorPhase: null,
  saveStatus: "checking",
  saveSummary: null
});
