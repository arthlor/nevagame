import { InventoryManager } from "../../simulation/inventory/InventoryManager";
import { getProcessingStationFrontPosition } from "../../world/ProcessingStationApproach";
import type { Simulation } from "../../simulation/Simulation";
import { SPORT_FISHING_REVIEW_POINTS } from "../../simulation/domains/FishingDomain";
import { STARTER_FARM_LAYOUT } from "../../world/FarmLayout";
import { HARBOR_DOCK, HARBOR_TRADE_MOORING, WORLD_SPAWN } from "../../world/WorldAnchors";
import { WorldLayout } from "../../world/WorldLayout";

export type DebugStartScenario =
  | "farm"
  | "farm-trade"
  | "village-trade"
  | "trade-economy"
  | "farm-art"
  | "motion-capture"
  | "farmhouse-north"
  | "farmhouse-south"
  | "harbor"
  | "harbor-fleet"
  | "harbor-skiff"
  | "boat-driving"
  | "storm-skiff"
  | "sport-fishing"
  | "loaded-wagon";

export const DEBUG_START_SCENARIOS = new Set<DebugStartScenario>([
  "farm",
  "farm-trade",
  "village-trade",
  "trade-economy",
  "farm-art",
  "motion-capture",
  "farmhouse-north",
  "farmhouse-south",
  "harbor",
  "harbor-fleet",
  "harbor-skiff",
  "boat-driving",
  "storm-skiff",
  "sport-fishing",
  "loaded-wagon"
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
    case "trade-economy":
    case "village-trade":
      // Persistence-disabled QA: gates can be exercised through the real purchase actions.
      sim.state.player.money = 240000;
      sim.state.player.proficiencies.trading = 30000;
      if (scenario === "trade-economy") sim.state.player.proficiencies.processing = 3000;
      InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [{ itemId: "produce.wheat", quantity: 100 }]);
      sim.setDebugPlayerPose(poseFor(88, -24));
      break;
    case "farm-trade": {
      // Unsaved review session: exercise the ordinary start/wait/collect UI.
      const station = sim.state.world.structures["struct.trade_neva"];
      const front = getProcessingStationFrontPosition("struct.trade_neva", station);
      if (!front) throw new Error("Farm trade review needs the Neva packing yard approach");
      InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [
        { itemId: "produce.wheat", quantity: 4, quality: "common" },
        { itemId: "produce.wheat", quantity: 6, quality: "fine" }
      ]);
      sim.setDebugPlayerPose(poseFor(front.x, front.z));
      break;
    }
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
    case "harbor-fleet":
      sim.prepareDebugHarborBoarding();
      if (!sim.prepareDebugSkiffReview()) throw new Error("Could not prepare the harbor review skiff");
      sim.state.player.money = 200000;
      sim.state.player.proficiencies.trading = 30000;
      sim.setDebugPlayerPose(poseFor(HARBOR_TRADE_MOORING.purchasePosition.x, HARBOR_TRADE_MOORING.purchasePosition.z));
      if (!sim.execute({ type: "vehicle.purchase", vehicleTypeId: "boat.trading_ship" }).success)
        throw new Error("Could not prepare the harbor review coaster");
      sim.setDebugPlayerPose(poseFor(HARBOR_DOCK.playerPosition.x, HARBOR_DOCK.playerPosition.z));
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
    case "loaded-wagon":
      if (!sim.prepareDebugLoadedCarriage()) {
        throw new Error("Could not prepare the deterministic loaded-wagon debug start");
      }
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
