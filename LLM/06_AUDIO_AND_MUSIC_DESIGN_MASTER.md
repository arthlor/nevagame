# Farm & Fishing Browser Game — Audio & Music Design Master Specification

> **Role:** Canonical audio, sound effects, foley, acoustics, and dynamic music authority for Neva. This document establishes the master audio architecture, mixing hierarchy, cue-by-cue sound inventory across all gameplay dynamics, adaptive music system, and asset production standards. It is registered in the root `AGENTS.md` canonical-authority list and wins inside the audio domain; it loses to `01` on state ownership and to `02` on gameplay truth.
> **Audience:** Sound designers, composers, audio engineers, technical leads, and gameplay agents.
>
> **⚠ Status: design-stage specification.** This document describes the target
> audio system. It is **not** an implementation status report. `src/audio/` and
> the audio manifest own what actually plays today, and
> `LLM/IMPLEMENTATION_STATUS_CHECKLIST.md` owns gate evidence. A cue listed
> here is a specification, not a shipped sound — never cite this file as proof
> that audio works.
>
> **Boundaries this file must not cross:** audio never owns gameplay truth.
> Cues are triggered by the domain events in `01` §14 and must reinforce a real
> state transition, never invent one. Adding a cue for a state that does not
> exist is a request to change `02`, not a sound-design decision. Bus names,
> cue IDs, and manifest fields are persistent contracts once shipped.

---

# 1. Audio Identity & Design Pillars

Neva's audio landscape is designed to feel **warm, tactile, salt-weathered, and intimately grounded in physical work**. It mirrors the visual low-poly, hand-crafted coastal aesthetic: rich in physical presence, organic timbre, and spatial depth, while avoiding synthetic harshness or abrasive digital alarms.

```
       LAND (EARTH & WOOD)          ↔          SEA (SALT & WATER)
  ┌───────────────────────────┐           ┌───────────────────────────┐
  │ Tilled soil, grain crunch,│           │ Lapping tide, wet line,   │
  │ heavy timber, dry leaves, │           │ oar bite, spray & foam,   │
  │ iron tools, leather strap │           │ deep ocean swell, gulls   │
  └─────────────┬─────────────┘           └─────────────┬─────────────┘
                └───────────────────┬───────────────────┘
                                    │
                       ACOUSTIC FOLK HARMONY
                Warm strings, acoustic guitar, cello,
               accordion, soft harmonica, woodwinds
```

### Core Audio Pillars
1. **Physical Tactility:** Every player interaction conveys mass, friction, moisture, and material resistance. Soil has weight; grain crunches in the stone mill; oars bite water with fluid drag; sport fish strain the rod with authentic wood and fiber tension.
2. **Organic Warmth (No-Combat Peace):** In the absence of combat and weapons, tension and satisfaction arise from nature, weather, craftsmanship, and seamanship. Sound effects utilize real-world acoustic textures rather than synthetic sci-fi laser or arcade buzzers.
3. **Legible Gameplay Feedback:** Sound conveys critical simulation state before the player checks the UI—soil thirst, bobber dips, line load spikes, approaching storm fronts, motor stalls, and market activity.
4. **Adaptive Environmental Immersion:** Soundscapes evolve seamlessly with time of day, weather intensity, altitude, interior shelter, and nautical distance. Silence and wind are treated as active instruments.

---

# 2. Technical Audio Graph & WebAudio Architecture

The game utilizes the WebAudio API through a centralized `AudioManager` graph. All game audio routes through a strict 7-sub-bus hierarchy into dynamic gain nodes, biquad filters, and master limiter stages.

```
                                  [ AUDIO SOURCES ]
                                          │
       ┌───────────┬──────────────┬───────┴──────┬──────────────┬───────────┐
       ▼           ▼              ▼              ▼              ▼           ▼
   [ MUSIC ]  [ AMBIENCE ]   [ WEATHER ]    [ SFX 3D ]     [ SFX 2D ]    [ UI ]
    (Stereo)    (Stereo)     (Pos/Stereo)  (Positional)     (Stereo)    (Stereo)
       │           │              │              │              │           │
   LowPass (Occ)   │              │          PannerNode         │           │
       │           │              │              │              │           │
       ▼           ▼              ▼              ▼              ▼           ▼
   ┌───────┐  ┌──────────┐  ┌───────────┐  ┌────────────┐  ┌──────────┐ ┌──────┐
   │ Music │  │ Ambience │  │  Weather  │  │  World 3D  │  │Player/Fol│ │  UI  │
   │  Bus  │  │   Bus    │  │    Bus    │  │    Bus     │  │   Bus    │ │ Bus  │
   └───┬───┘  └────┬─────┘  └─────┬─────┘  └─────┬──────┘  └────┬─────┘ └──┬───┘
       │           │              │              │              │          │
       └───────────┴──────────────┼──────────────┴──────────────┴──────────┘
                                  ▼
                         [ DUCKING MATRIX ]
                                  ▼
                     [ MASTER BUS (-14 LUFS) ]
                                  ▼
                     [ DYNAMICS COMPRESSOR ]
                                  ▼
                     [ AUDIO CONTEXT DESTINATION ]
```

### 2.1 Bus Routing & Level Calibration

