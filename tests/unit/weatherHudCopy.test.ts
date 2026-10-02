import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { localeStore } from "../../src/i18n/localeStore";
import { FarmForecastPopover } from "../../src/ui/components/FarmForecastPopover";
import { WeatherHazardBanner, resolveMaritimeHazard } from "../../src/ui/components/WeatherHazardBanner";
import type { FarmForecastDto, MaritimeHazardDto } from "../../src/simulation/core/contracts";

afterEach(() => localeStore.set("en"));

describe("weather HUD copy", () => {
  it.each([
    ["Soaking", "Gale", "Rough", "Yoğun yağış", "Kuvvetli", "Çalkantılı"],
    ["Showers possible", "Breezy", "Swell", "Yer yer yağış", "Esintili", "Dalgalı"],
    ["Mostly dry", "Light", "Calm", "Çoğunlukla kuru", "Hafif", "Sakin"]
  ] as const)("localizes %s, %s and %s without interpreting their thresholds", (rainLabel, windLabel, seaLabel, rain, wind, sea) => {
    const forecast: FarmForecastDto = {
      seasonLabel: "Spring", currentTemperatureC: 13,
      slots: [{ label: "Now", type: "fog" }, { label: "+2h", type: "cloudy" }, { label: "+5h", type: "clear" }],
      rainLabel, windLabel, seaLabel
    };
    localeStore.set("tr");
    const html = renderToString(React.createElement(FarmForecastPopover, { forecast, onClose() {} }));
    for (const label of ["İlkbahar", "Şimdi", "+2 sa", "+5 sa", "13°C", "Sisli", rain, wind, sea]) expect(html).toContain(label);
    for (const label of ["Spring", "+2h", "+5h", rainLabel, windLabel, seaLabel]) expect(html).not.toContain(label);
    expect(forecast.rainLabel).toBe(rainLabel);
  });

  it("does not manufacture measurements or penalties from a generic warning", () => {
    for (const text of ["Dense Fog", "Gale Winds", "Rough Swell", "Storm Warning"]) {
      const resolved = resolveMaritimeHazard({ text, tone: "caution" });
      expect(resolved?.conditionLabel).toBe("");
      expect(resolved?.speedPenaltyPercent).toBeUndefined();
      expect(resolved?.navigationalAdvisory).not.toMatch(/\d|engine/);
      expect(resolved?.severity).toBe("caution");
    }
  });

  it("preserves supplied measurements and severity", () => {
    const hazard: MaritimeHazardDto = {
      hazardId: "squall", title: "Wind warning", severity: "danger",
      conditionLabel: "Gusts > 24 kn", navigationalAdvisory: "Maintain heading.", speedPenaltyPercent: 20
    };
    expect(resolveMaritimeHazard(hazard, "tr")).toBe(hazard);
    expect(renderToString(React.createElement(WeatherHazardBanner, { hazard }))).toContain('role="alert"');
  });

  it("localizes concise fog guidance and announces caution without interrupting", () => {
    localeStore.set("tr");
    const html = renderToString(React.createElement(WeatherHazardBanner, { hazard: { text: "Dense Fog", tone: "caution" } }));
    expect(html).toContain("Yoğun sis");
    expect(html).toContain("Harita ve pusulayla yönünü bul.");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain("50m");
  });
});
