import type { SaveSummary } from "../persistence/IndexedDbSaveRepository";

export type StartupStatus = "title" | "loading" | "error" | "revealing" | "ready";

export type StartupPhase = "waiting" | "save" | "assets" | "world" | "physics" | "complete";
export type StartupSaveStatus = "checking" | "available" | "empty" | "corrupt" | "unavailable";

export interface StartupState {
  status: StartupStatus;
  phase: StartupPhase;
  loadedAssets: number;
  totalAssets: number;
  message: string;
  errorMessage: string | null;
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
  saveStatus: "checking",
  saveSummary: null
});
