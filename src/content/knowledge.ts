import { WORLD_DISCOVERIES } from "./discoveries";

export interface KnowledgeEntryDefinition {
  id: string;
  title: string;
  summary: string;
}

export const KNOWLEDGE_ENTRIES: Record<string, KnowledgeEntryDefinition> = {
  ...Object.fromEntries(WORLD_DISCOVERIES.map(({ id, title, summary }) => [id, { id, title, summary }])),
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
  "knowledge.first_expedition_cycle": {
    id: "knowledge.first_expedition_cycle",
    title: "The First Complete Circuit",
    summary: "Seed and harvest became grain, bait and chum. Chum led to a fish worth carrying home, and the sale paid for the next trip. Each step gave the next one a purpose."
  },
  "knowledge.open_horizons": {
    id: "knowledge.open_horizons",
    title: "Open Horizons",
    summary: "Nothing here was finished by one person. The soil was fed by someone who never saw this harvest, the slip was kept by someone who never saw this boat, and the route was salted by an island that could not use it alone. A charter is not permission to go further. It is other people agreeing that you will come back."
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
  "knowledge.packing_stamp": {
    id: "knowledge.packing_stamp",
    title: "The Packing Stamp",
    summary: "A village yard ties and marks a pack where it was made. The receiving counter takes the whole physical load by hand. A sale near home teaches the exchange; a longer route pays for distance, condition and what the far village needs."
  },
  "knowledge.village_roads": {
    id: "knowledge.village_roads",
    title: "The Working Roads",
    summary: "Neva sends grain; Pinewatch has flax, apples and timber; Reedhaven keeps provisions dry above the marsh; Highridge sends roots and workshop goods down the pass. The roads link different work, so the value of a load depends on where it ends."
  },
  "knowledge.shared_load": {
    id: "knowledge.shared_load",
    title: "Two Counters, One Road",
    summary: "A wagon earns its space when its loads have different destinations. Grain reached Pinewatch and tomatoes reached Reedhaven on one round. Each sale fills local stores, so repeating one recipe at one counter pays less until demand recovers."
  },
  "knowledge.channel_manifest": {
    id: "knowledge.channel_manifest",
    title: "The Channel Manifest",
    summary: "Ten marked packs crossed from Neva to Sunreach in one hold, then each was carried ashore and received at the cove counter. A ship's capacity matters only when the cargo has a buyer and the crossing leaves room for a useful return."
  },
  "knowledge.return_cargo": {
    id: "knowledge.return_cargo",
    title: "A Loaded Return",
    summary: "Sunreach's dry terraces grow olives and sunflower seed, while the mainland sends grain and materials. The cove route is more than an outward sale: the return load keeps the same vessel and the people on both shores working."
  },
  "knowledge.replacement_cost": {
    id: "knowledge.replacement_cost",
    title: "The Cost of a Finished Load",
    summary: "A crafted pack spends ingredients, a packing fee and time. Even homegrown materials have a replacement cost. The useful number is the destination's sale price after those costs, freshness, route and current demand, not the largest figure on a sign."
  },
  "knowledge.family_ledger": {
    id: "knowledge.family_ledger",
    title: "The Family Ledger",
    summary: "Your family farmhouse and starter field were inherited, not bought. The nearby commons is kept by many hands: a ledger is not a record of what you own, but of what was kept useful and by whom."
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
  },
  // The family throughline, one object at a time: each is witnessed in play
  // (a pouch handed over, a boat commissioned, a handle worn smooth) before it
  // is written down, so the inheritance is felt before it is explained.
  "knowledge.family_seed_pouch": {
    id: "knowledge.family_seed_pouch",
    title: "The Seed Pouch",
    summary: "Oilcloth, tied at the neck, refilled every autumn from the best of the harvest. Your family saved seed rather than buy it. Saving seed is a promise that there will be a next season, made by someone who means to keep it."
  },
  "knowledge.family_slip": {
    id: "knowledge.family_slip",
    title: "The Family Slip",
    summary: "The cedar rowboat was kept at the harbor slip long after anyone sailed her: greased, registered, waited on. Silas kept her until someone came back for her. A boat is a relationship you maintain, not a thing you own."
  },
  "knowledge.worn_handle": {
    id: "knowledge.worn_handle",
    title: "The Worn Handle",
    summary: "The village mill handle is worn smooth on one side only, by the same grip, season after season. Every tool on Neva is a record of the hands that used it. Yours are on that handle now too."
  }
};
