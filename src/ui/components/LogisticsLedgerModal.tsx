import React, { useRef, useState } from "react";
import type { HoldStoresDto, WorldHudCargoDto } from "../../simulation/core/contracts";
import { playUiSound } from "../audio/uiAudio";
import { IconBoat, IconFish, IconLedger } from "./HudIcons";
import { useModalAccessibility } from "../useModalAccessibility";
import { ChromeButton, ChromeClose, ChromeQuality } from "../chrome/Chrome";
import { GameSheet, ItemSlot, Meter } from "../coastal/CoastalUI";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForFish, atlasForItem } from "../chrome/uiAtlas";
import { handleTabListKeyDown } from "../useTabListKeyboard";

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
  /** Stows the carried catch aboard the active vessel. */
  onStowCatch?: (
    boatId: string,
    placement: "hold" | "hook"
  ) => { success: boolean; reason?: string };
  /** Moves goods between the satchel and an authored storage facility. */
  onMoveStorageGoods?: (
    kind: string,
    itemId: string,
    quantity: number,
    direction: "deposit" | "withdraw"
  ) => { success: boolean; reason?: string };
  /** Moves the carried catch into or out of a storage facility. */
  onMoveStorageFish?: (
    kind: string,
    cargoId: string,
    direction: "store" | "take"
  ) => { success: boolean; reason?: string };
  /** Sets the carried catch down on walkable ground at the player's feet. */
  onDropCatch?: () => { success: boolean; reason?: string };
}

