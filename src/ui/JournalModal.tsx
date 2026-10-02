import React, { useEffect, useRef, useState } from "react";
import type { ActiveQuestDto } from "../simulation/core/QuestTypes";
import { questProgressNote } from "../simulation/presentation/QuestObjectiveCopy";
import { formatLocalizedQuestObjective } from "../i18n/questObjectives";
import { placeLabel } from "../i18n/placesTr";
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
  IconWarning,
  IconWave
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
        className={`journal-chronicle-modal journal-folio${selectedFolio === "guide" ? " is-guide-open" : ""}`}
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
            <IconJournal size={22} aria-hidden="true" /> {isTr ? "Günlük" : "Journal"}
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
                {activeQuest.objectiveFacts
                  ? formatLocalizedQuestObjective(activeQuest.objectiveFacts, isTr ? "tr" : "en")
                  : activeQuest.objectiveDescription}
              </p>
            </div>
            {activeQuest.completedSteps && activeQuest.completedSteps.length > 0 && (
              <ul className="journal-completed-steps" aria-label={isTr ? "Tamamlanan adımlar" : "Completed steps"}>
                {activeQuest.completedSteps.map((step, index) => (
                  <li key={`${step.action}-${index}`}>{formatLocalizedQuestObjective(step, isTr ? "tr" : "en")}</li>
                ))}
              </ul>
            )}
            {activeQuest.objectiveFacts && questProgressNote(activeQuest.objectiveFacts, isTr ? "tr" : "en") && (
              <p className="journal-progress-note">{questProgressNote(activeQuest.objectiveFacts, isTr ? "tr" : "en")}</p>
            )}
            {activeQuest.targetQuantity > 1 && (
              <div className="journal-story-meter-wrap">
                <Meter
                  label={isTr ? "Görev İlerlemesi" : "Objective Progress"}
                  value={Math.min(activeQuest.currentProgress, activeQuest.targetQuantity)}
                  max={activeQuest.targetQuantity}
                  valueText={`${Math.min(activeQuest.currentProgress, activeQuest.targetQuantity)} / ${activeQuest.targetQuantity}`}
                  showValue={!activeQuest.objectiveFacts}
                  showLabel={false}
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
                    ? (isTr ? `${placeLabel(activeQuest.targetLocation.name, locale)} mevkiine dön` : `Return to ${activeQuest.targetLocation.name}`)
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
            <details className="journal-story-brief-disclosure">
              <summary>
                {isTr ? `${activeQuest.brief.speakerName} ne demişti:` : `What ${activeQuest.brief.speakerName} said`}
              </summary>
              <blockquote className="journal-story-brief" data-testid="journal-story-brief">
                {(isTr && locActiveQuest && locActiveQuest.introDialogue.length > 0
                  ? locActiveQuest.introDialogue
                  : activeQuest.brief.lines
                ).map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
              </blockquote>
            </details>
          )}
        </article>
      ) : (
        <p className="journal-empty-copy">
          {isTr ? "Açık görev yok." : "No active errand."}
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
                    {thread.objectiveFacts
                      ? formatLocalizedQuestObjective(thread.objectiveFacts, isTr ? "tr" : "en")
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
        <ul id="journal-completed-list" className="journal-completed-grid">
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

const TIER_ICONS: Record<string, React.ReactNode> = {
  field: <IconSprout size={15} aria-hidden="true" />,
  harbor: <IconAnchor size={15} aria-hidden="true" />,
  deep: <IconWave size={15} aria-hidden="true" />,
  legend: <IconStar size={15} filled={true} aria-hidden="true" />
};

const HABITAT_LABELS_TR: Record<string, string> = {
  river: "Nehir & Irmak",
  lake: "Göl",
  coast: "Kıyı",
  offshore: "Açık Deniz"
};

/**
 * The Records Board: standing goals that outlive the authored quest chain.
 *
 * Each tier presents its completion status, progress bar, and focused targets
 * with sleek cards, inline follow toggles, and expandable full views.
 */
const RecordsBoard: React.FC<{
  records: JournalPagesDto["records"];
  followingRecordId: string | null;
  canFollowRecords: boolean;
  onFollowRecord?: (recordId: string | null) => void;
  activeTierFilter?: string | null;
}> = ({ records, followingRecordId, canFollowRecords, onFollowRecord, activeTierFilter = null }) => {
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
    .filter((row) => row.total > 0 && (!activeTierFilter || activeTierFilter === "all" || row.tier.id === activeTierFilter));

  const toggleTier = (tierId: string) => {
    playUiSound("cloth");
    setExpandedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tierId)) next.delete(tierId);
      else next.add(tierId);
      return next;
    });
  };

  return (
    <section aria-labelledby="journal-records-board" className="journal-records-board">
      <h3 id="journal-records-board">
        <IconSparkle size={16} aria-hidden="true" /> {isTr ? "Dönüm Noktaları" : "Milestones"}
      </h3>
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
          const progressPercent = total > 0 ? Math.round((done / total) * 100) : 0;

          return (
            <article key={tier.id} className={`journal-record-tier ${isComplete ? "is-complete" : ""}`}>
              <div className="journal-record-tier-head">
                <div className="journal-tier-badge">
                  <span className="journal-tier-icon">{TIER_ICONS[tier.id] ?? <IconStar size={15} filled={isComplete} aria-hidden="true" />}</span>
                  <strong>{isTr ? (RECORD_TIERS_TR[tier.id] ?? tier.title) : tier.title}</strong>
                </div>
                <div className="journal-tier-head-meta">
                  <div className="journal-tier-progress-track" title={`${progressPercent}%`}>
                    <div className="journal-tier-progress-fill" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <span className={`journal-tier-count ${isComplete ? "is-complete" : ""}`}>
                    {isComplete ? (
                      <>
                        <IconCheck size={11} aria-hidden="true" />
                        {isTr ? `${done}/${total} Tamamlandı` : `${done}/${total} Complete`}
                      </>
                    ) : (
                      isTr ? `${done} / ${total} Tamamlandı` : `${done} / ${total} Achieved`
                    )}
                  </span>
                </div>
              </div>
              {visible.length === 0 ? (
                <p className="journal-empty-copy">
                  {isTr ? "Buradaki tüm rekorlar adınıza tescillendi." : "Every record here stands to your name."}
                </p>
              ) : (
                <div className="journal-record-tier-goals">
                  {visible.map((record) => {
                    const locMilestone = getLocalizedMilestone(record);
                    const isFollowed = followingRecordId === record.id;
                    const percent = Math.round(record.progress * 100);

                    return (
                      <div
                        key={record.id}
                        className={`journal-record-goal${record.achieved ? " is-achieved" : ""}${isFollowed ? " is-following" : ""}`}
                      >
                        <div className="journal-record-goal-main">
                          <div className="journal-goal-status-col">
                            {record.achieved ? (
                              <span className="journal-goal-mark is-achieved" title={isTr ? "Tamamlandı" : "Achieved"}>
                                <IconCheck size={13} aria-hidden="true" />
                              </span>
                            ) : isFollowed ? (
                              <span className="journal-goal-mark is-following" title={isTr ? "Takipte" : "Followed"}>
                                <IconPin size={13} aria-hidden="true" />
                              </span>
                            ) : (
                              <span className="journal-goal-mark is-open" />
                            )}
                          </div>
                          <div className="journal-record-goal-meta">
                            <div className="journal-record-title-row">
                              <strong>{locMilestone.title}</strong>
                              {isFollowed && !record.achieved && (
                                <span className="journal-following-tag">{isTr ? "Takipte" : "Pinned"}</span>
                              )}
                            </div>
                            <span className="journal-record-goal-desc">{locMilestone.detail}</span>
                          </div>
                        </div>

                        <div className="journal-record-goal-controls">
                          <div className="journal-record-meter-wrap">
                            <Meter
                              label={locMilestone.title}
                              value={percent}
                              max={100}
                              showLabel={false}
                              valueText={record.currentLabel}
                              variant="gold"
                            />
                            <div className="journal-record-meter-labels">
                              <span className="journal-record-current-val">{record.currentLabel}</span>
                              <span className="journal-record-percent">{percent}%</span>
                            </div>
                          </div>

                          {canFollowRecords && onFollowRecord && (record.followable || isFollowed) && !record.achieved && (
                            <ChromeButton
                              size="sm"
                              variant={isFollowed ? "primary" : "secondary"}
                              className={`journal-record-follow ${isFollowed ? "is-active" : ""}`}
                              aria-pressed={isFollowed}
                              onClick={() => {
                                playUiSound("click");
                                onFollowRecord(isFollowed ? null : record.id);
                              }}
                              aria-label={isFollowed
                                ? (isTr ? `${locMilestone.title} takibini bırak` : `Stop following ${locMilestone.title}`)
                                : (isTr ? `${locMilestone.title} kaydını takip et` : `Follow ${locMilestone.title}`)}
                            >
                              <IconPin size={11} aria-hidden="true" />
                              <span>{isFollowed ? (isTr ? "Takibi bırak" : "Unfollow") : (isTr ? "Takip et" : "Follow")}</span>
                            </ChromeButton>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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

const QUALITY_LABELS_TR: Record<string, string> = {
  common: "Sıradan",
  fine: "İyi",
  exceptional: "Seçkin",
  trophy: "Kupa",
  prize: "Ödüllü"
};

function formatHabitats(habitatsLabel: string, isTr: boolean): string {
  if (!isTr) return habitatsLabel;
  return habitatsLabel
    .split(",")
    .map((h) => HABITAT_LABELS_TR[h.trim()] ?? h.trim())
    .join(", ");
}

function formatBestCatch(bestLabel: string, isTr: boolean): string {
  if (!isTr) return bestLabel;
  let out = bestLabel;
  for (const [en, tr] of Object.entries(QUALITY_LABELS_TR)) {
    out = out.replace(new RegExp(`\\b${en}\\b`, "gi"), tr);
  }
  return out;
}

const RecordsPage: React.FC<{
  pages: JournalPagesDto;
  followingRecordId: string | null;
  canFollowRecords: boolean;
  onFollowRecord?: (recordId: string | null) => void;
}> = ({ pages, followingRecordId, canFollowRecords, onFollowRecord }) => {
  const [activeTab, setActiveTab] = useState<"all" | "milestones" | "catches" | "notes">("all");
  const [selectedTier, setSelectedTier] = useState<string>("all");
  const [habitatFilter, setHabitatFilter] = useState<string>("all");
  const [fishSearch, setFishSearch] = useState<string>("");
  const { locale, getLocalizedFish, getLocalizedCrop, getLocalizedKnowledge } = useTranslation();
  const isTr = locale === "tr";

  const totalMilestones = pages.records.length;
  const achievedMilestones = pages.records.filter((r) => r.achieved).length;
  const totalFish = pages.fishRecords.length;
  const totalCrops = pages.cropRecords.length;
  const totalKnowledge = pages.knowledge.length;
  const totalNotes = totalCrops + totalKnowledge;

  const filteredFish = pages.fishRecords.filter((record) => {
    const locFish = getLocalizedFish(record.speciesId);
    const searchLower = fishSearch.trim().toLowerCase();
    if (searchLower) {
      const matchName = record.name.toLowerCase().includes(searchLower) ||
                        (isTr && locFish.name.toLowerCase().includes(searchLower));
      const matchHabitat = record.habitatsLabel.toLowerCase().includes(searchLower);
      if (!matchName && !matchHabitat) return false;
    }
    if (habitatFilter !== "all") {
      if (!record.habitatsLabel.toLowerCase().includes(habitatFilter.toLowerCase())) {
        return false;
      }
    }
    return true;
  });

  const catchesSection = (
    <section
      aria-labelledby="journal-fish-records"
      className="journal-records-section"
    >
      <div className="journal-section-head-row">
        <h3 id="journal-fish-records">
          <IconFish size={15} aria-hidden="true" /> {isTr ? "Avlarınız" : "Your catches"}
          <span className="journal-section-count">({filteredFish.length})</span>
        </h3>

        {(activeTab === "catches" || pages.fishRecords.length > 4) && (
          <div className="journal-catches-controls">
            <div className="journal-habitat-chips">
              {["all", "river", "lake", "coast", "offshore"].map((hab) => (
                <button
                  key={hab}
                  type="button"
                  className={`journal-habitat-chip ${habitatFilter === hab ? "is-active" : ""}`}
                  onClick={() => { playUiSound("click"); setHabitatFilter(hab); }}
                >
                  {hab === "all"
                    ? (isTr ? "Tümü" : "All")
                    : (isTr ? (HABITAT_LABELS_TR[hab] ?? hab) : hab.charAt(0).toUpperCase() + hab.slice(1))}
                </button>
              ))}
            </div>
            <input
              type="search"
              value={fishSearch}
              onChange={(e) => setFishSearch(e.target.value)}
              placeholder={isTr ? "Balık ara..." : "Filter catches..."}
              className="journal-fish-search-input"
              aria-label={isTr ? "Balık filtrele" : "Filter catches"}
            />
          </div>
        )}
      </div>

      {pages.fishRecords.length === 0 ? (
        <p className="journal-empty-copy">
          {isTr ? "Henüz kaydedilmiş balık yok." : "No fish recorded yet."}
        </p>
      ) : filteredFish.length === 0 ? (
        <p className="journal-empty-copy">
          {isTr ? "Arama kriterine uygun av kaydı bulunamadı." : "No catches match your filter."}
        </p>
      ) : (
        <div className="journal-record-list journal-fish-grid">
          {filteredFish.map((record) => (
            <article key={record.speciesId} className="journal-record-entry journal-fish-card">
              <div className="journal-entry-portrait-frame">
                <AtlasImage src={atlasForFish(record.speciesId)} alt="" size={36} />
              </div>
              <div className="journal-entry-meta">
                <strong className="journal-fish-name">
                  {isTr ? getLocalizedFish(record.speciesId).name : record.name}
                </strong>
                <span className="journal-entry-sub">{formatHabitats(record.habitatsLabel, isTr)}</span>
              </div>
              <div className="journal-entry-stats">
                <span className="journal-fish-count-chip">
                  {isTr ? `${record.caughtCount} adet` : `${record.caughtCount} landed`}
                </span>
                {record.bestLabel && (
                  <span className="journal-fish-best-chip" title={isTr ? "En iyi av" : "Best catch"}>
                    <IconStar size={11} filled={true} aria-hidden="true" />
                    <span>{formatBestCatch(record.bestLabel, isTr)}</span>
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );

  const notesSection = (
    <section
      aria-labelledby="journal-field-records"
      className="journal-records-section"
    >
      <div className="journal-section-head-row">
        <h3 id="journal-field-records">
          <IconSprout size={15} aria-hidden="true" /> {isTr ? "Saha notları" : "Field notes"}
          <span className="journal-section-count">({totalNotes})</span>
        </h3>
      </div>

      <div className="journal-knowledge-list" data-testid="journal-knowledge-entries">
        {pages.cropRecords.length > 0 && (
          <div className="journal-field-group">
            <h4 className="journal-field-subheading">
              <IconSprout size={13} aria-hidden="true" />
              {isTr ? "Tarım ve Hasat Ustalığı" : "Crop Cultivation"}
            </h4>
            <div className="journal-crops-grid">
              {pages.cropRecords.map((record) => (
                <article key={record.cropId} className="journal-knowledge-entry journal-crop-card">
                  <div className="journal-crop-portrait-frame">
                    <IconSprout size={15} aria-hidden="true" />
                  </div>
                  <div className="journal-entry-meta">
                    <strong className="journal-crop-name">
                      {isTr ? getLocalizedCrop(record.cropId).name : record.name}
                    </strong>
                    <span className="journal-entry-sub">
                      {isTr ? `${record.harvestedCount} hasat edildi` : `${record.harvestedCount} harvested`}
                    </span>
                  </div>
                  {record.bestQuality && (
                    <div className="journal-crop-best-chip">
                      <IconStar size={11} filled={true} aria-hidden="true" />
                      <span>{formatBestCatch(record.bestQuality, isTr)}</span>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}

        {pages.knowledge.length > 0 && (
          <div className="journal-field-group">
            <h4 className="journal-field-subheading">
              <IconJournal size={13} aria-hidden="true" />
              {isTr ? "Kıyı Gözlemleri & Bilgi" : "Observations & Lore"}
            </h4>
            <div className="journal-notes-grid">
              {pages.knowledge.map((entry) => {
                const locK = getLocalizedKnowledge(entry.id);
                return (
                  <article key={entry.id} className="journal-knowledge-entry is-note">
                    <div className="journal-knowledge-card-head">
                      <IconJournal size={13} className="journal-knowledge-icon" aria-hidden="true" />
                      <strong>{isTr ? locK.title : entry.title}</strong>
                    </div>
                    <p className="journal-knowledge-summary">{isTr ? locK.summary : entry.summary}</p>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {pages.cropRecords.length === 0 && pages.knowledge.length === 0 && (
          <p className="journal-empty-copy">
            {isTr ? "Çalıştıkça ve keşfettikçe yeni notlar eklenir." : "New notes appear as you work and explore."}
          </p>
        )}
      </div>
    </section>
  );

  return (
    <section className="journal-page journal-records-page" aria-label={isTr ? "Rekorlar" : "Records"}>
      <div className="journal-page-heading journal-records-heading">
        <div className="journal-records-title-group">
          <h2>{isTr ? "Öğrendikleriniz" : "What you have learned"}</h2>
          <span className="journal-page-count">
            {isTr
              ? `${totalMilestones} dönüm noktasının ${achievedMilestones} tanesi tamamlandı`
              : `${achievedMilestones} of ${totalMilestones} milestones achieved`}
          </span>
        </div>
      </div>

      <nav className="journal-records-subnav" role="tablist" aria-label={isTr ? "Kayıt sekmeleri" : "Record categories"}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "all"}
          className={`journal-subnav-btn ${activeTab === "all" ? "is-active" : ""}`}
          onClick={() => { playUiSound("click"); setActiveTab("all"); }}
        >
          <IconSparkle size={13} aria-hidden="true" />
          <span>{isTr ? "Tümü" : "All"}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "milestones"}
          className={`journal-subnav-btn ${activeTab === "milestones" ? "is-active" : ""}`}
          onClick={() => { playUiSound("click"); setActiveTab("milestones"); }}
        >
          <IconStar size={13} filled={true} aria-hidden="true" />
          <span>{isTr ? "Dönüm Noktaları" : "Milestones"}</span>
          <span className="journal-subnav-badge">{achievedMilestones}/{totalMilestones}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "catches"}
          className={`journal-subnav-btn ${activeTab === "catches" ? "is-active" : ""}`}
          onClick={() => { playUiSound("click"); setActiveTab("catches"); }}
        >
          <IconFish size={13} aria-hidden="true" />
          <span>{isTr ? "Avlarınız" : "Your catches"}</span>
          <span className="journal-subnav-badge">{totalFish}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "notes"}
          className={`journal-subnav-btn ${activeTab === "notes" ? "is-active" : ""}`}
          onClick={() => { playUiSound("click"); setActiveTab("notes"); }}
        >
          <IconSprout size={13} aria-hidden="true" />
          <span>{isTr ? "Saha Notları" : "Field notes"}</span>
          <span className="journal-subnav-badge">{totalNotes}</span>
        </button>
      </nav>

      {/* Sub-tab: Milestones filter pills */}
      {activeTab === "milestones" && (
        <div className="journal-tier-filter-bar" role="toolbar" aria-label={isTr ? "Kademe filtresi" : "Tier filters"}>
          <button
            type="button"
            className={`journal-filter-chip ${selectedTier === "all" ? "is-active" : ""}`}
            onClick={() => { playUiSound("click"); setSelectedTier("all"); }}
          >
            <span>{isTr ? "Tüm Kademeler" : "All Tiers"}</span>
            <span className="journal-filter-count">{totalMilestones}</span>
          </button>
          {RECORD_TIERS.map((tier) => {
            const tierRecords = pages.records.filter((r) => r.tier === tier.id);
            const tierDone = tierRecords.filter((r) => r.achieved).length;
            return (
              <button
                key={tier.id}
                type="button"
                className={`journal-filter-chip ${selectedTier === tier.id ? "is-active" : ""}`}
                onClick={() => { playUiSound("click"); setSelectedTier(tier.id); }}
              >
                {TIER_ICONS[tier.id]}
                <span>{isTr ? (RECORD_TIERS_TR[tier.id] ?? tier.title) : tier.title}</span>
                <span className="journal-filter-count">{tierDone}/{tierRecords.length}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Sequential full-width sections */}
      {(activeTab === "all" || activeTab === "milestones") && (
        <RecordsBoard
          records={pages.records}
          followingRecordId={followingRecordId}
          canFollowRecords={canFollowRecords}
          onFollowRecord={onFollowRecord}
          activeTierFilter={activeTab === "milestones" ? selectedTier : "all"}
        />
      )}

      {(activeTab === "all" || activeTab === "catches") && catchesSection}

      {(activeTab === "all" || activeTab === "notes") && notesSection}
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
                      {isTr ? `Şu an: ${placeLabel(person.locationName, locale)}` : `Now at ${person.locationName}`}
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
          {isTr ? "Henüz duyuru yok." : "No notices yet."}
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
            ? "Yeni aşamalar, satın alabileceğin veya üretebileceğin donanımları açar."
            : "Ranks open equipment to buy or craft."}
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
                        {skill.nextRankBenefits.map((benefit) => (
                          <span key={benefit} className="journal-unlock-chip">
                            {benefit}
                          </span>
                        ))}
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
