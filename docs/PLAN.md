# HOME LIBRARY — Piano a fasi

Web app per catalogare i libri di famiglia distribuiti su più sedi. Documenti collegati:
[architettura](architecture.md) · [modello dati](data-model.md) · [permessi](permissions.md) · [ADR](adr/README.md).

## Requisiti in sintesi

| Area | Requisito |
|---|---|
| Scala | ≤ 5 sedi, ≤ 10 utenti, qualche migliaio di libri |
| UI | Solo italiano, mobile-first, PWA "HOME LIBRARY" installabile su iPhone e Android |
| Ruoli | Amministratore, Editor (per sede), Lettore — controllati lato server su ogni operazione |
| Catalogo | Libro (dati bibliografici, unico per ISBN-13, ammessi senza ISBN) → Copie (sede, collocazione, note) |
| Letture | "Letto da": ogni utente segna sé stesso sul libro; l'admin corregge per tutti |
| Aggiunta | Scansione codice a barre (anche iPhone Safari) → Google Books → Open Library → manuale |
| Dati libro | Completabili da chi crea il libro; dopo il salvataggio modificabili solo dall'admin |
| Movimenti | Spostamento copie con storico (chi, quando, da→a) nella scheda libro |
| CSV | Export totale/per sede; import con anteprima, validazione, report errori, duplicati, prova a secco |
| Utenti | Creati dall'admin; link d'invito/reset monouso (72 h); niente email per ora (interfaccia `Mailer` pronta) |
| Sicurezza | argon2id, min 12 caratteri, cookie httpOnly/Secure/SameSite, CSRF, lockout, CSP, zod, 2FA TOTP predisposta |
| Produzione | Raspberry Pi 5 + Docker Compose + Cloudflare Tunnel, nessuna porta esposta |
| Backup | restic notturno (03:30) su USB e B2, 7/4/6, contiene tutto il necessario per ricostruire il sito |

## Fasi

Ogni fase finisce con ⏸ (attesa del tuo OK) e push su `main`.

### Fase 1 — Progettazione (questa)
Piano, modello dati, matrice permessi, architettura, ADR. Revisione dell'agente architect.

### Fase 2 — MVP locale (Mac M5 Pro, OrbStack)
1. Scaffold: Next.js 16 + TS strict + ESLint + Tailwind 4 + Vitest + Playwright; pnpm; CI GitHub Actions.
2. Docker: `Dockerfile` multi-stage (Node 24, output standalone, arm64/amd64), `compose.yaml` con `db` e `app`, override di sviluppo (porta solo su 127.0.0.1).
3. Prisma 7: schema completo (anche le tabelle usate in fase 3), prima migrazione, indice trigram.
4. **TDD** modulo permessi (`policy`): test della matrice completa prima del codice.
5. Spike Better Auth (invito senza password → token di reset → account credential creato), poi **TDD** autenticazione: Better Auth (email+password, argon2id, cookie, rate limit, lockout per account, IP da `CF-Connecting-IP`), creazione primo admin da CLI, link d'invito/reset.
6. Sedi: crea/rinomina/archivia (admin).
7. Catalogo: elenco con ricerca (titolo/autore/ISBN), filtro per sede, paginazione; scheda libro; "Letto da".
8. Aggiunta: scanner (`barcode-detector` + zxing-wasm self-hosted), lookup ISBN lato server (Google Books → Open Library), copertine salvate e ricodificate, inserimento manuale, proposta "aggiungi copia" se l'ISBN esiste.
9. Modifica/eliminazione copie; registro attività scritto in transazione (consultazione in fase 3).
10. Header di sicurezza e CSP con nonce (`proxy.ts`).
11. E2E: login, aggiunta via ISBN (lookup simulato), ricerca, permessi editor/lettore.
12. Istruzioni per provarlo dal Mac e dall'iPhone (tunnel temporaneo `trycloudflare`). ⏸

### Fase 3 — Funzioni restanti ✅ (approvata il 29/10/2026)
1. ~~Spostamento copie con storico~~ (anticipato in fase 2 su richiesta: admin o editor della sede di partenza).
2. **TDD** CSV: parser/validatore, anteprima, prova a secco, duplicati per ISBN, report errori; export totale/per sede.
3. Gestione utenti: crea, ruolo, sedi, disattiva (revoca sessioni), link invito/reset, protezione ultimo admin.
4. Registro attività consultabile con filtri (admin).
5. Profilo: cambio password, esci da tutti i dispositivi, 2FA TOTP (attivabile; obbligatoria per admin con flag di produzione).
6. PWA: manifest, icona "HOME LIBRARY" stile Apple, service worker minimale, pagina "Installa l'app".
7. E2E dei nuovi flussi. ⏸

### Fase 4 — Revisione ✅ (approvata il 30/10/2026)
security-reviewer, database-reviewer, typescript-reviewer, react-reviewer, a11y. Correzione di critici/alti, riepilogo del resto. ⏸

### Fase 5 — Backup e ripristino sul Mac ✅ (approvata il 30/10/2026) — [resoconto](backup-restore.md)
Servizio `backup` (restic + pg_dump + supercronic), repository locale di prova, script `backup.sh`/`restore.sh`, prova di ripristino completa su database vuoto, documentata. ⏸

### Fase 6 — Produzione sul Pi
0. Resoconto dei bisogni reali (RAM, disco, tempi di build misurati) → lista d'acquisto Pi/SSD/USB.
1. Preparazione Pi (guida homelab: SSD, DHCP, SSH a chiavi, ufw, unattended-upgrades, Docker).
2. Cloudflare: dominio, nameserver, tunnel, hostname pubblico.
3. Deploy (`setup.sh`), migrazioni, primo admin, 2FA admin obbligatoria.
4. Backup su USB e B2, prova di ripristino reale. ⏸

### Fase 7 — Verifica finale online
production-audit: login, permessi per ruolo, scansione da iPhone, CSV, esito del backup notturno. README completo.

## Rischi principali

| Rischio | Prob. | Mitigazione |
|---|---|---|
| Scansione su iPhone Safari (niente `BarcodeDetector` nativo) | Media | Polyfill zxing-wasm self-hosted, fallback di inserimento manuale; prova reale in fase 2 |
| Better Auth: invito senza password iniziale | Media | Utente creato senza credenziale + token di reset con scadenza 72 h ([ADR-0003](adr/0003-autenticazione-better-auth.md)) |
| Build Next.js lenta/pesante sul Pi | Media | Misura in fase 6; alternativa: build multi-arch su GitHub Actions + GHCR |
| Google Books: quota o dati incompleti | Bassa | Fallback Open Library, cache delle risposte, completamento manuale |
| Prisma 8 ancora in RC | Bassa | Fissiamo Prisma 7.x stabile |
| Migrazione distruttiva in produzione | Bassa | Solo `migrate deploy`, backup prima di ogni aggiornamento, migrazioni expand/contract |

## Complessità stimata
Alta nel complesso (sicurezza, scanner, operatività), ma ogni fase è media e verificabile da sola.
