# Plan: Statistiche di lettura

**Source PRD**: .claude/prds/letture-voti-generi.prd.md
**Selected Milestone**: 5 — Statistiche
**Complexity**: Medium

## Summary
Una nuova pagina **Statistiche** (`/statistiche`), visibile a tutti gli utenti collegati e raggiunta da un
pulsante in cima al Catalogo (la barra in basso non cambia). I dati arrivano da una sola richiesta
`GET /api/stats`, che fa tutte le letture in un solo viaggio verso D1. Non servono tabelle nuove,
migrazioni né modifiche al backup: si usano `book_reading` (data = `created_at`, voto), `book_current_reading`,
`book` e `user`. I grafici sono barre in CSS con il numero scritto accanto, senza librerie.

## Sezioni della pagina
| # | Sezione | Contenuto | Se è vuota |
|---|---|---|---|
| 1 | Chi legge di più | per persona: libri letti, % del catalogo, voti dati | «Nessuno ha ancora segnato un libro come letto.» |
| 2 | Sta leggendo | persona → libro (link alla scheda) | «Nessuno sta leggendo un libro in questo momento.» |
| 3 | Letture per mese | ultimi 12 mesi, barre orizzontali (mese corrente compreso, anche i mesi a zero) | sezione sempre visibile, con zeri |
| 4 | Letture per anno | tutti gli anni con letture | come sopra |
| 5 | I più apprezzati | libri con **almeno 2 voti**, media decrescente, primi 5 | «Servono almeno 2 voti sullo stesso libro.» |
| 6 | Autori più letti | autori per numero di letture, primi 5 | messaggio |
| 7 | Generi più letti | generi per numero di letture, «Senza genere» a parte | messaggio |
| 8 | Letture in comune | per ogni coppia di persone, quanti libri hanno letto entrambi (decrescente, primi 5) | «Ancora nessun libro letto da due persone.» |

Sotto «Letture per mese» una nota: «Le letture segnate prima di novembre 2026 hanno la data del giorno in cui
sono state registrate nell'app.» (decisione del PRD, 31/10/2026).

Persone disattivate (scelta del 02/11/2026): le loro letture e i loro voti contano nei totali, nei più
apprezzati, negli autori e nei generi, ma non compaiono in «Chi legge di più» né in «Letture in comune».

Mesi e anni si calcolano con l'ora italiana (Europe/Rome), non UTC: una lettura segnata il 31 dicembre
alle 23:30 va in dicembre.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Rotta in sola lettura | `worker/audit-log/routes.ts:7` + `worker/index.ts:29-36` | `new Hono<AppEnv>().get("/", …)`, registrata con `app.route` |
| Più query in un viaggio | `worker/catalog/queries.ts:119` (`getBookDetail`) | `runBatch(db, [sql…, sql…])`, righe tipizzate a mano |
| Autori in JSON | `worker/csv/service.ts:52` | `authors` è un array JSON → `json_each` in SQL |
| Etichette dei generi | `shared/genres.ts` | `genreLabel(key)` |
| Pagina | `src/pages/catalog.tsx`, `src/components/ui.tsx:161,173` | `PageHeader` con `action`, `Section`, `Notice`, `useApi` |
| Test di integrazione | `tests/worker/audit-log.test.ts`, `tests/worker/catalog.test.ts` | `signedIn(key, …)`, chiamate reali al Worker con D1 locale |
| E2E e a11y | `tests/e2e/app.spec.ts`, `tests/e2e/a11y.spec.ts:7` | percorso dal Catalogo; `/statistiche` nell'elenco PAGES |

## Files to Change
| File | Action | Why |
|---|---|---|
| `worker/stats/service.ts` | CREATE | `getStats(db, now)`: query in un `runBatch`, aggregazione per mese/anno in ora italiana |
| `worker/stats/routes.ts` | CREATE | `GET /` |
| `worker/index.ts` | UPDATE | `app.route("/stats", statsRoutes)` |
| `shared/months.ts` | CREATE | `romeMonthKey(iso)` e `lastMonths(now, 12)`: funzioni pure, testate a parte |
| `src/pages/stats.tsx` (+ `src/pages/stats/*.tsx` se supera ~200 righe) | CREATE | pagina e sezioni |
| `src/components/bar-list.tsx` | CREATE | barre orizzontali accessibili (testo + valore, la barra è decorativa) |
| `src/app.tsx` | UPDATE | rotta `/statistiche` |
| `src/pages/catalog.tsx` | UPDATE | pulsante «Statistiche» nell'`action` del `PageHeader` |
| `tests/unit/months.test.ts` | CREATE | ora legale, cambio d'anno, 12 mesi a ritroso |
| `tests/worker/stats.test.ts` | CREATE | ogni sezione, sezioni vuote, utenti senza letture |
| `tests/e2e/app.spec.ts`, `tests/e2e/a11y.spec.ts` | UPDATE | percorso Catalogo → Statistiche; axe sulla pagina |
| `README.md`, `docs/permissions.md` | UPDATE | pagina nuova, visibile a tutti |

