import { describe, expect, it, vi } from "vitest";
import { StartupOwnership } from "../../src/app/StartupOwnership";
import { commitStartupSave } from "../../src/app/startup/commitStartupSave";
import type { StartupState } from "../../src/app/StartupState";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe("startup read and entry ownership", () => {
  it("ignores a stale title read when a newer read or entry has taken over", async () => {
    const owner = new StartupOwnership();
    const older = deferred<string>();
    const newer = deferred<string>();
    const applied: string[] = [];
    const { revision: oldRevision, signal: oldSignal } = owner.beginTitleRead();
    const oldWork = older.promise.then(value => {
      if (owner.ownsTitleRead(oldRevision, "title")) applied.push(value);
    });
    const { revision: newRevision, signal: newSignal } = owner.beginTitleRead();
    expect(oldSignal.aborted).toBe(true);
    const newWork = newer.promise.then(value => {
      if (owner.ownsTitleRead(newRevision, "title")) applied.push(value);
    });
    older.resolve("old save");
    await oldWork;
    expect(applied).toEqual([]);

    const entry = owner.beginEntry("title");
    expect(entry).not.toBeNull();
    expect(newSignal.aborted).toBe(true);
    newer.resolve("new save");
    await newWork;
    expect(applied).toEqual([]);
    expect(owner.ownsTitleRead(newRevision, "loading")).toBe(false);
  });

  it("accepts one entry and rejects its late updates after cancellation", async () => {
    const owner = new StartupOwnership();
    const entry = owner.beginEntry("title")!;
    expect(owner.beginEntry("title")).toBeNull();
    expect(owner.ownsEntry(entry)).toBe(true);
    const late = deferred<string>();
    const applied: string[] = [];
    const work = late.promise.then(value => {
      if (owner.ownsEntry(entry)) applied.push(value);
    });
    owner.cancel();
    late.resolve("late world");
    await work;
    expect(entry.signal.aborted).toBe(true);
    expect(applied).toEqual([]);
    expect(owner.beginEntry("error")).toBeNull();
  });
});

describe("prepared startup save commit", () => {
  it("commits exactly once when the first write succeeds", async () => {
    const owner = new StartupOwnership();
    const attempt = owner.beginEntry("title")!;
    const save = vi.fn(async () => true);
    const chooseRetry = vi.fn(async () => true);
    const onState = vi.fn<(update: Partial<StartupState>) => void>();
    await expect(commitStartupSave(attempt, save, chooseRetry, onState)).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(chooseRetry).not.toHaveBeenCalled();
    expect(onState).not.toHaveBeenCalled();
  });

  it("waits for a retry decision and commits once after a failed write", async () => {
    const owner = new StartupOwnership();
    const attempt = owner.beginEntry("title")!;
    const decision = deferred<boolean>();
    const save = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const onState = vi.fn<(update: Partial<StartupState>) => void>();
    const work = commitStartupSave(attempt, save, () => decision.promise, onState);
    await vi.waitFor(() => expect(onState).toHaveBeenCalledWith(expect.objectContaining({ status: "error", recovery: "save" })));
    expect(save).toHaveBeenCalledTimes(1);
    decision.resolve(true);
    await expect(work).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ status: "loading", errorCode: null }));
  });

  it("keeps an unsaved session unsaved and discards a cancelled late success", async () => {
    const owner = new StartupOwnership();
    const attempt = owner.beginEntry("title")!;
    const save = vi.fn(async () => false);
    await expect(commitStartupSave(attempt, save, async () => false, () => undefined)).resolves.toBe(false);
    expect(save).toHaveBeenCalledTimes(1);

    const secondOwner = new StartupOwnership();
    const secondAttempt = secondOwner.beginEntry("title")!;
    const late = deferred<boolean>();
    const onState = vi.fn();
    const work = commitStartupSave(secondAttempt, () => late.promise, async () => true, onState);
    secondOwner.cancel();
    late.resolve(true);
    await expect(work).rejects.toThrow();
    expect(onState).not.toHaveBeenCalled();
  });
});
