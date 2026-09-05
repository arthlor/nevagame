import React from "react";
import type { FarmingActionSnapshot } from "../../app/FarmingActionController";
import { AUTHORED_ACTION_TIMINGS } from "../../app/FarmingActionController";
import { GameSheet, Meter } from "../coastal/CoastalUI";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForAction } from "../chrome/uiAtlas";
import { IconEnergy } from "./HudIcons";

export interface FarmingActionStatusProps {
  action: FarmingActionSnapshot;
  className?: string;
}

export const ACTION_LABELS: Record<FarmingActionSnapshot["action"], { title: string; hint?: string }> = {
  plant: { title: "Planting seeds…", hint: "Sowing seed into tilled soil" },
  water: { title: "Watering soil…", hint: "Irrigating crop bed" },
  fertilize: { title: "Fertilizing soil…", hint: "Enriching soil nutrients" },
  harvest: { title: "Harvesting crop…", hint: "Gathering farm produce" },
  "processing-start": { title: "Starting processing…", hint: "Loading artisan station" },
  "processing-collect": { title: "Collecting yield…", hint: "Gathering processed goods" },
  pickup: { title: "Picking up…", hint: "Lifting physical item" },
  place: { title: "Placing…", hint: "Setting down item" },
  workstation: { title: "Working…", hint: "Operating artisan station" },
  cast: { title: "Casting line…", hint: "Deploying fishing tackle" },
  board: { title: "Boarding vessel…", hint: "Stepping onto deck" },
  dock: { title: "Docking vessel…", hint: "Securing boat to pier" }
};

export const ACTION_WORK_COSTS: Partial<Record<FarmingActionSnapshot["action"], number>> = {
  plant: 12,
  water: 5,
  harvest: 30,
  fertilize: 8,
  cast: 15,
  workstation: 35
};

const FALLBACK_TIMING = { durationMs: 2000, commitMs: 1000 };

export const FarmingActionStatus: React.FC<FarmingActionStatusProps> = ({ action, className = "" }) => {
  const meta = ACTION_LABELS[action.action] ?? { title: "Working…", hint: "Action in progress" };
  const progress = Number.isFinite(action.progress) ? Math.max(0, Math.min(1, action.progress)) : 0;
  const percent = Math.min(100, Math.max(0, Math.round(progress * 100)));
  const isCommitted = action.committed;

  const timing = (AUTHORED_ACTION_TIMINGS && AUTHORED_ACTION_TIMINGS[action.action]) || FALLBACK_TIMING;
  const totalSec = timing.durationMs / 1000;
  const elapsedSec = (progress * timing.durationMs) / 1000;
  const commitPercent = Math.min(100, Math.max(0, Math.round((timing.commitMs / timing.durationMs) * 100)));
  const workCost = ACTION_WORK_COSTS[action.action];

  return (
    <GameSheet
      family="ink"
      tone="slate"
      corners
      className={`farming-action-status action-${action.action} mmo-cast-bar ${className}`.trim()}
      role="status"
      aria-live="polite"
      data-testid="farming-action-status"
    >
      <div className="cast-bar-inner">
        <div className="cast-bar-header">
          <div className="cast-bar-title-row">
            <AtlasImage
              src={atlasForAction(action.action)}
              className="farming-action-icon cast-bar-action-icon"
              size={22}
              aria-hidden="true"
            />
            <strong className="cast-bar-action-title">{meta.title}</strong>
            {workCost != null && workCost > 0 && (
              <span
                className="cast-bar-work-chip"
                title={`Consumes ${workCost} Work`}
                data-testid="cast-bar-work-cost"
              >
                <IconEnergy size={12} aria-hidden="true" /> {`-${workCost} Work`}
              </span>
            )}
          </div>
          <span className="cast-bar-timing" aria-hidden="true">
            {`${elapsedSec.toFixed(1)}s / ${totalSec.toFixed(1)}s · ${percent}%`}
          </span>
        </div>

        <div className="cast-bar-track-wrapper">
          <Meter
            className="farming-action-meter cast-bar-meter"
            label={meta.title}
            value={percent}
            max={100}
            valueText={`${percent}%`}
            variant="gold"
            showLabel={false}
            showValue={false}
          />
          {/* Commit Marker Threshold */}
          <div
            className="cast-bar-commit-marker"
            style={{ left: `${commitPercent}%` }}
            title={`Commit threshold: ${commitPercent}%`}
            aria-hidden="true"
          />
          {/* Channeling Progress Spark */}
          <div
            className="cast-bar-spark"
            style={{ left: `${percent}%` }}
            aria-hidden="true"
          />
        </div>

        <footer className="cast-bar-footer">
          <span className={`cast-bar-status-text ${isCommitted ? "is-committed" : ""}`}>
            {isCommitted ? "Committed · Finishing…" : "Channeling…"}
          </span>
          {action.interruptible && !isCommitted ? (
            <span className="cast-bar-cancel-hint">
              Move or press <kbd>Esc</kbd> to cancel
            </span>
          ) : isCommitted ? (
            <span className="cast-bar-cancel-hint is-committed-hint">
              Action locked in
            </span>
          ) : null}
        </footer>
      </div>
    </GameSheet>
  );
};
