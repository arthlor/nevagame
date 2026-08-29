// src/ui/DialogueModal.tsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { ContentRegistry } from "../content/ContentRegistry";
import type { GameState } from "../simulation/core/types";
import type { ActiveQuestDto } from "../simulation/core/QuestTypes";
import {
  IconCoin,
  IconSprout,
  IconFish,
  IconTools,
  IconBoat,
  IconCompass,
  IconBasket
} from "./components/HudIcons";
import { useModalAccessibility } from "./useModalAccessibility";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForItem, atlasForPortrait } from "./chrome/uiAtlas";
import { ChromeButton, ChromeClose, ChromeKeycap, ChromePanel } from "./chrome/Chrome";
import { playUiSound } from "./audio/uiAudio";

export interface DialogueModalProps {
  npcId: string;
  state: GameState;
  onClose: () => void;
  onTalkNpc: (npcId: string) => {
    success: boolean;
    dialogue?: string[];
    isCompletion?: boolean;
    questCompleted?: boolean;
    rewardsGiven?: boolean;
    reason?: string;
  };
  activeQuest: ActiveQuestDto | null;
}

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

export const DialogueModal: React.FC<DialogueModalProps> = ({
  npcId,
  onClose,
  onTalkNpc,
  activeQuest
}) => {
  const npc = ContentRegistry.npcs.get(npcId);
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const [dialoguePages, setDialoguePages] = useState<string[]>(() => npc?.idleDialogue ?? []);
  const [isCompletion, setIsCompletion] = useState(false);
  const [rewardsClaimed, setRewardsClaimed] = useState(false);
  const [completionQuest, setCompletionQuest] = useState<ActiveQuestDto | null>(null);
  const [revealedChars, setRevealedChars] = useState(0);
  const initializedNpcRef = useRef<string | null>(null);
  const chimePlayedRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const spaceHoldTimerRef = useRef<number | null>(null);
  useModalAccessibility(dialogRef, onClose);

  useEffect(() => {
    if (initializedNpcRef.current === npcId) return;
    initializedNpcRef.current = npcId;
    const questSnapshot = activeQuest;
    const res = onTalkNpc(npcId);
    if (!res.success) {
      setDialoguePages([res.reason ?? "Move closer to talk to this person."]);
    } else if (res.dialogue && res.dialogue.length > 0) {
      setDialoguePages(res.dialogue);
    } else if (npc) {
      setDialoguePages(npc.idleDialogue);
    }
    if (res.isCompletion && res.questCompleted) {
      setIsCompletion(true);
      setCompletionQuest(questSnapshot);
    }
    if (res.rewardsGiven) {
      setRewardsClaimed(true);
    }
  }, [activeQuest, npc, npcId, onTalkNpc]);

  const totalPages = dialoguePages.length || 1;
  const currentPageText = dialoguePages[dialogueIndex] || "Hello traveler!";
  const isLastPage = dialogueIndex >= totalPages - 1;
  const isTyping = revealedChars < currentPageText.length;
  const visibleText = currentPageText.slice(0, revealedChars);

  // Typewriter effect with throttled soft audio chatter
  useEffect(() => {
    if (prefersReducedMotion()) {
      setRevealedChars(currentPageText.length);
      return;
    }
    setRevealedChars(0);
    let shown = 0;
    let tickCounter = 0;
    const id = window.setInterval(() => {
      shown += 1;
      setRevealedChars(shown);
      tickCounter += 1;
      // Soft audio tick every 4 characters on non-whitespace
      if (tickCounter % 4 === 0 && shown < currentPageText.length) {
        const char = currentPageText[shown - 1];
        if (char && char.trim().length > 0) {
          playUiSound("click");
        }
      }
      if (shown >= currentPageText.length) {
        window.clearInterval(id);
      }
    }, 18);
    return () => window.clearInterval(id);
  }, [currentPageText, dialogueIndex]);

  useEffect(() => {
    if (isCompletion && !chimePlayedRef.current) {
      chimePlayedRef.current = true;
      playUiSound("chime");
    }
  }, [isCompletion]);

  const handleNext = useCallback((playCue = false) => {
    if (isTyping) {
      // Step 1: Instantly reveal full text
      setRevealedChars(currentPageText.length);
      if (playCue) playUiSound("click");
      return;
    }
    // Step 2: Advance to next page or finish
    if (isLastPage) {
      if (playCue) playUiSound("confirm");
      onClose();
      return;
    }
    if (playCue) playUiSound("page-turn");
    setDialogueIndex((prev) => prev + 1);
  }, [currentPageText.length, isLastPage, isTyping, onClose]);

  const handleSkipTalk = useCallback(() => {
    playUiSound("confirm");
    onClose();
  }, [onClose]);

  const handleNextRef = useRef(handleNext);
  handleNextRef.current = handleNext;
  const handleSkipTalkRef = useRef(handleSkipTalk);
  handleSkipTalkRef.current = handleSkipTalk;

  // Keyboard navigation: Space/Enter/E for 2-step reveal & hold-to-skip, Esc for instant skip
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleSkipTalkRef.current();
        return;
      }
      if (e.key === "Enter" || e.key === " " || e.key === "e" || e.key === "E") {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) {
          handleNextRef.current(true);
          if (e.key === " ") {
            if (spaceHoldTimerRef.current) window.clearTimeout(spaceHoldTimerRef.current);
            spaceHoldTimerRef.current = window.setTimeout(() => {
              handleSkipTalkRef.current();
            }, 350);
          }
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        if (spaceHoldTimerRef.current) {
          window.clearTimeout(spaceHoldTimerRef.current);
          spaceHoldTimerRef.current = null;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      if (spaceHoldTimerRef.current) {
        window.clearTimeout(spaceHoldTimerRef.current);
        spaceHoldTimerRef.current = null;
      }
    };
  }, []);

  if (!npc) return null;

  return (
    <div className="dialogue-backdrop interactive" onClick={onClose}>
      <ChromePanel
        ref={dialogRef}
        as="div"
        className="dialogue-card"
        tone="slate"
        flourish
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
              <span className="dialogue-avatar-icon">{npc.portraitIcon}</span>
            )}
          </div>
          <div className="dialogue-speaker-info">
            <div className="dialogue-name-row">
              <h2 id="dialogue-title" className="dialogue-speaker-name">{npc.name}</h2>
              <span className="dialogue-role-badge">{npc.title}</span>
            </div>
            <span className="dialogue-district">{npc.district}</span>
          </div>
          <ChromeClose onClick={onClose} label="Close dialogue" className="dialogue-close-btn" />
        </header>

        <div className="dialogue-body" onClick={() => handleNext(true)}>
          <p className={`dialogue-text${isTyping ? " is-typing" : ""}`} data-testid="dialogue-text">
            {visibleText}
          </p>
          {totalPages > 1 && (
            <div className="dialogue-page-dots">
              {dialoguePages.map((_, i) => (
                <button
                  type="button"
                  key={i}
                  className={`dialogue-dot ${i === dialogueIndex ? "active" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    playUiSound("page-turn");
                    setDialogueIndex(i);
                  }}
                  aria-label={`Go to dialogue page ${i + 1}`}
                  aria-current={i === dialogueIndex ? "step" : undefined}
                />
              ))}
            </div>
          )}
        </div>

        {isCompletion && completionQuest?.rewards && (
          <div className="dialogue-rewards-panel" data-testid="dialogue-rewards">
            <span className="dialogue-rewards-title">
              {rewardsClaimed ? "Rewards received" : "Quest rewards"}
            </span>
            <div className="dialogue-rewards-list">
              {completionQuest.rewards.money && (
                <span
                  className="dialogue-reward-pill money dialogue-reward-pill-enter"
                  style={{ animationDelay: "0ms" }}
                >
                  <IconCoin size={16} aria-hidden />
                  <span className="dialogue-reward-qty">+{completionQuest.rewards.money}</span>
                  <span className="dialogue-reward-label">Coins</span>
                </span>
              )}
              {completionQuest.rewards.items?.map((item, idx) => {
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
              {completionQuest.rewards.skillXp?.map((xp, idx) => (
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
              {completionQuest.rewards.unlocksFeature && (
                <span
                  className="dialogue-reward-pill unlock dialogue-reward-pill-enter"
                  style={{ animationDelay: "180ms" }}
                >
                  <IconCompass size={16} aria-hidden />
                  <span className="dialogue-reward-label">
                    Unlocked: {completionQuest.rewards.unlocksFeature.replace("feature.", "").replace("_", " ")}
                  </span>
                </span>
              )}
            </div>
          </div>
        )}

        <footer className="dialogue-footer">
          <div className="dialogue-footer-left">
            <span className="dialogue-key-hint">
              <ChromeKeycap keyName="Space" glow={isTyping} />{" "}
              <span className="dialogue-hint-label">
                {isCompletion && isLastPage && !isTyping ? "Complete" : "Continue"}
              </span>
            </span>
            <button
              type="button"
              className="dialogue-skip-link"
              onClick={handleSkipTalk}
              data-testid="dialogue-skip-talk"
            >
              <ChromeKeycap keyName="Esc" /> Skip talk
            </button>
          </div>

          <div className="dialogue-footer-right">
            <ChromeButton
              variant="primary"
              className={`dialogue-action-btn ${isCompletion && isLastPage && !isTyping ? "is-completion" : ""}`}
              soundCue={isTyping ? "click" : isLastPage ? "confirm" : "page-turn"}
              onClick={() => handleNext(false)}
            >
              <ChromeKeycap keyName="Space" glow={isTyping} />
              <span>
                {isTyping
                  ? "Show all"
                  : isLastPage
                  ? (isCompletion ? "Claim & Finish" : "Complete")
                  : "Next"}
              </span>
            </ChromeButton>
          </div>
        </footer>
      </ChromePanel>
    </div>
  );
};

