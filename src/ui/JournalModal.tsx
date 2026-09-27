import React, { useEffect, useRef, useState } from "react";
import type { ActiveQuestDto } from "../simulation/core/QuestTypes";
import type { JournalPagesDto, SkillProgressDto, AlmanacDto, PeoplePageDto } from "../simulation/core/contracts";
import type { SkillId } from "../simulation/core/types";
import { useModalAccessibility } from "./useModalAccessibility";
import { handleTabListKeyDown } from "./useTabListKeyboard";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForFish, atlasForPortrait } from "./chrome/uiAtlas";
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
import { useTranslation } from "../i18n/useTranslation";
import { ContentRegistry } from "../content/ContentRegistry";
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
  followingRecordId?: string | null;
  /** False when endgame guidance already owns the HUD's record tracker. */
  canFollowRecords?: boolean;
  onFollowRecord?: (recordId: string | null) => void;
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

export const JournalModal: React.FC<JournalModalProps> = ({ pages, activeQuest, activeQuests, skills, almanac, notices, people, onClose, initialFolio = "story", followingRecordId = null, canFollowRecords = false, onFollowRecord }) => {
  const [activeFolio, setActiveFolio] = useState<JournalFolio>(initialFolio);
  const modalRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(modalRef, onClose);
  const { locale } = useTranslation();
  const isTr = locale === "tr";

  const visibleFolios = FOLIOS.filter((folio) =>
    (folio.id !== "almanac" || almanac)
    // Reading the village board should still open its empty state before
    // the first authored notice has been earned.
    && (folio.id !== "notices" || notices || initialFolio === "notices")
    && (folio.id !== "people" || people)
  );
  const selectedFolio = visibleFolios.some((folio) => folio.id === activeFolio) ? activeFolio : "story";

  useEffect(() => {
    setActiveFolio(initialFolio);
    if (pageRef.current) pageRef.current.scrollTop = 0;
  }, [initialFolio]);

  const selectFolio = (folio: JournalFolio) => {
    if (folio === selectedFolio) return;
    playUiSound("page-turn");
    setActiveFolio(folio);
    if (pageRef.current) pageRef.current.scrollTop = 0;
  };

  const FOLIO_LABELS_TR: Record<JournalFolio, string> = {
    story: "Hikâye",
    people: "Ahali",
    records: "Rekorlar",
    notices: "Duyurular",
    almanac: "Almanak",
    skills: "Beceriler",
    guide: "Rehber"
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
          <h1 id="journal-title" className="modal-heading-with-mark">
            <IconJournal size={22} aria-hidden="true" /> {isTr ? "Saha Günlüğü" : "Field Journal"}
          </h1>
          <nav
            className="journal-folio-tabs"
            role="tablist"
            aria-label={isTr ? "Günlük sayfaları" : "Journal pages"}
            onKeyDown={handleTabListKeyDown}
          >
            {visibleFolios.map((folio) => (
              <button
                key={folio.id}
                type="button"
                id={`journal-folio-${folio.id}`}
                role="tab"
                aria-selected={selectedFolio === folio.id}
                aria-controls="journal-active-page"
                tabIndex={selectedFolio === folio.id ? 0 : -1}
                className={`journal-folio-btn ${selectedFolio === folio.id ? "is-active" : ""}`}
                onClick={() => selectFolio(folio.id)}
              >
                {folio.icon}{isTr ? FOLIO_LABELS_TR[folio.id] : folio.label}
              </button>
            ))}
          </nav>
          <ChromeClose onClick={onClose} label={isTr ? "Günlüğü kapat" : "Close journal"} />
        </header>

        <div
          id="journal-active-page"
          ref={pageRef}
          className="journal-open-pages"
          role="tabpanel"
          aria-labelledby={`journal-folio-${selectedFolio}`}
          tabIndex={0}
        >
          {selectedFolio === "story" && (
            <StoryPage activeQuest={activeQuest} activeQuests={activeQuests} completedStories={pages.completedStories} />
          )}
          {selectedFolio === "people" && people && <PeoplePage people={people} />}
          {selectedFolio === "records" && <RecordsPage pages={pages} followingRecordId={followingRecordId} canFollowRecords={canFollowRecords} onFollowRecord={onFollowRecord} />}
          {selectedFolio === "notices" && <NoticesPage notices={notices ?? []} />}
          {selectedFolio === "almanac" && almanac && <AlmanacPage almanac={almanac} />}
          {selectedFolio === "skills" && <SkillsPage skills={skills} />}
          {selectedFolio === "guide" && <HowToPlayGuide />}
        </div>
      </GameSheet>
    </div>
  );
};

