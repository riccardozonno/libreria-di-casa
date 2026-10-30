# HOME LIBRARY v2 — Piano a fasi (riscrittura per Cloudflare)

Obiettivo: la stessa app, interamente sul **piano gratuito di Cloudflare** (0 €, nessun dominio, nessun server da mantenere), con un "portiere" Cloudflare Access davanti a tutto. Decisione: [ADR-0014](adr/0014-riscrittura-cloudflare.md).

La versione 1 (Next.js + Postgres + Docker Compose, fasi 0–5 approvate) resta intatta su `main` e nel tag **`v1-nextjs`**. Questo lavoro vive sul branch **`cloudflare`**; diventa `main` solo a fine progetto e con il tuo OK.

## Cosa resta uguale

Requisiti di prodotto della v1, senza cambiamenti: sedi (≤ 5, colore unico scelto dall'admin), Libro → Copie, "Letto da", scanner su iPhone, lookup Google Books → Open Library → manuale, dati bibliografici bloccati dopo la creazione (tranne admin), spostamenti con storico (regola B), solo l'admin elimina l'ultima copia, CSV con anteprima e prova a secco, registro attività, PWA "HOME LIBRARY" con l'icona "Scaffale", UI solo in italiano e mobile-first. La [matrice dei permessi](permissions.md) resta valida, salvo la riga "proprio profilo" (vedi sotto).

## Cosa cambia

| Area | v1 | v2 |
|---|---|---|
| Interfaccia | Next.js (rendering sul server) | **React 19 + Vite**, app a pagina singola servita come file statici |
| Server | Server Actions | **API JSON con Hono** su Cloudflare Workers |
| Database | PostgreSQL 18 + Prisma | **D1** (SQLite) + **Drizzle**, migrazioni con `wrangler d1 migrations` |
| Ricerca | `pg_trgm` | **FTS5** con rimozione degli accenti |
| Copertine | disco + sharp | **R2**; ridimensionate sul telefono, il server controlla formato e dimensione |
| Accesso | email + password, inviti/reset, blocco, 2FA | **Cloudflare Access**: email + codice di 6 cifre (niente password). L'app legge l'identità firmata da Access e la confronta con la sua tabella utenti (ruolo, sedi, attivo) |
| Indirizzo | dominio + Cloudflare Tunnel | `https://<nome>.<tuo-account>.workers.dev`, protetto da Access |
| Registro in sola aggiunta | ruolo Postgres separato | trigger SQLite che rifiutano UPDATE/DELETE |
| Transazioni | `SELECT … FOR UPDATE`, lock | `batch()` atomici di D1 + aggiornamenti condizionali |
| CSV | elaborato sul server | letto/generato **sul telefono**, inviato al server a blocchi (limite di 10 ms di CPU) |
| Backup | container restic → USB + B2 | **GitHub Actions** ogni notte: export D1 + R2 → restic cifrato su B2, 7/4/6; più Time Travel di D1 |
| Sviluppo | OrbStack + Docker | `wrangler`/Miniflare in locale, nessun Docker |

Dalla matrice dei permessi spariscono cambio password, 2FA e link di invito/reset. Restano "esci da tutti i dispositivi" (revoca della sessione Access) e la disattivazione dell'utente, che vale subito perché l'app rilegge l'utente dal DB a ogni richiesta.

## Vincoli del piano gratuito (da rispettare in ogni fase)

| Limite | Valore | Come lo rispettiamo |
|---|---|---|
| CPU per richiesta | 10 ms | niente rendering sul server, niente hash di password, CSV sul client; ogni endpoint misurato nei test |
| Dimensione del Worker | 3 MB compressi | solo l'API nel Worker (Hono, Drizzle, zod, jose); l'interfaccia è statica |
| Richieste | 100.000/giorno | ampiamente sufficienti per 10 utenti |
| Chiamate esterne per richiesta | 50 | lookup ISBN ≤ 12 chiamate |
| D1 | 5 GB, 5 M righe lette e 100 k scritte al giorno | indici e FTS5 al posto delle scansioni complete |
| R2 | 10 GB | copertine WebP piccole |
| Access | 50 utenti | ≤ 10 utenti |

## Fasi

Ogni fase finisce con ⏸ (attesa del tuo OK) e push sul branch `cloudflare`.

### Fase 0 — Preparazione ✅ (approvata il 30/10/2026)
Tag `v1-nextjs`, branch `cloudflare`, questo piano, ADR-0014 (proposto), domande aperte. ⏸

### Fase 1 — Prova di fattibilità (go/no-go) ✅ (GO il 30/10/2026) — [resoconto](fase1-resoconto.md)
Un'app minima messa davvero online, per verificare i rischi prima di riscrivere tutto.
1. Ti guido nella creazione dell'account Cloudflare gratuito e del sottodominio `workers.dev` (le scelte le fai tu).
2. Worker + interfaccia statica + D1 + R2 con il plugin Cloudflare per Vite; deploy su `workers.dev`.
3. Access sul Worker, con login a codice via email; verifica della firma (JWT) nell'app.
4. Misure: CPU di una query di catalogo con FTS5 su ~5.000 libri finti, verifica JWT, scrittura in batch.
5. Prove dall'iPhone: login Access, installazione PWA sulla Home (cookie separati), fotocamera e scanner.
6. Resoconto con i numeri e decisione go/no-go. ⏸

### Fase 2 — Fondamenta ✅ (30/10/2026) — [resoconto](fase2-resoconto.md)
1. Progetto pulito sul branch (la v1 resta nel tag): pnpm, TS strict, ESLint, Tailwind 4, Vitest con `@cloudflare/vitest-pool-workers` (D1 e R2 veri in locale), Playwright, CI.
2. Schema D1 completo con Drizzle: utenti, sedi, editor per sede, libri, copie, movimenti, letture, registro (con trigger di sola aggiunta), cache ISBN, indice FTS5.
3. Middleware di autenticazione: JWT di Access verificato (firma, audience, emittente, scadenza), utente caricato dal DB a ogni richiesta, rifiuto di utenti sconosciuti o disattivati. In locale un'identità finta, attiva **solo** in sviluppo e con un test che lo garantisce.
4. Porting con TDD di `policy`, schemi zod, ISBN, normalizzazione del testo, colori delle sedi; registro attività nello stesso batch della modifica.
5. Intestazioni di sicurezza e CSP; controllo dell'Origin sulle richieste che modificano dati.
7. CPU misurata per endpoint nei test; **al primo avvio dell'istanza ≤ 5 ms** (in fase 1 la verifica del JWT con `jose` arrivava a 8 ms): chiave di Access importata una volta con WebCrypto, moduli caricati solo se servono.
6. Primo admin da riga di comando. ⏸

### Fase 3 — MVP
Catalogo con ricerca e filtro per sede, scheda libro, "Letto da", aggiunta con scanner e lookup (Google Books con chiave come segreto del Worker → Open Library → manuale), copertine su R2, copie (aggiungi, modifica, elimina, sposta con storico), sedi, gestione utenti. E2E sui tre ruoli. Prova dall'iPhone sull'indirizzo `workers.dev`. ⏸

### Fase 4 — Funzioni restanti
CSV (export e import con anteprima, prova a secco, duplicati, report errori, a blocchi), registro attività consultabile con filtri, profilo ("esci da tutti i dispositivi"), PWA (manifest, service worker, pagina offline, "Installa l'app"), sincronizzazione utenti ↔ Access (policy per email, metodo One-time PIN, durata della sessione). ⏸

### Fase 5 — Revisione
Security, database, TypeScript, React, accessibilità. In più: misura della CPU di ogni endpoint sotto i 10 ms, verifica che l'indirizzo non sia raggiungibile senza Access. ⏸

### Fase 6 — Backup e ripristino
GitHub Actions notturno: export D1 **dei soli dati, tabella per tabella** (`--no-schema --table …`: l'export completo non funziona con FTS5; al ripristino migrazioni + dati, l'indice si ricostruisce) + copia di R2 → restic su B2 (7/4/6, `check` settimanale), segreti solo nei GitHub Secrets con token in sola lettura. Script di ripristino guidato su un D1 e un bucket nuovi, **prova di ripristino reale** documentata. ⏸

### Fase 7 — Produzione
Access definitivo (lista email, durata della sessione), deploy da GitHub Actions su comando manuale, primo admin, verifica dei ruoli online, primo backup notturno riuscito. ⏸

### Fase 8 — Verifica finale e passaggio a `main`
Verifica online completa (login, ruoli, scansione da iPhone, CSV, backup), README completo con guida d'uso. Con il tuo OK: merge di `cloudflare` in `main` (la v1 resta nel tag `v1-nextjs`).

## Definizione di "finito"
Test, lint e typecheck passano; ogni endpoint sta sotto i 10 ms di CPU; l'app è online su `workers.dev` solo dietro Access; i ruoli sono verificati dai test; un ripristino reale da B2 è riuscito; README completo.

## Cosa riusiamo della v1
Logica pura con i suoi test (`policy`, `isbn`, `text`, `schemas`, `location-colors`, logica del lookup, formato e piano del CSV), componenti React non legati a Next (scanner, selettore colore, form), icone, `sw.js`, documentazione di prodotto. Da rifare: database, accesso, server, pagine, backup, test di integrazione ed E2E.

## Decisioni della fase 0 (30/10/2026)
1. **Accesso senza password**: solo Cloudflare Access (email + codice). ✅
2. **Lista email di Access sincronizzata in automatico** dall'app quando l'admin crea, disattiva o riattiva un utente (token Cloudflare con permessi solo su Access, come segreto del Worker). ✅
3. **Nessuna migrazione dalla v1**: il catalogo vero si inserisce da zero usando l'app. ✅

## Rischi principali

| Rischio | Prob. | Mitigazione |
|---|---|---|
| Un endpoint supera i 10 ms di CPU | Media | Misurato in fase 1 e 2: a regime 0–2 ms, al primo avvio di un'istanza 7–12 ms (accettato, opzione 1): le letture fallite si ripetono una volta; ricontrollo in fase 5; in ultima istanza Workers Paid (5 $/mese) senza riscrivere |
| PWA su iPhone dietro Access (cookie separati, rinnovo del login) | Media | Prova reale in fase 1; durata della sessione Access lunga |
| FTS5 non disponibile o accenti gestiti male su D1 | Bassa | Verifica in fase 1; ripiego: colonna normalizzata + `LIKE` su indice |
| Cloudflare cambia le condizioni del piano gratuito | Bassa | Backup notturno portabile (SQLite + file) su B2, fuori da Cloudflare |
| Accesso legato alla casella email di ognuno | Media | Consigliare la 2FA sugli account email; l'admin può disattivare un utente subito |
| Registro "in sola aggiunta" più debole (trigger, non ruoli) | Bassa | L'app non esegue mai DDL; backup notturno; test sui trigger |
