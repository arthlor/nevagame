import React, { useEffect, useId, useState } from "react";
import { handleRadioGroupKeyDown } from "../useTabListKeyboard";
import { audioSettings, type AudioSettings, DEFAULT_AUDIO_SETTINGS } from "../../audio/AudioSettings";
import { playUiSound } from "../audio/uiAudio";
import { ChromeButton } from "../chrome/Chrome";
import type { GraphicsQualityPreference } from "../../render/config/GraphicsQualitySettings";
import { CANONICAL_RENDER_CONFIG, type QualityTier } from "../../render/config/VisualRenderConfig";
import {
  effectiveCustomChoices,
  graphicsEffectSettings,
  graphicsRuntimeStatus,
  isDefaultGraphicsEffectPreferences,
  isNeutralColorFinish,
  NEUTRAL_COLOR_FINISH,
  type AmbientOcclusionChoice,
  type EdgeSmoothingChoice,
  type GlowChoice,
  type GraphicsRuntimeStatus,
  type PostProcessingMode,
  type RenderResolutionChoice
} from "../../render/config/GraphicsEffectSettings";
import { useTranslation } from "../../i18n/useTranslation";

const GRAPHICS_QUALITY_CHOICES: ReadonlyArray<{
  value: GraphicsQualityPreference;
  labelKey: string;
  descKey: string;
}> = [
  { value: "auto", labelKey: "graphics.tierAuto", descKey: "graphics.tierAutoDesc" },
  { value: "low", labelKey: "graphics.tierLow", descKey: "graphics.tierLowDesc" },
  { value: "medium", labelKey: "graphics.tierMedium", descKey: "graphics.tierMediumDesc" },
  { value: "high", labelKey: "graphics.tierHigh", descKey: "graphics.tierHighDesc" }
];

const TIER_LABEL_KEYS: Record<QualityTier, string> = {
  low: "graphics.tierLow",
  medium: "graphics.tierMedium",
  high: "graphics.tierHigh"
};

/** Warmth is shown as whole steps either side of neutral. */
const WARMTH_STEPS = 10;

interface ChoiceOption<T extends string | number> {
  value: T;
  label: string;
  description?: string;
}

/** One-Tab-stop radio group in the graphics option chrome (arrows, Home and End move and select). */
function ChoiceGroup<T extends string | number>({ label, testId, options, selected, onSelect }: {
  label: string;
  testId: string;
  options: ReadonlyArray<ChoiceOption<T>>;
  selected: T;
  onSelect: (value: T) => void;
}): React.ReactElement {
  return (
    <div
      className="graphics-quality-options graphics-choice-options"
      role="radiogroup"
      aria-label={label}
      onKeyDown={handleRadioGroupKeyDown}
    >
      {options.map((option) => {
        const isSelected = option.value === selected;
        return (
          <button
            key={String(option.value)}
            type="button"
            className={`graphics-quality-option graphics-quality-option--compact${isSelected ? " is-selected" : ""}`}
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            data-testid={`${testId}-${option.value}`}
            onClick={() => {
              if (isSelected) return;
              onSelect(option.value);
              playUiSound("click");
            }}
          >
            <span className="graphics-quality-option__label">{option.label}</span>
            {option.description && <span className="graphics-quality-option__description">{option.description}</span>}
          </button>
        );
      })}
    </div>
  );
}

function SliderRow({ id, label, min, max, step, value, valueText, testId, onChange }: {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  valueText: string;
  testId: string;
  onChange: (value: number) => void;
}): React.ReactElement {
  return (
    <div className="graphics-slider-row">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText}
        data-testid={testId}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <span className="graphics-slider-row__value" aria-hidden="true">{valueText}</span>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }): React.ReactElement | null {
  return children ? <p className="graphics-settings__hint graphics-effect__note">{children}</p> : null;
}

/**
 * Graphics quality plus the player's effect preferences. Choices are written
 * to `graphicsEffectSettings`; what is actually rendering comes from
 * `graphicsRuntimeStatus`, published by the application, so this component
 * never decides availability or cost itself.
 */
