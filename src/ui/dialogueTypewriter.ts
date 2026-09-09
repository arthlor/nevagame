// src/ui/dialogueTypewriter.ts

/**
 * Reveal bookkeeping for the dialogue typewriter, kept pure so it can be
 * tested under vitest's node environment (React components there can only be
 * rendered to a string, which cannot observe a timer-driven reveal).
 *
 * The problem this solves: the modal resolves its dialogue asynchronously, so
 * the page text changes identity after the first paint. Keying the reveal on
 * the text alone let a reset for one page land on another, restarting the
 * typewriter and bouncing the footer label from "Next" back to "Show all".
 * A page key plus monotonic writes make that structurally impossible.
 */
export interface DialogueReveal {
  pageKey: string;
  chars: number;
}

export const EMPTY_DIALOGUE_REVEAL: DialogueReveal = { pageKey: "", chars: 0 };

/**
 * Identity of one rendered page. `generation` changes when the modal swaps in
 * freshly resolved dialogue, so the pre-resolution page and the resolved page
 * are never confused for each other.
 */
export function dialoguePageKey(npcId: string, generation: number, pageIndex: number): string {
  return `${npcId}#${generation}#${pageIndex}`;
}

/** Revealed characters for this page — 0 for any page the state is not on. */
export function revealedCharsFor(reveal: DialogueReveal, pageKey: string): number {
  return reveal.pageKey === pageKey ? reveal.chars : 0;
}

/**
 * Advances the reveal of the page currently showing. A write naming any other
 * page is dropped outright, and a write for the current page can only move
 * forward — so no queued timer callback or late effect can un-reveal text, nor
 * drag the state back to a page the player has already left.
 *
 * Only the timer uses this. Deliberate page changes go through `startPage` or
 * `revealPageFully`, which is what keeps "stale" and "intended" distinguishable.
 */
export function revealTo(prev: DialogueReveal, pageKey: string, chars: number): DialogueReveal {
  if (prev.pageKey !== pageKey) return prev;
  const next = Math.max(0, chars);
  if (next <= prev.chars) return prev;
  return { pageKey, chars: next };
}

/** Begins a page at zero revealed characters, replacing any earlier page. */
export function startPage(pageKey: string): DialogueReveal {
  return { pageKey, chars: 0 };
}

/**
 * Shows a page in full immediately: the player pressing "Show all", a rewind to
 * an already-read page, or reduced motion. Always wins, because it is an
 * explicit intent rather than a queued side effect.
 */
export function revealPageFully(pageKey: string, chars: number): DialogueReveal {
  return { pageKey, chars: Math.max(0, chars) };
}

export type DialogueFooterLabel = "Show all" | "Next" | "Close" | "Continue";

export function dialogueFooterLabel(input: {
  isTyping: boolean;
  isLastPage: boolean;
  talkFailed: boolean;
  isCompletion: boolean;
}): DialogueFooterLabel {
  if (input.isTyping) return "Show all";
  if (!input.isLastPage) return "Next";
  if (input.talkFailed) return "Close";
  return input.isCompletion ? "Continue" : "Close";
}
