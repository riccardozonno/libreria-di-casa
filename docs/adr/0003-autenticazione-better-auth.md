# ADR-0003: Autenticazione con Better Auth, argon2id, inviti e reset tramite link monouso

**Date**: 2026-10-29
**Status**: proposed
**Deciders**: Riccardo Zonno, Claude

## Context
Login email+password, niente server di posta, utenti creati dall'admin, link d'invito (72 h) e di reset monouso, 2FA TOTP predisposta, blocco dopo tentativi falliti. Niente crittografia o sessioni fatte a mano.

## Decision
- **Better Auth 1.7** con adapter Prisma, `emailAndPassword` attivo e **registrazione pubblica disattivata**.
- Hash password **argon2id** tramite `@node-rs/argon2` collegato alle opzioni `password.hash/verify` di Better Auth (parametri OWASP: m=19 MiB, t=2, p=1); lunghezza 12–128.
- Sessioni nei cookie di Better Auth (`httpOnly`, `Secure`, `SameSite=Lax`, `__Secure-`), durata 30 giorni con rinnovo; "esci da tutti i dispositivi" = `revokeSessions`.
- **Campi protetti**: `role`, `active`, `failedLoginCount`, `lockedUntil` sono `additionalFields` con `input: false` (mai impostabili dal client). `disabledPaths`: `/sign-up/email`, `/update-user`, `/change-email`, `/delete-user`, `/request-password-reset` (nessuna di queste serve agli utenti; nome e ruolo li cambia l'admin con le nostre Server Actions).
- **Inviti e reset**: l'admin crea l'utente senza password. Una Server Action solo-admin genera lato server un token monouso nella tabella `verification` tramite l'`internalAdapter` di Better Auth (stesso formato del flusso di reset, scadenza 72 h), con `verification.storeIdentifier: "hashed"` (nel DB c'è solo l'hash). L'URL si costruisce da `BETTER_AUTH_URL` fissato in `.env`, mai dall'header `Host`. Il link passa da un'interfaccia `Mailer`: oggi `ShowLinkToAdminMailer` lo restituisce all'admin da copiare, domani un `SmtpMailer` lo spedisce. La pagina del link usa il normale `resetPassword` di Better Auth. Con `revokeSessionsOnPasswordReset: true`; dopo il reset si azzerano i contatori di blocco; utenti disattivati: link rifiutato. **Spike all'inizio della fase 2**: verificare che `resetPassword` crei l'account "credential" se l'utente non ne ha uno (altrimenti lo si crea vuoto alla creazione dell'utente).
- **Utenti disattivati**: rifiutati in `databaseHooks.session.create.before` (nessuna sessione nuova) e le sessioni esistenti revocate alla disattivazione. `session.cookieCache` **spento**, così revoche e "esci da tutti i dispositivi" valgono subito.
- **Rate limit** integrato di Better Auth per IP, storage **in memoria** (una sola istanza), applicato anche a `/two-factor/*` + **blocco per account** (5 errori → 15 min) tramite hook `before/after` sul sign-in: incremento atomico (`failedLoginCount = failedLoginCount + 1`), stessa risposta e stessi tempi per email inesistenti.
- **2FA**: plugin `twoFactor` (TOTP + codici di recupero) attivo per tutti come opzione; con `REQUIRE_ADMIN_2FA=true` (produzione) gli admin devono attivarla.

## Alternatives Considered
### Auth.js (NextAuth) v5
- **Pro**: molto diffuso.
- **Contro**: il provider credentials è sconsigliato dagli stessi autori e lascia hashing, lockout e reset a carico nostro.
- **Perché no**: andrebbe contro "niente crittografia fatta a mano".
### Lucia / sessioni proprie
- **Pro**: controllo totale.
- **Contro**: Lucia è ora solo una guida; scriveremmo noi sessioni e token.
- **Perché no**: stesso motivo.
### Hash scrypt predefinito di Better Auth
- **Pro**: zero configurazione.
- **Contro**: il brief preferisce argon2id.
- **Perché no**: argon2id è un'opzione supportata e costa una riga di configurazione.

## Consequences
### Positive
- Sessioni, token, CSRF/Origin, rate limit e TOTP sono codice mantenuto da altri e già verificato.
- Aggiungere l'email in futuro = nuova implementazione di `Mailer`.
### Negative
- La scadenza dei token di reset è unica: anche il reset scade dopo 72 h (accettabile; configurabile).
- `@node-rs/argon2` è un modulo nativo: va verificato sull'immagine arm64 (ha binari precompilati per linux-arm64 gnu/musl).
### Risks
- Cambiamenti di API tra versioni minori di Better Auth: versione fissata nel lockfile, test di integrazione sui flussi di auth.