| Bus ID | Purpose | Calibration Target | Spatialization | Occlusion Filter | Ducking Behavior |
|---|---|---|---|---|---|
| `bus.master` | Final stage summing | -14.0 LUFS | None | None | Master limiter ceiling (-0.5 dBFS) |
| `bus.music` | Adaptive soundtrack | -20.0 LUFS | 2D Stereo | Yes (Dampened inside interiors) | Ducked by Dialogue (-4 dB), Catch Fanfare (-6 dB) |
| `bus.ambience` | Biome & environmental beds | -24.0 LUFS | 2D Stereo | Yes (Interior transitions) | Ducked by Heavy Weather (-4 dB), Dialogue (-3 dB) |
| `bus.weather` | Rain, wind, thunder, storm | -18.0 LUFS | 2D + 3D Thunder | Yes (Interior low-pass 600 Hz) | Ducks Ambience when Storm/Heavy Rain active |
| `bus.sfx_world_3d`| Workstations, water splashes, animals | -16.0 LUFS | 3D HRTF Panner | Yes (Distance + Obstruction) | None |
| `bus.sfx_player_2d`| Fishing line, rod reel, tool swings | -15.0 LUFS | 2D Centered | No | None |
| `bus.foley` | Surface footsteps, body rustle, mount | -17.0 LUFS | 2D/3D Hybrid | Yes | None |
| `bus.ui` | Inventory, menus, coins, journal, alerts | -15.0 LUFS | 2D Centered | No | Always prominent, bypasses all low-pass filters |

### 2.2 Spatialization & Environmental Acoustics
- **Panner Node Model:** `HRTF` (High-tier) or `equalpower` (Fallback), using `inverse` distance attenuation.
  - `refDistance`: 2.0 meters (Full volume within 2m).
  - `maxDistance`: 45.0 meters (Audible boundary for shorelines, windmills, campfires).
  - `rolloffFactor`: 1.15.
- **Interior Acoustics:** When the player enters buildings (e.g. Homestead cabin, Fishmonger shed, Barn):
  - Exterior weather and ocean ambient bus passes through a Biquad low-pass filter ($f_c = 650\text{ Hz}$, $Q = 0.7$).
  - `bus.ambience` switches to the cozy interior bed (crackling fireplace, soft wooden room tone).
- **Subsurface & Underwater Acoustics:** When bobber or camera nears the waterline:
  - High frequencies roll off sharply ($f_c = 400\text{ Hz}$), underwater resonance and low bubbling emphasize aquatic weight.

---

# 3. Master Sound Effects (SFX) Inventory

Every gameplay system, verb, entity state, and interaction is cataloged with its specific acoustic requirements, audio bank properties, and trigger conditions.

---

## 3.1 Traversal, Player Foley & Mount Dynamics

The player's physical connection to the island is maintained through continuous tactile surface responses.

```
                       SURFACE FOLEY DETECTION
                                  │
         ┌───────────────┬────────┴───────┬───────────────┐
         ▼               ▼                ▼               ▼
      [ DIRT ]        [ GRASS ]        [ WOOD ]        [ DOCK ]
   Packed road,     Meadow turf,    Bridge deck,     Salt pier,
   starter garden   wild slopes      homestead      harbor wharf
         │               │                │               │
         └───────────────┴────────┬───────┴───────────────┘
                                  ▼
                         PITCH/GAIN RANDOMIZER
                     (Pitch: ±6%, Gain: ±5%)
                                  ▼
                         PLAY ONE-SHOT CUE
```

### Footsteps & Material Surfaces
- **`sfx.foley.footstep_dirt`**: Crisp, packed-earth step with fine gravel crunch. (Bank: 4 variants, spatialized, pitch jitter $0.94 - 1.06$).
- **`sfx.foley.footstep_grass`**: Soft, fibrous brush with subtle dewy moisture. (Bank: 4 variants, spatialized, pitch jitter $0.94 - 1.06$).
- **`sfx.foley.footstep_wood`**: Hollow, resonant plank thump with slight timber creak. (Bank: 4 variants, spatialized, pitch jitter $0.93 - 1.07$).
- **`sfx.foley.footstep_dock`**: Heavy, salt-weathered cedar plank impact with slight water-resonance underneath. (Bank: 4 variants, spatialized, pitch jitter $0.92 - 1.08$).
- **`sfx.foley.footstep_sand`**: Soft, granular crunch with loose sand shifting underfoot. (Bank: 4 variants, spatialized, pitch jitter $0.94 - 1.06$).
- **`sfx.foley.footstep_shallow_water`**: Sloshing foot splash with water droplets dispersing. (Bank: 4 variants, spatialized, pitch jitter $0.92 - 1.10$).

### Movement & Physical Exertion
- **`sfx.player.sprint_loop`**: Subtle rhythmic cloth rustle and accelerated footstep cadence when sprinting.
- **`sfx.player.stamina_exhausted`**: Soft, realistic breath exhalation when sprint stamina depletes (non-intrusive, cozy realism).
- **`sfx.player.jump_takeoff`**: Subtle fabric swish and quick foot push-off from current surface.
- **`sfx.player.jump_land`**: Heavier impact thud matching current surface material with brief cloth settling.
- **`sfx.player.wade_water`**: Continuous gentle fluid resistance sound while walking through shoreline surf.

### Mount (Pack Donkey) Mechanics
- **`sfx.mount.mount_board`**: Leather saddle creak, stirrup clink, and gentle donkey shift under weight.
- **`sfx.mount.mount_dismount`**: Quick stirrup release, boot ground landing, and saddle leather settling.
- **`sfx.mount.trot_dirt`**: Four-beat rhythmic clopping on packed earth with light harness rattle. (Bank: 4 variants).
- **`sfx.mount.trot_grass`**: Muffled, soft rhythmic hoof strikes on meadow soil. (Bank: 4 variants).
- **`sfx.mount.trot_wood_bridge`**: Resonant, hollow clopping over timber bridge and pier boards. (Bank: 4 variants).
- **`sfx.mount.donkey_snort`**: Occasional soft, endearing donkey breath puff and head shake during idle or after long gallop.
- **`sfx.mount.donkey_bray_rare`**: Playful, warm bray when fed an apple or upon reaching the homestead after a long journey.

