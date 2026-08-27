// src/ui/audio/uiAudio.ts
import { gameAudio } from "../../audio/AudioManager";

export type UiSoundCue =
  | "click"
  | "confirm"
  | "open"
  | "cloth"
  | "coins"
  | "page-turn"
  | "chime";

/**
 * Presentation-only UI sound dispatcher.
 * Safely plays audio cues for UI interactions.
 */
export function playUiSound(cue: UiSoundCue | string): void {
  try {
    switch (cue) {
      case "click":
        gameAudio.playOneShot("ui-click");
        break;
      case "confirm":
        gameAudio.playOneShot("ui-confirm");
        break;
      case "open":
        gameAudio.playBank("ui-open");
        break;
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
      default:
        // Attempt one-shot or bank if custom key passed
        gameAudio.playOneShot(cue as any);
        break;
    }
  } catch {
    // Audio failures should never break UI interaction
  }
}
