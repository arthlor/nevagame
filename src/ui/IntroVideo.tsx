import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ReactElement } from "react";
import { audioSettings } from "../audio/AudioSettings";
import { startIntroPlayback } from "./introPlayback";

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

/**
 * Presentation-only entry cinematic. The element stays mounted while the world
 * loads after required scenery transfers so it buffers during world population;
 * playback is best-effort with sound,
 * falls back to muted autoplay, and never gates startup on its own failure.
 */
export const IntroVideo = forwardRef<IntroVideoHandle, IntroVideoProps>(function IntroVideo(
  { active, onFinished },
  ref
): ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeRef = useRef(false);
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

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!active) {
      activeRef.current = false;
      setShowing(false);
      return;
    }

    activeRef.current = true;
    setShowing(true);
    setSoundBlocked(false);

    const applyVolume = (): void => {
      const settings = audioSettings.get();
      video.volume = settings.masterMuted ? 0 : settings.master;
    };
    applyVolume();
    const unsubscribeVolume = audioSettings.subscribe(applyVolume);

    const playback = startIntroPlayback(video, played => {
      activeRef.current = false;
      setShowing(false);
      onFinishedRef.current(played);
    }, () => setSoundBlocked(true));
    finishRef.current = () => playback.skip();

    const skip = (event: Event): void => {
      const target = event.target;
      // Keep native button activation and Tab navigation usable, including
      // enabling sound, without leaking a skip gesture into the game.
      if (target instanceof Element && target.closest("button")
        && !(event instanceof KeyboardEvent && event.key === "Escape")) return;
      if (event instanceof KeyboardEvent && !["Escape", "Enter", " "].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      playback.skip();
    };
    window.addEventListener("keydown", skip, true);
    video.addEventListener("pointerdown", skip);

    return () => {
      unsubscribeVolume();
      window.removeEventListener("keydown", skip, true);
      video.removeEventListener("pointerdown", skip);
      activeRef.current = false;
      finishRef.current = () => undefined;
      playback.dispose();
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
