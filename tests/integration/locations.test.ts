import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/errors";
import { createLocation, listLocations, setLocationArchived, updateLocation } from "@/server/locations/service";
import { makeUser } from "./fixtures";

describe("sedi", () => {
  it("l'admin crea, modifica nome e colore, archivia e riattiva; ogni passo è nel registro", async () => {
    const admin = await makeUser("ADMIN");

    const { id } = await createLocation(admin, { name: "  Casa al mare ", color: "AZZURRO" });
    await updateLocation(admin, id, { name: "Casa di Rimini", color: "TURCHESE" });
    await setLocationArchived(admin, id, true);
    await setLocationArchived(admin, id, true);
    await setLocationArchived(admin, id, false);

    const [location] = await listLocations();
    expect(location).toMatchObject({ name: "Casa di Rimini", color: "TURCHESE", archived: false, copyCount: 0 });
    const actions = (await prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } })).map((row) => row.action);
    expect(actions).toEqual(["location.create", "location.update", "location.archive", "location.restore"]);
  });

  it("rifiuta nomi duplicati ignorando maiuscole e accenti", async () => {
    const admin = await makeUser("ADMIN");
    await createLocation(admin, { name: "Città", color: "ROSSO" });

    await expect(createLocation(admin, { name: "citta", color: "VERDE" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("due sedi non possono avere lo stesso colore, anche se una è archiviata", async () => {
    const admin = await makeUser("ADMIN");
    const casa = await createLocation(admin, { name: "Casa", color: "ROSSO" });
    await setLocationArchived(admin, casa.id, true);
    const mare = await createLocation(admin, { name: "Mare", color: "BLU" });

    await expect(createLocation(admin, { name: "Montagna", color: "ROSSO" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("Casa"),
    });
    await expect(updateLocation(admin, mare.id, { name: "Mare", color: "ROSSO" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("una sede può tenere il proprio colore quando cambia solo il nome", async () => {
    const admin = await makeUser("ADMIN");
    const { id } = await createLocation(admin, { name: "Casa", color: "VIOLA" });

    await updateLocation(admin, id, { name: "Casa grande", color: "VIOLA" });

    expect((await prisma.location.findUniqueOrThrow({ where: { id } })).name).toBe("Casa grande");
  });

  it("rifiuta nomi vuoti e colori fuori dalla palette", async () => {
    const admin = await makeUser("ADMIN");

    await expect(createLocation(admin, { name: "   ", color: "ROSSO" })).rejects.toThrow();
    await expect(createLocation(admin, { name: "Casa", color: "FUCSIA" })).rejects.toThrow();
    expect(await prisma.location.count()).toBe(0);
  });

  it("elenca i colori disponibili e quelli già usati", async () => {
    const admin = await makeUser("ADMIN");
    await createLocation(admin, { name: "Casa", color: "ROSSO" });

    const locations = await listLocations();

    expect(locations.map((location) => location.color)).toEqual(["ROSSO"]);
  });

  it("editor e lettore non gestiscono le sedi", async () => {
    const editor = await makeUser("EDITOR");
    const reader = await makeUser("READER");

    for (const actor of [editor, reader]) {
      await expect(createLocation(actor, { name: "Mansarda", color: "ROSA" })).rejects.toBeInstanceOf(DomainError);
    }
    expect(await prisma.location.count()).toBe(0);
  });
});
