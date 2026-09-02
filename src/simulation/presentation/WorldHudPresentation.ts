import { ContentRegistry } from "../../content/ContentRegistry";
import { InventoryManager } from "../inventory/InventoryManager";
import { PLAYER_TRAVERSAL_TUNING } from "../navigation/PlayerTraversal";
import type { WorldHudCargoDto, WorldHudDto } from "../core/contracts";
import type { FishCargoState, GameState } from "../core/types";
import { dayOfSeason } from "../core/GameClock";
import { WorldLayout } from "../../world/WorldLayout";

const BAIT_ITEM_ID = "item.bait_worms";

const titleCase = (value: string): string =>
  value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;

const seaState = (roughness: number): "Calm" | "Swell" | "Rough" =>
  roughness < 0.35 ? "Calm" : roughness < 0.7 ? "Swell" : "Rough";

export const buildCargoPresentation = (cargo: FishCargoState): WorldHudCargoDto => {
  const freshnessPercent = Math.round(cargo.freshness);
  return {
    cargoId: cargo.id,
    speciesId: cargo.speciesId,
    name: ContentRegistry.fishSpecies.get(cargo.speciesId)?.name ?? "Sport fish",
    weightKg: cargo.weightKg,
    quality: cargo.quality,
    freshnessPercent,
    freshnessTone: freshnessPercent > 65 ? "fresh" : freshnessPercent > 35 ? "medium" : "stale"
  };
};

export function buildWorldHudDto(state: GameState, selectedCropId: string | null = null): WorldHudDto {
  const { clock, player, weather } = state;
  const inventory = state.inventories[player.inventoryId];
  const countOf = (itemId: string): number =>
    inventory ? InventoryManager.getItemCount(inventory, itemId) : 0;
  const armedCrop = selectedCropId ? ContentRegistry.crops.get(selectedCropId) : undefined;
  const armedSeeds = armedCrop ? countOf(armedCrop.seedItemId) : 0;
  let seedTotal = 0;
  let fallbackCropName: string | null = null;
  for (const crop of ContentRegistry.crops.values()) {
    const held = countOf(crop.seedItemId);
    seedTotal += held;
    if (held > 0 && !fallbackCropName) fallbackCropName = crop.name;
  }
  const seedName = armedCrop && armedSeeds > 0 ? armedCrop.name : fallbackCropName;
  const bait = countOf(BAIT_ITEM_ID);
  const rod = ContentRegistry.rods.get(player.equippedRodId);
  const sprintCurrent = player.traversal.sprintStamina;
  const sprintMaximum = PLAYER_TRAVERSAL_TUNING.maximumSprintStamina;
  const showSprint =
    !player.activeBoatId &&
    !player.activeMountId &&
    !state.basicFishing &&
    !state.sportFishing &&
    (sprintCurrent < sprintMaximum - 0.01 || player.traversal.sprintExhausted);
  const workCurrent = Math.max(0, Math.floor(player.workCapacity.current));
  const hour = Math.floor((clock.currentMinute % 1440) / 60);
  const minute = clock.currentMinute % 60;
  const activeBoat = player.activeBoatId ? state.boats[player.activeBoatId] : null;
  const boatDefinition = activeBoat ? ContentRegistry.boats.get(activeBoat.boatTypeId) : null;
  const carriedFishState = player.carriedFishCargoId ? state.fishCargo[player.carriedFishCargoId] : null;
  const hazard = weather.type === "storm"
    ? { text: "Storm Warning", tone: "danger" as const }
    : weather.type === "fog" && weather.visibility < 0.5
      ? { text: "Dense Fog", tone: "caution" as const }
      : weather.windSpeed >= 11
        ? { text: "Gale Winds", tone: "caution" as const }
        : weather.seaRoughness >= 0.7
          ? { text: "Rough Swell", tone: "caution" as const }
          : null;
  const localTemperatureC = WorldLayout.climateSampleAt(player.x, player.z, weather).temperatureC;

  return {
    clock: {
      label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      hour,
      seasonLabel: titleCase(clock.season),
      dayInSeason: dayOfSeason(clock.dayCount),
      timeOfDayLabel: titleCase(clock.timeOfDay),
      timeOfDay: clock.timeOfDay,
      dialRotation: ((clock.currentMinute - 720) / 1440) * 360,
      isNight: clock.timeOfDay === "night" || clock.timeOfDay === "dusk" || hour < 6 || hour >= 20
    },
    weather: {
      type: weather.type,
      temperatureC: Math.round(localTemperatureC),
      hazard
    },
    money: player.money,
    work: {
      current: workCurrent,
      maximum: player.workCapacity.maximum,
      exhausted: player.workCapacity.current < 1,
      showLowNotice: player.workCapacity.current < 1 || workCurrent < 20
    },
    sprint: showSprint
      ? {
          current: sprintCurrent,
          maximum: sprintMaximum,
          exhausted: player.traversal.sprintExhausted
        }
      : null,
    hotbar: [
      { slot: 1, detail: "Till and harvest", quantity: null, ready: true },
      { slot: 2, detail: seedName ?? "No seeds", quantity: seedTotal > 0 ? seedTotal : null, ready: seedTotal > 0 },
      { slot: 3, detail: "Water crops", quantity: null, ready: true },
      { slot: 4, detail: bait > 0 ? "Earthworms" : "Empty", quantity: bait > 0 ? bait : null, ready: bait > 0 },
      { slot: 5, detail: rod?.name ?? "No rod", quantity: null, ready: Boolean(rod) }
    ],
    equippedRodId: player.equippedRodId,
    carriedFish: carriedFishState ? buildCargoPresentation(carriedFishState) : null,
    boat: activeBoat && boatDefinition
      ? {
          boatId: activeBoat.id,
          name: boatDefinition.name,
          speedKnots: Math.round(activeBoat.speed * 1.944),
          seaState: seaState(weather.seaRoughness),
          seaWarning: weather.seaRoughness > boatDefinition.safeSeaRoughness ? "Unsafe swell" : null,
          showNightWarning: clock.timeOfDay === "night" || clock.timeOfDay === "dusk",
          hull: {
            current: activeBoat.durability,
            maximum: boatDefinition.durabilityMax,
            percent: Math.round((activeBoat.durability / Math.max(1, boatDefinition.durabilityMax)) * 100),
            danger: activeBoat.durability < 30
          },
          fuel: boatDefinition.fuelCapacity > 0
            ? {
                current: activeBoat.fuel,
                maximum: boatDefinition.fuelCapacity,
                percent: Math.round((activeBoat.fuel / Math.max(1, boatDefinition.fuelCapacity)) * 100),
                danger: activeBoat.fuel <= boatDefinition.fuelCapacity * 0.2
              }
            : null,
          occupiedCargoSlots: activeBoat.fishCargoSlotIds.filter(Boolean).length,
          cargoSlots: activeBoat.fishCargoSlotIds.map((cargoId, index) => ({
            slotNumber: index + 1,
            cargo: cargoId && state.fishCargo[cargoId] ? buildCargoPresentation(state.fishCargo[cargoId]) : null
          }))
        }
      : null,
    basicFishingPhase: state.basicFishing?.phase ?? null,
    expeditionUnlocked: state.quests.unlockedFeatureIds.includes("feature.expedition_planner")
  };
}
