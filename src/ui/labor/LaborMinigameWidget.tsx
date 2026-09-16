import type { LaborHudDto } from "../../simulation/core/contracts";

interface LaborMinigameWidgetProps {
  hud: LaborHudDto;
  onStrike: () => void;
  onCancel: () => void;
}

/**
 * The Work-shift timing readout. It displays a simulation-owned meter and two
 * commands; it never derives the sweet spot or the reward itself.
 */
export function LaborMinigameWidget({ hud, onStrike, onCancel }: LaborMinigameWidgetProps) {
  const meterPercent = Math.round(hud.meter * 100);
  const sweetLeft = Math.round(hud.targetMin * 100);
  const sweetWidth = Math.round((hud.targetMax - hud.targetMin) * 100);
  return (
    <div
      data-testid="labor-minigame"
      style={{
        position: "fixed",
        left: "50%",
        bottom: "18%",
        transform: "translateX(-50%)",
        width: "min(340px, 78vw)",
        padding: "14px 16px",
        borderRadius: "14px",
        background: "rgba(24, 20, 16, 0.9)",
        color: "#f4ead7",
        zIndex: 40,
        pointerEvents: "auto"
      }}
      className="interactive"
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{hud.stationName}</div>
      <div
        role="meter"
        aria-label={`${hud.stationName} timing`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={meterPercent}
        style={{ position: "relative", height: 14, borderRadius: 7, background: "rgba(255,255,255,0.14)" }}
      >
        <div
          style={{
            position: "absolute",
            left: `${sweetLeft}%`,
            width: `${sweetWidth}%`,
            top: 0,
            bottom: 0,
            borderRadius: 7,
            background: "rgba(226, 178, 84, 0.55)"
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${meterPercent}%`,
            top: -3,
            width: 4,
            height: 20,
            marginLeft: -2,
            borderRadius: 2,
            background: "#fff6e0"
          }}
        />
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <button type="button" onClick={onStrike} style={{ flex: 1 }}>
          Strike
        </button>
        <button type="button" onClick={onCancel} style={{ flex: 1 }}>
          Stop
        </button>
      </div>
    </div>
  );
}
