import { describe, expect, it } from "vitest";
import { createBookWithCopy } from "@/server/catalog/mutations";
import { applyImport, exportCsv, previewImport } from "@/server/csv/service";
import { prisma } from "@/server/db";
import { bookData, makeLocation, makeUser, noCopyDetails } from "./fixtures";

// Import/export CSV contro Postgres reale: permessi, anteprima senza scrittura, import atomico, audit.

const HEADER = "isbn;titolo;autori;anno;descrizione;sede;collocazione;note";

async function setup() {
  const casa = await makeLocation("Casa");
  const mare = await makeLocation("Mare");
  const admin = await makeUser("ADMIN");
  const editor = await makeUser("EDITOR", { editorOf: [casa.id] });
  return { casa, mare, admin, editor };
}

describe("export", () => {
  it("esporta tutte le copie o solo quelle di una sede, e lo registra", async () => {
    const { casa, mare, admin } = await setup();
    await createBookWithCopy(admin, { book: bookData({ title: "Libro A", isbn13: "9788804668237" }), source: "MANUAL", coverPath: null, locationId: casa.id, copy: { shelf: "Studio", notes: null } });
    await createBookWithCopy(admin, { book: bookData({ title: "Libro B" }), source: "MANUAL", coverPath: null, locationId: mare.id, copy: noCopyDetails });

    const all = await exportCsv(admin, null);
    const onlyMare = await exportCsv(admin, mare.id);

    expect(all.split("\r\n")).toHaveLength(3);
    expect(all).toContain("9788804668237;Libro A;Italo Calvino;1957;;Casa;Studio;");
    expect(onlyMare).toContain("Libro B");
    expect(onlyMare).not.toContain("Libro A");
    expect(await prisma.auditLog.count({ where: { action: "csv.export" } })).toBe(2);
  });

  it("solo l'admin esporta", async () => {
    const { editor } = await setup();

    await expect(exportCsv(editor, null)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("import", () => {
  it("l'anteprima non scrive nulla", async () => {
    const { admin } = await setup();

    const plan = await previewImport(admin, `${HEADER}\n;Quaderno;;;;Casa;;`, "add-copy");

    expect(plan.summary).toMatchObject({ newBooks: 1, newCopies: 1, errors: 0 });
    expect(await prisma.book.count()).toBe(0);
  });

  it("importa libri e copie in una transazione, riusando i libri già presenti", async () => {
    const { casa, admin } = await setup();
    await createBookWithCopy(admin, { book: bookData({ title: "Esistente", isbn13: "9788804668237" }), source: "MANUAL", coverPath: null, locationId: casa.id, copy: noCopyDetails });
    const csv = [
      HEADER,
      "9780306406157;Libro nuovo;A | B;1999;;Mare;Sala;",
      "9780306406157;;;;;Casa;;seconda copia",
      "978-88-04-66823-7;Titolo ignorato;;;;Mare;;",
      ";Senza ISBN;;;;Casa;;",
    ].join("\n");

    const result = await applyImport(admin, csv, "add-copy");

    expect(result.summary).toMatchObject({ newBooks: 2, newCopies: 4, errors: 0 });
    const nuovo = await prisma.book.findUniqueOrThrow({ where: { isbn13: "9780306406157" }, include: { copies: true } });
    expect(nuovo).toMatchObject({ title: "Libro nuovo", authors: ["A", "B"], publishedYear: 1999, source: "CSV" });
    expect(nuovo.copies).toHaveLength(2);
    const esistente = await prisma.book.findUniqueOrThrow({ where: { isbn13: "9788804668237" }, include: { copies: true } });
    expect(esistente.title).toBe("Esistente");
    expect(esistente.copies).toHaveLength(2);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "csv.import" } });
    expect(audit.data).toMatchObject({ newBooks: 2, newCopies: 4 });
  });

  it("con errori non scrive niente e li restituisce con il numero di riga", async () => {
    const { admin } = await setup();
    const csv = [HEADER, ";Buono;;;;Casa;;", "123;Cattivo;;;;Casa;;"].join("\n");

    const result = await applyImport(admin, csv, "add-copy");

    expect(result.errors).toEqual([{ line: 3, message: "ISBN non valido: 123" }]);
    expect(await prisma.book.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "csv.import" } })).toBe(0);
  });

  it("solo l'admin importa, anche in anteprima", async () => {
    const { editor } = await setup();

    await expect(previewImport(editor, `${HEADER}\n;X;;;;Casa;;`, "add-copy")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(applyImport(editor, `${HEADER}\n;X;;;;Casa;;`, "add-copy")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
