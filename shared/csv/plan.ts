import { genreFromText, type GenreKey } from "../genres";
import { normalizeIsbn } from "../isbn";
import { bookDataSchema, copyDetailsSchema, type BookData, type CopyDetails } from "../schemas";
import { locationNameKey } from "../text";
import { splitAuthors, type CsvError, type CsvRow } from "./format";

// Pianificazione dell'import (pura, testabile): valida ogni riga e decide cosa creare,
// senza scrivere nulla. La stessa funzione serve per l'anteprima e per l'import vero.

export type DuplicateMode = "add-copy" | "skip";

export interface ImportContext {
  /** nameKey → sede */
  locations: ReadonlyMap<string, { id: string; name: string; archived: boolean }>;
  /** ISBN-13 → id del libro già in catalogo */
  existingBooks: ReadonlyMap<string, string>;
}

export type ImportOperation =
  | { line: number; kind: "new-book"; book: BookData; genre: GenreKey | null; locationId: string; copy: CopyDetails }
  | { line: number; kind: "add-copy"; isbn13: string; existingBookId: string | null; locationId: string; copy: CopyDetails };

export interface ImportPlan {
  operations: ImportOperation[];
  skipped: { line: number; isbn13: string }[];
  errors: CsvError[];
  summary: { rows: number; newBooks: number; newCopies: number; skipped: number; errors: number };
}

const FIELD_TO_COLUMN: Record<string, string> = {
  title: "titolo",
  authors: "autori",
  publishedYear: "anno",
  description: "descrizione",
  shelf: "collocazione",
  notes: "note",
};

class RowError extends Error {}

function parseYear(raw: string): number | null {
  if (!raw) return null;
  if (!/^\d{4}$/.test(raw)) throw new RowError("anno: Anno non valido");
  return Number(raw);
}

function parseGenre(raw: string): GenreKey | null {
  if (!raw) return null;
  const genre = genreFromText(raw);
  if (!genre) throw new RowError(`genere: «${raw}» non è nell'elenco dei generi`);
  return genre;
}

function parseWith<T>(schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } } }, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = String(issue?.path[0] ?? "");
  throw new RowError(`${FIELD_TO_COLUMN[field] ?? field}: ${issue?.message ?? "valore non valido"}`);
}

export function planImport(rows: readonly CsvRow[], context: ImportContext, mode: DuplicateMode): ImportPlan {
  const operations: ImportOperation[] = [];
  const skipped: ImportPlan["skipped"] = [];
  const errors: CsvError[] = [];
  const createdInFile = new Set<string>();

  for (const row of rows) {
    try {
      const isbn13 = row.isbn ? normalizeIsbn(row.isbn) : null;
      if (row.isbn && !isbn13) throw new RowError(`ISBN non valido: ${row.isbn}`);

      const location = context.locations.get(locationNameKey(row.sede));
      if (!location) throw new RowError(`Sede "${row.sede}" inesistente`);
      if (location.archived) throw new RowError(`Sede "${location.name}" archiviata`);

      const copy = parseWith(copyDetailsSchema, { shelf: row.collocazione, notes: row.note });
      const existingBookId = isbn13 ? context.existingBooks.get(isbn13) : undefined;

      if (isbn13 && existingBookId) {
        if (mode === "skip") {
          skipped.push({ line: row.line, isbn13 });
          continue;
        }
        operations.push({ line: row.line, kind: "add-copy", isbn13, existingBookId, locationId: location.id, copy });
        continue;
      }
      if (isbn13 && createdInFile.has(isbn13)) {
        operations.push({ line: row.line, kind: "add-copy", isbn13, existingBookId: null, locationId: location.id, copy });
        continue;
      }

      if (!row.titolo) throw new RowError("Titolo obbligatorio per un libro nuovo");
      const book = parseWith(bookDataSchema, {
        isbn13: isbn13 ?? "",
        title: row.titolo,
        authors: splitAuthors(row.autori),
        publishedYear: parseYear(row.anno),
        description: row.descrizione,
      });
      const genre = parseGenre(row.genere);
      if (isbn13) createdInFile.add(isbn13);
      operations.push({ line: row.line, kind: "new-book", book, genre, locationId: location.id, copy });
    } catch (error) {
      if (!(error instanceof RowError)) throw error;
      errors.push({ line: row.line, message: error.message });
    }
  }

  const newBooks = operations.filter((operation) => operation.kind === "new-book").length;
  return {
    operations: errors.length > 0 ? [] : operations,
    skipped,
    errors,
    summary: { rows: rows.length, newBooks, newCopies: operations.length, skipped: skipped.length, errors: errors.length },
  };
}
