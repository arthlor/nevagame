// src/ui/QuestTrackerHUD.tsx
import React, { useState } from "react";
import type { ActiveQuestDto } from "../simulation/core/QuestTypes";

export interface QuestTrackerHUDProps {
  activeQuest: ActiveQuestDto | null;
  onOpenDialogue?: (npcId: string) => void;
}

export const QuestTrackerHUD: React.FC<QuestTrackerHUDProps> = ({ activeQuest }) => {
  const [collapsed, setCollapsed] = useState(false);

  if (!activeQuest) {
    return (
      <aside className="quest-tracker-hud completed" aria-label="Story Progression">
        <div className="quest-tracker-header">
          <span className="quest-act-badge">Epilogue</span>
          <span className="quest-open-horizons-title">Open Horizons</span>
        </div>
        <p className="quest-epilogue-desc">
          The story acts are complete. Review weather, supplies, and harbor demand from the Expedition Planner.
        </p>
      </aside>
    );
  }

  const progressPercent = Math.min(
    100,
    Math.round((activeQuest.currentProgress / activeQuest.targetQuantity) * 100)
  );

  return (
    <aside
      className={`quest-tracker-hud ${collapsed ? "collapsed" : ""}`}
      aria-label="Active Quest Objective"
    >
      <header className="quest-tracker-header" onClick={() => setCollapsed(!collapsed)}>
        <div className="quest-header-left">
          <span className="quest-act-badge">{activeQuest.actTitle}</span>
          <h3 className="quest-title">{activeQuest.questTitle}</h3>
        </div>
        <button
          type="button"
          className="quest-collapse-toggle"
          aria-label={collapsed ? "Expand quest tracker" : "Collapse quest tracker"}
          onClick={(event) => {
            event.stopPropagation();
            setCollapsed(!collapsed);
          }}
        >
          {collapsed ? "▼" : "▲"}
        </button>
      </header>

      {!collapsed && (
        <div className="quest-tracker-content">
          <div className="quest-objective-row">
            <span className={`quest-step-marker ${activeQuest.isStepComplete ? "complete" : ""}`}>
              {activeQuest.isStepComplete ? "✓" : "●"}
            </span>
            <span className="quest-objective-text">{activeQuest.objectiveDescription}</span>
          </div>

          <div className="quest-progress-container">
            <div className="quest-progress-bar">
              <div
                className="quest-progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="quest-progress-count">
              {Math.min(activeQuest.currentProgress, activeQuest.targetQuantity)} /{" "}
              {activeQuest.targetQuantity}
            </span>
          </div>

          {activeQuest.targetLocation && (
            <div className="quest-location-hint">
              <span className="quest-pin-icon">📍</span> {activeQuest.targetLocation.name}
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
