import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeUser } from "./fixtures";

// Produzione: REQUIRE_ADMIN_2FA=true. Gli admin senza 2FA possono solo andare al profilo ad attivarla,
// e non possono disattivarla. Gli altri ruoli restano liberi.

vi.mock("@/server/env", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/env")>();
  return { env: { ...original.env, REQUIRE_ADMIN_2FA: true } };
});

const getSession = vi.fn();
const redirect = vi.fn((path: string) => {
  throw new Error(`redirect:${path}`);
});
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));

const { requireUser, loadActor } = await import("@/server/actor");
const { auth } = await import("@/server/auth/auth");
const { hashPassword } = await import("@/server/auth/password");
const { prisma } = await import("@/server/db");

const ORIGIN = "http://localhost:3000";
const PASSWORD = "una-password-lunga-e-sicura";

beforeEach(() => {
  getSession.mockReset();
  redirect.mockClear();
});

async function withPassword(userId: string): Promise<void> {
  await prisma.account.create({ data: { accountId: userId, providerId: "credential", userId, password: await hashPassword(PASSWORD) } });
}

async function sessionCookie(email: string): Promise<string> {
  const response = await auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, "cf-connecting-ip": "203.0.113.77" },
      body: JSON.stringify({ email, password: PASSWORD }),
    }),
  );
  return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

describe("2FA obbligatoria per gli admin", () => {
  it("un admin senza 2FA viene mandato al profilo, che invece può aprire", async () => {
    const admin = await makeUser("ADMIN");
    vi.spyOn(auth.api, "getSession").mockResolvedValue({ user: { id: admin.id } } as never);

    expect((await loadActor(admin.id))?.mustEnable2fa).toBe(true);
    await expect(requireUser()).rejects.toThrow("redirect:/profilo?2fa=richiesta");
    expect((await requireUser({ allowPending2fa: true })).id).toBe(admin.id);
  });

  it("un admin senza 2FA non scarica il CSV né le copertine", async () => {
    const admin = await makeUser("ADMIN");
    vi.spyOn(auth.api, "getSession").mockResolvedValue({ user: { id: admin.id } } as never);
    const { GET: exportCsv } = await import("@/app/api/export/route");
    const { GET: cover } = await import("@/app/api/covers/[file]/route");

    expect((await exportCsv(new Request("http://localhost:3000/api/export"))).status).toBe(403);
    const coverResponse = await cover(new Request("http://localhost:3000/api/covers/x"), {
      params: Promise.resolve({ file: "00000000-0000-4000-8000-000000000000.webp" }),
    });
    expect(coverResponse.status).toBe(403);
  });

  it("editor e lettori non sono obbligati", async () => {
    const reader = await makeUser("READER");

    expect((await loadActor(reader.id))?.mustEnable2fa).toBe(false);
  });

  it("un admin non può disattivare la 2FA; un lettore sì", async () => {
    const admin = await makeUser("ADMIN", { email: "admin2fa@example.com" });
    const reader = await makeUser("READER", { email: "reader2fa@example.com" });
    await withPassword(admin.id);
    await withPassword(reader.id);

    const disable = async (email: string) =>
      auth.handler(
        new Request(`${ORIGIN}/api/auth/two-factor/disable`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: ORIGIN, cookie: await sessionCookie(email) },
          body: JSON.stringify({ password: PASSWORD }),
        }),
      );

    expect((await disable("admin2fa@example.com")).status).toBe(403);
    expect((await disable("reader2fa@example.com")).status).not.toBe(403);
  });
});
