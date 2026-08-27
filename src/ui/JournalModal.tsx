// src/ui/JournalModal.tsx
import React from "react";
import { GameState } from "../simulation/core/types";
import { ContentRegistry } from "../content/ContentRegistry";
import { getRankForXp } from "../content/progression";

interface JournalModalProps {
  state: GameState;
  onClose: () => void;
}

export const JournalModal: React.FC<JournalModalProps> = ({ state, onClose }) => {
  const journal = state.journal;
  const proficiencies = state.player.proficiencies;

  return (
    <div className="modal-overlay interactive" onClick={onClose}>
      <div className="neva-panel modal-content" style={{ width: "min(720px, 94vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>📖</span> Captain & Farm Journal
          </span>
          <button type="button" className="neva-button neva-button-secondary" style={{ padding: "2px 8px" }} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Story and quest record */}
          <div className="journal-card-section">
            <h4 className="journal-section-title">🧭 Story & Quests</h4>
            {state.quests.activeQuestId ? (() => {
              const active = ContentRegistry.quests.get(state.quests.activeQuestId);
              const objective = active?.objectives[state.quests.activeStepIndex];
              const progress = objective ? state.quests.stepProgress[objective.id] ?? 0 : 0;
              return active ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "5px", fontSize: "12px" }}>
                  <strong>{active.questTitle}</strong>
                  {objective && (
                    <span style={{ color: "var(--color-text-secondary)" }}>
                      {objective.description} · {Math.min(progress, objective.targetQuantity)} / {objective.targetQuantity}
                    </span>
                  )}
                </div>
              ) : null;
            })() : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px" }}>
                <strong>Open Horizons</strong>
                <span style={{ color: "var(--color-text-secondary)" }}>The introductory story is complete.</span>
              </div>
            )}
            {state.quests.completedQuestIds.length > 0 && (
              <div style={{ marginTop: "10px", color: "var(--color-text-secondary)", fontSize: "11px", lineHeight: 1.5 }}>
                Completed: {state.quests.completedQuestIds
                  .map((questId) => ContentRegistry.quests.get(questId)?.questTitle ?? questId)
                  .join(" · ")}
              </div>
            )}
            {state.quests.unlockedFeatureIds.length > 0 && (
              <div style={{ marginTop: "8px", color: "var(--color-accent-ochre)", fontSize: "11px" }}>
                Unlocked: {state.quests.unlockedFeatureIds.map((featureId) => featureId.replace(/^feature\.|^boat\./, "").replaceAll("_", " ")).join(" · ")}
              </div>
            )}
          </div>

          {/* Proficiencies Summary */}
          <div className="journal-card-section">
            <h4 className="journal-section-title">
              🏆 Skill Proficiencies
            </h4>
            <div className="journal-skills-grid">
              {Object.entries(proficiencies).map(([skill, xp]) => {
                const rank = getRankForXp(xp);
                return (
                <div key={skill} className="journal-skill-pill">
                  <div className="skill-name">{skill} · {rank.rankName}</div>
                  <div className="skill-xp">{xp} XP</div>
                </div>
                );
              })}
            </div>
          </div>

          {/* Fish Discoveries Table */}
          <div className="journal-card-section">
            <h4 className="journal-section-title">
              🐟 Discovered Fish Species
            </h4>
            <div className="journal-fish-list">
              {Array.from(ContentRegistry.fishSpecies.values()).map((species) => {
                const record = journal.fishRecords[species.id];
                const discovered = !!record;

                return (
                  <div
                    key={species.id}
                    className={`journal-fish-row ${discovered ? "is-discovered" : "is-undiscovered"}`}
                  >
                    <div className="fish-row-left">
                      <strong className="fish-name">
                        {discovered ? species.name : "??? (Undiscovered)"}
                      </strong>
                      {discovered && (
                        <span className="fish-habitats">
                          [{species.habitats.join(", ")}]
                        </span>
                      )}
                    </div>
                    <div className="fish-row-right">
                      {discovered ? (
                        <span>
                          Caught: <b>{record.catchCount}</b> <span className="dot-sep">·</span> Record: <b style={{ color: "var(--color-accent-gold)" }}>{record.largestWeightKg?.toFixed(1)} kg</b>
                        </span>
                      ) : (
                        <span className="undiscovered-text">Not yet recorded</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="neva-button" onClick={onClose}>
            Close Journal
          </button>
        </div>
      </div>
    </div>
  );
};
