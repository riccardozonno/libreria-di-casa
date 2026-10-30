// Client dell'API: stessa origine (cookie di Access inclusi), errori sempre con un messaggio in italiano.

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Errori per campo restituiti dall'API (validazione) e dati in più (es. bookId). */
    readonly body: { fields?: Record<string, string>; [key: string]: unknown } = {},
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

const SAFE_METHODS = new Set(["GET", "HEAD"]);

async function request(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`/api${path}`, { credentials: "same-origin", ...init });
  } catch {
    throw new ApiError("Connessione assente: controlla la rete e riprova.", 0);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response = await request(path, init);
  // Errore temporaneo del Worker (es. limite di CPU al primo avvio di un'istanza): una lettura si
  // ripete una volta, l'istanza è ormai pronta. Le scritture no: ripeterle potrebbe duplicarle.
  const isSafe = SAFE_METHODS.has((init?.method ?? "GET").toUpperCase());
  if (response.status >= 500 && isSafe) response = await request(path, init);

  if (response.status === 204) return null as T;
  const body = (await response.json().catch(() => null)) as (T & { error?: string; fields?: Record<string, string> }) | null;
  if (!response.ok) {
    const message = body?.error ?? FALLBACK_MESSAGES[response.status] ?? "Qualcosa è andato storto. Riprova.";
    throw new ApiError(message, response.status, body ?? {});
  }
  return body as T;
}

/** Scrittura JSON (POST/PATCH/PUT/DELETE). Le risposte 204 restituiscono null. */
export function send<T = null>(path: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: unknown): Promise<T> {
  const isBinary = body instanceof Blob;
  return api<T>(path, {
    method,
    headers: body === undefined || isBinary ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : isBinary ? body : JSON.stringify(body),
  });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Qualcosa è andato storto. Riprova.";
}
