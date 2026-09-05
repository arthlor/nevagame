import { ContentRegistry } from "../../content/ContentRegistry";
import { InventoryManager } from "../inventory/InventoryManager";
import { accessibleFishingSupplyCount } from "../fishing/FishingSupplies";
import { resolveCargoHasIce } from "../fishing/calculateFreshness";
import { PLAYER_TRAVERSAL_TUNING, carriedLoadPenaltyPercent } from "../navigation/PlayerTraversal";
import type {
  CompassMarkerDto,
  ContextualHotbarSlotDto,
  ContextualStanceId,
  HudContractDto,
  HudStatusChipDto,
  WorldHudBoatDto,
  WorldHudCargoDto,
  WorldHudDto,
  HudIconId
} from "../core/contracts";
import type { FishCargoState, FishSchoolState, GameState } from "../core/types";
import { dayOfSeason } from "../core/GameClock";
import { WorldLayout } from "../../world/WorldLayout";
import { findFarmIdAtWorld } from "../../world/FarmLayout";
import { WORLD_CHART_NODES, WORLD_REGION_LABELS } from "../../world/WorldGameplayLocations";

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
    freshnessTone: freshnessPercent > 65 ? "fresh" : freshnessPercent > 35 ? "medium" : "stale",
    cargoClass: cargo.cargoClass,
    carrySpeedPenaltyPercent: carriedLoadPenaltyPercent(cargo.cargoClass)
  };
};

const CARDINAL_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export function getHeadingCardinal(deg: number): string {
  const norm = ((deg % 360) + 360) % 360;
  const index = Math.round(norm / 45) % 8;
  return CARDINAL_POINTS[index];
}

export function detectContextualStance(state: GameState): ContextualStanceId {
  if (state.player.activeBoatId) {
    return "maritime";
  }
  if (
    Number.isNaN(state.player.x) ||
    Number.isNaN(state.player.z) ||
    !Number.isFinite(state.player.x) ||
    !Number.isFinite(state.player.z)
  ) {
    return "explorer";
  }
  if (findFarmIdAtWorld(state.player.x, state.player.z) !== null) {
    return "agronomy";
  }
  const fishing = WorldLayout.fishingAccessAt(state.player.x, state.player.z);
  if (fishing && fishing.habitat !== null) {
    return "angling";
  }
  return "explorer";
}

export function buildCompassMarkers(state: GameState, headingDeg: number): CompassMarkerDto[] {
  const { player } = state;
  const markers: CompassMarkerDto[] = [];

  for (const node of WORLD_CHART_NODES) {
    const dx = node.position.x - player.x;
    const dz = node.position.z - player.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 350) continue;

    const worldAngleDeg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
    const relativeBearingDeg = ((worldAngleDeg - headingDeg + 540) % 360) - 180;

    let icon: HudIconId = "pin";
    if (node.kind === "farm") icon = "sprout";
    else if (node.kind === "dock") icon = "anchor";
    else if (node.kind === "market") icon = "coin";
    else if (node.kind === "landmark") icon = "landmark";
    else if (node.kind === "water") icon = "waves";

    markers.push({
      id: node.id,
      type: node.kind,
      kind: node.kind as any,
      x: node.position.x,
      z: node.position.z,
      label: node.label,
      icon,
      distanceMeters: Math.round(dist),
      relativeBearingDeg: Math.round(relativeBearingDeg),
      inRange: dist <= 150
    });
  }

  if (state.world?.activeSchools) {
    for (const [id, rawSchool] of Object.entries(state.world.activeSchools)) {
      if (!rawSchool) continue;
      const school = rawSchool as FishSchoolState;
      const dx = school.x - player.x;
      const dz = school.z - player.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= 250) {
        const worldAngleDeg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
        const relativeBearingDeg = ((worldAngleDeg - headingDeg + 540) % 360) - 180;
        markers.push({
          id: `school.${id}`,
          type: "fish-school",
          kind: "fish-school",
          x: school.x,
          z: school.z,
          label: "Fish School",
          icon: "fish",
          distanceMeters: Math.round(dist),
          relativeBearingDeg: Math.round(relativeBearingDeg),
          inRange: dist <= 150
        });
      }
    }
  }

  markers.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return markers.slice(0, 8);
}

