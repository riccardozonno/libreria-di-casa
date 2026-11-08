import { describe, expect, it } from "vitest";
import { managedLocationNames } from "../../src/lib/managed-locations";

// Profilo dell'editor: le sedi che gestisce (la pagina Sedi è solo dell'admin).

describe("sedi gestite dall'editor", () => {
  const locations = [
    { id: "casa", name: "Casa", archived: false },
    { id: "mare", name: "Mare", archived: false },
    { id: "vecchia", name: "Vecchia", archived: true },
  ];

  it("solo le sue, nell'ordine dell'elenco", () => {
    expect(managedLocationNames(locations, ["mare", "casa"])).toEqual(["Casa", "Mare"]);
  });

  it("le sedi archiviate non contano (lì non si può più aggiungere)", () => {
    expect(managedLocationNames(locations, ["vecchia"])).toEqual([]);
  });

  it("nessuna sede", () => {
    expect(managedLocationNames(locations, [])).toEqual([]);
  });
});
