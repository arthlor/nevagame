import type { EventBus } from "../simulation/core/EventBus";
import type { GameMode, WeatherTag } from "../simulation/core/types";
import { WorldLayout } from "../world/WorldLayout";
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
  boat?: { throttle: number; x: number; y: number; z: number };
  fishing?: { reeling: boolean; lineTension: number };
}): void => {
  gameAudio.setWorldContext(bedForPlayer(input.position.x, input.position.z, input.mode), input.weather);
  const boatMoving = Boolean(input.boat && Math.abs(input.boat.throttle) > 0.12);
  gameAudio.setActionLoop(
    "boat-wake",
    input.mode === "boat-driving" && Boolean(input.boat),
    input.boat
  );
  gameAudio.setActionLoop("boat-row", boatMoving, input.boat);
  const reeling = Boolean(input.fishing?.reeling);
  const strained = (input.fishing?.lineTension ?? 0) >= 72;
  gameAudio.setActionLoop("fishing-reel", reeling && !strained, input.position);
  gameAudio.setActionLoop("fishing-reel-fast", reeling && strained, input.position);
  if (reeling && (input.fishing?.lineTension ?? 0) >= 88) {
    playCooled("fishing-strain", 720, input.position);
  }
};

const lastPlayed = new Map<string, number>();

const playCooled = (cueId: Parameters<typeof gameAudio.playOneShot>[0], cooldownMs: number, position?: AudioPosition): void => {
  const now = performance.now();
  if (now - (lastPlayed.get(cueId) ?? 0) < cooldownMs) {
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
    events.on("BasicFishingStarted", () => play("fishing-cast")),
    events.on("BasicFishingBiteAlert", () => play("fishing-bite")),
    events.on("BasicFishingMinigameStarted", () => play("fishing-hook")),
    events.on("BasicFishingResolved", ({ catchItemId, reason }) => {
      if (catchItemId) {
        gameAudio.playBank("splash", getPosition());
        play("fish-flop");
        play("fishing-catch");
        return;
      }
      if (reason === "escaped") play("fishing-snap");
    }),
    events.on("FishHooked", () => play("fishing-hook")),
    events.on("FishLanded", () => {
      gameAudio.playBank("splash", getPosition());
      play("fish-flop");
      play("fishing-catch");
    }),
    events.on("FishEscaped", ({ reason }) => play(reason === "snapped" ? "fishing-snap" : "fishing-strain")),
    events.on("BoatBoarded", () => play("rope-creak")),
    events.on("BoatDocked", () => play("ui-confirm")),
    events.on("ItemSold", () => play("coins")),
    events.on("SeedPurchased", () => play("coins")),
    events.on("FishSold", () => play("coins")),
    events.on("BoatPurchased", () => play("coins")),
    events.on("QuestCompleted", () => play("quest-chime")),
    events.on("ContractCompleted", () => play("quest-chime")),
    events.on("ProficiencyLeveledUp", () => play("quest-chime"))
  ];
  return () => {
    for (const dispose of disposers) dispose();
  };
};
