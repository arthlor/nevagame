# Game Improvement Recommendations
## Advisory — Not Canonical Until Explicitly Promoted

> **Context lock:** Recommendations must preserve the game's core identity: single-player, browser-first 3D, no combat, farming + fishing + processing + physical logistics + markets, finite capacity, knowledge/capability progression, continuous explorable world, and the locked premium faceted low-poly visual direction.

# 0. Executive Recommendation

The project already has a strong differentiator: **the player grows/produces what makes fishing possible, then physically transports a limited perishable catch through a readable market economy**. Do not improve the game by adding unrelated systems. Improve it by making the existing chain produce more meaningful decisions, stronger anticipation, clearer feedback, and more personal specialization.

Highest-return focus:
1. make **trip preparation** a real planning game;
2. make **fish discovery** more ecological/readable;
3. make **cargo/freshness** create choices without tedious inventory work;
4. make **markets/contracts** predictable enough to plan around but dynamic enough to reward knowledge;
5. make **progression change how the player operates**, not only efficiency;
6. make the world tell the farming/fishing economy visually and sonically.

# Tier 0 — Production Foundation Before P1 World Build

## Gold-Standard Visual Foundation Before Mass Production
**Rating:** BLOCKING PRODUCTION PRACTICE / HIGH VALUE

**Problem:** The reference aesthetic is a major product differentiator. If final visual language first appears at a late "art polish" phase, agents can build large quantities of geometry, materials, water, vegetation and world content around the wrong assumptions; replacing them later is expensive and encourages inconsistent one-off fixes.

**Proposal:** Follow Roadmap P0.5/P0.75 before broad world/content production:
- lock the shared `PaletteTokens`/`PaletteMaterials` vocabulary;
- calibrate one `VisualRenderConfig` rather than per-scene exposure/tone-map hacks;
- prove faceted water/foam, vegetation/rocks, warm-sun/cool-fill lighting, shadows/AO and low-frequency materials;
- approve bridge+river first, then farm, harbor and coast/lighthouse gold slices from the **actual gameplay camera**;
- separate game-vs-game regression metrics from reference style review; references define rendering/asset graphics, not their diorama/layout/camera/DOF.

**Acceptance:** before mass-producing final assets/zones, at least one gold slice scores `04` overall ≥8/10, no category <7, graphics-reference match ≥8/10, meets browser budget, passes the catalog-driven `art:generate:strict` + published `art:validate` + representative determinism gates, and is captured by `art:benchmark` for human approval. P14 remains final polish/coverage, not first visual implementation.

## Character Style Lock Before NPC Scale-Up
**Rating:** HIGH VALUE / LOW–MEDIUM COMPLEXITY WHEN DONE EARLY

Environment direction is already highly specific, but characters can easily look imported from another game. Before a large NPC set, approve one representative player/worker using `04`'s proportion, face/eye, chunky-hair, clothing/material, rig/LOD and animation language in farm/harbor lighting. Judge it beside environment assets rather than an isolated studio render.

**Acceptance:** idle/walk + one farming + one fishing interaction remain readable at gameplay distance and no reviewer describes the character as chibi/anime, realistic, glossy mobile-avatar, or visually disconnected from the world.

# Tier A — Do Before MVP / During Core Vertical Slice

## 1. Expedition Planning Board
**Rating:** HIGH VALUE / LOW–MEDIUM COMPLEXITY

**Problem:** The core loop contains market/forecast/preparation decisions, but without one concise planning surface players may treat them as disconnected menus.

**Proposal:** At the farmhouse or harbor, provide a contextual expedition board that summarizes, without auto-solving:
- current + short forecast weather;
- known active/likely fish habitats from journal knowledge;
- current harbor demand/trend for known species;
- boat fuel/cargo/ice status;
- owned bait/chum/lures;
- active relevant contracts.

The board should answer **“What should I consider before leaving?”**, not “best route = X.” Keep the 3D world primary; this is a contextual planning interaction, not permanent HUD.

**Why it improves the game:** It turns the project's many interconnected systems into one understandable decision moment and teaches players why farming, markets, weather, and storage matter together.

**Acceptance:** New players can explain why they chose a destination and what supplies they prepared after using the board once.

---

## 2. Bait/Chum Targeting Instead of Generic Bonuses
**Rating:** HIGH VALUE / LOW COMPLEXITY

**Problem:** If all chum only means “fish school becomes active,” farm choice risks becoming shallow.