---

## 3.2 Farming & Crop Lifecycle Dynamics

Farming audio emphasizes earthiness, hydration, and satisfying physical feedback for every manual action.

```
                             FARMING CYCLE
  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
  │   TILLED    │ ──> │    SOWN     │ ──> │   WATERED   │ ──> │  HARVESTED  │
  │ Hoe clod    │     │ Seed drop   │     │ Can slosh,  │     │ Sickle cut, │
  │ break       │     │ & pat       │     │ soil soak   │     │ crate thud  │
  └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

### Soil Tending & Planting
- **`sfx.farm.hoe_till`**: Heavy iron hoe blade cutting into dry soil, followed by earth clod crumbling. (Bank: 3 variants).
- **`sfx.farm.plant_seed`**: Soft, muffled earth pat with tiny seed pouch rustle as seeds are pressed into the furrow.
- **`sfx.farm.apply_fertilizer`**: Dry chalky powder scatter with subtle earthy hiss as nutrients settle into the soil.

### Watering & Hydration
- **`sfx.farm.watering_can_lift`**: Water sloshing inside a galvanized metal watering can as the player raises it.
- **`sfx.farm.watering_stream_loop`**: Continuous, soothing shower of fine water droplets falling on tilled dirt and foliage.
- **`sfx.farm.soil_soak`**: Deep, bubbling moisture absorption sound as parched soil drinks the water.
- **`sfx.farm.water_refill_well`**: Wooden bucket dipping into well water, splashing, and lifting up with heavy chain rattle.

### Growth, Foliage & Harvesting
- **`sfx.farm.crop_rustle`**: Dry and green leaves brushing against the player's legs when walking through dense mature fields.
- **`sfx.farm.sickle_swish`**: Sharp curved blade slicing cleanly through crisp grain stalks (Wheat, Barley, Flax).
- **`sfx.farm.vegetable_pull`**: Juicy, satisfying root-pop and soil suction sound when pulling Carrots and Potatoes from earth.
- **`sfx.farm.tomato_pluck`**: Crisp vine snap and juicy separation when hand-harvesting ripe Tomatoes.
- **`sfx.farm.crop_crate_place`**: Sturdy wooden harvest crate landing on the ground with a solid, wooden thud.

### Orchards & Perennial Trees (Apple Tree)
- **`sfx.farm.tree_shake`**: Heavy wooden trunk vibration and lush canopy rustling in the wind.
- **`sfx.farm.apple_drop`**: Multiple crisp apples tumbling from the branch and landing with soft thuds in the grass.
- **`sfx.farm.apple_pluck`**: Individual clean stem snap when plucking fruit by hand.

### Composting & Soil Biology
- **`sfx.farm.compost_deposit`**: Organic plant matter and vegetable scraps falling into the wooden bin.
- **`sfx.farm.compost_bubble_loop`**: Subtle, rich, warm microbiological fermenting hum/squish (audible within 2m of active bin).
- **`sfx.farm.worm_harvest`**: Moist soil rustle and squirming tactile sound when collecting cultivated Bait Worms.

---

## 3.3 Processing Stations & Crafting Workbenches

Workstations provide rhythmic, mechanical acoustic feedback that brings homestead production to life.

```
                           PRODUCTION STATIONS
  ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
  │      HAND MILL        │ │      WORKBENCH        │ │   FISH CLEANING TABLE │
  │ Stone friction, grain │ │ Wood sawing, hammer   │ │ Knife blade scrape,   │
  │ crush & flour sift    │ │ taps, chum mixing     │ │ fillet slice, scrap   │
  └───────────────────────┘ └───────────────────────┘ └───────────────────────┘
```

### Hand Mill & Windmill
- **`sfx.craft.handmill_crank_loop`**: Rhythmic stone-on-stone friction grinding accompanied by the audible crushing of wheat/barley kernels.
- **`sfx.craft.flour_chute_pour`**: Soft, dusty avalanche sound as ground grain pours out of the wooden chute into a burlap sack.
- **`sfx.craft.windmill_gear_creak`**: Heavy timber gear rotation, wooden peg clacking, and canvas sail flapping in the wind.

### Artisan Workbench
- **`sfx.craft.wood_saw`**: Rhythmic steel teeth drawing across timber planks with sawdust cascading.
- **`sfx.craft.hammer_nail`**: Solid iron hammer striking wooden dowels/nails with ringing resonance.
- **`sfx.craft.chum_mix`**: Moist, dense sloshing and stirring sound as ground grain and bait worms are blended into bucket chum.
- **`sfx.craft.lure_tie`**: Delicate twine pulling taut, feather trimming, and brass hook jingling.

### Harbor Fish Cleaning Table
- **`sfx.craft.fish_table_drop`**: Heavy wet fish landing on the wooden cutting board with a distinct watery thud.
- **`sfx.craft.fish_scale_scrape`**: Rapid, rhythmic rasping of a scaler blade removing fish scales across fresh skin.
- **`sfx.craft.fish_fillet_slice`**: Razor-sharp knife drawing cleanly through fresh fish flesh and cartilage.
- **`sfx.craft.scraps_bin_toss`**: Wet organic scraps falling into the wooden disposal tub below the bench.

---

## 3.4 Fishing Subsystems (Basic & Sport)

Fishing is a centerpiece mechanic with layered, nuanced sound design spanning early calm bites to high-intensity sport battles.

```
                          BASIC FISHING PHASES
  ┌───────────┐     ┌───────────┐     ┌───────────┐     ┌───────────┐
  │ CASTING   │ ──> │ WAITING   │ ──> │ BITE HIT  │ ──> │ MINIGAME  │
  │ Rod whip, │     │ Water lap,│     │ Alert pop,│     │ Catch bar │
  │ line zips │     │ bobber    │     │ sharp tug │     │ thrust    │
  └───────────┘     └───────────┘     └───────────┘     └───────────┘
