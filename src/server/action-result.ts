import "server-only";
import { z } from "zod";
import { getCurrentUser, type CurrentUser } from "./actor";
import { DomainError } from "./errors";

import type { ActionResult } from "@/lib/action-state";

// Esito uniforme delle Server Actions: { ok, data } oppure { ok: false, error, fieldErrors }.
// Gli errori inattesi vengono registrati nei log del server e mostrati con un messaggio generico.

export type { ActionResult };

const GENERIC_ERROR = "Qualcosa è andato storto. Riprova tra poco.";

function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  return fields;
}

export function toActionError(error: unknown, context: string): ActionResult<never> {
  if (error instanceof DomainError) {
    console.info(`[azione] ${context}: ${error.code}`);
    return { ok: false, error: error.message, details: error.details };
  }
  if (error instanceof z.ZodError) {
    console.info(`[azione] ${context}: dati non validi (${error.issues.map((issue) => issue.path.join(".") || "_").join(", ")})`);
    return { ok: false, error: "Controlla i campi evidenziati.", fieldErrors: zodFieldErrors(error) };
  }
  console.error(`[azione] ${context}`, error);
  return { ok: false, error: GENERIC_ERROR };
}

/** Esegue un'azione con l'utente corrente; utente assente o disattivato → errore. */
export async function withUser<T>(context: string, run: (user: CurrentUser) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      console.warn(`[azione] ${context}: nessuna sessione valida`);
      return { ok: false, error: "Sessione scaduta: accedi di nuovo." };
    }
    if (user.mustEnable2fa) return { ok: false, error: "Attiva la verifica in due passaggi dal profilo." };
    return await run(user);
  } catch (error) {
    return toActionError(error, context);
  }
}
