const owners = new WeakMap<HTMLVideoElement, symbol>();

/** One activation owns every media promise, timeout and completion callback. */
export function startIntroPlayback(
  video: HTMLVideoElement,
  onFinished: (played: boolean) => void,
  onMuted: () => void
): { skip: () => void; dispose: () => void } {
  const owner = Symbol("intro");
  owners.set(video, owner);
  let live = true;
  let started = false;
  let lastTime = video.currentTime;
  let lastProgress = performance.now();
  const activatedAt = lastProgress;

  const dispose = (): void => {
    live = false;
    clearInterval(watchdog);
    video.removeEventListener("ended", ended);
    video.removeEventListener("error", failed);
    video.pause();
  };
  const finish = (played: boolean): void => {
    if (!live) return;
    dispose();
    onFinished(played);
  };
  const ended = (): void => finish(true);
  const failed = (): void => finish(false);
  const watchdog = setInterval(() => {
    const now = performance.now();
    if (video.currentTime > lastTime) {
      started = true;
      lastTime = video.currentTime;
      lastProgress = now;
    }
    // Resolving play() does not prove that frames are advancing. A connection
    // can also stall after the first frame without ever raising `error`.
    if ((!started && now - activatedAt >= 3_000)
      || (started && now - lastProgress >= 8_000)
      || now - activatedAt >= 180_000) finish(false);
  }, 250);
  video.addEventListener("ended", ended);
  video.addEventListener("error", failed);

  void (async () => {
    if (video.error) { finish(false); return; }
    try { video.currentTime = 0; lastTime = 0; } catch { /* Metadata may still be arriving. */ }
    try {
      video.muted = false;
      await video.play();
    } catch {
      if (!live) return;
      video.muted = true;
      onMuted();
      try { await video.play(); } catch { finish(false); return; }
    }
    // A late successful play must not resurrect sound after skip/unmount.
    if (!live && owners.get(video) === owner) video.pause();
  })();

  return { skip: () => finish(true), dispose };
}