```

### Basic Fishing Mechanics
- **`sfx.fish.cast_charge`**: Rising pitch whoosh as the player holds and powers up the cast meter.
- **`sfx.fish.rod_cast_whip`**: Flexible willow/graphite rod whipping through the air with a crisp snap.
- **`sfx.fish.bobber_splash`**: Clean water plop as the weighted cork bobber hits the water surface ($3\text{m} - 12\text{m}$ away).
- **`sfx.fish.water_ripple_loop`**: Gentle, soothing lapping of tiny ripples around the floating bobber.
- **`sfx.fish.bite_alert`**: Distinct, crisp acoustic water-drop pop ("!") signaling a fish nibble within the reaction window.
- **`sfx.fish.hook_strike`**: Sharp rod yank, taught line hiss cutting through surface water ("HIT!").
- **`sfx.fish.catchbar_thrust_loop`**: Low-frequency physical reel hum while holding action to propel the green catch bar upward.
- **`sfx.fish.catchbar_bounce`**: Soft elastic wooden bumper thump when the catch bar hits the bottom floor.
- **`sfx.fish.treasure_lock_chime`**: Shimmering bell arpeggio when the green bar overlaps a sunken treasure chest icon.
- **`sfx.fish.treasure_unlocked`**: Metallic chest latch pop and lock opening as bonus loot is secured.
- **`sfx.fish.perfect_catch_fanfare`**: Bright, triumphant acoustic guitar/harp chord for completing a catch without letting the fish leave the bar.

```
                          SPORT FISHING ENCOUNTER
  ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
  │     LINE TENSION      │ │    FISH STRUGGLE      │ │   LANDING & CAPTURE   │
  │ Reel ratchet screech, │ │ Surface leap splash,  │ │ Net scoop whoosh,     │
  │ rod fiber groan,      │ │ deep dive swirl,      │ │ heavy deck thud,      │
  │ high-tension whine    │ │ violent head shake    │ │ muscular body flop    │
  └───────────────────────┘ └───────────────────────┘ └───────────────────────┘
```

### Sport-Fishing High Seas Encounters
- **`sfx.sport.school_chum_splash`**: Heavy bucket of chum thrown into open ocean, creating bubbling oily feeding slick.
- **`sfx.sport.frenzy_churn_loop`**: Ocean surface boiling with multiple hungry predatory fish boiling water.
- **`sfx.sport.reel_slow_loop`**: Steady, mechanical click-click-click of the reel drag spooling under moderate tension.
- **`sfx.sport.reel_fast_screech`**: High-speed whining reel spin as a monster Tuna or Marlin strips line at blistering speed.
- **`sfx.sport.rod_strain_creak`**: Authentic heavy composite/bamboo rod bending under maximum arc, groaning with structural load.
- **`sfx.sport.line_whine_danger`**: Piercing high-pitch acoustic harmonic whine when line tension reaches $85\% - 99\%$ (Immediate player warning).
- **`sfx.sport.line_snap_twang`**: Violent, heartbreaking whip-crack twang as the monofilament snaps under excessive load.
- **`sfx.sport.fish_surface_jump`**: Huge explosion of white water as a Blue Marlin or Salmon breaches the ocean surface.
- **`sfx.sport.fish_dive_rush`**: Deep underwater vortex swirl and foaming wake as a heavy Sturgeon plunges toward the seabed.
- **`sfx.sport.fish_headshake`**: Rhythmic, violent jerking thuds transmitted through the line during violent fish head shakes.
- **`sfx.sport.landing_net_scoop`**: Broad woven net plunging into the water, lifting heavy water and fish mass together.
- **`sfx.sport.fish_deck_slam`**: Massive physical thud of a 40 kg+ sport fish landing on the wooden boat deck.
- **`sfx.sport.fish_flop_loop`**: Muscular, wet tail slapping against deck boards as the landed fish thrashes in the hold.

---

## 3.5 Boating, Logistics & Physical Cargo Handling

Boats are physical working vessels, and fish are heavy physical cargo that demand logistics.

```
                           MARITIME OPERATIONS
  ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
  │       ROWBOAT         │ │    FISHING SKIFF      │ │   PHYSICAL CARGO      │
  │ Oar lock squeak,      │ │ Outboard motor purr,  │ │ Heavy lift grunt,     │
  │ water blade pull,     │ │ bow spray cutting,    │ │ ice box latch,        │
  │ gunwale drip          │ │ hull slap over waves  │ │ heavy crate slotting  │
  └───────────────────────┘ └───────────────────────┘ └───────────────────────┘
