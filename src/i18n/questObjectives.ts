import type { ConversationSegment, QuestObjectiveFacts } from "../simulation/core/QuestTypes";
import { formatQuestObjective } from "../simulation/presentation/QuestObjectiveCopy";
import { getLocalizedQuest, getLocalizedQuestTrack } from "./i18n";
import { localizeCatalogText } from "./catalogNames";
import { placeLabel } from "./placesTr";
import type { SupportedLocale } from "./types";

/** Keep authored requirements intact across every surface and language. */
export function formatLocalizedQuestObjective(facts: QuestObjectiveFacts, locale: SupportedLocale): string {
  const description = facts.questId && facts.objectiveId
    ? getLocalizedQuest(facts.questId, locale).objectives?.[facts.objectiveId]?.description
    : undefined;
  return formatQuestObjective({
    ...facts,
    description: description ?? facts.description,
    subject: facts.subject ? localizeCatalogText(facts.subject, locale) : undefined,
    destination: facts.destination ? placeLabel(facts.destination, locale) : undefined
  }, locale);
}

/** Dialogue carries the step ID because several speakers can share one quest. */
export function localizeQuestSegment(segment: ConversationSegment, locale: SupportedLocale): ConversationSegment {
  if (!segment.questId) return { ...segment };
  const quest = getLocalizedQuest(segment.questId, locale);
  const translatedLines = segment.kind === "intro" ? quest.introDialogue
    : segment.kind === "completion" ? quest.completionDialogue
    : segment.kind === "herald" ? quest.heraldLines
    : segment.kind === "objective" && segment.objectiveId ? quest.objectives?.[segment.objectiveId]?.dialogue
    : undefined;
  return {
    ...segment,
    questTitle: quest.questTitle || segment.questTitle,
    trackTitle: segment.trackId ? getLocalizedQuestTrack(segment.trackId, locale).title || segment.trackTitle : segment.trackTitle,
    lines: translatedLines?.length ? [...translatedLines] : segment.lines
  };
}
