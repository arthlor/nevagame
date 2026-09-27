import { ASSET_IDS } from "../assets/AssetCatalog";

/** Dedicated scenery cast; these identities never enter the interactive NPC registry. */
export const AMBIENT_NPC_ASSETS = [
  ASSET_IDS.CHAR_NPC_AMBIENT_MALE_01,
  ASSET_IDS.CHAR_NPC_AMBIENT_FEMALE_01,
  ASSET_IDS.CHAR_NPC_AMBIENT_MALE_02,
  ASSET_IDS.CHAR_NPC_AMBIENT_FEMALE_02,
  ASSET_IDS.CHAR_NPC_AMBIENT_MALE_03,
  ASSET_IDS.CHAR_NPC_AMBIENT_FEMALE_03
] as const;
