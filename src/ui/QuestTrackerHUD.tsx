import React, { useState } from "react";
import type { ActiveQuestDto } from "../simulation/core/QuestTypes";
import { ChromeMeter, ChromePanel } from "./chrome/Chrome";
import { IconJournal } from "./components/HudIcons";
import { playUiSound } from "./audio/uiAudio";

export interface QuestTrackerHUDProps {
  activeQuest: ActiveQuestDto | null;
  onOpenDialogue?: (npcId: string) => void;
}

export const QuestTrackerHUD: React.FC<QuestTrackerHUDProps> = ({ activeQuest }) => {
  const [collapsed, setCollapsed] = useState(false);

  const handleToggle = () => {
    playUiSound("click");
    setCollapsed((prev) => !prev);
  };

  if (!activeQuest) {
    return (
      <ChromePanel as="aside" tone="dock" className="quest-tracker-hud-wood completed" aria-label="Story Progression">
        <div className="quest-tracker-header">
          <IconJournal size={18} aria-hidden="true" className="quest-tracker-icon" />
          <span className="quest-open-horizons-title">Open Horizons</span>
        </div>
      </ChromePanel>
    );
  }

  const current = Math.min(activeQuest.currentProgress, activeQuest.targetQuantity);
  const target = Math.max(1, activeQuest.targetQuantity);

  return (
    <ChromePanel
      as="aside"
      tone="dock"
      className={`quest-tracker-hud-wood ${collapsed ? "collapsed" : ""}${
        activeQuest.isQuestReadyToTurnIn ? " is-ready" : ""
      }`}
      aria-label="Active Quest Objective"
    >
      <header className="quest-tracker-header">
        <button
          type="button"
          className="quest-tracker-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand quest tracker" : "Collapse quest tracker"}
          onClick={handleToggle}
        >
          <IconJournal size={18} aria-hidden="true" className="quest-tracker-icon" />
          <span className="quest-tracker-copy">
            <h3 className="quest-title">
              {activeQuest.questTitle}
              {/* The turn-in step was previously signalled only by the progress
                  bar disappearing, which reads as an error rather than done. */}
              {activeQuest.isQuestReadyToTurnIn && (
                <span className="quest-turnin-chip" data-testid="quest-ready">
                  Ready
                </span>
              )}
            </h3>
            <span className="quest-objective-text">{activeQuest.objectiveDescription}</span>
          </span>
          <span className={`quest-collapse-chevron ${collapsed ? "is-collapsed" : ""}`} aria-hidden="true">
            ▾
          </span>
        </button>
      </header>

      {!collapsed && (
        <div className="quest-tracker-content">
          {activeQuest.targetQuantity > 1 && !activeQuest.isQuestReadyToTurnIn && (
            <div className="quest-progress-wrap">
              <ChromeMeter
                label="Objective Progress"
                value={current}
                max={target}
                showLabel={false}
                showValue={false}
                variant="gold"
                className="quest-progress-meter"
              />
              <span className="quest-progress-count">{`${current} / ${target}`}</span>
            </div>
          )}
          {activeQuest.targetLocation && (
            <div className="quest-location-hint">
              <span className="location-pin" aria-hidden="true">📍</span>
              <span className="quest-location-name">{activeQuest.targetLocation.name}</span>
            </div>
          )}
        </div>
      )}
    </ChromePanel>
  );
};


