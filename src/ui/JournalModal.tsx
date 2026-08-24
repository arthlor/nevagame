// src/ui/JournalModal.tsx
import React from "react";
import { GameState } from "../simulation/core/types";
import { ContentRegistry } from "../content/ContentRegistry";

interface JournalModalProps {
  state: GameState;
  onClose: () => void;
}

export const JournalModal: React.FC<JournalModalProps> = ({ state, onClose }) => {
  const journal = state.journal;
  const proficiencies = state.player.proficiencies;

  return (
    <div className="modal-overlay interactive" onClick={onClose}>
      <div className="neva-panel modal-content" style={{ width: "700px" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>📖 Captain & Farm Journal</span>
          <button className="neva-button neva-button-secondary" style={{ padding: "2px 8px" }} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {/* Proficiencies Summary */}
          <div style={{ marginBottom: "16px", background: "#FFF", padding: "12px", borderRadius: "6px", border: "2px solid #C4B5A2" }}>
            <h4 style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-wood-dark)", marginBottom: "8px" }}>
              🏆 Skill Proficiencies
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", fontSize: "12px" }}>
              {Object.entries(proficiencies).map(([skill, xp]) => (
                <div key={skill} style={{ background: "var(--color-panel-inner)", padding: "8px", borderRadius: "4px", textAlign: "center" }}>
                  <div style={{ fontWeight: 700, textTransform: "capitalize" }}>{skill}</div>
                  <div style={{ color: "var(--color-accent-teal)", fontWeight: 600 }}>{xp} XP</div>
                </div>
              ))}
            </div>
          </div>

          {/* Fish Discoveries Table */}
          <div style={{ background: "#FFF", padding: "12px", borderRadius: "6px", border: "2px solid #C4B5A2" }}>
            <h4 style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-wood-dark)", marginBottom: "8px" }}>
              🐟 Discovered Fish Species
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px" }}>
              {Array.from(ContentRegistry.fishSpecies.values()).map((species) => {
                const record = journal.fishRecords[species.id];
                const discovered = !!record;

                return (
                  <div
                    key={species.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "6px 10px",
                      background: discovered ? "var(--color-panel-inner)" : "#F0F0F0",
                      borderRadius: "4px",
                      opacity: discovered ? 1.0 : 0.6
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 700 }}>{discovered ? species.name : "??? (Undiscovered)"}</span>
                      {discovered && (
                        <span style={{ color: "#777", marginLeft: "8px" }}>
                          [{species.habitats.join(", ")}]
                        </span>
                      )}
                    </div>
                    {discovered ? (
                      <div>
                        Caught: <b>{record.catchCount}</b> | Record: <b>{record.largestWeightKg} kg</b>
                      </div>
                    ) : (
                      <div style={{ color: "#999" }}>Not yet recorded</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="neva-button" onClick={onClose}>
            Close Journal
          </button>
        </div>
      </div>
    </div>
  );
};
