// src/i18n/locales/en/hints.ts

export interface LocalizedHintText {
  title: string;
  message: string;
}

export const EN_HINTS: Record<string, LocalizedHintText> = {
  "hint.cargo_freshness": {
    title: "Keep fish fresh",
    message: "Ice protects freshness and price. Carry fish packs to village buyers or fish contracts; harbor counters cannot buy packs."
  },
  "hint.season_turn": {
    title: "New season",
    message: "Fish runs and prices change by season. Check the chart and ledger."
  },
  "hint.farming_plant": {
    title: "Planting",
    message: "Point at prepared soil, then place the crop. Leave room between crops."
  },
  "hint.farming_water": {
    title: "Watering",
    message: "Water dry soil."
  },
  "hint.work_capacity": {
    title: "Work",
    message: "Planting and harvesting spend Work; hand watering is free. Work recovers in real time, faster while the game is open. Rest, meals and chores help too."
  },
  "hint.boat_steering": {
    title: "Mooring",
    message: "Steer alongside shore or a marked pier. Stop, then Moor."
  },
  "hint.fishing_sport": {
    title: "Sport Fishing",
    message: "Hold the highlighted control. Release to hold steady."
  },
  "hint.fishing_basic": {
    title: "Catch the fish",
    message: "Hold to raise the bar; release to lower it. Keep the fish inside."
  },
  "hint.first_storm_at_sea": {
    title: "Storm",
    message: "Face the wind or ease the throttle. Survived gusts restore hull; failures damage it. Tow wrecks to Neva Harbor for Silas to repair."
  },
  "hint.first_cargo_spoilage": {
    title: "Spoiled catch",
    message: "This catch has lost its fresh value. Clear space; bring ice and deliver sooner next time."
  },
  "hint.open_channel": {
    title: "Before crossing",
    message: "Check fuel, hull and ice."
  },
  "hint.sprint_stamina": {
    title: "Recover Sprint",
    message: "Walk or rest to recover Sprint; it is separate from Work."
  },
  "hint.labor_shift_timing": {
    title: "Chore timing",
    message: "Start a chore, then Strike in the gold band. Each station pays once daily; a glancing strike earns less."
  },
  "hint.first_work_earning": {
    title: "Restore Work",
    message: "Rest at home, eat cooked meals or do chores. Meals and shifts have daily limits; waiting restores little."
  },
  "hint.first_market": {
    title: "Selling",
    message: "Prices change with demand. Check quotes and delivery contracts."
  },
  "hint.first_contract": {
    title: "Deliveries",
    message: "Check destination, deadline and requirements. Follow progress in the tracker."
  },
  "hint.first_nightfall": {
    title: "Nightfall",
    message: "Check time and weather before travelling, or rest at home until morning."
  },
  "hint.first_rank_up": {
    title: "New rank",
    message: "See new capabilities in Journal → Skills."
  },
  "hint.tide_cycle": {
    title: "Tides",
    message: "The moon phase changes tides and currents. Watch the banks."
  },
  "hint.call_donkey": {
    title: "Call donkey",
    message: "On foot, press H or tap Donkey to call it beside you."
  }
};
