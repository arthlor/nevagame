// src/ui/components/HowToPlayGuide.tsx
import React, { useState } from "react";
import { ChromeQuality } from "../chrome/Chrome";
import { KeycapBadge } from "./HudDecorations";
import { playUiSound } from "../audio/uiAudio";
import {
  IconBoat,
  IconCoin,
  IconCompass,
  IconDawn,
  IconDusk,
  IconEnergy,
  IconExpedition,
  IconFish,
  IconJournal,
  IconLedger,
  IconMoon,
  IconRod,
  IconSprout,
  IconSun,
  IconTools,
  IconWarning,
  IconWateringCan,
  IconWeatherFog,
  IconWeatherRain,
  IconWeatherStorm,
  IconWind
} from "./HudIcons";

export type GuideChapter = "controls" | "farming" | "fishing" | "markets" | "progression";

interface GuideChapterTab {
  id: GuideChapter;
  label: string;
  icon: React.ReactNode;
}

const CHAPTERS: GuideChapterTab[] = [
  { id: "controls", label: "Controls & Basics", icon: <IconCompass size={14} aria-hidden="true" /> },
  { id: "farming", label: "Farming & Irrigation", icon: <IconSprout size={14} aria-hidden="true" /> },
  { id: "fishing", label: "Fishing, Boats & Cargo", icon: <IconFish size={14} aria-hidden="true" /> },
  { id: "markets", label: "Markets & Logistics", icon: <IconCoin size={14} aria-hidden="true" /> },
  { id: "progression", label: "Mastery & Weather", icon: <IconTools size={14} aria-hidden="true" /> }
];

