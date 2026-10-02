import React, { useRef, useState } from "react";
import { IconBoat, IconExpedition, IconFish, IconWarning } from "./components/HudIcons";
import { formatWeatherLabel, WeatherIcon } from "./weatherPresentation";
import { useModalAccessibility } from "./useModalAccessibility";
import { ChromeClose } from "./chrome/Chrome";
import { GameSheet, Meter } from "./coastal/CoastalUI";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForItem } from "./chrome/uiAtlas";
import type { ExpeditionBoardDto } from "../simulation/expeditions/buildExpeditionOpportunities";
import { localizeCatalogText } from "../i18n/catalogNames";
import { translateExpeditionText } from "../i18n/expeditionTr";
import { useTranslation } from "../i18n/useTranslation";

interface ExpeditionBoardProps {
  board: ExpeditionBoardDto;
  onClose: () => void;
}

export const ExpeditionBoard: React.FC<ExpeditionBoardProps> = ({ board, onClose }) => {
  const { locale } = useTranslation();
  const isTr = locale === "tr";
  const line = (text: string) => translateExpeditionText(text, locale);
  const contentName = (text: string) => (isTr ? localizeCatalogText(text, locale) : text);
  const modalRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(modalRef, onClose);

  const { opportunities, readiness } = board;
  const [selectedId, setSelectedId] = useState(opportunities[0]?.id ?? "");
  const selected = opportunities.find((item) => item.id === selectedId) ?? opportunities[0] ?? null;
  const availableSupplyKinds = readiness.supplies.filter((supply) => supply.count > 0).length;

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
          <div className="expedition-title-group">
            <h2 id="expedition-title" className="modal-heading-with-mark">
              <IconExpedition size={19} aria-hidden="true" /> {isTr ? "Sefer Panosu" : "Expedition board"}
            </h2>
          </div>
          <ChromeClose onClick={onClose} label={isTr ? "Sefer panosunu kapat" : "Close expedition board"} />
        </header>

        <details className="expedition-readiness-disclosure">
          <summary className="expedition-readiness-summary">
            <strong>{isTr ? "Hazırlık" : "Readiness"}</strong>
            <span>
              {readiness.vessel
                ? isTr
                  ? `${contentName(readiness.vessel.name)} · %${readiness.vessel.hullPercent} gövde`
                  : `${readiness.vessel.name} · ${readiness.vessel.hullPercent}% hull`
                : (isTr ? "Tekne yok" : "No vessel")}
            </span>
            <span>{formatWeatherLabel(readiness.weatherType)} · {line(readiness.seaLabel)}</span>
            <span>
              {isTr
                ? `${availableSupplyKinds} erzak türü`
                : `${availableSupplyKinds} ${availableSupplyKinds === 1 ? "supply type" : "supply types"}`}
            </span>
          </summary>
          <div className="expedition-readiness-strip" role="group" aria-label={isTr ? "Mevcut hazırlık detayları" : "Current readiness details"}>
            <div className="expedition-readiness-vessel">
              <div className="expedition-readiness-title">
                <IconBoat size={18} aria-hidden="true" />
                <span>{isTr ? "Tekne" : "Vessel"}</span>
              </div>
              <div className="expedition-vessel-status">
                <strong>{readiness.vessel ? contentName(readiness.vessel.name) : (isTr ? "Yok" : "None")}</strong>
                {readiness.vessel && (
                  <Meter
                    className="expedition-hull-meter"
                    label={isTr ? "Gövde" : "Hull"}
                    value={readiness.vessel.hullCurrent}
                    max={readiness.vessel.hullMaximum}
                    valueText={`${readiness.vessel.hullPercent}%`}
                    variant="hull"
                  />
                )}
              </div>
            </div>
            <div className="expedition-readiness-supplies">
              <div className="expedition-readiness-title">
                <IconFish size={18} aria-hidden="true" />
                <span>{isTr ? "Erzak" : "Supplies"}</span>
              </div>
              <div className="expedition-supplies-grid">
                {readiness.supplies.map(({ itemId, name, count }) => (
                  <span key={itemId} className={`expedition-supply-pill ${count > 0 ? "is-ready" : "is-missing"}`}>
                    <AtlasImage src={atlasForItem(itemId)} alt="" size={18} />
                    <span>{contentName(name)}</span>
                    <strong>{count}</strong>
                  </span>
                ))}
              </div>
            </div>
            <div className="expedition-readiness-weather">
              <div className="expedition-readiness-title">
                <WeatherIcon type={readiness.weatherType} size={18} aria-hidden="true" />
                <span>{isTr ? "Hava" : "Weather"}</span>
              </div>
              <strong className="expedition-weather-val">{formatWeatherLabel(readiness.weatherType)} · {line(readiness.seaLabel)}</strong>
            </div>
          </div>
        </details>

        <div className="expedition-board-body">
          <nav className="expedition-notice-stack" aria-label={isTr ? "Duyurulan seferler" : "Posted opportunities"}>
            {opportunities.map((opportunity) => (
              <button
                key={opportunity.id}
                type="button"
                className={`expedition-posted-notice tone-${opportunity.tone} ${selected?.id === opportunity.id ? "is-selected" : ""}`}
                aria-pressed={selected?.id === opportunity.id}
                aria-controls="expedition-opportunity-details"
                onClick={() => setSelectedId(opportunity.id)}
              >
                <strong>{line(opportunity.title.replace(/^(Steady|Bold):\s*/, ""))}</strong>
                <span>{line(opportunity.destination)}</span>
                <span className={opportunity.ready ? "is-ready" : "is-blocked"}>
                  {opportunity.ready
                    ? (isTr ? "Hazır" : "Ready")
                    : (isTr ? `${opportunity.blockers.length} eksik` : `${opportunity.blockers.length} to resolve`)}
                </span>
              </button>
            ))}
          </nav>

          <section id="expedition-opportunity-details" className="expedition-selected-notice" aria-label={isTr ? "Seçilen sefer" : "Selected opportunity"}>
            {selected ? (
              <>
                <div className="expedition-selected-heading" aria-live="polite" aria-atomic="true">
                  <div>
                    <h3>{line(selected.title.replace(/^(Steady|Bold):\s*/, ""))}</h3>
                  </div>
                  <strong className={selected.ready ? "is-ready" : "is-blocked"}>
                    {selected.ready ? (isTr ? "Hazır" : "Ready") : (isTr ? "Hazır Değil" : "Not ready")}
                  </strong>
                </div>
                <p>{line(selected.summary)}</p>
                <dl className="expedition-selected-meta">
                  <div><dt>{isTr ? "Menzil" : "Destination"}</dt><dd>{line(selected.destination)}</dd></div>
                  {selected.journeyLabel && <div><dt>{isTr ? "Yolculuk" : "Journey"}</dt><dd>{line(selected.journeyLabel)}</dd></div>}
                  <div><dt>{isTr ? "Kazanç" : "Return"}</dt><dd>{line(selected.valueLabel)}</dd></div>
                  {selected.deadlineLabel && <div><dt>{isTr ? "Süre" : "Deadline"}</dt><dd>{line(selected.deadlineLabel)}</dd></div>}
                </dl>
                {!selected.ready && (
                  <div className="expedition-blockers">
                    <h4><IconWarning size={15} aria-hidden="true" /> {isTr ? "Gerekenler" : "Before you go"}</h4>
                    <ol>{selected.blockers.map((blocker) => <li key={blocker}>{line(blocker)}</li>)}</ol>
                  </div>
                )}
              </>
            ) : (
              <p className="expedition-empty">{isTr ? "Henüz sefer yok." : "No trips posted."}</p>
            )}
          </section>
        </div>

      </GameSheet>
    </div>
  );
};
