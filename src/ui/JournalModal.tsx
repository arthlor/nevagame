import React, { useEffect, useRef, useState } from "react";
import type { ActiveQuestDto } from "../simulation/core/QuestTypes";
import type { JournalPagesDto, SkillProgressDto, AlmanacDto, PeoplePageDto } from "../simulation/core/contracts";
import type { SkillId } from "../simulation/core/types";
import { ContentRegistry } from "../content/ContentRegistry";
import { getNextRank } from "../content/progression";
import { useModalAccessibility } from "./useModalAccessibility";
import { handleTabListKeyDown } from "./useTabListKeyboard";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForFish } from "./chrome/uiAtlas";
import { ChromeButton, ChromeClose } from "./chrome/Chrome";
import {
  IconAnchor,
  IconBoat,
  IconCheck,
  IconCoin,
  IconCompass,
  IconFish,
  IconJournal,
  IconPack,
  IconPeople,
  IconPin,
  IconSparkle,
  IconSprout,
  IconStar,
  IconTools,
  IconWarning
} from "./components/HudIcons";
import { GameSheet, Meter } from "./coastal/CoastalUI";
import { RECORD_TIERS } from "../content/records";
import { HowToPlayGuide } from "./components/HowToPlayGuide";
import { AlmanacPage } from "./components/AlmanacPage";
import { playUiSound } from "./audio/uiAudio";
import type { VillageNoticeCategory, VillageNoticeDto } from "../content/villageBulletin";

export type JournalFolio = "story" | "people" | "records" | "almanac" | "skills" | "guide" | "notices";

interface JournalModalProps {
  pages: JournalPagesDto;
  activeQuest: ActiveQuestDto | null;
  /** Every open thread, focused first. Side chains are quests too. */
  activeQuests?: readonly ActiveQuestDto[];
  skills: SkillProgressDto[];
  onClose: () => void;
  /** Omitted where the host cannot supply it; the folio then stays hidden. */
  almanac?: AlmanacDto;
  /** Authored town notices selected from earned state. Omitted hides the folio. */
  notices?: readonly VillageNoticeDto[];
  /** The named cast and earned standing. Omitted hides the folio. */
  people?: PeoplePageDto;
  initialFolio?: JournalFolio;
}

const FOLIOS: Array<{ id: JournalFolio; label: string; icon: React.ReactNode }> = [
  { id: "story", label: "Story", icon: <IconJournal size={14} aria-hidden="true" /> },
  { id: "people", label: "People", icon: <IconPeople size={14} aria-hidden="true" /> },
  { id: "records", label: "Records", icon: <IconFish size={14} aria-hidden="true" /> },
  { id: "notices", label: "Notices", icon: <IconPin size={14} aria-hidden="true" /> },
  { id: "almanac", label: "Almanac", icon: <IconSprout size={14} aria-hidden="true" /> },
  { id: "skills", label: "Skills", icon: <IconTools size={14} aria-hidden="true" /> },
  { id: "guide", label: "Guide", icon: <IconCompass size={14} aria-hidden="true" /> }
];

