import { describe, expect, it } from "vitest";
import { loadActor } from "@/server/actor";
import { addCopy, createBookWithCopy, deleteCopy, updateCopy } from "@/server/catalog/mutations";
import { getBookDetail, searchBooks } from "@/server/catalog/queries";
import { setReading } from "@/server/catalog/readings";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/errors";
import { bookData, makeLocation, makeUser, noCopyDetails } from "./fixtures";

// Servizi del catalogo contro Postgres reale: permessi per ruolo, concorrenza, ricerca, audit.

async function expectDomainError(promise: Promise<unknown>, code: DomainError["code"]): Promise<DomainError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
  return error as DomainError;
}

async function setup() {
  const casa = await makeLocation("Casa");
  const mare = await makeLocation("Mare");
  const vecchia = await makeLocation("Vecchia casa", true);
  const admin = await makeUser("ADMIN");
  const editorCasa = await makeUser("EDITOR", { editorOf: [casa.id] });
  const reader = await makeUser("READER");
  return { casa, mare, vecchia, admin, editorCasa, reader };
}

function newBook(locationId: string, overrides = {}) {
  return { book: bookData(overrides), source: "MANUAL" as const, coverPath: null, locationId, copy: noCopyDetails };
}

describe("creazione di libro e prima copia", () => {
  it("l'editor crea un libro nella propria sede e l'operazione finisce nel registro", async () => {
    const { casa, editorCasa } = await setup();

    const { bookId } = await createBookWithCopy(editorCasa, newBook(casa.id, { isbn13: "9788804668237" }));

    const book = await prisma.book.findUniqueOrThrow({ where: { id: bookId }, include: { copies: true } });
    expect(book.copies).toHaveLength(1);
    expect(book.searchText).toContain("calvino");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: bookId } });
    expect(audit.action).toBe("book.create");
    expect(audit.actorId).toBe(editorCasa.id);
  });

  it("l'editor non può creare in una sede non sua e non viene scritto nulla", async () => {
    const { mare, editorCasa } = await setup();

    await expectDomainError(createBookWithCopy(editorCasa, newBook(mare.id)), "FORBIDDEN");

    expect(await prisma.book.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("nessuno crea in una sede archiviata, il lettore in nessuna sede", async () => {
    const { casa, vecchia, admin, reader } = await setup();

    await expectDomainError(createBookWithCopy(admin, newBook(vecchia.id)), "FORBIDDEN");
    await expectDomainError(createBookWithCopy(reader, newBook(casa.id)), "FORBIDDEN");
  });

  it("un ISBN già presente propone di aggiungere una copia", async () => {
    const { casa, admin } = await setup();
    const first = await createBookWithCopy(admin, newBook(casa.id, { isbn13: "9788804668237" }));

    const error = await expectDomainError(createBookWithCopy(admin, newBook(casa.id, { isbn13: "9788804668237" })), "CONFLICT");

    expect(error.details?.bookId).toBe(first.bookId);
  });

  it("due inserimenti simultanei dello stesso ISBN creano un solo libro", async () => {
    const { casa, admin } = await setup();

    const results = await Promise.allSettled([
      createBookWithCopy(admin, newBook(casa.id, { isbn13: "9788804668237" })),
      createBookWithCopy(admin, newBook(casa.id, { isbn13: "9788804668237" })),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.book.count()).toBe(1);
  });
});

describe("copie", () => {
  it("aggiunta e modifica rispettano la sede dell'editor", async () => {
    const { casa, mare, admin, editorCasa } = await setup();
    const { bookId } = await createBookWithCopy(admin, newBook(mare.id));
    const mareCopy = await prisma.copy.findFirstOrThrow({ where: { bookId } });

    const { copyId } = await addCopy(editorCasa, bookId, { locationId: casa.id, copy: { shelf: "Studio", notes: null } });
    await updateCopy(editorCasa, copyId, { shelf: "Salotto", notes: "Regalo di Natale" });

    expect((await prisma.copy.findUniqueOrThrow({ where: { id: copyId } })).shelf).toBe("Salotto");
    await expectDomainError(updateCopy(editorCasa, mareCopy.id, noCopyDetails), "FORBIDDEN");
    await expectDomainError(addCopy(editorCasa, bookId, { locationId: mare.id, copy: noCopyDetails }), "FORBIDDEN");
  });

  it("l'editor elimina una copia ma non l'ultima; l'admin sì, con istantanea nel registro", async () => {
    const { casa, admin, editorCasa } = await setup();
    const { bookId } = await createBookWithCopy(editorCasa, newBook(casa.id));
    const { copyId } = await addCopy(editorCasa, bookId, { locationId: casa.id, copy: noCopyDetails });
    await setReading(editorCasa, bookId, editorCasa.id, true);

    expect((await deleteCopy(editorCasa, copyId)).bookDeleted).toBe(false);
    const lastCopy = await prisma.copy.findFirstOrThrow({ where: { bookId } });
    await expectDomainError(deleteCopy(editorCasa, lastCopy.id), "FORBIDDEN");

    expect((await deleteCopy(admin, lastCopy.id)).bookDeleted).toBe(true);
    expect(await prisma.book.count()).toBe(0);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "book.delete" } });
    expect(JSON.stringify(audit.data)).toContain(editorCasa.id);
  });

  it("due eliminazioni simultanee non lasciano un libro senza copie", async () => {
    const { casa, editorCasa } = await setup();
    const { bookId } = await createBookWithCopy(editorCasa, newBook(casa.id));
    await addCopy(editorCasa, bookId, { locationId: casa.id, copy: noCopyDetails });
    const copies = await prisma.copy.findMany({ where: { bookId } });

    const results = await Promise.allSettled(copies.map((copy) => deleteCopy(editorCasa, copy.id)));

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.copy.count({ where: { bookId } })).toBe(1);
  });

  it("in una sede archiviata solo l'admin modifica le copie", async () => {
    const { casa, admin, editorCasa } = await setup();
    const { bookId } = await createBookWithCopy(admin, newBook(casa.id));
    const copy = await prisma.copy.findFirstOrThrow({ where: { bookId } });
    await prisma.location.update({ where: { id: casa.id }, data: { archivedAt: new Date() } });

    await expectDomainError(updateCopy(editorCasa, copy.id, noCopyDetails), "FORBIDDEN");
    await updateCopy(admin, copy.id, { shelf: "Scatola 2", notes: null });
  });
});

