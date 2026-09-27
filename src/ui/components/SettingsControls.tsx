import React, { useEffect, useState } from "react";
import { handleRadioGroupKeyDown } from "../useTabListKeyboard";
import { audioSettings, type AudioSettings, DEFAULT_AUDIO_SETTINGS } from "../../audio/AudioSettings";
import { playUiSound } from "../audio/uiAudio";
import { ChromeButton } from "../chrome/Chrome";
import type { GraphicsQualityPreference } from "../../render/config/GraphicsQualitySettings";
import type { QualityTier } from "../../render/config/VisualRenderConfig";
import { useTranslation } from "../../i18n/useTranslation";

const GRAPHICS_QUALITY_CHOICES: ReadonlyArray<{
  value: GraphicsQualityPreference;
  label: string;
  labelTr: string;
  description: string;
  descriptionTr: string;
}> = [
  { value: "auto", label: "Auto", labelTr: "Otomatik", description: "Adapts while you play", descriptionTr: "Oynanışa göre uyarlar" },
  { value: "low", label: "Low", labelTr: "Düşük", description: "Fastest", descriptionTr: "En hızlı" },
  { value: "medium", label: "Medium", labelTr: "Orta", description: "Balanced", descriptionTr: "Dengeli" },
  { value: "high", label: "High", labelTr: "Yüksek", description: "Richest detail", descriptionTr: "En zengin ayrıntı" }
];

const TIER_TR: Record<string, string> = {
  low: "Düşük",
  medium: "Orta",
  high: "Yüksek"
};

export const GraphicsControls: React.FC<{
  preference: GraphicsQualityPreference;
  effectiveTier: QualityTier;
  onChange: (quality: GraphicsQualityPreference) => void;
}> = ({ preference, effectiveTier, onChange }) => {
  const { locale } = useTranslation();
  const isTr = locale === "tr";
  const effectiveLabel = isTr
    ? (TIER_TR[effectiveTier] ?? effectiveTier)
    : (effectiveTier[0].toUpperCase() + effectiveTier.slice(1));

  return (
    <section className="graphics-settings" aria-labelledby="graphics-settings-title">
      <div className="graphics-settings__heading">
        <h5 id="graphics-settings-title">{isTr ? "Görüntü kalitesi" : "Graphics quality"}</h5>
        <span className="graphics-settings__active" aria-live="polite">
          <span aria-hidden="true" /> {isTr ? `Etkin: ${effectiveLabel}` : `Active: ${effectiveLabel}`}
        </span>
      </div>
      <p className="graphics-settings__hint">
        {isTr
          ? "Akıcı hareket için ayrıntıları kendiliğinden uyarlar."
          : "Auto adjusts detail gradually to keep movement smooth."}
      </p>
      <div className="graphics-quality-options" role="radiogroup" onKeyDown={handleRadioGroupKeyDown} aria-label={isTr ? "Görüntü kalitesi" : "Graphics quality"}>
        {GRAPHICS_QUALITY_CHOICES.map((choice) => {
          const selected = preference === choice.value;
          return (
            <button
              key={choice.value}
              type="button"
              className={`graphics-quality-option${selected ? " is-selected" : ""}`}
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                if (!selected) {
                  onChange(choice.value);
                  playUiSound("click");
                }
              }}
            >
              <span className="graphics-quality-option__label">{isTr ? choice.labelTr : choice.label}</span>
              <span className="graphics-quality-option__description">{isTr ? choice.descriptionTr : choice.description}</span>
              {choice.value === "auto" && <span className="graphics-quality-option__mark">{isTr ? "Önerilen" : "Recommended"}</span>}
            </button>
          );
        })}
      </div>
      <div className="pause-settings-reset">
        <ChromeButton
          size="sm"
          variant="secondary"
          disabled={preference === "auto"}
          onClick={() => onChange("auto")}
        >
          {isTr ? "Varsayılana Sıfırla" : "Reset to defaults"}
        </ChromeButton>
      </div>
    </section>
  );
};

type AudioLevelKey = "master" | "music" | "sfx" | "ambience";
type AudioMuteKey = "masterMuted" | "musicMuted" | "sfxMuted" | "ambienceMuted";

const AUDIO_ROWS: Array<{ label: string; labelTr: string; level: AudioLevelKey; muted: AudioMuteKey }> = [
  { label: "Master", labelTr: "Genel Ses", level: "master", muted: "masterMuted" },
  { label: "Music", labelTr: "Müzik", level: "music", muted: "musicMuted" },
  { label: "Effects", labelTr: "Efektler", level: "sfx", muted: "sfxMuted" },
  { label: "Ambience", labelTr: "Çevre & Doğa", level: "ambience", muted: "ambienceMuted" }
];

export const AudioControls: React.FC = () => {
  const [settings, setSettings] = useState<AudioSettings>({ ...audioSettings.get() });
  const { locale } = useTranslation();
  const isTr = locale === "tr";

  useEffect(() => audioSettings.subscribe((next) => setSettings({ ...next })), []);

  const isDefault =
    settings.master === DEFAULT_AUDIO_SETTINGS.master &&
    settings.music === DEFAULT_AUDIO_SETTINGS.music &&
    settings.sfx === DEFAULT_AUDIO_SETTINGS.sfx &&
    settings.ambience === DEFAULT_AUDIO_SETTINGS.ambience &&
    !settings.masterMuted &&
    !settings.musicMuted &&
    !settings.sfxMuted &&
    !settings.ambienceMuted;

  return (
    <section className="audio-settings" aria-labelledby="audio-settings-title">
      <h5 id="audio-settings-title">{isTr ? "Ses Ayarları" : "Sound"}</h5>
      {AUDIO_ROWS.map((row) => {
        const percent = Math.round(settings[row.level] * 100);
        const muted = settings[row.muted];
        const label = isTr ? row.labelTr : row.label;
        const mutedLabel = isTr ? "Sessiz" : "Muted";
        return (
          <div className="audio-settings-row" key={row.level}>
            <label htmlFor={`audio-${row.level}`}>{label}</label>
            <span className="audio-level-text">{muted ? mutedLabel : `${percent}%`}</span>
            <input
              id={`audio-${row.level}`}
              type="range"
              min="0"
              max="100"
              step="1"
              value={percent}
              aria-valuetext={muted ? mutedLabel : `${percent} ${isTr ? "yüzde" : "percent"}`}
              onChange={(event) => {
                const level = Number(event.currentTarget.value) / 100;
                setSettings({ ...audioSettings.set({ [row.level]: level, [row.muted]: false }) });
              }}
              onPointerUp={() => playUiSound("click")}
            />
            <ChromeButton
              className="audio-mute-button"
              aria-label={muted ? `${label} sesini aç` : `${label} sesini kapat`}
              aria-pressed={muted}
              onClick={() => setSettings({ ...audioSettings.set({ [row.muted]: !muted }) })}
            >
              {muted ? (isTr ? "Kapalı" : "Off") : (isTr ? "Açık" : "On")}
            </ChromeButton>
          </div>
        );
      })}
      <div className="pause-settings-reset">
        <ChromeButton
          size="sm"
          variant="secondary"
          disabled={isDefault}
          onClick={() => setSettings({ ...audioSettings.set({ ...DEFAULT_AUDIO_SETTINGS }) })}
        >
          {isTr ? "Varsayılana Sıfırla" : "Reset to defaults"}
        </ChromeButton>
      </div>
    </section>
  );
};
