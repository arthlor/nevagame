import { handleRadioGroupKeyDown } from "../useTabListKeyboard";
// src/ui/components/InterfaceSettings.tsx
import React, { useEffect, useState } from "react";
import { uiScale, type UiScalePreference } from "../uiScale";
import { playUiSound } from "../audio/uiAudio";
import { useTranslation } from "../../i18n/useTranslation";
import type { SupportedLocale } from "../../i18n/types";

const SCALE_CHOICES: ReadonlyArray<{
  value: UiScalePreference;
  labelKey: string;
  descKey: string;
}> = [
  { value: "auto", labelKey: "interface.scaleAuto", descKey: "interface.scaleAutoDesc" },
  { value: "small", labelKey: "interface.scaleSmall", descKey: "interface.scaleSmallDesc" },
  { value: "normal", labelKey: "interface.scaleNormal", descKey: "interface.scaleNormalDesc" },
  { value: "large", labelKey: "interface.scaleLarge", descKey: "interface.scaleLargeDesc" }
];

const LANGUAGE_CHOICES: ReadonlyArray<{
  value: SupportedLocale;
  label: string;
}> = [
  { value: "en", label: "English" },
  { value: "tr", label: "Türkçe" }
];

/**
 * Interface settings controls both screen scaling and display language.
 */
export const InterfaceSettings: React.FC = () => {
  const [preference, setPreference] = useState<UiScalePreference>(uiScale.current);
  const [resolved, setResolved] = useState<number>(uiScale.resolved);
  const { t, locale, setLocale } = useTranslation();

  useEffect(
    () =>
      uiScale.subscribe((next, scale) => {
        setPreference(next);
        setResolved(scale);
      }),
    []
  );

  return (
    <div className="interface-settings-wrapper">
      <section className="interface-settings" aria-labelledby="interface-settings-title">
        <div className="graphics-settings__heading">
          <h5 id="interface-settings-title">{t("interface.scaleTitle")}</h5>
          <span className="graphics-settings__active" aria-live="polite">
            <span aria-hidden="true" /> {t("interface.scaleActive", { percent: Math.round(resolved * 100) })}
          </span>
        </div>
        <div className="graphics-quality-options" role="radiogroup" onKeyDown={handleRadioGroupKeyDown} aria-label={t("interface.scaleTitle")}>
          {SCALE_CHOICES.map((choice) => {
            const selected = preference === choice.value;
            return (
              <button
                key={choice.value}
                type="button"
                className={`graphics-quality-option${selected ? " is-selected" : ""}`}
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                data-testid={`ui-scale-${choice.value}`}
                onClick={() => {
                  if (selected) return;
                  uiScale.set(choice.value);
                  playUiSound("click");
                }}
              >
                <span className="graphics-quality-option__label">{t(choice.labelKey)}</span>
                <span className="graphics-quality-option__description">{t(choice.descKey)}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="interface-settings interface-settings--language" aria-labelledby="interface-language-title" style={{ marginTop: "1.25rem" }}>
        <div className="graphics-settings__heading">
          <h5 id="interface-language-title">{t("interface.languageTitle")}</h5>
          <span className="graphics-settings__active" aria-live="polite">
            <span aria-hidden="true" /> {locale === "tr" ? "Türkçe" : "English"}
          </span>
        </div>
        <div className="graphics-quality-options" role="radiogroup" onKeyDown={handleRadioGroupKeyDown} aria-label={t("interface.languageTitle")}>
          {LANGUAGE_CHOICES.map((choice) => {
            const selected = locale === choice.value;
            return (
              <button
                key={choice.value}
                type="button"
                className={`graphics-quality-option${selected ? " is-selected" : ""}`}
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                data-testid={`ui-language-${choice.value}`}
                onClick={() => {
                  if (selected) return;
                  setLocale(choice.value);
                  playUiSound("click");
                }}
              >
                <span className="graphics-quality-option__label">{choice.label}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};
