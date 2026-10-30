import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createSigningKey, type SigningKey } from "../helpers/access-token";
import { publishAccessKey, seedLocation, signedIn } from "./helpers";

// Sedi: tutti le vedono, solo l'admin le crea, rinomina, ricolora, archivia (docs/permissions.md).

let key: SigningKey;
beforeAll(async () => {
  key = await createSigningKey();
  publishAccessKey(key);
});

const admin = () => signedIn(key, { email: "admin@example.com", role: "ADMIN" });
const lastAudit = async () =>
  env.DB.prepare("SELECT action, entity_id, data FROM audit_log ORDER BY created_at DESC, rowid DESC LIMIT 1").first<{ action: string; entity_id: string; data: string }>();

describe("elenco", () => {
  it("chiunque vede le sedi: attive prima, poi archiviate, con il numero di copie", async () => {
    const reader = await signedIn(key, { email: "lettore@example.com" });
    const mare = await seedLocation("Mare", "BLU");
    await seedLocation("Casa", "ROSSO");
    await env.DB.prepare("UPDATE location SET archived_at = '2026-01-01T00:00:00.000Z' WHERE id = ?").bind(mare.id).run();

    const response = await reader.call("/locations");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      expect.objectContaining({ name: "Casa", color: "ROSSO", archived: false, copyCount: 0 }),
      expect.objectContaining({ name: "Mare", color: "BLU", archived: true, copyCount: 0 }),
    ]);
  });
});

describe("creazione", () => {
  it("l'admin crea una sede e resta traccia nel registro", async () => {
    const anna = await admin();
    const response = await anna.call("/locations", { method: "POST", body: { name: "  Casa al mare ", color: "AZZURRO" } });
    expect(response.status).toBe(201);
    const { id } = (await response.json()) as { id: string };
    expect(await lastAudit()).toMatchObject({ action: "location.create", entity_id: id });
  });

  it("un editor o un lettore non può: 403", async () => {
    const editor = await signedIn(key, { email: "editor@example.com", role: "EDITOR" });
    expect((await editor.call("/locations", { method: "POST", body: { name: "X", color: "ROSSO" } })).status).toBe(403);
  });

  it("nome già usato (anche con maiuscole e accenti diversi): 409", async () => {
    const anna = await admin();
    await seedLocation("Città", "ROSSO");
    const response = await anna.call("/locations", { method: "POST", body: { name: "citta", color: "BLU" } });
    expect(response.status).toBe(409);
  });

  it("colore già usato: 409 con il nome della sede che lo usa", async () => {
    const anna = await admin();
    await seedLocation("Casa", "ROSSO");
    const response = await anna.call("/locations", { method: "POST", body: { name: "Mare", color: "ROSSO" } });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Il colore è già usato dalla sede "Casa".' });
  });

  it("dati non validi: 400 con il messaggio del campo", async () => {
    const anna = await admin();
    const response = await anna.call("/locations", { method: "POST", body: { name: "", color: "FUCSIA" } });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Dati non validi.", fields: { name: "Inserisci un nome", color: "Scegli un colore" } });
  });
});

describe("modifica e archiviazione", () => {
  it("l'admin rinomina e cambia colore", async () => {
    const anna = await admin();
    const casa = await seedLocation("Casa", "ROSSO");
    const response = await anna.call(`/locations/${casa.id}`, { method: "PATCH", body: { name: "Casa Milano", color: "VERDE" } });
    expect(response.status).toBe(204);
    expect(await env.DB.prepare("SELECT name, name_key, color FROM location WHERE id = ?").bind(casa.id).first()).toEqual({ name: "Casa Milano", name_key: "casa milano", color: "VERDE" });
    expect(await lastAudit()).toMatchObject({ action: "location.update" });
  });

  it("può tenere il proprio colore, ma non prendere quello di un'altra sede", async () => {
    const anna = await admin();
    const casa = await seedLocation("Casa", "ROSSO");
    await seedLocation("Mare", "BLU");
    expect((await anna.call(`/locations/${casa.id}`, { method: "PATCH", body: { name: "Casa 2", color: "ROSSO" } })).status).toBe(204);
    expect((await anna.call(`/locations/${casa.id}`, { method: "PATCH", body: { name: "Casa 2", color: "BLU" } })).status).toBe(409);
  });

  it("sede inesistente: 404", async () => {
    const anna = await admin();
    const response = await anna.call("/locations/00000000-0000-4000-8000-000000000000", { method: "PATCH", body: { name: "X", color: "ROSSO" } });
    expect(response.status).toBe(404);
  });

  it("archivia e riattiva (operazioni idempotenti, registrate una volta)", async () => {
    const anna = await admin();
    const casa = await seedLocation("Casa", "ROSSO");
    expect((await anna.call(`/locations/${casa.id}/archive`, { method: "POST" })).status).toBe(204);
    expect(await lastAudit()).toMatchObject({ action: "location.archive", entity_id: casa.id });
    expect((await anna.call(`/locations/${casa.id}/archive`, { method: "POST" })).status).toBe(204);
    expect((await anna.call(`/locations/${casa.id}/restore`, { method: "POST" })).status).toBe(204);
    expect(await lastAudit()).toMatchObject({ action: "location.restore" });
    const archived = await env.DB.prepare("SELECT archived_at FROM location WHERE id = ?").bind(casa.id).first<{ archived_at: string | null }>();
    expect(archived?.archived_at).toBeNull();
  });

  it("un editor non può archiviare: 403", async () => {
    const editor = await signedIn(key, { email: "editor@example.com", role: "EDITOR" });
    const casa = await seedLocation("Casa", "ROSSO");
    expect((await editor.call(`/locations/${casa.id}/archive`, { method: "POST" })).status).toBe(403);
  });
});
