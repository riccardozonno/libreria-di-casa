# Plan: Sto leggendo

**Source PRD**: .claude/prds/letture-voti-generi.prd.md
**Selected Milestone**: 2 — Sto leggendo
**Complexity**: Small

## Summary
Nella scheda del libro un tasto «Sto leggendo» (accanto a «Segna come letto») dice alla famiglia chi sta
leggendo cosa. Non si può su un libro che si è già letto; segnare «Letto» lo toglie in automatico. Si
salva la data di inizio, senza mostrarla (decisione del 31/10/2026). Il filtro «In lettura» del catalogo
è nella tappa 4, la sezione nelle Statistiche nella tappa 5.

## Decisioni di progetto
- **Tabella nuova `book_current_reading`** (utente, libro, chi l'ha segnato, `started_at`), non uno stato
  dentro `book_reading`: le letture finite restano come sono e nessuna query esistente cambia significato.
- **Stessa regola di «Letto»**: ognuno per sé, l'admin per chiunque → si riusa l'azione di policy
  `reading.mark` (nessuna nuova riga nella matrice dei permessi, solo la nota).
- **Registro**: `reading.start` e `reading.stop` quando cambia qualcosa; quando «Letto» toglie «Sto
  leggendo» basta la riga `reading.mark` (con `wasReading: true` nei dati).

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Servizio | `worker/catalog/readings.ts:11` (`setReading`) | `can()` → esistenza libro/utente → `runBatch([auditWhen(cond), scrittura])`, idempotente |
| Rotte | `worker/catalog/routes.ts:96-108` | `PUT`/`DELETE /books/:id/readings/:userId` → `PUT`/`DELETE /books/:id/current-readers/:userId` |
| Errori | `worker/errors.ts:29` | `conflict("Hai già letto questo libro.")` (409) |
| Dettaglio | `worker/catalog/queries.ts:104` | una SELECT in più nello stesso `runBatch` |
| Schema e migrazione | `worker/db/schema.ts` (`bookReading`), `pnpm db:generate` | CREATE TABLE generata (qui drizzle-kit non ricostruisce nulla: tabella nuova); controllare l'SQL |
| Backup | `scripts/backup/lib.mjs:4`, `tests/unit/backup-lib.test.ts:11-22` | la tabella va in `BACKUP_TABLES` dopo `book_reading`: il test fallisce finché manca |
| UI | `src/pages/book/reading-toggle.tsx` | pulsante con `aria-pressed`, `send()`, `Notice`, `onChanged()` |
| Registro in UI | `src/pages/audit.tsx:39` | etichette di `reading.start` / `reading.stop` |
| Test | `tests/worker/catalog.test.ts` («letto da», «voto»), `tests/e2e/app.spec.ts:19` | API reali per ruolo; flusso admin nell'E2E |

## Files to Change
| File | Action | Why |
|---|---|---|
| `worker/db/schema.ts` | UPDATE | tabella `book_current_reading` (PK utente+libro, FK cascade, indice per libro) |
| `migrations/0004_current_reading.sql` + `meta` | CREATE | generata, controllata |
| `scripts/backup/lib.mjs` | UPDATE | tabella nel backup, dopo `book_reading` |
| `worker/catalog/readings.ts` | UPDATE | `setCurrentReading(db, who, bookId, userId, reading)`; `setReading(…, true)` toglie anche «Sto leggendo» nello stesso batch |
| `worker/catalog/routes.ts` | UPDATE | `PUT`/`DELETE /books/:id/current-readers/:userId` |
| `worker/catalog/queries.ts` | UPDATE | `currentReaders: [{ userId, name }]` nel dettaglio |
| `src/pages/book/current-reading-toggle.tsx` | CREATE | tasto «Sto leggendo» / «📖 Lo sto leggendo», solo se non l'hai letto |
| `src/pages/book.tsx` | UPDATE | tasto accanto a «Segna come letto»; riga «Sta leggendo: …» in «Letto da» |
| `src/pages/audit.tsx` | UPDATE | etichette nuove |
| `tests/worker/catalog.test.ts` | UPDATE | regole, idempotenza, 409 se già letto, «Letto» lo toglie, registro, dettaglio |
| `tests/unit/backup-lib.test.ts` | — | già copre la tabella nuova (deve fallire prima del passo sul backup) |
| `tests/e2e/app.spec.ts`, `tests/e2e/a11y.spec.ts` | UPDATE | flusso «Sto leggendo» → «Letto»; axe con il tasto attivo |
| `docs/permissions.md`, `docs/data-model.md`, `README.md`, `docs/backup-restore.md` | UPDATE | regola, tabella, guida, elenco tabelle nel backup se citato |

## Tasks
### Task 1: Tabella, migrazione, backup (RED → GREEN)
- **Action**: tabella in `schema.ts`; `pnpm vitest run tests/unit/backup-lib.test.ts` deve fallire (tabella senza backup); poi `BACKUP_TABLES`; `pnpm db:generate --name current_reading` e lettura dell'SQL.
- **Validate**: `pnpm vitest run tests/unit/backup-lib.test.ts`; `pnpm db:migrate:local`.

### Task 2: API (RED → GREEN)
- **Action**: test d'integrazione: ognuno per sé, admin per altri, altri 403; 404 libro/utente; 409 se il destinatario l'ha già letto; PUT/DELETE idempotenti con registro una volta; `PUT readings` toglie «Sto leggendo» (registro `reading.mark` con `wasReading`); dettaglio con `currentReaders`. Poi servizio, rotte, query.
- **Mirror**: `setReading` e i suoi test.
- **Validate**: `pnpm vitest run tests/worker/catalog.test.ts`

### Task 3: Interfaccia
- **Action**: `CurrentReadingToggle` (stesso stile e accessibilità di `ReadingToggle`, `aria-pressed`); nascosto se hai letto il libro; riga «Sta leggendo» con i nomi in «Letto da»; etichette del registro.
- **Validate**: `pnpm typecheck && pnpm lint`; prova visiva a 390 px in chiaro e scuro.

### Task 4: E2E e accessibilità
- **Action**: nel flusso admin: «Sto leggendo» → compare «Sta leggendo: …» → «Segna come letto» → «Sto leggendo» sparisce. Axe sulla scheda con il tasto attivo.
- **Validate**: `pnpm e2e`

### Task 5: Documenti, revisione ECC, rilascio
- **Action**: documenti; agente ECC code-reviewer; correzioni; commit; push; Deploy da GitHub; un backup manuale per verificare la tabella nuova nel backup; prova online. ⏸
- **Validate**: CI e Deploy verdi; run «Backup» manuale verde.

## Validation
```bash
pnpm lint && pnpm typecheck
pnpm test:coverage
pnpm e2e
pnpm build && pnpm exec wrangler deploy --dry-run
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Tabella nuova dimenticata nel backup | Bassa | il test sullo schema fallisce; backup manuale dopo il Deploy |
| I numeri dei file nel backup cambiano (`audit_log` da 08 a 09) | Certa | il ripristino legge i file `data/*.sql` in ordine, qualunque numero: i backup vecchi restano ripristinabili (verificato: `scripts/backup/restore.mjs:111` legge i file ordinati per nome) |
| Gara: «Letto» e «Sto leggendo» in contemporanea | Bassa | `INSERT … SELECT … WHERE NOT EXISTS (letto)` nello stesso batch: mai entrambi |
| Barra dei tasti troppo larga sul telefono | Media | i tasti vanno a capo (`flex-wrap`), verifica visiva a 390 px |

## Acceptance
- [ ] «Sto leggendo» solo per sé (admin per chiunque); rifiutato se già letto; idempotente
- [ ] «Letto» toglie «Sto leggendo»; data di inizio salvata, non mostrata
- [ ] Scheda: tasto visibile solo se non l'hai letto; «Sta leggendo: …» per tutti
- [ ] Tabella nel backup; backup manuale verde dopo il rilascio
- [ ] Axe senza errori; E2E verdi su iPhone e Android
- [ ] All tasks complete; validation passes; patterns mirrored, not reinvented
