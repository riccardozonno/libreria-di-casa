import "server-only";
import { hash, verify } from "@node-rs/argon2";

// argon2id con i parametri raccomandati da OWASP (m=19 MiB, t=2, p=1). Vedi ADR-0003.
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(data: { hash: string; password: string }): Promise<boolean> {
  try {
    return await verify(data.hash, data.password);
  } catch {
    // Hash malformato: equivale a password errata, senza dettagli all'esterno.
    return false;
  }
}
