import { describe, expect, it } from "vitest";
import { addCopy, createBookWithCopy, moveCopy } from "@/server/catalog/mutations";
import { getBookDetail } from "@/server/catalog/queries";
import { prisma } from "@/server/db";
import { bookData, makeLocation, makeUser, noCopyDetails } from "./fixtures";

// Spostamento copie (regola del 29/10/2026): admin, oppure l'editor che ha inserito quella copia.

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
  it("chi ha inserito la copia la sposta anche in una sede in cui non è editor; resta lo storico", async () => {
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

  it("un altro editor non può spostarla, anche se è editor di entrambe le sedi", async () => {
    const { mare, altroEditor, copyId, casa } = await setup();

    await expect(moveCopy(altroEditor, copyId, mare.id)).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect((await prisma.copy.findUniqueOrThrow({ where: { id: copyId } })).locationId).toBe(casa.id);
    expect(await prisma.copyMovement.count()).toBe(0);
  });

  it("l'admin sposta qualsiasi copia", async () => {
    const { mare, admin, copyId } = await setup();

    await moveCopy(admin, copyId, mare.id);

    expect((await prisma.copy.findUniqueOrThrow({ where: { id: copyId } })).locationId).toBe(mare.id);
  });

  it("chi ha inserito una seconda copia sposta solo quella", async () => {
    const { casa, mare, altroEditor, bookId, copyId } = await setup();
    const second = await addCopy(altroEditor, bookId, { locationId: casa.id, copy: noCopyDetails });

    await moveCopy(altroEditor, second.copyId, mare.id);
    await expect(moveCopy(altroEditor, copyId, mare.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("niente spostamenti verso sedi archiviate o nella stessa sede", async () => {
    const { casa, vecchia, admin, copyId } = await setup();

    await expect(moveCopy(admin, copyId, vecchia.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(moveCopy(admin, copyId, casa.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("se chi l'ha inserita diventa lettore perde il permesso", async () => {
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
