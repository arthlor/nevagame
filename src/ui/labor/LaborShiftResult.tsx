import { IconEnergy } from "../components/HudIcons";

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

/**
 * Transient post-shift readout. The strike ends the shift, so the result needs
 * its own short-lived surface; the outcome and amount come from the simulation
 * result, never from a UI-side re-derivation.
 */
export function LaborShiftResult({ feedback }: { feedback: LaborShiftFeedbackDto }) {
  return (
    <div
      className={`labor-shift-result is-${feedback.outcome}`}
      role="status"
      data-testid="labor-shift-result"
      data-outcome={feedback.outcome}
    >
      <IconEnergy size={15} aria-hidden="true" />
      <span className="labor-shift-result__label">{OUTCOME_LABEL[feedback.outcome]}</span>
      {feedback.granted > 0 && (
        <strong className="labor-shift-result__amount">{`+${feedback.granted} Work`}</strong>
      )}
      {feedback.granted <= 0 && feedback.reason && (
        <span className="labor-shift-result__reason">{feedback.reason}</span>
      )}
    </div>
  );
}
