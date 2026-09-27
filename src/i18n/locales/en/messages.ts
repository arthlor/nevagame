// src/i18n/locales/en/messages.ts

export const EN_MESSAGES = {
  notifications: {
    workCapacityExhausted: "You are too tired. Rest or eat to recover Work.",
    satchelFull: "Your satchel has no room for this.",
    wrongTool: "You need the proper tool for this work.",
    notEnoughCoins: "You do not have enough coins.",
    cropHarvested: "Harvested {count}x {name}",
    fishCaught: "Caught {name} ({weight}kg)!",
    recipeUnlocked: "Learned new recipe: {name}",
    proficiencyUp: "Reached {skill} Rank {rank}!",
    errandCompleted: "Completed errand: {title}",
    boatBoarded: "At the helm of {name}",
    daySaved: "Day saved safely.",
    fastTravelReady: "Traveled to {destination}",
    emergencyTowSuccess: "Vessel returned to harbor mooring.",
    emergencyTowFailed: "Could not tow vessel: {reason}"
  }
} as const;

type DeepString<T> = {
  [K in keyof T]: T[K] extends object ? DeepString<T[K]> : string;
};

export type MessagesSchema = DeepString<typeof EN_MESSAGES>;
