// Token di Access firmati davvero (RS256) per i test: funziona sia in Node sia nel runtime Workers.

export const TEST_TEAM = "test-team.cloudflareaccess.com";
export const TEST_AUDIENCE = "test-audience";
export const CERTS_URL = `https://${TEST_TEAM}/cdn-cgi/access/certs`;

export interface SigningKey {
  kid: string;
  privateKey: CryptoKey;
  publicJwk: JsonWebKey & { kid: string };
}

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const encodeJson = (value: unknown) => base64url(encoder.encode(JSON.stringify(value)));

export async function createSigningKey(kid = "test-kid"): Promise<SigningKey> {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  return { kid, privateKey: pair.privateKey, publicJwk: { ...jwk, kid, alg: "RS256", use: "sig" } };
}

export async function signAccessToken(key: SigningKey, email: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const nowS = Math.floor(Date.now() / 1000);
  const claims = { iss: `https://${TEST_TEAM}`, aud: [TEST_AUDIENCE], email, iat: nowS - 5, nbf: nowS - 5, exp: nowS + 3600, ...overrides };
  const signingInput = `${encodeJson({ alg: "RS256", kid: key.kid, typ: "JWT" })}.${encodeJson(claims)}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key.privateKey, encoder.encode(signingInput));
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}
