/**
 * Pure gameplay-space anchors shared by simulation, physics and presentation.
 * Keep this module free of Three.js so simulation can consume it directly.
 */
export const HARBOR_DOCK = {
  marketId: "market.harbor",
  boatPosition: { x: 35, y: 0, z: 55 },
  playerPosition: { x: 25, z: 37 },
  boardRadius: 4,
  dockRadius: 10
} as const;
