# NEVA — Gameplay Master & Interaction Audit

> **Repository:** `arthlor/nevagame`  
> **Audited revision:** `2eddf08e78ec5924588052a2e5aaad1bf671cfd7` (`main` snapshot; commit timestamp 18 September 2026, 12:19:35 UTC)  
> **Second-pass revision:** 18 September 2026. Reconciled omissions and changes since the original `eaba083f9064de4b652f988176e6315b30e73516` snapshot; see section 24.  
> **Intended location:** `/NEVA_GAMEPLAY_MASTER.md` at the repository root  
> **Document type:** Descriptive, source-based gameplay reference and interaction audit—not a replacement design specification.  
> **Verification boundary:** Repository source was inspected. The game was not launched, the complete story was not played, and build/unit/browser tests were not executed in this audit. “Source-verified” does not mean “playtested.”

## 00. How to use this master

This document answers **what a player can do, how they do it, what changes, what prevents it, and what it leads to**. It covers gameplay mutations, informational interactions, menus, settings, recovery, and progression. It separates a reachable player action from an internal command, a content definition, a legacy storage type, and a possible wiring defect.

The authority order remains the repository's existing `AGENTS.md` and canonical `LLM` documents, together with the actual implementation and content registry. This is an audited snapshot, not a second owner of tuning. When code changes, update the affected sections; do not change gameplay merely to match an old table here. Existing documentation-contract tests should continue to govern their original files.

Relative source links below resolve from the repository root. To reproduce this audit, inspect those paths at the pinned commit rather than assuming later `main` is identical. Tables use catalogue/base values unless explicitly described as effective values. Live prices, growth, costs, availability, and outcomes can differ because of state, proficiency, equipment, weather, location, or tutorial pacing.

**Second-pass accounting:** 63 simulation command names and 30 declared query names are indexed separately from interface-only interactions. Four upstream commits separate this revision from the first master. A newly added feature is not retrospectively labeled an omission from older code; section 24 distinguishes new behavior, upstream fixes, and details under-described in the first audit.

### Evidence language

| Label | Meaning |
| --- | --- |
| **Source-verified** | An implementation or content path was inspected and the described behavior follows from it. It has not been demonstrated in a browser by this audit. |
| **Content-defined** | An authored entry exists. Its specific encounter, visual presentation, or end-to-end attainability was not independently played. |
| **Wiring risk** | A handler, predicate, prompt, or UI relationship appears inconsistent. A reproducible runtime test is still required before calling it a demonstrated gameplay bug. |
| **Not established** | No normal player path was established in the inspected action surface. Do not advertise this as a feature merely because a type, comment, asset, or older document mentions it. |

**Scope is gameplay, not an asset dump.** Every dialogue sentence, mesh, animation file, ambient sound clip, render setting constant, and migration branch is not reproduced verbatim. Their player-facing roles and interactions are catalogued. Technical debug actions are kept separate from shipped play.

## Contents

