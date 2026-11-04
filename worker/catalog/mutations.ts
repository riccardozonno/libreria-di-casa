import { and, eq, type SQL, sql } from "drizzle-orm";
import { can, type LocationRef } from "../../shared/policy";
import type { GenreKey } from "../../shared/genres";
import type { AddCopyInput, BookUpdate, CopyDetails, NewBookInput } from "../../shared/schemas";
import { auditInsert, auditWhen } from "../audit";
import { changedRows, runBatch } from "../db/batch";
import type { Db } from "../db/client";
import { book, copy } from "../db/schema";
import { conflict, DomainError, forbidden, isUniqueViolation, notFound } from "../errors";
import type { Requester } from "../http";
import { getBookDetail } from "./queries";

// Scritture sul catalogo: policy → un solo batch atomico (modifica + registro).
// D1 non ha lock di riga: dove conta il numero di copie, la condizione sta nell'istruzione stessa.

type NamedLocation = LocationRef & { name: string };

async function requireLocation(db: Db, id: string): Promise<NamedLocation> {
  const row = await db.get<{ id: string; name: string; archived_at: string | null } | undefined>(
    sql`SELECT id, name, archived_at FROM location WHERE id = ${id}`,
  );
  if (!row) throw notFound("Sede");
  return { id: row.id, name: row.name, archived: row.archived_at !== null };
}

interface CopyContext {
  bookId: string;
  location: NamedLocation;
  shelf: string | null;
  notes: string | null;
  copyCount: number;
}

interface CopyRow {
  book_id: string;
  location_id: string;
  name: string;
  archived_at: string | null;
  shelf: string | null;
  notes: string | null;
  copy_count: number;
}

async function requireCopy(db: Db, copyId: string): Promise<CopyContext> {
  const row = await db.get<CopyRow | undefined>(sql`
    SELECT c.book_id, c.location_id, l.name, l.archived_at, c.shelf, c.notes,
           (SELECT count(*) FROM copy x WHERE x.book_id = c.book_id) AS copy_count
    FROM copy c JOIN location l ON l.id = c.location_id WHERE c.id = ${copyId}`);
  if (!row) throw notFound("Copia");
  return {
    bookId: row.book_id,
    location: { id: row.location_id, name: row.name, archived: row.archived_at !== null },
    shelf: row.shelf,
    notes: row.notes,
    copyCount: row.copy_count,
  };
}

async function requireBook(db: Db, bookId: string): Promise<void> {
  const row = await db.get(sql`SELECT 1 AS ok FROM book WHERE id = ${bookId}`);
  if (!row) throw notFound("Libro");
}

/** Controllo anticipato (prima di scaricare la copertina): può creare un libro in questa sede? */
export async function assertCanCreateIn(db: Db, who: Requester, locationId: string): Promise<NamedLocation> {
  const location = await requireLocation(db, locationId);
  if (!can(who.actor, { type: "copy.create", location })) throw forbidden();
  return location;
}

export async function createBookWithCopy(db: Db, who: Requester, input: NewBookInput, coverKey: string | null = null): Promise<{ bookId: string; copyId: string }> {
  const location = await assertCanCreateIn(db, who, input.locationId);
  const bookId = crypto.randomUUID();
  const copyId = crypto.randomUUID();
  try {
    await runBatch(db, [
      db.insert(book).values({ id: bookId, ...input.book, genre: input.genre, source: input.source, coverKey, createdById: who.audit.id }),
      db.insert(copy).values({ id: copyId, bookId, locationId: location.id, ...input.copy, createdById: who.audit.id }),
      auditInsert(db, who.audit, {
        action: "book.create",
        entityType: "book",
        entityId: bookId,
        data: { ...input.book, genre: input.genre, source: input.source, location: location.name, copyId },
        ip: who.audit.ip,
      }),
    ]);
  } catch (error) {
    if (!isUniqueViolation(error) || !input.book.isbn13) throw error;
    const existing = await db.get<{ id: string } | undefined>(sql`SELECT id FROM book WHERE isbn13 = ${input.book.isbn13}`);
    throw new DomainError("CONFLICT", "Questo libro è già in catalogo: puoi aggiungerne una copia.", undefined, { bookId: existing?.id ?? "" });
  }
  return { bookId, copyId };
}

