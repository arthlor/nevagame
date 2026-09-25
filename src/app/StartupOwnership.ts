import { StartupCoordinator } from "./StartupCoordinator";
import type { StartupStatus } from "./StartupState";

/** Keeps title-only storage reads separate from the one active entry attempt. */
export class StartupOwnership {
  private titleReadRevision = 0;
  private titleReadController: AbortController | null = null;
  private attempt: StartupCoordinator | null = null;

  public beginTitleRead(): { revision: number; signal: AbortSignal } {
    this.titleReadController?.abort();
    this.titleReadController = new AbortController();
    return { revision: ++this.titleReadRevision, signal: this.titleReadController.signal };
  }

  public ownsTitleRead(revision: number, status: StartupStatus): boolean {
    return revision === this.titleReadRevision && status === "title" && this.attempt === null;
  }

  public beginEntry(status: StartupStatus): StartupCoordinator | null {
    if (status !== "title" || this.attempt) return null;
    ++this.titleReadRevision;
    this.titleReadController?.abort();
    this.titleReadController = null;
    this.attempt = new StartupCoordinator();
    return this.attempt;
  }

  public ownsEntry(attempt: StartupCoordinator): boolean {
    return this.attempt === attempt && !attempt.signal.aborted;
  }

  public isCurrentEntry(attempt: StartupCoordinator): boolean {
    return this.attempt === attempt;
  }

  public cancel(reason?: unknown): void {
    ++this.titleReadRevision;
    this.titleReadController?.abort();
    this.titleReadController = null;
    this.attempt?.cancel(reason);
  }
}
