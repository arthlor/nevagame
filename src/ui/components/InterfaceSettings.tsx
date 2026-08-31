// src/ui/components/InterfaceSettings.tsx
import React, { useEffect, useState } from "react";
import { uiScale, type UiScalePreference } from "../uiScale";
import { playUiSound } from "../audio/uiAudio";

const CHOICES: ReadonlyArray<{
  value: UiScalePreference;
  label: string;
  description: string;
}> = [
  { value: "auto", label: "Auto", description: "Matches your window" },
  { value: "small", label: "Small", description: "More world visible" },
  { value: "normal", label: "Normal", description: "Reference size" },
  { value: "large", label: "Large", description: "Easier to read" }
];

/**
 * Interface scale lives beside graphics quality because it is the same kind of
 * decision: how much of the screen the game spends on chrome.
 */
export const InterfaceSettings: React.FC = () => {
  const [preference, setPreference] = useState<UiScalePreference>(uiScale.current);
  const [resolved, setResolved] = useState<number>(uiScale.resolved);

  useEffect(
    () =>
      uiScale.subscribe((next, scale) => {
        setPreference(next);
        setResolved(scale);
      }),
    []
  );

  return (
    <section className="interface-settings" aria-labelledby="interface-settings-title">
      <div className="graphics-settings__heading">
        <h5 id="interface-settings-title">Interface scale</h5>
        <span className="graphics-settings__active" aria-live="polite">
          <span aria-hidden="true" /> Active: {Math.round(resolved * 100)}%
        </span>
      </div>
      <div className="graphics-quality-options" role="radiogroup" aria-label="Interface scale">
        {CHOICES.map((choice) => {
          const selected = preference === choice.value;
          return (
            <button
              key={choice.value}
              type="button"
              className={`graphics-quality-option${selected ? " is-selected" : ""}`}
              role="radio"
              aria-checked={selected}
              data-testid={`ui-scale-${choice.value}`}
              onClick={() => {
                if (selected) return;
                uiScale.set(choice.value);
                playUiSound("click");
              }}
            >
              <span className="graphics-quality-option__label">{choice.label}</span>
              <span className="graphics-quality-option__description">{choice.description}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
