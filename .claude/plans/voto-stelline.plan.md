# Plan: Voto a stelline

**Source PRD**: .claude/prds/letture-voti-generi.prd.md
**Selected Milestone**: 1 — Voto
**Complexity**: Small

## Summary
Chi ha segnato un libro come «Letto» può dargli da 1 a 5 stelline, cambiarle o toglierle (ritoccando la
stessa stella). Il voto vive nella riga di lettura: se si toglie «Letto», sparisce con lei. La scheda del
libro mostra la media («4,5 ★ · 2 voti») e il voto accanto al nome di ogni lettore; il voto lo dà solo
il lettore, anche quando l'admin ha segnato «Letto» per lui.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Naming | `worker/catalog/readings.ts:11` | servizio `setReading(db, who, bookId, userId, read)` in `worker/catalog/readings.ts`; rotte REST sotto `/books/:id/readings/:userId` (`worker/catalog/routes.ts:96`) |
| Permessi | `shared/policy.ts:52` | nuova azione nel tipo `Action` + `case` in `can()`; il servizio chiama `can()` per primo e lancia `forbidden()` |
| Errori | `worker/errors.ts:27-29` | `forbidden()`, `notFound("Libro")`, `conflict("…")` con messaggi in italiano mostrati dall'interfaccia |
| Validazione | `shared/schemas.ts`, `worker/http.ts:9` | schema zod condiviso; `readBody(c, schema)` nella rotta |
| Scritture + registro | `worker/catalog/readings.ts:20-24` | `auditWhen(condizione)` prima della modifica con la stessa condizione, tutto in `runBatch`; nessuna riga di registro se non cambia niente |
| Letture | `worker/catalog/queries.ts:104-111` | dettaglio libro con più SELECT in un solo `runBatch` |
| Registro in UI | `src/pages/audit.tsx:39` | etichetta italiana per ogni `action` |
| UI | `src/pages/book/reading-toggle.tsx` | componente piccolo con `send()`, stato occupato, `Notice` per l'errore, poi `onChanged()` per ricaricare |
| Migrazioni | `migrations/0002_catalog_indexes.sql`, `pnpm db:generate` | drizzle-kit genera SQL e snapshot da `worker/db/schema.ts` |
| Test unit | `tests/unit/policy.test.ts:40-46` | casi per ruolo su `can()` |
| Test integrazione | `tests/worker/catalog.test.ts:205-218` | chiamate API reali per ruolo (`reader.call(...)`), stato HTTP e righe del registro |
| Test E2E | `tests/e2e/app.spec.ts:19` | flusso admin «crea sede, aggiunge libro, segna letto» su iPhone/Android; axe in `tests/e2e/a11y.spec.ts` |

## Files to Change
| File | Action | Why |
|---|---|---|
| `worker/db/schema.ts` | UPDATE | colonna `rating` (intero, nullo) in `book_reading` con CHECK 1–5 |
| `migrations/0003_reading_rating.sql` + `migrations/meta/*` | CREATE | generata con `pnpm db:generate` (ALTER TABLE ADD COLUMN) |
| `shared/policy.ts` | UPDATE | azione `reading.rate`: solo il lettore stesso (niente eccezione admin) |
| `shared/schemas.ts` | UPDATE | `ratingSchema`: `{ rating: 1..5 intero | null }` |
| `worker/catalog/readings.ts` | UPDATE | `setRating(db, who, bookId, userId, rating)`; 409 «Segna prima il libro come letto.» se manca la lettura |
| `worker/catalog/routes.ts` | UPDATE | `PUT /books/:id/readings/:userId/rating` |
| `worker/catalog/queries.ts` | UPDATE | letture con `rating`; `ratingAverage` e `ratingCount` nel dettaglio |
| `worker/audit.ts` | — | nessun cambio: `entityType: "reading"` esiste già |
| `src/pages/audit.tsx` | UPDATE | etichetta di `reading.rate` |
| `src/pages/book/star-rating.tsx` | CREATE | 5 stelle come gruppo di pulsanti (radio) accessibile, 44 px, ritocco = togli |
| `src/pages/book.tsx` | UPDATE | media sotto il titolo di «Letto da», voto accanto ai nomi, stelle solo se `hasRead` |
| `tests/unit/policy.test.ts` | UPDATE | `reading.rate` per ruolo e destinatario |
| `tests/unit/schemas.test.ts` | UPDATE | 0, 6, 2.5, stringhe rifiutati; 1–5 e null accettati |
| `tests/worker/catalog.test.ts` | UPDATE | API del voto: permessi, 409 senza lettura, togli «Letto» = voto via, media, registro |
| `tests/e2e/app.spec.ts`, `tests/e2e/a11y.spec.ts` | UPDATE | dare, cambiare e togliere il voto; axe sulla scheda con le stelle |
| `docs/permissions.md`, `docs/data-model.md`, `README.md` | UPDATE | riga del voto, colonna, guida d'uso |

