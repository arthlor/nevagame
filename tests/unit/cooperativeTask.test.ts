import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("browser cooperative task turns", () => {
  it("yields through the task queue and removes cancelled work", async () => {
    const messages: number[] = [];
    const port1 = { onmessage: (_event: { data: number }) => {} };
    vi.stubGlobal("window", {});
    vi.stubGlobal("MessageChannel", class {
      port1 = port1;
      port2 = { postMessage: (id: number) => messages.push(id) };
    });
    const { yieldToTask } = await import("../../src/utils/CooperativeTask");
    const controller = new AbortController();
    const cancelled = yieldToTask(controller.signal);
    const resolved = vi.fn();
    const next = yieldToTask().then(resolved);
    expect(resolved).not.toHaveBeenCalled();
    controller.abort(new Error("cancelled"));
    await expect(cancelled).rejects.toThrow("cancelled");
    for (const data of messages) port1.onmessage({ data });
    await next;
    expect(resolved).toHaveBeenCalledOnce();
    expect(messages).toHaveLength(2);
  });

  it("rejects an already-cancelled yield before scheduling", async () => {
    const { yieldToTask } = await import("../../src/utils/CooperativeTask");
    const controller = new AbortController();
    controller.abort(new Error("stopped"));
    expect(() => yieldToTask(controller.signal)).toThrow("stopped");
  });
});
