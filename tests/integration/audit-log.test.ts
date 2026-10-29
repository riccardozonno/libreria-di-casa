import { describe, expect, it } from "vitest";
import { listAuditEntries } from "@/server/audit-log";
import { createLocation } from "@/server/locations/service";
import { createUser } from "@/server/users/service";
import { makeUser } from "./fixtures";

describe("registro attività", () => {
  it("l'admin lo consulta dal più recente, con filtro per categoria e paginazione", async () => {
    const admin = await makeUser("ADMIN");
    await createLocation(admin, { name: "Casa", color: "ROSSO" });
    await createUser(admin, { name: "Elio", email: "elio@example.com", role: "READER", locationIds: [] });
    await createLocation(admin, { name: "Mare", color: "BLU" });

    const all = await listAuditEntries(admin, { page: 1 });
    const onlyLocations = await listAuditEntries(admin, { page: 1, category: "location" });

    expect(all.items.map((item) => item.action)).toEqual(["location.create", "user.create", "location.create"]);
    expect(all.items[0]).toMatchObject({ actorName: admin.name, actorEmail: admin.email });
    expect(onlyLocations.total).toBe(2);
  });

  it("solo l'admin lo consulta", async () => {
    const editor = await makeUser("EDITOR");

    await expect(listAuditEntries(editor, { page: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
