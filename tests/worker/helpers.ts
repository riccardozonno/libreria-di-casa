import { env } from "cloudflare:test";
import { vi } from "vitest";
import app from "../../worker";
import { createDb } from "../../worker/db/client";
import { location, locationEditor, user } from "../../worker/db/schema";
import type { Bindings } from "../../worker/env";
import { CERTS_URL, type SigningKey } from "../helpers/access-token";

export const ORIGIN = "https://homelibrary.test";
export const db = () => createDb(env.DB);

/** Fa rispondere l'endpoint dei certificati di Access con la chiave di test. */
export function publishAccessKey(key: SigningKey) {
  const realFetch = globalThis.fetch;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === CERTS_URL) return Response.json({ keys: [key.publicJwk] });
    return realFetch(input, init);
  });
}

interface CallOptions {
  method?: string;
  token?: string;
  origin?: string | null;
  secFetchSite?: string;
  env?: Partial<Bindings>;
}

export async function callApi(path: string, options: CallOptions = {}): Promise<Response> {
  const headers = new Headers();
  if (options.token) headers.set("Cf-Access-Jwt-Assertion", options.token);
  if (options.origin !== null && options.origin !== undefined) headers.set("Origin", options.origin);
  if (options.secFetchSite) headers.set("Sec-Fetch-Site", options.secFetchSite);
  const request = new Request(`${ORIGIN}/api${path}`, { method: options.method ?? "GET", headers });
  return app.fetch(request, { ...env, ...options.env });
}

export async function seedUser(values: { email: string; role?: "ADMIN" | "EDITOR" | "READER"; active?: boolean; sessionsNotBefore?: string; editorOf?: string[] }) {
  const [created] = await db()
    .insert(user)
    .values({ email: values.email, name: values.email.split("@")[0] ?? "utente", role: values.role ?? "READER", active: values.active ?? true, sessionsNotBefore: values.sessionsNotBefore ?? null })
    .returning();
  for (const locationId of values.editorOf ?? []) {
    await db().insert(locationEditor).values({ userId: created!.id, locationId });
  }
  return created!;
}

export async function seedLocation(name: string, color: (typeof location.$inferInsert)["color"]) {
  const [created] = await db().insert(location).values({ name, nameKey: name.toLowerCase(), color }).returning();
  return created!;
}
