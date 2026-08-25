// src/ui/DialogueModal.tsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { ContentRegistry } from "../content/ContentRegistry";
import type { GameState } from "../simulation/core/types";
import type { ActiveQuestDto } from "../simulation/core/QuestTypes";
import { IconCoin } from "./components/HudIcons";

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

export const DialogueModal: React.FC<DialogueModalProps> = ({
  npcId,
  onClose,
  onTalkNpc,
  activeQuest
}) => {
  const npc = ContentRegistry.npcs.get(npcId);
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const [dialoguePages, setDialoguePages] = useState<string[]>([]);
  const [isCompletion, setIsCompletion] = useState(false);
  const [rewardsClaimed, setRewardsClaimed] = useState(false);
  const [completionQuest, setCompletionQuest] = useState<ActiveQuestDto | null>(null);
  const initializedNpcRef = useRef<string | null>(null);

  // Initialize dialogue on mount
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

  const handleNext = useCallback(() => {
    if (isLastPage) {
      onClose();
    } else {
      setDialogueIndex((prev) => prev + 1);
    }
  }, [isLastPage, onClose]);

  // Keyboard navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " " || e.key === "e" || e.key === "E") {
        e.preventDefault();
        e.stopPropagation();
        handleNext();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [handleNext, onClose]);

  if (!npc) return null;

  return (
    <div className="dialogue-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="dialogue-card" onClick={(e) => e.stopPropagation()}>
        {/* Header with portrait and titles */}
        <header className="dialogue-header">
          <div className="dialogue-avatar">
            <span className="dialogue-avatar-icon">{npc.portraitIcon}</span>
          </div>
          <div className="dialogue-speaker-info">
            <div className="dialogue-name-row">
              <h2 className="dialogue-speaker-name">{npc.name}</h2>
              <span className="dialogue-role-badge">{npc.title}</span>
            </div>
            <span className="dialogue-district">{npc.district}</span>
          </div>
          <button className="dialogue-close-btn" onClick={onClose} aria-label="Close dialogue">
            ✕
          </button>
        </header>

        {/* Narrative Dialogue Body */}
        <div className="dialogue-body">
          <p className="dialogue-text">"{currentPageText}"</p>
          {totalPages > 1 && (
            <div className="dialogue-page-dots">
              {dialoguePages.map((_, i) => (
                <span
                  key={i}
                  className={`dialogue-dot ${i === dialogueIndex ? "active" : ""}`}
                  onClick={() => setDialogueIndex(i)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Rewards section if completing a quest */}
        {isCompletion && completionQuest?.rewards && (
          <div className="dialogue-rewards-panel">
            <span className="dialogue-rewards-title">
              {rewardsClaimed ? "✓ Rewards Received:" : "Quest Rewards:"}
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
                  ★ Unlocked: {completionQuest.rewards.unlocksFeature.replace("feature.", "").replace("_", " ")}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Action Controls */}
        <footer className="dialogue-footer">
          <span className="dialogue-key-hint">Press [Space] or [Enter] to continue</span>
          <button type="button" className="dialogue-action-btn" onClick={handleNext}>
            {isLastPage ? (isCompletion ? "Complete" : "Continue") : "Next ▶"}
          </button>
        </footer>
      </div>
    </div>
  );
};
