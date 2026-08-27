// src/ui/DialogueModal.tsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { ContentRegistry } from "../content/ContentRegistry";
import type { GameState } from "../simulation/core/types";
import type { ActiveQuestDto } from "../simulation/core/QuestTypes";
import { IconCoin } from "./components/HudIcons";
import { useModalAccessibility } from "./useModalAccessibility";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForPortrait } from "./chrome/uiAtlas";
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

  useEffect(() => {
    if (prefersReducedMotion()) {
      setRevealedChars(currentPageText.length);
      return;
    }
    setRevealedChars(0);
    let shown = 0;
    const id = window.setInterval(() => {
      shown += 1;
      setRevealedChars(shown);
      if (shown >= currentPageText.length) {
        window.clearInterval(id);
      }
    }, 16);
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
      setRevealedChars(currentPageText.length);
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
  }, [currentPageText.length, isLastPage, isTyping, onClose]);

  const handleNextRef = useRef(handleNext);
  handleNextRef.current = handleNext;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " " || e.key === "e" || e.key === "E") {
        e.preventDefault();
        e.stopPropagation();
        handleNextRef.current(true);
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
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

        <div className="dialogue-body">
          <p className={`dialogue-text${isTyping ? " is-typing" : ""}`} data-testid="dialogue-text">
            "{visibleText}"
          </p>
          {totalPages > 1 && (
            <div className="dialogue-page-dots">
              {dialoguePages.map((_, i) => (
                <button
                  type="button"
                  key={i}
                  className={`dialogue-dot ${i === dialogueIndex ? "active" : ""}`}
                  onClick={() => {
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
                <span className="dialogue-reward-pill money">
                  <IconCoin size={14} /> +{completionQuest.rewards.money} Coins
                </span>
              )}
              {completionQuest.rewards.items?.map((item) => {
                const itemDef = ContentRegistry.items.get(item.itemId);
                return (
                  <span key={item.itemId} className="dialogue-reward-pill item">
                    +{item.quantity} {itemDef?.name || item.itemId}
                  </span>
                );
              })}
              {completionQuest.rewards.skillXp?.map((xp) => (
                <span key={xp.skill} className="dialogue-reward-pill xp">
                  +{xp.xp} {xp.skill.toUpperCase()} XP
                </span>
              ))}
              {completionQuest.rewards.unlocksFeature && (
                <span className="dialogue-reward-pill unlock">
                  Unlocked: {completionQuest.rewards.unlocksFeature.replace("feature.", "").replace("_", " ")}
                </span>
              )}
            </div>
          </div>
        )}

        <footer className="dialogue-footer">
          <span className="dialogue-key-hint">
            <ChromeKeycap keyName="Space" glow={isTyping} /> Continue
          </span>
          <ChromeButton
            variant="primary"
            className="dialogue-action-btn"
            soundCue={isTyping ? "click" : isLastPage ? "confirm" : "page-turn"}
            onClick={() => handleNext(false)}
          >
            {isTyping ? "Skip" : isLastPage ? (isCompletion ? "Complete" : "Continue") : "Next"}
          </ChromeButton>
        </footer>
      </ChromePanel>
    </div>
  );
};
