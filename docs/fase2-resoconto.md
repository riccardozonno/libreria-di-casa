# Fase 2 — Fondamenta: resoconto (30/10/2026)

## Fatto
- Progetto v2 nella radice del branch `cloudflare` (la v1 è nel tag `v1-nextjs`): `worker/` (API Hono), `src/` (React), `shared/` (logica pura), `migrations/` (D1).
- Schema D1 completo con vincoli CHECK (ruoli, colori, ISBN di 13 cifre, autori come lista JSON, email minuscole), chiavi esterne, ricerca FTS5 senza accenti agganciata a `book.seq` (chiave numerica stabile anche dopo VACUUM), registro attività in sola aggiunta (trigger).
- Accesso: JWT di Access verificato con WebCrypto (firma, emittente, audience, scadenza, rotazione delle chiavi), utente e sedi riletti da D1 a ogni richiesta, "esci da tutti i dispositivi" (`sessions_not_before`), identità di sviluppo solo fuori produzione.
- Difese: intestazioni di sicurezza su API e file statici, CSP stretta senza script inline, controllo dell'origine sulle scritture.
- Permessi, ISBN, validazioni e colori portati dalla v1 con i loro test.
- `pnpm admin:create` (SQL generato da input validati, testato).
- Test: 115 unitari, 23 d'integrazione nel runtime Workers con le migrazioni vere, 6 E2E (iPhone/WebKit, Android/Chromium) sulla build vera; copertura ~92%. CI su GitHub Actions.
- Online: Worker `homelibrary`, D1 `homelibrary`, bucket `homelibrary-covers`, app Access con One-time PIN. Utenti: Riccardo (admin), Filiberto Canino (editor).

## CPU per richiesta (`GET /api/me`, iPhone, limite gratuito 10 ms)

| Versione | Richieste normali | Primo avvio di un'istanza |
|---|---|---|
| Prima stesura | 3 ms | 10–11 ms |
| Ottimizzata (token verificati in memoria, una query, client D1 riusato) | **0–2 ms** | **7–12 ms** |

Tutte le richieste sono andate a buon fine. Il costo del primo avvio è il lavoro una tantum dell'istanza (chiavi di Access, prima query), non del codice di ogni richiesta.

**Decisione (Riccardo, 30/10/2026): opzione 1.** Si accetta, con la rete di sicurezza: il client ripete una volta le letture fallite per errore temporaneo (mai le scritture). Ricontrollo dei numeri in fase 5 con l'app completa; se gli sforamenti fossero frequenti si valuta Workers Paid (5 $/mese, nessun cambio di codice).

## Pulizia
Risorse della prova di fase 1 cancellate (Worker, D1, bucket) e cartella `spike/` rimossa. Resta da togliere a mano l'applicazione Access `homelibrary-spike`.

## Ricontrollo in fase 5 (31/10/2026, app completa, 30 richieste da iPhone)
Tutte le richieste riuscite. A regime 1–5 ms per ogni operazione (catalogo 2–4, scheda 2–3, copertine 1–3, export CSV 5, ricerca ISBN 5). Sopra i 10 ms solo le richieste che hanno avviato un'istanza nuova (`/api/me` 12–13 ms, scheda 11 ms) e un salvataggio di libro con download della copertina (17 ms). Con poco traffico Cloudflare chiude le istanze dopo circa mezzo minuto di pausa, quindi i primi avvii sono frequenti. Il pacchetto del Worker è dominato da zod (≈ 360 KB di sorgente su ≈ 710), seguito da drizzle (≈ 175 KB).

**Decisione (Riccardo, 31/10/2026): teniamo così e controlliamo.** Nessuna modifica ora; nella fase 6 un controllo settimanale automatico (GitHub Actions) conta le richieste rifiutate per limite di CPU e avvisa se ce ne sono. Se succede: prima alleggerire l'avvio (zod "mini", caricamento del codice per pagina), in ultima istanza Workers Paid.