export async function addCopy(db: Db, who: Requester, bookId: string, input: AddCopyInput): Promise<{ copyId: string }> {
  await requireBook(db, bookId);
  const location = await requireLocation(db, input.locationId);
  if (!can(who.actor, { type: "copy.create", location })) throw forbidden();
  const copyId = crypto.randomUUID();
  await runBatch(db, [
    db.insert(copy).values({ id: copyId, bookId, locationId: location.id, ...input.copy, createdById: who.audit.id }),
    auditInsert(db, who.audit, { action: "copy.create", entityType: "copy", entityId: copyId, data: { bookId, location: location.name, ...input.copy }, ip: who.audit.ip }),
  ]);
  return { copyId };
}

export async function updateCopy(db: Db, who: Requester, copyId: string, details: CopyDetails): Promise<void> {
  const current = await requireCopy(db, copyId);
  if (!can(who.actor, { type: "copy.update", location: current.location })) throw forbidden();
  await runBatch(db, [
    db.update(copy).set(details).where(eq(copy.id, copyId)),
    auditInsert(db, who.audit, {
      action: "copy.update",
      entityType: "copy",
      entityId: copyId,
      data: { before: { shelf: current.shelf, notes: current.notes }, after: details },
      ip: who.audit.ip,
    }),
  ]);
}

export interface DeleteCopyResult {
  bookId: string;
  bookDeleted: boolean;
  coverKey: string | null;
}

const copiesChanged = () => conflict("Le copie di questo libro sono cambiate nel frattempo: ricarica e riprova.");

export async function deleteCopy(db: Db, who: Requester, copyId: string): Promise<DeleteCopyResult> {
  const current = await requireCopy(db, copyId);
  const isLastCopy = current.copyCount <= 1;
  if (!can(who.actor, { type: "copy.delete", location: current.location, isLastCopy })) throw forbidden();

  if (!isLastCopy) {
    // Elimina solo se resta almeno un'altra copia: due eliminazioni contemporanee non svuotano il libro.
    const othersRemain = sql`EXISTS (SELECT 1 FROM copy WHERE id = ${copyId}) AND (SELECT count(*) FROM copy WHERE book_id = ${current.bookId}) > 1`;
    const [, deleted] = await runBatch(db, [
      auditWhen(othersRemain, who.audit, { action: "copy.delete", entityType: "copy", entityId: copyId, data: { bookId: current.bookId, location: current.location.name }, ip: who.audit.ip }),
      sql`DELETE FROM copy WHERE id = ${copyId} AND ${othersRemain}`,
    ]);
    if (!changedRows(deleted)) throw copiesChanged();
    return { bookId: current.bookId, bookDeleted: false, coverKey: null };
  }

  // Ultima copia: si elimina il libro (solo admin), con un'istantanea completa nel registro.
  const snapshot = await getBookDetail(db, current.bookId);
  const stillLastCopy = sql`(SELECT count(*) FROM copy WHERE book_id = ${current.bookId} AND id = ${copyId}) = 1
    AND (SELECT count(*) FROM copy WHERE book_id = ${current.bookId}) = 1`;
  const [, deleted] = await runBatch(db, [
    auditWhen(stillLastCopy, who.audit, { action: "book.delete", entityType: "book", entityId: current.bookId, data: { ...snapshot }, ip: who.audit.ip }),
    sql`DELETE FROM book WHERE id = ${current.bookId} AND ${stillLastCopy}`,
  ]);
  if (!changedRows(deleted)) throw copiesChanged();
  return { bookId: current.bookId, bookDeleted: true, coverKey: snapshot.coverKey };
}

export async function moveCopy(db: Db, who: Requester, copyId: string, toLocationId: string): Promise<void> {
  const current = await requireCopy(db, copyId);
  const target = await requireLocation(db, toLocationId);
  if (!can(who.actor, { type: "copy.move", from: current.location, to: target })) throw forbidden();
  const movedAt = new Date().toISOString();
  // Sposta solo se la copia è ancora dove l'abbiamo vista (niente spostamenti incrociati):
  // registro e storico prima, con la stessa condizione, poi lo spostamento.
  const stillThere = sql`EXISTS (SELECT 1 FROM copy WHERE id = ${copyId} AND location_id = ${current.location.id})`;
  const [, , moved] = await runBatch(db, [
    auditWhen(stillThere, who.audit, { action: "copy.move", entityType: "copy", entityId: copyId, data: { bookId: current.bookId, from: current.location.name, to: target.name }, ip: who.audit.ip }),
    sql`INSERT INTO copy_movement (id, book_id, copy_id, from_location_id, to_location_id, moved_by_id, moved_at)
        SELECT ${crypto.randomUUID()}, ${current.bookId}, ${copyId}, ${current.location.id}, ${target.id}, ${who.audit.id}, ${movedAt}
        WHERE ${stillThere}`,
    sql`UPDATE copy SET location_id = ${target.id}, updated_at = ${movedAt} WHERE id = ${copyId} AND location_id = ${current.location.id}`,
  ]);
  if (!changedRows(moved)) throw conflict("La copia è stata spostata nel frattempo: ricarica e riprova.");
}

