import React, { useState } from "react";
import type { ActiveQuestDto } from "../simulation/core/QuestTypes";
import { HudCluster, Meter } from "./coastal/CoastalUI";
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

  if (!activeQuest) return null;

  const current = Math.min(activeQuest.currentProgress, activeQuest.targetQuantity);
  const target = Math.max(1, activeQuest.targetQuantity);

  return (
    <HudCluster
      className={`quest-tracker-hud-wood ${collapsed ? "collapsed" : ""}${
        activeQuest.isQuestReadyToTurnIn ? " is-ready" : ""
      }`}
      aria-label="Active objective"
    >
      <header className="quest-tracker-header">
        <button
          type="button"
          className="quest-tracker-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Show active objective" : "Hide active objective details"}
          onClick={handleToggle}
        >
          <IconJournal size={18} aria-hidden="true" className="quest-tracker-icon" />
          <span className="quest-tracker-copy">
            <h3 className="quest-title">
              {activeQuest.questTitle}
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
              <Meter
                label="Objective progress"
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
    </HudCluster>
  );
};
