import React, { useRef } from "react";
import type { HoldStoresDto, WorldHudCargoDto } from "../../simulation/core/contracts";
import { IconBoat, IconFish, IconLedger } from "./HudIcons";
import { useModalAccessibility } from "../useModalAccessibility";
import { ChromeButton, ChromeClose, ChromeQuality } from "../chrome/Chrome";
import { GameSheet, ItemSlot, Meter } from "../coastal/CoastalUI";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForFish, atlasForItem } from "../chrome/uiAtlas";

interface LogisticsLedgerModalProps {
  stores: HoldStoresDto;
  onClose: () => void;
}

export const LogisticsLedgerModal: React.FC<LogisticsLedgerModalProps> = ({ stores, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(modalRef, onClose);

  return (
    <div className="modal-overlay interactive" onClick={onClose}>
      <GameSheet
        ref={modalRef}
        as="div"
        className="ledger-modal stores-modal"
        tone="slate"
        corners
        rivets={false}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stores-title"
        tabIndex={-1}
      >
        <header className="ledger-header stores-header">
          <div className="ledger-title-group">
            <span className="ledger-icon" aria-hidden="true"><IconLedger size={24} /></span>
            <div>
              <h2 id="stores-title" className="ledger-title">Hold &amp; Stores</h2>
              <span className="ledger-subtitle">Cargo space and supplies currently in hand</span>
            </div>
          </div>
          <ChromeClose onClick={onClose} label="Close Hold & Stores" className="ledger-close-btn" />
        </header>

        <div className="ledger-body stores-body">
          <dl className="stores-capacity-line" aria-label="Current capacity">
            <div><dt>Satchel</dt><dd>{stores.satchel.occupiedSlots}/{stores.satchel.totalSlots} slots</dd></div>
            <div><dt><IconBoat size={16} aria-hidden="true" /> Vessel holds</dt><dd>{stores.vesselHolds.occupiedSlots}/{stores.vesselHolds.totalSlots} slots</dd></div>
            <div><dt><IconFish size={16} aria-hidden="true" /> Carried catch</dt><dd>{stores.carriedCatch ? "1 in hand" : "None"}</dd></div>
          </dl>

          <section className="ledger-section stores-supplies" aria-labelledby="stores-supplies-title">
            <h3 id="stores-supplies-title">Supplies</h3>
            <div className="stores-supply-row">
              {stores.supplies.map(({ itemId, name, count }, index) => (
                <ItemSlot
                  key={itemId}
                  className={`stores-supply-slot ${count > 0 ? "is-occupied" : ""}`}
                  filled={count > 0}
                  slotNumber={index + 1}
                  label={`${name}: ${count}`}
                >
                  <AtlasImage src={atlasForItem(itemId)} alt="" size={26} />
                  <span>{name}</span>
                  <strong>{count}</strong>
                </ItemSlot>
              ))}
            </div>
          </section>

          {stores.carriedCatch && (
            <section className="ledger-section stores-carried" aria-labelledby="stores-carried-title">
              <h3 id="stores-carried-title">Carried catch</h3>
              <CargoSlot cargo={stores.carriedCatch} slotNumber={1} />
            </section>
          )}

          <div className="stores-vessels">
            {stores.vessels.length === 0 && <p className="expedition-empty">No vessel is registered.</p>}
            {stores.vessels.map((vessel) => (
              <section
                key={vessel.boatId}
                className="ledger-section vessel-spatial-bay-section"
                aria-labelledby={`stores-${vessel.boatId}`}
              >
                <div className="stores-vessel-heading">
                  <div>
                    <h3 id={`stores-${vessel.boatId}`}>{vessel.name}</h3>
                    <span>{vessel.statusLabel} · {vessel.occupiedSlots}/{vessel.cargoSlots.length} slots filled</span>
                  </div>
                  <Meter
                    className="ledger-hold-meter"
                    label="Hull"
                    value={vessel.hull.current}
                    max={vessel.hull.maximum}
                    valueText={`${vessel.hull.percent}%`}
                    variant="hull"
                  />
                </div>
                <div className="vessel-slots-grid" aria-label={`${vessel.name} hold slots`}>
                  {vessel.cargoSlots.map((slot) => slot.cargo
                    ? <CargoSlot key={slot.cargo.cargoId} cargo={slot.cargo} slotNumber={slot.slotNumber} />
                    : (
                      <ItemSlot
                        key={`${vessel.boatId}-slot-${slot.slotNumber}`}
                        className="vessel-hold-slot"
                        slotNumber={slot.slotNumber}
                        label={`Empty hold slot ${slot.slotNumber}`}
                      />
                    ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <footer className="modal-footer">
          <ChromeButton onClick={onClose}>Close</ChromeButton>
        </footer>
      </GameSheet>
    </div>
  );
};

const CargoSlot: React.FC<{ cargo: WorldHudCargoDto; slotNumber: number }> = ({ cargo, slotNumber }) => (
  <ItemSlot
    className="vessel-hold-slot is-occupied"
    filled
    slotNumber={slotNumber}
    label={`${cargo.name}, ${cargo.weightKg.toFixed(1)} kg, ${cargo.freshnessPercent}% fresh`}
  >
    <AtlasImage src={atlasForFish(cargo.speciesId)} alt="" size={30} />
    <ChromeQuality quality={cargo.quality} showLabel={false} />
    <span className="cell-cargo-meta">{cargo.weightKg.toFixed(1)} kg</span>
    <span className="cell-cargo-freshness">{cargo.freshnessPercent}% fresh</span>
  </ItemSlot>
);