type BookSnapshot = { isbn13: string | null; title: string; authors: string[]; publishedYear: number | null; description: string | null; genre: GenreKey | null };

function parseAuthors(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((author): author is string => typeof author === "string") : [];
  } catch {
    return [];
  }
}

/** Dati del libro, genere e copertina: admin, o editor di una sede (attiva) in cui il libro ha una copia. */
export async function assertCanEditBook(db: Db, who: Requester, bookId: string): Promise<{ book: BookSnapshot; coverKey: string | null }> {
  const row = await db.get<(Omit<BookSnapshot, "authors"> & { authors: string; cover_key: string | null }) | undefined>(
    sql`SELECT isbn13, title, authors, published_year AS publishedYear, description, genre, cover_key FROM book WHERE id = ${bookId}`,
  );
  if (!row) throw notFound("Libro");
  const copyLocations = (
    await db.all<{ id: string; archived_at: string | null }>(
      sql`SELECT DISTINCT l.id, l.archived_at FROM copy c JOIN location l ON l.id = c.location_id WHERE c.book_id = ${bookId}`,
    )
  ).map((location) => ({ id: location.id, archived: location.archived_at !== null }));
  if (!can(who.actor, { type: "book.update", copyLocations })) throw forbidden();
  const { cover_key: coverKey, authors, ...rest } = row;
  return { book: { ...rest, authors: parseAuthors(authors) }, coverKey };
}

/** Campi cambiati, per il registro: { before, after } solo con quelli diversi. */
function changedFields(before: BookSnapshot, after: BookSnapshot): { before: Partial<BookSnapshot>; after: Partial<BookSnapshot> } {
  const keys = (Object.keys(after) as Array<keyof BookSnapshot>).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  return {
    before: Object.fromEntries(keys.map((key) => [key, before[key]])) as Partial<BookSnapshot>,
    after: Object.fromEntries(keys.map((key) => [key, after[key]])) as Partial<BookSnapshot>,
  };
}

/** Il libro ha ancora esattamente questi valori? (nessuno l'ha modificato dopo la lettura) */
function sameAs(snapshot: BookSnapshot): SQL {
  return sql`isbn13 IS ${snapshot.isbn13} AND title IS ${snapshot.title} AND authors IS ${JSON.stringify(snapshot.authors)}
    AND published_year IS ${snapshot.publishedYear} AND description IS ${snapshot.description} AND genre IS ${snapshot.genre}`;
}

/**
 * Modifica dei dati del libro (genere compreso, se indicato). Si applica solo se nessuno l'ha cambiato dopo la
 * lettura (altrimenti 409): così il registro, scritto solo se qualcosa cambia, riporta valori «prima» esatti.
 */
export async function updateBook(db: Db, who: Requester, bookId: string, data: BookUpdate): Promise<void> {
  const { book: before } = await assertCanEditBook(db, who, bookId);
  const after: BookSnapshot = { ...data, genre: data.genre === undefined ? before.genre : data.genre };
  const unchanged = sameAs(before);
  const changes = sql`EXISTS (SELECT 1 FROM book WHERE id = ${bookId} AND ${unchanged} AND NOT (${sameAs(after)}))`;
  try {
    const [, updated] = await runBatch(db, [
      auditWhen(changes, who.audit, { action: "book.update", entityType: "book", entityId: bookId, data: changedFields(before, after), ip: who.audit.ip }),
      db.update(book).set(after).where(and(eq(book.id, bookId), unchanged)),
    ]);
    if (!changedRows(updated)) throw conflict("Il libro è stato modificato nel frattempo: ricarica e riprova.");
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("Un altro libro ha già questo ISBN.");
    throw error;
  }
}

/** Nuova copertina (stesso permesso degli altri dati del libro). Restituisce la chiave precedente. */
export async function setBookCover(db: Db, who: Requester, bookId: string, coverKey: string): Promise<string | null> {
  const { coverKey: previous } = await assertCanEditBook(db, who, bookId);
  await runBatch(db, [
    db.update(book).set({ coverKey }).where(eq(book.id, bookId)),
    auditInsert(db, who.audit, { action: "book.update", entityType: "book", entityId: bookId, data: { cover: "nuova copertina" }, ip: who.audit.ip }),
  ]);
  return previous;
}
