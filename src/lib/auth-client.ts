"use client";

import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Client Better Auth per il browser: stessa origine, nessun segreto.
export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        // Fuori dai componenti React: niente router disponibile qui.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/accedi?passo=2fa");
      },
    }),
  ],
});

/** Messaggio in italiano a partire dalla risposta di Better Auth. */
export function authErrorMessage(error: { status?: number; code?: string } | null | undefined): string {
  if (!error) return "";
  if (error.status === 429) return "Troppi tentativi. Riprova tra qualche minuto.";
  if (error.code === "PASSWORD_TOO_SHORT") return "La password deve avere almeno 12 caratteri.";
  if (error.code === "PASSWORD_TOO_LONG") return "La password è troppo lunga.";
  if (error.code === "INVALID_TOKEN") return "Il link non è valido o è scaduto. Chiedi un nuovo link all'amministratore.";
  if (error.code === "INVALID_CODE" || error.code === "INVALID_TWO_FACTOR_CODE") return "Codice non valido.";
  if (error.status === 401) return "Email o password non corretti.";
  return "Accesso non riuscito. Riprova.";
}
