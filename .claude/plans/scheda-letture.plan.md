# Plan: Letture nella scheda del libro (selettore di stato + riepilogo a scomparsa)

**Source**: richiesta dell'admin del 04/11/2026 («non si capisce nulla»), critica di design e scelta tra 3 proposte: mix della 2 (selettore di stato) e della 3 (voti a scomparsa)
**Complexity**: Medium — solo interfaccia, nessuna modifica ad API, database o backup

## Summary
Sotto la testata del libro un **selettore a tre posizioni** «Da leggere · Sto leggendo · Letto» mostra e cambia
il tuo stato; su «Letto» compaiono subito sotto le tue stelle. La famiglia diventa un **riepilogo a scomparsa**,
sempre chiuso all'apertura: iniziali, «★ 4,5 · 2 letti · 1 in lettura»; aperto, due gruppi «L'hanno letto · N»
(con le stelle di ognuno) e «Lo stanno leggendo · N». «Cambia genere» e «Modifica dati» diventano link discreti
separati dalla lettura.

## Decisioni (04/11/2026)
| Tema | Scelta |
|---|---|
| Da «Letto» verso un'altra posizione | Conferma in linea: «Togliere "letto"? Il tuo voto si perde.» → «Togli "letto"» / «Annulla». Vale anche verso «Sto leggendo» (prima si toglie «letto», poi si segna «Sto leggendo») |
| Riepilogo famiglia | Sempre chiuso all'apertura; resta aperto finché sei sulla scheda |
| Voti | Solo stelle, nessun testo (come da PRD) |
| Persone disattivate | Come oggi nella scheda (il dettaglio del libro non filtra gli utenti) |

