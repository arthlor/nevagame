import { ContentRegistry } from "../content/ContentRegistry";
import { buildWorldAudio, headwaterLoopGains, offshoreBellRegion, pinewatchLakeLoop, reedwaterRun } from "../simulation/presentation/WorldAudioPresentation";
import type { SportFishingPresentationSample } from "../render/fishing/FishingPresentation";
import type { EventBus } from "../simulation/core/EventBus";
import type { ClockState, GameMode, WeatherTag } from "../simulation/core/types";
import { gameAudio } from "./AudioManager";

interface AudioPosition {
  x: number;
  y: number;
  z: number;
}

export const syncWorldAudio = (input: {
  position: AudioPosition;
  mode: GameMode;
  weather: WeatherTag;
  clock: Pick<ClockState, "timeOfDay">;
  icedCargoIds?: string[];
  windmill?: { position: AudioPosition; gain: number };
  paused?: boolean;
  sprintExhausted?: boolean;
  boat?: { throttle: number; x: number; y: number; z: number; isSkiff?: boolean; wrecked?: boolean };
  fishing?: {
    reeling: boolean;
    lineTension: number;
    lineIntegrity?: number;
    snapTimerSeconds?: number;
    presentation?: Readonly<SportFishingPresentationSample>;
  };
}): void => {
  const presentation = buildWorldAudio(input.position, input.mode, input.clock);
  const fighting = !input.paused && (
    input.mode === "sport-fishing"
    || Boolean(input.fishing?.reeling)
    || (input.fishing?.lineTension ?? 0) > 25
  );
  if (fighting) presentation.music = "theme-line-tension";
  gameAudio.setWorldContext(presentation.bed, input.weather, presentation);
  gameAudio.setActionLoop("windmill", !input.paused && Boolean(input.windmill), input.windmill?.position, input.windmill?.gain ?? 0);
  const headwater = headwaterLoopGains(input.position);
  gameAudio.setActionLoop("headwater-fall", !input.paused && headwater.fall > 0.04, headwater.fallPosition, headwater.fall);
  gameAudio.setActionLoop("headwater-riffle", !input.paused && headwater.riffle > 0.04, headwater.rifflePosition, headwater.riffle);
  const pinewatchLake = pinewatchLakeLoop(input.position);
  gameAudio.setActionLoop("pinewatch-lake", !input.paused && pinewatchLake.gain > 0.04, pinewatchLake.position, pinewatchLake.gain);
  const reedwater = reedwaterRun(input.position);
  gameAudio.setActionLoop("reedwater-run", !input.paused && reedwater.gain > 0.04, reedwater.position, reedwater.gain);
  if (!input.paused && offshoreBellRegion(input.position)) {
    playCooled("buoy-bell", 45_000, input.position, performance.now());
  }
  if (!input.paused && input.weather === "fog") playCooled("fog-horn", 45_000, undefined, performance.now());
  if (input.icedCargoIds) {
    const next = spareIcedCargoIds;
    next.clear();
    let newlyIced = false;
    for (const id of input.icedCargoIds) {
      if (hasIcedCargoSnapshot && !lastIcedCargoIds.has(id)) newlyIced = true;
      next.add(id);
    }
    if (!input.paused && newlyIced) gameAudio.playOneShot("ice-shovel");
    spareIcedCargoIds = lastIcedCargoIds;
    lastIcedCargoIds = next;
    hasIcedCargoSnapshot = true;
  }
  const boatMoving = Boolean(input.boat && !input.boat.wrecked && Math.abs(input.boat.throttle) > 0.12);
  const isSkiff = Boolean(input.boat?.isSkiff);
  const boatOperational = Boolean(input.boat && !input.boat.wrecked);
  gameAudio.setActionLoop(
    "boat-wake",
    !input.paused && input.mode === "boat-driving" && boatOperational,
    input.boat
  );
  gameAudio.setActionLoop("skiff-engine", !input.paused && isSkiff && input.mode === "boat-driving" && boatOperational, input.boat);
  gameAudio.setActionLoop("boat-row", !input.paused && !isSkiff && boatMoving, input.boat);
  const sprintExhausted = input.sprintExhausted === true;
  if (!input.paused && sprintExhausted && lastSprintExhausted === false) {
    gameAudio.playOneShot("stamina-exhausted", input.position);
  }
  lastSprintExhausted = sprintExhausted;
  const fishing = input.paused ? undefined : input.fishing;
  const sample = fishing?.presentation;
  const retrieval = sample?.retrievalMetersPerSecond ?? (fishing?.reeling ? 0.7 : 0);
  const payout = sample?.payoutMetersPerSecond ?? 0;
  gameAudio.setActionLoop("fishing-reel", retrieval > 0.03 && retrieval <= 1.4 && payout < 0.08, input.position);
  gameAudio.setActionLoop("fishing-reel-fast", retrieval > 1.4 || payout >= 0.08, input.position);
  if (!sample) {
    if (!input.paused) lastSportInstance = null;
    return;
  }
  if (lastSportInstance !== sample.encounterId) {
    lastSportInstance = sample.encounterId;
    lastSurfaceCrossings = sample.surfaceCrossings;
    lastPlayed.delete("fishing-strain");
  }
  const nearSnap = sample.loadRatio >= 1.03 || sample.snapTimerSeconds > 0.15
    || (sample.lineIntegrity <= 20 && sample.loadRatio > 0.85);
  if (nearSnap || sample.loadRatio > 0.82) {
    playBankCooled("fishing-strain", nearSnap ? 650 : 1600, input.position, sample.elapsedSeconds * 1000);
  }
  if (lastSurfaceCrossings !== sample.surfaceCrossings) {
    gameAudio.playBank("splash", { x: sample.endpointX, y: 0, z: sample.endpointZ });
    lastSurfaceCrossings = sample.surfaceCrossings;
  }
};

