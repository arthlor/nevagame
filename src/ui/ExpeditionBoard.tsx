import React, { useRef, useState } from "react";
import { IconBoat, IconExpedition, IconFish, IconWarning } from "./components/HudIcons";
import { formatWeatherLabel, WeatherIcon } from "./weatherPresentation";
import { useModalAccessibility } from "./useModalAccessibility";
import { ChromeButton, ChromeClose } from "./chrome/Chrome";
import { GameSheet, Meter } from "./coastal/CoastalUI";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForItem } from "./chrome/uiAtlas";
import type { ExpeditionBoardDto } from "../simulation/expeditions/buildExpeditionOpportunities";

interface ExpeditionBoardProps {
  board: ExpeditionBoardDto;
  onClose: () => void;
}

export const ExpeditionBoard: React.FC<ExpeditionBoardProps> = ({ board, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(modalRef, onClose);

  const { opportunities, readiness } = board;
  const [selectedId, setSelectedId] = useState(opportunities[0]?.id ?? "");
  const selected = opportunities.find((item) => item.id === selectedId) ?? opportunities[0] ?? null;

  return (
    <div className="modal-overlay interactive" onClick={onClose}>
      <GameSheet
        ref={modalRef}
        as="div"
        className="expedition-modal expedition-board-sheet"
        tone="slate"
        corners
        rivets={false}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="expedition-title"
        tabIndex={-1}
      >
        <header className="modal-header expedition-board-header">
          <div>
            <h2 id="expedition-title" className="modal-heading-with-mark">
              <IconExpedition size={19} aria-hidden="true" /> Expedition board
            </h2>
            <span>Posted opportunities and what you still need</span>
          </div>
          <ChromeClose onClick={onClose} label="Close expedition board" />
        </header>

        <div className="expedition-readiness-strip" aria-label="Current readiness">
          <div className="expedition-readiness-vessel">
            <IconBoat size={18} aria-hidden="true" />
            <span>Vessel</span>
            <strong>{readiness.vessel?.name ?? "None"}</strong>
            {readiness.vessel && (
              <Meter
                className="expedition-hull-meter"
                label="Hull"
                value={readiness.vessel.hullCurrent}
                max={readiness.vessel.hullMaximum}
                valueText={`${readiness.vessel.hullPercent}%`}
                variant="hull"
              />
            )}
          </div>
          <div className="expedition-readiness-supplies">
            <IconFish size={18} aria-hidden="true" />
            <span>Supplies</span>
            {readiness.supplies.map(({ itemId, count }) => (
              <span key={itemId} className={count > 0 ? "is-ready" : "is-missing"}>
                <AtlasImage src={atlasForItem(itemId)} alt="" size={17} /> {count}
              </span>
            ))}
          </div>
          <div className="expedition-readiness-weather">
            <WeatherIcon type={readiness.weatherType} size={18} aria-hidden="true" />
            <span>Weather</span>
            <strong>{formatWeatherLabel(readiness.weatherType)} · {readiness.seaLabel}</strong>
          </div>
        </div>

        <div className="expedition-board-body">
          <nav className="expedition-notice-stack" aria-label="Posted opportunities">
            {opportunities.map((opportunity) => (
              <button
                key={opportunity.id}
                type="button"
                className={`expedition-posted-notice tone-${opportunity.tone} ${selected?.id === opportunity.id ? "is-selected" : ""}`}
                aria-pressed={selected?.id === opportunity.id}
                onClick={() => setSelectedId(opportunity.id)}
              >
                <span className="expedition-notice-tone">{opportunity.tone === "steady" ? "Steady" : "Bold"}</span>
                <strong>{opportunity.title.replace(/^(Steady|Bold):\s*/, "")}</strong>
                <span>{opportunity.destination}</span>
                <span className={opportunity.ready ? "is-ready" : "is-blocked"}>
                  {opportunity.ready ? "Ready" : `${opportunity.blockers.length} to resolve`}
                </span>
              </button>
            ))}
          </nav>

          <section className="expedition-selected-notice" aria-live="polite">
            {selected ? (
              <>
                <div className="expedition-selected-heading">
                  <div>
                    <span>{selected.tone === "steady" ? "Steady opportunity" : "Bold opportunity"}</span>
                    <h3>{selected.title.replace(/^(Steady|Bold):\s*/, "")}</h3>
                  </div>
                  <strong className={selected.ready ? "is-ready" : "is-blocked"}>
                    {selected.ready ? "Ready" : "Not ready"}
                  </strong>
                </div>
                <p>{selected.summary}</p>
                <dl className="expedition-selected-meta">
                  <div><dt>Destination</dt><dd>{selected.destination}</dd></div>
                  <div><dt>Return</dt><dd>{selected.valueLabel}</dd></div>
                  {selected.deadlineLabel && <div><dt>Deadline</dt><dd>{selected.deadlineLabel}</dd></div>}
                </dl>
                {selected.ready ? (
                  <p className="expedition-ready-note">Your current vessel, supplies, and conditions meet this notice.</p>
                ) : (
                  <div className="expedition-blockers">
                    <h4><IconWarning size={15} aria-hidden="true" /> Resolve in order</h4>
                    <ol>{selected.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ol>
                  </div>
                )}
              </>
            ) : (
              <p className="expedition-empty">No opportunity is posted right now.</p>
            )}
          </section>
        </div>

        <footer className="modal-footer">
          <ChromeButton onClick={onClose}>Close board</ChromeButton>
        </footer>
      </GameSheet>
    </div>
  );
};
