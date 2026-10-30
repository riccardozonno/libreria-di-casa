// Invito da mandare a chi è appena stato aggiunto (WhatsApp, Messaggi…). L'app non spedisce email:
// il codice lo manda Cloudflare Access quando la persona apre l'app e inserisce la sua email.

export interface InviteInput {
  name: string;
  email: string;
  appUrl: string;
}

export function inviteText({ name, email, appUrl }: InviteInput): string {
  return [
    `Ciao ${name}, ti ho aggiunto a HOME LIBRARY, il catalogo dei libri di casa.`,
    `1. Apri ${appUrl}`,
    `2. Scrivi la tua email (${email}) e tocca "Send login code".`,
    "3. Inserisci il codice che ti arriva da Cloudflare Access (se non lo vedi, guarda nella cartella spam).",
    'Su iPhone puoi poi toccare Condividi → "Aggiungi alla schermata Home".',
  ].join("\n");
}
