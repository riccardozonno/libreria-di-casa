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
});
