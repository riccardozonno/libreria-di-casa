import "server-only";

// Punto di estensione per l'invio email (ADR-0003). Oggi nessun server di posta:
// il link viene restituito all'admin che lo inoltra a mano. Domani: SmtpMailer.

export type AccountLinkKind = "invite" | "reset";

export interface AccountLinkMessage {
  kind: AccountLinkKind;
  to: { name: string; email: string };
  url: string;
  expiresAt: Date;
}

export interface DeliveryResult {
  /** true se il messaggio è stato spedito; false se l'admin deve consegnare il link a mano. */
  delivered: boolean;
}

export interface Mailer {
  sendAccountLink(message: AccountLinkMessage): Promise<DeliveryResult>;
}

/** Nessun invio: l'interfaccia admin mostra il link da copiare. */
export const showLinkToAdminMailer: Mailer = {
  async sendAccountLink() {
    return { delivered: false };
  },
};

export function getMailer(): Mailer {
  return showLinkToAdminMailer;
}
