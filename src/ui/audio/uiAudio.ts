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
 * Safely plays audio cues for UI interactions.
 */
export function playUiSound(cue: UiSoundCue | string): void {
  try {
    switch (cue) {
      case "hover":
        gameAudio.playOneShot("ui-hover");
        break;
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

/** Delegated hover/focus cue survives React updates without per-control handlers. */
export function bindUiHoverAudio(root: HTMLElement): () => void {
  let lastAt = -Infinity;
  const hover = (event: Event) => {
    const target = event.target instanceof Element ? event.target.closest("button, a[href], [role=button]") : null;
    if (!target || target.matches(":disabled, [aria-disabled=true]")) return;
    const related = (event as PointerEvent).relatedTarget;
    if (related instanceof Node && target.contains(related)) return;
    const now = performance.now();
    if (now - lastAt < 120) return;
    lastAt = now;
    playUiSound("hover");
  };
  root.addEventListener("pointerover", hover);
  root.addEventListener("focusin", hover);
  return () => { root.removeEventListener("pointerover", hover); root.removeEventListener("focusin", hover); };
}
