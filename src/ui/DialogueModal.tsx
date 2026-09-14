import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ContentRegistry } from "../content/ContentRegistry";
import type {
  ConversationSegment,
  QuestRewardDefinition,
  QuestTurnInCost
} from "../simulation/core/QuestTypes";
import {
  buildDialoguePages,
  pageShowsRewards,
  segmentHeading,
  type DialoguePage,
  type DialogueTalkResult
} from "./dialogueConversation";
import {
  IconCoin,
  IconSprout,
  IconFish,
  IconTools,
  IconBoat,
  IconCompass,
  IconBasket, HudIcon} from "./components/HudIcons";
import {
  EMPTY_DIALOGUE_REVEAL,
  dialogueFooterLabel,
  dialoguePageKey,
  revealPageFully,
  revealTo,
  revealedCharsFor,
  startPage,
  type DialogueReveal
} from "./dialogueTypewriter";
import { useModalAccessibility } from "./useModalAccessibility";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForItem, atlasForPortrait } from "./chrome/uiAtlas";
import { ChromeButton, ChromeClose } from "./chrome/Chrome";
import { GameSheet, KeyHint } from "./coastal/CoastalUI";
import { playUiSound } from "./audio/uiAudio";

export type { DialogueTalkResult } from "./dialogueConversation";

export interface DialogueModalProps {
  npcId: string;
  onClose: () => void;
  onTalkNpc: (npcId: string) => DialogueTalkResult;
  /**
   * Sound cue for the typewriter tick (played every 6th revealed character).
   * Defaults to "click"; pass a softer cue to quiet the chatter.
   */
  typewriterTickCue?: string;
}

/** Stable identity so an unresolved render never re-triggers page effects. */
const EMPTY_PAGES: DialoguePage[] = [];

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getSkillIcon(skill: string) {
  switch (skill.toLowerCase()) {
    case "farming":
      return <IconSprout size={16} aria-hidden />;
    case "fishing":
      return <IconFish size={16} aria-hidden />;
    case "processing":
      return <IconTools size={16} aria-hidden />;
    case "sailing":
      return <IconBoat size={16} aria-hidden />;
    default:
      return <IconSprout size={16} aria-hidden />;
  }
}

function featureUnlockLabel(featureId: string): string {
  if (featureId === "boat.player_rowboat") return "Wooden Rowboat";
  if (featureId === "feature.expedition_planner") return "Expedition Board";
  if (featureId === "feature.irrigation_zone") return "Field Irrigation";
  if (featureId === "feature.maritime_guild_charter") return "Maritime Guild Charter";
  return "New coastal opportunity";
}

