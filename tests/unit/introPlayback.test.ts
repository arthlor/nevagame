import { afterEach, describe, expect, it, vi } from "vitest";
import { startIntroPlayback } from "../../src/ui/introPlayback";

function media() {
  return Object.assign(new EventTarget(), {
    currentTime: 0, muted: false, error: null,
    play: vi.fn(async () => undefined), pause: vi.fn()
  }) as unknown as HTMLVideoElement;
}

afterEach(() => vi.useRealTimers());

describe("intro playback ownership", () => {
  it("does not accept a resolved play promise as advancing video", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
    const video = media(), finished = vi.fn();
    startIntroPlayback(video, finished, vi.fn());
    await vi.advanceTimersByTimeAsync(3_000);
    expect(finished).toHaveBeenCalledExactlyOnceWith(false);
    expect(video.pause).toHaveBeenCalled();
    video.dispatchEvent(new Event("ended"));
    expect(finished).toHaveBeenCalledOnce();
  });

  it("recovers when a film stalls after starting", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
    const video = media(), finished = vi.fn();
    startIntroPlayback(video, finished, vi.fn());
    video.currentTime = 1;
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(7_750);
    expect(finished).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    expect(finished).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("falls back to muted autoplay and completes only once", async () => {
    const video = media(), finished = vi.fn(), muted = vi.fn();
    vi.mocked(video.play).mockRejectedValueOnce(new Error("gesture required"));
    startIntroPlayback(video, finished, muted);
    await Promise.resolve();
    expect(video.muted).toBe(true);
    expect(muted).toHaveBeenCalledOnce();
    video.dispatchEvent(new Event("ended"));
    video.dispatchEvent(new Event("error"));
    expect(finished).toHaveBeenCalledExactlyOnceWith(true);
  });

  it.each(["skip", "dispose"] as const)("quiets a late play after %s without a second completion", async action => {
    const video = media(), finished = vi.fn();
    let resolve!: () => void;
    vi.mocked(video.play).mockReturnValue(new Promise<void>(done => { resolve = done; }));
    const playback = startIntroPlayback(video, finished, vi.fn());
    playback[action]();
    vi.mocked(video.pause).mockClear();
    resolve();
    await Promise.resolve();
    expect(video.pause).toHaveBeenCalledOnce();
    expect(finished).toHaveBeenCalledTimes(action === "skip" ? 1 : 0);
  });

  it("does not let an old play promise pause a newer activation", async () => {
    const video = media();
    let resolve!: () => void;
    vi.mocked(video.play).mockReturnValueOnce(new Promise<void>(done => { resolve = done; }));
    const old = startIntroPlayback(video, vi.fn(), vi.fn());
    old.dispose();
    const current = startIntroPlayback(video, vi.fn(), vi.fn());
    vi.mocked(video.pause).mockClear();
    resolve();
    await Promise.resolve();
    expect(video.pause).not.toHaveBeenCalled();
    current.dispose();
  });
});
