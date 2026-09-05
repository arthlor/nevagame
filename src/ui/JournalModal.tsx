import React, { useRef, useState } from "react";
import type { ActiveQuestDto } from "../simulation/core/QuestTypes";
import type { JournalPagesDto, SkillProgressDto, AlmanacDto} from "../simulation/core/contracts";
import type { SkillId } from "../simulation/core/types";
import { ContentRegistry } from "../content/ContentRegistry";
import { getNextRank } from "../content/progression";
import { useModalAccessibility } from "./useModalAccessibility";
import { handleTabListKeyDown } from "./useTabListKeyboard";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForFish } from "./chrome/uiAtlas";
import { ChromeButton, ChromeClose } from "./chrome/Chrome";
import { GameSheet, Meter } from "./coastal/CoastalUI";
import { IconCompass, IconFish, IconJournal, IconSprout, IconTools } from "./components/HudIcons";
import { RECORD_TIERS } from "../content/records";
import { HowToPlayGuide } from "./components/HowToPlayGuide";
import { AlmanacPage } from "./components/AlmanacPage";
import { playUiSound } from "./audio/uiAudio";

export type JournalFolio = "story" | "records" | "almanac" | "skills" | "guide";

interface JournalModalProps {
  pages: JournalPagesDto;
  activeQuest: ActiveQuestDto | null;
  skills: SkillProgressDto[];
  onClose: () => void;
  /** Omitted where the host cannot supply it; the folio then stays hidden. */
  almanac?: AlmanacDto;
  initialFolio?: JournalFolio;
}

const FOLIOS: Array<{ id: JournalFolio; label: string; icon: React.ReactNode }> = [
  { id: "story", label: "Story", icon: <IconJournal size={14} aria-hidden="true" /> },
  { id: "records", label: "Records", icon: <IconFish size={14} aria-hidden="true" /> },
  { id: "almanac", label: "Almanac", icon: <IconSprout size={14} aria-hidden="true" /> },
  { id: "skills", label: "Skills", icon: <IconTools size={14} aria-hidden="true" /> },
  { id: "guide", label: "Guide", icon: <IconCompass size={14} aria-hidden="true" /> }
];

