import { describe, expect, it, vi } from "vitest";
import { loadWorldAtlasImage } from "../../src/ui/components/worldAtlasImage";

function pendingImage() {
  let resolve!: () => void;
  let reject!: () => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { image: { src: "", decoding: "auto" as HTMLImageElement["decoding"], decode: () => promise }, resolve, reject };
}

describe("open-modal atlas decode lifecycle", () => {
  it("requests asynchronous decode once and delivers ready only afterward", async () => {
    const { image, resolve } = pendingImage();
    const ready = vi.fn(); const error = vi.fn(); const factory = vi.fn(() => image);
    const close = loadWorldAtlasImage("/atlas.webp", ready, error, factory);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(image.src).toBe("/atlas.webp"); expect(image.decoding).toBe("async");
    expect(ready).not.toHaveBeenCalled(); resolve(); await Promise.resolve();
    expect(ready).toHaveBeenCalledTimes(1); expect(error).not.toHaveBeenCalled();
    close(); expect(image.src).toBe("");
  });
  it.each(["resolve", "reject"] as const)("does not deliver a late %s after map close", async (settle) => {
    const pending = pendingImage(); const ready = vi.fn(); const error = vi.fn();
    const close = loadWorldAtlasImage("/atlas.webp", ready, error, () => pending.image);
    close(); pending[settle](); await Promise.resolve();
    expect(ready).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled(); expect(pending.image.src).toBe("");
  });
  it("reports a decode failure while still open", async () => {
    const { image, reject } = pendingImage(); const ready = vi.fn(); const error = vi.fn();
    loadWorldAtlasImage("/atlas.webp", ready, error, () => image);
    reject(); await Promise.resolve(); expect(error).toHaveBeenCalledOnce(); expect(ready).not.toHaveBeenCalled();
  });
});
