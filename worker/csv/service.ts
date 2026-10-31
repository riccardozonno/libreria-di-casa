import { type SQL, sql } from "drizzle-orm";
import type { ExportRow } from "../../shared/csv/format";
import { EXPORT_PAGE_SIZE, type ImportChunk, type ImportChunkResult } from "../../shared/csv/transport";
import { can } from "../../shared/policy";
import { auditInsert } from "../audit";
import { changedRows, runBatch } from "../db/batch";
import type { Db } from "../db/client";
import { DomainError, forbidden } from "../errors";
import type { Requester } from "../http";

// CSV lato server: dati a pagine per l'export, ISBN esistenti per l'anteprima, import a blocchi.
// Il file lo legge e lo scrive il telefono (shared/csv/format.ts): qui niente parsing di testo.

interface ExportDbRow {
  seq: number;
  isbn13: string | null;
  title: string;
  authors: string;
  published_year: number | null;
  description: string | null;
  location: string;
  shelf: string | null;
  notes: string | null;
}

export async function exportPage(db: Db, who: Requester, options: { locationId?: string; after?: number }): Promise<{ rows: ExportRow[]; nextAfter: number | null }> {
  if (!can(who.actor, { type: "csv.export" })) throw forbidden();
  const conditions: SQL[] = [];
  if (options.locationId) conditions.push(sql`c.location_id = ${options.locationId}`);
  if (options.after) conditions.push(sql`c.rowid > ${options.after}`);
  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;
  const rows = await db.all<ExportDbRow>(sql`
    SELECT c.rowid AS seq, b.isbn13, b.title, b.authors, b.published_year, b.description, l.name AS location, c.shelf, c.notes
    FROM copy c JOIN book b ON b.id = c.book_id JOIN location l ON l.id = c.location_id
    ${where} ORDER BY c.rowid LIMIT ${EXPORT_PAGE_SIZE + 1}`);

  const page = rows.slice(0, EXPORT_PAGE_SIZE);
  const isLastPage = rows.length <= EXPORT_PAGE_SIZE;

  // Una riga di registro per export, quando arriva all'ultima pagina (export completato), non una per pagina.
  if (isLastPage) {
    const location = options.locationId ? await db.get<{ name: string } | undefined>(sql`SELECT name FROM location WHERE id = ${options.locationId}`) : undefined;
    await runBatch(db, [auditInsert(db, who.audit, { action: "csv.export", entityType: "export", data: { location: location?.name ?? "tutte le sedi" }, ip: who.audit.ip })]);
  }

  return {
    rows: page.map((row) => ({
      isbn13: row.isbn13,
      title: row.title,
      authors: JSON.parse(row.authors) as string[],
      publishedYear: row.published_year,
      description: row.description,
      location: row.location,
      shelf: row.shelf,
      notes: row.notes,
    })),
    nextAfter: isLastPage ? null : (page.at(-1)?.seq ?? null),
  };
}

export async function findExistingIsbns(db: Db, who: Requester, isbns: readonly string[]): Promise<Record<string, string>> {
  if (!can(who.actor, { type: "csv.import" })) throw forbidden();
  if (isbns.length === 0) return {};
  const rows = await db.all<{ isbn13: string; id: string }>(sql`SELECT isbn13, id FROM book WHERE isbn13 IN (${sql.join(isbns.map((isbn) => sql`${isbn}`), sql`, `)})`);
  return Object.fromEntries(rows.map((row) => [row.isbn13, row.id]));
}

export async function importChunk(db: Db, who: Requester, chunk: ImportChunk): Promise<ImportChunkResult> {
  if (!can(who.actor, { type: "csv.import" })) throw forbidden();
  const locations = await db.all<{ id: string; archived_at: string | null }>(sql`SELECT id, archived_at FROM location`);
  const active = new Set(locations.filter((row) => row.archived_at === null).map((row) => row.id));
  const badLines = chunk.operations.filter((operation) => !active.has(operation.locationId)).map((operation) => operation.line);
  if (badLines.length > 0) throw new DomainError("VALIDATION", `Sede inesistente o archiviata alle righe ${badLines.join(", ")}.`);

  const actorId = who.audit.id;
  const statements: SQL[] = [];
  const bookStatement: number[] = [];
  const copyStatement: Array<{ index: number; line: number }> = [];
  const bookIds: string[] = [];
  const copyIds: string[] = [];

  for (const operation of chunk.operations) {
    const copyId = crypto.randomUUID();
    copyIds.push(copyId);
    const { shelf, notes } = operation.copy;
    if (operation.kind === "new-book") {
      const { book } = operation;
      const bookId = crypto.randomUUID();
      bookIds.push(bookId);
      // Con ISBN: se nel frattempo qualcuno l'ha aggiunto, il libro resta quello e la riga diventa una copia.
      bookStatement.push(statements.length);
      statements.push(sql`
        INSERT OR IGNORE INTO book (id, isbn13, title, authors, published_year, description, source, created_by_id)
        VALUES (${bookId}, ${book.isbn13}, ${book.title}, ${JSON.stringify(book.authors)}, ${book.publishedYear}, ${book.description}, 'CSV', ${actorId})`);
      const owner = book.isbn13 ? sql`(SELECT id FROM book WHERE isbn13 = ${book.isbn13})` : sql`${bookId}`;
      copyStatement.push({ index: statements.length, line: operation.line });
      statements.push(sql`INSERT INTO copy (id, book_id, location_id, shelf, notes, created_by_id) SELECT ${copyId}, ${owner}, ${operation.locationId}, ${shelf}, ${notes}, ${actorId}`);
    } else {
      copyStatement.push({ index: statements.length, line: operation.line });
      statements.push(sql`
        INSERT INTO copy (id, book_id, location_id, shelf, notes, created_by_id)
        SELECT ${copyId}, id, ${operation.locationId}, ${shelf}, ${notes}, ${actorId} FROM book WHERE isbn13 = ${operation.isbn13}`);
    }
  }

  // Registro nello stesso batch, con i conteggi reali calcolati alla fine dal database stesso.
  const idList = (ids: string[]) => sql.join(ids.map((id) => sql`${id}`), sql`, `);
  statements.push(sql`
    INSERT INTO audit_log (id, actor_id, actor_email, action, entity_type, data, ip)
    VALUES (${crypto.randomUUID()}, ${actorId}, ${who.audit.email}, 'csv.import', 'import',
      json_object('lines', json(${JSON.stringify(chunk.operations.map((operation) => operation.line))}),
                  'newBooks', (SELECT count(*) FROM book WHERE id IN (${bookIds.length > 0 ? idList(bookIds) : sql`NULL`})),
                  'newCopies', (SELECT count(*) FROM copy WHERE id IN (${idList(copyIds)}))),
      ${who.audit.ip})`);

  const results = await runBatch(db, statements);
  return {
    newBooks: bookStatement.filter((index) => changedRows(results[index])).length,
    newCopies: copyStatement.filter(({ index }) => changedRows(results[index])).length,
    missing: copyStatement.filter(({ index }) => !changedRows(results[index])).map(({ line }) => line),
  };
}
