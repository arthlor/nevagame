import { afterEach, describe, expect, it, vi } from "vitest";
import { StartupCoordinator } from "../../src/app/StartupCoordinator";
import { StartupTimeoutError } from "../../src/app/StartupLoading";
import { runCooperatively, runSync } from "../../src/utils/CooperativeTask";

afterEach(() => vi.useRealTimers());
const timeout = () => new StartupTimeoutError("world-startup-timeout", "Timed out");

describe("startup attempt ownership", () => {
  it("cancels the operation signal at the deadline and disposes its late result", async () => {
    vi.useFakeTimers();
    const attempt = new StartupCoordinator();
    let finish!: (value: string) => void;
    const dispose = vi.fn();
    const work = attempt.stage(() => new Promise<string>(resolve => { finish = resolve; }), 100, timeout(), undefined, dispose);
    const rejected = expect(work).rejects.toMatchObject({ code: "world-startup-timeout" });
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(attempt.signal.aborted).toBe(true);
    finish("late physics");
    await vi.advanceTimersByTimeAsync(0);
    expect(dispose).toHaveBeenCalledExactlyOnceWith("late physics");
    await expect(attempt.stage(async () => "never", 100, timeout())).rejects.toThrow();
  });

  it("keeps transfer activity alive beyond the stall deadline and completes once", async () => {
    vi.useFakeTimers();
    const attempt = new StartupCoordinator();
    const work = attempt.stage(async progress => {
      for (let i = 0; i < 4; i++) {
        await new Promise(resolve => setTimeout(resolve, 70));
        progress();
      }
      return "ready";
    }, 100, timeout());
    await vi.advanceTimersByTimeAsync(280);
    await expect(work).resolves.toBe("ready");
    await vi.advanceTimersByTimeAsync(1000);
    expect(attempt.signal.aborted).toBe(false);
  });

  it("propagates failure and disposal without allowing a later stage", async () => {
    const attempt = new StartupCoordinator();
    await expect(attempt.stage(async () => { throw new Error("GLB failed"); }, 100, timeout())).rejects.toThrow("GLB failed");
    const next = vi.fn(async () => undefined);
    await expect(attempt.stage(next, 100, timeout())).rejects.toThrow("GLB failed");
    expect(next).not.toHaveBeenCalled();
    const disposed = new StartupCoordinator();
    disposed.cancel();
    await expect(disposed.stage(next, 100, timeout())).rejects.toThrow();
  });

  it("shares deterministic computation and closes a cancelled generator", async () => {
    function* sequence() { let result = 0; for (let i = 0; i < 100; i++) { result = result * 1.001 + i; yield; } return result; }
    expect(await runCooperatively(sequence())).toBe(runSync(sequence()));
    const controller = new AbortController();
    let closed = false;
    function* cancelled() { try { controller.abort(); yield; return 1; } finally { closed = true; } }
    await expect(runCooperatively(cancelled(), controller.signal)).rejects.toThrow();
    expect(closed).toBe(true);
  });
});