/** What a completion beat granted, and what the player handed over to settle it. */
export const DialogueRewardsPanel: React.FC<{ rewards?: QuestRewardDefinition; paid?: QuestTurnInCost }> = ({ rewards, paid }) => {
  const paidItems = paid?.items ?? [];
  return (
    <div className="dialogue-rewards-panel" data-testid="dialogue-rewards">
      <span className="dialogue-rewards-title">Rewards received</span>
      <div className="dialogue-rewards-list">
        {rewards?.money ? (
          <span className="dialogue-reward-pill money dialogue-reward-pill-enter" style={{ animationDelay: "0ms" }}>
            <IconCoin size={16} aria-hidden />
            <span className="dialogue-reward-qty">+{rewards.money}</span>
            <span className="dialogue-reward-label">Coins</span>
          </span>
        ) : null}
        {rewards?.items?.map((item, idx) => {
          const itemDef = ContentRegistry.items.get(item.itemId);
          const sprite = atlasForItem(item.itemId);
          return (
            <span
              key={item.itemId}
              className="dialogue-reward-pill item dialogue-reward-pill-enter"
              style={{ animationDelay: `${(idx + 1) * 60}ms` }}
            >
              {sprite ? (
                <AtlasImage src={sprite} alt="" size={18} className="dialogue-reward-icon" />
              ) : (
                <IconBasket size={16} aria-hidden />
              )}
              <span className="dialogue-reward-qty">+{item.quantity}</span>
              <span className="dialogue-reward-label">{itemDef?.name || item.itemId}</span>
            </span>
          );
        })}
        {rewards?.skillXp?.map((xp, idx) => (
          <span
            key={xp.skill}
            className="dialogue-reward-pill xp dialogue-reward-pill-enter"
            style={{ animationDelay: `${(idx + 2) * 60}ms` }}
          >
            {getSkillIcon(xp.skill)}
            <span className="dialogue-reward-qty">+{xp.xp}</span>
            <span className="dialogue-reward-label">{xp.skill.toUpperCase()} XP</span>
          </span>
        ))}
        {rewards?.unlocksFeatureIds?.map((featureId) => (
          <span key={featureId} className="dialogue-reward-pill unlock dialogue-reward-pill-enter" style={{ animationDelay: "180ms" }}>
            <IconCompass size={16} aria-hidden />
            <span className="dialogue-reward-label">
              Now available · {featureUnlockLabel(featureId)}
            </span>
          </span>
        ))}
        {rewards?.unlocksKnowledgeIds
          ?.filter((knowledgeId) => !rewards.unlocksFeatureIds?.includes(knowledgeId))
          .map((knowledgeId) => (
            <span key={knowledgeId} className="dialogue-reward-pill unlock dialogue-reward-pill-enter" style={{ animationDelay: "220ms" }}>
              <IconCompass size={16} aria-hidden />
              <span className="dialogue-reward-label">
                Journal · {ContentRegistry.knowledge.get(knowledgeId)?.title ?? "New field note"}
              </span>
            </span>
          ))}
      </div>
      {(paid?.money || paidItems.length > 0) ? (
        <div className="dialogue-paid-row" data-testid="dialogue-paid">
          <span className="dialogue-rewards-title">Handed over</span>
          <span className="dialogue-paid-list">
            {[
              ...(paid?.money ? [`${paid.money} G`] : []),
              ...paidItems.map((item) => `${item.quantity} ${ContentRegistry.items.get(item.itemId)?.name ?? item.itemId}`)
            ].join(" · ")}
          </span>
        </div>
      ) : null}
    </div>
  );
};

