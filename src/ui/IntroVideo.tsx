import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ReactElement } from "react";
import { audioSettings } from "../audio/AudioSettings";

export interface IntroVideoHandle {
  /** Skips the cinematic. Returns false when it is not currently playing. */
  skip: () => boolean;
}

export interface IntroVideoProps {
  /** True while the startup state machine is showing the intro. */
  active: boolean;
  /** Called exactly once per activation: true when the film played or was skipped. */
  onFinished: (played: boolean) => void;
}

const INTRO_VIDEO_SRC = "/assets/video/intro.mp4";
const INTRO_POSTER_SRC = "/assets/video/intro-poster.webp";
/** A cinematic that cannot start within this window must not hold up entry. */
const START_GRACE_MS = 20_000;

/**
 * Presentation-only entry cinematic. The element stays mounted while the world
 * loads so the film buffers in parallel; playback is best-effort with sound,
 * falls back to muted autoplay, and never gates startup on its own failure.
 */
export const IntroVideo = forwardRef<IntroVideoHandle, IntroVideoProps>(function IntroVideo(
  { active, onFinished },
  ref
): ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeRef = useRef(false);
  const finishedRef = useRef(false);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  const finishRef = useRef<(played: boolean) => void>(() => undefined);
  const [showing, setShowing] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);

  useImperativeHandle(ref, () => ({
    skip: () => {
      if (!activeRef.current) return false;
      finishRef.current(true);
      return true;
    }
  }), []);

  // Buffer while the world loads so entry is not delayed by the download.
  useEffect(() => {
    videoRef.current?.load();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!active) {
      activeRef.current = false;
      setShowing(false);
      return;
    }

    finishedRef.current = false;
    activeRef.current = true;
    setShowing(true);
    setSoundBlocked(false);

    const applyVolume = (): void => {
      const settings = audioSettings.get();
      video.volume = settings.masterMuted ? 0 : settings.master;
    };
    applyVolume();
    const unsubscribeVolume = audioSettings.subscribe(applyVolume);

    const finish = (played: boolean): void => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      activeRef.current = false;
      video.pause();
      setShowing(false);
      onFinishedRef.current(played);
    };
    finishRef.current = finish;

    const ended = (): void => finish(true);
    const failed = (): void => finish(false);
    const skip = (event: Event): void => {
      const target = event.target;
      if (target instanceof Element && target.closest(".intro-video__sound")) return;
      finish(true);
    };

    let started = false;
    const graceTimer = window.setTimeout(() => {
      if (!started) finish(false);
    }, START_GRACE_MS);

    const beginPlayback = async (): Promise<void> => {
      // A failure that landed while the film was buffering surfaces here
      // instead of through an `error` event the listener could still catch.
      if (video.error) {
        finish(false);
        return;
      }
      try {
        video.currentTime = 0;
      } catch {
        // A seek before metadata is best-effort; playback starts at zero anyway.
      }
      try {
        video.muted = false;
        await video.play();
      } catch {
        if (finishedRef.current) return;
        try {
          video.muted = true;
          setSoundBlocked(true);
          await video.play();
        } catch {
          finish(false);
          return;
        }
      }
      if (finishedRef.current) return;
      started = true;
    };

    window.addEventListener("keydown", skip, true);
    window.addEventListener("pointerdown", skip, true);
    window.addEventListener("wheel", skip, { capture: true, passive: false });
    video.addEventListener("ended", ended);
    video.addEventListener("error", failed);
    void beginPlayback();

    return () => {
      window.clearTimeout(graceTimer);
      unsubscribeVolume();
      window.removeEventListener("keydown", skip, true);
      window.removeEventListener("pointerdown", skip, true);
      window.removeEventListener("wheel", skip, true);
      video.removeEventListener("ended", ended);
      video.removeEventListener("error", failed);
      activeRef.current = false;
      if (!finishedRef.current) video.pause();
    };
  }, [active]);

  const enableSound = (): void => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    setSoundBlocked(false);
  };

  return (
    <div className={`intro-video${showing ? " is-active" : ""}`}>
      <video
        ref={videoRef}
        className="intro-video__media"
        src={INTRO_VIDEO_SRC}
        poster={INTRO_POSTER_SRC}
        preload="auto"
        playsInline
        controls={false}
        disablePictureInPicture
        tabIndex={-1}
        aria-hidden="true"
      />
      {showing && soundBlocked && (
        <button type="button" className="intro-video__sound" onClick={enableSound}>
          Sound on
        </button>
      )}
    </div>
  );
});
