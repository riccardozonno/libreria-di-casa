import { describe, expect, it } from "vitest";
import { CSV_HEADER, parseCsv, toCsv, type ExportRow } from "../../shared/csv/format";
import { planImport, type ImportContext } from "../../shared/csv/plan";

const BOM = "﻿";

const exportRow = (overrides: Partial<ExportRow> = {}): ExportRow => ({
  isbn13: "9788804668237",
  title: "Il barone rampante",
  authors: ["Italo Calvino"],
  publishedYear: 1957,
  genre: null,
  description: null,
  location: "Casa",
  shelf: "Studio",
  notes: null,
  ...overrides,
});

describe("export CSV", () => {
  it("scrive BOM, intestazione e una riga per copia con separatore ;", () => {
    const csv = toCsv([exportRow()]);

    expect(csv.startsWith(BOM)).toBe(true);
    const [header, line] = csv.slice(1).split("\r\n");
    expect(header).toBe(CSV_HEADER.join(";"));
    expect(header).toBe("isbn;titolo;autori;anno;genere;descrizione;sede;collocazione;note");
    expect(line).toBe("9788804668237;Il barone rampante;Italo Calvino;1957;;;Casa;Studio;");
  });

  it("scrive il genere con l'etichetta italiana", () => {
    const [, line] = toCsv([exportRow({ genre: "GIALLI" })]).slice(1).split("\r\n");
    expect(line).toBe("9788804668237;Il barone rampante;Italo Calvino;1957;Gialli e thriller;;Casa;Studio;");
  });

  it("unisce gli autori con | e mette tra virgolette i campi con ; virgolette o a capo", () => {
    const csv = toCsv([exportRow({ authors: ["Fruttero", "Lucentini"], title: 'Il "giallo"; secondo', notes: "riga 1\nriga 2" })]);

    expect(csv).toContain('Fruttero | Lucentini');
    expect(csv).toContain('"Il ""giallo""; secondo"');
    expect(csv).toContain('"riga 1\nriga 2"');
  });

  it("neutralizza le celle che Excel interpreterebbe come formule", () => {
    const csv = toCsv([exportRow({ title: "=HYPERLINK(\"http://x\")", notes: "+39 123", shelf: "@sala", description: "-2" })]);

    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).toContain("'+39 123");
    expect(csv).toContain("'@sala");
    expect(csv).toContain("'-2");
  });
});

describe("lettura CSV", () => {
  it("rilegge quello che esporta (andata e ritorno)", () => {
    const csv = toCsv([exportRow({ authors: ["A", "B"], notes: "x; y", genre: "RELIGIONE" })]);

    const { rows, errors } = parseCsv(csv);

    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 2, isbn: "9788804668237", titolo: "Il barone rampante", autori: "A | B", anno: "1957", genere: "Religione e spiritualità", descrizione: "", sede: "Casa", collocazione: "Studio", note: "x; y" },
    ]);
  });

  it("accetta intestazioni con maiuscole/spazi e colonne in ordine diverso, ignora righe vuote", () => {
    const { rows, errors } = parseCsv(" Titolo ;SEDE;isbn\nUn libro;Casa;\n\n");

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ line: 2, titolo: "Un libro", sede: "Casa", isbn: "", autori: "" });
  });

  it("segnala colonne obbligatorie mancanti", () => {
    const { errors } = parseCsv("isbn;autori\n978;x");

    expect(errors).toEqual([{ line: 1, message: "Colonne obbligatorie mancanti: titolo, sede" }]);
  });

  it("segnala file vuoti o troppo lunghi", () => {
    expect(parseCsv("").errors[0]?.message).toContain("vuoto");
    const tooMany = `titolo;sede\n${"x;Casa\n".repeat(10_001)}`;
    expect(parseCsv(tooMany).errors[0]?.message).toContain("10000");
  });
});

