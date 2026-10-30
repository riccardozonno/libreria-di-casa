import { createMiddleware } from "hono/factory";
import { createDb } from "../db/client";
import type { AppEnv, Bindings } from "../env";
import { type AccessJwtResult, createAccessVerifier } from "./access-jwt";
import { loadUserByEmail } from "./current-user";

// Chi sta facendo la richiesta: identità firmata da Cloudflare Access, poi l'utente nel nostro DB.
// Access dice solo "questa email ha ricevuto il codice"; ruolo, sedi e attivazione li decide l'app.

type Identity = { ok: true; email: string; issuedAtMs: number } | { ok: false; status: 401 | 503; error: string };

const verifiers = new Map<string, (token: string) => Promise<AccessJwtResult>>();

function verifierFor(teamDomain: string, audience: string) {
  const key = `${teamDomain}|${audience}`;
  let verify = verifiers.get(key);
  if (!verify) {
    verify = createAccessVerifier({ teamDomain, audience });
    verifiers.set(key, verify);
  }
  return verify;
}

export async function resolveIdentity(request: Request, env: Bindings): Promise<Identity> {
  const accessConfigured = env.ACCESS_TEAM_DOMAIN !== "" && env.ACCESS_AUD !== "";
  if (!accessConfigured) {
    // Identità finta solo fuori produzione e solo se dichiarata in `.dev.vars` (mai pubblicato).
    if (env.ENVIRONMENT !== "production" && env.DEV_IDENTITY_EMAIL) {
      return { ok: true, email: env.DEV_IDENTITY_EMAIL.toLowerCase(), issuedAtMs: Date.now() };
    }
    return { ok: false, status: 503, error: "Accesso non configurato." };
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return { ok: false, status: 401, error: "Accesso richiesto." };
  const result = await verifierFor(env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD)(token);
  if (!result.ok) {
    console.warn("JWT di Access rifiutato:", result.reason);
    return { ok: false, status: 401, error: "Accesso scaduto o non valido: ricarica la pagina." };
  }
  return { ok: true, email: result.email, issuedAtMs: result.issuedAt * 1000 };
}

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const identity = await resolveIdentity(c.req.raw, c.env);
  if (!identity.ok) return c.json({ error: identity.error }, identity.status);

  const stored = await loadUserByEmail(createDb(c.env.DB), identity.email);
  if (!stored) return c.json({ error: "Questo indirizzo email non è abilitato. Chiedi all'amministratore." }, 403);
  if (!stored.active) return c.json({ error: "Il tuo account è disattivato." }, 403);
  if (stored.sessionsNotBefore && identity.issuedAtMs < Date.parse(stored.sessionsNotBefore)) {
    return c.json({ error: "Sei uscito da tutti i dispositivi: accedi di nuovo." }, 401);
  }

  const { active, sessionsNotBefore: _sessionsNotBefore, ...current } = stored;
  c.set("user", current);
  c.set("actor", { id: current.id, role: current.role, active, editorLocationIds: new Set(current.editorLocationIds) });
  await next();
});