export function buildStatusChips(state: GameState): HudStatusChipDto[] {
  const chips: HudStatusChipDto[] = [];
  const { player } = state;

  if (player.carriedFishCargoId) {
    // Name the penalty the physics actually applies rather than asserting a
    // vague slowdown: the chip and the movement come from the same table.
    const carried = state.fishCargo[player.carriedFishCargoId] ?? null;
    const penaltyPercent = carriedLoadPenaltyPercent(carried?.cargoClass ?? null);
    chips.push({
      id: "overburdened",
      label: "Overburdened",
      type: "warning",
      tone: "neutral",
      description: penaltyPercent > 0
        ? `Carrying a fish with both hands. Movement ${penaltyPercent}% slower.`
        : "Carrying a fish with both hands.",
      icon: "pack"
    });
  }

  if (player.workCapacity.current >= player.workCapacity.maximum * 0.95) {
    chips.push({
      id: "well-rested",
      label: "Well Rested",
      type: "buff",
      tone: "buff",
      description: "Labor reserves are full. Productive work energy ready.",
      icon: "sparkle"
    });
  }

  return chips;
}

export function buildHudContracts(state: GameState): HudContractDto[] {
  if (!state.contracts || !Array.isArray(state.contracts)) return [];
  const active = state.contracts.filter((c) => c.status === "active");
  const result: HudContractDto[] = [];

  for (const c of active) {
    const item = ContentRegistry.items.get(c.targetItemIdOrSpecies);
    const fish = ContentRegistry.fishSpecies.get(c.targetItemIdOrSpecies);
    const targetName = item?.name ?? fish?.name ?? c.targetItemIdOrSpecies;
    const targetKind: "item" | "fish" = fish ? "fish" : "item";
    const market = ContentRegistry.markets.get(c.deliveryMarketId);
    const deliveryMarketName =
      market?.name ?? (c.deliveryMarketId === "market.village" ? "Village Market" : "Harbor Market");

    const completed = c.quantityFulfilled >= c.quantityRequired;
    result.push({
      id: c.id,
      title: `${targetName} Order`,
      targetName,
      targetKind,
      current: c.quantityFulfilled,
      target: c.quantityRequired,
      unit: targetKind === "fish" ? "catch" : "produce",
      completed,
      rewardMoney: c.rewardMoney,
      deliveryMarketName,
      isReadyToTurnIn: completed
    });
  }

  return result;
}

