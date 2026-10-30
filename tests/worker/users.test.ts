import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSigningKey, type SigningKey } from "../helpers/access-token";
import { mockExternal, publishAccessKey, seedLocation, signedIn } from "./helpers";

// Gestione utenti (solo admin) e allineamento del gruppo Cloudflare Access con gli utenti attivi.

let key: SigningKey;
beforeAll(async () => {
  key = await createSigningKey();
  publishAccessKey(key);
});

type User = Awaited<ReturnType<typeof signedIn>>;
let casa: { id: string };
let mare: { id: string };
let admin: User;

const accessConfig = { CF_ACCOUNT_ID: "acc123", ACCESS_GROUP_ID: "grp456", CF_API_TOKEN: "token-di-prova" };

beforeEach(async () => {
  casa = await seedLocation("Casa", "ROSSO");
  mare = await seedLocation("Mare", "BLU");
  admin = await signedIn(key, { email: "admin@example.com", role: "ADMIN" });
  mockExternal((url) => (url.startsWith("https://api.cloudflare.com/") ? Response.json({ success: true, result: {} }) : undefined));
});

const userRow = (id: string) => env.DB.prepare("SELECT name, email, role, active, sessions_not_before FROM user WHERE id = ?").bind(id).first<Record<string, unknown>>();
const editorLinks = async (id: string) =>
  (await env.DB.prepare("SELECT location_id FROM location_editor WHERE user_id = ? ORDER BY location_id").bind(id).all<{ location_id: string }>()).results.map((row) => row.location_id);

describe("elenco e creazione", () => {
  it("solo l'admin vede l'elenco", async () => {
    const editor = await signedIn(key, { email: "editor@example.com", role: "EDITOR", editorOf: [casa.id] });
    expect((await editor.call("/users")).status).toBe(403);
    const list = (await (await admin.call("/users")).json()) as Array<{ email: string; locationIds: string[] }>;
    expect(list.map((user) => user.email)).toEqual(["admin@example.com", "editor@example.com"]);
    expect(list[1]?.locationIds).toEqual([casa.id]);
  });

  it("crea un editor con le sue sedi (email in minuscolo) e lo registra", async () => {
    const response = await admin.call("/users", { method: "POST", body: { email: " Anna@Example.COM ", name: "Anna", role: "EDITOR", locationIds: [casa.id, mare.id] } });
    expect(response.status).toBe(201);
    const { userId, accessSync } = (await response.json()) as { userId: string; accessSync: string };
    expect(await userRow(userId)).toMatchObject({ email: "anna@example.com", role: "EDITOR", active: 1 });
    expect(await editorLinks(userId)).toEqual([casa.id, mare.id].sort());
    expect(accessSync).toBe("not-configured");
  });

  it("le sedi contano solo per gli editor", async () => {
    const response = await admin.call("/users", { method: "POST", body: { email: "luca@example.com", name: "Luca", role: "READER", locationIds: [casa.id] } });
    const { userId } = (await response.json()) as { userId: string };
    expect(await editorLinks(userId)).toEqual([]);
  });

  it("email già usata: 409; dati non validi: 400", async () => {
    expect((await admin.call("/users", { method: "POST", body: { email: "admin@example.com", name: "Doppio", role: "READER", locationIds: [] } })).status).toBe(409);
    expect((await admin.call("/users", { method: "POST", body: { email: "non-una-email", name: "", role: "CAPO", locationIds: [] } })).status).toBe(400);
  });
});

