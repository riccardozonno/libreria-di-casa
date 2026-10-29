import { describe, expect, it } from "vitest";
import { authErrorMessage } from "@/lib/auth-client";

describe("messaggi di errore dell'accesso", () => {
  it.each([
    [null, ""],
    [{ status: 429 }, "Troppi tentativi. Riprova tra qualche minuto."],
    [{ status: 400, code: "PASSWORD_TOO_SHORT" }, "La password deve avere almeno 12 caratteri."],
    [{ status: 400, code: "PASSWORD_TOO_LONG" }, "La password è troppo lunga."],
    [{ status: 400, code: "INVALID_TOKEN" }, "Il link non è valido o è scaduto. Chiedi un nuovo link all'amministratore."],
    [{ status: 401, code: "INVALID_TWO_FACTOR_CODE" }, "Codice non valido."],
    [{ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" }, "Email o password non corretti."],
    [{ status: 500 }, "Accesso non riuscito. Riprova."],
  ])("%o → %s", (error, message) => {
    expect(authErrorMessage(error)).toBe(message);
  });
});