export const JournalModal: React.FC<JournalModalProps> = ({ pages, activeQuest, activeQuests, skills, almanac, notices, people, onClose, initialFolio = "story" }) => {
  const [activeFolio, setActiveFolio] = useState<JournalFolio>(initialFolio);
  const modalRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(modalRef, onClose);

  useEffect(() => {
    setActiveFolio(initialFolio);
  }, [initialFolio]);

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
        tone="timber"
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
            {FOLIOS.filter((folio) =>
              (folio.id !== "almanac" || almanac)
              && (folio.id !== "notices" || notices)
              && (folio.id !== "people" || people)
            ).map((folio) => (
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
            <StoryPage activeQuest={activeQuest} activeQuests={activeQuests} completedStories={pages.completedStories} />
          )}
          {activeFolio === "people" && people && <PeoplePage people={people} />}
          {activeFolio === "records" && <RecordsPage pages={pages} />}
          {activeFolio === "notices" && <NoticesPage notices={notices ?? []} />}
          {activeFolio === "almanac" && almanac && <AlmanacPage almanac={almanac} />}
          {activeFolio === "skills" && <SkillsPage skills={skills} />}
          {activeFolio === "guide" && <HowToPlayGuide />}
        </div>

        <footer className="modal-footer journal-footer">
          <span>
            {activeFolio === "story" && `${pages.completedStories?.length ?? 0} story entries complete`}
            {activeFolio === "records" && `${(pages.records ?? []).filter((r) => r.achieved).length} of ${pages.records?.length ?? 0} records achieved`}
            {activeFolio === "people" && people && `${people.recognizedCount} of ${people.total} have taken your measure`}
            {activeFolio === "notices" && `${notices?.length ?? 0} pinned to the board`}
            {activeFolio === "almanac" && (almanac ? `${almanac.discoveredFish + almanac.discoveredCrops} of ${almanac.totalFish + almanac.totalCrops} species cataloged` : "Botanical & marine catalog")}
            {activeFolio === "skills" && "Work & maritime masteries"}
            {activeFolio === "guide" && "Field guide & controls reference"}
          </span>
          <ChromeButton onClick={onClose}>Close</ChromeButton>
        </footer>
      </GameSheet>
    </div>
  );
};

