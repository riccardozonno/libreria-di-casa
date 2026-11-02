# Matrice dei permessi

Applicata **solo lato server** dalla funzione `can()` di `shared/policy.ts` (funzioni pure, testate una per una), chiamata dalle API del Worker (`worker/`) prima di qualsiasi lettura o scrittura. L'interfaccia nasconde i pulsanti non permessi, ma è solo una comodità.

Legenda: ✅ sì · ❌ no · **S** = sede della copia · **S→T** = da sede S a sede T · "editor(S)" = editor assegnato alla sede S.

| Operazione | Admin | Editor | Lettore |
|---|---|---|---|
| Accedere, vedere catalogo, schede, sedi (anche archiviate), storico spostamenti | ✅ | ✅ | ✅ |
| Cercare e filtrare | ✅ | ✅ | ✅ |
| Segnare/togliere **sé stesso** in "Letto da" | ✅ | ✅ | ✅ |
| Segnare/togliere **altri utenti** in "Letto da" | ✅ | ❌ | ❌ |
| Dare, cambiare o togliere il **proprio** voto (1–5 stelle) a un libro che ha segnato come letto | ✅ | ✅ | ✅ |
| Votare **al posto di un altro** utente | ❌ | ❌ | ❌ |
| Segnare/togliere **sé stesso** in «Sto leggendo» (solo se non ha già letto il libro) | ✅ | ✅ | ✅ |
| Segnare/togliere **altri utenti** in «Sto leggendo» | ✅ | ❌ | ❌ |
| Lookup ISBN (Google Books / Open Library) | ✅ | ✅ se editor di almeno una sede attiva | ❌ |
| Creare libro + prima copia in S (dati compilabili in creazione) | ✅ | ✅ se editor(S) | ❌ |
| Aggiungere una copia di un libro esistente in S | ✅ | ✅ se editor(S) | ❌ |
| Modificare collocazione/note di una copia in S | ✅ | ✅ se editor(S) | ❌ |
| Eliminare una copia in S che non è l'ultima del libro | ✅ | ✅ se editor(S) | ❌ |
| Eliminare l'**ultima** copia, cioè il libro con le sue letture | ✅ | ❌ (vede "solo l'amministratore può eliminare un libro") | ❌ |
| Spostare una copia S→T (T attiva) | ✅ | ✅ se editor(S), verso qualsiasi sede attiva; dopo lo spostamento la copia la gestiscono gli editor di T (decisione del 29/10/2026, opzione B, sostituisce "editor di S e di T") | ❌ |
| Modificare dati bibliografici/copertina dopo la creazione | ✅ | ❌ | ❌ |
| Creare sedi, cambiarne nome e colore, archiviarle, riattivarle | ✅ | ❌ | ❌ |
| Export CSV (totale o per sede) | ✅ | ❌ | ❌ |
| Import CSV (anche prova a secco) | ✅ | ❌ | ❌ |
| Gestire utenti: crea, ruolo, sedi, disattiva/riattiva, esci da tutti i dispositivi per un altro utente, testo d'invito | ✅ | ❌ | ❌ |
| Consultare il registro attività | ✅ | ❌ | ❌ |
| Proprio profilo: esci da tutti i dispositivi | ✅ | ✅ | ✅ |

## Regole aggiuntive

| Regola | Effetto |
|---|---|
| Sede archiviata | Nessuno aggiunge copie o sposta copie **verso** di essa. Le copie che si trovano lì le modifica, elimina o sposta **fuori** solo l'admin; per gli editor sono in sola lettura. |
| Utente disattivato | Tolto dal gruppo di Access (non riceve più il codice) e l'API lo rifiuta subito, anche con una sessione ancora aperta. |
| Ultimo admin attivo | Non può essere disattivato né declassato (neanche da sé stesso). |
| Cambio di ruolo o di sedi | Ha effetto alla richiesta successiva: ruolo e sedi si leggono da D1 a ogni richiesta, non dal token di Access. |
| Editor senza sedi | Si comporta come lettore. |
| Admin e sedi | L'admin non ha bisogno di assegnazioni: vale per tutte le sedi. |
| Esci da tutti i dispositivi | Il Worker rifiuta i token di Access emessi prima di quel momento: serve un codice nuovo. |
| Accesso | Nessuna password: Cloudflare Access manda un codice all'email; chi non è nel gruppo «Utenti HOME LIBRARY» non arriva all'app. |

## Registro attività

Ogni operazione di scrittura qui sopra produce una riga di audit **nello stesso batch D1** della modifica
(scritta prima, con la stessa condizione): `book.create`, `book.update`, `book.delete` (con istantanea
completa), `copy.create`, `copy.update`, `copy.move`, `copy.delete`,
`location.create|update|archive|restore`,
`user.create|role_change|locations_change|deactivate|reactivate|sign_out_everywhere`,
`csv.import|export`, `reading.mark|unmark|rate|start|stop` (quando «Letto» toglie «Sto leggendo» basta `reading.mark`, con `wasReading` nei dati).

Gli accessi (codici inviati, login riusciti o falliti) li registra Cloudflare Access nei suoi log
(Zero Trust → Logs → Access), non l'app.

## Test
Una test-suite tabellare percorre **ogni riga × ogni ruolo × ogni caso di sede** (editor della sede
giusta / sbagliata / di entrambe / sede archiviata) sia sulla policy (`tests/unit/policy.test.ts`) sia
sulle API reali nel runtime Workers con D1 (`tests/worker/`). Gli E2E Playwright verificano i tre ruoli
dall'interfaccia (`tests/e2e/`).
