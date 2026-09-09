import { describe, it, expect } from "vitest";
import {
  EMPTY_DIALOGUE_REVEAL,
  dialogueFooterLabel,
  revealPageFully,
  dialoguePageKey,
  revealTo,
  revealedCharsFor,
  startPage
} from "../../src/ui/dialogueTypewriter";

const PAGE_A = dialoguePageKey("npc.elspeth", 1, 0);
const PAGE_B = dialoguePageKey("npc.elspeth", 1, 1);
/** Same NPC and page index, different resolution — the case that caused the bug. */
const PAGE_A_UNRESOLVED = dialoguePageKey("npc.elspeth", 0, 0);

describe("dialogue typewriter reveal", () => {
  it("reads as unrevealed for any page the state is not on", () => {
    const reveal = revealTo(startPage(PAGE_A), PAGE_A, 12);
    expect(revealedCharsFor(reveal, PAGE_A)).toBe(12);
    expect(revealedCharsFor(reveal, PAGE_B)).toBe(0);
    expect(revealedCharsFor(reveal, PAGE_A_UNRESOLVED)).toBe(0);
  });

  it("drops a write from a page that has already been left", () => {
    const onB = revealTo(startPage(PAGE_B), PAGE_B, 30);
    // A timer callback queued while page A was showing fires late.
    const afterStale = revealTo(onB, PAGE_A, 3);
    expect(afterStale).toBe(onB);
    expect(revealedCharsFor(afterStale, PAGE_B)).toBe(30);
  });

  it("never lowers the revealed count for the current page", () => {
    const shown = revealTo(startPage(PAGE_A), PAGE_A, 40);
    // "Show all" revealed everything; a stale tick tries to walk it back.
    const afterTick = revealTo(shown, PAGE_A, 7);
    expect(afterTick.chars).toBe(40);
    expect(afterTick).toBe(shown);
  });

  it("reproduces the label bounce and shows the fix holds", () => {
    const label = (chars: number, textLength: number) =>
      dialogueFooterLabel({
        isTyping: chars < textLength,
        isLastPage: false,
        talkFailed: false,
        isCompletion: false
      });

    const text = "Walk onto the prepared field soil.";
    // Typing, then the player presses "Show all".
    let reveal = startPage(PAGE_A);
    expect(label(revealedCharsFor(reveal, PAGE_A), text.length)).toBe("Show all");
    reveal = revealTo(reveal, PAGE_A, text.length);
    expect(label(revealedCharsFor(reveal, PAGE_A), text.length)).toBe("Next");

    // A late reset for the same page cannot send the label backwards.
    reveal = revealTo(reveal, PAGE_A, 0);
    expect(label(revealedCharsFor(reveal, PAGE_A), text.length)).toBe("Next");
  });

  it("starts a genuinely new page from zero", () => {
    const shown = revealTo(startPage(PAGE_A), PAGE_A, 40);
    const next = startPage(PAGE_B);
    expect(revealedCharsFor(next, PAGE_B)).toBe(0);
    expect(revealedCharsFor(next, PAGE_A)).toBe(0);
    expect(shown.chars).toBe(40);
  });

  it("ignores a timer write before the page has been started", () => {
    // The reveal only ever belongs to a page the effect has opened.
    expect(revealTo(EMPTY_DIALOGUE_REVEAL, PAGE_A, 9)).toBe(EMPTY_DIALOGUE_REVEAL);
  });

  it("lets an explicit reveal win from any state", () => {
    // "Show all", a rewind, and reduced motion are intents, not stale effects.
    const onB = revealTo(startPage(PAGE_B), PAGE_B, 30);
    const forced = revealPageFully(PAGE_A, 34);
    expect(forced).toEqual({ pageKey: PAGE_A, chars: 34 });
    expect(revealedCharsFor(forced, PAGE_A)).toBe(34);
    expect(revealedCharsFor(onB, PAGE_B)).toBe(30);
  });

  it("labels every footer state", () => {
    const base = { isTyping: false, isLastPage: false, talkFailed: false, isCompletion: false };
    expect(dialogueFooterLabel({ ...base, isTyping: true })).toBe("Show all");
    expect(dialogueFooterLabel(base)).toBe("Next");
    expect(dialogueFooterLabel({ ...base, isLastPage: true })).toBe("Close");
    expect(dialogueFooterLabel({ ...base, isLastPage: true, isCompletion: true })).toBe("Continue");
    expect(dialogueFooterLabel({ ...base, isLastPage: true, talkFailed: true, isCompletion: true })).toBe("Close");
    // Typing wins over every other state, so the reveal action is never hidden.
    expect(dialogueFooterLabel({ isTyping: true, isLastPage: true, talkFailed: true, isCompletion: true })).toBe("Show all");
  });

  it("keys pages by npc, resolution generation and index", () => {
    expect(dialoguePageKey("npc.silas", 2, 3)).toBe("npc.silas#2#3");
    expect(dialoguePageKey("npc.silas", 2, 3)).not.toBe(dialoguePageKey("npc.silas", 3, 3));
    expect(dialoguePageKey("npc.silas", 2, 3)).not.toBe(dialoguePageKey("npc.maeve", 2, 3));
  });
});