**Proposal:** Keep MVP recipes simple, but add small **ecological targeting differences** rather than flat catch bonuses. Examples:
- grain-heavy chum favors schooling pelagic fish;
- worm-rich bait improves freshwater interest;
- later oily fish-scrap chum increases offshore attraction but has higher opportunity cost.

Do not create dozens of bait items. Start with 2–3 meaningful preparation profiles and make their effects visible in journal/tooltips.

**Systems affected:** farming, processing, school species weights, journal, market strategy.

**Acceptance:** The player sometimes chooses what to grow/process because of the fish they intend to pursue tomorrow.

---

## 3. Readable Fish-School Ecology
**Rating:** HIGH VALUE / MEDIUM COMPLEXITY

**Problem:** Temporary schools are central, but simple gulls/splashes can become a generic spawn marker.

**Proposal:** Give schools layered environmental clues tied to species/profile:
- splash scale/pattern;
- bird count/behavior;
- water-color disturbance;
- jump silhouettes;
- distance from shore/depth band;
- time/weather context.

The journal gradually teaches these cues. Fish finders should **enhance interpretation**, not replace observation with a map icon.

**Player experience:** “I think that is tuna because of the long fast surface streaks and where it spawned,” rather than “the HUD says tuna.”

**Acceptance:** Experienced players identify common school types from world cues before opening the UI.

---

## 4. Cargo Decision UX — Fast, Physical, Not Fiddly
**Rating:** HIGH VALUE / MEDIUM COMPLEXITY

**Problem:** Physical fish cargo is distinctive, but manual slot management could become irritating.

**Proposal:** Preserve real physical slots while making handling fast:
- contextual highlight of valid slots when carrying a fish;
- one-click/one-button “place in best valid empty slot” while still visibly animating the transfer;
- manual slot choice only when it matters (external hook vs internal/iced hold);
- clear comparison when replacing a fish: value estimate, freshness, weight, contract relevance.

Never turn cargo into an abstract infinite grid.

**Acceptance:** Capacity causes strategic decisions, but ordinary loading takes seconds rather than menu micromanagement.

---

## 5. Return-or-Stay Decision Feedback
**Rating:** HIGH VALUE / LOW COMPLEXITY

**Problem:** The intended expedition tension depends on knowing when another catch becomes risky.

**Proposal:** Without predicting exact outcomes, surface compact contextual signals:
- current average cargo freshness;
- estimated trip-to-harbor time;
- incoming weather severity/time window;
- cargo occupancy;
- current known market premium/trend;
- contract deadline risk.

Use language such as “freshness risk rising” / “storm likely before return” instead of exact min-max optimization unless progression unlocks it.

**Acceptance:** Players voluntarily return with empty slots sometimes because conditions make that rational.

---

## 6. Farming Batch Interactions as Capability Progression
**Rating:** HIGH VALUE / MEDIUM COMPLEXITY

**Problem:** The project correctly rejects watering/click repetition, but larger farms will still magnify planting/harvesting friction.

**Proposal:** Make scale unlock new interaction verbs:
- early: individual placement/care;
- Skilled: seed bundles/row placement;
- Expert/Master: irrigation zones and multi-crop harvest tools;
- later: planned automation that still requires inputs/capacity.

This is superior to simply giving +20% yields because it changes how the player operates.

**Acceptance:** A larger farm feels more powerful, not proportionally more tedious.

---

## 7. Price Explanation + “Why It Changed”
**Rating:** HIGH VALUE / LOW COMPLEXITY

**Problem:** Dynamic markets only create strategy if players can build a mental model.

**Proposal:** Keep current breakdown but add a short reason layer:
```text
Tuna demand: High (+18%)
Why: local supply below target; summer demand bonus
Trend: falling after recent harbor sales
```
Do not expose implementation internals or future certainty. Trading progression can unlock longer history/forecast.

**Acceptance:** A tester can explain the main reason their sale price changed without reading documentation.

---

## 8. First-Hour “Signature Loop” Tutorialization
**Rating:** HIGH VALUE / LOW COMPLEXITY

**Problem:** The first hour already contains the right beats; the risk is teaching them as isolated tutorial chores.

**Proposal:** Frame early tasks around one believable objective: **prepare and complete the player's first serious fishing trip**.

Example sequence:
`grow wheat → learn worms → process chum → hear harbor buyer wants a fresh fish → get rowboat access → spot/chum school → land/store fish → race freshness/weather back → sale breakdown → choose first capability`.

Keep instructions contextual, short, and world-anchored.

**Acceptance:** Players describe the first hour as “I prepared for a fishing trip,” not “I completed farming and fishing tutorials.”

