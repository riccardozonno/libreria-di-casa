// Verifica del JWT di Cloudflare Access (header Cf-Access-Jwt-Assertion) solo con WebCrypto:
// niente librerie, chiavi importate una volta per istanza (limite di 10 ms di CPU, fase 1).
// Non lancia mai eccezioni: in caso di dubbio rifiuta (fail closed).

export interface AccessJwtConfig {
  teamDomain: string;
  audience: string;
}

export interface AccessVerifierDeps {
  fetcher?: typeof fetch;
  clock?: () => number;
}

export interface AccessIdentity {
  email: string;
  /** Secondi Unix. */
  issuedAt: number;
  expiresAt: number;
}

export type AccessJwtResult = ({ ok: true } & AccessIdentity) | { ok: false; reason: string };

const CLOCK_SKEW_S = 60;
const KEYS_TTL_MS = 60 * 60 * 1000;
/** Un kid sconosciuto fa riscaricare i certificati, ma non più di una volta al minuto. */
const MIN_REFRESH_INTERVAL_MS = 60 * 1000;
const RS256 = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;
/** Token già verificati in questa istanza (lo stesso utente ne riusa uno per ore): niente RSA a ogni richiesta. */
const MAX_VERIFIED_TOKENS = 256;

interface JwtHeader {
  alg?: unknown;
  kid?: unknown;
}

interface JwtClaims {
  iss?: unknown;
  aud?: unknown;
  email?: unknown;
  iat?: unknown;
  nbf?: unknown;
  exp?: unknown;
}

const reject = (reason: string): AccessJwtResult => ({ ok: false, reason });

function decodeBase64Url(segment: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) return null;
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(segment.length / 4) * 4, "=");
  try {
    return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function decodeJson<T>(segment: string): T | null {
  const bytes = decodeBase64Url(segment);
  if (!bytes) return null;
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof value === "object" && value !== null ? (value as T) : null;
  } catch {
    return null;
  }
}

function checkClaims(claims: JwtClaims, config: AccessJwtConfig, nowS: number): AccessJwtResult {
  if (claims.iss !== `https://${config.teamDomain}`) return reject("emittente non valido");
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(config.audience)) return reject("audience non valida");
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_S <= nowS) return reject("token scaduto");
  if (claims.nbf !== undefined && (typeof claims.nbf !== "number" || claims.nbf - CLOCK_SKEW_S > nowS)) {
    return reject("token non ancora valido");
  }
  if (typeof claims.iat !== "number") return reject("istante di emissione mancante");
  if (typeof claims.email !== "string" || claims.email === "") return reject("email mancante");
  return { ok: true, email: claims.email.toLowerCase(), issuedAt: claims.iat, expiresAt: claims.exp };
}

/** Restituisce una funzione di verifica con la sua cache di chiavi (una per team e audience). */
export function createAccessVerifier(config: AccessJwtConfig, deps: AccessVerifierDeps = {}): (token: string) => Promise<AccessJwtResult> {
  // fetch letto a ogni chiamata (non catturato): così i test possono sostituirlo.
  const fetcher = deps.fetcher ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const clock = deps.clock ?? Date.now;
  let jwks = new Map<string, JsonWebKey>();
  const imported = new Map<string, CryptoKey>();
  let fetchedAt: number | null = null;
  const verified = new Map<string, AccessIdentity>();

  function remember(token: string, identity: AccessIdentity): void {
    if (verified.size >= MAX_VERIFIED_TOKENS) {
      const oldest = verified.keys().next().value;
      if (oldest !== undefined) verified.delete(oldest);
    }
    verified.set(token, identity);
  }

  async function refreshKeys(): Promise<void> {
    fetchedAt = clock();
    const response = await fetcher(`https://${config.teamDomain}/cdn-cgi/access/certs`);
    if (!response.ok) throw new Error(`certificati di Access: HTTP ${response.status}`);
    const body = (await response.json()) as { keys?: Array<JsonWebKey & { kid?: string }> };
    jwks = new Map((body.keys ?? []).filter((key) => key.kty === "RSA" && typeof key.kid === "string").map((key) => [key.kid as string, key]));
    imported.clear();
  }

  async function keyFor(kid: string): Promise<CryptoKey | null> {
    const age = fetchedAt === null ? Infinity : clock() - fetchedAt;
    const expired = age >= KEYS_TTL_MS;
    const unknownKid = !jwks.has(kid) && age >= MIN_REFRESH_INTERVAL_MS;
    if (expired || unknownKid) await refreshKeys();

    const cached = imported.get(kid);
    if (cached) return cached;
    const jwk = jwks.get(kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, RS256, false, ["verify"]);
    imported.set(kid, key);
    return key;
  }

  return async function verify(token: string): Promise<AccessJwtResult> {
    const nowS = Math.floor(clock() / 1000);
    const cached = verified.get(token);
    if (cached) {
      if (cached.expiresAt + CLOCK_SKEW_S > nowS) return { ok: true, ...cached };
      verified.delete(token);
      return reject("token scaduto");
    }

    const parts = token.split(".");
    if (parts.length !== 3) return reject("token malformato");
    const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
    const header = decodeJson<JwtHeader>(headerPart);
    const claims = decodeJson<JwtClaims>(payloadPart);
    const signature = decodeBase64Url(signaturePart);
    if (!header || !claims || !signature) return reject("token malformato");
    if (header.alg !== "RS256" || typeof header.kid !== "string") return reject("algoritmo non ammesso");

    try {
      const key = await keyFor(header.kid);
      if (!key) return reject("chiave sconosciuta");
      const signed = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
      if (!(await crypto.subtle.verify(RS256, key, signature, signed))) return reject("firma non valida");
    } catch {
      return reject("verifica non riuscita");
    }
    const result = checkClaims(claims, config, nowS);
    if (result.ok) remember(token, { email: result.email, issuedAt: result.issuedAt, expiresAt: result.expiresAt });
    return result;
  };
}
