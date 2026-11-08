# Plan: Catalogo con scorrimento continuo

**Source**: scelta dell'admin dell'08/11/2026 tra tre proposte: «C con B di riserva, sì al contatore»
**Complexity**: Medium — interfaccia del catalogo e una piccola aggiunta all'API, nessuna migrazione

## Summary
Il catalogo non è più diviso in pagine: scorrendo, quando ci si avvicina al fondo arrivano da soli i 24 libri
successivi. Se il caricamento automatico non parte (lettore di schermo, tastiera, errore di rete) c'è il tasto
«Mostra altri». Sotto l'elenco un contatore «48 di 312 libri». Tornando dalla scheda di un libro si ritrovano
i libri già caricati e la posizione. Ogni blocco è la stessa richiesta di oggi (CPU per richiesta invariata).

## Misure di partenza (08/11/2026)
- CPU del Worker per una pagina di catalogo in produzione: p50 2–3 ms, p90 4–7 ms (limite 10 ms).
- Database di prova con 3.000 libri: 0,14–0,55 ms per blocco, all'inizio come in fondo e con i filtri.
- Righe lette: scorrere tutto un catalogo di 3.000 libri ≈ 190.000 righe (limite 5 milioni al giorno).

## Decisioni
| Tema | Scelta |
|---|---|
| Blocchi | 24 libri, come oggi; la richiesta resta `GET /api/books?…&page=N` |
| Totale | `total` solo nel primo blocco (`page=0`): una `count(*)` con gli stessi filtri, nella stessa andata a D1 |
| Ritorno dalla scheda | i blocchi caricati restano in memoria (per filtro/ricerca) finché si naviga nell'app; si svuotano dopo ogni modifica (aggiunta, cambio dati, letture…) per non mostrare dati vecchi |
| Indirizzo | filtri e ricerca restano nell'indirizzo; il parametro `pagina` sparisce (nei vecchi link si ignora) |
| Posizione tornando indietro | ripristinata da `ScrollRestoration` (già in `layout.tsx`) perché l'elenco è subito pronto dalla memoria |

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Query del catalogo | `worker/catalog/queries.ts:60-100` | condizioni in `conditions: SQL[]`, `LIMIT PAGE_SIZE + 1` per `hasMore` |
| Più query in un viaggio | `worker/catalog/queries.ts` (`getBookDetail`) | `runBatch(db, [...])` |
| Lettura dall'API | `src/lib/use-api.ts`, `src/lib/api.ts` | `api()` con un nuovo tentativo per le letture; `send()` per le scritture |
| Logica pura testata | `src/pages/book/reading-status-logic.ts` | funzioni senza React con test unitari |
| Test catalogo | `tests/worker/catalog.test.ts:102` | 30 libri inseriti, controllo dell'ordine e di `hasMore` |
| E2E | `tests/e2e/app.spec.ts` | percorso dal telefono, CSP controllata |

## Files to Change
| File | Action | Why |
|---|---|---|
| `worker/catalog/queries.ts` | UPDATE | `total` nel primo blocco (count con gli stessi filtri, in `runBatch`) |
| `tests/worker/catalog.test.ts` | UPDATE | `total` con e senza filtri; assente nei blocchi successivi |
| `src/lib/catalog-cache.ts` | CREATE | blocchi caricati per chiave (filtri + ricerca); `clear()` |
| `src/lib/api.ts` | UPDATE | `send()` riuscito → svuota la memoria del catalogo |
| `src/pages/catalog/infinite-list.ts` (logica pura) | CREATE | unione dei blocchi senza doppioni, testo del contatore («48 di 312 libri», «1 libro») |
| `src/pages/catalog.tsx` | UPDATE | elenco a blocchi, sentinella con `IntersectionObserver` (~600 px prima del fondo), tasto «Mostra altri», contatore con `aria-live`, via la navigazione a pagine |
| `tests/unit/infinite-list.test.ts` | CREATE | logica pura |
| `tests/e2e/app.spec.ts`, `tests/e2e/a11y.spec.ts` | UPDATE | 30 libri: si scorre e compaiono tutti; «Mostra altri»; ritorno dalla scheda con lista e posizione; axe |
| `README.md` | UPDATE | una riga |

## Tasks
### Task 1: `total` nell'API (TDD)
- RED: `GET /books` (primo blocco) ha `total` = numero di libri che rispettano filtri e ricerca; con `page=1` non c'è.
- GREEN: `count(*)` con lo stesso `search` e `where`, nella stessa `runBatch` della lista.
- **Validate**: `pnpm test tests/worker/catalog.test.ts`

### Task 2: Logica pura (TDD)
- `mergePages` (nessun doppione se un libro cambia posto tra un blocco e l'altro), `countLabel(loaded, total)`.
- **Validate**: `pnpm test tests/unit/infinite-list.test.ts`

### Task 3: E2E (RED), poi interfaccia (GREEN)
- E2E: 30 libri con una parola unica nel titolo; la ricerca li filtra; all'inizio 24 e «24 di 30 libri»; scorrendo diventano 30 e «30 di 30 libri», niente più tasto; apro un libro, torno indietro: ancora 30 e stessa posizione; con un errore di rete simulato compare il messaggio e «Mostra altri» riprova.
- Interfaccia come in tabella; un solo blocco alla volta; errore mostrato sopra il tasto.
- **Validate**: `pnpm typecheck && pnpm lint && pnpm e2e`

### Task 4: Verifica e chiusura
- Screenshot a 390 px (chiaro e scuro); revisione `ecc:code-reviewer` e `ecc:react-reviewer`; push, Deploy, backup di controllo; il rapporto del lunedì confermerà la CPU per richiesta.

## Validation
```bash
pnpm typecheck && pnpm lint
pnpm test:coverage
pnpm e2e
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Doppioni o buchi se qualcuno aggiunge un libro mentre scorri | Bassa | `mergePages` toglie i doppioni; un libro nuovo comparirà alla prossima apertura |
| Dati vecchi tornando dalla scheda dopo una modifica | Media | memoria svuotata dopo ogni scrittura riuscita |
| Caricamenti a raffica | Bassa | un blocco alla volta; la sentinella si riattiva solo dopo l'arrivo del blocco |
| Righe lette con cataloghi molto lunghi | Bassa | ~190.000 per uno scorrimento completo di 3.000 libri; se servisse, ripartenza dall'ultimo titolo (25 righe a blocco) |

## Acceptance
- [ ] Scorrendo arrivano da soli i libri successivi; «Mostra altri» c'è come riserva
- [ ] Contatore «N di M libri» corretto con filtri e ricerca
- [ ] Ritorno dalla scheda: stessi libri, stessa posizione
- [ ] CPU per richiesta invariata; test unitari ed E2E verdi
