import { beforeAll, describe, expect, it } from "vitest";
import { createSigningKey, signAccessToken, type SigningKey } from "../helpers/access-token";
import { callApi, ORIGIN, publishAccessKey, seedLocation, seedUser } from "./helpers";

// Chi può usare l'API: identità firmata da Access + utente attivo nel nostro DB.

let key: SigningKey;
let otherKey: SigningKey;

beforeAll(async () => {
  [key, otherKey] = await Promise.all([createSigningKey("kid-test"), createSigningKey("kid-intruso")]);
  publishAccessKey(key);
});

const tokenFor = (email: string, overrides: Record<string, unknown> = {}) => signAccessToken(key, email, overrides);

describe("identità da Cloudflare Access", () => {
  it("senza token di Access: 401", async () => {
    const response = await callApi("/me");
    expect(response.status).toBe(401);
  });

  it("token valido ma email non abilitata nell'app: 403", async () => {
    const response = await callApi("/me", { token: await tokenFor("sconosciuto@example.com") });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Questo indirizzo email non è abilitato. Chiedi all'amministratore." });
  });

  it("utente attivo: /me restituisce ruolo e sedi (email confrontata in minuscolo)", async () => {
    const casa = await seedLocation("Casa", "ROSSO");
    const editor = await seedUser({ email: "anna@example.com", role: "EDITOR", editorOf: [casa.id] });
    const response = await callApi("/me", { token: await tokenFor("Anna@Example.com") });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: editor.id, email: "anna@example.com", name: "anna", role: "EDITOR", editorLocationIds: [casa.id] });
  });

  it("utente disattivato: 403", async () => {
    await seedUser({ email: "ex@example.com", active: false });
    const response = await callApi("/me", { token: await tokenFor("ex@example.com") });
    expect(response.status).toBe(403);
  });

  it("'esci da tutti i dispositivi': i token emessi prima non valgono più", async () => {
    await seedUser({ email: "luca@example.com", sessionsNotBefore: new Date(Date.now() + 60_000).toISOString() });
    expect((await callApi("/me", { token: await tokenFor("luca@example.com") })).status).toBe(401);
  });

  it("token emesso dopo la revoca: valido", async () => {
    await seedUser({ email: "sara@example.com", sessionsNotBefore: new Date(Date.now() - 3_600_000).toISOString() });
    expect((await callApi("/me", { token: await tokenFor("sara@example.com") })).status).toBe(200);
  });

  it("token per un'altra applicazione Access: 401", async () => {
    await seedUser({ email: "anna@example.com" });
    const response = await callApi("/me", { token: await tokenFor("anna@example.com", { aud: ["altra-app"] }) });
    expect(response.status).toBe(401);
  });

  it("token firmato da una chiave che Access non ha pubblicato: 401", async () => {
    await seedUser({ email: "anna@example.com" });
    const response = await callApi("/me", { token: await signAccessToken(otherKey, "anna@example.com") });
    expect(response.status).toBe(401);
  });
});

describe("Access non configurato (fail closed)", () => {
  const unconfigured = { ACCESS_TEAM_DOMAIN: "", ACCESS_AUD: "" };

  it("in produzione l'identità di sviluppo è ignorata: 503", async () => {
    await seedUser({ email: "dev@example.com", role: "ADMIN" });
    const response = await callApi("/me", { env: { ...unconfigured, ENVIRONMENT: "production", DEV_IDENTITY_EMAIL: "dev@example.com" } });
    expect(response.status).toBe(503);
  });

  it("in sviluppo, con DEV_IDENTITY_EMAIL, entra come quell'utente", async () => {
    await seedUser({ email: "dev@example.com", role: "ADMIN" });
    const response = await callApi("/me", { env: { ...unconfigured, ENVIRONMENT: "development", DEV_IDENTITY_EMAIL: "Dev@Example.com" } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ email: "dev@example.com", role: "ADMIN" });
  });

  it("in sviluppo senza identità dichiarata: 503", async () => {
    const response = await callApi("/me", { env: { ...unconfigured, ENVIRONMENT: "development" } });
    expect(response.status).toBe(503);
  });
});

describe("difese dell'API", () => {
  it("intestazioni di sicurezza anche sulle risposte di errore", async () => {
    const response = await callApi("/me");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });

  it("scrittura da un'altra origine: 403 prima ancora dell'identità", async () => {
    const response = await callApi("/qualcosa", { method: "POST", origin: "https://sito-malevolo.example" });
    expect(response.status).toBe(403);
  });

  it("scrittura senza Origin e senza Sec-Fetch-Site: 403", async () => {
    const response = await callApi("/qualcosa", { method: "POST", origin: null });
    expect(response.status).toBe(403);
  });

  it("scrittura dalla stessa origine passa il controllo (poi 404: la rotta non esiste)", async () => {
    await seedUser({ email: "anna@example.com" });
    const token = await tokenFor("anna@example.com");
    expect((await callApi("/qualcosa", { method: "POST", origin: ORIGIN, token })).status).toBe(404);
    expect((await callApi("/qualcosa", { method: "POST", origin: null, secFetchSite: "same-origin", token })).status).toBe(404);
  });

  it("rotta inesistente: 404 in JSON", async () => {
    await seedUser({ email: "anna@example.com" });
    const response = await callApi("/non-esiste", { token: await tokenFor("anna@example.com") });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Non trovato." });
  });
});