export function buildContextualHotbar(
  state: GameState,
  stance: ContextualStanceId,
  selectedCropId: string | null
): ContextualHotbarSlotDto[] {
  const { player } = state;
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
  const bait = accessibleFishingSupplyCount(state, BAIT_ITEM_ID);
  const lureCount = accessibleFishingSupplyCount(state, "item.basic_lure");
  const fertilizerCount = countOf("item.basic_fertilizer");
  const rod = ContentRegistry.rods.get(player.equippedRodId);
  const activeBoat = player.activeBoatId ? state.boats[player.activeBoatId] : null;
  const boatDefinition = activeBoat ? ContentRegistry.boats.get(activeBoat.boatTypeId) : null;
  const carriedFishState = player.carriedFishCargoId ? state.fishCargo[player.carriedFishCargoId] : null;
  const rodSlot = {
    id: "tool.rod",
    action: { type: "equip-tool", tool: "fishing-rod" },
    name: "Fishing Rod",
    detail: rod ? `Cast ${rod.name}` : "No rod equipped",
    icon: "rod",
    quantity: null,
    ready: Boolean(rod)
  } satisfies Omit<ContextualHotbarSlotDto, "slot" | "shortcutKey">;
  const lureSlot = {
    id: "tool.tackle",
    action: { type: "input", action: "fishing.toggle-lure" },
    name: "Lure & Tackle",
    detail: player.preparedLureItemId ? "Put away prepared lure" : lureCount > 0 ? "Prepare a lure" : "No lure",
    icon: "lure",
    quantity: lureCount > 0 ? lureCount : null,
    ready: Boolean(player.preparedLureItemId) || lureCount > 0,
    active: Boolean(player.preparedLureItemId)
  } satisfies Omit<ContextualHotbarSlotDto, "slot" | "shortcutKey">;

  switch (stance) {
    case "agronomy":
      return [
        {
          slot: 1, shortcutKey: "1", id: "tool.hoe",
          action: { type: "equip-tool", tool: "hands" },
          name: "Hand Tools", detail: "Harvest or clear withered crops",
          icon: "hoe", quantity: null, ready: true
        },
        {
          slot: 2, shortcutKey: "2", id: "tool.seeds",
          action: { type: "equip-tool", tool: "seeds" },
          name: "Seed Belt", detail: seedName ? `${seedName} (${seedTotal})` : "No seeds",
          icon: "seeds", quantity: seedTotal > 0 ? seedTotal : null, ready: seedTotal > 0
        },
        {
          slot: 3, shortcutKey: "3", id: "tool.watering_can",
          action: { type: "equip-tool", tool: "watering-can" },
          name: "Watering Can", detail: "Water dry cultivated plots",
          icon: "water", quantity: null, ready: true
        },
        {
          slot: 4, shortcutKey: "4", id: "tool.fertilizer",
          action: { type: "equip-tool", tool: "fertilizer" },
          name: "Compost & Nutrients",
          detail: fertilizerCount > 0 ? `Basic Fertilizer (${fertilizerCount})` : "No fertilizer",
          icon: "fertilizer", quantity: fertilizerCount > 0 ? fertilizerCount : null, ready: fertilizerCount > 0
        },
        {
          slot: 5, shortcutKey: "5", id: "tool.harvest",
          action: { type: "equip-tool", tool: "harvest" },
          name: "Harvest Basket", detail: "Collect mature crop yields",
          icon: "harvest", quantity: null, ready: true
        }
      ];
    case "angling":
      return [
        { ...rodSlot, slot: 1, shortcutKey: "1" },
        { ...lureSlot, slot: 2, shortcutKey: "2" },
        {
          slot: 3, shortcutKey: "3", id: "tool.chum",
          action: { type: "input", action: "open-ledger" },
          name: "Bait Bucket", detail: bait > 0 ? `Earthworms (${bait}) · Manage supplies` : "Manage fishing supplies",
          icon: "bait", quantity: bait > 0 ? bait : null, ready: true
        },
        {
          slot: 4, shortcutKey: "4", id: "tool.keepnet",
          action: { type: "input", action: "open-ledger" },
          name: "Keepnet / Hold",
          detail: carriedFishState ? `Carrying ${ContentRegistry.fishSpecies.get(carriedFishState.speciesId)?.name ?? "a fish"}` : "Inspect catch and storage",
          icon: "fish", quantity: carriedFishState ? 1 : null, ready: true
        },
        {
          slot: 5, shortcutKey: "5", id: "tool.stow_rod",
          action: { type: "equip-tool", tool: "hands" },
          name: "Stow Gear", detail: "Put away the fishing rod",
          icon: "stow", quantity: null, ready: true
        }
      ];
    case "maritime":
      return [
        {
          slot: 1, shortcutKey: "1", id: "maritime.helm",
          action: { type: "equip-tool", tool: "hands" },
          name: "Vessel Helm", detail: `Steer ${boatDefinition?.name ?? "boat"}`,
          icon: "helm", quantity: null, ready: true
        },
        { ...rodSlot, slot: 2, shortcutKey: "2" },
        { ...lureSlot, slot: 3, shortcutKey: "3" },
        {
          slot: 4, shortcutKey: "4", id: "maritime.supplies",
          action: { type: "input", action: "open-ledger" },
          name: "Vessel Supplies", detail: "Manage bait, ice and supplies",
          icon: "hold", quantity: null, ready: true
        },
        {
          slot: 5, shortcutKey: "5", id: "maritime.cargo",
          action: { type: "input", action: "open-ledger" },
          name: "Cargo Hold",
          detail: activeBoat ? `Hold ${activeBoat.fishCargoSlotIds.filter(Boolean).length}/${activeBoat.fishCargoSlotIds.length}` : "Inspect storage",
          icon: "hold", quantity: activeBoat ? activeBoat.fishCargoSlotIds.filter(Boolean).length : null, ready: true
        }
      ];
    case "explorer":
      return [
        {
          slot: 1, shortcutKey: "1", id: "explorer.satchel",
          action: { type: "input", action: "open-inventory" },
          name: "Satchel [I]", detail: "Open satchel inventory",
          icon: "satchel", quantity: null, ready: true
        },
        {
          slot: 2, shortcutKey: "2", id: "explorer.chart",
          action: { type: "input", action: "open-map" },
          name: "Nautical Chart [M]", detail: "Consult navigational map",
          icon: "map", quantity: null, ready: true
        },
        {
          slot: 3, shortcutKey: "3", id: "explorer.expedition",
          action: { type: "input", action: "open-planning" },
          name: "Expedition Board [P]", detail: "Plan supplies and a return route",
          icon: "map", quantity: null, ready: state.quests.unlockedFeatureIds.includes("feature.expedition_planner")
        },
        {
          slot: 4, shortcutKey: "4", id: "explorer.stores",
          action: { type: "input", action: "open-ledger" },
          name: "Hold & Stores [L]", detail: "Inspect catch and stored supplies",
          icon: "hold", quantity: null, ready: true
        },
        {
          slot: 5, shortcutKey: "5", id: "explorer.journal",
          action: { type: "input", action: "open-journal" },
          name: "Field Journal [J]", detail: "Open journal and quests",
          icon: "journal", quantity: null, ready: true
        }
      ];
  }
}

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
    !state.sportFishing;
  const workCurrent = Math.max(0, Math.floor(player.workCapacity.current));
  const hour = Math.floor((clock.currentMinute % 1440) / 60);
  const minute = clock.currentMinute % 60;
  const activeBoat = player.activeBoatId ? state.boats[player.activeBoatId] : null;
  const boatDefinition = activeBoat ? ContentRegistry.boats.get(activeBoat.boatTypeId) : null;
  const carriedFishState = player.carriedFishCargoId ? state.fishCargo[player.carriedFishCargoId] : null;
  const hazard =
    weather.type === "storm"
      ? { text: "Storm Warning", tone: "danger" as const }
      : weather.type === "fog" && weather.visibility < 0.5
        ? { text: "Dense Fog", tone: "caution" as const }
        : weather.windSpeed >= 11
          ? { text: "Gale Winds", tone: "caution" as const }
          : weather.seaRoughness >= 0.7
            ? { text: "Rough Swell", tone: "caution" as const }
            : null;
  const localTemperatureC = WorldLayout.climateSampleAt(player.x, player.z, weather).temperatureC;

  // Stance detection
  const stance = detectContextualStance(state);

  // Compass, heading, region
  const headingDegrees = Math.round((((player.rotationY * 180) / Math.PI) % 360 + 360) % 360);
  const headingCardinal = getHeadingCardinal(headingDegrees);
  const regionLabel =
    (WORLD_REGION_LABELS as Readonly<Record<string, string>>)[player.currentRegionId] ?? "Open Waters";
  const compassMarkers = buildCompassMarkers(state, headingDegrees);

  // Status effects
  const statusEffects = buildStatusChips(state);

  // Inventory & cargo capacity
  const occupiedSatchelSlots = inventory
    ? inventory.slots.filter((s) => Boolean(s.itemId && (s.quantity ?? 0) > 0)).length
    : 0;
  const totalSatchelSlots = inventory ? inventory.slotCount : 20;
  const capacity = {
    satchelUsed: occupiedSatchelSlots,
    satchelMax: totalSatchelSlots,
    cargoUsed: player.carriedFishCargoId ? 1 : 0,
    cargoMax: 1
  };

  // Active delivery contracts
  const activeContracts = buildHudContracts(state);

  // Contextual hotbar
  const contextualHotbar = buildContextualHotbar(state, stance, selectedCropId);

  const boatDto: WorldHudBoatDto | null =
    activeBoat && boatDefinition
      ? {
          boatId: activeBoat.id,
          name: boatDefinition.name,
          speedKnots: Math.round(activeBoat.speed * 1.944),
          isDocked: activeBoat.isDocked,
          seaState: seaState(weather.seaRoughness),
          seaWarning: weather.seaRoughness > boatDefinition.safeSeaRoughness ? "Unsafe swell" : null,
          showNightWarning: clock.timeOfDay === "night" || clock.timeOfDay === "dusk",
          hull: {
            current: activeBoat.durability,
            maximum: boatDefinition.durabilityMax,
            percent: Math.round((activeBoat.durability / Math.max(1, boatDefinition.durabilityMax)) * 100),
            danger: activeBoat.durability < 30
          },
          fuel:
            boatDefinition.fuelCapacity > 0
              ? {
                  current: activeBoat.fuel,
                  maximum: boatDefinition.fuelCapacity,
                  percent: Math.round((activeBoat.fuel / Math.max(1, boatDefinition.fuelCapacity)) * 100),
                  danger: activeBoat.fuel <= boatDefinition.fuelCapacity * 0.2
                }
              : null,
          occupiedCargoSlots: activeBoat.fishCargoSlotIds.filter(Boolean).length,
          cargoSlots: boatDefinition.fishCargoSlots.map((slot) => {
            const cargoId = activeBoat.fishCargoSlotIds[slot.slotIndex];
            return {
              slotNumber: slot.slotIndex + 1,
              slotType: slot.type,
              hasIce: resolveCargoHasIce(state, {
                location: {
                  type: slot.type === "external-hook" ? "boat-hook" : "boat-hold",
                  containerId: activeBoat.id,
                  slotIndex: slot.slotIndex
                }
              }),
              cargo: cargoId && state.fishCargo[cargoId] ? buildCargoPresentation(state.fishCargo[cargoId]) : null
            };
          })
        }
      : null;

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
      showLowNotice: player.workCapacity.current < 1 || workCurrent < 20,
      recharging: player.workCapacity.current < player.workCapacity.maximum
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
    boat: boatDto,
    basicFishingPhase: state.basicFishing?.phase ?? null,
    expeditionUnlocked: state.quests.unlockedFeatureIds.includes("feature.expedition_planner"),

    // M1 Additions:
    stance,
    compass: {
      headingDegrees,
      headingCardinal,
      windDegrees: Math.round(weather.windDirectionDeg),
      subRegionTitle: regionLabel,
      nearbyMarkers: compassMarkers
    },
    statusEffects,
    capacity,
    activeContracts,
    contextualHotbar
  };
}