# Tier B — Strong After the Vertical Slice Is Stable

## 9. Standing Buyers / Buyer Personalities
**Rating:** HIGH VALUE / MEDIUM COMPLEXITY

**Proposal:** Add a small number of functional buyers, not a huge NPC-schedule system. Buyers create recognizable market niches:
- harbor wholesaler: volume, lower premium;
- restaurant: fresh/quality contracts;
- fishmonger: broad common demand;
- specialty buyer: large/trophy fish;
- produce processor: bulk crop orders.

They need lightweight identities and stalls/signage, not complex life simulation.

**Value:** Makes market demand memorable and gives contracts world identity rather than becoming generic quest cards.

---

## 10. Preservation Branch: Ice vs Processing vs Immediate Sale
**Rating:** HIGH VALUE / MEDIUM COMPLEXITY

**Proposal:** Strengthen freshness decisions with three clear strategies:
1. sell immediately for current demand;
2. spend ice/cold capacity to preserve fish;
3. process selected fish into lower-volatility products/fertilizer components.

Avoid full cooking/crafting bloat. Add only products that change logistics or market exposure.

**Acceptance:** A low-demand fresh catch can still create an interesting decision instead of simply feeling like a bad roll.

---

## 11. Weather Windows With Opportunity, Not Only Punishment
**Rating:** HIGH VALUE / MEDIUM COMPLEXITY

**Problem:** If storms only reduce control/raise repair risk, optimal play may become “never sail in bad weather.”

**Proposal:** Tie some ecological opportunities to conditions:
- wind shifts certain schools closer to shore;
- rain improves particular freshwater activity;
- fog allows rare species but reduces navigation clarity;
- pre-storm windows generate unusually valuable offshore schools.

Risk should be telegraphed and avoid arbitrary destruction.

**Acceptance:** Skilled players sometimes intentionally choose imperfect weather for a specific opportunity.

---

## 12. Regional Micro-Economies Before More Content
**Rating:** HIGH VALUE / MEDIUM COMPLEXITY

**Proposal:** Before adding many crops/fish, make the existing world locations economically distinct. Even within a compact MVP world:
- village market favors produce/common staples;
- harbor values fresh sport fish;
- later second buyer/location favors preserved/bulk goods.

Distance should create a reason to move goods, but travel time must remain short enough to be strategic.

**Acceptance:** “Where should I sell this?” has more than one reasonable answer for some goods.

---

## 13. Specialization Through Operational Identity
**Rating:** HIGH VALUE / MEDIUM COMPLEXITY

**Proposal:** Let players lean into a business style without locking classes:
- **Self-sufficient angler:** farm-heavy bait production + moderate boat capability;
- **Commercial fisher:** larger trips + purchased inputs + cold-chain investment;
- **Premium grower:** quality crops/contracts + selective fishing;
- **Market trader:** storage/forecast/history + route exploitation.

No hard class screen. Specialization emerges from infrastructure and capability purchases; respecialization remains possible through investment.

**Acceptance:** Two progressed saves can feel operationally different even with the same fundamental systems.

---

## 14. Captain/Farm Log as Memory, Not Checklist
**Rating:** HIGH VALUE / LOW–MEDIUM COMPLEXITY

**Proposal:** Expand journal into a player knowledge tool:
- largest catches and conditions;
- discovered school cues;
- personal crop quality records;
- recent profitable routes;
- market observations;
- legendary-condition hints.

Do not make it a checklist of 200 collectibles.

**Value:** Reinforces the pillar that player knowledge is progression and gives long-term accomplishments without combat loot.

# Tier C — Post-MVP Expansion

## 15. Tides as a Lightweight Modifier
**Rating:** POST-MVP / MEDIUM COMPLEXITY

Use a simple deterministic tide cycle only if it changes access/spawn decisions: exposed shoreline fishing spots, harbor depth/visual state, certain species windows. Do not simulate full fluid tides.

---

## 16. Orchard + Beekeeping Synergy
**Rating:** POST-MVP / MEDIUM COMPLEXITY

Orchards already fit progression. Beekeeping can add pollination/quality or honey as a limited processing input, but only if it connects to existing production/market loops. Avoid turning this into a separate management game.

---

## 17. Aquaculture as a Different Farming Verb
**Rating:** POST-MVP / HIGH COMPLEXITY

Aquaculture should justify itself through distinct placement/logistics: buoy-marked marine plots, kelp/oysters, longer timers, boat access, weather exposure, market/boat-building inputs. Do not simply make “crops underwater.”

