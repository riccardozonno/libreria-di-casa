# Matrice dei permessi

Applicata **solo lato server** dal modulo `src/server/policy.ts` (funzioni pure, testate una per una), chiamato da ogni Server Action e Route Handler prima di qualsiasi lettura o scrittura. L'interfaccia nasconde i pulsanti non permessi, ma è solo una comodità.

Legenda: ✅ sì · ❌ no · **S** = sede della copia · **S→T** = da sede S a sede T · "editor(S)" = editor assegnato alla sede S.

| Operazione | Admin | Editor | Lettore |
|---|---|---|---|
| Accedere, vedere catalogo, schede, sedi (anche archiviate), storico spostamenti | ✅ | ✅ | ✅ |
| Cercare e filtrare | ✅ | ✅ | ✅ |
| Segnare/togliere **sé stesso** in "Letto da" | ✅ | ✅ | ✅ |
| Segnare/togliere **altri utenti** in "Letto da" | ✅ | ❌ | ❌ |
| Lookup ISBN (Google Books / Open Library) | ✅ | ✅ se editor di almeno una sede attiva | ❌ |
| Creare libro + prima copia in S (dati compilabili in creazione) | ✅ | ✅ se editor(S) | ❌ |
| Aggiungere una copia di un libro esistente in S | ✅ | ✅ se editor(S) | ❌ |
| Modificare collocazione/note di una copia in S | ✅ | ✅ se editor(S) | ❌ |
| Eliminare una copia in S che non è l'ultima del libro | ✅ | ✅ se editor(S) | ❌ |
| Eliminare l'**ultima** copia (elimina anche il libro e le sue letture) | ✅ | ⚠️ da decidere ([domanda aperta](#domanda-aperta)) | ❌ |
| Spostare una copia S→T | ✅ | ✅ se editor(S) **e** editor(T) | ❌ |
| Modificare dati bibliografici/copertina dopo la creazione | ✅ | ❌ | ❌ |
| Creare, rinominare, archiviare, riattivare sedi | ✅ | ❌ | ❌ |
| Export CSV (totale o per sede) | ✅ | ❌ | ❌ |
| Import CSV (anche prova a secco) | ✅ | ❌ | ❌ |
| Gestire utenti: crea, ruolo, sedi, disattiva, link invito/reset | ✅ | ❌ | ❌ |
| Consultare il registro attività | ✅ | ❌ | ❌ |
| Proprio profilo: cambio password, esci da tutti i dispositivi, 2FA | ✅ | ✅ | ✅ |

## Regole aggiuntive

| Regola | Effetto |
|---|---|
| Sede archiviata | Nessuno aggiunge copie o sposta copie **verso** di essa. Le copie che si trovano lì le modifica, elimina o sposta **fuori** solo l'admin; per gli editor sono in sola lettura. |
| Utente disattivato | Login rifiutato, tutte le sessioni revocate subito. |
| Ultimo admin attivo | Non può essere disattivato né declassato (neanche da sé stesso). |
| Cambio di ruolo o di sedi | Ha effetto alla richiesta successiva: ruolo e sedi si leggono dal DB a ogni richiesta, non dalla sessione. |
| Editor senza sedi | Si comporta come lettore. |
| Admin e sedi | L'admin non ha bisogno di assegnazioni: vale per tutte le sedi. |
| 2FA (produzione) | Con `REQUIRE_ADMIN_2FA=true` un admin senza TOTP attivo può solo andare al profilo e attivarlo. |

## Registro attività

Ogni operazione di scrittura qui sopra produce una riga di audit **nella stessa transazione**: `book.create`, `book.update`, `book.delete` (con istantanea completa), `copy.create`, `copy.update`, `copy.move`, `copy.delete`, `location.create|rename|archive|restore`, `user.create|role_change|locations_change|deactivate|reactivate|invite_link|reset_link|2fa_reset`, `csv.import|export`, `reading.mark|unmark`.

Gli eventi di autenticazione avvengono dentro Better Auth e si registrano nei suoi hook `after`, in una transazione separata: `auth.login`, `auth.login_failed`, `auth.lockout`, `auth.password_reset`, `auth.password_change`, `auth.logout_all`, `auth.2fa_enable|2fa_disable`.

## Domanda aperta
Eliminare l'ultima copia elimina anche il libro, cioè dati bibliografici che l'editor non potrebbe modificare, e le letture di tutti. Due opzioni:
- **A (proposta)**: l'editor può farlo (la copia è davvero sparita), con conferma esplicita; nel registro resta un'istantanea completa e l'admin può ricrearlo.
- **B**: solo l'admin può eliminare l'ultima copia; l'editor vede "chiedi all'amministratore".

## Test
Una test-suite tabellare percorre **ogni riga × ogni ruolo × ogni caso di sede** (editor della sede giusta / sbagliata / di entrambe / sede archiviata) sia sulle funzioni della policy (unit) sia sulle Server Action reali contro un Postgres di test (integration). Gli E2E Playwright verificano i tre ruoli dall'interfaccia.
