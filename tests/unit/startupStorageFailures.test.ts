import { afterEach, describe, expect, it, vi } from "vitest";
import { IndexedDbSaveRepository, SAVE_OPERATION_TIMEOUT_MS } from "../../src/persistence/IndexedDbSaveRepository";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("startup storage failure classification", () => {
  it("reports blocked storage as unavailable and closes a late successful open", async () => {
    const request = {} as IDBOpenDBRequest;
    const close = vi.fn();
    vi.stubGlobal("indexedDB", { open: () => request });
    const result = new IndexedDbSaveRepository().loadGameResult();
    await Promise.resolve();
    request.onblocked?.call(request, {} as IDBVersionChangeEvent);
    await expect(result).resolves.toEqual({ status: "unavailable" });
    Object.defineProperty(request, "result", { value: { close } });
    request.onsuccess?.call(request, {} as Event);
    expect(close).toHaveBeenCalledOnce();
  });

  it("bounds a stalled database open", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("indexedDB", { open: () => ({}) });
    const result = new IndexedDbSaveRepository().loadGameResult();
    await vi.advanceTimersByTimeAsync(SAVE_OPERATION_TIMEOUT_MS);
    await expect(result).resolves.toEqual({ status: "unavailable" });
  });

  it.each(["error", "abort"] as const)("does not turn a read transaction %s into an empty slot", async kind => {
    const tx = { objectStore: () => ({ get: () => ({}) }) } as unknown as IDBTransaction;
    const db = { transaction: () => {
      queueMicrotask(() => {
        if (kind === "error") tx.onerror?.call(tx, {} as Event);
        else tx.onabort?.call(tx, {} as Event);
      });
      return tx;
    } };
    const request = { result: db } as unknown as IDBOpenDBRequest;
    vi.stubGlobal("indexedDB", { open: () => { queueMicrotask(() => request.onsuccess?.call(request, {} as Event)); return request; } });
    await expect(new IndexedDbSaveRepository().loadGameResult()).resolves.toEqual({ status: "unavailable" });
  });
});
