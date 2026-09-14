// src/ui/dialogueConversation.ts

import { MAIN_QUEST_TRACK_ID, type ConversationSegment } from "../simulation/core/QuestTypes";

/**
 * The page model behind the dialogue overlay, kept pure so it can be tested
 * under vitest's node environment (the modal resolves its conversation in an
 * effect, which a server render never runs).
 */

/** What a talk returns. `segments` is the conversation; `dialogue` its flat text. */
export interface DialogueTalkResult {
  success: boolean;
  reason?: string;
  dialogue?: string[];
  segments?: ConversationSegment[];
  isCompletion?: boolean;
  questCompleted?: boolean;
  rewardsGiven?: boolean;
}

export interface DialoguePage {
  text: string;
  segment: ConversationSegment;
  /** First page of its segment: where a new beat begins. */
  opensSegment: boolean;
  /** Last page of its segment: where rewards and notes appear. */
  closesSegment: boolean;
}

/**
 * The heading a part of the conversation carries, so a single talk that closes
 * one errand and opens another reads as two beats rather than one run of text.
 */
export function segmentHeading(segment: ConversationSegment): string | null {
  if (!segment.questTitle) return null;
  switch (segment.kind) {
    case "completion":
      return `Errand complete · ${segment.questTitle}`;
    case "herald":
      return `Word of an errand · ${segment.questTitle}`;
    case "intro":
      if (segment.startsQuest) return `New errand · ${segment.questTitle}`;
      return segment.trackId && segment.trackId !== MAIN_QUEST_TRACK_ID && segment.trackTitle
        ? `${segment.trackTitle} · ${segment.questTitle}`
        : segment.questTitle;
    case "objective":
      return segment.questTitle;
    default:
      return null;
  }
}

/** Flattens a conversation into pages; a refusal or bare text becomes one plain beat. */
export function buildDialoguePages(result: DialogueTalkResult, fallback: string[]): DialoguePage[] {
  if (!result.success) {
    const segment: ConversationSegment = { kind: "recognition", lines: [result.reason ?? "Move closer to talk to this person."] };
    return [{ text: segment.lines[0], segment, opensSegment: true, closesSegment: true }];
  }
  const segments: ConversationSegment[] = result.segments?.length
    ? result.segments
    : [{ kind: "recognition", lines: result.dialogue?.length ? result.dialogue : fallback }];
  return segments.flatMap((segment) => {
    const lines = segment.lines.length > 0 ? segment.lines : ["…"];
    return lines.map((text, index) => ({
      text,
      segment,
      opensSegment: index === 0,
      closesSegment: index === lines.length - 1
    }));
  });
}

/**
 * Rewards show throughout a completion beat: they changed hands the moment the
 * talk settled, and the plate should not jump in on the beat's last page.
 */
export function pageShowsRewards(page: DialoguePage | undefined): boolean {
  return Boolean(page && page.segment.kind === "completion");
}
