// Errori di dominio con messaggi in italiano mostrabili all'utente.
// Le Server Actions li trasformano in risposte; tutto il resto è un errore interno.

export type DomainErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "VALIDATION";

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, string>>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const forbidden = (): DomainError => new DomainError("FORBIDDEN", "Non hai i permessi per questa operazione.");
export const notFound = (what: string): DomainError => new DomainError("NOT_FOUND", `${what} non trovato.`);
