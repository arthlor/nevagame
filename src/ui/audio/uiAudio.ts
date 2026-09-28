// src/ui/audio/uiAudio.ts
import { gameAudio } from "../../audio/AudioManager";
import type { NoticeTone } from "../notifications";

export type UiSoundCue =
  | "hover"
  | "click"
  | "confirm"
  | "open"
  | "cloth"
  | "coins"
  | "page-turn"
  | "chime"
  | "error"
  | "stamp"
  | "sketch"
  | "treasure"
  | "perfect";

/**
 * Presentation-only UI sound dispatcher.
 * Hover is silent. A click ding plays once per turn so a nested control
 * cannot stack the same tap. Completion cues stay on their own path.
 */
let clickDingQueued = false;

export function playUiSound(cue: UiSoundCue | string): void {
  if (cue === "hover") return;
  if (cue === "click") {
    if (clickDingQueued) return;
    clickDingQueued = true;
    queueMicrotask(() => { clickDingQueued = false; });
  }
  try {
    switch (cue) {
      case "click":
        gameAudio.playOneShot("ui-click");
        break;
      case "confirm":
        gameAudio.playOneShot("ui-confirm");
        break;
      case "open":
      case "cloth":
        gameAudio.playOneShot("ui-cloth");
        break;
      case "coins":
        gameAudio.playOneShot("coins");
        break;
      case "page-turn":
        gameAudio.playOneShot("page-turn");
        break;
      case "chime":
        gameAudio.playOneShot("quest-chime");
        break;
      case "error":
        gameAudio.playOneShot("ui-error");
        break;
      case "stamp":
        gameAudio.playOneShot("contract-stamp");
        break;
      case "sketch":
        gameAudio.playOneShot("journal-sketch");
        break;
      case "treasure":
        gameAudio.playOneShot("treasure-chime");
        break;
      case "perfect":
        gameAudio.playOneShot("perfect-catch");
        break;
      default:
        // Attempt one-shot or bank if custom key passed
        gameAudio.playOneShot(cue as any);
        break;
    }
  } catch {
    // Audio failures should never break UI interaction
  }
}

const NOTICE_TONE_CUES: Record<NoticeTone, UiSoundCue | null> = {
  // Routine status lines stay silent; a cue on every prompt turns into noise.
  info: null,
  success: "confirm",
  warning: "click",
  danger: "error",
  reward: "coins"
};

/** Plays the cue that matches a notification's tone, if that tone has one. */
export function playNoticeSound(tone: NoticeTone): void {
  const cue = NOTICE_TONE_CUES[tone];
  if (cue) playUiSound(cue);
}

/** Plays an activation cue only when the control itself accepted the gesture. */
export function playAcceptedUiDing(target: EventTarget | null, cue: UiSoundCue | string = "click"): void {
  const closest = target && typeof (target as { closest?: unknown }).closest === "function"
    ? (target as Element).closest.bind(target as Element)
    : null;
  if (closest?.(":disabled, [aria-disabled='true']")) return;
  playUiSound(cue);
}