```

### Rowboat Dynamics
- **`sfx.boat.rowboat_board`**: Boat rocking gently under player weight, water splashing against the hull, and rope creak.
- **`sfx.boat.oar_stroke`**: Deep, fluid gulp as the wooden oar blade bites water and propels the craft forward.
- **`sfx.boat.oar_drip`**: Delicate, realistic water droplets dripping from the raised oar between strokes.
- **`sfx.boat.oarlock_creak`**: Brass and weathered wood friction sound on every rowing stroke.
- **`sfx.boat.rowboat_wake_loop`**: Continuous gentle bubbling wake parting at the stern.

### Fishing Skiff Dynamics
- **`sfx.boat.skiff_starter_pull`**: Mechanical recoil pull-cord zip followed by brief engine sputter.
- **`sfx.boat.skiff_engine_idle_loop`**: Rhythmic, muffled two-stroke outboard motor idling with gentle underwater exhaust bubbles.
- **`sfx.boat.skiff_throttle_accel`**: Guttural roar of the motor accelerating under load as the propeller digs into open sea.
- **`sfx.boat.skiff_hull_wave_slap`**: Hard rhythmic slapping of fiberglass/wood hull skimming across choppy whitecap waves.
- **`sfx.boat.skiff_bow_spray_loop`**: Ocean spray hissing across the bow gunwales during high-speed cruising.
- **`sfx.boat.dock_bump`**: Heavy, hollow wood-on-wood collision when bumping against harbor pier pilings.
- **`sfx.boat.cleat_tie`**: Thick hemp rope wrapping around a brass dock cleat with tight hemp friction squeak.

### Physical Cargo & Logistics
- **`sfx.cargo.heavy_lift`**: Subtle player breath and exertion grunt when picking up a medium/large physical fish cargo.
- **`sfx.cargo.burdened_step`**: Heavier, slower footstep cadence while physically carrying bulky cargo on foot.
- **`sfx.cargo.boat_hold_stow`**: Heavy wet thud followed by wooden latch click as fish cargo is secured in the boat hold.
- **`sfx.cargo.ice_box_open`**: Cold insulated seal releasing with a soft hiss and clinking of crushed ice cubes.
- **`sfx.cargo.ice_shovel`**: Metal scoop carving through crushed ice to pack fresh fish.
- **`sfx.cargo.cold_storage_door`**: Heavy iron walk-in latch clank and deep insulated door swing at the harbor warehouse.

---

## 3.6 Economy, Markets & Contracts

Financial transactions celebrate tangible commerce and earned progression.

```
                          MARKET TRANSACTIONS
  ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
  │     COIN POUCH        │ │    MARKET SCALES      │ │  CONTRACT FULFILLMENT │
  │ Shimmering brass drop │ │ Brass weights clinking│ │ Wax seal stamp,       │
  │ & leather purse jingle│ │ on hanging pan        │ │ ledger quill stroke   │
  └───────────────────────┘ └───────────────────────┘ └───────────────────────┘
```

- **`sfx.market.coin_single`**: Crisp, bright silver/gold coin drop on wood counter.
- **`sfx.market.coin_pouch_jingle`**: Heavy, satisfying clinking of a full leather coin purse when selling bulk produce or fish.
- **`sfx.market.scale_balance`**: Brass weighing pan settling with delicate metallic clinks as fish weight is verified.
- **`sfx.market.contract_stamp`**: Firm wooden seal stamp press onto heavy parchment paper when accepting or completing an order.
- **`sfx.market.contract_complete_chime`**: Resonant brass counter bell ding announcing full payment and trade XP gain.
- **`sfx.market.market_tick_shift`**: Very subtle, warm harbor bell tolling across the bay every 60 game minutes as prices refresh.

---

## 3.7 Narrative, Quests & NPC Presentation (Realistic Foley)

In accordance with Neva's grounded design, NPC interactions eschew synthetic vocal gibberish in favor of rich, tactile parchment, journal, and environmental foley.

```
                          NARRATIVE & JOURNAL
  ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
  │    DIALOGUE OPEN      │ │   PARCHMENT TURNS     │ │  MILESTONE PROGRESS   │
  │ Ambient audio ducks,  │ │ Crisp heavy rag-paper │ │ Warm acoustic chime,  │
  │ wooden panel settles  │ │ leafing through logs  │ │ quill sketch in book  │
  └───────────────────────┘ └───────────────────────┘ └───────────────────────┘
```

- **`sfx.narrative.dialogue_open`**: Soft wooden frame settling sound accompanied by subtle -3 dB ambient ducking to focus attention on the dialogue.
- **`sfx.narrative.dialogue_page_turn`**: Crisp, tactile rag-paper flip when advancing through dialogue pages.
- **`sfx.narrative.dialogue_close`**: Gentle wooden panel sliding closed as full world audio restores.
- **`sfx.narrative.quest_started`**: Smooth unrolling of fresh map parchment with a subtle warm acoustic cello swell.
- **`sfx.narrative.quest_objective_tick`**: Soft wooden click and dry quill stroke confirming a completed step (e.g. 3/3 wheat sown).
- **`sfx.narrative.quest_completed`**: Warm, uplifting church chime / bell tone announcing quest completion and reward disbursement.
- **`sfx.narrative.act_completed_fanfare`**: Rich acoustic guitar and woodwind melody heralding major chapter transitions.
- **`sfx.narrative.journal_sketch`**: Rapid graphite pencil scratching sound when recording newly discovered fish species or regional secrets.

---

## 3.8 Environmental Soundscapes & Biome Ambience

Seamless 2D/3D ambient beds establish an authentic, breathing coastal ecosystem.

```
                           BIOME SOUNDSCAPES
  ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
  │       FARMSTEAD       │ │    VILLAGE & HARBOR   │ │       OPEN SEA        │
  │ Rustling poplars,     │ │ Seagulls, dock wash,  │ │ Deep water swell,     │
  │ songbirds, bees,      │ │ distant blacksmith,   │ │ rigging whistling,    │
  │ meadow grass breeze   │ │ cobblestone chatter   │ │ rolling wave crests   │
  └───────────────────────┘ └───────────────────────┘ └───────────────────────┘
