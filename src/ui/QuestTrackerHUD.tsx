import React, { useState } from "react";
import type { ActiveQuestDto } from "../simulation/core/QuestTypes";
import type { HudContractDto, RecordMilestoneDto } from "../simulation/core/contracts";
import { HudCluster, Meter } from "./coastal/CoastalUI";
import { IconBoat, IconPin} from "./components/HudIcons";
import { GuildcraftArt } from "./hud/GuildcraftArt";
import { playUiSound } from "./audio/uiAudio";

export interface QuestTrackerHUDProps {
  activeQuest: ActiveQuestDto | null;
  /**
   * Every thread the player is carrying, focused first. The story spine and
   * the side chains advance independently, so a tracker that could only ever
   * show one of them hid the other three entirely.
   */
  activeQuests?: readonly ActiveQuestDto[];
  onFocusTrack?: (trackId: string) => void;
  activeContracts?: readonly HudContractDto[];
  records?: readonly RecordMilestoneDto[];
  onOpenDialogue?: (npcId: string) => void;
  className?: string;
}

export const QuestTrackerHUD: React.FC<QuestTrackerHUDProps> = ({
  activeQuest,
  activeQuests,
  onFocusTrack,
  activeContracts = [],
  records = [],
  className = ""
}) => {
  const [questCollapsed, setQuestCollapsed] = useState(false);
  const [contractsCollapsed, setContractsCollapsed] = useState(true);

  const handleQuestToggle = () => {
    playUiSound("click");
    setQuestCollapsed((prev) => !prev);
  };

  const handleContractsToggle = () => {
    playUiSound("click");
    setContractsCollapsed((prev) => !prev);
  };

  // `getActiveQuestDtos` orders focused-first, which is right for a caller that
  // wants the primary thread. A rail of tabs must not reshuffle under the
  // pointer when one is picked, so it sorts on a stable key instead.
  const threads = [...(activeQuests ?? (activeQuest ? [activeQuest] : []))]
    .sort((a, b) => a.trackId.localeCompare(b.trackId));
  const showThreadPicker = threads.length > 1 && Boolean(onFocusTrack);

  const handleFocusThread = (trackId: string) => {
    if (trackId === activeQuest?.trackId) return;
    playUiSound("click");
    onFocusTrack?.(trackId);
  };

  if (!activeQuest && activeContracts.length === 0 && records.length === 0) return null;

  return (
    <div
      className={`collapsible-tracker-group ${className}`.trim()}
      data-testid="collapsible-tracker-group"
    >
      {/* Story Quest Section */}
      {activeQuest && (
        <HudCluster
          className={`quest-tracker-hud-wood guild-quest ${questCollapsed ? "collapsed" : ""}${
            activeQuest.isQuestReadyToTurnIn ? " is-ready" : ""
          }`}
          aria-label="Active objective"
        >
          <header className="quest-tracker-header">
            <button
              type="button"
              className="quest-tracker-toggle"
              aria-expanded={!questCollapsed}
              aria-label={questCollapsed ? "Show active objective" : "Hide active objective details"}
              onClick={handleQuestToggle}
              data-testid="quest-tracker-toggle-btn"
            >
              <GuildcraftArt art="seal" className="guild-quest-seal" />
              <span className="quest-tracker-copy">
                <h3 className={`quest-title${activeQuest.questTitle.length > 24 ? " is-long" : ""}`}>
                  {activeQuest.questTitle}
                  {activeQuest.isQuestReadyToTurnIn && (
                    <span className="quest-turnin-chip" data-testid="quest-ready">
                      Ready
                    </span>
                  )}
                </h3>
                <span className="quest-objective-text">{activeQuest.objectiveDescription}</span>
              </span>
              <span className={`quest-collapse-chevron ${questCollapsed ? "is-collapsed" : ""}`} aria-hidden="true">
                ▾
              </span>
            </button>
          </header>

          {!questCollapsed && showThreadPicker && (
            <div
              className="quest-thread-rail"
              role="tablist"
              aria-label="Open quest threads"
              data-testid="quest-thread-rail"
            >
              {threads.map((thread) => {
                const selected = thread.trackId === activeQuest.trackId;
                return (
                  <button
                    key={thread.trackId}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className={`quest-thread-tab${selected ? " is-current" : ""}${
                      thread.isQuestReadyToTurnIn ? " is-ready" : ""
                    }`}
                    onClick={() => handleFocusThread(thread.trackId)}
                    data-testid={`quest-thread-${thread.trackId}`}
                    title={thread.questTitle}
                  >
                    <span className="quest-thread-name">{thread.trackTitle}</span>
                    {thread.isQuestReadyToTurnIn && (
                      <span className="quest-thread-seal" aria-label="Ready to hand in">
                        <GuildcraftArt art="seal" className="quest-thread-seal-art" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {!questCollapsed && (
            <div className="quest-tracker-content">
              {activeQuest.targetQuantity > 1 && !activeQuest.isQuestReadyToTurnIn && (
                <div className="quest-progress-wrap">
                  <Meter
                    label="Objective progress"
                    value={Math.min(activeQuest.currentProgress, activeQuest.targetQuantity)}
                    max={Math.max(1, activeQuest.targetQuantity)}
                    showLabel={false}
                    showValue={false}
                    variant="gold"
                    className="quest-progress-meter"
                  />
                  <span className="quest-progress-count">
                    {`${Math.min(activeQuest.currentProgress, activeQuest.targetQuantity)} / ${Math.max(
                      1,
                      activeQuest.targetQuantity
                    )}`}
                  </span>
                </div>
              )}
              {activeQuest.targetLocation && (
                <div className="quest-location-hint">
                  <span className="location-pin" aria-hidden="true"><IconPin size={11} /></span>
                  <span className="quest-location-name">{activeQuest.targetLocation.name}</span>
                  {activeQuest.targetDistanceMeters !== undefined && (
                    <span className="quest-location-range">
                      {`${Math.round(activeQuest.targetDistanceMeters)} m`}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </HudCluster>
      )}

      {!activeQuest && records.length > 0 && (
        <HudCluster className="quest-tracker-hud-wood guild-quest" aria-label="Records Board" data-testid="endgame-record-tracker">
          <header className="quest-tracker-header"><h3 className="quest-title">Records Board</h3></header>
          <div className="quest-tracker-content">
            {records.map((record) => <div key={record.id} className="contract-tracker-item">
              <span className="quest-objective-text">{record.title}</span>
              <Meter label={record.title} value={record.progress} max={1} showValue={false} showLabel={false} variant="gold" />
              <span className="quest-progress-count">{record.currentLabel}</span>
            </div>)}
          </div>
        </HudCluster>
      )}

      {/* Market Delivery Contracts Section */}
      {activeContracts.length > 0 && (
        <HudCluster
          className={`quest-tracker-hud-wood contracts-tracker-hud ${
            contractsCollapsed ? "collapsed" : ""
          }`}
          aria-label="Active delivery contracts"
        >
          <header className="quest-tracker-header">
            <button
              type="button"
              className="quest-tracker-toggle"
              aria-expanded={!contractsCollapsed}
              aria-label={
                contractsCollapsed
                  ? "Show active market contracts"
                  : "Hide active market contracts"
              }
              onClick={handleContractsToggle}
              data-testid="contracts-tracker-toggle-btn"
            >
              <IconBoat size={18} aria-hidden="true" className="quest-tracker-icon" />
              <span className="quest-tracker-copy">
                <h3 className="quest-title">
                  {`Active Contracts (${activeContracts.length})`}
                </h3>
                <span className="quest-objective-text">Market cargo consignments</span>
              </span>
              <span
                className={`quest-collapse-chevron ${contractsCollapsed ? "is-collapsed" : ""}`}
                aria-hidden="true"
              >
                ▾
              </span>
            </button>
          </header>

          {!contractsCollapsed && (
            <div className="contracts-tracker-content" role="list" aria-label="Contracts list">
              {activeContracts.map((contract) => (
                <div
                  key={contract.id}
                  className={`contract-tracker-item ${contract.completed ? "is-fulfilled" : ""}`}
                  role="listitem"
                  data-testid={`contract-item-${contract.id}`}
                >
                  <div className="contract-item-head">
                    <span className="contract-target-name">{contract.targetName}</span>
                    <span className="contract-reward-badge">{`+${contract.rewardMoney} G`}</span>
                  </div>

                  <div className="contract-item-progress-row">
                    <span className="contract-quantity-text">
                      {`${contract.current} / ${contract.target} ${contract.unit}`}
                    </span>
                    {contract.completed && (
                      <span className="contract-ready-chip">Ready</span>
                    )}
                  </div>
                  {!contract.completed && (
                    <div className="contract-destination-row">
                      <span className="contract-destination-label">
                        <IconPin size={11} aria-hidden="true" /> {contract.deliveryMarketName}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </HudCluster>
      )}
    </div>
  );
};
