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
import { foundNoteView } from "../content/foundNotes";
import { localizeQuestSegment } from "../i18n/questObjectives";

export type { DialogueTalkResult } from "./dialogueConversation";

export interface DialogueModalProps {
  npcId?: string;
  foundNoteId?: string | null;
  onClose: () => void;
  onTalkNpc?: (npcId: string) => DialogueTalkResult;
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

import { useTranslation } from "../i18n/useTranslation";

function featureUnlockLabel(featureId: string, locale?: string): string {
  const isTr = locale === "tr";
  if (featureId === "boat.player_rowboat") return isTr ? "Ahşap Filika" : "Wooden Rowboat";
  if (featureId === "feature.expedition_planner") return isTr ? "Sefer Panosu" : "Expedition Board";
  if (featureId === "feature.irrigation_zone") return isTr ? "Tarla Sulama Tulumbası" : "Field Irrigation";
  if (featureId === "feature.maritime_guild_charter") return isTr ? "Denizcilik Beratı" : "Maritime Guild Charter";
  return isTr ? "Yeni kıyı imkânı" : "New coastal opportunity";
}

/** What a completion beat granted, and what the player handed over to settle it. */
export const DialogueRewardsPanel: React.FC<{ rewards?: QuestRewardDefinition; paid?: QuestTurnInCost }> = ({ rewards, paid }) => {
  const { locale, getLocalizedItem, getLocalizedKnowledge, getLocalizedSkill } = useTranslation();
  const paidItems = paid?.items ?? [];
  const isTr = locale === "tr";
  return (
    <div className="dialogue-rewards-panel" data-testid="dialogue-rewards">
      <span className="dialogue-rewards-title">{isTr ? "Kazanılanlar" : "Received"}</span>
      <div className="dialogue-rewards-list">
        {rewards?.money ? (
          <span className="dialogue-reward-pill money dialogue-reward-pill-enter" style={{ animationDelay: "0ms" }}>
            <IconCoin size={16} aria-hidden />
            <span className="dialogue-reward-qty">+{rewards.money}</span>
            <span className="dialogue-reward-label">{isTr ? "Altın" : "Coins"}</span>
          </span>
        ) : null}
        {rewards?.items?.map((item, idx) => {
          const itemDef = ContentRegistry.items.get(item.itemId);
          const locItem = getLocalizedItem(item.itemId);
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
              <span className="dialogue-reward-label">{locItem?.name || itemDef?.name || item.itemId}</span>
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
            <span className="dialogue-reward-label">{getLocalizedSkill(xp.skill).name} XP</span>
          </span>
        ))}
        {rewards?.unlocksFeatureIds?.map((featureId) => (
          <span key={featureId} className="dialogue-reward-pill unlock dialogue-reward-pill-enter" style={{ animationDelay: "180ms" }}>
            <IconCompass size={16} aria-hidden />
            <span className="dialogue-reward-label">
              {isTr ? "Artık açık · " : "Now available · "}{featureUnlockLabel(featureId, locale)}
            </span>
          </span>
        ))}
        {rewards?.unlocksKnowledgeIds
          ?.filter((knowledgeId) => !rewards.unlocksFeatureIds?.includes(knowledgeId))
          .map((knowledgeId) => (
            <span key={knowledgeId} className="dialogue-reward-pill unlock dialogue-reward-pill-enter" style={{ animationDelay: "220ms" }}>
              <IconCompass size={16} aria-hidden />
              <span className="dialogue-reward-label">
                {isTr ? "Günlük · " : "Journal · "}{getLocalizedKnowledge(knowledgeId)?.title ?? ContentRegistry.knowledge.get(knowledgeId)?.title ?? "New field note"}
              </span>
            </span>
          ))}
      </div>
      {(paid?.money || paidItems.length > 0) ? (
        <div className="dialogue-paid-row" data-testid="dialogue-paid">
          <span className="dialogue-rewards-title">{isTr ? "Teslim edilenler" : "Handed over"}</span>
          <span className="dialogue-paid-list">
            {[
              ...(paid?.money ? [`${paid.money} G`] : []),
              ...paidItems.map((item) => `${item.quantity} ${getLocalizedItem(item.itemId)?.name ?? ContentRegistry.items.get(item.itemId)?.name ?? item.itemId}`)
            ].join(" · ")}
          </span>
        </div>
      ) : null}
    </div>
  );
};

export const DialogueModal: React.FC<DialogueModalProps> = ({
  npcId,
  foundNoteId,
  onClose,
  onTalkNpc
}) => {
  const { locale, getLocalizedNpc } = useTranslation();
  const foundNote = useMemo(
    () => (foundNoteId ? foundNoteView(foundNoteId, locale) : null),
    [foundNoteId, locale]
  );
  const sessionKey = foundNote ? `${foundNote.id}:${locale}` : (npcId ?? "");
  const npc = foundNote || !npcId ? undefined : ContentRegistry.npcs.get(npcId);
  const locNpc = foundNote || !npcId ? null : getLocalizedNpc(npcId);
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
    if (!sessionKey || initializedNpcRef.current === sessionKey) return;
    initializedNpcRef.current = sessionKey;
    setDialogueIndex(0);
    setReveal(EMPTY_DIALOGUE_REVEAL);
    chimedSegmentsRef.current = new Set();
    if (foundNote) {
      const pages = buildDialoguePages({
        success: true,
        segments: [{ kind: "recognition", lines: [...foundNote.lines] }]
      }, [...foundNote.lines]);
      setResolved((prev) => ({ npcId: sessionKey, generation: (prev?.generation ?? 0) + 1, pages, failed: false }));
      return;
    }
    if (!npcId || !onTalkNpc || !locNpc) return;
    const rawResult = onTalkNpc(npcId);
    let result = rawResult;
    if (locale === "tr" && rawResult.segments) {
      const localizedSegments = rawResult.segments.map((seg) => {
        const copy = localizeQuestSegment(seg, locale);
        if (!copy.questId && copy.kind === "recognition") {
          const idleIdx = npc?.idleDialogue.findIndex((l) => copy.lines.includes(l));
          if (idleIdx !== undefined && idleIdx >= 0 && locNpc.idleDialogue[idleIdx]) {
            copy.lines = [locNpc.idleDialogue[idleIdx]];
          } else if (npc?.recognitionDialogue && locNpc.recognitionDialogue) {
            const recMatch = npc.recognitionDialogue.find((r) => r.lines[0] === copy.lines[0]);
            if (recMatch) {
              const trRec = locNpc.recognitionDialogue.find((r) => r.id === recMatch.id);
              if (trRec) copy.lines = trRec.lines;
            }
          }
        }
        return copy;
      });
      result = { ...rawResult, segments: localizedSegments };
    }
    const fallbackLines = locale === "tr" ? locNpc.idleDialogue : (npc?.idleDialogue ?? []);
    const pages = buildDialoguePages(result, fallbackLines);
    setResolved((prev) => ({ npcId: sessionKey, generation: (prev?.generation ?? 0) + 1, pages, failed: !result.success }));
  }, [foundNote, getLocalizedNpc, locNpc, locale, npc, npcId, onTalkNpc, sessionKey]);

  const isResolved = resolved?.npcId === sessionKey;
  const pages = isResolved ? resolved.pages : EMPTY_PAGES;
  const talkFailed = isResolved ? resolved.failed : false;
  const totalPages = pages.length || 1;
  const currentPage: DialoguePage | undefined = pages[dialogueIndex];
  const currentPageText = currentPage?.text || "Good tide to you.";
  const isLastPage = dialogueIndex >= totalPages - 1;
  const segment = currentPage?.segment;
  const isCompletionSegment = segment?.kind === "completion";
  const heading = segment ? segmentHeading(segment, locale) : null;
  const showRewards = pageShowsRewards(currentPage);
  const note = currentPage?.closesSegment ? segment?.note : undefined;
  const pageKey = dialoguePageKey(sessionKey, resolved?.generation ?? 0, dialogueIndex);
  const revealedChars = revealedCharsFor(reveal, pageKey);
  const isTyping = revealedChars < currentPageText.length;
  const visibleText = currentPageText.slice(0, revealedChars);
  const typewriterTimerRef = useRef<number | null>(null);
  // Read through refs so a parent changing the cue mid-page cannot restart the
  // reveal; the effect below depends on the page identity alone.
  const pageTextRef = useRef(currentPageText);
  pageTextRef.current = currentPageText;
  /** Set by the page-dot rewind to show an already-read page in full. */
  const instantRevealKeyRef = useRef<string | null>(null);

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
    const id = window.setInterval(() => {
      shown += 1;
      setReveal((prev) => revealTo(prev, pageKey, shown));
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
      if (playCue) playUiSound("dialogue-close");
      onClose();
      return;
    }
    if (playCue) playUiSound("page-turn");
    setDialogueIndex((prev) => prev + 1);
  }, [currentPageText.length, isLastPage, isTyping, onClose, pageKey]);

  const handleSkipTalk = useCallback(() => {
    playUiSound("dialogue-close");
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

  if (!foundNote && !npc) return null;

  return (
    <div className="modal-overlay dialogue-backdrop interactive" onClick={() => { playUiSound("dialogue-close"); onClose(); }}>
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
          {foundNote ? (
            <div className="dialogue-speaker-info">
              <h2 id="dialogue-title" className="dialogue-speaker-name">{foundNote.title}</h2>
            </div>
          ) : npc && locNpc ? (
            <>
              <div className="dialogue-avatar" aria-hidden="true">
                {atlasForPortrait(npc.id) ? (
                  <AtlasImage src={atlasForPortrait(npc.id)} alt="" size={72} />
                ) : (
                  <span className="dialogue-avatar-icon"><HudIcon name={npc.portraitIcon} size={26} /></span>
                )}
              </div>
              <div className="dialogue-speaker-info">
                <div className="dialogue-name-row">
                  <h2 id="dialogue-title" className="dialogue-speaker-name">{locNpc.name}</h2>
                  <span className="dialogue-role-badge">{locNpc.title}</span>
                </div>
                <span className="dialogue-district">{locNpc.district}</span>
              </div>
            </>
          ) : null}
          <ChromeClose onClick={() => { playUiSound("dialogue-close"); onClose(); }} label={foundNote
            ? (locale === "tr" ? "Notu kapat" : "Close note")
            : (locale === "tr" ? "Sohbeti kapat" : "Close conversation")} />
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
          <p className={`dialogue-text${isTyping ? " is-typing" : ""}`} data-testid="dialogue-text" aria-hidden="true">
            {visibleText}
          </p>
          <p className="sr-only" aria-live="polite" aria-atomic="true">{isResolved ? currentPageText : ""}</p>
          {note && !isTyping && (
            <p className="dialogue-note" data-testid="dialogue-note">{note}</p>
          )}
        </div>

        {showRewards && segment && <DialogueRewardsPanel rewards={segment.rewards} paid={segment.paid} />}

        <footer className="dialogue-footer">
          {totalPages > 1 && (
            <div className="dialogue-pagination">
              <ChromeButton
                size="sm"
                variant="secondary"
                disabled={dialogueIndex === 0}
                aria-label={locale === "tr" ? "Önceki sayfa" : "Previous page"}
                onClick={() => {
                  if (typewriterTimerRef.current !== null) {
                    window.clearInterval(typewriterTimerRef.current);
                    typewriterTimerRef.current = null;
                  }
                  const previousIndex = Math.max(0, dialogueIndex - 1);
                  instantRevealKeyRef.current = dialoguePageKey(sessionKey, resolved?.generation ?? 0, previousIndex);
                  setDialogueIndex(previousIndex);
                }}
              >{locale === "tr" ? "Geri" : "Back"}</ChromeButton>
              <span aria-label={locale === "tr" ? `${totalPages} sayfanın ${dialogueIndex + 1}. sayfası` : `Page ${dialogueIndex + 1} of ${totalPages}`}>
                {dialogueIndex + 1} / {totalPages}
              </span>
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
                {dialogueFooterLabel({ isTyping, isLastPage, talkFailed, isCompletion: isCompletionSegment, locale })}
              </span>
            </ChromeButton>
          </div>
        </footer>
      </GameSheet>
    </div>
  );
};
