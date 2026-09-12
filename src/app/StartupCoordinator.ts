import { StartupTimeoutError } from "./StartupLoading";

let nextAttemptId = 0;

/** One attempt owns all asynchronous startup work, including late results. */
export class StartupCoordinator {
  public readonly id = ++nextAttemptId;
  private readonly controller = new AbortController();
  public readonly signal = this.controller.signal;

  public check(): void { this.signal.throwIfAborted(); }
  public cancel(reason: unknown = new DOMException("Startup cancelled", "AbortError")): void {
    this.controller.abort(reason);
  }

  public async stage<T>(
    operation: (progress: () => void) => Promise<T>,
    timeoutMs: number,
    error: StartupTimeoutError,
    onSlow: () => void = () => undefined,
    disposeLate?: (value: T) => void
  ): Promise<T> {
    this.check();
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout>;
      const slowTimer = setTimeout(() => { if (!settled) onSlow(); }, 8000);
      const cleanup = () => {
        clearTimeout(timer);
        clearTimeout(slowTimer);
        this.signal.removeEventListener("abort", abort);
      };
      const abort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(this.signal.reason);
      };
      const progress = () => {
        if (settled) return;
        clearTimeout(timer);
        timer = setTimeout(() => this.cancel(error), timeoutMs);
      };
      this.signal.addEventListener("abort", abort, { once: true });
      progress();
      Promise.resolve().then(() => { this.check(); return operation(progress); }).then(value => {
        if (settled) {
          // Nobody awaits this chain once the stage has settled, so a throwing
          // disposer would surface as an unhandled rejection.
          try { disposeLate?.(value); } catch (disposeError) {
            console.warn("[StartupCoordinator] Late startup result could not be disposed", disposeError);
          }
          return;
        }
        settled = true;
        cleanup();
        resolve(value);
      }, reason => {
        if (settled) return;
        settled = true;
        cleanup();
        this.cancel(reason);
        reject(reason);
      });
    });
  }
}