---

## 18. Large Boat as an Expedition Format Change
**Rating:** POST-MVP / HIGH COMPLEXITY

A later vessel should add operational capability: larger physical hold, cold storage, longer range, specialized gear, higher running cost, rough-sea access. It must not merely be the Skiff with +50% stats.

---

## 19. Rare Natural Events
**Rating:** POST-MVP / MEDIUM COMPLEXITY

Use a few deterministic seeded events that reinforce systems: Thunderstruck Tree, exceptional fish migration, unusual bloom/season, rare buyer demand spike. Events must be discoverable/telegraphed enough to feel like opportunities, not arbitrary lottery rewards.

# Optional Polish With High Perceived Value

## 20. Action-Specific Tactile Feedback
**Rating:** OPTIONAL POLISH / HIGH VALUE

Prioritize repeated verbs: planting, watering, harvest, milling, chum mixing, casting, bite, line strain, landing, carrying fish, loading slot, docking, market sale. Use short animation + sound + small VFX + object/world state change. Avoid excessive UI reward fireworks.

---

## 21. Adaptive Ambient Audio Layers
**Rating:** OPTIONAL POLISH / MEDIUM COMPLEXITY

Layer ambience by place/condition: farm insects/wind, village distant work, harbor rope/gulls/hulls, offshore sparse waves/wind, rain/storm layers. Music should be restrained and state-aware rather than continuous high-energy scoring.

---

## 22. World Storytelling Through Production State
**Rating:** OPTIONAL POLISH / LOW–MEDIUM COMPLEXITY

Let zones visually react to economic progression: crates/fish racks fill, farm infrastructure grows, new boat equipment appears, cold-storage building changes, market signage reflects buyer unlocks. Keep canonical state simulation-driven and renderer-only presentation.

# Tier D — Do Not Add / Overkill for This Game

## 23. Full NPC Life Simulation
**Rating:** DO NOT ADD
Would consume production time without strengthening the farm→fish→logistics loop. Use lightweight buyer/workplace activity instead.

## 24. Survival Hunger/Thirst/Fatigue
**Rating:** DO NOT ADD
Adds chores rather than strategic economic risk and conflicts with the calm production focus.

## 25. Realistic Ocean / Rope / Sailing Simulation
**Rating:** DO NOT ADD
High browser/performance/maintenance cost; the project already gets meaningful sea decisions from roughness, weather, boat capability, fuel, and cargo.

## 26. Huge Procedural Open World
**Rating:** DO NOT ADD
Weakens authored art, raises travel boredom and asset demand, and dilutes the compact economic geography.

## 27. Hundreds of Crops, Fish, Recipes
**Rating:** DO NOT ADD
Content quantity without new decision logic increases maintenance and LLM context cost. Every new content item should introduce a new ecological/preparation/logistics/market/capability distinction.

## 28. Combat as “Endgame Variety”
**Rating:** DO NOT ADD
If the late game lacks tension, deepen weather, market exposure, rare fish behavior, expensive logistics, contracts, and expedition preparation instead.

# Recommended Development Priority

## Before P1 World Production
0. P0.5 canonical renderer + palette/material foundation
0. P0.75 bridge/farm/harbor/coast gold-standard art slices; mass production blocked until approved
0. Character style-lock slice before large NPC production (when characters enter scope)

## Before P12 Full Vertical Slice
1. Expedition Planning Board
2. First-hour signature-loop framing
3. Return-or-stay signals
4. Price “why it changed” explanation
5. Fast physical cargo UX
6. Readable school ecology cues

## Immediately After P12
7. 2–3 bait/chum targeting profiles
8. batch farming interaction progression
9. standing buyers
10. preservation strategy branch
11. weather opportunity windows
12. operational specialization

## After MVP Stability
13. second/regional micro-economy
14. richer journal/captain log
15. tides if decision-producing
16. orchard/beekeeping
17. aquaculture
18. larger expedition vessel
19. rare natural events

# Final Design Test

For any proposed feature, answer:
```text
Does it reinforce farming, fishing, processing, logistics, markets, knowledge, or capability progression?
Does it create a meaningful decision rather than another meter/click?
Will the player notice it during normal play?
Does it preserve the calm non-combat identity?
Can the browser budget support it?
Does it duplicate an existing system?
Could the same value be achieved with a smaller change?
```
If the feature fails these questions, do not add it.

**Core recommendation:** make the game deeper by increasing the number of **interesting reasons behind existing actions**, not the number of unrelated actions.
