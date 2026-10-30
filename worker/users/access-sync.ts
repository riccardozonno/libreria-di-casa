import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import type { Bindings } from "../env";

// Il gruppo Cloudflare Access "Utenti HOME LIBRARY" contiene le email degli utenti attivi: la regola
// d'accesso dell'app fa entrare quel gruppo. Lo riscriviamo per intero a ogni modifica degli utenti
// (pochi utenti: niente differenze da calcolare, e si corregge da solo se qualcuno lo tocca a mano).

export type AccessSyncResult = "ok" | "failed" | "not-configured";

const GROUP_NAME = "Utenti HOME LIBRARY";
const TIMEOUT_MS = 8_000;

export async function syncAccessGroup(db: Db, env: Bindings): Promise<AccessSyncResult> {
  if (!env.CF_ACCOUNT_ID || !env.ACCESS_GROUP_ID || !env.CF_API_TOKEN) return "not-configured";
  const rows = await db.all<{ email: string }>(sql`SELECT email FROM user WHERE active = 1 ORDER BY email`);
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CF_ACCOUNT_ID)}/access/groups/${encodeURIComponent(env.ACCESS_GROUP_ID)}`;
  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: GROUP_NAME, include: rows.map((row) => ({ email: { email: row.email } })) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) return "ok";
    // Mai il token nei log: solo lo stato e i messaggi d'errore di Cloudflare.
    const body = (await response.json().catch(() => null)) as { errors?: Array<{ message?: string }> } | null;
    console.error("Gruppo Access non aggiornato:", response.status, body?.errors?.map((error) => error.message).join("; "));
  } catch (error) {
    console.error("Gruppo Access non aggiornato:", error instanceof Error ? error.message : error);
  }
  return "failed";
}