describe("pianificazione dell'import", () => {
  const context: ImportContext = {
    locations: new Map([
      ["casa", { id: "loc-casa", name: "Casa", archived: false }],
      ["mare", { id: "loc-mare", name: "Mare", archived: false }],
      ["vecchia", { id: "loc-vecchia", name: "Vecchia", archived: true }],
    ]),
    existingBooks: new Map([["9788804668237", "book-esistente"]]),
  };

  const row = (line: number, values: Record<string, string>) => ({
    line,
    isbn: "",
    titolo: "",
    autori: "",
    anno: "",
    genere: "",
    descrizione: "",
    sede: "Casa",
    collocazione: "",
    note: "",
    ...values,
  });

  it("crea libri nuovi e normalizza ISBN, autori, anno e sede (senza accenti/maiuscole)", () => {
    const plan = planImport([row(2, { isbn: "0306406152", titolo: "Libro", autori: "A | B", anno: "1999", sede: "  MARE " })], context, "add-copy");

    expect(plan.errors).toEqual([]);
    expect(plan.operations).toEqual([
      {
        line: 2,
        kind: "new-book",
        book: { isbn13: "9780306406157", title: "Libro", authors: ["A", "B"], publishedYear: 1999, description: null },
        genre: null,
        locationId: "loc-mare",
        copy: { shelf: null, notes: null },
      },
    ]);
    expect(plan.summary).toEqual({ rows: 1, newBooks: 1, newCopies: 1, skipped: 0, errors: 0 });
  });

  it("genere per etichetta o chiave; sconosciuto = errore di riga; ignorato per le copie di libri esistenti", () => {
    const plan = planImport(
      [
        row(2, { titolo: "Uno", genere: "gialli e thriller" }),
        row(3, { titolo: "Due", genere: "STORIA" }),
        row(4, { isbn: "978-88-04-66823-7", genere: "Inventato" }),
      ],
      context,
      "add-copy",
    );
    expect(plan.errors).toEqual([]);
    expect(plan.operations.map((operation) => (operation.kind === "new-book" ? operation.genre : "copia"))).toEqual(["GIALLI", "STORIA", "copia"]);

    const wrong = planImport([row(2, { titolo: "Tre", genere: "Romanzi rosa" })], context, "add-copy");
    expect(wrong.errors).toEqual([{ line: 2, message: "genere: «Romanzi rosa» non è nell'elenco dei generi" }]);
  });

  it("un ISBN già in catalogo diventa una copia, senza toccare i dati del libro", () => {
    const plan = planImport([row(2, { isbn: "978-88-04-66823-7", titolo: "Titolo diverso", collocazione: "Sala" })], context, "add-copy");

    expect(plan.operations).toEqual([
      { line: 2, kind: "add-copy", isbn13: "9788804668237", existingBookId: "book-esistente", locationId: "loc-casa", copy: { shelf: "Sala", notes: null } },
    ]);
  });

  it("in modalità 'salta' ignora gli ISBN già in catalogo", () => {
    const plan = planImport([row(2, { isbn: "9788804668237" })], context, "skip");

    expect(plan.operations).toEqual([]);
    expect(plan.skipped).toEqual([{ line: 2, isbn13: "9788804668237" }]);
    expect(plan.summary.skipped).toBe(1);
  });

  it("lo stesso ISBN ripetuto nel file crea un libro e poi copie", () => {
    const plan = planImport(
      [row(2, { isbn: "9780306406157", titolo: "Libro" }), row(3, { isbn: "9780306406157", sede: "Mare" })],
      context,
      "skip",
    );

    expect(plan.operations.map((operation) => operation.kind)).toEqual(["new-book", "add-copy"]);
    expect(plan.operations[1]).toMatchObject({ isbn13: "9780306406157", existingBookId: null, locationId: "loc-mare" });
    expect(plan.summary).toMatchObject({ newBooks: 1, newCopies: 2 });
  });

  it("i libri senza ISBN sono sempre nuovi", () => {
    const plan = planImport([row(2, { titolo: "Quaderno" }), row(3, { titolo: "Quaderno" })], context, "add-copy");

    expect(plan.summary.newBooks).toBe(2);
  });

  it("riporta ogni errore con il numero di riga", () => {
    const plan = planImport(
      [
        row(2, { isbn: "123", titolo: "X" }),
        row(3, { titolo: "" }),
        row(4, { titolo: "X", sede: "Montagna" }),
        row(5, { titolo: "X", sede: "Vecchia" }),
        row(6, { titolo: "X", anno: "duemila" }),
        row(7, { titolo: "x".repeat(301) }),
      ],
      context,
      "add-copy",
    );

    expect(plan.errors).toEqual([
      { line: 2, message: "ISBN non valido: 123" },
      { line: 3, message: "Titolo obbligatorio per un libro nuovo" },
      { line: 4, message: 'Sede "Montagna" inesistente' },
      { line: 5, message: 'Sede "Vecchia" archiviata' },
      { line: 6, message: "anno: Anno non valido" },
      { line: 7, message: "titolo: Massimo 300 caratteri" },
    ]);
    expect(plan.operations).toEqual([]);
    expect(plan.summary.errors).toBe(6);
  });
});
