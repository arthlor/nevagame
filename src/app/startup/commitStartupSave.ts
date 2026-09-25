import type { StartupCoordinator } from "../StartupCoordinator";
import type { StartupState } from "../StartupState";

/** The prepared world remains behind the title while a failed first write is resolved. */
export async function commitStartupSave(
  attempt: StartupCoordinator,
  save: () => Promise<boolean>,
  chooseRetry: () => Promise<boolean>,
  onState: (update: Partial<StartupState>) => void
): Promise<boolean> {
  for (;;) {
    attempt.check();
    const saved = await save();
    attempt.check();
    if (saved) return true;

    onState({ status: "error", recovery: "save", errorCode: "save-failed", errorPhase: "commit",
      errorMessage: "Your world is ready, but your harbor log could not be saved." });
    const retry = await chooseRetry();
    attempt.check();
    if (!retry) return false;
    onState({ status: "loading", recovery: undefined, errorCode: null, errorPhase: null, errorMessage: null });
  }
}