export const GraphicsControls: React.FC<{
  preference: GraphicsQualityPreference;
  effectiveTier: QualityTier;
  onChange: (quality: GraphicsQualityPreference) => void;
}> = ({ preference, effectiveTier, onChange }) => {
  const { t } = useTranslation();
  const idPrefix = useId();
  const [preferences, setPreferences] = useState(() => graphicsEffectSettings.get());
  const [status, setStatus] = useState<Readonly<GraphicsRuntimeStatus> | null>(() => graphicsRuntimeStatus.get());
  useEffect(() => graphicsEffectSettings.subscribe((next) => setPreferences(next)), []);
  useEffect(() => graphicsRuntimeStatus.subscribe((next) => setStatus(next)), []);

  const bounds = CANONICAL_RENDER_CONFIG.postProcessing;
  const choices = effectiveCustomChoices(preferences);
  const enhanced = status?.enhancedPath ?? CANONICAL_RENDER_CONFIG.quality[effectiveTier].enhancedPostPath;
  const requested = status?.requested ?? null;
  // Before the world is drawn (the title screen) there are no frames to describe.
  const active = status?.rendering ? status.active : null;
  const reductions = status?.reductions ?? [];
  const preparing = status?.preparing ?? false;
  const failed = (stage: string): boolean => status?.failedStages.includes(stage) ?? false;
  const percent = (value: number): string => t("graphics.percent", { value: Math.round(value * 100) });
  const warmthStep = Math.round((choices.colorFinish.warmth / bounds.colorFinish.warmth.max) * WARMTH_STEPS);
  const warmthText = warmthStep === 0 ? t("graphics.finishNeutral") : `${warmthStep > 0 ? "+" : ""}${warmthStep}`;

  const aoNote = choices.ambientOcclusion === "high" && !enhanced ? t("graphics.aoHighNeedsHigh")
    : !active ? null
      : active.ambientOcclusion === "gtao" ? t(active.aoReduced ? "graphics.aoReduced" : "graphics.aoActiveGtao")
        : active.ambientOcclusion === "contact" ? t("graphics.aoActiveContact")
          : requested?.ambientOcclusion === "gtao" && failed("gtao") ? t("graphics.effectFailed")
            : preparing && requested?.ambientOcclusion === "gtao" ? t("graphics.preparing")
              : t("graphics.aoActiveOff");
  const glowNote = !status || choices.glow !== "hdr" ? null
    : !enhanced ? t("graphics.glowHdrUnavailable")
      : reductions.includes("bloom") ? t("graphics.glowHdrPaused")
        : active?.hdrBloom ? t("graphics.glowHdrActive")
          : failed("bloom") ? t("graphics.effectFailed")
            : preparing ? t("graphics.preparing") : null;
  const edgeNote = !status ? null
    : !enhanced ? t("graphics.edgeDirectNote")
      : active?.fxaa ? t("graphics.edgeActive")
        : requested?.fxaa && failed("fxaa") ? t("graphics.effectFailed") : null;
  const renderSize = status?.rendering ? status.renderSize : null;

  return (
    <section className="graphics-settings" aria-labelledby={`${idPrefix}-title`}>
      <div className="graphics-settings__heading">
        <h5 id={`${idPrefix}-title`}>{t("graphics.title")}</h5>
        <span className="graphics-settings__active" aria-live="polite">
          <span aria-hidden="true" /> {preparing
            ? t("graphics.preparing")
            : t("graphics.active", { tier: t(TIER_LABEL_KEYS[effectiveTier]) })}
        </span>
      </div>
      <p className="graphics-settings__hint">{t("graphics.hint")}</p>
      <div className="graphics-quality-options" role="radiogroup" onKeyDown={handleRadioGroupKeyDown} aria-label={t("graphics.title")}>
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
              data-testid={`graphics-quality-${choice.value}`}
              onClick={() => {
                if (!selected) {
                  onChange(choice.value);
                  playUiSound("click");
                }
              }}
            >
              <span className="graphics-quality-option__label">{t(choice.labelKey)}</span>
              <span className="graphics-quality-option__description">{t(choice.descKey)}</span>
              {choice.value === "auto" && <span className="graphics-quality-option__mark">{t("graphics.recommended")}</span>}
            </button>
          );
        })}
      </div>

      <div className="graphics-effect">
        <h6 className="graphics-effect__title">{t("graphics.postTitle")}</h6>
        <ChoiceGroup<PostProcessingMode>
          label={t("graphics.postTitle")}
          testId="graphics-post"
          selected={preferences.postProcessing}
          options={[
            { value: "auto", label: t("graphics.postAuto"), description: t("graphics.postAutoDesc") },
            { value: "off", label: t("graphics.postOff"), description: t("graphics.postOffDesc") },
            { value: "custom", label: t("graphics.postCustom"), description: t("graphics.postCustomDesc") }
          ]}
          onSelect={(value) => graphicsEffectSettings.set({ postProcessing: value })}
        />
        <Note>{status && !enhanced ? t(status.fallbackReason ? "graphics.postFallbackNote" : "graphics.postDirectNote") : null}</Note>
      </div>

      <SliderRow
        id={`${idPrefix}-brightness`}
        testId="graphics-brightness"
        label={t("graphics.brightness")}
        min={Math.round(bounds.brightness.min * 100)}
        max={Math.round(bounds.brightness.max * 100)}
        step={1}
        value={Math.round(preferences.brightness * 100)}
        valueText={percent(preferences.brightness)}
        onChange={(value) => graphicsEffectSettings.set({ brightness: value / 100 })}
      />

      <details className="graphics-advanced" data-testid="graphics-advanced">
        <summary>{t("graphics.advanced")}</summary>

        <div className="graphics-effect">
          <h6 className="graphics-effect__title">{t("graphics.aoTitle")}</h6>
          <ChoiceGroup<AmbientOcclusionChoice>
            label={t("graphics.aoTitle")}
            testId="graphics-ao"
            selected={choices.ambientOcclusion}
            options={[
              { value: "off", label: t("graphics.aoOff") },
              { value: "auto", label: t("graphics.aoAuto") },
              { value: "high", label: t("graphics.aoHigh") }
            ]}
            onSelect={(value) => graphicsEffectSettings.customize({ ambientOcclusion: value })}
          />
          {(requested ? requested.ambientOcclusion !== "off" : choices.ambientOcclusion !== "off") && (
            <SliderRow
              id={`${idPrefix}-ao-strength`}
              testId="graphics-ao-strength"
              label={t("graphics.aoStrength")}
              min={Math.round(bounds.ambientOcclusion.strength.min * 100)}
              max={Math.round(bounds.ambientOcclusion.strength.max * 100)}
              step={5}
              value={Math.round(choices.aoStrength * 100)}
              valueText={percent(choices.aoStrength)}
              onChange={(value) => graphicsEffectSettings.customize({ aoStrength: value / 100 })}
            />
          )}
          <Note>{aoNote}</Note>
        </div>

        <div className="graphics-effect">
          <h6 className="graphics-effect__title">{t("graphics.glowTitle")}</h6>
          <ChoiceGroup<GlowChoice>
            label={t("graphics.glowTitle")}
            testId="graphics-glow"
            selected={choices.glow}
            options={[
              { value: "off", label: t("graphics.glowOff") },
              { value: "subtle", label: t("graphics.glowSubtle") },
              { value: "hdr", label: t("graphics.glowHdr") }
            ]}
            onSelect={(value) => graphicsEffectSettings.customize({ glow: value })}
          />
          <Note>{glowNote}</Note>
        </div>

        <div className="graphics-effect">
          <h6 className="graphics-effect__title">{t("graphics.edgeTitle")}</h6>
          <ChoiceGroup<EdgeSmoothingChoice>
            label={t("graphics.edgeTitle")}
            testId="graphics-edge"
            selected={choices.edgeSmoothing}
            options={[
              { value: "auto", label: t("graphics.edgeAuto") },
              { value: "off", label: t("graphics.edgeOff") },
              { value: "fast", label: t("graphics.edgeFast") }
            ]}
            onSelect={(value) => graphicsEffectSettings.customize({ edgeSmoothing: value })}
          />
          <Note>{edgeNote}</Note>
        </div>

        <div className="graphics-effect">
          <h6 className="graphics-effect__title">{t("graphics.finishTitle")}</h6>
          {enhanced ? (
            <>
              <SliderRow
                id={`${idPrefix}-saturation`}
                testId="graphics-saturation"
                label={t("graphics.saturation")}
                min={Math.round(bounds.colorFinish.saturation.min * 100)}
                max={Math.round(bounds.colorFinish.saturation.max * 100)}
                step={1}
                value={Math.round(choices.colorFinish.saturation * 100)}
                valueText={percent(choices.colorFinish.saturation)}
                onChange={(value) => graphicsEffectSettings.customize({ colorFinish: { ...choices.colorFinish, saturation: value / 100 } })}
              />
              <SliderRow
                id={`${idPrefix}-contrast`}
                testId="graphics-contrast"
                label={t("graphics.contrast")}
                min={Math.round(bounds.colorFinish.contrast.min * 100)}
                max={Math.round(bounds.colorFinish.contrast.max * 100)}
                step={1}
                value={Math.round(choices.colorFinish.contrast * 100)}
                valueText={percent(choices.colorFinish.contrast)}
                onChange={(value) => graphicsEffectSettings.customize({ colorFinish: { ...choices.colorFinish, contrast: value / 100 } })}
              />
              <SliderRow
                id={`${idPrefix}-warmth`}
                testId="graphics-warmth"
                label={t("graphics.warmth")}
                min={-WARMTH_STEPS}
                max={WARMTH_STEPS}
                step={1}
                value={warmthStep}
                valueText={warmthText}
                onChange={(value) => graphicsEffectSettings.customize({
                  colorFinish: { ...choices.colorFinish, warmth: (value / WARMTH_STEPS) * bounds.colorFinish.warmth.max }
                })}
              />
              <div className="graphics-effect__actions">
                <ChromeButton
                  size="sm"
                  variant="secondary"
                  data-testid="graphics-finish-neutral"
                  disabled={isNeutralColorFinish(choices.colorFinish)}
                  onClick={() => graphicsEffectSettings.customize({ colorFinish: { ...NEUTRAL_COLOR_FINISH } })}
                >
                  {t("graphics.finishNeutral")}
                </ChromeButton>
              </div>
            </>
          ) : (
            <Note>{t("graphics.finishUnavailable")}</Note>
          )}
        </div>

        <div className="graphics-effect">
          <h6 className="graphics-effect__title">{t("graphics.resolutionTitle")}</h6>
          <ChoiceGroup<RenderResolutionChoice>
            label={t("graphics.resolutionTitle")}
            testId="graphics-resolution"
            selected={preferences.renderResolution}
            options={[
              { value: "auto", label: t("graphics.resolutionAuto") },
              ...bounds.renderResolution.manualScales.map((scale) => ({ value: scale, label: percent(scale) }))
            ]}
            onSelect={(value) => graphicsEffectSettings.set({ renderResolution: value })}
          />
          <p className="graphics-settings__hint graphics-effect__note" aria-live="polite" data-testid="graphics-render-size">
            {renderSize && t("graphics.resolutionActive", {
              width: renderSize.width,
              height: renderSize.height,
              ratio: renderSize.pixelRatio.toFixed(2)
            })}
          </p>
          <Note>{preferences.renderResolution === "auto" && reductions.includes("resolution") ? t("graphics.resolutionAutoReduced") : null}</Note>
        </div>
      </details>

      <div className="pause-settings-reset graphics-settings__reset">
        <p className="graphics-settings__hint">{t("graphics.resetNote")}</p>
        <ChromeButton
          size="sm"
          variant="secondary"
          data-testid="graphics-reset"
          disabled={preference === "auto" && isDefaultGraphicsEffectPreferences(preferences)}
          onClick={() => {
            graphicsEffectSettings.reset();
            if (preference !== "auto") onChange("auto");
          }}
        >
          {t("graphics.reset")}
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
