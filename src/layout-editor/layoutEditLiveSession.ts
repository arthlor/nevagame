/**
 * DEV layout-editor session overlays. Source TypeScript is the persistence
 * path; these mutations keep interact/sim poses aligned until refresh.
 */
import { ContentRegistry } from "../content/ContentRegistry";
import type { Simulation } from "../simulation/Simulation";
import {
  HARBOR_FISH_TABLE,
  HARBOR_MARKET,
  VILLAGE_MARKET
} from "../world/WorldAnchors";
import { debugRelocateProcessingStationApproach } from "../world/ProcessingStationApproach";
import {
  processingLayoutRotationFromVisual,
  type LayoutEditCommit,
  type LayoutEditTag
} from "./layoutEdit";

function writeXZ(position: { readonly x: number; readonly z: number }, x: number, z: number): void {
  const writable = position as { x: number; z: number };
  writable.x = x;
  writable.z = z;
}

function writeYaw(anchor: { readonly rotationY: number }, rotationY: number): void {
  (anchor as { rotationY: number }).rotationY = rotationY;
}

function writeMarketInteraction(marketId: string, x: number, z: number): void {
  const market = ContentRegistry.markets.get(marketId);
  if (!market) return;
  market.interactionPosition.x = x;
  market.interactionPosition.z = z;
}

export function applyLayoutEditLiveSession(
  sim: Simulation,
  tag: LayoutEditTag,
  commit: LayoutEditCommit
): void {
  const layoutYaw = tag.rotationWriteMode === "processing-station"
    ? processingLayoutRotationFromVisual(commit.rotationY)
    : commit.rotationY;

  if (tag.kind === "farm-structure" || tag.id === "struct.harbor_fish_table") {
    sim.debugRelocateStructure(tag.id, commit.x, commit.z, layoutYaw);
    debugRelocateProcessingStationApproach(tag.id, layoutYaw);
  }

  if (tag.id === "struct.harbor_fish_table") {
    writeXZ(HARBOR_FISH_TABLE.position, commit.x, commit.z);
    writeYaw(HARBOR_FISH_TABLE, layoutYaw);
  }

  if (tag.id === "produce-stall") {
    writeXZ(VILLAGE_MARKET.position, commit.x, commit.z);
    writeYaw(VILLAGE_MARKET, commit.rotationY);
    writeMarketInteraction("market.village", commit.x, commit.z);
  }

  if (tag.id === "fish-market") {
    writeXZ(HARBOR_MARKET.position, commit.x, commit.z);
    writeYaw(HARBOR_MARKET, commit.rotationY);
    writeMarketInteraction("market.harbor", commit.x, commit.z);
  }
}
