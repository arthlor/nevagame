import { NEVA_FOOTHILL_TRAILS } from "../world/NevaLandforms";
import { SUNREACH_ANCHORS } from "../world/WorldIslands";

/** Arrival knowledge reuses the journal's saved knowledge IDs, never a quest cursor. */
export const WORLD_DISCOVERIES = [
  { id: "knowledge.discovery.spring", title: "Mountain Spring", position: NEVA_FOOTHILL_TRAILS[0].points.at(-1)!, view: "river-source", summary: "The Silverwater begins beneath the mountain. The trail returns through the western slopes to the homestead." },
  { id: "knowledge.discovery.overlook", title: "Western Overlook", position: NEVA_FOOTHILL_TRAILS[1].points.at(-1)!, view: "western-overlook", summary: "The western trail overlooks the fields and river. A second path descends to the beach." },
  { id: "knowledge.discovery.beach", title: "Western Beach", position: NEVA_FOOTHILL_TRAILS[2].points.at(-1)!, view: null, summary: "Driftwood gathers below the western ridge, at the end of the descending trail." },
  { id: "knowledge.discovery.bluff", title: "Northern Bluff", position: NEVA_FOOTHILL_TRAILS[3].points.at(-1)!, view: null, summary: "Beyond the spring, the northern path reaches the bluff above the open water." },
  { id: "knowledge.discovery.farm", title: "Homestead Heights", position: { x: -75.4, z: -59.8 }, view: "farm-mountains", summary: "The mountain path begins beside the homestead, connecting the fields to the headwaters." },
  { id: "knowledge.discovery.coast", title: "Lighthouse Cliffs", position: { x: -92, z: 74 }, view: "coast", summary: "The lighthouse watches Neva's southern shore and the water beyond the harbor." },
  { id: "knowledge.discovery.ridge", title: "Exposed Ridge", position: SUNREACH_ANCHORS.exposedRidge, view: "sunreach-ridge", summary: "Above Sunreach's terraces, the exposed ridge looks across the island and channel." },
  { id: "knowledge.discovery.reef", title: "Sunreach Reef Shelf", position: SUNREACH_ANCHORS.southernReefView, view: "sunreach-reef", summary: "The southern reef shelf marks Sunreach's outer coast, beyond the sheltered cove." }
] as const;
