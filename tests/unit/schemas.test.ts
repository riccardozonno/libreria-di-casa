import { describe, expect, it } from "vitest";
import { bookDataSchema, copyDetailsSchema, isbnSchema, locationNameSchema, optionalIsbnSchema, parseAuthors } from "@/lib/schemas";

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
