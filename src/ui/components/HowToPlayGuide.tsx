import React, { useState } from "react";
import { ControlsReference } from "./ControlsReference";
import { handleTabListKeyDown } from "../useTabListKeyboard";
import { playUiSound } from "../audio/uiAudio";
import {
  IconBoat,
  IconCoin,
  IconCompass,
  IconFish,
  IconLedger,
  IconSparkle,
  IconSprout
} from "./HudIcons";

type GuidePage = "actions" | "field" | "waters" | "trade";

const PAGES: Array<{ id: GuidePage; label: string; icon: React.ReactNode }> = [
  { id: "actions", label: "Actions", icon: <IconCompass size={14} aria-hidden="true" /> },
  { id: "field", label: "Field", icon: <IconSprout size={14} aria-hidden="true" /> },
  { id: "waters", label: "Waters", icon: <IconFish size={14} aria-hidden="true" /> },
  { id: "trade", label: "Trade", icon: <IconCoin size={14} aria-hidden="true" /> }
];

export const HowToPlayGuide: React.FC = () => {
  const [page, setPage] = useState<GuidePage>("actions");
  return (
    <section className="guidebook-container" aria-label="Guide">
      <div className="journal-page-heading"><span>Guild Ledger &amp; Field Guide</span><h2>Working along the coast</h2></div>
      <nav className="guidebook-subtabs" role="tablist" aria-label="Guide pages" onKeyDown={handleTabListKeyDown}>
        {PAGES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            id={`guide-tab-${entry.id}`}
            role="tab"
            aria-selected={page === entry.id}
            aria-controls="guide-active-page"
            tabIndex={page === entry.id ? 0 : -1}
            className={`guidebook-subtab-btn ${page === entry.id ? "is-active" : ""}`}
            onClick={() => {
              playUiSound("page-turn");
              setPage(entry.id);
            }}
          >
            {entry.icon}{entry.label}
          </button>
        ))}
      </nav>

      <div
        id="guide-active-page"
        className="guidebook-content"
        role="tabpanel"
        aria-labelledby={`guide-tab-${page}`}
        tabIndex={0}
      >
        {page === "actions" && <ActionsGuide />}
        {page === "field" && <FieldGuide />}
        {page === "waters" && <WatersGuide />}
        {page === "trade" && <TradeGuide />}
      </div>
    </section>
  );
};

const ActionsGuide: React.FC = () => (
  <div className="guide-chapter">
    <div className="guide-header-card">
      <div className="guide-header-badge">
        <IconCompass size={22} aria-hidden="true" />
      </div>
      <div className="guide-header-text">
        <h3>Coastal Steerage &amp; World Mandates</h3>
        <p className="guide-lead">
          The prompt anchored near the tool belt reflects the current valid action in the world.
          Energy and work capacity are spent only when an action successfully completes; sprinting on foot draws from its own stamina pool.
        </p>
      </div>
    </div>
    <ControlsReference className="guide-controls-reference" />
    <div className="guide-callout-card">
      <div className="guide-callout-icon"><IconSparkle size={18} aria-hidden="true" /></div>
      <div className="guide-callout-text">
        <strong>Surveying the Soil</strong>
        <p>Hold <span className="guide-inline-key">Alt</span> while standing on any farm plot to read soil moisture, fertility, and crop status directly in the world.</p>
      </div>
    </div>
  </div>
);

const FieldGuide: React.FC = () => (
  <div className="guide-chapter">
    <div className="guide-header-card">
      <div className="guide-header-badge">
        <IconSprout size={22} aria-hidden="true" />
      </div>
      <div className="guide-header-text">
        <h3>The Cultivator&apos;s Cycle</h3>
        <p className="guide-lead">From seed selection to harvest, care and local micro-climate govern crop maturity and quality along the coast.</p>
      </div>
    </div>
    <div className="guide-flow-track">
      <div className="guide-step-card">
        <div className="guide-step-num"><span>1</span></div>
        <div className="guide-step-content">
          <span className="guide-step-tag">SOWING</span>
          <h4>Select Seed Stock</h4>
          <p>Equip seeds in your tool belt or select from your Satchel while standing near tilled soil.</p>
          <span className="guide-step-tip">Suit seed varieties to current soil moisture</span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>2</span></div>
        <div className="guide-step-content">
          <span className="guide-step-tag">PLACEMENT</span>
          <h4>Survey &amp; Till</h4>
          <p>Aim at clear ground. The placement projector highlights valid plots in green before you commit work.</p>
          <span className="guide-step-tip">Clear weeds and prepare plots with your Hoe</span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>3</span></div>
        <div className="guide-step-content">
          <span className="guide-step-tag">HUSBANDRY</span>
          <h4>Tend &amp; Nourish</h4>
          <p>Inspect crops for moisture and stage. Coastal rain quenches plots naturally; use your Watering Can during dry spells.</p>
          <span className="guide-step-tip">Refill cans at village wells or freshwater ponds</span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>4</span></div>
        <div className="guide-step-content">
          <span className="guide-step-tag">HARVEST</span>
          <h4>Reap &amp; Prosper</h4>
          <p>Gather prime crops when fully mature. Carry produce to the village market stall or process into artisanal goods.</p>
          <span className="guide-step-tip">Higher care yields star-quality crops</span>
        </div>
      </div>
    </div>
    <div className="guide-callout-card">
      <div className="guide-callout-icon"><IconSprout size={18} aria-hidden="true" /></div>
      <div className="guide-callout-text">
        <strong>Agronomy &amp; Climate Nuance</strong>
        <p>Rain, soil moisture, and weather shape crop maturity over time. Inspect crops closely and hold <span className="guide-inline-key">Alt</span> to monitor soil nutrients.</p>
      </div>
    </div>
  </div>
);

