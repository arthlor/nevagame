import type { SportFishingPresentationSample } from "../render/fishing/FishingPresentation";
import type { EventBus } from "../simulation/core/EventBus";
import type { GameMode, WeatherTag } from "../simulation/core/types";
import { WorldLayout } from "../world/WorldLayout";
import { WORLD_AMBIENCE_PROFILES } from "../world/WorldGameplayLocations";
import { gameAudio, type AudioBedId } from "./AudioManager";

interface AudioPosition {
  x: number;
  y: number;
  z: number;
}

const bedForPlayer = (x: number, z: number, mode: GameMode): AudioBedId => {
  if (WorldLayout.isInterior(x, z)) {
    return "interior";
  }
  if (mode === "boat-driving" || WorldLayout.isWater(x, z)) {
    return "water";
  }
  const region = WorldLayout.regionAt(x, z);
  const profile = WORLD_AMBIENCE_PROFILES.find((candidate) => candidate.regionId === region);
  if (profile?.islandId === "island.sunreach") {
    if (profile.harborGain >= 0.5 || profile.surfGain >= 0.55) return "coast";
    if (profile.insectsGain >= 0.4) return "farm";
    return "coast";
  }
  if (region === "region.coast") {
    return "coast";
  }
  if (region === "region.village") {
    return "village";
  }
  return "farm";
};

export const syncWorldAudio = (input: {
  position: AudioPosition;
  mode: GameMode;
  weather: WeatherTag;
  paused?: boolean;
  boat?: { throttle: number; x: number; y: number; z: number; isSkiff?: boolean };
  fishing?: {
    reeling: boolean;
    lineTension: number;
    lineIntegrity?: number;
    snapTimerSeconds?: number;
    presentation?: Readonly<SportFishingPresentationSample>;
  };
}): void => {
  gameAudio.setWorldContext(bedForPlayer(input.position.x, input.position.z, input.mode), input.weather);
  const boatMoving = Boolean(input.boat && Math.abs(input.boat.throttle) > 0.12);
  const isSkiff = Boolean(input.boat?.isSkiff);
  gameAudio.setActionLoop(
    "boat-wake",
    !input.paused && input.mode === "boat-driving" && Boolean(input.boat),
    input.boat
  );
  gameAudio.setActionLoop("skiff-engine", !input.paused && isSkiff && input.mode === "boat-driving", input.boat);
  gameAudio.setActionLoop("boat-row", !input.paused && !isSkiff && boatMoving, input.boat);
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
let lastSportInstance: string | null = null;
let lastSurfaceCrossings = 0;

const playCooled = (cueId: Parameters<typeof gameAudio.playOneShot>[0], cooldownMs: number, position?: AudioPosition, now = performance.now()): void => {
  if (now - (lastPlayed.get(cueId) ?? Number.NEGATIVE_INFINITY) < cooldownMs) {
    return;
  }
  lastPlayed.set(cueId, now);
  gameAudio.playOneShot(cueId, position);
};

export const bindDomainAudio = (events: EventBus, getPosition: () => AudioPosition | undefined): () => void => {
  const play = (cueId: Parameters<typeof gameAudio.playOneShot>[0]): void => {
    gameAudio.playOneShot(cueId, getPosition());
  };
  const disposers = [
    events.on("CropPlanted", () => play("hoe-till")),
    events.on("CropWatered", () => play("watering")),
    events.on("CropHarvested", () => {
      play("harvest-cut");
      play("crop-rustle");
    }),
    events.on("RecipeStarted", () => play("wood-saw")),
    events.on("RecipeCompleted", () => play("ui-confirm")),
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
    events.on("MountBoarded", () => play("donkey-snort")),
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
