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
  errorMessage: string | null;
  errorDetail: string | null;
  errorCode: StartupErrorCode | null;
  errorPhase: StartupPhase | null;
  saveStatus: StartupSaveStatus;
  saveSummary: SaveSummary | null;
  progress?: { kind: "indeterminate" } | { kind: "measured"; completed: number; total: number };
  slow?: boolean;
  degradedResources?: readonly string[];
  recovery?: "reload" | "save";
}

export const createStartupState = (totalAssets: number): StartupState => ({
  status: "title",
  phase: "waiting",
  loadedAssets: 0,
  totalAssets,
  message: "A quiet coast is waiting.",
  errorMessage: null,
  errorDetail: null,
  errorCode: null,
  errorPhase: null,
  saveStatus: "checking",
  saveSummary: null
});