```

### Biome Ambient Beds
- **`ambience.bed.farmstead`**: Gentle rolling breeze through poplar trees, distant meadow songbirds (Swallows, Robins), soft bumblebee hums.
- **`ambience.bed.village`**: Warm village murmur, distant blacksmith anvil strikes, porch windchimes, children laughter in distance.
- **`ambience.bed.coast`**: Continuous rhythmic ocean surf breaking on pebble shores, crying coastal herring gulls, salt wind through beachgrass.
- **`ambience.bed.open_sea`**: Deep, oceanic swell rolling against the hull, whistling offshore breeze, eerie isolation, distant buoy bell clangs.
- **`ambience.bed.interior`**: Cozy, crackling birch hearth fire, old pendulum wall-clock ticking steadily, rain pattering gently on cedar shingles.

### Day / Night & Diurnal Cycles
- **`ambience.time.dawn_chorus`**: Burst of cheerful morning birdsong and active rooster crows greeting the sunrise (05:00 - 07:30).
- **`ambience.time.midday_breeze`**: Warm, active summer wind rustling canopies and drying fields (11:00 - 15:00).
- **`ambience.time.twilight_cicadas`**: Rhythmic drone of evening cicadas, fading bird calls, and early evening owls (18:30 - 20:30).
- **`ambience.time.night_crickets`**: Dense chorus of rural night crickets, bullfrogs along the riverbank, and whispering cool night winds (21:00 - 04:30).

```
                           WEATHER ENVELOPES
  ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
  │      LIGHT RAIN       │ │      HEAVY STORM      │ │      DENSE FOG        │
  │ Soothing patter on    │ │ Driving downpour,     │ │ Eerie muffled quiet,  │
  │ leaves, soil & roofs  │ │ howling squalls,      │ │ distant tolling       │
  │                       │ │ cracking thunder      │ │ harbor foghorn        │
  └───────────────────────┘ └───────────────────────┘ └───────────────────────┘
```

### Dynamic Weather Systems
- **`ambience.weather.light_rain`**: Soothing, soft raindrop patter on meadow soil, dock planks, and crop leaves.
- **`ambience.weather.heavy_rain`**: Dense, drumming downpour with foaming puddles and streaming gutter runoff.
- **`ambience.weather.windy_squall`**: Powerful gusts howling around building eaves, bending tree canopies, and rattling windmill blades.
- **`ambience.weather.thunder_distant`**: Deep, low-frequency atmospheric rumble rolling across distant island peaks.
- **`ambience.weather.thunder_crack`**: Sharp, violent lightning crack followed immediately by resonant booming thunder.
- **`ambience.weather.fog_silence`**: Muffled, surreal acoustic dampening with a mournful brass harbor foghorn sounding every 45 seconds.

---

## 3.9 UI, HUD & Interaction Feedback

Interface audio utilizes natural, tactile, organic materials (wood, bone, leather, glass, brass).

- **`sfx.ui.button_hover`**: Very faint, delicate wooden tick indicating focus.
- **`sfx.ui.button_click`**: Crisp, satisfying wooden tap / clean stone notch press.
- **`sfx.ui.tab_switch`**: Smooth leather pouch flip or parchment leaf slide.
- **`sfx.ui.inventory_open`**: Burlap and leather backpack straps unbuckling and shifting.
- **`sfx.ui.inventory_close`**: Tight leather drawcord pulling closed with soft fabric thump.
- **`sfx.ui.item_pickup`**: Tactile rustle matching the item category (seeds rustle, tools clink, fish squish).
- **`sfx.ui.item_drop`**: Solid wooden slot settling sound.
- **`sfx.ui.hotbar_select`**: Quick tool notch click as the active hand tool changes.
- **`sfx.ui.error_refusal`**: Muted, dull double wooden knock indicating invalid placement, locked recipe, or insufficient funds.
- **`sfx.ui.slider_adjust`**: Smooth mechanical ratchet tick when adjusting volume or settings.

---

# 4. Adaptive Music & Dynamic Soundtrack System

The musical score of Neva is an **acoustic coastal folk tapestry** inspired by pastoral European and Atlantic maritime traditions. It uses real acoustic instrumentation with zero synthetic electronic synthesizers.

```
                            INSTRUMENTATION PALETTE
  ┌───────────────────────────────────────────────────────────────────────────┐
  │  ACOUSTIC STRINGS : Steel & nylon guitars, cello, upright bass, mandolin   │
  │  ORGANIC REEDS   : Diatonic harmonica, button accordion, wooden flute    │
  │  PERCUSSION      : Soft brush snare, woodblocks, bodhrán, triangle       │
  │  KEYBOARDS       : Warm felt piano, antique pump organ, music box         │
  └───────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Adaptive Multi-Stem Architecture

Music tracks are produced in **4 synchronized, dynamic stems** (44.1 kHz, 16-bit stereo) that seamlessly fade in and out based on player location, time of day, weather, and activity intensity.

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ STEM 1: FOUNDATION (Fingerpicked acoustic guitar & upright bass)        │
  │ Always active during musical windows; provides continuous harmonic bed. │
  ├─────────────────────────────────────────────────────────────────────────┤
  │ STEM 2: PASTORAL REEDS (Button accordion, harmonica, soft pump organ)   │
  │ Fades up in Village, Farmstead, and cozy homestead interiors.           │
  ├─────────────────────────────────────────────────────────────────────────┤
  │ STEM 3: MARITIME LEAD (Solo cello, tin whistle, mandolin melodic leads) │
  │ Fades up along Coastlines, Harbor docks, and open sea navigation.       │
  ├─────────────────────────────────────────────────────────────────────────┤
  │ STEM 4: ACTION & TENSION (Rhythmic bodhrán, brushed snare, tense bass)  │
  │ Fades up during Sport-Fishing encounters and navigating heavy storms.   │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Dynamic Musical Cues & Region Themes

