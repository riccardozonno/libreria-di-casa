import { sql } from "drizzle-orm";
import { can } from "../../shared/policy";
import { auditWhen } from "../audit";
import { runBatch } from "../db/batch";
import type { Db } from "../db/client";
import { conflict, forbidden, notFound } from "../errors";
import type { Requester } from "../http";

// "Letto da": ognuno segna sé stesso, l'admin chiunque. Idempotente: il registro solo se cambia qualcosa.

export async function setReading(db: Db, who: Requester, bookId: string, userId: string, read: boolean): Promise<void> {
  if (!can(who.actor, { type: "reading.mark", targetUserId: userId })) throw forbidden();
  const bookExists = await db.get(sql`SELECT 1 AS ok FROM book WHERE id = ${bookId}`);
  if (!bookExists) throw notFound("Libro");
  if (read) {
    const userExists = await db.get(sql`SELECT 1 AS ok FROM user WHERE id = ${userId}`);
    if (!userExists) throw notFound("Utente");
  }

  // «Letto» chiude «Sto leggendo»: il registro lo dice nella stessa riga.
  const wasReading = read && (await db.get(sql`SELECT 1 AS ok FROM book_current_reading WHERE user_id = ${userId} AND book_id = ${bookId}`)) !== undefined;

  // Registro prima, con la stessa condizione della modifica: niente righe per operazioni nulle.
  const exists = sql`EXISTS (SELECT 1 FROM book_reading WHERE user_id = ${userId} AND book_id = ${bookId})`;
  const data = wasReading ? { userId, wasReading } : { userId };
  const entry = { action: read ? "reading.mark" : "reading.unmark", entityType: "reading" as const, entityId: bookId, data, ip: who.audit.ip };
  await runBatch(db, read
    ? [
        auditWhen(sql`NOT ${exists}`, who.audit, entry),
        sql`INSERT OR IGNORE INTO book_reading (user_id, book_id, marked_by_id) VALUES (${userId}, ${bookId}, ${who.audit.id})`,
        sql`DELETE FROM book_current_reading WHERE user_id = ${userId} AND book_id = ${bookId}`,
      ]
    : [auditWhen(exists, who.audit, entry), sql`DELETE FROM book_reading WHERE user_id = ${userId} AND book_id = ${bookId}`]);
}

/** «Sto leggendo»: stesse regole di «Letto»; mai su un libro già letto. Idempotente. */
export async function setCurrentReading(db: Db, who: Requester, bookId: string, userId: string, reading: boolean): Promise<void> {
  if (!can(who.actor, { type: "reading.mark", targetUserId: userId })) throw forbidden();
  const bookExists = await db.get(sql`SELECT 1 AS ok FROM book WHERE id = ${bookId}`);
  if (!bookExists) throw notFound("Libro");

  const current = sql`EXISTS (SELECT 1 FROM book_current_reading WHERE user_id = ${userId} AND book_id = ${bookId})`;
  const entry = { action: reading ? "reading.start" : "reading.stop", entityType: "reading" as const, entityId: bookId, data: { userId }, ip: who.audit.ip };
  if (!reading) {
    await runBatch(db, [auditWhen(current, who.audit, entry), sql`DELETE FROM book_current_reading WHERE user_id = ${userId} AND book_id = ${bookId}`]);
    return;
  }

  const userExists = await db.get(sql`SELECT 1 AS ok FROM user WHERE id = ${userId}`);
  if (!userExists) throw notFound("Utente");
  const alreadyRead = sql`EXISTS (SELECT 1 FROM book_reading WHERE user_id = ${userId} AND book_id = ${bookId})`;
  if (await db.get(sql`SELECT 1 AS ok WHERE ${alreadyRead}`)) throw conflict("Questo libro risulta già letto.");

  // La stessa condizione nel batch: un «Letto» arrivato nel frattempo vince, mai entrambi.
  await runBatch(db, [
    auditWhen(sql`NOT ${current} AND NOT ${alreadyRead}`, who.audit, entry),
    sql`INSERT OR IGNORE INTO book_current_reading (user_id, book_id, marked_by_id)
        SELECT ${userId}, ${bookId}, ${who.audit.id} WHERE NOT ${alreadyRead}`,
  ]);
}

/** Voto 1–5 (o null per toglierlo) di chi ha letto il libro, solo per sé. Il registro solo se cambia. */
export async function setRating(db: Db, who: Requester, bookId: string, userId: string, rating: number | null): Promise<void> {
  if (!can(who.actor, { type: "reading.rate", targetUserId: userId })) throw forbidden();
  const bookExists = await db.get(sql`SELECT 1 AS ok FROM book WHERE id = ${bookId}`);
  if (!bookExists) throw notFound("Libro");
  const reading = await db.get(sql`SELECT 1 AS ok FROM book_reading WHERE user_id = ${userId} AND book_id = ${bookId}`);
  if (!reading) throw conflict("Segna prima il libro come letto.");

  const changes = sql`EXISTS (SELECT 1 FROM book_reading WHERE user_id = ${userId} AND book_id = ${bookId} AND rating IS NOT ${rating})`;
  const entry = { action: "reading.rate", entityType: "reading" as const, entityId: bookId, data: { userId, rating }, ip: who.audit.ip };
  await runBatch(db, [
    auditWhen(changes, who.audit, entry),
    sql`UPDATE book_reading SET rating = ${rating} WHERE user_id = ${userId} AND book_id = ${bookId}`,
  ]);
}
