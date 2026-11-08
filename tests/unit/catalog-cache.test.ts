import { describe, expect, it } from "vitest";
import { catalogGeneration, clearCatalog, readCatalog, saveCatalog } from "../../src/lib/catalog-cache";

// Memoria del catalogo: svuotata dopo ogni modifica, con un contatore che scarta i blocchi chiesti prima.

describe("memoria del catalogo", () => {
  it("salva per ricerca e si svuota; il contatore cresce a ogni svuotamento", () => {
    const snapshot = { items: [{ id: "a" }], hasMore: false, total: 1, nextPage: 1 };
    saveCatalog("q=rosa", snapshot);
    expect(readCatalog("q=rosa")).toEqual(snapshot);
    expect(readCatalog("q=altro")).toBeUndefined();
    const before = catalogGeneration();
    clearCatalog();
    expect(readCatalog("q=rosa")).toBeUndefined();
    expect(catalogGeneration()).toBe(before + 1);
  });

  it("svuotamento parziale: solo le liste indicate (es. quelle filtrate per lettura)", () => {
    const snapshot = { items: [], hasMore: false, total: 0, nextPage: 1 };
    saveCatalog("q=rosa", snapshot);
    saveCatalog("reading=UNREAD", snapshot);
    clearCatalog((key) => key.includes("reading="));
    expect(readCatalog("q=rosa")).toEqual(snapshot);
    expect(readCatalog("reading=UNREAD")).toBeUndefined();
  });
});
