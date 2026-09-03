export interface KnowledgeEntryDefinition {
  id: string;
  title: string;
  summary: string;
}

export const KNOWLEDGE_ENTRIES: Record<string, KnowledgeEntryDefinition> = {
  "knowledge.land_sea_cycle": {
    id: "knowledge.land_sea_cycle",
    title: "The Land-Sea Cycle",
    summary: "Clean fish scraps at the harbor table, process them into fertilizer, and return that fertility to the farm. The field supplies fishing; the catch can restore the field."
  },
  "knowledge.wheat_milling": {
    id: "knowledge.wheat_milling",
    title: "Wheat Milling",
    summary: "The hand mill turns harvested wheat into ground grain. Grain is the backbone of chum, and chum is how Neva's sport schools are called."
  },
  "knowledge.salt_and_shade": {
    id: "knowledge.salt_and_shade",
    title: "Salt and Shade",
    summary: "Ice buys you hours; salt and dry wind buy you weeks. A cured catch has no clock on it, which is what makes a long crossing worth making at all. Sunreach is poor in water and rich in the one thing that preserves — sun."
  },
  "knowledge.freight_and_favour": {
    id: "knowledge.freight_and_favour",
    title: "Freight and Favour",
    summary: "An order is a promise with a clock on it. Volume pays less per unit and more in total; freshness pays only if you carry ice and keep moving. The board is not a list of prices — it is a list of promises you have to be able to keep."
  },
  "knowledge.family_ledger": {
    id: "knowledge.family_ledger",
    title: "The Family Ledger",
    summary: "The private homestead was worked long before you arrived: the same rows, the same mill, the same market stall. A ledger is not a record of what you own. It is a record of what was kept going, and by whom."
  },
  "knowledge.reading_the_water": {
    id: "knowledge.reading_the_water",
    title: "Reading the Water",
    summary: "Every water keeps its own company. The river holds trout and catfish, the lake pike and arowana, the coast sturgeon and tuna, and the deep the billfish. Season, hour and weather thin a school or thicken it; they never close a water outright."
  },
  "knowledge.worm_composting": {
    id: "knowledge.worm_composting",
    title: "Worm Composting",
    summary: "Plant matter and compost starter become bait worms. Never expect a bin to grant infinite bait; the loop has to be fed."
  }
};
