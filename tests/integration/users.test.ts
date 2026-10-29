import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  createAccountLink,
  createUser,
  listUsers,
  resetTwoFactor,
  setUserActive,
  updateUser,
} from "@/server/users/service";
import { makeLocation, makeUser } from "./fixtures";

// Gestione utenti (solo admin): invito, ruolo e sedi, disattivazione, link, 2FA, ultimo admin.

describe("gestione utenti", () => {
  it("l'admin crea un editor con le sue sedi e ottiene il link d'invito; tutto nel registro", async () => {
    const admin = await makeUser("ADMIN");
    const casa = await makeLocation("Casa");

    const { userId, link } = await createUser(admin, { name: "Elio", email: "  Elio@Example.com ", role: "EDITOR", locationIds: [casa.id] });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { editorOf: true } });
    expect(user).toMatchObject({ email: "elio@example.com", role: "EDITOR", active: true });
    expect(user.editorOf.map((link) => link.locationId)).toEqual([casa.id]);
    expect(link.url).toContain("/imposta-password?token=");
    expect(await prisma.auditLog.count({ where: { action: "user.create", entityId: userId } })).toBe(1);
  });

  it("rifiuta email già usate e dati non validi", async () => {
    const admin = await makeUser("ADMIN", { email: "anna@example.com" });

    await expect(createUser(admin, { name: "Anna 2", email: "ANNA@example.com", role: "READER", locationIds: [] })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(createUser(admin, { name: "", email: "x@example.com", role: "READER", locationIds: [] })).rejects.toThrow();
    await expect(createUser(admin, { name: "X", email: "non-una-email", role: "READER", locationIds: [] })).rejects.toThrow();
  });

  it("le sedi si salvano solo per gli editor", async () => {
    const admin = await makeUser("ADMIN");
    const casa = await makeLocation("Casa");

    const { userId } = await createUser(admin, { name: "Lia", email: "lia@example.com", role: "READER", locationIds: [casa.id] });

    expect(await prisma.locationEditor.count({ where: { userId } })).toBe(0);
  });

  it("cambia ruolo e sedi; ogni cambiamento è registrato", async () => {
    const admin = await makeUser("ADMIN");
    const casa = await makeLocation("Casa");
    const mare = await makeLocation("Mare");
    const target = await makeUser("EDITOR", { editorOf: [casa.id] });

    await updateUser(admin, target.id, { name: "Nuovo nome", role: "EDITOR", locationIds: [mare.id] });
    await updateUser(admin, target.id, { name: "Nuovo nome", role: "READER", locationIds: [mare.id] });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: target.id }, include: { editorOf: true } });
    expect(user).toMatchObject({ name: "Nuovo nome", role: "READER" });
    expect(user.editorOf).toEqual([]);
    const actions = (await prisma.auditLog.findMany({ where: { entityId: target.id }, orderBy: { createdAt: "asc" } })).map((row) => row.action);
    expect(actions).toEqual(["user.locations_change", "user.role_change"]);
  });

  it("disattivare revoca subito sessioni e link aperti; riattivare funziona", async () => {
    const admin = await makeUser("ADMIN");
    const { userId } = await createUser(admin, { name: "Elio", email: "elio@example.com", role: "READER", locationIds: [] });
    await prisma.session.create({ data: { userId, token: "t1", expiresAt: new Date(Date.now() + 3_600_000) } });

    await setUserActive(admin, userId, false);

    expect(await prisma.session.count({ where: { userId } })).toBe(0);
    expect(await prisma.verification.count({ where: { value: userId } })).toBe(0);
    await expect(createAccountLink(admin, userId, "reset")).rejects.toThrow();
    await setUserActive(admin, userId, true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).active).toBe(true);
  });

  it("genera link di reset e azzera la 2FA di chi ha perso il telefono", async () => {
    const admin = await makeUser("ADMIN");
    const target = await makeUser("READER");
    await prisma.user.update({ where: { id: target.id }, data: { twoFactorEnabled: true } });
    await prisma.twoFactor.create({ data: { userId: target.id, secret: "segreto-cifrato", backupCodes: "codici" } });

    const link = await createAccountLink(admin, target.id, "reset");
    await resetTwoFactor(admin, target.id);

    expect(link.url).toContain("token=");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).twoFactorEnabled).toBe(false);
    expect(await prisma.twoFactor.count({ where: { userId: target.id } })).toBe(0);
    const actions = (await prisma.auditLog.findMany({ where: { entityId: target.id } })).map((row) => row.action).sort();
    expect(actions).toEqual(["user.2fa_reset", "user.reset_link"]);
  });

  it("l'ultimo admin attivo non può essere declassato né disattivato", async () => {
    const admin = await makeUser("ADMIN");

    await expect(updateUser(admin, admin.id, { name: admin.name, role: "EDITOR", locationIds: [] })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(setUserActive(admin, admin.id, false)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("con due admin, due declassamenti simultanei non lasciano l'app senza admin", async () => {
    const anna = await makeUser("ADMIN");
    const bruno = await makeUser("ADMIN");

    const results = await Promise.allSettled([
      updateUser(anna, bruno.id, { name: bruno.name, role: "READER", locationIds: [] }),
      updateUser(bruno, anna.id, { name: anna.name, role: "READER", locationIds: [] }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.user.count({ where: { role: "ADMIN", active: true } })).toBe(1);
  });

  it("elenca gli utenti con ruolo, sedi e stato", async () => {
    const admin = await makeUser("ADMIN");
    const casa = await makeLocation("Casa");
    await makeUser("EDITOR", { editorOf: [casa.id] });

    const users = await listUsers(admin);

    expect(users).toHaveLength(2);
    expect(users.find((user) => user.role === "EDITOR")?.locationIds).toEqual([casa.id]);
  });

  it("editor e lettori non gestiscono gli utenti", async () => {
    const editor = await makeUser("EDITOR");
    const reader = await makeUser("READER");

    for (const actor of [editor, reader]) {
      await expect(listUsers(actor)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(createUser(actor, { name: "X", email: "x@example.com", role: "ADMIN", locationIds: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(setUserActive(actor, editor.id, false)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
});
