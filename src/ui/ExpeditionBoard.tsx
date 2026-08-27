// src/ui/ExpeditionBoard.tsx
import React, { useRef } from "react";
import { GameState } from "../simulation/core/types";
import { ContentRegistry } from "../content/ContentRegistry";
import { InventoryManager } from "../simulation/inventory/InventoryManager";
import { IconBoat, IconFish, IconWarning, IconExpedition } from "./components/HudIcons";
import { formatWeatherLabel, WeatherIcon } from "./weatherPresentation";
import { useModalAccessibility } from "./useModalAccessibility";
import { ChromeAlert, ChromeButton, ChromeClose, ChromeMeter, ChromePanel } from "./chrome/Chrome";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForItem, atlasForFish } from "./chrome/uiAtlas";

interface ExpeditionBoardProps {
  state: GameState;
  onClose: () => void;
}

export const ExpeditionBoard: React.FC<ExpeditionBoardProps> = ({ state, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(modalRef, onClose);

  const playerInv = state.inventories[state.player.inventoryId];
  const boats = Object.values(state.boats).sort((a, b) => a.id.localeCompare(b.id));
  const harborMarket = state.markets["market.harbor"];
  const chumCount = InventoryManager.getItemCount(playerInv, "item.chum_bucket");
  const wormCount = InventoryManager.getItemCount(playerInv, "item.bait_worms");
  const iceCount = InventoryManager.getItemCount(playerInv, "item.crushed_ice");
  const roughWater = state.weather.seaRoughness > 0.4;

  return (
    <div className="modal-overlay interactive" onClick={onClose}>
      <ChromePanel
        ref={modalRef}
        as="div"
        className="neva-panel modal-content expedition-modal"
        tone="slate"
        flourish
        corners
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="expedition-title"
        tabIndex={-1}
      >
        <header className="modal-header">
          <span id="expedition-title" className="modal-heading-with-mark">
            <IconExpedition size={18} aria-hidden="true" /> Prepare to depart
          </span>
          <ChromeClose onClick={onClose} label="Close expedition notes" />
        </header>

        <div className="modal-body expedition-body">
          <p className="expedition-intro">A short readiness check before leaving the harbor.</p>

          <div className="expedition-readiness-list">
            <section className="expedition-section" aria-labelledby="expedition-weather-title">
              <h3 id="expedition-weather-title">
                <WeatherIcon type={state.weather.type} size={17} aria-hidden="true" /> Weather
              </h3>
              <div className="expedition-rows">
                <div className="expedition-row">
                  <span>Conditions</span>
                  <strong>
                    {formatWeatherLabel(state.weather.type)} · {Math.round(state.weather.temperatureC)}°C
                  </strong>
                </div>
                <div className="expedition-row">
                  <span>Wind</span>
                  <strong>{Math.round(state.weather.windSpeed * 1.944)} kn</strong>
                </div>
                <div className="expedition-row">
                  <span>Sea</span>
                  <strong>{Math.round(state.weather.seaRoughness * 100)}% roughness</strong>
                </div>
              </div>
              <ChromeAlert tone={roughWater ? "caution" : "success"} className="expedition-weather-alert">
                <IconWarning size={13} aria-hidden="true" />
                {roughWater ? "Rough water is expected offshore." : "The water is calm enough for the rowboat."}
              </ChromeAlert>
            </section>

            <section className="expedition-section" aria-labelledby="expedition-vessel-title">
              <h3 id="expedition-vessel-title">
                <IconBoat size={17} aria-hidden="true" /> Vessel
              </h3>
              {boats.length > 0 ? (
                <div className="expedition-vessel-list">
                  {boats.map((boat) => {
                    const definition = ContentRegistry.boats.get(boat.boatTypeId);
                    const cargoCount = boat.fishCargoSlotIds.filter(Boolean).length;
                    return (
                      <div key={boat.id} className="expedition-vessel-entry">
                        <strong>{definition?.name ?? boat.boatTypeId}</strong>
                        <ChromeMeter
                          className="expedition-hull-meter"
                          label={`${definition?.name ?? "Vessel"} hull`}
                          value={boat.durability}
                          max={100}
                          valueText={`${Math.round(boat.durability)}%`}
                          variant="hull"
                        />
                        <span>
                          {cargoCount}/{boat.fishCargoSlotIds.length} hold · {boat.isDocked ? "Docked" : "At sea"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="expedition-empty">No vessel is registered.</p>
              )}
            </section>

            <section className="expedition-section" aria-labelledby="expedition-supplies-title">
              <h3 id="expedition-supplies-title">
                <IconFish size={17} aria-hidden="true" /> Supplies
              </h3>
              <ul className="expedition-checklist" data-testid="expedition-checklist">
                <li className={`expedition-check ${chumCount > 0 ? "is-ready" : "is-missing"}`}>
                  <span aria-hidden="true">{chumCount > 0 ? "✓" : "–"}</span>
                  <span>Chum buckets</span>
                  <strong>
                    <AtlasImage src={atlasForItem("item.chum_bucket")} alt="" size={18} /> {chumCount}
                  </strong>
                </li>
                <li className={`expedition-check ${wormCount > 0 ? "is-ready" : "is-missing"}`}>
                  <span aria-hidden="true">{wormCount > 0 ? "✓" : "–"}</span>
                  <span>Worm bait</span>
                  <strong>
                    <AtlasImage src={atlasForItem("item.bait_worms")} alt="" size={18} /> {wormCount}
                  </strong>
                </li>
                <li className={`expedition-check ${iceCount > 0 ? "is-ready" : "is-missing"}`}>
                  <span aria-hidden="true">{iceCount > 0 ? "✓" : "–"}</span>
                  <span>Crushed ice</span>
                  <strong>
                    <AtlasImage src={atlasForItem("item.crushed_ice")} alt="" size={18} /> {iceCount}
                  </strong>
                </li>
              </ul>
              {chumCount === 0 && (
                <ChromeAlert tone="caution" className="expedition-supply-alert">
                  <IconWarning size={13} aria-hidden="true" /> No chum buckets are ready.
                </ChromeAlert>
              )}
            </section>

            <section className="expedition-section" aria-labelledby="expedition-harbor-title">
              <h3 id="expedition-harbor-title">Harbor</h3>
              <div className="expedition-rows">
                {harborMarket &&
                  ["fish.trout", "fish.tuna", "fish.blue_marlin"].map((speciesId) => {
                    const commodity = harborMarket.commodities[speciesId];
                    const species = ContentRegistry.fishSpecies.get(speciesId);
                    if (!species || !commodity) return null;
                    const demandPct = Math.round(commodity.demandIndex * 100);
                    return (
                      <div key={speciesId} className="expedition-row">
                        <span>
                          <AtlasImage src={atlasForFish(speciesId)} alt="" size={18} /> {species.name}
                        </span>
                        <strong className={demandPct >= 100 ? "demand-up" : "demand-down"}>
                          {demandPct}% · {commodity.basePrice} G
                        </strong>
                      </div>
                    );
                  })}
              </div>
            </section>
          </div>
        </div>

        <footer className="modal-footer">
          <ChromeButton variant="primary" soundCue="confirm" onClick={onClose}>
            Done
          </ChromeButton>
        </footer>
      </ChromePanel>
    </div>
  );
};