describe("modifica", () => {
  it("cambia nome, ruolo e sedi", async () => {
    const editor = await signedIn(key, { email: "editor@example.com", role: "EDITOR", editorOf: [casa.id] });
    expect((await admin.call(`/users/${editor.id}`, { method: "PATCH", body: { name: "Editor Mare", role: "EDITOR", locationIds: [mare.id] } })).status).toBe(204);
    expect(await userRow(editor.id)).toMatchObject({ name: "Editor Mare", role: "EDITOR" });
    expect(await editorLinks(editor.id)).toEqual([mare.id]);
  });

  it("l'ultimo admin attivo non può essere declassato, neanche da sé stesso", async () => {
    const response = await admin.call(`/users/${admin.id}`, { method: "PATCH", body: { name: "Admin", role: "READER", locationIds: [] } });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Deve restare almeno un amministratore attivo." });
    expect(await userRow(admin.id)).toMatchObject({ role: "ADMIN" });
  });

  it("con un secondo admin attivo, il primo può diventare editor", async () => {
    await signedIn(key, { email: "admin2@example.com", role: "ADMIN" });
    expect((await admin.call(`/users/${admin.id}`, { method: "PATCH", body: { name: "Admin", role: "EDITOR", locationIds: [casa.id] } })).status).toBe(204);
  });
});

describe("attivazione e sessioni", () => {
  it("disattiva un utente (non entra più) e lo riattiva", async () => {
    const reader = await signedIn(key, { email: "lettore@example.com" });
    expect((await admin.call(`/users/${reader.id}/deactivate`, { method: "POST" })).status).toBe(200);
    expect((await reader.call("/me")).status).toBe(403);
    expect((await admin.call(`/users/${reader.id}/reactivate`, { method: "POST" })).status).toBe(200);
    expect(await userRow(reader.id)).toMatchObject({ active: 1 });
  });

  it("l'ultimo admin attivo non può essere disattivato", async () => {
    expect((await admin.call(`/users/${admin.id}/deactivate`, { method: "POST" })).status).toBe(409);
  });

  it("'esci da tutti i dispositivi': per sé stessi da chiunque, per gli altri solo dall'admin", async () => {
    const reader = await signedIn(key, { email: "lettore@example.com" });
    expect((await reader.call(`/users/${admin.id}/sign-out`, { method: "POST" })).status).toBe(403);
    expect((await reader.call("/me/sign-out", { method: "POST" })).status).toBe(204);
    expect((await userRow(reader.id))?.sessions_not_before).toEqual(expect.any(String));
    expect((await reader.call("/me")).status).toBe(401);
  });
});

describe("sincronizzazione con Cloudflare Access", () => {
  it("con la configurazione, il gruppo Access riceve le email di tutti gli utenti attivi", async () => {
    const requests: Array<{ url: string; method: string; auth: string | null; body: { include: Array<{ email: { email: string } }> } }> = [];
    mockExternal(() => undefined);
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith("https://api.cloudflare.com/")) {
        requests.push({ url, method: init?.method ?? "GET", auth: new Headers(init?.headers).get("Authorization"), body: JSON.parse(String(init?.body)) });
        return Response.json({ success: true, result: {} });
      }
      return realFetch(input, init);
    }) as typeof fetch;
    try {
      const response = await admin.call("/users", { method: "POST", body: { email: "anna@example.com", name: "Anna", role: "READER", locationIds: [] }, env: accessConfig });
      expect(await response.json()).toMatchObject({ accessSync: "ok" });
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ url: "https://api.cloudflare.com/client/v4/accounts/acc123/access/groups/grp456", method: "PUT", auth: "Bearer token-di-prova" });
    expect(requests[0]?.body.include.map((rule) => rule.email.email).sort()).toEqual(["admin@example.com", "anna@example.com"]);
  });

  it("se Cloudflare risponde con un errore l'utente resta creato e l'esito lo dice", async () => {
    mockExternal((url) => (url.startsWith("https://api.cloudflare.com/") ? Response.json({ success: false, errors: [{ message: "no" }] }, { status: 403 }) : undefined));
    const response = await admin.call("/users", { method: "POST", body: { email: "anna@example.com", name: "Anna", role: "READER", locationIds: [] }, env: accessConfig });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ accessSync: "failed" });
  });
});