const StoryPage: React.FC<{
  activeQuest: ActiveQuestDto | null;
  activeQuests?: readonly ActiveQuestDto[];
  completedStories: JournalPagesDto["completedStories"];
}> = ({ activeQuest, activeQuests, completedStories }) => {
  const { locale, getLocalizedQuest, getLocalizedQuestTrack } = useTranslation();
  const isTr = locale === "tr";
  const locActiveQuest = activeQuest ? getLocalizedQuest(activeQuest.questId) : null;
  const otherThreads = (activeQuests ?? []).filter(
    (thread) => thread.trackId !== activeQuest?.trackId
  );
  return (
    <section className="journal-page journal-story-page" aria-label={isTr ? "Hikâye" : "Story"}>
      <div className="journal-page-heading">
        <h2>{isTr ? (locActiveQuest?.actTitle ?? (activeQuest?.actTitle ?? "Açık kıyı")) : (activeQuest?.actTitle ?? "Open coast")}</h2>
      </div>
      {activeQuest ? (
        <article className="journal-active-story journal-story-scroll">
          <div className="journal-story-title-row">
            <h3>{isTr ? (locActiveQuest?.questTitle ?? activeQuest.questTitle) : activeQuest.questTitle}</h3>
          </div>

          <div className="journal-story-objective-card">
            <div className="journal-objective-row">
              <IconPin size={16} className="journal-objective-pin" aria-hidden="true" />
              <p className="journal-objective-desc">
                {isTr
                  ? (locActiveQuest?.objectives?.[activeQuest.currentStepIndex]?.description ?? activeQuest.objectiveDescription)
                  : activeQuest.objectiveDescription}
              </p>
            </div>
            {activeQuest.targetQuantity > 1 && (
              <div className="journal-story-meter-wrap">
                <Meter
                  label={isTr ? "Görev İlerlemesi" : "Objective Progress"}
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
                <strong>{isTr ? "Teslime hazır" : "Ready to hand in"}</strong>
                <span>
                  {activeQuest.targetLocation
                    ? (isTr ? `${activeQuest.targetLocation.name} mevkiine dön` : `Return to ${activeQuest.targetLocation.name}`)
                    : (isTr ? "Bu vazifeyi bitirmek için geri dön" : "Return to finish this errand")}
                </span>
              </div>
            </div>
          )}

          {activeQuest.turnInBlockerReason && (
            <div className="journal-blocked-seal" role="alert">
              <IconWarning size={18} aria-hidden="true" />
              <div className="journal-seal-text">
                <strong>{isTr ? "Teslim etmeden önce gerekenler" : "Before you can hand this in"}</strong>
                <span>{activeQuest.turnInBlockerReason}</span>
              </div>
            </div>
          )}

          {/* The ask as it was put, so instructions can be read again without
              walking back across the island to hear them. Content-derived, not
              a saved transcript. */}
          {activeQuest.brief && activeQuest.brief.lines.length > 0 && (
            <blockquote className="journal-story-brief" data-testid="journal-story-brief">
              <span className="journal-story-brief-speaker">
                {isTr ? `${activeQuest.brief.speakerName} ne demişti:` : `What ${activeQuest.brief.speakerName} said`}
              </span>
              {(isTr && locActiveQuest && locActiveQuest.introDialogue.length > 0
                ? locActiveQuest.introDialogue
                : activeQuest.brief.lines
              ).map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </blockquote>
          )}
        </article>
      ) : (
        <p className="journal-empty-copy">
          {isTr ? "Aktif bir hikâye vazifesi yok. Kıyı keşfedilmeyi bekliyor." : "No active story errand. The coast is yours to explore."}
        </p>
      )}

      {otherThreads.length > 0 && (
        <section className="journal-open-threads" aria-label={isTr ? "Diğer açık vazifeler" : "Other open threads"}>
          <h3 className="journal-threads-heading">
            <IconCompass size={15} aria-hidden="true" />
            <span>{isTr ? `Diğer vazifeler (${otherThreads.length})` : `Other errands (${otherThreads.length})`}</span>
          </h3>
          <div className="journal-threads-grid">
            {otherThreads.map((thread) => {
              const locThread = getLocalizedQuest(thread.questId);
              const locTrack = getLocalizedQuestTrack(thread.trackId);
              return (
                <article key={thread.trackId} className="journal-open-thread" data-testid={`journal-thread-${thread.trackId}`}>
                  <div className="journal-thread-top">
                    <span className="journal-thread-track-tag">{isTr ? locTrack.title : thread.trackTitle}</span>
                    {thread.isQuestReadyToTurnIn && (
                      <span className="journal-thread-ready-tag">{isTr ? "Teslime hazır" : "Ready to hand in"}</span>
                    )}
                  </div>
                  <h4 className="journal-thread-quest">{isTr ? (locThread.questTitle || thread.questTitle) : thread.questTitle}</h4>
                  <p className="journal-thread-objective">
                    {isTr
                      ? (locThread.objectives?.[thread.currentStepIndex]?.description ?? thread.objectiveDescription)
                      : thread.objectiveDescription}
                  </p>
                  {thread.turnInBlockerReason && (
                    <p className="journal-thread-blocker"><IconWarning size={14} aria-hidden="true" /> {thread.turnInBlockerReason}</p>
                  )}
                </article>
              );
            })}
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
  const { locale, getLocalizedQuest } = useTranslation();
  const isTr = locale === "tr";
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
        {isTr ? `Tamamlanan hikâyeler · ${stories.length}` : `Completed stories · ${stories.length}`}
      </ChromeButton>
      {open && (
        <ul id="journal-completed-list">
          {stories.map((story) => (
            <li key={story.questId} className="is-complete">
              <IconCheck size={13} aria-hidden="true" />
              <span>{isTr ? (getLocalizedQuest(story.questId).questTitle || story.title) : story.title}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const RECORD_TIERS_TR: Record<string, string> = {
  field: "Tarlalar",
  harbor: "Liman",
  deep: "Açık Deniz",
  legend: "Efsanevi Rekorlar"
};

/**
 * The Records Board: standing goals that outlive the authored quest chain.
 *
 * All 34 milestones at once would be a wall, so each tier shows its completion
 * count and the two closest to falling — which is the "what now" answer the
 * game had no way to give once the story ran out.
 */
const RecordsBoard: React.FC<{
  records: JournalPagesDto["records"];
  followingRecordId: string | null;
  canFollowRecords: boolean;
  onFollowRecord?: (recordId: string | null) => void;
}> = ({ records, followingRecordId, canFollowRecords, onFollowRecord }) => {
  const [expandedTiers, setExpandedTiers] = useState<ReadonlySet<string>>(new Set());
  const { locale, getLocalizedMilestone } = useTranslation();
  const isTr = locale === "tr";
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
      <h3 id="journal-records-board"><IconSparkle size={16} aria-hidden="true" /> {isTr ? "Dönüm Noktaları" : "Milestones"}</h3>
      <div className="journal-record-tiers-grid">
        {tiers.map(({ tier, done, total, open, achieved, expanded }) => {
          // Keep the player's followed goal visible when a tier is collapsed.
          const followed = open.find((record) => record.id === followingRecordId);
          const openPreview = followed
            ? [followed, ...open.filter((record) => record.id !== followed.id)].slice(0, 2)
            : open.slice(0, 2);
          const preview = [...openPreview, ...achieved.slice(0, 2 - openPreview.length)];
          const visible = expanded ? [...open, ...achieved] : preview;
          const isComplete = done === total;
          return (
            <article key={tier.id} className={`journal-record-tier ${isComplete ? "is-complete" : ""}`}>
              <div className="journal-record-tier-head">
                <div className="journal-tier-badge">
                  <IconStar size={15} filled={isComplete} aria-hidden="true" />
                  <strong>{isTr ? (RECORD_TIERS_TR[tier.id] ?? tier.title) : tier.title}</strong>
                </div>
                <span className="journal-tier-count">
                  {isTr ? `${done} / ${total} Tamamlandı` : `${done} / ${total} Achieved`}
                </span>
              </div>
              {visible.length === 0 ? (
                <p className="journal-empty-copy">
                  {isTr ? "Buradaki tüm rekorlar adınıza tescillendi." : "Every record here stands to your name."}
                </p>
              ) : visible.map((record) => {
                const locMilestone = getLocalizedMilestone(record);
                return (
                  <div key={record.id} className={`journal-record-goal${record.achieved ? " is-achieved" : ""}`}>
                    <div className="journal-record-goal-meta">
                      <strong>{locMilestone.title}</strong>
                      <span>{locMilestone.detail}</span>
                    </div>
                    <div className="journal-record-meter-wrap">
                      <Meter
                        label={locMilestone.title}
                        value={Math.round(record.progress * 100)}
                        max={100}
                        showLabel={false}
                        valueText={record.currentLabel}
                        variant="gold"
                      />
                    </div>
                  {canFollowRecords && onFollowRecord && (record.followable || followingRecordId === record.id) && !record.achieved && (
                    <ChromeButton
                      size="sm"
                      variant="secondary"
                      className="journal-record-follow"
                      aria-pressed={followingRecordId === record.id}
                      onClick={() => onFollowRecord(followingRecordId === record.id ? null : record.id)}
                    >{followingRecordId === record.id ? (isTr ? "Takibi bırak" : "Stop following") : (isTr ? "Takip et" : "Follow")}</ChromeButton>
                  )}
                </div>
              );
            })}
              {total > preview.length && (
                <ChromeButton
                  size="sm"
                  variant="secondary"
                  soundCue="cloth"
                  className="journal-tier-toggle"
                  aria-expanded={expanded}
                  onClick={() => toggleTier(tier.id)}
                >
                  {expanded
                    ? (isTr ? "Daha az göster" : "Show less")
                    : (isTr ? `Tüm ${total} kaydı göster` : `Show all ${total} entries`)}
                </ChromeButton>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};

const RecordsPage: React.FC<{
  pages: JournalPagesDto;
  followingRecordId: string | null;
  canFollowRecords: boolean;
  onFollowRecord?: (recordId: string | null) => void;
}> = ({ pages, followingRecordId, canFollowRecords, onFollowRecord }) => {
  const { locale, getLocalizedFish, getLocalizedCrop, getLocalizedKnowledge } = useTranslation();
  const isTr = locale === "tr";
  return (
    <section className="journal-page journal-records-page" aria-label={isTr ? "Rekorlar" : "Records"}>
      <div className="journal-page-heading">
        <h2>{isTr ? "Öğrendikleriniz" : "What you have learned"}</h2>
        <span className="journal-page-count">
          {isTr
            ? `${pages.records.length} rekordan ${pages.records.filter((r) => r.achieved).length} tanesi tamamlandı`
            : `${pages.records.filter((record) => record.achieved).length} of ${pages.records.length} records achieved`}
        </span>
      </div>
      <RecordsBoard records={pages.records} followingRecordId={followingRecordId} canFollowRecords={canFollowRecords} onFollowRecord={onFollowRecord} />
      <div className="journal-record-columns">
        <section aria-labelledby="journal-fish-records" className="journal-records-section">
          <h3 id="journal-fish-records"><IconFish size={16} aria-hidden="true" /> {isTr ? "Avlarınız" : "Your catches"}</h3>
          {pages.fishRecords.length === 0 ? <p className="journal-empty-copy">{isTr ? "Henüz kaydedilmiş balık yok." : "No fish recorded yet."}</p> : (
            <div className="journal-record-list">
              {pages.fishRecords.map((record) => (
                <article key={record.speciesId} className="journal-record-entry">
                  <div className="journal-entry-portrait-frame">
                    <AtlasImage src={atlasForFish(record.speciesId)} alt="" size={44} />
                  </div>
                  <div className="journal-entry-meta">
                    <strong>{isTr ? getLocalizedFish(record.speciesId).name : record.name}</strong>
                    <span className="journal-entry-sub">{record.habitatsLabel}</span>
                  </div>
                  <div className="journal-entry-stats">
                    <div className="journal-stat-chip">
                      <span className="journal-stat-label">{isTr ? "Yakalandı" : "Landed"}</span>
                      <span className="journal-stat-val">{record.caughtCount}</span>
                    </div>
                    <div className="journal-stat-chip is-gold">
                      <span className="journal-stat-label">{isTr ? "En İyi Av" : "Best Catch"}</span>
                      <span className="journal-stat-val">{record.bestLabel}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="journal-field-records" className="journal-records-section">
          <h3 id="journal-field-records"><IconSprout size={16} aria-hidden="true" /> {isTr ? "Saha notları" : "Field notes"}</h3>
          <div className="journal-knowledge-list">
            {pages.cropRecords.map((record) => (
              <article key={record.cropId} className="journal-knowledge-entry">
                <div className="journal-knowledge-icon-badge">
                  <IconSprout size={18} aria-hidden="true" />
                </div>
                <div className="journal-entry-meta">
                  <strong>{isTr ? getLocalizedCrop(record.cropId).name : record.name}</strong>
                  <span className="journal-entry-sub">{isTr ? `${record.harvestedCount} hasat edildi` : `${record.harvestedCount} harvested`}</span>
                </div>
                {record.bestQuality && (
                  <div className="journal-stat-chip is-gold">
                    <span className="journal-stat-label">{isTr ? "En İyi Kalite" : "Best Quality"}</span>
                    <span className="journal-stat-val">{record.bestQuality}</span>
                  </div>
                )}
              </article>
            ))}
            {pages.knowledge.map((entry) => {
              const locK = getLocalizedKnowledge(entry.id);
              return (
                <article key={entry.id} className="journal-knowledge-entry is-note">
                  <div className="journal-knowledge-icon-badge">
                    <IconJournal size={16} aria-hidden="true" />
                  </div>
                  <div className="journal-entry-meta">
                    <strong>{isTr ? locK.title : entry.title}</strong>
                    <span className="journal-knowledge-summary">{isTr ? locK.summary : entry.summary}</span>
                  </div>
                </article>
              );
            })}
            {pages.cropRecords.length === 0 && pages.knowledge.length === 0 && (
              <p className="journal-empty-copy">{isTr ? "Çalıştıkça ve keşfettikçe yeni notlar eklenir." : "New notes appear as you work and explore."}</p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
};

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

const STANDING_LABELS_TR: Record<string, string> = {
  "Close": "Sırdaş",
  "Trusted": "Güvenilir",
  "Acquainted": "Tanıdık",
  "New to the coast": "Kıyıya Yabancı"
};

/**
 * The People folio: a directory of the named cast. It shows the line the world
 * currently uses for each person and the standing the player has earned, all
 * derived from existing save state.
 */
const PeoplePage: React.FC<{ people: PeoplePageDto }> = ({ people }) => {
  const { locale, getLocalizedNpc } = useTranslation();
  const isTr = locale === "tr";
  return (
    <section className="journal-page journal-people-page" aria-label={isTr ? "Ahali" : "People"}>
      <div className="journal-page-heading">
        <h2>{isTr ? "Kıyı boyunca ahali" : "People along the coast"}</h2>
        {people.people.length > 0 && (
          <span className="journal-page-count journal-people-summary">
            <IconPeople size={14} aria-hidden="true" /> {isTr ? `${people.total} kişiden ${people.recognizedCount} tanesi tanıdık` : `${people.recognizedCount} of ${people.total} familiar`}
          </span>
        )}
      </div>
      {people.people.length === 0 ? (
        <p className="journal-empty-copy">{isTr ? "Henüz kimseyle karşılaşmadınız." : "No one has crossed your path yet."}</p>
      ) : (
        <div className="journal-people-list">
          {people.people.map((person) => {
            const locNpc = getLocalizedNpc(person.id);
            const canonicalNpc = ContentRegistry.npcs.get(person.id);
            let displayLine = person.line;
            if (isTr && canonicalNpc) {
              if (person.recognized && canonicalNpc.recognitionDialogue && locNpc.recognitionDialogue) {
                const rIdx = canonicalNpc.recognitionDialogue.findIndex((r) => r.lines[0] === person.line);
                if (rIdx >= 0 && locNpc.recognitionDialogue[rIdx]?.lines?.[0]) {
                  displayLine = locNpc.recognitionDialogue[rIdx].lines[0];
                } else if (locNpc.recognitionDialogue.length > 0) {
                  displayLine = locNpc.recognitionDialogue[locNpc.recognitionDialogue.length - 1].lines[0];
                }
              } else if (canonicalNpc.idleDialogue && locNpc.idleDialogue) {
                const iIdx = canonicalNpc.idleDialogue.indexOf(person.line);
                if (iIdx >= 0 && locNpc.idleDialogue[iIdx]) {
                  displayLine = locNpc.idleDialogue[iIdx];
                } else if (locNpc.idleDialogue.length > 0) {
                  displayLine = locNpc.idleDialogue[0];
                }
              }
            }

            return (
              <article
                key={person.id}
                className={`journal-person is-tier-${person.standingTier}${person.recognized ? " is-recognized" : ""}`}
                data-testid={`journal-person-${person.id}`}
                data-recognized={person.recognized ? "true" : "false"}
              >
                <div className="journal-person-medallion" aria-hidden="true">
                  {atlasForPortrait(person.id) ? (
                    <AtlasImage src={atlasForPortrait(person.id)!} alt="" size={40} className="journal-person-portrait-img" />
                  ) : (
                    <PersonPortrait icon={person.portraitIcon} />
                  )}
                </div>
                <div className="journal-person-main">
                  <div className="journal-person-head">
                    <div className="journal-person-names">
                      <h3>{isTr ? locNpc.name : person.name}</h3>
                      <span className="journal-person-title">{isTr ? locNpc.title : person.title}</span>
                    </div>
                    <span className={`journal-person-standing is-tier-${person.standingTier}`}>
                      <span className="journal-person-standing-mark" aria-hidden="true" />
                      {isTr ? (STANDING_LABELS_TR[person.standingLabel] ?? person.standingLabel) : person.standingLabel}
                    </span>
                  </div>
                  <p className="journal-person-line">{displayLine}</p>
                  <div className="journal-person-meta">
                    <span className="journal-person-meta-item">
                      <IconPin size={12} aria-hidden="true" />
                      {isTr ? `Şu an: ${person.locationName}` : `Now at ${person.locationName}`}
                    </span>
                    {person.questsCompleted > 0 && (
                      <span className="journal-person-meta-item">
                        <IconCheck size={12} aria-hidden="true" />
                        {isTr
                          ? `${person.questsCompleted} vazife tamamlandı`
                          : `${person.questsCompleted} ${person.questsCompleted === 1 ? "commission completed" : "commissions completed"}`}
                      </span>
                    )}
                    <span className="journal-person-district">{isTr ? locNpc.district : person.district}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};

const NOTICE_CATEGORY_LABELS: Record<VillageNoticeCategory, string> = {
  town: "Town",
  market: "Market",
  harbor: "Harbor",
  farm: "Field"
};

const NOTICE_CATEGORY_LABELS_TR: Record<VillageNoticeCategory, string> = {
  town: "Köy",
  market: "Pazar",
  harbor: "Liman",
  farm: "Tarla"
};

/**
 * The village board. Entries are authored community notices filtered to what
 * the player has already earned, so the square feels like it is talking about
 * the same coast the save file remembers.
 */
const NoticesPage: React.FC<{ notices: readonly VillageNoticeDto[] }> = ({ notices }) => {
  const { locale, getLocalizedNotice } = useTranslation();
  const isTr = locale === "tr";
  return (
    <section className="journal-page journal-notices-page" aria-label={isTr ? "Köy duyuruları" : "Town notices"}>
      <div className="journal-page-heading">
        <h2>{isTr ? "Köy panosundan" : "From the village board"}</h2>
        <span className="journal-page-count">
          {isTr
            ? `${notices.length} duyuru asılı`
            : `${notices.length} ${notices.length === 1 ? "notice" : "notices"} pinned`}
        </span>
      </div>
      {notices.length === 0 ? (
        <p className="journal-empty-copy">
          {isTr ? "Pano henüz boş. Kasabada yeni havadis çıktıkça duyurular asılacak." : "The board is bare. Notices appear as the town has news."}
        </p>
      ) : (
        <div className="journal-notices-board">
          {notices.map((notice) => {
            const locNotice = getLocalizedNotice(notice.id);
            return (
              <article key={notice.id} className={`journal-notice journal-notice--${notice.category}`}>
                <div className="journal-notice-head">
                  <span className="journal-notice-category">
                    {isTr ? NOTICE_CATEGORY_LABELS_TR[notice.category] : NOTICE_CATEGORY_LABELS[notice.category]}
                  </span>
                  <span className="journal-notice-source">{isTr ? locNotice.source : notice.source}</span>
                </div>
                <h3 className="journal-notice-title">{isTr ? locNotice.title : notice.title}</h3>
                <p className="journal-notice-body">{isTr ? locNotice.body : notice.body}</p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};

const SKILL_ICONS: Record<SkillId, React.ReactNode> = {
  farming: <IconSprout size={24} aria-hidden="true" />,
  fishing: <IconFish size={24} aria-hidden="true" />,
  processing: <IconTools size={24} aria-hidden="true" />,
  trading: <IconCoin size={24} aria-hidden="true" />
};

const SkillsPage: React.FC<{ skills: SkillProgressDto[] }> = ({ skills }) => {
  const { locale, getLocalizedSkill, getLocalizedRank } = useTranslation();
  const isTr = locale === "tr";
  const getRankTitle = (rankName: string | null) => {
    if (!rankName) return null;
    const idx = ContentRegistry.ranks.findIndex((r) => r.rankName === rankName);
    return idx >= 0 ? getLocalizedRank(idx).title : rankName;
  };

  return (
    <section className="journal-page journal-skills-page" aria-label={isTr ? "Beceriler" : "Skills"}>
      <div className="journal-page-heading">
        <h2>{isTr ? "Kıyı boyunca hünerler" : "Practice along the coast"}</h2>
        <p>
          {isTr
            ? "Aşamalar yeni imkânlar açar; alet ve erzaklar için yine olağan alımlar veya malzemeler gerekir."
            : "Ranks open options; equipment and supplies still need their usual purchase or materials."}
        </p>
      </div>
      <div className="journal-skills-list">
        {skills.length === 0 ? (
          <p className="journal-empty-copy">{isTr ? "Henüz kayıtlı hüner yok." : "No practice recorded yet."}</p>
        ) : skills.map((skill) => {
          return (
            <article key={skill.skill} className="journal-skill-card">
              <div className="journal-skill-medallion">
                {SKILL_ICONS[skill.skill] ?? <IconTools size={24} aria-hidden="true" />}
              </div>
              <div className="journal-skill-main">
                <div className="journal-skill-header">
                  <div className="journal-skill-titles">
                    <h3>{getLocalizedSkill(skill.skill).name}</h3>
                    <span className="journal-rank-badge">{getRankTitle(skill.rankName)}</span>
                  </div>
                </div>

                <div className="journal-skill-meter-row">
                  <Meter
                    label={`${getLocalizedSkill(skill.skill).name} ${isTr ? "ilerlemesi" : "progress"}`}
                    value={skill.progressPercent}
                    max={100}
                    showLabel={false}
                    valueText={skill.nextXp !== null ? `${skill.xp.toLocaleString()} / ${skill.nextXp.toLocaleString()} XP` : (isTr ? "Ustalaşıldı" : "Mastered")}
                    variant="gold"
                  />
                </div>

                <div className="journal-skill-unlocks-footer">
                  {skill.nextRankName ? (
                    <div className="journal-next-tier-preview">
                      <span className="journal-next-tier-title">
                        {isTr ? "Sonraki: " : "Next: "}<strong>{getRankTitle(skill.nextRankName)}</strong>
                      </span>
                    {skill.nextRankBenefits.length > 0 && (
                      <div className="journal-unlock-chips">
                        {skill.nextRankBenefits.length <= 3 ? (
                          <span>{skill.nextRankBenefits.join(" · ")}</span>
                        ) : (
                          <details>
                            <summary>{skill.nextRankBenefits.slice(0, 2).join(" · ")} · +{skill.nextRankBenefits.length - 2} {isTr ? "daha" : "more"}</summary>
                            <ul>{skill.nextRankBenefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="journal-mastered-note">
                    <IconSparkle size={14} aria-hidden="true" />
                    <span>{isTr ? "Bu zanaatta ustalaştınız" : "You have mastered this craft"}</span>
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
};
