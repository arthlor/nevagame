import { IconEnergy } from "../components/HudIcons";
import { useTranslation } from "../../i18n/useTranslation";

export interface LaborShiftFeedbackDto {
  /** Monotonic id so a repeat strike restarts the CSS animation. */
  token: number;
  outcome: "clean" | "glancing" | "miss";
  granted: number;
  reason?: string;
}

const OUTCOME_LABEL: Record<LaborShiftFeedbackDto["outcome"], string> = {
  clean: "Clean strike",
  glancing: "Glancing blow",
  miss: "Missed"
};

const OUTCOME_LABEL_TR: Record<LaborShiftFeedbackDto["outcome"], string> = {
  clean: "Temiz vuruş",
  glancing: "Sıyırdı",
  miss: "Iskaladı"
};

/**
 * Transient post-shift readout. The strike ends the shift, so the result needs
 * its own short-lived surface; the outcome and amount come from the simulation
 * result, never from a UI-side re-derivation.
 */
export function LaborShiftResult({ feedback }: { feedback: LaborShiftFeedbackDto }) {
  const { locale } = useTranslation();
  const isTr = locale === "tr";
  const outcomeLabel = isTr ? OUTCOME_LABEL_TR[feedback.outcome] : OUTCOME_LABEL[feedback.outcome];
  const workLabel = isTr ? "İş Gücü" : "Work";

  return (
    <div
      className={`labor-shift-result is-${feedback.outcome}`}
      role="status"
      data-testid="labor-shift-result"
      data-outcome={feedback.outcome}
    >
      <IconEnergy size={15} aria-hidden="true" />
      <span className="labor-shift-result__label">{outcomeLabel}</span>
      {feedback.granted > 0 && (
        <strong className="labor-shift-result__amount">{`+${feedback.granted} ${workLabel}`}</strong>
      )}
      {feedback.granted <= 0 && feedback.reason && (
        <span className="labor-shift-result__reason">{feedback.reason}</span>
      )}
    </div>
  );
}
