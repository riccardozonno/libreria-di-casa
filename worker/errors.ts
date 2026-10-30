import type { ContentfulStatusCode } from "hono/utils/http-status";

// Errori di dominio con messaggi in italiano mostrabili all'utente; il resto è un errore interno.

export type DomainErrorCode = "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "VALIDATION";

const STATUS: Record<DomainErrorCode, ContentfulStatusCode> = { FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409, VALIDATION: 400 };

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly fields?: Readonly<Record<string, string>>,
    /** Dati in più per l'interfaccia (es. l'id del libro già esistente). */
    readonly data?: Readonly<Record<string, string>>,
  ) {
    super(message);
    this.name = "DomainError";
  }

  get status(): ContentfulStatusCode {
    return STATUS[this.code];
  }
}

export const forbidden = (): DomainError => new DomainError("FORBIDDEN", "Non hai i permessi per questa operazione.");
export const notFound = (what: string): DomainError => new DomainError("NOT_FOUND", `${what} non trovato.`);
export const conflict = (message: string): DomainError => new DomainError("CONFLICT", message);

/** Violazione di un vincolo UNIQUE di SQLite/D1 (anche quando arriva avvolta da Drizzle). */
export function isUniqueViolation(error: unknown): boolean {
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    if (current.message.includes("UNIQUE constraint failed")) return true;
  }
  return false;
}
