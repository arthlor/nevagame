import React, { useRef, useState } from "react";
import type { ActiveQuestDto } from "../simulation/core/QuestTypes";
import type { JournalPagesDto, SkillProgressDto } from "../simulation/core/contracts";
import { useModalAccessibility } from "./useModalAccessibility";
import { handleTabListKeyDown } from "./useTabListKeyboard";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForFish } from "./chrome/uiAtlas";
import { ChromeButton, ChromeClose } from "./chrome/Chrome";
import { GameSheet, Meter } from "./coastal/CoastalUI";
import { IconCompass, IconFish, IconJournal, IconSprout, IconTools } from "./components/HudIcons";
import { RECORD_TIERS } from "../content/records";
import { HowToPlayGuide } from "./components/HowToPlayGuide";
import { playUiSound } from "./audio/uiAudio";

export type JournalFolio = "story" | "records" | "skills" | "guide";

interface JournalModalProps {
  pages: JournalPagesDto;
  activeQuest: ActiveQuestDto | null;
  skills: SkillProgressDto[];
  onClose: () => void;
  initialFolio?: JournalFolio;
}

const FOLIOS: Array<{ id: JournalFolio; label: string; icon: React.ReactNode }> = [
  { id: "story", label: "Story", icon: <IconJournal size={14} aria-hidden="true" /> },
  { id: "records", label: "Records", icon: <IconFish size={14} aria-hidden="true" /> },
  { id: "skills", label: "Skills", icon: <IconTools size={14} aria-hidden="true" /> },
  { id: "guide", label: "Guide", icon: <IconCompass size={14} aria-hidden="true" /> }
];

export const JournalModal: React.FC<JournalModalProps> = ({ pages, activeQuest, skills, onClose, initialFolio = "story" }) => {
  const [activeFolio, setActiveFolio] = useState<JournalFolio>(initialFolio);
  const modalRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(modalRef, onClose);

  const selectFolio = (folio: JournalFolio) => {
    playUiSound("page-turn");
    setActiveFolio(folio);
  };

  return (
    <div className="modal-overlay interactive" onClick={onClose}>
      <GameSheet
        ref={modalRef}
        as="div"
        className="journal-chronicle-modal journal-folio"
        tone="scroll"
        corners
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="journal-title"
        tabIndex={-1}
      >
        <header className="modal-header journal-header">
          <span id="journal-title" className="modal-heading-with-mark">
            <IconJournal size={22} aria-hidden="true" /> Field Journal
          </span>
          <nav
            className="journal-folio-tabs"
            role="tablist"
            aria-label="Journal pages"
            onKeyDown={handleTabListKeyDown}
          >
            {FOLIOS.map((folio) => (
              <button
                key={folio.id}
                type="button"
                id={`journal-folio-${folio.id}`}
                role="tab"
                aria-selected={activeFolio === folio.id}
                aria-controls="journal-active-page"
                tabIndex={activeFolio === folio.id ? 0 : -1}
                className={`journal-folio-btn ${activeFolio === folio.id ? "is-active" : ""}`}
                onClick={() => selectFolio(folio.id)}
              >
                {folio.icon}{folio.label}
              </button>
            ))}
          </nav>
          <ChromeClose onClick={onClose} label="Close journal" />
        </header>

        <div
          id="journal-active-page"
          className="journal-open-pages"
          role="tabpanel"
          aria-labelledby={`journal-folio-${activeFolio}`}
          tabIndex={0}
        >
          {activeFolio === "story" && (
            <StoryPage activeQuest={activeQuest} completedStories={pages.completedStories} />
          )}
          {activeFolio === "records" && <RecordsPage pages={pages} />}
          {activeFolio === "skills" && <SkillsPage skills={skills} />}
          {activeFolio === "guide" && <HowToPlayGuide />}
        </div>

        <footer className="modal-footer journal-footer">
          <span>{pages.completedStories.length} story entries complete</span>
          <ChromeButton onClick={onClose}>Close</ChromeButton>
        </footer>
      </GameSheet>
    </div>
  );
};

