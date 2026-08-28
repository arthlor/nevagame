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
  IconHoe,
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
          Tilling soil, watering crops, casting rods, and harvesting require <strong>Work Capacity</strong>.
          Your capacity regenerates naturally over time and fully restores when resting overnight. Plan your daily
          tasks to avoid exhausting your labor pool.
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
          <IconDawn size={16} aria-hidden="true" /> <strong>Dawn</strong> (06:00 - 09:00)
        </span>
        <span className="guide-cycle-pill">
          <IconSun size={16} aria-hidden="true" /> <strong>Day</strong> (09:00 - 18:00)
        </span>
        <span className="guide-cycle-pill">
          <IconDusk size={16} aria-hidden="true" /> <strong>Dusk</strong> (18:00 - 21:00)
        </span>
        <span className="guide-cycle-pill">
          <IconMoon size={16} aria-hidden="true" /> <strong>Night</strong> (21:00 - 06:00)
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
          <IconHoe size={24} aria-hidden="true" />
        </div>
        <h6>Till Arable Plots</h6>
        <p>Equip your Hoe <KeycapBadge keyName="1" /> and interact with untilled soil to create planting beds.</p>
      </div>

      <div className="guide-step-card">
        <span className="guide-step-num">2</span>
        <div className="guide-step-icon">
          <IconSprout size={24} aria-hidden="true" />
        </div>
        <h6>Sow Seeds</h6>
        <p>Open your satchel <KeycapBadge keyName="I" /> or click a tilled plot to select and plant viable crop seeds.</p>
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
        Tired of watering each crop plot one-by-one? Stand on your farm plot and press{" "}
        <KeycapBadge keyName="E" /> to <strong>Install Irrigation for 120 Gold</strong>.
      </p>
      <ul className="guide-feature-bullets">
        <li>
          <strong>1-Action Whole Field Watering:</strong> Unlocks the <em>[E] Irrigate the field</em> prompt, which
          simultaneously restores 100% moisture to every planted crop on the entire farm.
        </li>
        <li>
          <strong>Permanent Efficiency:</strong> Saves valuable Work Capacity and time, allowing you to venture out
          to sea while your crops flourish.
        </li>
      </ul>
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
          <li>Chances of high-quality grades (Silver, Gold, Pristine) decrease.</li>
          <li>Apply <strong>Fertilizer</strong> from your satchel to restore soil fertility back to 100%.</li>
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
      <h4>Maritime Navigation & Ocean Fishing</h4>
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
          Take the helm of motorboats and trawlers at the harbor:
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
        When offshore, locate boiling water schools and cast heavy tackle to trigger deep-sea sport fishing encounters:
      </p>
      <div className="guide-substep-cards">
        <div className="guide-substep-card">
          <strong>Line Tension:</strong> Keep reel tension in the green sweet spot. Too high and the line snaps; too low and the hook slips!
        </div>
        <div className="guide-substep-card">
          <strong>Fish Stamina:</strong> Brace and counter-steer while the fish thrashes, then reel vigorously when it tires out.
        </div>
        <div className="guide-substep-card">
          <strong>Physical Deck Cargo:</strong> Giant catches are landed onto your boat's physical deck crane and cargo hold—not stacked in your backpack!
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
          <strong>Prime (100%)</strong> down toward <strong>Spoiled</strong>. Return to the village market swiftly or
          pack ice to secure top gold payouts!
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
      <h4>Commerce, Quality Grades & Trade Orders</h4>
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
          Located at Neva Harbor and Village Plaza:
        </p>
        <ul className="guide-bullet-list">
          <li><strong>Produce Merchant:</strong> Purchase crop seeds, fertilizers, and sell harvested produce.</li>
          <li><strong>Fishmonger:</strong> Sells bait and tackle, and purchases both satchel fish and heavy boat cargo catches.</li>
          <li><strong>Dynamic Pricing:</strong> Selling in bulk meets demand; varied supply yields highest returns.</li>
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
          <li><strong>Merchant Orders:</strong> Require specific species, quantities, or minimum quality tiers.</li>
          <li><strong>Contract Bonuses:</strong> Fulfilling contracts awards substantially more gold than standard market sales.</li>
          <li><strong>Guild Reputation:</strong> Completing contracts unlocks prestigious regional delivery assignments.</li>
        </ul>
      </div>
    </div>

    <div className="guide-card" style={{ marginTop: "14px" }}>
      <h5 className="guide-card-title">
        <IconSprout size={18} aria-hidden="true" /> Quality Grades & Price Multipliers
      </h5>
      <p className="guide-body-copy" style={{ fontSize: "13px", margin: "0 0 10px" }}>
        Every crop and fish is graded upon harvest. Higher grades dramatically increase trade profits:
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
          Gain proficiency XP by performing trade actions (tracked in <KeycapBadge keyName="J" />):
        </p>
        <ul className="guide-bullet-list">
          <li><strong>Farming:</strong> Tilling, watering, fertilizing, and harvesting boost crop yields and quality rolls.</li>
          <li><strong>Fishing:</strong> Angling and sport battles increase cast range, reeling power, and rare catch rates.</li>
          <li><strong>Navigation:</strong> Piloting vessels unlocks greater engine efficiency and rough-sea handling.</li>
          <li><strong>Commerce:</strong> Trading goods and completing contracts yields market price discounts and bonuses.</li>
        </ul>
      </div>

      <div className="guide-card">
        <h5 className="guide-card-title">
          <IconExpedition size={18} aria-hidden="true" /> Offshore Expeditions
        </h5>
        <p className="guide-body-copy" style={{ fontSize: "13px", margin: "0 0 8px" }}>
          Unlocked via the Guild Expedition Board <KeycapBadge keyName="P" />:
        </p>
        <ul className="guide-bullet-list">
          <li><strong>Voyage Preparation:</strong> Stock fuel, ice, bait, and provisions before setting sail.</li>
          <li><strong>Uncharted Banks:</strong> Chart isolated reefs to discover exotic deep-sea species and maritime relics.</li>
          <li><strong>Return Safely:</strong> Manage boat weight and weather risks to return your haul to port intact.</li>
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
          <p><strong>Natural Blessing:</strong> All farm crops are automatically watered at 100% moisture for free!</p>
        </div>

        <div className="guide-weather-card">
          <div className="guide-weather-head">
            <IconWeatherFog size={20} aria-hidden="true" />
            <h6>Thick Coastal Fog</h6>
          </div>
          <p>Reduced visibility across open waters. Follow the lighthouse light beams to navigate safely.</p>
        </div>

        <div className="guide-weather-card">
          <div className="guide-weather-head">
            <IconWeatherStorm size={20} aria-hidden="true" />
            <h6>Ocean Gales & Storms</h6>
          </div>
          <p>Violent winds and rough swells. Waters all crops, but small vessels risk high instability offshore.</p>
        </div>
      </div>
    </div>
  </div>
);