export const LogisticsLedgerModal: React.FC<LogisticsLedgerModalProps> = ({
  stores,
  onClose,
  onTransfer,
  onStowCatch,
  onMoveStorageGoods,
  onMoveStorageFish,
  onDropCatch
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [transferNotice, setTransferNotice] = useState<string | null>(null);
  const [selectedBoatId, setSelectedBoatId] = useState<string>(
    stores.vessels.find((vessel) => vessel.isActive)?.boatId ?? stores.vessels[0]?.boatId ?? ""
  );
  useModalAccessibility(modalRef, onClose);

  const activeBoatId = stores.vessels.some((v) => v.boatId === selectedBoatId)
    ? selectedBoatId
    : (stores.vessels[0]?.boatId ?? "");

  const runTransfer = (
    itemId: string,
    itemName: string,
    quantity: number,
    boatId: string,
    direction: LedgerTransferDirection
  ): void => {
    const result = onTransfer?.(itemId, quantity, boatId, direction);
    if (!result) return;
    playUiSound(result.success ? "confirm" : "click");
    setTransferNotice(
      result.success
        ? `Moved ${quantity} ${itemName} ${direction === "to-hold" ? "to the hold" : "to the satchel"}`
        : result.reason ?? "That move was refused"
    );
  };

  const runStowCatch = (boatId: string, placement: "hold" | "hook"): void => {
    const result = onStowCatch?.(boatId, placement);
    if (!result) return;
    playUiSound(result.success ? "confirm" : "click");
    setTransferNotice(
      result.success
        ? placement === "hook"
          ? "Hooked the catch on the transom"
          : "Stowed the catch in the hold"
        : result.reason ?? "That stow was refused"
    );
  };

  const runStorageGoods = (
    kind: string,
    itemId: string,
    itemName: string,
    quantity: number,
    direction: "deposit" | "withdraw"
  ): void => {
    const result = onMoveStorageGoods?.(kind, itemId, quantity, direction);
    if (!result) return;
    playUiSound(result.success ? "confirm" : "click");
    setTransferNotice(
      result.success
        ? `Moved ${quantity} ${itemName} ${direction === "deposit" ? "into storage" : "to the satchel"}`
        : result.reason ?? "That move was refused"
    );
  };

  const runStorageFish = (kind: string, cargoId: string, direction: "store" | "take"): void => {
    const result = onMoveStorageFish?.(kind, cargoId, direction);
    if (!result) return;
    playUiSound(result.success ? "confirm" : "click");
    setTransferNotice(
      result.success
        ? direction === "store"
          ? "Stored the catch"
          : "Collected the catch"
        : result.reason ?? "That move was refused"
    );
  };

  const runDropCatch = (): void => {
    const result = onDropCatch?.();
    if (!result) return;
    playUiSound(result.success ? "confirm" : "click");
    setTransferNotice(
      result.success
        ? "Trade pack set down nearby. Collect it when ready."
        : result.reason ?? "No clear ground here"
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
            <ul className="stores-supply-row">
              {stores.supplies.map(({ itemId, name, count }) => (
                <li
                  key={itemId}
                  className={`stores-supply-slot ${count > 0 ? "is-occupied" : "is-empty"}`}
                >
                  <AtlasImage src={atlasForItem(itemId)} alt="" size={26} className="stores-supply-icon" />
                  <span className="stores-supply-name">{name}</span>
                  <strong className="stores-supply-count">{count}</strong>
                </li>
              ))}
            </ul>
          </section>

          {stores.carriedCatch && (() => {
            const activeVessel = stores.vessels.find((vessel) => vessel.isActive);
            return (
              <section className="ledger-section stores-carried" aria-labelledby="stores-carried-title">
                <h3 id="stores-carried-title">Carried catch</h3>
                <CargoSlot cargo={stores.carriedCatch} slotNumber={1} />
                {activeVessel ? (
                  <>
                    <div className="stores-stow-actions" role="group" aria-label="Stow the carried catch">
                      <ChromeButton
                        size="sm"
                        soundCue="click"
                        disabled={!activeVessel.stowCarried.hold}
                        onClick={() => runStowCatch(activeVessel.boatId, "hold")}
                      >
                        Stow in hold
                      </ChromeButton>
                      <ChromeButton
                        size="sm"
                        soundCue="click"
                        disabled={!activeVessel.stowCarried.hook}
                        onClick={() => runStowCatch(activeVessel.boatId, "hook")}
                      >
                        Hang on transom hook
                      </ChromeButton>
                    </div>
                    {!activeVessel.stowCarried.hold && !activeVessel.stowCarried.hook && (
                      <p className="stores-stow-note">No hold slot or transom hook fits this catch.</p>
                    )}
                  </>
                ) : (
                  <p className="stores-stow-note">Board your vessel to stow this catch.</p>
                )}
                {onDropCatch && !activeVessel && (
                  <div className="stores-stow-actions" role="group" aria-label="Set the carried catch down">
                    <ChromeButton size="sm" soundCue="click" onClick={runDropCatch}>
                      Set down on the ground
                    </ChromeButton>
                  </div>
                )}
                {onDropCatch && (
                  <p className="stores-stow-note">
                    {activeVessel
                      ? "Disembark to set this pack down."
                      : "A pack set on the ground stays here and loses freshness in the open air."}
                  </p>
                )}
              </section>
            );
          })()}

          <div className="stores-vessels">
            {stores.vessels.length === 0 && <p className="expedition-empty">No vessel is registered.</p>}
            {stores.vessels.length > 1 && (
              <div className="stores-vessel-tabs" role="tablist" aria-label="Select vessel" onKeyDown={handleTabListKeyDown}>
                {stores.vessels.map((v) => {
                  const isSelected = v.boatId === activeBoatId;
                  return (
                    <button
                      key={v.boatId}
                      id={`stores-vessel-tab-${v.boatId}`}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      aria-controls={`stores-vessel-panel-${v.boatId}`}
                      tabIndex={isSelected ? 0 : -1}
                      className={`stores-vessel-tab ${isSelected ? "is-active" : ""}`}
                      onClick={() => {
                        playUiSound("click");
                        setSelectedBoatId(v.boatId);
                      }}
                    >
                      <IconBoat size={15} aria-hidden="true" />
                      <span>{v.name}</span>
                      <span className="stores-vessel-tab-badge">
                        {v.occupiedSlots}/{v.cargoSlots.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {stores.vessels.map((vessel) => (
              <section
                key={vessel.boatId}
                id={`stores-vessel-panel-${vessel.boatId}`}
                className={`ledger-section vessel-spatial-bay-section ${
                  stores.vessels.length > 1 && vessel.boatId !== activeBoatId ? "is-vessel-hidden" : ""
                }`}
                role={stores.vessels.length > 1 ? "tabpanel" : undefined}
                aria-labelledby={stores.vessels.length > 1 ? `stores-vessel-tab-${vessel.boatId}` : `stores-${vessel.boatId}`}
                hidden={stores.vessels.length > 1 && vessel.boatId !== activeBoatId}
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
                    role="group"
                    data-testid={`ledger-transfer-${vessel.boatId}`}
                    aria-label={`Move goods between the satchel and ${vessel.name}`}
                  >
                    <TransferColumn
                      title="Satchel"
                      emptyLabel="Nothing stackable in the satchel."
                      rows={stores.satchelStock}
                      actionLabel="Stow"
                      testIdPrefix={`stow-${vessel.boatId}`}
                      onMove={(itemId, name, count) =>
                        runTransfer(itemId, name, count, vessel.boatId, "to-hold")
                      }
                    />
                    <TransferColumn
                      title={`${vessel.name} stores`}
                      emptyLabel="This vessel is carrying no stores."
                      rows={vessel.stock}
                      actionLabel="Take"
                      testIdPrefix={`take-${vessel.boatId}`}
                      onMove={(itemId, name, count) =>
                        runTransfer(itemId, name, count, vessel.boatId, "to-satchel")
                      }
                    />
                  </div>
                )}
              </section>
            ))}
          </div>

          {stores.storage.length > 0 && (
            <div className="stores-storage" data-testid="ledger-storage">
              {stores.storage.map((facility) => (
                <section
                  key={facility.kind}
                  className="ledger-section stores-storage-section"
                  aria-labelledby={`stores-storage-${facility.kind}`}
                >
                  <div className="stores-vessel-heading">
                    <div>
                      <h3 id={`stores-storage-${facility.kind}`}>{facility.name}</h3>
                      <span>
                        {facility.locked
                          ? facility.blockerReason ?? "Locked"
                          : facility.near
                            ? "Within reach"
                            : "Walk to it to move goods"}{" "}
                        · Fish {facility.fish.usedSlots}/{facility.fish.totalSlots} · Goods{" "}
                        {facility.goods.usedSlots}/{facility.goods.totalSlots}
                      </span>
                    </div>
                  </div>

                  <div className="vessel-slots-grid" aria-label={`${facility.name} fish storage`}>
                    {facility.fish.cargo.map((cargo, index) => (
                      <div key={cargo.cargoId} className="storage-fish-slot">
                        <CargoSlot cargo={cargo} slotNumber={index + 1} />
                        {onMoveStorageFish && (
                          <ChromeButton
                            size="sm"
                            soundCue="click"
                            data-testid={`storage-take-${facility.kind}-${cargo.cargoId}`}
                            aria-label={`Take ${cargo.name} from ${facility.name}`}
                            disabled={facility.locked || !facility.near || Boolean(stores.carriedCatch)}
                            onClick={() => runStorageFish(facility.kind, cargo.cargoId, "take")}
                          >
                            Take catch
                          </ChromeButton>
                        )}
                      </div>
                    ))}
                    {facility.fish.totalSlots > facility.fish.usedSlots && (
                      <ItemSlot
                        className="vessel-hold-slot"
                        slotNumber={facility.fish.usedSlots + 1}
                        label={`Empty ${facility.name} fish slot`}
                      />
                    )}
                  </div>

                  {onMoveStorageFish && stores.carriedCatch && (
                    <div className="stores-stow-actions">
                      <ChromeButton
                        size="sm"
                        variant="gold"
                        soundCue="confirm"
                        data-testid={`storage-store-${facility.kind}`}
                        disabled={facility.locked || !facility.near}
                        onClick={() => runStorageFish(facility.kind, stores.carriedCatch!.cargoId, "store")}
                      >
                        Store carried catch
                      </ChromeButton>
                    </div>
                  )}

                  {onMoveStorageGoods && facility.near && !facility.locked && (
                    <div
                      className="ledger-transfer"
                      role="group"
                      data-testid={`ledger-storage-transfer-${facility.kind}`}
                      aria-label={`Move goods between the satchel and ${facility.name}`}
                    >
                      <TransferColumn
                        title="Satchel"
                        emptyLabel="Nothing stackable in the satchel."
                        rows={stores.satchelStock}
                        actionLabel="Store"
                        testIdPrefix={`storage-deposit-${facility.kind}`}
                        onMove={(itemId, name, count) => runStorageGoods(facility.kind, itemId, name, count, "deposit")}
                      />
                      <TransferColumn
                        title={`${facility.name} goods`}
                        emptyLabel="This storage holds no goods."
                        rows={facility.goods.stock}
                        actionLabel="Take"
                        testIdPrefix={`storage-withdraw-${facility.kind}`}
                        onMove={(itemId, name, count) => runStorageGoods(facility.kind, itemId, name, count, "withdraw")}
                      />
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>

        {transferNotice && (
          <p className="ledger-transfer-notice" role="status" data-testid="ledger-transfer-notice">
            {transferNotice}
          </p>
        )}

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
  onMove: (itemId: string, name: string, count: number) => void;
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
            <ChromeButton
              size="sm"
              className="ledger-transfer-btn"
              data-testid={`${testIdPrefix}-${row.itemId}`}
              aria-label={`${actionLabel} ${row.count} ${row.name}`}
              onClick={() => onMove(row.itemId, row.name, row.count)}
            >
              {actionLabel} {row.count}
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