const StoryPage: React.FC<{
  activeQuest: ActiveQuestDto | null;
  completedStories: JournalPagesDto["completedStories"];
}> = ({ activeQuest, completedStories }) => {
  return (
    <section className="journal-page journal-story-page" aria-label="Story">
      <div className="journal-page-heading"><span>Story</span><h2>{activeQuest?.actTitle ?? "Open coast"}</h2></div>
      {activeQuest ? (
        <article className="journal-active-story">
          <h3>{activeQuest.questTitle}</h3>
          <p>{activeQuest.objectiveDescription}</p>
          {activeQuest.targetQuantity > 1 && (
            <Meter
              label="Story progress"
              value={Math.min(activeQuest.currentProgress, activeQuest.targetQuantity)}
              max={activeQuest.targetQuantity}
              valueText={`${Math.min(activeQuest.currentProgress, activeQuest.targetQuantity)} / ${activeQuest.targetQuantity}`}
              variant="gold"
            />
          )}
          {activeQuest.isQuestReadyToTurnIn && <strong className="journal-ready-mark">Ready to continue</strong>}
          {activeQuest.turnInBlockerReason && (
            <strong className="journal-ready-mark is-blocked">Blocked · {activeQuest.turnInBlockerReason}</strong>
          )}
        </article>
      ) : (
        <p className="journal-empty-copy">No active story errand. The coast is yours to explore.</p>
      )}

      {completedStories.length > 0 && (
        <details className="journal-completed-stories">
          <summary>Completed stories · {completedStories.length}</summary>
          <ul>
            {completedStories.map((story) => (
              <li key={story.questId}>✓ {story.title}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
};

/**
 * The Records Board: standing goals that outlive the authored quest chain.
 *
 * All 34 milestones at once would be a wall, so each tier shows its completion
 * count and the two closest to falling — which is the "what now" answer the
 * game had no way to give once the story ran out.
 */
const RecordsBoard: React.FC<{ records: JournalPagesDto["records"] }> = ({ records }) => {
  if (records.length === 0) return null;
  const tiers = RECORD_TIERS
    .map((tier) => {
      const mine = records.filter((record) => record.tier === tier.id);
      const open = mine
        .filter((record) => !record.achieved)
        .sort((a, b) => b.progress - a.progress)
        .slice(0, 2);
      return { tier, done: mine.filter((record) => record.achieved).length, total: mine.length, open };
    })
    .filter((row) => row.total > 0);

  return (
    <section aria-labelledby="journal-records-board" className="journal-records-board">
      <h3 id="journal-records-board"><IconCompass size={16} aria-hidden="true" /> Standing records</h3>
      {tiers.map(({ tier, done, total, open }) => (
        <article key={tier.id} className="journal-record-tier">
          <div className="journal-record-tier-head">
            <strong>{tier.title}</strong>
            <span>{done} / {total}</span>
          </div>
          {open.length === 0 ? (
            <p className="journal-empty-copy">Every record here stands to your name.</p>
          ) : open.map((record) => (
            <div key={record.id} className="journal-record-goal">
              <div><strong>{record.title}</strong><span>{record.detail}</span></div>
              <Meter
                label={record.title}
                value={Math.round(record.progress * 100)}
                max={100}
                showLabel={false}
                valueText={record.currentLabel}
                variant="gold"
              />
            </div>
          ))}
        </article>
      ))}
    </section>
  );
};

const RecordsPage: React.FC<{ pages: JournalPagesDto }> = ({ pages }) => (
  <section className="journal-page journal-records-page" aria-label="Records">
    <div className="journal-page-heading"><span>Records</span><h2>What you have learned</h2></div>
    <RecordsBoard records={pages.records} />
    <div className="journal-record-columns">
      <section aria-labelledby="journal-fish-records">
        <h3 id="journal-fish-records"><IconFish size={16} aria-hidden="true" /> Fish</h3>
        {pages.fishRecords.length === 0 ? <p className="journal-empty-copy">No fish recorded yet.</p> : (
          <div className="journal-record-list">
            {pages.fishRecords.map((record) => (
                <article key={record.speciesId} className="journal-record-entry">
                  <AtlasImage src={atlasForFish(record.speciesId)} alt="" size={42} />
                  <div><strong>{record.name}</strong><span>{record.habitatsLabel}</span></div>
                  <dl>
                    <div><dt>Caught</dt><dd>{record.caughtCount}</dd></div>
                    <div><dt>Best</dt><dd>{record.bestLabel}</dd></div>
                  </dl>
                </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="journal-field-records">
        <h3 id="journal-field-records"><IconSprout size={16} aria-hidden="true" /> Field &amp; coast</h3>
        {pages.cropRecords.map((record) => (
            <article key={record.cropId} className="journal-knowledge-entry">
              <strong>{record.name}</strong>
              <span>{record.harvestedCount} harvested{record.bestQuality ? ` · best ${record.bestQuality}` : ""}</span>
            </article>
        ))}
        {pages.knowledge.map((entry) => (
          <article key={entry.id} className="journal-knowledge-entry">
            <strong>{entry.title}</strong><span>{entry.summary}</span>
          </article>
        ))}
        {pages.cropRecords.length === 0 && pages.knowledge.length === 0 && <p className="journal-empty-copy">New notes appear as you work and explore.</p>}
      </section>
    </div>
  </section>
);

const SkillsPage: React.FC<{ skills: SkillProgressDto[] }> = ({ skills }) => (
  <section className="journal-page journal-skills-page" aria-label="Skills">
    <div className="journal-page-heading"><span>Skills</span><h2>Practice along the coast</h2></div>
    <div className="journal-skills-list">
      {skills.length === 0 ? (
        <p className="journal-empty-copy">No practice recorded yet.</p>
      ) : skills.map((skill) => (
        <article key={skill.skill} className="journal-skill-row">
          <div><strong>{skill.label}</strong><span>{skill.rankName}</span></div>
          <Meter
            label={`${skill.label} progress`}
            value={skill.progressPercent}
            max={100}
            showLabel={false}
            valueText={skill.nextXp !== null ? `${skill.xp} XP · next ${skill.nextXp}` : `${skill.xp} XP · highest rank`}
            variant="gold"
          />
        </article>
      ))}
    </div>
  </section>
);
