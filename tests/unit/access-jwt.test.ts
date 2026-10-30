import { beforeAll, describe, expect, it, vi } from "vitest";
import { createAccessVerifier } from "../../worker/auth/access-jwt";

// Il JWT che Cloudflare Access aggiunge a ogni richiesta (header Cf-Access-Jwt-Assertion).
// Qui generiamo chiavi e token veri (RS256) e simuliamo l'endpoint dei certificati del team.

const TEAM = "famiglia.cloudflareaccess.com";
const AUDIENCE = "aud-home-library";
const NOW_S = 1_800_000_000;
const clock = () => NOW_S * 1000;

interface TestKey {
  kid: string;
  privateKey: CryptoKey;
  publicJwk: JsonWebKey & { kid: string };
}

const encoder = new TextEncoder();
const base64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const encodeJson = (value: unknown) => base64url(encoder.encode(JSON.stringify(value)));

async function makeKey(kid: string): Promise<TestKey> {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { kid, privateKey: pair.privateKey, publicJwk: { ...jwk, kid, alg: "RS256", use: "sig" } };
}

async function sign(key: TestKey, payload: Record<string, unknown>, header: Record<string, unknown> = {}): Promise<string> {
  const signingInput = `${encodeJson({ alg: "RS256", kid: key.kid, typ: "JWT", ...header })}.${encodeJson(payload)}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key.privateKey, encoder.encode(signingInput));
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

const validClaims = (overrides: Record<string, unknown> = {}) => ({
  iss: `https://${TEAM}`,
  aud: [AUDIENCE],
  email: "Anna.Rossi@Example.com",
  iat: NOW_S - 30,
  nbf: NOW_S - 30,
  exp: NOW_S + 3600,
  ...overrides,
});

function certsFetcher(keys: () => TestKey[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    expect(String(input)).toBe(`https://${TEAM}/cdn-cgi/access/certs`);
    return Response.json({ keys: keys().map((key) => key.publicJwk) });
  });
}

let keyA: TestKey;
let keyB: TestKey;

beforeAll(async () => {
  [keyA, keyB] = await Promise.all([makeKey("kid-a"), makeKey("kid-b")]);
});

function verifierWith(keys: () => TestKey[]) {
  const fetcher = certsFetcher(keys);
  const verify = createAccessVerifier({ teamDomain: TEAM, audience: AUDIENCE }, { fetcher, clock });
  return { verify, fetcher };
}

describe("token valido", () => {
  it("restituisce l'email in minuscolo e l'istante di emissione", async () => {
    const { verify } = verifierWith(() => [keyA]);
    await expect(verify(await sign(keyA, validClaims()))).resolves.toEqual({
      ok: true,
      email: "anna.rossi@example.com",
      issuedAt: NOW_S - 30,
      expiresAt: NOW_S + 3600,
    });
  });

  it("lo stesso token già verificato non viene riverificato (meno CPU), finché non scade", async () => {
    let nowMs = NOW_S * 1000;
    const verify = createAccessVerifier({ teamDomain: TEAM, audience: AUDIENCE }, { fetcher: certsFetcher(() => [keyA]), clock: () => nowMs });
    const token = await sign(keyA, validClaims({ exp: NOW_S + 120 }));
    const subtleVerify = vi.spyOn(crypto.subtle, "verify");

    expect((await verify(token)).ok).toBe(true);
    expect((await verify(token)).ok).toBe(true);
    expect(subtleVerify).toHaveBeenCalledTimes(1);

    nowMs += 200_000; // oltre exp + tolleranza
    expect((await verify(token)).ok).toBe(false);
    subtleVerify.mockRestore();
  });

  it("i token rifiutati non entrano nella memoria dei token verificati", async () => {
    const { verify } = verifierWith(() => [keyA]);
    const token = await sign(keyA, validClaims({ aud: ["altra-app"] }));
    const subtleVerify = vi.spyOn(crypto.subtle, "verify");
    await verify(token);
    await verify(token);
    expect(subtleVerify).toHaveBeenCalledTimes(2);
    subtleVerify.mockRestore();
  });

  it("accetta anche aud come stringa singola", async () => {
    const { verify } = verifierWith(() => [keyA]);
    const result = await verify(await sign(keyA, validClaims({ aud: AUDIENCE })));
    expect(result.ok).toBe(true);
  });

  it("scarica le chiavi una volta sola e le riusa", async () => {
    const { verify, fetcher } = verifierWith(() => [keyA]);
    await verify(await sign(keyA, validClaims()));
    await verify(await sign(keyA, validClaims({ email: "b@example.com" })));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("riscarica le chiavi quando arriva un kid nuovo (rotazione delle chiavi)", async () => {
    let published = [keyA];
    let nowMs = NOW_S * 1000;
    const fetcher = certsFetcher(() => published);
    const verify = createAccessVerifier({ teamDomain: TEAM, audience: AUDIENCE }, { fetcher, clock: () => nowMs });
    await verify(await sign(keyA, validClaims()));
    published = [keyA, keyB];
    nowMs += 61_000;
    const result = await verify(await sign(keyB, validClaims()));
    expect(result.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("token rifiutati", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["audience di un'altra applicazione", { aud: ["altra-app"] }],
    ["emittente diverso", { iss: "https://altro-team.cloudflareaccess.com" }],
    ["scaduto da più di un minuto", { exp: NOW_S - 61 }],
    ["non ancora valido", { nbf: NOW_S + 120 }],
    ["senza email", { email: undefined }],
    ["senza istante di emissione", { iat: undefined }],
  ];

  it.each(cases)("%s", async (_label, overrides) => {
    const { verify } = verifierWith(() => [keyA]);
    const result = await verify(await sign(keyA, validClaims(overrides)));
    expect(result.ok).toBe(false);
  });

  it("firma non valida (payload modificato dopo la firma)", async () => {
    const { verify } = verifierWith(() => [keyA]);
    const [header, , signature] = (await sign(keyA, validClaims())).split(".");
    const forged = `${header}.${encodeJson(validClaims({ email: "intruso@example.com" }))}.${signature}`;
    await expect(verify(forged)).resolves.toMatchObject({ ok: false });
  });

  it("firmato con una chiave che Access non pubblica", async () => {
    const { verify, fetcher } = verifierWith(() => [keyA]);
    const result = await verify(await sign(keyB, validClaims()));
    expect(result.ok).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("algoritmo diverso da RS256 (es. 'none' o HS256)", async () => {
    const { verify } = verifierWith(() => [keyA]);
    for (const alg of ["none", "HS256"]) {
      const result = await verify(await sign(keyA, validClaims(), { alg }));
      expect(result.ok).toBe(false);
    }
  });

  it.each(["", "abc", "a.b", "a.b.c.d", "!!!.###.$$$"])("token malformato %j", async (token) => {
    const { verify } = verifierWith(() => [keyA]);
    await expect(verify(token)).resolves.toMatchObject({ ok: false });
  });

  it("certificati non raggiungibili: rifiuta senza lanciare eccezioni", async () => {
    const fetcher = vi.fn(async () => new Response("errore", { status: 502 }));
    const verify = createAccessVerifier({ teamDomain: TEAM, audience: AUDIENCE }, { fetcher, clock });
    await expect(verify(await sign(keyA, validClaims()))).resolves.toMatchObject({ ok: false });
  });

  it("non riscarica i certificati a ogni kid sconosciuto (al massimo una volta al minuto)", async () => {
    const { verify, fetcher } = verifierWith(() => [keyA]);
    await verify(await sign(keyB, validClaims()));
    await verify(await sign(keyB, validClaims()));
    await verify(await sign(keyB, validClaims()));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