export const JournalModal: React.FC<JournalModalProps> = ({ pages, activeQuest, skills, almanac, onClose, initialFolio = "story" }) => {
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
            {FOLIOS.filter((folio) => folio.id !== "almanac" || almanac).map((folio) => (
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
          {activeFolio === "almanac" && almanac && <AlmanacPage almanac={almanac} />}
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

      {completedStories.length > 0 && <CompletedStories stories={completedStories} />}
    </section>
  );
};

/**
 * Chrome-styled collapsible for finished errands. A plain details/summary
 * cannot carry the Chrome button language or the journal's sound cue.
 */
const CompletedStories: React.FC<{
  stories: JournalPagesDto["completedStories"];
}> = ({ stories }) => {
  const [open, setOpen] = useState(false);
  return (
    <section className={`journal-completed-stories${open ? " is-open" : ""}`}>
      <ChromeButton
        size="sm"
        variant="secondary"
        soundCue="cloth"
        className="journal-collapsible-trigger"
        aria-expanded={open}
        aria-controls="journal-completed-list"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true" className="journal-collapsible-mark">
          {open ? "▾" : "▸"}
        </span>
        Completed stories · {stories.length}
      </ChromeButton>
      {open && (
        <ul id="journal-completed-list">
          {stories.map((story) => (
            <li key={story.questId} className="is-complete">{story.title}</li>
          ))}
        </ul>
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
  const [expandedTiers, setExpandedTiers] = useState<ReadonlySet<string>>(new Set());
  if (records.length === 0) return null;
  const tiers = RECORD_TIERS
    .map((tier) => {
      const mine = records.filter((record) => record.tier === tier.id);
      const open = mine
        .filter((record) => !record.achieved)
        .sort((a, b) => b.progress - a.progress);
      const achieved = mine.filter((record) => record.achieved);
      return {
        tier,
        done: achieved.length,
        total: mine.length,
        open,
        achieved,
        expanded: expandedTiers.has(tier.id)
      };
    })
    .filter((row) => row.total > 0);

  const toggleTier = (tierId: string) => {
    setExpandedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tierId)) next.delete(tierId);
      else next.add(tierId);
      return next;
    });
  };

  return (
    <section aria-labelledby="journal-records-board" className="journal-records-board">
      <h3 id="journal-records-board"><IconCompass size={16} aria-hidden="true" /> Standing records</h3>
      {tiers.map(({ tier, done, total, open, achieved, expanded }) => {
        const preview = open.slice(0, 2);
        const visible = expanded ? [...open, ...achieved] : preview;
        return (
          <article key={tier.id} className="journal-record-tier">
            <div className="journal-record-tier-head">
              <strong>{tier.title}</strong>
              <span>{done} / {total}</span>
            </div>
            {visible.length === 0 ? (
              <p className="journal-empty-copy">Every record here stands to your name.</p>
            ) : visible.map((record) => (
              <div key={record.id} className={`journal-record-goal${record.achieved ? " is-achieved" : ""}`}>
                <div className={record.achieved ? "is-achieved" : undefined}><strong>{record.title}</strong><span>{record.detail}</span></div>
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
            {total > 2 && (
              <ChromeButton
                size="sm"
                variant="secondary"
                soundCue="cloth"
                className="journal-tier-toggle"
                aria-expanded={expanded}
                onClick={() => toggleTier(tier.id)}
              >
                {expanded ? "Show less" : `Show all ${total}`}
              </ChromeButton>
            )}
          </article>
        );
      })}
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

/** Which proficiency column feeds each skill's rank ladder. */
const SKILL_UNLOCK_KEYS: Record<
  SkillId,
  "farmingUnlocks" | "fishingUnlocks" | "tradingUnlocks" | "processingUnlocks"
> = {
  farming: "farmingUnlocks",
  fishing: "fishingUnlocks",
  processing: "processingUnlocks",
  trading: "tradingUnlocks"
};

/**
 * Human name for a rank-unlock id, resolved from the registries that own it.
 * Falls back to the bare id (prettified) rather than inventing a label.
 */
const unlockDisplayName = (id: string): string => {
  const named =
    ContentRegistry.crops.get(id) ??
    ContentRegistry.rods.get(id) ??
    ContentRegistry.markets.get(id) ??
    ContentRegistry.recipes.get(id) ??
    ContentRegistry.boats.get(id) ??
    [...ContentRegistry.boats.values()].find((boat) => boat.id === id);
  if (named) return named.name;
  return id.replace(/^[a-z]+\./, "").replace(/[-_]/g, " ");
};

const SkillsPage: React.FC<{ skills: SkillProgressDto[] }> = ({ skills }) => (
  <section className="journal-page journal-skills-page" aria-label="Skills">
    <div className="journal-page-heading"><span>Skills</span><h2>Practice along the coast</h2></div>
    <div className="journal-skills-list">
      {skills.length === 0 ? (
        <p className="journal-empty-copy">No practice recorded yet.</p>
      ) : skills.map((skill) => {
        const next = getNextRank(skill.xp);
        const unlockIds = next ? next[SKILL_UNLOCK_KEYS[skill.skill]].slice(0, 3) : [];
        const unlockText = !next
          ? "Highest rank"
          : unlockIds.length > 0
            ? `Next: ${next.rankName} · ${next.xpRequired.toLocaleString()} XP — unlocks ${unlockIds.map(unlockDisplayName).join(", ")}`
            : `Next: ${next.rankName} · ${next.xpRequired.toLocaleString()} XP`;
        return (
          <article key={skill.skill} className="journal-skill-row">
            <div>
              <strong>{skill.label} <span className="journal-rank-badge">{skill.rankName}</span></strong>
              <span className="journal-next-unlock">{unlockText}</span>
            </div>
            <Meter
              label={`${skill.label} progress`}
              value={skill.progressPercent}
              max={100}
              showLabel={false}
              valueText={skill.nextXp !== null ? `${skill.xp} XP · next ${skill.nextXp}` : `${skill.xp} XP · highest rank`}
              variant="gold"
            />
          </article>
        );
      })}
    </div>
  </section>
);
