# Produzione (fase 7)

L'app è su `https://homelibrary.r-z030600.workers.dev`, piano gratuito di Cloudflare, senza dominio.

## Accesso (Cloudflare Access)

| Impostazione | Valore |
|---|---|
| Metodo di login | solo One-time PIN (codice via email, nessuna password) |
| Chi entra | regola Allow con il solo gruppo Access «Utenti HOME LIBRARY», riscritto dall'app quando l'admin aggiunge, disattiva o cancella un utente |
| Durata della sessione | 1 mese (scelta del 31/10/2026: comodo con l'app sulla schermata Home) |
| Revoca immediata | dall'app: «Esci da tutti i dispositivi» o disattivazione dell'utente (il Worker rifiuta i JWT emessi prima) |
| Indirizzi di anteprima per versione | spenti (`preview_urls: false`, verificato: 404) |

Il Worker verifica comunque firma, audience e scadenza del JWT di Access su ogni richiesta `/api/*`:
se Access fosse configurato male, l'API risponde 401 invece di aprirsi.

Primo amministratore (solo su un database nuovo, per esempio dopo un disastro senza backup):
`pnpm admin:create --email tu@example.com --name "Nome" --remote`.

Utenti al 31/10/2026: Riccardo (ADMIN), Filiberto Canino (EDITOR, 3 sedi), Giulia (EDITOR, 3 sedi).

## Pubblicare una nuova versione

Solo a mano, da GitHub: **Actions → Deploy → Run workflow** (branch `main`). Il workflow
(`.github/workflows/deploy.yml`):

1. esegue gli stessi controlli della CI (lint, tipi, test con copertura, E2E iPhone/Android);
2. stampa il segnalibro di Time Travel del database (punto di ripristino);
3. applica le migrazioni D1 nuove;
4. pubblica il Worker con il commit nel messaggio;
5. controlla che senza login l'API risponda con il reindirizzamento di Access (302).

Se un passo fallisce, quelli dopo non partono e GitHub manda un'email. Il token
`CLOUDFLARE_DEPLOY_TOKEN` (segreto GitHub) può solo pubblicare Worker e modificare D1; i segreti del
Worker (`GOOGLE_BOOKS_API_KEY`, `CF_API_TOKEN`) restano su Cloudflare e la pubblicazione non li tocca.

Dal Mac resta possibile: `pnpm exec wrangler d1 migrations apply DB --remote && pnpm build && pnpm exec wrangler deploy`.

## Tornare indietro

- **Codice**: `pnpm exec wrangler rollback` torna alla versione precedente del Worker (elenco con
  `pnpm exec wrangler deployments list`). Non annulla le migrazioni del database.
- **Database dopo una migrazione sbagliata**: copia il segnalibro dal log del passo «Punto di ripristino
  del database» e lancia `pnpm exec wrangler d1 time-travel restore homelibrary --bookmark=<segnalibro>`.
  Tutto ciò che è stato scritto dopo quel momento si perde.
- **Disastro**: ripristino dal backup su B2, vedi [backup-restore.md](backup-restore.md).

## Verifiche del 31/10/2026

| Verifica | Esito |
|---|---|
| Prima pubblicazione da GitHub (run 41214691078) | riuscita: controlli verdi, nessuna migrazione da applicare, versione `0707ed59` |
| API senza login | 302 verso il login di Access |
| Vecchio indirizzo di anteprima | 404 |
| Ruoli online | tre utenti attivi con i ruoli attesi (Giulia promossa a EDITOR dall'admin) |
| Primo backup notturno automatico | da controllare dopo le 02:30 del 01/11/2026 |

## Verifica finale (fase 8, 31/10/2026)

Prove fatte dall'admin sull'app online: login con codice da una finestra anonima, editor che aggiunge un
libro nella sua sede senza vedere la scheda Admin, scansione del codice a barre dall'app installata su
iPhone, export CSV del catalogo completo. Tutte riuscite.