```
                                  MAP THEMES
  ┌──────────────────────────┐                   ┌──────────────────────────┐
  │    "Neva's Inheritance"  │                   │     "The Salt Horizon"   │
  │  Homestead & Starter Farm│                   │  Coast, Harbor & Rowboat │
  │  Warm guitar, flute,     │                   │  Cello, mandolin, open   │
  │  gentle felt piano       │                   │  breeze harmonics        │
  └─────────────┬────────────┘                   └────────────┬─────────────┘
                │                                             │
                └──────────────────────┬──────────────────────┘
                                       │
                        ┌──────────────┴──────────────┐
                        │     "Market Day at Cove"    │
                        │    Village & Fishmonger     │
                        │  Upbeat accordion, bodhrán, │
                        │  cheerful plucked strings   │
                        └─────────────────────────────┘
```

#### Theme 1: "Neva's Inheritance" (Homestead & Starter Farm)
- **Mood:** Nostalgic, peaceful, grounded, contemplative.
- **Key & Tempo:** G Major, 72 BPM, 3/4 time signature.
- **Instrumentation:** Fingerpicked acoustic guitar, solo warm cello, gentle wood flute, antique felt piano.
- **Behavior:** Plays during calm morning and afternoon farm work; creates an intimate sense of restoring the family land.

#### Theme 2: "Market Day at the Cove" (Village Square & Produce Stalls)
- **Mood:** Cheerful, industrious, communal, rustic.
- **Key & Tempo:** D Major, 96 BPM, 6/8 sea-shanty rhythm.
- **Instrumentation:** Button accordion, mandolin arpeggios, upright bass, light bodhrán tapping, soft acoustic strumming.
- **Behavior:** Crossfades into prominence when entering the Village radius; intensifies when interacting with market stalls.

#### Theme 3: "The Salt Horizon" (Coastline, Harbor & Open Water)
- **Mood:** Expansive, adventurous, salt-weathered, soaring.
- **Key & Tempo:** E Minor / G Major, 80 BPM, 4/4 time signature.
- **Instrumentation:** Sweeping cello melodies, acoustic 12-string guitar, tin whistle, maritime accordion pads.
- **Behavior:** Activates when boarding the rowboat or skiff and sailing past the harbor breakwater into open ocean.

#### Theme 4: "Tension on the Line" (Sport-Fishing Encounter)
- **Mood:** Urgent, focused, kinetic, thrilling yet organic.
- **Key & Tempo:** A Minor, 112 BPM, driving percussive pulse.
- **Instrumentation:** Rapid fingerstyle acoustic guitar riffs, driving brush snare & bodhrán, staccato cello strikes, tense mandolin tremolo.
- **Behavior:** Seamlessly triggers when a sport fish is hooked; dynamic intensity ramps up as line tension approaches danger threshold.

#### Theme 5: "Stars Over the Bay" (Nighttime & Slumber)
- **Mood:** Serene, dreamy, comforting, lullaby-like.
- **Key & Tempo:** C Major, 60 BPM, 4/4 time signature.
- **Instrumentation:** Music box, delicate nylon guitar harmonics, warm bowed cello drone, soft upright piano.
- **Behavior:** Accompanies quiet nighttime strolls under the stars; fades into silence as the player sleeps until dawn.

#### Theme 6: "Storm Warning" (Gale Seas & High Risk)
- **Mood:** Ominous, dramatic, resolute, cautious.
- **Key & Tempo:** D Minor, 84 BPM, syncopated rhythm.
- **Instrumentation:** Low cello swells, dissonant accordion chords, howling wind harmonics, heavy muted drums.
- **Behavior:** Emerges during heavy squalls and storms when sailing in rough waters.

### 4.3 Organic Breathing Intervals (Silence as Design)
To prevent musical fatigue and allow the rich natural soundscapes to shine:
- Music tracks play for **2.5 to 4.0 minutes**, then fade out into **1.5 to 3.0 minutes of pure environmental silence**.
- During silence periods, the ambient wildlife, wind, waves, and footstep foley take center stage.
- Significant player actions (e.g. hooking a sport fish, entering a new region, completing a major quest) dynamically awaken the appropriate musical theme.

---

# 5. Technical Asset Standards, Audio Manifest & Production Rules

To guarantee flawless cross-browser performance, fast loading, and strict legal compliance, all audio assets must adhere to standardized specifications.