- [00. How to use this master](#00-how-to-use-this-master)
- [01. What the game actually offers](#01-what-the-game-actually-offers)
- [02. Starting a game and the initial situation](#02-starting-a-game-and-the-initial-situation)
- [03. Controls, camera, targeting, and modes](#03-controls-camera-targeting-and-modes)
- [04. Player resources, time, and pressure](#04-player-resources-time-and-pressure)
- [05. Farming: every crop interaction](#05-farming-every-crop-interaction)
- [06. Labor stations and provisions](#06-labor-stations-and-provisions)
- [07. Processing and the complete recipe catalogue](#07-processing-and-the-complete-recipe-catalogue)
- [08. Character equipment, wardrobe, and rods](#08-character-equipment-wardrobe-and-rods)
- [09. Inventory and goods: what can be held, inspected, used, or moved](#09-inventory-and-goods-what-can-be-held-inspected-used-or-moved)
- [10. Basic angling: input-to-reward audit](#10-basic-angling-input-to-reward-audit)
- [11. Sport fishing: schools, supplies, the fight, and landing](#11-sport-fishing-schools-supplies-the-fight-and-landing)
- [12. Complete fish catalogue](#12-complete-fish-catalogue)
- [13. Physical catches, cargo, preservation, and disposal](#13-physical-catches-cargo-preservation-and-disposal)
- [14. Walking, riding, boats, fuel, and recovery](#14-walking-riding-boats-fuel-and-recovery)
- [15. Markets, trade decisions, and every order type](#15-markets-trade-decisions-and-every-order-type)
- [16. Complete narrative and quest-interaction catalogue](#16-complete-narrative-and-quest-interaction-catalogue)
- [17. The explorable world, named people, and collection goals](#17-the-explorable-world-named-people-and-collection-goals)
- [18. Screen-by-screen interaction inventory](#18-screen-by-screen-interaction-inventory)
- [19. Saving, continuing, away time, and failure recovery](#19-saving-continuing-away-time-and-failure-recovery)
- [20. Audit findings and gameplay-contract risks](#20-audit-findings-and-gameplay-contract-risks)
- [21. Canonical command coverage index](#21-canonical-command-coverage-index)
- [22. Exhaustive regression checklist for the audited interaction surface](#22-exhaustive-regression-checklist-for-the-audited-interaction-surface)
- [23. Maintenance contract and completion boundary](#23-maintenance-contract-and-completion-boundary)
- [24. Second-pass reconciliation and evidence ledger](#24-second-pass-reconciliation-and-evidence-ledger)


**Source owners:** [`AGENTS.md`](AGENTS.md); [`LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md`](LLM/01_GAME_FOUNDATIONS_ARCHITECTURE.md); [`LLM/02_GAMEPLAY_SYSTEMS_IMPLEMENTATION.md`](LLM/02_GAMEPLAY_SYSTEMS_IMPLEMENTATION.md); [`src/simulation/Simulation.ts`](src/simulation/Simulation.ts); [`src/ui/GameUI.tsx`](src/ui/GameUI.tsx).

## 01. What the game actually offers

NEVA is a single-player, non-combat coastal livelihood game. The player inherits a farm and a family rowboat, learns to grow crops and turn farm output into fishing preparation, catches ordinary and physical sport fish, handles finite storage and perishable cargo, trades at location-specific markets, fulfils orders, improves equipment, uses a donkey or a two-pack carriage for inland transport, and earns the ability to cross to Sunreach.

Its central decisions are **what to prepare, where to work, what to carry, when to return, and which promise to fulfil**. Mechanical pressure comes from Work capacity, growth and processing waits, climate and moisture, tackle suitability, fish behavior, cargo space, freshness, fuel, market demand, and contract deadlines—not combat.

### Connected play loops

| Loop | Player sequence | What makes it more than a repeated click |
| --- | --- | --- |
| Field-to-fish | Buy/select seeds → place crops → water → harvest → mill grain/compost worms → craft chum/lures → fish | Farm space, Work, weather, ingredients, station occupancy, and tackle gates connect the activities. |
| Fish-to-field | Catch ordinary fish or process physical cargo → obtain scraps → make fertilizer → restore field fertility | Fishing supplies the farm instead of existing as an isolated gold source. |
| Ordinary angling | Approach suitable water → charge/release → react to bite → control catch bar → collect fish and possible treasure | Optional bait/lure, rod/habitat compatibility, timing, and satchel capacity. |
| Sport fishing | Find school → chum → arm lure → hook → manage tension/direction/brace → land physical cargo | Species, rod class, cargo class, line condition, fish behavior, and available landing space. |
| Physical fish trade | Land in compatible boat slot or hands → dock → collect one pack → carry inland → sell | The voyage does not complete the sale. Final hand-carry logistics and freshness matter. |
| Contract work | Inspect an already-posted order → prepare → deliver partials or full quantity at its named market → receive completion reward | Species, grade, weight, freshness, volume, deadlines, and delivery location may all be binding. |
| Equipment production | Obtain field/market materials → produce textiles → craft specialist gear → equip and compare | Permanent ownership and role-specific benefits; not an endless consumable equipment treadmill. |
| Sunreach preservation | Cross by skiff → grow terrace crops/fish the reef → cure sardines → return and sell preserved goods | Preserved stacks avoid the physical-fish freshness clock; the route changes what preparation is valuable. |
| Long-term mastery | Finish the main spine and parallel tracks → improve proficiencies → pursue records and exceptional catches | Main narrative completion and the high-XP Master rod/Marlin pursuit are deliberately different goals. |

### What gold buys or enables

Gold is used for seeds and replacement supplies; fertilizer and compost starter; bait, lure, chum, ice and fuel; workshop materials; the four purchasable rod upgrades; the 120 G field-pump unlock; commissioning the inherited rowboat; the 850 G skiff; a 25 G emergency tow when eligible; and paid story turn-ins such as the charter. Several upgrades also require XP, ingredients, quest state, or the correct physical service point. Gold alone does not bypass those gates.

The starter farmhouse and field are inherited, not property the player must buy back. The Commons is community farmland, not a separate private-housing purchase. No normal player path for combat, romance, house construction, land-lease renewal, livestock husbandry, player-to-player trade, or multiplayer was established.

**Source owners:** [`src/content/quests.ts`](src/content/quests.ts); [`src/content/progression.ts`](src/content/progression.ts); [`src/simulation/domains/MarketDomain.ts`](src/simulation/domains/MarketDomain.ts); [`src/simulation/domains/NavigationDomain.ts`](src/simulation/domains/NavigationDomain.ts); [`src/simulation/domains/FarmingDomain.ts`](src/simulation/domains/FarmingDomain.ts).

## 02. Starting a game and the initial situation

The title/loading flow supports starting a new game, continuing a readable save, skipping the opening presentation where offered, retrying failed startup, and explicitly continuing without saving when persistence is unavailable. Graphics preference is available before entering the world. The application distinguishes loading failures from a successful playable state; input is admitted after boot is ready.

A normal new state begins on **Day 1, Spring, Year 1, at 08:00**, with **100 G**, zero XP in each of the four professions, the Willow rod owned and equipped, neutral starter equipment, full 500 Work, and full sprint stamina. The starter satchel contains **10 Wheat Seeds, 6 Tomato Seeds, 6 Seed Potatoes, 2 Compost Starter, and 8 Plant Matter**. There are no pre-grown crops or completed production jobs to harvest immediately.

The old rowboat exists at the harbor with empty storage, but its existence is not permission to board: the story must commission it. The starter donkey and inherited horse carriage also exist in the world. The carriage begins with two empty physical-cargo slots and its own full movement-stamina budget; it is not another purchasable boat or an automatically dispatched delivery service. The opening quest is `quest.act1_welcome`. A starter wheat order asks for 6 wheat and offers 65 G plus 150 Farming XP, expiring at the first day's midnight.

### First-use teaching and safeguards

Contextual hints introduce planting, watering, Work, fishing, boating, and long processing waits. Hints are recorded so the same introduction does not recur indefinitely. Completing certain early actions before the tutorial asks for them can be credited—but only for explicitly opted-in objectives, with their crop/station/farm restrictions. There is no universal rule that every past action completes every future quest.

The first garden is deliberately accelerated. Until `quest.act2_harvest_and_compost` is completed, Wheat in the Starter Garden receives a **5× growth multiplier**. The first eligible worm-compost run at `struct.starter_compost` takes **12 game minutes**, rather than its normal 360. That compost acceleration is limited to the first qualifying run by objective/early-credit evidence; it is not an unlimited 30-real-second worm factory.

**Source owners:** [`src/simulation/core/createInitialState.ts`](src/simulation/core/createInitialState.ts); [`src/simulation/core/OnboardingPace.ts`](src/simulation/core/OnboardingPace.ts); [`src/ui/StartScreen.tsx`](src/ui/StartScreen.tsx); [`src/app/GameApp.ts`](src/app/GameApp.ts); [`src/persistence/IndexedDbSaveRepository.ts`](src/persistence/IndexedDbSaveRepository.ts).

## 03. Controls, camera, targeting, and modes

### Desktop controls

| Input | Player-facing meaning | Context / important qualification |
| --- | --- | --- |
| WASD / arrow keys | Move; throttle/steer boats or the carriage | On foot and on the donkey, movement is camera-relative. Boats and the carriage use vehicle-relative controls. |
| Shift | Sprint on foot; gallop on donkey; trot with carriage | These use actor-specific movement budgets, not Work. Shift is not motorboat boost. |
| Space | Jump on foot; fishing action in fishing modes | It is not a universal jump key while fishing or boating. |
| E | Perform the current contextual interaction | May automatically choose the required tool; target eligibility is rechecked at commit. |
| Hold E, release E | Charge and release a basic fishing cast | Applies when the context starts a cast; not every E interaction is a hold action. |
| Left mouse button | Primary action / confirm planting; reel during sport fishing | For basic casting, release completes the charged input path. |
| Right mouse drag | Orbit camera | Distinguished from a stationary secondary click by a drag threshold. |
| Right mouse click/release without drag | Inspect pointed crop / cancel planting | During sport fishing, right mouse holds slack instead. |
| Mouse wheel | Zoom camera | Presentation only; does not move the player through the world. |
| 1–5 | Select a contextual hotbar slot | Slots are generated from context; do not assume the same five verbs in every mode. |
| R | Arm / put away a Woven Lure | On foot or aboard; not a generic “read water” key despite one inspected prompt. |
| Hold Alt | Farm GIS / soil-information overlay | Temporary information layer; release/interruption clears the hold. |
| C | Character and equipment | Blocked during incompatible actions, crop placement, or a fishing encounter. |
| I | Satchel | The caught-basic-fish summary is allowed to open it to resolve capacity. |
| J | Field Journal | May be blocked by an already-open contextual modal. |
| M | Nautical Chart | Information and planning; no world teleport implied. |
| L | Hold & Stores | Global information does not grant remote transfer access. |
| P | Expedition Board | Requires `feature.expedition_planner` after the first expedition. |
| Escape | Cancel/close/back/pause, in priority order | See mode semantics below; it does not always pause immediately. |
| W / left mouse, S / right mouse, Space, A / D | Sport reel, slack, brace, counter-steer | Fishing input consumes those bindings instead of moving the character. |
| Space during basic angling | Hook a bite; hold to raise catch bar; collect finished catch | Meaning changes with the fishing phase; after escape it dismisses the failed attempt. |

**F toggles the Farm Forecast**, and clicking the weather instrument opens the same information. The handler lives in `HUD.tsx`, not in `InputRouter.ts`; it ignores key repeats, text-entry targets, blocked UI, and disabled modes. This is a verified example of why the input router alone is not a complete interaction inventory.

### Interaction acquisition

World prompts are context-sensitive candidates: crops, prepared soil, stations, wells, markets, NPCs, doors, labor stations, boats, donkey, carriage bench/rear access, schools, notices, and water compete for attention. Distance, world position, line of sight where enforced, action priority, active mode, free hands, and local eligibility determine the winner. A visible object is not automatically interactive. A valid preview does not bypass the domain's commit-time validation.

Planting uses a fresh pointer raycast and simulation placement query. Crop information inspection has its own reach; seeing crop information does not authorize watering or harvesting from the same distance. Workstations require their usable/front approach, rather than merely standing somewhere inside a broad building radius.

### Camera and character-preview interactions

Camera orbit and zoom are player choices independent of traversal and gameplay reach. The camera uses different envelopes/framing for on-foot movement, placement, interiors, vehicles, and fishing, and obstruction handling can shorten the visible distance. Deliberate manual orbit/zoom interrupts automatic exploration framing rather than moving the player toward a target. Sport fishing owns right mouse for slack, so its controls must not be described as the normal camera-drag context.

The Character & Gear mannequin has a separate preview interaction: pointer/touch drag rotates the model. It does not turn the actual world character, apply a previewed outfit, or write a pose into the save. A failed preview renderer/model can fall back to text while the equipment comparison remains usable. No keyboard mannequin-rotation or mannequin-zoom control was established from that component. Selected arrival/record camera effects consult reduced-motion preference; this is not proof that every animation is disabled.

**Camera/preview owners:** [`src/render/camera/GameCamera.ts`](src/render/camera/GameCamera.ts); [`src/render/camera/ExplorationFraming.ts`](src/render/camera/ExplorationFraming.ts); [`src/ui/CharacterPreview3D.tsx`](src/ui/CharacterPreview3D.tsx).

### Action timing and cancellation

Planting, watering, harvesting, fertilizing, casting, station work, and boat interactions can pass through presentation phases before the canonical command commits. Walking or Escape can cancel an action **before** its commit. After commit, cancelling presentation or opening Pause does not refund or roll back a successful mutation. The action locks its target and blocks overlapping actions and jump requests. Lost focus or interrupted input clears held controls and cancels eligible uncommitted actions.

### Time continues in ordinary panels

`ModeController` distinguishes input blocking from time freezing. **Registered gameplay modals block world input; only a Pause entry in the overlay stack pauses simulation.** The new locally managed PWA-install sheet is an exception requiring separate input-lock verification, described in section 18 and A26. A satchel, journal, chart, market, or conversation opened directly is not itself a time freeze. Opened from Pause, a child panel stays above Pause, and closing it returns to Pause instead of unexpectedly resuming.

Contextual modals—market, dialogue, crafting, catch—prevent unrelated overlay hotkeys from silently replacing them. Active fishing blocks most tool/panel hotkeys, except the caught-basic-fish inventory escape hatch. Escape first dismisses crop inspection, cancels a cancellable action/cast, leaves crop placement, or reels in an unfinished basic attempt as applicable. A caught fish must be collected, managed via the satchel, or explicitly discarded; Escape does not silently throw it away.

### Touch and mobile surface

Touch input has virtual movement and action controls routed through the same gameplay handlers, camera drag and pinch, sprint/jump affordances where applicable, and fishing-specific holds. The application attempts fullscreen/landscape locking after an appropriate gesture; browser refusal is handled by an orientation gate rather than guaranteed locking. Portrait on a detected touch device can block play until landscape. This establishes a touch implementation, **not** proven device compatibility or performance across iOS/Android browsers.

**Source owners:** [`src/input/InputRouter.ts`](src/input/InputRouter.ts); [`src/ui/keybindings.ts`](src/ui/keybindings.ts); [`src/app/ModeController.ts`](src/app/ModeController.ts); [`src/app/GameApp.ts`](src/app/GameApp.ts); [`src/ui/MobileControls.tsx`](src/ui/MobileControls.tsx).

## 04. Player resources, time, and pressure

### The calendar

At the default speed, **1 game minute takes 2.5 real seconds**: a full game day is about 60 real minutes. A season lasts 6 game days; four seasons form a 24-day year. Dawn is 04:00–08:00, day 08:00–18:00, dusk 18:00–22:00, and night 22:00–04:00. Recipe and crop durations in this master are game minutes unless explicitly converted.

Weather, temperature, farm climate, soil, time of day, and seasons affect multiple systems. Crop growth and moisture, fishing pools/weighting, sea conditions, and freshness are not independent timers with one global multiplier. Forecasts and ETAs are information, not guarantees that the current environment will remain unchanged.

### Work capacity versus movement stamina

Work is the economic action budget, with a maximum of **500**. Walking, running, looking around, opening information, selling, handling cargo, and making contract deliveries do not use the farming/fishing/processing Work charges. Sprint stamina is a different resource. Do not label either as health, hunger, combat mana, or a survival-death meter.

Base Work costs before proficiency/equipment adjustments:

| Action | Base Work | Other consumption / conditions |
| --- | --- | --- |
| Plant one crop | 12 | One seed/sapling; valid footprint and crop XP. |
| Water one crop | 5 | No refill item was found in the normal watering action. |
| Harvest a living ripe crop | 30 | Output space; withered clearing is a different free path. |
| Apply fertilizer | 8 | One Fish Fertilizer; field-level fertility effect. |
| Run installed irrigation | 8 | One action waters all eligible crops in the named field. |
| Start standard processing | 35 | Recipe ingredients; one job occupies the station. |
| Start masterwork processing | 70 | Higher-grade equipment recipes use this class. |
| Release a basic cast | 15 | Optional worm and optional armed lure; starting the charge is free. |
| Hook a small sport fish | 18 | One mandatory armed lure; school must already be feeding. |
| Hook a medium sport fish | 28 | Actual class is selected from eligible species. |
| Hook a large sport fish | 36 | Suitable rod and landing capacity. |
| Hook a gargantuan sport fish | 44 | Suitable rod and compatible boat capacity. |

A profession rank discounts its applicable Work charges by 5% per rank, up to 35%. Equipment cost effects apply after the rank calculation, with a floor that limits their additional reduction to 20% of the neutral cost; rounding can make a small nominal bonus invisible on a cheap action. The live quote is authoritative. The school preflight can quote the highest cost among viable catches so the rolled fish cannot become unaffordable after admission.

### Ways to regain Work

Passive live recovery grants **8 Work per 300 real, unpaused seconds**, stopping accumulation at a full pool. Separate earned grants are subject to a **300-per-game-day earning cap**: labor rewards, meal restoration, and catch rebates must respect the actual progression-domain rules. A perfect basic catch rebates 8 Work; a landed sport fish rebates 12. Failed sport encounters refund 60% of the actual charged hook cost under the refund path; this is not a restoration of the consumed lure or a new paid catch reward.

Rest is available at the farmhouse interior during dusk/night and advances to the next 08:00. It restores a bounded amount—50 Work with a 125 floor, clamped to the maximum—not a full 500-point refill. Crops, jobs, markets, cargo, and deadlines still experience the elapsed game time. Away time has its own bounded catch-up/rest behavior; it is not repeated passive live regeneration.

Three cooked meals can be consumed per game day, from the satchel: **Harvest Bowl +50**, **Coastal Fish Stew +75**, **Orchard Tart +60**. A meal is admitted only when its **full restoration amount** fits both remaining pool space and the remaining daily earned-Work allowance. Otherwise it is refused without consuming the item or a meal use: this is not a partially paid meal. Eating also requires an edible item and an eligible state. Raw produce, Salt-Cured Fish, bait, and generic processed items are not thereby all edible.

### Proficiencies and rank ladder

| Rank | XP threshold | Examples of what matters at/after it |
| --- | --- | --- |
| Novice | 0 | Starter crops, basic processing, Willow rod, initial equipment production. |
| Apprentice | 1000 | Reinforced River rod; additional crops; recipe rank gate for many intermediate recipes and two meals. |
| Skilled | 3000 | Heavy Sport rod; Flax; stronger water-reading information; Orchard Tart recipe gate. |
| Expert | 7500 | Coastal Fishing Skiff; Deep Offshore rod; Apple/Olive trees at their Farming threshold. |
| Master | 15000 | Deck Boots and Long-Spout Can production; more detailed water reading. |
| Artisan | 30000 | Oilskin Coat and Balanced Sickle; one additional base contract slot for Trading. |
| Famed | 60000 | Master Maritimer rod and gargantuan-fish tackle capability. |
| Legendary | 100000 | Highest named rank; no extra top-rank purchase was established merely from the rank name. |

Farming, Fishing, Processing, and Trading each have their own XP total. A Fishing unlock does not follow from having the same amount of Farming XP. Recipe availability is the intersection of its raw `minimumSkill` requirement and its rank-unlock membership; this is why copying recipe fields alone produces an incorrect guide.

**Source owners:** [`src/simulation/core/GameClock.ts`](src/simulation/core/GameClock.ts); [`src/simulation/domains/ProgressionDomain.ts`](src/simulation/domains/ProgressionDomain.ts); [`src/content/progression.ts`](src/content/progression.ts); [`src/content/items.ts`](src/content/items.ts); [`src/simulation/Simulation.ts`](src/simulation/Simulation.ts).

## 05. Farming: every crop interaction

### Place and plant

Choose a seed-bearing crop from the satchel or seed/tool belt, enter placement mode, point at prepared farm soil, inspect the footprint preview, and confirm with the primary action/E. Right-click or Escape cancels placement. Planting is one placement and one action, not a paintbrush that secretly plants a row.

Placement validates the crop definition, ownership/access to the farm state, Farming XP, available seed, farm capacity, the entire footprint within valid prepared soil, neighboring crop overlap, authored structure clearances, and interaction reach. A tree needs substantially more space than a carrot. There is no exposed arbitrary crop-rotation control established; authored/deterministic placement rotation should not be described as a player feature.

Successful planting consumes one seed, pays Work, creates the crop instance, and grants 12 Farming XP. Its starting moisture is 70 and health 100. A rejected placement should not spend the seed, Work, or random outcome stream.

### Inspect and tend

Crop inspection exposes the crop/stage, growth progress, moisture condition, soil fertility, climate suitability, expected yield, approximate remaining growth time, and currently available or blocked actions. Current-rate growth estimates are not fixed harvest appointments. Right-clicking a crop is informational; E chooses a contextual work action and can equip the necessary tool automatically.

Watering a living reachable crop below 85 moisture sets its moisture to 100 and grants 5 Farming XP. Already-wet crops are not valid repeat watering targets. There is no water-can refill transaction in the inspected normal command surface. Water is still constrained by Work, reach, crop state, and the need to visit the field.

Fish Fertilizer consumes one item and adds 20 to the farm's shared fertility, capped at 100, with an 8-XP Farming grant on an actual application. It is not an individual crop's independent fertilizer inventory. The already-fertile path does not charge an unnecessary item/Work and can acknowledge the relevant quest event.

### Harvest, grade, regrow, and clear

Mature and overripe crops can be harvested; withered crops can be cleared. A living harvest checks room for its primary output before committing RNG or charging. Yield responds to crop definition, health, proficiency and growing conditions. Grade influences harvest XP and journal records. **Produce is stored as an ungraded stack: a prize harvest does not permanently multiply every later sale of that crop.**

Harvesting reduces field fertility by the crop's depletion cost, with a lower bound, and grants base 30 Farming XP multiplied by grade: common 1.00, fine 1.10, exceptional 1.25, prize 1.50. Annual crops leave the field after harvest. Plant Matter is a secondary return that can be omitted when no space remains; primary produce is not silently dropped to make room for it.

Apple and Olive trees survive a successful harvest and enter regrowth rather than needing another sapling. They still need care and can wither. A withered plant/tree is a free clearing action with no harvest yield; it is not free produce, a new sapling, or a healthy-tree transplant.

### Manual field irrigation

At the Starter Farm well, the story-gated field pump costs **120 G**. Installation records `feature.irrigation_zone`. This is a shared unlock rather than an independently purchased pump state for each farm. Using an eligible well thereafter waters all living, under-watered crops in that field for one 8-Work action. An already-watered field returns a no-op result without unnecessary charging.

The pump is **manual batch watering**, not an autonomous irrigation scheduler. It does not plant, harvest, refill a can, water the world continuously, or remove moisture management from Sunreach.

### Crop catalogue

`Base growth` excludes weather/soil/climate effects and the first-garden acceleration. Yield is the authored base range, not a guarantee. Footprints are in world units.

| ID | Crop | Base growth, min | Farming XP | Footprint | Yield | Climate preference | Regrowth, min |
| --- | --- | --- | --- | --- | --- | --- | --- |
| crop.wheat | Wheat | 180 | 0 | 1 × 1 | 3–5 | Temperate | No |
| crop.barley | Barley | 90 | 500 | 1 × 1 | 3–6 | Temperate | No |
| crop.corn | Sweet Corn | 150 | 1,000 | 1.2 × 1.2 | 2–5 | Warm; temperate neutral | No |
| crop.tomato | Tomato | 240 | 0 | 1 × 1 | 3–5 | Temperate / warm | No |
| crop.potato | Potato | 360 | 0 | 1 × 1 | 3–6 | Cool; temperate neutral | No |
| crop.carrot | Carrot | 90 | 200 | 0.8 × 0.8 | 2–5 | Cool / temperate | No |
| crop.flax | Flax | 240 | 3,000 | 1 × 1 | 2–4 | Temperate | No |
| crop.apple_tree | Apple Tree | 720 | 7,500 | 2.5 × 2.5 | 4–8 | Temperate | 360 |
| crop.sunflower | Sunflower | 210 | 1,000 | 1.1 × 1.1 | 3–6 | Warm; temperate neutral | No |
| crop.olive_tree | Olive Tree | 840 | 7,500 | 2.5 × 2.5 | 4–8 | Warm | 420 |

All crops share the six stage names: **seeded, sprout, growing, mature, overripe, withered**. Wheat, Tomato and Potato are available from the beginning. The Village seed shelf covers Wheat, Barley, Corn, Tomato, Potato, Carrot, Flax and Apple; Sunreach's cove supplies Sunflower and Olive. Seed ownership does not override the crop's XP or placement gate.

Prepared fields currently used by the story are **Starter Garden**, **Village Commons** (stable save ID `farm.player_homestead`), and **Sunreach Terraces**. The inherited-home/commons naming distinction matters: a legacy “player homestead” identifier is not proof of a private-property purchase feature.

**Source owners:** [`src/content/crops.ts`](src/content/crops.ts); [`src/content/markets.ts`](src/content/markets.ts); [`src/simulation/domains/FarmingDomain.ts`](src/simulation/domains/FarmingDomain.ts); [`src/simulation/farming/calculateCropGrowth.ts`](src/simulation/farming/calculateCropGrowth.ts); [`src/simulation/core/OnboardingPace.ts`](src/simulation/core/OnboardingPace.ts).

## 06. Labor stations and provisions

Labor is a short timing challenge that earns Work, not a system for hiring NPC workers. Approach a station, start its chore, watch the oscillating meter, and strike in the target band. A clean strike grants the listed yield; a near miss within the surrounding allowance grants half. A miss ends the attempt without spending that station's successful daily use. Cancel or leaving its reach abandons the attempt.

A successful positive grant marks that station used for the current game day, including a half-yield success. Starting requires room for the full advertised clean yield in both the Work pool and daily earning allowance. The current start/strike paths refuse physical cargo in the player's hands, incompatible boat/mount/fishing state, used stations, and invalid reach. A strike rechecks position: walking away and then striking cannot collect a remote reward. Starting a fishing encounter cancels a live labor meter. The meter is transient and is not restored as a completed shift after reload. Misses/cancellation grant nothing and do not consume a successful daily use.

| ID | Chore | Clean yield | Reach | Meter speed / target |
| --- | --- | --- | --- | --- |
| labor.firewood | Split Kindling | 20 Work | 2.6 m | 1.15 / 0.72–0.88 |
| labor.racks | Turn the Drying Racks | 20 Work | 2.6 m | 1.05 / 0.72–0.88 |
| labor.nets | Mend the Nets | 20 Work | 2.6 m | 1.25 / 0.72–0.88 |

These actions do not establish a general tree-felling, wood-inventory harvesting, net-fishing, or rack-building system. Their authored output is Work. Cooking and eating are separate from this meter: cooking occupies a kitchen job; eating is an explicit satchel action with a three-meals-per-day limit.

**Source owners:** [`src/simulation/labor/LaborStations.ts`](src/simulation/labor/LaborStations.ts); [`src/simulation/domains/LaborDomain.ts`](src/simulation/domains/LaborDomain.ts); [`src/simulation/domains/ProgressionDomain.ts`](src/simulation/domains/ProgressionDomain.ts); [`src/content/items.ts`](src/content/items.ts).

## 07. Processing and the complete recipe catalogue

### Station interaction lifecycle

Approach a hand mill, workbench, fish table, compost bin, or kitchen from its usable side. Interacting with an idle station opens its recipe interface. Inspect ingredients, owned amounts, missing quantities, duration, Work, and unlock blockers; start a valid recipe. Starting removes ingredients from the **satchel**, charges Work, and creates a persistent job with the quoted economics. Boat-store ingredients are not automatically the processing inventory.

One job occupies each station, including a finished job awaiting collection. Different stations can hold different jobs; a single station does not expose a multi-entry queue. Returning before completion reports the remaining wait. Returning after completion allows collection. Equipment outputs enter the wardrobe; ordinary outputs need satchel capacity. A full destination leaves the completed job available rather than deleting its output.

Processing XP and `craft-recipe` quest progress occur at **collection**, not merely when the job starts or its timer reaches zero. Standard jobs grant 35 Processing XP; masterwork jobs grant 70. Equipment already owned or already reserved by another job cannot be manufactured indefinitely as duplicate gear. No normal cancel-job/refund, automatic output collection, or automated sales action was established.

### Recipe table

Each row is an authored recipe. Quantities are per one job. `XP gate` is the **effective Processing XP threshold**, taking the rank-unlock table into account. `Work` is the base cost before discounts. Timers are game minutes. Some recipe IDs are shown where story objectives use them; the linked catalogue remains the owner of every exact identifier.

| Recipe / output | Station | Inputs | Output quantity | Duration | XP gate | Work |
| --- | --- | --- | --- | --- | --- | --- |
| Wheat → Ground Grain | Hand mill | 2 Wheat | 2 Ground Grain | 5 | 0 | 35 |
| Barley → Ground Grain | Hand mill | 2 Barley | 2 Ground Grain | 5 | 0 | 35 |
| Sunflower Seed → Ground Grain | Hand mill | 2 harvested Sunflower Seed | 2 Ground Grain | 5 | 0 | 35 |
| Chum Bucket | Workbench | 2 Ground Grain + 2 Bait Worms | 1 Chum Bucket | 10 | 0 | 35 |
| Rich Chum Blend | Workbench | 3 Ground Grain + 3 Bait Worms | 1 Rich Chum Blend | 15 | 1000 | 35 |
| Sinking Deep Chum | Workbench | 2 Ground Grain + 2 Fish Scraps | 1 Sinking Deep Chum | 15 | 1000 | 35 |
| Woven Lure, simple | Workbench | 2 Plant Matter + 2 Bait Worms | 1 Woven Lure | 10 | 0 | 35 |
| Woven Lure, batch | Workbench | 1 Flax Stalks + 1 Fish Scraps | 2 Woven Lures | 15 | 1000 | 35 |
| Fish Fertilizer | Fish table | 3 Fish Scraps | 1 Fish Fertilizer | 10 | 0 | 35 |
| Compost Worms | Compost bin | 4 Plant Matter + 1 Compost Starter | 25 Bait Worms | 360; first eligible tutorial run 12 | 0 | 35 |
| Clean Perch | Fish table | 1 Perch | 2 Fish Scraps | 5 | 0 | 35 |
| Clean Mackerel | Fish table | 1 Mackerel | 2 Fish Scraps | 5 | 0 | 35 |
| Clean Carp | Fish table | 1 Carp | 2 Fish Scraps | 5 | 0 | 35 |
| Clean Sardine | Fish table | 1 Sardine | 2 Fish Scraps | 5 | 0 | 35 |
| Salt-Cure Sardines | Fish table | 2 Sardines | 1 Salt-Cured Fish | 45 | 1000 | 35 |
| Linen Roll | Workbench | 3 Flax Stalks | 1 Linen Roll | 20 | 0 | 35 |
| Oiled Canvas | Workbench | 1 Linen Roll + 2 Fish Scraps | 1 Oiled Canvas | 30 | 1000 | 35 |
| Field Hat | Workbench | 2 Linen Rolls + 1 Tanned Leather | 1 permanent Field Hat | 40 | 0 | 35 |
| Furrow Boots | Workbench | 2 Tanned Leather + 1 Linen Roll | 1 permanent Furrow Boots | 50 | 0 | 35 |
| Tidewatch Cap | Workbench | 2 Oiled Canvas + 1 Brass Fittings | 1 permanent Tidewatch Cap | 50 | 1000 | 35 |
| Harvest Apron | Workbench | 3 Linen Rolls + 1 Tanned Leather | 1 permanent Harvest Apron | 60 | 1000 | 35 |
| Copper Rose Can | Workbench | 2 Copper Sheet + 1 Brass Fittings + 1 Hardwood Blank | 1 permanent Copper Rose Can | 70 | 1000 | 70 |
| Broad Sickle | Workbench | 2 Tool Steel + 1 Hardwood Blank + 1 Tanned Leather | 1 permanent Broad Sickle | 70 | 1000 | 70 |
| Deck Boots | Workbench | 2 Tanned Leather + 1 Oiled Canvas + 1 Brass Fittings | 1 permanent Deck Boots | 75 | 15000 | 70 |
| Oilskin Coat | Workbench | 3 Oiled Canvas + 1 Brass Fittings | 1 permanent Oilskin Coat | 90 | 30000 | 70 |
| Long-Spout Can | Workbench | 3 Copper Sheet + 2 Brass Fittings + 1 Hardwood Blank | 1 permanent Long-Spout Can | 90 | 15000 | 70 |
| Balanced Sickle | Workbench | 2 Tool Steel + 1 Hardwood Blank + 1 Brass Fittings | 1 permanent Balanced Sickle | 90 | 30000 | 70 |
| Harvest Bowl | Kitchen | 2 Potatoes + 2 Carrots + 1 Ground Grain | 1 Harvest Bowl | 20 | 1000 | 35 |
| Coastal Fish Stew | Kitchen | 2 Perch + 1 Potato + 1 Carrot | 1 Coastal Fish Stew | 30 | 1000 | 35 |
| Orchard Tart | Kitchen | 2 Apples + 2 Ground Grain | 1 Orchard Tart | 35 | 3000 | 35 |

Important distinctions: harvested Sunflower Seed is not the planting-seed item; Flax is a crafting material even though it grows in a field; a crop's own growing gate does not prevent buying its material at a workshop shelf; Salt-Cured Fish is a preserved trade good, not one of the Work meals; and flavor about salt does not add a salt ingredient absent from the recipe.

Story-sensitive recipe targets include `recipe.wheat_to_grain`, `recipe.compost_worms`, `recipe.craft_chum`, `recipe.fish_to_fertilizer`, `recipe.sunflower_to_grain`, and `recipe.cure_sardine`. The location predicate can require a particular station instance, not just any station of the same type.

**Source owners:** [`src/content/recipes.ts`](src/content/recipes.ts); [`src/content/progression.ts`](src/content/progression.ts); [`src/simulation/domains/ProcessingDomain.ts`](src/simulation/domains/ProcessingDomain.ts); [`src/content/quests.ts`](src/content/quests.ts).

## 08. Character equipment, wardrobe, and rods

### Equipment interaction surface

Open Character & Gear, select an equipped slot or an owned item, inspect the item and comparison, use **Try On** for a local visual preview, reset that preview, or **Equip** to change the actual loadout. A try-on disappears without changing the save. Applying gear validates ownership, slot compatibility, and the equipment-domain state blocker; an active fishing encounter must not gain a retroactive gear swap.

The wardrobe browser exposes **All, Clothing, Tools, and Rods** categories with ownership counts. Filtering changes the browsing list, not the inventory or ownership. Selecting a slot/item drives comparison and which relevant tool is shown in the preview. Pointer drag rotates the mannequin until release/cancel. Preview or asset failure must leave textual equipment information available rather than implying the gear has been lost.

The wardrobe has **20 equipment spaces**, including reservation accounting for gear being made. The catalogue currently defines **15 equipment pieces**: five neutral starters and ten specialists. Capacity is not the count of available designs. Owned rods are shown alongside equipment in Character & Gear but remain their own ownership/progression system.

**Field** and **Sea** outfits each support Save Current and Wear. They remember **head, outerwear, and feet only**. They do not switch the watering tool, harvesting tool, or rod. Save Current captures the actual outfit, not an uncommitted preview.

| Item | Slot | Gameplay effect |
| --- | --- | --- |
| Weathered Straw Hat | Head | Neutral starter; no specialist effect. |
| Work Vest | Outerwear | Neutral starter. |
| Mud Boots | Feet | Neutral starter. |
| Tin Watering Can | Watering tool | Neutral starter. |
| Farm Sickle | Harvest tool | Neutral starter. |
| Field Hat | Head | Planting and fertilizing Work ×0.85 before final caps/rounding. |
| Tidewatch Cap | Head | Basic-cast and sport-hook Work ×0.90. |
| Harvest Apron | Outerwear | Exceptional/prize crop-quality chance modifier ×1.10, not a guaranteed better grade. |
| Oilskin Coat | Outerwear | Sport line-damage multiplier ×0.90. |
| Furrow Boots | Feet | +0.25 m crop watering/harvest/inspection reach. |
| Deck Boots | Feet | Extra resistance gained while bracing ×1.10; not a universal 10% defense bonus. |
| Copper Rose Can | Watering tool | Watering Work ×0.80. |
| Long-Spout Can | Watering tool | +0.50 m watering reach. |
| Broad Sickle | Harvest tool | One extra Plant Matter from an eligible annual harvest when storage permits. |
| Balanced Sickle | Harvest tool | Harvest Work ×0.80. |

### Rod ladder

Buying a rod requires the correct tackle retailer, being near it, the previous rod owned, sufficient Fishing XP, sufficient gold, and an eligible equipment state. Purchase automatically equips the new rod. Existing rods can be switched in Character & Gear; a tackle stall can also equip an already-owned rod, including the starter Willow even though it is not sold there.

A higher-class rod is not automatically better in every habitat: Heavy Sport does not support river water, and Deep Offshore does not support river or lake water. Going back to a lower rod can be the correct action.

| ID | Rod | Catalogue G | Fishing XP | Allowed habitats | Maximum cargo class |
| --- | --- | --- | --- | --- | --- |
| rod.willow | Willow Branch | 25; starter owned, not a normal repurchase | 0 | River, lake, coast | Small |
| rod.river | Reinforced River | 120 | 1,000 | River, lake, coast | Medium |
| rod.heavy_sport | Heavy Sport | 380 | 3,000 | Lake, coast, offshore | Large |
| rod.offshore | Deep Offshore | 950 | 7,500 | Coast, offshore | Large |
| rod.master | Master Maritimer | 2,500 | 60,000 | River, lake, coast, offshore | Gargantuan |

The Harbor stocks the four purchasable rods. Sunreach Cove stocks Heavy Sport; it does not waive the previous-rod requirement. Rod strength, safe tension, hook reliability, and basic-fishing bar size differ. The Master-named rod is acquired at **Famed Fishing, 60,000 XP**, not merely at the rank named Master, 15,000 XP.

**Source owners:** [`src/content/equipment.ts`](src/content/equipment.ts); [`src/content/rods.ts`](src/content/rods.ts); [`src/ui/CharacterScreen.tsx`](src/ui/CharacterScreen.tsx); [`src/simulation/domains/EquipmentDomain.ts`](src/simulation/domains/EquipmentDomain.ts); [`src/simulation/domains/MarketDomain.ts`](src/simulation/domains/MarketDomain.ts).

## 09. Inventory and goods: what can be held, inspected, used, or moved

The satchel has **16 slots** and is stack-limited. Its current fixed 4×4 layout preserves every socket while filtering: matching occupied entries stay emphasized, nonmatching occupied entries dim, and empty sockets remain structural placeholders. Actual filter labels are **All, Field, Fishing, and Supplies**; Field uses the internal `farming` identifier. This replaces the earlier master’s description of hidden nonmatching rows.

**Organize** reveals search and **Tidy**. Search matches names, category labels, or the crop a seed grows. **Clear** removes the text query without changing the category. The empty-result **View All Items** action resets both. Keyboard arrows/Home/End target matching occupied entries rather than empty cells. Selection moves to an available matching entry when filters exclude the previous selection. Nonmatching occupied sockets still have a pointer-selection handler, so pointer/keyboard consistency is a specific audit risk, not an assumed accessibility success (A23).

The inspector has a separate **Details** disclosure alongside its contextual Plant/Eat action. Changing tabs, searching, selecting, and opening Details do not consume anything. Tidy changes the actual inventory arrangement but cannot create new capacity or items.

A seed inspection can initiate planting, closing the panel into placement mode. An eligible meal can be eaten explicitly. Inspection does not make every item consumable or remotely usable. The early satchel footer hint is limited to the first few openings in that browser.

The **Hold & Stores** ledger shows satchel occupancy, vessel cargo capacity, the carried catch, supplies, vessel status/hull, slot contents, and stackable goods. Its Stow and Take buttons move the displayed row's **entire quantity** between the satchel and that boat's supply inventory. The simulation still requires physical access to that vessel and destination room. With multiple vessels, a vessel tab chooses which bay and transfer rows are shown; selecting it does not board that boat. This is not a general arbitrary-quantity slider, a fish-slot rearranger, or remote access to every boat because it appears in the ledger. The displayed vessel-capacity total excludes the horse carriage: cart loading/unloading occurs at its rear, not through the ledger’s Stow/Take stack buttons.

### Complete goods families

| Family | Catalogue entries and principal uses |
| --- | --- |
| Planting items | Wheat Seeds, Barley Seeds, Corn Kernels, Tomato Seeds, Seed Potato, Carrot Seeds, Flax Seeds, Apple Tree Sapling, Sunflower Seeds, Olive Sapling. Used by one-crop placement; ordinary seeds stack to 100 and saplings to 20. |
| Farm output | Wheat, Barley, Sweet Corn, Tomato, Potato, Carrot, Flax Stalks, Apple, harvested Sunflower Seed, Olive. Trade, orders, milling, textiles, and/or cooking according to their actual recipe/category. |
| Fishing preparation | Ground Grain; Bait Worms; Chum Bucket; Rich Chum Blend; Sinking Deep Chum; Woven Lure. Worms and grain stack to 100; chum/lures to 50. |
| Soil cycle | Plant Matter, Compost Starter, Fish Scraps, Fish Fertilizer. Crops, cleaning/processing, composting, and field fertility form the circular production chain. |
| Equipment materials | Hardwood Blank, Tanned Leather, Tool Steel, Linen Roll, Copper Sheet, Brass Fittings, Oiled Canvas. These are stackable materials, not equipped items; their stack limit is 20. |
| Boat preservation and fuel | Crushed Ice and Engine Fuel. Ice follows storage/cooling rules; refueling explicitly consumes fuel from the satchel. |
| Preserved trade food | Salt-Cured Fish, stack limit 40. No physical-cargo freshness instance; not a Work meal. |
| Cooked provisions | Harvest Bowl, Coastal Fish Stew, Orchard Tart, each stack limit 10. Explicit Work-restoring consumption, with daily limits. |
| Ordinary fish stacks | Carp, Perch, Mackerel, Sardine. Sell where stocked as commodities or clean at a fish table; suitable species enter recipes. |
| Physical fish | Ten sport species plus Golden Sea Bream. Individual weight, grade, freshness and location; not ordinary satchel stacks. The Bream's item registration supports basic casting, not bulk-stack storage. |
| Permanent gear | Fifteen equipment definitions and five rods. Ownership/loadout systems rather than ordinary expendable satchel stacks. |

No normal general-purpose drop-any-item, split-a-stack, arbitrary drag-to-reorder, equipment-sale, or remote storage expansion action was established by the inspected command/UI surface. These should not be promised as existing because the inventory data structure could support them.

**Source owners:** [`src/content/items.ts`](src/content/items.ts); [`src/ui/InventoryModal.tsx`](src/ui/InventoryModal.tsx); [`src/ui/components/LogisticsLedgerModal.tsx`](src/ui/components/LogisticsLedgerModal.tsx); [`src/simulation/inventory/InventoryLimits.ts`](src/simulation/inventory/InventoryLimits.ts); [`src/simulation/domains/CargoDomain.ts`](src/simulation/domains/CargoDomain.ts).

## 10. Basic angling: input-to-reward audit

Basic angling is a real-time skill interaction, not an instant “press E, get fish” roll.

1. **Find water and choose tackle.** Be on foot or aboard, not mounted or already fishing, with free hands, an allowed habitat, a viable local basic species, landing/storage feasibility, and sufficient Work. A basic fish can be caught without worms; bait is an improvement rather than a universal admission requirement.
2. **Prepare optionally.** Carry accessible Bait Worms and/or arm a Woven Lure. Arming a lure is reversible before use. The prepared lure is consumed for this cast and disarms; it is not a permanent buff.
3. **Charge and release.** A bouncing power meter is free to begin. Releasing commits the cast's Work and consumables. Power, rod, wind direction/strength, weather, time of day, and bait influence wait and cast presentation. The charge is not an endless increase: it reverses at its bounds.
4. **React to the bite.** The fish does not auto-hook. Press the hook action during the approximately 1.2–1.5-second reaction window. A late response or failed hook outcome escapes rather than granting an item.
5. **Control the bar.** Hold to lift the catch bar, release to let it fall. Keep the fish inside to raise catch progress; losing it reduces progress and breaks perfect status. Species use different movement behavior. Rod class and Fishing rank increase controllable bar height within bounds.
6. **Choose whether to chase treasure.** A cast has an authored 18% treasure-presence chance. Covering the treasure marker fills its separate progress. Moving away lets that progress decay; chasing it can sacrifice fish control. Treasure is secured only through the successful catch/collection path.
7. **Collect or manage the result.** At full catch progress, the result remains available for explicit collection. The reward commit checks fish and treasure capacity atomically. Full storage can be resolved by opening the satchel; an explicit discard abandons the waiting catch. Escape does not silently destroy a fish already caught.

Basic catch XP is 25 normally or 50 for perfect; the perfect rebate is 8 Work subject to earning rules. The minigame's quality determination considers cast power and perfect status plus RNG. For ordinary item fish, that quality is a record/result property, not a quality field on every item stack and not a permanent sale multiplier.

Golden Sea Bream is the exceptional basic species: successful collection creates a **physical fish cargo instance**. It needs a compatible landing destination and participates in freshness and hand-carry trade. The Sunreach main quest intentionally teaches this mixed basic-fishing/physical-logistics behavior.

### Failure and cancellation boundaries

Cancelling during free charge does not buy a cast. Cancelling an unfinished paid basic attempt is not a refund of the bait, lure, or Work. A full satchel must not consume a waiting catch or advance the reward RNG on each failed collect press. Escaped attempts can be dismissed and retried with the next cast's costs. Focus loss clears held input; it does not count as successfully tracking the fish.

The bar minigame integrates at a fixed 60 Hz. This is a determinism mechanism in code, not a claim that all devices actually render at 60 frames per second.

**Source owners:** [`src/simulation/domains/FishingDomain.ts`](src/simulation/domains/FishingDomain.ts); [`src/simulation/fishing/BasicFishingMinigame.ts`](src/simulation/fishing/BasicFishingMinigame.ts); [`src/input/InputRouter.ts`](src/input/InputRouter.ts); [`src/ui/GameUI.tsx`](src/ui/GameUI.tsx).

## 11. Sport fishing: schools, supplies, the fight, and landing

### Schools and preparation

Schools belong to authored world spawn points and ecology/habitat combinations. They expire, have finite catch potential, and participate in pressure/recovery rules. The inspected domain uses a 12 m school interaction reach, 3 base catch potential, a 180-game-minute base lifetime, and a 90-minute respawn cooldown; condition and tutorial paths can alter which school is present. Do not read the chart as a promise that a marker will still be active on arrival.

Approach a school, chum it, arm a Woven Lure, and hook. Admission checks active/remaining school state, reach and water continuity, feeding status, a prepared accessible lure, rod/habitat/species compatibility, sufficient Work, and a viable cargo destination **before** committing the encounter. Successful fishing is therefore gated by logistics before the fight, rather than letting any starter rod win an unstowable Marlin.

Chum chooses automatically from accessible inventory, **Deep first, then Rich, then Standard**. There is no explicit blend-selection action in the inspected surface. Standard feeds for 30 game minutes, Rich for 60, Deep for 45; Deep also weights sinker species. Chumming consumes an item but does not charge a farming/fishing Work cost. A school already feeding is not a valid repeated chum sink.

The first story expedition provisions a controlled Trout-school opportunity around the lake after commissioning the rowboat, so the tutorial is not entirely hostage to random weather/species availability. That teaching encounter has a calmer roughness cap; its visual weather label need not claim the weather itself changed.

### The fight's player controls

Reel with W/left mouse, slack with S/right mouse, brace with Space, and counter left/right runs with A/D or directional controls. Change drag between **Light, Balanced, and Heavy** through its control. The selection is player state, affects the active encounter, and remains the choice for later fishing. Gear effects are captured for the encounter; a gear preview cannot retroactively upgrade a hooked fish.

The HUD exposes tension, fish energy/endurance, distance, line condition, fish movement/behavior, and landing progress. Behaviors include rest, left/right runs, dive, surface, burst, and shake, with species-specific timing and cues. Reeling all the time is not the intended solution: excess tension damages line, slack must be managed, bracing and counter-steering change resistance/control, and recovery phases provide opportunities.

Landing is conditional: the fish must be tired, close enough, held at acceptable tension with line intact, and remain in the landing window for its required duration. Landing automatically creates and routes a physical catch to a compatible place. It is not a separate “win, then ignore all capacity limits” inventory pop-up.

### Wins, failures, and conservation

A landed fish grants its progression/record effects and a 12-Work rebate under the earning cap. Successful landing consumes a school's catch opportunity. A later release does not undo the catch, erase its journal entry, refund the lure, or restock the school.

A snapped line, escape, or an unexpected lack of landing space ends the attempt with the sport-loss path and a 60% refund of actual hook Work. The lure remains spent. There is no advertised general sport-cancel command in the player action switch; Pause can freeze the encounter but is not a fish-release or refund button.

**Quality caveat:** the sport domain rolls the fish/grade at hook creation. Unlike the basic minigame's perfect-result mechanism, the inspected sport path does not establish that a cleaner fight itself upgrades grade. Dialogue that teaches grade as the product of a clean fight should be reconciled with this implementation.

### Seasonal and local knowledge

A fish is weighted 1.0 in an authored peak season, 0.2 in an adjacent shoulder season, and 0 when its nearest peak is the opposite season. With multiple peaks, many species remain available all year at different weights. Time/weather matching is preferred; candidate construction can fall back to a seasonal habitat/ecology pool when the preferred intersection is empty. Tables of authored windows are **guidance, not a universal hard ban**.

Water-reading information can expose local likely species and increasingly detailed nearby feeding cues: Skilled Fishing begins broader detection, Expert supplies distance bands/habitat, and Master names more detail. Ground familiarity is derived from signature-species catch totals, with thresholds at 2, 6, and 12. These are inferred familiarity levels, not a separate player-spent skill-tree currency.

The query is read-only and should not spend Work or change encounter RNG. One world prompt incorrectly advertises R for this function; R's inspected input handler instead toggles a lure. See the audit finding before claiming a working dedicated Read Water shortcut.

**Source owners:** [`src/simulation/domains/FishingDomain.ts`](src/simulation/domains/FishingDomain.ts); [`src/content/fish.ts`](src/content/fish.ts); [`src/simulation/fishing/seasonalAvailability.ts`](src/simulation/fishing/seasonalAvailability.ts); [`src/content/rods.ts`](src/content/rods.ts); [`src/app/GameApp.ts`](src/app/GameApp.ts); [`src/input/InputRouter.ts`](src/input/InputRouter.ts).

## 12. Complete fish catalogue

There are **15 species**: **five basic-angling species**, of which Golden Sea Bream becomes physical cargo; **ten sport species**, all physical cargo. Thus four species normally become ordinary fish stacks and eleven become individual physical catches. “Base G” is a catalogue reference, not a guaranteed payout. Weight is minimum / average / maximum, in kg. The time/weather column lists authored preferences and must be read with the seasonal/fallback rules above.

| ID | Species | Catch lane | Ecology / habitat | Peak seasons | Preferred phase / weather | Minimum rod | Cargo | Weight kg | Base G |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fish.carp | Carp | Basic → stack | Neva river / lake | All | All phases; clear/cloudy/light rain/windy | Willow | Small | 2.5 / 5 / 12 | 35 |
| fish.perch | Perch | Basic → stack | Neva river | All | All phases; clear/cloudy/windy/light rain/fog | Willow | Small | 0.4 / 1 / 2.2 | 15 |
| fish.mackerel | Mackerel | Basic → stack | Neva coast | All | Dawn/day/dusk; clear/windy | Willow | Small | 0.5 / 1.2 / 2.8 | 18 |
| fish.sardine | Sunreach Sardine | Basic → stack | Sunreach coast | All | Dawn/day/dusk; clear/cloudy/windy | Willow | Small | 0.15 / 0.3 / 0.6 | 12 |
| fish.sea_bream | Golden Sea Bream | Basic → physical | Sunreach coast | All | Dawn/day/dusk; clear/cloudy/light rain | Willow | Small | 0.8 / 2.2 / 5.5 | 55 |
| fish.trout | Brook Trout | Sport → physical | Neva river / lake | All | Dawn/day/dusk; light rain/cloudy/fog | Willow | Small | 1.2 / 3.2 / 7.5 | 50 |
| fish.catfish | Channel Catfish | Sport → physical | Neva river / lake | Summer / autumn | Dusk/night/dawn; cloudy/heavy rain/storm | River | Medium | 4 / 10 / 28 | 75 |
| fish.pike | Northern Pike | Sport → physical | Neva lake | Autumn / winter / spring | Dawn/day; fog/cloudy/windy | River | Medium | 3 / 7 / 18 | 90 |
| fish.arowana | Golden Arowana | Sport → physical | Neva lake | Summer | Dusk/night; clear/fog | Heavy Sport | Medium | 4.5 / 8.5 / 16 | 220 |
| fish.tuna | Yellowfin Tuna | Sport → physical | Neva and Sunreach coast / offshore | Summer / autumn | Dawn/day/dusk; clear/windy/light rain | Heavy Sport | Medium | 15 / 35 / 80 | 160 |
| fish.sturgeon | Sturgeon | Sport → physical | Neva coast | Autumn / winter / spring | Night/dawn; fog/heavy rain | Heavy Sport | Large | 25 / 60 / 150 | 240 |
| fish.sailfish | Sailfish | Sport → physical | Neva and Sunreach offshore | Summer | Day/dusk; clear/windy | Offshore | Large | 20 / 45 / 95 | 280 |
| fish.swordfish | Swordfish | Sport → physical | Neva offshore | Autumn / winter | Dusk/night/dawn; storm/fog/windy | Offshore | Large | 30 / 75 / 180 | 340 |
| fish.blue_marlin | Blue Marlin | Sport → physical | Neva offshore | Summer / autumn | Dawn/day; clear/windy/storm | Master | Gargantuan | 60 / 140 / 320 | 480 |
| fish.amberjack | Greater Amberjack | Sport → physical | Sunreach coast / offshore | Summer / autumn | Dawn/day/dusk; clear/windy/light rain | Heavy Sport | Medium | 8 / 22 / 48 | 175 |

A species' anchor in a quest can be navigational guidance rather than the actual completion predicate. For example, a Swordfish objective can point at the trench while checking species plus Neva ecology, not a small trench polygon. Similarly, finishing a catch in a particular boat can satisfy more than one consecutive compatible objective if the quest event handler is authored to credit that event. Read the objective's `location` predicate, not only its prose or map pin.

**Source owners:** [`src/content/fish.ts`](src/content/fish.ts); [`src/content/quests.ts`](src/content/quests.ts); [`src/simulation/domains/FishingDomain.ts`](src/simulation/domains/FishingDomain.ts); [`src/simulation/fishing/seasonalAvailability.ts`](src/simulation/fishing/seasonalAvailability.ts).

## 13. Physical catches, cargo, preservation, and disposal

A physical catch is an individual object, not an inventory stack. It carries a species ID, unique cargo ID, weight, grade, freshness, catch time, and a location pointer. Its ownership must agree with the player's carried-catch pointer, a vessel's slot pointer, or a carriage-slot pointer. This distinction is essential to selling, contracts, capacity, and save correctness.

### Every cargo interaction

| Action | How it works | Conditions / consequences |
| --- | --- | --- |
| Land a physical fish | The simulation chooses a compatible empty slot in the active boat; otherwise eligible small/medium fish can be carried in free hands. | The capture must have a legal landing destination. Large and gargantuan catches need an appropriate vessel slot at landing. |
| Inspect the catch | Read species, grade, weight, freshness, location, and applicable actions in the catch/hold presentation. | Information does not itself sell, move, or preserve the fish. |
| Collect a pack from a boat | Use the nearby cargo interaction to move one accessible catch into the player’s hands. | Must be on foot with free hands and within the relevant access conditions. The pickup path does not impose the small/medium landing limit, allowing large landed catches to be carried inland. |
| Carry a pack inland | Walk with the single carried slot, or ride the donkey with that pack on the player. | On-foot load penalties and mounted interaction restrictions differ. Satchel capacity is separate; freshness keeps falling. |
| Sell a trade pack | Present the carried catch at the Village Produce Market’s Trade packs counter. | An eligible boat hold is not enough: the normal sale requires the individual pack in hand. The harbor is not the normal physical-pack sales counter. |
| Deliver against a contract | Present accessible qualifying cargo at the order’s listed delivery market. | This separate lane can accept physical fish at the harbor or Sunreach Cove. Species, quality, freshness, and weight requirements must all be met by the same fish. |
| Release a catch | Release accessible, still-fresh physical cargo. | Clears its ownership pointers. No sale proceeds or replacement catch. Existing journal records and the encounter’s consumed inputs are not undone. |
| Discard / break down cargo | Remove accessible cargo through the discard/processing action. | Fresh cargo can produce class-dependent fish scraps and needs room for those outputs. Spoiled cargo can still be cleared when the satchel is full; do not assume by-products in that case. |
| Move ordinary supplies | Use Hold & Stores to Stow or Take stackable goods. | This moves item inventory, not a physical fish into an arbitrary slot. |
| Load the carriage | At the parked carriage's rear, move a carried small/medium catch into its first free slot. | Two slots; correct position/mode, compatible size and a valid carried pointer are required. No Work charge or automatic sale. |
| Unload the carriage | At the rear with free hands, collect an available stored catch. | Clear its cart slot and set the same cargo as carried. Freshness and grade do not reset. |
| Manually restow into a boat / rearrange slots | No normal manual **boat** restow or arbitrary slot-rearrangement command was established. | Cart loading is a real separate command; it does not create a boat-restow interface. |

### Freshness is an actual transport cost

For each elapsed segment, the source calculates:

```text
freshness loss = elapsed game minutes
               × species base decay per minute
               × storage multiplier
               × max(0.6, ambient temperature °C / 20)
```

The temperature is sampled at the cargo's actual holder, not necessarily at the player. Decay starts no earlier than its catch time and also runs during offline catch-up. Ordinary Carp, Perch, Mackerel, and Sardine stacks do not carry these per-fish freshness fields.

| Storage condition | Decay multiplier | Player-facing qualification |
| --- | --- | --- |
| Loose ice or authored built-in ice | 0.40 | Overrides the usual player/boat location rate while effective. |
| Carried in hands | 1.00 | Loose ice in the satchel can cool the carried fish. |
| Uniced boat hold | 0.80 | Boat-supply ice takes priority; the active boat may use the aboard player’s satchel ice as fallback. |
| Uniced external boat hook | 1.00 | External hooks are not automatically insulated. |
| Carriage bed | 1.00 | Exposed physical cargo uses the cart location’s temperature. No carriage ice-supply inventory or cooling source is established. |
| Cold-storage type | 0.15 | A supported storage type, not proof of an obtainable, player-built cold store. |
| Crate type | 0.90 | A supported cargo location, not an established player crate-placement loop. |

The skiff's two authored iced hold slots provide built-in cooling without consuming loose ice. Loose ice is billed at game-hour boundaries: **one ice item per inventory that supplied cooling**, covering the catches cooled by that inventory, rather than one item per fish. Boat supply ice cannot cool an unrelated vessel on the other side of the world. Moving away from a boat can end its fallback access to the player's ice.

Ice slows loss; it does not restore freshness. A fish is not made fresh again by moving it to a better slot. There is no established ice-making recipe in the current processing catalogue.

| Freshness at sale | Price multiplier |
| --- | --- |
| 90–100% | 1.0 |
| 75–<90% | 0.95 |
| 50–<75% | 0.8 |
| 25–<50% | 0.55 |
| Greater than 0–<25% | 0.3 |
| 0% or less | 0.0 |

The current helper preserves the 0.3 factor for **0 < freshness < 1**; zero or negative is spoiled. The first master’s below-1%-is-worthless statement has therefore been corrected. This factor alone does not guarantee an accepted sale: location, cargo lane, other price terms and integer settlement still matter. Contract freshness floors are separate and usually much stricter. Salt-Cured Fish is a processed stack, not a physical catch whose freshness has merely been reset.

**Source owners:** [`src/simulation/domains/CargoDomain.ts`](src/simulation/domains/CargoDomain.ts); [`src/simulation/domains/NavigationDomain.ts`](src/simulation/domains/NavigationDomain.ts); [`src/simulation/domains/MarketDomain.ts`](src/simulation/domains/MarketDomain.ts); [`src/simulation/domains/ContractDomain.ts`](src/simulation/domains/ContractDomain.ts); [`src/simulation/fishing/calculateFreshness.ts`](src/simulation/fishing/calculateFreshness.ts); [`src/ui/components/LogisticsLedgerModal.tsx`](src/ui/components/LogisticsLedgerModal.tsx).

## 14. Walking, riding, boats, fuel, and recovery

### Walking and world access

Movement, jumping, sprinting, camera orbit, and camera zoom are different from a gameplay interaction. Terrain and collision rules constrain where the avatar can stand. Doors and authored entrances route the player into or out of the supported interior space; this is not permission to enter every rendered building. Farmhouse rest and workstations are functional uses of the environment. Shoreline/water classification determines walking and sailing validity, and not every visually wet point is a legal fishing or mooring point.

### Player traversal and carrying

Base on-foot walking is 2.0 m/s and sprinting 5.2 m/s, before acceleration, terrain, collision and load effects. The human sprint meter has maximum 100; sprint drain is 22/s, recovery 30/s after a 0.65-second delay, and recovery to 18 permits sprint after exhaustion. These are not Work costs. Jump buffering is 0.12 s with a 0.10 s coyote-time window; it forgives input timing, not otherwise forbidden travel. Mounted characters cannot use normal foot jumping.

| Carried fish class | On-foot speed multiplier | Slowdown |
| --- | --- | --- |
| Small | 0.92 | 8% |
| Medium | 0.84 | 16% |
| Large | 0.72 | 28% |
| Gargantuan | 0.60 | 40% |

The multiplier affects walking and sprinting, not ordinary satchel stacks. A pack stays physical while riding the donkey, but donkey travel does not use the on-foot cargo slowdown. Slope/collision and animal stamina still matter. No swimming, unrestricted climbing or fall-death economy should be inferred merely from gravity and ground support.

### The donkey

Approach the inherited donkey grounded on valid dry terrain, within its boarding range, with no conflicting mounted/boat/fishing state, and press E. **A carried fish is allowed on the donkey.** It remains the player's single carried fish, not a new saddlebag item. This supersedes the first master's blanket free-hands requirement for riding and establishes an actual inland freight use.

Move relative to the camera; full keyboard movement requests a trot, while lower analog movement can walk. Shift requests a limited gallop using the donkey’s own stamina, not player sprint stamina or Work. E dismounts only when there is a valid nearby landing position. A mounted player’s contextual world action is dismount: crops, stations, NPC conversation, market interaction, doors and fishing cannot be operated as though still on foot. Interiors, water and unsupported pier/stair ground remain invalid mount travel. There is no mount purchase, breeding, feeding or saddlebag system established.

### Horse carriage: complete inland freight loop

The inherited `mount.horse_carriage_starter` (`mount.horse_carriage`) starts by the farm with two empty cargo slots and a full animal movement budget. The driver’s bench and cargo-loading rear are **different physical access points**; approaching the horse or cart center does not substitute for both.

| Player interaction | Admission / input | Mutation, feedback, and limits |
| --- | --- | --- |
| Board the bench | Approach on foot on valid ground, within 2.2 m of the bench; E. | Enter mounted mode. A carried fish must first be loaded; boarding the carriage while carrying is refused. |
| Drive / steer | W/S forward/reverse, A/D steering relative to the vehicle. | Movement is not camera-relative like donkey travel. Acceleration/braking, vehicle footprint and ground validity matter. |
| Trot | Hold Shift while moving. | Walk/trot tuning is 1.6/3.2 m/s. Animal budget is 100, fast-gait drain 10/s, recovery 20/s after 1 s, resume threshold 25. Not motor fuel or Work. |
| Turn or reverse | Use vehicle steering and directional movement. | The horse, shafts and bed occupy space; turns cannot be evaluated as point-sized player movement. Blocking terrain or a failed sweep stops the move. |
| Dismount | E with a safe exit position. | Return to on-foot; cart and stored fish remain at the parked position. |
| Load a pack | Stand at the rear with a carried small/medium catch, grounded, not aboard/mounted/fishing. | `cargo.load-carriage` takes the first free of two slots and clears the carried pointer. No Work or payment. |
| Try loading beyond limits | Carry large/gargantuan fish, or try when both slots are full. | Refuse without deleting/replacing the fish or changing its original owner. |
| Collect a stored pack | Stand at the rear with free hands; E. | `cargo.pickup` clears that slot and restores the same cargo to the player's carry attachment. |
| Sell after driving | Park near the appropriate counter, dismount and unload one fish. | Village ordinary pack sale still requires the exact fish in hand at its counter. Cart proximity is not bulk-sale permission. |
| Save / continue | Save a parked/ridden cart with its real ownership and cargo links. | Preserve position, animal budget and cargo links. This does not create an offline courier job. |

The cart accepts **small and medium only**. A large fish can be picked up after a boat landing without becoming small enough for the cart. Such a pack and a donkey ride follow different rules. Cart ground checks exclude water, interiors, pier decks/stairs and slopes beyond its 30-degree criterion. No boat-loading-carriage, repair, cart upgrade, animal food, insurance or hire service is established.

Stored cart fish remain exposed at a 1.0 storage decay multiplier, using temperature at the cart's location; nearby player ice does not supply a nonexistent cart ice inventory. The world bench/rear prompts show occupancy, but **Hold & Stores vessel totals and tabs do not enumerate the carriage**. A boat supply transfer is never the way to move those fish.

**Land-transport owners:** [`src/simulation/navigation/PlayerTraversal.ts`](src/simulation/navigation/PlayerTraversal.ts); [`src/simulation/mounts/Mounts.ts`](src/simulation/mounts/Mounts.ts); [`src/simulation/mounts/Carriage.ts`](src/simulation/mounts/Carriage.ts); [`src/physics/PhysicsWorld.ts`](src/physics/PhysicsWorld.ts); [`src/simulation/domains/CargoDomain.ts`](src/simulation/domains/CargoDomain.ts).

### Vessel catalogue

| Property | Inherited rowboat | Motor fishing skiff |
| --- | --- | --- |
| Type / player instance | Rowboat / `boat.player_rowboat` | Skiff / `boat.player_skiff` |
| How acquired | Exists initially, but must be commissioned through Old Silas’s story. | Purchase at the harbor skiff mooring. |
| Actual acquisition cost | 30 G + 1 Ground Grain at the quest turn-in. The catalogue’s 150 G is not the implemented commissioning price. | 850 G; requires 7,500 Fishing XP and valid purchase conditions. |
| Maximum catalogue speed | 4.5 m/s | 8.5 m/s |
| Physical fish slots | 2: one small-compatible slot, one medium-compatible slot. | 6: four medium-compatible holds and two external hooks accepting up to gargantuan cargo. |
| Built-in cooling | None. | Two of the four hold slots have built-in ice. |
| Supply inventory | 4 slots | 8 slots |
| Hull capacity | 100 | 250 |
| Fuel | Manual propulsion; no motor-fuel cost. | 100-unit fuel tank; acquired filled. |
| Authored safe-sea value | 0.35 | 0.75 |
| Cross-channel role | Not the vessel required for the Sunreach progression route. | The required cross-channel vessel; supports large offshore catches and the Sunreach journey. |

Hull and safe-sea values are authored properties and displayed state. This audit does not infer a complete damage, sinking, insurance, repair, or modular ship-upgrade loop from them. There is no repair command in the inspected normal command set.

### All navigation interactions

| Interaction | Requirements / behavior | What it does not do |
| --- | --- | --- |
| Board a boat | Approach an eligible owned/unlocked vessel; validate mode and proximity. | The rowboat’s mere presence does not bypass its story gate. |
| Drive / steer | Use boat movement inputs; speed and steering interact with vessel configuration and physical constraints. | Does not automatically navigate to a chart pin. |
| Dock / disembark | Use an appropriate mooring while within its conditions; the player is placed at its safe landing. | Not arbitrary beach teleportation at every shoreline coordinate. |
| Inspect vessel / hold | Read slot occupancy, condition, supplies, fuel, and related status. | Reading a remote vessel does not make its goods transferable. |
| Purchase skiff | Be at the harbor purchase service, have sufficient money and Fishing XP, and not already own it. | No recurring rental and no new rowboat purchase implied. |
| Refuel | Consume one Engine Fuel from the player’s satchel while appropriately near or aboard the vessel. | Fuel stored in the boat must first be taken into the satchel for this path; a full tank or manual boat is not a valid refuel target. |
| Stow supplies | Move the displayed item-row quantity from satchel to the accessible vessel’s finite supply inventory. | Does not load physical fish, add cargo slots, or ignore item stack limits. |
| Take supplies | Move the displayed item-row quantity back into the satchel. | Refuses when inaccessible or when destination capacity is insufficient. |
| Emergency Tow | While aboard an eligible motor vessel with empty fuel and at least 25 G, pay for a tow to a compatible mooring. | Not a free universal rescue for any position or boat state. |
| Safe Return | Invoke recovery under its mode/cargo restrictions. | Refuses a carried physical fish even on foot and refuses a loaded active boat. Not a freight teleport. |

### Fuel details

A moving motorboat drains fuel according to elapsed game minutes and its current speed ratio: the inspected rate is `0.4 × speed ratio` fuel units per game minute. Near-stationary movement below the guard does not drain as propulsion. Manual vessels do not use fuel. Refuelling with one Engine Fuel tops up the tank; it is not a one-unit increment. Spending a can on a nearly full tank therefore has a different economic value from using it when empty.

### Emergency recovery is not one uniform operation

**Emergency Tow** charges 25 G, preserves cargo, leaves fuel empty, returns the eligible vessel to a compatible mooring, and disembarks the player. It does not simulate a paid passage or refill the tank. The Pause menu exposes the request and reports a reason when the domain refuses it.

**Safe Return** refuses while mounted and checks **any carried physical fish before the active-boat branch**, so an on-foot pack also blocks recovery. A loaded active boat blocks it; an eligible empty boat returns to a compatible serviced mooring before player recovery. The player recovers to an appropriate point, including Sunreach rather than always the Starter Garden; money and progression are not reset.

The older on-foot cargo shortcut and Starter-Garden-only confirmation have been corrected upstream. Current confirmation says “Return to safety?”, includes Starter Garden/Sunreach alternatives, and states the physical-cargo restriction. A01 and A11 remain in the register as **resolved-in-source historical findings**, not current defects. Both islands and loaded/empty states still require runtime regression: a source fix is not a browser pass.

**Source owners:** [`src/content/boats.ts`](src/content/boats.ts); [`src/simulation/domains/NavigationDomain.ts`](src/simulation/domains/NavigationDomain.ts); [`src/app/GameApp.ts`](src/app/GameApp.ts); [`src/ui/EscapeMenuModal.tsx`](src/ui/EscapeMenuModal.tsx); [`src/ui/components/MaritimeVesselConsole.tsx`](src/ui/components/MaritimeVesselConsole.tsx); [`src/ui/components/LogisticsLedgerModal.tsx`](src/ui/components/LogisticsLedgerModal.tsx); [`src/world/WorldGameplayLocations.ts`](src/world/WorldGameplayLocations.ts).

## 15. Markets, trade decisions, and every order type

### Three market identities

| Market | What the player buys there | What the player sells / delivers there |
| --- | --- | --- |
| Village Produce Market — `market.village` | Eight Neva seed types; fertilizer, compost starter, Flax, hardwood, leather, steel, and linen supplies. | Accepted crops/materials/meals/preserved goods; normal physical-fish trade packs carried in hand; village-destination orders. |
| Harbor Fish Market & Wholesaler — `market.harbor` | Worms, Woven Lure, standard Chum, ice, fuel, fish scraps, copper, brass, oiled canvas; River, Heavy Sport, Offshore, and Master rods. | Ordinary fish stacks and accepted fishing/processing goods; qualifying physical fish against harbor-destination contracts. Not normal sport-pack sales. |
| Sunreach Cove Market — `market.sunreach_cove` | Sunflower seeds, Olive saplings, worms, ice, fuel, and the Heavy Sport rod. | Accepted cove/terrace goods and listed Sunreach contracts; no implication that every item in the world can be bought here. |

A market's **commodity list** says what can be quoted/traded; its **retail list** says what can be purchased. These are not interchangeable. A commodity row for a physical fish can support contract valuation without allowing a normal physical-pack sale at that stall. A crafted item can be sellable without being on the retail shelf.

### Every market transaction

| Action | Effect | Binding checks |
| --- | --- | --- |
| Inspect a buy/sell quote | Shows item, quantity, total, unit/average price, demand, owned count, stock where tracked, and affordability. | Must inspect the appropriate stall/intent; quoted quantity must be valid. |
| Buy seeds | Adds a seed stack and spends the quoted gold. | Crop XP, retailer availability, finite tracked stock where present, funds, positive whole quantity, and satchel room. |
| Buy supplies | Adds the retail item and spends gold. | Retail list, stock where tracked, funds, quantity, proximity, and satchel room. |
| Buy a rod | Spends fixed rod price, adds permanent ownership, and equips it. | Previous rod owned, required Fishing XP, correct seller, equipment-change eligibility, money, and not already owned. |
| Re-equip owned tackle at a stall | Changes to an owned rod. | The stall must sell tackle, but need not stock that exact owned rod; this allows re-equipping the unsold starter Willow. |
| Sell an ordinary item stack | Removes the stack quantity, grants quote revenue and Trading XP, and increases local supply. | Correct market, accepted item, positive whole quantity, sufficient satchel count. |
| Sell bulk produce | Atomically sells eligible accepted produce/grain rows and grants their quoted revenue. | Only category `produce` or `grain`; Flax and Ground Grain are excluded by category. No automatic quest-reservation rule was established. |
| Inspect / sell a trade pack | Values actual individual weight, grade, freshness, demand, and season; removes the carried fish on sale. | Village counter only; actual player-carried pointer; fresh/payable cargo. |
| Generic fish sale / bulk fish sale | Compatibility paths for eligible non-trade-pack cargo. | They explicitly exclude physical trade-pack species. Do not promise an active “sell the whole sport hold” feature from these handlers. |
| Deliver contract goods | Consumes required items/cargo and advances the selected order. | Separate from selling: order destination and qualifying goods; no simultaneous ordinary-sale proceeds. |
| Inspect demand / trend | Read current pressure and a seeded multi-day trend. | A planning query, not guaranteed future market prices or an automatic profitable-trade recommendation. |

### Pricing and market memory

Stack sales settle at their displayed quote; ordinary fish stacks have no per-instance grade premium. The best fish ever recorded in the journal does not permanently multiply all later stack sales. Physical catches instead use the individual catch's weight, quality, and freshness.

Trading changes local supply, and supply is consumed/replenished through market updates. Seasonal factors and seeded daily demand variation influence quotes. Bulk quotes account for quantity moving supply; they are not safely modelled as an unchanging first-unit price multiplied by unlimited quantity. Retail markups and a best-wholesale comparison prevent a simple buy-and-immediately-resell profit loop, including workshop supply pricing.

A demand-trend chart holds current stock fixed while projecting the daily component. It does **not** predict future player sales, stock depletion, or every weather/progression effect. Stack-sale Trading XP is `floor(revenue × 0.10)` and individual cargo-sale Trading XP uses `floor(revenue × 0.15)` in the inspected domain.

### Orders are posted active—not accepted from an infinite list

The board maintains a limited set of active orders. There is no separate contract-accept command. The baseline is three slots; Artisan Trading adds a fourth, and the maritime charter adds one further slot. Available templates are filtered by skill, destination access, relevant crop/seed attainability, current tackle and seasonal fish feasibility, and cargo capacity. A template's listed XP floor is not its only practical gate.

The board favors an order kind currently requested by an open story step, choosing a gentler feasible version rather than deliberately requiring an extreme trophy. It also aims to maintain usable produce/fishing choices. A player may **Pass** an untouched order and immediately obtain a replacement that is not the template just passed. An order with a partial delivery cannot be passed.

Deliveries can be partial. The full reward arrives only once the required total has been delivered. A physical fish must satisfy all its order's conditions simultaneously. Order delivery removes goods; it does not leave them available for another contract or sale. The destination can be the harbor or cove even when that fish's ordinary sale destination is inland.

Expired partial produce is returned to the satchel when it fits; otherwise the source refunds reference value in gold. Delivered physical fish cannot be recreated with their exact identity and instead receive the reference-value settlement. Expiry is not successful completion and does not grant its normal completion XP. Only a limited tail of twenty settled orders is retained in state.

### Complete contract-template catalogue

`XP floor` is in the named reward skill; ordinary crop/rod/route gates still apply. Durations are **game minutes**, not real minutes. `×` is the reference-value reward multiplier, not a promise relative to the best live market quote. Prefix every short ID below with `contract.`. H = Harbor; V = Village; C = Sunreach Cove. A dash means no extra authored condition in that column.

| Template | Type | Target | Quantity | Minutes | × | XP floor | Grade ≥ | Freshness ≥ | Weight floor roll | Market |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| wheat_supply | Produce | Wheat | 6–12 | 720 | 1.35 | Farming 0 | — | — | — | V |
| summer_tomatoes | Produce | Tomato | 5–10 | 960 | 1.50 | Farming 1,000 | — | — | — | V |
| fresh_trout_order | Fresh fish | Trout | 2–4 | 480 | 1.60 | Fishing 0 | — | 80% | — | H |
| tuna_expedition | Fresh fish | Tuna | 2–3 | 1440 | 1.75 | Trading 3,000 | Fine | 75% | — | H |
| blue_marlin_trophy | Quality | Blue Marlin | 1 | 2880 | 2.50 | Fishing 15,000 | Exceptional | 70% | 120–250 kg | H |
| potato_cellar | Produce | Potato | 8–14 | 720 | 1.30 | Farming 0 | — | — | — | V |
| carrot_crates | Produce | Carrot | 6–10 | 720 | 1.40 | Farming 200 | — | — | — | V |
| barley_run | Produce | Barley | 6–12 | 960 | 1.40 | Farming 500 | — | — | — | V |
| corn_delivery | Produce | Corn | 5–9 | 960 | 1.50 | Farming 1,000 | — | — | — | V |
| flax_bolts | Produce | Flax | 4–8 | 1440 | 1.60 | Farming 3,000 | — | — | — | V |
| orchard_apples | Produce | Apple | 5–9 | 1440 | 1.60 | Farming 7,500 | — | — | — | V |
| bulk_grain_order | Bulk | Wheat | 20–30 | 2880 | 1.55 | Trading 1,000 | — | — | — | V |
| bulk_root_order | Bulk | Potato | 18–26 | 2880 | 1.50 | Trading 1,000 | — | — | — | V |
| bulk_cove_greens | Bulk; cross-channel | Tomato | 16–24 | 2880 | 1.70 | Trading 3,000 | — | — | — | C |
| catfish_night_order | Fresh fish | Catfish | 2–4 | 720 | 1.60 | Fishing 1,000 | — | 75% | — | H |
| pike_autumn_order | Fresh fish | Pike | 2–3 | 960 | 1.65 | Fishing 1,500 | — | 75% | — | H |
| arowana_commission | Quality | Arowana | 1–2 | 1440 | 1.90 | Fishing 3,000 | Fine | 80% | — | H |
| sturgeon_reserve | Quality | Sturgeon | 1–2 | 1440 | 1.95 | Fishing 7,500 | Fine | 70% | — | H |
| sailfish_charter | Quality | Sailfish | 1–2 | 2880 | 2.10 | Fishing 15,000 | Fine | 70% | — | H |
| swordfish_winter_order | Fresh fish | Swordfish | 1–2 | 2880 | 2.00 | Trading 15,000 | — | 70% | — | H |
| cove_tuna_run | Fresh fish | Tuna | 1–2 | 960 | 1.80 | Fishing 6,000 | — | 80% | — | C |
| cove_sailfish_prize | Quality | Sailfish | 1 | 2880 | 2.40 | Fishing 30,000 | Exceptional | 70% | — | C |
| sunreach_olive_delivery | Produce; cross-channel | Olive | 6–10 | 1440 | 1.75 | Trading 3,000 | — | — | — | V |
| sunreach_reef_fish_order | Fresh fish | Sea Bream or Amberjack | 1–2 | 960 | 1.70 | Fishing 3,000 | — | 80% | — | C |
| pike_trophy_order | Quality | Pike | 1 | 1440 | 2.00 | Fishing 3,000 | Exceptional | 70% | 12–16 kg | H |
| swordfish_trophy | Quality | Swordfish | 1 | 2880 | 2.30 | Fishing 30,000 | Exceptional | 75% | — | H |
| arowana_summer_prize | Quality | Arowana | 1 | 2880 | 2.20 | Fishing 7,500 | Exceptional | 75% | — | H |
| trout_first_light | Fresh fish | Trout | 2–3 | 480 | 1.80 | Fishing 1,000 | — | 90% | — | H |

The Blue Marlin template's 15,000 Fishing XP floor does not grant access to the Master rod: that rod's 60,000 XP gate still controls real feasibility. Cross-channel quest completion uses the authored `cross-channel` tag, not just any produce delivery. Generated completion XP is generally `max(50, required quantity × 25)` in the template's reward skill; the explicitly authored starting order has its own values.

**Source owners:** [`src/content/markets.ts`](src/content/markets.ts); [`src/content/contracts.ts`](src/content/contracts.ts); [`src/simulation/domains/MarketDomain.ts`](src/simulation/domains/MarketDomain.ts); [`src/simulation/domains/ContractDomain.ts`](src/simulation/domains/ContractDomain.ts); [`src/content/progression.ts`](src/content/progression.ts).

## 16. Complete narrative and quest-interaction catalogue

There are **four concurrent quest tracks containing 45 authored quests**: a 28-quest main spine across ten acts, seven Reading the Water quests, five Commons/homestead quests, and five Freight and Favour quests. These are not 45 simultaneously available quests, and a quest can contain several separately counted objectives.

The main spine teaches and unlocks the economy. Parallel tracks provide longer farming, fishing, and delivery goals. Focusing a track changes what is emphasized in the HUD; it does not delete other tracks or choose an exclusive story branch.

### Quest interaction rules

Talk to an eligible NPC at their current usable position. The conversation resolver chooses relevant introduction, objective dialogue, completion, herald, recognition, or idle segments. A ready objective does not mean the reward was already collected. Turn-in costs and reward capacity are checked when the conversation settles the quest. Closing the visual dialogue is not a rollback: the source invokes the talk command when the conversation resolves, not only when the final page is read.

Rewards can grant money, item stacks, profession XP, feature unlocks, and knowledge. A full satchel can block an item-reward hand-in rather than silently destroy the items. Some early objectives explicitly accept earlier qualifying work. Most future objectives do not retroactively consume the entire journal as proof of completion. Location predicates can specify a farm, station, habitat, boat, or ecology; the decorative navigation anchor is not always the predicate itself.

The story uses authored NPC schedules and quest-aware availability. A player should follow the active marker/current position, not assume every character permanently remains at the coordinate printed in an old guide. The journal preserves the current brief and completion summaries, and the HUD can focus an open track.

### Early-action credit, objective units, and owned unlocks

The early-work ledger is not a generic history of every useful action. Only opted-in main-track **plant, water, harvest and recipe-collection** objectives with declared locations can bank qualifying actions. Live credit and redemption share the same target/location predicate. An event is banked only when no active track credited it, preventing one action from being spent now and banked again. The bounded ledger holds at most 16 records and 64 quantity per record, also limited by the future objective's need. Redemption happens after the preceding step's progress is cleared; records no remaining objective watches are pruned and saved credits are reconciled on load.

This lets early watering during a sowing lesson count later without forcing the already-wet crop to dry before the tutorial can continue. It does not turn unrelated water/plant actions on another farm into valid credit. Most later tasks do not use this exception. Ahead-of-current-step notification is different from granting progress.

Counters also use distinct units. A harvesting objective counts **harvest actions**, not all produce units yielded by one plant. Recipe objectives count **collected batches**, not each worm or lure emitted by a batch. A started-but-uncollected job has not met collection credit. Sales/deliveries use their appropriate quantity events, and fish events identify individual catches.

Acquisition objectives have a different reconciliation path: already owning the **specific target** rod or boat, or the relevant irrigation feature, can satisfy an applicable newly active acquisition objective. A unique object need not be purchased twice. An unrelated or merely visually superior item is not the same target. Reconciliation must not replay rewards from a previously settled quest.

### Multi-thread conversations, payments, and finding NPCs

One talk can assemble several ordered segments: close eligible errands, speak the actual talk objective, introduce a newly begun errand, or offer a bounded reminder/recognition. Main-story ordering and parallel threads remain distinct. The generic `NpcTalked` event is not permission to complete every active track's talk objective; only the objectives whose dialogue was actually delivered should be credited.

A paid errand is not charged in the same breath that first asks for its cost. The player hears the request, leaves, and chooses to return. If costs or reward capacity block a settlement, the quest remains incomplete and a refusal can accompany the repeated ask. Rereading pages cannot claim the reward again. Ordered landing and boat-stow events can legitimately advance adjacent objectives without making the same counter accept duplicate variants of one event.

The shared `npcAnchorAt` resolves day-phase schedules with a role-anchor fallback. When a final **non-talk** objective was earned away from the speaker and is ready for hand-in, the quest-aware rule holds that speaker at the role anchor named for returning work. Renderer, proximity and target marker must use the same result. This protects a return to Barnaby's bench from an unrelated scheduled stop.

Talking requires 3.5 m proximity; nearby barks use an 8 m range. Barks can beckon for an actionable hand-in/talk or recognize earned quests, knowledge, features and proficiency. A herald alone is not a reason to beckon indefinitely. Barks yield to panels; the person just spoken to is suppressed for 30 seconds after conversation closes. Hearing a bark awards no quest progress or friendship points. Recognition is not a hidden gift, relationship-score or romance system.

**Additional narrative owners:** [`src/simulation/domains/QuestDomain.ts`](src/simulation/domains/QuestDomain.ts); [`src/simulation/core/QuestTypes.ts`](src/simulation/core/QuestTypes.ts); [`src/simulation/presentation/NpcPresentation.ts`](src/simulation/presentation/NpcPresentation.ts); [`src/app/GameApp.ts`](src/app/GameApp.ts).

### Main spine: all 28 quests

Prefix the short IDs with `quest.`. Rewards below use Fm = Farming, Fi = Fishing, Pr = Processing, Tr = Trading. Every XP number is an award, not an entry requirement. Objectives are listed in authored order; normal world requirements still apply.

| Quest ID | Act / title | Speaker | What the player does | Reward / unlocked consequence |
| --- | --- | --- | --- | --- |
| act1_welcome | 1 · The Inherited Soil | Elspeth | Speak with Elspeth. | 6 Wheat Seeds; Fm 100. |
| act1_sow_wheat | 1 · Sowing the First Furrows | Elspeth | Plant 3 Wheat in the Starter Garden; opted-in early credit. | 25 G; Fm 200. |
| act1_water_crops | 1 · Morning Dew & Moisture | Elspeth | Water 3 qualifying starter crops; opted-in early credit. | 35 G; Fm 300. |
| act2_harvest_and_compost | 2 · The Cycle of the Soil | Barnaby | Harvest 3 starter Wheat crop instances; complete/collect the first qualifying starter compost run. | 6 Bait Worms; Fm 200; Pr 150; Worm Composting knowledge. |
| act2_mill_and_craft_chum | 2 · Milling & Mixing Chum | Barnaby | Mill Wheat at the Village Mill (`struct.starter_mill`); craft Chum at the starter workbench. | 50 G; 4 Bait Worms; Pr 350; Wheat Milling knowledge. |
| act3_river_angler | 3 · Reading the Currents | Old Silas | Land 2 basic river catches. | 6 Wheat Seeds; Fi 400. |
| act3_market_intro | 3 · Fair Trade at the Village | Elspeth | Sell an item at the Village Produce Market. | 75 G; Tr 300. |
| act4_harbor_journey | 4 · Journey to the Salt | Maeve | Go to the harbor and speak with Maeve. | 40 G; Tr 200. |
| act4_restore_rowboat | 4 · Commissioning the Old Rowboat | Old Silas | Speak/settle commissioning; hand over 30 G and 1 Ground Grain. | 2 Woven Lures; Fi 350; rowboat access; Family Slip knowledge. |
| act5_maiden_voyage | 5 · The Call of the Deep | Old Silas | Board the rowboat; chum a lake school; hook, land, and stow a sport catch; return/dock; carry and sell a pack at Village; report. | 250 G; Fi 1,000; Tr 600; Fm 400; Expedition Board. |
| act6_harbor_promise | 6 · A Promise Made at the Board | Maeve | Complete a contract. | 150 G; 3 Fish Scraps; Tr 450; Fi 300. |
| act6_field_pump | 6 · Water Where It Matters | Barnaby | Install the 120 G field pump and irrigate the Starter Garden. | Fm 550. |
| act6_land_sea_cycle | 6 · The Land-Sea Cycle | Barnaby | Make fertilizer at the harbor fish table; apply it to the starter field. | Fm 650; Pr 450; Fi 350; Land-Sea Cycle knowledge. |
| act7_open_channel | 7 · Across the Open Channel | Tomas; herald via Silas | Own and board the skiff; cross, dock at Sunreach, and meet Tomas. | 6 Sunflower Seeds; Tr 500; Fi 500. |
| act7_terraces_for_the_sun | 7 · Terraces for the Sun | Ines | Meet Ines; plant 3 Sunflowers on the terraces; water 3; harvest a qualifying crop. | 1 Olive Sapling; Fm 800. |
| act7_seed_for_the_sea | 7 · Seed for the Sea | Tomas | Mill Sunflower harvest at the Sunreach mill; make Chum at its workbench. | 6 Bait Worms; Pr 700. |
| act7_reef_answer | 7 · The Reef’s Answer | Tomas | Chum in Sunreach; basic-catch Golden Sea Bream there and aboard the skiff as requested; carry/sell the physical pack at Village. | 240 G; Fi 900; Tr 500. |
| act7_land_sea_cycle | 7 · The Sunreach Land-Sea Cycle | Ines | Catch 2 Sunreach Sardines; make local fertilizer; fertilize the terraces; report. | 300 G; Fm 900; Pr 650. |
| act8_dry_season | 8 · What the Terraces Drink | Ines | Plant 2 Sunflowers and use terrace irrigation/cistern. | 120 G; Fm 700. |
| act8_southern_shelf | 8 · The Southern Shelf | Tomas | Land a Sunreach Amberjack. | 200 G; Fi 900. |
| act8_salt_and_shade | 8 · Salt and Shade | Ines | Catch 2 Sardines and collect Salt-Cured Fish from the Sunreach fish table. | 180 G; Pr 900; Fi 300; Salt and Shade knowledge. |
| act8_route_worth_keeping | 8 · A Route Worth Keeping | Tomas | Sell Salt-Cured Fish at Village. | 240 G; Tr 1,000. |
| act8_dry_season_end | 8 · The Dry Season’s End | Ines | Return and speak with Ines. | 300 G; Fm 600; Tr 600. |
| act9_beyond_the_grounds | 9 · Beyond the Grounds | Old Silas; herald via Ines | Buy the Offshore rod at the harbor; its 950 G, 7,500 Fishing XP, and previous-rod requirements still apply. | 200 G; Fi 900. |
| act9_deep_trench | 9 · The Deep Trench | Old Silas | Land a Swordfish in Neva ecology; carry and sell it at Village. The trench marker is not a separate narrow capture polygon. | 400 G; Fi 1,400; Tr 500. |
| act9_standing_arrangement | 9 · A Standing Arrangement | Maeve | Complete a quality-target order, then a bulk order. | 350 G; Tr 1,400. |
| act9_the_charter | 9 · The Charter | Maeve | Settle the charter with 400 G and 2 Salt-Cured Fish. | Tr 1,200; Fi 600; Maritime Guild Charter / extra contract slot. |
| act10_open_horizons | 10 · Open Horizons | Elspeth; herald via Maeve | Visit Old Silas → Maeve → Barnaby → Elspeth, in order. | 500 G; 800 XP in each of the four skills; Open Horizons knowledge. |

Main narrative completion is not locked behind the Master rod or Blue Marlin. Swordfish/charter progression closes the principal economy arc; the Marlin pursuit remains a long-tail fishing goal.

### Reading the Water: all seven fishing quests

Opens after the maiden-voyage chapter. Prefix each short ID with `quest.`.

| Quest ID | Title | Objective sequence | Reward |
| --- | --- | --- | --- |
| tides_home_water | The Water You Started In | Chum a river school; hook Brook Trout in the river; land it. | 60 G; Fi 350. |
| tides_deep_channel | The Deep Channel | Land a Catfish. | 110 G; Fi 500. |
| tides_cold_teeth | Cold Water Teeth | Land a Pike. | 150 G; Fi 650. |
| tides_summer_gold | Summer Gold | Land an Arowana. | 260 G; Fi 900. |
| tides_old_coast | The Old Coast | Land a Sturgeon; carry and sell it at Village. | 320 G; Fi 1,100; Tr 400. |
| tides_every_water | Every Water on the Chart | Hook sport fish in river, lake, and coast as ordered, then report. | 400 G; Fi 1,400; Reading the Water knowledge. |
| tides_blue_marlin | The Silver King | Land a Blue Marlin in Neva ecology. | 750 G; Fi 5,000; Tr 500. |

### Commons / homestead: all five farming quests

Opens after the early harvest-and-compost chapter. Community-ground objectives are distinct from Starter Garden objectives.

| Quest ID | Title | Speaker | Objective sequence | Reward |
| --- | --- | --- | --- | --- |
| homestead_seed_pouch | The Family Key | Elspeth | Speak with Elspeth. | 8 Wheat Seeds; 4 Seed Potatoes; Fm 250; Seed Pouch knowledge. |
| homestead_overgrown_rows | A Furrow for Everyone | Barnaby | Plant and water 3 Wheat in the Commons. | 40 G; Fm 400. |
| homestead_first_crop | A Fair Share | Barnaby | Harvest 3 Commons Wheat; sell Wheat at Village. | 90 G; Fm 450; Tr 300. |
| homestead_worn_tools | Tools That Outlast Us | Barnaby | Mill Wheat at `struct.starter_mill`; the displayed village-mill wording does not authorize every mill. | 60 G; Pr 400; Worn Handle knowledge. |
| homestead_orchard | Shade for the Next Season | Elspeth | Plant and harvest an Apple Tree in the Commons; return and hand over 1 Apple. | 300 G; Fm 1,500; Family Ledger knowledge. |

### Freight and Favour: all five trade quests

Opens after the first harbor-promise contract. The crossing step explicitly needs an order with the cross-channel tag.

| Quest ID | Title | Speaker | Objective sequence | Reward |
| --- | --- | --- | --- | --- |
| tradelanes_volume | The Weight of an Order | Maeve | Complete a bulk order. | 120 G; Tr 600. |
| tradelanes_freshness | The Clock in the Hold | Maeve | Complete a fresh-fish order. | 140 G; 3 Ice; Tr 700; Fi 300. |
| tradelanes_grade | A Buyer Who Can Tell | Maeve | Complete a quality-target order. | 220 G; Tr 900; Fi 400. |
| tradelanes_crossing | The Long Way Round | Tomas; herald via Maeve | Dock the skiff at Sunreach; complete an order targeted by `tag:cross-channel`. | 260 G; Tr 1,000. |
| tradelanes_ledger | Freight and Favour | Maeve | Return to Maeve and settle the final conversation. | 350 G; Tr 1,400; Freight and Favour knowledge. |

### Narrative state is not a menu of unrelated rewards

The same successful action can emit several events, such as a landed catch and automatic cargo stow. The quest domain decides which current steps those events can satisfy. Do not implement a second UI-side quest counter, award a reward merely because a progress bar looks full, or deduce that closing and reopening dialogue should repeat the reward.

A partial contract is not a completed contract objective. A rod-purchase event is not interchangeable with owning an unrelated rod; the specific already-owned target can nevertheless be reconciled for its acquisition objective as described above. A request for a particular station, farm, habitat, or ecology must use the event's real location. Narrative text about saving seeds, family ownership, or community effort is not evidence of an extra seed-saving, property-trading, or multiplayer command.

**Source owners:** [`src/content/quests.ts`](src/content/quests.ts); [`src/content/questTracks.ts`](src/content/questTracks.ts); [`src/simulation/domains/QuestDomain.ts`](src/simulation/domains/QuestDomain.ts); [`src/simulation/core/QuestTypes.ts`](src/simulation/core/QuestTypes.ts); [`src/ui/QuestTrackerHUD.tsx`](src/ui/QuestTrackerHUD.tsx); [`src/ui/JournalModal.tsx`](src/ui/JournalModal.tsx); [`src/ui/DialogueModal.tsx`](src/ui/DialogueModal.tsx).

## 17. The explorable world, named people, and collection goals

### World spaces and their practical roles

| Area | What the player does there | Boundary |
| --- | --- | --- |
| Neva homestead / Starter Garden | Begin the story, grow the tutorial crops, use the early production chain, buy/use field irrigation, enter the supported farmhouse and rest. | Inherited access, not a property purchase or free-placement housing editor. |
| Neva Commons / village | Grow community-ground crops and an orchard, meet village characters, buy seeds/materials, fulfil orders, and sell produce or hand-carried fish packs. | Commons and starter-farm quest predicates are not interchangeable. |
| Silverwater river and lake | Basic angling, freshwater schools, rod progression, water-reading knowledge, and fishing-track objectives. | Habitat/ecology/season/rod requirements remain active. |
| Neva harbor and coast | Meet Silas/Maeve, commission/board boats, buy tackle/supplies, process fish, deliver harbor orders, and prepare voyages. | A fish-market building does not mean normal sport cargo is sold there. |
| Mountain trails, spring, overlook, beach, bluff, lighthouse cliffs | Walk/jump/explore, discover authored locations and their journal entries, use landmarks for orientation. | Scenery is not a mining, logging, dungeon, or collectible-pickup system unless a handler exists. |
| Open channel | Navigate by boat, watch conditions/fuel, find schools, discover the seam, and choose direct or island-detour routes. | No automatic expedition dispatch or chart fast travel. |
| Gull’s Rest | A small landing and coastal-school detour; unlock its discovery note. | Not a second full settlement with a market or new crafting economy. |
| Driftwood Cay | Explore the old camp, unlock discovery, and find the authored saved fuel/chum cache. | The cache is not an unlimited supply faucet. |
| Lantern Shoal | Discover a small anchorage/stone-spire landmark and nearby deep-water opportunity. | Deep species still require tackle and physical cargo capacity. |
| Sunreach Cove | Dock the skiff, meet Tomas, trade local supplies and orders, use local production services. | Sunreach shares core mechanics but has its own ecology and location-gated objectives. |
| Sunreach terraces, ridge, and reef shelf | Meet Ines, grow Sunflower/Olive, irrigate, fish Sardine/Bream/Amberjack, cure fish, and explore. | Warm-place crop suitability and preservation give the route an economic purpose beyond another backdrop. |

### Named gameplay cast

The inspected quest surface centers on **Elspeth**, **Barnaby**, **Old Silas**, **Maeve**, **Tomas**, and **Ines**. Elspeth anchors the inherited field and orchard; Barnaby links farm work, milling, compost, tools, and irrigation; Silas teaches angling, boating, and advanced catches; Maeve anchors markets, orders, and the charter; Tomas introduces Sunreach's maritime route; Ines anchors its terraces, irrigation, fertilizer, and preservation.

Players talk, hear context-sensitive dialogue, complete objectives and turn-ins, receive recognition, and read the People journal. These actions are not a conversation-choice role-playing tree, gift preference system, friendship-point shop, romance track, or companion-combat system. Those features were not established in the normal action surface.

### All thirteen authored discovery entries

Discovery knowledge is separate from the linear quest cursor. Entries can be granted by reaching their authored location and arrival conditions. Their scenic-view identifiers are presentation metadata, not an established player-operated photo mode.

| Knowledge ID | Title | Where / arrival | Consequence |
| --- | --- | --- | --- |
| knowledge.discovery.spring | Mountain Spring | Headwater trail end on Neva | Location knowledge. |
| knowledge.discovery.overlook | Western Overlook | Western foothill trail | Location knowledge. |
| knowledge.discovery.beach | Western Beach | Descending western trail | Location knowledge. |
| knowledge.discovery.bluff | Northern Bluff | Northern path beyond the spring | Location knowledge. |
| knowledge.discovery.farm | Homestead Heights | Mountain-path approach beside the farm | Location knowledge. |
| knowledge.discovery.coast | Lighthouse Cliffs | Southern Neva coast | Location knowledge. |
| knowledge.discovery.ridge | Exposed Ridge | Sunreach high ground | Location knowledge. |
| knowledge.discovery.reef | Sunreach Reef Shelf | Sunreach southern coast | Location knowledge. |
| knowledge.discovery.gull_rest | Gull’s Rest | Channel islet | Location knowledge. |
| knowledge.discovery.driftwood | Driftwood Cay | Channel islet / old camp | Location knowledge. |
| knowledge.discovery.lantern | Lantern Shoal | Channel islet / spire | Location knowledge. |
| knowledge.discovery.driftwood_cache | The Saved Can | Camp cache near x=743, z=-61 | Authored reward: 1 Engine Fuel + 1 Chum Bucket; verify full-satchel retry behavior in runtime QA. |
| knowledge.discovery.channel_seam | The Channel Seam | Near x=610, z=110; 35 m radius; boat arrival | Location knowledge about the crossing and school search. |

### Eleven additional story knowledge entries

The Land-Sea Cycle; Wheat Milling; Open Horizons; Salt and Shade; Freight and Favour; The Family Ledger; Reading the Water; Worm Composting; The Seed Pouch; The Family Slip; and The Worn Handle. Combined with the thirteen discovery entries, this yields **24 authored knowledge entries** in this snapshot. Their full prose remains in `src/content/knowledge.ts`; this master records their gameplay role rather than duplicating every narrative paragraph.

### Almanac and records

The journal records fish discovery, catch count, largest weight, and best quality, plus crop discovery/harvest progress and best crop quality. Ordinary fish stack sales do not inherit these historical best-grade bonuses. Releasing or selling the individual record fish does not erase the discovery already earned.

The Records Board derives goals from existing crop and fish content. Its tiers are **The Field**, **The Harbor**, **The Deep**, and **Standing Records**. Rod class places fish goals into increasingly difficult tiers. The authored weight-record threshold is halfway from a species' average weight to its maximum: `average + 0.5 × (maximum − average)`. Crop mastery uses **20 harvests** of that crop. A fish's trophy-record threshold is **Exceptional** quality, while a show-quality crop needs **Prize**. Habitat-sweep goals refer to river, lake, coast, and offshore.

These are persistent accomplishment/readout goals, not proof of cash prizes, purchasable trophies, or a separate achievement currency. Their value is collection, mastery, and visible progress. Their actual derived rows should be rebuilt from the content registry when species or crops change.

**Source owners:** [`src/content/discoveries.ts`](src/content/discoveries.ts); [`src/content/knowledge.ts`](src/content/knowledge.ts); [`src/content/records.ts`](src/content/records.ts); [`src/content/quests.ts`](src/content/quests.ts); [`src/world/OceanIslets.ts`](src/world/OceanIslets.ts); [`src/world/WorldGameplayLocations.ts`](src/world/WorldGameplayLocations.ts); [`src/ui/JournalModal.tsx`](src/ui/JournalModal.tsx).

### Updated shoreline and headwater topology: gameplay boundaries

The new headwater lip/fall/plunge-pool and shoreline classification affect where the player can stand, collide, find fishable water, and preserve a supported saved position. They do **not** introduce a waterfall-riding mode, diving, swimming, a water-control puzzle, a new fish species, or a waterfall-specific quest merely because the fall is rendered.

The coastal-access regression source exercises western Neva beach water reading, a normal basic cast, and a staged nearby sport school with normal chum/lure/hook requirements. It records the intended caller-to-domain contract, not an executed browser pass or a guarantee that a natural tuna school always exists at that exact spot. Rod, ecology, Work, supplies and cargo feasibility remain the actual fishing gates.

The headwater is not a new upper-river boat route; the migration recovers invalid development-saved upstream boats. A visibly wet pixel, fishable target, walkable surface and safe mooring are different concepts. Foam, spray, swash, bank treatment and water optics provide feedback, not independent player commands.

### World feedback accompanying actions

Work and outcomes have associated notices, animations, sounds/VFX and nearby reactions: crop tending/harvest, processing working/ready/collection, trade acknowledgements, hook/land/escape, record feedback, footsteps and doors. NPC barks and demand boards expose nearby context without a transaction. Dismissing a toast or reading the Chronicle is not an undo or repeat-reward action.

These effects consume canonical events rather than independently earning resources. Missing sound, reduced-motion presentation, skipped intro, model-preview fallback or a closed notification must not erase a reward or grant it again. The audio design bible contains specified targets; actual event bindings and shipped manifest establish what plays. An exhaustive sound/asset inventory and visual-performance approval are outside this source-based gameplay pass.

**Additional owners:** [`src/world/NevaHeadwaters.ts`](src/world/NevaHeadwaters.ts); [`src/world/HeadwaterWaterfallGraybox.ts`](src/world/HeadwaterWaterfallGraybox.ts); [`src/world/WorldLayout.ts`](src/world/WorldLayout.ts); [`tests/simulation/coastalFishingAccess.test.ts`](tests/simulation/coastalFishingAccess.test.ts); [`src/persistence/migrateHeadwaterFall47.ts`](src/persistence/migrateHeadwaterFall47.ts); [`src/app/GameApp.ts`](src/app/GameApp.ts); [`src/audio/gameplayAudio.ts`](src/audio/gameplayAudio.ts).

## 18. Screen-by-screen interaction inventory

This section covers actions that do not necessarily dispatch a simulation command: opening a tab, sorting a market, previewing clothing, reading a record, pinning a chart location, dismissing a hint, changing a setting, or cancelling a confirmation. The command index later is therefore not a count of every clickable control.

### Title, opening, and loading

| Player interaction | Behavior / state consequence |
| --- | --- |
| Begin | Start the normal new-game flow when no readable save exists. |
| Continue | Load the readable local save and apply the appropriate startup/catch-up flow. |
| Start a new game | Open a replacement confirmation where an existing/unreadable/incompatible save makes replacement consequential; cancel is initially focused. |
| Continue without saving | Open an explicit confirmation when persistence is unavailable; cancel is initially focused. The session must be visibly identified as unsaved. |
| Retry | Retry a failed startup through the supplied application handler; not a promise that a corrupt save is repaired. |
| Skip opening | Skip the opening presentation when the supplied opening handler is available; not a quest-progression skip. |
| Options | Navigate Graphics, Audio, Interface, and Controls before loading into the world. |
| Fullscreen | Request entry or exit through the browser. Unsupported/denied requests produce a message rather than silently claiming success. |
| Read save summary | See the saved day/season/year, location, money, and saved-at information provided by startup inspection. |
| Cancel/close title dialogs | Escape, close controls, and normal focus navigation dismiss the appropriate dialog and restore prior focus. |
| Loading status | Read measured asset progress where available. Main action is disabled while loading or checking the save; a ready world must not be assumed just because the page rendered. |

### Main HUD and small information surfaces

| Surface | Player interactions / information | Important boundary |
| --- | --- | --- |
| Player resources | Read Work, sprint stamina, status effects; open Character & Gear from the player frame. | Work is not health or sprint stamina. |
| Smart tool belt | Select one of the current contextual tools by click or numbered shortcut; see the tool automatically chosen for a world action. | Tool slots are context-dependent, not an unrestricted action bar with every possible verb. |
| Context prompt | Read the current E action and blocker. Invoke the selected world interaction. | The prompt competes with nearby candidates; each domain revalidates the action. |
| Quest tracker | Read objective and order progress; focus an available quest track. | Focusing is presentation preference, not accepting, abandoning, or branching the quest. |
| Compass / navigation instrument | Read headings, landmarks, objective markers, and open the Nautical Chart. | A marker is guidance, not automatic movement. |
| Clock / weather instrument | Read date/time/weather and open the Farm Forecast. | The forecast is a query; opening it directly does not create a Pause overlay. |
| Farm Forecast | Toggle with F or the instrument, inspect local growing conditions, and close. | F is source-wired in HUD.tsx; blocked during placement/fishing/modal/editor states and while typing in a text control. |
| Farm GIS | Hold Alt to expose farming information layers/legend during eligible play. | Temporary overlay; it does not buy, irrigate, fertilize, or change soil. |
| Crop information card | Right-click a crop to inspect its state; dismiss without committing a farm action. | Inspection reach and action reach are separate. |
| Planting seed bar | Choose an available seed/crop and cancel placement. | A selected crop still needs an eligible footprint and enough seed/Work at commit. |
| Action progress | Read the active action’s target/progress, then let it commit or cancel while cancellation remains valid. | Closing a post-commit animation is not an economic rollback. |
| Carried pack status | Read physical species, weight, grade, freshness, and carried-speed penalty. | One carried physical fish does not occupy an ordinary satchel stack slot. |
| Vessel console | Read active boat condition, cargo/supplies/fuel and navigation state. | Displayed hull is not evidence of an exposed repair menu. |
| Weather warning | Read contextual maritime/field hazard notices. | No explicit weather-control action exists in normal play. |
| Contextual hints | Read and dismiss first-use guidance. | Persisted hint knowledge suppresses repeated introductions; this is not quest abandonment. |
| Catch summary | Read new catch/record information and dismiss its presentation. | Dismissal of an already-landed physical catch is not the same action as release or discard. |
| Notices / Coastal Chronicle | Read transient outcomes and a retained activity log; select the supplied category filter. | Activity history is not an undo stack or guaranteed permanent transcript. |

### Tool-belt browsing and minimap entry

Hovering/focusing the tool belt expands it for browsing; wheel/input reveal cues can expose it temporarily before it settles back. Touch can force expansion rather than depending on hover. Relevant/ready/empty slot presentation must not be mistaken for a second command-permission system: the same validated action still controls resource use. Selecting an already-held tool can reveal the belt without creating a new equipped item.

The minimap can open the Nautical Chart. Custom waypoints appear beside quest guidance and retain their UI-session lifecycle, not a new saved-navigation feature. Resource-frame popovers, tool-belt disclosures and notices are user interactions even when they do not add a `GameCommand` name.

**Owners:** [`src/ui/hud/SmartContextualToolbar.tsx`](src/ui/hud/SmartContextualToolbar.tsx); [`src/ui/hud/WorldMinimap.tsx`](src/ui/hud/WorldMinimap.tsx); [`src/ui/GameUI.tsx`](src/ui/GameUI.tsx).

### Satchel and Character & Gear

**Satchel:** open/close; switch All/Field/Fishing/Supplies; retain 16 sockets and dim nonmatches; search names/categories/crops; Clear text or reset both filters with View All Items; navigate matching occupied entries with arrows/Home/End; select an item; open/close Details; use Organize/Tidy; choose a seed for placement; explicitly consume an eligible meal. No unrestricted split, drop, arbitrary drag-reorder, or raw-food eating action is implied.

**Character & Gear:** filter All/Clothing/Tools/Rods; select an equipped slot or owned item; drag the separate mannequin to rotate it; read the comparison with the currently equipped item; Try On; reset Try On; equip owned equipment or a rod; save the actual three-piece outfit into Field/Sea; wear either saved outfit; open Satchel or Pause from the supplied screen actions; close without committing a preview. Wardrobe usage distinguishes owned pieces and reservations for equipment currently being made. Try On is local to the mounted screen and disappears without changing the save. Mannequin rotation is also visual only; model/renderer failure retains a text fallback and usable equipment comparison.

### Crafting panel

Select a recipe from the current station's list. Rows distinguish quest-target, ready, blocked, and locked recipes. Inspect exact inputs against owned counts, outputs, Work cost/savings, normal/masterwork classification, duration, and blocking reasons. Press Start to commit ingredients and Work; a success closes the panel, while a refusal retains feedback.

An occupied station instead shows the current job, output, and whether it is in progress or ready. **Collection is a world/station interaction, not a queue-management button in this panel.** There is no exposed cancel/refund/reorder/batch-queue control in the inspected CraftingModal. Starting a job does not automatically collect it when its timer ends.

### Market ledger

The modal has Buy, Sell, Hold, Trade packs, and Deliveries sections as appropriate to the board. Buy rows can be sorted by name or price; Sell by name, price, or quantity; cargo by name or price. Activating the same sort reverses direction. Select a row, edit a positive whole-number quantity, inspect the resulting ticket/quote, and buy or sell. An empty or invalid quantity draft remains editable but cannot settle a transaction.

The modal supports sell-all for a selected stack and eligible bulk produce/fish actions. Large bulk transactions use an explicit confirmation threshold of **200 G**. A pending bulk confirmation is cleared when changing market/section so a stale confirmation cannot silently apply to a new context. Domain eligibility still excludes current trade-pack species from generic bulk fish sales.

Tackle rows support purchase and equipping owned rods. A demand-trend detail is supplied for an inspected commodity. Cargo sections show actual individual valuation and eligible sell/release/discard actions; trade-pack availability is special to the Village counter. Deliveries show active order requirements, progress/deadline, eligible items/cargo, delivery actions, and Pass for untouched orders. Selecting a contract is not a second acceptance step.

### Dialogue and hand-ins

Click the dialogue body/footer, or use Space, Enter, or E when focus is not inside another interactive control. The first advance reveals the current typewriter text fully; the next moves to the next page; the final advance closes. Earlier page dots can be clicked to reread already-shown pages immediately. Escape/close/backdrop exits the presentation.

The conversation resolves its talk command once per NPC screen, so rereading a page is not another reward claim. Completion segments display granted coins/items/XP/unlocks and what was handed over. Reduced-motion preference causes text to appear without the typewriter animation. The default focus is the dialog rather than its close button, preventing Space from accidentally closing instead of advancing.

### Field Journal: all seven folios

| Folio | Actions and information | Not implied |
| --- | --- | --- |
| Story | Read focused objective, progress, target/ready status, hand-in blockers, the NPC’s current brief, other open threads, and completed entries. | No remote reward collection or unrestricted quest rewind. |
| People | Read the named cast and earned recognition/standing. | No gift menu, romance choice, or numeric friendship economy unless separately implemented. |
| Records | Browse derived milestone progress by tier, fish/crop records, and achievements already met. | No automatic cash payout merely for viewing a completed row. |
| Notices | Read authored town notices selected from earned state. The physical town board can open this folio directly. | Not all notice text is an accepted quest or an economic transaction. |
| Almanac | Switch Fish/Crops; search fish by name/water/season or crops by name/climate; inspect discovery and personal bests. | Unrecorded species can still have authored reference facts visible; discovery is not a universal encyclopaedia fog. |
| Skills | Read each profession’s XP/rank progress, upcoming rank, and unlock information. | No spendable talent-point allocation interface. |
| Guide | Read the field guide and control reference. | Help text is subordinate to the actual binding/handler when they disagree. |

The Almanac gives fish habitats, peak seasons, time windows, rod class, weight range, base value, rarity, sport tag, catch count, and best weight. Crop entries show climates, base growth duration, relative water-need band, yield range, regrowth, harvest count, and best grade. Growth times are reference durations, not current weather-adjusted timers for a planted instance.

### Nautical Chart

Open/close the chart; choose Open sea, Neva, or Sunreach view; switch Chart, Markets, Fishing notes, or Farms lens; pan by dragging; zoom around the pointer with the wheel or use +/−/reset; select a map node or directory entry; inspect a relevant market, farm, habitat, terrain category, and distance. Selection can pan a zoomed chart to bring its destination into view. Marker labels are emphasized on hover/selection to reduce clutter.

Click blank land or water to set a custom waypoint; use the waypoint controls to clear/change the target. A real drag does not also place an accidental pin. The chart displays the player's heading/location, active objectives, and live working-school information. Waypoints expose bearing, cardinal direction, distance, and an approximate travel time.

The ETA uses straight-line distance with fixed water/land speeds, approximately 6.2 m/s and 3.6 m/s. It does not route around islands, inspect every obstacle, use the actual equipped vessel's speed, or guarantee fuel sufficiency. A chart pin is not autopilot, instant travel, or a boat purchase. The custom waypoint is held in `GameUI` local state and shared with HUD/compass/minimap; it survives chart close/reopen within that UI session, not a full reload as canonical saved state. Bearing/distance change as the player moves; a distant minimap target uses a rim indicator. This local pin does not replace or complete a quest.

### Expedition Board

After its story unlock, open with P or the Pause shortcut. Select among posted Steady/Bold opportunities. Read suggested destination, summary, return/value label, deadline if present, readiness state, and ordered blockers. The readiness strip reports current vessel/hull, supplies, weather, and sea conditions.

**The Board is an advisory planner.** The inspected component only selects a notice and closes; it has no Accept, Launch, Dispatch, auto-sail, auto-catch, or claim-expedition-reward command. A “Ready” label means its checks pass, not that the voyage has already happened or is risk-free.

### Hold & Stores

Inspect capacity totals, carried catch, supply counts and registered vessels; select a vessel tab when multiple boats exist to show that bay and stackable stores. Stow or Take the row's whole item quantity, receive success/refusal feedback, and close. The cart is not a vessel tab and is excluded from vessel-capacity totals. The same interface can show remote vessels, but the command requires access. Read-only fish slots do not permit drag-and-drop fish stowage. Do not confuse supplies slots, physical fish slots, hands, and wardrobe reservations.

### Pause, settings, and recovery

Resume; Save now; open Satchel, Journal, Chart, Hold & Stores, Guide, and—once unlocked—Expedition Board; open settings; disclose recovery options; enter Safe Return/Emergency Tow confirmations; cancel or confirm. A child screen opened from Pause remains paused and closes back to Pause. The save line distinguishes unavailable saving from a recent successful save.

| Settings group | All exposed choices / actions | Persistence / usability boundary |
| --- | --- | --- |
| Graphics | Auto, Low, Medium, High; read effective active tier; reset to Auto. | Auto can change detail during play; this is presentation, not a gameplay difficulty setting. |
| Audio | Master, Music, Effects, Ambience; each has a 0–100 slider and mute toggle; reset defaults. | Moving a slider unmutes that channel. Defaults are 80%, 52%, 80%, 62%, all unmuted. |
| Interface | Auto, Small, Normal, Large; read resolved percentage; reset Auto from Pause. | Interface scale is not world zoom or player speed. |
| Controls | Read the control reference. | A reference page is not an exposed rebinding editor. |
| Fullscreen / orientation | Title fullscreen toggle; touch-device landscape/fullscreen request where supported. | Browser permission/support can refuse; landscape orientation is not guaranteed on every device. |

### Home-screen installation and standalone launch

The latest inspected commit adds a web-app manifest, app icons, installation hook and **Add Nevaland to Home Screen** sheet. This is a browser/session interaction, not a new economic command, paid upgrade, character save, or native-store release.

The automatic sheet is eligible when startup is ready, the device is detected as touch/mobile, it is not identified as standalone, no recent dismissal is active, no registered gameplay modal is open, and portrait blocking is absent. An explicit **Add to Home Screen** entry in Pause can reopen it even during the dismissal period. The manual entry is not restricted to mobile by the same automatic-show predicate; it is hidden when the hook identifies standalone state.

| Player choice / platform path | Actual handler behavior | Boundary / refusal behavior |
| --- | --- | --- |
| Open installation from Pause | Close the registered Pause modal and set local manual-open state. | It is not a child of Pause in the gameplay mode stack; see A26. |
| Native Add to Home Screen | When a captured `beforeinstallprompt` event exists, call its prompt and await the browser's accepted/dismissed outcome. | Merely detecting Chrome or Android is not sufficient to create the browser event. |
| Accepted native choice | Set the local installed/standalone indicator, clear deferred prompt, close the sheet and record dismissal. | No gold, XP, game save export or automatic voyage is granted. Actual installed launch remains a device/browser behavior to verify. |
| Dismissed native choice | Clear the captured event; close/snooze through the parent handler. | Another press cannot assume the consumed deferred event is still available. |
| No native event / exception | Hook returns `unsupported`. | There is no fake success. The parent has no explicit error-message branch for this result; test an explicit fallback. |
| iOS instructions | Show the authored three-step guide, differentiated for detected Safari or Chrome. | These are displayed instructions, not actions executed by the game or verified against every current browser version. |
| Got It | Visible in place of direct install when there is no prompt event; dismisses/snoozes. | Got It does **not** mean an app was installed. Non-iOS unsupported devices receive no equivalent detailed guide from this component. |
| Maybe Later / Close / Escape | Close and snooze automatic display for seven real days. | Snooze is browser-local `neva_pwa_dismissed_until`, not seven game days or a permanent opt-out. |
| Launch the home-screen app | Manifest requests standalone display, landscape, scope `/`, start URL `/?source=pwa`, and the supplied app icons. | Manifest preference is not proof of forced landscape, higher FPS, complete fullscreen behavior or offline asset availability. |

Standalone detection uses display-mode, the navigator standalone signal and an Android-app referrer check. The hook writes `neva_pwa_installed`, but its initialization uses actual standalone detection and dismissal time rather than reading that flag as a permanent suppressor. After a snooze expires, returning in an ordinary browser tab can therefore offer the prompt again. Storage errors are caught; the current mounted hook can dismiss the sheet, but persistence of that choice across reload is not guaranteed when localStorage is denied.

No exposed **Never ask again** or reset-snooze button was established, despite optional internal helper parameters. Installation does not supply cloud sync, move a browser's saved game to another device, guarantee 60 FPS, or prove a complete offline-play cache. The game's *offline progression* means catch-up on a later load, not evidence that the entire world can boot without a network.

**Mode/input risk:** this sheet is rendered from local `GameUI` state, outside the registered `ModeController` modal stack. Its show predicate does not explicitly exclude basic/sport fishing; the accessibility hook consumes Tab and Escape, not all gameplay keys. Thus `aria-modal` and a dimmed backdrop do not establish that simulation time, held controls or keyboard world actions are blocked. The manual path closes Pause first. Treat pause continuity, focus, movement, fishing interruption, and restoration as a targeted integration test, not as ordinary-modal behavior automatically inherited by the install sheet.

**Owners:** [`src/ui/pwa/usePwaInstall.ts`](src/ui/pwa/usePwaInstall.ts); [`src/ui/components/PwaInstallPromptModal.tsx`](src/ui/components/PwaInstallPromptModal.tsx); [`src/ui/GameUI.tsx`](src/ui/GameUI.tsx); [`src/ui/EscapeMenuModal.tsx`](src/ui/EscapeMenuModal.tsx); [`src/ui/useModalAccessibility.ts`](src/ui/useModalAccessibility.ts); [`public/manifest.webmanifest`](public/manifest.webmanifest); [`index.html`](index.html).

### Keyboard, accessibility, and interruption

The inspected UI uses dialog roles/labels, focus-management hooks, keyboard-operable buttons, and keyboard tab/radio groups. Satchel navigation skips empty cells. Title/recovery confirmations initially focus Cancel; closing dialogs restores appropriate focus. The blocked HUD is made inert/hidden to assistive navigation rather than leaving its shortcuts clickable beneath a modal. Dialogue honors reduced motion.

These source affordances are not a completed accessibility certification. End-to-end screen-reader play, high zoom, pointer-only affordances, motor accessibility of the two fishing minigames, touch targets, contrast, and focus behavior under every nested modal still require browser/device testing. No universal gamepad or key-rebinding implementation was established by this audit.

### Developer-only / diagnostic interaction surface

`GameUI.tsx` checks a `debug` URL parameter and accepts diagnostic callbacks for advancing time, granting money, toggling weather, and spawning a school, plus diagnostics/layout-editor state. These are not earned gameplay progression. Their presence must be documented separately from normal player controls; production availability and whether such sessions should persist to normal saves need an explicit build/runtime check. No authentication or shipping restriction is inferred merely from calling a surface “debug.”

**Source owners:** [`src/ui/StartScreen.tsx`](src/ui/StartScreen.tsx); [`src/ui/HUD.tsx`](src/ui/HUD.tsx); [`src/ui/GameUI.tsx`](src/ui/GameUI.tsx); [`src/ui/InventoryModal.tsx`](src/ui/InventoryModal.tsx); [`src/ui/CharacterScreen.tsx`](src/ui/CharacterScreen.tsx); [`src/ui/CraftingModal.tsx`](src/ui/CraftingModal.tsx); [`src/ui/MarketModal.tsx`](src/ui/MarketModal.tsx); [`src/ui/DialogueModal.tsx`](src/ui/DialogueModal.tsx); [`src/ui/JournalModal.tsx`](src/ui/JournalModal.tsx); [`src/ui/components/AlmanacPage.tsx`](src/ui/components/AlmanacPage.tsx); [`src/ui/components/WorldMapModal.tsx`](src/ui/components/WorldMapModal.tsx); [`src/ui/ExpeditionBoard.tsx`](src/ui/ExpeditionBoard.tsx); [`src/ui/components/LogisticsLedgerModal.tsx`](src/ui/components/LogisticsLedgerModal.tsx); [`src/ui/EscapeMenuModal.tsx`](src/ui/EscapeMenuModal.tsx); [`src/ui/components/InterfaceSettings.tsx`](src/ui/components/InterfaceSettings.tsx); [`src/app/ModeController.ts`](src/app/ModeController.ts).

## 19. Saving, continuing, away time, and failure recovery

### Local-save model

The inspected repository uses IndexedDB `neva_save_db`, with primary and backup save slots in `game_saves`. This is local browser persistence, not an account/cloud-save promise. Starting on another browser/device, clearing site data, or using a browser session that denies storage can affect whether a save is available. The inspected normal UI does not expose a multi-slot save manager, export/import file workflow, or cloud synchronization.

A save freezes a deep snapshot before asynchronous storage begins, validates the envelope, serializes operations, and writes primary/backup changes atomically. The saved clock is not left paused just because the save was made through Pause. The displaced readable primary becomes backup; incompatible data can be preserved verbatim rather than destroyed. A malformed primary must not overwrite the only recovered good backup. Storage operations have timeouts and explicit unavailable/failure states.

Startup distinguishes empty, loaded, corrupt, incompatible, and unavailable data. It first inspects the save to decide whether Begin, Continue, New Game confirmation, or an unsaved-session confirmation is truthful; that inspection does not itself start the gameplay clock or construct a world. Schema and world-layout migrations can preserve older saves, but an incompatible future schema/layout is not silently treated as a fresh successful Continue.

Manual **Save now** is available from Pause when saving is supported. During running play, the application requests a save after 60 seconds since the last successful save and on significant crop, processing, equipment, catch, boat, trade, contract and quest events. A hidden-document event also requests saving. Requests coalesce through a queued flush and serialize while a write is already in flight.

Automatic saving requires a running, boot-ready, durable-write-enabled session. Disabled/no-save sessions cannot claim persistence. These are asynchronous requests, not a guarantee that an immediately closed browser process completed the final write. A saved timestamp represents committed success rather than the button press or queued request. New-game replacement and unsaved continuation are explicit decisions; simply beginning a replacement world's loading must not erase the preceding valid save.

### Offline progression: what advances

Catch-up caps elapsed real absence at **72 real hours** and converts it using the saved game-clock speed, applying whole game minutes. Negative wall-clock movement grants no negative progression. The default conversion is 0.4 game minutes per real second, subject to the canonical speed clamp.

| System while away | Applied behavior | What does not happen automatically |
| --- | --- | --- |
| Crops | Weather-bounded growth/health/moisture progression; crops can mature, overripe, or wither. | No automatic planting, tending, or harvest into the satchel. |
| Physical fish | Freshness decay, actual storage cooling, temperature changes, and loose-ice billing. | No automatic preservation reset or sale. |
| Processing jobs | An active job whose finish time is reached becomes complete. | No collection; station remains occupied until its result is collected. |
| Work | At most one bounded rest grant if an **08:00 wake boundary** was crossed; daily earning bookkeeping resets on its separate midnight boundary. | 23:59→00:01 does not itself grant a night’s rest; 07:59→08:01 can. No repeated nightly pools or replayed live passive regeneration. |
| Contracts | Expire, settle partial deliveries as applicable, prune settled history, and refill feasible postings. | An expired order is not completed for story/XP purposes. |
| Markets | Advance local market ticks/demand/stock evolution. | No autonomous player buy/sell strategy. |
| Schools | Expire spent/old schools through the shared logic. | No offline fishing rewards. |
| Motor fuel | Call the same fuel-drain function over elapsed time. | No corresponding offline boat travel is established; nonzero saved speed therefore deserves a regression test. |
| Weather / RNG / metadata | Advance weather in bounded segments and retain canonical clock/RNG state. | Away time is not added as active play time. |

The return summary can report real time away, simulated game minutes, matured/withered crops, completed jobs, spoiled cargo, and expired contracts. Its counts describe what happened, not items already collected or revenue already earned. Leaving a live motorboat moving, fresh fish exposed, crops unattended, or deadlines nearly expired can have consequences after Continue.

### New topology and save compatibility

The reviewed source uses schema 47 and layout revision 21. The carriage compatibility step introduces the inherited transport for predecessor saves; the headwater step migrates layout-20 positional data to layout 21. These are load-time compatibility operations, not player reward buttons or permission to reset unrelated progress.

The headwater migration is scoped to its authored envelope, rederives supported positions/heights where required, keeps a ridden mount aligned with the rider, and recovers invalid upstream saved boats to the harbor. Inventory, money, quest rewards, cargo IDs and ordinary farming state are not intended to be replaced with a fresh game. Retained carriage/headwater fixtures and tests define coverage targets; **they were not executed in this audit**. Incompatible/corrupt data still follows validation and recovery rather than silent success.

### Deployment and automatic reload

The HTML shell handles `vite:preloadError` with an immediate page reload. Its startup failure UI also offers a visible Reload game action. Source headers request uncached HTML/manifest and long-lived versioned assets. This describes repository configuration, not tested CDN response headers or verified offline installation.

The preload-error listener itself has no retry-count/backoff or save-aware check. Repeated persistent chunk failure and an explicitly unsaved session therefore deserve targeted recovery testing (A24). A reload is not a save export and does not guarantee the latest uncommitted play was retained. Normal loading and offline reconciliation still determine what Continue restores.

**Additional owners:** [`src/persistence/migrateHeadwaterFall47.ts`](src/persistence/migrateHeadwaterFall47.ts); [`src/persistence/SaveMigrations.ts`](src/persistence/SaveMigrations.ts); [`tests/simulation/carriage.test.ts`](tests/simulation/carriage.test.ts); [`tests/simulation/headwaterFallMigration.test.ts`](tests/simulation/headwaterFallMigration.test.ts); [`index.html`](index.html); [`public/_headers`](public/_headers).

### Recovery choices and their limits

A storage retry, a new game, unsaved continuation, Save now, Safe Return, and Emergency Tow solve different problems. None should be described as a universal “recover everything” command. A new game is not a backup restore. Safe Return is not save repair. A tow does not refill fuel. Reloading does not pause the world's catch-up clock. Failed persistence should remain visible instead of being masked by a normal-looking last-save label.

**Source owners:** [`src/persistence/IndexedDbSaveRepository.ts`](src/persistence/IndexedDbSaveRepository.ts); [`src/persistence/SaveSchema.ts`](src/persistence/SaveSchema.ts); [`src/persistence/SaveMigrations.ts`](src/persistence/SaveMigrations.ts); [`src/persistence/offlineDelta.ts`](src/persistence/offlineDelta.ts); [`src/ui/StartScreen.tsx`](src/ui/StartScreen.tsx); [`src/ui/EscapeMenuModal.tsx`](src/ui/EscapeMenuModal.tsx); [`src/app/GameApp.ts`](src/app/GameApp.ts).

## 20. Audit findings and gameplay-contract risks

The register contains 26 retained records, including two resolved-in-source historical entries (A01 and A11), not 26 demonstrated bugs. These findings do not mean the game was played and observed failing. “Confirmed mismatch” means the inspected source owners disagree; “risk” means the consequence needs a browser reproduction. No gameplay code was changed by this audit. Priorities below are review priorities for player impact, not a measured production incident severity.

| ID | Priority / aspect | Evidence level | Finding | Required decision / verification | Source owners |
| --- | --- | --- | --- | --- | --- |
| A01 | Resolved-in-source — logistics | Rechecked current guard | Safe Return now refuses a carried physical fish before the active-boat branch, closing the earlier on-foot shortcut. | Keep as historical, not an active defect. Test foot/boat recovery with loaded/empty states on both islands; refusal must preserve position and ownership. | NavigationDomain.ts; EscapeMenuModal.tsx |
| A02 | High — time clarity | Confirmed source behavior | Ordinary panels block input but only the Pause stack stops time. | Players may lose crop/fish freshness or contract time while reading. Show a consistent time-running/paused cue or deliberately change the policy; preserve child-of-Pause behavior. | ModeController.ts; GameUI.tsx |
| A03 | High — input discoverability | Confirmed binding mismatch; reachability risk | A Read Water prompt advertises R, while R is bound to lure toggling. | Align the prompt with an actual action. Test whether E selection is consistently reachable beside competing basic-cast/school candidates; do not assume changing text alone fixes priority. | GameApp.ts; InputRouter.ts |
| A04 | High — progression accuracy | Confirmed dual gate | A recipe’s raw Processing XP can be lower than its effective rank-table gate. | Use the same effective unlock query for station rows, guide text, almanac/help, and external documentation. Do not promise a recipe from its raw field alone. | ProcessingDomain.ts; progression.ts; recipes.ts |
| A05 | High — persistence / transport | Source-derived risk | Offline catch-up calls motor-fuel drain using saved boat state without a corresponding offline travel loop. | Save while moving, close, and continue. Verify whether fuel disappears despite the vessel remaining in place; settle the intended policy and normalize speed appropriately. | offlineDelta.ts; NavigationDomain.ts |
| A06 | Medium — trade clarity | Confirmed distinct lanes | Regular physical-fish sales require a carried pack at Village, but contracts can consume qualifying cargo at Harbor/Cove. | Every prompt/market heading should distinguish sale from delivery. A “fish market” label alone cannot teach the inland trade leg. | MarketDomain.ts; ContractDomain.ts; markets.ts |
| A07 | Medium — cargo UI | Confirmed exclusion | Generic/bulk fish sale handlers exclude the eleven current trade-pack species. | Hide or explain empty/non-applicable bulk-hold selling controls; do not advertise “sell all sport fish” from the presence of a callback. | MarketDomain.ts; MarketModal.tsx |
| A08 | Medium — boat restow | Confirmed remaining asymmetry | Physical fish auto-stow on landing and can be collected from boats, but no manual boat-restow/rearrangement command was established. Carriage loading is now implemented separately. | Test boat→hands→cart→hands→counter. Do not mislabel cart loading as a general boat loading interface. | CargoDomain.ts; Carriage.ts; Simulation.ts; LogisticsLedgerModal.tsx |
| A09 | Medium — supply clarity | Confirmed resource routing | Refuelling consumes satchel fuel, while ice can be supplied from accessible boat stores; built-in iced holds need no consumable. | The vessel console should explain “Take fuel to satchel” and distinguish passive built-in cooling from paid loose-ice coverage. | NavigationDomain.ts; calculateFreshness.ts |
| A10 | Medium — input/resource choice | Confirmed automatic priority | Chumming chooses among owned chum types by priority rather than exposing a player selection in the inspected normal action. | A player can spend specialty chum unintentionally. Show the exact consumed type before use, or add an explicit selection policy. | FishingDomain.ts |
| A11 | Resolved-in-source — recovery copy | Rechecked current wording | Safe Return now names safety, Starter Garden/Sunreach alternatives and the physical-cargo restriction. | Retain historical ID; confirm both actual destinations and current refusal behavior match the message in a browser. | NavigationDomain.ts; EscapeMenuModal.tsx |
| A12 | Medium — purchase clarity | Confirmed value distinction | Rowboat catalogue value is not its story commissioning cost; skiff source gate is 7,500 Fishing XP. | Use the real commissioning/purchase inspector for cost/gate text. Audit any fallback string still advertising 15,000 XP for the skiff. | boats.ts; quests.ts; NavigationDomain.ts; GameApp.ts |
| A13 | Medium — Work expectation | Confirmed behavior / wording risk | Live passive Work recovery exists, while some source comments describe Work as earned rather than passively regenerated; rest is bounded, not full. | Unify player-facing instructions around live regen, earned daily cap, meal limit, and bounded dawn restoration. | ProgressionDomain.ts; offlineDelta.ts |
| A14 | Medium — travel estimates | Confirmed simplification | Chart ETA is straight-line distance at generic speeds. | Label it approximate; do not imply safe routing, fuel sufficiency, or actual skiff/rowboat travel time. | WorldMapModal.tsx |
| A15 | Medium — loss prevention | Regression-test requirement | Bulk sale does not reserve goods needed for pending quests/orders; pending confirmations can become stale as state changes. | Keep live revalidation and make sell-all scope obvious. Test buying/selling while time and contract state update. | MarketModal.tsx; MarketDomain.ts |
| A16 | Medium — reward capacity | Regression-test requirement | A pending basic catch, completed station job, quest item reward, or discovery cache can encounter full storage. | Verify atomic retry: no lost catch/items, no repeat reward, no repeated RNG draws, no paid partial completion. Discovery-cache full-capacity retry needs explicit coverage. | FishingDomain.ts; ProcessingDomain.ts; QuestDomain.ts; discoveries.ts |
| A17 | Low — fishing description | Source behavior / copy risk | Sport-fish grade is selected with the encounter rather than being a guaranteed bonus for a visually clean fight. | Do not claim that clean combat-style performance deterministically upgrades the fish unless the quality rules are changed. | FishingDomain.ts |
| A18 | Low — equipment expectation | Confirmed behavior | Field and Sea save clothing only; Try On does not save/equip. | Keep “Clothing only” and preview status visible; consider a separate full-loadout feature rather than implying one already exists. | equipment.ts; CharacterScreen.tsx |
| A19 | Low — information fidelity | Confirmed category distinction | Bulk produce excludes Flax and Ground Grain because their categories differ from produce/grain. | Explain eligible categories on the bulk ticket; names alone are not sufficient. | items.ts; MarketDomain.ts |
| A20 | Low — catalogue versus live feature | Not established | Cold storage/crate types, hull state, descriptive net text, and inherited buildings can suggest systems with no normal action path. | Do not advertise cold-store construction, repair, net deployment, house building, or leases until there is a reachable handler and UI. | Simulation.ts; core/types.ts; items.ts; NavigationDomain.ts |
| A21 | High — shipping boundary | Runtime/build verification needed | A debug query parameter is read by the UI and diagnostic callbacks include money/time/weather/school changes. | Verify production gating and save isolation. Keep diagnostic access out of the earned-gameplay feature list. | GameUI.tsx; GameApp.ts |
| A22 | Medium — accessibility | Source affordances, not completed QA | Keyboard/focus/reduced-motion support exists, but full screen-reader and touch/device play was not executed. | Run the real minigames, nested dialogs, confirmations, chart, and inventory under assistive input and high zoom before making compatibility claims. | HUD.tsx; DialogueModal.tsx; StartScreen.tsx; modal components |
| A23 | Medium — filtered item selection | Source-derived UI risk | A dimmed nonmatching occupied satchel socket still has pointer-selection handling, while keyboard navigation and selection repair operate on matching entries. | Under an active filter, compare pointer and keyboard selection/focus. Decide whether dimmed entries are disabled, inspectable or filter-resetting instead of letting selection snap back without explanation. | InventoryModal.tsx |
| A24 | Medium — reload/save safety | Source-derived recovery risk | The preload-error listener immediately reloads without a local retry cap or save-aware guard. | Test persistent missing chunks and an unsaved session; prevent uncontrolled reload loops and misleading loss/recovery claims. Repository cache rules are not verified deployed headers. | index.html; GameApp.ts; public/_headers |
| A25 | Medium — freight visibility | Confirmed information boundary | The cart holds two physical fish, but Hold & Stores totals and tabs enumerate vessels only. | Label vessel scope accurately and inspect a loaded parked carriage. Decide whether cart occupancy needs a separate ledger projection; do not report vessel totals as all freight everywhere. | CargoDomain.ts; LogisticsLedgerModal.tsx; GameApp.ts |
| A26 | High — installation overlay integration | Source-derived mode/input risk | PWA installation uses local UI state outside the gameplay modal stack; manual opening closes Pause, automatic eligibility does not exclude fishing, and the accessibility hook only consumes Tab/Escape. | Test held input, WASD/hotkeys, active fishing, clock/freshness, dismissal and return-to-Pause. Route through the existing modal/input contract or explicitly add equivalent guards; do not rely on aria-modal alone. | GameUI.tsx; usePwaInstall.ts; PwaInstallPromptModal.tsx; useModalAccessibility.ts; ModeController.ts |

### Assessment of what the game offers versus what remains unproved

The source establishes a connected livelihood game, not just unrelated farming and fishing demos: farm inputs feed angling, catches restore soil, physical cargo gives boats and inland delivery a role, preserved food creates a cross-channel trade lane, and story/proficiency gates expose progressively harder work. The high-value next audit is **end-to-end attainability and usability**, not a new feature wishlist: can a fresh save reach each promised unlock without obscure prompts, stranded inventory states, or invalid expectations about time?

This master does not claim that the entire game is bug-free, balanced, optimally paced, or fully attainable. It records the implemented rules and the exact places where runtime evidence is still needed.

## 21. Canonical command coverage index

**Inspected command names: 63.**

The following index accounts for every command name found in the inspected `Simulation` dispatch surface. It deliberately includes internal helpers and compatibility handlers instead of treating all of them as separate visible buttons. The UI also has the non-command interactions catalogued in section 18.

**Access labels:** Player = connected normal interaction; Helper = internal/alternate command used beneath a player-facing flow; Legacy = retained compatibility path whose current normal content reachability is constrained. A player-facing command is still subject to its domain's full guards.

| Command | Access | Operation | Section | Guard / interpretation |
| --- | --- | --- | --- | --- |
| physics.commit | Helper | Commit resolved physical player/vehicle state. | 03 / 14 | Not a menu action or player-editable teleport payload. |
| player.face-target | Helper | Face a selected interaction target. | 03 | Presentation/interaction preparation, not a free movement command. |
| player.reset-safe | Player | Request Safe Return. | 14 / 19 | Mode, vessel, cargo, and location-specific recovery rules. |
| inventory.sort-satchel | Player | Tidy the satchel. | 09 / 18 | No new items or capacity. |
| inventory.transfer | Player | Stow/take item stacks between satchel and vessel stores. | 09 / 14 | Valid quantities, accessible boat, source stock, destination capacity. |
| boat.board | Player | Board an eligible vessel. | 14 | Owned/unlocked, correct mode and proximity. |
| boat.dock | Player | Dock and disembark. | 14 | Eligible matching mooring and safe landing. |
| boat.refuel | Player | Consume satchel fuel to top up the motorboat. | 14 | Fuel item, access, motorboat, non-full tank. |
| boat.emergency-tow | Player | Pay for eligible empty-fuel boat recovery. | 14 | Aboard eligible vessel, empty fuel, 25 G. |
| mount.board | Player | Ride donkey or board carriage bench. | 14 | Actor-specific grounded/proximity checks. Donkey allows a carried pack; carriage requires loading it first. |
| mount.dismount | Player | Leave donkey or carriage. | 14 | Safe actor-specific dismount position required. |
| boat.purchase-skiff | Player | Buy the coastal motor skiff. | 14 | Harbor service, 850 G, Fishing 7,500, not already owned. |
| crop.plant | Player | Plant at a validated world position. | 05 | Footprint, ground, reach, access, seed, XP, Work, capacity. |
| crop.plant-near | Helper | Resolve a nearby acceptable crop placement. | 05 | Does not waive normal placement checks. |
| crop.water | Player | Water a reachable living dry crop. | 05 | Moisture threshold, Work, valid target. |
| crop.harvest | Player | Harvest ripe crops or clear withered instances. | 05 | Living harvest needs output room and Work; withered clearing differs. |
| farm.apply-fertilizer | Player | Restore field fertility. | 05 | Correct field/reach, fertilizer and Work if an actual application. |
| farm.irrigate | Player | Manually water a field from its well. | 05 | Installed feature, location, eligible crops, Work. |
| farm.buy-irrigation | Player | Buy the field-pump feature. | 05 | Story/location/ownership state and 120 G. |
| player.rest-until-dawn | Player | Rest at the farmhouse until the next morning. | 04 / 19 | Interior and dusk/night; bounded Work restoration; time advances. |
| item.consume | Player | Eat a cooked Work provision. | 04 / 09 | Edible satchel item, state, daily meal/earning/pool limits. |
| labor.start | Player | Begin a nearby timed chore. | 06 | Station, mode, proximity, earning eligibility. |
| labor.strike | Player | Attempt the current meter timing. | 06 | Active session, timing band/cooldown, reward limits. |
| labor.cancel | Player | Leave the chore. | 06 | No reward simply for opening/cancelling. |
| processing.start | Player | Commit a station recipe. | 07 | Station, effective unlock, materials, Work, no occupying job, equipment reservation rules. |
| processing.collect | Player | Collect completed station output. | 07 | Job complete, physical access, output space; atomic collection. |
| equipment.equip | Player | Equip owned clothing/tool. | 08 | Ownership, valid slot, no incompatible active action. |
| equipment.equip-rod | Player | Change the owned fishing rod. | 08 | Ownership and equipment-state checks. |
| equipment.save-preset | Player | Save Field/Sea clothing. | 08 | Captures actual head/outerwear/feet, not local preview. |
| equipment.apply-preset | Player | Wear saved Field/Sea clothing. | 08 | Clothing only; validate ownership and state. |
| fishing.cast-basic | Helper | Start a direct basic cast with supplied/default power. | 10 | Alternate path still governed by fishing admission rules. |
| fishing.start-charge-basic | Player | Begin free cast charging. | 10 | Eligible basic-fishing context. |
| fishing.release-cast-basic | Player | Commit cast power and paid inputs. | 10 | Sufficient Work/supplies and still-valid habitat/species context. |
| fishing.hook-bite-basic | Player | React to a bite. | 10 | Correct phase and reaction window. |
| fishing.control-basic | Player | Hold/release the basic catch bar. | 10 | Only the active basic minigame. |
| fishing.cancel-basic | Player | Cancel an unfinished basic attempt. | 10 | Phase-dependent; caught reward not silently discarded. |
| fishing.discard-basic-catch | Player | Explicitly abandon the pending caught result. | 10 | Different from dismissing an escaped attempt or releasing landed cargo. |
| fishing.commit-basic | Player | Collect fish/treasure from the finished basic minigame. | 10 | Atomic storage/landing/reward checks. |
| fishing.chum-school | Player | Spend chosen-by-priority chum on a local school. | 11 | Accessible viable school, supply and school-state checks. |
| fishing.hook-school | Player | Hook a viable feeding-school fish. | 11 | Armed lure, rod/habitat/grade/cargo feasibility and Work. |
| fishing.toggle-lure | Player | Arm or put away the next Woven Lure. | 10 / 11 | R input; not a Read Water command. |
| fishing.set-drag | Player | Choose Light, Balanced or Heavy drag. | 11 | Only notches 0, 1, 2 are accepted; invalid input is rejected, not silently clamped. |
| fishing.control | Player | Reel, slack, brace, or counter-steer a sport fish. | 11 | Active encounter; inputs do not move the avatar simultaneously. |
| cargo.discard | Player | Remove/process accessible physical cargo. | 13 | Freshness/access/output-space rules; no duplicate scraps. |
| cargo.release | Player | Release a fresh accessible physical catch. | 13 | Clears actual owner pointer; no sale reward. |
| cargo.load-carriage | Player | Load an eligible carried fish into the cart. | 13 / 14 | Rear access, grounded on foot, valid ownership, small/medium class, first free of two slots. |
| cargo.pickup | Player | Take a boat/cart catch into free hands. | 13 / 14 | Correct source access and backlink, empty carry slot; not a supply-stack transfer. |
| market.sell-item | Player | Sell an ordinary item quantity. | 15 | Accepted commodity, stock, proximity, validated quote. |
| market.sell-produce-bulk | Player | Sell eligible produce/grain rows. | 15 | Category/market restrictions and atomic multi-row settlement. |
| market.buy-seed | Player | Buy seeds/saplings. | 15 | Retail crop list, crop gate, stock/funds/room. |
| market.buy-item | Player | Buy a retail supply. | 15 | Retail item list, stock/funds/room. |
| market.buy-rod | Player | Buy and equip a rod. | 08 / 15 | Previous owned rod, Fishing XP, retailer and price. |
| market.equip-rod | Player | Equip owned tackle at a stall. | 08 / 15 | Tackle service and ownership; need not be that stall’s current sale row. |
| market.sell-fish | Legacy | Generic eligible non-trade-pack cargo sale. | 15 | Current physical trade-pack species explicitly excluded. |
| market.sell-trade-pack | Player | Sell an individual carried physical fish inland. | 13 / 15 | Village, carried pointer, payable fresh cargo. |
| market.sell-fish-bulk | Legacy | Bulk-sale eligible non-trade-pack cargo. | 15 | Not a way to remotely sell the current sport hold. |
| contract.deliver-items | Player | Deliver a valid quantity against a posted order. | 15 | Active order, destination, remaining quantity, satchel items. |
| contract.deliver-fish | Player | Deliver a qualifying individual physical fish. | 15 | Destination/access and all grade/freshness/weight/species requirements. |
| contract.pass | Player | Replace an untouched posted order. | 15 | No partial delivery; not a refund-abandon path. |
| quest.talk-npc | Player | Resolve an eligible conversation/objective/turn-in. | 16 / 18 | NPC availability/proximity, current objective, cost/reward capacity. |
| quest.claim-reward | Helper | Canonical reward-settlement helper beneath quest interaction. | 16 | Not a remote claim button bypassing NPC hand-in validation. |
| quest.record-hint | Helper | Record first-use hint knowledge. | 02 / 18 | Does not complete unrelated gameplay objectives. |
| quest.focus-track | Player | Choose the HUD’s emphasized quest track. | 16 / 18 | Other open tracks remain active. |

### Informational query families

Queries expose world HUD, satchel and item inspection, seed belt/placement/crop inspection, station recipes/jobs, character equipment, skill progress, labor HUD/stations, basic/sport fish information, nearby market, market board/quotes/demand trend, contract/expedition opportunities, hold stores, map, farm forecast, journal/almanac, pause summary, current quest/NPC state, and boarding/docking feasibility.

A query must not spend money/items/Work, grant a catch, mutate quest progress merely by hovering, advance a random outcome every time a panel rerenders, or authorize a later transaction without revalidation. A renderer predicting a valid action must still dispatch the real guarded command at commit.

### Complete declared query index

**Declared query names: 30.** These are the `GameQuery` union/dispatch entries, not every direct inspector helper. Water reading, parallel-quest DTOs, people/notices, and local UI state are covered separately; they are not invented extra `GameQuery` strings.

| Query | Information provided | Boundary / section |
| --- | --- | --- |
| market.nearby | Identify nearby counter | 15; no remote-trade permission |
| world.get-hud | Resources/context/tools/compass/world guidance | 03 / 04 / 18 |
| expedition.get-board | Opportunity/readiness information | 18; not expedition dispatch |
| cargo.get-hold-stores | Satchel, vessel stock/cargo, carried catch | 09 / 13 / 18; cart excluded from vessel totals |
| inventory.get-satchel | Satchel sockets and item information | 09 / 18 |
| inventory.inspect-item | Selected item purpose/details/action eligibility | 09; no consumption |
| world.get-map | World/chart information | 17 / 18; no teleport |
| journal.get-pages | Narrative/records journal projection | 16 / 17 / 18 |
| journal.get-almanac | Fish/crop reference and earned records | 05 / 12 / 17 / 18 |
| world.get-pause | Pause/recovery information | 18 / 19; query itself does not pause |
| weather.get-farm-forecast | Local farm weather outlook | 04 / 18 |
| fishing.get-sport-hud | Fight tension/decision/drag/telemetry | 11; no control mutation |
| labor.get-hud | Current chore meter/band | 06 |
| labor.get-stations | Stations, daily use, proximity/availability | 06; start/strike revalidate |
| progression.get-skills | Four profession XP/rank readouts | 04 / 18 |
| market.get-board | Buy/sell/tackle/cargo/order board | 15 / 18 |
| market.demand-trend | Projected commodity demand | 15; current-stock assumption |
| market.quote-sale | Proposed ordinary-item sale price | 15; not a price reservation |
| market.quote-purchase | Proposed purchase price | 15; no stock/funds reservation |
| boat.can-board | Boarding feasibility | 14 |
| boat.can-dock | Active-boat docking feasibility | 14 |
| crop.validate-placement | Footprint/seed/crop/location validity | 05; plant rechecks at commit |
| crop.inspect | Live planted-crop state and action blockers | 05 |
| crop.get-seed-belt | Available seed choices/counts | 05 / 18 |
| processing.inspect | Station job/remaining time | 07 |
| processing.get-station | Recipe rows, requirements, occupying job | 07 / 18 |
| equipment.get-character | Owned/equipped gear, outfits, reservations | 08 / 18 |
| crop.find-placement | Nearby valid placement candidate | 05; helper, not autoplant |
| quest.get-active | Focused quest information | 16 / 18; parallel-thread helpers are separate |
| npc.get-nearby | Nearby NPC at resolved schedule/quest anchor | 16 / 17 |

### Primary source map for maintaining this master

| Concern | Primary implementation/content | Cross-check |
| --- | --- | --- |
| Input / modes / interaction priority | src/input/InputRouter.ts; src/app/GameApp.ts; src/app/ModeController.ts | src/ui/keybindings.ts; HUD.tsx; MobileControls.tsx |
| Command dispatch / core state | src/simulation/Simulation.ts; src/simulation/core/types.ts; src/simulation/core/contracts.ts | createInitialState.ts; GameClock.ts |
| Farms / crops | src/simulation/domains/FarmingDomain.ts; src/content/crops.ts | OnboardingPace.ts; crop growth/environment helpers |
| Work / ranks / meals / labor | src/simulation/domains/ProgressionDomain.ts; LaborDomain.ts; src/content/progression.ts | src/simulation/labor/LaborStations.ts; items.ts |
| Recipes / equipment | src/simulation/domains/ProcessingDomain.ts; EquipmentDomain.ts; src/content/recipes.ts; equipment.ts | CraftingModal.tsx; CharacterScreen.tsx |
| Fishing | src/simulation/domains/FishingDomain.ts; src/content/fish.ts; rods.ts | BasicFishingMinigame.ts; seasonalAvailability.ts; sport-fishing helpers |
| Physical cargo / cooling | src/simulation/domains/CargoDomain.ts; src/simulation/fishing/calculateFreshness.ts | LogisticsLedgerModal.tsx; catch-inspection components |
| Boats / donkey / carriage / recovery | src/simulation/domains/NavigationDomain.ts; src/content/boats.ts; src/simulation/mounts/Carriage.ts; Mounts.ts | PhysicsWorld.ts; GameApp.ts; EscapeMenuModal.tsx; world moorings/locations |
| Trade / orders | src/simulation/domains/MarketDomain.ts; ContractDomain.ts; src/content/markets.ts; contracts.ts | MarketModal.tsx; economy valuation/market-tick helpers |
| Story / people / discovery | src/simulation/domains/QuestDomain.ts; src/content/quests.ts; questTracks.ts; discoveries.ts; knowledge.ts | JournalModal.tsx; DialogueModal.tsx; QuestTrackerHUD.tsx |
| Completion / planning | src/content/records.ts; src/ui/components/AlmanacPage.tsx; WorldMapModal.tsx | ExpeditionBoard.tsx; expedition-opportunity query builder |
| Startup / persistence | src/persistence/IndexedDbSaveRepository.ts; SaveSchema.ts; SaveMigrations.ts; offlineDelta.ts | StartScreen.tsx; GameApp.ts; EscapeMenuModal.tsx |

**Source owners:** [`src/simulation/Simulation.ts`](src/simulation/Simulation.ts); [`src/simulation/core/contracts.ts`](src/simulation/core/contracts.ts); [`src/simulation/core/types.ts`](src/simulation/core/types.ts); [`src/ui/GameUI.tsx`](src/ui/GameUI.tsx); [`src/app/GameApp.ts`](src/app/GameApp.ts).

## 22. Exhaustive regression checklist for the audited interaction surface

**Execution status: not run in this audit.** These are acceptance tests derived from the source audit, not a claim that the repository's tests pass. Run them on the pinned revision or an explicitly recorded successor, with browser/build/device details and evidence. Existing tests named in `AGENTS.md` remain useful, but their current results were not fetched or executed here.

For any economy-changing action, test success, every exposed blocker, one-unit/zero/negative/fractional/extreme quantities where relevant, double activation, input interruption, and save/reload. On refusal, verify no accidental money/Work/item/quest/RNG mutation. On success, verify each owner changes once and each event/reward is emitted once.

| Area | Test case | Required evidence / expected result |
| --- | --- | --- |
| Startup | Fresh storage → Begin | Correct initial time/money/gear/items/quest; rowboat still gated. |
| Startup | Readable save → Continue | Correct saved state, one catch-up application, no duplicate rewards. |
| Startup | Corrupt primary + good backup | Recover readable backup; next failed save does not destroy it. |
| Startup | Future/incompatible schema | Truthful incompatibility/replacement decision; do not silently wipe sole copy. |
| Startup | IndexedDB blocked / timed out | Offer explicit unsaved continuation; Save now disabled/accurately reported. |
| Startup | New Game / unsaved confirmations | Cancel initially focused; Escape cancels; only confirmation triggers consequential action. |
| Startup | Fullscreen and mobile landscape refusal | Visible recoverable message/gate; do not claim a successful browser lock. |
| Input | WASD/arrows/Shift/Space across modes | Correct walk/mount/boat behavior; Work distinct from stamina; no conflicting action. |
| Input | Right-click versus right-drag | Inspection/cancel only on intended click; orbit does not accidentally destroy placement. |
| Input | Lost focus while holding action/reel/Alt | Held state clears; no stuck movement, reel, or overlay. |
| Input | Press each 1–5 hotbar slot in each context | Correct dynamic tool; no stale binding after mode change. |
| Input | Read Water prompt / R / E near water | Resolve the identified mismatch and test competing target priorities. |
| Input | F forecast with typing/modals/fishing/placement | Only intended context toggles; Escape goes to the correct topmost surface. |
| Input | Cancel before and after action commit | Before commit spends nothing; after commit does not duplicate or undo economic state. |
| Pause | Open each panel directly versus from Pause | Direct panel follows time-running policy; Pause child remains frozen and returns to Pause. |
| Farm | Place all ten crops at valid/invalid edges | Footprints, overlaps, clearances, reach, XP, seed, capacity, and ground checks agree. |
| Farm | Confirm stale placement after moving/changing state | Commit revalidates; no seed or Work spent on refusal. |
| Farm | Water at 84/85/full moisture and withered state | Only eligible living dry crop changes; costs and XP occur once. |
| Farm | Fertilize depleted/full field | Shared field fertility, capped gain, appropriate no-op and quest event behavior. |
| Farm | Buy pump twice / at wrong well / without money | No double charge; unlock/location guards enforced. |
| Farm | Irrigate each field, mixed wet/dry/dead crops | Only eligible field crops affected; one action cost; all-wet no-op truthful. |
| Farm | Harvest ripe/overripe/withered/full inventory | Primary output atomic; secondary Plant Matter rules; withered clear free and yieldless. |
| Farm | Apple/Olive harvest → regrowth → wither | Tree persists only through live harvest, correct regrowth, dead clearing does not refund sapling. |
| Farm | Tutorial wheat and first worm job | Acceleration only until/for authored conditions; ordinary later rates restored. |
| Work | Spend last affordable Work and attempt next action | Actual cost reflects skill/gear rounding; failed action consumes nothing. |
| Work | Live recovery at full/partial pool and during Pause | Correct 8-per-300-second behavior and no banked unlimited full-pool recovery. |
| Work | Rest at day/dusk/night / repeated rest | Interior/time guards; bounded restoration; all elapsed world systems advance correctly. |
| Work | Eat three meals, fourth meal, full pool, daily cap | Correct quantity/day/earning handling; no accidental waste on blocked consumption. |
| Labor | All three stations: start, hit, miss, cancel, walk away | Timing, proximity, session cancellation, reward cap, and no free rewards from reopen. |
| Processing | Each of 30 recipes at its valid station | Exact inputs/output/time/Work; raw and rank gates match displayed availability. |
| Processing | Start second job at occupied station | No queue overwrite, ingredient loss, or missing equipment reservation. |
| Processing | Collect too early / remotely / full storage / twice | No loss, output duplication, or unearned Processing XP. |
| Equipment | Every specialist item and five rods | Correct slot/ownership/effect; starter replacement retained; no consumable stack duplication. |
| Equipment | Try On, close, reopen; Save/Wear Field/Sea | Preview never commits; presets alter clothing only; actual outfit saved. |
| Equipment | Change gear during pending action / fishing | State guards keep committed cost/rod assumptions coherent. |
| Inventory | Search/filter/Tidy / keyboard grid | Fixed sockets, dim nonmatches, matching-occupied navigation, correct Clear versus View All Items, no quantity changes. |
| Inventory | Stow/Take on accessible versus remote boats | Whole-row quantities; source/destination capacity and pointer ownership agree. |
| Basic fishing | Each eligible species / habitat / rod | Correct Neva/Sunreach pool; Bream physical exception preserved. |
| Basic fishing | No bait / optional bait / armed lure | Correct optional admission and exact consumption at paid release. |
| Basic fishing | Free charge cancel / paid attempt cancel | No cost for free cancellation; no false refund for paid failed attempts. |
| Basic fishing | Early/late bite; bar win/loss/perfect | Correct phase transitions, XP, Work rebate, and controls. |
| Basic fishing | Treasure + full satchel + repeated Collect | Atomic capacity retry, one reward/RNG outcome, explicit discard distinct from close. |
| Sport fishing | Unfed/fed/depleted/expired school | Valid chum/hook loop, feeding windows, capacity and depletion; no infinite school rewards. |
| Sport fishing | Own standard/rich/deep chum together | Document and verify actual consumption priority, especially specialty chum. |
| Sport fishing | No lure / wrong rod / insufficient Work / no landing slot | Refusal spends nothing; preflight remains valid for actual rolled fish. |
| Sport fishing | Reel/slack/brace/left/right/drag via keyboard and touch | Input exclusivity, line/tension/stamina effects, no simultaneous world movement. |
| Sport fishing | Land and lose each cargo class | Correct slot choice, pointer state, grade/weight record, loss refund and lure consumption. |
| Sport fishing | Compare peak/shoulder/opposite seasons | Correct weighting and habitat fallback, no false always-available species claims. |
| Cargo | Auto-land; take large catch into hands | Class compatibility at landing; intended large-pack pickup and carry-speed behavior. |
| Cargo | Release / discard fresh / clear spoiled while full | Correct resource consequences and no dangling cargo pointers. |
| Cooling | Built-in iced slot with zero loose ice | Cooling persists without consuming an item. |
| Cooling | Multiple fish sharing one ice inventory | One eligible hourly inventory charge, not one ice per fish. |
| Cooling | Leave a boat that used satchel fallback ice | No remote cooling; boat-specific temperature and supply owner used. |
| Cooling | Freshness at 90/75/50/25/1/0 boundaries | Correct price/eligibility and contract freshness floors. |
| Boats | Rowboat before/after commissioning | 30 G + grain charged once; access unlock exact; catalogue value not charged. |
| Boats | Skiff purchase boundary at 7,500 Fishing XP | Correct funds/gate/proximity; full initial tank; no duplicate skiff. |
| Boats | Motor idle/movement, manual rowing, near-zero speed | Fuel drain matches intended threshold/speed ratio. |
| Boats | Fuel only in boat stores / partial or full tank | Refuel requires satchel path; full tank rejects; one can tops up as designed. |
| Boats | Dock at every authored reachable mooring | Collision/position/compatibility and safe disembark; no shore softlocks. |
| Recovery | Tow with/without 25 G, fuel, active boat | Only eligible tow; cargo/fuel preserved and correct mooring. |
| Recovery | Safe Return on foot/boat/mount, both islands, with cargo | Verify current carried/loaded-cargo refusals and updated two-island wording; the historical shortcut stays closed. |
| Markets | Buy/sell each retailer category | Retail versus commodity distinction; correct crop/tackle gate, stock and price. |
| Markets | Invalid quantity draft / very large quantity / repeat click | No invalid transaction; finite counts/prices and atomic affordability/capacity. |
| Markets | Sell selected stack/all produce at confirmation threshold | Correct live total/scope and confirmation reset on tab/market change. |
| Markets | Sell physical pack at Harbor versus Village | Normal trade-pack refusal at harbor; carried-pointer requirement at Village. |
| Markets | Bulk fish with all current physical species | No hidden bypass of trade-pack restrictions or remote hold sales. |
| Markets | Buy/resell materials across stalls and stock extremes | No unintended markup/arbitrage inversion; sequential quote integrity. |
| Contracts | Post and complete each of 28 template families | Practical feasibility, destination, reward and appropriate quest event. |
| Contracts | Partial delivery then Pass / expiry | Pass blocked after partial; correct item/gold settlement; no completion XP on expiry. |
| Contracts | Physical fish with one failed predicate at a time | Species, grade, freshness, weight, location and access all independently enforced. |
| Contracts | Board slots before/after Artisan and charter | 3 → 4 / extra charter slot as intended; finite history and no duplicate active template. |
| Story | Fresh-save main spine through Open Horizons | Every gate attainable in order; no required quest counter silently stalls. |
| Story | All three side tracks concurrently | Correct activation, focus, independent progress, herald and return-to-NPC handling. |
| Story | Paid hand-in missing money/items; reward bag full | No partial costs/rewards, no duplicated unlock after reopen/reload. |
| Story | Skip/reread dialogue pages | Presentation independent of one-time talk/reward resolution. |
| Discovery | All thirteen arrivals and cache with full satchel | Correct arrival mode/radius, one-time reward, retry without loss. |
| Records | Discovery, weight/grade bests, 20-harvest mastery | Derived goals agree with journal; sale/release does not erase earned record. |
| Map | Pan/zoom/select directory/click pin/clear pin | No accidental pin on drag; labels/navigation usable; ETA marked approximate. |
| Expedition | Steady/Bold selection and readiness blockers | Advisory only; no hidden reward or progression from selecting a notice. |
| Save | Manual save while rapidly changing state | Frozen consistent snapshot; timestamp only after successful commit. |
| Offline | 0/negative/short/72h/beyond-72h absence | Correct whole-minute cap, weather segments, jobs, crops, cargo, orders, rest, playtime. |
| Offline | Save a moving motorboat then return | Fuel and position follow an intentional, tested rule. |
| Accessibility | Nested modal focus, keyboard-only, high zoom, reduced motion | No inaccessible confirmation, trapped focus, hidden active controls, or forced typewriter. |
| Touch | Landscape gate, joystick, camera, tool use, both fishing modes | Equivalent action guards; pointer cancel clears holds; real device performance documented. |
| Diagnostics | Production build with debug parameter / normal save | Expected shipping restriction or explicit documented access; no accidental normal-save contamination. |

### Second-pass regression additions

The original 85 scenarios above are retained, with stale expectations corrected. These 40 additional scenarios bring the checklist to **125 unexecuted acceptance cases**. A source-derived risk requires a recorded reproduction before it can be reported as a demonstrated browser failure.

| ID | Area | Scenario | Acceptance / observation |
| --- | --- | --- | --- |
| R01 | Carriage acquisition | New game and predecessor save | One inherited cart; two slots; correct animal budget; no duplicated vehicle or reset unrelated holdings. |
| R02 | Carriage access | Approach bench, horse/center, rear separately | Bench and rear admit their own interaction; visual closeness alone is insufficient. |
| R03 | Mount carrying | Board donkey and cart with the same carried fish | Donkey permits rider cargo; cart requires loading first. Refusal preserves all pointers. |
| R04 | Carriage capacity | Load two small/medium packs; attempt third and oversized pack | Exactly two slots, first-free allocation; no replacement/loss; large/gargantuan refused. |
| R05 | Carriage unload | Collect each slot then repeat stale request | Correct source backlink cleared, carried pointer set once, no duplicate cargo. |
| R06 | Carriage mode | Rear action while mounted/aboard/fishing/airborne or separated vertically | Eligibility refusal is atomic; neither proximity alone nor stale UI authorizes transfer. |
| R07 | Carriage footprint | Turn beside walls, through gaps and on steep/invalid ground | Horse/shafts/bed sweep and ground rules stop invalid movement; fish remain attached. |
| R08 | Carriage gait | Exhaust Shift gait, reverse/steer, stop and recover | Actor-specific stamina, braking and turn behavior; no player Work or motor fuel substitution. |
| R09 | Freight settlement | Drive loaded cart to Village; try sale; dismount/unload | Ordinary pack sale still needs the exact carried fish at counter, not parked-cart proximity. |
| R10 | Carriage persistence | Save/reload parked/ridden with zero/one/two fish | Preserve ownership, pose, budget, catch IDs/freshness; no offline automated travel. |
| R11 | Carriage cooling | Cart fish beside player ice, then after travel/absence | Exposed cart storage uses its own temperature; no nonexistent cart ice source. |
| R12 | Donkey freight | Carry all eligible landed pack sizes on foot then ride | On-foot class penalty versus mounted exemption; actual catch/freshness remains real. |
| R13 | Vessel ledger | Switch rowboat/skiff with separate loaded cart | Selected vessel rows and real access checks hold; vessel total is not all world freight. |
| R14 | Human stamina | Exhaust sprint and press jump around a ledge | Separate sprint recovery, buffer/coyote logic; no unintended water or wall traversal. |
| R15 | Camera contexts | Orbit/zoom then enter interior/vehicle/fishing | Contextual bounds and obstruction; manual control remains coherent; sport right mouse slacks. |
| R16 | Gear browsing | Filter categories, Try On, save/apply outfit, close | Only actual equipped clothing saved; filter/preview/rotation never grant equipment. |
| R17 | Mannequin fallback | Drag/release/cancel; simulate model/WebGL failure | No stuck rotation; world pose unchanged; text equipment information remains usable. |
| R18 | Filtered satchel | Click dimmed item then use keyboard under same filter | Explicit consistent selection/focus policy; no unexplained snap, unreachable match or quantity mutation. |
| R19 | Satchel reset | Combine category/query; Clear versus View All; toggle Details | Clear only removes query; reset removes both; Details is read-only. |
| R20 | Tool belt | Hover/focus, nudge, leave, touch and blocked modal | Reveal/collapse is usable; touch needs no hover; unavailable slot never bypasses domain. |
| R21 | Waypoint lifecycle | Pin, pan, close chart, move, reopen, reload | Drag does not pin; HUD/rim guidance follows session pin; reload is not claimed saved persistence. |
| R22 | NPC positioning | Advance phase while final away-earned step ready | Role anchor, target marker and actual talk agree; bark never grants talk credit. |
| R23 | Early work | Water during sowing then advance; repeat on wrong farm | Only opted-in target/location actions bank and redeem once. |
| R24 | Credit accounting | Event matches active and future step; save/reload | No spend-and-bank double credit; bounds/pruning retain only applicable records. |
| R25 | Objective units | Multi-yield harvest and multi-output collected job | Action/batch count not yield quantity; merely ready or started job does not grant collection credit. |
| R26 | Owned acquisition | Activate specific rod/boat/pump objective after ownership | Reconcile actual target; no forced duplicate purchase or replayed completed rewards. |
| R27 | Conversation payment | Several threads need same NPC including paid hand-in | Only spoken talk steps progress; first ask uncharged; failed reward-space settlement atomic. |
| R28 | Meal admission | Just below required pool room or daily-earned room | Full meal grant must fit; refused meal uses neither item nor daily use. |
| R29 | Labor admission | Insufficient clean-yield room; half-band success; miss | Start full advertised grant check; half-success spends daily station use, miss remains retryable. |
| R30 | Labor interruption | Walk away or begin fishing before strike; reload | No remote reward or restored completed meter; incompatible activity cancels session. |
| R31 | Fractional freshness | Price at 1, .5, .01 and 0 freshness | Positive-under-25 uses .3 factor; zero spoiled; other price/lane gates still hold. |
| R32 | Wake/day split | Compare midnight crossing, 08:00 crossing and long absence | Midnight earnings reset distinct from rest; at most one offline dawn grant. |
| R33 | Autosave | Burst events, 60-second threshold, hide-document request | Coalesced/serialized writes; no-save state truthful; timestamp only on successful commit. |
| R34 | Chunk recovery | Persistent missing chunk and deliberately unsaved session | No uncontrolled reload cycle or misleading save guarantee; useful recovery remains available. |
| R35 | Headwater compatibility | Predecessor inside/outside envelope, mounted and invalid upstream boat | Scoped positions/layout recovery; inventory, money, cargo, quest and RNG preservation. |
| R36 | Water access | Normal western coastal fishing and changed headwater | Correct classification and ordinary rod/supply/space guards; no assumed guaranteed staged school or waterfall mooring. |
| R37 | PWA appearance | Touch landscape/portrait, desktop manual, standalone, recent snooze | Show/hide rules exactly match intended eligibility; unsupported browser does not pretend installation. |
| R38 | PWA dismissal | Maybe Later/Close/Escape/Got It; reload; denied localStorage | Seven-real-day snooze when storage works; Got It is not install; graceful nonpersistent dismissal. |
| R39 | PWA browser result | Native accepted/dismissed/no event/throw | Deferred-event lifecycle, truthful unsupported feedback, no duplicate prompts or game rewards. |
| R40 | PWA mode safety | Open manually from Pause and automatically during fishing; hold WASD | Verify time/input freeze or explicit intended policy, correct return to Pause, no background fishing/movement beneath sheet. |

## 23. Maintenance contract and completion boundary

### How to keep this file trustworthy

Record the new audited commit/date after meaningful gameplay changes. Update the command index whenever `Simulation` adds, removes, or renames a command. Update the non-command screen inventory when buttons, tabs, modal rules, shortcuts, or settings change. Recount crop, fish, recipe, equipment, quest, contract, and knowledge catalogues from the authoritative content, rather than editing counts by hand without checking the rows.

Every new gameplay feature should state: **entry point → prerequisites → actual cost → committed mutation → player feedback → failure/cancel behavior → progression consequence → save/offline behavior**. A type or asset alone is not a player feature. A clickable UI with no valid handler is not a completed feature. A handler unreachable from normal input belongs in the helper/legacy/wiring-risk category until its path is established.

When changing a tuning value, update its owner and readouts rather than adding a competing constant here. In particular, keep raw recipe requirements separate from effective rank gates, catalogue price separate from story payment, current fish quality separate from personal best, inventory stacks separate from physical cargo, and time blocking separate from world-input blocking.

### What this audit has and has not completed

**Completed:** a pinned-revision source audit of the core command dispatch, input/application wiring, domain rules, content catalogues, principal UI surfaces, progression chains, storage and offline behavior; a player-facing feature reference; a complete inspected command-name index; explicit mismatches/risks; and an executable-by-a-tester regression checklist.

**Not performed:** a live-browser playthrough, proof that every 3D interaction target can be reached around current collisions, device/performance testing, running the project's test/build suite, verifying every legacy migration branch, or reproducing the remaining wiring risks. The document and accompanying patches change documentation only. Repository-write delivery status is reported separately; a generated document is not a game-test pass.

**Definition of “everything” used here:** all identified gameplay systems, their normal and supporting command paths, every catalogue entry in the tables, non-command user-interface interactions, and consequential failure/persistence rules—not a verbatim dump of every source file or a claim that unexecuted runtime paths have been proven. Remaining uncertainty is named rather than filled with invented features.



## 24. Second-pass reconciliation and evidence ledger

### Snapshot and change boundary

The updated master is pinned to **`2eddf08e78ec5924588052a2e5aaad1bf671cfd7`**, commit timestamp **18 September 2026, 12:19:35 UTC**. It is four commits ahead of the first audit's `eaba083f9064de4b652f988176e6315b30e73516`: chart coordinate support, the world/carriage overhaul, deployment/satchel changes, and the mobile-installation addition.

This is a revision-to-revision reconciliation plus a second coverage pass. It does not pretend the newer carriage/install flow already existed at the first snapshot. Corrections have been applied in the owning sections rather than left as an appendix contradicting the main guide. Existing IDs and catalogue rows were preserved where still valid.

### Reconciliation ledger

| Coverage area | Classification | What changed in this master |
| --- | --- | --- |
| Carriage | Newly implemented upstream | Full bench/rear/drive/load/unload loop, two-pack class limit, movement budget, world collision, preservation, save ownership and counter delivery. |
| Donkey freight | Upstream rule change | Riding with a physical catch permitted; blanket free-hands mount claim removed. |
| Movement/camera | Under-described interactions and newer presentation | Human stamina/load/jump constraints, actor differences, camera context and separate mannequin rotation/fallback. |
| Safe Return | Upstream fixes | Old on-foot carry bypass and Starter-Garden-only confirmation retired as A01/A11 historical entries. |
| Satchel | Upstream redesign plus incomplete prior UI coverage | Fixed sockets, Field label, dim filters, Clear versus View All Items, Details, navigation and pointer-selection risk. |
| Gear/ledger/HUD | Under-described and extended interfaces | Category filters, preview rotation, vessel tabs, cart exclusion, tool-belt browsing, shared local-state waypoint lifecycle. |
| Early work and dialogue | Existing behavior under-described | Bounded opted-in credits, action-count units, exact-target ownership reconciliation, spoken talk credit, paid first-ask protection, schedules and barks. |
| Work/labor | Upstream admission fixes and missing detail | Full discrete grant-room check, half-success daily use, conflicting-activity cancellation, midnight versus dawn. |
| Freshness | Upstream helper correction | Positive sub-1% still uses stale price factor; cart remains exposed with no ice source. |
| World/save | New topology and compatibility | Shoreline/headwater consequences distinguished from new verbs; schema/layout migration and scoped preservation. |
| Deployment | New client recovery | Preload-error reload and its retry/save-safety risk, source cache rules not claimed deployed behavior. |
| PWA installation | Latest upstream interface | Native/instructional/unsupported paths, seven-day snooze, manual reopen, standalone launch, false-success/performance boundaries, and out-of-stack modal risk. |
| Technical coverage | Index omission and new command | 63 command names including cart load, all 30 declared query names, direct inspectors and UI-only controls kept distinct. |
| Audit plan | Expanded verification scope | 26 finding records including two resolved-in-source historical entries; 125 scenarios, none run in this source audit. |

### Catalogue preservation

The comparison changed `src/content/quests.ts` by three additions/three deletions of early mill direction wording, not new quest definitions. The other catalogue owners for crops, fish, items, recipes, equipment, rods, boats, markets, contracts, tracks, NPCs, discoveries, knowledge and record definitions are absent from the changed-file list. Consequently the first catalogue tables are retained: **10 crops, 15 fish species, 30 recipes, 15 equipment pieces, five rods, two boats, 28 contract templates, 45 quests across four tracks, and 13 discoveries**. The newly interactive carriage is a land mount, not a third boat.

The early milling lesson now points to the Village Mill while retaining `struct.starter_mill`. The document applies that wording to its task row. This catalogue reconciliation is a source-diff check, not execution of `content:validate` or proof that every row was reached in a live save.

### What remains unverified

The second pass traced changed source and existing under-described interactions. It did not run a browser campaign, physical collision/route sweep, game build/test suite, deployed cache/header check, installation on a real phone, or screen-reader certification. Test files appearing in the repository are expectations, not pass evidence from this audit.

A23–A26 are focused source-derived concerns about filtered pointer selection, reload safety, cart freight visibility, and the installation sheet's mode/input integration. They are not fabricated observed incidents. Installation manifest claims are kept separate from actual measured performance, enforced orientation, and offline asset availability. The original unresolved findings retain their evidence labels and reproduction requirements.

**Evidence owners:** [`src/simulation/core/contracts.ts`](src/simulation/core/contracts.ts); [`src/simulation/Simulation.ts`](src/simulation/Simulation.ts); [`src/simulation/mounts/Carriage.ts`](src/simulation/mounts/Carriage.ts); [`src/simulation/domains/QuestDomain.ts`](src/simulation/domains/QuestDomain.ts); [`src/content/quests.ts`](src/content/quests.ts); [`src/ui/InventoryModal.tsx`](src/ui/InventoryModal.tsx); [`src/ui/GameUI.tsx`](src/ui/GameUI.tsx); [`src/ui/pwa/usePwaInstall.ts`](src/ui/pwa/usePwaInstall.ts); [`src/persistence/SaveMigrations.ts`](src/persistence/SaveMigrations.ts).

---

*End of the audited gameplay master. Source of truth: the pinned implementation and its canonical repository documentation.*
