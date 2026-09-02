import React, { useState } from "react";
import { ControlsReference } from "./ControlsReference";
import { handleTabListKeyDown } from "../useTabListKeyboard";
import { playUiSound } from "../audio/uiAudio";
import { IconCoin, IconCompass, IconFish, IconSprout } from "./HudIcons";

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
      <div className="journal-page-heading"><span>Guide</span><h2>Working along the coast</h2></div>
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
    <p className="guide-lead">The prompt near the tool belt shows the action available in the world. Work is spent only when an action succeeds; sprint uses its own stamina.</p>
    <ControlsReference className="guide-controls-reference" />
  </div>
);

const FieldGuide: React.FC = () => (
  <div className="guide-chapter">
    <GuideSteps steps={[
      ["Choose seeds", "Use the seed slot or choose a seed in the Satchel while standing near prepared soil."],
      ["Place carefully", "Point at a clear patch. The world marks valid and blocked placement before you commit."],
      ["Read the crop", "Inspect a crop for its stage, moisture, and the action that can be taken now."],
      ["Process and sell", "Turn harvests into useful supplies where recipes allow, or carry produce to the village market."]
    ]} />
    <p className="guide-note">Rain, soil, climate, and care shape crops over time. Inspect the crop and hold the field tint to read what it needs now.</p>
  </div>
);

const WatersGuide: React.FC = () => (
  <div className="guide-chapter">
    <GuideSteps steps={[
      ["Cast", "Stand at fishable water, hold the contextual cast action, then release."],
      ["Set the hook", "React to the bite cue, then keep the fish inside the compact catch track."],
      ["Fight sport fish", "Respond to the one highlighted fish action. Give line when overloaded and reel when the fish tires."],
      ["Land and store", "Sport fish are physical cargo. Leave an appropriate hold slot open before going offshore."]
    ]} />
    <p className="guide-note">Freshness changes while a catch travels. Ice can protect suitable storage; the market gives the authoritative quote.</p>
  </div>
);

const TradeGuide: React.FC = () => (
  <div className="guide-chapter">
    <GuideSteps steps={[
      ["Village", "Buy field supplies and sell produce or grain at the village stall."],
      ["Harbor", "Buy fishing supplies and bring accessible physical fish cargo to the harbor market."],
      ["Demand", "Market tickets show the current quote and a plain demand signal. Prices can change with local conditions."],
      ["Contracts", "Deliver the requested goods at the named market before the deadline. Read blockers before preparing a trip."]
    ]} />
    <p className="guide-note">Hold & Stores shows physical capacity and supplies. The expedition board helps you prepare; it does not move you or complete a journey.</p>
  </div>
);

const GuideSteps: React.FC<{ steps: Array<[string, string]> }> = ({ steps }) => (
  <ol className="guide-principle-list">
    {steps.map(([title, body], index) => (
      <li key={title}><span>{index + 1}</span><div><strong>{title}</strong><p>{body}</p></div></li>
    ))}
  </ol>
);
