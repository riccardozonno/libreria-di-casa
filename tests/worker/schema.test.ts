import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { toFtsQuery } from "../../shared/text";
import { auditInsert } from "../../worker/audit";
import { auditLog, book, copy, location } from "../../worker/db/schema";
import { db, seedLocation, seedUser } from "./helpers";

// Vincoli del database: la difesa che resta anche se il codice dell'app sbagliasse.

async function search(query: string): Promise<string[]> {
  const match = toFtsQuery(query);
  const { results } = await env.DB.prepare("SELECT b.title FROM book_fts JOIN book b ON b.seq = book_fts.rowid WHERE book_fts MATCH ? ORDER BY rank")
    .bind(match)
    .all<{ title: string }>();
  return results.map((row) => row.title);
}

const run = (statement: string) => env.DB.prepare(statement).run();

describe("vincoli", () => {
  it("email utente solo in minuscolo, ruolo solo tra quelli previsti", async () => {
    await expect(run("INSERT INTO user (id, email, name, role) VALUES ('u1', 'Anna@Example.com', 'Anna', 'READER')")).rejects.toThrow(/CHECK/);
    await expect(run("INSERT INTO user (id, email, name, role) VALUES ('u2', 'anna@example.com', 'Anna', 'SUPERUSER')")).rejects.toThrow(/CHECK/);
  });

  it("colore della sede unico e solo dalla palette", async () => {
    await seedLocation("Casa", "ROSSO");
    await expect(seedLocation("Mare", "ROSSO")).rejects.toThrow();
    await expect(run("INSERT INTO location (id, name, name_key, color) VALUES ('l1', 'X', 'x', 'FUCSIA')")).rejects.toThrow(/CHECK/);
  });

  it("ISBN solo di 13 cifre e autori sempre come lista JSON", async () => {
    await expect(run("INSERT INTO book (id, title, isbn13, source) VALUES ('b1', 'X', '97888-0466823', 'MANUAL')")).rejects.toThrow(/CHECK/);
    await expect(run("INSERT INTO book (id, title, authors, source) VALUES ('b2', 'X', '\"Calvino\"', 'MANUAL')")).rejects.toThrow(/CHECK/);
  });

  it("eliminare un libro elimina le sue copie; una sede con copie non si elimina", async () => {
    const casa = await seedLocation("Casa", "ROSSO");
    const [created] = await db().insert(book).values({ title: "Il barone rampante", authors: ["Italo Calvino"], source: "MANUAL" }).returning();
    await db().insert(copy).values({ bookId: created!.id, locationId: casa.id });
    await expect(db().delete(location).where(eq(location.id, casa.id))).rejects.toThrow();
    await db().delete(book).where(eq(book.id, created!.id));
    expect(await db().select().from(copy).all()).toHaveLength(0);
  });
});

describe("ricerca FTS5", () => {
  it("trova titolo e autori senza accenti; segue modifiche e cancellazioni", async () => {
    const [created] = await db().insert(book).values({ title: "Perché la città", authors: ["Niccolò Ammaniti"], source: "MANUAL" }).returning();
    expect(await search("perche citta")).toEqual(["Perché la città"]);
    expect(await search("niccolo")).toEqual(["Perché la città"]);

    await db().update(book).set({ title: "Io non ho paura" }).where(eq(book.id, created!.id));
    expect(await search("perche")).toEqual([]);
    expect(await search("paura")).toEqual(["Io non ho paura"]);

    await db().delete(book).where(eq(book.id, created!.id));
    expect(await search("paura")).toEqual([]);
  });
});

describe("registro attività", () => {
  it("è in sola aggiunta: modifiche e cancellazioni sono rifiutate", async () => {
    await auditInsert(db(), null, { action: "test", entityType: "book" });
    await expect(run("UPDATE audit_log SET action = 'manomesso'")).rejects.toThrow(/sola aggiunta/);
    await expect(run("DELETE FROM audit_log")).rejects.toThrow(/sola aggiunta/);
  });

  it("si scrive nello stesso batch della modifica: se una parte fallisce non resta nulla", async () => {
    const admin = await seedUser({ email: "admin@example.com", role: "ADMIN" });
    const actor = { id: admin.id, email: admin.email };
    await db().insert(book).values({ title: "Primo", isbn13: "9788804668237", source: "MANUAL" });

    const auditRows = async () => (await db().select().from(auditLog).all()).length;
    const before = await auditRows();

    const duplicate = db().insert(book).values({ title: "Doppione", isbn13: "9788804668237", source: "MANUAL" });
    await expect(db().batch([auditInsert(db(), actor, { action: "book.create", entityType: "book" }), duplicate])).rejects.toThrow();
    expect(await auditRows()).toBe(before);
  });
});
