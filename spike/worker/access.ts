import { createRemoteJWKSet, jwtVerify } from "jose";

// Identità da Cloudflare Access: Access aggiunge a ogni richiesta un JWT firmato
// (header Cf-Access-Jwt-Assertion). Lo verifichiamo noi: firma, emittente, audience, scadenza.
// Senza configurazione l'API rifiuta tutto (fail closed). L'identità finta esiste solo in locale.

export interface Identity {
  email: string;
  source: "access" | "dev";
}

export type IdentityResult = { ok: true; identity: Identity } | { ok: false; status: 401 | 503; reason: string };

interface AccessEnv {
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  DEV_IDENTITY_EMAIL?: string;
}

const jwksByTeam = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksFor(teamDomain: string): ReturnType<typeof createRemoteJWKSet> {
  const cached = jwksByTeam.get(teamDomain);
  if (cached) return cached;
  const jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
  jwksByTeam.set(teamDomain, jwks);
  return jwks;
}

export async function resolveIdentity(request: Request, env: AccessEnv): Promise<IdentityResult> {
  const configured = env.ACCESS_TEAM_DOMAIN !== "" && env.ACCESS_AUD !== "";
  if (!configured) {
    // `.dev.vars` non viene mai pubblicato: in produzione DEV_IDENTITY_EMAIL non esiste.
    if (env.DEV_IDENTITY_EMAIL) return { ok: true, identity: { email: env.DEV_IDENTITY_EMAIL, source: "dev" } };
    return { ok: false, status: 503, reason: "Access non configurato" };
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return { ok: false, status: 401, reason: "Richiesta non passata da Access" };

  try {
    const { payload } = await jwtVerify(token, jwksFor(env.ACCESS_TEAM_DOMAIN), {
      issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
      audience: env.ACCESS_AUD,
    });
    if (typeof payload.email !== "string") return { ok: false, status: 401, reason: "Token senza email" };
    return { ok: true, identity: { email: payload.email.toLowerCase(), source: "access" } };
  } catch {
    return { ok: false, status: 401, reason: "Token di Access non valido" };
  }
}
