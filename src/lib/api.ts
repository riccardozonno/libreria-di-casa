// Client dell'API: stessa origine (cookie di Access inclusi), errori sempre con un messaggio in italiano.

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const FALLBACK_MESSAGES: Record<number, string> = {
  401: "Accesso scaduto: ricarica la pagina per entrare di nuovo.",
  403: "Non hai i permessi per questa operazione.",
  503: "Il servizio non è ancora configurato.",
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { credentials: "same-origin", ...init });
  } catch {
    throw new ApiError("Connessione assente: controlla la rete e riprova.", 0);
  }
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    const message = body?.error ?? FALLBACK_MESSAGES[response.status] ?? "Qualcosa è andato storto. Riprova.";
    throw new ApiError(message, response.status);
  }
  return body as T;
}
