import { qualityLabel } from "../../i18n/itemText";
import { tradePackName } from "../../i18n/tradePackNames";
import React, { useMemo } from "react";
import type { WorldHudBoatDto } from "../../simulation/core/contracts";
import { IconBoat, IconFish, IconWarning, IconHook, IconSnowflake} from "./HudIcons";
import { ItemSlot, Meter } from "../coastal/CoastalUI";
import { ChromeQuality } from "../chrome/Chrome";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForFish, atlasForItem } from "../chrome/uiAtlas";
import { useTranslation } from "../../i18n/useTranslation";

export interface MaritimeVesselConsoleProps {
  boat: WorldHudBoatDto;
  headingDegrees?: number;
  headingCardinal?: string;
  registrationInsignia?: string;
  onSelectSlot?: (slotNumber: number) => void;
  className?: string;
}

export const MaritimeVesselConsole: React.FC<MaritimeVesselConsoleProps> = React.memo(({
  boat,
  headingDegrees = 0,
  headingCardinal = "N",
  registrationInsignia,
  onSelectSlot,
  className = ""
}) => {
  const { locale, getLocalizedBoat, getLocalizedFish, getLocalizedItem, translateReason } = useTranslation();
  const isTr = locale === "tr";
  const isDocked = Boolean(boat.isDocked);
  const seaState = isTr ? ({ Calm: "Sakin", Swell: "Dalgalı", Rough: "Sert" } as const)[boat.seaState] : boat.seaState;

  const defaultInsignia = useMemo(() => {
    if (registrationInsignia) return registrationInsignia;
    return boat.boatTypeId === "boat.trading_ship" ? "REG · NV-TRD-03" : boat.boatId.includes("skiff") ? "REG · NV-SKF-02" : "REG · NV-ROW-01";
  }, [boat.boatId, boat.boatTypeId, registrationInsignia]);

  const hullDamageClass = useMemo(() => {
    const pct = boat.hull.percent;
    if (boat.wrecked || pct <= 0) return "hull-critical is-wrecked";
    if (pct < 30 || boat.hull.danger) return "hull-critical";
    if (pct < 70) return "hull-damaged";
    return "hull-sound";
  }, [boat.hull.percent, boat.hull.danger, boat.wrecked]);

  const boatDisplayName = (isTr ? getLocalizedBoat(boat.boatTypeId).name : null) || boat.name;

  return (
    <section
      className={`hud-boat-panel interactive ${isDocked ? "is-docked" : ""} ${className}`.trim()}
      role="region"
      aria-label={isTr ? "Deniz taşıtı paneli" : "Maritime vessel console"}
      data-testid="maritime-vessel-console"
    >
      {/* Vessel Header */}
      <header className="boat-panel-header">
        <div className="boat-panel-title-row">
          <div className="boat-panel-name-group">
            <IconBoat size={16} className="boat-header-icon" aria-hidden="true" />
            <strong className="boat-panel-name">{boatDisplayName}</strong>
            <span className="boat-registration-insignia" title={isTr ? "Neva Deniz Sicili" : "Neva Maritime Registration"}>
              {defaultInsignia}
            </span>
          </div>

          <div className="boat-status-chips">
            {boat.wrecked ? (
              <span className="boat-wrecked-chip" role="status">
                {isTr ? "Enkaz" : "Wrecked"}
              </span>
            ) : isDocked ? (
              <span className="boat-docked-chip" role="status">
                {isTr ? "Demirli" : "Docked"}
              </span>
            ) : (
              <>
                {boat.speedKnots > 0 ? (
                  <span className="boat-underway-chip" role="status">
                    {isTr ? "Seyirde" : "Underway"}
                  </span>
                ) : (
                  <span className="boat-drifting-chip" role="status">
                    {isTr ? "Sürükleniyor" : "Drifting"}
                  </span>
                )}
                {boat.showNightWarning && (
                  <span className="boat-night-chip" role="status">
                    {isTr ? "Gece suları" : "Night waters"}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Nautical Telemetry Row */}
        {!isDocked && (
          <div className="boat-panel-sub-row boat-telemetry-row">
            <div className="boat-telemetry-metrics">
              <span className="boat-speed-label">
                {`${boat.speedKnots} kn · ${seaState}`}
              </span>
              <span className="boat-bearing-label" title={isTr ? "Rota Açısı" : "Heading Bearing"}>
                {`· ${String(headingDegrees).padStart(3, "0")}° ${headingCardinal}`}
              </span>
            </div>

            {boat.wrecked ? (
              <span className="boat-sea-warning" role="alert">
                <IconWarning size={13} aria-hidden="true" /> {isTr ? "Tamir için Neva Limanı'na çektir" : "Tow to Neva Harbor for repairs"}
              </span>
            ) : boat.seaWarning && (
              <span className="boat-sea-warning" role="alert">
                <IconWarning size={13} aria-hidden="true" /> {isTr && boat.seaWarning === "Unsafe swell" ? "Tehlikeli dalga" : translateReason(boat.seaWarning)}
              </span>
            )}
          </div>
        )}
      </header>

      {/* Running Vitals: Hull & Fuel Gauges */}
      {!isDocked && (
        <>
          <div className={`boat-running-status ${boat.fuel ? "has-fuel" : ""}`}>
            {/* Hull Integrity Section */}
            <div className={`boat-hull-section ${hullDamageClass}`}>
              <div className="boat-hull-label-row">
                <span className="boat-section-title">{isTr ? "Gövde" : "Hull"}</span>
                <span className="boat-hull-value">{`${boat.hull.percent}%`}</span>
              </div>
              <Meter
                className={`hud-boat-hull ${hullDamageClass}`}
                label={isTr ? "Gövde" : "Hull"}
                value={boat.hull.current}
                max={boat.hull.maximum}
                showLabel={false}
                showValue={false}
                fill={boat.hull.danger ? "danger" : "hull"}
              />
            </div>

            {/* Fuel Tank Level Section (Only for Motorized Craft) */}
            {boat.fuel && (
              <div className="boat-fuel-section">
                <div className="boat-hull-label-row">
                  <span className="boat-section-title">{isTr ? "Yakıt" : "Fuel"}</span>
                  <span className="boat-hull-value">{`${boat.fuel.percent}%`}</span>
                </div>
                <Meter
                  className="hud-boat-fuel"
                  label={isTr ? "Yakıt" : "Fuel"}
                  value={boat.fuel.current}
                  max={boat.fuel.maximum}
                  showLabel={false}
                  showValue={false}
                  fill={boat.fuel.danger ? "danger" : "gold"}
                />
              </div>
            )}
          </div>

          {/* Physical Cargo Hold Bay Grid */}
          <div className="boat-cargo-section">
            <div className="boat-cargo-label-row">
              <span className="boat-section-title">{isTr ? "Ambar" : "Cargo"}</span>
              <span className="boat-cargo-count-badge">
                {`${boat.occupiedCargoSlots}/${boat.cargoSlots.length}`}
              </span>
            </div>

            <div className="boat-cargo-grid" aria-label={isTr ? "Ambar Bölmeleri ve Kancalar" : "Hold Bays & Hooks"}>
              {boat.cargoSlots.map((slot) => {
                const isHook = slot.slotType === "external-hook";
                const hasIce = slot.hasIce;

                if (!slot.cargo) {
                  return (
                    <ItemSlot
                      key={`cargo-slot-${slot.slotNumber}`}
                      className={`boat-cargo-slot is-empty ${
                        isHook ? "is-hook" : "is-hold"
                      }`}
                      slotNumber={slot.slotNumber}
                      label={isTr ? `Boş ${isHook ? "ayna kancası" : "ambar bölmesi"} ${slot.slotNumber}` : `Empty ${isHook ? "transom hook" : "hold bay"} ${slot.slotNumber}`}
                      onClick={onSelectSlot ? () => onSelectSlot(slot.slotNumber) : undefined}
                    >
                      {isHook && (
                        <span className="cargo-hook-glyph" aria-hidden="true">
                          <IconHook size={12} />
                        </span>
                      )}
                      {hasIce && (
                        <span className="cargo-ice-indicator" title={isTr ? "Buzla korunuyor" : "Preserved with ice"}>
                          <IconSnowflake size={12} />
                        </span>
                      )}
                    </ItemSlot>
                  );
                }

                const cargo = slot.cargo;
                const cargoFishName = cargo.tradePackId ? tradePackName(cargo.tradePackId, cargo.name, isTr ? "tr" : "en") : (isTr ? (cargo.kind === "farm" ? getLocalizedItem(cargo.itemId!).name : getLocalizedFish(cargo.speciesId).name) : null) || cargo.name;
                return (
                  <ItemSlot
                    key={cargo.cargoId}
                    filled
                    slotNumber={slot.slotNumber}
                    className={`boat-cargo-slot is-occupied ${
                      isHook ? "is-hook" : "is-hold"
                    }`}
                    label={`${cargoFishName}, ${cargo.weightKg.toFixed(1)} kg, ${
                      qualityLabel(cargo.quality, locale)
                    }, ${cargo.freshnessPercent}%`}
                    onClick={onSelectSlot ? () => onSelectSlot(slot.slotNumber) : undefined}
                  >
                    <AtlasImage src={cargo.kind === "farm" ? atlasForItem(cargo.itemId!) : atlasForFish(cargo.speciesId)} alt="" size={28} />
                    {!atlasForItem(cargo.itemId) && !atlasForFish(cargo.speciesId) && (
                      <IconFish size={14} aria-hidden="true" />
                    )}

                    <ChromeQuality quality={cargo.quality} showLabel={false} />

                    <span className="cargo-weight-pill">
                      {`${cargo.weightKg.toFixed(1)}kg`}
                    </span>

                    {isHook && <span className="cargo-hook-tag">{isTr ? "KANCA" : "HOOK"}</span>}
                    {hasIce && (
                      <span className="cargo-ice-indicator" title={isTr ? "Buzla korunuyor" : "Preserved with ice"}>
                        <IconSnowflake size={12} />
                      </span>
                    )}

                    <div
                      className="cargo-freshness-track"
                      title={cargo.kind === "farm" ? (isTr ? `Durum: %${cargo.freshnessPercent}` : `Condition: ${cargo.freshnessPercent}%`) : (isTr ? `Tazelik: %${cargo.freshnessPercent}` : `Freshness: ${cargo.freshnessPercent}% (${cargo.freshnessTone})`)}
                      aria-hidden="true"
                    >
                      <div
                        className={`cargo-freshness-fill freshness-${cargo.freshnessTone}`}
                        style={{ width: `${cargo.freshnessPercent}%` }}
                      />
                    </div>
                  </ItemSlot>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
});
