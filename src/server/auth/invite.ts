import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "../db";
import { env } from "../env";
import { ACCOUNT_LINK_TTL_SECONDS, auth } from "./auth";
import { getMailer, type AccountLinkKind } from "./mailer";

// Link d'invito e di reset (ADR-0003): token monouso nello stesso formato del reset di Better Auth,
// così la pagina /imposta-password usa il normale endpoint /reset-password.
// Il token è salvato come hash (verification.storeIdentifier = "hashed").

const TOKEN_BYTES = 24;

export interface AccountLink {
  url: string;
  expiresAt: Date;
  /** false: nessuna email inviata, l'admin deve consegnare il link a mano. */
  delivered: boolean;
}

export async function createInviteLink(userId: string, kind: AccountLinkKind = "invite"): Promise<AccountLink> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, active: true } });
  if (!user) throw new Error("Utente non trovato");
  if (!user.active) throw new Error("Impossibile generare un link per un utente disattivato");

  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + ACCOUNT_LINK_TTL_SECONDS * 1000);
  const context = await auth.$context;
  await context.internalAdapter.createVerificationValue({
    identifier: `reset-password:${token}`,
    value: userId,
    expiresAt,
  });

  // URL costruito dalla configurazione, mai dall'header Host della richiesta.
  const url = new URL("/imposta-password", env.BETTER_AUTH_URL);
  url.searchParams.set("token", token);

  const { delivered } = await getMailer().sendAccountLink({
    kind,
    to: { name: user.name, email: user.email },
    url: url.toString(),
    expiresAt,
  });
  return { url: url.toString(), expiresAt, delivered };
}
