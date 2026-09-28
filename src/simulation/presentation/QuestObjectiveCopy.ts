import { ContentRegistry } from "../../content/ContentRegistry";
import type {
  QuestObjectiveAction,
  QuestObjectiveDefinition,
  QuestObjectiveFacts,
  QuestObjectiveType,
  QuestProgressKind
} from "../core/QuestTypes";

export type { QuestObjectiveAction, QuestObjectiveFacts, QuestProgressKind };

const ACTION_BY_TYPE: Partial<Record<QuestObjectiveType, QuestObjectiveAction>> = {
  "plant-crop": "plant",
  "water-crop": "water",
  "harvest-crop": "harvest",
  "sell-item": "sell-item",
  "sell-fish": "sell-fish",
  "sell-trade-pack": "sell-trade-pack",
  "craft-recipe": "craft",
  "talk-npc": "talk",
  "catch-basic-fish": "catch",
  "hook-sport-fish": "catch",
  "land-sport-fish": "catch",
  "purchase-upgrade": "purchase"
};

export function questObjectiveFacts(
  objective: QuestObjectiveDefinition,
  current: number,
  destinationName?: string
): QuestObjectiveFacts {
  const required = Math.max(1, objective.targetQuantity);
  const action = ACTION_BY_TYPE[objective.type] ?? "other";
  return {
    action,
    progressKind: action === "talk" || action === "purchase" || action === "turn-in" ? "visit" : "cumulative",
    subject: objectiveSubject(objective),
    destination: destinationName ?? objective.locationAnchor?.name,
    current: Math.max(0, Math.min(current, required)),
    required
  };
}

export function turnInObjectiveFacts(speakerName: string): QuestObjectiveFacts {
  return {
    action: "turn-in",
    progressKind: "visit",
    subject: speakerName,
    current: 1,
    required: 1
  };
}

export function formatQuestObjective(
  facts: QuestObjectiveFacts,
  locale: "en" | "tr" = "en"
): string {
  if (facts.action === "turn-in") {
    const name = facts.subject ?? (locale === "tr" ? "konuşmacı" : "them");
    return locale === "tr" ? `Devam etmek için ${name} ile konuş` : `Talk to ${name} to continue`;
  }
  if (facts.action === "talk") {
    const name = facts.subject ?? (locale === "tr" ? "birisi" : "them");
    if (!facts.destination) return locale === "tr" ? `${name} ile konuş` : `Speak with ${name}`;
    return locale === "tr"
      ? `${facts.destination} konumunda ${name} ile konuş`
      : `Speak with ${name} at ${facts.destination}`;
  }
  const count = `${facts.current}/${facts.required}`;
  const verb = VERB[locale][facts.action];
  const place = facts.destination
    ? (locale === "tr" ? ` · ${facts.destination}` : ` at ${facts.destination}`)
    : "";
  return facts.subject ? `${verb} ${facts.subject}: ${count}${place}` : `${verb}: ${count}${place}`;
}

/** A sale count is what left the satchel at that counter, not what is still carried. */
export function questProgressNote(
  facts: QuestObjectiveFacts,
  locale: "en" | "tr" = "en"
): string | undefined {
  if (facts.action !== "sell-item" && facts.action !== "sell-fish" && facts.action !== "sell-trade-pack") {
    return undefined;
  }
  return locale === "tr"
    ? "Bu sayı bu tezgahta satılan miktardır; heybedeki stok değildir."
    : "This count is what you have sold at this counter, not what is still in the satchel.";
}

function objectiveSubject(objective: QuestObjectiveDefinition): string | undefined {
  const id = objective.targetId;
  if (!id) {
    if (objective.type === "water-crop") return undefined;
    if (objective.type === "catch-basic-fish") return undefined;
    return undefined;
  }
  return ContentRegistry.crops.get(id)?.name
    ?? ContentRegistry.items.get(id)?.name
    ?? ContentRegistry.recipes.get(id)?.name
    ?? ContentRegistry.fishSpecies.get(id)?.name
    ?? ContentRegistry.npcs.get(id)?.name
    ?? ContentRegistry.boats.get(id)?.name
    ?? ContentRegistry.rods.get(id)?.name;
}

const VERB: Record<"en" | "tr", Record<QuestObjectiveAction, string>> = {
  en: {
    plant: "Plant",
    water: "Water",
    harvest: "Harvest",
    "sell-item": "Sell",
    "sell-fish": "Sell",
    "sell-trade-pack": "Sell",
    craft: "Craft",
    talk: "Speak with",
    "turn-in": "Talk to",
    catch: "Catch",
    purchase: "Acquire",
    other: "Complete"
  },
  tr: {
    plant: "Ek",
    water: "Sula",
    harvest: "Hasat",
    "sell-item": "Sat",
    "sell-fish": "Sat",
    "sell-trade-pack": "Sat",
    craft: "Üret",
    talk: "Konuş",
    "turn-in": "Konuş",
    catch: "Yakala",
    purchase: "Edin",
    other: "Tamamla"
  }
};