const WatersGuide: React.FC = () => (
  <div className="guide-chapter">
    <div className="guide-header-card">
      <div className="guide-header-badge">
        <IconFish size={22} aria-hidden="true" />
      </div>
      <div className="guide-header-text">
        <h3>The Waterman&apos;s Compass</h3>
        <p className="guide-lead">Reading coastal ripples, casting into feeding shoals, and battling heavyweight sport fish.</p>
      </div>
    </div>
    <div className="guide-flow-track">
      <div className="guide-step-card">
        <div className="guide-step-num"><span>1</span></div>
        <div className="guide-step-content">
          <span className="guide-step-tag">CASTING</span>
          <h4>Read Waters &amp; Cast</h4>
          <p>Approach fishable waters or take your boat offshore. Hold <span className="guide-inline-key">E</span> to charge your cast arc and release into visible feeding ripples.</p>
          <span className="guide-step-tip">A Woven Lure is optional here, but makes the hook more reliable</span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>2</span></div>
        <div className="guide-step-content">
          <span className="guide-step-tag">HOOKING</span>
          <h4>Set the Hook</h4>
          <p>Chum a sport-fishing school, then arm a Woven Lure with <span className="guide-inline-key">R</span> before you set the hook. The lure is spent only when the paid hook succeeds.</p>
          <span className="guide-step-tip">Sport fishing always requires one lure within reach</span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>3</span></div>
        <div className="guide-step-content">
          <span className="guide-step-tag">THE FIGHT</span>
          <h4>Sport Battle Dynamics</h4>
          <p>Counter runs dynamically: reel in with <span className="guide-inline-key">W</span>, give slack with <span className="guide-inline-key">S</span> when line tension peaks into the red, and steer with <span className="guide-inline-key">A / D</span>.</p>
          <span className="guide-step-tip">Tire the fish without snapping your line</span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>4</span></div>
        <div className="guide-step-content">
          <span className="guide-step-tag">LOGISTICS</span>
          <h4>Land &amp; Ice the Catch</h4>
          <p>Sport fish are heavy physical cargo. Land the catch directly into an open boat hold slot or carry on your back to the harbor.</p>
          <span className="guide-step-tip">Freshness degrades over time — use ice to preserve value</span>
        </div>
      </div>
    </div>
    <div className="guide-callout-card">
      <div className="guide-callout-icon"><IconBoat size={18} aria-hidden="true" /></div>
      <div className="guide-callout-text">
        <strong>Harbor Master Deliveries</strong>
        <p>The Harbor Master pays top coin for fresh coastal catches. Keep an eye on local harbor demand and preserve freshness on long offshore runs.</p>
      </div>
    </div>
  </div>
);

const TradeGuide: React.FC = () => (
  <div className="guide-chapter">
    <div className="guide-header-card">
      <div className="guide-header-badge">
        <IconCoin size={22} aria-hidden="true" />
      </div>
      <div className="guide-header-text">
        <h3>The Merchant&apos;s Ledger</h3>
        <p className="guide-lead">Trading farm yields, negotiating harbor catches, and fulfilling high-bounty guild delivery contracts.</p>
      </div>
    </div>
    <div className="guide-flow-track">
      <div className="guide-step-card">
        <div className="guide-step-num"><span>1</span></div>
        <div className="guide-step-content">
          <span className="guide-step-tag">VILLAGE</span>
          <h4>Inland Exchange</h4>
          <p>Visit the village stall to buy fresh seed stock and sell harvested produce, grains, and crafted provisions.</p>
          <span className="guide-step-tip">Staple crops maintain steady village prices</span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>2</span></div>
        <div className="guide-step-content">
          <span className="guide-step-tag">HARBOR</span>
          <h4>Maritime Quay</h4>
          <p>Dock at the harbor market to offload physical fish cargo from your vessel hold and acquire advanced fishing tackle.</p>
          <span className="guide-step-tip">Pristine fresh fish command substantial bonuses</span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>3</span></div>
        <div className="guide-step-content">
          <span className="guide-step-tag">QUOTES</span>
          <h4>Market Demand Shifts</h4>
          <p>Market tickets display dynamic demand trends [▲ / ▼]. Surpluses depress payout while local scarcity yields lucrative premiums.</p>
          <span className="guide-step-tip">Check quotes before packing an expedition</span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>4</span></div>
        <div className="guide-step-content">
          <span className="guide-step-tag">CONTRACTS</span>
          <h4>Guild Delivery Orders</h4>
          <p>Accept merchant contracts requiring specific consignments delivered before the deadline for gold and guild standing.</p>
          <span className="guide-step-tip">Inspect transit requirements and hold capacity first</span>
        </div>
      </div>
    </div>
    <div className="guide-callout-card">
      <div className="guide-callout-icon"><IconLedger size={18} aria-hidden="true" /></div>
      <div className="guide-callout-text">
        <strong>Hold &amp; Logistics Preparation</strong>
        <p>The Hold &amp; Stores ledger tracks vessel capacity, fuel, and storage. Plan your trade routes carefully to maximize cargo profits.</p>
      </div>
    </div>
  </div>
);
