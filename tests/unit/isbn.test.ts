import { describe, expect, it } from "vitest";
import { normalizeIsbn, formatIsbn13 } from "@/lib/isbn";

describe("normalizeIsbn", () => {
  it("accetta un ISBN-13 valido", () => {
    expect(normalizeIsbn("9788804668237")).toBe("9788804668237");
  });

  it("ignora trattini e spazi", () => {
    expect(normalizeIsbn(" 978-88-04-66823-7 ")).toBe("9788804668237");
  });

  it("converte un ISBN-10 nel corrispondente ISBN-13", () => {
    expect(normalizeIsbn("0306406152")).toBe("9780306406157");
  });

  it("accetta la X finale di un ISBN-10, anche minuscola", () => {
    expect(normalizeIsbn("080442957x")).toBe("9780804429573");
  });

  it("accetta i prefissi 979", () => {
    expect(normalizeIsbn("9791032305690")).toBe("9791032305690");
  });

  it("rifiuta checksum errati", () => {
    expect(normalizeIsbn("9788804668238")).toBeNull();
    expect(normalizeIsbn("0306406153")).toBeNull();
  });

  it("rifiuta EAN-13 che non sono libri", () => {
    expect(normalizeIsbn("4006381333931")).toBeNull();
  });

  it("rifiuta lunghezze e caratteri non validi", () => {
    expect(normalizeIsbn("")).toBeNull();
    expect(normalizeIsbn("12345")).toBeNull();
    expect(normalizeIsbn("97888046682X7")).toBeNull();
    expect(normalizeIsbn("abc")).toBeNull();
  });
});

describe("formatIsbn13", () => {
  it("formatta per la lettura con i trattini essenziali", () => {
    expect(formatIsbn13("9788804668237")).toBe("978-8804668237");
  });
});