## Tasks
### Task 1: Mesi in ora italiana (TDD)
- **Action**: RED su `romeMonthKey("2026-12-31T23:30:00Z") === "2027-01"`, `"2026-03-31T22:30:00Z"` (ora legale) `=== "2026-04"`, `lastMonths(2026-11-02, 12)` = `2025-12 … 2026-11`; poi GREEN con `Intl.DateTimeFormat` su `Europe/Rome` (un solo formatter).
- **Validate**: `pnpm test tests/unit/months.test.ts`

### Task 2: API `GET /api/stats` (TDD)
- **Action**: RED in `tests/worker/stats.test.ts` con 3 utenti, 4 libri, letture con date diverse (scritte in D1), voti e «Sto leggendo». Controlli per ogni sezione, per i vuoti (catalogo senza letture), per il minimo di 2 voti, per un lettore senza letture (compare con 0), per gli autori di un libro con due autori.
- GREEN: `runBatch` con 6–7 query (`GROUP BY`, `json_each`, `LIMIT 5`); le letture per mese/anno si aggregano nel Worker dalla sola colonna `created_at`.
- Chiunque sia collegato può leggerle: nessuna nuova azione in `shared/policy.ts` (come il catalogo).
- **Validate**: `pnpm test tests/worker/stats.test.ts`

### Task 3: Misura della CPU
- **Action**: D1 locale riempito con ~500 libri, 5 utenti e ~1.500 letture; misura di `GET /api/stats`; obiettivo < 10 ms di CPU. Se serve, la query mensile si limita agli ultimi 12 mesi in SQL.
- **Validate**: numero misurato riportato nel resoconto.

### Task 4: Pagina e pulsante
- **Action**: `stats.tsx` con le sezioni nell'ordine della tabella; `BarList` (etichetta, barra larga in proporzione al massimo, valore in cifre; `aria-hidden` sulla barra); token di colore esistenti; pulsante «Statistiche» (min 44 px) nell'intestazione del Catalogo; stato di caricamento ed errore come nel Catalogo.
- **Mirror**: `catalog.tsx`, `Section`, `Notice`.
- **Validate**: `pnpm typecheck && pnpm lint`; controllo visivo a 390 px e 1440 px.

### Task 5: E2E e accessibilità
- **Action**: dal Catalogo si tocca «Statistiche», compaiono i titoli delle sezioni e il libro letto nello stesso test; axe su `/statistiche`; nessuno scorrimento orizzontale sul telefono.
- **Validate**: `pnpm e2e`

### Task 6: Documenti e chiusura
- **Action**: README, permessi; revisione `ecc:code-reviewer`; push, Deploy, backup di controllo, prova online.

## Validation
```bash
pnpm typecheck && pnpm lint
pnpm test:coverage
pnpm e2e
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| CPU sopra i 10 ms | Bassa | un solo `runBatch`, aggregati in SQL, misura con dati finti (Task 3) prima del rilascio |
| Mesi sbagliati a cavallo di mezzanotte o dell'ora legale | Media | conversione in Europe/Rome, test dedicati |
| Andamento sbilanciato su ottobre 2026 | Certa | nota nella pagina (accettato nel PRD) |
| Autori scritti in modi diversi («Calvino, Italo» / «Italo Calvino») contati due volte | Media | accettato per ora; nessuna fusione automatica |
| Pagina lunga sul telefono | Media | sezioni compatte, primi 5 per classifica |

## Acceptance
- [ ] Pulsante «Statistiche» nel Catalogo; pagina visibile a ogni ruolo
- [ ] Tutte le sezioni con dati corretti e messaggi chiari quando sono vuote
- [ ] Mesi e anni in ora italiana
- [ ] CPU misurata sotto i 10 ms con dati realistici
- [ ] Test unitari, di integrazione ed E2E verdi; copertura ≥ 80%; axe senza violazioni
- [ ] Nessuna migrazione; backup invariato
