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
      <div className="journal-page-heading"><h2>Working along the coast</h2></div>
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
        <h3>Finding your way</h3>
        <p className="guide-lead">
          Follow the prompt above your tools to talk, tend crops, or cast.
          Work is spent on successful tasks and refilled by resting, eating
          provisions, or working a labor shift. Sprinting uses its own stamina.
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
        <h3>From seed to harvest</h3>
        <p className="guide-lead">From seed selection to harvest, care and local micro-climate govern crop maturity and quality along the coast.</p>
      </div>
    </div>
    <div className="guide-flow-track">
      <div className="guide-step-card">
        <div className="guide-step-num"><span>1</span></div>
        <div className="guide-step-content">
          <h4>Select Seed Stock</h4>
          <p>Equip seeds in your tool belt or select from your Satchel while standing near tilled soil.</p>
          <span className="guide-step-tip">Suit seed varieties to current soil moisture</span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>2</span></div>
        <div className="guide-step-content">
          <h4>Choose a planting spot</h4>
          <p>Aim at clear ground inside your farm. The corner markers show the space for one crop.</p>
          <span className="guide-step-tip">Leave room between crops and away from buildings</span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>3</span></div>
        <div className="guide-step-content">
          <h4>Tend &amp; Nourish</h4>
          <p>Inspect crops for moisture and stage. Coastal rain quenches plots naturally; use your Watering Can during dry spells.</p>
          <span className="guide-step-tip">Watering takes Work, so make use of the rain</span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>4</span></div>
        <div className="guide-step-content">
          <h4>Bring in the harvest</h4>
          <p>Gather prime crops when fully mature. Carry produce to the village market stall or process into artisanal goods.</p>
          <span className="guide-step-tip">Higher care yields star-quality crops</span>
        </div>
      </div>
    </div>
    <div className="guide-callout-card">
      <div className="guide-callout-icon"><IconSprout size={18} aria-hidden="true" /></div>
      <div className="guide-callout-text">
        <strong>Read the field</strong>
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
        <h3>Reading the water</h3>
        <p className="guide-lead">Cast from the bank, or prepare your boat for larger fish offshore.</p>
      </div>
    </div>
    <div className="guide-flow-track">
      <div className="guide-step-card">
        <div className="guide-step-num"><span>1</span></div>
        <div className="guide-step-content">
          <h4>Read Waters &amp; Cast</h4>
          <p>Approach fishable waters or take your boat offshore. Hold <span className="guide-inline-key">E</span> to charge your cast arc and release into visible feeding ripples.</p>
          <span className="guide-step-tip">A Woven Lure is optional here, but makes the hook more reliable</span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>2</span></div>
        <div className="guide-step-content">
          <h4>Set the Hook</h4>
          <p>Chum a sport-fishing school, then arm a Woven Lure with <span className="guide-inline-key">R</span> before you set the hook. The lure is spent only when the paid hook succeeds.</p>
          <span className="guide-step-tip">Sport fishing always requires one lure within reach</span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>3</span></div>
        <div className="guide-step-content">
          <h4>Follow the fish</h4>
          <p>Follow the highlighted response: reel with <span className="guide-inline-key">W</span>, give slack with <span className="guide-inline-key">S</span>, and steer with <span className="guide-inline-key">A / D</span>. Watch the tension words and needle.</p>
          <span className="guide-step-tip">Tire the fish without snapping your line</span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>4</span></div>
        <div className="guide-step-content">
          <h4>Land &amp; Pack the Catch</h4>
          <p>Sport fish and physical basic catches become trade packs. Land one into an open boat slot, then collect it from the docked boat and carry it by hand to the Village Trade Center.</p>
          <span className="guide-step-tip">Freshness degrades over time — use ice to preserve value</span>
        </div>
      </div>
    </div>
    <div className="guide-callout-card">
      <div className="guide-callout-icon"><IconBoat size={18} aria-hidden="true" /></div>
      <div className="guide-callout-text">
        <strong>Freshness on the Run</strong>
        <p>Keep an eye on freshness and use ice in the boat hold. The Harbor Fish Market sells tackle and supplies; your carried trade pack is sold at the village counter.</p>
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
        <h3>Taking goods to market</h3>
        <p className="guide-lead">Sell your harvest, carry fish trade packs inland, and fill the town&apos;s delivery orders.</p>
      </div>
    </div>
    <div className="guide-flow-track">
      <div className="guide-step-card">
        <div className="guide-step-num"><span>1</span></div>
        <div className="guide-step-content">
          <h4>Inland Exchange</h4>
          <p>Visit the village stall to buy fresh seed stock and sell harvested produce, grains, and crafted provisions.</p>
          <span className="guide-step-tip">Staple crops maintain steady village prices</span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>2</span></div>
        <div className="guide-step-content">
          <h4>Boat to Counter</h4>
          <p>At a docked boat, use the collect prompt to take one fish trade pack in your hands. Walk it to the Village Produce Market and sell it from the Trade packs ledger.</p>
          <span className="guide-step-tip">The Harbor Fish Market never sells a pack straight from the hold</span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>3</span></div>
        <div className="guide-step-content">
          <h4>Market Demand Shifts</h4>
          <p>The arrows beside a market quote show how demand is changing. Goods in short supply usually sell for more.</p>
          <span className="guide-step-tip">Check quotes before packing an expedition</span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>4</span></div>
        <div className="guide-step-content">
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
