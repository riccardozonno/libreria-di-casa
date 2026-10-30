import { describe, expect, it, vi } from "vitest";

// Il modulo valida anche process.env quando viene importato: in CI non c'è .env,
// quindi si imposta una configurazione fittizia prima dell'import.
vi.stubEnv("DATABASE_URL", "postgresql://app:x@localhost:5432/test");
vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-0123456789");
vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
const { parseEnv } = await import("@/server/env");

const base = {
  DATABASE_URL: "postgresql://app:x@db:5432/homelibrary",
  BETTER_AUTH_SECRET: "x".repeat(40),
  BETTER_AUTH_URL: "http://localhost:3000",
};

describe("configurazione", () => {
  it("accetta una configurazione di sviluppo", () => {
    expect(parseEnv(base).TRUST_CLOUDFLARE_ONLY).toBe(false);
  });

  it("in HTTPS (produzione) pretende la modalità solo-Cloudflare", () => {
    expect(() => parseEnv({ ...base, BETTER_AUTH_URL: "https://libri.example.it" })).toThrow("TRUST_CLOUDFLARE_ONLY");
    expect(parseEnv({ ...base, BETTER_AUTH_URL: "https://libri.example.it", TRUST_CLOUDFLARE_ONLY: "true" }).TRUST_CLOUDFLARE_ONLY).toBe(true);
  });

  it("rifiuta segreti corti e URL mancanti con un messaggio chiaro", () => {
    expect(() => parseEnv({ ...base, BETTER_AUTH_SECRET: "corto" })).toThrow("BETTER_AUTH_SECRET");
    expect(() => parseEnv({ BETTER_AUTH_SECRET: base.BETTER_AUTH_SECRET })).toThrow("DATABASE_URL");
  });
});
