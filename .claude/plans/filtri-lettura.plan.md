# Plan: Filtri di lettura nel catalogo

**Source PRD**: .claude/prds/letture-voti-generi.prd.md
**Selected Milestone**: 4 — Filtri di lettura
**Complexity**: Small

## Summary
Il catalogo ha un nuovo menu «Lettura» accanto a «Genere», con quattro voci: «Tutti», «Non letti da me»,
«Non letti da nessuno», «In lettura». Il filtro si combina con sede, genere e ricerca, sta nell'indirizzo
(`?lettura=…`) come gli altri e un valore sconosciuto si ignora. Non servono migrazioni né modifiche al
backup: si usano le tabelle `book_reading` e `book_current_reading`, che hanno già l'indice per libro.

## Significato dei filtri (da confermare)
| Chiave (API e URL) | Etichetta | Libri mostrati |
|---|---|---|
| — | Tutti | tutti (come oggi) |
| `UNREAD_BY_ME` | Non letti da me | quelli che **io** non ho segnato «Letto» (compresi quelli che sto leggendo) |
| `UNREAD` | Non letti da nessuno | quelli che **nessuno** ha segnato «Letto» |
| `READING` | In lettura | quelli che **qualcuno** sta leggendo adesso («Sto leggendo») |

«Io» è sempre chi è collegato: il server lo ricava dalla sessione, mai da un parametro, quindi non si
può chiedere la lista di un altro.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Filtro SQL | `worker/catalog/queries.ts:52-56` | condizioni in `conditions: SQL[]`, sottoquery `EXISTS`/`NOT EXISTS`, parametri con `sql\`\`` |
| Validazione query | `worker/catalog/routes.ts:38` + `shared/schemas.ts:115` | `validate(genreFilterSchema, …)`, 400 se non valido |
| Chi chiama | `worker/http.ts:33` | `requester(c).actor.id` |
| Filtro nell'URL | `src/pages/catalog.tsx:32-35,118-138` | `safeParse` sull'URL, valore sconosciuto ignorato, `SelectInput` che azzera `pagina` |
| Test di integrazione | `tests/worker/catalog.test.ts:369` (describe «genere») | utenti `admin`/`editorCasa`/`reader`, `list(who, params)` |
| E2E | `tests/e2e/app.spec.ts:75,174` | filtro scelto dal menu, URL sconosciuto ignorato |

## Files to Change
| File | Action | Why |
|---|---|---|
| `shared/schemas.ts` | UPDATE | `readingFilterSchema`, tipo `ReadingFilter` |
| `worker/catalog/queries.ts` | UPDATE | `listBooks` accetta `reading` e `userId`; tre condizioni |
| `worker/catalog/routes.ts` | UPDATE | legge e valida `reading`, passa l'id di chi chiama |
| `src/pages/catalog.tsx` | UPDATE | menu «Lettura», parametro `lettura`, messaggio dei risultati vuoti |
| `tests/unit/schemas.test.ts` | UPDATE | valori validi e non validi |
| `tests/worker/catalog.test.ts` | UPDATE | describe «filtri di lettura» |
| `tests/e2e/app.spec.ts`, `tests/e2e/a11y.spec.ts` | UPDATE | flusso e accessibilità con il filtro |
| `README.md`, `docs/data-model.md` | UPDATE | una riga sui filtri |

## Tasks
### Task 1: Schema del filtro (TDD)
- **Action**: RED in `schemas.test.ts` (le 3 chiavi passano, `"letti"` no, assente = undefined), poi `readingFilterSchema = z.enum([...]).optional()` con messaggio «Filtro di lettura non valido».
- **Mirror**: `genreFilterSchema`.
- **Validate**: `pnpm test tests/unit/schemas.test.ts`

### Task 2: Filtro nell'API (TDD)
- **Action**: RED in `catalog.test.ts`, describe «filtri di lettura»: 3 libri (uno letto da `reader`, uno letto da `admin`, uno che `reader` sta leggendo) e controlli:
  - `reading=UNREAD_BY_ME` per `reader` e per `admin` dà liste diverse;
  - `UNREAD` esclude i libri letti da chiunque;
  - `READING` mostra solo quello in lettura; dopo «Letto» sparisce;
  - combinato con `genre`, `location` e `q`;
  - valore sconosciuto → 400.
- GREEN: in `listBooks`
  - `UNREAD_BY_ME` → `NOT EXISTS (SELECT 1 FROM book_reading r WHERE r.book_id = b.id AND r.user_id = ${userId})`
  - `UNREAD` → `NOT EXISTS (SELECT 1 FROM book_reading r WHERE r.book_id = b.id)`
  - `READING` → `EXISTS (SELECT 1 FROM book_current_reading r WHERE r.book_id = b.id)`
- **Mirror**: condizioni `location` e `genre`.
- **Validate**: `pnpm test tests/worker/catalog.test.ts`

### Task 3: Menu nel catalogo
- **Action**: secondo `SelectInput` (id `filtro-lettura`, etichetta «Lettura») sotto «Genere»; parametro URL `lettura` validato con `safeParse`; `isFiltered` lo include; il messaggio dei risultati vuoti dice «togli i filtri».
- **Mirror**: filtro del genere in `catalog.tsx`.
- **Validate**: `pnpm typecheck && pnpm lint`

### Task 4: E2E e accessibilità
- **Action**: in `app.spec.ts` il lettore segna «Letto» su un libro → con «Non letti da me» non lo vede più, l'admin sì; «In lettura» dopo «Sto leggendo»; `/?lettura=XYZ` ignorato. In `a11y.spec.ts` aggiungere `/?lettura=UNREAD`.
- **Validate**: `pnpm test:e2e`

### Task 5: Documenti e chiusura
- **Action**: README e data model; revisione `ecc:code-reviewer`; push, Deploy, backup di controllo, prova online.

## Validation
```bash
pnpm typecheck && pnpm lint
pnpm test:coverage
pnpm test:e2e
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Lista più lenta con le sottoquery | Bassa | indici `book_reading_book_idx` e PK `(user_id, book_id)` già presenti; misura CPU dopo il Deploy |
| «Non letti da me» chiesto per un altro utente | Bassa | l'id viene solo dalla sessione; un test lo verifica |
| Telefono stretto: due menu affollano la testata | Bassa | menu uno sotto l'altro, alti 44 px come «Genere» |

## Acceptance
- [ ] I tre filtri danno i libri giusti, combinati con sede, genere e ricerca
- [ ] Il filtro resta nell'indirizzo; valori sconosciuti ignorati nella pagina, 400 nell'API
- [ ] Test unitari, di integrazione ed E2E verdi; copertura ≥ 80%
- [ ] Nessuna migrazione; backup invariato
