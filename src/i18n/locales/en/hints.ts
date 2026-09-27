// src/i18n/locales/en/hints.ts

export interface LocalizedHintText {
  title: string;
  message: string;
}

export const EN_HINTS: Record<string, LocalizedHintText> = {
  "hint.cargo_freshness": {
    title: "The Catch Is Perishable",
    message: "Fish lose freshness from the moment they are landed, and buyers pay less for a tired catch. Ice slows it. Carry trade packs to an inland buyer or a posted fish commission; the Harbor Fish Market does not buy them over the counter."
  },
  "hint.season_turn": {
    title: "The Season Turns",
    message: "Different fish run in different seasons, and the market pays differently for them. Check the chart and the ledger — what was scarce may now be in reach."
  },
  "hint.farming_plant": {
    title: "Field Cultivation",
    message: "Left-click prepared soil to plant. Leave room between crops."
  },
  "hint.farming_water": {
    title: "Crop Hydration",
    message: "Dry soil needs water before the crop can thrive."
  },
  "hint.work_capacity": {
    title: "Work Capacity",
    message: "Harvesting costs more Work than watering. Better grades earn extra XP and can sell for more gold. Rest, meals and chore shifts restore Work; time restores only a little."
  },
  "hint.boat_steering": {
    title: "Vessel Navigation",
    message: "[W/S] Throttle • [A/D] Steer • [E] Dock at a marked mooring."
  },
  "hint.fishing_sport": {
    title: "Sport Fishing",
    message: "Hold [W/LMB] to reel, [S/RMB] to let line out, and [Space] to brace. Use [A/D] to counter runs."
  },
  "hint.fishing_basic": {
    title: "River Angling",
    message: "Hold [Space] to raise your catch bar. Keep the fish centered to land it!"
  },
  "hint.first_storm_at_sea": {
    title: "Storm at Sea",
    message: "Rough water past her safe range starts a storm-helm gust: keep the skiff's bow into the wind with A/D until the gust passes, or ease the throttle and heave to. A survived gust recovers hull life; five failed gusts wreck the hull, which must be towed to Neva Harbor and repaired by Silas."
  },
  "hint.first_cargo_spoilage": {
    title: "A Spoiled Catch",
    message: "This catch can no longer sell fresh. Clear the cargo space, then carry ice and shorten the next delivery route."
  },
  "hint.open_channel": {
    title: "The Open Channel",
    message: "Check fuel, hull and ice before committing to the crossing."
  },
  "hint.sprint_stamina": {
    title: "Catch Your Breath",
    message: "Sprinting draws on stamina. Walk or pause to recover it; this is separate from the Work you spend tending crops."
  },
  "hint.labor_shift_timing": {
    title: "A Fair Day's Work",
    message: "Press E at a chore station to start a shift, then strike when the needle crosses the gold band. A clean strike pays the full Work, a near miss pays half, and each station counts once a day."
  },
  "hint.first_work_earning": {
    title: "Work Is Earned",
    message: "Work refills by preparing for it: rest at the farmhouse, eat a cooked meal, or put in a shift at the firewood stack, drying racks or harbor nets. Each source is limited per day; a slow trickle also returns a little on its own."
  },
  "hint.first_market": {
    title: "At the Market",
    message: "Compare the current quote before selling. Demand changes, and delivery contracts offer another use for your harvest and catch."
  },
  "hint.first_contract": {
    title: "A Delivery Promise",
    message: "Check a contract's destination, deadline and requirements before delivering. Its progress stays in the tracker while you gather the rest."
  },
  "hint.first_nightfall": {
    title: "Nightfall",
    message: "The village windows light the way home. Check the clock and forecast before another trip, or rest at the farmhouse until morning."
  },
  "hint.first_rank_up": {
    title: "Practice Recognized",
    message: "Your proficiency has reached a new rank. The journal's Skills page lists what your experience now makes available."
  },
  "hint.tide_cycle": {
    title: "Tides & Moon",
    message: "Notice how the moon phase shifts the water level and currents along the banks."
  }
};
