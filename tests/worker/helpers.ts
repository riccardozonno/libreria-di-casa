import { env } from "cloudflare:test";
import { vi } from "vitest";
import { locationNameKey } from "../../shared/text";
import app from "../../worker";
import { createDb } from "../../worker/db/client";
import { location, locationEditor, user } from "../../worker/db/schema";
import type { Bindings } from "../../worker/env";
import { CERTS_URL, type SigningKey, signAccessToken } from "../helpers/access-token";

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
  /** Default: la nostra origine per le scritture, nessuna per le letture. `null` = nessun header. */
  origin?: string | null;
  secFetchSite?: string;
  body?: unknown;
  env?: Partial<Bindings>;
}

export async function callApi(path: string, options: CallOptions = {}): Promise<Response> {
  const method = options.method ?? "GET";
  const headers = new Headers();
  if (options.token) headers.set("Cf-Access-Jwt-Assertion", options.token);
  const origin = options.origin === undefined ? (method === "GET" ? undefined : ORIGIN) : options.origin;
  if (origin) headers.set("Origin", origin);
  if (options.secFetchSite) headers.set("Sec-Fetch-Site", options.secFetchSite);
  let body: BodyInit | undefined;
  if (options.body instanceof Uint8Array) body = new Uint8Array(options.body);
  else if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }
  const request = new Request(`${ORIGIN}/api${path}`, { method, headers, body });
  return app.fetch(request, { ...env, ...options.env });
}

/** Utente di test con il suo token di Access: `const anna = await signedIn(key, { role: "ADMIN" })`. */
export async function signedIn(key: SigningKey, values: Parameters<typeof seedUser>[0]) {
  const created = await seedUser(values);
  const token = await signAccessToken(key, values.email);
  const call = (path: string, options: Omit<CallOptions, "token"> = {}) => callApi(path, { ...options, token });
  return { ...created, token, call };
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
  const [created] = await db().insert(location).values({ name, nameKey: locationNameKey(name), color }).returning();
  return created!;
}
