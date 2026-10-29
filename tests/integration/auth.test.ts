import { describe, expect, it } from "vitest";
import { auth } from "@/server/auth/auth";
import { createInviteLink } from "@/server/auth/invite";
import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db";

// Autenticazione (ADR-0003): login, blocco, superficie disattivata, inviti/reset, argon2id.

const ORIGIN = "http://localhost:3000";
const GOOD_PASSWORD = "una-password-lunga-e-sicura";

let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter % 250}`;
}

async function call(path: string, body: unknown, ip = nextIp()): Promise<Response> {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, "cf-connecting-ip": ip },
      body: JSON.stringify(body),
    }),
  );
}

function signIn(email: string, password: string, ip?: string): Promise<Response> {
  return call("/sign-in/email", { email, password }, ip);
}

async function createUser(options: { email: string; password?: string; active?: boolean; role?: "ADMIN" | "EDITOR" | "READER" }) {
  const user = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      name: "Utente di prova",
      email: options.email,
      role: options.role ?? "READER",
      active: options.active ?? true,
    },
  });
  if (options.password) {
    await prisma.account.create({
      data: {
        id: crypto.randomUUID(),
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: await hashPassword(options.password),
      },
    });
  }
  return user;
}

describe("login", () => {
  it("accetta email e password corrette e imposta un cookie di sessione httpOnly", async () => {
    await createUser({ email: "anna@example.com", password: GOOD_PASSWORD });

    const response = await signIn("anna@example.com", GOOD_PASSWORD);

    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("session_token");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
  });

  it("risponde allo stesso modo per password errata ed email inesistente", async () => {
    await createUser({ email: "anna@example.com", password: GOOD_PASSWORD });

    const wrongPassword = await signIn("anna@example.com", "password-sbagliata-123");
    const unknownEmail = await signIn("nessuno@example.com", "password-sbagliata-123");

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(await unknownEmail.json()).toEqual(await wrongPassword.json());
  });

  it("rifiuta un utente disattivato anche con la password giusta", async () => {
    await createUser({ email: "ex@example.com", password: GOOD_PASSWORD, active: false });

    const response = await signIn("ex@example.com", GOOD_PASSWORD);

    expect(response.status).toBe(401);
    expect(await prisma.session.count()).toBe(0);
  });

  it("salva la password con argon2id", async () => {
    await createUser({ email: "anna@example.com", password: GOOD_PASSWORD });

    const account = await prisma.account.findFirstOrThrow();

    expect(account.password).toMatch(/^\$argon2id\$/);
  });
});

describe("blocco dopo tentativi falliti", () => {
  it("blocca l'account per 15 minuti dopo 5 errori, anche da IP diversi", async () => {
    await createUser({ email: "anna@example.com", password: GOOD_PASSWORD });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await signIn("anna@example.com", "password-sbagliata-123");
    }
    const blocked = await signIn("anna@example.com", GOOD_PASSWORD);

    expect(blocked.status).toBe(429);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "anna@example.com" } });
    expect(user.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
  });

  it("sblocca dopo la scadenza e azzera i tentativi con un login riuscito", async () => {
    const user = await createUser({ email: "anna@example.com", password: GOOD_PASSWORD });
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 3, lockedUntil: new Date(Date.now() - 1000) },
    });

    const response = await signIn("anna@example.com", GOOD_PASSWORD);

    expect(response.status).toBe(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.failedLoginCount).toBe(0);
    expect(after.lockedUntil).toBeNull();
  });

  it("limita i tentativi per IP", async () => {
    const ip = "198.51.100.7";
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await signIn(`utente${attempt}@example.com`, "password-sbagliata-123", ip);
      statuses.push(response.status);
    }

    expect(statuses).toContain(429);
  });
});

describe("superficie di Better Auth disattivata", () => {
  it.each(["/sign-up/email", "/update-user", "/change-email", "/delete-user", "/request-password-reset"])(
    "%s non è raggiungibile",
    async (path) => {
      const response = await call(path, { email: "x@example.com", password: GOOD_PASSWORD, name: "x", role: "ADMIN" });

      expect(response.status).toBe(404);
    },
  );

  it("rifiuta richieste da un'origine diversa", async () => {
    await createUser({ email: "anna@example.com", password: GOOD_PASSWORD });

    const response = await auth.handler(
      new Request(`${ORIGIN}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://attaccante.example", cookie: "x=1" },
        body: JSON.stringify({ email: "anna@example.com", password: GOOD_PASSWORD }),
      }),
    );

    expect(response.status).toBe(403);
  });
});

describe("inviti e reset con link monouso", () => {
  it("un nuovo utente imposta la password dal link e poi accede", async () => {
    const user = await createUser({ email: "nuovo@example.com" });

    const link = await createInviteLink(user.id);
    const token = new URL(link.url).searchParams.get("token")!;
    const reset = await call("/reset-password", { token, newPassword: GOOD_PASSWORD });

    expect(reset.status).toBe(200);
    expect((await signIn("nuovo@example.com", GOOD_PASSWORD)).status).toBe(200);
  });

  it("il link è valido 72 ore e punta all'URL pubblico configurato", async () => {
    const user = await createUser({ email: "nuovo@example.com" });

    const link = await createInviteLink(user.id);

    expect(link.url.startsWith("http://localhost:3000/imposta-password?token=")).toBe(true);
    const hours = (link.expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(71.9);
    expect(hours).toBeLessThanOrEqual(72);
  });

  it("il link si usa una volta sola", async () => {
    const user = await createUser({ email: "nuovo@example.com" });
    const token = new URL((await createInviteLink(user.id)).url).searchParams.get("token")!;

    await call("/reset-password", { token, newPassword: GOOD_PASSWORD });
    const second = await call("/reset-password", { token, newPassword: "un-altra-password-lunga" });

    expect(second.status).toBe(400);
  });

  it("nel database c'è solo l'hash del token", async () => {
    const user = await createUser({ email: "nuovo@example.com" });
    const token = new URL((await createInviteLink(user.id)).url).searchParams.get("token")!;

    const rows = await prisma.verification.findMany();

    expect(rows).toHaveLength(1);
    expect(rows[0]!.identifier).not.toContain(token);
  });

  it("rifiuta password più corte di 12 caratteri", async () => {
    const user = await createUser({ email: "nuovo@example.com" });
    const token = new URL((await createInviteLink(user.id)).url).searchParams.get("token")!;

    const response = await call("/reset-password", { token, newPassword: "corta12345" });

    expect(response.status).toBe(400);
  });

  it("il reset revoca le sessioni esistenti e azzera il blocco", async () => {
    const user = await createUser({ email: "anna@example.com", password: GOOD_PASSWORD });
    await signIn("anna@example.com", GOOD_PASSWORD);
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 4, lockedUntil: new Date(Date.now() + 600_000) } });
    const token = new URL((await createInviteLink(user.id)).url).searchParams.get("token")!;

    await call("/reset-password", { token, newPassword: "nuova-password-lunga-123" });

    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.failedLoginCount).toBe(0);
    expect(after.lockedUntil).toBeNull();
  });

  it("non genera link per utenti disattivati", async () => {
    const user = await createUser({ email: "ex@example.com", active: false });

    await expect(createInviteLink(user.id)).rejects.toThrow();
  });
});
