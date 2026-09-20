import { ContentRegistry } from "../content/ContentRegistry";
import { buildWorldAudio } from "../simulation/presentation/WorldAudioPresentation";
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
  gameAudio.setWorldContext(presentation.bed, input.weather, presentation);
  gameAudio.setActionLoop("windmill", !input.paused && Boolean(input.windmill), input.windmill?.position, input.windmill?.gain ?? 0);
  if (input.icedCargoIds) {
    if (!input.paused && lastIcedCargoIds && input.icedCargoIds.some((id) => !lastIcedCargoIds!.has(id))) gameAudio.playOneShot("ice-shovel");
    lastIcedCargoIds = new Set(input.icedCargoIds);
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
    playCooled("fishing-strain", nearSnap ? 650 : 1600, input.position, sample.elapsedSeconds * 1000);
  }
  if (lastSurfaceCrossings !== sample.surfaceCrossings) {
    gameAudio.playBank("splash", { x: sample.endpointX, y: 0, z: sample.endpointZ });
    lastSurfaceCrossings = sample.surfaceCrossings;
  }
};

const lastPlayed = new Map<string, number>();
let lastIcedCargoIds: Set<string> | null = null;
let lastSportInstance: string | null = null;
let lastSurfaceCrossings = 0;
let lastSprintExhausted: boolean | null = null;

const playCooled = (cueId: Parameters<typeof gameAudio.playOneShot>[0], cooldownMs: number, position?: AudioPosition, now = performance.now()): void => {
  if (now - (lastPlayed.get(cueId) ?? Number.NEGATIVE_INFINITY) < cooldownMs) {
    return;
  }
  lastPlayed.set(cueId, now);
  gameAudio.playOneShot(cueId, position);
};

export const bindDomainAudio = (events: EventBus, getPosition: () => AudioPosition | undefined): () => void => {
  lastIcedCargoIds = null;
  const play = (cueId: Parameters<typeof gameAudio.playOneShot>[0]): void => {
    gameAudio.playOneShot(cueId, getPosition());
  };
  const disposers = [
    events.on("CropPlanted", () => play("hoe-till")),
    events.on("CropWatered", () => play("watering")),
    events.on("CropHarvested", ({ cropId }) => {
      if (cropId === "crop.apple_tree") play("apple-drop");
      play("harvest-cut");
      play("crop-rustle");
    }),
    events.on("RecipeStarted", ({ recipeId }) => {
      const recipe = ContentRegistry.recipes.get(recipeId);
      if (recipe?.presentationKind === "tailoring") play("craft-tailor");
      else if (recipe?.presentationKind === "toolmaking") play("craft-tool");
      else play(recipe?.stationType === "fish-table" ? "fish-scale-scrape" : "wood-saw");
    }),
    events.on("ProcessingJobReady", () => play("craft-ready")),
    events.on("RecipeCompleted", () => play("ui-confirm")),
    events.on("EquipmentEquipped", () => play("equipment-equip")),
    events.on("EquipmentPresetApplied", () => play("equipment-equip")),
    events.on("EquipmentPresetSaved", () => play("ui-confirm")),
    events.on("FishSchoolChummed", () => gameAudio.playBank("splash", getPosition())),
    events.on("BasicFishingStarted", () => play("fishing-cast")),
    events.on("BasicFishingBiteAlert", () => play("fishing-bite")),
    events.on("BasicFishingMinigameStarted", () => play("fishing-hook")),
    events.on("BasicFishingTreasureCaught", () => {
      play("treasure-chime");
      play("coins");
    }),
    events.on("BasicFishingResolved", ({ catchItemId, isPerfect, reason }) => {
      if (catchItemId) {
        gameAudio.playBank("splash", getPosition());
        play("fish-flop");
        play("fishing-catch");
        if (isPerfect) {
          play("perfect-catch");
        }
        return;
      }
      if (reason === "escaped") {
        gameAudio.playBank("splash", getPosition());
        play("fishing-strain");
      }
    }),
    events.on("FishHooked", () => play("fishing-hook")),
    events.on("FishLanded", () => {
      gameAudio.playBank("splash", getPosition());
      play("fish-flop");
      play("fishing-catch");
    }),
    events.on("FishEscaped", ({ reason }) => {
      if (reason === "snapped") {
        play("fishing-snap");
        return;
      }
      gameAudio.playBank("splash", getPosition());
      play(reason === "no-cargo-space" ? "ui-error" : "fishing-strain");
    }),
    events.on("CargoLoaded", () => play("place")),
    events.on("CargoUnloaded", () => play("pickup")),
    events.on("BoatBoarded", () => play("rope-creak")),
    events.on("BoatDocked", () => play("ui-confirm")),
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
    events.on("BoatRepaired", () => play("ui-confirm")),
    events.on("MountBoarded", () => gameAudio.playBank("donkey-snort", getPosition())),
    events.on("MountDisembarked", () => play("pickup")),
    events.on("ItemSold", () => play("coins")),
    events.on("ItemPurchased", () => play("coins")),
    events.on("SeedPurchased", () => play("coins")),
    events.on("RodPurchased", () => play("coins")),
    events.on("RodEquipped", () => play("ui-confirm")),
    events.on("FishSold", () => play("coins")),
    events.on("BoatPurchased", () => play("coins")),
    events.on("NpcTalked", () => play("page-turn")),
    events.on("QuestStarted", () => play("page-turn")),
    events.on("QuestProgressed", () => play("ui-confirm")),
    events.on("QuestCompleted", () => play("quest-chime")),
    events.on("ActCompleted", () => play("quest-chime")),
    events.on("ContractCompleted", () => {
      play("contract-stamp");
      play("quest-chime");
    }),
    events.on("ProficiencyLeveledUp", () => play("quest-chime")),
    events.on("Notification", ({ type }) => {
      if (type === "error") play("ui-error");
    })
  ];
  return () => {
    for (const dispose of disposers) dispose();
  };
};