const StoryPage: React.FC<{
  activeQuest: ActiveQuestDto | null;
  activeQuests?: readonly ActiveQuestDto[];
  completedStories: JournalPagesDto["completedStories"];
}> = ({ activeQuest, activeQuests, completedStories }) => {
  const otherThreads = (activeQuests ?? []).filter(
    (thread) => thread.trackId !== activeQuest?.trackId
  );
  return (
    <section className="journal-page journal-story-page" aria-label="Story">
    <div className="journal-page-heading"><h2>{activeQuest?.actTitle ?? "Open coast"}</h2></div>
      {activeQuest ? (
        <article className="journal-active-story journal-story-scroll">
          <div className="journal-story-title-row">
            <h3>{activeQuest.questTitle}</h3>
          </div>

          <div className="journal-story-objective-card">
            <div className="journal-objective-row">
              <IconPin size={16} className="journal-objective-pin" aria-hidden="true" />
              <p className="journal-objective-desc">{activeQuest.objectiveDescription}</p>
            </div>
            {activeQuest.targetQuantity > 1 && (
              <div className="journal-story-meter-wrap">
                <Meter
                  label="Objective Progress"
                  value={Math.min(activeQuest.currentProgress, activeQuest.targetQuantity)}
                  max={activeQuest.targetQuantity}
                  valueText={`${Math.min(activeQuest.currentProgress, activeQuest.targetQuantity)} / ${activeQuest.targetQuantity}`}
                  variant="gold"
                />
              </div>
            )}
          </div>

          {activeQuest.isQuestReadyToTurnIn && (
            <div className="journal-ready-seal" role="status">
              <IconCheck size={18} aria-hidden="true" />
              <div className="journal-seal-text">
                <strong>Ready to hand in</strong>
                <span>{activeQuest.targetLocation ? `Return to ${activeQuest.targetLocation.name}` : "Return to finish this errand"}</span>
              </div>
            </div>
          )}

          {activeQuest.turnInBlockerReason && (
            <div className="journal-blocked-seal" role="alert">
              <IconWarning size={18} aria-hidden="true" />
              <div className="journal-seal-text">
                <strong>Before you can hand this in</strong>
                <span>{activeQuest.turnInBlockerReason}</span>
              </div>
            </div>
          )}

          {/* The ask as it was put, so instructions can be read again without
              walking back across the island to hear them. Content-derived, not
              a saved transcript. */}
          {activeQuest.brief && activeQuest.brief.lines.length > 0 && (
            <blockquote className="journal-story-brief" data-testid="journal-story-brief">
              <span className="journal-story-brief-speaker">{`What ${activeQuest.brief.speakerName} said`}</span>
              {activeQuest.brief.lines.map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </blockquote>
          )}
        </article>
      ) : (
        <p className="journal-empty-copy">No active story errand. The coast is yours to explore.</p>
      )}

      {otherThreads.length > 0 && (
        <section className="journal-open-threads" aria-label="Other open threads">
          <h3 className="journal-threads-heading">
            <IconCompass size={15} aria-hidden="true" />
            <span>Other errands ({otherThreads.length})</span>
          </h3>
          <div className="journal-threads-grid">
            {otherThreads.map((thread) => (
              <article key={thread.trackId} className="journal-open-thread" data-testid={`journal-thread-${thread.trackId}`}>
                <div className="journal-thread-top">
                  <span className="journal-thread-track-tag">{thread.trackTitle}</span>
                  {thread.isQuestReadyToTurnIn && (
                    <span className="journal-thread-ready-tag">Ready</span>
                  )}
                </div>
                <h4 className="journal-thread-quest">{thread.questTitle}</h4>
                <p className="journal-thread-objective">{thread.objectiveDescription}</p>
              </article>
            ))}
          </div>
        </section>
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
            <li key={story.questId} className="is-complete">
              <IconCheck size={13} aria-hidden="true" />
              <span>{story.title}</span>
            </li>
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
      <h3 id="journal-records-board"><IconSparkle size={16} aria-hidden="true" /> Milestones</h3>
      <div className="journal-record-tiers-grid">
        {tiers.map(({ tier, done, total, open, achieved, expanded }) => {
          const preview = open.slice(0, 2);
          const visible = expanded ? [...open, ...achieved] : preview;
          const isComplete = done === total;
          return (
            <article key={tier.id} className={`journal-record-tier ${isComplete ? "is-complete" : ""}`}>
              <div className="journal-record-tier-head">
                <div className="journal-tier-badge">
                  <IconStar size={15} filled={isComplete} aria-hidden="true" />
                  <strong>{tier.title}</strong>
                </div>
                <span className="journal-tier-count">{done} / {total} Achieved</span>
              </div>
              {visible.length === 0 ? (
                <p className="journal-empty-copy">Every record here stands to your name.</p>
              ) : visible.map((record) => (
                <div key={record.id} className={`journal-record-goal${record.achieved ? " is-achieved" : ""}`}>
                  <div className="journal-record-goal-meta">
                    <strong>{record.title}</strong>
                    <span>{record.detail}</span>
                  </div>
                  <div className="journal-record-meter-wrap">
                    <Meter
                      label={record.title}
                      value={Math.round(record.progress * 100)}
                      max={100}
                      showLabel={false}
                      valueText={record.currentLabel}
                      variant="gold"
                    />
                  </div>
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
                  {expanded ? "Show less" : `Show all ${total} entries`}
                </ChromeButton>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};

const RecordsPage: React.FC<{ pages: JournalPagesDto }> = ({ pages }) => (
  <section className="journal-page journal-records-page" aria-label="Records">
    <div className="journal-page-heading"><h2>What you have learned</h2></div>
    <RecordsBoard records={pages.records} />
    <div className="journal-record-columns">
      <section aria-labelledby="journal-fish-records" className="journal-records-section">
        <h3 id="journal-fish-records"><IconFish size={16} aria-hidden="true" /> Your catches</h3>
        {pages.fishRecords.length === 0 ? <p className="journal-empty-copy">No fish recorded yet.</p> : (
          <div className="journal-record-list">
            {pages.fishRecords.map((record) => (
              <article key={record.speciesId} className="journal-record-entry">
                <div className="journal-entry-portrait-frame">
                  <AtlasImage src={atlasForFish(record.speciesId)} alt="" size={44} />
                </div>
                <div className="journal-entry-meta">
                  <strong>{record.name}</strong>
                  <span className="journal-entry-sub">{record.habitatsLabel}</span>
                </div>
                <div className="journal-entry-stats">
                  <div className="journal-stat-chip">
                    <span className="journal-stat-label">Landed</span>
                    <span className="journal-stat-val">{record.caughtCount}</span>
                  </div>
                  <div className="journal-stat-chip is-gold">
                    <span className="journal-stat-label">Best Catch</span>
                    <span className="journal-stat-val">{record.bestLabel}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="journal-field-records" className="journal-records-section">
        <h3 id="journal-field-records"><IconSprout size={16} aria-hidden="true" /> Field notes</h3>
        <div className="journal-knowledge-list">
          {pages.cropRecords.map((record) => (
            <article key={record.cropId} className="journal-knowledge-entry">
              <div className="journal-knowledge-icon-badge">
                <IconSprout size={18} aria-hidden="true" />
              </div>
              <div className="journal-entry-meta">
                <strong>{record.name}</strong>
                <span className="journal-entry-sub">{record.harvestedCount} harvested</span>
              </div>
              {record.bestQuality && (
                <div className="journal-stat-chip is-gold">
                  <span className="journal-stat-label">Best Quality</span>
                  <span className="journal-stat-val">{record.bestQuality}</span>
                </div>
              )}
            </article>
          ))}
          {pages.knowledge.map((entry) => (
            <article key={entry.id} className="journal-knowledge-entry is-note">
              <div className="journal-knowledge-icon-badge">
                <IconJournal size={16} aria-hidden="true" />
              </div>
              <div className="journal-entry-meta">
                <strong>{entry.title}</strong>
                <span className="journal-knowledge-summary">{entry.summary}</span>
              </div>
            </article>
          ))}
          {pages.cropRecords.length === 0 && pages.knowledge.length === 0 && <p className="journal-empty-copy">New notes appear as you work and explore.</p>}
        </div>
      </section>
    </div>
  </section>
);

/** Each person keeps their own trade mark, so the directory does not read as one repeated card. */
const PERSON_PORTRAIT_ICONS: Record<string, React.ReactNode> = {
  anchor: <IconAnchor size={18} aria-hidden="true" />,
  boat: <IconBoat size={18} aria-hidden="true" />,
  fish: <IconFish size={18} aria-hidden="true" />,
  pack: <IconPack size={18} aria-hidden="true" />,
  sprout: <IconSprout size={18} aria-hidden="true" />
};

const PersonPortrait: React.FC<{ icon: string }> = ({ icon }) =>
  PERSON_PORTRAIT_ICONS[icon] ?? <IconPeople size={18} aria-hidden="true" />;

/**
 * The People folio: a directory of the named cast. It shows the line the world
 * currently uses for each person and the standing the player has earned, all
 * derived from existing save state.
 */
const PeoplePage: React.FC<{ people: PeoplePageDto }> = ({ people }) => (
  <section className="journal-page journal-people-page" aria-label="People">
    <div className="journal-page-heading">
      <h2>People along the coast</h2>
    </div>
    {people.people.length === 0 ? (
      <p className="journal-empty-copy">No one has crossed your path yet.</p>
    ) : (
      <>
        <div className="journal-people-summary">
          <span>
            <IconPeople size={14} aria-hidden="true" />
            <strong>{people.recognizedCount}</strong> of <strong>{people.total}</strong> familiar
          </span>
        </div>
        <div className="journal-people-list">
      {people.people.map((person) => (
        <article
          key={person.id}
          className={`journal-person is-tier-${person.standingTier}${person.recognized ? " is-recognized" : ""}`}
          data-testid={`journal-person-${person.id}`}
          data-recognized={person.recognized ? "true" : "false"}
        >
          <div className="journal-person-medallion" aria-hidden="true">
            <PersonPortrait icon={person.portraitIcon} />
          </div>
          <div className="journal-person-main">
            <div className="journal-person-head">
              <div className="journal-person-names">
                <h3>{person.name}</h3>
                <span className="journal-person-title">{person.title}</span>
              </div>
              <span className={`journal-person-standing is-tier-${person.standingTier}`}>
                <span className="journal-person-standing-mark" aria-hidden="true" />
                {person.standingLabel}
              </span>
            </div>
            <p className="journal-person-line">{person.line}</p>
            <div className="journal-person-meta">
              <span className="journal-person-meta-item">
                <IconPin size={12} aria-hidden="true" />
                Now at {person.locationName}
              </span>
              {person.questsCompleted > 0 && <span className="journal-person-meta-item">
                <IconCheck size={12} aria-hidden="true" />
                {person.questsCompleted} {person.questsCompleted === 1 ? "commission completed" : "commissions completed"}
              </span>}
              <span className="journal-person-district">{person.district}</span>
            </div>
          </div>
        </article>
      ))}
    </div>
      </>
    )}
  </section>
);

const NOTICE_CATEGORY_LABELS: Record<VillageNoticeCategory, string> = {
  town: "Town",
  market: "Market",
  harbor: "Harbor",
  farm: "Field"
};

/**
 * The village board. Entries are authored community notices filtered to what
 * the player has already earned, so the square feels like it is talking about
 * the same coast the save file remembers.
 */
const NoticesPage: React.FC<{ notices: readonly VillageNoticeDto[] }> = ({ notices }) => (
  <section className="journal-page journal-notices-page" aria-label="Town notices">
    <div className="journal-page-heading">
      <h2>From the village board</h2>
    </div>
    {notices.length === 0 ? (
      <p className="journal-empty-copy">The board is bare. Notices appear as the town has news.</p>
    ) : (
      <div className="journal-notices-board">
        {notices.map((notice) => (
          <article key={notice.id} className={`journal-notice journal-notice--${notice.category}`}>
            <div className="journal-notice-head">
              <span className="journal-notice-category">{NOTICE_CATEGORY_LABELS[notice.category]}</span>
              <span className="journal-notice-source">{notice.source}</span>
            </div>
            <h3 className="journal-notice-title">{notice.title}</h3>
            <p className="journal-notice-body">{notice.body}</p>
          </article>
        ))}
      </div>
    )}
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

const SKILL_ICONS: Record<SkillId, React.ReactNode> = {
  farming: <IconSprout size={24} aria-hidden="true" />,
  fishing: <IconFish size={24} aria-hidden="true" />,
  processing: <IconTools size={24} aria-hidden="true" />,
  trading: <IconCoin size={24} aria-hidden="true" />
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
    <div className="journal-page-heading"><h2>Practice along the coast</h2></div>
    <div className="journal-skills-list">
      {skills.length === 0 ? (
        <p className="journal-empty-copy">No practice recorded yet.</p>
      ) : skills.map((skill) => {
        const next = getNextRank(skill.xp);
        const unlockIds = next ? next[SKILL_UNLOCK_KEYS[skill.skill]].slice(0, 3) : [];
        const unlockNames = unlockIds.map(unlockDisplayName);
        const nextRankLabel = next ? next.rankName : "Max Rank";
        return (
          <article key={skill.skill} className="journal-skill-card">
            <div className="journal-skill-medallion">
              {SKILL_ICONS[skill.skill] ?? <IconTools size={24} aria-hidden="true" />}
            </div>
            <div className="journal-skill-main">
              <div className="journal-skill-header">
                <div className="journal-skill-titles">
                  <h3>{skill.label}</h3>
                  <span className="journal-rank-badge">{skill.rankName}</span>
                </div>
              </div>

              <div className="journal-skill-meter-row">
                <Meter
                  label={`${skill.label} progress`}
                  value={skill.progressPercent}
                  max={100}
                  showLabel={false}
                  valueText={skill.nextXp !== null ? `${skill.xp.toLocaleString()} / ${skill.nextXp.toLocaleString()} XP` : "Mastered"}
                  variant="gold"
                />
              </div>

              <div className="journal-skill-unlocks-footer">
                {next ? (
                  <div className="journal-next-tier-preview">
                    <span className="journal-next-tier-title">
                      Next: <strong>{nextRankLabel}</strong>
                    </span>
                    {unlockNames.length > 0 && (
                      <div className="journal-unlock-chips">
                        <span>{unlockNames.join(" · ")}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="journal-mastered-note">
                    <IconSparkle size={14} aria-hidden="true" />
                    <span>You have mastered this craft</span>
                  </div>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  </section>
);