export const DialogueModal: React.FC<DialogueModalProps> = ({
  npcId,
  onClose,
  onTalkNpc,
  typewriterTickCue = "click"
}) => {
  const npc = ContentRegistry.npcs.get(npcId);
  const [dialogueIndex, setDialogueIndex] = useState(0);
  // Resolved once per NPC. Pre-seeding this with `npc.idleDialogue` used to
  // start the typewriter on text the modal was about to replace, which
  // restarted the reveal and bounced the footer label back to "Show all".
  const [resolved, setResolved] = useState<{ npcId: string; generation: number; pages: DialoguePage[]; failed: boolean } | null>(null);
  const [reveal, setReveal] = useState<DialogueReveal>(EMPTY_DIALOGUE_REVEAL);
  const initializedNpcRef = useRef<string | null>(null);
  const chimedSegmentsRef = useRef(new Set<ConversationSegment>());
  const dialogRef = useRef<HTMLDivElement>(null);
  // Focus the dialog itself, not the close button: with the button focused,
  // Space closed the conversation instead of advancing it.
  useModalAccessibility(dialogRef, onClose, { initialFocus: "dialog" });

  useEffect(() => {
    if (initializedNpcRef.current === npcId) return;
    initializedNpcRef.current = npcId;
    setDialogueIndex(0);
    setReveal(EMPTY_DIALOGUE_REVEAL);
    chimedSegmentsRef.current = new Set();
    const result = onTalkNpc(npcId);
    const pages = buildDialoguePages(result, npc?.idleDialogue ?? []);
    setResolved((prev) => ({ npcId, generation: (prev?.generation ?? 0) + 1, pages, failed: !result.success }));
  }, [npc, npcId, onTalkNpc]);

  const isResolved = resolved?.npcId === npcId;
  const pages = isResolved ? resolved.pages : EMPTY_PAGES;
  const talkFailed = isResolved ? resolved.failed : false;
  const totalPages = pages.length || 1;
  const currentPage: DialoguePage | undefined = pages[dialogueIndex];
  const currentPageText = currentPage?.text || "Good tide to you.";
  const isLastPage = dialogueIndex >= totalPages - 1;
  const segment = currentPage?.segment;
  const isCompletionSegment = segment?.kind === "completion";
  const heading = segment ? segmentHeading(segment) : null;
  const showRewards = pageShowsRewards(currentPage);
  const note = currentPage?.closesSegment ? segment?.note : undefined;
  const pageKey = dialoguePageKey(npcId, resolved?.generation ?? 0, dialogueIndex);
  const revealedChars = revealedCharsFor(reveal, pageKey);
  const isTyping = revealedChars < currentPageText.length;
  const visibleText = currentPageText.slice(0, revealedChars);
  const typewriterTimerRef = useRef<number | null>(null);
  // Read through refs so a parent changing the cue mid-page cannot restart the
  // reveal; the effect below depends on the page identity alone.
  const pageTextRef = useRef(currentPageText);
  pageTextRef.current = currentPageText;
  const tickCueRef = useRef(typewriterTickCue);
  tickCueRef.current = typewriterTickCue;
  /** Set by the page-dot rewind to show an already-read page in full. */
  const instantRevealKeyRef = useRef<string | null>(null);

  // Page dots group by segment so a chained conversation shows its beats.
  const segmentStarts = useMemo(
    () => new Set(pages.flatMap((page, index) => (page.opensSegment && index > 0 ? [index] : []))),
    [pages]
  );

  useEffect(() => {
    if (typewriterTimerRef.current !== null) {
      window.clearInterval(typewriterTimerRef.current);
      typewriterTimerRef.current = null;
    }
    // Nothing to type until the conversation has actually resolved. Starting
    // early is what used to make the reveal restart when the text arrived.
    if (!isResolved) return;

    const pageText = pageTextRef.current;
    if (prefersReducedMotion() || instantRevealKeyRef.current === pageKey) {
      instantRevealKeyRef.current = null;
      setReveal(revealPageFully(pageKey, pageText.length));
      return;
    }
    setReveal(startPage(pageKey));
    let shown = 0;
    let tickCounter = 0;
    const id = window.setInterval(() => {
      shown += 1;
      setReveal((prev) => revealTo(prev, pageKey, shown));
      tickCounter += 1;
      if (tickCounter % 6 === 0 && shown < pageText.length) {
        const char = pageText[shown - 1];
        if (char && char.trim().length > 0) {
          playUiSound(tickCueRef.current);
        }
      }
      if (shown >= pageText.length) {
        window.clearInterval(id);
        if (typewriterTimerRef.current === id) {
          typewriterTimerRef.current = null;
        }
      }
    }, 18);
    typewriterTimerRef.current = id;
    return () => {
      window.clearInterval(id);
      if (typewriterTimerRef.current === id) {
        typewriterTimerRef.current = null;
      }
    };
  }, [isResolved, pageKey]);

  // One chime per completed errand, when its first page comes up.
  useEffect(() => {
    if (!segment || segment.kind !== "completion" || chimedSegmentsRef.current.has(segment)) return;
    chimedSegmentsRef.current.add(segment);
    playUiSound("chime");
  }, [segment]);

  const handleNext = useCallback((playCue = false) => {
    if (isTyping) {
      if (typewriterTimerRef.current !== null) {
        window.clearInterval(typewriterTimerRef.current);
        typewriterTimerRef.current = null;
      }
      setReveal(revealPageFully(pageKey, currentPageText.length));
      if (playCue) playUiSound("click");
      return;
    }
    if (isLastPage) {
      if (playCue) playUiSound("confirm");
      onClose();
      return;
    }
    if (playCue) playUiSound("page-turn");
    setDialogueIndex((prev) => prev + 1);
  }, [currentPageText.length, isLastPage, isTyping, onClose, pageKey]);

  const handleSkipTalk = useCallback(() => {
    playUiSound("confirm");
    onClose();
  }, [onClose]);

  const handleNextRef = useRef(handleNext);
  handleNextRef.current = handleNext;
  const handleSkipTalkRef = useRef(handleSkipTalk);
  handleSkipTalkRef.current = handleSkipTalk;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleSkipTalkRef.current();
        return;
      }
      if (e.target instanceof Element && e.target.closest("button, input, select, textarea, a[href], [contenteditable='true']")) {
        return;
      }
      if (e.key === "Enter" || e.key === " " || e.key === "e" || e.key === "E") {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) {
          handleNextRef.current(true);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, []);

  if (!npc) return null;

  return (
    <div className="modal-overlay dialogue-backdrop interactive" onClick={onClose}>
      <GameSheet
        ref={dialogRef}
        as="div"
        className="dialogue-card"
        tone="slate"
        corners
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialogue-title"
        tabIndex={-1}
      >
        <header className="dialogue-header">
          <div className="dialogue-avatar" aria-hidden="true">
            {atlasForPortrait(npc.id) ? (
              <AtlasImage src={atlasForPortrait(npc.id)} alt="" size={72} />
            ) : (
              <span className="dialogue-avatar-icon"><HudIcon name={npc.portraitIcon} size={26} /></span>
            )}
          </div>
          <div className="dialogue-speaker-info">
            <div className="dialogue-name-row">
              <h2 id="dialogue-title" className="dialogue-speaker-name">{npc.name}</h2>
              <span className="dialogue-role-badge">{npc.title}</span>
            </div>
            <span className="dialogue-district">{npc.district}</span>
          </div>
          <ChromeClose onClick={onClose} label="Close conversation" />
        </header>

        <div className="dialogue-body" onClick={() => handleNext(true)}>
          {heading && (
            <span
              className={`dialogue-thread-heading dialogue-thread-heading--${segment?.kind ?? "intro"}`}
              data-testid="dialogue-thread-heading"
            >
              {heading}
            </span>
          )}
          <p className={`dialogue-text${isTyping ? " is-typing" : ""}`} data-testid="dialogue-text">
            {visibleText}
          </p>
          {note && !isTyping && (
            <p className="dialogue-note" data-testid="dialogue-note">{note}</p>
          )}
        </div>

        {showRewards && segment && <DialogueRewardsPanel rewards={segment.rewards} paid={segment.paid} />}

        <footer className="dialogue-footer">
          {/* Page dots sit in the footer's empty left side so the words keep
              the body's full height, reward plate or not. */}
          {totalPages > 1 && (
            <div className="dialogue-page-dots" aria-label={`Page ${dialogueIndex + 1} of ${totalPages}`}>
              {pages.map((_, i) => {
                const gap = segmentStarts.has(i) ? " starts-beat" : "";
                return i < dialogueIndex ? (
                  <button
                    key={i}
                    type="button"
                    className={`dialogue-dot is-past${gap}`}
                    aria-label={`Return to page ${i + 1}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (typewriterTimerRef.current !== null) {
                        window.clearInterval(typewriterTimerRef.current);
                        typewriterTimerRef.current = null;
                      }
                      // A page the player has already read is shown in full
                      // rather than retyped.
                      instantRevealKeyRef.current = dialoguePageKey(
                        npcId,
                        resolved?.generation ?? 0,
                        i
                      );
                      setDialogueIndex(i);
                    }}
                  />
                ) : (
                  <span
                    key={i}
                    className={`dialogue-dot${i === dialogueIndex ? " active" : ""}${gap}`}
                    aria-hidden="true"
                  />
                );
              })}
            </div>
          )}
          <div className="dialogue-footer-right">
            <ChromeButton
              variant="primary"
              className={`dialogue-action-btn ${isCompletionSegment && isLastPage && !isTyping ? "is-completion" : ""}`}
              soundCue={isTyping ? "click" : isLastPage ? "confirm" : "page-turn"}
              onClick={() => handleNext(false)}
            >
              <KeyHint keyName="Space" glow={isTyping} />
              <span>
                {dialogueFooterLabel({ isTyping, isLastPage, talkFailed, isCompletion: isCompletionSegment })}
              </span>
            </ChromeButton>
          </div>
        </footer>
      </GameSheet>
    </div>
  );
};