describe("ricerca", () => {
  it("trova per titolo senza accenti, per autore, per ISBN con trattini e filtra per sede", async () => {
    const { casa, mare, admin } = await setup();
    await createBookWithCopy(admin, newBook(casa.id, { title: "Perché leggere i classici", authors: ["Italo Calvino"], isbn13: "9788804668237" }));
    await createBookWithCopy(admin, newBook(mare.id, { title: "La coscienza di Zeno", authors: ["Italo Svevo"] }));

    expect((await searchBooks({ query: "perche" })).items.map((b) => b.title)).toEqual(["Perché leggere i classici"]);
    expect((await searchBooks({ query: "italo" })).total).toBe(2);
    expect((await searchBooks({ query: "978-88-04-66823-7" })).total).toBe(1);
    expect((await searchBooks({ query: "italo", locationId: mare.id })).items[0]?.title).toBe("La coscienza di Zeno");
    expect((await searchBooks({ query: "100%" })).total).toBe(0);
  });

  it("pagina i risultati per 24", async () => {
    const { casa, admin } = await setup();
    for (let index = 0; index < 30; index += 1) {
      await createBookWithCopy(admin, newBook(casa.id, { title: `Libro ${String(index).padStart(2, "0")}` }));
    }

    const second = await searchBooks({ page: 2 });

    expect(second.total).toBe(30);
    expect(second.pageCount).toBe(2);
    expect(second.items).toHaveLength(6);
    expect((await searchBooks({ page: 99 })).page).toBe(2);
  });
});

describe("letto da", () => {
  it("ognuno segna sé stesso, solo l'admin segna gli altri", async () => {
    const { casa, admin, editorCasa, reader } = await setup();
    const { bookId } = await createBookWithCopy(admin, newBook(casa.id));

    await setReading(reader, bookId, reader.id, true);
    await setReading(reader, bookId, reader.id, true);
    await expectDomainError(setReading(editorCasa, bookId, reader.id, false), "FORBIDDEN");
    await setReading(admin, bookId, editorCasa.id, true);

    const detail = await getBookDetail(bookId);
    expect(detail?.readings.map((r) => r.user.id).sort()).toEqual([editorCasa.id, reader.id].sort());
    expect(await prisma.auditLog.count({ where: { action: "reading.mark" } })).toBe(2);
  });
});

describe("attore e registro", () => {
  it("un utente disattivato non ottiene un attore", async () => {
    const user = await makeUser("ADMIN", { active: false });

    expect(await loadActor(user.id)).toBeNull();
  });

  it("il ruolo applicativo non può modificare né cancellare il registro", async () => {
    const { casa, admin } = await setup();
    await createBookWithCopy(admin, newBook(casa.id));

    await expect(prisma.$executeRaw`UPDATE "AuditLog" SET action = 'x'`).rejects.toThrow();
    await expect(prisma.$executeRaw`DELETE FROM "AuditLog"`).rejects.toThrow();
  });
});
