import { describe, expect, it } from "vitest";
import { createBookWithCopy, moveCopy } from "@/server/catalog/mutations";
import { getBookDetail } from "@/server/catalog/queries";
import { prisma } from "@/server/db";
import { bookData, makeLocation, makeUser, noCopyDetails } from "./fixtures";

// Spostamento copie (regola del 29/10/2026, opzione B): admin, oppure un editor della sede di partenza.

async function setup() {
  const casa = await makeLocation("Casa");
  const mare = await makeLocation("Mare");
  const vecchia = await makeLocation("Vecchia casa", true);
  const admin = await makeUser("ADMIN");
  const autore = await makeUser("EDITOR", { editorOf: [casa.id] });
  const altroEditor = await makeUser("EDITOR", { editorOf: [casa.id, mare.id] });
  const { bookId } = await createBookWithCopy(autore, {
    book: bookData(),
    source: "MANUAL",
    coverPath: null,
    locationId: casa.id,
    copy: { shelf: "Studio", notes: null },
  });
  const copy = await prisma.copy.findFirstOrThrow({ where: { bookId } });
  return { casa, mare, vecchia, admin, autore, altroEditor, bookId, copyId: copy.id };
}

describe("spostamento delle copie", () => {
  it("l'editor della sede la sposta anche in una sede in cui non è editor; resta lo storico", async () => {
    const { mare, autore, bookId, copyId } = await setup();

    await moveCopy(autore, copyId, mare.id);

    const copy = await prisma.copy.findUniqueOrThrow({ where: { id: copyId } });
    expect(copy.locationId).toBe(mare.id);
    expect(copy.shelf).toBe("Studio");
    const detail = await getBookDetail(bookId);
    expect(detail?.movements).toHaveLength(1);
    expect(detail?.movements[0]).toMatchObject({ fromLocation: { name: "Casa" }, toLocation: { name: "Mare" }, movedBy: { name: autore.name } });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "copy.move" } });
    expect(audit).toMatchObject({ actorId: autore.id, entityId: copyId });
  });

  it("dopo lo spostamento la copia segue la sede: la gestiscono gli editor di arrivo, non più chi l'ha spostata", async () => {
    const { casa, mare, autore, altroEditor, copyId } = await setup();
    await moveCopy(autore, copyId, mare.id);

    await expect(moveCopy(autore, copyId, casa.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await moveCopy(altroEditor, copyId, casa.id);

    expect((await prisma.copy.findUniqueOrThrow({ where: { id: copyId } })).locationId).toBe(casa.id);
    expect(await prisma.copyMovement.count()).toBe(2);
  });

  it("un editor che non gestisce la sede di partenza non può spostarla", async () => {
    const { casa, mare, admin, altroEditor } = await setup();
    const soloMare = await makeUser("EDITOR", { editorOf: [mare.id] });
    const { bookId } = await createBookWithCopy(admin, { book: bookData({ title: "Altro" }), source: "MANUAL", coverPath: null, locationId: casa.id, copy: noCopyDetails });
    const copy = await prisma.copy.findFirstOrThrow({ where: { bookId } });

    await expect(moveCopy(soloMare, copy.id, mare.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await moveCopy(altroEditor, copy.id, mare.id);
  });

  it("l'admin sposta qualsiasi copia", async () => {
    const { mare, admin, copyId } = await setup();

    await moveCopy(admin, copyId, mare.id);

    expect((await prisma.copy.findUniqueOrThrow({ where: { id: copyId } })).locationId).toBe(mare.id);
  });

  it("niente spostamenti verso sedi archiviate o nella stessa sede", async () => {
    const { casa, vecchia, admin, copyId } = await setup();

    await expect(moveCopy(admin, copyId, vecchia.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(moveCopy(admin, copyId, casa.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("un editor diventato lettore perde il permesso", async () => {
    const { mare, autore, copyId } = await setup();
    await prisma.user.update({ where: { id: autore.id }, data: { role: "READER" } });

    await expect(moveCopy({ ...autore, role: "READER" }, copyId, mare.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("copia o sede inesistenti danno un errore chiaro", async () => {
    const { mare, admin, copyId } = await setup();

    await expect(moveCopy(admin, crypto.randomUUID(), mare.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(moveCopy(admin, copyId, crypto.randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
