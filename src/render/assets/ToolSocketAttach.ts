import { ASSET_IDS } from "./AssetCatalog.generated";

/**
 * Shared cosmetic-prop attach pose for gameplay (WorldScene) and Art Yard.
 *
 * CharacterEquipment docks an explicitly authored primary palm frame to
 * the source hand socket (+Y fingers, +Z inward contact normal). These
 * scales still apply. Position/Euler values cover body-mounted accessories
 * and any prop without a primary hand contact frame.
 */
export interface SocketAttachPose {
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly scale: number;
}

const IDENTITY_EULER = [0, 0, 0] as const;
const PALM_ORIGIN = [0, 0, 0] as const;
/** glTF +Y (handle) follows the hanging fingers instead of world-up. */
const SHAFT_ALONG_FINGERS = [Math.PI, 0, 0] as const;

const IDENTITY_HOLD: SocketAttachPose = {
  position: PALM_ORIGIN,
  rotation: IDENTITY_EULER,
  scale: 0.85
};

const SHAFT_HOLD: Omit<SocketAttachPose, "scale"> = {
  position: PALM_ORIGIN,
  rotation: SHAFT_ALONG_FINGERS
};

export const SOCKET_ATTACH_BY_ASSET: Readonly<Record<string, SocketAttachPose>> = {
  [ASSET_IDS.TOOL_WATERING_CAN_A]: {
    position: PALM_ORIGIN,
    rotation: IDENTITY_EULER,
    scale: 0.72
  },
  [ASSET_IDS.TOOL_SICKLE_A]: { ...SHAFT_HOLD, scale: 0.82 },
  [ASSET_IDS.TOOL_WORKSTATION_SCOOP_A]: { ...SHAFT_HOLD, scale: 0.78 },
  [ASSET_IDS.TOOL_FISHING_ROD_A]: { ...SHAFT_HOLD, scale: 0.85 },
  [ASSET_IDS.TOOL_SEED_POUCH_A]: {
    position: PALM_ORIGIN,
    rotation: IDENTITY_EULER,
    scale: 0.72
  },
  [ASSET_IDS.PROP_CROP_BUNDLE_A]: {
    position: PALM_ORIGIN,
    rotation: IDENTITY_EULER,
    scale: 0.76
  },
  [ASSET_IDS.PROP_HARVEST_BASKET_A]: {
    position: PALM_ORIGIN,
    rotation: IDENTITY_EULER,
    scale: 0.68
  }
};

export function socketAttachFor(assetId: string): SocketAttachPose {
  if (assetId.startsWith("fish_")) return { ...IDENTITY_HOLD, scale: 1 };
  return SOCKET_ATTACH_BY_ASSET[assetId] ?? IDENTITY_HOLD;
}