## Tasks
### Task 1: Permessi e validazione (RED → GREEN)
- **Action**: test di `can(reading.rate)` (lettore sé stesso sì; admin per un altro no; utente disattivato no) e di `ratingSchema`; poi azione e schema.
- **Mirror**: `tests/unit/policy.test.ts:40`, `shared/policy.ts:52`.
- **Validate**: `pnpm vitest run tests/unit/policy.test.ts tests/unit/schemas.test.ts`

### Task 2: Colonna e migrazione
- **Action**: `rating` in `bookReading` con `check("book_reading_rating_check", rating IS NULL OR rating BETWEEN 1 AND 5)`; `pnpm db:generate`; controllare l'SQL generato (SQLite: se drizzle-kit ricrea la tabella per il CHECK, scriverlo a mano come ADD COLUMN con CHECK per non toccare le righe esistenti).
- **Mirror**: `migrations/0002_catalog_indexes.sql`.
- **Validate**: `pnpm db:migrate:local`; i test d'integrazione applicano le migrazioni vere (`tests/worker/apply-migrations.ts`).

### Task 3: API del voto (RED → GREEN)
- **Action**: test d'integrazione, poi `setRating` + rotta. Un solo `runBatch`: `auditWhen(lettura esiste AND voto diverso, …reading.rate { userId, rating })` + `UPDATE book_reading SET rating = ? WHERE user_id = ? AND book_id = ?`. Prima del batch: libro esiste (404), lettura esiste (409).
- **Mirror**: `worker/catalog/readings.ts:11-25`, `tests/worker/catalog.test.ts:205`.
- **Validate**: `pnpm vitest run tests/worker/catalog.test.ts`

### Task 4: Dettaglio del libro (RED → GREEN)
- **Action**: test: `readings` con `rating`, `ratingAverage` (una cifra decimale) e `ratingCount` (solo voti non nulli); poi query.
- **Mirror**: `worker/catalog/queries.ts:104`.
- **Validate**: `pnpm vitest run tests/worker/catalog.test.ts`

### Task 5: Interfaccia
- **Action**: `StarRating` (radiogroup con etichette «1 stella»…«5 stelle», stato attuale annunciato, ritocco toglie, errore con `Notice`); in `book.tsx` media e voti accanto ai nomi; etichetta nel registro.
- **Mirror**: `src/pages/book/reading-toggle.tsx`, componenti in `src/components/ui`.
- **Validate**: `pnpm typecheck && pnpm lint`; prova visiva con `pnpm dev` a 390 px e 1440 px.

### Task 6: E2E e accessibilità
- **Action**: nel flusso esistente, dopo «Segna come letto»: 4 stelle → media «4 ★ · 1 voto»; ritocco della 4ª → nessun voto; togli «Letto» → stelle nascoste. Axe sulla scheda con le stelle.
- **Mirror**: `tests/e2e/app.spec.ts:19`, `tests/e2e/a11y.spec.ts`.
- **Validate**: `pnpm e2e`

### Task 7: Documenti, revisione, rilascio
- **Action**: permessi, modello dati, guida nel README; revisione con l'agente ECC code-reviewer; commit piccoli; push; Deploy da GitHub (la migrazione la applica il workflow); prova online. ⏸
- **Validate**: CI verde; run di Deploy verde; voto provato sull'app vera.

## Validation
```bash
pnpm lint && pnpm typecheck
pnpm test:coverage        # soglia 80%
pnpm e2e                  # iPhone (WebKit) e Android (Chromium) + axe
pnpm build && pnpm exec wrangler deploy --dry-run
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| drizzle-kit ricrea `book_reading` per aggiungere il CHECK (copia della tabella in produzione) | Media | controllare l'SQL generato; se serve, ADD COLUMN scritta a mano; il Deploy stampa il segnalibro di Time Travel prima della migrazione |
| Doppio tocco veloce sulle stelle (due richieste) | Bassa | pulsanti disattivati durante l'invio; l'ultima scrittura vince, il registro segue la stessa condizione |
| Il backup non include la nuova colonna | Bassa | l'export è per tabella con tutte le colonne; il test «tutte le tabelle nel backup» resta valido; ripristino applica le migrazioni dal backup |
| CPU del dettaglio libro | Bassa | una colonna in più nella stessa SELECT, media calcolata in JS sulle righe già lette |

## Acceptance
- [ ] Solo chi ha letto può votare, solo per sé; 409 senza «Letto»; voti fuori 1–5 rifiutati
- [ ] Togliere «Letto» toglie il voto; ritoccare la stessa stella toglie il voto
- [ ] Scheda: media con una cifra decimale e numero di voti; voto accanto a ogni lettore
- [ ] Registro: `reading.rate` solo quando il voto cambia
- [ ] Stelle usabili con VoiceOver e con il dito (44 px); axe senza errori
- [ ] All tasks complete; validation passes; patterns mirrored, not reinvented