export const HowToPlayGuide: React.FC = () => {
  const [chapter, setChapter] = useState<GuideChapter>("controls");

  return (
    <div className="guidebook-container" role="region" aria-label="How to play guide">
      {/* Chapter Sub-Tabs */}
      <nav className="guidebook-subtabs" aria-label="Guidebook chapters">
        {CHAPTERS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`guidebook-subtab-btn ${chapter === tab.id ? "is-active" : ""}`}
            onClick={() => {
              playUiSound("page-turn");
              setChapter(tab.id);
            }}
            aria-selected={chapter === tab.id}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <div className="guidebook-content">
        {chapter === "controls" && <ControlsChapter />}
        {chapter === "farming" && <FarmingChapter />}
        {chapter === "fishing" && <FishingChapter />}
        {chapter === "markets" && <MarketsChapter />}
        {chapter === "progression" && <ProgressionChapter />}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Chapter 1: Controls & Basics                                               */
/* -------------------------------------------------------------------------- */

const ControlsChapter: React.FC = () => (
  <div className="guide-chapter">
    <div className="guide-section-intro">
      <h4>Welcome to the Coastal Valley of Neva</h4>
      <p>
        Neva is a peaceful, no-combat coastal simulation where you cultivate fertile farmland, pilot vessels across
        tidal bays, hook prized fish, manage physical cargo logistics, and fulfill regional trade contracts.
      </p>
    </div>

    <div className="guide-card-grid">
      <div className="guide-card">
        <h5 className="guide-card-title">
          <IconCompass size={18} aria-hidden="true" /> Traversal & Movement
        </h5>
        <div className="guide-table">
          <div className="guide-keybind-row">
            <span className="guide-keys">
              <KeycapBadge keyName="W" />
              <KeycapBadge keyName="A" />
              <KeycapBadge keyName="S" />
              <KeycapBadge keyName="D" />
            </span>
            <span className="guide-key-desc">Walk / Run in 8 directions (or boat steering)</span>
          </div>
          <div className="guide-keybind-row">
            <span className="guide-keys">
              <KeycapBadge keyName="Shift" />
            </span>
            <span className="guide-key-desc">Hold to Sprint (consumes sprint stamina)</span>
          </div>
          <div className="guide-keybind-row">
            <span className="guide-keys">
              <KeycapBadge keyName="Space" />
            </span>
            <span className="guide-key-desc">Jump over obstacles / Boat reverse brake</span>
          </div>
          <div className="guide-keybind-row">
            <span className="guide-keys">
              <KeycapBadge keyName="E" />
            </span>
            <span className="guide-key-desc">Interact with crops, villagers, boats, and markets</span>
          </div>
        </div>
      </div>

      <div className="guide-card">
        <h5 className="guide-card-title">
          <IconJournal size={18} aria-hidden="true" /> Equipment & Menus
        </h5>
        <div className="guide-table">
          <div className="guide-keybind-row">
            <span className="guide-keys">
              <KeycapBadge keyName="1" /> - <KeycapBadge keyName="5" />
            </span>
            <span className="guide-key-desc">Select Tool Slot (Hoe, Seeds, Watering Can, Bait, Rod)</span>
          </div>
          <div className="guide-keybind-row">
            <span className="guide-keys">
              <KeycapBadge keyName="I" />
            </span>
            <span className="guide-key-desc">Open Satchel / Inventory</span>
          </div>
          <div className="guide-keybind-row">
            <span className="guide-keys">
              <KeycapBadge keyName="J" />
            </span>
            <span className="guide-key-desc">Guild Chronicle (Quests, Skills, Bestiary, Field Notes, Guide)</span>
          </div>
          <div className="guide-keybind-row">
            <span className="guide-keys">
              <KeycapBadge keyName="M" />
            </span>
            <span className="guide-key-desc">Coastal Region Map & Points of Interest</span>
          </div>
          <div className="guide-keybind-row">
            <span className="guide-keys">
              <KeycapBadge keyName="L" />
            </span>
            <span className="guide-key-desc">Logistics Ledger & Active Commercial Contracts</span>
          </div>
          <div className="guide-keybind-row">
            <span className="guide-keys">
              <KeycapBadge keyName="Esc" />
            </span>
            <span className="guide-key-desc">Pause Menu, Settings, Quick Save & Safe Return</span>
          </div>
        </div>
      </div>
    </div>

    <div className="guide-callout-tip">
      <div className="guide-callout-icon">
        <IconEnergy size={20} aria-hidden="true" />
      </div>
      <div className="guide-callout-text">
        <h6>Work Capacity (Labor Energy)</h6>
        <p>
          Actions that earn XP—planting, watering, fertilizing, harvesting, processing, trading, and landing fish—draw
          from <strong>Labor</strong>. When Labor is empty, play continues with reduced XP and rare-outcome chances;
          it recovers over time. Sprint stamina is a separate resource.
        </p>
      </div>
    </div>

    <div className="guide-card" style={{ marginTop: "12px" }}>
      <h5 className="guide-card-title">
        <IconSun size={18} aria-hidden="true" /> Day Cycle, Seasons & Regions
      </h5>
      <p className="guide-body-copy" style={{ margin: "0 0 10px", fontSize: "13px" }}>
        Time moves continuously through four distinct daily phases. Each season lasts 30 calendar days.
      </p>
      <div className="guide-cycle-pills">
        <span className="guide-cycle-pill">
          <IconDawn size={16} aria-hidden="true" /> <strong>Dawn</strong> (04:00 - 08:00)
        </span>
        <span className="guide-cycle-pill">
          <IconSun size={16} aria-hidden="true" /> <strong>Day</strong> (08:00 - 18:00)
        </span>
        <span className="guide-cycle-pill">
          <IconDusk size={16} aria-hidden="true" /> <strong>Dusk</strong> (18:00 - 22:00)
        </span>
        <span className="guide-cycle-pill">
          <IconMoon size={16} aria-hidden="true" /> <strong>Night</strong> (22:00 - 04:00)
        </span>
      </div>
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/* Chapter 2: Farming & Irrigation                                            */
/* -------------------------------------------------------------------------- */

const FarmingChapter: React.FC = () => (
  <div className="guide-chapter">
    <div className="guide-section-intro">
      <h4>Agricultural Craft & Field Irrigation</h4>
      <p>
        Transform wild plots into high-yield coastal farmland. Monitor moisture levels, replenish soil nutrients,
        and install whole-field irrigation systems to scale your harvests.
      </p>
    </div>

    <div className="guide-step-grid">
      <div className="guide-step-card">
        <span className="guide-step-num">1</span>
        <div className="guide-step-icon">
          <IconSprout size={24} aria-hidden="true" />
        </div>
        <h6>Select Seeds</h6>
        <p>Choose Seeds <KeycapBadge keyName="2" /> and point at prepared farm soil.</p>
      </div>

      <div className="guide-step-card">
        <span className="guide-step-num">2</span>
        <div className="guide-step-icon">
          <IconSprout size={24} aria-hidden="true" />
        </div>
        <h6>Place the Crop</h6>
        <p>Confirm with <KeycapBadge keyName="E" /> or left-click. The field checks space, surface, and crop access.</p>
      </div>

      <div className="guide-step-card">
        <span className="guide-step-num">3</span>
        <div className="guide-step-icon">
          <IconWateringCan size={24} aria-hidden="true" />
        </div>
        <h6>Water & Maintain</h6>
        <p>Water thirsty crops with your Can <KeycapBadge keyName="3" />. Keep moisture in the ideal band to prevent withering.</p>
      </div>

      <div className="guide-step-card">
        <span className="guide-step-num">4</span>
        <div className="guide-step-icon">
          <IconCoin size={24} aria-hidden="true" />
        </div>
        <h6>Harvest & Profit</h6>
        <p>Harvest mature crops with <KeycapBadge keyName="E" />. Regrowable crops will continue producing periodically!</p>
      </div>
    </div>

    {/* Irrigation Feature Spotlight */}
    <div className="guide-highlight-box">
      <div className="guide-highlight-header">
        <div className="guide-highlight-badge">Essential Farm Upgrade</div>
        <h5>Field Irrigation System · 120 G</h5>
      </div>
      <p>
        Tired of watering each crop plot one-by-one? Walk up to the farm well beside the house and press{" "}
        <KeycapBadge keyName="E" /> to <strong>install a field pump for 120 Gold</strong>.
      </p>
      <ul className="guide-feature-bullets">
        <li>
          <strong>One action from the well:</strong> Return to the well and use{" "}
          <em>[E] Pump water to the field</em> to water every thirsty crop on that farm.
        </li>
        <li>
          <strong>Permanent Efficiency:</strong> Saves valuable Work Capacity and time, allowing you to venture out
          to sea while your crops flourish.
        </li>
      </ul>
    </div>

    <div className="guide-card" style={{ marginTop: "14px" }}>
      <h5 className="guide-card-title">
        <IconTools size={18} aria-hidden="true" /> Mill, Compost & Workbench
      </h5>
      <p className="guide-body-copy" style={{ fontSize: "13px", margin: "0 0 8px" }}>
        Processing stations show how long a job will take on the game clock before you start, and remaining time
        plus the ready hour while they work. Compost takes a full morning; milling and chum finish in minutes.
        You can keep farming or rest until morning while a job runs — it will not finish instantly.
      </p>
    </div>

    <div className="guide-card-grid" style={{ marginTop: "14px" }}>
      <div className="guide-card">
        <h5 className="guide-card-title">
          <IconSprout size={18} aria-hidden="true" /> Soil Fertility & Nutrients
        </h5>
        <p className="guide-body-copy" style={{ fontSize: "13px", margin: "0 0 8px" }}>
          Repeated harvests naturally deplete soil fertility. When fertility drops:
        </p>
        <ul className="guide-bullet-list">
          <li>Crop growth speed slows down.</li>
          <li>Chances of higher crop grades (Fine, Exceptional, Prize) decrease.</li>
          <li>Apply <strong>Fertilizer</strong> from your satchel to raise fertility by 20 points, up to 100.</li>
        </ul>
      </div>

      <div className="guide-card">
        <h5 className="guide-card-title">
          <IconSun size={18} aria-hidden="true" /> Quality Factors
        </h5>
        <p className="guide-body-copy" style={{ fontSize: "13px", margin: "0 0 8px" }}>
          Achieving legendary harvests depends on four key conditions:
        </p>
        <ul className="guide-bullet-list">
          <li><strong>Moisture Stability:</strong> Avoid letting soil drop to dry for extended hours.</li>
          <li><strong>Optimal Season:</strong> Planting seasonal crops accelerates growth rates.</li>
          <li><strong>High Soil Fertility:</strong> Kept topped up with organic compost.</li>
          <li><strong>Farming Mastery:</strong> Higher guild proficiency levels directly boost quality roll chances.</li>
        </ul>
      </div>
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/* Chapter 3: Fishing, Boats & Cargo                                          */
/* -------------------------------------------------------------------------- */

const FishingChapter: React.FC = () => (
  <div className="guide-chapter">
    <div className="guide-section-intro">
        <h4>Coastal Fishing, Boats & Cargo</h4>
      <p>
        From coastal piers to stormy offshore banks, the waters of Neva teem with distinct fish species.
        Pilot seaworthy vessels, balance physical cargo, and protect your catch's freshness.
      </p>
    </div>

    <div className="guide-card-grid">
      <div className="guide-card">
        <h5 className="guide-card-title">
          <IconRod size={18} aria-hidden="true" /> Shore & Pier Bait Fishing
        </h5>
        <p className="guide-body-copy" style={{ fontSize: "13px", margin: "0 0 8px" }}>
          For quick shore angling along beaches and wooden docks:
        </p>
        <ol className="guide-numbered-list">
          <li>Select Bait <KeycapBadge keyName="4" /> and equip your Fishing Rod <KeycapBadge keyName="5" />.</li>
          <li>Stand near the water's edge and hold <strong>Space</strong> or <strong>Left Click</strong> to charge cast distance.</li>
          <li>Watch the water ripples and listen for the bobber bite indicator.</li>
          <li>Strike promptly with <KeycapBadge keyName="Space" /> to hook and land your fish into your satchel!</li>
        </ol>
      </div>

      <div className="guide-card">
        <h5 className="guide-card-title">
          <IconBoat size={18} aria-hidden="true" /> Vessel Piloting
        </h5>
        <p className="guide-body-copy" style={{ fontSize: "13px", margin: "0 0 8px" }}>
          Take the helm of the rowboat at the harbor. A coastal skiff is a later vessel:
        </p>
        <div className="guide-table">
          <div className="guide-keybind-row">
            <span className="guide-keys"><KeycapBadge keyName="E" /></span>
            <span className="guide-key-desc">Board vessel at dock / Disembark</span>
          </div>
          <div className="guide-keybind-row">
            <span className="guide-keys"><KeycapBadge keyName="W" /> / <KeycapBadge keyName="S" /></span>
            <span className="guide-key-desc">Engine Throttle forward / Reverse</span>
          </div>
          <div className="guide-keybind-row">
            <span className="guide-keys"><KeycapBadge keyName="A" /> / <KeycapBadge keyName="D" /></span>
            <span className="guide-key-desc">Rudder steering left / right</span>
          </div>
          <div className="guide-keybind-row">
            <span className="guide-keys"><KeycapBadge keyName="Space" /></span>
            <span className="guide-key-desc">Vessel hydrodynamic brake</span>
          </div>
        </div>
      </div>
    </div>

    <div className="guide-highlight-box" style={{ marginTop: "14px" }}>
      <div className="guide-highlight-header">
        <div className="guide-highlight-badge">Deep-Sea Encounters</div>
        <h5>Offshore Sport Fishing & Tension Battles</h5>
      </div>
      <p>
          At a sport-fishing school, use chum to start an encounter and manage the line:
      </p>
      <div className="guide-substep-cards">
        <div className="guide-substep-card">
          <strong>Line Tension:</strong> Keep reel tension in the green sweet spot. Too high and the line snaps; too low and the hook slips!
        </div>
        <div className="guide-substep-card">
          <strong>Fish Stamina:</strong> Brace and counter-steer while the fish thrashes, then reel vigorously when it tires out.
        </div>
        <div className="guide-substep-card">
          <strong>Physical Cargo:</strong> Sport fish occupy a boat hold or external hook when the vessel supports it;
          they are never stackable backpack items.
        </div>
      </div>
    </div>

    <div className="guide-callout-warning" style={{ marginTop: "14px" }}>
      <div className="guide-callout-icon">
        <IconWarning size={20} aria-hidden="true" />
      </div>
      <div className="guide-callout-text">
        <h6>Fish Freshness & Decay Mechanics</h6>
        <p>
          Fresh fish retain maximum flavor and trade value. Over time at sea, fish freshness naturally decays from{" "}
          <strong>100% fresh</strong> down toward <strong>Spoiled</strong>. Bring fish to the Harbor Fish Market while
          fresh; iced boat storage slows the decay.
        </p>
      </div>
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/* Chapter 4: Markets & Logistics                                             */
/* -------------------------------------------------------------------------- */

const MarketsChapter: React.FC = () => (
  <div className="guide-chapter">
    <div className="guide-section-intro">
        <h4>Markets, Fish Value & Trade Orders</h4>
      <p>
        Neva's village economy rewards quality, freshness, and reliable supply chains. Trade directly with merchants
        or fulfill high-paying regional logistics contracts.
      </p>
    </div>

    <div className="guide-card-grid">
      <div className="guide-card">
        <h5 className="guide-card-title">
          <IconCoin size={18} aria-hidden="true" /> Village Market Stalls
        </h5>
        <p className="guide-body-copy" style={{ fontSize: "13px", margin: "0 0 8px" }}>
          The Village Produce Stall and Harbor Fish Market serve different parts of the loop:
        </p>
        <ul className="guide-bullet-list">
          <li><strong>Village:</strong> Buy wheat, tomato, and potato seeds, fertilizer, and compost starter; sell produce and grain.</li>
          <li><strong>Harbor:</strong> Buy fishing supplies and sell physical fish cargo at the Fish Market.</li>
          <li><strong>Demand:</strong> Commodity prices move with local supply, demand, and season; fish also depends on weight, quality, and freshness.</li>
        </ul>
      </div>

      <div className="guide-card">
        <h5 className="guide-card-title">
          <IconLedger size={18} aria-hidden="true" /> Logistics Ledger Contracts
        </h5>
        <p className="guide-body-copy" style={{ fontSize: "13px", margin: "0 0 8px" }}>
          Press <KeycapBadge keyName="L" /> anywhere to inspect the Commercial Ledger:
        </p>
        <ul className="guide-bullet-list">
          <li><strong>Merchant Orders:</strong> Require specific produce or physical fish, quantities, and sometimes quality or freshness.</li>
          <li><strong>Correct destination:</strong> Produce orders are delivered at the Village; fish orders are delivered at the Harbor.</li>
          <li><strong>Contract Bonuses:</strong> Fulfilling an order awards gold and the skill XP shown in the ledger.</li>
        </ul>
      </div>
    </div>

    <div className="guide-card" style={{ marginTop: "14px" }}>
        <h5 className="guide-card-title">
        <IconSprout size={18} aria-hidden="true" /> Fish Quality & Freshness
      </h5>
      <p className="guide-body-copy" style={{ fontSize: "13px", margin: "0 0 10px" }}>
        Fish value combines species, weight, quality, freshness, demand, and season. Crop grades are recorded separately
        as Common, Fine, Exceptional, or Prize; crop prices follow the village commodity market.
      </p>
      <div className="guide-quality-showcase">
        <div className="guide-quality-chip">
          <ChromeQuality quality="common" showLabel />
          <span>Base Value (1.0×)</span>
        </div>
        <div className="guide-quality-chip">
          <ChromeQuality quality="fine" showLabel />
          <span>Fine (1.25×)</span>
        </div>
        <div className="guide-quality-chip">
          <ChromeQuality quality="exceptional" showLabel />
          <span>Exceptional (1.6×)</span>
        </div>
        <div className="guide-quality-chip">
          <ChromeQuality quality="trophy" showLabel />
          <span>Trophy / Prize (2.2×)</span>
        </div>
      </div>
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/* Chapter 5: Mastery, Weather & Expeditions                                   */
/* -------------------------------------------------------------------------- */

const ProgressionChapter: React.FC = () => (
  <div className="guide-chapter">
    <div className="guide-section-intro">
      <h4>Guild Masteries, Maritime Weather & Expeditions</h4>
      <p>
        Master the coastal trades to increase your efficiency, prepare for changing seasonal weather patterns, and
        embark on offshore expeditions.
      </p>
    </div>

    <div className="guide-card-grid">
      <div className="guide-card">
        <h5 className="guide-card-title">
          <IconTools size={18} aria-hidden="true" /> Guild Proficiencies
        </h5>
        <p className="guide-body-copy" style={{ fontSize: "13px", margin: "0 0 8px" }}>
          Gain proficiency XP by performing trade actions (press <KeycapBadge keyName="J" /> to view):
        </p>
        <ul className="guide-bullet-list">
          <li><strong>Farming:</strong> Planting, watering, fertilizing, and harvesting build Farming XP and shape crop quality.</li>
          <li><strong>Fishing:</strong> Angling and sport battles build Fishing XP; rods and habitats determine what you can target.</li>
          <li><strong>Processing:</strong> Milling, composting, crafting, and fish preparation build Processing XP.</li>
          <li><strong>Trading:</strong> Market sales and completed contracts build Trading XP.</li>
        </ul>
      </div>

      <div className="guide-card">
        <h5 className="guide-card-title">
          <IconExpedition size={18} aria-hidden="true" /> Offshore Expeditions
        </h5>
        <p className="guide-body-copy" style={{ fontSize: "13px", margin: "0 0 8px" }}>
          Unlocked via the Guild Expedition Board (press <KeycapBadge keyName="P" />):
        </p>
        <ul className="guide-bullet-list">
          <li><strong>Voyage Preparation:</strong> Check weather, hull condition, hold space, chum, bait, and ice before setting sail.</li>
          <li><strong>First Route:</strong> Take the rowboat to the lake school, chum it, and land a sport fish.</li>
          <li><strong>Return Safely:</strong> Physical fish must come back to the Harbor Fish Market; Safe Return will not abandon a cargo hold.</li>
        </ul>
      </div>
    </div>

    <div className="guide-card" style={{ marginTop: "14px" }}>
      <h5 className="guide-card-title">
        <IconWind size={18} aria-hidden="true" /> Weather Patterns & Maritime Conditions
      </h5>
      <div className="guide-weather-grid">
        <div className="guide-weather-card">
          <div className="guide-weather-head">
            <IconSun size={20} aria-hidden="true" />
            <h6>Clear & Sunny</h6>
          </div>
          <p>Ideal for field work and rapid crop growth. Soil loses moisture at normal rates.</p>
        </div>

        <div className="guide-weather-card">
          <div className="guide-weather-head">
            <IconWeatherRain size={20} aria-hidden="true" />
            <h6>Rain & Downpours</h6>
          </div>
          <p><strong>Steady Rain:</strong> Rain adds moisture over time and slightly improves growth; it does not instantly fill every crop to 100%.</p>
        </div>

        <div className="guide-weather-card">
          <div className="guide-weather-head">
            <IconWeatherFog size={20} aria-hidden="true" />
            <h6>Thick Coastal Fog</h6>
          </div>
          <p>Visibility drops across open water. Use the map, landmarks, and a conservative route when the coast disappears into fog.</p>
        </div>

        <div className="guide-weather-card">
          <div className="guide-weather-head">
            <IconWeatherStorm size={20} aria-hidden="true" />
            <h6>Ocean Gales & Storms</h6>
          </div>
          <p>Storms raise sea roughness and replenish crop moisture faster, but make small-boat handling less forgiving.</p>
        </div>
      </div>
    </div>
  </div>
);
