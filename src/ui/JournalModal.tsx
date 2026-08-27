// src/ui/JournalModal.tsx
import React, { useRef, useState } from "react";
import { GameState } from "../simulation/core/types";
import { ContentRegistry } from "../content/ContentRegistry";
import { useModalAccessibility } from "./useModalAccessibility";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForFish } from "./chrome/uiAtlas";
import { ChromeButton, ChromeClose, ChromeDivider, ChromeMeter, ChromePanel } from "./chrome/Chrome";
import { IconCoin, IconCompass, IconFish, IconJournal, IconSprout, IconTools } from "./components/HudIcons";
import { HowToPlayGuide } from "./components/HowToPlayGuide";
import { playUiSound } from "./audio/uiAudio";

export type JournalFolio = "quests" | "skills" | "bestiary" | "farming" | "guide";

interface JournalModalProps {
  state: GameState;
  onClose: () => void;
  initialFolio?: JournalFolio;
}

export const JournalModal: React.FC<JournalModalProps> = ({ state, onClose, initialFolio = "quests" }) => {
  const [activeFolio, setActiveFolio] = useState<JournalFolio>(initialFolio);
  const modalRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(modalRef, onClose);

  const selectFolio = (folio: JournalFolio) => {
    playUiSound("page-turn");
    setActiveFolio(folio);
  };

  const { journal, player, quests } = state;
  const proficiencies = player.proficiencies;

  const totalFishSpecies = ContentRegistry.fishSpecies.size;
  const discoveredFishCount = Object.keys(journal.fishRecords).length;

  const getRankName = (xp: number): { title: string; nextXp: number; progress: number } => {
    if (xp >= 1000) return { title: "Grandmaster", nextXp: 1000, progress: 100 };
    if (xp >= 500) return { title: "Master Artisan", nextXp: 1000, progress: Math.round(((xp - 500) / 500) * 100) };
    if (xp >= 200) return { title: "Journeyman", nextXp: 500, progress: Math.round(((xp - 200) / 300) * 100) };
    if (xp >= 50) return { title: "Apprentice", nextXp: 200, progress: Math.round(((xp - 50) / 150) * 100) };
    return { title: "Novice", nextXp: 50, progress: Math.round((xp / 50) * 100) };
  };

  return (
    <div className="modal-overlay interactive" onClick={onClose}>
      <ChromePanel
        ref={modalRef}
        as="div"
        className="neva-panel modal-content journal-chronicle-modal"
        tone="slate"
        flourish
        corners
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="journal-title"
        tabIndex={-1}
      >
        <header className="modal-header">
          <div className="modal-header-title-group">
            <span id="journal-title" className="modal-heading-with-mark">
              <IconJournal size={22} aria-hidden="true" /> Guild Chronicle & Bestiary
            </span>
          </div>

          <div className="journal-folio-tabs mm-ribbon-tabs" role="tablist" aria-label="Chronicle sections" data-testid="journal-folio-tabs">
            <button
              type="button"
              role="tab"
              aria-selected={activeFolio === "quests"}
              className={`journal-folio-btn ${activeFolio === "quests" ? "is-active" : ""}`}
              onClick={() => selectFolio("quests")}
            >
              <IconJournal size={14} aria-hidden="true" /> Chronicles & Errands
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeFolio === "skills"}
              className={`journal-folio-btn ${activeFolio === "skills" ? "is-active" : ""}`}
              onClick={() => selectFolio("skills")}
            >
              <IconTools size={14} aria-hidden="true" /> Guild Masteries
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeFolio === "bestiary"}
              className={`journal-folio-btn ${activeFolio === "bestiary" ? "is-active" : ""}`}
              onClick={() => selectFolio("bestiary")}
            >
              <IconFish size={14} aria-hidden="true" /> Bestiary ({discoveredFishCount}/{totalFishSpecies})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeFolio === "farming"}
              className={`journal-folio-btn ${activeFolio === "farming" ? "is-active" : ""}`}
              onClick={() => selectFolio("farming")}
            >
              <IconSprout size={14} aria-hidden="true" /> Field Notes
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeFolio === "guide"}
              className={`journal-folio-btn ${activeFolio === "guide" ? "is-active" : ""}`}
              onClick={() => selectFolio("guide")}
            >
              <IconCompass size={14} aria-hidden="true" /> How to Play
            </button>
          </div>

          <ChromeClose onClick={onClose} label="Close chronicle" />
        </header>

        <ChromeDivider />

        <div className="modal-body journal-body">
          {/* Folio 1: Chronicles & Quests */}
          {activeFolio === "quests" && (
            <div className="journal-tab-pane">
              <div className="journal-card-section">
                <h4 className="journal-section-title">Current Kingdom Questline</h4>
                {quests.activeQuestId ? (() => {
                  const active = ContentRegistry.quests.get(quests.activeQuestId);
                  const objective = active?.objectives[quests.activeStepIndex];
                  const progress = objective ? quests.stepProgress[objective.id] ?? 0 : 0;
                  const target = objective?.targetQuantity ?? 1;

                  return active ? (
                    <div className="journal-quest-hero-card">
                      <div className="quest-hero-header">
                        <span className="quest-act-badge">{active.actTitle.toUpperCase()}</span>
                        <h3 className="quest-hero-title">{active.questTitle}</h3>
                      </div>

                      {objective && (
                        <div className="quest-hero-objective">
                          <p className="objective-desc">"{objective.description}"</p>
                          <div className="quest-hero-progress-wrap">
                            <ChromeMeter
                              label="Quest progress"
                              value={Math.min(progress, target)}
                              max={Math.max(1, target)}
                              showLabel={false}
                              valueText={`${Math.min(progress, target)} / ${target}`}
                              variant="gold"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null;
                })() : (
                  <div className="journal-story-block open-horizons-block">
                    <strong>Realm of Open Horizons</strong>
                    <span className="journal-story-note">
                      The foundational island errands are complete. The island's trade and waters are yours to explore.
                    </span>
                  </div>
                )}
              </div>

              {quests.completedQuestIds.length > 0 && (
                <div className="journal-card-section">
                  <h4 className="journal-section-title">Completed Chronicles</h4>
                  <div className="completed-quests-annals">
                    {quests.completedQuestIds.map((questId) => {
                      const def = ContentRegistry.quests.get(questId);
                      return (
                        <div key={questId} className="completed-annal-row">
                          <span className="annal-seal-check">✓</span>
                          <strong>{def?.questTitle ?? questId}</strong>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {quests.unlockedFeatureIds.length > 0 && (
                <div className="journal-card-section">
                  <h4 className="journal-section-title">Unlocked Guild Capabilities</h4>
                  <div className="unlocked-features-grid">
                    {quests.unlockedFeatureIds.map((featureId) => (
                      <div key={featureId} className="unlocked-feature-pill">
                        <span className="feature-seal">★</span>
                        <span>{featureId.replace(/^feature\.|^boat\./, "").replaceAll("_", " ")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Folio 2: Guild Masteries & Skills */}
          {activeFolio === "skills" && (
            <div className="journal-tab-pane">
              <div className="journal-card-section">
                <h4 className="journal-section-title">Crafting, Agrarian & Angling Ranks</h4>
                <div className="journal-masteries-grid">
                  {Object.entries(proficiencies).map(([skill, xp]) => {
                    const rank = getRankName(xp);
                    return (
                      <div key={skill} className="mastery-card">
                        <div className="mastery-card-header">
                          <div>
                            <h4 className="mastery-skill-name">{skill.charAt(0).toUpperCase() + skill.slice(1)}</h4>
                            <span className="mastery-rank-badge">{rank.title}</span>
                          </div>
                          <strong className="mastery-xp-total">{xp} XP</strong>
                        </div>
                        <ChromeMeter
                          label={`${skill} mastery`}
                          value={rank.progress}
                          max={100}
                          showLabel={false}
                          valueText={`${rank.progress}% to next tier`}
                          variant="gold"
                        />
                        <div className="mastery-footer">
                          <span>{rank.progress}% to next tier</span>
                          <span>Next: {rank.nextXp} XP</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Folio 3: Fish & Fauna Bestiary */}
          {activeFolio === "bestiary" && (
            <div className="journal-tab-pane">
              <div className="journal-card-section">
                <div className="bestiary-header-row">
                  <h4 className="journal-section-title">Waters of Neva Bestiary</h4>
                  <span className="bestiary-counter">{discoveredFishCount} of {totalFishSpecies} Discovered</span>
                </div>

                <div className="bestiary-grid">
                  {Array.from(ContentRegistry.fishSpecies.values()).map((species) => {
                    const record = journal.fishRecords[species.id];
                    const discovered = Boolean(record);

                    return (
                      <div
                        key={species.id}
                        className={`bestiary-entry-card ${discovered ? "is-discovered" : "is-mystery"}`}
                      >
                        <div className="bestiary-portrait-well">
                          {discovered ? (
                            <AtlasImage src={atlasForFish(species.id)} alt={species.name} size={48} />
                          ) : (
                            <span className="bestiary-silhouette-icon">?</span>
                          )}
                        </div>

                        <div className="bestiary-info">
                          <strong className="bestiary-name">
                            {discovered ? species.name : "Unknown Species"}
                          </strong>

                          {discovered ? (
                            <>
                              <span className="bestiary-habitat">
                                {species.habitats.map((h) => h.toUpperCase()).join(" · ")}
                              </span>
                              <div className="bestiary-stats-row">
                                <span>Caught: <b>{record.catchCount}</b></span>
                                <span>Record: <b className="record-weight">{record.largestWeightKg?.toFixed(1)} kg</b></span>
                              </div>
                            </>
                          ) : (
                            <span className="bestiary-unknown-hint">
                              Habitat unrecorded. Cast your line in unexplored waters.
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Folio 4: Agrarian Field Notes */}
          {activeFolio === "farming" && (
            <div className="journal-tab-pane">
              <div className="journal-card-section">
                <h4 className="journal-section-title">Agrarian Almanac & Soil Practice</h4>
                <div className="farming-field-notes-list">
                  <div className="field-note-card">
                    <div className="field-note-header">
                      <IconSprout size={18} aria-hidden="true" />
                      <strong>Starter Crops of Homestead Farm</strong>
                    </div>
                    <p>
                      Wheat is hardy and quick to mature (approx. 4 mins). Potatoes and Tomatoes yield higher market profits
                      when delivered fresh to Neva Village Plaza.
                    </p>
                  </div>

                  <div className="field-note-card">
                    <div className="field-note-header">
                      <IconTools size={18} aria-hidden="true" />
                      <strong>Soil Moisture & Tilling</strong>
                    </div>
                    <p>
                      Till soil with your Hoe before sowing. Watered soil retains moisture during sunny weather and speeds crop growth.
                      Rainstorms naturally saturate all outdoor farm plots.
                    </p>
                  </div>

                  <div className="field-note-card">
                    <div className="field-note-header">
                      <IconCoin size={18} aria-hidden="true" />
                      <strong>Market Arbitrage & Trade Routes</strong>
                    </div>
                    <p>
                      Village merchants pay top gold for harvested produce and grain, while Seabreak Harbor pays premiums
                      for preserved fish cargo and expedition supplies.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Folio 5: How to Play Guidebook */}
          {activeFolio === "guide" && (
            <div className="journal-tab-pane">
              <HowToPlayGuide />
            </div>
          )}
        </div>

        <footer className="modal-footer">
          <ChromeButton onClick={onClose}>Close Chronicle</ChromeButton>
        </footer>


      </ChromePanel>
    </div>
  );
};

