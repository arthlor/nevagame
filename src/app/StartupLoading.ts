export class StartupTimeoutError extends Error {
  public constructor(
    public readonly code: "asset-loading-stalled" | "physics-startup-timeout",
    message: string
  ) {
    super(message);
    this.name = "StartupTimeoutError";
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  error: StartupTimeoutError
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(error), timeoutMs);
    promise.then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (reason) => {
        globalThis.clearTimeout(timer);
        reject(reason);
      }
    );
  });
}

/**
 * Reject only when a stage stops making observable progress. A slow cold load
 * may take longer than the stall window in total while still remaining healthy.
 */
export function withProgressStallTimeout<T>(
  operation: (reportProgress: () => void) => Promise<T>,
  stallTimeoutMs: number,
  error: StartupTimeoutError
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof globalThis.setTimeout> | null = null;

    const armTimer = () => {
      if (timer !== null) globalThis.clearTimeout(timer);
      timer = globalThis.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(error);
      }, stallTimeoutMs);
    };

    armTimer();

    let promise: Promise<T>;
    try {
      promise = operation(() => {
        if (!settled) armTimer();
      });
    } catch (reason) {
      settled = true;
      if (timer !== null) globalThis.clearTimeout(timer);
      reject(reason);
      return;
    }

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        if (timer !== null) globalThis.clearTimeout(timer);
        resolve(value);
      },
      (reason) => {
        if (settled) return;
        settled = true;
        if (timer !== null) globalThis.clearTimeout(timer);
        reject(reason);
      }
    );
  });
}
