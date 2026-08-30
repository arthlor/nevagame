import { describe, expect, it, vi } from "vitest";

import {
  StartupTimeoutError,
  withProgressStallTimeout,
  withTimeout
} from "../../src/app/StartupLoading";

describe("startup loading timeouts", () => {
  it("allows a slow stage to run beyond the stall window while progress continues", async () => {
    vi.useFakeTimers();
    try {
      const operation = withProgressStallTimeout(
        async (reportProgress) => {
          await new Promise<void>((resolve) => setTimeout(resolve, 70));
          reportProgress();
          await new Promise<void>((resolve) => setTimeout(resolve, 70));
          reportProgress();
          await new Promise<void>((resolve) => setTimeout(resolve, 70));
          return "ready";
        },
        100,
        new StartupTimeoutError("asset-loading-stalled", "Assets stalled")
      );

      await vi.advanceTimersByTimeAsync(210);
      await expect(operation).resolves.toBe("ready");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects when asset progress actually stops", async () => {
    vi.useFakeTimers();
    try {
      const operation = withProgressStallTimeout(
        () => new Promise<void>(() => undefined),
        100,
        new StartupTimeoutError("asset-loading-stalled", "Assets stalled")
      );
      const rejection = expect(operation).rejects.toMatchObject({
        code: "asset-loading-stalled",
        message: "Assets stalled"
      });

      await vi.advanceTimersByTimeAsync(100);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a fixed deadline for stages that do not expose progress", async () => {
    vi.useFakeTimers();
    try {
      const operation = withTimeout(
        new Promise<void>(() => undefined),
        100,
        new StartupTimeoutError("physics-startup-timeout", "Physics timed out")
      );
      const rejection = expect(operation).rejects.toMatchObject({
        code: "physics-startup-timeout"
      });

      await vi.advanceTimersByTimeAsync(100);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });
});
