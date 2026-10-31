import { type ExportRow, parseCsv, toCsv } from "../../shared/csv/format";
import { type DuplicateMode, type ImportPlan, planImport } from "../../shared/csv/plan";
import { EXISTING_MAX_ISBNS, IMPORT_CHUNK_SIZE, type ImportChunkResult } from "../../shared/csv/transport";
import { normalizeIsbn } from "../../shared/isbn";
import { locationNameKey } from "../../shared/text";
import { api, send } from "./api";
import type { LocationSummary } from "./locations";

// Il CSV si legge e si scrive sul telefono; il server riceve solo dati già controllati, a blocchi.

export async function downloadCatalog(location: LocationSummary | null): Promise<number> {
  const rows: ExportRow[] = [];
  let after: number | null = null;
  do {
    const query = new URLSearchParams();
    if (location) query.set("location", location.id);
    if (after) query.set("after", String(after));
    const page: { rows: ExportRow[]; nextAfter: number | null } = await api(`/csv/export?${query.toString()}`);
    rows.push(...page.rows);
    after = page.nextAfter;
  } while (after);

  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const slug = location ? locationNameKey(location.name).replace(/[^a-z0-9]+/g, "-") : "completo";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `catalogo-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
  // Nel documento durante il clic: alcuni browser ignorano i download da link non inseriti nella pagina.
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  return rows.length;
}

/** Anteprima (nessuna scrittura): legge il file, chiede quali ISBN esistono, pianifica. */
export async function previewImport(file: File, locations: readonly LocationSummary[], mode: DuplicateMode): Promise<ImportPlan> {
  const { rows, errors } = parseCsv(await file.text());
  if (errors.length > 0) return { operations: [], skipped: [], errors, summary: { rows: 0, newBooks: 0, newCopies: 0, skipped: 0, errors: errors.length } };

  const isbns = [...new Set(rows.map((row) => normalizeIsbn(row.isbn)).filter((isbn): isbn is string => isbn !== null))];
  const existingBooks = new Map<string, string>();
  for (let start = 0; start < isbns.length; start += EXISTING_MAX_ISBNS) {
    const { existing } = await send<{ existing: Record<string, string> }>("/csv/existing", "POST", { isbns: isbns.slice(start, start + EXISTING_MAX_ISBNS) });
    for (const [isbn, bookId] of Object.entries(existing)) existingBooks.set(isbn, bookId);
  }
  const byName = new Map(locations.map((location) => [locationNameKey(location.name), { id: location.id, name: location.name, archived: location.archived }]));
  return planImport(rows, { locations: byName, existingBooks }, mode);
}

export interface ImportTotals {
  newBooks: number;
  newCopies: number;
  missing: number[];
}

/** Import vero, a blocchi in sequenza; `onProgress` riceve le righe completate. */
export async function applyImport(plan: ImportPlan, onProgress: (done: number) => void): Promise<ImportTotals> {
  const totals: ImportTotals = { newBooks: 0, newCopies: 0, missing: [] };
  for (let start = 0; start < plan.operations.length; start += IMPORT_CHUNK_SIZE) {
    const operations = plan.operations.slice(start, start + IMPORT_CHUNK_SIZE).map((operation) =>
      operation.kind === "new-book"
        ? { line: operation.line, kind: operation.kind, book: operation.book, locationId: operation.locationId, copy: operation.copy }
        : { line: operation.line, kind: operation.kind, isbn13: operation.isbn13, locationId: operation.locationId, copy: operation.copy },
    );
    const result = await send<ImportChunkResult>("/csv/import", "POST", { operations });
    totals.newBooks += result.newBooks;
    totals.newCopies += result.newCopies;
    totals.missing.push(...result.missing);
    onProgress(Math.min(start + IMPORT_CHUNK_SIZE, plan.operations.length));
  }
  return totals;
}
