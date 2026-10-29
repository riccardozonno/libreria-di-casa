import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/errors";
import { createLocation, listLocations, renameLocation, setLocationArchived } from "@/server/locations/service";
import { makeUser } from "./fixtures";

describe("sedi", () => {
  it("l'admin crea, rinomina, archivia e riattiva; ogni passo è nel registro", async () => {
    const admin = await makeUser("ADMIN");

    const { id } = await createLocation(admin, "  Casa al mare ");
    await renameLocation(admin, id, "Casa di Rimini");
    await setLocationArchived(admin, id, true);
    await setLocationArchived(admin, id, true);
    await setLocationArchived(admin, id, false);

    const [location] = await listLocations();
    expect(location).toMatchObject({ name: "Casa di Rimini", archived: false, copyCount: 0 });
    const actions = (await prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } })).map((row) => row.action);
    expect(actions).toEqual(["location.create", "location.rename", "location.archive", "location.restore"]);
  });

  it("rifiuta nomi duplicati ignorando maiuscole e accenti", async () => {
    const admin = await makeUser("ADMIN");
    await createLocation(admin, "Città");

    await expect(createLocation(admin, "citta")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rifiuta nomi vuoti", async () => {
    const admin = await makeUser("ADMIN");

    await expect(createLocation(admin, "   ")).rejects.toThrow();
  });

  it("editor e lettore non gestiscono le sedi", async () => {
    const editor = await makeUser("EDITOR");
    const reader = await makeUser("READER");

    for (const actor of [editor, reader]) {
      await expect(createLocation(actor, "Mansarda")).rejects.toBeInstanceOf(DomainError);
    }
    expect(await prisma.location.count()).toBe(0);
  });
});