const lastPlayed = new Map<string, number>();
let lastIcedCargoIds = new Set<string>();
let spareIcedCargoIds = new Set<string>();
let hasIcedCargoSnapshot = false;
let lastSportInstance: string | null = null;
let lastSurfaceCrossings = 0;
let lastSprintExhausted: boolean | null = null;

/**
 * Ready cycles that land together (one growth tick, a night's sleep) share a
 * single restrained chime. Each cycle is one simulation transition, so a
 * later cycle can chime again once this window has passed.
 */
export const READY_CUE_GROUP_MS = 2500;

const playCooled = (cueId: Parameters<typeof gameAudio.playOneShot>[0], cooldownMs: number, position?: AudioPosition, now = performance.now()): void => {
  if (now - (lastPlayed.get(cueId) ?? Number.NEGATIVE_INFINITY) < cooldownMs) {
    return;
  }
  lastPlayed.set(cueId, now);
  gameAudio.playOneShot(cueId, position);
};

const playBankCooled = (bankId: string, cooldownMs: number, position?: AudioPosition, now = performance.now()): void => {
  if (now - (lastPlayed.get(bankId) ?? Number.NEGATIVE_INFINITY) < cooldownMs) return;
  lastPlayed.set(bankId, now);
  gameAudio.playBank(bankId, position);
};

