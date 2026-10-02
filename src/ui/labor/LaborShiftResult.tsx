import { IconEnergy } from "../components/HudIcons";
import { useTranslation } from "../../i18n/useTranslation";

export interface LaborShiftFeedbackDto {
  /** Monotonic id so a repeat strike restarts the CSS animation. */
  token: number;
  outcome: "clean" | "glancing" | "miss";
  granted: number;
  reason?: string;
  claimed: boolean;
  choresRemaining: number;
  totalChores: number;
}

/**
 * Transient post-shift readout. The strike ends the shift, so the result needs
 * its own short-lived surface; the outcome and amount come from the simulation
 * result, never from a UI-side re-derivation.
 */
export function LaborShiftResult({ feedback }: { feedback: LaborShiftFeedbackDto }) {
  const { t, translateReason } = useTranslation();
  const outcomeLabel = t(`labor.${feedback.outcome}`);

  return (
    <div
      className={`labor-shift-result is-${feedback.outcome}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="labor-shift-result"
      data-outcome={feedback.outcome}
    >
      <IconEnergy size={15} aria-hidden="true" />
      <span className="labor-shift-result__label">{outcomeLabel}</span>
      {feedback.granted > 0 && (
        <strong className="labor-shift-result__amount">{`+${feedback.granted} ${t("labor.work")}`}</strong>
      )}
      <span className="labor-shift-result__daily">
        {t(feedback.claimed ? "labor.claimed" : "labor.retry")}
      </span>
      <span className="labor-shift-result__remaining">
        {t("labor.remaining", { remaining: feedback.choresRemaining, total: feedback.totalChores })}
      </span>
      {feedback.granted <= 0 && feedback.reason && (
        <span className="labor-shift-result__reason">{translateReason(feedback.reason)}</span>
      )}
    </div>
  );
}
