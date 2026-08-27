import { describe, expect, it } from "vitest";
import { formatWeatherLabel } from "../../src/ui/weatherPresentation";

describe("weather presentation", () => {
  it.each([
    ["clear", "Clear sky"],
    ["cloudy", "Overcast"],
    ["light-rain", "Light rain"],
    ["heavy-rain", "Heavy rain"],
    ["windy", "Windy"],
    ["fog", "Fog"],
    ["storm", "Storm"]
  ])("labels canonical %s weather as %s", (type, label) => {
    expect(formatWeatherLabel(type)).toBe(label);
  });

  it("accepts legacy underscore separators without exposing them", () => {
    expect(formatWeatherLabel("light_rain")).toBe("Light rain");
  });
});
