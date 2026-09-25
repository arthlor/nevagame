import type { WorldIslandDefinition, WorldIslandId } from "./WorldIslands";
import { LoopSegmentIndex } from "./WorldGeometry";

/** Sparse, authored detours. Their open southern approaches never cross the shipping lane. */
export const OCEAN_ISLETS = [
  { id: "island.gull_rest", title: "Gull's Rest", x: 420, z: 215, radiusX: 33, radiusZ: 25, height: 5.5,
    knowledgeId: "knowledge.discovery.gull_rest", summary: "Gulls nest above a quiet landing. The southern drop-off holds coastal schools; the low island is a useful bearing when Neva disappears into haze." },
  { id: "island.driftwood", title: "Driftwood Cay", x: 735, z: -65, radiusX: 39, radiusZ: 30, height: 7,
    knowledgeId: "knowledge.discovery.driftwood", summary: "A weathered fishing camp sits behind the beach. Its saved fuel can and chum are yours to carry onward. Search the water east of the cay for a passing school." },
  { id: "island.lantern", title: "Lantern Shoal", x: 960, z: 295, radiusX: 29, radiusZ: 36, height: 9,
    knowledgeId: "knowledge.discovery.lantern", summary: "A pale stone spire rises above the last small anchorage before Sunreach. Beyond its southern shelf, deep-water fish pass through the channel. Leave room in the hold before following them." }
] as const;
export type OceanIsletId = typeof OCEAN_ISLETS[number]["id"];
export type OceanIslet = typeof OCEAN_ISLETS[number];

export const OCEAN_ISLAND_DEFINITIONS = Object.fromEntries(OCEAN_ISLETS.map((islet) => {
  const size = 128;
  const bounds = { minX: islet.x - size / 2, maxX: islet.x + size / 2, minZ: islet.z - size / 2, maxZ: islet.z + size / 2 };
  const coastLoop = Array.from({ length: 20 }, (_, i) => {
    const angle = i / 20 * Math.PI * 2;
    const shape = 1 + Math.sin(angle * 3) * 0.07 + Math.sin(angle * 5) * 0.035;
    return { x: islet.x + Math.cos(angle) * islet.radiusX * shape, z: islet.z + Math.sin(angle) * islet.radiusZ * shape };
  });
  const definition: WorldIslandDefinition = {
    id: islet.id, label: islet.title, biomeId: "biome.neva_temperate", fishingEcologyId: "ecology.neva",
    terrainPatch: { id: `terrain.${islet.id.slice(7)}` as `terrain.${"gull_rest" | "driftwood" | "lantern"}`,
      islandId: islet.id, center: { x: islet.x, z: islet.z }, sizeMeters: size, resolution: 96, bounds, submergedApronMeters: 12 },
    authoredBounds: bounds, coastLoop, regions: ["region.open_channel"], anchors: {
      landing: { x: islet.x, z: islet.z + islet.radiusZ - 6 },
      discovery: { x: islet.x, z: islet.z + 5 }
    }
  };
  return [islet.id, definition];
})) as Record<OceanIsletId, WorldIslandDefinition>;

const shoreIndices = new Map(OCEAN_ISLETS.map(islet => [islet.id,
  new LoopSegmentIndex(OCEAN_ISLAND_DEFINITIONS[islet.id].coastLoop, 8)]));

export function oceanIsletForId(id: WorldIslandId | undefined | null): OceanIslet | undefined {
  return OCEAN_ISLETS.find((islet) => islet.id === id);
}

export function isletShoreDistance(islet: OceanIslet, x: number, z: number): number {
  return shoreIndices.get(islet.id)!.signedDistance(x, z);
}

export function oceanIsletAt(x: number, z: number): OceanIslet | undefined {
  return OCEAN_ISLETS.find((islet) => Math.abs(x - islet.x) <= 64 && Math.abs(z - islet.z) <= 64);
}

export function isletTerrainHeight(islet: OceanIslet, x: number, z: number): number {
  const inland = -isletShoreDistance(islet, x, z);
  if (inland < 0) return Math.max(-12, inland * 0.22);
  // A continuous sand landing rises onto a broad crown; the higher rear shoulder
  // leaves a low, walkable southern approach and distinct silhouettes at sea.
  const t = Math.min(1, inland / 23);
  const crown = t * t * (3 - 2 * t);
  const rear = Math.max(0, Math.min(1, (islet.z + 8 - z) / 28));
  return inland * 0.055 + crown * islet.height * (0.36 + rear * 0.64);
}
