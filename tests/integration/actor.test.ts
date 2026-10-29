import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeLocation, makeUser } from "./fixtures";

// getCurrentUser/requireUser con sessione simulata: ruolo e sedi arrivano sempre dal DB.

const getSession = vi.fn();
const redirect = vi.fn((path: string) => {
  throw new Error(`redirect:${path}`);
});
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "cf-connecting-ip": "203.0.113.9" }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: { getSession: () => getSession() } } }));

const { getClientIp, getCurrentUser, requireUser } = await import("@/server/actor");
const { prisma } = await import("@/server/db");

beforeEach(() => {
  getSession.mockReset();
  redirect.mockClear();
});

describe("utente corrente", () => {
  it("senza sessione restituisce null e requireUser manda all'accesso", async () => {
    getSession.mockResolvedValue(null);

    expect(await getCurrentUser()).toBeNull();
    await expect(requireUser()).rejects.toThrow("redirect:/accedi");
  });

  it("ricarica ruolo e sedi dal DB a ogni richiesta", async () => {
    const casa = await makeLocation("Casa");
    const editor = await makeUser("EDITOR", { editorOf: [casa.id] });
    getSession.mockResolvedValue({ user: { id: editor.id } });

    expect((await requireUser()).editorLocationIds.has(casa.id)).toBe(true);

    await prisma.user.update({ where: { id: editor.id }, data: { role: "READER" } });
    expect((await getCurrentUser())?.role).toBe("READER");

    await prisma.user.update({ where: { id: editor.id }, data: { active: false } });
    expect(await getCurrentUser()).toBeNull();
  });

  it("legge l'IP del client da CF-Connecting-IP", async () => {
    expect(await getClientIp()).toBe("203.0.113.9");
  });
});
