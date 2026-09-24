import type { Simulation } from "../../simulation/Simulation";
import { SPORT_FISHING_REVIEW_POINTS } from "../../simulation/domains/FishingDomain";
import { STARTER_FARM_LAYOUT } from "../../world/FarmLayout";
import { HARBOR_DOCK, WORLD_SPAWN } from "../../world/WorldAnchors";
import { WorldLayout } from "../../world/WorldLayout";

export type DebugStartScenario =
  | "farm"
  | "farm-art"
  | "motion-capture"
  | "farmhouse-north"
  | "farmhouse-south"
  | "harbor"
  | "harbor-skiff"
  | "boat-driving"
  | "storm-skiff"
  | "sport-fishing";

export const DEBUG_START_SCENARIOS = new Set<DebugStartScenario>([
  "farm",
  "farm-art",
  "motion-capture",
  "farmhouse-north",
  "farmhouse-south",
  "harbor",
  "harbor-skiff",
  "boat-driving",
  "storm-skiff",
  "sport-fishing"
]);

export function applyDebugStartScenario(sim: Simulation, scenario: DebugStartScenario): void {
  const poseFor = (x: number, z: number, rotationY: number = 0) => ({
    x,
    y: WorldLayout.traversalSurfaceHeight(x, z) + 0.5,
    z,
    rotationY
  });
  switch (scenario) {
    case "farm":
      sim.setDebugPlayerPose(poseFor(WORLD_SPAWN.playerPosition.x, WORLD_SPAWN.playerPosition.z));
      break;
    case "farm-art":
      sim.prepareDebugStarterTrioArtReview();
      sim.setDebugPlayerPose(poseFor(STARTER_FARM_LAYOUT.origin.x, STARTER_FARM_LAYOUT.origin.z - 5.4));
      break;
    case "motion-capture":
      sim.prepareDebugMotionCaptureCrop();
      sim.setDebugPlayerPose(poseFor(WORLD_SPAWN.playerPosition.x, WORLD_SPAWN.playerPosition.z));
      break;
    case "farmhouse-south": {
      const farmhouse = WorldLayout.landmark("farmhouse");
      sim.setDebugPlayerPose(poseFor(farmhouse.x - 5.6, farmhouse.z));
      break;
    }
    case "farmhouse-north": {
      const farmhouse = WorldLayout.landmark("farmhouse");
      sim.setDebugPlayerPose(poseFor(farmhouse.x - 5.6, farmhouse.z));
      break;
    }
    case "harbor":
      sim.prepareDebugHarborBoarding();
      break;
    case "harbor-skiff":
      if (!sim.prepareDebugSkiffReview()) {
        throw new Error("Could not prepare deterministic harbor-skiff debug start");
      }
      break;
    case "boat-driving":
      if (!sim.setDebugBoatDriving("boat.player_rowboat", {
        x: HARBOR_DOCK.boatPosition.x + 8,
        z: HARBOR_DOCK.boatPosition.z + 10,
        headingRadians: 0
      })) {
        throw new Error("Could not prepare deterministic boat-driving debug start");
      }
      break;
    case "storm-skiff":
      // Open-water storm run for the storm-helm instrument and hull damage:
      // the skiff starts at speed in exposed water with a full storm front.
      sim.setDebugWeather("storm");
      if (!sim.prepareDebugSkiffReview()) {
        throw new Error("Could not prepare deterministic storm-skiff debug start");
      }
      if (!sim.setDebugBoatDriving("boat.player_skiff", {
        x: 500,
        z: 200,
        headingRadians: 0
      })) {
        throw new Error("Could not place the skiff in open water for the storm debug start");
      }
      sim.state.boats["boat.player_skiff"].speed = 6;
      break;
    case "sport-fishing":
      if (!sim.startDebugSportFishing(
        SPORT_FISHING_REVIEW_POINTS.trout.habitatId,
        SPORT_FISHING_REVIEW_POINTS.trout.x,
        SPORT_FISHING_REVIEW_POINTS.trout.z,
        SPORT_FISHING_REVIEW_POINTS.trout.speciesId
      )) {
        throw new Error("Could not prepare deterministic sport-fishing debug start");
      }
      break;
  }
}
