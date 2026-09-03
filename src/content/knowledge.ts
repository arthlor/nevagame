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
