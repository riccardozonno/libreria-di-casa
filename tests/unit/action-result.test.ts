import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { DomainError } from "@/server/errors";

const getCurrentUser = vi.fn();
vi.mock("@/server/actor", () => ({ getCurrentUser: () => getCurrentUser() }));

const { toActionError, withUser } = await import("@/server/action-result");

const user = { id: "u1", role: "ADMIN", active: true, editorLocationIds: new Set<string>(), mustEnable2fa: false };

beforeEach(() => {
  getCurrentUser.mockReset();
});

describe("toActionError", () => {
  it("mostra il messaggio degli errori di dominio", () => {
    expect(toActionError(new DomainError("CONFLICT", "Esiste già.", { bookId: "b1" }), "test")).toEqual({
      ok: false,
      error: "Esiste già.",
      details: { bookId: "b1" },
    });
  });

  it("raccoglie gli errori di validazione per campo", () => {
    const result = z.object({ title: z.string().min(1, "Titolo obbligatorio") }).safeParse({ title: "" });
    expect(toActionError(result.error, "test")).toEqual({
      ok: false,
      error: "Controlla i campi evidenziati.",
      fieldErrors: { title: "Titolo obbligatorio" },
    });
  });

  it("nasconde i dettagli degli errori inattesi e li registra nei log", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = toActionError(new Error("password del db: segreta"), "test");
    expect(result).toEqual({ ok: false, error: "Qualcosa è andato storto. Riprova tra poco." });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("withUser", () => {
  it("rifiuta senza sessione", async () => {
    getCurrentUser.mockResolvedValue(null);
    const run = vi.fn();
    expect(await withUser("test", run)).toMatchObject({ ok: false, error: expect.stringContaining("Sessione scaduta") });
    expect(run).not.toHaveBeenCalled();
  });

  it("blocca gli admin che devono ancora attivare la 2FA", async () => {
    getCurrentUser.mockResolvedValue({ ...user, mustEnable2fa: true });
    expect(await withUser("test", vi.fn())).toMatchObject({ ok: false, error: expect.stringContaining("due passaggi") });
  });

  it("esegue l'azione e converte gli errori lanciati", async () => {
    getCurrentUser.mockResolvedValue(user);
    expect(await withUser("test", async () => ({ ok: true, data: 42 }))).toEqual({ ok: true, data: 42 });
    expect(
      await withUser("test", async () => {
        throw new DomainError("FORBIDDEN", "Non hai i permessi per questa operazione.");
      }),
    ).toEqual({ ok: false, error: "Non hai i permessi per questa operazione.", details: undefined });
  });
});
