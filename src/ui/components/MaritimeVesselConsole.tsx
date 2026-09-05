import React, { useMemo } from "react";
import type { WorldHudBoatDto } from "../../simulation/core/contracts";
import { IconBoat, IconFish, IconWarning, IconWave, IconHook, IconSnowflake} from "./HudIcons";
import { ItemSlot, Meter } from "../coastal/CoastalUI";
import { ChromeQuality } from "../chrome/Chrome";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForFish } from "../chrome/uiAtlas";

export interface MaritimeVesselConsoleProps {
  boat: WorldHudBoatDto;
  headingDegrees?: number;
  headingCardinal?: string;
  registrationInsignia?: string;
  onSelectSlot?: (slotNumber: number) => void;
  className?: string;
}

export const MaritimeVesselConsole: React.FC<MaritimeVesselConsoleProps> = ({
  boat,
  headingDegrees = 0,
  headingCardinal = "N",
  registrationInsignia,
  onSelectSlot,
  className = ""
}) => {
  const isDocked = Boolean(boat.isDocked);
  const resolvedHeadingDeg = (boat as any).headingDegrees ?? headingDegrees;
  const resolvedHeadingCard = (boat as any).headingCardinal ?? headingCardinal;

  const defaultInsignia = useMemo(() => {
    if ((boat as any).registrationInsignia) return (boat as any).registrationInsignia;
    if (registrationInsignia) return registrationInsignia;
    return boat.boatId.includes("skiff") ? "REG · NV-SKF-02" : "REG · NV-ROW-01";
  }, [boat.boatId, (boat as any).registrationInsignia, registrationInsignia]);

  const hullDamageClass = useMemo(() => {
    const pct = boat.hull.percent;
    if (pct < 30 || boat.hull.danger) return "hull-critical";
    if (pct < 70) return "hull-damaged";
    return "hull-sound";
  }, [boat.hull.percent, boat.hull.danger]);

  const seaStateTone = useMemo(() => {
    switch (boat.seaState) {
      case "Rough":
        return "rough";
      case "Swell":
        return "choppy";
      case "Calm":
      default:
        return "calm";
    }
  }, [boat.seaState]);

  return (
    <section
      className={`hud-boat-panel interactive ${isDocked ? "is-docked" : ""} ${className}`.trim()}
      role="region"
      aria-label="Maritime vessel console"
      data-testid="maritime-vessel-console"
    >
      {/* Vessel Header */}
      <header className="boat-panel-header">
        <div className="boat-panel-title-row">
          <div className="boat-panel-name-group">
            <IconBoat size={16} className="boat-header-icon" aria-hidden="true" />
            <strong className="boat-panel-name">{boat.name}</strong>
            <span className="boat-registration-insignia" title="Neva Maritime Registration">
              {defaultInsignia}
            </span>
          </div>

          <div className="boat-status-chips">
            {isDocked ? (
              <span className="boat-docked-chip" role="status">
                Docked
              </span>
            ) : (
              <>
                {boat.speedKnots > 0 ? (
                  <span className="boat-underway-chip" role="status">
                    Underway
                  </span>
                ) : (
                  <span className="boat-drifting-chip" role="status">
                    Drifting
                  </span>
                )}
                {boat.showNightWarning && (
                  <span className="boat-night-chip" role="status">
                    Night waters
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
                {`${boat.speedKnots} kn · ${boat.seaState}`}
              </span>
              <span className="boat-bearing-label" title="Heading Bearing">
                {`· ${String(resolvedHeadingDeg).padStart(3, "0")}° ${resolvedHeadingCard}`}
              </span>
              <span
                className={`boat-sea-state sea-state--${seaStateTone}`}
                title={`Sea State: ${boat.seaState}`}
              >
                <IconWave size={12} aria-hidden="true" />
                {boat.seaState === "Swell" ? "Choppy" : boat.seaState}
              </span>
            </div>

            {boat.seaWarning && (
              <span className="boat-sea-warning" role="alert">
                <IconWarning size={13} aria-hidden="true" /> {boat.seaWarning}
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
                <span className="boat-section-title">Hull</span>
                <span className="boat-hull-value">{`${boat.hull.percent}%`}</span>
              </div>
              <Meter
                className={`hud-boat-hull ${hullDamageClass}`}
                label="Hull"
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
                  <span className="boat-section-title">Fuel</span>
                  <span className="boat-hull-value">{`${boat.fuel.percent}%`}</span>
                </div>
                <Meter
                  className="hud-boat-fuel"
                  label="Fuel"
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
              <span className="boat-section-title">Cargo Hold</span>
              <span className="boat-cargo-count-badge">
                {`${boat.occupiedCargoSlots}/${boat.cargoSlots.length}`}
              </span>
            </div>

            <div className="boat-cargo-grid" aria-label="Hold Bays & Hooks">
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
                      label={`Empty ${isHook ? "transom hook" : "hold bay"} ${slot.slotNumber}`}
                      onClick={() => onSelectSlot?.(slot.slotNumber)}
                    >
                      {isHook && (
                        <span className="cargo-hook-glyph" aria-hidden="true">
                          <IconHook size={12} />
                        </span>
                      )}
                      {hasIce && (
                        <span className="cargo-ice-indicator" title="Ice preserved (0.4x decay)">
                          <IconSnowflake size={12} />
                        </span>
                      )}
                    </ItemSlot>
                  );
                }

                const cargo = slot.cargo;
                return (
                  <ItemSlot
                    key={cargo.cargoId}
                    filled
                    slotNumber={slot.slotNumber}
                    className={`boat-cargo-slot is-occupied ${
                      isHook ? "is-hook" : "is-hold"
                    }`}
                    label={`${cargo.name}, ${cargo.weightKg.toFixed(1)} kg, ${
                      cargo.quality
                    } quality, ${cargo.freshnessPercent}% fresh`}
                    onClick={() => onSelectSlot?.(slot.slotNumber)}
                  >
                    <AtlasImage src={atlasForFish(cargo.speciesId)} alt="" size={28} />
                    {!atlasForFish(cargo.speciesId) && (
                      <IconFish size={14} aria-hidden="true" />
                    )}

                    <ChromeQuality quality={cargo.quality} showLabel={false} />

                    <span className="cargo-weight-pill">
                      {`${cargo.weightKg.toFixed(1)}kg`}
                    </span>

                    {isHook && <span className="cargo-hook-tag">HOOK</span>}
                    {hasIce && (
                      <span className="cargo-ice-indicator" title="Ice preserved (0.4x decay)">
                        <IconSnowflake size={12} />
                      </span>
                    )}

                    <div
                      className="cargo-freshness-track"
                      title={`Freshness: ${cargo.freshnessPercent}% (${cargo.freshnessTone})`}
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
};
