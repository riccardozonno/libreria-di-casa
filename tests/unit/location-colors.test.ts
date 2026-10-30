import { describe, expect, it } from "vitest";
import { LOCATION_COLORS, locationColorClass, nextFreeColor } from "../../shared/location-colors";

describe("palette delle sedi", () => {
  it("ha 10 colori con nome italiano e classi distinte", () => {
    expect(LOCATION_COLORS).toHaveLength(10);
    const classes = LOCATION_COLORS.map((color) => locationColorClass(color.key));
    expect(new Set(classes).size).toBe(10);
    expect(LOCATION_COLORS.every((color) => color.label.length > 0)).toBe(true);
  });

  it("propone il primo colore libero", () => {
    expect(nextFreeColor([])).toBe("ROSSO");
    expect(nextFreeColor(["ROSSO", "ARANCIO"])).toBe("GIALLO");
    expect(nextFreeColor(LOCATION_COLORS.map((color) => color.key))).toBeNull();
  });
});