```
                           ASSET FORMAT STANDARD
  ┌───────────────────────────────────────────────────────────────────────────┐
  │ RUNTIME FORMATS : WebM (Opus @ 96-128 kbps) + MP3 fallback (160-192 kbps) │
  │ SAMPLE RATE     : 44.1 kHz or 48.0 kHz, 16-bit depth                       │
  │ CHANNELS        : MONO for 3D Positional SFX; STEREO for Ambience & Music │
  │ LICENSING       : CC0 1.0 Universal / Public Domain / Original Authoring  │
  └───────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Asset Delivery Guidelines
1. **Mono for 3D Spatial Sources:** All spatialized world sounds (splashes, footstep impacts, tool chops, animal calls, workstation gears) MUST be authored in **Mono**. WebAudio PannerNodes require mono buffers to accurately compute spatial azimuth, elevation, and Doppler shifts.
2. **Stereo for Beds and UI:** Environmental ambient loops, weather beds, UI clicks, and music stems MUST be authored in **Stereo**.
3. **Seamless Looping:** Ambient beds and machine loops must have zero-crossing loop boundaries with baked-in crossfades (minimum 100ms) to eliminate audio clicks or pops.
4. **Mastering & Headroom:** The exact integrated-loudness and true-peak targets are owned by the seven-bus table in §2.1. Do not introduce a second category table in tooling or status documentation.

### 5.2 Audio Manifest Schema (`audio-manifest.json`)
All audio cues must be registered in the centralized manifest with deterministic parameters:

```json
{
  "sources": [
    {
      "id": "sfx-fish-cast",
      "title": "Fishing Rod Cast Whip",
      "creator": "Neva Soundworks",
      "sourceUrl": "project://fishing-cast.mp3",
      "licenseUrl": "project",
      "runtimeUrl": "/assets/audio/fishing-cast.mp3",
      "sha256": "...",
      "durationSeconds": 2.40,
      "channels": 1
    }
  ],
  "cues": {
    "fishing-cast": {
      "sourceId": "sfx-fish-cast",
      "bus": "sfx_player_2d",
      "offset": 0.0,
      "duration": 2.40,
      "gain": 0.50,
      "spatial": true,
      "poolSize": 3,
      "pitchMin": 0.95,
      "pitchMax": 1.05
    }
  },
  "banks": {
    "footstep-dirt": [
      "footstep-dirt-a",
      "footstep-dirt-b",
      "footstep-dirt-c",
      "footstep-dirt-d"
    ]
  },
  "beds": {
    "farm": ["ambience-wind", "ambience-insects", "ambience-birds"],
    "village": ["ambience-wind", "ambience-birds", "ambience-market"],
    "coast": ["ambience-wind", "ambience-waves", "ambience-seagulls"],
    "water": ["ambience-wind", "ambience-waves", "ambience-seagulls"],
    "interior": ["ambience-wind", "ambience-fireplace"]
  }
}
```

`tools/audio/normalizeBus.mjs` is the implemented preparation path. It resolves
each source from its live cue bus and `spatial` flag into the seven semantic
roles in §2.1 (`music`, `ambience`, `weather`, world SFX, player SFX, foley,
UI), performs two-pass EBU R128 normalization, and stages every selected file
before atomic promotion. Spatial sources are emitted mono; non-spatial cues,
UI, ambience, and music are emitted stereo. Cue ranges are protected by padding
to at least the latest referenced cue end, and a successful promotion updates
the manifest `sha256`, `durationSeconds`, and `channels` fields together.

Use `npm run tools -- audio plan` to inspect the mapping,
`npm run audio:normalize` after a source changes, and
`npm run audio:normalize:check` for runtime-file/manifest parity. These commands
prove preparation and metadata integrity, not the in-game mix: human listening
review across gameplay, interiors, weather, fishing, UI, and music remains a
separate P14 gate.

---

# 6. Implementation Checklist & Verification Matrix

**Read the Status column literally.** `Spec Ready` means *this document
specifies the cues* — it is not a claim that the subsystem is authored, wired,
mixed, or verified in the game. No row here may be promoted to a roadmap gate.
When a subsystem is actually implemented, record the evidence in
`LLM/IMPLEMENTATION_STATUS_CHECKLIST.md` (with the narrowest proof: manifest
entries, the code path that triggers the cue, and who heard it in the game) and
change the row to `Implemented — see checklist`. Do not mark a row implemented
from this file alone.

| Subsystem | Core Audio Requirements | Verification Method | Status |
|---|---|---|---|
| **Traversal & Foley** | 4-surface footstep banks (dirt, grass, wood, dock), sprint panting, donkey hooves | Walk across all 4 surfaces in starter world; verify bank variety and no phase cancel | [x] Spec Ready |
| **Farming** | Hoe till, seed sow, watering can stream, crop rustle, sickle cut, apple drop, compost bubble | Plant, water, and harvest 3 wheat plots; verify hydration audio feedback | [x] Spec Ready |
| **Workstations** | Hand mill stone crunch, workbench sawing, fish cleaning table fillet & scaling | Grind wheat in village mill; clean fish at harbor table; verify looping spatial sync | [x] Spec Ready |
| **Basic Fishing** | Cast power whoosh, bobber plop, bite alert chime, catch bar thrust, treasure unlock, perfect fanfare | Complete full 5-phase fishing minigame; verify alert reaction chime and perfect jingle | [x] Spec Ready |
| **Sport Fishing** | Reel slow/fast screech, rod creak, near-snap line whine, snap twang, surface breach splash | Hook tuna in frenzy school; hold line in 90% tension; verify danger whine and splash | [x] Spec Ready |
| **Boating & Logistics** | Oar stroke water bite, skiff motor idle & accel, boat wake, heavy fish cargo carry & stow | Board rowboat; row 50m; stow 20kg tuna into hold; verify oarlock and hull slap | [x] Spec Ready |
| **Economy & Trade** | Coin pouch jingle, scale balance rattle, contract stamp, market price tick toll | Sell produce at village stall; fulfill harbor contract; verify coin jingle feedback | [x] Spec Ready |
| **Narrative & UI** | Dialogue open ducking, parchment page turns, quest complete chime, tactile UI clicks | Complete Elspeth Act 1 quest chain; verify dialogue foley and quest fanfare | [x] Spec Ready |
| **Ambience & Weather**| 5 biome beds, day/night diurnal cycle, rain patter, howling storm, rolling thunder | Cycle through Clear → Light Rain → Storm; verify interior low-pass filter | [x] Spec Ready |
| **Adaptive Music** | 4-stem coastal folk soundtrack, dynamic region crossfading, organic breathing gaps | Walk Farm → Village → Coast; verify stem crossfading and 2-min silence pauses | [x] Spec Ready |

---
*End of Audio & Music Design Master Specification — Neva Project.*
