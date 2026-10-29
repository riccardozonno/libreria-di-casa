import { describe, expect, it } from "vitest";
import { normalizeForSearch, buildSearchText, locationNameKey, searchTerms } from "@/lib/text";

describe("normalizeForSearch", () => {
  it("toglie accenti e maiuscole", () => {
    expect(normalizeForSearch("Perché Così È")).toBe("perche cosi e");
  });

  it("compatta gli spazi e toglie quelli ai bordi", () => {
    expect(normalizeForSearch("  Il   nome  della rosa ")).toBe("il nome della rosa");
  });

  it("gestisce caratteri tedeschi e francesi", () => {
    expect(normalizeForSearch("Müller Œuvre Ça")).toBe("muller œuvre ca");
  });
});

describe("buildSearchText", () => {
  it("unisce titolo, autori e ISBN normalizzati", () => {
    expect(
      buildSearchText({ title: "Il Gattopardo", authors: ["Giuseppe Tomasi di Lampedusa"], isbn13: "9788807900389" }),
    ).toBe("il gattopardo giuseppe tomasi di lampedusa 9788807900389");
  });

  it("funziona senza ISBN né autori", () => {
    expect(buildSearchText({ title: "Quaderno", authors: [], isbn13: null })).toBe("quaderno");
  });
});

describe("searchTerms", () => {
  it("divide la ricerca in parole normalizzate", () => {
    expect(searchTerms("  Calvino  Città ")).toEqual(["calvino", "citta"]);
  });

  it("toglie trattini dagli ISBN cercati", () => {
    expect(searchTerms("978-88-04-66823-7")).toEqual(["9788804668237"]);
  });

  it("restituisce un elenco vuoto per una ricerca vuota", () => {
    expect(searchTerms("   ")).toEqual([]);
  });

  it("limita il numero di parole", () => {
    expect(searchTerms("a b c d e f g h i j k l")).toHaveLength(8);
  });
});

describe("locationNameKey", () => {
  it("rende equivalenti nomi che differiscono per maiuscole, accenti e spazi", () => {
    expect(locationNameKey("  Casa al Mare ")).toBe(locationNameKey("casa al  mare"));
    expect(locationNameKey("Città")).toBe(locationNameKey("citta"));
  });
});
