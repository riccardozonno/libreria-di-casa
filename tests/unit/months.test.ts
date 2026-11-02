import { describe, expect, it } from "vitest";
import { lastMonths, romeMonthKey } from "../../shared/months";

describe("mese in ora italiana", () => {
  it.each([
    ["2026-11-02T10:00:00.000Z", "2026-11"],
    // Ora solare (UTC+1): le 23:30 UTC del 31/12 sono già capodanno in Italia.
    ["2026-12-31T23:30:00.000Z", "2027-01"],
    ["2026-12-31T22:59:59.999Z", "2026-12"],
    // Ora legale (UTC+2): le 22:30 UTC del 31/03 sono già aprile.
    ["2026-03-31T22:30:00.000Z", "2026-04"],
    ["2026-03-31T21:59:00.000Z", "2026-03"],
  ])("%s → %s", (iso, month) => {
    expect(romeMonthKey(iso)).toBe(month);
  });
});

describe("ultimi mesi", () => {
  it("12 mesi fino a quello corrente, dal più vecchio", () => {
    expect(lastMonths(new Date("2026-11-02T10:00:00.000Z"), 12)).toEqual([
      "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05",
      "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11",
    ]);
  });

  it("il mese corrente è quello italiano, anche a cavallo di capodanno", () => {
    expect(lastMonths(new Date("2026-12-31T23:30:00.000Z"), 3)).toEqual(["2026-11", "2026-12", "2027-01"]);
  });
});