## Aggiunta del 04/11/2026: un solo tasto «Modifica dati»
«Cambia genere» e «Modifica dati» diventano **un tasto unico «Modifica dati»**, con il genere dentro il modulo.
Scelta dell'admin: l'editor modifica **tutti** i dati del libro (titolo, autori, anno, ISBN, descrizione,
genere, copertina), ma solo dei libri con una copia in una sua sede attiva — la stessa regola che oggi vale
per il genere. **Cambia un permesso, quindi anche sul server:**
- `shared/policy.ts`: `book.update` prende `copyLocations` (admin, oppure `edits()` su una di quelle sedi); `book.genre` si toglie.
- `PATCH /books/:id` accetta anche `genre` (facoltativo) e lo salva nello stesso batch, con il registro `book.update`; la rotta `PUT /books/:id/genre` e `setBookGenre` si tolgono.
- `PUT /books/:id/cover`: stesso permesso, sempre controllato prima di leggere i byte.
- Test: policy (unità), catalogo e copertine (integrazione: editor della sede con copia sì, editor di un'altra sede no, lettore no); `docs/permissions.md` e una nota in ADR-0006.
- Interfaccia: `EditBookForm` con il menu del genere; `genre-form.tsx` si toglie.

## Transizioni del selettore (chiamate API già esistenti)
| Da → A | Chiamate | Conferma |
|---|---|---|
| Da leggere → Sto leggendo | `PUT /books/:id/current-readers/:me` | no |
| Da leggere → Letto | `PUT /books/:id/readings/:me` | no |
| Sto leggendo → Letto | `PUT /books/:id/readings/:me` (il server toglie «Sto leggendo») | no |
| Sto leggendo → Da leggere | `DELETE /books/:id/current-readers/:me` | no |
| Letto → Da leggere | `DELETE /books/:id/readings/:me` | **sì** |
| Letto → Sto leggendo | `DELETE …/readings/:me`, poi `PUT …/current-readers/:me` | **sì** |

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Chiamate e errori | `src/pages/book/reading-toggle.tsx:9-21` | `send()` + `errorMessage()`, `Notice tone="error"` sotto il controllo |
| Doppio tocco e focus | `src/pages/book/star-rating.tsx:28-48,59` | `useRef` contro il doppio tocco, `aria-disabled` invece di `disabled` |
| Pulsanti a stato | `src/pages/book/star-rating.tsx:52-65` | `role="group"` + `aria-label`, `aria-pressed`, 44 px |
| Componenti UI | `src/components/ui.tsx` | `Button`, `buttonClasses`, `Notice`, `Section`, token di colore (`--star`, `accent`) |
| Logica pura testata | `shared/months.ts` + `tests/unit/months.test.ts` | funzioni pure in un modulo a parte, test unitari Vitest |
| E2E | `tests/e2e/app.spec.ts:47-70`, `tests/e2e/a11y.spec.ts:40-55` | percorso dell'admin; axe con i pannelli aperti |

Nessun test di componenti React nel progetto (niente Testing Library): la logica va in funzioni pure testate
a unità, il comportamento visibile negli E2E.

## Files to Change
| File | Action | Why |
|---|---|---|
| `src/pages/book/reading-status-logic.ts` | CREATE | `statusOf`, `transition(from, to)` → chiamate + `needsConfirm`; `familySummary(readings, currentReaders, me)` → iniziali, testo, gruppi ordinati |
| `src/pages/book/reading-status.tsx` | CREATE | selettore a 3 posizioni, conferma in linea, stelle sotto «Letto» |
| `src/pages/book/family-readings.tsx` | CREATE | riepilogo a scomparsa (`aria-expanded`, `aria-controls`) e gruppi |
| `src/pages/book/star-rating.tsx` | UPDATE | testo di aiuto più corto; stelle di sola lettura per i gruppi |
| `src/pages/book.tsx` | UPDATE | nuovo ordine: testata → selettore → riepilogo → link di gestione → moduli → descrizione → copie → spostamenti; via la sezione «Letto da» |
| `src/pages/book/reading-toggle.tsx`, `current-reading-toggle.tsx` | DELETE | sostituiti dal selettore |
| `tests/unit/reading-status-logic.test.ts` | CREATE | tutte le transizioni, riepilogo e ordinamento |
| `tests/e2e/app.spec.ts`, `tests/e2e/a11y.spec.ts` | UPDATE | nuovi controlli e testi; axe con riepilogo aperto e con la conferma aperta |
| `README.md` | UPDATE | descrizione della scheda |

## Tasks
### Task 1: Logica pura (TDD)
- **Action**: RED su ogni riga della tabella delle transizioni (chiamate in ordine, `needsConfirm`) e su «stesso stato → nessuna chiamata»; riepilogo: «★ 4,5 · 2 letti · 1 in lettura», singolari («1 letto»), senza voti («2 letti · 1 in lettura»), vuoto («Nessuno l'ha ancora letto o iniziato»), iniziali (max 4 + «+N»), gruppi ordinati (con voto prima, voto decrescente, poi nome; «(tu)» sul tuo nome). Poi GREEN.
- **Validate**: `pnpm test tests/unit/reading-status-logic.test.ts`

### Task 2: E2E (RED)
- **Action**: riscrivere il percorso dell'admin: selettore su «Sto leggendo» → riepilogo «1 in lettura»; «Letto» → compare «Il tuo voto», voto 4, riepilogo «★ 4 · 1 letto»; tocco su «Da leggere» → conferma → «Annulla» lascia tutto com'era → di nuovo e «Togli "letto"» → voto sparito. Riepilogo chiuso all'apertura, aperto con un tocco mostra i gruppi. Focus: dopo conferma/annulla torna sul selettore. Axe con riepilogo aperto e conferma aperta.
- **Validate**: `pnpm e2e` → rosso per il motivo giusto

### Task 3: Componenti (GREEN)
- **Action**: `ReadingStatus` (`role="group"` «Il tuo stato», 3 pulsanti `aria-pressed`, 44 px, larghezza piena, testo che va a capo su schermi stretti), conferma in linea con focus su «Annulla»; `FamilyReadings` (pulsante riepilogo con freccia, pannello con due gruppi, stelle di sola lettura con etichetta «4 stelle su 5»); link «Cambia genere» / «Modifica dati» con `Button variant="ghost"`, sempre a 44 px.
- **Validate**: `pnpm typecheck && pnpm lint && pnpm e2e`

### Task 4: Verifica visiva
- **Action**: screenshot a 320, 390 e 1440 px, chiaro e scuro, nei tre stati con riepilogo chiuso e aperto; nessuno scorrimento orizzontale.

### Task 5: Chiusura
- **Action**: README; revisione `ecc:code-reviewer` e `ecc:react-reviewer`; push, Deploy, backup di controllo, prova dal telefono.

## Validation
```bash
pnpm typecheck && pnpm lint
pnpm test:coverage
pnpm e2e
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| «Letto → Sto leggendo» sono due chiamate: se la seconda fallisce resti su «Da leggere» | Bassa | messaggio d'errore chiaro e ricarica del dettaglio dopo ogni tentativo, così il selettore mostra lo stato reale |
| Tre etichette strette sui telefoni piccoli (320 px) | Media | testo a capo, font 14 px; controllo a 320 px |
| Toccare per sbaglio «Da leggere» cancella il voto | Media | conferma in linea obbligatoria |
| Lettori di schermo: stato poco chiaro | Bassa | `aria-pressed` sullo stato attivo, gruppo etichettato «Il tuo stato», `aria-live` per i cambi |

## Acceptance
- [ ] Il tuo stato si vede e si cambia da un solo controllo; il tuo voto sta sotto «Letto»
- [ ] Togliere «letto» chiede sempre conferma
- [ ] Riepilogo della famiglia chiuso all'apertura, gruppi chiari quando aperto
- [ ] «Cambia genere» / «Modifica dati» separati dalla lettura
- [ ] Test unitari ed E2E verdi, axe senza violazioni, copertura ≥ 80%
