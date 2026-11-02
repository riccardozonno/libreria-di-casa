# HOME LIBRARY

I libri di famiglia, in ogni sede. Web app installabile sul telefono (PWA) per catalogare libri e copie
in più case, con ruoli (amministratore, editor per sede, lettore).

App: **https://homelibrary.r-z030600.workers.dev** — gratis sul piano gratuito di Cloudflare
(Workers, D1, R2, Access), senza server e senza dominio. La versione 1 (Next.js + Postgres + Docker) resta
nel tag `v1-nextjs`.

Documenti: [piano](docs/PLAN.md) · [architettura](docs/architecture.md) · [modello dati](docs/data-model.md) ·
[permessi](docs/permissions.md) · [produzione](docs/produzione.md) · [backup e ripristino](docs/backup-restore.md) ·
[decisioni (ADR)](docs/adr/README.md).

## Guida d'uso

### Entrare

1. Apri l'indirizzo dell'app e scrivi la tua email: arriva un codice di 6 cifre (guarda anche nello spam).
2. Scrivi il codice: sei dentro per un mese. Niente password.
3. Se la tua email non è nell'elenco, il codice non arriva: chiedi all'amministratore di aggiungerti.

### Installarla sul telefono

- **iPhone (Safari)**: Condividi → **Aggiungi alla schermata Home**.
- **Android (Chrome)**: menu ⋮ → **Installa app** (o **Aggiungi a schermata Home**).

Le istruzioni sono anche nell'app, in **Profilo → Installa l'app**.

### Cosa si fa

| Scheda | Cosa trovi |
|---|---|
| **Catalogo** | Tutti i libri di casa. Cerca per titolo, autore o ISBN (gli accenti non contano), filtra per sede, per genere («Senza genere» trova i libri da completare) e per lettura: «Non letti da me», «Non letti da nessuno», «In lettura» (quelli che qualcuno sta leggendo). I filtri si combinano tra loro e con la ricerca. Tocca un libro per la scheda: copie e sedi, «Letto da» con i voti, spostamenti. Con «Sto leggendo» la famiglia vede chi lo ha in mano (sparisce quando lo segni come letto). Dopo «Segna come letto» puoi dare da 1 a 5 stelle (tocca di nuovo la stessa per toglierle): la scheda mostra la media e il voto di ognuno. Il pulsante **Statistiche** in alto apre le letture di tutta la famiglia: chi legge di più, chi sta leggendo cosa, letture per mese e per anno, i libri più apprezzati (almeno 2 voti), autori e generi più letti, letture in comune. |
| **Aggiungi** (editor e admin) | Inquadra il codice a barre sul retro del libro, oppure scrivi l'ISBN: i dati arrivano da Google Books o Open Library. Controlla, scegli il genere (se Google Books ne suggerisce uno è già scelto: verificalo), la sede e salva. Se non li trova, compili a mano e puoi fotografare la copertina. Se il libro c'è già, aggiungi una copia. |
| **Sedi** | Le case con il loro colore. L'admin le crea, rinomina, archivia e riattiva. |
| **Admin** (solo admin) | **Utenti**: aggiungi una persona (email, nome, ruolo, sedi) e mandale il testo d'invito; cambia ruolo o sedi, disattiva, fai uscire da tutti i dispositivi. **Registro attività**: chi ha fatto cosa e quando. **Import ed export CSV**: scarica il catalogo o carica molti libri insieme (prima la prova, poi l'import); la colonna `genere` è facoltativa. |
| **Profilo** | I tuoi dati, installazione dell'app, «Esci da tutti i dispositivi» se perdi il telefono. |

### Ruoli

- **Admin**: tutto, su tutte le sedi.
- **Editor**: aggiunge, modifica, sposta ed elimina copie nelle sue sedi; cambia il genere dei libri che hanno una copia nelle sue sedi; gli altri dati del libro dopo la creazione e l'eliminazione dell'ultima copia restano all'admin.
- **Lettore**: consulta tutto, segna i libri che sta leggendo e quelli che ha letto, e li vota.

Il voto lo dà solo chi ha letto il libro, per sé: nemmeno l'admin vota al posto di un altro.

Dettagli in [docs/permissions.md](docs/permissions.md).

### Se qualcosa non va

| Problema | Cosa fare |
|---|---|
| Il codice non arriva | Controlla lo spam e che l'email sia quella giusta; l'admin verifica che tu sia attivo in **Admin → Utenti**. |
| «Accesso scaduto o non valido» | Ricarica la pagina: Access chiede un codice nuovo. |
| Telefono perso | Da un altro dispositivo: **Profilo → Esci da tutti i dispositivi** (o lo fa l'admin per te). |
| «Troppe richieste» | Aspetta un minuto: ci sono limiti per persona contro gli abusi. |
| L'app non si apre affatto | L'admin guarda Cloudflare (dashboard Workers) e, se serve, torna alla versione precedente ([produzione.md](docs/produzione.md)). |

## Com'è fatta

| Parte | Tecnologia | Dove |
|---|---|---|
| Interfaccia (file statici, PWA) | React 19 + Vite + Tailwind 4 | `src/` |
| API JSON (`/api/*`) | Hono su Cloudflare Workers | `worker/` |
| Regole condivise (permessi, ISBN, validazioni) | TypeScript puro | `shared/` |
| Database | D1 (SQLite) + Drizzle, ricerca FTS5 | `worker/db/`, `migrations/` |
| Copertine | R2 | — |
| Accesso | Cloudflare Access (email + codice, nessuna password) | `worker/auth/` |

Ogni richiesta all'API verifica la firma del token di Access e rilegge utente, ruolo e sedi da D1.

## Avvio in locale (Mac)

Requisiti: Node 24+ e pnpm. Niente Docker: D1 e R2 girano in locale con Miniflare.

```bash
pnpm install
cp .dev.vars.example .dev.vars        # in locale Access è spento: entri come admin@example.test
pnpm db:migrate:local
pnpm admin:create --email admin@example.test --name "Admin di prova"
pnpm dev                              # http://localhost:5173
```

## Controlli

```bash
pnpm lint && pnpm typecheck
pnpm test                 # unitari (Node) + integrazione (runtime Workers con D1 e migrazioni vere)
pnpm test:coverage        # soglia 80%
pnpm e2e                  # Playwright sulla build vera: iPhone (WebKit) e Android (Chromium)
```

## Pubblicazione (solo l'amministratore del progetto)

Da GitHub: **Actions → Deploy → Run workflow**. Prima rifà tutti i controlli, poi applica le migrazioni
e pubblica. Accesso, ripristino di una versione precedente e Time Travel: [docs/produzione.md](docs/produzione.md).

L'app è su `https://homelibrary.r-z030600.workers.dev`, dietro Cloudflare Access (codice via email,
sessione di un mese).
