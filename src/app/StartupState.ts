import type { SaveSummary } from "../persistence/IndexedDbSaveRepository";

export type StartupStatus = "title" | "loading" | "error" | "revealing" | "ready";

export type StartupPhase = "waiting" | "save" | "assets" | "world" | "physics" | "complete";
export type StartupSaveStatus = "checking" | "available" | "empty" | "corrupt" | "incompatible" | "unavailable";
export type StartupErrorCode =
  | "save-failed"
  | "asset-loading-stalled"
  | "assets-failed"
  | "world-failed"
  | "physics-startup-timeout"
  | "physics-failed"
  | "startup-failed";

export interface StartupState {
  status: StartupStatus;
  phase: StartupPhase;
  loadedAssets: number;
  totalAssets: number;
  message: string;
  errorMessage: string | null;
  errorCode: StartupErrorCode | null;
  errorPhase: StartupPhase | null;
  saveStatus: StartupSaveStatus;
  saveSummary: SaveSummary | null;
}

export const createStartupState = (totalAssets: number): StartupState => ({
  status: "title",
  phase: "waiting",
  loadedAssets: 0,
  totalAssets,
  message: "A quiet coast is waiting.",
  errorMessage: null,
  errorCode: null,
  errorPhase: null,
  saveStatus: "checking",
  saveSummary: null
});
