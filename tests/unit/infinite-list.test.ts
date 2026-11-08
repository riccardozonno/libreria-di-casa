import { describe, expect, it } from "vitest";
import { countLabel, mergePages } from "../../src/pages/catalog/infinite-list";

// Catalogo a scorrimento continuo: blocchi uniti senza doppioni e contatore «24 di 30 libri».

describe("unione dei blocchi", () => {
  const book = (id: string) => ({ id, title: id });

  it("aggiunge in fondo, nell'ordine", () => {
    expect(mergePages([book("a"), book("b")], [book("c"), book("d")]).map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("niente doppioni se un libro è scivolato nel blocco successivo (es. aggiunto un libro nel frattempo)", () => {
    expect(mergePages([book("a"), book("b")], [book("b"), book("c")]).map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("non modifica l'elenco di partenza", () => {
    const loaded = [book("a")];
    mergePages(loaded, [book("b")]);
    expect(loaded).toEqual([book("a")]);
  });
});

describe("contatore", () => {
  it.each([
    [24, 30, "24 di 30 libri"],
    [30, 30, "30 libri"],
    [1, 1, "1 libro"],
    [1, 2, "1 di 2 libri"],
    [24, null, "24 libri"],
    [0, 0, "0 libri"],
    [0, 5, "0 di 5 libri"],
  ] as const)("%i caricati su %s → «%s»", (loaded, total, label) => {
    expect(countLabel(loaded, total)).toBe(label);
  });
});
