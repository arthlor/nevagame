import { createStoneModel, createRoundBushModel, createReedsModel } from "./environment/stoneAndFoliage";
import { createMerchantCarriageModel } from "./props/createMerchantCarriageModel";
import type { AuthoredGenerator } from "../kit";
import { createFarmKitchenModel } from "./buildings/createFarmKitchenModel";
import { createBannerClothModel } from "./cloth/createBannerClothModel";
import { createLaundryLineModel } from "./cloth/createLaundryLineModel";
import { createButterflyModel } from "./fauna/createButterflyModel";
import { createCatModel } from "./fauna/createCatModel";
import { createChickenModel } from "./fauna/createChickenModel";
import { createDogModel } from "./fauna/createDogModel";
import { createDuckModel } from "./fauna/createDuckModel";
import { createGullModel } from "./fauna/createGullModel";
import { createPigeonModel } from "./fauna/createPigeonModel";
import { createRabbitModel } from "./fauna/createRabbitModel";
import { createSheepModel } from "./fauna/createSheepModel";
import { createFishModel } from "./fish/createFishModel";
import { createClayOvenModel, createFirePitModel, createSmokePlumeModel, createTrailKioskModel, createTrailSignpostModel } from "./props/camp";
import { createFishTradePackModel } from "./props/createFishTradePackModel";
import { createHayBaleModel } from "./props/createHayBaleModel";
import { createLampPostModel } from "./props/createLampPostModel";
import { createLobsterTrapModel } from "./props/createLobsterTrapModel";
import { createMilkChurnModel } from "./props/createMilkChurnModel";
import { createNetRackModel } from "./props/createNetRackModel";
import { createProduceStallModel } from "./props/createProduceStallModel";
import { createPumpkinPatchModel } from "./props/createPumpkinPatchModel";
import { createWagonCartModel } from "./props/createWagonCartModel";
import { createWaterTroughModel } from "./props/createWaterTroughModel";
import { createWaterWellModel } from "./props/createWaterWellModel";
import { createWoodFenceModel } from "./props/createWoodFenceModel";
import { createWorkbenchModel } from "./props/createWorkbenchModel";
import { createWormCompostModel } from "./props/createWormCompostModel";
import { createCozyArmchairModel, createCozyBedModel, createPicnicTableModel, createWoodBenchModel } from "./props/furniture";
import { createApiaryHiveModel, createGardenHoeModel, createPottingBenchModel, createRusticWateringCanModel } from "./props/garden";
import { createCargoCrateLargeModel, createCargoSackModel, createDockLanternModel, createHangingSignboardModel, createTreasureChestModel } from "./props/harbour";
import { createCoralPillarModel, createCoralStaghornModel, createCoralTableModel } from "./props/reef";
import { createIceHouseModel, createMineAditModel, createSaltPansModel, createTimberStackModel } from "./props/industry";
import { createTimberSawbuckModel } from "./props/createTimberSawbuckModel";
import { createCulvertHeadwallModel } from "./props/roadworks";
import { createDriftwoodClusterModel, createDriftwoodLogModel, createFallenLogModel } from "./props/shore";
import { createCraftingJobPropModel } from "./tools/createCraftingJobPropModel";
import { createCropBundleModel } from "./tools/createCropBundleModel";
import { createFishingRodModel } from "./tools/createFishingRodModel";
import { createHarvestBasketModel } from "./tools/createHarvestBasketModel";
import { createScoopModel } from "./tools/createScoopModel";
import { createSeedPouchModel } from "./tools/createSeedPouchModel";
import { createSickleModel } from "./tools/createSickleModel";
import { createWateringCanModel } from "./tools/createWateringCanModel";

/**
 * Authored generators by catalog `generator` name.
 *
 * A catalog asset whose generator is listed here is built by this TypeScript factory instead of
 * Blender. Its parameter contract lives beside this file in `contracts.json` (plain JSON, so the
 * Node pipeline can validate the catalog without compiling TypeScript); a unit test keeps the two in
 * step, and the pipeline refuses a name that Blender also registers.
 */
export const AUTHORED_GENERATORS: Readonly<Record<string, AuthoredGenerator>> = {
  coastal_rock: createStoneModel,
  faceted_rock: createStoneModel,
  pebble_cluster: createStoneModel,
  boulder_large: createStoneModel,
  coastal_boulder: createStoneModel,
  reef_small: createStoneModel,
  rock_spire: createStoneModel,
  sea_stack: createStoneModel,
  round_bush: createRoundBushModel,
  reeds: createReedsModel,
  merchant_carriage: createMerchantCarriageModel,
  fauna_dog: createDogModel,
  fauna_cat: createCatModel,
  fauna_sheep: createSheepModel,
  fauna_duck: createDuckModel,
  fauna_pigeon: createPigeonModel,
  fauna_chicken: createChickenModel,
  fauna_rabbit: createRabbitModel,
  fauna_gull: createGullModel,
  fauna_butterfly: createButterflyModel,
  banner_cloth: createBannerClothModel,
  laundry_line: createLaundryLineModel,
  wood_fence: createWoodFenceModel,
  milk_churn: createMilkChurnModel,
  water_trough: createWaterTroughModel,
  pumpkin_patch: createPumpkinPatchModel,
  stylized_fish: createFishModel,
  sickle: createSickleModel,
  watering_can: createWateringCanModel,
  workstation_scoop: createScoopModel,
  equipment_sickle: createSickleModel,
  equipment_watering_can: createWateringCanModel,
  crafting_job_prop: createCraftingJobPropModel,
  fishing_rod: createFishingRodModel,
  seed_pouch: createSeedPouchModel,
  crop_bundle: createCropBundleModel,
  harvest_basket: createHarvestBasketModel,
  hay_bale: createHayBaleModel,
  worm_compost_bin: createWormCompostModel,
  farm_workbench: createWorkbenchModel,
  wagon_cart: createWagonCartModel,
  water_well: createWaterWellModel,
  lamp_post: createLampPostModel,
  lobster_trap: createLobsterTrapModel,
  fishing_net_rack: createNetRackModel,
  produce_stall: createProduceStallModel,
  farm_kitchen: createFarmKitchenModel,
  driftwood_cluster: createDriftwoodClusterModel,
  driftwood_log: createDriftwoodLogModel,
  fallen_log: createFallenLogModel,
  cozy_bed: createCozyBedModel,
  cozy_armchair: createCozyArmchairModel,
  wood_bench: createWoodBenchModel,
  picnic_table: createPicnicTableModel,
  potting_bench: createPottingBenchModel,
  rustic_watering_can: createRusticWateringCanModel,
  garden_hoe: createGardenHoeModel,
  apiary_hive: createApiaryHiveModel,
  dock_lantern_post: createDockLanternModel,
  hanging_signboard: createHangingSignboardModel,
  cargo_sack: createCargoSackModel,
  cargo_crate_large: createCargoCrateLargeModel,
  treasure_chest: createTreasureChestModel,
  smoke_plume: createSmokePlumeModel,
  clay_oven: createClayOvenModel,
  fire_pit: createFirePitModel,
  trail_kiosk: createTrailKioskModel,
  trail_signpost: createTrailSignpostModel,
  coral_pillar: createCoralPillarModel,
  coral_staghorn: createCoralStaghornModel,
  coral_table: createCoralTableModel,
  fish_trade_pack: createFishTradePackModel,
  mine_adit: createMineAditModel,
  ice_house: createIceHouseModel,
  salt_pans: createSaltPansModel,
  timber_stack: createTimberStackModel,
  timber_sawbuck: createTimberSawbuckModel,
  culvert_headwall: createCulvertHeadwallModel
};
