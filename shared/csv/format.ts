import Papa from "papaparse";
import { genreLabel, type GenreKey } from "../genres";

// Formato CSV di HOME LIBRARY: una riga per copia, separatore ";", UTF-8 con BOM (Excel in italiano).

// «genere» dal 02/11/2026: facoltativa, i file senza questa colonna si importano come prima.
export const CSV_HEADER = ["isbn", "titolo", "autori", "anno", "genere", "descrizione", "sede", "collocazione", "note"] as const;
export type CsvColumn = (typeof CSV_HEADER)[number];

const REQUIRED_COLUMNS: readonly CsvColumn[] = ["titolo", "sede"];
const AUTHORS_SEPARATOR = " | ";
export const MAX_IMPORT_ROWS = 10_000;
const BOM = "\uFEFF";

export interface ExportRow {
  isbn13: string | null;
  title: string;
  authors: readonly string[];
  publishedYear: number | null;
  genre: GenreKey | null;
  description: string | null;
  location: string;
  shelf: string | null;
  notes: string | null;
}

export type CsvRow = { line: number } & Record<CsvColumn, string>;

export interface CsvError {
  line: number;
  message: string;
}

export function toCsv(rows: readonly ExportRow[]): string {
  const data = rows.map((row) => [
    row.isbn13 ?? "",
    row.title,
    row.authors.join(AUTHORS_SEPARATOR),
    row.publishedYear?.toString() ?? "",
    row.genre ? genreLabel(row.genre) : "",
    row.description ?? "",
    row.location,
    row.shelf ?? "",
    row.notes ?? "",
  ]);
  // escapeFormulae: le celle che iniziano con = + - @ vengono precedute da ' (niente formule eseguite da Excel).
  return BOM + Papa.unparse({ fields: [...CSV_HEADER], data }, { delimiter: ";", newline: "\r\n", escapeFormulae: true });
}

export function splitAuthors(raw: string): string[] {
  return raw
    .split("|")
    .map((author) => author.trim())
    .filter((author) => author.length > 0);
}

function normalizeHeader(header: string): string {
  return header.replace(/^\uFEFF/, "").trim().toLowerCase();
}

export function parseCsv(text: string): { rows: CsvRow[]; errors: CsvError[] } {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    delimitersToGuess: [";", ","],
    skipEmptyLines: "greedy",
  });
  const [headerRow, ...dataRows] = parsed.data;
  if (!headerRow || headerRow.every((cell) => cell.trim() === "")) {
    return { rows: [], errors: [{ line: 1, message: "Il file è vuoto." }] };
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    return { rows: [], errors: [{ line: 1, message: `Il file ha ${dataRows.length} righe: massimo ${MAX_IMPORT_ROWS}.` }] };
  }

  const headers = headerRow.map(normalizeHeader);
  const missing = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    return { rows: [], errors: [{ line: 1, message: `Colonne obbligatorie mancanti: ${missing.join(", ")}` }] };
  }

  // Numero di riga come nel foglio di calcolo: l'intestazione è la riga 1.
  const rows = dataRows.map((cells, index) => {
    const row = { line: index + 2 } as CsvRow;
    for (const column of CSV_HEADER) {
      const position = headers.indexOf(column);
      row[column] = position >= 0 ? (cells[position] ?? "").trim() : "";
    }
    return row;
  });
  return { rows, errors: [] };
}
