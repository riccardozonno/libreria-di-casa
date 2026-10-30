import { describe, expect, it } from "vitest";
import { normalizeForSearch, locationNameKey, searchTerms, toFtsQuery } from "../../shared/text";

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

describe("toFtsQuery", () => {
  it("cerca ogni parola come prefisso, tutte insieme (AND)", () => {
    expect(toFtsQuery("Promessi Spo")).toBe('"promessi"* "spo"*');
  });

  it("toglie gli accenti come l'indice FTS5 (remove_diacritics)", () => {
    expect(toFtsQuery("Perché città")).toBe('"perche"* "citta"*');
  });

  it("neutralizza la sintassi FTS5: virgolette, operatori e parentesi diventano spazi", () => {
    expect(toFtsQuery('a" OR (b*) NOT c^ -d:e')).toBe('"a"* "or"* "b"* "not"* "c"* "d"* "e"*');
  });

  it("un ISBN con i trattini resta un'unica parola", () => {
    expect(toFtsQuery("978-88-04-66823-7")).toBe('"9788804668237"*');
  });

  it("restituisce null se non resta nessuna parola", () => {
    expect(toFtsQuery('  " * ( ) ')).toBeNull();
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
