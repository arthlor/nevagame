import { OCEAN_ISLETS, OCEAN_ISLAND_DEFINITIONS } from "../world/OceanIslets";

export interface WorldDiscovery {
  id: string; title: string; position: Readonly<{ x: number; z: number }>; view: string | null; summary: string;
  arrival?: "boat" | "foot"; radiusMeters?: number; reward?: { itemId: string; quantity: number }[];
}
import { NEVA_FOOTHILL_TRAILS } from "../world/NevaLandforms";
import { SUNREACH_ANCHORS } from "../world/WorldIslands";

/** Arrival knowledge reuses the journal's saved knowledge IDs, never a quest cursor. */
export const WORLD_DISCOVERIES: readonly WorldDiscovery[] = [
  { id: "knowledge.discovery.spring", title: "Mountain Spring", position: NEVA_FOOTHILL_TRAILS[0].points.at(-1)!, view: "river-source", summary: "The Silverwater begins beneath the mountain. The trail returns through the western slopes to the homestead." },
  { id: "knowledge.discovery.overlook", title: "Western Overlook", position: NEVA_FOOTHILL_TRAILS[1].points.at(-1)!, view: "western-overlook", summary: "The western trail overlooks the fields and river. A second path descends to the beach." },
  { id: "knowledge.discovery.beach", title: "Western Beach", position: NEVA_FOOTHILL_TRAILS[2].points.at(-1)!, view: null, summary: "Driftwood gathers below the western ridge, at the end of the descending trail." },
  { id: "knowledge.discovery.bluff", title: "Northern Bluff", position: NEVA_FOOTHILL_TRAILS[3].points.at(-1)!, view: null, summary: "Beyond the spring, the northern path reaches the bluff above the open water." },
  { id: "knowledge.discovery.farm", title: "Homestead Heights", position: { x: -75.4, z: -59.8 }, view: "farm-mountains", summary: "The mountain path begins beside the homestead, connecting the fields to the headwaters." },
  { id: "knowledge.discovery.coast", title: "Lighthouse Cliffs", position: { x: -92, z: 74 }, view: "coast", summary: "The lighthouse watches Neva's southern shore and the water beyond the harbor." },
  { id: "knowledge.discovery.ridge", title: "Exposed Ridge", position: SUNREACH_ANCHORS.exposedRidge, view: "sunreach-ridge", summary: "Above Sunreach's terraces, the exposed ridge looks across the island and channel." },
  { id: "knowledge.discovery.reef", title: "Sunreach Reef Shelf", position: SUNREACH_ANCHORS.southernReefView, view: "sunreach-reef", summary: "The southern reef shelf marks Sunreach's outer coast, beyond the sheltered cove." },
  ...OCEAN_ISLETS.map((islet) => ({ id: islet.knowledgeId, title: islet.title,
    position: OCEAN_ISLAND_DEFINITIONS[islet.id].anchors.discovery, view: null, summary: islet.summary })),
  { id: "knowledge.discovery.driftwood_cache", title: "The Saved Can", position: { x: 743, z: -61 }, view: null,
    summary: "Someone sealed a fuel can and a bucket of chum inside the old camp chest. The supplies are in your satchel now; the empty camp remains a useful landing.",
    reward: [{ itemId: "item.boat_fuel", quantity: 1 }, { itemId: "item.chum_bucket", quantity: 1 }] },
  { id: "knowledge.discovery.channel_seam", title: "The Channel Seam", position: { x: 610, z: 110 }, radiusMeters: 35, arrival: "boat", view: null,
    summary: "The crossing opens in every direction here. Watch for surface schools before choosing the northern cay or the direct course to Sunreach. Keep fuel for the way back." }
];
