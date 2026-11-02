import { describe, expect, it, vi } from "vitest";
import { bookDataSchema, bookGenreSchema, copyDetailsSchema, isbnSchema, locationNameSchema, newBookSchema, optionalIsbnSchema, parseAuthors, ratingSchema } from "../../shared/schemas";

describe("schemi di validazione", () => {
  it("isbnSchema normalizza e rifiuta ISBN non validi", () => {
    expect(isbnSchema.parse(" 0306406152 ")).toBe("9780306406157");
    expect(isbnSchema.safeParse("123").success).toBe(false);
  });

  it("optionalIsbnSchema accetta il campo vuoto come null", () => {
    expect(optionalIsbnSchema.parse("")).toBeNull();
    expect(optionalIsbnSchema.parse(undefined)).toBeNull();
    expect(optionalIsbnSchema.parse("978-88-04-66823-7")).toBe("9788804668237");
    expect(optionalIsbnSchema.safeParse("9788804668238").success).toBe(false);
  });

  it("bookDataSchema richiede il titolo, controlla l'anno e pulisce i campi facoltativi", () => {
    const parsed = bookDataSchema.parse({ title: "  Fiabe italiane ", authors: ["Italo Calvino"], publishedYear: "1956", description: "  " });
    expect(parsed).toEqual({ isbn13: null, title: "Fiabe italiane", authors: ["Italo Calvino"], publishedYear: 1956, description: null });
    expect(bookDataSchema.safeParse({ title: "" }).success).toBe(false);
    expect(bookDataSchema.safeParse({ title: "X", publishedYear: "1200" }).success).toBe(false);
    expect(bookDataSchema.safeParse({ title: "X", publishedYear: "3000" }).success).toBe(false);
    expect(bookDataSchema.parse({ title: "X", publishedYear: null }).publishedYear).toBeNull();
  });

  it("copyDetailsSchema trasforma i testi vuoti in null e limita la lunghezza", () => {
    expect(copyDetailsSchema.parse({ shelf: " ", notes: "" })).toEqual({ shelf: null, notes: null });
    expect(copyDetailsSchema.parse({})).toEqual({ shelf: null, notes: null });
    expect(copyDetailsSchema.safeParse({ shelf: "x".repeat(121) }).success).toBe(false);
  });

  it("locationNameSchema rifiuta nomi vuoti o troppo lunghi", () => {
    expect(locationNameSchema.parse("  Casa  ")).toBe("Casa");
    expect(locationNameSchema.safeParse("").success).toBe(false);
    expect(locationNameSchema.safeParse("x".repeat(61)).success).toBe(false);
  });

  it("parseAuthors divide per riga o punto e virgola", () => {
    expect(parseAuthors("Fruttero\nLucentini")).toEqual(["Fruttero", "Lucentini"]);
    expect(parseAuthors(" A ; B ;; ")).toEqual(["A", "B"]);
    expect(parseAuthors("")).toEqual([]);
  });
});

describe("anno di pubblicazione", () => {
  it("il limite usa la data del momento, non quella del caricamento del modulo (su Workers all'avvio è il 1970)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.resetModules();
    const { bookDataSchema: schemaLoadedIn1970 } = await import("../../shared/schemas");
    vi.useRealTimers();

    expect(schemaLoadedIn1970.parse({ title: "X", publishedYear: "2020" }).publishedYear).toBe(2020);
    expect(schemaLoadedIn1970.safeParse({ title: "X", publishedYear: String(new Date().getFullYear() + 2) }).success).toBe(false);
  });

  it("accetta l'anno corrente ma non gli anni futuri (un libro che hai in casa non è del futuro)", () => {
    const thisYear = new Date().getFullYear();
    expect(bookDataSchema.parse({ title: "X", publishedYear: String(thisYear) }).publishedYear).toBe(thisYear);
    expect(bookDataSchema.safeParse({ title: "X", publishedYear: String(thisYear + 1) }).success).toBe(false);
  });

  it("un anno vuoto o assente è null, non un errore", () => {
    expect(bookDataSchema.parse({ title: "X", publishedYear: null }).publishedYear).toBeNull();
    expect(bookDataSchema.parse({ title: "X", publishedYear: "" }).publishedYear).toBeNull();
    expect(bookDataSchema.parse({ title: "X" }).publishedYear).toBeNull();
  });
});

describe("voto", () => {
  it.each([1, 2, 3, 4, 5])("accetta %i stelle", (rating) => {
    expect(ratingSchema.parse({ rating })).toEqual({ rating });
  });

  it("null toglie il voto", () => {
    expect(ratingSchema.parse({ rating: null })).toEqual({ rating: null });
  });

  it.each([0, 6, 2.5, "4", undefined])("rifiuta %s", (rating) => {
    expect(ratingSchema.safeParse({ rating }).success).toBe(false);
  });
});

describe("genere", () => {
  it("accetta le chiavi dell'elenco e null", () => {
    expect(bookGenreSchema.parse({ genre: "GIALLI" })).toEqual({ genre: "GIALLI" });
    expect(bookGenreSchema.parse({ genre: null })).toEqual({ genre: null });
  });

  it.each(["Gialli e thriller", "ROSA", "", 3, undefined])("rifiuta %s", (genre) => {
    expect(bookGenreSchema.safeParse({ genre }).success).toBe(false);
  });

  it("nuovo libro: genere facoltativo, assente = null", () => {
    const base = { book: { title: "Titolo" }, source: "MANUAL", locationId: "casa" };
    expect(newBookSchema.parse(base).genre).toBeNull();
    expect(newBookSchema.parse({ ...base, genre: "STORIA" }).genre).toBe("STORIA");
    expect(newBookSchema.safeParse({ ...base, genre: "Storia" }).success).toBe(false);
  });
});
