import React, { useRef, useState } from "react";
import type { HoldStoresDto, WorldHudCargoDto } from "../../simulation/core/contracts";
import { playUiSound } from "../audio/uiAudio";
import { IconBoat, IconFish, IconLedger } from "./HudIcons";
import { useModalAccessibility } from "../useModalAccessibility";
import { ChromeButton, ChromeClose, ChromeQuality } from "../chrome/Chrome";
import { GameSheet, ItemSlot, Meter } from "../coastal/CoastalUI";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForFish, atlasForItem } from "../chrome/uiAtlas";

export type LedgerTransferDirection = "to-hold" | "to-satchel";

interface LogisticsLedgerModalProps {
  stores: HoldStoresDto;
  onClose: () => void;
  /** Moves one stack between the satchel and a vessel's stores. */
  onTransfer?: (
    itemId: string,
    quantity: number,
    boatId: string,
    direction: LedgerTransferDirection
  ) => { success: boolean; reason?: string };
}

export const LogisticsLedgerModal: React.FC<LogisticsLedgerModalProps> = ({
  stores,
  onClose,
  onTransfer
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [transferNotice, setTransferNotice] = useState<string | null>(null);
  useModalAccessibility(modalRef, onClose);

  const runTransfer = (
    itemId: string,
    quantity: number,
    boatId: string,
    direction: LedgerTransferDirection
  ): void => {
    const result = onTransfer?.(itemId, quantity, boatId, direction);
    if (!result) return;
    playUiSound(result.success ? "confirm" : "click");
    setTransferNotice(
      result.success
        ? `Moved ${quantity} ${direction === "to-hold" ? "to the hold" : "to the satchel"}`
        : result.reason ?? "That move was refused"
    );
  };

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

                {onTransfer && (
                  <div
                    className="ledger-transfer"
                    data-testid={`ledger-transfer-${vessel.boatId}`}
                    aria-label={`Move goods between the satchel and ${vessel.name}`}
                  >
                    <TransferColumn
                      title="Satchel"
                      emptyLabel="Nothing stackable in the satchel."
                      rows={stores.satchelStock}
                      actionLabel="Stow"
                      testIdPrefix={`stow-${vessel.boatId}`}
                      onMove={(itemId, count) =>
                        runTransfer(itemId, count, vessel.boatId, "to-hold")
                      }
                    />
                    <TransferColumn
                      title={`${vessel.name} stores`}
                      emptyLabel="This vessel is carrying no stores."
                      rows={vessel.stock}
                      actionLabel="Take"
                      testIdPrefix={`take-${vessel.boatId}`}
                      onMove={(itemId, count) =>
                        runTransfer(itemId, count, vessel.boatId, "to-satchel")
                      }
                    />
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>

        {transferNotice && (
          <p className="ledger-transfer-notice" role="status" data-testid="ledger-transfer-notice">
            {transferNotice}
          </p>
        )}

        <footer className="modal-footer">
          <ChromeButton onClick={onClose}>Close</ChromeButton>
        </footer>
      </GameSheet>
    </div>
  );
};

/**
 * One side of the transfer panel. Each row moves its whole stack on a single
 * press, which is the common case; the count is on the button so the player
 * knows what a press will do before making it.
 */
const TransferColumn: React.FC<{
  title: string;
  emptyLabel: string;
  actionLabel: string;
  testIdPrefix: string;
  rows: ReadonlyArray<{ itemId: string; name: string; count: number }>;
  onMove: (itemId: string, count: number) => void;
}> = ({ title, emptyLabel, actionLabel, testIdPrefix, rows, onMove }) => (
  <section className="ledger-transfer-column">
    <h4 className="ledger-transfer-title">{title}</h4>
    {rows.length === 0 ? (
      <p className="ledger-transfer-empty">{emptyLabel}</p>
    ) : (
      <ul className="ledger-transfer-list">
        {rows.map((row) => (
          <li key={row.itemId} className="ledger-transfer-row">
            <AtlasImage src={atlasForItem(row.itemId)} alt="" size={20} />
            <span className="ledger-transfer-name">{row.name}</span>
            <span className="ledger-transfer-count">{row.count}</span>
            <ChromeButton
              size="sm"
              className="ledger-transfer-btn"
              data-testid={`${testIdPrefix}-${row.itemId}`}
              aria-label={`${actionLabel} ${row.count} ${row.name}`}
              onClick={() => onMove(row.itemId, row.count)}
            >
              {actionLabel}
            </ChromeButton>
          </li>
        ))}
      </ul>
    )}
  </section>
);

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