export const bindDomainAudio = (events: EventBus, getPosition: () => AudioPosition | undefined): () => void => {
  lastIcedCargoIds.clear();
  spareIcedCargoIds.clear();
  hasIcedCargoSnapshot = false;
  const play = (cueId: Parameters<typeof gameAudio.playOneShot>[0]): void => {
    gameAudio.playOneShot(cueId, getPosition());
  };
  const playBank = (bankId: string): void => {
    gameAudio.playBank(bankId, getPosition());
  };
  const disposers = [
    events.on("CropPlanted", () => play("plant-seed")),
    events.on("CropWatered", () => play("watering")),
    events.on("CropHarvested", ({ cropId }) => {
      const tags = ContentRegistry.crops.get(cropId)?.tags ?? [];
      if (cropId === "crop.apple_tree") play("apple-drop");
      else if (cropId === "crop.tomato") play("tomato-pluck");
      else if (tags.includes("tuber") || tags.includes("root")) play("vegetable-pull");
      else if (tags.includes("grain") || tags.includes("fiber")) {
        play("sickle-swish");
        play("crop-rustle");
      } else {
        play("harvest-cut");
        play("crop-rustle");
      }
    }),
    events.on("RecipeStarted", ({ recipeId }) => {
      const recipe = ContentRegistry.recipes.get(recipeId);
      if (recipe?.presentationKind === "tailoring") play("craft-tailor");
      else if (recipe?.presentationKind === "toolmaking") play("craft-tool");
      else play(recipe?.stationType === "fish-table" ? "fish-scale-scrape" : "wood-saw");
    }),
    events.on("CropStageChanged", ({ stage }) => {
      if (stage === "mature") playCooled("craft-ready", READY_CUE_GROUP_MS);
    }),
    events.on("ProcessingJobReady", () => playCooled("craft-ready", READY_CUE_GROUP_MS)),
    events.on("RecipeCompleted", () => play("recipe-done")),
    events.on("EquipmentEquipped", () => play("equipment-equip")),
    events.on("EquipmentPresetApplied", () => play("equipment-equip")),
    events.on("EquipmentPresetSaved", () => play("preset-save")),
    events.on("FishSchoolChummed", () => play("chum-pour")),
    events.on("BasicFishingStarted", () => play("fishing-cast")),
    events.on("BasicFishingBiteAlert", () => playBank("fishing-bite")),
    events.on("BasicFishingMinigameStarted", () => playBank("fishing-hook")),
    events.on("BasicFishingTreasureCaught", () => {
      play("treasure-chime");
      play("coins");
    }),
    events.on("BasicFishingResolved", ({ catchItemId, isPerfect, reason }) => {
      if (catchItemId) {
        gameAudio.playBank("splash", getPosition());
        play("fish-flop");
        playBank("fishing-catch");
        if (isPerfect) {
          play("perfect-catch");
        }
        return;
      }
      if (reason === "escaped") {
        gameAudio.playBank("splash", getPosition());
        playBank("fishing-strain");
      }
    }),
    events.on("FishHooked", () => playBank("fishing-hook")),
    events.on("FishLanded", () => {
      gameAudio.playBank("splash", getPosition());
      play("fish-flop");
      playBank("fishing-catch");
    }),
    events.on("FishEscaped", ({ reason }) => {
      if (reason === "snapped") {
        play("fishing-snap");
        return;
      }
      gameAudio.playBank("splash", getPosition());
      if (reason === "no-cargo-space") play("ui-error");
      else playBank("fishing-strain");
    }),
    events.on("CarriageCargoLoaded", () => play("carriage-load")),
    events.on("CargoLoaded", () => play("place")),
    events.on("CargoStored", () => play("cargo-store")),
    events.on("IrrigationInstalled", () => play("irrigation-set")),
    events.on("CargoUnloaded", () => play("pickup")),
    events.on("CargoDropped", () => play("place")),
    events.on("FishReleased", () => play("fish-release")),
    events.on("SportFishReleased", () => play("fish-release")),
    events.on("BoatDisembarked", () => play("boat-step-off")),
    events.on("BoatBoarded", () => play("rope-creak")),
    events.on("BoatDocked", () => play("dock-thud")),
    events.on("BoatTowed", () => play("rope-creak")),
    events.on("BoatGustSurvived", () => playCooled("rope-creak", 1800, getPosition())),
    events.on("BoatGustFailed", () => {
      gameAudio.playBank("splash", getPosition());
      play("rope-creak");
    }),
    events.on("BoatWrecked", () => {
      gameAudio.playBank("thunder", getPosition());
      play("rope-creak");
    }),
    events.on("BoatRepaired", () => play("repair-knock")),
    events.on("MountBoarded", () => gameAudio.playBank("donkey-snort", getPosition())),
    events.on("MountRecalled", () => gameAudio.playBank("donkey-snort", getPosition())),
    events.on("MountDisembarked", () => play("mount-dismount")),
    events.on("ItemSold", () => play("coins")),
    events.on("ItemPurchased", () => play("coins")),
    events.on("SeedPurchased", () => play("coins")),
    events.on("RodPurchased", () => play("coins")),
    events.on("RodEquipped", () => play("rod-click")),
    events.on("FishSold", () => play("coins")),
    events.on("BoatPurchased", () => play("coins")),
    events.on("NpcTalked", () => play("dialogue-open")),
    events.on("QuestStarted", () => play("quest-unroll")),
    events.on("QuestProgressed", () => play("quest-tick")),
    events.on("QuestCompleted", () => play("quest-chime")),
    events.on("ActCompleted", () => play("act-fanfare")),
    events.on("ContractCompleted", () => {
      play("contract-stamp");
      play("quest-chime");
    }),
    events.on("ProficiencyLeveledUp", () => play("rank-chime")),
    events.on("MarketTicked", () => playCooled("market-bell", 8000)),
    events.on("Notification", ({ type }) => {
      if (type === "error") play("ui-error");
    })
  ];
  return () => {
    for (const dispose of disposers) dispose();
  };
};
