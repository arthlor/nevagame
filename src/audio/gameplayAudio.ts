import type { SportFishingPresentationSample } from "../render/fishing/FishingPresentation";
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
  paused?: boolean;
  boat?: { throttle: number; x: number; y: number; z: number };
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
  gameAudio.setActionLoop(
    "boat-wake",
    !input.paused && input.mode === "boat-driving" && Boolean(input.boat),
    input.boat
  );
  gameAudio.setActionLoop("boat-row", !input.paused && boatMoving, input.boat);
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
      play("fishing-strain");
    }),
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
